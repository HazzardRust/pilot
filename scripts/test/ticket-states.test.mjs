/**
 * ticket-states S10 (spec 4, 5, 9, 10, 11; L9, L10, L15, L17): the pilot plans on tickets.
 * Every run is on a live ticket, the phase is that ticket's state, a run can end at Gate 1
 * as planned, and the small ticket is gone from every agent. Prompt files are pinned by
 * text, so each assertion names the rule a rewrite must keep. The pilot's share of its
 * prompt is pinned in measure-prompt.test.mjs, and this slice does not raise it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

/** The text under one heading of the given depth, up to the next heading of that depth or higher, on one line. */
function section(rel, heading, depth = 2) {
  const source = read(rel);
  const marker = `\n${'#'.repeat(depth)} ${heading}\n`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${rel} has no "${marker.trim()}" heading`);
  const rest = source.slice(start + marker.length);
  const end = rest.search(new RegExp(`\\n#{1,${depth}} `));
  return (end === -1 ? rest : rest.slice(0, end)).replace(/\s+/g, ' ');
}

const PILOT = 'agents/pilot.md';

// overview-one-ticket S6 (spec 21, L18): green (red until ADR 0147) starts at `need`, and the gate2 is posted inside green.
test('pilot.md says green starts at need, not at the gate2', () => {
  const legend = section(PILOT, 'Legend');
  // yellow-agent S4 made the main slot never yellow, so the phase is the ticket's state, not the live ticket's (S5).
  assert.match(legend, /a day and a night, the ticket's states/, 'the phase is the ticket\'s state (spec 4)');
  assert.match(legend, /in red \(planning, until Gate 1 is signed\)/);
  assert.match(legend, /in green \(concluding, from `need`\)/, 'L18: the gate2 no longer ends yellow');
  assert.doesNotMatch(legend, /Gate 2 passes|Gate 2 posted/, 'red waits for neither the post nor the sign-off');

  const gate2 = section(PILOT, '9. Gate 2 and ready', 3);
  assert.match(gate2, /a thread of kind `gate2` with `ticket`, `pr`, `sha` and `walkthrough`/);
  assert.doesNotMatch(gate2, /Posting it turns the ticket red/);
});

test('pilot.md takes, parks and merges with deck_ticket', () => {
  const step1 = section(PILOT, '1. Problem and spec, with the user', 3);
  assert.match(step1, /`deck_ticket take`/, 'a run is on a live ticket');
  assert.match(
    step1,
    /A direct request is first posted as a `ticket` in the user's words, naming `docs\/design\/<slug>\/architecture\.md`, then taken/,
    'every run is on a ticket (L17)',
  );
  // merge-first L6 moved the merge into the architect (scripts/test/merge-first.test.mjs).
  assert.doesNotMatch(step1, /deck_ticket merge/, "the merge is the architect's, not the pilot's");

  const step3 = section(PILOT, '3. Grilling, with the user', 3);
  assert.match(step3, /a thread of kind `gate1` with `ticket`, `artefact`, `sha`, `branch`, `locked` \(a count\), `slices` and `sliceCount`/);
  assert.match(
    step3,
    /On the Sign off press, `deck_status` `finished: "planned"` with `ticket`, and take the next ticket, same session/,
    'a run can end at Gate 1 as planned (L10)',
  );
  // yellow-agent S4: a signed gate1's ticket is already not live, so the Sign off names no park.
  assert.doesNotMatch(step3, /On the Sign off press, `deck_ticket park`/, 'a signed ticket is not live: a park is refused');
  // pilot-branch S12 (L8): the main deck never takes yellow; the sub-deck's step 4 says where it starts.
  assert.doesNotMatch(step3, /A ticket taken in yellow/);

  const ending = section(PILOT, 'Ending a run');
  assert.match(ending, /The closing report is a `report` item naming its `ticket`/);
});

test('no agent mentions a small ticket, side job or deck_ticket start', () => {
  const agents = fs.readdirSync(path.join(ROOT, 'agents')).filter((name) => name.endsWith('.md'));
  assert.ok(agents.includes('pilot.md'), 'the agents directory was not found');
  for (const name of agents) {
    const text = read(`agents/${name}`).replace(/\s+/g, ' ');
    assert.doesNotMatch(text, /small ticket|side job|side\/<ticket id>|deck_ticket`? `?start/i, `agents/${name} still names the retired small ticket`);
  }
});

// pilot-branch S12 (spec 7, 12, 14, 15; L8, L17, L18, L24, L27): "Modes" became "Sub-deck".
// ticket-states S16's two modes are gone. yellow-agent S1 (L2, L9, L15): "Sub-deck" became "Yellow";
// the yellow run moved to agents/pilot-co-pilot.md, and the pause went with the sub-deck.
const CO_PILOT = 'agents/pilot-co-pilot.md';

test("pilot.md names the main session's pick and the co-pilot names its stop at green", () => {
  const sub = section(PILOT, 'Yellow');
  assert.match(sub, /`pilot budget` prints your `budget`/, 'L8: the budget is read, not a mode');
  assert.match(sub, /Fill an empty lane of yours with `nextTicketOf`'s pick for its stage: a queued question first, then its head; never an implementing ticket/, 'L8, session-row spec 7; three-lanes S10 (spec 2)');
  assert.match(sub, /A plain question carries `recommended`: take that default, record it as \*assumed\*, and continue/, 'spec 17');
  assert.match(section(CO_PILOT, 'Hand-back'), /You stop when the ticket is ready for concluding, as ADR 0066 defines it: QA's walkthrough is posted, or everything left stands on an open blocking question, or the work is finished with nothing to walk/, 'yellow-agent L9');
  // three-lanes S8 moved the gate2's run-report body to QA's `## Concluding` (spec 8).
  assert.match(section('agents/pilot-qa.md', 'Concluding'), /Its body is the run's report: the decisions assumed with their defaults, the hiccups \(blocked, retried or skipped steps\) and the questions queued, each by id/, 'spec 20, B5');
  assert.match(sub, /A `gate2` you post carries the run's report as QA's does; no `report` item/, 'spec 20, B5');
  assert.doesNotMatch(read(PILOT), /## Modes|autonomous|attended|reports the mode/i, 'spec 12: no mode is left');
});

test('the co-pilot never signs or posts a gate; green is concluded by the main session', () => {
  const sub = section(PILOT, 'Yellow');
  assert.match(section(CO_PILOT, 'Steps 4 to 8'), /never post a gate, never sign one or a walkthrough, and never answer for the user/);
  // three-lanes S8: concluding is QA's from the pilot's `need` (spec 8).
  assert.match(sub, /\*\*Concluding\*\*, from the record: `deck_ticket need` hands the ticket to QA, which carries it to the Gate 2 press/, 'L8: green is concluded on the main deck');
  const pilot = read(PILOT).replace(/\s+/g, ' ');
  assert.doesNotMatch(pilot, /in your own name|merge to main/, "no gate is passed on the user's behalf (spec 15)");
  // A18's sub-deck sentence went in clear-waits-co-pilot S2: the co-pilot is marked with `deck_ticket co-pilot` instead.
});

test('pilot.md holds the budget the record gives and names no number for it', () => {
  const sub = section(PILOT, 'Yellow');
  assert.match(sub, /`budget`, the agents you may hold, yourself included/, 'L27');
  const pilot = read(PILOT).replace(/\s+/g, ' ');
  assert.match(pilot, /Count what is live against your `budget` before you spawn/, 'L18');
  assert.doesNotMatch(pilot, /eight-agent|make nine|\b(three|five|eight) (agents|in all)/i, "L27: the number is the record's, never the prompt's");
});

test('pilot.md has no pause rule: it went with the sub-deck', () => {
  assert.doesNotMatch(section(PILOT, 'Yellow'), /\*\*Paused\*\*|finished: "paused"/, 'yellow-agent L15');
});

test('the co-pilot records a refused call as a blocked step and carries on', () => {
  const sub = section(PILOT, 'Yellow');
  assert.match(
    section(CO_PILOT, 'Refused calls'),
    /A refused call is never retried or routed around: record it in the run record as a blocked step with its command, do the work that does not need it, and carry on/,
    'L24',
  );
  assert.match(section('agents/pilot-qa.md', 'Concluding'), /Its body is the run's report: [^.]*the hiccups \(blocked,/, "L24, three-lanes S8: the blocked steps reach the user in QA's gate2");
});

// S18 (spec 17 revised, L22 revised): only a blocking question stops its own ticket turning red.
test('pilot.md says what makes a question blocking, and what it stops', () => {
  const sub = section(PILOT, 'Yellow');
  assert.match(sub, /Never post a question without its `ticket`/, 'no question without a ticket');
  assert.match(
    sub,
    /`blocking: true` only if its answer is unreasonably expensive to revise \(a schema or migration, an auth or trust boundary, a public API shape, irreversible data; never a slice re-cut\) \*and\* no safe assumption exists; its body says both/,
    'the two-part test, its four examples and its one exclusion',
  );
  assert.match(sub, /It refuses only its ticket's `gate2`, on post and on the Sign-off press alike: carry on with everything that does not stand on it/, 'carry on');
  assert.doesNotMatch(read(PILOT), /refuses a `signoff`, a `gate1` or a `gate2`/, 'a gate2 no longer waits on every question');
});

test("pilot-qa resumes from the ticket's qa refs", () => {
  const sub = section(PILOT, 'Yellow');
  assert.match(sub, /\*\*QA on demand\*\*[^.]*reply on a parked ticket's walkthrough arrives with its `ticket`: resume `pilot-qa` from that ticket's `qa` refs/, 'spec 19');
  assert.match(sub, /Never two QA agents on one ticket; each counts within `pilot budget`/, 'three-lanes L12');

  const procedure = section('agents/pilot-qa.md', 'The procedure');
  assert.match(procedure, /Resumed from a parked ticket's `qa` refs for a reply, answer it on the walkthrough thread, then report and stop/);
  // co-pilot-reports S2: the walkthrough-posted report now names the co-pilot as its addressee (spec 1, L3).
  assert.match(procedure, /Spawned by the co-pilot, report to it once it is posted and stop/, 'nobody is there to reply');
});
