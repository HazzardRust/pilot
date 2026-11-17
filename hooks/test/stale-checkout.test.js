/**
 * audit-f1 S2: a session start in a checkout more than `BEHIND_BAR` commits behind the run's
 * pilot warns once, and every other start is silent (spec 2; L2-L5). The script is spawned by
 * absolute path over real temp repositories, a SessionStart payload on stdin; nothing fetches
 * and nothing reaches a real remote.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const HOOKS = path.join(__dirname, '..');
const CLI = path.join(HOOKS, '..', 'scripts', 'pilot-tip.mjs');
const tipModule = () => import(pathToFileURL(CLI).href);

const git = (cwd, args, input) =>
  execFileSync('git', args, { cwd, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();

function tempDir(t) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'stale-checkout-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A repo whose HEAD is `base` and whose `origin/pilot` is `ahead` empty commits past it, made in one git. */
function behind(t, ahead) {
  const work = tempDir(t);
  git(work, ['init', '-q', '-b', 'main']);
  const commit = (ref, message) => [`commit ${ref}`, 'committer t <t@example.com> 0 +0000', `data ${message.length}`, message, ''];
  const stream = commit('refs/heads/main', 'base').concat(['reset refs/remotes/origin/pilot', 'from refs/heads/main', '']);
  for (let n = 1; n <= ahead; n++) stream.push(...commit('refs/remotes/origin/pilot', `pilot ${n}`));
  git(work, ['fast-import', '--quiet'], `${stream.join('\n')}\n`);
  return { work, tip: git(work, ['rev-parse', 'refs/remotes/origin/pilot']) };
}

function sessionStart(payload, cwd) {
  return spawnSync(process.execPath, [CLI, '--session-start'], {
    cwd,
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    windowsHide: true,
  });
}

test('the bar is strictly over 100', async () => {
  const { BEHIND_BAR, staleNotice } = await tipModule();
  assert.equal(BEHIND_BAR, 100);
  const tip = (n) => ({ ref: 'origin/pilot', sha: 'a'.repeat(40), behind: n });
  const notice = staleNotice(tip(101));
  assert.ok(notice, 'a notice at 101');
  assert.equal(notice.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.equal(notice.hookSpecificOutput.additionalContext, notice.systemMessage);
  assert.equal(staleNotice(tip(100)), null, 'none at 100');
  assert.equal(staleNotice(tip(99)), null, 'none at 99');
  assert.equal(staleNotice(null), null, 'none without a tip');
});

test('a stale checkout prints one line', (t) => {
  const { work, tip } = behind(t, 101);
  const elsewhere = tempDir(t);

  const run = sessionStart({ hook_event_name: 'SessionStart', source: 'startup', cwd: work }, elsewhere);
  assert.equal(run.status, 0);
  assert.equal(run.stdout.split('\n').filter(Boolean).length, 1, 'one line');
  const { systemMessage } = JSON.parse(run.stdout);
  assert.match(systemMessage, /\b101\b/);
  assert.match(systemMessage, /origin\/pilot/);
  assert.ok(systemMessage.includes(tip.slice(0, 7)), 'names the short sha');
  assert.ok(!/\n/.test(systemMessage), 'the message itself is one line');

  const fallback = sessionStart({ hook_event_name: 'SessionStart' }, work);
  assert.equal(JSON.parse(fallback.stdout).systemMessage, systemMessage, 'cwd falls back to the process cwd');

  git(work, ['update-ref', 'refs/remotes/origin/pilot', `${tip}~1`]);
  const atBar = sessionStart({ cwd: work }, elsewhere);
  assert.deepEqual([atBar.status, atBar.stdout], [0, ''], 'silent at 100 behind');
});

test('no pilot ref, no repo, bad remote: silent', (t) => {
  const { work } = behind(t, 101);
  const plain = tempDir(t);
  const bare = tempDir(t);
  git(bare, ['init', '-q', '-b', 'main']);

  const silent = (label, payload, cwd = plain) => {
    const run = sessionStart(payload, cwd);
    assert.deepEqual([run.status, run.stdout, run.stderr], [0, '', ''], label);
  };
  silent('no repo', { cwd: plain });
  silent('no pilot ref', { cwd: bare });
  silent('a cwd that does not exist', { cwd: path.join(plain, 'missing') });
  silent('stdin that is not JSON', 'not json');
  git(work, ['config', 'pilot.remote', 'nowhere']);
  silent('bad remote', { cwd: work });
});

test('the hook is registered', () => {
  const starts = JSON.parse(fs.readFileSync(path.join(HOOKS, 'hooks.json'), 'utf8')).hooks.SessionStart;
  const mine = starts.filter((entry) => entry.id === 'start:any:stale-checkout');
  assert.equal(mine.length, 1);
  assert.equal(starts.indexOf(mine[0]), 1, 'second in the list (L2)');
  assert.equal(typeof mine[0].description, 'string');
  assert.equal(mine[0].matcher, undefined, 'every source: startup, resume, clear, compact (L5)');
  assert.deepEqual(mine[0].hooks, [
    { type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/scripts/pilot-tip.mjs" --session-start', timeout: 5 },
  ]);
});
