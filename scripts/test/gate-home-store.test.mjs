/**
 * home-store-guard S1 (spec 2, 3, 4; L1-L3): `runGate` given `homeStore` stats it before the suite and
 * after the census; a changed stat with no live deck is red and named, a live deck's write only names it,
 * and an unchanged store adds nothing and never probes the deck. The store is a temp file and `spawn`
 * is injected to touch, create or delete it, so no suite starts and the real home store is never read.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { runGate } = await import('../gate.mjs');

const slot = () => ({ slot: 1, waited: false, release: () => {} });

/** A fresh temp dir holding `deck.json` (planted when `present`), removed when the test ends. */
function store(t, present) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-home-store-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'deck.json');
  if (present) {
    fs.writeFileSync(file, '{"items":[]}');
    const past = new Date(Date.now() - 60_000);
    fs.utimesSync(file, past, past);
  }
  return { dir, file };
}

/** Runs `runGate` with `suite` as the suite and stdout captured; `deckPid` counts its calls. */
function gate(t, options) {
  const { cwd, homeStore, suite = () => {}, status = 0 } = options;
  // `pid: undefined` is the probe that cannot tell, so only an absent `pid` means no deck.
  const pid = 'pid' in options ? options.pid : null;
  const written = [];
  let probes = 0;
  const write = t.mock.method(process.stdout, 'write', (chunk) => written.push(String(chunk)) > 0);
  try {
    const code = runGate([], {
      cwd,
      slot,
      read: () => [],
      spawn: () => {
        suite();
        return { status };
      },
      homeStore,
      deckPid: () => {
        probes++;
        return pid;
      },
    });
    return { code, out: written.join(''), probes };
  } finally {
    write.mock.restore();
  }
}

const homeLines = (out) => out.split('\n').filter((line) => line.startsWith('home store'));

test('a touched store is red', (t) => {
  const { dir, file } = store(t, true);
  const { code, out } = gate(t, { cwd: dir, homeStore: file, suite: () => fs.utimesSync(file, new Date(), new Date()) });
  assert.equal(code, 1);
  assert.deepEqual(homeLines(out), [`home store changed: ${file}`]);
});

test('created or deleted is red, absent both ends is green', (t) => {
  const created = store(t, false);
  assert.equal(gate(t, { cwd: created.dir, homeStore: created.file, suite: () => fs.writeFileSync(created.file, '{}') }).code, 1);
  const deleted = store(t, true);
  assert.equal(gate(t, { cwd: deleted.dir, homeStore: deleted.file, suite: () => fs.rmSync(deleted.file) }).code, 1);
  const absent = store(t, false);
  const never = gate(t, { cwd: absent.dir, homeStore: absent.file });
  assert.equal(never.code, 0);
  assert.deepEqual(homeLines(never.out), []);
});

test("the live deck's write stays green", (t) => {
  const { dir, file } = store(t, true);
  // Each touch a second later than the last, so three runs in one millisecond still each see a change.
  let at = Date.now();
  const touch = () => fs.utimesSync(file, new Date((at += 1000)), new Date(at));
  const up = gate(t, { cwd: dir, homeStore: file, suite: touch, pid: 4242 });
  assert.equal(up.code, 0);
  assert.deepEqual(homeLines(up.out), [`home store changed: ${file}; live deck 4242 up`]);
  // The suite's own status is kept, red included.
  assert.equal(gate(t, { cwd: dir, homeStore: file, suite: touch, pid: 4242, status: 1 }).code, 1);
  const unknown = gate(t, { cwd: dir, homeStore: file, suite: touch, pid: undefined });
  assert.equal(unknown.code, 0);
  assert.deepEqual(homeLines(unknown.out), [`home store changed: ${file}; live deck unknown up`]);
});

test('an untouched store adds nothing', (t) => {
  const { dir, file } = store(t, true);
  const { code, out, probes } = gate(t, { cwd: dir, homeStore: file });
  assert.equal(code, 0);
  assert.deepEqual(homeLines(out), []);
  assert.equal(probes, 0);
});
