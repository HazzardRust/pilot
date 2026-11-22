/**
 * project-glossary S7 (spec 12, L10): lint that the fundamentalist's judgement pass runs the
 * terms command and checks the artefact's lasting terms, as one paragraph of that pass rather
 * than a pass of its own. The sentences around the command are not pinned.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { flat, read, sectionOf } from './lib/area-file.mjs';

const source = read('agents/pilot-fundamentalist.md');

test('the judgement pass runs glossary-diff.mjs and checks lasting terms', () => {
  const section = sectionOf(source, 'The judgement pass: principles');
  assert.ok(section, 'agents/pilot-fundamentalist.md has no "## The judgement pass: principles" section');
  const text = flat(section);
  // lint: the command is named with the plugin root, so it runs in any project's worktree
  assert.ok(text.includes('${CLAUDE_PLUGIN_ROOT}/scripts/glossary-diff.mjs'), 'the judgement pass never runs glossary-diff.mjs');
  assert.match(text, /lasting terms?/, 'the judgement pass never checks the artefact\'s lasting terms');
});

test('terms add no pass heading of their own', () => {
  const headings = source.match(/^## .*$/gm).filter((h) => /term|glossary/i.test(h));
  assert.deepEqual(headings, [], 'a heading names terms or the glossary');
});
