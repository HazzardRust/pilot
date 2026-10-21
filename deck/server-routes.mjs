/**
 * The deck's surface: the page a human reads, and the JSON API a Claude session's
 * stdio client calls. Both run inside the daemon (`deck/daemon.mjs`), over the one
 * store in `deck/store.mjs`, which is what makes the daemon the only writer (L3).
 *
 * Slice 1 had one process per session, each trying to bind the port and each writing
 * the store directly. Slice 2 split that in two: this file is the long-lived half, and
 * `deck/client.mjs` is the per-session half that has no way to touch the store at all.
 * The guards did not change with the move and must not: `isOwnHost` on every route,
 * the Origin check on every write, and one size limit shared by the form and the API.
 * The API is held to two more, because it is the newer door — a JSON content type,
 * which a cross-site form cannot send, and a transport bound on the request body.
 *
 * `deck_wait` is the first layer of A1. It is a long poll: the request is parked on an
 * event and answered the moment a reply is written, or when its timeout elapses. There
 * is deliberately no loop and no interval — a poll that woke every second to look at
 * the store would cost a file read a second per waiting session, for a latency nobody
 * would notice the difference in.
 *
 * Slice 3 took the HTML out: `deck/ui/render.mjs` decides what a page looks like and
 * this file decides which page answers a request. The same event the long poll is
 * parked on now also drives `/events`, so the browser learns about a change the moment
 * a waiting session does, and neither of them polls for it.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import { readAlertSwitch, setAlertSwitch } from './alert-switch.mjs';
import { AgentRefusal, heldWaits, isAgentType, listAgents, noteAgent } from './agents.mjs';
import { chainNext, fillLanes } from './chain.mjs';
import { KIND_GATE2, SIGN_OFF, chosenOf, isGate, ownerOf } from './items.mjs';
import { startLanding } from './landing.mjs';
import { lanesOf } from './lanes.mjs';
import { owedThreadsOf } from './owed.mjs';
import { workSince } from './work.mjs';
import { answerOpen } from './launch.mjs';
import { openDeck } from './open.mjs';
import { selectItems } from './read.mjs';
import { sameRepo } from './runs.mjs';
import { WRITING_TOOLS, readLimit, runTool } from './server-tools.mjs';
import {
  THREAD_PATH, UI_ASSETS, UnsupportedMediaType, WRAPPER_GONE_MS, announceChange, armHandoffs, backPath, browserCount,
  deckGuard, isAuthorized, isOwnHost, isTrustedOrigin, landRefusal, landRefusedPress, readFormBody, readJsonBody,
  refuseWithoutSecret, replyFrom, send, sendJson, threadIdIn, watchAsWrapper, watchForChanges,
} from './server-wait.mjs';
import { clearStarting, endSession, listWrapped, startSession } from './session.mjs';
import {
  DeckRefusal, addDeck, addReply, archivedItem, budgetFor, coPilotFor, clearAllNotices, clearNotice, closeItem, createThread, currentSeq,
  dismissItem, dismissRun, listAdded, listDeckNumbers, listItems, listLiveRuns, listRuns, listStoredRuns, deckLanes,
  moveTicket, noteLaneFilled, cancelSwitch, refuseLaneSwitch, requestSwitch, resumableRecordFor, yellowHeadOf, recordForTicket,
  recordsFor, registerRun, removeDeck, reopenItem, setBudget, storedTabFor,
} from './store.mjs';
import { queueView } from './tickets.mjs';
import { renderDeckPage, renderHomePage, renderThreadPage } from './ui/render.mjs';
import { readUsage } from './usage.mjs';

import { deckUrl } from './tools.mjs';
import { healthOf } from './health.mjs';
import { logRefusal } from './refusal-log.mjs';
import { exitRoute } from './exit-route.mjs';
import { holdRoute } from './hold-route.mjs';

// --- routes ----------------------------------------------------------------

/**
 * Whether a write came from the deck's own page: an Origin present and matching the
 * Host. Stricter than `isTrustedOrigin`, which lets an absent Origin through for curl
 * and the stdio client; the writes that change a whole deck take neither.
 */
const fromOwnPage = (request) => request.headers.origin === `http://${request.headers.host}`;

/** The guard's exemptions, by name and never by prefix (deck-token L4): `/open` checks its own key, the UI's files and health hold no deck data. */
export const OPEN_ROUTES = (request, pathname) => request.method === 'GET' && (pathname === '/open' || pathname === '/api/health' || UI_ASSETS.has(pathname));

async function route(request, response, open, start, wrapperGoneMs, land, exit, guard) {
  if (!isOwnHost(request)) {
    return send(
      response,
      421,
      'text/plain; charset=utf-8',
      'the deck answers only to its own loopback address\n',
    );
  }

  // A request target `URL` cannot parse is a 400, not a crash. Slice 1 could afford to
  // let this throw: one server per session meant it took down only its own. One daemon
  // per machine (L3) turns the same throw into any local process killing every session's
  // deck, and every parked `deck_wait` holding a connection open, with a single packet.
  let pathname;
  let query;
  try {
    ({ pathname, searchParams: query } = new URL(request.url, deckUrl()));
  } catch {
    return send(response, 400, 'text/plain; charset=utf-8', 'the deck could not read that request target\n');
  }
  const isWrite = request.method === 'POST';

  if (isWrite && !isTrustedOrigin(request)) {
    return send(
      response,
      403,
      'text/plain; charset=utf-8',
      'the deck only accepts replies posted from its own page\n',
    );
  }
  if (!OPEN_ROUTES(request, pathname) && !isAuthorized(request, guard.secret())) return refuseWithoutSecret(response, pathname, guard.file);
  if (request.method === 'GET' && pathname === '/open') return answerOpen(request, response, query.get('key'), guard);

  // The home screen is the status table and the queue in one view (L4). The list of
  // everything the deck has ever held is a page of its own behind it, because nothing
  // is ever discarded (L14) and a month of history is not what the user came to read.
  //
  // `?run=` is which run that view is of, and lives in the URL so that the
  // in-place swap has nothing to carry (D1): no script needs to remember it. The
  // router reads it and decides nothing about it: whether it names a run the deck
  // holds is the renderer's question, and a value that names none renders the overview
  // rather than a 404, because a run can vanish between two of those swaps (D2 of run-tabs).
  if (request.method === 'GET' && pathname === '/') {
    // Stored runs, not live ones: a run whose session has gone keeps its tab while it
    // has an open thread (spec 6), and `tabsOf` is what decides that it has ended.
    // `all=1` is the Everything toggle: the same scope, with what it has already
    // settled listed after what is waiting on it. It is read here and decided
    // nowhere else — a view that lives in the address is one the in-place swap
    // carries for free and one the browser's own Back goes back through, and
    // the user asked for it to be exactly that light: "reset each load".
    //
    // The deck numbers are read here, once for the whole strip rather than once
    // per tab, because the renderer opens no file of its own (spec 10). The
    // roster is read the same way and for the same reason, and is the daemon's
    // own memory rather than anything the store holds (L7).
    const page = renderHomePage(
      listItems(),
      listStoredRuns(),
      query.get('run'),
      query.get('all') === '1',
      listDeckNumbers(),
      listAgents(),
      undefined,
      listAdded(),
      // An /add-deck refusal's reason, drawn beside the + box it came from.
      query.get('refused'),
      // Which tabs have a `pilot run` wrapper to end (L6), from the daemon's memory (L5).
      listWrapped(),
      // A Start or End refusal's reason, drawn in that control on its tab.
      query.get('sessionRefused'),
      readAlertSwitch(),
      // Both lanes per deck, its live co-pilot and its switch records (ticket-state-accents L3), one store read.
      deckLanes(),
      // The waits parked right now, by repository, which the tab's state line reads as `listening` (L5).
      heldWaits(),
      // Whose record the Status tab draws (three-lanes L8): view state only, and the renderer drops an id that is no
      // held lane's ticket rather than echo it.
      query.get('ticket'),
    );
    return send(response, 200, 'text/html; charset=utf-8', page);
  }

  if (request.method === 'GET' && pathname === '/items') {
    return send(
      response,
      200,
      'text/html; charset=utf-8',
      renderDeckPage(listItems(), listRuns(), listAgents(), deckLanes()),
    );
  }

  /**
   * deck_read's selection over HTTP (audit-f1-f7 spec 4, L1), for a curl that wanted
   * the items and not `/items`' page. A read, like `/api/record`: it marks no reply
   * delivered (L3), because hand-off belongs to a session's tool call (ADR 0041).
   */
  if (request.method === 'GET' && pathname === '/api/items') {
    const asked = query.get('limit');
    const limit = readLimit({ limit: asked === null ? undefined : Number(asked) });
    const id = query.get('id') ?? undefined;
    const items = listItems();
    const found = id && (items.find((item) => item.id === id) ?? archivedItem(id));
    if (id && !found) return sendJson(response, 404, { error: `no item ${id} to read` });
    const brief = query.get('brief') === '1';
    const chosen = selectItems(found ? [found] : items, { id, open: query.get('open') === '1', limit, brief });
    return sendJson(response, 200, {
      seq: currentSeq(),
      total: items.length,
      items: brief ? chosen : chosen.map((item) => ({ ...item, owner: ownerOf(item) })),
    });
  }

  if (request.method === 'GET' && pathname.startsWith(THREAD_PATH)) {
    const id = threadIdIn(pathname);
    const items = listItems();
    const item = id === null ? undefined : items.find((candidate) => candidate.id === id) ?? archivedItem(id); // archived: read-only (store-durability spec 8)
    if (!item) return send(response, 404, 'text/plain; charset=utf-8', 'no such thread on the deck\n');
    // The user at the thread has seen its close (spec 8, L6). The page's own refresh is this GET too,
    // so a thread closed while it is open clears at once; one with no notice, or archived, writes nothing.
    if (item.notice !== undefined && items.includes(item)) {
      clearNotice(item.id);
      delete item.notice;
      announceChange();
    }
    return send(
      response,
      200,
      'text/html; charset=utf-8',
      // The deck numbers are read here and handed in, as the home route hands
      // them to the strip: the thread page's nav names the deck the thread
      // belongs to between its arrows (spec 15), and that name is `D‹n›`.
      // `all=1` is the toggle here too: which list the arrows and X/N walk.
      // A refused press's reason (L3): drawn only for a same-origin navigation, the 303 from our
      // own POST, never for a link from elsewhere or a typed URL. Not for the page's own refresh
      // either: it fetches `location.href`, so a crafted link's query would come back same-origin.
      renderThreadPage(item, items, listRuns(), listAgents(), listDeckNumbers(), query.get('all') === '1', listAdded(),
        request.headers['sec-fetch-site'] === 'same-origin' && request.headers['sec-fetch-mode'] === 'navigate'
          ? query.get('refused')
          : null,
        deckLanes(), !items.includes(item)),
    );
  }

  // `no-cache` rather than the pages' `no-store`: the browser may keep an
  // asset, but asks again on every load, so a deck upgraded under an open tab
  // is running the new code (or icon) the next time the page loads.
  if (request.method === 'GET' && UI_ASSETS.has(pathname)) {
    const asset = UI_ASSETS.get(pathname);
    response.writeHead(200, {
      'content-type': asset.contentType,
      'cache-control': 'no-cache',
    });
    return response.end(fs.readFileSync(asset.file));
  }

  if (request.method === 'GET' && pathname === '/events') {
    if (query.has('wrapper')) return watchAsWrapper(request, response, query.get('wrapper'), wrapperGoneMs);
    return watchForChanges(response);
  }

  if (isWrite && pathname === '/reply') {
    const form = await readFormBody(request, 'that reply');
    const id = form.get('id');
    // The item, for its kind alone: what `Sign off` means is the walkthrough's,
    // and a question may carry an option spelled the same way (`replyFrom`). An archived one's refusal lands on its page.
    const answered = listItems().find((candidate) => candidate.id === id) ?? archivedItem(id);
    const text = replyFrom(form, answered?.kind);
    // A gate's Sign off is the press that passes it (merge-first L12), so it is the page's alone,
    // as the gate's Dismiss is: an absent Origin, which `isTrustedOrigin` lets through for curl, is refused.
    const pressed = chosenOf({ options: answered?.options, replies: [{ from: 'user', text }] }) === SIGN_OFF;
    if (isGate(answered?.kind) && pressed && !fromOwnPage(request)) {
      return send(response, 403, 'text/plain; charset=utf-8', "a gate's Sign off is only taken from the deck's own page\n");
    }
    try {
      addReply(id, text);
    } catch (err) {
      return landRefusedPress(request, response, answered, err);
    }
    // The page's stored Sign off on a gate2 fills each queued lane in place, never by chainNext (gate2-frees-lane L2), then lands (gate2-lands L1).
    if (answered?.kind === KIND_GATE2 && pressed) {
      try { noteLaneFilled(id, fillLanes(answered.repo)); } catch (err) { console.error(`[deck] the press on ${id} filled no lane:`, err); }
      land(id, { announce: announceChange });
    }
    announceChange();
    // Back where the reply came from. A card's quick answer names its own page,
    // because answering a question from the home screen and being thrown into
    // the thread for it is the navigation the card exists to save (D7).
    //
    // Everything else goes back to the thread it was typed in, not to the list:
    // the user is in the middle of an argument and the next thing they read is
    // the rest of it. The fragment names the reply box, which sits directly
    // under the newest message. Without it the browser lands at the top of the
    // page, so saying anything threw the user back to the header and made them
    // scroll down to read the answer — "it instantly jumps me to the top of the
    // page and i dont like it". On a resolved thread there is no reply box and
    // no anchor, and the browser simply stays where it always did.
    response.writeHead(303, {
      location:
        backPath(form.get('back')) ??
        `${THREAD_PATH}${encodeURIComponent(String(id ?? ''))}#reply`,
      'cache-control': 'no-store',
    });
    return response.end();
  }

  // The user disagreeing with how a thread was closed (spec 21). The one write
  // the deck takes on a thread that is shut, and the user's alone: there is no
  // tool beside it, because the pilot closes a thread and never reopens one.
  //
  // The 303 goes back to the thread the button was pressed on, at the reply
  // box, for the same reason a typed reply does: a reopened thread has a reply
  // box again and reaching it is what the user reopened the thread for. No
  // `back` field is read — the button exists on one page, and it is this one.
  // Create (independence spec 3, 3b; run-chaining spec 11, ADR 0039): it only opens
  // a thread, which the pilot live on the repository answers and which waits when
  // none is. The Origin must still be present and match the Host, so curl and a
  // drive-by page are both refused; the page always sends one.
  if (isWrite && pathname === '/create') {
    if (!fromOwnPage(request)) {
      return send(response, 403, 'text/plain; charset=utf-8', "Create is only taken from the deck's own page\n");
    }
    const form = await readFormBody(request, 'that thread');
    const repo = form.get('repo');
    const thread = createThread({ name: form.get('name'), repo });
    announceChange();
    response.writeHead(303, { location: `${THREAD_PATH}${encodeURIComponent(thread.id)}`, 'cache-control': 'no-store' });
    return response.end();
  }

  // Remove (independence spec 18, A7): behind the same stricter Origin check
  // as Create, because it takes a tab off the strip. `removeDeck`
  // is the one place that refuses it while a live session is registered, and a
  // `DeckRefusal` there becomes the 400 below (`createDeckHttpServer`'s own
  // catch) — the confirm on the page is never the only gate. Always lands back
  // on the overview: the tab the user was just standing on is what removal
  // just took away.
  if (isWrite && pathname === '/remove-deck') {
    if (!fromOwnPage(request)) {
      return send(response, 403, 'text/plain; charset=utf-8', "Close is only taken from the deck's own page\n");
    }
    const form = await readFormBody(request, 'that removal');
    removeDeck(form.get('repo'));
    announceChange();
    response.writeHead(303, { location: '/', 'cache-control': 'no-store' });
    return response.end();
  }

  // Add a deck by path (deck-polish spec 5, L4, ADR 0048): behind Create's stricter
  // Origin check, because it puts a tab on the strip. `addDeck` is the one place the
  // path is checked; its `DeckRefusal` lands back on the form's `back` page with the
  // reason as `refused`, drawn beside the + box. Lands on the new tab, or on the tab
  // that directory already was.
  if (isWrite && pathname === '/add-deck') {
    if (!fromOwnPage(request)) {
      return send(response, 403, 'text/plain; charset=utf-8', "Add is only taken from the deck's own page\n");
    }
    const form = await readFormBody(request, 'that path');
    let added;
    try {
      added = addDeck(form.get('path'));
    } catch (err) {
      if (!(err instanceof DeckRefusal)) throw err;
      // Appended to `backPath`'s own answer rather than rebuilt through a URL, whose
      // dot-segment normalising could turn `/.//x` into a protocol-relative `//x`.
      const back = backPath(form.get('back')) ?? '/';
      const location = `${back}${back.includes('?') ? '&' : '?'}refused=${encodeURIComponent(err.message)}`;
      response.writeHead(303, { location, 'cache-control': 'no-store' });
      return response.end();
    }
    const { repo, created } = added;
    if (created) announceChange();
    response.writeHead(303, { location: `/?run=${encodeURIComponent(repo)}`, 'cache-control': 'no-store' });
    return response.end();
  }

  // Start (start-end-session spec 1, 2, 6; L3, L6): behind Create's stricter Origin
  // check, because it opens a window running a session. The posted repo is only ever a
  // key: the tab it names is looked up among the stored ones, and that tab's own
  // spelling is what reaches `startSession`. A live tab is refused, so a second window
  // never opens beside a running session. Lands on the tab, where the session appears.
  if (isWrite && pathname === '/start-session') {
    if (!fromOwnPage(request)) {
      return send(response, 403, 'text/plain; charset=utf-8', "Start is only taken from the deck's own page\n");
    }
    const form = await readFormBody(request, 'that start');
    const tab = storedTabFor(form.get('repo'));
    try {
      if (!tab) throw new DeckRefusal('that directory is not a deck tab', 404);
      if (!tab.ended) throw new DeckRefusal('a session is already live in this deck', 409);
      // Neither Start nor End runs mid-switch (ticket-state-accents spec 14, L12): Cancel or the take ends it first.
      refuseLaneSwitch(null, tab.repo, 'main');
      start(tab.repo);
    } catch (err) {
      return landRefusal(request, response, tab, err);
    }
    announceChange();
    response.writeHead(303, {
      location: backPath(form.get('back')) ?? `/?run=${encodeURIComponent(tab.repo)}`,
      'cache-control': 'no-store',
    });
    return response.end();
  }

  // End (start-end-session spec 5, L1, L6): behind the same Origin check as Start, because
  // it stops a session. The posted repo is only a key to a stored tab, whose own spelling
  // is what `endSession` is told; it writes `end` on that repository's wrapper streams
  // and kills nothing. No wrapper there is its 409. Lands on the tab, which reads ended
  // once the wrapper's stream closes.
  if (isWrite && pathname === '/end-session') {
    if (!fromOwnPage(request)) {
      return send(response, 403, 'text/plain; charset=utf-8', "End is only taken from the deck's own page\n");
    }
    const form = await readFormBody(request, 'that end');
    const tab = storedTabFor(form.get('repo'));
    try {
      if (!tab) throw new DeckRefusal('that directory is not a deck tab', 404);
      refuseLaneSwitch(null, tab.repo, 'main');
      endSession(tab.repo);
    } catch (err) {
      return landRefusal(request, response, tab, err);
    }
    announceChange();
    response.writeHead(303, {
      location: backPath(form.get('back')) ?? `/?run=${encodeURIComponent(tab.repo)}`,
      'cache-control': 'no-store',
    });
    return response.end();
  }

  // A ticket's arrows (ticket-making spec 7, L3): behind Create's stricter Origin
  // check, because it rewrites a queue the chain reads. `moveTicket` refuses a head
  // going up, a tail going down, and anything not an open ticket; that refusal is
  // the 400 below. Back to the tab the arrow was on, by the form's own hidden
  // `back` field (N4) — the same field and the same `backPath` check every other
  // form on the deck already uses, rather than trusting the Referer header.
  if (isWrite && pathname === '/move') {
    if (!fromOwnPage(request)) {
      return send(response, 403, 'text/plain; charset=utf-8', "A move is only taken from the deck's own page\n");
    }
    const form = await readFormBody(request, 'that move');
    moveTicket(form.get('id'), form.get('direction'));
    announceChange();
    response.writeHead(303, { location: backPath(form.get('back')) ?? '/', 'cache-control': 'no-store' });
    return response.end();
  }

  // Continue's Confirm (ticket-state-accents spec 12, L9): behind `fromOwnPage` as `/move` is, because it
  // asks the pilot to put its ticket down. `requestSwitch`'s refusal is the usual 400.
  if (isWrite && pathname === '/switch') {
    if (!fromOwnPage(request)) {
      return send(response, 403, 'text/plain; charset=utf-8', "A switch is only asked from the deck's own page\n");
    }
    const form = await readFormBody(request, 'that switch');
    // The lane is `to`'s stage (three-lanes L4), so the form carries no lane. With no live run in the repository
    // nobody is there to stash, so a planning or concluding request completes at once (L15); a co-pilot request
    // (spec 17, a yellow `to`) is completed by `deck_ticket co-pilot <to>` only.
    const repo = form.get('repo');
    requestSwitch(repo, form.get('to'), { complete: !listLiveRuns().some((run) => typeof repo === 'string' && sameRepo(run.repo, repo)) });
    announceChange();
    response.writeHead(303, { location: backPath(form.get('back')) ?? '/', 'cache-control': 'no-store' });
    return response.end();
  }

  // Cancel on the lit button (ticket-state-accents spec 13): the page's press only, as `/switch`.
  if (isWrite && pathname === '/switch-cancel') {
    if (!fromOwnPage(request)) {
      return send(response, 403, 'text/plain; charset=utf-8', "A switch is only cancelled from the deck's own page\n");
    }
    const form = await readFormBody(request, 'that cancel');
    cancelSwitch(form.get('repo'), form.get('to'));
    announceChange();
    response.writeHead(303, { location: backPath(form.get('back')) ?? '/', 'cache-control': 'no-store' });
    return response.end();
  }

  // Weekly alerts (spec 15, L9): the right strip's toggle, the page's press only, as at
  // Create, then back where it was pressed. `on` or `off` and nothing else is written.
  if (isWrite && pathname === '/alerts') {
    if (!fromOwnPage(request)) {
      return send(response, 403, 'text/plain; charset=utf-8', "weekly alerts are only switched from the deck's own page\n");
    }
    const form = await readFormBody(request, 'that switch');
    const weekly = form.get('weekly');
    if (weekly !== 'on' && weekly !== 'off') {
      return send(response, 400, 'text/plain; charset=utf-8', 'weekly alerts are on or off\n');
    }
    setAlertSwitch({ weekly: weekly === 'on' });
    announceChange();
    response.writeHead(303, { location: backPath(form.get('back')) ?? '/', 'cache-control': 'no-store' });
    return response.end();
  }

  // A notice's × (spec 8, L6), and Mark all seen's every notice in one write (notifications-seen A2, L3): the page's press only, then back.
  if (isWrite && (pathname === '/clear-notice' || pathname === '/clear-notices')) {
    if (!fromOwnPage(request)) {
      return send(response, 403, 'text/plain; charset=utf-8', "a notice is only cleared from the deck's own page\n");
    }
    const form = await readFormBody(request, 'that clearing');
    if (pathname === '/clear-notices') clearAllNotices(); else clearNotice(form.get('id'));
    announceChange();
    response.writeHead(303, { location: backPath(form.get('back')) ?? '/', 'cache-control': 'no-store' });
    return response.end();
  }

  if (isWrite && pathname === '/reopen') {
    const form = await readFormBody(request, 'that reopening');
    const id = form.get('id');
    // Reopening a dismissed gate makes an earlier Sign off reply count again, so on a gate it is
    // the page's press only, as at Dismiss.
    const shut = listItems().find((item) => item.id === id) ?? archivedItem(id);
    if (isGate(shut?.kind) && !fromOwnPage(request)) {
      return send(response, 403, 'text/plain; charset=utf-8', "a gate's Reopen is only taken from the deck's own page\n");
    }
    try {
      reopenItem(id);
    } catch (err) {
      return landRefusedPress(request, response, shut, err);
    }
    announceChange();
    response.writeHead(303, {
      location: `${THREAD_PATH}${encodeURIComponent(id)}#reply`,
      'cache-control': 'no-store',
    });
    return response.end();
  }

  // The user closing an open question from its page (spec 7, L11, L12). Behind
  // the same trusted-origin check as every write here; `closeItem` refuses any
  // kind but a question itself. No `#reply` on the 303 for `/dismiss-item`'s
  // reason: a closed thread has no reply box to land on. A user thread's card
  // sends `back`, the page it was pressed on (deck-polish L9), and lands there.
  if (isWrite && pathname === '/close') {
    const form = await readFormBody(request, 'that closing');
    const id = form.get('id');
    try {
      closeItem(id);
    } catch (err) {
      return landRefusedPress(request, response, listItems().find((item) => item.id === id), err);
    }
    announceChange();
    response.writeHead(303, {
      location: backPath(form.get('back')) ?? `${THREAD_PATH}${encodeURIComponent(id)}`,
      'cache-control': 'no-store',
    });
    return response.end();
  }

  // The human at a hand-off item's own page saying "seen, done" (S17, spec 27).
  // A kind the deck does not know (A11) gets no reply from the pilot, so
  // without this the item sat on the home queue and in the status line's count
  // until the pilot happened to read it — for a kind it never replies to, that
  // could be never. One button, no confirm, because the way back is the same
  // Reopen button spec 21 already gives every closed thread.
  //
  // The 303 goes back to the thread, with no `#reply` fragment: dismissing
  // closes it, so there is no reply box left to land the reader on, and an
  // anchor naming an element the page no longer has is what used to throw the
  // reader to the top instead (the same bug `/reply`'s own comment records).
  if (isWrite && pathname === '/dismiss-item') {
    const form = await readFormBody(request, 'that dismissal');
    const id = form.get('id');
    // Dismiss closes a gate unsigned (merge-first L8), so on a gate it is the page's press only:
    // an absent Origin, which `isTrustedOrigin` lets through for curl, is refused as at Create.
    const dismissed = listItems().find((item) => item.id === id);
    if (isGate(dismissed?.kind) && !fromOwnPage(request)) {
      return send(response, 403, 'text/plain; charset=utf-8', "a gate's Dismiss is only taken from the deck's own page\n");
    }
    try {
      dismissItem(id);
    } catch (err) {
      return landRefusedPress(request, response, dismissed, err);
    }
    announceChange();
    response.writeHead(303, {
      location: `${THREAD_PATH}${encodeURIComponent(id)}`,
      'cache-control': 'no-store',
    });
    return response.end();
  }

  // Taking a run off the deck by hand (spec 7, D13). A form post like every other
  // write the page makes, behind the same trusted-origin check above, answering a
  // 303 so the browser reloads rather than sitting on a page that no longer has
  // the run on it.
  //
  // It lands on the deck's front door and reads no `back` field. The run the
  // button names does not exist on the page any more, and `/` is the one address
  // that is always somewhere: the sole remaining live run's tab, or the overview
  // (`landingFor`). Nothing the browser sent reaches the `Location` header at
  // all, which is one less thing for the guard in `backPath` to have to be right
  // about. The control is on `/items` since L10, so this is now a step off that
  // page rather than off the dismissed run's own tab.
  if (isWrite && pathname === '/dismiss') {
    const form = await readFormBody(request, 'that dismissal');
    dismissRun(form.get('id'));
    announceChange();
    response.writeHead(303, { location: '/', 'cache-control': 'no-store' });
    return response.end();
  }

  if (request.method === 'GET' && pathname === '/api/health') return sendJson(response, 200, healthOf());
  if (isWrite && pathname === '/api/exit') return exitRoute(request, response, { exit });

  // Who is live, read-only, for `pilot status` (L6): not on health, which a starting client polls every 100 ms.
  if (request.method === 'GET' && pathname === '/api/agents') return sendJson(response, 200, { agents: listAgents() });

  if (request.method === 'GET' && pathname === '/api/runs') {
    // Two views of the same question, for two different askers. `?live=1` is
    // for a hook deciding whether a session is a pilot session at all
    // (`hooks/lib/deck.js`'s `isOnDeck`): identity, so it ignores staleness and
    // dismissal — a dismissed-but-live run must still gate its own session's
    // Stop and still receive its replies. The plain route is for the page,
    // which is right to stop showing a run once it is stale or dismissed.
    const runs = query.get('live') === '1' ? listLiveRuns() : listRuns();
    return sendJson(response, 200, { runs });
  }

  /**
   * The newest run record written in this directory, for the SessionStart hook that
   * hands it to a fresh session (L7 of run-record). A read, and nothing more: it marks
   * no reply delivered, which is why the hook asks here rather than through deck_read.
   */
  if (request.method === 'GET' && pathname === '/api/record') {
    // `?ticket=` asks for that ticket's record and the ticket, its plan included (ticket-states L5).
    const ticket = query.get('ticket');
    // Without `ticket`, a main directory's yellow head too (yellow-agent S6): the main session's co-pilot to re-brief.
    const found = ticket === null
      ? { record: resumableRecordFor(query.get('repo')), yellow: yellowHeadOf(query.get('repo')) }
      : recordForTicket(query.get('repo'), ticket);
    // And how many agents this session holds, itself included (pilot-branch L27): the main half of the split.
    // And whether this directory's co-pilot is live (clear-waits-co-pilot L7): the wrapper holds its /clear on it.
    // And the directory's lanes (idle-main-lane L3): the refusal and lane lines every client prints as spelled.
    // And the threads the pilot still owes it (yellow-lane L6), so the hooks need not compute them,
    // and the gates it has signed since its last hand-off (yellow-lane A5), for the guard's work lane.
    const items = listItems();
    return sendJson(response, 200, {
      ...found, budget: budgetFor(query.get('repo')).main, coPilot: coPilotFor(query.get('repo')), lanes: lanesOf(query.get('repo')),
      owed: owedThreadsOf(items, query.get('repo')), work: workSince(items, query.get('repo')),
    });
  }

  /**
   * `pilot budget` setting the agent split (pilot-branch L27, A12). A local CLI's only: it sends no Origin,
   * and any page, the deck's own included, does; so no tab can raise how many agents a session spawns.
   */
  if (isWrite && pathname === '/api/budget') {
    if (request.headers.origin !== undefined) {
      return sendJson(response, 403, { error: 'the agent split is set from the terminal, with pilot budget' });
    }
    const { repo, main, yellow } = (await readJsonBody(request)) ?? {};
    return sendJson(response, 200, setBudget(repo, { main, yellow }));
  }

  /**
   * A repository's red queue for `pilot tickets` (merge-first spec 10, L11): the live ticket, the
   * other open red tickets in deck order and its merge decision; with `open=1`, every open ticket in any
   * state too (runs-build-on-each-other spec 10). A read, beside `/api/record` for the same reason: it
   * marks no reply delivered, so the architect never holds `deck_read`.
   */
  if (request.method === 'GET' && pathname === '/api/tickets') {
    const repo = query.get('repo');
    if (!repo) return sendJson(response, 400, { error: 'repo wants the repository path' });
    // `agent` (blocked-yellow-yields spec 7) arrives from a hook payload: held to an agent type's shape, never echoed.
    const agent = query.has('agent') ? query.get('agent') : undefined;
    if (agent !== undefined && !isAgentType(agent)) return sendJson(response, 400, { error: 'agent must be an agent type of up to 60 plain characters' });
    const lane = agent === undefined ? {} : { agent, coPilot: coPilotFor(repo) };
    return sendJson(response, 200, queueView(listItems(), repo, recordsFor(repo), { open: query.get('open') === '1', ...lane }));
  }

  /**
   * A gate2's landing for `pilot landing` (gate2-lands L8, L14): its state and, once settled, the
   * line its thread carries. A read beside `/api/tickets` for the same reason: it marks no reply delivered.
   */
  if (request.method === 'GET' && pathname === '/api/landing') {
    const id = query.get('id');
    const gate = listItems().find((item) => item.id === id);
    if (gate?.kind !== KIND_GATE2) return sendJson(response, 404, { error: `${id} is no gate2 on this deck` });
    const { state = 'none', line } = gate.landing ?? {};
    return sendJson(response, 200, typeof line === 'string' ? { state, line } : { state });
  }

  /**
   * The live usage figures the page shows (spec 11); polled not pushed, and an
   * absent file is not a failure — reasoned in full in `usage.mjs` (D16).
   *
   * `?run=` is which deck's context window is being asked about, and the page
   * sends the token the server itself put on its readout rather than anything
   * read off the address bar (L32) — a thread page has no `?run=` of its own and
   * is still a page of one deck. Read here and decided nowhere else, exactly as
   * `run` is on `/`: a value naming no deck is answered with no `ctx`, which is
   * the same answer the overview gets and is never another deck's figure.
   */
  if (request.method === 'GET' && pathname === '/api/usage') {
    return sendJson(response, 200, readUsage(query.get('run')));
  }

  if (isWrite && pathname === '/api/runs') {
    const { repo, pid, session } = await readJsonBody(request);
    const run = registerRun({ repo, pid, session });
    // The session a Start opened is up, so a later press there is judged by liveness (L3).
    clearStarting(run.repo);
    announceChange();
    // Registration is the one request only a plugin-enabled session makes, so it is the
    // one moment the daemon knows a human has started a pilot and may want to watch it
    // (D14). No page on `/events` means nobody is watching — a session parked in
    // `deck_wait` is not a page, which is what the split above exists for.
    if (browserCount() === 0) open();
    // The seq a session is told at registration is where its cursor starts, so an
    // answer the user typed before it opened does not come back as a fresh reply.
    return sendJson(response, 200, { run, seq: currentSeq() });
  }

  /**
   * A subagent's tool call, reported by `hooks/agent-roster.js` (spec 9, L8).
   *
   * A route and not a tool, deliberately: line 9's value is that the roster is
   * observed, and a `deck_agents` tool would put it in the agents' own hands.
   * The hook posts it the way it posts everything, over the HTTP path it already
   * has — so the ESM/CommonJS seam this package has refused to cross twice stays
   * uncrossed.
   *
   * The refusal is translated here the way `store.mjs` translates a run's, so a
   * malformed heartbeat is a 400 rather than a 500 and the lane, which ignores
   * every answer it gets, carries on regardless. Whether the page is told is the
   * roster's own decision and not this route's.
   */
  if (isWrite && pathname === '/api/agents') {
    const heartbeat = await readJsonBody(request);
    try {
      noteAgent(heartbeat);
    } catch (err) {
      if (err instanceof AgentRefusal) throw new DeckRefusal(err.message);
      throw err;
    }
    return sendJson(response, 200, { ok: true });
  }

  // `pilot run` starting in a directory (run-chaining A5, L3) or holding a hand-off (held-handoff L2): loopback only and
  // `isTrustedOrigin` above, so a cross-site page can do neither; the wrapper, which sends no Origin, can.
  if (isWrite && pathname === '/api/chain') {
    const { repo } = await readJsonBody(request);
    const chained = chainNext(repo, { atStart: true });
    // Always: `atStart` released any co-pilot here, and the blue mark on its ticket must leave live (ticket-state-accents spec 1).
    announceChange();
    return sendJson(response, 200, chained);
  }
  if (isWrite && pathname === '/api/hold') return holdRoute(request, response);

  if (isWrite && pathname === '/api/tool') {
    const { name, arguments: args } = await readJsonBody(request);
    const result = await runTool(name, args, abortWhenHungUp(response));
    if (WRITING_TOOLS.has(name)) announceChange();
    return sendJson(response, 200, result);
  }

  return send(response, 404, 'text/plain; charset=utf-8', 'no such page on the deck\n');
}

/**
 * A signal that fires when the session on the other end gives up on a parked wait.
 * It watches the *response*, not the request: a request emits `close` as soon as its
 * body has been read, which for every call here is immediately, so a wait hung on that
 * would abandon itself before it ever parked. A response emits `close` only when it is
 * finished or the connection went away underneath it, and while a wait is parked the
 * response is neither — so this fires exactly when the session has hung up.
 */
function abortWhenHungUp(response) {
  const controller = new AbortController();
  response.once('close', () => controller.abort());
  return controller.signal;
}

/**
 * Whether to answer this failure as JSON or as text. It runs *inside* the error handler,
 * which is the one place in the deck where a throw has nothing left to catch it — so it
 * parses defensively and calls anything it cannot read not-the-API. `route` has already
 * refused an unparseable target by the time this is reached; this is the second lock on
 * the same door, because the cost of being wrong here is the whole daemon.
 */
const isApi = (request) => {
  try {
    return new URL(request.url, deckUrl()).pathname.startsWith('/api/');
  } catch {
    return false;
  }
};

/**
 * `open` is the daemon's one composed-in dependency, and it is here rather than
 * imported by the route for one reason: the route's job at registration is to decide
 * *whether* to open a browser, and a test of that decision must never be able to start
 * one. The daemon passes nothing and gets `openDeck`. `start` is the same seam for
 * the Start route (L7): the only session the daemon starts is the visible one a
 * press on Start asks for (ADR 0050, superseding ADR 0039 in part). `land` is the seam for a
 * gate2's Sign off, which starts `pilot land` (ADR 0111); tests inject a spawn through it. `exit` is the daemon's shutdown, which `POST /api/exit` runs (L3).
 */
export function createDeckHttpServer({ secret, open = openDeck, start = startSession, land = startLanding, wrapperGoneMs = WRAPPER_GONE_MS, exit = () => {} } = {}) {
  const guard = deckGuard(secret);
  // A hand-off posted before the daemon started still crosses on a page that is open now.
  armHandoffs();
  return http.createServer((request, response) => {
    route(request, response, open, start, wrapperGoneMs, land, exit, guard).catch((err) => {
      logRefusal(request, err);
      if (err instanceof UnsupportedMediaType) {
        return sendJson(response, 415, { error: err.message });
      }
      if (err instanceof DeckRefusal) {
        return isApi(request)
          ? sendJson(response, 400, { error: err.message })
          : send(response, 400, 'text/plain; charset=utf-8', `${err.message}\n`);
      }
      // The deck is loopback-only and single-user (A4, A6), so the error's own message
      // is not a disclosure and is the only thing that tells the human what to do —
      // "move the corrupt store aside" beats "the deck could not handle that".
      const why = err?.message || 'the deck could not handle that';
      return isApi(request)
        ? sendJson(response, 500, { error: why })
        : send(response, 500, 'text/plain; charset=utf-8', `${why}\n`);
    });
  });
}
