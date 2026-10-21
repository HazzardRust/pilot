/**
 * Which runs the deck holds, and which one of them is on screen.
 *
 * The deck serves every run on the machine, so a page that stacks all of them
 * shows an old session's questions beside the current run's table with nothing
 * to tell them apart. A tab is the answer, and a tab is a **repository** (D3):
 * an item carries `repo` and never a run id, two sessions opened on one feature
 * are one piece of work, and a run id is minted fresh on every registration.
 *
 * The join lives here rather than in `render.mjs`, which decides only what a
 * page looks like, or in `server.mjs`, which decides only which page answers
 * (D5). Like `items.mjs` and `status.mjs` this module reads no file, opens no
 * socket and emits no HTML, so both of those depend on it and neither depends
 * on the other. The one thing it asks of the operating system it asks through
 * `runs.mjs`: whether a session is still there, which is the whole of the
 * landing rule and is `isRunning` at the moment the question is put.
 */

import { liveRuns, repoKey, runName, sameRepo } from './runs.mjs';
import { queueOf } from './status.mjs';
import { KIND_TICKET, isOpen, isUnacknowledged, liveTicketOf } from './items.mjs';

/**
 * The name the pilot gave the newest session of a tab that gave one, and
 * nothing at all when none of them did — which is where `runName` comes in
 * (spec 4).
 *
 * Newest rather than first because two sessions on one repository are one tab
 * (D3), and the tab has to be able to move on: the second session opened on a
 * repository is usually the next feature, and the one that spoke last is the
 * one saying what the work is now. A session that never named the run says
 * nothing about it either way, so it does not unname the tab.
 */
function featureOf(runs) {
  return runs.findLast((run) => typeof run.feature === 'string' && run.feature !== '')?.feature;
}

/**
 * The number the store minted for this directory (spec 10, L2), or null.
 *
 * Looked up by `repoKey` and not by the tab's own `repo`, because the map was
 * keyed when some other process spelled the path: a tab found through a
 * trailing separator or a differently-cased drive letter is the same deck and
 * keeps its number.
 *
 * Null is the ordinary answer, not a failure. Numbering is lazy, so a directory
 * that has not registered since it arrived has no number yet (A5) and its tab
 * reads its label alone — a placeholder would be the deck naming something it
 * does not know. The guard also holds for a hand-edited map: `deck.json` is
 * plain JSON a human is invited to look at, and whatever they leave in it is
 * not drawn on a tab.
 */
function numberOf(numbers, repo) {
  const number = numbers[repoKey(repo)];
  return Number.isInteger(number) && number > 0 ? number : null;
}

/**
 * The strip: one tab per repository, in the order the repositories were first
 * registered, each holding its own sessions and its own open items.
 *
 * `open` is `queueOf` narrowed to the tab, so a tab's queue and the deck's
 * queue are the same notion of open and cannot drift apart. An open item whose
 * repository has no record left gets a tab of its own (D4); one that names no
 * repository at all belongs to no tab and stays where it always was — on the
 * overview, which is every open item there is.
 *
 * A tab's name is the pilot's when a session gave one and the directory's
 * otherwise — the fallback, never a second name (D9, spec 4). It is the only
 * name the page uses: the strip and the panels under it both read it, so the
 * tab and the headings beneath it cannot come to say two different things.
 *
 * Its *number* is not a name at all but the deck's identity (spec 10), so it is
 * looked up rather than derived: `numbers` is `listDeckNumbers()`, read once
 * where the page is served and not once per tab, which is how this module goes
 * on reading no file. A caller with nothing to say about numbering — the
 * renderer's own tests, and the page that names no one deck — passes none, and
 * every tab is then a deck without one.
 *
 * Only the home page passes stored runs; `renderDeckPage` and `renderThreadPage`
 * pass `listRuns()`, which is live-only. A tab built from items alone has no
 * record either way, so on those two pages it is always `ended` — which
 * `landingFor` skips and `renderStrips` draws nothing for. Neither page renders
 * the strip, so no ended tab can surface there; a page that grew one would have
 * to read stored runs to be honest about it.
 */
export function tabsOf(runs, items, numbers = {}, agents = {}, added = [], wrapped = {}, lanes = { coPilots: {}, switches: {} }) {
  const tabs = [];
  for (const run of runs) {
    // A run 0.7.19's sub-deck registered is no tab (yellow-agent L15), as the store drops it on read.
    if (typeof run.parent === 'string') continue;
    const tab = tabFor(tabs, run.repo);
    if (tab) tab.runs.push(run);
    else tabs.push({ repo: run.repo, runs: [run], open: [] });
  }
  // An open ticket is agreed work waiting for this directory's next run (run-chaining
  // spec 2): it keeps an ended tab, and its Tickets section, without ever waiting.
  const tickets = items.filter((item) => item.kind === KIND_TICKET && isOpen(item));
  const queue = queueOf(items);
  // A tab with no record is made in store order and not the queue's newest-said
  // order: a strip that reordered itself as replies land is what L13 spares Tickets.
  const queued = new Set(queue);
  for (const item of items) {
    if (queued.has(item) && !tabFor(tabs, item.repo) && namesATab(item.repo)) tabs.push({ repo: item.repo, runs: [], open: [] });
  }
  for (const item of [...queue, ...tickets]) {
    let tab = tabFor(tabs, item.repo);
    // A repository with an open thread and no record at all still gets a tab:
    // `MAX_RUNS` can evict the record of a run that has ended, and the question
    // the user has not answered yet must not leave the strip with it (D4). The
    // floor is the repository, which is the only key an item carries.
    if (!tab && namesATab(item.repo)) tabs.push((tab = { repo: item.repo, runs: [], open: [] }));
    if (tab && item.kind === KIND_TICKET) tab.tickets = true;
    else tab?.open.push(item);
  }
  // A directory the user added by path (deck-polish spec 5, L3, ADR 0048) is a tab
  // with no run and nothing open, and keeps it until its Close drops the entry.
  for (const { repo } of added) {
    let tab = tabFor(tabs, repo);
    if (!tab && namesATab(repo)) tabs.push((tab = { repo, runs: [], open: [] }));
    if (tab) tab.added = true;
  }
  // Named and judged once each tab holds all its sessions: both are questions
  // about the group, not about the session that happened to open it. A tab has
  // ended when none of its sessions is still up — including a tab that has no
  // record left at all, which is the same answer read from the other end.
  for (const tab of tabs) {
    tab.name = featureOf(tab.runs) ?? runName(tab.repo);
    tab.number = numberOf(numbers, tab.repo);
    // Who is live in this deck right now (spec 9). Looked up like the number
    // and for the same reason: the roster is keyed on the working directory,
    // which is what a tab is, and this module goes on reading nothing itself.
    // A caller with no roster to hand — the renderer's own tests, and every
    // page served before an agent has called a tool — gets a tab with nobody on
    // it, which is what an empty Agents panel says.
    tab.agents = agents[repoKey(tab.repo)] ?? [];
    // Whether a `pilot run` wrapper's stream is open here (start-end-session L6): what
    // End needs, looked up like the roster from a map the daemon holds in memory.
    tab.wrapped = wrapped[repoKey(tab.repo)] === true;
    // The ticket this deck's live co-pilot builds and its lanes' switch records (ticket-state-accents L3), from `deckLanes()`'s one store read.
    tab.coPilot = lanes.coPilots[repoKey(tab.repo)] ?? null;
    tab.switching = lanes.switches[repoKey(tab.repo)] ?? {};
    // Its run records in store order (three-lanes S5 A-f6): what the Status tab finds a held ticket's table in.
    tab.records = (lanes.records ?? []).filter((entry) => entry?.repo === repoKey(tab.repo) && entry.record).map((entry) => entry.record);
    tab.ended = liveRuns(tab.runs).length === 0;
    // A live ticket this deck holds, of either stage (FF; three-lanes spec 6): what makes its ended tab's Start read Resume.
    tab.holding = Boolean(liveTicketOf(items, tab.repo));
    // A hand-off nobody has picked up (spec 19): read off the clock now, like the thread's own state.
    tab.unacknowledged = tab.open.some((item) => isUnacknowledged(item));
  }
  // An ended run keeps its tab while it has open items or an open ticket, and drops off once none
  // is (spec 6). A live run is on the strip whether or not anything is waiting
  // on it: that is the run saying it exists, which is what the strip is for.
  // One closed still holding its ticket (FF) keeps its tab for Resume.
  return tabs.filter((tab) => !tab.ended || tab.open.length > 0 || tab.tickets === true || tab.added === true || tab.holding);
}

/**
 * A path that could name a tab. A blank one is refused here rather than at each
 * caller because `path.resolve('')` is the *current* directory, so a blank repo
 * matches whichever repository the deck process was started in — the home
 * directory, for the daemon a session starts (`deck/client.mjs:18`), and so the
 * "Hazzard" tab this feature exists to stop appearing by accident. `newRun`
 * refuses a blank repo too, so this is the same rule read from the other end:
 * what cannot be registered cannot be selected, and cannot be conjured out of an
 * item either.
 */
const namesATab = (repo) => typeof repo === 'string' && repo.trim() !== '';

/**
 * The tab a path names, or null. `sameRepo` because the three processes that
 * write a path — the session, the hook and the user's address bar — agree on
 * the characters and not always on the separators or, on Windows, the case.
 * Null is the ordinary answer, not a failure: a run can vanish between two of
 * the deck's changes, and the page the user is on must still render (D2). A
 * blank path is one of those nulls, for the reason `namesATab` gives: `/?run=`
 * — an address bar cleared to its query, or a stray link — must not land on
 * whichever repository the deck process was started in.
 */
export function tabFor(tabs, repo) {
  if (!namesATab(repo)) return null;
  return tabs.find((tab) => sameRepo(tab.repo, repo)) ?? null;
}

/**
 * The tab the deck opens on when the URL names none: the sole live one when
 * exactly one tab has a live session, and otherwise null, which is the overview
 * (D11). The single-run user — the common case — keeps their table and tree on
 * screen on arrival; the day a second run starts, the landing page becomes the
 * overview that can honestly show both.
 *
 * An ended tab is on the strip but is not somewhere to land: the deck opening
 * on a session that is no longer there would be the stale page this feature
 * exists to end, and the thread keeping that tab alive is on the overview
 * anyway. "Live" is the tab's own answer, decided once in `tabsOf`, so the
 * strip and the landing rule cannot come to disagree about which runs are up.
 */
export function landingFor(tabs) {
  const live = tabs.filter((tab) => !tab.ended);
  return live.length === 1 ? live[0] : null;
}
