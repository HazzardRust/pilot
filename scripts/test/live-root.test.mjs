// S17 (never-stuck spec 12): one trusted live root under a temp HOME; the user's own ~/.claude.json is never read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { liveRoot } from '../live-root.mjs';

/** A temp HOME whose `.claude.json` lists `projects`; answers the home and the config's bytes. */
function fakeHome(t, projectsFor) {
  const home = mkdtempSync(path.join(tmpdir(), 'pilot-live-root-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const root = path.join(home, '.claude', 'pilot', 'live');
  const text = `${JSON.stringify({ numStartups: 3, projects: projectsFor(root) }, null, 2)}\n`;
  writeFileSync(path.join(home, '.claude.json'), text);
  return { home, root, text };
}

test('an untrusted root says so', (t) => {
  const { home, root, text } = fakeHome(t, (r) => ({ [r]: { hasTrustDialogAccepted: false }, other: { hasTrustDialogAccepted: true } }));
  const result = liveRoot({ home });
  assert.deepEqual(result, { root, trusted: false });
  assert.ok(existsSync(root), 'the root is made');
  assert.equal(readFileSync(path.join(home, '.claude.json'), 'utf8'), text, '.claude.json is unchanged');
});

test('a trusted root says so and makes a plain subdir', (t) => {
  // Claude Code keys projects by the forward-slash path on Windows.
  const { home, root, text } = fakeHome(t, (r) => ({ [r.replaceAll('\\', '/')]: { hasTrustDialogAccepted: true } }));
  const result = liveRoot({ home, dir: 's17-check' });
  assert.deepEqual(result, { root, trusted: true, path: path.join(root, 's17-check') });
  assert.ok(existsSync(result.path), 'the subdir exists');
  assert.equal(existsSync(path.join(result.path, '.git')), false, 'no git repository is made');
  assert.equal(readFileSync(path.join(home, '.claude.json'), 'utf8'), text, '.claude.json is unchanged');
});

test('a name with a separator or dots is refused', (t) => {
  const { home, root } = fakeHome(t, () => ({}));
  for (const dir of ['../escape', 'a/b', 'a\\b', '..', '.', 'A', '', 'x'.repeat(41)]) {
    assert.throws(() => liveRoot({ home, dir }), /live-root/, `refuses ${JSON.stringify(dir)}`);
  }
  assert.equal(existsSync(root), false, 'nothing is made');
  assert.deepEqual(readdirSync(home), ['.claude.json']);
});

test('a missing or unreadable .claude.json reads untrusted', (t) => {
  const home = mkdtempSync(path.join(tmpdir(), 'pilot-live-root-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  assert.equal(liveRoot({ home }).trusted, false);
  writeFileSync(path.join(home, '.claude.json'), '{ not json');
  assert.equal(liveRoot({ home }).trusted, false);
});
