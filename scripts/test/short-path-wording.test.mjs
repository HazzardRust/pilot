// short-path S4 (spec 1, 2, 5, 6; L5, A2, A3): the pilot's definition runs a signed plan of 2 slices or fewer
// itself. `## Yellow` names the short path, the four agents it skips, that an added slice keeps it short and that the
// full suite runs once at the landing; Gate 1's post names `surface`; step 9 names the gate2's evidence; ADR 0168
// records it. A move of these phrases to another heading fails the pins on purpose.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const flat = (text) => text.replace(/\s+/g, ' ');
const ADR = 'docs/adr/0168-a-small-ticket-takes-the-short-path.md';

/** The text under one heading of agents/pilot.md, up to the next heading of the same or a higher level. */
function section(heading) {
  const text = read('agents/pilot.md');
  const start = text.indexOf(`\n${heading}\n`);
  assert.ok(start >= 0, `agents/pilot.md lost its heading ${heading}`);
  const rest = text.slice(start + heading.length + 2);
  const next = rest.search(new RegExp(`\n#{1,${heading.match(/^#+/)[0].length}} `));
  return flat(next < 0 ? rest : rest.slice(0, next));
}

const includesAll = (text, where, phrases) => {
  for (const phrase of phrases) assert.ok(text.includes(phrase), `${where} does not name "${phrase}"`);
};

test('the yellow lane names the short path', () => {
  const yellow = section('## Yellow');
  includesAll(yellow, '## Yellow', ['Short path', '2 slices or fewer', 'pilot-implementer', 'added slice keeps it short']);
  const skipped = ['pilot-co-pilot', 'pilot-fundamentalist', 'pilot-evidence-runner', 'pilot-qa'];
  const clauses = yellow.match(/\bno [^;.]*/g) ?? [];
  assert.ok(clauses.some((clause) => skipped.every((agent) => clause.includes(agent))),
    `## Yellow has no "no" clause naming all of ${skipped.join(', ')}`);
});

test('gate 2 names the short-path evidence', () => {
  includesAll(section('### 9. Gate 2 and ready'), '### 9. Gate 2 and ready', ['Verdict:', 'Gate:', 'surface']);
  includesAll(section('### 3. Grilling, with the user'), '### 3. Grilling, with the user', ['`surface`']);
});

test('the landing is the referee', () => {
  includesAll(section('## Yellow'), '## Yellow', ['full suite runs once, at the landing']);
  assert.ok(fs.existsSync(path.join(ROOT, ADR)), `${ADR} does not exist`);
});
