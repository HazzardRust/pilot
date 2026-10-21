import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts['test:quiet'];

// Runs the script's own command over fixture files in a temp dir; never over the suite.
function runOver(file) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // else the child runs as a subtest of this run
  assert.ok(script, 'package.json has scripts["test:quiet"]');
  const [cmd, ...args] = script.split(/\s+/);
  assert.equal(cmd, 'node');
  const r = spawnSync(process.execPath, [...args, file], { cwd: root, encoding: 'utf8', env });
  return { out: (r.stdout ?? '') + (r.stderr ?? ''), status: r.status };
}

function fixture(name, body) {
  const dir = mkdtempSync(join(tmpdir(), 'test-quiet-'));
  const file = join(dir, name);
  writeFileSync(file, body);
  return { dir, file };
}

test('the dot reporter names a failure', () => {
  const { dir, file } = fixture('fail.test.mjs',
    "import {test} from 'node:test';import assert from 'node:assert/strict';\n" +
    "test('widget frobs the gizmo', () => assert.equal(1, 2));\n");
  try {
    const { out, status } = runOver(file);
    assert.notEqual(status, 0);
    assert.match(out, /widget frobs the gizmo/);
    assert.match(out, /1 !== 2|Expected values to be strictly equal/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a green run is short', () => {
  const { dir, file } = fixture('pass.test.mjs',
    "import {test} from 'node:test';\ntest('ok', () => {});\n");
  try {
    const { out, status } = runOver(file);
    assert.equal(status, 0);
    assert.ok(Buffer.byteLength(out) < 1024, `output was ${Buffer.byteLength(out)} bytes`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
