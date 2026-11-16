/**
 * suite-at-landing S8 (spec 6; L2, L4): lint that the crew's gate steps never run the
 * full suite; it is the landing's. The wording of the selection command and the landing
 * sentence is not pinned.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { read, sectionOf } from './lib/area-file.mjs';

const FOUR = ['pilot-implementer', 'pilot-co-pilot', 'pilot-qa', 'pilot-lander'];
const prompt = (name) => read(`agents/${name}.md`);

/** The sections that hold each agent's gate steps; the co-pilot's whole prompt runs none. */
const GATES = {
  'pilot-implementer': ['The loop', 'A fix brief'],
  'pilot-co-pilot': null,
  'pilot-qa': ['The read-only pass'],
  'pilot-lander': ['Resolve', 'Never mid-merge'],
};

test('no crew gate runs the full suite', () => {
  for (const name of FOUR) {
    const text = prompt(name);
    const steps = GATES[name] ? GATES[name].map((heading) => {
      const body = sectionOf(text, heading);
      assert.ok(body, `agents/${name}.md lost its ## ${heading} heading`);
      return body;
    }) : [text];
    for (const body of steps) {
      // lint: a crew gate step never runs the full `npm test`; the selection is `test:changed`
      assert.doesNotMatch(body, /\bnpm (?:run )?test\b(?!:)/,`agents/${name}.md runs \`npm test\` in a gate step`);
    }
  }
});
