/**
 * docs/OPERATING.md's `## Two devices, one repo` (two-devices S3, spec 1 and 3): a structural lint, never a
 * phrase pin (ADR 0180): the rule's numbered clauses are counted, every setup step carries a command, and
 * every `pilot <verb>` the section names is one `pilot help` lists.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { helpSubcommands } from './lib/help-subcommands.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const doc = fs.readFileSync(path.join(ROOT, 'docs', 'OPERATING.md'), 'utf8');

// The numbered items of a markdown block, each with its indented continuation lines joined.
function numbered(block) {
  const items = [];
  for (const line of block.split(/\r?\n/)) {
    const item = /^\d+\. (.*)$/.exec(line);
    if (item) items.push(item[1]);
    else if (items.length > 0 && /^ {2,}\S/.test(line)) items[items.length - 1] += ` ${line.trim()}`;
  }
  return items;
}

/**
 * The section's rules (the numbered items before its `###`), its setup steps (the numbered items under
 * `### Setting up a second device`) and every `pilot <verb>` it names in a code span. An absent section
 * gives three empty lists.
 */
function twoDevicesSection(text) {
  const section = text.split(/^## Two devices, one repo\s*$/m)[1]?.split(/^## /m)[0] ?? '';
  const [rulesPart, ...subsections] = section.split(/^### /m);
  const setup = subsections.find((s) => /^Setting up a second device\s*$/m.test(s.split(/\r?\n/)[0])) ?? '';
  return {
    rules: numbered(rulesPart),
    steps: numbered(setup),
    verbs: [...section.matchAll(/`pilot ([a-z][a-z0-9-]*)[^`]*`/g)].map((m) => m[1]),
  };
}

const { rules, steps, verbs } = twoDevicesSection(doc);

// lint: four numbered rules
test('the rule has four clauses', () => {
  assert.equal(rules.length, 4, `docs/OPERATING.md "## Two devices, one repo" has ${rules.length} numbered rules`);
});

// lint: setup steps
test('every setup step is a command', () => {
  assert.ok(steps.length >= 6, `"### Setting up a second device" has ${steps.length} numbered steps, fewer than 6`);
  for (const step of steps) assert.match(step, /`[^`]+`/, `a setup step names no command: ${step}`);
});

// lint: real verbs
test('every verb is real', () => {
  assert.ok(verbs.length > 0, 'the section names no `pilot <verb>`');
  const real = new Set([...helpSubcommands(), 'help']);
  for (const verb of new Set(verbs)) assert.ok(real.has(verb), `\`pilot help\` does not list \`pilot ${verb}\``);
});
