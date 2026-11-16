/**
 * deck-writes-github S6 (spec 1, 3, 4, 5, 8): the deck is the one GitHub writer, so a
 * crew prompt that asks for a GitHub write, a default-branch integrate or a
 * `cd … && pilot integrate` call fails the corpus check. The slice PR's own create stays.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkReferences } from '../check-references.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A scratch package: the real dispatcher and tool list, plus one planted skill. */
function scratch(t, ...body) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'references-writes-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const rel of ['bin/pilot.mjs', 'deck/tools.mjs']) {
    fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), path.join(root, rel));
  }
  fs.mkdirSync(path.join(root, 'skills/s'), { recursive: true });
  fs.writeFileSync(path.join(root, 'skills/s/SKILL.md'), ['# S', '', ...body].join('\n'));
  return root;
}

test('a prompt naming gh pr edit --base fails', (t) => {
  // lint: forbidden pattern, a crew-side PR edit
  const root = scratch(t, 'Then run `gh pr edit 4 --base pilot`.');

  const { failures } = checkReferences(root, ['skills']);

  assert.equal(failures.length, 1);
  assert.match(failures[0], /^skills\/s\/SKILL\.md:3: "gh pr edit"/);
});

test('a prompt naming pilot integrate --default fails', (t) => {
  // lint: forbidden pattern, integrating onto the default branch
  const root = scratch(t, 'Run `pilot integrate --default` when it lands.');

  const { failures } = checkReferences(root, ['skills']);

  assert.equal(failures.length, 1);
  assert.match(failures[0], /^skills\/s\/SKILL\.md:3: "pilot integrate --default"/);
});

test('cd && pilot integrate fails', (t) => {
  // lint: forbidden pattern, a compound cd call auto mode refuses
  const root = scratch(t, 'Run `cd "<wt>" && pilot integrate` from the worktree.');

  const { failures } = checkReferences(root, ['skills']);

  assert.equal(failures.length, 1);
  assert.match(failures[0], /^skills\/s\/SKILL\.md:3: "&& pilot integrate"/);
});

test("the slice PR's create passes", (t) => {
  const root = scratch(t, 'Open it with `gh pr create --draft --base feat/<slug> --head slice/x`.');

  const { failures } = checkReferences(root, ['skills']);

  assert.deepEqual(failures, []);
});

test('the shipped tree is clean', () => {
  const { failures } = checkReferences(ROOT);

  assert.deepEqual(failures, []);
});
