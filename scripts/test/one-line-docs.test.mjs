// one-integration-line S10 (spec 6): `pilot help` and the ADRs describe one integration line.
// `pilot integrate --trial` replaces `--default`, `pilot land` has no ready step, ADR 0167
// supersedes 0140, and the three ADRs it changes say so at their end.

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

test('help names the trial', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'pilot.mjs'), 'help'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /pilot integrate --trial/);
  assert.doesNotMatch(r.stdout, /--default/);
  assert.doesNotMatch(r.stdout, /land --ready/);
});

test('0140 is superseded by 0167', () => {
  // The pair itself is adr-index --check's to hold.
  assert.match(frontMatter(read('0140-a-gate2-holds-the-default-branch.md')), /^status: superseded$/m);
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'adr-index.mjs'), '--check'], { encoding: 'utf8', cwd: ROOT });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('the amendments say why', () => {
  for (const name of ['0083-the-pilot-owns-a-branch.md', '0154-gate2-frees-the-lane.md', '0161-the-lander-owns-every-merge.md']) {
    const last = read(name).trimEnd().split('\n').at(-1);
    assert.match(last, /^Amended 2026-10-\d\d\b.*\bADR 0167\b/, `${name} ends naming ADR 0167`);
  }
});
