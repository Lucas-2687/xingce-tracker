import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const git = args => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true });
const tracked = git(['ls-files', '-z']).split('\0').filter(Boolean);
const history = process.argv.includes('--history');
const policy = existsSync('.privacy-policy.local.json') ? JSON.parse(readFileSync('.privacy-policy.local.json', 'utf8')) : {};
const issues = new Set();
const rules = [
  ['GitHub credential', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,})\b/],
  ['JWT credential', /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/],
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['Password hash value', /\bscrypt:[a-f0-9]{32}:[a-f0-9]{128}\b/],
  ['Personal home path', /(?:[A-Z]:[\\/]Users[\\/](?!Public\b|Default\b)[^\s\\/"']+|\/(?:Users|home)\/[^\s/"']+)[\\/]/i],
  ['Deployed database address', /libsql:\/\/(?!your-database\.|example\.|localhost)[a-z0-9.-]+\.turso\.io/i],
  ['Provider resource ID', /\b(?:appgprj_|appgrepo_|prj_|team_|dpl_)[A-Za-z0-9_-]{12,}\b/],
];
function forbiddenFile(file) {
  return /(^|\/)(?:node_modules|\.next|\.vercel|backups|\.git)\//.test(file)
    || /(^|\/)\.env(?:\.|$)/.test(file) && file !== '.env.example'
    || /\.(?:db|sqlite|sqlite3|pem|key|log)$/.test(file)
    || /(?:credentials[^/]*\.json|(?:password|token)[^/]*\.txt|backup[^/]*\.json)$/i.test(file);
}
function check(file, bytes, scope) {
  if (forbiddenFile(file)) issues.add(`${scope}: forbidden file: ${file}`);
  if (bytes.includes(0)) return;
  const text = bytes.toString('utf8');
  for (const [name, rule] of rules) if (rule.test(text)) issues.add(`${scope}: ${name}: ${file}`);
  for (const value of policy.forbiddenStrings || []) if (value && text.toLowerCase().includes(String(value).toLowerCase())) issues.add(`${scope}: local private identifier: ${file}`);
}
for (const file of tracked) if (existsSync(file)) check(file, readFileSync(file), 'working tree');
let commits = 0;
if (history) {
  const refs = git(['rev-list', '--all']).trim();
  commits = refs ? refs.split('\n').length : 0;
  if (commits) {
    const emails = git(['log', '--all', '--format=%ae%n%ce']).split('\n').filter(Boolean);
    if (emails.some(email => !/@users\.noreply\.github\.com$/i.test(email))) issues.add('history: commit identity must use a GitHub no-reply email');
  }
  const scanned = new Set();
  for (const commit of refs ? refs.split('\n') : []) {
    for (const record of git(['ls-tree', '-r', '-z', commit]).split('\0').filter(Boolean)) {
      const at = record.indexOf('\t');
      const [, type, object] = record.slice(0, at).split(' ');
      const file = record.slice(at + 1);
      const key = `${object}:${file}`;
      if (type !== 'blob' || scanned.has(key)) continue;
      scanned.add(key);
      check(file, execFileSync('git', ['cat-file', 'blob', object], { maxBuffer: 16 * 1024 * 1024, windowsHide: true }), 'history');
    }
  }
}
if (issues.size) {
  console.error([...issues].join('\n'));
  console.error('Privacy check failed. Matched values have not been printed.');
  process.exitCode = 1;
} else console.log(`Privacy check passed: ${tracked.length} tracked files, ${commits} reachable commits checked.`);
