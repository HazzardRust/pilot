/**
 * S4 of start-end-session: End ends that deck's `pilot run` (spec 5, 8; L1, L5, L6; A3, A6).
 * The daemon kills nothing: End is an `end` event written on the wrapper streams of that one
 * repository, and each wrapper stops its own pty (`deck/run.mjs`). Nothing here starts or
 * ends a process; the wrappers are this test's own streams.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deckOnAPort, respelt, tempDeck } from '../testUtils.mjs';
import { addWrapper, endSession } from '../session.mjs';
import { repoKey } from '../items.mjs';
import { renderHomePage } from '../ui/render.mjs';

const { DeckRefusal, listDeckNumbers, listItems, registerRun, storedTabFor } = await import('../store.mjs');

const ALPHA = 'D:/work/alpha & co';
const BETA = 'D:/work/beta';

/** A wrapper's stream on `repo`, with everything it has been sent so far. */
async function aWrapper(t, base, repo) {
  const stopping = new AbortController();
  const response = await fetch(`${base}/events?wrapper=${encodeURIComponent(repo)}`, { signal: stopping.signal });
  t.after(() => stopping.abort());
  let text = '';
  (async () => {
    const decoder = new TextDecoder();
    try {
      for await (const chunk of response.body) text += decoder.decode(chunk, { stream: true });
    } catch {
      // Aborted by the test.
    }
  })();
  return { ends: () => text.split('event: end\n').length - 1 };
}

const post = (base, fields, headers = { origin: base }) =>
  fetch(`${base}/end-session`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(fields),
    redirect: 'manual',
  });

/** Where a refused POST landed, and the reason it carries there. */
const landing = (response) => {
  const url = new URL(response.headers.get('location'), 'http://deck');
  return { run: url.searchParams.get('run'), reason: url.searchParams.get('sessionRefused') };
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

// No re-announce left running into a later test.
const NO_GRACE = { wrapperGoneMs: [] };

test('End goes only to that repository\'s wrappers', async (t) => {
  const base = await deckOnAPort(t, NO_GRACE);
  registerRun({ repo: ALPHA, pid: process.pid });
  registerRun({ repo: BETA, pid: process.pid });
  // Two wrappers on one repository are both ended: a tab is a repository (A6).
  const first = await aWrapper(t, base, ALPHA);
  const second = await aWrapper(t, base, respelt(ALPHA));
  const other = await aWrapper(t, base, BETA);
  await settle();

  const response = await post(base, { repo: ALPHA });
  await settle();

  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), `/?run=${encodeURIComponent(ALPHA)}`);
  assert.equal(first.ends(), 1);
  assert.equal(second.ends(), 1, 'every wrapper on the repository, in any spelling');
  assert.equal(other.ends(), 0, "a second repository's stream receives nothing");
});

test('endSession tells the wrappers of that repo only', () => {
  // Repositories no other test opens a stream on, whose closes may still be in flight.
  const [gamma, delta] = ['D:/work/gamma', 'D:/work/delta'];
  const sent = [];
  const removeGamma = addWrapper(gamma, { send: (event) => sent.push(['gamma', event]) });
  const removeDelta = addWrapper(delta, { send: (event) => sent.push(['delta', event]) });
  try {
    endSession(gamma);
    assert.deepEqual(sent, [['gamma', 'end']]);
    assert.throws(() => endSession('D:/work/nobody'), (err) => err instanceof DeckRefusal && err.status === 409);
  } finally {
    removeGamma();
    removeDelta();
  }
});

test('End with no wrapper lands back on the tab with its reason, and a foreign Origin is 403', async (t) => {
  const base = await deckOnAPort(t, NO_GRACE);
  // A plain `claude` session: live, registered, and no wrapper to tell (spec 8).
  registerRun({ repo: ALPHA, pid: process.pid });

  const plain = await post(base, { repo: ALPHA });
  assert.equal(plain.status, 303, 'back to the tab, not a bare error page');
  assert.deepEqual(landing(plain), { run: storedTabFor(ALPHA).repo, reason: 'no pilot run is live in this deck to end' });
  await plain.text();

  const nowhere = await post(base, { repo: 'D:/work/not-a-tab' });
  assert.equal(nowhere.status, 303);
  assert.equal(landing(nowhere).reason, 'that directory is not a deck tab');
  await nowhere.text();

  const wrapper = await aWrapper(t, base, ALPHA);
  await settle();
  for (const headers of [{ origin: 'http://evil.example' }, {}]) {
    const refused = await post(base, { repo: ALPHA }, headers);
    assert.equal(refused.status, 403, `Origin ${headers.origin ?? 'absent'}`);
    await refused.text();
  }
  await settle();
  assert.equal(wrapper.ends(), 0, 'a refused End tells nobody');
});

test('a live tab with a wrapper draws End; a live tab without one draws nothing', (t) => {
  tempDeck(t);
  const live = registerRun({ repo: ALPHA, pid: process.pid });
  const strip = (wrapped) => {
    const page = renderHomePage(listItems(), [live], ALPHA, false, listDeckNumbers(), {}, Date.now(), [], null, wrapped);
    return page.slice(page.indexOf('<aside class="strip right">'), page.indexOf('</aside>', page.indexOf('strip right')));
  };

  const plain = strip({});
  assert.doesNotMatch(plain, /end-session/, 'a plain-claude live tab shows no End (spec 8)');
  assert.doesNotMatch(plain, /start-session/, 'and no Start');

  const end = strip({ [repoKey(ALPHA)]: true });
  assert.match(end, /<details class="session"><summary>End<\/summary>/);
  assert.match(end, /<form class="session" method="post" action="\/end-session" data-confirm-row data-in-place>/);
  assert.ok(end.includes(`name="repo" value="${live.repo.replace('&', '&amp;')}"`), 'the repo, escaped');
  assert.match(end, /<div class="step sure" hidden><p>End D\d+\? /, 'confirmed in place, as Start is');
  assert.match(end, /<button type="submit" data-confirm>End<\/button>/, 'End, the trigger');
  assert.match(end, /<button type="submit">Confirm<\/button>/);
});

test("a live tab's page draws End once its wrapper's stream is open", async (t) => {
  // The daemon's own `listWrapped()` reaching the page: a render test hands it in by hand.
  const base = await deckOnAPort(t, NO_GRACE);
  registerRun({ repo: ALPHA, pid: process.pid });
  const tab = `${base}/?run=${encodeURIComponent(ALPHA)}`;
  assert.doesNotMatch(await (await fetch(tab)).text(), /action="\/end-session"/, 'no wrapper yet');

  await aWrapper(t, base, ALPHA);
  await settle();

  assert.match(await (await fetch(tab)).text(), /action="\/end-session"/);
});

test('a wrapper stream opening tells the pages, so End appears on its tab', async (t) => {
  // The wrapper subscribes only after its session has registered, so the page has already
  // re-rendered that tab without a wrapper; this is the change that draws End on it.
  const base = await deckOnAPort(t, NO_GRACE);
  const stopping = new AbortController();
  t.after(() => stopping.abort());
  const page = await fetch(`${base}/events`, { signal: stopping.signal });
  const heard = (async () => {
    const decoder = new TextDecoder();
    let text = '';
    for await (const chunk of page.body) {
      text += decoder.decode(chunk, { stream: true });
      if (text.includes('event: changed')) return true;
    }
    return false;
  })().catch(() => false);

  await aWrapper(t, base, ALPHA);

  const timedOut = new Promise((resolve) => setTimeout(() => resolve('timed out'), 2000));
  assert.equal(await Promise.race([heard, timedOut]), true);
});
