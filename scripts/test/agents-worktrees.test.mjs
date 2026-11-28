// Every worktree a crew agent makes is tagged to its run, and every removal it makes is the
// guarded command (prune-worktrees S6, spec 3, 5; L1, A1). Pinned on the real `agents/` and on
// fixture directories this test writes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SHELL_RULES, missingShellRules } from '../shell-rules.mjs';

const AGENTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'agents');

const ADD = /\bworktrees? add\b/;
const REMOVE = /\bgit worktree (?:remove|prune)\b|\bpilot worktrees remove\b/;
const BY_HAND = /\bRemove-Item\b|\brm -rf\b/;

/**
 * Each line of each `*.md` in `dir` that creates a worktree (`kind: 'add'`) or removes one
 * (`kind: 'remove'`): a git or pilot removal command, or a `Remove-Item` or `rm -rf` in a
 * paragraph that names a worktree.
 */
function agentWorktreeLines(dir) {
  const rows = [];
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.md')).sort()) {
    const agent = file.slice(0, -3);
    const paragraphs = fs.readFileSync(path.join(dir, file), 'utf8').split(/\r?\n\s*\r?\n/);
    for (const paragraph of paragraphs) {
      const onTree = /worktree/i.test(paragraph);
      for (const line of paragraph.split(/\r?\n/)) {
        if (ADD.test(line)) rows.push({ agent, line, kind: 'add' });
        else if (REMOVE.test(line) || (onTree && BY_HAND.test(line))) rows.push({ agent, line, kind: 'remove' });
      }
    }
  }
  return rows;
}

const tagged = (line) => /\bpilot worktrees add --run\b/.test(line);
const guarded = (line) => /\bpilot worktrees remove\b/.test(line) && !/\bgit worktree (?:remove|prune)\b|\bRemove-Item\b|\brm -rf\b/.test(line);

function fixture(t, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-worktrees-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text, 'utf8');
  return dir;
}

test('every creating line tags', () => {
  const adds = agentWorktreeLines(AGENTS).filter((row) => row.kind === 'add');
  assert.ok(adds.length >= 6, `the crew's creating lines are found (${adds.length})`);
  assert.deepEqual(adds.filter((row) => !tagged(row.line)), []);
});

test('no agent removes by hand', () => {
  const removes = agentWorktreeLines(AGENTS).filter((row) => row.kind === 'remove');
  assert.deepEqual(removes.filter((row) => !guarded(row.line)), []);
});

test('the shell rule holds everywhere', () => {
  assert.match(SHELL_RULES[0], /you create and remove with `pilot worktrees remove`\.$/);
  assert.deepEqual(missingShellRules(AGENTS), []);
});

test('the scan finds bare adds and hand removals, and passes a scratch dir', (t) => {
  const dir = fixture(t, {
    'a.md': [
      'Your worktree:',
      '',
      'git worktree add -b x <path> origin/main',
      'pilot worktrees add --run s -b y <path> origin/main',
      '',
      'Remove the worktree with `Remove-Item -Recurse` or `git worktree remove <path>`.',
      '',
      'When done, remove the scratch directory with `rm -rf -- "$S"`.',
      '',
      'Tear the tree down with `pilot worktrees remove <path>`.',
    ].join('\r\n'),
  });
  const rows = agentWorktreeLines(dir);
  assert.deepEqual(
    rows.map(({ kind, line }) => [kind, tagged(line) || guarded(line)]),
    [['add', false], ['add', true], ['remove', false], ['remove', true]],
  );
});
