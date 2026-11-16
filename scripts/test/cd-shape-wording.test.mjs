/**
 * landing-keeps-worktrees S3 (spec 3, 4, 5; L5-L7): lint that no crew agent shows the
 * unsafe `cd <dir>;` shape, and that the measure-prompt pins move by their history lines.
 * The prose naming the safe shape is not pinned.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { read, flat } from './lib/area-file.mjs';

const CREW = [
  'pilot', 'pilot-co-pilot', 'pilot-implementer', 'pilot-qa', 'pilot-fundamentalist',
  'pilot-evidence-runner', 'pilot-architect', 'pilot-explorer', 'pilot-auditor', 'pilot-teacher',
];

test('no crew agent shows `cd <dir>;` as an example', () => {
  for (const agent of CREW) {
    const text = flat(read(`agents/${agent}.md`));
    const shown = [...text.matchAll(/cd <dir>\s*;/g)].filter((m) => !text.slice(0, m.index).endsWith('never `'));
    // lint: `cd <dir>;` appears only after "never `", never as a shape to copy
    assert.equal(shown.length, 0, `agents/${agent}.md shows \`cd <dir>;\` as an example`);
  }
});

test('the pins move by the wording', () => {
  const source = read('scripts/test/measure-prompt.test.mjs');
  const pins = {
    pilot: /own <= ([\d.]+), `pilot's own share/,
    explorer: /own <= ([\d.]+), `pilot-explorer's own share/,
  };
  for (const [who, pattern] of Object.entries(pins)) {
    const pin = pattern.exec(source);
    assert.ok(pin, `the ${who} pin assertion is missing`);
    // The pin's own history: the comment lines between the previous test and this pin's test.
    const head = source.slice(0, pin.index);
    const history = head.slice(head.lastIndexOf('\n});\n'), head.lastIndexOf('\ntest('));
    const lines = [...history.matchAll(/^\/\/ landing-keeps-worktrees S3 \(\d{4}-\d\d-\d\d\) raised it from ([\d.]+) to the measured ([\d.]+) .*, ([\d.]+)\.$/gm)];
    assert.equal(lines.length, 1, `the ${who} pin carries ${lines.length} landing-keeps-worktrees S3 history lines, not one`);
    const [line] = lines;
    const [from, to, cost] = line.slice(1, 4).map(Number);
    const previous = [...history.slice(0, line.index).matchAll(/^\/\/ [^\n]*to the measured ([\d.]+)/gm)].at(-1);
    assert.equal(from, Number(previous?.[1]), `the ${who} history line does not start from the previous line's measure`);
    assert.equal(Math.round((to - from) * 100) / 100, cost, `the ${who} history line names a cost that is not its difference`);
    const newest = [...history.matchAll(/^\/\/ [^\n]*to the measured ([\d.]+)/gm)].at(-1);
    assert.equal(Number(pin[1]), Number(newest?.[1]), `the ${who} pin is not the measured number its newest history line names`);
  }
});
