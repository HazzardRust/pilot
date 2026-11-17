// handoff-mod S11 (spec 7, L15): the retired verb is gone from every text a user or the pilot reads, and
// `pilot reach` names `pilot start` in its place. The verb is built here so this file never names it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RETIRED_VERB = new RegExp(String.raw`\bpilot\s+${'r' + 'un'}\b`);

// lint: no-pilot-run (ADR 0180), the tracked files outside docs/ and the changelog
test('no user-facing text names the retired verb', () => {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter((rel) => rel && !rel.startsWith('docs/') && !path.basename(rel).startsWith('CHANGELOG'));
  const hits = files.flatMap((rel) => {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) return [];
    return fs
      .readFileSync(full, 'utf8')
      .split('\n')
      .flatMap((line, i) => (RETIRED_VERB.test(line) ? [`${rel}:${i + 1}`] : []));
  });
  assert.deepEqual(hits, []);
});

// lint: no-pilot-run, `pilot reach` with no argument
test('pilot reach names pilot start, not the retired verb', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'no-pilot-run-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const out = execFileSync(process.execPath, [path.join(ROOT, 'bin', 'pilot.mjs'), 'reach'], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
  assert.match(out, /^\s*nothing\b.*pilot start/m);
  assert.doesNotMatch(out, RETIRED_VERB);
});
