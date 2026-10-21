/**
 * S1 of deck-polish: a + tab adds a deck by path (spec 5, L3, L4, ADR 0048).
 * The path is checked on the server — absolute, a directory by `fs.stat`,
 * canonicalised by `fs.realpath`, no credential in it — and only stored: the
 * deck never reads, lists or runs anything inside it. An added directory is a
 * tab of its own until it is closed, across a restart.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { bearer } from '../../hooks/lib/deck-secret.js';
import { deckOnAPort, tempDeck } from '../testUtils.mjs';
import { createDeckHttpServer } from '../server.mjs';
import { sameRepo } from '../runs.mjs';
import { tabsOf } from '../tabs.mjs';
import { renderHomePage, renderThreadPage } from '../ui/render.mjs';

const { addDeck, listAdded, listDeckNumbers, listItems, listStoredRuns, registerRun, removeDeck } = await import(
  '../store.mjs'
);

/** A real directory of this test's own, removed when the test ends. */
const aDirectory = (t, prefix = 'pilot-added-') => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};

const storeText = () => {
  try {
    return fs.readFileSync(path.join(process.env.PILOT_DECK_DIR, 'deck.json'), 'utf8');
  } catch {
    return null;
  }
};

const post = (base, fields, origin = base) =>
  fetch(`${base}/add-deck`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...(origin === null ? {} : { origin }) },
    body: new URLSearchParams(fields),
    redirect: 'manual',
  });

const theStrip = (page) => {
  const start = page.indexOf('<nav class="runs-strip"');
  return page.slice(start, page.indexOf('</nav>', start) + '</nav>'.length);
};

/** A daemon on this test's store, closed by the caller or when the test ends. */
async function daemon(t) {
  const server = createDeckHttpServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const close = () =>
    new Promise((resolve) => {
      server.closeAllConnections();
      server.close(resolve);
    });
  t.after(() => (server.listening ? close() : undefined));
  return { base: `http://127.0.0.1:${server.address().port}`, close };
}

test('an absolute directory is added, numbered and given a chat', (t) => {
  tempDeck(t);
  const dir = aDirectory(t);

  const { repo, created } = addDeck(dir);

  assert.equal(created, true);
  assert.equal(repo, fs.realpathSync.native(dir), 'stored as its canonical path (L4)');
  // Every read below opens deck.json afresh: what was added is what was written.
  const added = listAdded();
  assert.equal(added.length, 1);
  assert.equal(added[0].repo, repo);
  assert.ok(!Number.isNaN(Date.parse(added[0].addedAt)), 'addedAt is a time');
  const numbers = listDeckNumbers();
  assert.equal(Object.keys(numbers).length, 1);
  assert.equal(Object.values(numbers)[0], 1, 'the first deck is D1');
  const chats = listItems().filter((item) => item.kind === 'chat' && sameRepo(item.repo, repo));
  assert.equal(chats.length, 1, 'and it has its chat');
});

test('a relative path, a missing path, a file and a credential-like path are each refused with their reason', (t) => {
  tempDeck(t);
  const dir = aDirectory(t);
  const file = path.join(dir, 'notes.txt');
  fs.writeFileSync(file, 'x');
  const secret = path.join(dir, 'ghp_abcdefghijklmnopqrstuvwxyz0123');
  fs.mkdirSync(secret);

  const refusals = [
    [undefined, /path/],
    ['', /path/],
    ['   ', /path/],
    ['relative/dir', /absolute/],
    [path.join(dir, 'missing'), /does not exist/],
    [file, /not a directory/],
    // A network path is never stat'd: that would open an SMB connection and stall the daemon.
    // A backslash path is a network path on Windows and a relative name on POSIX.
    ['\\\\host\\share', process.platform === 'win32' ? /network path/ : /absolute/],
    ['//host/share', /network path/],
    [secret, /GitHub token/],
  ];
  for (const [given, reason] of refusals) {
    assert.throws(() => addDeck(given), (err) => err.name === 'DeckRefusal' && reason.test(err.message), `${given}`);
  }
  assert.equal(storeText(), null, 'nothing was written');
});

test('a stat that fails on a path through a file, or for any other reason, is refused with its reason', (t) => {
  tempDeck(t);
  const dir = aDirectory(t);
  for (const [code, reason] of [
    ['ENOTDIR', /does not exist/],
    ['EACCES', /could not be checked \(EACCES\)/],
  ]) {
    const stat = t.mock.method(fs, 'statSync', () => {
      throw Object.assign(new Error(code), { code });
    });
    assert.throws(() => addDeck(dir), (err) => err.name === 'DeckRefusal' && reason.test(err.message), code);
    stat.mock.restore();
  }
  assert.equal(storeText(), null, 'nothing was written');
});

test('a path already a tab, or the same directory spelled differently, is not added twice', (t) => {
  tempDeck(t);
  const dir = aDirectory(t);
  const link = path.join(aDirectory(t, 'pilot-link-'), 'alias');
  fs.symlinkSync(dir, link, 'junction');

  const first = addDeck(dir);
  const written = storeText();
  const spellings = [`${dir}${path.sep}.${path.sep}`, link];
  if (process.platform === 'win32') spellings.push(dir.toUpperCase());
  for (const spelling of spellings) {
    assert.deepEqual(addDeck(spelling), { repo: first.repo, created: false }, spelling);
  }
  assert.equal(storeText(), written, 'no write');

  // A tab a live run already holds is not added either.
  const busy = aDirectory(t);
  registerRun({ repo: busy, pid: process.pid });
  const before = storeText();
  assert.equal(addDeck(busy).created, false);
  assert.equal(storeText(), before);
});

test('an added deck is a tab with no run and nothing open, and survives a daemon restart', async (t) => {
  tempDeck(t);
  const dir = aDirectory(t);
  const { repo } = addDeck(dir);

  const tabs = tabsOf(listStoredRuns(), listItems(), listDeckNumbers(), {}, listAdded());
  assert.equal(tabs.length, 1);
  assert.equal(tabs[0].repo, repo);
  assert.equal(tabs[0].number, 1);
  assert.deepEqual(tabs[0].runs, []);
  assert.deepEqual(tabs[0].open, []);

  const first = await daemon(t);
  await first.close();
  const second = await daemon(t);
  const page = await (await fetch(`${second.base}/`, { headers: bearer() })).text();
  assert.match(theStrip(page), new RegExp(`D1 ${path.basename(repo)}`));
});

test("an added deck's chat thread has its D-number and its deck's panels", (t) => {
  tempDeck(t);
  addDeck(aDirectory(t));
  const [chat] = listItems();

  const page = renderThreadPage(chat, listItems(), [], {}, listDeckNumbers(), false, listAdded());

  assert.match(page, /<nav class="threads"[^>]*>.*>D1<\/a>/, 'the code between the arrows');
  assert.match(page, /data-live="chat"[^>]*><p class="nobody">Nothing said here yet\.<\/p><form class="chat"/, 'its chat');
});

test('an added deck that never had a run shows no ended banner', (t) => {
  tempDeck(t);
  const { repo } = addDeck(aDirectory(t));

  const page = renderHomePage(listItems(), listStoredRuns(), repo, false, listDeckNumbers(), {}, Date.now(), listAdded());

  assert.ok(page.includes('Nothing is waiting on you'), 'the tab is drawn, and its queue is empty');
  assert.doesNotMatch(page, /class="ended-note"/, 'no session of its own has ended');
});

test('a later registerRun in that directory lands on the same tab', (t) => {
  tempDeck(t);
  const dir = aDirectory(t);
  const { repo } = addDeck(dir);

  registerRun({ repo: dir, pid: process.pid });

  const tabs = tabsOf(listStoredRuns(), listItems(), listDeckNumbers(), {}, listAdded());
  assert.equal(tabs.length, 1, 'one tab');
  assert.ok(sameRepo(tabs[0].repo, repo));
  assert.equal(tabs[0].number, 1, 'the same number');
  assert.equal(tabs[0].runs.length, 1);
  assert.equal(listItems().filter((item) => item.kind === 'chat').length, 1, 'one chat');
});

test('removeDeck drops the added entry and the tab goes', (t) => {
  tempDeck(t);
  const dir = aDirectory(t);
  const { repo } = addDeck(dir);

  removeDeck(repo);

  assert.deepEqual(listAdded(), []);
  assert.deepEqual(tabsOf(listStoredRuns(), listItems(), listDeckNumbers(), {}, listAdded()), []);
  assert.equal(Object.values(listDeckNumbers())[0], 1, 'the number is kept, never reused');
});

test('POST /add-deck from the page adds and redirects, and a foreign Origin is refused', async (t) => {
  const base = await deckOnAPort(t);
  const dir = aDirectory(t);
  const file = path.join(dir, 'notes.txt');
  fs.writeFileSync(file, 'x');

  for (const origin of ['http://evil.example', null]) {
    const refused = await post(base, { path: dir }, origin);
    assert.equal(refused.status, 403, `Origin ${origin}`);
  }
  assert.deepEqual(listAdded(), [], 'the refused calls wrote nothing');

  // A refusal lands back on the page the + was pressed on, the reason beside the box.
  const notADir = await post(base, { path: file, back: '/?all=1' });
  assert.equal(notADir.status, 303, 'no bare 400');
  const landed = new URL(notADir.headers.get('location'), base);
  assert.equal(landed.pathname, '/');
  assert.equal(landed.searchParams.get('all'), '1', 'the back page is kept');
  assert.match(landed.searchParams.get('refused'), /not a directory/);
  const shown = theStrip(await (await fetch(landed)).text());
  assert.match(shown, /<details class="add-deck" open>/, 'the + box is open');
  assert.match(shown, /<p class="refused" role="alert">[^<]*not a directory<\/p>/);
  for (const back of ['//evil.example/', '/.//evil.example/']) {
    const location = (await post(base, { path: file, back })).headers.get('location');
    assert.ok(!location.startsWith('//'), `${back} never becomes a protocol-relative Location`);
    assert.equal(new URL(location, base).origin, base, `${back} stays on the deck`);
  }

  const response = await post(base, { path: dir });
  const repo = fs.realpathSync.native(dir);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), `/?run=${encodeURIComponent(repo)}`);
  assert.equal(listAdded().length, 1);

  const again = await post(base, { path: dir });
  assert.equal(again.status, 303, 'a path already a tab goes to that tab');
  assert.equal(again.headers.get('location'), `/?run=${encodeURIComponent(repo)}`);
  assert.equal(listAdded().length, 1);
});

test('the strip ends in a + placeholder holding a path form', (t) => {
  tempDeck(t);
  const strip = theStrip(renderHomePage([], []));

  const plus = strip.slice(strip.indexOf('<details class="add-deck">'));
  assert.ok(plus.endsWith('</details></nav>'), 'the + is the last thing on the strip');
  assert.match(plus, /<summary[^>]*>\+<\/summary>/);
  assert.match(plus, /<form method="post" action="\/add-deck" data-in-place="move">/, 'and moves to where it lands in place');
  assert.match(plus, /<input[^>]* name="path"[^>]* required/);
  assert.match(plus, /<button[^>]*>Add<\/button>/);
  assert.match(plus, /<input type="hidden" name="back" value="\/\?run=">/, 'the form says where to land on a refusal');
  assert.doesNotMatch(plus, /refused/, 'no reason until one is given');
});
