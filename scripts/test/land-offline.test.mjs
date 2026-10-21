/**
 * S13 of three-lanes: a landing survives an unreachable GitHub (spec 17; A7). A push origin
 * could not be asked for is retried once; a tip already on origin reads landed, and the landing
 * ends with the main line (one-integration-line S2). Only the landing runs real git, against a
 * scratch bare origin with its failures stubbed; the rest stub git outright, since the suite's
 * spawn ceiling binds (L16). `gh` is always stubbed; nothing reaches GitHub or a deck.
 */

// A red run's log goes under a home of this process's own, never the real one.
import './lib/fake-home.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { main, pushFeature } = await import('../land.mjs');
const { remoteDefaultBranch } = await import('../pilot-branch.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const green = 'node -e "0"';
const UNREACHABLE = "fatal: unable to access 'https://github.com/o/r.git/': Could not resolve host: github.com";
const TIP = 'f'.repeat(40);

/** A failure git gives with `stderr`, as `execFileSync` throws it. */
const gitFailure = (args, stderr) => Object.assign(new Error(`Command failed: git ${args.join(' ')}\n${stderr}`), { status: 128, stderr });

/**
 * A git that answers `answers[args.join(' ')]`, throws `gitFailure` for a value that is an
 * `{ stderr }`, and refuses any call it was not given; records each call.
 */
function stubGit(answers) {
  const calls = [];
  const run = (args) => {
    calls.push(args);
    const key = args.join(' ');
    if (!(key in answers)) throw new Error(`unexpected git ${key}`);
    const answer = answers[key];
    if (typeof answer === 'object') throw gitFailure(args, answer.stderr);
    return answer;
  };
  return { run, calls };
}

/** A `gh` that cannot reach GitHub. */
const ghDown = () => {
  throw new Error('error connecting to api.github.com');
};

test("the guard's read of an unreachable origin fails closed; only land falls back", () => {
  const { run } = stubGit({ 'ls-remote --symref origin HEAD': { stderr: "fatal: 'origin' does not appear to be a git repository" } });

  assert.throws(() => remoteDefaultBranch(run), /no default branch known \(origin could not be asked\)/);
});

test('a tip already on origin reads landed', (t) => {
  // origin.git holds main and feat/x; work, its clone, keeps pilot locally (`pilot.remote none`).
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-land-offline-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'clone', '-q', origin, work);
  fs.appendFileSync(path.join(work, '.git', 'config'), '[user]\n\tname = test\n\temail = t@example.com\n[commit]\n\tgpgsign = false\n[pilot]\n\tremote = none\n');
  git(work, 'commit', '-q', '--allow-empty', '-m', 'main');
  git(work, 'branch', 'pilot');
  git(work, 'checkout', '-q', '-b', 'feat/x');
  git(work, 'commit', '-q', '--allow-empty', '-m', 'feat x');
  git(work, 'push', '-q', 'origin', 'main', 'feat/x');
  fs.writeFileSync(path.join(work, '.git', 'refs', 'remotes', 'origin', 'HEAD'), 'ref: refs/remotes/origin/main\n');
  const tip = git(work, 'rev-parse', 'HEAD');

  // origin cannot be asked for the feature's push, and for anything once the local pilot has moved.
  const calls = [];
  const featurePush = (args) => args[0] === 'push' && args.includes('feat/x');
  const inWork = (args) => {
    calls.push(args);
    const down = calls.some((call) => call[0] === 'update-ref' && call.includes('refs/heads/pilot'));
    if (featurePush(args) || (down && (args[0] === 'ls-remote' || args[0] === 'fetch'))) throw gitFailure(args, UNREACHABLE);
    return git(work, ...args);
  };
  const said = [];
  const write = process.stdout.write;
  process.stdout.write = (text) => said.push(String(text));
  let code;
  try {
    code = main([], { cwd: work, git: inWork, gh: ghDown, test: green });
  } finally {
    process.stdout.write = write;
  }
  const out = said.join('');

  assert.equal(code, 0, out);
  assert.doesNotMatch(out, /NOT landed/);
  assert.match(out, /^landed feat\/x on pilot at [0-9a-f]{7}$/m);
  assert.match(out, new RegExp(`feat/x at ${tip.slice(0, 7)} is on origin already`));
  // Under `pilot.remote none` the main PR is the user's to open, with no gh call (one-integration-line A6).
  assert.match(out, /\nmain gets pilot: open a PR from pilot to main by hand\n$/);
  assert.equal(calls.filter(featurePush).length, 2, 'the push is retried once, never more');
  assert.ok(!calls.flat().some((arg) => /^(?:--force|-f|--force-with-lease)/.test(arg) || /^\+/.test(arg)), 'no push is forced');
  assert.equal(git(origin, 'rev-parse', 'refs/heads/feat/x'), tip);
});

test('a push origin refused is not retried', () => {
  const { run, calls } = stubGit({ 'push -q origin feat/x': { stderr: ' ! [rejected]        feat/x -> feat/x (non-fast-forward)\nerror: failed to push some refs' } });

  assert.throws(() => pushFeature({ git: run, head: 'feat/x', source: TIP }), /^Error: NOT landed: the push of feat\/x failed \(! \[rejected\]/);
  assert.equal(calls.length, 1);
});
