// The yellow co-pilot: what the pilot can spawn, the co-pilot's tools and permission mode, the
// states its steps move through, and the retired wording. Structure and forbidden-pattern lints
// only; what the prose says is not pinned here (ADR NNNN).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { frontmatterOf } from './lib/area-file.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CO_PILOT = path.join(ROOT, 'agents', 'pilot-co-pilot.md');

const read = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const field = (source, name) => frontmatterOf(source).match(new RegExp(`^${name}: (.*)$`, 'm'))?.[1] ?? '';
const pilot = () => read(path.join(ROOT, 'agents', 'pilot.md'));

/** A level-2 section of agents/pilot.md (or `source`), up to the next level-1 or level-2 heading, on one line. */
function section(heading, source = pilot()) {
  const marker = `\n## ${heading}\n`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `no "## ${heading}" heading`);
  const rest = source.slice(start + marker.length);
  const end = rest.search(/\n#{1,2} /);
  return (end === -1 ? rest : rest.slice(0, end)).replace(/\s+/g, ' ');
}

test('the pilot can spawn the co-pilot', () => {
  const spawnable = field(pilot(), 'tools').match(/Agent\(([^)]*)\)/)?.[1].split(',').map((entry) => entry.trim()) ?? [];
  assert.ok(spawnable.includes('pilot:pilot-co-pilot'), "pilot.md's Agent(...) list has no pilot:pilot-co-pilot");
  assert.ok(fs.existsSync(CO_PILOT), 'agents/pilot-co-pilot.md does not ship');
  assert.equal(field(read(CO_PILOT), 'name'), 'pilot-co-pilot');
});

test('the co-pilot has a tools field with deck_status and without deck_ticket', () => {
  const source = read(CO_PILOT);
  assert.ok(field(source, 'tools'), 'agents/pilot-co-pilot.md has no tools field');
  assert.doesNotMatch(field(source, 'tools'), /deck_ticket/, 'main calls deck_ticket, never the co-pilot'); // lint: the co-pilot never moves a ticket
  assert.match(field(source, 'tools'), /mcp__plugin_pilot_deck__deck_status/, 'the co-pilot writes its rows'); // lint: the tool the rows need is granted
});

test("the co-pilot's lane is dontAsk and its settings are not the whole grant", () => {
  const source = read(CO_PILOT);
  assert.equal(field(source, 'permissionMode'), 'dontAsk'); // lint: the permissionMode field
  assert.doesNotMatch(source.replace(/\s+/g, ' '), /the user's settings do not already allow|would prompt is refused/); // lint: retired permission wording
});

test('pilot.md has no Sub-deck section', () => {
  assert.doesNotMatch(pilot(), /^## Sub-deck$/m); // lint: the Sub-deck section stays gone
  assert.doesNotMatch(pilot(), /As sub-deck/);
});

test('a paused co-pilot never kills the slice in flight', () => {
  const flat = read(CO_PILOT).replace(/\s+/g, ' ');
  assert.doesNotMatch(flat, /TaskStop.{0,40}pause|pause.{0,40}TaskStop/, 'the pause never kills the slice'); // lint: no TaskStop next to pause
});

test('the co-pilot keeps its Hand-back section and no longer says never stop one', () => {
  const handBack = section('Hand-back', read(CO_PILOT)); // lint: the Hand-back heading exists
  assert.doesNotMatch(handBack, /never stop one/, 'the 90-minute bound replaced it'); // lint: the retired never-stop rule
});

test('the pilot never lists itself as its successor-spawner: a co-pilot spawns no co-pilot', () => {
  assert.doesNotMatch(field(read(CO_PILOT), 'tools'), /pilot:pilot-co-pilot/, 'a co-pilot never spawns its own successor'); // lint: tools field
});

test('ADR 0107 is indexed', () => {
  const index = read(path.join(ROOT, 'docs', 'adr', 'README.md'));
  assert.match(index, /\| 0107 \| \[[^\]]+\]\(0107-a-[a-z0-9-]+-pauses-itself-at-its-advisory-mark\.md\)/, 'L5');
});

test('the co-pilot moves a dot at each step', async () => {
  const { phaseOf } = await import('../../deck/status.mjs');
  const steps = section('Steps 4 to 8', read(CO_PILOT));
  const words = [...steps.matchAll(/`deck_status`[^.]*\./g)].flatMap(([sentence]) => [...sentence.matchAll(/`([a-z][^`]*)`/g)].map(([, word]) => word)).filter((word) => word !== 'deck_status');
  for (const state of ['implementing', 'pushed <sha7>', 'integrated', 'fixing', 'in QA']) {
    assert.ok(words.includes(state), `no \`${state}\` move in "Steps 4 to 8"`);
    assert.ok(phaseOf(state), `\`${state}\` is a state phaseOf does not know`);
  }
});

test("the co-pilot's description no longer says slice by slice", () => {
  assert.doesNotMatch(field(read(CO_PILOT), 'description'), /slice by slice/); // lint: retired wording
});

test('ADR 0108 is indexed', () => {
  const index = read(path.join(ROOT, 'docs', 'adr', 'README.md'));
  // By number, not slug: the file is renamed with the ADRs (co-pilot-tickets S8).
  const linked = index.match(/\| 0108 \| \[[^\]]+\]\((0108-[a-z0-9-]+-starts-slices-from-the-graph\.md)\)/);
  assert.ok(linked, 'L10');
  assert.ok(fs.existsSync(path.join(ROOT, 'docs', 'adr', linked[1])), 'L10: the ADR ships');
  assert.ok(index.indexOf('| 0108 |') > index.indexOf('| 0107 |'), 'after 0107');
});
