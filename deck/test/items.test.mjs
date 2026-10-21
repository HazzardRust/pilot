/**
 * Slice 3: an item is a thread the user and the pilot argue in.
 *
 * Three shapes of test, matching the three things the slice claims. The item
 * vocabulary — what a kind is, which fields it takes, whether it belongs in
 * `Yours` — is a unit test against `deck/items.mjs`, which touches no disk and
 * no socket. The thread itself — who may write to it, who may close it, what
 * comes back to the agent — runs against the store, because a thread is an
 * ordered thing that has to survive being written down. The page runs against
 * a real HTTP server on an ephemeral port, because "renders differently" is a
 * claim about bytes a browser receives.
 *
 * Every test takes its own store directory and its own port. Nothing here may
 * touch the real store or port 4321: this machine runs a real deck.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { deckOnAPort, postStored, tempDeck } from '../testUtils.mjs';

const {
  KINDS,
  MAX_OPTIONS,
  MAX_SCREENS,
  appearsInYours,
  extraFieldsFor,
  specFor,
  isOpen,
  replyPrompt,
} = await import('../items.mjs');

const {
  DeckRefusal,
  MAX_TEXT_BYTES,
  addPilotMessage,
  addReply,
  listItems,
  postItem,
  repliesSince,
  resolveItem,
} = await import('../store.mjs');

const { renderDeckPage, renderThreadPage } = await import('../ui/render.mjs');

const { browserCount, callTool } = await import('../server.mjs');

/**
 * The next server-sent event, with a deadline. The failure these tests exist to catch
 * is an event that never arrives, and an unbounded `read()` turns that into a parked
 * test rather than a red one.
 */
async function nextEvent(reader, what) {
  const read = reader.read().then(({ value }) => new TextDecoder().decode(value));
  const event = await Promise.race([read, sleep(5000, null, { ref: false })]);
  assert.ok(event !== null, `no event arrived within 5s after ${what}`);
  return event;
}

/** Wait for something the deck does on a callback, rather than guessing a sleep. */
async function until(predicate, what) {
  for (let attempt = 0; attempt < 200 && !predicate(); attempt += 1) await sleep(5);
  assert.ok(predicate(), what);
}

const aQuestion = (over = {}) => ({
  kind: 'question',
  title: 'Which port?',
  body: 'The deck wants one fixed port. I recommend 4321.',
  options: ['4321', '4317', 'let the daemon pick'],
  recommended: '4321',
  ...over,
});

const aSignoff = (over = {}) => ({
  kind: 'signoff',
  title: 'Is the thread slice done?',
  body: 'Four messages, closed by the pilot. I recommend shipping it.',
  ...over,
});

const aWalkthrough = (over = {}) => ({
  kind: 'walkthrough',
  title: 'Does the jobs page filter?',
  body: 'Three screens, then tell me what you saw.',
  url: 'http://localhost:3260/jobs',
  login: 'the seeded operator in .env.local',
  screens: ['open /jobs', 'set the status filter to Done', 'reload'],
  ...over,
});

// --- what an item of each kind is ------------------------------------------

test('the deck knows its kinds, refuses posting any other, and still reads one already stored', (t) => {
  tempDeck(t);
  assert.deepEqual(KINDS, ['question', 'walkthrough', 'signoff', 'report', 'ticket', 'audit', 'gate1', 'gate2']);
  // Known and unknown, asked the way the rest of the package asks: a known kind has
  // a spec of its own, an unknown one gets the generic spec every kind is entitled to.
  assert.deepEqual(specFor('walkthrough').fields.map((field) => field.name), [
    'slice',
    'repo',
    'dir',
    'url',
    'login',
    'screens',
    'ticket',
    'longer',
    'blocking',
  ]);
  assert.deepEqual(
    specFor('handoff').fields.map((field) => field.name),
    ['slice', 'repo', 'next', 'also'],
    'every kind names the slice and the repository it is about; a chain hand-off names its tickets too',
  );
  assert.equal(specFor('handoff').options, false);
  assert.equal(specFor('ticket').options, false, 'a ticket is agreed work stored for later, never a question with answers');

  // Posting an unknown kind is refused since thread-types-phase L3 (ADR 0051); storing one is not.
  assert.throws(() => postItem({ kind: 'note', title: 'Context is at 40%', body: 'Start a fresh pilot.' }), /kind must be one of/);
  const item = postStored({ kind: 'note', title: 'Context is at 40%', body: 'Start a fresh pilot.' });

  assert.equal(item.kind, 'note', 'an unknown kind already stored still reads (A11)');
  assert.equal(listItems().length, 1);
});

test('an item of a kind the deck does not know never appears in Yours (A11)', (t) => {
  tempDeck(t);
  const unknown = postStored({ kind: 'note', title: 'Context is at 40%', body: 'Start a fresh pilot.' });
  assert.equal(appearsInYours(unknown), false, 'an unknown kind is never the user\'s next action');
  assert.equal(isOpen(unknown), true, 'it is still an open item, it just is not the user\'s');
});

test('Yours is rendered from an open item of a known kind, and a closed one is nobody\'s', (t) => {
  tempDeck(t);
  const item = postItem(aQuestion());
  assert.equal(appearsInYours(item), true);

  const resolved = resolveItem(item.id, '4321 it is.');

  assert.equal(isOpen(resolved), false);
  assert.equal(appearsInYours(resolved), false, 'a closed thread is not waiting on anyone');
});

test('a kind-specific field in a tool schema names the kinds that really carry it', async () => {
  // The "question and signoff only" prose is derived from the spec table rather than
  // written out beside it. A field the table gives no kind at all would derive the
  // empty string and leave " only: ..." in front of the agent, which is worse than the
  // hardcoded sentence it replaced.
  const { TOOLS } = await import('../tools.mjs');
  const post = TOOLS.find((tool) => tool.name === 'deck_post').inputSchema.properties;

  for (const [field, schema] of Object.entries(post)) {
    for (const kind of schema.description?.match(/^(.*?) only:/)?.[1].split(/, | and /) ?? []) {
      assert.ok(extraFieldsFor(kind).includes(field), `${field}: no ${JSON.stringify(kind)} carries it`);
    }
  }
});

test('a walkthrough asks for dot points and a question does not', () => {
  assert.match(replyPrompt('walkthrough').placeholder, /^- /m, 'the box shows the shape it wants');
  assert.match(replyPrompt('walkthrough').label, /dot point/i);
  assert.match(replyPrompt('walkthrough').label, /per step/i, 'what was seen per step, not per screen');
  assert.doesNotMatch(`${replyPrompt('walkthrough').label} ${replyPrompt('walkthrough').placeholder}`, /page|filter|reload|screen/i, 'not web-only wording');
  assert.doesNotMatch(replyPrompt('question').label, /dot point/i);
  assert.ok(replyPrompt('handoff').label, 'an unknown kind still gets a usable reply box');
});

// --- the fields a kind carries ---------------------------------------------

test('a question carries the options the pilot offered and the one it recommends', (t) => {
  tempDeck(t);
  const item = postItem(aQuestion());
  const [stored] = listItems();
  assert.deepEqual(stored.options, ['4321', '4317', 'let the daemon pick']);
  assert.equal(stored.recommended, '4321');
  assert.equal(stored.id, item.id);
});

test('a recommendation that is not one of the options is refused', (t) => {
  tempDeck(t);
  assert.throws(() => postItem(aQuestion({ recommended: '9999' })), {
    name: 'DeckRefusal',
    message: /recommended/,
  });
  assert.deepEqual(listItems(), [], 'nothing is stored when the recommendation is not on offer');
});

test('a walkthrough carries the URL, the login and the screens', (t) => {
  tempDeck(t);
  postItem(aWalkthrough());
  const [stored] = listItems();
  assert.equal(stored.url, 'http://localhost:3260/jobs');
  assert.equal(stored.login, 'the seeded operator in .env.local');
  assert.deepEqual(stored.screens, ['open /jobs', 'set the status filter to Done', 'reload']);
});

test('a field a kind has no use for is refused rather than quietly dropped', (t) => {
  tempDeck(t);
  assert.throws(() => postItem(aQuestion({ url: 'http://localhost:3260' })), {
    name: 'DeckRefusal',
    message: /question.*url/s,
  });
  assert.throws(() => postItem({ kind: 'handoff', title: 'x', body: 'y', options: ['a'] }), {
    name: 'DeckRefusal',
    message: /handoff.*options/s,
  });
  assert.deepEqual(listItems(), []);
});

test('the new fields are held to the deck\'s credential refusal and its size limit (A6)', (t) => {
  tempDeck(t);

  assert.throws(() => postItem(aWalkthrough({ login: 'password: hunter2hunter2hunter2' })), {
    name: 'DeckRefusal',
    message: /looks like/,
  });
  assert.throws(() => postItem(aQuestion({ options: ['sk-' + 'a'.repeat(24), 'no'], recommended: 'no' })), {
    name: 'DeckRefusal',
    message: /looks like/,
  });
  assert.throws(
    () => postItem(aWalkthrough({ screens: ['x'.repeat(MAX_TEXT_BYTES + 1)] })),
    { name: 'DeckRefusal', message: /longer than the deck accepts/ },
  );
  assert.deepEqual(listItems(), [], 'a refused item leaves nothing behind');
});

test('the options on one question are bounded', (t) => {
  tempDeck(t);
  const tooMany = Array.from({ length: MAX_OPTIONS + 1 }, (_, index) => `option ${index}`);
  assert.throws(() => postItem(aQuestion({ options: tooMany, recommended: 'option 0' })), {
    name: 'DeckRefusal',
    message: new RegExp(String(MAX_OPTIONS)),
  });
  assert.throws(() => postItem(aQuestion({ options: 'just the one', recommended: undefined })), {
    name: 'DeckRefusal',
  });
});

test('a question body longer than a screen is refused, and other kinds are not held to it (L7)', (t) => {
  tempDeck(t);
  const screen = 'x'.repeat(1200);

  assert.equal(postItem(aQuestion({ body: screen })).body, screen, 'a screen is allowed');
  assert.throws(() => postItem(aQuestion({ body: `${screen}x` })), {
    name: 'DeckRefusal',
    message: /1200 characters/,
  });
  assert.equal(postItem({ kind: 'walkthrough', title: 'long', body: `${screen}x` }).kind, 'walkthrough');
});

// --- the thread ------------------------------------------------------------

test('the pilot\'s push-back joins the thread it names, marked as the pilot\'s', (t) => {
  tempDeck(t);
  const item = postItem(aQuestion());
  addReply(item.id, '4317');

  addPilotMessage(item.id, '4317 is the OpenTelemetry collector\'s port. Still 4317?');

  const [stored] = listItems();
  assert.deepEqual(
    stored.replies.map((message) => [message.from, message.text]),
    [
      ['user', '4317'],
      ['pilot', '4317 is the OpenTelemetry collector\'s port. Still 4317?'],
    ],
    'the thread keeps the order the argument happened in',
  );
});

test('a reply from the user never closes the thread', (t) => {
  tempDeck(t);
  const item = postItem(aQuestion());

  addReply(item.id, '4321, fine');

  const [stored] = listItems();
  assert.equal(isOpen(stored), true, 'only the pilot closes a thread');
  assert.equal(stored.resolvedAt, undefined);
});

test('the pilot closes the thread, and only the user may say anything more', (t) => {
  tempDeck(t);
  const item = postItem(aQuestion());
  addReply(item.id, '4321, fine');

  const resolved = resolveItem(item.id, 'Locked: 4321.');

  assert.equal(resolved.resolution, 'Locked: 4321.');
  assert.match(resolved.resolvedAt, /^\d{4}-\d\d-\d\dT/);
  assert.throws(() => addPilotMessage(item.id, 'one more thing'), { name: 'DeckRefusal', message: /closed/ });
  assert.throws(() => resolveItem(item.id, 'again'), { name: 'DeckRefusal', message: /closed/ });
  assert.equal(listItems()[0].replies.length, 1, 'and neither of those appended anything');

  // The user's own reply is the one exception, and the asymmetry is the point:
  // the pilot closed the thread on purpose, so it has nothing more to add, while
  // the user may have been typing as it closed. `addReply` reopens rather than
  // throwing their words away (Gate 2, 2026-09-22); `deck/test/reopen.test.mjs`
  // pins what the reopened thread then looks like.
  addReply(item.id, 'actually, wait');

  const reopened = listItems()[0];
  assert.equal(isOpen(reopened), true, 'their reply reopened the thread');
  assert.equal(
    reopened.replies.at(-1).text,
    'actually, wait',
    'and the words they typed are the last thing in it, not just the reopening',
  );
});

test('a message to an item that is not on the deck is refused, whoever sent it', (t) => {
  tempDeck(t);
  assert.throws(() => addPilotMessage('itm_000000000000', 'hello'), { message: /no item itm_000000000000/ });
  assert.throws(() => resolveItem('itm_000000000000', 'done'), { message: /no item itm_000000000000/ });
});

test('the pilot never hears its own messages back as replies', (t) => {
  tempDeck(t);
  const item = postItem(aQuestion());

  addPilotMessage(item.id, 'a push-back');
  addReply(item.id, 'the answer');
  addPilotMessage(item.id, 'another push-back');

  const { replies } = repliesSince(0);
  assert.deepEqual(
    replies.map((reply) => reply.text),
    ['the answer'],
    'deck_wait wakes a session for the user\'s words, never for its own',
  );
});

test('a four-message thread ends closed by the pilot, not by the user\'s reply', (t) => {
  tempDeck(t);
  const item = postItem(aQuestion());

  addReply(item.id, 'let the daemon pick');
  addPilotMessage(item.id, 'Then the README cannot name a URL. Still?');
  assert.equal(isOpen(listItems()[0]), true, 'the argument is not over yet');
  addReply(item.id, 'fair. 4321.');
  assert.equal(isOpen(listItems()[0]), true, 'two replies from the user still do not close it');

  resolveItem(item.id, 'Locked: 4321, fixed, loopback only.');

  const [stored] = listItems();
  assert.equal(stored.replies.length + 1, 4, 'the item is the first message; three more followed');
  assert.equal(isOpen(stored), false);
  assert.equal(stored.resolution, 'Locked: 4321, fixed, loopback only.');
});

// --- the page --------------------------------------------------------------

test('a question renders its options as something to click, with the recommendation marked', (t) => {
  tempDeck(t);
  const page = renderThreadPage(postItem(aQuestion()));

  assert.match(page, /<button[^>]*name="choice"[^>]*value="4321"/, 'each option is a one-click reply');
  assert.match(page, /value="let the daemon pick"/);
  // Bound to the option it marks, not to the page: the fixture's own body says
  // "I recommend 4321", so /recommend/i alone passed with the marker deleted.
  assert.match(
    page,
    /value="4321"[^>]*>4321 <span class="quiet">\(recommended\)/,
    'the marker sits on the option the pilot recommended',
  );
  assert.doesNotMatch(page, /value="4317"[^>]*>4317 <span class="quiet">/, 'and on no other');
  assert.match(page, /<textarea/, 'free text is always available beside the options');
});

test('a sign-off offers its verdicts as buttons and asks the user for one', (t) => {
  tempDeck(t);
  const item = postItem(aSignoff());
  const page = renderThreadPage(listItems()[0]);

  assert.equal(item.kind, 'signoff', 'the third known kind is storable like the other two');
  assert.match(page, /<button[^>]*name="choice"[^>]*value="Sign off"/, 'a verdict is one click');
  assert.match(page, /value="Not yet"/);
  assert.match(page, /Your verdict/, 'the box asks for a verdict, not for an answer');
  assert.doesNotMatch(page, /Login/, 'a sign-off is not a walkthrough');
  assert.equal(appearsInYours(item), true, 'an open sign-off is the user\'s next action');
});

test('the three ways a pilot gets its options wrong each come back as a refusal', (t) => {
  tempDeck(t);
  const most = Array.from({ length: MAX_OPTIONS }, (unused, index) => `option ${index + 1}`);

  assert.throws(() => postItem(aQuestion({ options: [], recommended: undefined })), /must not be an empty list/);
  assert.throws(() => postItem(aQuestion({ options: undefined })), /recommended must be one of the options/);
  assert.throws(() => postItem(aQuestion({ options: [...most, 'one too many'], recommended: 'option 1' })), new RegExp(`at most ${MAX_OPTIONS} options`));
  assert.equal(postItem(aQuestion({ options: most, recommended: 'option 1' })).options.length, MAX_OPTIONS, 'exactly the most is not one too many');
});

test('a walkthrough holds a whole feature\'s procedure: forty steps, and not one more', (t) => {
  // 2026-09-15: QA moved from the end of every slice to the end of the feature, and the
  // QA agent's one walkthrough item became the step-by-step procedure the user works
  // through before Gate 2. Twelve screens fitted a slice; a procedure derived from a
  // feature's spec needs room for every behaviour in the order a user meets them.
  tempDeck(t);
  const most = Array.from({ length: MAX_SCREENS }, (unused, index) => `step ${index + 1}`);

  assert.ok(MAX_SCREENS >= 40, 'a feature-level procedure needs room for forty steps');
  assert.equal(postItem(aWalkthrough({ screens: most })).screens.length, MAX_SCREENS, 'exactly the most is not one too many');
  assert.throws(
    () => postItem(aWalkthrough({ screens: [...most, 'one too many'] })),
    new RegExp(`at most ${MAX_SCREENS} screens`),
  );
});

test('a tool argument that is not what it has to be comes back as a refusal', (t) => {
  tempDeck(t);
  assert.throws(() => callTool('deck_reply', { text: 'no id' }), /id must be the item id/);
  assert.throws(() => callTool('deck_resolve', { id: '   ', resolution: 'x' }), /id must be the item id/);
  assert.throws(() => callTool('deck_read', { open: 'yes' }), /open must be true or false/);
});

test('a walkthrough shows the URL, the login and the screens', (t) => {
  tempDeck(t);
  const page = renderThreadPage(postItem(aWalkthrough()));

  assert.match(page, /<a href="http:\/\/localhost:3260\/jobs"/, 'the URL is there to be clicked');
  assert.match(page, /the seeded operator in \.env\.local/);
  assert.match(page, /set the status filter to Done/);
  assert.match(page, /dot point/i, 'the reply box asks for dot points');
});

test('a URL that is not http is shown as text, never as a link', (t) => {
  tempDeck(t);
  const page = renderThreadPage(postItem(aWalkthrough({ url: 'javascript:alert(1)' })));

  assert.doesNotMatch(page, /href="javascript:/i, 'a scheme a browser would execute is never an href');
  assert.match(page, /javascript:alert\(1\)/, 'the pilot still sees what it posted');

  const secure = renderThreadPage(postItem(aWalkthrough({ url: 'https://example.test/jobs' })));
  assert.match(secure, /<a href="https:\/\/example\.test\/jobs"/, 'https is a link as much as http is');

  const notAUrl = renderThreadPage(postItem(aWalkthrough({ url: 'the staging box — ask ops' })));
  assert.match(notAUrl, /<dd>the staging box — ask ops<\/dd>/, 'a string no parser accepts is text');
});

test('a question posted with no options at all is a page, not a 500', (t) => {
  tempDeck(t);
  const page = renderThreadPage(postItem(aQuestion({ options: undefined, recommended: undefined })));

  // Re-pinned by S12: the deck now offers its own "Teach me" on every question,
  // so the claim is that nothing the *pilot* did not offer is on the page.
  assert.deepEqual(
    page.match(/name="choice" value="[^"]*"/g),
    ['name="choice" value="Teach me"'],
    'the deck\'s own teaching is the only thing to click when the pilot offered nothing',
  );
  assert.match(page, /<textarea/, 'and the box to type in is still there');
});

test('the page says which of the two wrote each message', (t) => {
  tempDeck(t);
  const item = postItem(aQuestion());
  addReply(item.id, 'let the daemon pick');
  addPilotMessage(item.id, 'Then the README cannot name a URL.');

  const page = renderThreadPage(listItems()[0]);

  // `md` is on the box because S9 renders a message as markdown; `from-user` and
  // `from-pilot` are what say whose words they are, and they still do.
  assert.match(page, /class="reply md from-user"><span class="who">you ·/, "the user's words are marked as theirs");
  assert.match(page, /class="reply md from-pilot"><span class="who by-pilot">pilot ·/, "and the pilot's as the pilot's (run-record S1)");
});

test('a kind the deck does not know renders generically and asks nothing kind-specific', (t) => {
  tempDeck(t);
  const page = renderThreadPage(
    postStored({ kind: 'note', title: 'Context is at 40%', body: 'Bring the artefact current.' }),
  );

  assert.match(page, /Context is at 40%/);
  assert.match(page, /Bring the artefact current\./);
  assert.match(page, /<textarea/, 'a generic item is still answerable');
  assert.doesNotMatch(page, /name="choice"/, 'no options it was never given');
  assert.doesNotMatch(page, /Login/, 'no walkthrough chrome on something that is not one');
});

test('everything the pilot posted and the user typed is escaped, never rendered as HTML', (t) => {
  tempDeck(t);
  // The third option carries both quote characters, because an option is rendered
  // into `value="..."` and a raw quote there closes the attribute and opens whatever
  // follows as markup. `&quot;` and `&#39;` were the two escapes nothing else noticed.
  const quoted = `"4321" or '4317'`;
  const item = postItem(
    aQuestion({
      title: '<script>alert(1)</script>',
      options: ['<img onerror=alert(2)>', quoted],
      recommended: '<img onerror=alert(2)>',
    }),
  );
  addReply(item.id, '<b>bold</b>');
  addPilotMessage(item.id, '<iframe src=x>');

  const page = renderThreadPage(listItems()[0]);

  assert.doesNotMatch(page, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(page, /<img onerror/);
  assert.doesNotMatch(page, /<b>bold<\/b>/);
  assert.doesNotMatch(page, /<iframe/);
  assert.match(page, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(page, /&lt;iframe src=x&gt;/);
  assert.match(page, /value="&quot;4321&quot; or &#39;4317&#39;"/, 'both quotes are escaped in place');
  for (const [, value] of page.matchAll(/value="([^"]*)"/g)) {
    assert.doesNotMatch(value, /['"]/, `a raw quote reached an attribute: ${value}`);
  }
});

test('a closed thread shows how it was closed and offers no reply box', (t) => {
  tempDeck(t);
  const item = postItem(aQuestion());
  addReply(item.id, '4321');
  resolveItem(item.id, 'Locked: 4321.');

  const page = renderThreadPage(listItems()[0]);

  assert.match(page, /Locked: 4321\./);
  assert.doesNotMatch(page, /<textarea/, 'there is nothing left to say to a closed thread');
  assert.doesNotMatch(page, /name="choice"/);
});

/**
 * Three tests stood here: that the page parked the draft in `sessionStorage`
 * per thread, that a `changed` event owed a reload rather than taking one while
 * the box had focus, and that a blur into the form's own Send button did not
 * collect that owed reload. All three pinned machinery whose only job was to
 * survive a reload, and ADR 0016 removed the reload instead — with it the draft
 * store, the deferral and the blur guard all go, which is the subtraction the
 * slice is for. What replaces them is `deck/test/live.test.mjs`: the region
 * holding the box is never swapped, so there is nothing to save and put back.
 *
 * What is still this file's business is that the thread page parks no draft
 * any more, because a page with both a live update and a draft store would put
 * a stale draft back over a box the user had just emptied.
 */
test('the thread page parks no draft (ADR 0016)', (t) => {
  tempDeck(t);
  const item = postItem(aQuestion());

  const page = renderThreadPage(listItems()[0]);

  assert.ok(!page.includes('pilot-deck-draft:' + item.id), 'no draft parked to survive a reload');
});

test('the deck\'s list page shows each item and links to its thread', (t) => {
  tempDeck(t);
  const item = postItem(aQuestion());

  const page = renderDeckPage(listItems(), []);

  assert.match(page, /Which port\?/);
  assert.ok(page.includes(`/thread/${item.id}`), 'the list is a way in to the argument');
});

// --- over HTTP, which is where the user actually is ------------------------

const postForm = (base, body) =>
  fetch(`${base}/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    redirect: 'manual',
  });

const callApi = (base, name, args) =>
  fetch(`${base}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, arguments: args }),
  });

const textOf = (result) => result.content[0].text;

test('a thread has its own page, and an id that is not on the deck is a 404', async (t) => {
  const base = await deckOnAPort(t);
  const item = postItem(aQuestion());

  const response = await fetch(`${base}/thread/${item.id}`);
  const page = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(page, /Which port\?/);
  assert.equal((await fetch(`${base}/thread/itm_000000000000`)).status, 404);
  // An address nobody could have meant is a thread that is not there, not a
  // request the deck fell over on: `%` alone is not a decodable escape.
  assert.equal((await fetch(`${base}/thread/%`)).status, 404);
  assert.equal((await fetch(`${base}/thread/`)).status, 404);
});

test('picking an option is a reply in the user\'s own words, stored verbatim', async (t) => {
  const base = await deckOnAPort(t);
  const item = postItem(aQuestion());

  const response = await postForm(base, new URLSearchParams({ id: item.id, choice: '4317', text: '' }));

  assert.equal(response.status, 303);
  assert.equal(
    response.headers.get('location'),
    `/thread/${item.id}#reply`,
    'the user stays in the thread',
  );
  assert.deepEqual(listItems()[0].replies.map((reply) => reply.text), ['4317']);
});

/**
 * The reply is a POST answered with a redirect, and a redirect with no fragment
 * lands the browser at the top of the page — so every time the user said
 * something the deck threw them back to the header and they had to scroll down
 * to read the answer. Their words at Gate 2: "it instantly jumps me to the top
 * of the page and i dont like it." The fragment names the reply box, which sits
 * directly under the newest message, so they land where they were.
 */
test('replying leaves the user where they were typing, not at the top of the page', async (t) => {
  const base = await deckOnAPort(t);
  const item = postItem(aQuestion());

  const response = await postForm(base, new URLSearchParams({ id: item.id, text: 'the answer' }));

  assert.equal(response.status, 303);
  assert.ok(
    response.headers.get('location').endsWith('#reply'),
    'the redirect names the reply box, so the browser does not scroll to the header',
  );

  const page = await (await fetch(`${base}/thread/${item.id}`)).text();
  assert.match(page, /id="reply"/, 'and the anchor it names is really on the page');
  // The reply box is sticky, and a browser scrolls a sticky target to where it
  // is stuck, not to where it sits — a fixed distance from the top however long
  // the thread, which is the page jumping up on every reply (Gate 2, 2026-09-27).
  // So the anchor stands in the flow at the end of the thread, outside the box.
  assert.equal(page.split('id="reply"').length, 2, 'one anchor');
  assert.ok(
    page.indexOf('id="reply"') < page.indexOf('data-live="reply"'),
    'the anchor is not inside the sticky reply box',
  );
});

test('an option picked beside typed words keeps both, in that order', async (t) => {
  const base = await deckOnAPort(t);
  const item = postItem(aQuestion());

  await postForm(base, new URLSearchParams({ id: item.id, choice: '4321', text: 'but only if it is free' }));

  assert.equal(listItems()[0].replies[0].text, '4321\n\nbut only if it is free');
});

test('the dot points typed into a walkthrough reach the agent verbatim', async (t) => {
  const base = await deckOnAPort(t);
  const item = postItem(aWalkthrough());
  const typed = '- /jobs rendered\n- the Done filter did nothing\n- reload lost the filter';

  // What a browser sends is not what was typed: HTML form submission normalises
  // every newline in a textarea to CRLF. Found by driving the real thing —
  // a test that posted the string as typed passed while Chrome did not.
  await postForm(base, new URLSearchParams({ id: item.id, text: typed.replace(/\n/g, '\r\n') }));

  const payload = JSON.parse(textOf(callTool('deck_read', {})));
  assert.equal(payload.items[0].replies[0].text, typed, 'not reflowed, not bulleted, not re-ended');
});

test('the pilot argues and closes the thread over the API it already has', async (t) => {
  const base = await deckOnAPort(t);
  const posted = await callApi(base, 'deck_post', aQuestion());
  assert.equal(posted.status, 200);
  const { id } = listItems()[0];

  await postForm(base, new URLSearchParams({ id, text: 'let the daemon pick' }));
  const pushedBack = await callApi(base, 'deck_reply', { id, text: 'Then no URL can be named. Still?' });
  await postForm(base, new URLSearchParams({ id, text: 'fair. 4321.' }));
  const closed = await callApi(base, 'deck_resolve', { id, resolution: 'Locked: 4321.' });

  assert.equal(pushedBack.status, 200);
  assert.equal(closed.status, 200);
  const [stored] = listItems();
  assert.equal(stored.replies.length, 3);
  assert.equal(isOpen(stored), false);
});

test('a thread the pilot never closed is what deck_read returns when it asks for open ones', (t) => {
  tempDeck(t);
  const closed = postItem(aQuestion({ title: 'Settled' }));
  postItem(aQuestion({ title: 'Still arguing' }));
  resolveItem(closed.id, 'done');

  const all = JSON.parse(textOf(callTool('deck_read', {})));
  const open = JSON.parse(textOf(callTool('deck_read', { open: true })));

  assert.deepEqual(all.items.map((item) => item.title), ['Settled', 'Still arguing']);
  assert.deepEqual(open.items.map((item) => item.title), ['Still arguing']);
  assert.equal(open.total, 2, 'the pilot is still told how much deck it did not look at');
});

test('the browser is told when the deck changes under it', async (t) => {
  const base = await deckOnAPort(t);
  const item = postItem(aQuestion());

  const controller = new AbortController();
  t.after(() => controller.abort());
  const stream = await fetch(`${base}/events`, {
    headers: { accept: 'text/event-stream' },
    signal: controller.signal,
  });
  assert.match(stream.headers.get('content-type'), /text\/event-stream/);

  const reader = stream.body.getReader();
  await postForm(base, new URLSearchParams({ id: item.id, text: 'a reply' }));

  assert.match(await nextEvent(reader, 'a reply typed into the form'), /event: changed/);

  // The form is not the only writer. A push-back the pilot sends over the API has
  // to reach the open page the same way, or the user sits looking at a thread that
  // has already moved on. This is the assertion on `WRITING_TOOLS`.
  const pushedBack = await callApi(base, 'deck_reply', { id: item.id, text: 'Still?' });
  assert.equal(pushedBack.status, 200);

  assert.match(await nextEvent(reader, 'a deck_reply over the API'), /event: changed/);
});

test('a browser that goes away takes its listener on the deck with it', async (t) => {
  // `changes.setMaxListeners(0)` is there for the sessions parked in `deck_wait`,
  // and it means a stream that never unsubscribed would leak in silence: no
  // warning, just a listener per reload for as long as the daemon lives.
  const base = await deckOnAPort(t);
  await until(() => browserCount() === 0, 'no listener is left over from an earlier test');

  const controller = new AbortController();
  const stream = await fetch(`${base}/events`, {
    headers: { accept: 'text/event-stream' },
    signal: controller.signal,
  });
  assert.equal(stream.status, 200);
  await until(() => browserCount() === 1, 'the open stream is listening for changes');

  controller.abort();

  await until(() => browserCount() === 0, 'the closed stream unsubscribed');
});

test('the stdio client forwards a thread tool whose answer is a sentence, not JSON', async (t) => {
  // The session's cursor is read out of the answer to `deck_read` and
  // `deck_wait`, which are JSON. `deck_reply` and `deck_resolve` answer in a
  // sentence, and a client that tried to parse one of those for a cursor would
  // turn a working tool call into an error the agent has no way to act on.
  const base = await deckOnAPort(t);
  const previous = process.env.PILOT_DECK_PORT;
  process.env.PILOT_DECK_PORT = new URL(base).port;
  t.after(() => {
    if (previous === undefined) delete process.env.PILOT_DECK_PORT;
    else process.env.PILOT_DECK_PORT = previous;
  });
  const { callDeckTool } = await import('../client.mjs');
  const item = postItem(aQuestion());

  const pushedBack = await callDeckTool('deck_reply', { id: item.id, text: 'Still?' });
  const closed = await callDeckTool('deck_resolve', { id: item.id, resolution: 'Locked.' });

  assert.match(textOf(pushedBack), new RegExp(item.id));
  assert.match(textOf(closed), /Locked\./);
});

test('a deck_read tells the session the deck’s seq without moving its cursor', async (t) => {
  // Slice 2's B1: only a wait may advance the cursor. `deck_read` still reports the
  // seq — an agent that stopped being told it would have no idea how much deck it had
  // not looked at — but a cursor taken from a read steps past replies on items outside
  // the read's window, and `deck_wait` would then skip them for ever.
  const base = await deckOnAPort(t);
  const previous = process.env.PILOT_DECK_PORT;
  process.env.PILOT_DECK_PORT = new URL(base).port;
  t.after(() => {
    if (previous === undefined) delete process.env.PILOT_DECK_PORT;
    else process.env.PILOT_DECK_PORT = previous;
  });
  const { callDeckTool } = await import('../client.mjs');
  const item = postItem(aQuestion());
  addReply(item.id, 'the reply a read must not step over');

  const read = JSON.parse(textOf(await callDeckTool('deck_read', {})));
  assert.ok(read.seq > 0, 'the read still reports where the deck has got to');

  const waited = JSON.parse(textOf(await callDeckTool('deck_wait', { timeout: 200 })));
  assert.deepEqual(
    waited.replies.map((reply) => reply.text),
    ['the reply a read must not step over'],
    'the wait still hands over the reply the read had already seen',
  );
});

test('the two rules a pilot meets first come back as refusals it can read', async (t) => {
  // A kind is an open string but it is still a name, and a kind takes only the
  // fields it renders. Both are rules a pilot trips over before it trips over
  // anything else, so both have to say what to do instead rather than 500.
  const base = await deckOnAPort(t);

  const notAName = await callApi(base, 'deck_post', {
    kind: 'a whole sentence about what I want from you',
    title: 'x',
    body: 'y',
  });
  const wrongField = await callApi(base, 'deck_post', {
    kind: 'handoff',
    title: 'x',
    body: 'y',
    screens: ['one'],
  });

  assert.equal(notAName.status, 400);
  assert.match((await notAName.json()).error, /kind must be a short name/);
  assert.equal(wrongField.status, 400);
  assert.match((await wrongField.json()).error, /a handoff item takes no screens/);
  assert.deepEqual(listItems(), [], 'neither refusal left anything on the deck');
});

test('a refusal from the thread tools reaches the agent as a refusal, not a crash', async (t) => {
  const base = await deckOnAPort(t);
  const response = await callApi(base, 'deck_reply', { id: 'itm_000000000000', text: 'hello' });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /no item itm_000000000000/);
  assert.ok(DeckRefusal, 'the refusal class is what carried it');
});
