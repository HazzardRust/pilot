// one-integration-line S10 (spec 6): `pilot help` carries no `--default` or `land --ready`, and ADR 0167
// supersedes 0140. Only forbidden flags, a frontmatter field and the index check are tested.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { frontmatterOf as frontMatter } from './lib/area-file.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ADR = path.join(ROOT, 'docs', 'adr');
const read = (name) => fs.readFileSync(path.join(ADR, name), 'utf8').replace(/\r\n/g, '\n');

test('help names no retired flag', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'pilot.mjs'), 'help'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(r.status, 0, r.stderr);
  // lint: help does not offer the retired `--default` or `land --ready`
  assert.doesNotMatch(r.stdout, /--default/);
  assert.doesNotMatch(r.stdout, /land --ready/);
});

test('0140 is superseded by 0167', () => {
  // The pair itself is adr-index --check's to hold.
  assert.match(frontMatter(read('0140-a-gate2-holds-the-default-branch.md')), /^status: superseded$/m);
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'adr-index.mjs'), '--check'], { encoding: 'utf8', cwd: ROOT });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
