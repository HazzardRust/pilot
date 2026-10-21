/**
 * gate-script S1 (spec 1, 2; L1-L3, A1): a checkout with no `node_modules`, or a partial one, is told
 * in one line to run `npm ci` before the gate takes a slot or runs a test.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { missingInstall } = await import('../gate.mjs');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A temp root whose package.json lists `deps` and `optional`, with `installed` under node_modules. */
function fixture(t, { deps = {}, optional, installed = [], nodeModules = true }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-install-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const pkg = { name: 'fixture', dependencies: deps };
  if (optional) pkg.optionalDependencies = optional;
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkg));
  if (nodeModules) fs.mkdirSync(path.join(root, 'node_modules'));
  for (const name of installed) {
    fs.mkdirSync(path.join(root, 'node_modules', name), { recursive: true });
    fs.writeFileSync(path.join(root, 'node_modules', name, 'package.json'), JSON.stringify({ name }));
  }
  return root;
}

test('an installed checkout has nothing missing', (t) => {
  const root = fixture(t, { deps: { '@scope/a': '1.0.0', b: '2.0.0' }, installed: ['@scope/a', 'b'] });
  assert.equal(missingInstall(root), undefined);
});

test('a missing or partial install names the dependency', (t) => {
  const none = fixture(t, { deps: { '@scope/a': '1.0.0' }, nodeModules: false });
  assert.equal(missingInstall(none), '@scope/a');
  const partial = fixture(t, { deps: { '@scope/a': '1.0.0', b: '2.0.0' }, installed: ['@scope/a'] });
  assert.equal(missingInstall(partial), 'b');
});

test('an absent optional dependency is not missing', (t) => {
  const root = fixture(t, { deps: { a: '1.0.0' }, optional: { 'node-pty': '1.1.0' }, installed: ['a'] });
  assert.equal(missingInstall(root), undefined);
});

test('a gate without node_modules refuses in under 2 s and runs no test', (t) => {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-install-e2e-'));
  t.after(() => fs.rmSync(copy, { recursive: true, force: true }));
  const skipTests = (src) => path.basename(src) !== 'test' && path.basename(src) !== 'node_modules';
  for (const dir of ['scripts', 'deck', 'hooks/lib']) {
    fs.cpSync(path.join(ROOT, dir), path.join(copy, dir), { recursive: true, filter: skipTests });
  }
  fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(copy, 'package.json'));
  assert.equal(fs.existsSync(path.join(copy, 'node_modules')), false);

  // Without NODE_TEST_CONTEXT, or the copy's node --test reads itself as nested and runs no file.
  const { NODE_TEST_CONTEXT, ...env } = process.env;
  const started = Date.now();
  const run = spawnSync(process.execPath, [path.join(copy, 'scripts', 'gate.mjs')], {
    cwd: copy,
    encoding: 'utf8',
    timeout: 60_000,
    env,
  });
  const elapsed = Date.now() - started;

  assert.equal(run.status, 1, `stdout: ${run.stdout}\nstderr: ${run.stderr}`);
  assert.match(run.stderr, /^node_modules missing: run npm ci$/m);
  assert.doesNotMatch(`${run.stdout}${run.stderr}`, /ℹ tests/);
  assert.ok(elapsed < 2000, `took ${elapsed} ms`);
});
