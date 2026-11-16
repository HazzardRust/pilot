/**
 * A command in another shell's syntax is refused (walkthrough-surface spec 10, S7): a step whose
 * code span is Git Bash under PowerShell, or PowerShell under a Unix shell, names the step and token.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { KIND_WALKTHROUGH } from '../items.mjs';
import { listItems, postItem } from '../store.mjs';
import { stepShellGaps } from '../step-shell.mjs';
import { tempDeck } from '../testUtils.mjs';

const DIR = process.platform === 'win32' ? 'C:\\work' : '/work';

test('a Git Bash grep under PowerShell is refused', (t) => {
  const screens = ['Run `grep -o foo log.txt` -> it prints foo'];
  assert.deepEqual(stepShellGaps(screens, { shell: 'PowerShell', dir: DIR }), ['step 1 is not PowerShell syntax: `grep -o`']);
  tempDeck(t);
  assert.throws(
    () => postItem({ kind: KIND_WALKTHROUGH, title: 'Try it', body: 'Run it.', author: 'pilot', shell: 'PowerShell', dir: DIR, screens }),
    /step 1 is not PowerShell syntax: `grep -o`/,
  );
  assert.equal(listItems().length, 0, 'nothing is stored');
});

test('the other PowerShell-foreign tokens are refused under cmd', () => {
  assert.deepEqual(stepShellGaps(['Run `cat ~/notes` -> text'], { shell: 'cmd', dir: DIR }), ['step 1 is not cmd syntax: `~/`']);
  assert.deepEqual(stepShellGaps(['Run `export A=1` -> set'], { shell: 'cmd', dir: DIR }), ['step 1 is not cmd syntax: `export`']);
});

test('$env under Git Bash is refused', () => {
  assert.deepEqual(stepShellGaps(['Run `echo $env:PATH` -> a path'], { shell: 'Git Bash', dir: DIR }), ['step 1 is not Git Bash syntax: `$env:`']);
});

test('matching syntax passes', () => {
  assert.deepEqual(stepShellGaps(['Run `Select-String -Pattern x log.txt` -> a hit'], { shell: 'PowerShell', dir: DIR }), []);
  assert.deepEqual(stepShellGaps(['Run `grep -o foo log.txt` -> foo'], { shell: 'Git Bash', dir: DIR }), []);
});

test('a cloud CLI is not checked', () => {
  assert.deepEqual(stepShellGaps(['Run `grep -o x` and `echo $env:A` -> ok'], { shell: 'gcloud', dir: DIR }), []);
});

test('prose outside a code span is not checked', () => {
  assert.deepEqual(stepShellGaps(['Open ~/notes and read grep -o in the text'], { shell: 'PowerShell', dir: DIR }), []);
});
