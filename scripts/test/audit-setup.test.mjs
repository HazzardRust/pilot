/** S2 of housekeeping-audit: the setup-and-preview area file, pinned in its prose. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { read, sectionOf, flat } from './lib/area-file.mjs';

const AREA_FILE = 'skills/audit/areas/setup.md';

/** Measure's numbered items, in order, each flattened to one line: item 1 is `itemsOf(source)[0]`. */
const itemsOf = (source) =>
  sectionOf(source, 'Measure')
    .split(/\n(?=\d+\. \*\*)/)
    .filter((part) => /^\d+\. \*\*/.test(part.trim()))
    .map(flat);

const setup = () => read(AREA_FILE);

test('the setup area times the install and the steps to a first green test in the scratch worktree', () => {
  const source = setup();
  assert.match(flat(sectionOf(source, 'Measure')), /scratch worktree/i);

  const items = itemsOf(source);
  const install = items.find((item) => /^1\. \*\*install\*\*/.test(item));
  assert.ok(install, 'item 1 is install');
  assert.match(install, /under 600 s/i, 'the install is timed, anchored to item 1 itself');

  const stepsToGreen = items.find((item) => /^2\. \*\*steps-to-green\*\*/.test(item));
  assert.ok(stepsToGreen, 'item 2 is steps-to-green');
  assert.match(stepsToGreen, /fresh scratch[^.]*(count|counted)/i, 'steps to a first green test are counted');
  assert.match(stepsToGreen, /first (passing|green) test/i);
});

test('env vars are reported by name, never value', () => {
  const measure = flat(sectionOf(setup(), 'Measure'));
  assert.match(measure, /env var/i);
  assert.match(measure, /by name/i);
  assert.match(measure, /value[\s\S]{0,40}never|never[\s\S]{0,40}value/i, 'a sentence, not only the word "value"');
});

test('services are detected and never started', () => {
  const measure = flat(sectionOf(setup(), 'Measure'));
  assert.match(measure, /service/i);
  assert.match(measure, /detected/i);
  assert.match(measure, /never start/i);
});

test('the preview runs under a timeout and is stopped, and the row names the URL or the timeout', () => {
  const measure = flat(sectionOf(setup(), 'Measure'));
  assert.match(measure, /preview/i);
  assert.match(measure, /scratch worktree only/i, 'the preview never starts outside the scratch worktree');
  assert.match(measure, /timeout/i);
  assert.match(measure, /stop/i);
  assert.match(measure, /URL[^.]*or[^.]*timeout/i, 'the row names the URL it answered on, or the timeout');
});

test('the audit never seeds or migrates any database: only --help or dry-run forms are run', () => {
  const measure = flat(sectionOf(setup(), 'Measure'));
  assert.match(measure, /seed/i);
  assert.match(measure, /never (be )?seed(s|ed)? or migrat(e|es|ed)/i);
  assert.match(measure, /--help|dry-run/i);
});

test('Rows gives one worked example per kind measured', () => {
  const rows = flat(sectionOf(setup(), 'Rows'));
  for (const kind of ['install', 'steps-to-green', 'env var', 'service', 'preview', 'seed']) {
    assert.match(rows, new RegExp(kind, 'i'), `Rows has a worked example for ${kind}`);
  }
});

