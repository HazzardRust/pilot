/**
 * S3 of mac-linux (spec 2, 6; L3): one repository behind a symlink is one path key.
 * On macOS `/tmp/x` is `/private/tmp/x`; a run started through the link and a deck
 * added at the real directory are one tab, and the hooks agree. The link is made
 * with type 'junction', which POSIX ignores and Windows needs no privilege for;
 * a host that still refuses it (EPERM) skips with the reason.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import { tempDeck } from '../testUtils.mjs';
import { repoKey } from '../items.mjs';
import { tabsOf } from '../tabs.mjs';

const hooks = createRequire(import.meta.url)('../../hooks/lib/deck.js');
const { addDeck, listAdded, listDeckNumbers, listItems, listStoredRuns, registerRun } = await import('../store.mjs');

/** A real directory and a link to it, both removed when the test ends; null when the host refuses the link. */
function linkedDirectory(t) {
  const real = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-real-'));
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-link-'));
  t.after(() => {
    fs.rmSync(parent, { recursive: true, force: true });
    fs.rmSync(real, { recursive: true, force: true });
  });
  const link = path.join(parent, 'alias');
  try {
    fs.symlinkSync(real, link, 'junction');
  } catch (err) {
    if (err.code === 'EPERM') return null;
    throw err;
  }
  return { real: fs.realpathSync.native(real), link };
}

test('a symlinked repo is one tab', (t) => {
  tempDeck(t);
  const dirs = linkedDirectory(t);
  if (!dirs) return t.skip('this host refuses to make a symlink (EPERM)');

  registerRun({ repo: dirs.link, pid: process.pid });
  addDeck(dirs.real);

  const tabs = tabsOf(listStoredRuns(), listItems(), listDeckNumbers(), {}, listAdded());
  assert.equal(tabs.length, 1, 'one tab');
  assert.equal(Object.keys(listDeckNumbers()).length, 1, 'one deck number');
  assert.equal(listItems().filter((item) => item.kind === 'chat').length, 1, 'one chat');
});

test('the hooks agree through a link', (t) => {
  const dirs = linkedDirectory(t);
  if (!dirs) return t.skip('this host refuses to make a symlink (EPERM)');

  assert.equal(hooks.samePath(dirs.link, dirs.real), true);
  assert.equal(hooks.repoKey(dirs.link), repoKey(dirs.link), 'the hooks and the deck spell the key alike');
  assert.equal(hooks.samePath(dirs.link, path.dirname(dirs.real)), false, 'and do not merge a different directory');
});
