// `scripts/probe-clear-survival.mjs` (handoff-no-wait S6, spec 2, 4, 7, 8): the step judge over the
// stream lines a headless `claude` printed after the clear. The lines below are trimmed from the
// architect's E3 and E5 probe logs (Claude Code 2.1.330, 2026-11-22), their marker text swapped for
// the probe's own. The probe itself starts a real `claude` and never runs in the suite.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { judge, RELAY, REPORT } = await import('../probe-clear-survival.mjs');

const CLEAR = 1795349561855;
const WROTE = CLEAR + 66_909;

// Run in the fresh session: the reset, the co-pilot's own SendMessage call (an agent line, which
// proves nothing), the fresh context quoting the relay, and the co-pilot's completion notice.
const reset = '{"type":"conversation_reset","new_conversation_id":"dd8d2163","trigger":"clear","session_id":"2ed18988"}';
const agentCall = `{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","name":"SendMessage","input":{"to":"main","message":"${RELAY} sent after the wait"}}]},"parent_tool_use_id":"toolu_01DkJGDC5HWfQ6ifErmMaFj3","agent_id":"aa417c0ccae27f86b","session_id":"8727e3bd"}`;
const freshRead = `{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"The only incoming message is an agent note reading \\"${RELAY} sent after the wait.\\""}]},"parent_tool_use_id":null,"session_id":"8727e3bd"}`;
const notice = `{"type":"system","subtype":"task_notification","task_id":"aa417c0ccae27f86b","status":"completed","summary":"${REPORT}","summary_is_report":true,"session_id":"8727e3bd"}`;
const passing = [reset, agentCall, freshRead, notice];

test('a passing stream is judged survived', () => {
  assert.deepEqual(judge(passing, { clear: CLEAR }, WROTE), { ok: true, after: 67 });
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

test('each missing step is named: the first one, whatever else is missing', () => {
  assert.deepEqual(judge([], { clear: CLEAR }, null), { ok: false, step: 'worker' });
  assert.deepEqual(judge(['not json', reset], { clear: CLEAR }, WROTE), { ok: false, step: 'sendmessage' });
});

test('each missing step is named: clear when the clear was never sent', () => {
  assert.deepEqual(judge(passing, {}, WROTE), { ok: false, step: 'clear' });
});
