/**
 * `scripts/audit-session-start.mjs`: what each recent session of a repository
 * actually started with, read from its transcripts — the first call's measured
 * tokens, whether the session was the pilot, and how much of the start each
 * source took. Transcripts are synthetic and written per test under a temp
 * home; the real `~/.claude` is never read.
 */

import '../../scripts/test/lib/fake-home.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'audit-session-start.mjs');
const { measureSessionStarts, firstTurnRows, projectSlug, PICKUP_MARK } = await import('../audit-session-start.mjs');
const { notice } = createRequire(import.meta.url)('../../hooks/session-handoff.js');

const REPO = 'C:\\Users\\someone\\Projects\\demo';

function tempHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-session-start-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

const usage = (total) => ({
  message: { model: 'claude-opus-5-5', usage: { input_tokens: 2, cache_creation_input_tokens: total - 1002, cache_read_input_tokens: 1000 } },
  type: 'assistant',
});
const attachment = (a) => ({ type: 'attachment', attachment: a });
const snapshot = (first) => attachment({ type: 'prompt_snapshot', systemPrompt: [first] });

/** Writes one transcript, `entries` one JSON line each, with an mtime `age` seconds ago. */
function transcript(home, id, entries, age = 0) {
  const dir = path.join(home, '.claude', 'projects', projectSlug(REPO));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.jsonl`);
  fs.writeFileSync(file, entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
  const when = new Date(Date.now() - age * 1000);
  fs.utimesSync(file, when, when);
  return file;
}

test('the project directory is the repository path with every non-alphanumeric character a dash', () => {
  const cwd = path.join(os.tmpdir(), 'Projects', 'pilot');
  assert.equal(projectSlug(cwd), cwd.replace(/[^a-zA-Z0-9]/g, '-'));
  if (process.platform === 'win32') assert.equal(projectSlug('C:\\Users\\Hazzard\\Projects\\pilot'), 'C--Users-Hazzard-Projects-pilot');
  else assert.equal(projectSlug('/Users/hazzard/Projects/pilot'), '-Users-hazzard-Projects-pilot');
});

test('a pilot session reports its measured first call and each source sized from the transcript', async (t) => {
  const home = tempHome(t);
  transcript(home, 'aaaa1111', [
    { type: 'user', message: { content: 'build me a thing' } },
    attachment({ type: 'instructions', files: [{ path: 'C:\\h\\.claude\\CLAUDE.md', content: 'x'.repeat(4000) }] }),
    attachment({ type: 'agent_listing_delta', addedTypes: ['y'.repeat(800)] }),
    snapshot('You are the pilot: the one session the user talks to'),
    usage(33000),
    usage(99999),
  ]);

  const { sessions, summary } = await measureSessionStarts({ repo: REPO, home });
  assert.equal(sessions.length, 1);
  const [s] = sessions;
  assert.equal(s.id, 'aaaa1111');
  assert.equal(s.role, 'pilot');
  assert.equal(s.firstCallTokens, 33000, 'the first call only, never a later one');
  assert.equal(s.pickup, false);
  assert.deepEqual(summary.instructions, [{ path: 'C:\\h\\.claude\\CLAUDE.md', tokens: 1000 }], 'the files once, in the summary');
  assert.equal(s.instructions, undefined, 'and not again on every session');
  assert.ok(s.sources.agentListing > 200, 'the agent listing is sized');
  assert.equal(
    s.sources.unrecorded,
    33000 - Object.entries(s.sources).filter(([k]) => k !== 'unrecorded').reduce((n, [, v]) => n + v, 0),
    'what the transcript does not record — tool definitions and the base prompt — is the remainder',
  );
});

test('a hand-off picked up by a session that is not the pilot is flagged', async (t) => {
  const home = tempHome(t);
  transcript(home, 'bbbb2222', [
    attachment({ type: 'hook_additional_context', content: [PICKUP_MARK + ' the rest of the notice'] }),
    { type: 'user', message: { content: '<command-name>/clear</command-name>' } },
    attachment({ type: 'skill_listing', content: 'z'.repeat(20000) }),
    snapshot('\nYou are an interactive agent that helps users'),
    usage(70000),
  ]);

  const { sessions, summary } = await measureSessionStarts({ repo: REPO, home });
  const [s] = sessions;
  assert.equal(s.role, 'plain');
  assert.equal(s.byClear, true);
  assert.equal(s.pickup, true);
  assert.equal(s.sources.skillListing, 5000);
  assert.deepEqual(summary.pickupsWithoutPilot, ['bbbb2222']);
});

test('the summary gives each role its count, minimum, median and maximum, newest sessions first and at most `limit`', async (t) => {
  const home = tempHome(t);
  const pilot = snapshot('You are the pilot: x');
  transcript(home, 'old', [pilot, usage(40000)], 300);
  transcript(home, 'mid', [pilot, usage(32000)], 200);
  transcript(home, 'new', [pilot, usage(36000)], 100);
  transcript(home, 'plain', [snapshot('You are an interactive agent'), usage(70000)], 50);

  const all = await measureSessionStarts({ repo: REPO, home });
  assert.deepEqual(all.sessions.map((s) => s.id), ['plain', 'new', 'mid', 'old']);
  assert.deepEqual(all.summary.pilot, { sessions: 3, min: 32000, median: 36000, max: 40000 });
  assert.deepEqual(all.summary.plain, { sessions: 1, min: 70000, median: 70000, max: 70000 });

  const two = await measureSessionStarts({ repo: REPO, home, limit: 2 });
  assert.deepEqual(two.sessions.map((s) => s.id), ['plain', 'new']);
});

test('a transcript with no call yet, or a broken line, is reported without throwing', async (t) => {
  const home = tempHome(t);
  const file = transcript(home, 'cccc3333', [snapshot('You are the pilot: x')]);
  fs.appendFileSync(file, '{not json\n');

  const { sessions } = await measureSessionStarts({ repo: REPO, home });
  assert.equal(sessions[0].firstCallTokens, null);
  assert.equal(sessions[0].sources.unrecorded, null);
});

test('a character split across a read chunk is decoded whole, so sizes stay exact (review)', async (t) => {
  const home = tempHome(t);
  const line = JSON.stringify(attachment({ type: 'skill_listing', content: 'é'.repeat(600000) }));
  const prefix = line.indexOf('é');
  // Land the 1MB chunk boundary between the two bytes of one `é`.
  const pad = (1024 * 1024 - prefix) % 2 === 0 ? '{}\n' : '';
  const file = transcript(home, 'eeee5555', []);
  fs.writeFileSync(file, pad + line + '\n' + JSON.stringify(usage(400000)) + '\n');

  const [s] = (await measureSessionStarts({ repo: REPO, home })).sessions;
  assert.equal(s.sources.skillListing, Math.round((600000 * 2) / 4));
});

test('a transcript that cannot be read is marked, and the other sessions are still reported (review)', async (t) => {
  const home = tempHome(t);
  transcript(home, 'ffff6666', [snapshot('You are the pilot: x'), usage(30000)]);
  fs.mkdirSync(path.join(home, '.claude', 'projects', projectSlug(REPO), 'broken.jsonl'));

  const { sessions } = await measureSessionStarts({ repo: REPO, home });
  assert.equal(sessions.find((s) => s.id === 'ffff6666').firstCallTokens, 30000);
  assert.equal(sessions.find((s) => s.id === 'broken').unreadable, true);
});

test('a repository with no transcripts gives no sessions, not an error', async (t) => {
  const { sessions, summary } = await measureSessionStarts({ repo: REPO, home: tempHome(t) });
  assert.deepEqual(sessions, []);
  assert.deepEqual(summary.pickupsWithoutPilot, []);
});

test('the hand-off notice opens with the pickup mark', () => {
  const item = { id: 'itm_handoff1', kind: 'handoff', title: 'Handoff', body: 'the run record is the hand-off' };
  assert.ok(notice(item, null).startsWith(PICKUP_MARK), 'a pending hand-off is handed over under the mark the audit counts');
});

const at = (second, entry) => ({ ...entry, timestamp: new Date(Date.UTC(2026, 10, 19, 12, 0, second)).toISOString() });
const call = (model, u) => ({ type: 'assistant', message: { id: `msg_${Math.random()}`, model, usage: u } });
const clearHook = attachment({ type: 'hook_success', hookName: 'SessionStart:clear' });
const pickup = attachment({ type: 'hook_additional_context', content: [PICKUP_MARK + ' the rest'] });

test('a clear mid-file starts a new segment', async (t) => {
  const home = tempHome(t);
  transcript(home, 'gggg7777', [
    at(0, { type: 'user', message: { content: 'build me a thing' } }),
    at(1, usage(30000)),
    at(5, usage(31000)),
    at(20, clearHook),
    at(20, { type: 'user', message: { content: '<command-name>/clear</command-name>' } }),
    at(20, pickup),
    at(25, usage(32000)),
    // A tool result quoting the command is not a clear.
    at(30, { type: 'user', message: { content: [{ type: 'tool_result', content: '<command-name>/clear</command-name>' }] } }),
    at(31, usage(40000)),
  ]);

  const [s] = (await measureSessionStarts({ repo: REPO, home, firstTurn: true })).sessions;
  assert.equal(s.segments.length, 2);
  assert.deepEqual(s.segments.map((g) => [g.byClear, g.pickup]), [[false, false], [true, true]]);
  assert.equal(s.segments[0].gapMs, null, 'a file\'s first segment has nothing before it to measure from');
  assert.equal(s.segments[1].gapMs, 25000 - 5000, 'from the last entry of the segment before to the first turn');
  assert.equal(s.segments[1].firstTurn.cacheRead, 1000);

  const [plain] = (await measureSessionStarts({ repo: REPO, home })).sessions;
  assert.equal(plain.segments, undefined, 'the default output is unchanged without --first-turn');
});

test('the first turn keeps its four counts apart', async (t) => {
  const home = tempHome(t);
  const split = { input_tokens: 2, cache_read_input_tokens: 30000, cache_creation_input_tokens: 500, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 500 } };
  transcript(home, 'hhhh8888', [
    at(0, clearHook),
    at(0, pickup),
    at(1, call('<synthetic>', { input_tokens: 9, cache_read_input_tokens: 9 })),
    at(2, call('claude-opus-5-5', { input_tokens: 0, cache_read_input_tokens: 0 })),
    at(3, call('claude-opus-5-5', split)),
  ]);
  transcript(home, 'iiii9999', [at(0, { type: 'user', message: { content: 'hello' } }), at(1, call('claude-opus-5-5', { input_tokens: 10, cache_creation_input_tokens: 990 }))]);

  const rows = firstTurnRows((await measureSessionStarts({ repo: REPO, home, firstTurn: true })).sessions);
  assert.deepEqual(rows, [
    { kind: 'after-handoff', n: 1, input: 2, cacheRead: 30000, cacheWrite5m: 0, cacheWrite1h: 500, cachedShare: 0.98, medianGapMs: null },
    { kind: 'cold', n: 1, input: 10, cacheRead: 0, cacheWrite5m: 990, cacheWrite1h: 0, cachedShare: 0, medianGapMs: null },
  ]);
});

test('with no segment of a kind, its row says n 0 and no numbers', () => {
  assert.deepEqual(firstTurnRows([]), [
    { kind: 'after-handoff', n: 0, input: null, cacheRead: null, cacheWrite5m: null, cacheWrite1h: null, cachedShare: null, medianGapMs: null },
    { kind: 'cold', n: 0, input: null, cacheRead: null, cacheWrite5m: null, cacheWrite1h: null, cachedShare: null, medianGapMs: null },
  ]);
});

test('the CLI with --first-turn prints one row per kind and never a transcript\'s content', (t) => {
  const home = tempHome(t);
  transcript(home, 'jjjj0000', [
    attachment({ type: 'instructions', files: [{ path: 'C:\\x.md', content: 'SECRET-CONTENT-sk-123' }] }),
    usage(30000),
  ]);
  const run = spawnSync(process.execPath, [SCRIPT, REPO, '--first-turn', '--home', home], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const lines = run.stdout.trim().split('\n');
  assert.equal(lines.filter((l) => l.startsWith('| after-handoff |')).length, 1);
  assert.match(lines.find((l) => l.startsWith('| cold |')), /^\| cold \| 1 \| 2 \| 1000 \| 28998 \| 0 \|/);
  assert.ok(!run.stdout.includes('SECRET-CONTENT'));
});

test('the CLI prints JSON and never a transcript\'s content', (t) => {
  const home = tempHome(t);
  transcript(home, 'dddd4444', [
    attachment({ type: 'instructions', files: [{ path: 'C:\\x.md', content: 'SECRET-CONTENT-sk-123' }] }),
    snapshot('You are the pilot: x'),
    usage(30000),
  ]);
  const run = spawnSync(process.execPath, [SCRIPT, REPO, '--home', home], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout).sessions[0].id, 'dddd4444');
  assert.ok(!run.stdout.includes('SECRET-CONTENT'));
});
