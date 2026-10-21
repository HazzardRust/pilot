/**
 * `pilot deck --scratch --seed-run <run.json>` (audit-f1-f7 S8): a scratch deck that already
 * shows a run, seeded through the deck's own HTTP API, never by writing deck.json. Each test
 * stops what it starts by its pid; nothing here touches 4321 or the user's home (L7).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import './no-open.mjs';
import { bearer } from '../../hooks/lib/deck-secret.js';
import { startScratch, stopScratch } from '../scratch.mjs';

const CLI = fileURLToPath(new URL('../../bin/pilot.mjs', import.meta.url));

const tempDir = (t, prefix) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  return dir;
};

/** A record as `deck_status` writes run.json, its worktree a temp dir that is no git checkout. */
const recordIn = (worktree) => ({
  slug: 'seed-demo',
  feature: 'Seed demo',
  branch: 'feat/seed-demo',
  worktree,
  artefact: 'docs/design/seed-demo/architecture.md',
  slices: [
    { slice: 'S1 One thing', state: 'integrated at 0a79bac8', delivers: ['1'] },
    { slice: 'S2 Another', state: 'planned', after: 'S1 One thing' },
  ],
  updatedAt: '2026-10-10T00:00:00.000Z',
});

async function seeded(t) {
  const record = recordIn(tempDir(t, 'pilot-seed-tree-'));
  const file = path.join(tempDir(t, 'pilot-seed-file-'), 'run.json');
  fs.writeFileSync(file, JSON.stringify(record));
  const deck = await startScratch({ seedRun: file });
  t.after(() => stopScratch(deck.pid));
  return { deck, record };
}

const getJson = async (deck, pathname) => {
  const response = await fetch(`${deck.url}${pathname}`, { headers: bearer(deck.dir), signal: AbortSignal.timeout(2000) });
  assert.equal(response.status, 200);
  return response.json();
};

test('the seeded run is listed', async (t) => {
  const { deck, record } = await seeded(t);
  const { runs } = await getJson(deck, '/api/runs');
  assert.ok(runs.some((run) => run.repo === record.worktree), JSON.stringify(runs));
});

test('the record reads back', async (t) => {
  const { deck, record } = await seeded(t);
  const body = await getJson(deck, `/api/record?repo=${encodeURIComponent(record.worktree)}`);
  assert.equal(body.record.slug, record.slug);
  assert.deepEqual(body.record.slices.map((row) => [row.slice, row.state]), record.slices.map((row) => [row.slice, row.state]));
});

/** `pilot deck --scratch --seed-run` on `record`, its temp dir its own so a deck it left shows there. */
function seedCli(t, record) {
  const file = path.join(tempDir(t, 'pilot-seed-bad-'), 'run.json');
  fs.writeFileSync(file, JSON.stringify(record));
  const tmp = tempDir(t, 'pilot-seed-tmp-');
  const run = spawnSync(process.execPath, [CLI, 'deck', '--scratch', '--seed-run', file], {
    encoding: 'utf8',
    env: { ...process.env, PILOT_DECK_DIR: tmp, TEMP: tmp, TMP: tmp, TMPDIR: tmp },
    timeout: 20_000,
  });
  return { run, left: fs.readdirSync(tmp) };
}

test('a bad record is refused before the deck starts', (t) => {
  const { run, left } = seedCli(t, { ...recordIn(path.join(os.tmpdir(), 'x')), slug: 'Not A Slug' });
  assert.equal(run.status, 1, run.stdout);
  assert.match(run.stderr, /\bslug\b/);
  assert.equal(run.stdout, '');
  assert.deepEqual(left, []);
});

test('a record the deck refuses leaves no deck running', (t) => {
  const { run, left } = seedCli(t, { ...recordIn(path.join(os.tmpdir(), 'x')), slices: 'not rows' });
  assert.equal(run.status, 1, run.stdout);
  assert.match(run.stderr, /\/api\/tool answered 4\d\d/);
  assert.equal(run.stdout, '');
  assert.deepEqual(left, []);
});
