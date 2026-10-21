/**
 * S5 of independence: Create opens a named thread for the live pilot (spec 1, 2,
 * 3's live half, 3a, 3b, 21), and `deck_wait` parks at most 55 minutes and says
 * when to stop listening (spec 19, 20; L1, L4).
 *
 * A created thread is a `user` thread (the user's decision of 2026-09-28: "shouldnt
 * be a persistent chat. should just be user generated"): open until the pilot or
 * the user closes it, distinct from the repository's own chat, and a "user
 * generated" card in the queue for as long as it is open, below everything that
 * waits on the user's answer. A message in it reaches the repository's parked
 * `deck_wait` through the reply path every thread uses. Every test takes its own
 * store and port; nothing touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { aSandbox, deckOnAPort, tempDeck } from '../testUtils.mjs';
import { KIND_CHAT, KIND_USER, isQueued } from '../items.mjs';
import { queueOf } from '../status.mjs';
import { tabsOf } from '../tabs.mjs';
import { MAX_WAIT_MS, TOOLS } from '../tools.mjs';
import { renderHomePage, renderThreadPage } from '../ui/render.mjs';
import { install as installConfirm } from '../ui/js/confirm.mjs';

const {
  addPilotMessage,
  closeItem,
  createThread,
  listDeckNumbers,
  listItems,
  listRuns,
  postItem,
  registerRun,
  resolveItem,
  storeFile,
} = await import('../store.mjs');
const client = await import('../client.mjs');

const ALPHA = path.resolve('D:/work/alpha');
const HOUR = 60 * 60 * 1000;

const createForm = (base, fields, origin = base) =>
  fetch(`${base}/create`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...(origin === null ? {} : { origin }),
    },
    body: new URLSearchParams(fields),
    redirect: 'manual',
  });

const callApi = (base, name, args = {}) =>
  fetch(`${base}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, arguments: args }),
  });

const textOf = async (response) => (await response.json()).content[0].text;

/** Rewrite the store by hand, the way a test moves a clock it cannot wait out. */
const editStore = (change) => {
  const deck = JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
  change(deck);
  fs.writeFileSync(storeFile(), `${JSON.stringify(deck, null, 2)}\n`);
};
const hoursAgo = (hours) => new Date(Date.now() - hours * HOUR).toISOString();

// --- the thread --------------------------------------------------------------

test('a created thread is a user thread, never classified, and queued while open whatever the pilot writes (2026-09-28)', (t) => {
  tempDeck(t);
  registerRun({ repo: ALPHA, pid: process.pid });

  const thread = createThread({ name: 'Cache the tree', repo: ALPHA });

  assert.equal(thread.kind, KIND_USER);
  assert.equal(thread.created, undefined, 'the kind says it; no flag beside it');
  assert.equal(thread.title, 'Cache the tree');
  assert.equal(isQueued(thread), true, 'in the queue from creation');
  addPilotMessage(thread.id, 'On it.');
  addPilotMessage(thread.id, 'Done the first half.');
  // Flipped 2026-09-28: a created chat left the queue at the pilot's first reply; a user thread stays until closed.
  assert.equal(isQueued(listItems().find((item) => item.id === thread.id)), true, 'still queued after two pilot replies');
  const chats = listItems().filter((item) => item.kind === KIND_CHAT);
  assert.equal(chats.length, 1, "the repository's own chat stays, beside the new thread");
});

const USER_CLOSES = /a thread the user opened: the user closes it from its page; answer it with deck_reply/;

test('deck_resolve refuses a user thread, which stays open and queued', (t) => {
  tempDeck(t);
  registerRun({ repo: ALPHA, pid: process.pid });
  const thread = createThread({ name: 'Close me', repo: ALPHA });
  const chat = listItems().find((item) => item.kind === KIND_CHAT);

  for (const author of ['pilot:pilot', 'pilot:pilot-qa', undefined]) {
    assert.throws(() => resolveItem(thread.id, 'answered in the thread', author), { name: 'DeckRefusal', message: USER_CLOSES }, `as ${author}`);
  }

  const open = listItems().find((item) => item.id === thread.id);
  assert.equal(open.resolvedAt, undefined);
  assert.equal(isQueued(open), true, 'a refused user thread is still queued');
  assert.throws(() => resolveItem(chat.id, 'bye'), /a chat is never closed/);
});

test("the daemon's deck_resolve returns the refusal for a user thread", async (t) => {
  const base = await deckOnAPort(t);
  registerRun({ repo: ALPHA, pid: process.pid });
  const thread = createThread({ name: 'Close me', repo: ALPHA });

  const resolved = await callApi(base, 'deck_resolve', { id: thread.id, resolution: 'answered' });
  assert.equal(resolved.status, 400);
  assert.match((await resolved.json()).error, USER_CLOSES);
  assert.equal(isQueued(listItems().find((item) => item.id === thread.id)), true, 'still open');
});

test('the user closes a user thread from its page, and a Close is drawn there', async (t) => {
  const base = await deckOnAPort(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  const thread = createThread({ name: 'Close me', repo: ALPHA });

  const page = renderThreadPage(thread, listItems(), [run], {}, listDeckNumbers());
  assert.match(page, new RegExp(`<form id="close-${thread.id}" class="close" method="post" action="/close" data-in-place>`));
  assert.match(page, /form="close-[^"]+" data-confirm>Close</);

  const response = await fetch(`${base}/close`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({ id: thread.id }),
    redirect: 'manual',
  });
  assert.equal(response.status, 303);
  assert.equal(isQueued(listItems().find((item) => item.id === thread.id)), false, 'closed, and gone from the queue');
  assert.throws(() => closeItem(listItems().find((item) => item.kind === KIND_CHAT).id), /only a question/);
});

test('a user thread sorts below a question in the queue and on its tab, whichever was posted first', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  const thread = createThread({ name: 'Early bird', repo: ALPHA });
  const asked = postItem({ kind: 'question', title: 'Which?', body: 'A or B', repo: ALPHA });

  assert.deepEqual(queueOf(listItems()).map((item) => item.id), [asked.id, thread.id]);
  const [tab] = tabsOf([run], listItems());
  assert.deepEqual(tab.open.map((item) => item.id), [asked.id, thread.id]);
});

test('Notifications stay newest first with a user thread among them; only the queue sorts it last', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  const first = postItem({ kind: 'question', title: 'First?', body: 'A or B', repo: ALPHA });
  const thread = createThread({ name: 'Middle', repo: ALPHA });
  const last = postItem({ kind: 'question', title: 'Last?', body: 'A or B', repo: ALPHA });

  const home = renderHomePage(listItems(), [run], ALPHA, false, listDeckNumbers());
  const panel = home.slice(home.indexOf('data-live="notifications"'));
  const order = [...panel.matchAll(/class="notice" data-thread="([^"]+)"/g)].map((match) => match[1]);

  assert.deepEqual(order, [last.id, thread.id, first.id]);
});

// --- a created chat stored before 2026-09-28 -----------------------------------

test('a stored created chat reads as a user thread, replies and all, and a second read changes nothing', (t) => {
  tempDeck(t);
  registerRun({ repo: ALPHA, pid: process.pid });
  const replies = [
    { from: 'user', text: 'hello', repliedAt: hoursAgo(2), seq: 1 },
    { from: 'pilot', text: 'hi', repliedAt: hoursAgo(1) },
  ];
  editStore((deck) => {
    deck.items.push({ id: 'itm_b71a313e761c', kind: 'chat', created: true, title: 'Old one', body: 'b', repo: ALPHA, postedAt: hoursAgo(3), replies });
  });
  const read = () => listItems().find((item) => item.id === 'itm_b71a313e761c');

  const first = read();

  assert.equal(first.kind, KIND_USER);
  assert.equal(first.created, undefined);
  assert.deepEqual(first.replies, replies, 'not a reply lost');
  assert.deepEqual(read(), first, 'twice without change');
  assert.equal(listItems().filter((item) => item.kind === KIND_CHAT).length, 1, "the repository's own chat is untouched");
  registerRun({ repo: ALPHA, pid: process.pid });
  const stored = JSON.parse(fs.readFileSync(storeFile(), 'utf8')).items.find((item) => item.id === 'itm_b71a313e761c');
  assert.deepEqual(stored, first, 'the next write stores it as read');
});

test('a name is 1 to 60 of letters, digits, space, _ and -, and the repository must be a known deck', (t) => {
  tempDeck(t);
  registerRun({ repo: ALPHA, pid: process.pid });

  for (const name of ['', '   ', 'x'.repeat(61), 'rm -rf; echo', '<b>']) {
    assert.throws(() => createThread({ name, repo: ALPHA }), /name/, JSON.stringify(name));
  }
  assert.throws(() => createThread({ name: 'ok', repo: 'D:/nowhere' }), /repository/);
  assert.equal(listItems().length, 1, 'nothing but the repository chat was written');
});

test('Create starts no process: with no live run the thread only waits, and nothing that spawns is loaded (L10, ADR 0039)', async (t) => {
  const base = await deckOnAPort(t);
  registerRun({ repo: ALPHA, pid: 999_999_999 });

  const response = await createForm(base, { name: 'Nobody home', repo: ALPHA });

  assert.equal(response.status, 303);
  const thread = listItems().find((item) => item.kind === KIND_USER);
  assert.match(thread.body, /the pilot of this repository answers here/);
  assert.equal(thread.pid, undefined, 'no session is bound to it');
  assert.equal(isQueued(thread), true, 'it waits, shown as waiting');
  const deckDir = path.resolve(import.meta.dirname, '..');
  // The old session launcher is gone; `launch.mjs` is now deck-token's open file, which starts nothing.
  assert.doesNotMatch(fs.readFileSync(path.join(deckDir, 'launch.mjs'), 'utf8'), /node-pty|child_process/, 'launch.mjs');
  for (const file of fs.readdirSync(deckDir).filter((name) => /^(server|store)/.test(name) && name.endsWith('.mjs'))) {
    assert.doesNotMatch(fs.readFileSync(path.join(deckDir, file), 'utf8'), /node-pty|child_process/, file);
  }
});

// --- the route (spec 3b, L4) ---------------------------------------------------

test('/create refuses a foreign Origin and a missing one, and writes nothing', async (t) => {
  const base = await deckOnAPort(t);
  registerRun({ repo: ALPHA, pid: process.pid });
  const before = fs.readFileSync(storeFile());

  for (const origin of ['http://evil.example', null]) {
    const response = await createForm(base, { name: 'Sneaky', repo: ALPHA }, origin);
    assert.equal(response.status, 403, `Origin ${origin}`);
  }
  assert.deepEqual(fs.readFileSync(storeFile()), before, 'deck.json is byte-identical');
});

test('/create from the page lands on the new thread, which lists under Chat', async (t) => {
  const base = await deckOnAPort(t);
  registerRun({ repo: ALPHA, pid: process.pid });

  const response = await createForm(base, { name: 'Cache the tree', repo: ALPHA });

  assert.equal(response.status, 303);
  const id = listItems().find((item) => item.kind === KIND_USER)?.id;
  assert.equal(response.headers.get('location'), `/thread/${id}`);
  const page = await (await fetch(`${base}${response.headers.get('location')}`)).text();
  const chat = page.slice(page.indexOf('data-live="chat"'), page.indexOf('id="status"'));
  assert.match(chat, new RegExp(`<a href="/thread/${id}"[^>]*>Cache the tree</a>`));
});

test("a live pilot's deck_wait returns the created thread's first message (spec 3)", async (t) => {
  const base = await deckOnAPort(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  await createForm(base, { name: 'Ask the pilot', repo: ALPHA });
  const thread = listItems().find((item) => item.kind === KIND_USER);

  const waiting = callApi(base, 'deck_wait', { since: 0, timeout: 5_000, repo: ALPHA, run: run.id });
  await fetch(`${base}/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({ id: thread.id, text: 'What does the tree cost?' }),
    redirect: 'manual',
  });

  const payload = JSON.parse(await textOf(await waiting));
  assert.equal(payload.replies.length, 1);
  assert.equal(payload.replies[0].itemId, thread.id);
  assert.equal(payload.replies[0].text, 'What does the tree cost?');
});

// --- the page (spec 1, 2, 3a, 21) ----------------------------------------------

const rightStrip = (page) => page.slice(page.indexOf('<aside class="strip right">'), page.indexOf('</aside>', page.indexOf('strip right')));

test('Create sits under the toggle, which reads Open and then All (spec 1, 21)', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  const items = listItems();
  const numbers = listDeckNumbers();

  const open = rightStrip(renderHomePage(items, [run], ALPHA, false, numbers));
  const all = rightStrip(renderHomePage(items, [run], ALPHA, true, numbers));

  assert.match(open, />Open<\/a>/);
  assert.match(open, /<form class="create confirm" method="post" action="\/create" data-in-place="move">/, 'and moves to the thread in place (S6)');
  assert.match(all, />All<\/a>/);
  assert.ok(open.indexOf('class="everything') < open.indexOf('<details class="create"'), 'Create is under it');
  assert.match(open, /<input type="hidden" name="repo" value="[^"]*alpha"/i, 'a tab uses its own repository');
  assert.doesNotMatch(open, /<select/);
});

test('on the overview the confirm step asks which known repository (spec 3a)', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });

  const strip = rightStrip(renderHomePage(listItems(), [run], '', false, listDeckNumbers()));

  assert.match(strip, /<select name="repo" required>/);
  assert.match(strip, /<option value="[^"]*alpha">D1 /i);
  assert.ok(strip.indexOf('<select') > strip.indexOf('class="step sure"'), 'the pick is on the confirm step');
});

/** The home page at `selected`, cut into its queue and what follows the queue. */
const homeAt = (run, selected) => {
  const home = renderHomePage(listItems(), [run], selected, false, listDeckNumbers());
  const end = home.indexOf('</main>');
  return { queue: home.slice(home.indexOf('data-live="queue"'), end), rest: home.slice(end) };
};

test('a user thread is a "user generated" card on its tab and the overview while open, and under Chat throughout', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  const thread = createThread({ name: 'Side question', repo: ALPHA });

  for (const selected of [ALPHA, 'nowhere']) {
    const { queue } = homeAt(run, selected);
    assert.match(queue, /data-kind="user"[^>]*>user generated</, `${selected}: the card names its category`);
    assert.match(queue, /Side question/);
  }
  assert.match(homeAt(run, ALPHA).rest, />Side question<\/a>/, 'and it is under Chat too');
  assert.match(renderThreadPage(thread, listItems(), [run], {}, listDeckNumbers()), /class="kind"[^>]*>.*user generated/);
});

test('the user closes a user thread with Close, and only then it leaves the queue', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  const thread = createThread({ name: 'Side question', repo: ALPHA });

  // Flipped 2026-09-28: the pilot's reply no longer takes it out of the queue; closing it does.
  addPilotMessage(thread.id, 'On it.');
  assert.match(homeAt(run, ALPHA).queue, /Side question/, 'answered, it stays in the queue');
  assert.throws(() => resolveItem(thread.id, 'done'), USER_CLOSES);
  assert.match(homeAt(run, ALPHA).queue, /Side question/, 'refused, it stays in the queue');
  closeItem(thread.id);
  const { queue, rest } = homeAt(run, ALPHA);
  assert.doesNotMatch(queue, /Side question/, 'closed, it leaves the queue');
  assert.match(rest, />Side question<\/a>/, 'and stays under Chat');
});

// --- cancel is inert (spec 2) --------------------------------------------------

/** The create form's DOM, stubbed to what `confirm.mjs` reads and writes. */
const aCreateForm = () => {
  const steps = { name: { hidden: false }, sure: { hidden: true } };
  const details = { open: true };
  const form = {
    resets: 0,
    elements: { name: { value: 'Cache the tree', reportValidity: () => true } },
    reset() {
      this.resets += 1;
      this.elements.name.value = '';
    },
    matches: (selector) => selector === 'form.confirm',
    closest: (selector) => (selector === 'details' ? details : null),
    querySelector: (selector) =>
      ({ '.step.name': steps.name, '.step.sure': steps.sure, '.named': {}, '.step.sure [type="submit"]': { focus() {} } })[selector] ?? null,
  };
  const target = (name) => ({
    closest: (selector) => (selector === 'form.confirm' ? form : selector === `.${name}` ? {} : null),
  });
  return { form, steps, details, target };
};

test('cancelling at either step posts nothing and leaves deck.json byte-identical (spec 2)', async (t) => {
  const base = await deckOnAPort(t);
  registerRun({ repo: ALPHA, pid: process.pid });
  await fetch(`${base}/?run=${encodeURIComponent(ALPHA)}`);
  const before = fs.readFileSync(storeFile());

  for (const atConfirm of [false, true]) {
    const handlers = {};
    const fetched = [];
    const env = aSandbox({
      fetch: (...args) => fetched.push(args),
      document: { addEventListener: (type, run) => (handlers[type] = run) },
    });
    installConfirm(env);
    const { form, steps, details, target } = aCreateForm();

    if (atConfirm) {
      handlers.submit({ target: form, preventDefault() {} });
      assert.equal(steps.sure.hidden, false, 'Next shows the confirm step');
    }
    handlers.click({ target: target('cancel'), preventDefault() {} });

    assert.equal(fetched.length, 0);
    assert.equal(form.resets, 1, 'the name is cleared');
    assert.equal(details.open, false, 'the form is put away');
    assert.deepEqual([steps.name.hidden, steps.sure.hidden], [false, true], 'back at the first step');
  }
  assert.deepEqual(fs.readFileSync(storeFile()), before);
  assert.equal(listItems().filter((item) => item.kind === KIND_USER).length, 0);
});

test('with no script, Next is the submit that posts; the script alone adds the confirm step', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  const strip = rightStrip(renderHomePage(listItems(), [run], ALPHA, false, listDeckNumbers()));
  const html = strip.slice(strip.indexOf('<details class="create"'));
  const nameStep = html.slice(html.indexOf('class="step name"'), html.indexOf('class="step sure"'));

  assert.match(nameStep, /<button type="submit" class="next">Next<\/button>/, 'the first visible button posts');
});

test('Enter in the name box goes to the confirm step rather than posting', () => {
  const handlers = {};
  installConfirm(aSandbox({ document: { addEventListener: (type, run) => (handlers[type] = run) } }));
  const { form, steps } = aCreateForm();
  let prevented = false;

  handlers.submit({ target: form, preventDefault: () => (prevented = true) });

  assert.equal(prevented, true);
  assert.equal(steps.sure.hidden, false);
});

// --- listening (spec 19, 20) ---------------------------------------------------

test('a 4-hour deck_wait is clamped to 55 minutes, and the schema says so (spec 20)', () => {
  assert.equal(MAX_WAIT_MS, 55 * 60 * 1000);
  assert.equal(client.waitWindowMs(4 * HOUR), 55 * 60 * 1000);
  const wait = TOOLS.find((tool) => tool.name === 'deck_wait');
  assert.equal(wait.inputSchema.properties.timeout.maximum, undefined, 'longer is clamped, not refused');
  assert.match(wait.description, /55 minutes/);
  assert.match(wait.description, /stop listening/);
});

test('deck_wait says stop listening after 10 hours with no user reply, and a reply resets it', async (t) => {
  const base = await deckOnAPort(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  const wait = () => callApi(base, 'deck_wait', { since: 999, timeout: 50, repo: ALPHA, run: run.id });

  editStore((deck) => (deck.runs[0].startedAt = hoursAgo(11)));
  assert.equal(await textOf(await wait()), 'stop listening: no reply from the user in 10 hours');

  editStore((deck) => deck.items[0].replies.push({ from: 'user', text: 'hi', repliedAt: hoursAgo(9), seq: 1 }));
  assert.doesNotMatch(await textOf(await wait()), /stop listening/);

  editStore((deck) => (deck.items[0].replies[0].repliedAt = hoursAgo(10)));
  assert.match(await textOf(await wait()), /^stop listening/);
});

test('a wait that names no run, the shape of one aimed at another repository, is never stopped', async (t) => {
  const base = await deckOnAPort(t);
  registerRun({ repo: ALPHA, pid: process.pid });
  editStore((deck) => (deck.runs[0].startedAt = hoursAgo(11)));

  const response = await callApi(base, 'deck_wait', { since: 999, timeout: 50, repo: ALPHA });

  assert.doesNotMatch(await textOf(response), /stop listening/, 'no run named, no stop');
});

test('a finished run record returns stop, and only to a session that started before it finished', async (t) => {
  const base = await deckOnAPort(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  const status = await callApi(base, 'deck_status', {
    run: run.id,
    slug: 'independence',
    slices: [],
    finished: 'closing report posted',
  });
  assert.equal(status.status, 200, await status.clone().text());
  const wait = (id) => callApi(base, 'deck_wait', { since: 999, timeout: 50, repo: ALPHA, run: id });

  assert.equal(await textOf(await wait(run.id)), 'stop listening: the run is finished (closing report posted)');

  // A new session in the same directory, before its first deck_status, is a new run.
  editStore((deck) => (deck.runs[0].startedAt = new Date(Date.now() + 1000).toISOString()));
  assert.doesNotMatch(await textOf(await wait(listRuns()[0].id)), /stop listening/);
});

test('a later deck_status with a next move and no finished clears the old finished', async (t) => {
  const base = await deckOnAPort(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  const status = (fields) => callApi(base, 'deck_status', { run: run.id, slug: 'independence', slices: [], ...fields });
  await status({ finished: 'closing report posted' });

  const again = await status({ next: 'one more fix' });
  assert.equal(again.status, 200, await again.clone().text());

  const text = await textOf(await callApi(base, 'deck_wait', { since: 999, timeout: 50, repo: ALPHA, run: run.id }));
  assert.doesNotMatch(text, /stop listening/, 'working again on the same slug is not finished');
});

test('the client hands a stop straight back rather than polling on (spec 20)', async (t) => {
  let polls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    polls += 1;
    return new Response(JSON.stringify({ content: [{ type: 'text', text: 'stop listening: the run is finished (done)' }] }));
  };
  t.after(() => (globalThis.fetch = realFetch));

  const result = await client.waitForReply({ timeout: HOUR }, 10);

  assert.equal(polls, 1);
  assert.equal(result.content[0].text, 'stop listening: the run is finished (done)');
});
