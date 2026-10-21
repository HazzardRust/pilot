/** S1 of crew-voice-rules: voice is measurable from a run's transcripts (spec 2, 3, 5; L3, L11). Fixtures written by hand. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { voiceOf } from '../../deck/transcripts.mjs';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'measure-voice.mjs');
const SLUG = 'alpha-run';
const DECK = 'mcp__plugin_pilot_deck__deck_';

let seq = 0;
/** One assistant entry: `message.id` and `uuid` default fresh, so a test repeats them only on purpose. */
const assistant = (content, { id = `msg_${++seq}`, uuid = `u_${++seq}`, output = 10, stop = 'end_turn' } = {}) => ({
  type: 'assistant', uuid, timestamp: '2026-09-28T10:00:00.000Z',
  message: { id, model: 'claude-opus-5-5', stop_reason: stop, usage: { output_tokens: output }, content },
});
const text = (t) => ({ type: 'text', text: t });
const tool = (name, input = {}) => ({ type: 'tool_use', id: `tu_${++seq}`, name, input });
const toolResult = (t) => ({ type: 'user', uuid: `u_${++seq}`, message: { content: [{ type: 'tool_result', content: t }] } });

/** A run of `SLUG` whose pilot session holds `pilot` entries and whose one implementer holds `implementer`. */
function run(t, { pilot = [], implementer = [] }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'measure-voice-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const repo = path.join(dir, 'Alpha');
  const projectsRoot = path.join(dir, '.claude', 'projects');
  const project = path.join(projectsRoot, repo.replace(/[^a-zA-Z0-9]/g, '-'));
  const session = 'sess-1';
  fs.mkdirSync(path.join(project, session, 'subagents'), { recursive: true });
  const lines = (entries) => entries.map((e) => JSON.stringify(e)).join('\n');
  fs.writeFileSync(path.join(project, `${session}.jsonl`), lines([assistant([tool(`${DECK}status`, { slug: SLUG })]), ...pilot]));
  fs.writeFileSync(path.join(project, session, 'subagents', 'agent-a1.jsonl'), lines(implementer));
  fs.writeFileSync(path.join(project, session, 'subagents', 'agent-a1.meta.json'), JSON.stringify({ agentType: 'pilot:pilot-implementer' }));
  return { repo, projectsRoot, home: dir };
}

const row = (voice, agent) => voice.agents.find((a) => a.agent === agent);

test('counts assistant text bytes per turn, not tool output', (t) => {
  const r = run(t, { pilot: [
    assistant([text('a'.repeat(100)), tool('Read')]),
    toolResult('x'.repeat(10_000)),
    assistant([text('b'.repeat(300))]),
    assistant([{ type: 'thinking', thinking: 'c'.repeat(5000) }, tool('Bash')]),
  ] });
  const pilot = row(voiceOf(r.repo, SLUG, r), 'pilot');
  assert.equal(pilot.turns, 2, 'a message with no text block is not a turn');
  assert.equal(pilot.textBytesMedian, 200);
});

test('a message split over entries sums its text blocks', (t) => {
  const r = run(t, { implementer: [
    assistant([text('a'.repeat(120))], { id: 'msg_split' }),
    assistant([text('b'.repeat(80))], { id: 'msg_split' }),
    assistant([tool('Read')], { id: 'msg_split' }),
  ] });
  const implementer = row(voiceOf(r.repo, SLUG, r), 'pilot-implementer');
  assert.deepEqual([implementer.turns, implementer.textBytesMedian], [1, 200]);
});

test('groups deck bodies by kind and replies as reply', (t) => {
  const r = run(t, { pilot: [
    assistant([tool(`${DECK}post`, { kind: 'question', body: 'q'.repeat(400) })]),
    assistant([tool(`${DECK}post`, { kind: 'question', body: 'q'.repeat(600) })]),
  ], implementer: [assistant([tool(`${DECK}reply`, { id: 'itm_1', text: 'r'.repeat(50) })])] });
  assert.deepEqual(voiceOf(r.repo, SLUG, r).deck, [
    { kind: 'question', count: 2, bodyBytesMedian: 500 },
    { kind: 'reply', count: 1, bodyBytesMedian: 50 },
  ]);
});

test('returns no text', (t) => {
  const words = ['zebrafish', 'quokka', 'marmalade'];
  const r = run(t, { pilot: [
    assistant([text(`the ${words[0]} said`), tool(`${DECK}post`, { kind: 'question', body: `a ${words[1]}?` })]),
  ], implementer: [assistant([text(words[2])])] });
  const json = JSON.stringify(voiceOf(r.repo, SLUG, r));
  for (const word of words) assert.ok(!json.includes(word), `${word} leaked`);
});

test('a message seen twice counts once', (t) => {
  const entry = { id: 'msg_twice', uuid: 'u_twice' };
  const r = run(t, { pilot: [
    assistant([text('a'.repeat(40))], entry),
    assistant([text('a'.repeat(90))], entry),
    assistant([text('a'.repeat(40))], entry),
  ] });
  const pilot = row(voiceOf(r.repo, SLUG, r), 'pilot');
  assert.deepEqual([pilot.turns, pilot.textBytesMedian], [1, 90]);
});

test('reports output tokens per call beside the text, thinking included', (t) => {
  const r = run(t, { pilot: [
    assistant([{ type: 'thinking', thinking: '' }], { id: 'msg_a', output: 900 }),
    assistant([text('ok')], { id: 'msg_a', output: 900 }),
    assistant([tool('Bash')], { output: 100 }),
    assistant([text('done')], { output: 300 }),
  ] });
  const pilot = row(voiceOf(r.repo, SLUG, r), 'pilot');
  assert.deepEqual([pilot.calls, pilot.outputCounted, pilot.outputTokensMedian], [4, 4, 200], 'calls of 10, 100, 300 and 900 tokens: the deck_status call is one');
});

test('a call recorded only as it began has no output count', (t) => {
  const r = run(t, { implementer: [
    assistant([{ type: 'thinking', thinking: '' }], { id: 'msg_s', output: 4, stop: null }),
    assistant([text('ok')], { id: 'msg_s', output: 4, stop: null }),
  ] });
  const implementer = row(voiceOf(r.repo, SLUG, r), 'pilot-implementer');
  assert.deepEqual([implementer.calls, implementer.turns, implementer.outputCounted, implementer.outputTokensMedian], [1, 1, 0, null]);
});

test('the CLI prints the table, and --json the same figures', (t) => {
  const r = run(t, { pilot: [assistant([text('a'.repeat(250))])] });
  const cli = (...args) => spawnSync(process.execPath, [SCRIPT, '--slug', SLUG, '--repo', r.repo, ...args], {
    encoding: 'utf8', env: { ...process.env, HOME: r.home, USERPROFILE: r.home },
  });
  const table = cli();
  assert.equal(table.status, 0, table.stderr);
  assert.match(table.stdout, /pilot\s+\|\s+2\s+\|\s+1\s+\|\s+250\b/);
  const json = cli('--json');
  assert.equal(row(JSON.parse(json.stdout), 'pilot').textBytesMedian, 250);
  const missing = cli('--slug');
  assert.equal(missing.status, 2);
});
