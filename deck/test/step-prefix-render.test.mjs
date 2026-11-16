/**
 * A command step names where it runs (walkthrough-surface spec 8, S5): on a walkthrough or a
 * report, the line above each command step reads `<shell> · <dir>`; a prose step has none.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

import { KIND_WALKTHROUGH } from '../items.mjs';
import { listItems } from '../store.mjs';
import { renderSteps } from '../ui/render-parts.mjs';
import { tempDeck } from '../testUtils.mjs';

const { callTool } = await import('../server.mjs');

test('a command step renders its prefix', () => {
  const html = renderSteps(['Run `npm test` -> it passes'], { shell: 'PowerShell', dir: 'C:\\x' });
  const prefix = html.indexOf('<span class="step where">PowerShell · C:\\x</span>');
  assert.ok(prefix !== -1, html);
  assert.ok(prefix < html.indexOf('npm test'), 'the prefix comes before the command');
});

test('a prose step renders no prefix', () => {
  const html = renderSteps(['Open the deck → the Tickets tab'], { shell: 'PowerShell', dir: 'C:\\x' });
  assert.doesNotMatch(html, /step where/);
});

test('a walkthrough keeps its shell', (t) => {
  tempDeck(t);
  const repo = path.join(os.tmpdir(), 'pilot-step-prefix-repo');
  callTool('deck_post', { kind: KIND_WALKTHROUGH, title: 'Try it', body: 'Run it.', repo, dir: repo, shell: 'Git Bash', screens: ['Run `npm test`'] });
  const item = listItems().find((each) => each.kind === KIND_WALKTHROUGH);
  assert.equal(item.shell, 'Git Bash');
});
