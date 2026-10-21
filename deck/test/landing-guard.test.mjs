/**
 * A gate2 lands once, one at a time, and never hangs (gate2-lands S2; spec 3, 6, 7; L4, L6; A1,
 * A3, A4; ADR 0111). What the user presses decides nothing past the stored landing state: a
 * landed or running gate2 refuses a second Sign off on its thread and runs nothing, a second gate2
 * in the same repository waits for the first, a landing a restarted deck finds running reads interrupted,
 * and one past 30 minutes is killed by the handle the daemon holds. Every spawn is injected.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { KIND_GATE2, KIND_QUESTION, NOT_YET, SIGN_OFF } from '../items.mjs';
import { LANDING_TIMEOUT_MS, startLanding } from '../landing.mjs';
import { LANDING_INTERRUPTED, addReply, beginLanding, interruptLandings, listItems, postItem, registerRun, setSlices, settleLanding } from '../store.mjs';
import { renderThreadPage } from '../ui/render.mjs';
import { deckOnAPort, tempDeck, withTicket } from '../testUtils.mjs';

const reread = (id) => listItems().find((item) => item.id === id);
const deckLines = (id) => reread(id).replies.filter((message) => message.author === 'deck').map((message) => message.text);
const userReplies = (id) => reread(id).replies.filter((message) => message.from === 'user').length;
const hhmm = (iso) => new Date(iso).toTimeString().slice(0, 5);

/** A repository with a linked worktree of it, both removed when the test ends. */
function aCheckout(t, name = 'repo') {
  const made = (suffix) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `pilot-guard-${suffix}-`));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
  };
  const repo = made(name);
  fs.mkdirSync(path.join(repo, '.git'));
  const worktree = made(`${name}-wt`);
  fs.writeFileSync(path.join(worktree, '.git'), `gitdir: ${repo.replace(/\\/g, '/')}/.git/worktrees/feat-x\n`);
  return { repo, worktree };
}

/** A gate2 in `repo` whose ticket's run record names `worktree`. */
function aGate2({ repo, worktree }) {
  const evidence = withTicket({ pr: '#250', sha: '0305827' }, repo, 'yellow');
  const run = registerRun({ repo, pid: 4242 });
  setSlices(run.id, [], undefined, { slug: 'x', ticket: evidence.ticket, worktree });
  return postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo, ...evidence });
}

/** `spawn` as the daemon calls it, every child driven by the test. */
function aSpawn() {
  const children = [];
  const spawn = () => {
    const child = Object.assign(new EventEmitter(), { pid: 9000 + children.length });
    child.stdout = Object.assign(new EventEmitter(), { setEncoding() {} });
    child.stderr = Object.assign(new EventEmitter(), { setEncoding() {} });
    children.push(child);
    return child;
  };
  const exit = (code, stdout = '') => {
    const child = children.at(-1);
    if (stdout) child.stdout.emit('data', stdout);
    child.emit('close', code, null);
  };
  return { spawn, children, exit };
}

/** A deck of the test's own whose Sign off lands through `fake`. */
const aDeck = (t, fake) => deckOnAPort(t, { land: (id) => startLanding(id, { spawn: fake.spawn, env: {} }) });

/** A press as the deck's own page makes it: a navigation, so a refusal comes back as a 303 to the thread. */
const press = (base, route, fields) =>
  new Promise((resolve, reject) => {
    const request = http.request(`${base}${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base, 'sec-fetch-mode': 'navigate' },
    });
    request.on('response', (response) => {
      response.resume();
      response.on('end', () => resolve(decodeURIComponent(response.headers.location ?? '')));
    });
    request.on('error', reject);
    request.end(String(new URLSearchParams(fields)));
  });
const signOff = (base, gate) => press(base, '/reply', { id: gate.id, choice: SIGN_OFF });

test('Not yet, Dismiss and a typed reply on a gate2 start no landing', async (t) => {
  const fake = aSpawn();
  const base = await aDeck(t, fake);
  const gate = aGate2(aCheckout(t));

  await press(base, '/reply', { id: gate.id, choice: NOT_YET });
  await press(base, '/reply', { id: gate.id, text: 'looks good to me' });
  await press(base, '/dismiss-item', { id: gate.id });

  assert.equal(fake.children.length, 0);
  assert.equal(reread(gate.id).landing, undefined);
});

test('a Sign off refused over an open blocking question starts no landing', async (t) => {
  const fake = aSpawn();
  const base = await aDeck(t, fake);
  const checkout = aCheckout(t);
  const gate = aGate2(checkout);
  postItem({ kind: KIND_QUESTION, title: 'Which?', body: 'which?', repo: checkout.repo, options: ['A', 'B'], recommended: 'A', ticket: gate.ticket, blocking: true });

  assert.match(await signOff(base, gate), /refused=.*waits on 1 open blocking item/);
  assert.equal(fake.children.length, 0);
  assert.equal(reread(gate.id).landing, undefined);
});

test('a Sign off on a landed gate2 is refused naming the SHA, stores no reply, spawns nothing', async (t) => {
  const fake = aSpawn();
  const base = await aDeck(t, fake);
  const gate = aGate2(aCheckout(t));
  await signOff(base, gate);
  fake.exit(0, 'landed feat/x on pilot at 1a2b3c4d\n');
  const replies = userReplies(gate.id);

  assert.match(await signOff(base, gate), new RegExp(`refused=gate2 ${gate.id} is landed at 1a2b3c4; nothing run#reply$`));
  assert.equal(userReplies(gate.id), replies, 'no reply stored');
  assert.equal(fake.children.length, 1, 'nothing spawned');
  assert.equal(reread(gate.id).landing.state, 'landed');
});

test('a Sign off while running is refused; a second gate2 in the same repository while one runs is queued (gate2-frees-lane spec 7)', async (t) => {
  const fake = aSpawn();
  const base = await aDeck(t, fake);
  const checkout = aCheckout(t);
  const gate = aGate2(checkout);
  await signOff(base, gate);
  // Posted after the press: a second run record in the repository would take the first's place.
  const other = aGate2(checkout);
  const since = hhmm(reread(gate.id).landing.startedAt);

  assert.match(await signOff(base, gate), new RegExp(`refused=gate2 ${gate.id} is landing since ${since}; nothing run#reply$`));
  assert.doesNotMatch(await signOff(base, other), /refused=/);
  assert.equal(fake.children.length, 1);
  assert.equal(reread(other.id).landing.state, 'queued');

  // Another repository's gate2 is not held up by this one.
  const elsewhere = aGate2(aCheckout(t, 'elsewhere'));
  await signOff(base, elsewhere);
  assert.equal(fake.children.length, 2);
});

test('a Sign off after NOT landed is refused naming the lander, and starts no landing (lander L7)', async (t) => {
  const fake = aSpawn();
  const base = await aDeck(t, fake);
  const gate = aGate2(aCheckout(t));
  await signOff(base, gate);
  fake.exit(1, 'NOT landed: npm test failed\n');
  assert.equal(reread(gate.id).landing.state, 'refused');

  assert.match(await signOff(base, gate), /did not land; the lander lands it again/);
  assert.equal(fake.children.length, 1);
  assert.equal(reread(gate.id).landing.state, 'refused');
});

test('the start-up sweep settles every running landing interrupted, and a second press is refused naming the lander', async (t) => {
  const fake = aSpawn();
  const base = await aDeck(t, fake);
  const { worktree, repo } = aCheckout(t);
  const pressed = aGate2({ worktree, repo });
  const elsewhere = aCheckout(t, 'elsewhere');
  const other = aGate2(elsewhere);
  const landed = aGate2(aCheckout(t, 'landed'));
  beginLanding(pressed.id, { worktree });
  beginLanding(other.id, { worktree: elsewhere.worktree });
  settleLanding(landed.id, { ok: true, sha: '1a2b3c4', line: 'landed feat/x on pilot at 1a2b3c4' });

  interruptLandings();
  for (const gate of [pressed, other]) {
    assert.equal(reread(gate.id).landing.state, 'refused');
    assert.equal(reread(gate.id).landing.line, LANDING_INTERRUPTED);
    assert.equal(deckLines(gate.id).at(-1), LANDING_INTERRUPTED);
  }
  assert.equal(reread(landed.id).landing.state, 'landed', 'a settled landing is left alone');
  assert.equal(deckLines(landed.id).length, 1);

  assert.match(await signOff(base, pressed), /did not land; the lander lands it again/);
  assert.equal(deckLines(pressed.id).at(-1), LANDING_INTERRUPTED);
  assert.equal(fake.children.length, 0);
});

test('a landing past 30 minutes is killed by its handle and settles NOT landed: timed out after 30 min', (t) => {
  tempDeck(t);
  const fake = aSpawn();
  const timers = [];
  const killed = [];
  const clock = { setTimeout: (fire, ms) => timers.push({ fire, ms }), clearTimeout: () => {} };
  const gate = aGate2(aCheckout(t));

  startLanding(gate.id, { spawn: fake.spawn, env: {}, clock, kill: (child) => killed.push(child) });
  assert.equal(LANDING_TIMEOUT_MS, 30 * 60_000);
  assert.deepEqual(timers.map(({ ms }) => ms), [LANDING_TIMEOUT_MS]);
  assert.equal(reread(gate.id).landing.state, 'running');

  timers[0].fire();
  assert.deepEqual(killed, [fake.children[0]], 'the held child, by its handle');
  assert.equal(reread(gate.id).landing.state, 'refused');
  assert.equal(deckLines(gate.id).at(-1), 'NOT landed: timed out after 30 min');

  fake.exit(null);
  assert.equal(deckLines(gate.id).at(-1), 'NOT landed: timed out after 30 min', 'the killed child settles nothing more');
});

test('the page offers no Sign off after NOT landed or an interrupted landing, nor while running or landed', (t) => {
  tempDeck(t);
  const fake = aSpawn();
  const { repo, worktree } = aCheckout(t);
  const offered = (gate) => /<button type="submit" name="choice" value="Sign off"(?![^>]*disabled)/.test(renderThreadPage(reread(gate.id), listItems()));
  // The Sign off as the press stores it, so the row reads it as sent.
  const signed = (gate) => (addReply(gate.id, SIGN_OFF), gate);

  const notLanded = signed(aGate2({ repo, worktree }));
  startLanding(notLanded.id, { spawn: fake.spawn, env: {} });
  assert.equal(offered(notLanded), false, 'running');
  fake.exit(1, 'NOT landed: npm test failed\n');
  assert.equal(offered(notLanded), false, 'NOT landed');

  const landed = signed(aGate2({ repo, worktree }));
  startLanding(landed.id, { spawn: fake.spawn, env: {} });
  fake.exit(0, 'landed feat/x on pilot at 1a2b3c4\n');
  assert.equal(offered(landed), false, 'landed');

  const orphan = signed(aGate2({ repo, worktree }));
  beginLanding(orphan.id, { worktree });
  interruptLandings();
  assert.equal(offered(orphan), false, 'a landing the restart interrupted');
});
