// implementer-gate-steps S1: measure-prompt prints each agent's pinned share and its headroom.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ownShare, pinsOf, pinned, formatPinned } from '../measure-prompt.mjs';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'measure-prompt.mjs');

function fixtureRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'headroom-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'scripts', 'test'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'scripts', 'test', 'a.test.mjs'),
    "test('first', async () => {\n  const pilot = rows.find((row) => row.agent === 'pilot');\n  assert.ok(own <= 30, 'over');\n});\n\n" +
      "test('second', async () => {\n  const qa = rows.find((row) => row.agent === 'pilot-qa');\n  assert.ok(own <= 12.5);\n});\n\n" +
      "test('unrelated', async () => {\n  const x = rows.find((row) => row.agent === 'pilot-explorer');\n  assert.ok(true);\n});\n",
  );
  return root;
}

test('the own share is the unrounded figure a pin counts', () => {
  assert.equal(ownShare({ definition: 100, skills: 0, tools: 7 }), 26.75);
});

test('a pin is read off the test that names its agent', (t) => {
  const pins = pinsOf(fixtureRoot(t));
  assert.equal(pins.get('pilot'), 30);
  assert.equal(pins.get('pilot-qa'), 12.5);
  assert.equal(pins.has('pilot-explorer'), false);
});

test('headroom is the pin less the own share', () => {
  const rows = [
    { agent: 'pilot', definition: 100, skills: 0, tools: 7 },
    { agent: 'pilot-explorer', definition: 4, skills: 0, tools: 0 },
  ];
  const out = pinned(rows, new Map([['pilot', 30]]));
  assert.deepEqual(out[0], { agent: 'pilot', own: 26.75, pin: 30, headroom: 3.25 });
  assert.deepEqual(out[1], { agent: 'pilot-explorer', own: 1, pin: null, headroom: null });
  assert.match(formatPinned(out), /\| pilot-explorer \| 1 \| – \| – \|/);
});

test('the command prints the pinned table under the existing one', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'headroom-home-'));
  try {
    const text = execFileSync(process.execPath, [SCRIPT, '--home', home], { encoding: 'utf8' });
    assert.ok(text.indexOf('| Agent | Own share | Pin | Headroom |') > text.indexOf('| Agent | Definition |'));
    const rows = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--json', '--home', home], { encoding: 'utf8' }));
    assert.ok(rows.every((row) => !('pin' in row) && 'total' in row));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('the repository pins pilot, pilot-explorer and pilot-qa', () => {
  const root = path.resolve(path.dirname(SCRIPT), '..');
  const pins = pinsOf(root);
  for (const agent of ['pilot', 'pilot-explorer', 'pilot-qa']) assert.equal(typeof pins.get(agent), 'number', `${agent} has a pin test`);
});
