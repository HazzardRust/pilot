/**
 * archive-page S1: the Archive screen lists closed tickets by day (spec 1, 2, 5, 7, 8; L3, L5, L10, L11).
 *
 * Every test takes its own store directory; nothing here touches port 4321 or the real store. The stores are
 * made by the deck's own writers: items through `postStored` and `listItems`, the month file by `archiveOld`.
 */

import './no-open.mjs';

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { mock, test } from 'node:test';

import { bearer } from '../../hooks/lib/deck-secret.js';
import { deckOnAPort, postStored, shapedTicketBody, tempDeck } from '../testUtils.mjs';

const { archiveOld, listItems } = await import('../store.mjs');
const { archiveRows, NEVER_SHOWN } = await import('../archive.mjs');
const { daySections } = await import('../ui/render-pages.mjs');
const { archiveView } = await import('../view/archive.mjs');

const REPO = 'D:/work/alpha';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

const ticket = (title, over = {}) =>
  postStored({ kind: 'ticket', title, body: shapedTicketBody(title), repo: REPO, sliceCount: 3, state: 'green', ...over });
const closed = (title, at, over = {}) => ticket(title, { postedAt: ago(at + HOUR), resolvedAt: ago(at), ...over });

/**
 * Three closed tickets (today, yesterday, 40 days ago, the last moved to its month file by `archiveOld`), one open
 * ticket and one closed chat; the live store read once through `listItems`, so it is in the current format (L10).
 */
function seed() {
  // Pinned to local midnight, so the run's time of day never moves a ticket into another day's section.
  const sinceMidnight = Date.now() - new Date().setHours(0, 0, 0, 0);
  const old = closed('the old ticket', 40 * DAY);
  archiveOld();
  const today = closed('the ticket closed today', Math.min(HOUR, sinceMidnight / 2));
  const yesterday = closed('the ticket closed yesterday', sinceMidnight + 12 * HOUR);
  const open = ticket('the open ticket');
  const chat = postStored({ kind: 'chat', title: 'a closed chat', body: 'hello', repo: REPO, resolvedAt: ago(HOUR) });
  listItems();
  return { old, today, yesterday, open, chat };
}

const monthFiles = (dir) => fs.readdirSync(dir).filter((name) => /^deck\.archive-\d{4}-\d{2}\.json$/.test(name));
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** Every path `fs` is asked to read or open while `run` runs. */
async function readsDuring(run) {
  const seen = [];
  const spies = ['readFileSync', 'openSync', 'readdirSync', 'createReadStream'].map((name) => {
    const original = fs[name];
    return mock.method(fs, name, function spied(file, ...rest) {
      seen.push(String(file).replaceAll('\\', '/'));
      return original.call(this, file, ...rest);
    });
  });
  try {
    await run();
  } finally {
    spies.forEach((spy) => spy.mock.restore());
  }
  return seen;
}

const view = async (base, query) => (await fetch(`${base}/api/view?${query}`, { headers: bearer() })).json();

test('closed tickets from both stores are rows', (t) => {
  const dir = tempDeck(t);
  const { old, today, yesterday, open } = seed();
  assert.equal(monthFiles(dir).length, 1, 'the old ticket sits in a month file');
  assert.ok(!listItems().some((item) => item.id === old.id), 'and not in the live store');

  const rows = archiveRows().filter((row) => row.kind === 'tickets');

  assert.deepEqual(rows.map((row) => row.id).sort(), [old.id, today.id, yesterday.id].sort());
  assert.ok(!rows.some((row) => row.id === open.id), 'an open ticket is no row');
  assert.equal(rows.find((row) => row.id === old.id).title, 'the old ticket');
});

test("rows sit in daySections' sections", async (t) => {
  const base = await deckOnAPort(t);
  const { old, today, yesterday, chat } = seed();

  const { regions } = await view(base, 'screen=archive');

  // The seeded v2 store was upgraded and written today, so its upgrade copy and `deck.json.bak` are rows of today's
  // section too (S15, F3).
  const todayKey = new Date().toLocaleDateString('sv-SE');
  const expected = daySections([today, yesterday, old, chat]).map(({ key, label, items }) => ({ key, heading: label, count: items.length + (key === todayKey ? 2 : 0) }));
  assert.equal(expected.length, 3, 'today, yesterday and a month');
  assert.deepEqual(regions.archive.days.map(({ key, heading, rows }) => ({ key, heading, count: rows.length })), expected);
  assert.deepEqual(regions.archive.days.map((day) => day.open), [true, false, false], 'only today is served open');
  const byKind = Object.groupBy(regions.archive.days.flatMap((day) => day.rows), (row) => row.kind);
  assert.deepEqual(
    Object.entries(byKind).map(([kind, rows]) => [kind, rows.length]).sort(),
    [['backup', 2], ['thread', 1], ['tickets', 3]],
  );
});

test('the screen writes nothing', async (t) => {
  const base = await deckOnAPort(t);
  const dir = process.env.PILOT_DECK_DIR;
  seed();
  const noticed = closed('a ticket with a notice', 2 * HOUR, { notice: true });
  listItems();
  const files = [path.join(dir, 'deck.json'), ...monthFiles(dir).map((name) => path.join(dir, name))];
  const before = files.map(sha);

  await view(base, 'screen=archive');
  await view(base, `screen=archive&id=${noticed.id}`);

  assert.deepEqual(files.map(sha), before, 'no stored byte changed');
  assert.equal(listItems().find((item) => item.id === noticed.id).notice, true, 'the notice is still there');
});

test('a credential is withheld and never-shown files are not read', async (t) => {
  const dir = tempDeck(t);
  const leaked = closed(`deploy with sk-${'a'.repeat(40)}`, HOUR);
  listItems();
  fs.writeFileSync(path.join(dir, 'deck-open.html'), '<p>secret</p>');
  fs.mkdirSync(path.join(dir, 'logs'));
  fs.writeFileSync(path.join(dir, 'logs', 'run.log'), 'raw output');
  assert.ok(fs.existsSync(path.join(dir, 'deck.secret')), 'the store has its secret');

  let rows;
  const seen = await readsDuring(() => {
    rows = archiveRows();
  });

  assert.equal(rows.find((row) => row.id === leaked.id).title, '<withheld: credential>');
  assert.ok(!JSON.stringify(rows).includes('sk-aaaa'), 'no string of any row holds the key');
  // Each never-shown glob as a path ending: `*` is any run of characters but `/`.
  assert.ok(NEVER_SHOWN.includes('deck.secret'), 'the secret is never shown');
  const globs = NEVER_SHOWN.map((glob) => new RegExp(`/${glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`));
  const never = seen.filter((file) => globs.some((glob) => glob.test(file)));
  assert.deepEqual(never, [], 'no never-shown file was read');
  assert.ok(seen.some((file) => file.endsWith('/deck.json')), 'the spy saw the store read');
});

test('other screens never read the archive', async (t) => {
  const base = await deckOnAPort(t);
  seed();

  let regions;
  const seen = await readsDuring(async () => {
    ({ regions } = await view(base, 'screen=home'));
  });

  assert.deepEqual(regions.archive, {});
  assert.deepEqual(seen.filter((file) => /deck\.archive-\d{4}-\d{2}\.json$|\.log$/.test(file)), [], 'no month file or log read');
  assert.ok(seen.some((file) => file.endsWith('/deck.json')), 'the spy saw the home read');
});

test("a row's detail builds no list beside it (F2)", (t) => {
  tempDeck(t);
  const { today } = seed();

  assert.ok(archiveView({ screen: 'archive' }).days.length > 0, 'the list has rows without an id');
  assert.deepEqual(archiveView({ screen: 'archive', id: today.id }), {}, 'the detail draws instead of the list');
});
