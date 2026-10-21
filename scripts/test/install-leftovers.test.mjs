/**
 * Pins for `install-leftovers.mjs`, which deletes what an older version of this
 * package left outside the plugin: the gateguard's `~/.gateguard/state-*.json`
 * (ADR 0078). Every case runs against a scratch home, never the real one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { removeLeftovers } from '../install-leftovers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function scratchHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-leftovers-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

function seed(home, names) {
  const dir = path.join(home, '.gateguard');
  fs.mkdirSync(dir, { recursive: true });
  for (const name of names) fs.writeFileSync(path.join(dir, name), '{}');
  return dir;
}

test('hooks.json registers no gateguard', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'hooks', 'hooks.json'), 'utf8'));
  for (const entries of Object.values(manifest.hooks)) {
    for (const entry of entries) {
      assert.doesNotMatch(String(entry.id), /gateguard/i);
      for (const hook of entry.hooks) assert.doesNotMatch(hook.command, /gateguard/i);
    }
  }
});

test('removeLeftovers deletes state files and the empty dir', (t) => {
  const home = scratchHome(t);
  const dir = seed(home, ['state-a.json', 'state-b.json']);

  const report = removeLeftovers({ home });

  assert.equal(fs.existsSync(dir), false);
  assert.deepEqual(report.kept, []);
  assert.deepEqual(
    [...report.removed].sort(),
    [dir, path.join(dir, 'state-a.json'), path.join(dir, 'state-b.json')].sort(),
  );
});

test('removeLeftovers keeps anything else', (t) => {
  const home = scratchHome(t);
  const dir = seed(home, ['state-a.json', 'notes.txt']);

  const report = removeLeftovers({ home });

  assert.deepEqual(report.removed, [path.join(dir, 'state-a.json')]);
  assert.deepEqual(report.kept, [path.join(dir, 'notes.txt')]);
  assert.ok(fs.existsSync(path.join(dir, 'notes.txt')));
  assert.ok(report.notes.some((note) => note.includes(path.join(dir, 'notes.txt'))));
});

test('removeLeftovers never follows a link out of the home', (t) => {
  const home = scratchHome(t);
  const elsewhere = scratchHome(t);
  fs.writeFileSync(path.join(elsewhere, 'state-x.json'), '{}');
  const link = path.join(home, '.gateguard');
  fs.symlinkSync(elsewhere, link, 'junction');

  const report = removeLeftovers({ home });

  assert.deepEqual(report.removed, []);
  assert.deepEqual(report.kept, [link]);
  assert.ok(fs.existsSync(path.join(elsewhere, 'state-x.json')));
  assert.ok(fs.lstatSync(link).isSymbolicLink());
});

test('a second run changes nothing and says so', (t) => {
  const home = scratchHome(t);
  seed(home, ['state-a.json']);
  removeLeftovers({ home });

  const again = removeLeftovers({ home });

  assert.deepEqual(again.removed, []);
  assert.deepEqual(again.kept, []);
  assert.match(again.notes.join('\n'), /nothing to remove/i);
});

test('removeLeftovers keeps a directory or a link named like state, untouched', (t) => {
  const home = scratchHome(t);
  const elsewhere = scratchHome(t);
  fs.writeFileSync(path.join(elsewhere, 'keep.json'), '{}');
  const dir = seed(home, []);
  fs.mkdirSync(path.join(dir, 'state-dir.json'));
  fs.writeFileSync(path.join(dir, 'state-dir.json', 'inner.json'), '{}');
  fs.symlinkSync(elsewhere, path.join(dir, 'state-link.json'), 'junction');

  const report = removeLeftovers({ home });

  assert.deepEqual(report.removed, []);
  assert.deepEqual(
    [...report.kept].sort(),
    [path.join(dir, 'state-dir.json'), path.join(dir, 'state-link.json')].sort(),
  );
  assert.ok(fs.existsSync(path.join(dir, 'state-dir.json', 'inner.json')));
  assert.ok(fs.existsSync(path.join(elsewhere, 'keep.json')));
});
