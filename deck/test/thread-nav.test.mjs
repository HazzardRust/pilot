/**
 * S11 of deferred-ledger: the header of a thread, rearranged (spec 15, L19, L20).
 *
 * The title moves to the top-left over the rail, the way back takes its place
 * at the start of the header, the kind line loses its "on", and the header's
 * centre is `‹ D3 ›`: the thread's deck, between two arrows that walk every
 * deck's open threads in the overview's own order. A chat is never a step,
 * because it is never in the overview's queue (L6), and there is no wrap.
 *
 * All of it is a claim about bytes the renderer returns, so it is proven here
 * on the renderer alone; the geometry is the browser's, and the slice's PR
 * carries those measurements.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { renderHomePage, renderThreadPage } = await import('../ui/render.mjs');
const { repoKey } = await import('../items.mjs');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const uiFile = (name) => fs.readFileSync(path.join(HERE, '..', 'ui', name), 'utf8');

const AT = '2026-09-16T09:14:00.000Z';
const MINE = path.join('D:', 'work', 'pilot');
const THEIRS = path.join('D:', 'work', 'kettle');
const NUMBERS = { [repoKey(MINE)]: 1, [repoKey(THEIRS)]: 2 };

const runOn = (repo, id, name) => ({ id, repo, name, pid: process.pid, startedAt: AT, slices: [] });
const RUNS = [runOn(MINE, 'run_000000000001', 'pilot'), runOn(THEIRS, 'run_000000000002', 'kettle')];

let minted = 0;
const anItem = (over = {}) => ({
  id: `itm_${String((minted += 1)).padStart(12, '0')}`,
  kind: 'question',
  title: 'A question',
  body: 'the body',
  repo: MINE,
  postedAt: AT,
  replies: [],
  ...over,
});

/** The header's centre, as the renderer wrote it, or undefined. */
const navOf = (page) => /<nav class="threads" data-live="nav">([\s\S]*?)<\/nav>/.exec(page)?.[1];

/**
 * The nav read the way a user reads it: the step back, the code, the step on.
 * An arrow that is a link reads as its href; an inert one reads as null, and is
 * only inert if it says so to a screen reader too.
 */
function stepsOf(page) {
  const nav = navOf(page);
  assert.ok(nav !== undefined, 'the header carries the nav');
  const parts = [...nav.matchAll(/<(a|span)([^>]*)>([^<]*)<\/\1>/g)].map(([, tag, attrs, text]) => ({
    tag,
    href: /href="([^"]*)"/.exec(attrs)?.[1] ?? null,
    inert: /aria-disabled="true"/.test(attrs),
    text,
  }));
  const arrow = (glyph) => {
    const found = parts.find((part) => part.text === glyph);
    assert.ok(found, `the nav draws ${glyph} whether or not it goes anywhere`);
    if (found.tag === 'span') {
      assert.ok(found.inert, `an ${glyph} that goes nowhere says so (aria-disabled)`);
      return null;
    }
    return found.href;
  };
  const code = parts.find((part) => part.text !== '‹' && part.text !== '›') ?? null;
  return { prev: arrow('‹'), code: code && { text: code.text, href: code.href }, next: arrow('›') };
}

const threadHref = (item) => `/thread/${encodeURIComponent(item.id)}`;
const page = (item, items, runs = RUNS, numbers = NUMBERS) => renderThreadPage(item, items, runs, {}, numbers);
const kindOf = (html) => /<span class="kind"[^>]*>([\s\S]*?)<\/span>\s*<nav/.exec(html)?.[1] ?? '';

test('the arrows walk the queue: first, middle and last, with inert ends and no wrap (L20)', () => {
  const [first, middle, last] = [anItem(), anItem(), anItem()];
  const items = [first, middle, last];

  assert.deepEqual(
    [stepsOf(page(first, items)).prev, stepsOf(page(first, items)).next],
    [null, threadHref(middle)],
    'the first thread has nothing before it, and does not wrap to the last',
  );
  assert.deepEqual(
    [stepsOf(page(middle, items)).prev, stepsOf(page(middle, items)).next],
    [threadHref(first), threadHref(last)],
  );
  assert.deepEqual(
    [stepsOf(page(last, items)).prev, stepsOf(page(last, items)).next],
    [threadHref(middle), null],
    'the last thread has nothing after it, and does not wrap to the first',
  );
});

/** The X/N span beside the nav, as the renderer wrote it, or undefined. */
const positionOf = (page) => /<span class="position" data-live="position">([^<]*)<\/span>/.exec(page)?.[1];

test('"put an X/N there": the header counts the thread\'s place in the same queue the arrows walk', () => {
  // The walkthrough's own words: "I want feedback on what thread I am in out
  // of how many ... so as you move it goes 1/3, 2/3, 3/3."
  const [first, middle, last] = [anItem(), anItem(), anItem()];
  const items = [first, middle, last];

  assert.equal(positionOf(page(first, items)), '1/3');
  assert.equal(positionOf(page(middle, items)), '2/3');
  assert.equal(positionOf(page(last, items)), '3/3');
});

test('a thread off the queue draws no position, the same as its arrows drawing no place to go', () => {
  const settled = anItem({ resolvedAt: AT, resolution: 'answered' });

  assert.equal(positionOf(page(settled, [settled, anItem()])), undefined);
});

test('the position sits beside the nav, in the same live region the arrows themselves update through', () => {
  const [first, second] = [anItem(), anItem()];
  const withPosition = page(first, [first, second]);
  const at = withPosition.indexOf('</nav>');

  assert.ok(at !== -1, 'the nav must still be there');
  assert.match(
    withPosition.slice(at),
    /^<\/nav><span class="position" data-live="position">1\/2<\/span>/,
    'the position is its own live region right after the nav, not inside it, so a swap of one need not touch the other',
  );
});

test('a thread off the queue (settled) steps back to the queue\'s last and on to its first (L20)', () => {
  const settled = anItem({ resolvedAt: AT, resolution: 'answered' });
  const [first, second] = [anItem(), anItem()];

  const steps = stepsOf(page(settled, [settled, first, second]));

  assert.equal(steps.prev, threadHref(second), "the nearest open thread above it in the overview's list");
  assert.equal(steps.next, threadHref(first));
  assert.deepEqual(stepsOf(page(settled, [settled])), { prev: null, code: steps.code, next: null }, 'an empty queue has nowhere to go');
});

test("the walk crosses decks in the overview's order, and the code names each thread's own deck (L20)", () => {
  const a = anItem({ title: 'D1 first' });
  const b = anItem({ title: 'D2 first', repo: THEIRS });
  const c = anItem({ title: 'D1 second' });
  const d = anItem({ title: 'D2 second', repo: THEIRS });
  const items = [a, b, c, d];

  // The overview's order, read off the overview itself rather than assumed.
  const overview = renderHomePage(items, RUNS, '', false, NUMBERS);
  const order = [...overview.matchAll(/<h2><a href="([^"]+)">/g)].map((match) => match[1]);
  assert.deepEqual(order, items.map(threadHref), 'the overview lists the four in this order');

  const walked = [];
  let at = a;
  while (at) {
    const steps = stepsOf(page(at, items));
    walked.push([threadHref(at), steps.code.text]);
    at = items.find((item) => threadHref(item) === steps.next);
  }
  assert.deepEqual(walked, [
    [threadHref(a), 'D1'],
    [threadHref(b), 'D2'],
    [threadHref(c), 'D1'],
    [threadHref(d), 'D2'],
  ]);
});

test("the code is the deck's tab link, and the tab's label is that code and the name (L20)", () => {
  const mine = anItem();
  const theirs = anItem({ repo: THEIRS });
  const items = [mine, theirs];
  const strip = /<nav class="runs-strip" data-live="tabs">([\s\S]*?)<\/nav>/.exec(
    renderHomePage(items, RUNS, '', false, NUMBERS),
  )[1];
  const tabs = [...strip.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)</g)].map(([, href, text]) => ({ href, text }));

  for (const [item, name] of [
    [mine, 'pilot'],
    [theirs, 'kettle'],
  ]) {
    const { code } = stepsOf(page(item, items));
    const tab = tabs.find((each) => each.href === code.href);
    assert.ok(tab, `the code on ${name}'s thread goes exactly where ${name}'s tab goes`);
    assert.equal(tab.text, `${code.text} ${name}`, 'one spelling of the code, read by both');
  }
});

test('a chat is never a step, and its own page steps on to the queue\'s first (L6, L20)', () => {
  const chat = anItem({ kind: 'chat', title: 'Chat' });
  const [first, second] = [anItem(), anItem()];
  const items = [first, chat, second];

  assert.equal(stepsOf(page(first, items)).next, threadHref(second), 'the chat between them is stepped over');
  assert.equal(stepsOf(page(second, items)).prev, threadHref(first));
  assert.deepEqual([stepsOf(page(chat, items)).prev, stepsOf(page(chat, items)).next], [null, threadHref(first)]);
});

test('the kind line says what and when, and no longer "on" whose (spec 15)', () => {
  const item = anItem();
  const html = page(item, [item]);
  const kind = kindOf(html);

  assert.match(kind, /^<span class="accent" data-accent="blue"><\/span><span class="state"[^>]*>posted<\/span> · question · <time/, 'the state leads, then the kind and the moment');
  assert.doesNotMatch(kind, / on /);
  assert.doesNotMatch(kind, /<a /, 'the deck link has moved to the centre');
});

test('an unnumbered deck shows its name, and a thread with no deck shows the arrows alone (L20)', () => {
  const item = anItem();
  const orphan = anItem({ repo: undefined });

  assert.equal(stepsOf(page(item, [item, orphan], RUNS, {})).code.text, 'pilot');
  assert.deepEqual(stepsOf(page(orphan, [item, orphan])), { prev: threadHref(item), code: null, next: null });
});

test('the header: the arrow first, the nav live, the title in the top-left box on every page (L19, A8)', () => {
  const thread = uiFile('thread.html');
  assert.match(
    thread,
    /<header>\s*(?:<!--(?:(?!-->)[\s\S])*-->\s*)?<a class="back" href="<!--BACK-->"[^>]*>←<\/a>\s*<span class="kind" data-live="kind"><!--KIND--><\/span>\s*<!--NAV-->\s*<!--USAGE-->\s*<\/header>/,
    'the way back leads the header, where the title stood; then the kind, the nav and the readout',
  );
  for (const name of ['home.html', 'index.html', 'thread.html']) {
    assert.match(uiFile(name), /<h1><a href="<!--HOME-->">Pilot deck<\/a><\/h1>/, `${name} keeps its title`);
  }

  const css = uiFile('deck.css');
  const rule = (selector) => new RegExp(`\\n${selector.replace(/[.[\]]/g, '\\$&')} \\{([^}]*)\\}`).exec(css)?.[1] ?? '';
  const h1 = rule('h1');
  assert.match(h1, /position: fixed/, 'the title stands in the top-left box on every page');
  assert.match(h1, /width: calc\(var\(--rail\) \+ var\(--panel\)\)/, 'which is the rail and the panel, the column it is centred over');
  assert.match(h1, /text-align: center/);
  assert.doesNotMatch(rule('.back'), /position: fixed/, 'the arrow travels in the sticky header now');
  assert.match(rule('.threads'), /\S/, 'the nav has a rule of its own');
});

test('the back arrow shares the text\'s baseline and line, and its glyph is lowered onto the text\'s centreline', () => {
  const css = uiFile('deck.css');
  const rule = (selector) => new RegExp(`\\n${selector.replace(/[.[\]]/g, '\\$&')} \\{([^}]*)\\}`).exec(css)?.[1] ?? '';

  // "The backlink arrow needs to be moved down so that its centreline is in
  // line with the centreline of the text." Centring its box on the row left
  // the ink 3px high (a hidden 24px copy in `header::after` makes the row
  // taller than the text), and the glyph itself sits 0.31em over its baseline
  // where the text's x-height centre sits 3.5px over its own. So: the same
  // baseline and the same 13px x 1.6 line as the text, then one sixth of an
  // em down, which is the 4px measured at 24px in Chrome on Windows.
  assert.match(rule('header'), /align-items:\s*baseline/, 'the header itself still aligns everything to baseline');
  assert.doesNotMatch(rule('.back'), /align-self/, 'the arrow keeps the header\'s baseline rather than the row\'s centre');
  assert.match(rule('.back'), /line-height:\s*calc\(13px \* 1\.6\)/, 'the arrow\'s line box is the text\'s');
  assert.match(rule('.back'), /translate:\s*0 calc\(1em \/ 6\)/, 'and its glyph comes down onto the text\'s centreline');
});

test('the position span lands in the column reserved to mirror the kind line, right-aligned', () => {
  const css = uiFile('deck.css');
  const rule = (selector) => new RegExp(`\\n${selector.replace(/[.[\]]/g, '\\$&')} \\{([^}]*)\\}`).exec(css)?.[1] ?? '';
  const position = rule('.position');

  assert.match(position, /text-align:\s*right/, 'it sits against the header\'s right edge');
  assert.doesNotMatch(position, /grid-column/, 'no explicit placement: it is the fourth item in flow, the way the nav is the third');
});

/*
 * "I want the OPEN/ALL button to exist inside the threads ... When it is set to
 * ALL, N means all the threads and it lets me navigate all of them. The moment
 * it switches to OPEN, the next navigation jumps to the next open thread in
 * that direction." The view rides in the thread's address as it does the tab's.
 */
const pageIn = (all) => (item, items) => renderThreadPage(item, items, RUNS, {}, NUMBERS, all);
const toggleOf = (html) => /<a class="everything[^"]*" href="([^"]*)"[^>]*>(\w+)<\/a>/.exec(html)?.slice(1);

test('the Open/All toggle stands on the thread page and flips the view on the same thread', () => {
  const item = anItem();

  assert.deepEqual(toggleOf(pageIn(false)(item, [item])), [`${threadHref(item)}?all=1`, 'Open']);
  assert.deepEqual(toggleOf(pageIn(true)(item, [item])), [threadHref(item), 'All']);
});

test("under All the arrows and X/N walk every thread in the overview's order, settled ones included", () => {
  const [first, settled, second] = [anItem(), anItem({ resolvedAt: AT, resolution: 'answered' }), anItem()];
  const items = [first, settled, second];
  const html = pageIn(true)(settled, items);

  assert.equal(positionOf(html), '3/3');
  assert.equal(stepsOf(html).prev, `${threadHref(second)}?all=1`);
  assert.equal(stepsOf(html).next, null);
  assert.equal(positionOf(pageIn(true)(second, items)), '2/3');
  assert.match(stepsOf(html).code.href, /&amp;all=1$/, 'the way back to the tab keeps the view');
});

test('under Open a settled thread shows no position and its arrows go to open threads only', () => {
  const [first, settled, second] = [anItem(), anItem({ resolvedAt: AT, resolution: 'answered' }), anItem()];
  const html = pageIn(false)(settled, [first, settled, second]);

  assert.equal(positionOf(html), undefined);
  assert.deepEqual([stepsOf(html).prev, stepsOf(html).next], [threadHref(second), threadHref(first)]);
});
