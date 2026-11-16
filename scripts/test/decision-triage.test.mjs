// fundamentalist-decisions S2 (spec 6, 7; L4-L6, A1): step 7 hands the fundamentalist the
// artefact's path, records a decision finding as a findings line id first, and asks the user about
// every kept one that moves a decision; the co-pilot sends that question to `main` always, without
// waiting on it. Wording pins, scoped to the two sections, whitespace flattened.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { read, flat } from './lib/area-file.mjs';

function section(rel, heading, next) {
  const text = read(rel);
  const start = text.indexOf(heading);
  assert.ok(start >= 0, `${rel} must carry ${heading}`);
  const end = text.indexOf(next, start + heading.length);
  return flat(text.slice(start, end < 0 ? undefined : end));
}

const step7 = () => section('agents/pilot.md', '### 7. Feature-level principles review and fix round, once, AFK', '\n### 8.');
const toMain = () => section('agents/pilot-co-pilot.md', '## What goes to main', '\n## ');

test('step 7 passes the artefact path', () => {
  const step = step7();
  assert.match(step, /the artefact's path/, "step 7's brief names the artefact's path (L4)");
});

test('a decision finding is a findings line with its id', () => {
  const step = step7();
  assert.match(step, /`kept: <id> <verdict> — /, 'a kept decision finding is a findings line, id first (L5)');
  assert.match(step, /`dropped: <id> <verdict> — <reason>`/, 'a dropped one carries its id, verdict and reason');
  assert.match(step, /needed row gets no line/, 'a needed row is recorded by no line');
});

test('a decision-moving finding is asked, never dropped for moving', () => {
  const step = step7();
  assert.match(step, /moves a decision[^.]*is a question for the user/, 'every kept decision-moving finding is asked (L6)');
  assert.match(step, /never dropped for moving one/, 'moving a decision is no reason to drop it');
});

test('the co-pilot always sends it to main and the run goes on', () => {
  const body = toMain();
  assert.match(body, /moves a decision goes to `main` always/, 'the cost bar does not apply to it (L6)');
  assert.match(body, /the run does not wait on it/, 'the run goes on beside the question (A1)');
});
