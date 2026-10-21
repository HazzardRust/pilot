/**
 * A ticket's state is stored on it (ticket-states spec 1, 2; L3, L6, L8, L11, L12): posting
 * makes it red, signing the `gate1` that names it turns it yellow in that gate's own
 * write, and a ticket stored before states existed reads red while open, closed once
 * resolved. A gate1 names its ticket, and the deck refuses one that does not, by name.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { KIND_GATE1, KIND_GATE2, KIND_REPORT, KIND_TICKET, NOT_YET, SIGN_OFF, TICKET_STATES, stateOf, ticketQueueOf } from '../items.mjs';
import { DeckRefusal, addReply, dismissItem, listItems, moveTicket, postItem, reopenItem, resolveItem, storeFile } from '../store.mjs';
import { renderHomePage } from '../ui/render.mjs';
import { postStored, shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const REPO = path.join('D:', 'work', 'pilot');
const EVIDENCE = { artefact: 'docs/design/x/architecture.md', sha: '0305827', locked: 3, slices: '| S1 |', sliceCount: 3, branch: 'feat/x' };

// The architect's resolved merge thread naming `ticket`: a gate1 waits for one while another red
// ticket shares its repository (merge-first spec 5, L13), as a parked earlier ticket does here.
const ARCHITECT = 'pilot:pilot-architect';
const merged = (ticket) =>
  resolveItem(postItem({ kind: 'question', title: 'Merge?', body: 'Nothing shares its surface.', repo: REPO, ticket, author: ARCHITECT }).id, 'merged nothing', ARCHITECT);

const aTicket = (words = 'fix the thing') =>
  postItem({ kind: KIND_TICKET, sliceCount: 60, title: words, body: shapedTicketBody(words), repo: REPO });
const aGate1 = (ticket) => postItem({ kind: KIND_GATE1, title: 'Gate 1', body: 'The design.', repo: REPO, ...EVIDENCE, ticket });
const aGate2 = (ticket) => postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo: REPO, pr: '#250', sha: '0305827', ticket });
const aReport = (ticket) => postItem({ kind: KIND_REPORT, title: 'Closing report', body: 'Done.', repo: REPO, ticket });
const stored = (title, state) => postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo: REPO, state });
const reread = (id) => listItems().find((item) => item.id === id);
/** How many times `act` writes the store: a transition is in the event's own write (L3). */
const writesOf = (t, act) => {
  const writes = [];
  const rename = fs.renameSync;
  const mock = t.mock.method(fs, 'renameSync', (from, to) => {
    writes.push(to);
    return rename(from, to);
  });
  let result;
  try {
    result = act();
  } finally {
    mock.mock.restore();
  }
  return { result, count: writes.filter((file) => path.resolve(file) === path.resolve(storeFile())).length };
};
const refusedNaming = (...words) => (error) =>
  error instanceof DeckRefusal && words.every((word) => error.message.includes(word));

test('a posted ticket is red', (t) => {
  tempDeck(t);
  const ticket = aTicket();
  assert.equal(ticket.state, 'red');
  assert.equal(reread(ticket.id).state, 'red', 'stored, not only returned');
  assert.deepEqual(TICKET_STATES, ['red', 'yellow', 'green', 'closed']);
});

test('a legacy ticket with no state reads red open and closed resolved', () => {
  assert.equal(stateOf({ kind: KIND_TICKET }), 'red');
  assert.equal(stateOf({ kind: KIND_TICKET, resolvedAt: '2026-10-01T00:00:00.000Z' }), 'closed');
  assert.equal(stateOf({ kind: KIND_TICKET, state: 'yellow' }), 'yellow', 'a stored state wins');
});

test('a gate1 with no ticket is refused by name', (t) => {
  tempDeck(t);
  assert.throws(() => aGate1(undefined), refusedNaming('gate1', 'ticket'));
  assert.throws(() => aGate1('fix the thing'), refusedNaming('ticket', 'an item id'), 'a ticket is named by its id');
  assert.throws(() => aGate1('itm_0123456789ab'), refusedNaming('itm_0123456789ab'), 'an id on no item');

  const closed = aTicket('closed');
  resolveItem(closed.id, 'done');
  assert.throws(() => aGate1(closed.id), refusedNaming(closed.id, 'closed'));

  const signoff = postItem({ kind: 'signoff', title: 'ok?', body: 'Look.', repo: REPO });
  assert.throws(() => aGate1(signoff.id), refusedNaming(signoff.id, 'not a ticket'));

  const yellow = postStored({ kind: KIND_TICKET, title: 'yellow', body: shapedTicketBody('y'), repo: REPO, state: 'yellow' });
  assert.throws(() => aGate1(yellow.id), refusedNaming(yellow.id, 'yellow', 'red'));

  assert.equal(listItems().filter((item) => item.kind === KIND_GATE1).length, 0, 'no gate1 stored');
});

test('signing a gate1 turns its ticket yellow in the same write', (t) => {
  tempDeck(t);
  const ticket = aTicket();
  takeLive(ticket.id);
  const gate = aGate1(ticket.id);
  assert.equal(gate.ticket, ticket.id, 'the gate carries its ticket');
  addReply(gate.id, SIGN_OFF);

  const writes = [];
  const rename = fs.renameSync;
  t.mock.method(fs, 'renameSync', (from, to) => {
    writes.push(to);
    return rename(from, to);
  });
  resolveItem(gate.id, 'Signed off.');

  assert.equal(writes.filter((file) => path.resolve(file) === path.resolve(storeFile())).length, 1, 'one writeDeck');
  assert.equal(reread(ticket.id).state, 'yellow');
  assert.ok(reread(gate.id).resolvedAt);
});

test('a gate1 with no sign-off refuses its resolve and leaves the ticket red', (t) => {
  tempDeck(t);
  const unanswered = aTicket('unanswered');
  takeLive(unanswered.id);
  const withdrawn = aGate1(unanswered.id);
  assert.throws(() => resolveItem(withdrawn.id, 'Withdrawn.'), refusedNaming(withdrawn.id, 'Sign off'), 'no reply at all (merge-first L12)');
  assert.equal(reread(unanswered.id).state, 'red', 'no reply at all');

  const notYet = aTicket('not yet');
  takeLive(notYet.id);
  merged(notYet.id);
  const gate = aGate1(notYet.id);
  addReply(gate.id, NOT_YET);
  assert.throws(() => resolveItem(gate.id, 'Re-posting.'), refusedNaming(gate.id, 'Sign off'), 'Not yet');
  assert.equal(reread(notYet.id).state, 'red', 'Not yet');
});

test('the ticket row draws data-state', () => {
  const ticket = (id, title, extra = {}) => ({ id, kind: KIND_TICKET, title, body: `${title} spec`, repo: REPO, replies: [], ...extra });
  const run = { id: 'run_1', repo: REPO, name: 'pilot', pid: process.pid, startedAt: new Date().toISOString() };
  const page = renderHomePage(
    [
      ticket('t1', 'Apple', { state: 'red' }),
      ticket('t2', 'Zebra', { state: 'yellow', live: true }),
      ticket('t3', 'Legacy'),
      ticket('t4', 'Pear', { state: 'yellow' }),
      ticket('t5', 'Fig', { state: 'green' }),
      ticket('t6', 'Kiwi', { state: 'green', live: true }),
      { id: 'g5', kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo: REPO, ticket: 't5', replies: [] },
    ],
    [run],
    REPO,
  );
  const rowOf = (title) => {
    const end = page.indexOf(`>${title}</a>`);
    assert.notEqual(end, -1, `${title} is on the tab`);
    return page.slice(page.lastIndexOf('<li', end), page.indexOf('</li>', end));
  };

  assert.match(rowOf('Apple'), /^<li data-state="red">/);
  assert.match(rowOf('Kiwi'), /^<li data-state="green" class="in-hand">/, 'the live concluding row is in hand (three-lanes spec 6)');
  assert.match(rowOf('Zebra'), /<span class="ticket-state" data-state="yellow">implementing<\/span>/, 'labelled as the phase (L8)');
  assert.match(rowOf('Legacy'), /^<li data-state="red">/, 'a legacy ticket reads red (L12)');
  // Only the live row says what is happening now (QA D2); a parked one keeps its colour and says where it stands.
  assert.match(rowOf('Apple'), /<span class="ticket-state" data-state="red">planning<\/span>/);
  assert.match(rowOf('Pear'), /<span class="ticket-state" data-state="yellow">planned<\/span>/);
  assert.match(rowOf('Fig'), /<span class="ticket-state" data-state="green">awaiting sign-off<\/span>/, 'with its open gate2');
  assert.match(rowOf('Kiwi'), /<span class="ticket-state" data-state="green">concluding<\/span>/);
});

test('posting a gate2 turns its yellow ticket green', (t) => {
  tempDeck(t);
  const ticket = aTicket();
  takeLive(ticket.id);
  const gate1 = aGate1(ticket.id);
  addReply(gate1.id, SIGN_OFF);
  resolveItem(gate1.id, 'Signed off.');
  assert.equal(reread(ticket.id).state, 'yellow');

  const { result: gate2, count } = writesOf(t, () => aGate2(ticket.id));
  assert.equal(count, 1, 'one writeDeck: the gate and the state together');
  assert.equal(gate2.ticket, ticket.id, 'the gate carries its ticket');
  assert.equal(reread(ticket.id).state, 'green', 'at post, not at sign-off');
  assert.equal(reread(gate2.id).resolvedAt, undefined, 'the gate itself is still open');

  // An unsigned gate is never resolved (merge-first L12): the user's Dismiss is the re-post path (L8).
  dismissItem(gate2.id);
  // A yellow ticket's gate2 leaves it green and parked (yellow-agent S4): a green ticket's gate is posted on it in hand.
  takeLive(ticket.id);
  const again = aGate2(ticket.id);
  assert.equal(reread(ticket.id).state, 'green', 'a gate2 re-posted on its green ticket keeps it green');
  assert.equal(again.ticket, ticket.id);
});

test('a gate2 naming a red or closed ticket is refused by name', (t) => {
  tempDeck(t);
  assert.throws(() => aGate2(undefined), refusedNaming('gate2', 'ticket'));
  assert.throws(() => aGate2('fix the thing'), refusedNaming('ticket', 'an item id'));
  assert.throws(() => aGate2('itm_0123456789ab'), refusedNaming('itm_0123456789ab'));

  const red = aTicket('red');
  assert.throws(() => aGate2(red.id), refusedNaming('gate2', red.id, 'red'));
  const closed = stored('closed', 'green');
  resolveItem(closed.id, 'done');
  assert.throws(() => aGate2(closed.id), refusedNaming('gate2', closed.id, 'closed'));
  const signoff = postItem({ kind: 'signoff', title: 'ok?', body: 'Look.', repo: REPO });
  assert.throws(() => aGate2(signoff.id), refusedNaming(signoff.id, 'not a ticket'));

  assert.equal(listItems().filter((item) => item.kind === KIND_GATE2).length, 0, 'no gate2 stored');
  assert.equal(reread(red.id).state, 'red', 'a refused gate2 moves nothing');
});

test('posting a closing report closes and resolves its green ticket; a report naming a ticket that is not green is refused by name', (t) => {
  tempDeck(t);
  const ticket = stored('green one', 'green');
  const { result: report, count } = writesOf(t, () => aReport(ticket.id));
  assert.equal(count, 1, 'one writeDeck: the report and the close together');
  assert.equal(report.ticket, ticket.id);
  const closed = reread(ticket.id);
  assert.equal(closed.state, 'closed');
  assert.equal(stateOf(closed), 'closed');
  assert.ok(closed.resolvedAt, 'resolved');
  assert.equal(closed.resolution, `closed by ${report.id}`);
  assert.equal(reread(report.id).resolvedAt, undefined, 'the report itself stays open for the user');

  for (const state of ['red', 'yellow']) {
    const other = stored(state, state);
    assert.throws(() => aReport(other.id), refusedNaming('report', other.id, state, 'green'));
    assert.equal(reread(other.id).state, state, `a refused report leaves a ${state} ticket ${state}`);
  }
  assert.throws(() => aReport(ticket.id), refusedNaming(ticket.id, 'closed'), 'a closed ticket closes once');
  assert.throws(() => aReport('the green one'), refusedNaming('ticket', 'an item id'));
  assert.equal(listItems().filter((item) => item.kind === KIND_REPORT).length, 1, 'only the closing report stored');

  const plain = postItem({ kind: KIND_REPORT, title: 'A report', body: 'x', repo: REPO });
  assert.equal(plain.ticket, undefined, 'a report naming no ticket closes nothing');
});

test('a gate naming a ticket with an open gate of its kind is refused naming the open one', (t) => {
  tempDeck(t);
  const ticket = takeLive(aTicket().id);
  const gate1 = aGate1(ticket.id);
  assert.throws(() => aGate1(ticket.id), refusedNaming('gate1', ticket.id, gate1.id));
  addReply(gate1.id, SIGN_OFF);
  resolveItem(gate1.id, 'Signed off.');
  const gate2 = aGate2(ticket.id);
  // A yellow ticket's gate2 leaves it green and parked (yellow-agent S4): a green ticket's gate is posted on it in hand.
  takeLive(ticket.id);
  assert.throws(() => aGate2(ticket.id), refusedNaming('gate2', ticket.id, gate2.id));
  assert.equal(listItems().filter((item) => item.kind === KIND_GATE1 || item.kind === KIND_GATE2).length, 2, 'neither duplicate stored');
});

test('a report naming a ticket whose newest gate2 is open is refused naming it', (t) => {
  tempDeck(t);
  const ticket = takeLive(stored('yellow', 'yellow').id);
  const gate2 = aGate2(ticket.id);
  assert.throws(() => aReport(ticket.id), refusedNaming('report', ticket.id, gate2.id));
  assert.equal(reread(ticket.id).state, 'green', 'a refused report closes nothing');
  addReply(gate2.id, SIGN_OFF);
  resolveItem(gate2.id, 'Signed off.');
  aReport(ticket.id);
  assert.equal(reread(ticket.id).state, 'closed', 'once its gate2 is resolved, the report closes it');
});

test('a ticket closed by its report and reopened is green again, in the green queue', (t) => {
  tempDeck(t);
  const ticket = stored('green one', 'green');
  aReport(ticket.id);
  assert.equal(reread(ticket.id).state, 'closed', 'stored on the close');
  reopenItem(ticket.id);
  assert.equal(stateOf(reread(ticket.id)), 'green');
  assert.deepEqual(ticketQueueOf(listItems(), REPO, 'green').map((item) => item.id), [ticket.id]);
});

test('a gate2 signed and resolved, or dismissed unsigned, leaves the ticket green', (t) => {
  tempDeck(t);
  for (const reply of [SIGN_OFF, NOT_YET, undefined]) {
    const ticket = stored(`yellow ${reply}`, 'yellow');
    takeLive(ticket.id);
    const gate = aGate2(ticket.id);
    if (reply) addReply(gate.id, reply);
    // Only a Sign off resolves a gate (merge-first L12); an unsigned one leaves by the user's Dismiss (L8).
    if (reply === SIGN_OFF) resolveItem(gate.id, 'Resolved.');
    else dismissItem(gate.id);
    const after = reread(ticket.id);
    assert.equal(after.state, 'green', `${reply ?? 'no reply'}: still green`);
    assert.equal(after.resolvedAt, undefined, `${reply ?? 'no reply'}: not closed`);
  }
});

const aRow = (id, title, extra = {}) => ({ id, kind: KIND_TICKET, title, body: `${title} spec`, repo: REPO, replies: [], ...extra });

test('the panel draws three queues in deck order and no closed ticket', () => {
  const run = { id: 'run_1', repo: REPO, name: 'pilot', pid: process.pid, startedAt: new Date().toISOString() };
  const page = renderHomePage(
    [
      aRow('t1', 'Apple', { state: 'red' }),
      aRow('t2', 'Banana', { state: 'yellow' }),
      aRow('t3', 'Cherry', { state: 'green' }),
      aRow('t4', 'Date'),
      aRow('t5', 'Elder', { state: 'closed', resolvedAt: '2026-10-01T00:00:00.000Z', resolution: 'closed by itm_1' }),
      aRow('t6', 'Fig', { state: 'yellow' }),
    ],
    [run],
    REPO,
  );
  const queues = [...page.matchAll(/<details class="ticket-queue" data-queue="(\w+)"[^>]*><summary>(\w+) <span class="count">\d+<\/span><\/summary>([\s\S]*?<\/(?:ol|p)>)<\/details>(?!<\/li>)/g)];
  assert.deepEqual(queues.map(([, state, heading]) => [state, heading]), [['red', 'Red'], ['yellow', 'Yellow'], ['green', 'Green']]);
  const titles = (html) => [...html.matchAll(/<a href="\/thread\/[^"]+">([^<]+)<\/a>/g)].map(([, title]) => title);
  assert.deepEqual(queues.map(([, , , html]) => titles(html)), [['Apple', 'Date'], ['Banana', 'Fig'], ['Cherry']]);
  assert.ok(!page.includes('>Elder</a>'), 'a closed ticket leaves the tab');
  assert.match(queues[2][3], /<span class="next">next<\/span><a [^>]*>Cherry<\/a>/, 'attended, the chain takes green before red (S13, spec 18)');
  assert.match(page, /<summary data-count="5">Tickets<\/summary>/, 'the badge counts the open tickets');
});

test('up and down move a ticket within its own queue only', (t) => {
  tempDeck(t);
  const apple = stored('Apple', 'red');
  const banana = stored('Banana', 'yellow');
  stored('Cherry', 'red');
  const date = stored('Date', 'yellow');
  const titles = (state) => ticketQueueOf(listItems(), REPO, state).map((item) => item.title);

  assert.deepEqual(moveTicket(apple.id, 'down').map((item) => item.title), ['Cherry', 'Apple'], 'past the yellow ticket between');
  assert.deepEqual(titles('yellow'), ['Banana', 'Date'], 'the yellow queue untouched');
  assert.throws(() => moveTicket(banana.id, 'up'), refusedNaming(banana.id, 'head'), 'the head of yellow, though a red ticket is above it');
  assert.deepEqual(moveTicket(date.id, 'up').map((item) => item.title), ['Date', 'Banana']);
  assert.deepEqual(titles('red'), ['Cherry', 'Apple']);
  assert.deepEqual(titles(), ['Cherry', 'Apple'], 'the default queue is red');
});

test("a walkthrough's ticket is an item id, as a gate's is", (t) => {
  tempDeck(t);
  const walk = (ticket) => postItem({ kind: 'walkthrough', title: 'Walk it', body: 'Steps.', repo: REPO, ticket });
  assert.throws(() => walk('the green one'), refusedNaming('ticket', 'an item id'));
  assert.equal(walk('itm_0123456789ab').ticket, 'itm_0123456789ab');
});

const sizeRow = (extra) => {
  const run = { id: 'run_1', repo: REPO, name: 'pilot', pid: process.pid, startedAt: new Date().toISOString() };
  const ticket = { id: 't1', kind: KIND_TICKET, title: 'Apple', body: 'Apple spec', repo: REPO, replies: [], ...extra };
  const page = renderHomePage([ticket], [run], REPO);
  const end = page.indexOf('>Apple</a>');
  assert.notEqual(end, -1, 'the ticket is on the tab');
  return page.slice(page.lastIndexOf('<li', end), page.indexOf('</li>', end));
};

test('a ticket posted without sliceCount is refused: a ticket needs sliceCount', (t) => {
  tempDeck(t);
  assert.throws(
    () => postItem({ kind: KIND_TICKET, title: 'No count', body: shapedTicketBody(), repo: REPO }),
    refusedNaming('a ticket needs sliceCount'),
  );
});

test('a non-count sliceCount is refused', (t) => {
  tempDeck(t);
  for (const sliceCount of ['90', -5, 1.5, null, 1e21]) {
    assert.throws(
      () => postItem({ kind: KIND_TICKET, title: 'Bad', body: shapedTicketBody(), repo: REPO, sliceCount }),
      refusedNaming('sliceCount', 'whole number'),
      `${JSON.stringify(sliceCount)} is not a slice count`,
    );
  }
  assert.equal(postItem({ kind: KIND_TICKET, title: 'Good', body: shapedTicketBody(), repo: REPO, sliceCount: 150 }).sliceCount, 150);
});

const PLAN = { artefact: 'docs/design/x/architecture.md', sliceCount: 11, gate1: 'itm_abc123' };

test(`an unplanned row reads "8 slices"; a planned row reads the plan's count; a ticket with no count shows no size`, () => {
  assert.match(sizeRow({ sliceCount: 8 }), /<span class="ticket-slices">8 slices<\/span>/);
  assert.match(sizeRow({ sliceCount: 1 }), /<span class="ticket-slices">1 slice<\/span>/);
  const planned = sizeRow({ sliceCount: 8, state: 'yellow', plan: PLAN });
  assert.match(planned, /<span class="ticket-slices">11 slices<\/span>/);
  assert.doesNotMatch(planned, /8 slices/, "the plan's count, not the posted one");
  const bare = sizeRow({});
  assert.ok(bare.includes('>Apple</a>'));
  assert.doesNotMatch(bare, /ticket-slices|\d+ slices?\b/, 'no size');
});

test('a stored ticket with estimate reads back without it, and a second read changes nothing', (t) => {
  tempDeck(t);
  const ticket = stored('Old', 'red');
  assert.equal(postStored({ kind: KIND_TICKET, title: 'Minutes', body: shapedTicketBody(), repo: REPO, estimate: 90 }).estimate, undefined);
  const first = reread(listItems().find((item) => item.title === 'Minutes').id);
  assert.equal('estimate' in first, false);
  assert.deepEqual(listItems(), listItems(), 'a second read changes nothing');
  assert.equal(reread(ticket.id).title, 'Old', 'a ticket without one is untouched');
  postItem({ kind: KIND_TICKET, sliceCount: 2, title: 'Write', body: shapedTicketBody(), repo: REPO });
  assert.equal(fs.readFileSync(storeFile(), 'utf8').includes('"estimate"'), false, 'gone from the file after the next write');
});
