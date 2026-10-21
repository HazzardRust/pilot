/** S6 of usage-telemetry: the audit carries the latest runs' figures (spec 10, L9, A6). Fixtures written by hand. */

// The fixture seam imports fake-home.mjs and gives every git below its identity (A6: this
// file keeps its own git init).
import './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { main as analytics } from '../../deck/analytics.mjs';
import { tables } from '../../deck/test/analytics-run.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'audit-spend.mjs');
const OPUS = 'claude-opus-5-5';

/** A throwaway git repository, a home whose `.claude/projects` holds its transcripts, and a deck store. */
function scratch(t) {
  // The long, resolved path git prints as the top level: a runner's TEMP is `RUNNER~1` on Windows and under `/var`
  // (a link to `/private/var`) on macOS, and the transcripts' directory is named from the path git gives back.
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'audit-runs-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const repo = path.join(dir, 'Alpha');
  fs.mkdirSync(repo);
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  };
  git('init', '-q');
  const home = path.join(dir, 'home');
  const projects = path.join(home, '.claude', 'projects');
  const deck = path.join(dir, 'deck');
  fs.mkdirSync(deck);
  return { dir, repo, home, projects, deck, git };
}

function record(repo, slug, updatedAt, extra = {}) {
  const file = path.join(repo, 'docs', 'design', slug, 'run.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ slug, feature: slug, ...extra, updatedAt })}\n`);
}

let seq = 0;
const assistant = (model, usage, tools = []) => JSON.stringify({
  type: 'assistant',
  timestamp: `2026-09-28T10:00:${String(seq % 60).padStart(2, '0')}.000Z`,
  message: { id: `msg_${++seq}`, model, usage, content: tools.map((name) => ({ type: 'tool_use', id: `tu_${++seq}`, name, input: {} })) },
});
const status = (slug) => JSON.stringify({
  type: 'assistant',
  timestamp: '2026-09-28T10:00:00.000Z',
  message: { id: `msg_${++seq}`, model: OPUS, usage: { input_tokens: 1, output_tokens: 1 },
    content: [{ type: 'tool_use', id: `tu_${++seq}`, name: 'mcp__plugin_pilot_deck__deck_status', input: { slug } }] },
});
const costState = (usd, modelUsage) => JSON.stringify({ type: 'cost-state', totalCostUSD: usd, modelUsage });

/** One session of `slug` with a pilot line, one subagent and, when given, a cost-state. */
function transcripts({ projects, repo }, slug, { model = OPUS, state } = {}) {
  const dir = path.join(projects, repo.replace(/[^a-zA-Z0-9]/g, '-'));
  const session = `${slug}-0000-4000-8000-000000000000`;
  fs.mkdirSync(path.join(dir, session, 'subagents'), { recursive: true });
  fs.writeFileSync(path.join(dir, `${session}.jsonl`), [
    status(slug),
    assistant(model, { input_tokens: 100, cache_creation_input_tokens: 40, cache_read_input_tokens: 2000, output_tokens: 50 }, ['Read']),
    ...(state ? [state] : []),
  ].join('\n'));
  fs.writeFileSync(path.join(dir, session, 'subagents', 'agent-a1.jsonl'), [
    JSON.stringify({ type: 'user', timestamp: '2026-09-28T10:01:00.000Z', message: { content: 'brief' } }),
    assistant(OPUS, { input_tokens: 7, cache_read_input_tokens: 300, output_tokens: 20 }, ['Bash', 'Grep']),
  ].join('\n'));
  fs.writeFileSync(path.join(dir, session, 'subagents', 'agent-a1.meta.json'), JSON.stringify({ agentType: 'pilot:pilot-implementer' }));
}

function spend(s) {
  const result = spawnSync(process.execPath, [SCRIPT, s.repo, '--log', path.join(s.dir, 'none.jsonl')], {
    encoding: 'utf8',
    env: { ...process.env, HOME: s.home, USERPROFILE: s.home, PILOT_DECK_DIR: s.deck },
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('runs lists the newest three run.json by updatedAt, finished or not', (t) => {
  const s = scratch(t);
  record(s.repo, 'oldest', '2026-09-20T10:00:00.000Z', { finished: true });
  record(s.repo, 'second', '2026-09-26T10:00:00.000Z', { finished: true });
  record(s.repo, 'third', '2026-09-27T10:00:00.000Z');
  record(s.repo, 'newest', '2026-09-28T10:00:00.000Z');
  s.git('add', '.');
  s.git('commit', '-q', '-m', 'runs');
  record(s.repo, 'unmerged', '2026-09-29T10:00:00.000Z');
  // `oldest` has transcripts too, so the cap of three is what leaves it out.
  for (const slug of ['newest', 'third', 'second', 'oldest']) transcripts(s, slug);

  const { runs } = spend(s);
  assert.deepEqual(runs.map((r) => [r.slug, r.updatedAt]), [
    ['newest', '2026-09-28T10:00:00.000Z'],
    ['third', '2026-09-27T10:00:00.000Z'],
    ['second', '2026-09-26T10:00:00.000Z'],
  ], 'at HEAD only: a record in the working tree alone is not merged');
  assert.equal(runs[0].toolCalls, 4, 'deck_status, Read, Bash, Grep');
});

test("a run's tokens equal the total pilot analytics prints for it", (t) => {
  const s = scratch(t);
  record(s.repo, 'alpha', '2026-09-28T10:00:00.000Z');
  s.git('add', '.');
  s.git('commit', '-q', '-m', 'run');
  // Claude Code counted more than the transcripts hold: analytics' total carries the difference.
  const state = costState(1.5, { [`${OPUS}[1m]`]: { inputTokens: 500, outputTokens: 90, cacheReadInputTokens: 4000, cacheCreationInputTokens: 60 } });
  transcripts(s, 'alpha', { state });

  let printed = '';
  t.mock.method(process.stdout, 'write', (chunk) => { printed += chunk; return true; });
  const before = process.env.PILOT_DECK_DIR;
  process.env.PILOT_DECK_DIR = s.deck;
  try {
    assert.equal(analytics(['alpha'], { cwd: s.repo, repo: s.repo, projectsRoot: s.projects }), 0);
  } finally {
    if (before === undefined) delete process.env.PILOT_DECK_DIR;
    else process.env.PILOT_DECK_DIR = before;
    t.mock.restoreAll();
  }
  const total = tables(printed)[1].find((row) => row[0] === 'Total');
  const number = (text) => Number(text.replace(/,/g, ''));
  const tokens = total.slice(2, 6).map(number).reduce((a, b) => a + b, 0);

  const [run] = spend(s).runs;
  assert.equal(run.tokens, tokens, 'input, cache write, cache read and output of the Total row');
  assert.equal(run.toolCalls, number(total[6]));
  assert.equal(`$${run.costUSD.toFixed(2)}`, total[8]);
});

test('an unpriced model gives costUSD null, never zero', (t) => {
  const s = scratch(t);
  record(s.repo, 'alpha', '2026-09-28T10:00:00.000Z');
  s.git('add', '.');
  s.git('commit', '-q', '-m', 'run');
  transcripts(s, 'alpha', { model: 'claude-unpriced-9' });
  const [run] = spend(s).runs;
  assert.equal(run.costUSD, null);
  assert.ok(run.tokens > 0);
});

test('a run with no session in the transcripts is skipped, never a run of zero', (t) => {
  const s = scratch(t);
  record(s.repo, 'measured', '2026-09-27T10:00:00.000Z');
  record(s.repo, 'elsewhere', '2026-09-28T10:00:00.000Z');
  s.git('add', '.');
  s.git('commit', '-q', '-m', 'runs');
  transcripts(s, 'measured');
  assert.deepEqual(spend(s).runs.map((r) => r.slug), ['measured'], 'pilot analytics refuses a run no session named');
});

test('outside a git repository runs is empty', (t) => {
  const s = scratch(t);
  fs.rmSync(path.join(s.repo, '.git'), { recursive: true, force: true });
  assert.deepEqual(spend(s).runs, []);
});
