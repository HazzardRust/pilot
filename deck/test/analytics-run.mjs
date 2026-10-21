/** How the analytics tests run `pilot analytics`: the fixture transcripts, a fresh store every time, one table parser. */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { main } from '../analytics.mjs';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'transcripts');
const REPO = 'C:\\fixture\\repo';

/**
 * Runs `main` against the fixture root with an empty temporary store, holding `override` as its
 * prices.json when given, and returns the exit code, what was written and the override's path.
 */
export function analytics(t, argv, { cwd = ROOT, override } = {}) {
  const store = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-analytics-'));
  t.after(() => fs.rmSync(store, { recursive: true, force: true }));
  const file = path.join(store, 'prices.json');
  if (override !== undefined) fs.writeFileSync(file, typeof override === 'string' ? override : JSON.stringify(override));
  const written = { stdout: '', stderr: '', file };
  t.mock.method(process.stdout, 'write', (chunk) => { written.stdout += chunk; return true; });
  t.mock.method(process.stderr, 'write', (chunk) => { written.stderr += chunk; return true; });
  const before = process.env.PILOT_DECK_DIR;
  process.env.PILOT_DECK_DIR = store;
  try {
    return { code: main(argv, { cwd, repo: REPO, projectsRoot: ROOT }), ...written };
  } finally {
    if (before === undefined) delete process.env.PILOT_DECK_DIR;
    else process.env.PILOT_DECK_DIR = before;
    t.mock.restoreAll();
  }
}

const cells = (line) => line.slice(1, -1).split('|').map((text) => text.trim());

/** Each Markdown table's rows as arrays of trimmed cells, header row first. */
export const blocks = (stdout) => stdout.split('\n\n').filter((block) => block.startsWith('|'))
  .map((block) => block.split('\n').map(cells));

/**
 * The body rows, header and rule dropped: [agent table, slice table]. The agent table is printed as
 * two tables with rows in the same order, identity then figures; they are joined back into one here.
 */
export function tables(stdout) {
  const [identity, figures, ...rest] = blocks(stdout);
  assert.deepEqual(figures.map((row) => row[0]), identity.map((row) => row[0]), 'the two agent tables list the same agents in the same order');
  const joined = identity.slice(2).map((row, i) => [...row, ...figures[i + 2].slice(1)]);
  return [joined, ...rest.map((block) => block.slice(2))];
}
