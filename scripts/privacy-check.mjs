import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import path from 'node:path';

const issues = new Set();
const decoder = new TextDecoder('utf-8', { fatal: true });
const history = process.argv.includes('--history');
let root = process.cwd();
let privateStrings = [];

// Never expose child-process errors: Git can echo credentials from paths, refs or config.
class ScanError extends Error {
  constructor(category, location) {
    super(category);
    this.category = category;
    this.location = location;
  }
}
function git(args, location = 'repository', binary = false) {
  try {
    return execFileSync('git', ['--no-replace-objects', ...args], {
      cwd: root, encoding: binary ? undefined : 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, windowsHide: true,
    });
  } catch {
    throw new ScanError('Git operation failed', location);
  }
}

const rules = [
  ['GitHub credential', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,})\b/],
  ['JWT credential', /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/],
  ['Private key', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/],
  ['Password hash value', /\bscrypt:[a-f0-9]{32}:[a-f0-9]{128}\b/],
  ['Personal home path', /(?:[A-Z]:[\\/]Users[\\/](?!Public\b|Default\b)[^\s\\/"']+|\/(?:Users|home)\/[^\s/"']+)[\\/]/i],
  ['Deployed database address', /libsql:\/\/(?!your-database\.|example\.|localhost)[a-z0-9.-]+\.turso\.io/i],
  ['Provider resource ID', /\b(?:appgprj_|appgrepo_|prj_|team_|dpl_)[A-Za-z0-9_-]{12,}\b/],
  ['AWS credential', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['Provider credential', /\b(?:xox[baprs]-[A-Za-z0-9-]{20,}|AIza[A-Za-z0-9_-]{35}|sk_live_[A-Za-z0-9]{16,})\b/],
];
const sensitiveKey = /(?:password(?:[_-]?hash)?|passwd|pwd|token|secret|authorization|(?:api|private|secret|signing|encryption|access)[_-]?key)$/i;
const assignments = /(?:^|[\s{,;[(])(?:"([A-Za-z_$][\w$-]*)"|'([A-Za-z_$][\w$-]*)'|([A-Za-z_$][\w$-]*))\s*([=:])[ \t]*(?:"([^"\r\n]*)"|'([^'\r\n]*)'|`([^`\r\n]*)`|([^\s,;}\]#]+))/gm;

function fixtureAssignment(file, key, value) {
  // Only these two existing HTTP-smoke inputs are deliberately public login fixtures.
  return file === 'scripts/smoke.mjs' && key === 'password'
    && (value === ['Local', 'test', 'only', '2026'].join('-') || value === 'incorrect');
}
function categories(text, file = '') {
  const found = new Set();
  for (const [name, rule] of rules) if (rule.test(text)) found.add(name);
  if (privateStrings.some(value => text.toLowerCase().includes(value))) found.add('Local private identifier');
  for (const match of text.matchAll(assignments)) {
    const key = match[1] ?? match[2] ?? match[3];
    if (!sensitiveKey.test(key)) continue;
    const value = match[5] ?? match[6] ?? match[7] ?? match[8];
    if (!value || fixtureAssignment(file, key, value)) continue;
    if (match[7] !== undefined && value.includes('${')) continue;
    if (match[8] !== undefined) {
      // Bare expressions in source (process.env, function calls, types) are not literals.
      const start = text.lastIndexOf('\n', match.index) + 1;
      const line = text.slice(start, match.index + match[0].length).trim();
      if (!new RegExp(`^(?:export\\s+)?${key.replaceAll('$', '\\$')}\\s*[=:]`).test(line)) continue;
      if (/\.(?:[cm]?[jt]sx?|mjs)$/.test(file)) continue;
    }
    found.add('Secret assignment');
  }
  return found;
}
function safePath(file) {
  // Paths themselves may contain a matched value or terminal control characters.
  if (categories(file).size || /[\x00-\x1f\x7f-\x9f]/.test(file)) {
    return `<redacted path sha256:${createHash('sha256').update(file).digest('hex')}>`;
  }
  return JSON.stringify(file);
}
function report(category, location) {
  issues.add(`${category}: ${location}`);
}
function checkText(text, location, file) {
  for (const category of categories(text, file)) report(category, location);
}
function forbiddenFile(file) {
  return /(^|\/)(?:node_modules|\.next|\.vercel|backups|\.git)\//i.test(file)
    || /(^|\/)\.env(?:\.|$)/i.test(file) && file !== '.env.example'
    || /(^|\/)(?:\.privacy-policy|\.github-link-state)\.local\.json$/i.test(file)
    || /\.(?:db|sqlite3?)(?:-(?:wal|shm|journal)|\.(?:wal|shm|journal))?$/i.test(file)
    || /\.(?:pem|key|log)$/i.test(file)
    || /(?:credentials[^/]*\.json|(?:password|token)[^/]*\.txt|backup[^/]*\.json)$/i.test(file);
}
function check(file, bytes, scope) {
  const location = file === null ? scope : `${scope} ${safePath(file)}`;
  if (file !== null) {
    if (forbiddenFile(file)) report('Forbidden file', location);
    checkText(file, location);
  }
  let text;
  try {
    // Some binary formats can contain only printable ASCII; their extensions still need review.
    if (file !== null && /\.(?:png|jpe?g|gif|webp|ico|avif|bmp|tiff?|pdf|zip|gz|bz2|7z|rar|tar|woff2?|ttf|otf|mp[34]|mov|wasm|exe|dll|bin)$/i.test(file)) throw new Error();
    text = decoder.decode(bytes);
    if (/[\x00-\x08\x0b\x0e-\x1f\x7f]/.test(text)) throw new Error();
  } catch {
    // No blanket binary exemptions. A future exception needs a reviewed path, digest and reason.
    report('Binary or non-UTF-8 content requires manual review', location);
    return;
  }
  checkText(text, location, file ?? '');
}
function loadPolicy() {
  const file = path.join(root, '.privacy-policy.local.json');
  try {
    if (!lstatSync(file).isFile()) throw new Error();
    const policy = JSON.parse(readFileSync(file, 'utf8'));
    if (!policy || typeof policy !== 'object' || Array.isArray(policy)
      || policy.forbiddenStrings !== undefined && (!Array.isArray(policy.forbiddenStrings)
        || policy.forbiddenStrings.some(value => typeof value !== 'string'))) throw new Error();
    privateStrings = (policy.forbiddenStrings ?? []).filter(Boolean).map(value => value.toLowerCase());
  } catch (error) {
    if (error.code !== 'ENOENT') throw new ScanError('Invalid local policy', 'local policy');
  }
}
function scanWorktree() {
  const entries = git(['ls-files', '--stage', '-z']).split('\0').filter(Boolean);
  const files = new Set();
  for (const entry of entries) {
    const at = entry.indexOf('\t');
    const [mode, object, stage] = entry.slice(0, at).split(' ');
    const file = entry.slice(at + 1);
    const location = `index stage ${stage} blob ${object}`;
    files.add(file);
    if (mode === '160000') report('Gitlink requires manual review', `${location} ${safePath(file)}`);
    else check(file, git(['cat-file', 'blob', object], 'index blob', true), location);
  }
  const untracked = git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
  for (const file of untracked) files.add(file);
  const tracked = new Set(entries.map(entry => entry.slice(entry.indexOf('\t') + 1)));
  for (const file of files) {
    try {
      let ancestor = root;
      let blocked = false;
      for (const part of file.split('/').slice(0, -1)) {
        ancestor = path.join(ancestor, part);
        if (lstatSync(ancestor).isSymbolicLink()) {
          report('Symlink ancestor requires manual review', `working tree ${safePath(file)}`);
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      const absolute = path.join(root, file);
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) check(file, Buffer.from(readlinkSync(absolute)), 'working tree symlink');
      else if (stat.isFile()) check(file, readFileSync(absolute), 'working tree');
      else report('Non-file requires manual review', `working tree ${safePath(file)}`);
    } catch (error) {
      // An unstaged deletion is still covered by the index; other read failures fail closed.
      if (error.code !== 'ENOENT' || !tracked.has(file)) throw new ScanError('File read failed', `working tree ${safePath(file)}`);
    }
  }
  return { tracked: tracked.size, files: files.size };
}
function checkIdentity(bytes, type, object) {
  const header = bytes.toString('utf8').split('\n\n', 1)[0];
  for (const line of header.split('\n')) {
    if (!/^(?:author|committer|tagger) /.test(line)) continue;
    const email = line.match(/<([^<>]*)> -?\d+ [+-]\d{4}$/)?.[1];
    // GitHub-generated merge commits use the platform-wide public no-reply address.
    if (!email || !/^(?:[^@\s<>]+@users\.noreply\.github\.com|noreply@github\.com)$/i.test(email)) {
      report('Git identity must use a GitHub no-reply email', `history ${type} ${object}`);
    }
  }
}
function scanHistory() {
  if (git(['rev-parse', '--is-shallow-repository']).trim() !== 'false') {
    throw new ScanError('Incomplete history requires a full clone', 'repository');
  }
  const pending = [git(['rev-parse', '--verify', 'HEAD']).trim()];
  for (const record of git(['for-each-ref', '--format=%(objectname)%00%(refname)']).trim().split('\n').filter(Boolean)) {
    const [object, ref] = record.split('\0');
    checkText(ref, `history reference object ${object}`);
    pending.push(object);
  }
  const seen = new Set();
  const blobs = new Set();
  let commits = 0;
  while (pending.length) {
    const object = pending.pop();
    if (seen.has(object)) continue;
    seen.add(object);
    const type = git(['cat-file', '-t', object], 'history object').trim();
    if (type === 'tree') {
      for (const entry of git(['ls-tree', '-r', '-z', object], 'history tree').split('\0').filter(Boolean)) {
        const at = entry.indexOf('\t');
        const [, entryType, blob] = entry.slice(0, at).split(' ');
        const file = entry.slice(at + 1);
        const key = `${blob}:${file}`;
        if (blobs.has(key)) continue;
        blobs.add(key);
        if (entryType !== 'blob') report('Gitlink requires manual review', `history tree ${object} ${safePath(file)}`);
        else check(file, git(['cat-file', 'blob', blob], 'history blob', true), `history blob ${blob}`);
      }
    } else if (type === 'commit' || type === 'tag') {
      const bytes = git(['cat-file', type, object], 'history metadata', true);
      check(null, bytes, `history ${type} ${object}`);
      checkIdentity(bytes, type, object);
      const header = bytes.toString('utf8').split('\n\n', 1)[0];
      const links = [...header.matchAll(/^(?:tree|parent|object) ([a-f0-9]{40,64})$/gm)];
      if (!links.length) throw new ScanError('Invalid history object', `history ${type} ${object}`);
      pending.push(...links.map(match => match[1]));
      if (type === 'commit') commits++;
    } else if (type === 'blob') {
      // Tags can point directly to blobs without a commit or filename.
      check(null, git(['cat-file', 'blob', object], 'history blob', true), `history blob ${object}`);
    } else throw new ScanError('Unsupported history object', 'history');
  }
  return commits;
}

try {
  if (process.argv.slice(2).some(arg => arg !== '--history')) throw new ScanError('Unsupported argument', 'invocation');
  root = git(['rev-parse', '--show-toplevel']).trim();
  loadPolicy();
  const counts = scanWorktree();
  const commits = history ? scanHistory() : 0;
  if (!issues.size) console.log(`Privacy check passed: ${counts.tracked} tracked files, ${counts.files} working paths, ${commits} reachable commits checked.`);
} catch (error) {
  report(error instanceof ScanError ? error.category : 'Scan failed', error instanceof ScanError ? error.location : 'repository');
}
if (issues.size) {
  console.error([...issues].join('\n'));
  process.exitCode = 1;
}
