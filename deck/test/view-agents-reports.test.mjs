/**
 * rune-deck-ui S14 (spec 2, 6a): the Agents and Reports regions as data. The agents are the roster the
 * HTML panel draws, each with whole seconds since its last tool call and dimmed from 30 s quiet; the
 * reports are the ones the page's Reports tab lists. Every test owns its fixtures and its roster.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { LIVE_WINDOW_MS, forgetAgents, listAgents, noteAgent } = await import('../agents.mjs');
const { agentsView } = await import('../view/agents.mjs');
const { reportsView } = await import('../view/reports.mjs');
const { viewOf } = await import('../view/index.mjs');
const { renderAgents, reportsOf } = await import('../ui/render-rail.mjs');

const MINE = 'C:/work/pilot';
const NOW = Date.parse('2026-11-20T12:00:00.000Z');

const aReport = (id, over = {}) => ({
  id, kind: 'report', title: `report ${id}`, body: 'done', repo: MINE, postedAt: '2026-11-01T10:00:00.000Z', replies: [], standing: true, ...over,
});

const reads = (items, agents = {}) => ({ seq: 1, items, runs: [{ repo: MINE, startedAt: '2026-11-01T09:00:00.000Z', pid: process.pid }], numbers: {}, agents, added: [], lanes: { coPilots: {}, switches: {}, records: [] }, held: [], alerts: {} });

const beat = (agentId, agentType, ageS) => noteAgent({ agentId, agentType, cwd: MINE }, NOW - ageS * 1000);

test('the agents are the roster', () => {
  forgetAgents();
  beat('a1', 'pilot:pilot-qa', 5);
  beat('a2', 'Explore', 5);
  const roster = listAgents(NOW);

  const view = agentsView(reads([aReport('itm_0000000000a1')], roster), { run: MINE }, NOW);

  const page = [...renderAgents(Object.values(roster)[0]).matchAll(/<span class="run">([^<]*)<\/span>/g)].map(([, name]) => name);
  assert.deepEqual(view.agents.map(({ name }) => name), page);
  assert.deepEqual(view.agents.map(({ kind }) => kind), ['qa', 'other']);
  assert.equal(view.agents[0].since, roster[Object.keys(roster)[0]][0].since);
  forgetAgents();
});

test('an empty roster draws no agents', () => {
  assert.deepEqual(agentsView(reads([], {}), {}, NOW), { agents: [] });
});

test('each agent row shows its last-seen age and dims when quiet', () => {
  forgetAgents();
  beat('fresh', 'Explore', 5);
  beat('quiet', 'pilot:pilot-qa', 45);
  beat('gone', 'pilot:pilot-fundamentalist', 91);
  const roster = listAgents(NOW);

  const { agents } = agentsView(reads([], roster), { run: MINE }, NOW);

  const byName = Object.fromEntries(agents.map((agent) => [agent.name, agent]));
  assert.equal(byName.Explore.quietS, 5);
  assert.equal(byName.Explore.quiet, false);
  assert.equal(byName['pilot:pilot-qa'].quietS, 45);
  assert.equal(byName['pilot:pilot-qa'].quiet, true);
  assert.equal(byName['pilot:pilot-fundamentalist'], undefined, 'seen 91 s ago is past the window');
  assert.equal(LIVE_WINDOW_MS, 90_000);
  forgetAgents();
});

test('quiet begins at 30 s', () => {
  forgetAgents();
  beat('edge', 'Explore', 30);
  beat('inside', 'pilot:pilot-qa', 29);

  const { agents } = agentsView(reads([], listAgents(NOW)), { run: MINE }, NOW);

  assert.deepEqual(agents.map(({ quietS, quiet }) => ({ quietS, quiet })).sort((a, b) => a.quietS - b.quietS), [
    { quietS: 29, quiet: false }, { quietS: 30, quiet: true },
  ]);
  forgetAgents();
});

test('the reports are the page\'s', () => {
  const older = aReport('itm_0000000000a1', { postedAt: '2026-11-01T10:00:00.000Z' });
  const newer = aReport('itm_0000000000a2', { postedAt: '2026-11-05T10:00:00.000Z' });
  const other = aReport('itm_0000000000a3', { repo: 'C:/work/elsewhere' });
  const items = [older, newer, other];

  const view = reportsView(reads(items), { run: MINE });

  assert.deepEqual(view.reports.map(({ id }) => id), reportsOf(items, MINE).map(({ id }) => id));
  assert.equal(view.reports.length, 2);
  assert.deepEqual(view.reports[0], { id: newer.id, title: newer.title, href: `/thread/${newer.id}`, at: newer.postedAt, open: true });
});

test('a report the pilot has closed loses its open mark, as on the page', () => {
  const closed = aReport('itm_0000000000a4', { resolvedAt: '2026-11-02T10:00:00.000Z', resolution: 'closed' });
  const open = aReport('itm_0000000000a5');

  const view = reportsView(reads([closed, open]), { run: MINE });

  const marked = Object.fromEntries(view.reports.map(({ id, open: mark }) => [id, mark]));
  assert.deepEqual(marked, { [closed.id]: false, [open.id]: true });
});

test('the regions are the view\'s', () => {
  const items = [aReport('itm_0000000000a1')];

  const regions = viewOf(reads(items), { screen: 'home', run: MINE }).regions;

  assert.deepEqual(regions.reports, reportsView(reads(items), { run: MINE }));
  assert.deepEqual(regions.agents, { agents: [] });
});
