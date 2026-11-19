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
  assert.match(yieldPara, /`paused`[^.]*`deck_ticket release`/, '`release` follows the `paused` hand-back');
  assert.doesNotMatch(yieldPara, /Paused <id>/, 'no lane is taken on a `Paused` line before the drain');
});

test('the pilot decides on drift', () => {
  const drift = paragraphs('agents/pilot.md').find((p) => p.startsWith('**Drift**'));
  assert.ok(drift, 'pilot.md has a **Drift** paragraph');
  assert.match(drift, /Drift after this landing/, "it reads S1's gate2 line");
  assert.match(drift, /git merge/, 'the plan goes on pilot by a merge');
  assert.match(drift, /deck_ticket replan/, 'then a replan, with no press');
  assert.match(drift, /deck_ticket recut/, 'a refused replan is a re-cut');
  assert.match(drift, /pilot-architect/, 'handed to the architect');
  assert.doesNotMatch(read('agents/pilot.md'), /Re-cut by this landing/, 'the old sweep line is read nowhere');
});

test('the co-pilot merges first', () => {
  const drift = paragraphs('agents/pilot-co-pilot.md').find((p) => p.startsWith('**Drift**'));
  assert.ok(drift, 'pilot-co-pilot.md has a **Drift** paragraph');
  assert.match(drift, /drift:/, 'read off `drift:` in its grant');
  assert.match(drift, /git merge/, 'it merges pilot into feat/<slug>');
  assert.match(drift, /`main`/, 'and reports to main');
  assert.doesNotMatch(drift, /--force/, 'never a force-push');
});

test('the architect keeps locked decisions and replans', () => {
  const section = /## Re-cut (.*?)(?: ## |$)/.exec(read('agents/pilot-architect.md'))?.[1];
  assert.ok(section, 'pilot-architect.md has a ## Re-cut section');
  assert.match(section, /deck_ticket replan/, 'an unchanged plan goes back through `deck_ticket replan`');
  assert.match(section, /Changed since/, 'a changed plan takes a gate1 naming what changed');
  assert.match(section, /re-post no locked/i, 'a locked decision is not asked again');
});

test('no force-push on a pushed plan', () => {
  const architect = read('agents/pilot-architect.md');
  const section = /## Re-cut (.*?)(?: ## |$)/.exec(architect)?.[1];
  assert.match(section, /git merge <remote>\/pilot/, 'a re-cut puts the pushed branch on pilot by a merge');
  assert.doesNotMatch(section, /git rebase/, 'not by a rebase, which needs a force-push');
  const where = /## Where you work (.*?)(?: ## |$)/.exec(architect)?.[1];
  assert.match(where, /pushed/, 'once the branch is pushed');
  assert.match(where, /git merge <remote>\/<base>/, 'it takes its base by a merge');
});

test('the co-pilot drains every slice', () => {
  const pause = paragraphs('agents/pilot-co-pilot.md').find((p) => p.includes('sends you the pause'));
  assert.ok(pause, 'pilot-co-pilot.md has the pause paragraph');
  assert.match(pause, /every live/, 'the pause waits on every live child');
  assert.doesNotMatch(pause, /the slice in flight/, 'not only the one slice in flight');
});

test('pins hold', async () => {
  const shares = pinned(await measure({ root: ROOT }), pinsOf(ROOT));
  for (const name of ['pilot', 'pilot-architect']) {
    const share = shares.find((r) => r.agent === name);
    assert.ok(share?.pin, `${name} has a pin`);
    assert.ok(share.headroom >= 0, `${name}: own share ${share.own} over its pin ${share.pin}`);
  }
});
