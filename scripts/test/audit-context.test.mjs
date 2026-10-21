/**
 * `scripts/audit-context.mjs` (housekeeping-audit S4, spec 8, 9): every
 * always-loaded context source for a repository and a home directory, and
 * the `context` area file an explorer runs it from. Uses the committed
 * fixture home, `scripts/test/fixtures/audit-home/`, and a temp repo per
 * test; the real `~/.claude` is never read.
 */

import '../../scripts/test/lib/fake-home.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { read, sectionOf } from './lib/area-file.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'audit-context.mjs');
const FIXTURE_HOME = path.join(HERE, 'fixtures', 'audit-home');
const { measureContext, globToRegExp, compileGlobs } = await import('../audit-context.mjs');

const bySource = (rows, source) => rows.find((row) => row.source === source);

/** Writes each `rel: text` pair under `dir`, creating parent directories. */
function writeTree(dir, files) {
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
}

function tempDir(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A temp repo, git-initialized so `git ls-files` reflects the given tracked files. */
function tempRepo(t, files) {
  const dir = tempDir(t, 'pilot-audit-context-');
  execFileSync('git', ['init', '--quiet'], { cwd: dir });
  writeTree(dir, files);
  execFileSync('git', ['add', '-A'], { cwd: dir });
  return dir;
}

test('each always-loaded source is one row with its tokens and scope', async (t) => {
  const repo = tempRepo(t, { 'CLAUDE.md': 'repo instructions\n' });
  const rows = await measureContext({ repo, home: FIXTURE_HOME });

  assert.deepEqual(bySource(rows, 'CLAUDE.md'), {
    source: 'CLAUDE.md', scope: 'repo', kind: 'claude-md',
    tokens: Buffer.byteLength('repo instructions\n', 'utf8') / 4,
  });
  const homeClaudeMd = fs.readFileSync(path.join(FIXTURE_HOME, '.claude', 'CLAUDE.md'), 'utf8');
  assert.deepEqual(bySource(rows, '~/.claude/CLAUDE.md'), {
    source: '~/.claude/CLAUDE.md', scope: 'user', kind: 'claude-md', tokens: Buffer.byteLength(homeClaudeMd, 'utf8') / 4,
  });
  const generalRule = fs.readFileSync(path.join(FIXTURE_HOME, '.claude', 'rules', 'general.md'), 'utf8');
  assert.deepEqual(bySource(rows, '~/.claude/rules/general.md'), {
    source: '~/.claude/rules/general.md', scope: 'user', kind: 'rule', tokens: Buffer.byteLength(generalRule, 'utf8') / 4,
  });
  const description = 'A fixture skill description for the housekeeping-audit context area\'s tests (S4). '
    + 'Only this line is always loaded; the body below loads on invocation.';
  assert.deepEqual(bySource(rows, '~/.claude/skills/demo-skill/SKILL.md'), {
    source: '~/.claude/skills/demo-skill/SKILL.md', scope: 'user', kind: 'skill-description',
    tokens: Buffer.byteLength(description, 'utf8') / 4,
  });
});

test('a path-scoped rule lists the repository files its globs match', async (t) => {
  const repo = tempRepo(t, { 'hooks/x.js': 'export const useThing = () => {};\n' });
  const rows = await measureContext({ repo, home: FIXTURE_HOME });
  const reactRule = bySource(rows, '~/.claude/rules/react/hooks.md');
  assert.equal(reactRule.kind, 'path-rule');
  assert.deepEqual(reactRule.matches, ['hooks/x.js']);
  assert.equal(reactRule.matchCount, 1);
});

test('a path rule that matches nothing is listed with a match count of zero', async (t) => {
  const repo = tempRepo(t, { 'lib/plain.js': 'module.exports = {};\n' });
  const rows = await measureContext({ repo, home: FIXTURE_HOME });
  const reactRule = bySource(rows, '~/.claude/rules/react/hooks.md');
  assert.deepEqual(reactRule.matches, []);
  assert.equal(reactRule.matchCount, 0);
});

test('a hook row names its event, its matcher and its size', async (t) => {
  const repo = tempRepo(t, { 'CLAUDE.md': 'x' });
  const rows = await measureContext({ repo, home: FIXTURE_HOME });
  const hooks = rows.filter((row) => row.kind === 'hook');
  assert.deepEqual(hooks.map((row) => [row.event, row.matcher]).sort(), [['PreToolUse', '*'], ['SessionStart', '*']]);
  // Neither fixture hook's script exists (fixtures are .md/.json only), so both fall back to the command's own size.
  assert.ok(hooks.every((hook) => hook.scope === 'user' && hook.tokens > 0));
  // A referenced script that does exist is sized instead of the command string.
  const home = tempDir(t, 'pilot-audit-hook-');
  const hookBody = 'x'.repeat(400);
  writeTree(home, {
    '.claude/hooks/big.js': hookBody,
    '.claude/settings.json': JSON.stringify({
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node hooks/big.js' }] }] },
    }),
  });
  const bigHook = (await measureContext({ repo, home })).find((row) => row.kind === 'hook');
  assert.equal(bigHook.tokens, Buffer.byteLength(hookBody, 'utf8') / 4);
});

test('MCP servers from .mcp.json and settings are rows', async (t) => {
  const server = { command: 'node', args: ['server.js'] };
  const repo = tempRepo(t, { '.mcp.json': JSON.stringify({ mcpServers: { repoServer: server } }) });
  const rows = await measureContext({ repo, home: FIXTURE_HOME });

  const repoRow = bySource(rows, '.mcp.json');
  assert.equal(repoRow.kind, 'mcp-server');
  assert.equal(repoRow.tokens, Buffer.byteLength(JSON.stringify(server), 'utf8') / 4);
  assert.ok(
    rows.find((row) => row.source === '~/.claude/settings.json' && row.kind === 'mcp-server'),
    'the fixture home settings.json names an MCP server too',
  );
});

test('a malformed hooks shape in settings.json is skipped, never thrown (review fix)', async (t) => {
  const repo = tempRepo(t, { 'CLAUDE.md': 'x' });
  const home = tempDir(t, 'pilot-audit-malformed-');
  writeTree(home, { '.claude/settings.json': JSON.stringify({ hooks: { PreToolUse: { matcher: '*' } } }) });
  assert.doesNotThrow(() => measureContext({ repo, home }));
});

test('the CLI always prints the rows as JSON', (t) => {
  const repo = tempRepo(t, { 'CLAUDE.md': 'hello\n' });
  const run = (...extra) => spawnSync(process.execPath, [SCRIPT, repo, '--home', FIXTURE_HOME, ...extra], { encoding: 'utf8' });
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const rows = JSON.parse(result.stdout);
  assert.ok(rows.some((row) => row.source === 'CLAUDE.md') && rows.some((row) => row.kind === 'path-rule'));
});

test('the CLI without --home prints the rows, not the usage (QA read-only pass)', (t) => {
  const result = spawnSync(process.execPath, [SCRIPT, tempRepo(t, { 'CLAUDE.md': 'hello\n' })], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(JSON.parse(result.stdout).some((row) => row.source === 'CLAUDE.md'));
});

test(
  "the context area runs the script by its plugin path and excludes the pilot's own prompts",
  () => {
    const source = read('skills/audit/areas/context.md');
    const measure = sectionOf(source, 'Measure');
    assert.match(measure, /\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/audit-context\.mjs/);
    assert.match(measure, /A4/);
    assert.match(measure, /this package's own agents or skills/i);
    assert.match(measure, /never\s+read[\s\S]*harness's private plugin registry/i);
    assert.match(sectionOf(source, 'Rows'), /context.*tooling|tooling.*context/is);

    const ret = sectionOf(source, 'Return');
    for (const field of ['area', 'finding', 'command', 'output', 'exit', 'fix', 'saving', 'effort', 'spec']) {
      assert.match(ret, new RegExp(field), `the Return section names the ${field} field`);
    }
    assert.match(ret, /friction/i);
  },
);

test('globToRegExp covers **, * and {a,b} with no glob dependency', () => {
  assert.ok(globToRegExp('**/hooks/**/*.js').test('hooks/x.js'));
  assert.ok(globToRegExp('**/hooks/**/*.js').test('a/b/hooks/c/x.js'));
  assert.ok(!globToRegExp('**/*.vue').test('lib/plain.js'));
  assert.ok(globToRegExp('src/{a,b}.ts').test('src/a.ts'));
  assert.ok(!globToRegExp('src/{a,b}.ts').test('src/c.ts'));
  // P11b: a bare trailing `**`, with no following `/`, still matches everything under it.
  assert.ok(globToRegExp('src/**').test('src/a/b.ts'));
  assert.ok(globToRegExp('src/**').test('src/a.ts'));
  // P11b: an unclosed `{` is a literal brace, never a group - it never finds its `}`.
  assert.ok(globToRegExp('src/{a,b').test('src/{a,b'));
  assert.ok(!globToRegExp('src/{a,b').test('src/a'));
});

// F1: a hook `command` naming a path outside the repo is a file-existence-and-size oracle.
test('a repo-scope hook command pointing outside the repo is sized by its command string, not the target file (F1)', async (t) => {
  const outside = tempDir(t, 'pilot-audit-outside-');
  const secret = path.join(outside, 'secret.js');
  fs.writeFileSync(secret, 'x'.repeat(4000));
  const command = `node ${secret.replace(/\\/g, '/')}`;
  const repo = tempRepo(t, {
    '.claude/settings.json': JSON.stringify({
      hooks: { PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command }] }] },
    }),
  });
  const hook = (await measureContext({ repo })).find((row) => row.kind === 'hook');
  assert.equal(hook.tokens, Buffer.byteLength(command, 'utf8') / 4, 'sized the command string, not the 4000-byte target');
});

test('a repo-scope hook script inside the repo is still sized by its own content', async (t) => {
  const repo = tempRepo(t, {
    '.claude/hooks/local.js': 'y'.repeat(40),
    '.claude/settings.json': JSON.stringify({
      hooks: { PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'node hooks/local.js' }] }] },
    }),
  });
  const hook = (await measureContext({ repo })).find((row) => row.kind === 'hook');
  assert.equal(hook.tokens, Buffer.byteLength('y'.repeat(40), 'utf8') / 4);
});

// F2: a glob with many wildcard tokens must not be compiled at all - it backtracks
// exponentially against a non-matching path - and its row must say it was skipped.
test('a glob past the wildcard-token cap is refused, not compiled, and named in the row (F2)', () => {
  const hostile = '**/'.repeat(30) + 'x';
  const start = Date.now();
  const { regexes, skipped } = compileGlobs([hostile, 'src/{a,b}.ts']);
  assert.ok(Date.now() - start < 2000, 'must refuse before ever compiling the hostile glob');
  assert.equal(regexes.length, 1, 'only the well-formed glob was compiled');
  assert.deepEqual(skipped, [hostile]);
});

test('a glob packing many wildcard tokens into one segment is refused too (F2, second gap)', () => {
  const hostile = `${'*a'.repeat(20)}z`;
  const start = Date.now();
  const { regexes, skipped } = compileGlobs([hostile]);
  assert.ok(Date.now() - start < 2000, 'must refuse before ever compiling the hostile glob');
  assert.equal(regexes.length, 0);
  assert.deepEqual(skipped, [hostile]);
});

test('a repo rule with a hostile glob reports the skip instead of matching nothing silently', async (t) => {
  const repo = tempRepo(t, {
    'src/a.ts': '',
    '.claude/rules/hostile.md': `---\npaths:\n  - "${'**/'.repeat(30)}x"\n---\nbody\n`,
  });
  const rows = await measureContext({ repo });
  const rule = bySource(rows, '.claude/rules/hostile.md');
  assert.equal(rule.kind, 'path-rule');
  assert.equal(rule.matchCount, 0);
  assert.equal(rule.skipped.length, 1);
});

// F3: a tracked symlink pointing outside the repo must not be followed and sized, at any
// of the readers `guardedRead` guards - the audited repo is untrusted input. P1 collapsed
// those readers to one guard, bound once in `repoRows`; these four exercise it from each
// entry point a mutant dropping that one binding would open back up.
/** A file symlink, or a skipped test where this platform refuses one without elevated privilege. */
function symlinkOrSkip(t, target, link) {
  try {
    fs.symlinkSync(target, link, 'file');
    return true;
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'EACCES') {
      t.skip(`cannot create a file symlink without elevated privilege on this platform: ${err.code}`);
      return false;
    }
    throw err;
  }
}

test('a tracked symlink under .claude/rules/ that escapes the repo is not read (F3)', async (t) => {
  const outside = tempDir(t, 'pilot-audit-symlink-target-');
  fs.writeFileSync(path.join(outside, 'secret.md'), 'z'.repeat(400));
  const repo = tempRepo(t, { 'CLAUDE.md': 'x' });
  fs.mkdirSync(path.join(repo, '.claude', 'rules'), { recursive: true });
  const link = path.join(repo, '.claude', 'rules', 'escape.md');
  if (!symlinkOrSkip(t, path.join(outside, 'secret.md'), link)) return;

  const rows = await measureContext({ repo });
  assert.equal(bySource(rows, '.claude/rules/escape.md'), undefined, 'the escaping symlink is not read or sized');
});

test('a symlinked CLAUDE.md that escapes the repo is not read (P1)', async (t) => {
  const outside = tempDir(t, 'pilot-audit-symlink-target-');
  fs.writeFileSync(path.join(outside, 'secret.md'), 'z'.repeat(400));
  const repo = tempRepo(t, {});
  const link = path.join(repo, 'CLAUDE.md');
  if (!symlinkOrSkip(t, path.join(outside, 'secret.md'), link)) return;

  const rows = await measureContext({ repo });
  assert.equal(bySource(rows, 'CLAUDE.md'), undefined, 'the escaping symlink is not read or sized');
});

test('a symlinked skill SKILL.md that escapes the repo is not read (P1)', async (t) => {
  const outside = tempDir(t, 'pilot-audit-symlink-target-');
  fs.writeFileSync(path.join(outside, 'secret.md'), 'z'.repeat(400));
  const repo = tempRepo(t, { 'CLAUDE.md': 'x' });
  fs.mkdirSync(path.join(repo, '.claude', 'skills', 'demo'), { recursive: true });
  const link = path.join(repo, '.claude', 'skills', 'demo', 'SKILL.md');
  if (!symlinkOrSkip(t, path.join(outside, 'secret.md'), link)) return;

  const rows = await measureContext({ repo });
  assert.equal(bySource(rows, '.claude/skills/demo/SKILL.md'), undefined, 'the escaping symlink is not read or sized');
});

test('a symlinked settings.json that escapes the repo is not read (P1)', async (t) => {
  const outside = tempDir(t, 'pilot-audit-symlink-target-');
  fs.writeFileSync(path.join(outside, 'secret.json'), JSON.stringify({ mcpServers: { x: { command: 'node' } } }));
  const repo = tempRepo(t, { 'CLAUDE.md': 'x' });
  fs.mkdirSync(path.join(repo, '.claude'), { recursive: true });
  const link = path.join(repo, '.claude', 'settings.json');
  if (!symlinkOrSkip(t, path.join(outside, 'secret.json'), link)) return;

  const rows = await measureContext({ repo });
  assert.equal(bySource(rows, '.claude/settings.json'), undefined, 'the escaping symlink is not read or sized');
  assert.ok(!rows.some((row) => row.kind === 'mcp-server'), 'the outside server it names is never surfaced as a row');
});

// F4: no file is read past a size bound; past it, tokens come from the stat size alone.
test('a file over the size bound is sized from stat, its content never read (F4)', async (t) => {
  const repo = tempRepo(t, { 'CLAUDE.md': 'q'.repeat(5 * 1024 * 1024 + 1) });
  const target = path.join(repo, 'CLAUDE.md');
  const original = fs.readFileSync;
  const calls = [];
  fs.readFileSync = (...args) => { calls.push(args[0]); return original(...args); };
  t.after(() => { fs.readFileSync = original; });

  const row = bySource(await measureContext({ repo }), 'CLAUDE.md');
  assert.equal(row.tokens, (5 * 1024 * 1024 + 1) / 4);
  assert.ok(
    !calls.some((file) => path.resolve(file) === path.resolve(target)),
    'the oversized file must be sized from stat, never opened',
  );
});

// F5: a settings/.mcp.json file that fails to parse must read as a finding, not "nothing".
test('a settings.json that fails to parse is an unreadable row, not silence (F5)', async (t) => {
  const repo = tempRepo(t, { '.claude/settings.json': '{ not json' });
  const row = bySource(await measureContext({ repo }), '.claude/settings.json');
  assert.deepEqual(row, { source: '.claude/settings.json', scope: 'repo', kind: 'unreadable', tokens: 0 });
});

test('an .mcp.json that fails to parse is an unreadable row, not silence (F5)', async (t) => {
  const repo = tempRepo(t, { '.mcp.json': 'not json at all' });
  const row = bySource(await measureContext({ repo }), '.mcp.json');
  assert.deepEqual(row, { source: '.mcp.json', scope: 'repo', kind: 'unreadable', tokens: 0 });
});

// F6: `git ls-files` failing must not read as "every path rule matches nothing".
test('git ls-files failing is visible as an unknown match count, not zero (F6)', async (t) => {
  const notARepo = tempDir(t, 'pilot-audit-not-a-repo-');
  writeTree(notARepo, {
    'hooks/x.js': '',
    '.claude/rules/react/hooks.md': '---\npaths:\n  - "**/hooks/**/*.js"\n---\nbody\n',
  });
  const rows = await measureContext({ repo: notARepo });
  const rule = bySource(rows, '.claude/rules/react/hooks.md');
  assert.equal(rule.matchCount, null);
  assert.deepEqual(rule.matches, []);
});
