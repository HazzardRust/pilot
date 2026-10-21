/**
 * A Sign off press on a gate2 lands the feature (gate2-lands S1; spec 1, 4, 5, 8; L1-L4, L9, L10;
 * ADR 0111). The daemon starts `node <bin>/pilot.mjs land` in the run record's worktree with no
 * shell, and the gate2's thread carries "landing started in ..." and then land's own lines. Every
 * spawn here is injected: no test lets a real `pilot land` run.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { KIND_GATE2, SIGN_OFF } from '../items.mjs';
import { landingSpawnOptions, startLanding } from '../landing.mjs';
import { listItems, postItem, registerRun, setSlices, storeFile } from '../store.mjs';
import { deckOnAPort, tempDeck, withTicket } from '../testUtils.mjs';

const PILOT_BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'pilot.mjs');
const reread = (id) => listItems().find((item) => item.id === id);
const deckLines = (id) => reread(id).replies.filter((message) => message.author === 'deck').map((message) => message.text);

/** A directory of the test's own, removed when it ends. */
function scratch(t, name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `pilot-landing-${name}-`));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A repository (a `.git` directory) and a linked worktree of it (a `.git` file naming it). */
function aCheckout(t, name = 'repo') {
  const repo = scratch(t, name);
  fs.mkdirSync(path.join(repo, '.git'));
  const worktree = scratch(t, `${name}-wt`);
  fs.writeFileSync(path.join(worktree, '.git'), `gitdir: ${repo.replace(/\\/g, '/')}/.git/worktrees/feat-x\n`);
  return { repo, worktree };
}

/** A gate2 in `repo` whose ticket has a run record, with `worktree` when one is given. */
function aGate2(repo, { worktree, record = true } = {}) {
  const evidence = withTicket({ pr: '#250', sha: '0305827' }, repo, 'yellow');
  if (record) {
    const run = registerRun({ repo, pid: 4242 });
    setSlices(run.id, [], undefined, { slug: 'x', ticket: evidence.ticket, ...(worktree ? { worktree } : {}) });
  }
  return postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo, ...evidence });
}

/** A child process as `spawn` answers one, driven by the test; every call is kept. */
function aSpawn() {
  const calls = [];
  const children = [];
  const spawn = (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    child.pid = 9000 + calls.length;
    child.stdout = Object.assign(new EventEmitter(), { setEncoding() {} });
    child.stderr = Object.assign(new EventEmitter(), { setEncoding() {} });
    child.kill = () => true;
    children.push(child);
    return child;
  };
  /** Land prints `stdout` and exits with `code`. */
  const exit = (code, stdout = '', stderr = '') => {
    const child = children.at(-1);
    if (stdout) child.stdout.emit('data', Buffer.from(stdout));
    if (stderr) child.stderr.emit('data', Buffer.from(stderr));
    child.emit('exit', code, null);
    child.emit('close', code, null);
  };
  return { spawn, calls, children, exit };
}

/** A Sign off as the deck's own page posts it, not a navigation, so it answers 303 back. */
const press = (base, route, fields) =>
  new Promise((resolve, reject) => {
    const request = http.request(`${base}${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    });
    request.on('response', (response) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    });
    request.on('error', reject);
    request.end(String(new URLSearchParams(fields)));
  });

const LANDED = 'landed feat/x on pilot at 1a2b3c4\nmain gets pilot: unknown (gh pr list failed: no remote)\n';

test('a Sign off press on a gate2 spawns node <bin>/pilot.mjs land with the record\'s worktree as cwd and no shell', async (t) => {
  const fake = aSpawn();
  const base = await deckOnAPort(t, { land: (id) => startLanding(id, { spawn: fake.spawn, env: {} }) });
  const { repo, worktree } = aCheckout(t);
  const gate = aGate2(repo, { worktree });

  assert.equal(await press(base, '/reply', { id: gate.id, choice: SIGN_OFF }), 303);

  assert.equal(fake.calls.length, 1, 'one land started');
  const [{ command, args, options }] = fake.calls;
  assert.equal(command, process.execPath);
  assert.deepEqual(args, [PILOT_BIN, 'land']);
  assert.equal(options.cwd, worktree);
  assert.equal(options.shell, false);
  assert.equal(options.windowsHide, true);
  // Its own process group off Windows, so a timeout can kill the whole tree by the group (F4).
  assert.equal(options.detached, process.platform !== 'win32');
  assert.ok(!Object.keys(options.env).some((name) => name.toUpperCase() === 'CLAUDECODE'), "the parent session's markers are dropped");
});

// Rests on the injected platform on any host, and on the all-os CI job for the host's own.
test('landing spawns a group leader off Windows', () => {
  assert.equal(landingSpawnOptions('w', {}, 'win32').detached, false);
  assert.equal(landingSpawnOptions('w', {}, 'darwin').detached, true);
  assert.equal(landingSpawnOptions('w', {}, 'linux').detached, true);
});

test('the thread reads running at once and land\'s two lines on exit 0', (t) => {
  tempDeck(t);
  const fake = aSpawn();
  const { repo, worktree } = aCheckout(t);
  const gate = aGate2(repo, { worktree });

  startLanding(gate.id, { spawn: fake.spawn, env: {} });
  assert.deepEqual(deckLines(gate.id), [`landing started in ${worktree}`]);
  assert.equal(reread(gate.id).landing.state, 'running');
  assert.ok(!('pid' in reread(gate.id).landing), 'no pid: a restart settles it, not a pid check (F1)');

  fake.exit(0, LANDED);
  const { landing } = reread(gate.id);
  assert.equal(landing.state, 'landed');
  assert.equal(landing.sha, '1a2b3c4');
  assert.equal(deckLines(gate.id).at(-1), LANDED.trimEnd());
  assert.ok(reread(gate.id).replies.every((message) => message.from !== 'user' || message.text === SIGN_OFF), 'nothing the deck wrote reads as the user');
  // The running line wakes nobody; this landing's main PR is unknown, so its line wakes the pilot (three-lanes L7).
  const said = reread(gate.id).replies.filter((message) => message.author === 'deck').map(({ from, seq }) => [from, Number.isInteger(seq)]);
  assert.deepEqual(said, [['pilot', false], ['deck', true]]);
});

test('exit 1 settles refused with land\'s NOT landed line', (t) => {
  tempDeck(t);
  const fake = aSpawn();
  const { repo, worktree } = aCheckout(t);
  const gate = aGate2(repo, { worktree });

  startLanding(gate.id, { spawn: fake.spawn, env: {} });
  fake.exit(1, 'NOT landed: npm test failed: deck/test/x.test.mjs\n', 'npm ERR! noise\n');
  const { landing } = reread(gate.id);
  assert.equal(landing.state, 'refused');
  assert.equal(landing.sha, undefined);
  assert.equal(deckLines(gate.id).at(-1), 'NOT landed: npm test failed: deck/test/x.test.mjs');
});

test('no record, no worktree field, a removed worktree, or another repository\'s checkout each settle refused by name and spawn nothing', (t) => {
  tempDeck(t);
  const fake = aSpawn();
  const land = (gate) => {
    startLanding(gate.id, { spawn: fake.spawn, env: {} });
    assert.equal(reread(gate.id).landing.state, 'refused');
    return deckLines(gate.id).at(-1);
  };

  const none = aGate2(aCheckout(t, 'none').repo, { record: false });
  assert.match(land(none), new RegExp(`^NOT landed: no run record names ticket ${none.ticket}; nothing run$`));

  const walked = aCheckout(t, 'walked');
  const elsewhere = aCheckout(t, 'elsewhere');
  // `<walked>/.git/worktrees/../../../<elsewhere>/.git`: git reads it as elsewhere's own gitdir.
  const walk = path.relative(path.join(walked.repo, '.git', 'worktrees'), path.join(elsewhere.repo, '.git'));
  fs.writeFileSync(path.join(walked.worktree, '.git'), `gitdir: ${path.join(walked.repo, '.git', 'worktrees')}/${walk}\n`);
  const walkedGate = aGate2(walked.repo, { worktree: walked.worktree });
  assert.match(land(walkedGate), / is not a checkout of /, 'a .. in the gitdir cannot name another repository');

  const bare = aGate2(aCheckout(t, 'bare').repo);
  assert.match(land(bare), new RegExp(`^NOT landed: the run record for ticket ${bare.ticket} names no worktree; nothing run$`));

  const gone = aCheckout(t, 'gone');
  const goneGate = aGate2(gone.repo, { worktree: gone.worktree });
  fs.rmSync(gone.worktree, { recursive: true, force: true });
  // Gone from a repository git cannot recreate it from (three-lanes S12): still refused by name.
  assert.ok(land(goneGate).startsWith(`NOT landed: the worktree ${gone.worktree} is gone and git fetch could not recreate it (`));

  const mine = aCheckout(t, 'mine');
  const theirs = aCheckout(t, 'theirs');
  const crossed = aGate2(mine.repo, { worktree: theirs.worktree });
  assert.equal(land(crossed), `NOT landed: ${theirs.worktree} is not a checkout of ${mine.repo}; nothing run`);

  assert.equal(fake.calls.length, 0, 'nothing spawned');
});

test('GET / answers while the child has not exited', async (t) => {
  const fake = aSpawn();
  const base = await deckOnAPort(t, { land: (id) => startLanding(id, { spawn: fake.spawn, env: {} }) });
  const { repo, worktree } = aCheckout(t);
  const gate = aGate2(repo, { worktree });

  assert.equal(await press(base, '/reply', { id: gate.id, choice: SIGN_OFF }), 303);
  assert.equal(reread(gate.id).landing.state, 'running');
  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  await page.text();
  assert.equal(reread(gate.id).landing.state, 'running', 'still running');
});

test('credential-shaped output is withheld with the exit code', (t) => {
  tempDeck(t);
  const fake = aSpawn();
  const { repo, worktree } = aCheckout(t);
  const gate = aGate2(repo, { worktree });

  startLanding(gate.id, { spawn: fake.spawn, env: {} });
  fake.exit(1, `NOT landed: token=${'a'.repeat(24)}\n`);
  const line = deckLines(gate.id).at(-1);
  assert.equal(line, 'NOT landed: pilot land exited 1 and its output was withheld: it looks like a secret assigned to a name');
  assert.equal(reread(gate.id).landing.state, 'refused');
});

test('output past 2000 characters keeps its tail', (t) => {
  tempDeck(t);
  const fake = aSpawn();
  const { repo, worktree } = aCheckout(t);
  const gate = aGate2(repo, { worktree });

  startLanding(gate.id, { spawn: fake.spawn, env: {} });
  const long = `NOT landed: ${'x'.repeat(3000)}END`;
  fake.exit(1, `${long}\n`);
  const line = deckLines(gate.id).at(-1);
  assert.equal(line.length, 2000);
  assert.ok(line.endsWith('END'));
  assert.equal(reread(gate.id).landing.line, line);
});

test('PILOT_DECK_NO_LAND writes "landing is turned off on this deck" and spawns nothing', async (t) => {
  assert.ok(process.env.PILOT_DECK_NO_LAND, 'no-open.mjs sets it');
  const fake = aSpawn();
  const base = await deckOnAPort(t, { land: (id) => startLanding(id, { spawn: fake.spawn }) });
  const { repo, worktree } = aCheckout(t);
  const gate = aGate2(repo, { worktree });

  assert.equal(await press(base, '/reply', { id: gate.id, choice: SIGN_OFF }), 303);
  assert.equal(fake.calls.length, 0);
  // The press line names the lander the press made due (lander S8, spec 5).
  assert.deepEqual(deckLines(gate.id), [`lander due: spawn pilot-lander ${gate.id}`, 'landing is turned off on this deck']);
});

test('a child that cannot start, a spawn that throws, and a killed land each settle refused once', (t) => {
  tempDeck(t);
  const { repo, worktree } = aCheckout(t);
  let announced = 0;

  const failed = aSpawn();
  const gate = aGate2(repo, { worktree });
  startLanding(gate.id, { spawn: failed.spawn, env: {}, announce: () => announced++ });
  const child = failed.children.at(-1);
  child.emit('error', new Error('spawn node ENOENT'));
  child.emit('close', -4058, null);
  assert.deepEqual(deckLines(gate.id).slice(1), ['NOT landed: pilot land could not start (spawn node ENOENT)'], 'one settle');
  assert.equal(announced, 1);

  const second = aGate2(repo, { worktree });
  startLanding(second.id, { spawn: () => { throw new Error('EMFILE'); }, env: {} });
  assert.deepEqual(deckLines(second.id), [`landing started in ${worktree}`, 'NOT landed: pilot land could not start (EMFILE)']);
  assert.equal(reread(second.id).landing.state, 'refused');

  const killed = aSpawn();
  const third = aGate2(repo, { worktree });
  startLanding(third.id, { spawn: killed.spawn, env: {} });
  killed.exit(null);
  assert.equal(deckLines(third.id).at(-1), 'NOT landed: pilot land was killed and printed nothing');
});

test('a running landing that cannot be written runs nothing', (t) => {
  tempDeck(t);
  const fake = aSpawn();
  const { repo, worktree } = aCheckout(t);
  const gate = aGate2(repo, { worktree });
  // The store's next write goes through this temporary file: a directory in its place fails it.
  const blocked = `${storeFile()}.${process.pid}.tmp`;
  fs.mkdirSync(blocked);
  t.after(() => fs.rmSync(blocked, { recursive: true, force: true }));

  startLanding(gate.id, { spawn: fake.spawn, env: {} });
  assert.equal(fake.calls.length, 0, 'nothing spawned');
  assert.equal(reread(gate.id).landing, undefined);
});

test('stderr is the line only when stdout is empty', (t) => {
  tempDeck(t);
  const fake = aSpawn();
  const { repo, worktree } = aCheckout(t);
  const gate = aGate2(repo, { worktree });

  startLanding(gate.id, { spawn: fake.spawn, env: {} });
  fake.exit(1, '', 'fatal: unable to access origin\n');
  assert.equal(deckLines(gate.id).at(-1), 'fatal: unable to access origin');
  assert.equal(reread(gate.id).landing.state, 'refused');
});

test('exit 0 with nothing printed, and exit 0 with credential-shaped output, each settle landed with no SHA', (t) => {
  tempDeck(t);
  const { repo, worktree } = aCheckout(t);

  const quiet = aSpawn();
  const silent = aGate2(repo, { worktree });
  startLanding(silent.id, { spawn: quiet.spawn, env: {} });
  quiet.exit(0);
  assert.equal(deckLines(silent.id).at(-1), 'landed: pilot land exited 0 and printed nothing');
  assert.equal(reread(silent.id).landing.state, 'landed');
  assert.equal(reread(silent.id).landing.sha, undefined);

  const leaky = aSpawn();
  const leaked = aGate2(repo, { worktree });
  startLanding(leaked.id, { spawn: leaky.spawn, env: {} });
  leaky.exit(0, `landed feat/x on pilot at 1a2b3c4\ntoken=${'a'.repeat(24)}\n`);
  assert.equal(deckLines(leaked.id).at(-1), 'landed: pilot land exited 0 and its output was withheld: it looks like a secret assigned to a name');
  assert.equal(reread(leaked.id).landing.state, 'landed');
  assert.equal(reread(leaked.id).landing.sha, undefined, 'a withheld line names no SHA');
});
