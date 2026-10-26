import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const scanner = fileURLToPath(new URL('./privacy-check.mjs', import.meta.url));
const project = path.dirname(path.dirname(scanner));
const synthetic = () => randomBytes(24).toString('hex');
const githubValue = () => ['gh', 'p_'].join('') + synthetic();
const sourceAssignment = (key, value) => ['const', key, '=', JSON.stringify(value) + ';'].join(' ');

function fixture(t) {
  // Keep fixtures inside the project, never in an OS temporary directory.
  const directory = mkdtempSync(path.join(project, '.privacy-check-fixture-'));
  t.after(() => rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  const env = { ...process.env };
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_CONFIG_COUNT']) delete env[name];
  Object.assign(env, {
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: path.join(directory, '.git', 'no-global-config'),
    GIT_AUTHOR_NAME: 'Privacy fixture', GIT_COMMITTER_NAME: 'Privacy fixture',
    GIT_AUTHOR_EMAIL: 'fixture@users.noreply.github.com', GIT_COMMITTER_EMAIL: 'fixture@users.noreply.github.com',
    GIT_TERMINAL_PROMPT: '0', GIT_DEFAULT_HASH: 'sha1',
  });
  function git(args, extra = {}) {
    const result = spawnSync('git', args, { cwd: directory, env, encoding: 'utf8', windowsHide: true, ...extra });
    assert.equal(result.status, 0, 'fixture Git command must succeed');
    return result.stdout.trim();
  }
  function write(file, content) {
    const absolute = path.join(directory, file);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, content);
  }
  function commit(message = 'Synthetic fixture') {
    git(['add', '--all']);
    git(['-c', 'commit.gpgsign=false', 'commit', '--quiet', '--allow-empty', '-m', message]);
    return git(['rev-parse', 'HEAD']);
  }
  function scan(history = false, extraEnv = {}) {
    const result = spawnSync(process.execPath, [scanner, ...(history ? ['--history'] : [])], {
      cwd: directory, env: { ...env, ...extraEnv }, encoding: 'utf8', windowsHide: true,
      timeout: 30_000, maxBuffer: 8 * 1024 * 1024,
    });
    assert.ifError(result.error);
    return { status: result.status, output: result.stdout + result.stderr };
  }
  git(['init', '--quiet', '--initial-branch=fixture-main']);
  commit('Fixture baseline');
  return { directory, git, write, commit, scan, env };
}
function passes(result) {
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /Privacy check passed:/);
}
function fails(result, category, values = []) {
  for (const value of values) assert.equal(result.output.includes(value), false, 'matched values must never be printed');
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, category);
  assert.doesNotMatch(result.output, /Privacy check passed:/);
}

test('legal source, empty template, SVG and dynamically constructed fixtures pass', t => {
  const repo = fixture(t);
  repo.write('.env.example', readFileSync(path.join(project, '.env.example')));
  repo.write('scripts/privacy-check.mjs', readFileSync(scanner));
  repo.write('scripts/privacy-check.test.mjs', readFileSync(fileURLToPath(import.meta.url)));
  repo.write('scripts/smoke.mjs', readFileSync(path.join(project, 'scripts', 'smoke.mjs')));
  repo.write('valid.ts', 'const token = process.env.API_TOKEN;\nfunction check(password: string) { return password; }\nconst secret = randomBytes(32).toString("hex");\n');
  repo.write('icon.svg', '<svg xmlns="http://www.w3.org/2000/svg"><title>合成图标</title></svg>\n');
  repo.commit();
  passes(repo.scan(true));
});

test('unstaged tracked content and visible untracked files are scanned', t => {
  const repo = fixture(t);
  repo.write('settings.txt', 'public\n');
  repo.commit();
  const first = githubValue();
  repo.write('settings.txt', first);
  fails(repo.scan(), /GitHub credential: working tree/, [first]);
  repo.write('settings.txt', 'public\n');
  const second = synthetic();
  repo.write('new.json', JSON.stringify({ apiKey: second }));
  fails(repo.scan(), /Secret assignment: working tree/, [second]);
});

test('staged content is scanned even when the worktree was replaced with clean content', t => {
  const repo = fixture(t);
  const value = githubValue();
  repo.write('staged.txt', value);
  repo.git(['add', 'staged.txt']);
  repo.write('staged.txt', 'clean');
  fails(repo.scan(), /GitHub credential: index stage 0 blob/, [value]);
});

test('a latest deletion cannot hide secrets retained in reachable history', t => {
  const repo = fixture(t);
  const value = githubValue();
  repo.write('deleted.txt', value);
  repo.commit();
  repo.git(['rm', '--quiet', 'deleted.txt']);
  repo.commit('Remove fixture');
  passes(repo.scan());
  fails(repo.scan(true), /GitHub credential: history blob/, [value]);
});

for (const keep of ['branch', 'tag', 'remote']) {
  test(`an isolated commit reachable only by a ${keep} is scanned`, t => {
    const repo = fixture(t);
    repo.git(['checkout', '--quiet', '--orphan', 'isolated-fixture']);
    const value = githubValue();
    repo.write('isolated.txt', value);
    const object = repo.commit();
    if (keep === 'tag') repo.git(['tag', 'retained-fixture']);
    if (keep === 'remote') repo.git(['update-ref', 'refs/remotes/fixture/isolated', object]);
    repo.git(['checkout', '--quiet', 'fixture-main']);
    if (keep !== 'branch') repo.git(['branch', '-D', 'isolated-fixture']);
    passes(repo.scan());
    fails(repo.scan(true), /GitHub credential: history blob/, [value]);
  });
}

test('commit messages and identity names are scanned without echoing metadata', t => {
  const repo = fixture(t);
  const value = synthetic();
  repo.commit(['API', 'KEY'].join('_') + '=' + value);
  fails(repo.scan(true), /Secret assignment: history commit/, [value]);
  const name = githubValue();
  repo.git(['-c', 'commit.gpgsign=false', 'commit', '--quiet', '--allow-empty', '-m', 'Metadata fixture'], {
    env: { ...repo.env, GIT_AUTHOR_NAME: name },
  });
  fails(repo.scan(true), /GitHub credential: history commit/, [value, name]);
});

test('author, committer and annotated tagger emails require no-reply identities', t => {
  const repo = fixture(t);
  const email = synthetic() + '@example.invalid';
  repo.git(['-c', 'commit.gpgsign=false', 'commit', '--quiet', '--allow-empty', '-m', 'Identity fixture'], {
    env: { ...repo.env, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_EMAIL: email },
  });
  repo.git(['-c', 'tag.gpgsign=false', 'tag', '-a', 'identity-fixture', '-m', 'Tag fixture'], {
    env: { ...repo.env, GIT_COMMITTER_EMAIL: email },
  });
  const result = repo.scan(true);
  fails(result, /Git identity must use a GitHub no-reply email: history commit/, [email]);
  assert.match(result.output, /Git identity must use a GitHub no-reply email: history tag/);
});

test('GitHub-generated merge identities use the public platform no-reply address', t => {
  const repo = fixture(t);
  repo.git(['-c', 'commit.gpgsign=false', 'commit', '--quiet', '--allow-empty', '-m', 'Merge identity fixture'], {
    env: { ...repo.env, GIT_COMMITTER_EMAIL: ['noreply', 'github.com'].join('@') },
  });
  passes(repo.scan(true));
});

test('nested annotated tags retain secret messages after the inner ref is deleted', t => {
  const repo = fixture(t);
  const value = synthetic();
  repo.git(['-c', 'tag.gpgsign=false', 'tag', '-a', 'inner-fixture', '-m', 'AUTH_TOKEN=' + value]);
  repo.git(['-c', 'tag.gpgsign=false', 'tag', '-a', 'outer-fixture', '-m', 'Outer fixture', 'inner-fixture']);
  repo.git(['tag', '-d', 'inner-fixture']);
  fails(repo.scan(true), /Secret assignment: history tag/, [value]);
});

test('tags pointing directly to blobs or trees are scanned', t => {
  const repo = fixture(t);
  const value = githubValue();
  const blob = repo.git(['hash-object', '-w', '--stdin'], { input: value });
  repo.git(['tag', 'blob-fixture', blob]);
  const clean = repo.git(['hash-object', '-w', '--stdin'], { input: 'clean' });
  const tree = repo.git(['mktree'], { input: `100644 blob ${clean}\t.env.local\n` });
  repo.git(['tag', 'tree-fixture', tree]);
  const result = repo.scan(true);
  fails(result, /GitHub credential: history blob/, [value]);
  assert.match(result.output, /Forbidden file: history blob/);
});

test('forced local policy, link state and database sidecars are forbidden', t => {
  const repo = fixture(t);
  const files = ['.privacy-policy.local.json', '.github-link-state.local.json', 'data.db-wal', 'data.db-shm', 'data.db-journal', 'data.sqlite-wal', 'data.sqlite3-shm'];
  repo.write('.gitignore', files.join('\n'));
  for (const file of files) repo.write(file, '{}');
  repo.git(['add', '-f', '--', ...files]);
  repo.commit();
  const result = repo.scan(true);
  fails(result, /Forbidden file: index/);
  for (const file of files) assert.ok(result.output.includes(JSON.stringify(file)));
  assert.match(result.output, /Forbidden file: history blob/);
});

test('ignored untracked runtime files stay local; local policy still checks scanned content', t => {
  const repo = fixture(t);
  repo.write('.gitignore', '.env.local\n.privacy-policy.local.json\n');
  const value = synthetic();
  repo.write('.env.local', value);
  repo.write('.privacy-policy.local.json', JSON.stringify({ forbiddenStrings: [value] }));
  passes(repo.scan());
  repo.write('identifier.txt', value.toUpperCase());
  fails(repo.scan(), /Local private identifier/, [value, value.toUpperCase()]);
});

test('common quoted, unquoted, JSON, YAML and camel-case assignments are detected', t => {
  const repo = fixture(t);
  const values = Array.from({ length: 8 }, synthetic);
  repo.write('config.txt', `API_KEY=${values[0]}\nexport APP_SESSION_SECRET=${values[1]}\nTURSO_AUTH_TOKEN=${values[2]}\nSECRET_KEY=${values[7]}\n`);
  repo.write('config.json', JSON.stringify({ password: values[3], clientSecret: values[4] }));
  repo.write('config.yml', `access_token: ${values[5]}\n`);
  repo.write('source.js', sourceAssignment('apiKey', values[6]));
  const result = repo.scan();
  fails(result, /Secret assignment/, values);
  for (const file of ['config.txt', 'config.json', 'config.yml', 'source.js']) assert.ok(result.output.includes(JSON.stringify(file)));
});

test('empty template values pass without exempting nonempty secret assignments', t => {
  const repo = fixture(t);
  repo.write('.env.example', 'API_KEY=\nPASSWORD=""\nSESSION_SECRET=\n');
  passes(repo.scan());
  const value = synthetic();
  repo.write('.env.example', 'API_KEY=' + value);
  fails(repo.scan(), /Secret assignment/, [value]);
  repo.write('.env.example', 'SESSION_SECRET=' + ['your', 'secret'].join('-'));
  fails(repo.scan(), /Secret assignment/);
});

test('test files have no blanket exemption and smoke exceptions are exact and reasoned', t => {
  const repo = fixture(t);
  const value = synthetic();
  repo.write('scripts/privacy-check.test.mjs', sourceAssignment('apiKey', value));
  fails(repo.scan(), /Secret assignment/, [value]);
  repo.write('scripts/privacy-check.test.mjs', 'const token = randomBytes(32);');
  repo.write('scripts/smoke.mjs', sourceAssignment('password', ['Local', 'test', 'only', '2026'].join('-')));
  passes(repo.scan());
  repo.write('elsewhere.mjs', readFileSync(path.join(repo.directory, 'scripts', 'smoke.mjs')));
  fails(repo.scan(), /Secret assignment: working tree "elsewhere.mjs"/);
  repo.write('elsewhere.mjs', '');
  repo.write('scripts/smoke.mjs', sourceAssignment('password', value));
  fails(repo.scan(), /Secret assignment/, [value]);
});

test('binary NULs and invalid UTF-8 without NULs fail closed in worktree and history', t => {
  const repo = fixture(t);
  repo.write('zero-byte.dat', Buffer.from([1, 0, 2]));
  repo.write('invalid.dat', Buffer.from([0xff, 0xfe, 0xfd]));
  repo.write('document.pdf', '%PDF-1.7\nPrintable fixture content\n');
  repo.commit();
  const result = repo.scan(true);
  fails(result, /Binary or non-UTF-8 content requires manual review: working tree/);
  assert.match(result.output, /Binary or non-UTF-8 content requires manual review: index/);
  assert.match(result.output, /Binary or non-UTF-8 content requires manual review: history blob/);
  for (const file of ['zero-byte.dat', 'invalid.dat', 'document.pdf']) assert.ok(result.output.includes(JSON.stringify(file)));
});

test('matched values in filenames, ref names and local-policy paths are redacted', t => {
  const repo = fixture(t);
  const name = githubValue();
  const local = synthetic();
  repo.git(['branch', name]);
  repo.write(name + '.txt', 'clean');
  repo.write('.gitignore', '.privacy-policy.local.json\n');
  repo.write('.privacy-policy.local.json', JSON.stringify({ forbiddenStrings: [local] }));
  repo.write(local + '.txt', 'clean');
  const result = repo.scan(true);
  fails(result, /redacted path sha256:/, [name, local]);
  assert.match(result.output, /GitHub credential: history reference object/);
});

test('Git failures never print command arguments, process errors or stderr', t => {
  const repo = fixture(t);
  const value = githubValue();
  fails(repo.scan(true, { GIT_DIR: path.join(repo.directory, value) }), /Git operation failed: repository/, [value, repo.directory]);
  fails(repo.scan(true, { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: value, GIT_CONFIG_VALUE_0: value }), /Git operation failed: repository/, [value]);
});

test('missing index objects and incomplete history cannot produce a successful scan', t => {
  const repo = fixture(t);
  repo.write('new.txt', synthetic());
  repo.git(['add', 'new.txt']);
  const blob = repo.git(['rev-parse', ':new.txt']);
  rmSync(path.join(repo.directory, '.git', 'objects', blob.slice(0, 2), blob.slice(2)));
  fails(repo.scan(), /Git operation failed: index blob/);
});

test('shallow history fails with instructions to fetch the complete history', t => {
  const repo = fixture(t);
  repo.write('.git/shallow', repo.git(['rev-parse', 'HEAD']) + '\n');
  fails(repo.scan(true), /Incomplete history requires a full clone/);
});

test('invalid policy failures are redacted and nonzero', t => {
  const repo = fixture(t);
  const value = githubValue();
  repo.write('.privacy-policy.local.json', value);
  fails(repo.scan(), /Invalid local policy: local policy/, [value]);
  repo.write('.privacy-policy.local.json', JSON.stringify({ forbiddenStrings: [42] }));
  fails(repo.scan(), /Invalid local policy: local policy/);
});

test('symlink contents in the index are scanned and gitlinks require manual review', t => {
  const repo = fixture(t);
  const value = githubValue();
  const blob = repo.git(['hash-object', '-w', '--stdin'], { input: value });
  repo.git(['update-index', '--add', '--cacheinfo', `120000,${blob},link-fixture`]);
  repo.git(['update-index', '--add', '--cacheinfo', `160000,${repo.git(['rev-parse', 'HEAD'])},submodule-fixture`]);
  const result = repo.scan();
  fails(result, /GitHub credential: index/, [value]);
  assert.match(result.output, /Gitlink requires manual review/);
});

test('worktree scans never follow a symlinked ancestor into another directory', t => {
  const repo = fixture(t);
  repo.write('nested/child.txt', 'clean');
  repo.commit();
  rmSync(path.join(repo.directory, 'nested'), { recursive: true });
  const value = githubValue();
  repo.write('.git/elsewhere/child.txt', value);
  symlinkSync(path.join(repo.directory, '.git', 'elsewhere'), path.join(repo.directory, 'nested'), process.platform === 'win32' ? 'junction' : 'dir');
  const result = repo.scan();
  fails(result, /Symlink ancestor requires manual review/, [value]);
  assert.doesNotMatch(result.output, /GitHub credential/);
});

test('replace refs cannot conceal the original reachable commit', t => {
  const repo = fixture(t);
  const value = githubValue();
  repo.write('replaced.txt', value);
  const original = repo.commit();
  repo.git(['checkout', '--quiet', 'fixture-main~1']);
  const clean = repo.git(['rev-parse', 'HEAD']);
  repo.git(['replace', original, clean]);
  fails(repo.scan(true), /GitHub credential: history blob/, [value]);
});
