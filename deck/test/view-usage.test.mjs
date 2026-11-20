/**
 * rune-deck-ui S16 (spec 2): the header's usage readout as data. Its figures are the readings the
 * page's header draws (`renderUsage`) for the same deck, filled from the same state file the page's
 * poll reads. Every test owns its state file, pointed at by `PILOT_USAGE_FILE`.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { usageView } = await import('../view/usage.mjs');
const { renderUsage } = await import('../ui/render-rail.mjs');
const { tabFor, tabsOf } = await import('../tabs.mjs');
const { repoKey } = await import('../runs.mjs');

const HOUR_MS = 60 * 60 * 1000;
const MINE = path.join(os.tmpdir(), 'pilot-view-usage-deck');
const AT = '2026-10-15T10:00:00.000Z';

function aStateFile(t, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-view-usage-'));
  const file = path.join(dir, 'context-usage-state.json');
  const previous = process.env.PILOT_USAGE_FILE;
  process.env.PILOT_USAGE_FILE = file;
  t.after(() => {
    if (previous === undefined) delete process.env.PILOT_USAGE_FILE;
    else process.env.PILOT_USAGE_FILE = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  if (contents !== null) fs.writeFileSync(file, JSON.stringify(contents));
}

/** Shaped as `hooks/context-usage-statusline.js` writes it: whole-second resets, a `decks` map. */
const aSnapshot = () => ({
  ctx: 74,
  session: { pct: 47, resetsAt: Math.floor((Date.now() + 2.5 * HOUR_MS) / 1000) },
  weekly: { pct: 91, resetsAt: Math.floor((Date.now() + 3 * 24 * HOUR_MS) / 1000) },
  decks: { [repoKey(MINE)]: { ctx: 19, at: new Date().toISOString() } },
});

const aRun = { id: 'run_000000000001', repo: MINE, name: 'kettle', pid: process.pid, startedAt: AT, slices: [] };

/** No run is the overview: a single live tab would be landed on instead (`landingFor`). */
const reads = (runs = [aRun]) => ({
  seq: 1,
  items: [],
  runs,
  numbers: {},
  agents: {},
  added: [],
  lanes: { coPilots: {}, switches: {}, records: [] },
  held: [],
  alerts: {},
});

/** The readings the page's header draws for `run`: its `data-usage` spans, in order. */
const pageReadings = (run) => {
  const r = reads();
  const tab = run === null ? null : tabFor(tabsOf(r.runs, r.items, r.numbers, r.agents, r.added, r.lanes), run);
  return [...renderUsage(tab).matchAll(/data-usage="(\w+)"/g)].map(([, key]) => key);
};

test("a deck's figures are the page's readings for it, its own ctx among them", (t) => {
  aStateFile(t, aSnapshot());

  const view = usageView(reads(), { run: MINE });

  assert.deepEqual(view, { ctx: 19, session: 47, weekly: 91, resets: 'in 2 hrs' });
  assert.deepEqual(['ctx', 'session', 'weekly'], pageReadings(MINE));
});

test('the overview has no ctx, as the page draws no ctx span there', (t) => {
  aStateFile(t, aSnapshot());

  const view = usageView(reads([]), { run: null });

  assert.deepEqual(view, { session: 47, weekly: 91, resets: 'in 2 hrs' });
  assert.deepEqual(['session', 'weekly'], pageReadings(null));
});

test('a state file never written gives no figure, which the header draws as unknown', (t) => {
  aStateFile(t, null);

  assert.deepEqual(usageView(reads(), { run: MINE }), {});
});

test('a reset already behind us is no reset line', (t) => {
  const old = aSnapshot();
  old.session.resetsAt = Math.floor((Date.now() - HOUR_MS) / 1000);
  aStateFile(t, old);

  assert.equal(usageView(reads(), { run: MINE }).resets, undefined);
});
