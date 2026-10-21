/**
 * Spec 1 of `docs/design/crew-voice-rules/architecture.md`, L2: the fundamentalist argues
 * against the design. Its report opens with the case against (the strongest argument
 * that the design is wrong, the design it would have built, what could go), and a
 * `clean` verdict names what it tried to break and why that held. A report that
 * confirms the design unless something fails is the shape this replaces.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { flat, read, sectionOf } from './lib/area-file.mjs';

const source = read('agents/pilot-fundamentalist.md');

const report = () => {
  const section = sectionOf(source, 'Report');
  assert.ok(section, 'agents/pilot-fundamentalist.md has no "## Report" section');
  return section;
};

test('the report opens with The case against', () => {
  const first = /^\s*\d+\.\s+(.*)$/m.exec(report());
  assert.ok(first, 'the Report section has no numbered items');
  assert.match(first[1], /^\*\*The case against\*\*/, 'the first numbered item is not "The case against"');
  const items = report().split(/\n\s*2\.\s/);
  assert.ok(items.length > 1, 'the Report section has no second numbered item to bound the first');
  const item = flat(items[0]);
  assert.match(item, /strongest argument that the design is wrong/, 'the case against never asks for the strongest argument');
  assert.match(item, /design you would have built/, 'the case against never asks for the design it would have built');
  assert.match(item, /what the feature could do without/, 'the case against never names what could go');
});

test('a clean verdict names what was attacked', () => {
  const sentences = flat(report()).split(/(?<=\.)\s/);
  assert.ok(
    sentences.some((s) => /\bclean\b/.test(s) && /attacked/.test(s) && /held because/.test(s)),
    'no sentence in the Report ties a clean verdict to what was attacked and why it held',
  );
});

test('the definition states the adversarial default', () => {
  assert.match(
    flat(source),
    /the design is wrong until the diff shows it is not/,
    'the definition never states the default that the design is wrong until the diff shows otherwise',
  );
  assert.match(
    flat(source),
    /agreeing with the artefact is not a finding and is not evidence/,
    'the definition never says agreement with the artefact is not evidence',
  );
});
