/**
 * suite-at-landing S8 (spec 6; L2, L4): the crew's gate steps run the selection, each from its
 * own ref, and the full suite is the landing's. Each pin is a phrase, never a paragraph, so a
 * reword that keeps the command and the landing sentence keeps both results.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { read, sectionOf, flat } from './lib/area-file.mjs';

const LANDING = 'the full suite runs once, at `pilot land`';
const FOUR = ['pilot-implementer', 'pilot-co-pilot', 'pilot-qa', 'pilot-lander'];
const prompt = (name) => read(`agents/${name}.md`);

/** Each crew gate's command with the ref its agent names. */
const COMMANDS = {
  'pilot-implementer': '`npm run test:changed -- --since=origin/feat/<slug>`',
  'pilot-qa': '`npm run test:changed -- --since=<run remote>/pilot`',
  'pilot-lander': '`npm run test:changed -- --since=HEAD^1`',
};

/** The sections that hold each agent's gate steps; the co-pilot's whole prompt runs none. */
const GATES = {
  'pilot-implementer': ['The loop', 'A fix brief'],
  'pilot-co-pilot': null,
  'pilot-qa': ['The read-only pass'],
  'pilot-lander': ['Resolve', 'Never mid-merge'],
};

test('each crew gate names test:changed', () => {
  for (const [name, command] of Object.entries(COMMANDS)) {
    const gate = flat(sectionOf(prompt(name), GATES[name][0]));
    assert.ok(gate.includes(command), `agents/${name}.md's ## ${GATES[name][0]} does not name ${command}`);
  }
  const fix = flat(sectionOf(prompt('pilot-implementer'), 'A fix brief'));
  assert.match(fix, /step 3's selection/, "the fix round does not run the phase gate's selection");
});

test('no crew gate runs the full suite', () => {
  for (const name of FOUR) {
    const text = prompt(name);
    assert.ok(flat(text).includes(LANDING), `agents/${name}.md does not say "${LANDING}"`);
    const steps = GATES[name] ? GATES[name].map((heading) => {
      const body = sectionOf(text, heading);
      assert.ok(body, `agents/${name}.md lost its ## ${heading} heading`);
      return body;
    }) : [text];
    for (const body of steps) {
      assert.doesNotMatch(body, /\bnpm (?:run )?test\b(?!:)/,`agents/${name}.md runs \`npm test\` in a gate step`);
    }
  }
});
