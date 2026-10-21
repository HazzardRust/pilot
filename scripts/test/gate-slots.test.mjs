/**
 * A third gate waits for a slot (process-gc spec 5, S6; L8, L15). At most two gates hold a
 * gate slot at once, machine-wide; a third says once whose it waits on and starts when one
 * frees, a dead holder's slot is taken over, and a gate inside a gate takes no second slot.
 */

import './lib/fake-home.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { takeSlot, GATE_SLOTS } = await import('../gate-slots.mjs');
const { runTests } = await import('../integrate.mjs');

function scratch(t, name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `pilot-gate-slots-${name}-`));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const never = () => assert.fail('took the slot without waiting, so it must never sleep');
const files = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir) : []);

test('two holders, the third waits and says so', (t) => {
  const dir = scratch(t, 'locks');
  const env = {};
  const alive = () => true;
  const first = takeSlot({ dir, cwd: 'C:/repo/a', env, alive, sleep: never });
  const second = takeSlot({ dir, cwd: 'C:/repo/b', env, alive, sleep: never });
  assert.equal(GATE_SLOTS, 2);
  assert.deepEqual([first.slot, second.slot, first.waited, second.waited], [0, 1, false, false]);

  const said = [];
  let sleeps = 0;
  const sleep = (ms) => {
    assert.ok(ms > 0, 'it sleeps between looks, never spins');
    if (++sleeps === 2) first.release();
  };
  const third = takeSlot({ dir, cwd: 'C:/repo/c', env, alive, sleep, say: (line) => said.push(line) });

  assert.deepEqual(said, [`gate: waiting for a slot: pid ${process.pid} in C:/repo/a, pid ${process.pid} in C:/repo/b`], 'once, naming both holders');
  assert.equal(sleeps, 2);
  assert.deepEqual([third.slot, third.waited], [0, true], 'the freed slot');
  second.release();
  third.release();
  assert.deepEqual(files(dir), [], 'a released slot leaves nothing behind');
});

test("a dead holder's slot is taken over", (t) => {
  const dir = scratch(t, 'locks');
  const dead = 999_999_991;
  fs.writeFileSync(path.join(dir, 'slot-0.json'), JSON.stringify({ pid: dead, dir: 'C:/gone', since: '2026-10-12T00:00:00.000Z' }));
  fs.writeFileSync(path.join(dir, 'slot-1.json'), JSON.stringify({ pid: process.pid, dir: 'C:/live', since: new Date().toISOString() }));

  const said = [];
  const slot = takeSlot({ dir, cwd: 'C:/repo/x', env: {}, alive: (pid) => pid !== dead, sleep: never, say: (line) => said.push(line) });

  assert.deepEqual([slot.slot, slot.waited, said], [0, false, []], 'granted at once, with nothing to say');
  slot.release();
});

test("a release after a takeover leaves the new holder's slot", (t) => {
  const dir = scratch(t, 'locks');
  const old = takeSlot({ dir, cwd: 'C:/repo/old', env: {}, alive: () => true, sleep: never });
  const file = path.join(dir, `slot-${old.slot}.json`);
  fs.writeFileSync(file, JSON.stringify({ pid: process.pid, dir: 'C:/repo/new', since: new Date().toISOString() }));
  old.release();
  assert.deepEqual(files(dir), [`slot-${old.slot}.json`]);
});

const aged = (file) => fs.utimesSync(file, new Date(Date.now() - 20_000), new Date(Date.now() - 20_000));

test('a stale takeover lock is removed, then the dead slot taken', (t) => {
  const dir = scratch(t, 'locks');
  fs.writeFileSync(path.join(dir, 'slot-0.json'), JSON.stringify({ pid: 999_999_991, dir: 'C:/gone', since: '2026-10-12T00:00:00.000Z' }));
  fs.mkdirSync(path.join(dir, 'slot-0.json.takeover'));
  aged(path.join(dir, 'slot-0.json.takeover'));
  let sleeps = 0;
  const sleep = () => assert.ok(++sleeps < 3, 'the stale lock was never removed');
  const slot = takeSlot({ dir, slots: 1, cwd: 'C:/repo/x', env: {}, alive: () => false, sleep, say: () => {} });
  assert.deepEqual([slot.slot, files(dir)], [0, ['slot-0.json']]);
  slot.release();
});

test('an unreadable slot older than 10 s is taken over', (t) => {
  const dir = scratch(t, 'locks');
  fs.writeFileSync(path.join(dir, 'slot-0.json'), '{"pid": 4');
  aged(path.join(dir, 'slot-0.json'));
  const slot = takeSlot({ dir, slots: 1, cwd: 'C:/repo/x', env: {}, alive: () => true, sleep: never, say: never });
  assert.deepEqual([slot.slot, slot.waited], [0, false]);
  slot.release();
});

test('a gate inside a gate takes no slot', (t) => {
  const dir = path.join(scratch(t, 'locks'), 'slots');
  const slot = takeSlot({ dir, cwd: 'C:/repo/inner', env: { PILOT_GATE_SLOT: '1' }, alive: () => true, sleep: never, say: never });

  assert.equal(slot.waited, false);
  assert.deepEqual(files(dir), [], 'no file written');
  slot.release();
  assert.deepEqual(files(dir), []);

  const blank = takeSlot({ dir, cwd: 'C:/repo/outer', env: { PILOT_GATE_SLOT: '' }, alive: () => true, sleep: never });
  assert.deepEqual(files(dir), ['slot-0.json'], 'an empty PILOT_GATE_SLOT is no slot, so it takes one');
  blank.release();
});

test('runTests holds a slot while the suite runs', (t) => {
  const dir = path.join(scratch(t, 'locks'), 'slots');
  const home = scratch(t, 'home');
  const cwd = scratch(t, 'cwd');
  // Under `npm test` this process inherits the gate's slot (S7), so runTests would take none:
  // run it as a gate outside any gate would.
  const inherited = process.env.PILOT_GATE_SLOT;
  delete process.env.PILOT_GATE_SLOT;
  t.after(() => inherited !== undefined && (process.env.PILOT_GATE_SLOT = inherited));
  // The fake suite passes only while it sees a slot file naming its cwd and the slot in its env.
  const suite = path.join(scratch(t, 'suite'), 'suite.mjs');
  fs.writeFileSync(
    suite,
    [
      "import fs from 'node:fs';",
      "import path from 'node:path';",
      'const [dir, code] = process.argv.slice(2);',
      "const held = fs.readdirSync(dir).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));",
      'const ok = held.length === 1 && fs.realpathSync(held[0].dir) === fs.realpathSync(process.cwd()) && process.env.PILOT_GATE_SLOT !== undefined;',
      "console.log(ok ? 'held' : 'not held');",
      'process.exit(ok ? Number(code) : 9);',
    ].join('\n'),
  );

  const green = runTests(cwd, `node "${suite}" "${dir}" 0`, { label: 'slot-green', home, slots: { dir } });
  assert.equal(green.status, 0, 'the suite saw its slot');
  assert.deepEqual(files(dir), [], 'and it is gone after a green run');

  const red = runTests(cwd, `node "${suite}" "${dir}" 3`, { label: 'slot-red', home, slots: { dir } });
  assert.equal(red.status, 3, 'the suite saw its slot');
  assert.deepEqual(files(dir), [], 'and it is gone after a red run');
});
