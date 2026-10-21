/**
 * S10 of three-lanes (spec 10, 11; L3, L9): the prose names the stages planning, implementing and
 * concluding, with the colours implied (ADR 0147), and ADR 0151 records the three lanes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { split } from '../measure-prompt.mjs';
import { frontmatterOf } from './lib/area-file.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');

/** The text under one heading, up to the next heading of the same or a higher level. */
function section(text, heading, file) {
  const level = heading.match(/^#+/)[0].length;
  const start = text.indexOf(`\n${heading}\n`);
  assert.ok(start >= 0, `${file} has no ${heading}`);
  const rest = text.slice(start + heading.length + 2);
  const next = rest.search(new RegExp(`\n#{1,${level}} `));
  return next < 0 ? rest : rest.slice(0, next);
}

/**
 * Each colour word left in the prose: front matter's `color:`, code spans, headings and a glossary
 * term's own line are names, not prose, and a list item's `- **red**: planning.` mapping prefix is the
 * colour beside its stage word; the rest of that line is prose and is read.
 */
function bareColours(text) {
  const { front, body } = split(text);
  return [...front.map((line) => line.replace(/^color: .*$/, '')), ...body.split('\n')]
    .filter((line) => !/^#+ /.test(line) && !/^\*\*[^*]+\*\*:$/.test(line))
    .map((line) => line.replace(/^- \*\*(red|yellow|green)\*\*: (planning|implementing|concluding)\./, ''))
    .map((line) => line.replace(/`[^`]*`/g, ''))
    .flatMap((line) => line.match(/\b(red|yellow|green)\b/gi) ?? []);
}

test('the pilot names three lanes', () => {
  const yellow = section(read('agents/pilot.md'), '## Yellow', 'agents/pilot.md');
  assert.match(yellow, /three lanes/);
  for (const lane of ['planning', 'concluding', 'co-pilot']) assert.match(yellow, new RegExp(`\`${lane}\``), `the ${lane} lane`);
  assert.match(yellow, /`nextTicketOf`/, 'each stage lane fills from its own queue');
  assert.doesNotMatch(yellow, /green then red|red then green/, 'spec 2: the cross-stage ordering goes');
});

test('no stage is called by a colour alone in the prose', () => {
  const pilot = read('agents/pilot.md');
  const legend = section(pilot, '## Legend', 'agents/pilot.md');
  assert.match(legend, /red \(planning/);
  assert.match(legend, /yellow \(implementing/);
  assert.match(legend, /green \(concluding/);
  assert.deepEqual(bareColours(pilot.replace(legend, '')), [], 'agents/pilot.md outside its Legend');
  assert.deepEqual(bareColours(read('agents/pilot-co-pilot.md')), [], 'agents/pilot-co-pilot.md');
  assert.deepEqual(bareColours(read('skills/ticket-making/SKILL.md')), [], 'skills/ticket-making/SKILL.md');
  const context = read('CONTEXT.md');
  const colourEntry = context.match(/\*\*Ticket state\*\*:\n(.*)\n/)[1];
  assert.match(colourEntry, /red is planning .* yellow is implementing .* green is concluding/, "ADR 0147's mapping stays");
  assert.deepEqual(bareColours(context.replace(colourEntry, '')), [], 'CONTEXT.md outside the colour entry');
  for (const term of ['Lane', 'Stage', 'Held lane']) assert.match(context, new RegExp(`^\\*\\*${term}\\*\\*:$`, 'm'), `CONTEXT names **${term}**`);
});

test('ADR 0151 is indexed', () => {
  const adr = read('docs/adr/0151-three-lanes.md');
  assert.match(frontmatterOf(adr), /^status: \w+\ndate: \d{4}-\d{2}-\d{2}\ntags: \[.+\]$/m);
  assert.match(adr, /^paths: \[.+\]$/m);
  assert.match(read('docs/adr/README.md'), /\| 0151 \| \[.+\]\(0151-three-lanes\.md\) \|/);
});
