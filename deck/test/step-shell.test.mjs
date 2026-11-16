/**
 * Every command step names where it runs (walkthrough-surface spec 9, S6, A3): a wizard or report
 * stage whose command has no `dir` is refused naming the step, and a `shell` left out is filled
 * with the daemon's platform default and stored.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { KIND_WALKTHROUGH } from '../items.mjs';
import { listItems, postItem } from '../store.mjs';
import { defaultShell, stepShellGaps } from '../step-shell.mjs';
import { tempDeck } from '../testUtils.mjs';

const DIR = process.platform === 'win32' ? 'C:\\work' : '/work';

test('a command step with no dir is refused naming it', (t) => {
  const screens = ['Open the deck → the Tickets tab', 'Run `npm test` -> it passes'];
  assert.deepEqual(stepShellGaps(screens, {}), ['step 2 runs a command: name its directory as dir']);
  tempDeck(t);
  assert.throws(
    () => postItem({ kind: KIND_WALKTHROUGH, title: 'Try it', body: 'Run it.', author: 'pilot', screens }),
    /step 2 runs a command: name its directory as dir/,
  );
  assert.equal(listItems().length, 0, 'nothing is stored');
});

test('a prose stage needs neither', () => {
  assert.deepEqual(stepShellGaps(['Open the deck → the Tickets tab', 'Press Sign off'], {}), []);
});

test('Windows defaults to PowerShell', () => {
  assert.equal(defaultShell('win32', { SHELL: '/usr/bin/bash' }), 'PowerShell');
});

test('elsewhere the login shell', () => {
  assert.equal(defaultShell('darwin', { SHELL: '/bin/zsh' }), 'zsh');
  assert.equal(defaultShell('linux', {}), 'sh');
});

test('the default is stored', (t) => {
  tempDeck(t);
  postItem({ kind: KIND_WALKTHROUGH, title: 'Try it', body: 'Run it.', author: 'pilot', dir: DIR, screens: ['Run `npm test` -> it passes'] });
  const item = listItems().find((each) => each.kind === KIND_WALKTHROUGH);
  assert.equal(item.shell, defaultShell());
  assert.equal(item.dir, DIR);
});
