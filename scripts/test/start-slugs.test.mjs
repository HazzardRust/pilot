/**
 * `pilot start` shows the `slugs` row before it opens (two-devices S2, spec 4; A2, A4): a clash is printed and the
 * window still opens, with no exit code set. The deck view, git and Host are stubs and `openPilot` a recorder, so
 * nothing here reads the real deck, reaches a forge or starts a process.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { run } from '../../bin/pilot.mjs';

const view = { open: [{ id: 'itm_1', title: 't', state: 'red', body: 'docs/design/x/architecture.md' }], records: [] };
const hostFor = () => ({ cli: 'gh', reviews: (query) => (query.head === 'feat/x' ? [{ number: 12, state: 'open', head: 'feat/x' }] : []) });
const git = () => {
  throw new Error('no remote in this test');
};

test('start warns and opens', async (t) => {
  let stderr = '';
  t.mock.method(process.stderr, 'write', (chunk) => {
    stderr += chunk;
    return true;
  });
  t.mock.method(console, 'log', () => {});
  const opened = [];
  const openPilot = (cwd) => {
    opened.push(cwd);
    return { on() {} };
  };
  const before = process.exitCode;
  process.exitCode = undefined;
  let after;
  try {
    await run(['start'], { platform: 'win32', reach: { level: 'nothing', chosen: true }, readView: async () => view, git, hostFor, openPilot });
    after = process.exitCode;
  } finally {
    process.exitCode = before;
    t.mock.restoreAll();
  }

  assert.match(stderr, /^fail {2}slugs: /m, 'the row line is printed');
  assert.match(stderr, /PR #12/, 'its step names the PR');
  assert.equal(opened.length, 1, 'the window still opens, once');
  assert.equal(after, undefined, 'a clash sets no exit code (A4)');
});
