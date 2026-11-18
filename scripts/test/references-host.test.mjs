/**
 * other-host S11 (spec 5): a pilot crew prompt names no host command, so the crew runs on
 * a host other than GitHub; the vendored reviewers keep their upstream text.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkReferences } from '../check-references.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOST = /names a host command/;

/** A scratch package: the real dispatcher and tool list, plus one planted agent. */
function scratch(t, name, ...body) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'references-host-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const rel of ['bin/pilot.mjs', 'deck/tools.mjs']) {
    fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), path.join(root, rel));
  }
  fs.mkdirSync(path.join(root, 'agents'), { recursive: true });
  fs.writeFileSync(path.join(root, 'agents', name), ['# A', '', ...body].join('\n'));
  return root;
}

test('the tree is clean', () => {
  const { failures } = checkReferences(ROOT, ['agents']);

  assert.deepEqual(failures.filter((failure) => /: "(?:gh|glab)\b/.test(failure)), []);
});

test('a crew prompt naming gh is refused', (t) => {
  // lint: forbidden pattern, a host command in a crew prompt
  const root = scratch(t, 'pilot-x.md', 'Read it with `gh pr view 4`.');

  const { failures } = checkReferences(root, ['agents']);

  assert.equal(failures.length, 1);
  assert.match(failures[0], /^agents\/pilot-x\.md:3: "gh pr"/);
  assert.match(failures[0], HOST);
});

test('vendored files stay', (t) => {
  const root = scratch(t, 'react-reviewer.md', 'Read it with `gh pr view 4`.');

  const { failures } = checkReferences(root, ['agents']);

  assert.deepEqual(failures, []);
});
