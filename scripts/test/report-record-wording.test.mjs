// report-record S4 (spec 6, 8; L4, A3): the pilot's "Ending a run" says the closing report is a
// record. Each pin holds one fact, so the clause can be reworded while its facts and ADR 0148 stay.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { read, sectionOf, flat } from './lib/area-file.mjs';

function ending() {
  const section = sectionOf(read('agents/pilot.md'), 'Ending a run');
  assert.ok(section, 'agents/pilot.md must still carry "Ending a run"');
  return flat(section);
}

test('the worktrees reply is the only one on a closing report', () => {
  const text = ending();
  assert.match(text, /worktrees reply[^.]*only reply on (?:a|the) closing report/i,
    'the close never says the worktrees reply is the only reply on the report');
  assert.match(text, /user's words on (?:a|the) report[^.]*never relayed or acted on/i,
    "the close never says a user's words on a report are not relayed or acted on");
  assert.match(text, /ADR 0148/, 'the clause never cites ADR 0148');
});

test('an ask goes up before the report', () => {
  assert.match(ending(), /needing the user[^.]*question[^.]*walkthrough[^.]*before the report/i,
    'the close never sends an ask up as its own question or walkthrough before the report');
});

test('the friction section is not picked by a reply', () => {
  const text = ending();
  assert.doesNotMatch(text, /for the user to pick from/i, 'the friction section is still picked from the report');
  assert.match(text, /picked with Add on Tickets or in the chat/i, 'the friction section never names Add on Tickets or the chat');
});

test('the pin moved by the clause alone', () => {
  const source = read('scripts/test/measure-prompt.test.mjs');
  const line = /^\/\/ report-record S4 \(\d{4}-\d{2}-\d{2}\) raised it from ([\d.]+) to the measured ([\d.]+) \(spec 6, 8[^)]*\):[^\n]*, ([\d.]+)\.$/m.exec(source);
  assert.ok(line, 'the pilot pin carries no history line naming report-record S4');
  const [from, to, cost] = line.slice(1, 4).map(Number);
  assert.equal(to - from, cost, 'the history line names a cost that is not its difference');
  const pin = /own <= ([\d.]+), `pilot's own share/.exec(source);
  assert.ok(pin, 'the pilot pin assertion is missing');
  // A later slice moves the pin with its own history line (three-lanes S8); the pin is the newest line's measure.
  const newest = [...source.slice(0, pin.index).matchAll(/^\/\/ [^\n]*to the measured ([\d.]+)/gm)].at(-1);
  assert.ok(newest, 'the pilot pin carries no history line naming its measure');
  assert.equal(Number(pin[1]), Number(newest[1]), 'the pilot pin is not the measured share the newest history line names');
});
