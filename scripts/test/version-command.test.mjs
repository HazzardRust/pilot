import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const root = new URL('../../', import.meta.url);
const { version } = JSON.parse(fs.readFileSync(new URL('package.json', root), 'utf8'));

test('pilot --version prints the version', () => {
  const run = spawnSync(process.execPath, ['bin/pilot.mjs', '--version'], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, `${version}\n`);
});
