/**
 * A press posted in place (handoff-failed-confirm S4, spec 8, L2, ADR 0016): a submit from a
 * `form[data-in-place]` is fetched with the form's fields and never navigates; the deck's change
 * announcement redraws the region through `live.mjs`. A refusal, or a request that never arrives,
 * posts the form for real, so the user reads why. A form without the attribute is left alone.
 *
 * Pressed over the notice ×'s own markup, as `renderClosedNotice` draws it, in the sandbox's
 * element tree (`confirm-sandbox.mjs`).
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { KIND_QUESTION, repoKey } from '../items.mjs';
import { addDeck, closeItem, listItems, listRuns, postItem, registerRun, requestSwitch } from '../store.mjs';
import { aSandbox, aTicket, deckOnAPort, freePort, page, postStored, rowsOf, takeLive, tempDeck } from '../testUtils.mjs';
import { aDocument, aPage as aWholePage } from './confirm-sandbox.mjs';
import { install as installConfirm } from '../ui/js/confirm.mjs';
import { install } from '../ui/js/inplace.mjs';
import { install as installReply } from '../ui/js/reply.mjs';
import { renderDeckPage, renderHomePage, renderThreadPage } from '../ui/render.mjs';

// A port of this file's own, never one a scratch deck might hold.
const PORT = await freePort();

const REPO = path.resolve('D:/work/pilot');

/** The notice ×'s form, cut out of the overview the deck really draws. */
const noticeForm = () => {
  const item = {
    id: 'itm_0123456789ab', kind: KIND_QUESTION, title: 'Which?', body: 'x', repo: REPO, replies: [],
    resolution: 'Took A.', resolvedAt: '2026-10-02T10:00:00.000Z', notice: true,
  };
  const page = renderHomePage([item], [{ id: 'run_1', repo: REPO, name: 'pilot', pid: process.pid }], REPO);
  return page.match(/<form method="post" action="\/clear-notice"[^>]*>.*?<\/form>/s)?.[0] ?? '';
};

/** `html` with `inplace.mjs` installed over it, its fetch answering with `answer`. */
const aPage = (html, answer) => {
  const document = aDocument(html);
  const fetched = [];
  install(aSandbox({
    document,
    location: { href: `http://127.0.0.1:${PORT}/`, assign: (to) => document.navigations.push(to) },
    fetch: (target, options) => {
      fetched.push({ target, method: options.method, body: Object.fromEntries(new URLSearchParams(options.body)) });
      return answer();
    },
  }), () => {}, () => {});
  return { document, fetched, button: document.root.querySelector('button') };
};

const turn = () => new Promise((resolve) => setTimeout(resolve, 0));

test('a data-in-place submit is fetched with its fields and never navigates', async () => {
  const { document, fetched, button } = aPage(noticeForm(), () => Promise.resolve({ type: 'opaqueredirect', ok: false, status: 0 }));
  button.focus();
  document.press(button);
  await turn();
  assert.deepEqual(fetched, [{ target: '/clear-notice', method: 'POST', body: { id: 'itm_0123456789ab', back: `/?run=${encodeURIComponent(REPO)}` } }]);
  assert.deepEqual(document.navigations, [], 'the page stays where it is');
  assert.equal(document.activeElement, null, 'the × lets go of the focus, so the live redraw is not held back');
});

test('a refused or dropped fetch posts the form for real', async () => {
  const answers = {
    refused: () => Promise.resolve({ type: 'basic', ok: false, status: 403 }),
    dropped: () => Promise.reject(new TypeError('Failed to fetch')),
  };
  for (const [how, answer] of Object.entries(answers)) {
    const { document, fetched, button } = aPage(noticeForm(), answer);
    document.press(button);
    await turn();
    assert.equal(fetched.length, 1, how);
    assert.deepEqual(document.navigations, ['/clear-notice'], `${how}: the form is posted so the user reads why`);
  }
});

test('a form without data-in-place is left alone', async () => {
  const { document, fetched, button } = aPage(noticeForm().replace(' data-in-place', ''), () => Promise.resolve({ ok: true }));
  document.press(button);
  await turn();
  assert.deepEqual(fetched, []);
  assert.deepEqual(document.navigations, ['/clear-notice'], 'the browser posts it');
});

test('a 2xx answer is taken too, and the page stays where it is', async () => {
  const { document, fetched, button } = aPage(noticeForm(), () => Promise.resolve({ type: 'basic', ok: true, status: 204 }));
  document.press(button);
  await turn();
  assert.equal(fetched.length, 1);
  assert.deepEqual(document.navigations, []);
});

test('a named submitter is sent with the form, as the browser would send it', async () => {
  const named = noticeForm().replace('<button type="submit"', '<button type="submit" name="choice" value="Clear"');
  const { document, fetched, button } = aPage(named, () => Promise.resolve({ type: 'opaqueredirect', ok: false, status: 0 }));
  document.press(button);
  await turn();
  assert.equal(fetched[0].body.choice, 'Clear');
});

test('a submit something else has already called off is left alone', async () => {
  const { document, fetched, button } = aPage(noticeForm(), () => Promise.resolve({ ok: true }));
  // `confirm.mjs`'s capturing listener, holding a trigger's first press (L4).
  document.addEventListener('submit', (event) => event.preventDefault(), true);
  document.press(button);
  await turn();
  assert.deepEqual(fetched, []);
  assert.deepEqual(document.navigations, [], 'neither fetched nor posted');
});

test('page.mjs installs inplace.mjs', () => {
  const page = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ui', 'js', 'page.mjs'), 'utf8');
  assert.match(page, /import \{ install as installInPlace \} from '\.\/inplace\.mjs';/);
  assert.match(page, /installInPlace\(env, live\.refresh, live\.settle\);/, 'handed live.mjs`s refresh, which a move runs (S6), and its settle, which a take runs');
});

/** The opening tag of the form posting `action` in `html` that also holds `inside`, or ''. */
const formTag = (html, action, inside = '') =>
  [...html.matchAll(new RegExp(`(<form [^>]*action="${action}"[^>]*>)((?:(?!</form>).)*)</form>`, 'gs'))]
    .find(([, , body]) => body.includes(inside))?.[1] ?? '';

/** Pretends the deck is on `platform`, as `start-session.test.mjs` does, so Start is drawn anywhere. */
const onPlatform = (t, platform) => {
  const original = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { ...original, value: platform });
  t.after(() => Object.defineProperty(process, 'platform', original));
};

test('every press §8a fixes posts in place', (t) => {
  tempDeck(t);
  onPlatform(t, 'win32');
  const question = postItem({ kind: KIND_QUESTION, title: 'Which?', body: 'Pick.', repo: REPO });
  const closed = postItem({ kind: KIND_QUESTION, title: 'Shut?', body: 'Pick.', repo: REPO });
  closeItem(closed.id);
  const note = postStored({ kind: 'note', title: 'Seen?', body: 'b', repo: REPO });
  const thread = (id) => renderThreadPage(listItems().find((item) => item.id === id), listItems());
  const live = registerRun({ repo: REPO, pid: process.pid });
  const strip = (run, wrapped = {}) => renderHomePage(listItems(), [run], REPO, false, {}, {}, Date.now(), [], null, wrapped);

  takeLive(aTicket('Live', 'red').id);
  const green = aTicket('Green', 'green');
  const idle = rowsOf(page())[green.id];
  requestSwitch(REPO, green.id);
  const pending = rowsOf(page())[green.id];

  const forms = {
    Reopen: formTag(thread(closed.id), '/reopen'),
    'thread-page Dismiss': formTag(thread(note.id), '/dismiss-item'),
    Close: formTag(thread(question.id), '/close'),
    'a typed reply': formTag(thread(question.id), '/reply', 'name="text"'),
    'dismiss a run': formTag(renderDeckPage(listItems(), listRuns()), '/dismiss'),
    'Weekly alerts': formTag(strip(live), '/alerts'),
    Start: formTag(strip({ ...live, pid: 999999 }), '/start-session'),
    End: formTag(strip(live, { [repoKey(REPO)]: true }), '/end-session'),
    'Switch Confirm': formTag(idle, '/switch'),
    'Switch cancel': formTag(pending, '/switch-cancel'),
  };
  for (const [press, tag] of Object.entries(forms)) {
    assert.ok(tag, `${press} is drawn`);
    assert.match(tag, / data-in-place[ >]/, `${press} posts in place`);
  }
});

/** The whole form posting `action` in `html` that holds `inside`, as markup. */
const formOf = (html, action, inside = '') =>
  [...html.matchAll(new RegExp(`<form [^>]*action="${action}"[^>]*>(?:(?!</form>).)*</form>`, 'gs'))].find(([form]) => form.includes(inside))?.[0] ?? '';

/** A fetch that answers only when the test says so, and records what it was sent. */
const aHeldFetch = () => {
  const fetched = [];
  const answers = [];
  const fetch = (target, options) => {
    fetched.push({ target, body: Object.fromEntries(new URLSearchParams(options.body)) });
    return new Promise((resolve) => answers.push(resolve));
  };
  const answer = () => answers.shift()({ type: 'opaqueredirect', ok: false, status: 0 });
  return { fetched, fetch, answer };
};

const buttonWhere = (document, where) => document.root.descendants().find((el) => el.tag === 'button' && where(el));

test('a typed reply posts in place', async () => {
  const item = { id: 'itm_0123456789ab', kind: KIND_QUESTION, title: 'Which?', body: 'Pick.', repo: REPO, replies: [] };
  const form = formOf(renderThreadPage(item, [item]), '/reply', 'name="text"');
  const { fetched, fetch, answer } = aHeldFetch();
  const { document, settled } = aWholePage(form, fetch);
  const box = document.root.querySelector('textarea');
  box.value = 'go with 4325';
  const reply = buttonWhere(document, (el) => el.getAttribute('name') === null && el.getAttribute('form') === null);
  reply.focus();

  document.press(reply);
  document.press(reply);
  assert.deepEqual(fetched, [{ target: '/reply', body: { id: item.id, text: 'go with 4325' } }], 'one fetch, the second press ignored');
  assert.deepEqual(document.navigations, [], 'no #reply navigation');
  answer();
  await turn();
  assert.equal(box.value, '', 'the box is cleared');
  assert.equal(document.activeElement, null, 'Reply lets go of the focus');
  assert.deepEqual(settled, [true], 'and the redraw it held back is taken, drawing the reply above the box');
});

test("Switch Confirm through S1's seam then posts in place", (t) => {
  tempDeck(t);
  takeLive(aTicket('Live', 'red').id);
  const green = aTicket('Green', 'green');
  const { fetched, fetch } = aHeldFetch();
  // The row's controls, the confirm row Continue blanks to (seam S1), with its form inside.
  const controls = rowsOf(page())[green.id].match(/<span class="controls" data-confirm-row>.*?<\/form>/s)[0];
  const { document } = aWholePage(controls, fetch);

  document.press(buttonWhere(document, (el) => el.getAttribute('data-confirm') !== null));
  assert.deepEqual(fetched, [], 'the first press confirms and posts nothing');
  document.press(document.root.querySelector('.step.sure [type="submit"]'));
  assert.equal(fetched.length, 1);
  assert.equal(fetched[0].target, '/switch');
  assert.equal(fetched[0].body.to, green.id);
  assert.deepEqual(document.navigations, []);
});

test("a submit while its form's fetch is in flight is ignored, and the next one after it is sent", async () => {
  const { fetched, fetch, answer } = aHeldFetch();
  const { document } = aWholePage(noticeForm(), fetch);
  const button = document.root.querySelector('button');
  document.press(button);
  document.press(button);
  assert.equal(fetched.length, 1, 'one POST for a double press');
  assert.deepEqual(document.navigations, [], 'and the second is not posted for real either');
  answer();
  await turn();
  document.press(button);
  assert.equal(fetched.length, 2);
});

test('only the fields a native post sends are sent', () => {
  const html =
    '<form method="post" action="/alerts" data-in-place>' +
    '<input type="hidden" name="weekly" value="off">' +
    '<input type="text" name="gone" value="x" disabled>' +
    '<input type="checkbox" name="unticked" value="1">' +
    '<input type="checkbox" name="ticked" value="1" checked>' +
    '<input type="radio" name="pick" value="a"><input type="radio" name="pick" value="b" checked>' +
    '<select name="deck" value="D2"></select>' +
    '<input type="submit" name="other" value="no">' +
    '<button type="submit">Go</button></form>';
  const bodies = [];
  const { document } = aWholePage(html, (target, options) => {
    bodies.push(options.body);
    return new Promise(() => {});
  });
  // The sandbox reads `disabled` off the markup; `checked` is the browser's property, set here.
  for (const el of document.root.descendants()) if (el.getAttribute('checked') !== null) el.checked = true;
  document.press(buttonWhere(document, () => true));
  assert.equal(bodies[0], 'weekly=off&ticked=1&pick=b&deck=D2', 'each sent once, in order');
});

/** A form post over `node:http`, so the request's headers are exactly the test's. */
const post = (base, route, fields, headers = {}) =>
  new Promise((resolve, reject) => {
    const request = http.request(`${base}${route}`, {
      method: 'POST',
      agent: false,
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base, ...headers },
    });
    request.on('response', (response) => {
      response.resume();
      response.on('end', () => resolve({ status: response.statusCode, location: response.headers.location ?? null }));
    });
    request.on('error', reject);
    request.end(String(new URLSearchParams(fields)));
  });

test("a refused Start or End answers a page's fetch with its 400, and a navigation with the 303 carrying the reason", async (t) => {
  const base = await deckOnAPort(t, { start: () => {} });
  const fetched = await post(base, '/start-session', { repo: REPO }, { 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' });
  assert.equal(fetched.status, 400, 'not a redirect a fetch would read as taken');
  for (const headers of [{ 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' }, {}]) {
    const landed = await post(base, '/start-session', { repo: REPO }, headers);
    assert.equal(landed.status, 303);
    assert.match(landed.location, /sessionRefused=/);
  }
  const ended = await post(base, '/end-session', { repo: REPO }, { 'sec-fetch-dest': 'empty' });
  assert.equal(ended.status, 400, 'End the same');
});

/** A page's `/events` stream: how many `changed` events it has been sent. */
const listen = (base) =>
  new Promise((resolve, reject) => {
    const seen = { changed: 0 };
    const request = http.get(`${base}/events`, { agent: false }, (response) => {
      response.setEncoding('utf8');
      response.on('data', (chunk) => (seen.changed += chunk.split('event: changed').length - 1));
      resolve({ seen, close: () => request.destroy() });
    });
    request.on('error', reject);
  });

test('Weekly alerts and Start announce the change, so a press in place is redrawn', async (t) => {
  const started = [];
  const base = await deckOnAPort(t, { start: (repo) => started.push(repo) });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-inplace-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const repo = addDeck(dir).repo;
  const events = await listen(base);
  t.after(() => events.close());

  for (const [route, fields] of [['/alerts', { weekly: 'off', back: '/' }], ['/start-session', { repo }]]) {
    const before = events.seen.changed;
    assert.equal((await post(base, route, fields)).status, 303, route);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.ok(events.seen.changed > before, `${route} announces`);
  }
  assert.equal(started.length, 1);
});

/**
 * A synchronous stand-in for the fetch's promise, with a promise's `then` and `catch`, so a throw
 * after the answer is seen here rather than as an unhandled rejection `node:test` charges to the test.
 */
const settled = (thrown) => {
  const done = (value) => ({ then: (ok) => { try { return done(ok ? ok(value) : value); } catch (err) { return failed(err); } }, catch: () => done(value) });
  const failed = (err) => {
    thrown.push(err.message);
    const chain = { then: (ok, fail) => (fail ? (thrown.pop(), done(fail(err))) : chain), catch: (fail) => chain.then(null, fail) };
    return chain;
  };
  return done;
};

test('a typed reply the deck took is never posted again, even when the redraw after it throws', () => {
  const item = { id: 'itm_0123456789ab', kind: KIND_QUESTION, title: 'Which?', body: 'Pick.', repo: REPO, replies: [] };
  const thrown = [];
  const fetch = () => settled(thrown)({ type: 'opaqueredirect', ok: false, status: 0 });
  const { document, fetched } = aWholePage(formOf(renderThreadPage(item, [item]), '/reply', 'name="text"'), fetch, () => {
    throw new Error('the redraw broke');
  });
  document.root.querySelector('textarea').value = 'go with 4325';

  document.press(buttonWhere(document, (el) => el.getAttribute('name') === null && el.getAttribute('form') === null));
  assert.equal(fetched.length, 1);
  assert.deepEqual(document.navigations, [], 'not resent: the deck already has it');
  assert.deepEqual(thrown, ['the redraw broke'], 'and the error is left to surface, not swallowed');
});

// --- handoff-failed-confirm S6: a press that moves the page ----------------------------------

/**
 * `html` with the scripts installed in `page.mjs`'s order, `inplace.mjs` handed a `refresh` that
 * records the address it ran at. The fetch follows redirects, so `answer` is where the deck landed it.
 */
const aMovePage = (html, answer) => {
  const document = aDocument(html);
  const fetched = [];
  const pushed = [];
  const refreshed = [];
  const env = aSandbox({
    document,
    location: { href: `http://127.0.0.1:${PORT}/?run=x`, assign: (to) => document.navigations.push(to) },
    history: { pushState: (state, title, href) => pushed.push(href) },
    fetch: (target, options) => {
      fetched.push({ target, redirect: options.redirect, body: Object.fromEntries(new URLSearchParams(options.body)) });
      return answer();
    },
  });
  installReply(env, () => {});
  install(env, () => refreshed.push(pushed.at(-1)));
  installConfirm(env);
  return { document, fetched, pushed, refreshed };
};

/** Where a followed fetch landed: the page at `url`, reached through a redirect. */
const landedAt = (url) => () => Promise.resolve({ type: 'basic', ok: true, status: 200, redirected: true, url });

const BASE = `http://127.0.0.1:${PORT}`;

/** Create's form on a tab, as the strip draws it. */
const createOn = (t) => {
  tempDeck(t);
  const run = registerRun({ repo: REPO, pid: process.pid });
  return formOf(renderHomePage(listItems(), [run], REPO), '/create', 'class="step sure"');
};

test('Create moves to the new thread in place', async (t) => {
  const { document, fetched, pushed, refreshed } = aMovePage(createOn(t), landedAt(`${BASE}/thread/itm_000000000009`));
  document.root.querySelector('input[name]').value = 'Plan';
  document.press(document.root.querySelector('.next'));
  document.press(document.root.querySelector('.step.sure [type="submit"]'));
  await turn();

  assert.equal(fetched.length, 1, 'one fetch');
  assert.equal(fetched[0].target, '/create');
  assert.equal(fetched[0].redirect, 'follow', 'followed to the thread the deck made');
  assert.equal(fetched[0].body.name, 'Plan', 'the typed name rides in the form');
  assert.deepEqual(pushed, [`${BASE}/thread/itm_000000000009`], 'the address moves to the new thread');
  assert.deepEqual(refreshed, [`${BASE}/thread/itm_000000000009`], 'and the page is read there');
  assert.deepEqual(document.navigations, [], 'with no navigation');
});

test("Create's Next is not fetched", async (t) => {
  const { document, fetched, pushed } = aMovePage(createOn(t), landedAt(`${BASE}/thread/itm_000000000009`));
  document.root.querySelector('input[name]').value = 'Plan';
  document.press(document.root.querySelector('.next'));
  await turn();

  assert.deepEqual(fetched, [], 'Next only shows the confirm step');
  assert.equal(document.root.querySelector('.step.sure').hidden, false);
  assert.deepEqual(pushed, []);
  assert.deepEqual(document.navigations, []);
});

test('a refused Add deck draws its reason in place', async (t) => {
  const run = (tempDeck(t), registerRun({ repo: REPO, pid: process.pid }));
  const form = formOf(renderHomePage(listItems(), [run], REPO), '/add-deck');
  const refusedAt = `${BASE}/?run=x&refused=${encodeURIComponent('not a directory')}`;
  const { document, pushed, refreshed } = aMovePage(form, landedAt(refusedAt));
  document.press(document.root.querySelector('button'));
  await turn();

  assert.deepEqual(pushed, [refusedAt], 'the address carries the reason');
  assert.deepEqual(refreshed, [refusedAt]);
  assert.deepEqual(document.navigations, []);

  // And the page there draws it beside the + box, inside the strip's live region, so the read redraws it.
  const base = await deckOnAPort(t);
  const landed = await (await fetch(`${base}/?refused=${encodeURIComponent('not a directory')}`)).text();
  assert.match(landed.match(/<nav class="runs-strip" data-live="tabs">.*?<\/nav>/s)[0], /<p class="refused" role="alert">not a directory<\/p>/);
});

test('Remove lands on the overview in place; a 400 posts for real', async (t) => {
  tempDeck(t);
  postItem({ kind: KIND_QUESTION, title: 'Open?', body: 'b', repo: REPO });
  const ended = { ...registerRun({ repo: REPO, pid: process.pid }), pid: 999999 };
  const form = formOf(renderHomePage(listItems(), [ended], REPO, false, {}, {}, Date.now()), '/remove-deck');

  const { document, pushed, refreshed } = aMovePage(form, landedAt(`${BASE}/`));
  document.press(buttonWhere(document, (el) => el.getAttribute('data-confirm') !== null));
  document.press(document.root.querySelector('.step.sure [type="submit"]'));
  await turn();
  assert.deepEqual(pushed, [`${BASE}/`]);
  assert.deepEqual(refreshed, [`${BASE}/`]);
  assert.deepEqual(document.navigations, []);

  const live = aMovePage(form, () => Promise.resolve({ type: 'basic', ok: false, status: 400, redirected: false, url: `${BASE}/remove-deck` }));
  live.document.press(buttonWhere(live.document, (el) => el.getAttribute('data-confirm') !== null));
  live.document.press(live.document.root.querySelector('.step.sure [type="submit"]'));
  await turn();
  assert.deepEqual(live.pushed, [], 'a refusal moves nothing');
  assert.deepEqual(live.document.navigations, ['/remove-deck'], 'the form is posted so the deck says why');
});

test('a move whose POST was taken is never posted again, though the page it landed on failed', async (t) => {
  // The deck made the thread and redirected; the GET after it answered 500. Posting again would make a second thread.
  const { document, fetched, pushed, refreshed } = aMovePage(createOn(t), () =>
    Promise.resolve({ type: 'basic', ok: false, status: 500, redirected: true, url: `${BASE}/thread/itm_000000000009` }));
  document.root.querySelector('input[name]').value = 'Plan';
  document.press(document.root.querySelector('.next'));
  document.press(document.root.querySelector('.step.sure [type="submit"]'));
  await turn();

  assert.equal(fetched.length, 1);
  assert.deepEqual(document.navigations, [], 'not posted again');
  assert.deepEqual(pushed, [`${BASE}/thread/itm_000000000009`], 'the address goes where the deck put it');
  assert.deepEqual(refreshed, [`${BASE}/thread/itm_000000000009`]);
});
