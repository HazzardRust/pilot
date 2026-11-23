// `scripts/probe-clear-survival.mjs` (handoff-no-wait S6, spec 2, 4, 7, 8): the step judge over the
// stream lines a headless `claude` printed after the clear. The lines below were captured from the
// probe's own passing run on 2026-11-23 (`--keep`), with usage, timestamps and thinking dropped and
// the notice's output path neutralised; the random ids are kept.
// The probe itself starts a real `claude` and never runs in the suite.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { judge, RELAY, REPORT } = await import('../probe-clear-survival.mjs');

const CLEAR = 1795349561855;
const WROTE = CLEAR + 63_600;

// Run in the fresh session: the reset, the co-pilot's own SendMessage call (an agent line, which
// proves nothing), the fresh context quoting the relay, and the co-pilot's completion notice.
const reset = String.raw`{"type":"conversation_reset","new_conversation_id":"ab2e0c0f-abf4-4630-bec7-4f89daea3dbe","trigger":"clear","user_message_uuid":"93a0a90c-5aea-4aec-8201-152be01a8702","session_id":"389e3a01-b1fa-4f7c-8874-acfa2e4a1621"}`;
const agentCall = String.raw`{"type":"assistant","message":{"model":"claude-haiku-5-5","type":"message","role":"assistant","content":[{"type":"tool_use","id":"toolu_01JaJZ2EZYe9MUAiwe942TTN","name":"SendMessage","input":{"to":"main","message":"PROBE-RELAY-7Q2 worker done","summary":"Relay probe completion message to main","type":"message","recipient":"main","recipient_kind":"main","content":"PROBE-RELAY-7Q2 worker done"},"caller":{"type":"direct"}}],"stop_reason":null,"stop_sequence":null},"parent_tool_use_id":"toolu_01PpS6JEkUjafajhA6p37eNh","agent_id":"a9e1734260fdcbe2f","session_id":"90d4706e-1a24-4a56-a1b5-88dd4868cc8e","subagent_type":"copilot","task_description":"probe copilot"}`;
const freshRead = String.raw`{"type":"assistant","message":{"model":"claude-haiku-5-5","type":"message","role":"assistant","content":[{"type":"text","text":"Agent a9e1734260fdcbe2f reported: \"PROBE-RELAY-7Q2 worker done\"\n\nI don't have a record of an active task for that agent, since the conversation was cleared, so I haven't acted on it. What would you like to work on?"}],"stop_reason":null,"stop_sequence":null},"parent_tool_use_id":null,"session_id":"90d4706e-1a24-4a56-a1b5-88dd4868cc8e"}`;
const freshResult = String.raw`{"type":"result","subtype":"success","is_error":false,"result":"Agent a9e1734260fdcbe2f reported: \"PROBE-RELAY-7Q2 worker done\"\n\nI don't have a record of an active task for that agent, since the conversation was cleared, so I haven't acted on it. What would you like to work on?","session_id":"90d4706e-1a24-4a56-a1b5-88dd4868cc8e"}`;
const notice = String.raw`{"type":"system","subtype":"task_notification","task_id":"a9e1734260fdcbe2f","run_id":"0mwsngn9g-1fc0555b","tool_use_id":"toolu_01PpS6JEkUjafajhA6p37eNh","status":"completed","output_file":"C:\\tmp\\tasks\\a9e1734260fdcbe2f.output","summary":"PROBE-REPORT-7Q2","summary_is_report":true,"session_id":"90d4706e-1a24-4a56-a1b5-88dd4868cc8e"}`;
const passing = [reset, agentCall, freshRead, notice];

// The captured agent line with one of its two agent fields removed.
const without = (line, key) => { const json = JSON.parse(line); delete json[key]; return JSON.stringify(json); };

test('a passing stream is judged survived: the relay quoted in the fresh result line', () => {
  assert.deepEqual(judge([reset, agentCall, freshResult, notice], { clear: CLEAR }, WROTE), { ok: true, after: 64 });
});

test('each missing step is named: sendmessage when an agent line keeps either agent field', () => {
  for (const key of ['agent_id', 'parent_tool_use_id']) {
    assert.deepEqual(judge([reset, without(agentCall, key), notice], { clear: CLEAR }, WROTE), { ok: false, step: 'sendmessage' });
  }
});

test('a passing stream is judged survived', () => {
  assert.deepEqual(judge(passing, { clear: CLEAR }, WROTE), { ok: true, after: 64 });
});

test('each missing step is named: worker when nothing was written', () => {
  assert.deepEqual(judge(passing, { clear: CLEAR }, null), { ok: false, step: 'worker' });
});

test('each missing step is named: worker when the write came before the clear', () => {
  assert.deepEqual(judge(passing, { clear: CLEAR }, CLEAR - 1000), { ok: false, step: 'worker' });
});

test('each missing step is named: sendmessage when only the agent line carries the relay', () => {
  assert.deepEqual(judge([reset, agentCall, notice], { clear: CLEAR }, WROTE), { ok: false, step: 'sendmessage' });
});

test('each missing step is named: report when the completion notice is cut', () => {
  assert.deepEqual(judge([reset, agentCall, freshRead], { clear: CLEAR }, WROTE), { ok: false, step: 'report' });
});

test('each missing step is named: report when the notice only quotes the brief', () => {
  // Shaped on the 2026-11-23 run whose co-pilot ended its turn early, its summary repeating the brief.
  const quoting = `{"type":"system","subtype":"task_notification","status":"completed","summary":"I have not finished the probe, so I can't send ${RELAY} or reply ${REPORT} yet.","session_id":"8727e3bd"}`;
  assert.deepEqual(judge([reset, freshRead, quoting], { clear: CLEAR }, WROTE), { ok: false, step: 'report' });
});

test('each missing step is named: the first one, whatever else is missing', () => {
  assert.deepEqual(judge([], { clear: CLEAR }, null), { ok: false, step: 'worker' });
  assert.deepEqual(judge(['not json', reset], { clear: CLEAR }, WROTE), { ok: false, step: 'sendmessage' });
});

test('each missing step is named: clear when the clear was never sent', () => {
  assert.deepEqual(judge(passing, {}, WROTE), { ok: false, step: 'clear' });
});
