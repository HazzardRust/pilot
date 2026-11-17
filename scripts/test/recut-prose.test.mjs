/**
 * The re-cut and the drain in the crew's prose (never-stuck S6, spec 16; L2-L7).
 * One-line pins: each names a deck verb or line the agent acts on, never a sentence's wording.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { measure, pinned, pinsOf } from '../measure-prompt.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Normalised to one line: git checks these out with CRLF on Windows. */
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\s+/g, ' ');

/** The paragraphs of a definition, each on one line. */
const paragraphs = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').split(/\r?\n\s*\r?\n/).map((p) => p.replace(/\s+/g, ' '));

test("the pilot's yield drains", () => {
  const yieldPara = paragraphs('agents/pilot.md').find((p) => p.startsWith('**Yield**'));
  assert.ok(yieldPara, 'pilot.md has a **Yield** paragraph');
  assert.match(yieldPara, /Yielding/, 'the yield is read off the deck line `Yielding <id>`');
  assert.match(yieldPara, /paused`? hand-back[^.]*`?release/, '`release` follows the paused hand-back');
  assert.doesNotMatch(yieldPara, /Paused <id>/, 'no lane is taken on a `Paused` line before the drain');
});

test('the pilot spawns an architect on re-cut', () => {
  const recut = paragraphs('agents/pilot.md').find((p) => p.includes('Re-cut check due'));
  assert.ok(recut, 'pilot.md reads the `Re-cut check due` line');
  assert.match(recut, /pilot-architect/, 'the same paragraph spawns the architect');
});

test('the architect keeps locked decisions and replans', () => {
  const architect = read('agents/pilot-architect.md');
  assert.match(architect, /replan/, 'an unchanged plan goes back through `deck_ticket replan`');
  assert.match(architect, /Changed since/, 'a changed plan takes a gate1 naming what changed');
  assert.match(architect, /re-post no locked/i, 'a locked decision is not asked again');
});

test('the co-pilot drains every slice', () => {
  const coPilot = read('agents/pilot-co-pilot.md');
  assert.match(coPilot, /every live/, 'the pause waits on every live child');
  assert.doesNotMatch(coPilot, /the slice in flight/, 'not only the one slice in flight');
});

test('pins hold', async () => {
  const shares = pinned(await measure({ root: ROOT }), pinsOf(ROOT));
  for (const name of ['pilot', 'pilot-architect']) {
    const share = shares.find((r) => r.agent === name);
    assert.ok(share?.pin, `${name} has a pin`);
    assert.ok(share.headroom >= 0, `${name}: own share ${share.own} over its pin ${share.pin}`);
  }
});
