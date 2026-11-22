/**
 * The glossary in the crew's prose (project-glossary S5, spec 1, 2, 9; L7, L11).
 * Pins name the command, the order and the writer, never a sentence's wording.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Normalised to one line: git checks these out with CRLF on Windows. */
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\s+/g, ' ');

/** The sentences of a definition that name the glossary. */
const glossarySentences = (rel) => read(rel).split(/(?<=[.;])\s+/).filter((s) => /glossary/i.test(s));

/** The `domain-modeling` row of the pilot's methodology table. */
const domainRow = () => /\| `domain-modeling` \|([^\n]*)/.exec(fs.readFileSync(path.join(ROOT, 'agents/pilot.md'), 'utf8'))?.[1];

test('the pilot looks the request up before grilling', () => {
  const row = domainRow();
  assert.ok(row, 'pilot.md has a `domain-modeling` row');
  assert.match(row, /glossary\.mjs match/, 'grilling runs `glossary.mjs match`');
  assert.match(row, /glossary\.mjs match[^|]*before the first question/, 'on the request, before the first question');
});

test('the architect writes lasting terms inline', () => {
  const architect = read('agents/pilot-architect.md');
  const before = /## Read before you design (.*?) ## /.exec(architect)?.[1];
  assert.ok(before, 'pilot-architect.md has a ## Read before you design section');
  assert.match(before, /glossary\.mjs match/, 'the request is looked up with `match`');
  const item = /4\. \*\*Ubiquitous language\*\*(.*?) 5\. \*\*/.exec(architect)?.[1];
  assert.ok(item, 'the artefact has item 4 Ubiquitous language');
  assert.match(item, /run-local/, 'item 4 holds run-local terms only');
  assert.match(item, /`GLOSSARY\.md`/, 'a lasting term goes to GLOSSARY.md');
  assert.match(item, /glossary-log\.mjs append/, 'logged with `append`');
  assert.match(item, /same commit/, 'in the commit that writes the term');
});

test('nobody batches terms after the press, nobody reads the whole file', () => {
  const writes = glossarySentences('agents/pilot.md').filter((s) => /\b(go(es)? to|writes?|wrote|written|adds?)\b/.test(s));
  assert.ok(writes.length > 0, 'pilot.md says who writes the glossary');
  for (const sentence of writes) assert.match(sentence, /architect/, `a glossary write the architect does not own: ${sentence}`);
  const gate1 = read('agents/pilot.md').match(/\*\*Gate 1\*\* is the user signing off(.*?)(?= At the \*every\* depth)/)?.[1];
  assert.ok(gate1, 'pilot.md has the Gate 1 paragraph');
  assert.match(gate1, /glossary[^.]*architect|architect[^.]*glossary/, 'the Gate 1 paragraph names the architect as the writer');
  for (const sentence of glossarySentences('agents/pilot.md')) {
    assert.doesNotMatch(sentence, /\b(whole|all of|entire)\b[^.]*GLOSSARY\.md|GLOSSARY\.md[^.]*\b(whole|in full)\b/i, `a whole-file read: ${sentence}`);
  }
});
