// `scripts/measure-plain.mjs` (plain-session S7, spec 6), pinned over init events probed on
// 2026-10-19 with Claude Code 2.1.303 in a throwaway HOME: the plugin disabled, then enabled.
// The real `~/.claude` is never read; the fixture home is an empty temporary directory.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(HERE, '..', 'measure-plain.mjs');
const { pilotFootprint, isUnder, childEnv } = await import('../measure-plain.mjs');
const { installRules, rulesSource } = await import('../install-rules.mjs');
const { statusLineSetting } = await import('../install-settings.mjs');

const events = (name) => JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', `init-${name}.json`), 'utf8'));

function emptyHome(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-plain-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('the disabled fixture is all zeros', (t) => {
  const footprint = pilotFootprint({ events: events('disabled'), home: emptyHome(t) });
  assert.deepEqual(footprint, {
    tools: 0, agents: 0, skills: 0, mcp: 0, hooks: 0, rules: 0, statusLine: 0, excerpt: 0,
  });
});

test('the enabled fixture counts the crew', (t) => {
  const footprint = pilotFootprint({ events: events('enabled'), home: emptyHome(t) });
  assert.equal(footprint.agents, 25);
  assert.equal(footprint.skills, 20);
  assert.equal(footprint.hooks, 4);
  assert.ok(footprint.tools > 0, 'the deck and chrome-devtools tools name pilot');
  assert.equal(footprint.mcp, 2);
});

test('another plugin\'s hook is not the pilot\'s', (t) => {
  // A logged-in home brings the account's synced plugins; hook events do not name their plugin.
  const synced = events('disabled').map((event) => (event?.subtype === 'init'
    ? { ...event, plugins: [...(event.plugins ?? []), { name: 'mcpmarket-me', source: 'mcpmarket-me@synced' }] }
    : event));
  synced.push({ type: 'system', subtype: 'hook_started', hook_name: 'SessionStart:startup', hook_event: 'SessionStart' });
  assert.equal(pilotFootprint({ events: synced, home: emptyHome(t) }).hooks, 0);
});

test('a home under the real home is refused', (t) => {
  // An empty PATH: had the script got as far as starting `claude`, it would find none and
  // exit 1, not 2.
  const emptyPath = emptyHome(t);
  const env = { ...process.env, PATH: emptyPath, Path: emptyPath };
  const realHome = os.userInfo().homedir;
  const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { env, encoding: 'utf8', cwd: emptyPath });

  const home = run(['--home', path.join(realHome, 'pilot-plain-probe')]);
  assert.equal(home.status, 2, home.stderr);
  assert.match(home.stderr, /refus/i);
  assert.doesNotMatch(home.stderr, /ENOENT/);
  assert.equal(home.stdout, '');

  const outside = path.join(path.parse(realHome).root, 'pilot-plain-never-made');
  const cwd = run(['--home', outside, '--cwd', realHome]);
  assert.equal(cwd.status, 2, cwd.stderr);
  assert.match(cwd.stderr, /refus/i);

  // An ancestor holds the real profile beside it: claude would run in the real home's parent.
  const ancestor = run(['--home', outside, '--cwd', path.dirname(realHome)]);
  assert.equal(ancestor.status, 2, ancestor.stderr);
  assert.match(ancestor.stderr, /refus/i);
  assert.equal(fs.existsSync(outside), false, 'a refused run creates nothing');
});

test('a missing leaf under a link is judged by where the link points', (t) => {
  const dir = emptyHome(t);
  const guarded = path.join(dir, 'guarded');
  fs.mkdirSync(guarded);
  const link = path.join(dir, 'link');
  fs.symlinkSync(guarded, link, 'junction');
  assert.equal(isUnder(path.join(link, 'not-yet', 'deeper'), guarded), true);
  assert.equal(isUnder(path.join(dir, 'elsewhere', 'new'), guarded), false);
});

test('scoped rules cost nothing at start, so a home holding all of them counts 0', (t) => {
  const home = emptyHome(t);
  const report = installRules({ target: path.join(home, '.claude', 'rules'), only: 'scoped' });
  assert.ok(report.written.length > 100, `${report.written.length} scoped rules written`);
  assert.equal(pilotFootprint({ events: events('disabled'), home }).rules, 0);
});

test('a populated home counts its always-on shipped rules, statusLine and excerpt', (t) => {
  const home = emptyHome(t);
  const claudeDir = path.join(home, '.claude');
  const shipped = 'orchestration.md'; // one of the two shipped rules with no `paths:`
  fs.mkdirSync(path.join(claudeDir, 'rules'), { recursive: true });
  fs.copyFileSync(path.join(rulesSource(), shipped), path.join(claudeDir, 'rules', shipped));
  fs.writeFileSync(path.join(claudeDir, 'rules', 'mine.md'), 'my own rule\n');
  fs.writeFileSync(path.join(claudeDir, 'settings.json'),
    JSON.stringify({ statusLine: statusLineSetting(path.join(home, 'plugin root')) }));
  fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), '# Mine\n\n## Pilot\n\nFeature-sized work.\n');
  const footprint = pilotFootprint({ events: events('disabled'), home });
  assert.equal(footprint.rules, 1);
  assert.equal(footprint.statusLine, 1);
  assert.equal(footprint.excerpt, 1);
});

test('the child carries no inherited credential or cloud provider', () => {
  const home = path.join(path.sep, 'throwaway');
  const env = childEnv({
    PATH: '/bin', APPDATA: 'kept',
    ANTHROPIC_API_KEY: 'x', CLAUDE_CODE_OAUTH_TOKEN: 'x',
    CLAUDE_CODE_USE_BEDROCK: '1', claude_code_use_vertex: '1', CLAUDE_CODE_USE_FOUNDRY: '1',
    AWS_SECRET_ACCESS_KEY: 'x', aws_profile: 'x', GOOGLE_APPLICATION_CREDENTIALS: 'x', AZURE_CLIENT_SECRET: 'x',
  }, home);
  assert.deepEqual(env, {
    PATH: '/bin', APPDATA: 'kept',
    USERPROFILE: home, HOME: home, CLAUDE_CONFIG_DIR: path.join(home, '.claude'),
  });
});
