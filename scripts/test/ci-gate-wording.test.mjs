// ci-gate S7 (spec 2, 3, 4; L4, L10, L11): lint on the crew's definitions. Each agent that moves work runs
// `pilot checks … --wait` before the move and routes red; the commands and their order are pinned, not the wording.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// The body past the frontmatter: the description summarises the steps, out of their order.
const agent = (name) => fs.readFileSync(path.join(ROOT, 'agents', `${name}.md`), 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');
const CHECKS_WAIT = /`pilot checks <[^>`]+> --wait`/;

/** The paragraph or list item holding `index`: its lines up to a blank line or the next item's start. */
function blockAt(text, index) {
  const lines = text.split('\n');
  const isEdge = (line) => line.trim() === '' || /^\s*(?:\d+\.|-)\s/.test(line);
  let at = text.slice(0, index).split('\n').length - 1;
  let end = at + 1;
  while (at > 0 && !isEdge(lines[at]) && lines[at - 1].trim() !== '') at -= 1;
  while (end < lines.length && !isEdge(lines[end])) end += 1;
  return lines.slice(at, end).join('\n');
}

test('the lander waits on checks first', () => {
  const text = agent('pilot-lander');
  const at = text.search(CHECKS_WAIT);
  assert.ok(at >= 0, 'agents/pilot-lander.md names no `pilot checks <sha> --wait`');
  assert.ok(at < text.indexOf('`Land again`'), '`pilot checks` must come before the first `Land again`');
  assert.match(blockAt(text, at), /`main`/, 'the step running `pilot checks` sends red to `main`');
});

test('the co-pilot routes red', () => {
  const text = agent('pilot-co-pilot');
  const integrated = text.indexOf('`integrated …');
  const at = text.search(CHECKS_WAIT);
  assert.ok(integrated >= 0, 'agents/pilot-co-pilot.md lost its `integrated …` row state');
  assert.ok(at > integrated, '`pilot checks <sha7> --wait` must follow the `integrated …` row state');
  assert.match(blockAt(text, at), /`failed gate: /, 'red sets the row `failed gate: <line>`');
});

test('the pilot\'s short path reads checks after integrate', () => {
  const text = agent('pilot');
  const integrate = text.indexOf('`pilot integrate --dir');
  const at = text.search(CHECKS_WAIT);
  assert.ok(integrate >= 0 && at > integrate, 'agents/pilot.md runs `pilot checks <sha7> --wait` after `pilot integrate`');
});

test('QA posts the line', () => {
  const text = agent('pilot-qa');
  const at = text.search(CHECKS_WAIT);
  assert.ok(at >= 0, 'agents/pilot-qa.md names no `pilot checks <sha> --wait`');
  assert.match(blockAt(text, at), /`checks`/, 'the gate2 carries the printed line as its `checks` field');
});
