// End-to-end check against an isolated temporary SQLite database; no real credentials or records.
import { spawn } from 'node:child_process';
import { randomBytes, scryptSync } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const password = 'Local-test-only-2026';
const salt = randomBytes(16).toString('hex');
const root = process.cwd();
const database = path.join(root, '.vercel', `smoke-${randomBytes(8).toString('hex')}.db`);
mkdirSync(path.dirname(database), { recursive: true });
const origin = 'http://127.0.0.1:4317';
let output = '';
const production = process.argv.includes('--production');
const server = spawn(process.execPath, [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), production ? 'start' : 'dev', '--hostname', '127.0.0.1', '--port', '4317'], {
  cwd: root, windowsHide: true,
  env: { ...process.env, NODE_ENV: production ? 'production' : 'development', VERCEL: '', VERCEL_ENV: '', APP_PREVIEW_ENABLED: 'false', NEXT_TELEMETRY_DISABLED: '1', TURSO_DATABASE_URL: `file:${database.replaceAll('\\', '/')}`, TURSO_AUTH_TOKEN: randomBytes(24).toString('hex'), APP_PASSWORD_HASH: `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`, APP_SESSION_SECRET: randomBytes(32).toString('hex'), APP_OWNER_ID: 'smoke-owner' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', chunk => { output += chunk; });
server.stderr.on('data', chunk => { output += chunk; });
async function call(route, options = {}) {
  return fetch(origin + route, { ...options, signal: AbortSignal.timeout(20_000) });
}
try {
  let ready = false;
  for (let i = 0; i < 40; i++) {
    if (server.exitCode !== null) throw new Error('Preview process exited');
    try { const response = await call('/'); if (response.status === 200) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert(ready, 'Preview readiness');
  const unauthenticated = await call('/api/data');
  assert.equal(unauthenticated.status, 401, 'unauthenticated read');
  assert.equal(unauthenticated.headers.get('cache-control'), 'private, no-store', 'private cache policy');
  assert.equal((await call('/api/data', { method: 'PUT', headers: { origin, 'content-type': 'application/json' }, body: '{}' })).status, 401, 'unauthenticated write');
  assert.equal((await call('/api/auth/login', { method: 'POST', headers: { origin: 'https://wrong.example', 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, 403, 'cross-origin login');
  assert.equal((await call('/api/auth/login', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ password: 'incorrect' }) })).status, 401, 'wrong password');
  const login = await call('/api/auth/login', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
  assert.equal(login.status, 200, 'valid login');
  const setCookie = login.headers.get('set-cookie');
  assert(setCookie?.includes('HttpOnly'), 'HttpOnly session');
  assert(setCookie?.toLowerCase().includes('samesite=strict'), 'SameSite session');
  if (production) {
    assert(setCookie?.startsWith('__Host-xingce-session='), 'host-only production cookie');
    assert(setCookie?.includes('Secure'), 'secure production cookie');
  }
  const cookie = setCookie.split(';')[0];
  const headers = { cookie, origin, 'content-type': 'application/json' };
  assert.equal((await call('/api/data', { headers: { cookie: cookie + 'tampered' } })).status, 401, 'tampered session');
  assert.equal((await call('/api/data', { method: 'PUT', headers: { ...headers, origin: 'https://wrong.example' }, body: '{}' })).status, 403, 'cross-origin write');
  const initial = await (await call('/api/data', { headers })).json();
  assert.equal(initial.revision, 0);
  const record = { id: 'smoke-record', name: '迁移验证练习', date: '2026-10-23', modules: { verbal: { correct: 17, wrong: 3 } }, createdAt: '2026-10-23T00:00:00.000Z', updatedAt: '2026-10-23T00:00:00.000Z' };
  const data = { revision: 0, records: [], practiceRecords: [record] };
  assert.equal((await call('/api/data', { method: 'PUT', headers, body: JSON.stringify(data) })).status, 200, 'data save');
  assert.equal((await call('/api/data', { method: 'PUT', headers, body: JSON.stringify(data) })).status, 409, 'stale data conflict');
  const saved = await (await call('/api/data', { headers })).json();
  assert.equal(saved.revision, 1);
  assert.equal(saved.practiceRecords[0].id, record.id);
  assert.equal(saved.practiceRecords[0].createdAt, record.createdAt);
  assert.equal((await call('/api/data', { method: 'PUT', headers, body: JSON.stringify({ revision: 1, records: [], practiceRecords: [{ ...record, modules: { verbal: { correct: -1, wrong: 0 } } }] }) })).status, 400, 'invalid record');
  const logout = await call('/api/auth/logout', { method: 'POST', headers });
  assert.equal(logout.status, 200, 'logout');
  assert(logout.headers.get('set-cookie')?.includes('Max-Age=0'), 'logout cookie removal');
  if (!process.argv.includes('--serve')) {
    for (let i = 0; i < 8; i++) {
      assert.equal((await call('/api/auth/login', { method: 'POST', headers: { origin, 'content-type': 'application/json', 'x-forwarded-for': `192.0.2.${i + 1}` }, body: JSON.stringify({ password: 'incorrect' }) })).status, 401, 'bounded login attempt');
    }
    assert.equal((await call('/api/auth/login', { method: 'POST', headers: { origin, 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.100' }, body: JSON.stringify({ password }) })).status, 429, 'forwarded IP cannot bypass login limit');
  }
  console.log('PASS: HTTP login, auth rejection, cookie flags, private cache policy, database read/write, field preservation, revision conflict, invalid input, logout and login limits.');
  if (process.argv.includes('--serve')) {
    console.log('Local QA server: ' + origin);
    await new Promise(resolve => process.once('SIGINT', resolve));
  }
} catch (error) {
  console.error(error.message);
  console.error(output.slice(-4000));
  process.exitCode = 1;
} finally {
  server.kill();
  await new Promise(resolve => server.exitCode !== null ? resolve() : server.once('exit', resolve));
  for (const suffix of ['', '-wal', '-shm']) {
    try { rmSync(database + suffix, { force: true }); } catch {}
  }
}
