/**
 * The deck server's tool layer (feature audit-f1-f7, spec 13, ADR 0113): `callTool`,
 * `runTool` and their argument readers, as the deck performs each tool. Moved out of
 * `deck/server.mjs` whole and in order; `deck/server.mjs` re-exports `callTool`, and
 * `deck/server-routes.mjs` imports `runTool`, `readLimit` and `WRITING_TOOLS` from here.
 */

import fs from 'node:fs';
import path from 'node:path';

import { holdWait, noteActive } from './agents.mjs';
import { chainNext, isSuperseded } from './chain.mjs';
import { cleanOnPilot, cleanRefusal } from './gate2-base.mjs';
import { startLanding } from './landing.mjs';
import { LAND_AGAIN, LANDING_KINDS } from './landing-replies.mjs';
import {
  KIND_GATE1, KIND_GATE2, KIND_TICKET, OWNER_KINDS, SIGN_OFF, authorKind, isChainHandoff, isGate, isRecord, liveTicketOf, messagesOf, ownerOf, stateOf, waiterKind,
} from './items.mjs';
import { postFilled } from './closing-report.mjs';
import { assertOnPilotTip, assertVerdicts } from './lineage.mjs';
import { selectItems } from './read.mjs';
import { laneOf, lanesOf } from './lanes.mjs';
import { MAX_FRICTION, repoKey, repoOf, sameRepo } from './runs.mjs';
import { announceChange, fallbackFor, handOff, waitForReplies } from './server-wait.mjs';
import {
  DeckRefusal, addPilotMessage, coPilotFor, currentSeq, deckLanes, listItems, listStoredRuns, markDelivered, mergeTicket, moveTicket, needTicket,
  ownerFilter, parkedTicketOf, parkTicket, pivotTicket, recordFor, recordVerdicts, refusePoster, repliesSince, resolveItem,
  setCoPilot, setSlices, takeTicket,
} from './store.mjs';

import { DEFAULT_WAIT_MS, MAX_POLL_MS, MAX_READ_ITEMS, MAX_READ_LIMIT, deckUrl } from './tools.mjs';

// --- the tools, as the deck performs them ----------------------------------
//
// What they are is `deck/tools.mjs`, which the stdio client reads without
// reaching the store (L3); this half is what happens when one is called.

const asText = (text) => ({ content: [{ type: 'text', text }] });

function readLimit(args) {
  const asked = args?.limit;
  if (asked === undefined) return MAX_READ_ITEMS;
  if (!Number.isInteger(asked) || asked < 1 || asked > MAX_READ_LIMIT) {
    throw new DeckRefusal(`limit must be a whole number between 1 and ${MAX_READ_LIMIT}`);
  }
  return asked;
}

/**
 * How long *this request* parks, which is not how long the wait it belongs to runs for.
 * A wait for a human is many of these end to end (`deck/client.mjs`), and the cap here
 * is the one that keeps a socket from being held open past what `fetch` will tolerate —
 * so the refusal names `MAX_POLL_MS` even though the tool's own schema allows hours.
 */
function waitTimeout(args) {
  const asked = args?.timeout;
  if (asked === undefined) return DEFAULT_WAIT_MS;
  if (!Number.isInteger(asked) || asked < 1 || asked > MAX_POLL_MS) {
    throw new DeckRefusal(
      `timeout must be a whole number of milliseconds up to ${MAX_POLL_MS} on one request`,
    );
  }
  return asked;
}

/**
 * Which run's items are wanted, or null for the whole deck. Absent is the old
 * behaviour and stays it; present and unusable is a refusal rather than a
 * silent read of everything, because a caller that asked for one run and was
 * handed the machine would draw exactly the wrong conclusion from it.
 */
function readRepo(args) {
  const asked = args?.repo;
  if (asked === undefined) return null;
  if (typeof asked !== 'string' || asked.trim() === '') {
    throw new DeckRefusal('repo must be the path of the repository whose items you want');
  }
  return asked;
}

/**
 * Whether a reply belongs to the run that asked for it. The repository comes back on the
 * reply, so the join is the same one `hooks/inbox-alert.js` makes on the same question —
 * including its one indulgence: a reply on an item written before the client stamped a
 * repository belongs to whoever is waiting, because refusing it to every run would lose
 * it altogether.
 */
function forRun(reply, repo) {
  const theirs = reply?.repo;
  if (typeof theirs !== 'string' || theirs.trim() === '') return true;
  return sameRepo(theirs, repo);
}

/** Which replies a wait hears by where they were posted: its repository's, or every one when it names none. */
const waiterFilter = (repo) => (reply) => repo === null || forRun(reply, repo);

/** A boolean argument, false when absent; anything else is a refusal. */
function readFlag(args, name) {
  const asked = args?.[name];
  if (asked === undefined) return false;
  if (typeof asked !== 'boolean') throw new DeckRefusal(`${name} must be true or false`);
  return asked;
}

/** A read's window (session-row L9): a nonzero whole number or "all", undefined for the default. */
function readMessages(args) {
  const asked = args?.messages;
  if (asked === undefined || asked === 'all' || (Number.isSafeInteger(asked) && asked !== 0)) return asked;
  throw new DeckRefusal('messages must be a nonzero whole number (last N, first -N) or "all"');
}

/** The one thread a wait narrows to (crew-waits L4), or null for every thread it hears. */
function readItem(args) {
  const asked = args?.item;
  if (asked === undefined) return null;
  if (typeof asked !== 'string' || asked.trim() === '') throw new DeckRefusal('item must be an item id');
  return asked;
}

/**
 * Whether a reply is still `kind`'s to take (crew-waits L3, ADR 0061): exactly what the
 * hand-off would write for it (`markDelivered`), never delivered and on an open thread, or
 * the walkthrough's Sign off not yet handed to its second kind. Whether the thread is open
 * comes on the row `repliesSince` returns, so this reads nothing.
 */
function untakenBy(kind) {
  return (reply) => {
    if (!reply.deliveredAt) return reply.open === true;
    return reply.text === SIGN_OFF && typeof reply.deliveredTo === 'string' && reply.deliveredTo !== kind;
  };
}

/**
 * Which run a status belongs to. The agent never sees this and never sends it: the
 * stdio client puts its session's own run id on the call, the way it puts the cursor
 * on `deck_wait`, so a table can only be replaced by the session that registered it.
 */
function statusRun(args) {
  const run = args?.run;
  if (typeof run !== 'string' || run.trim() === '') {
    throw new DeckRefusal(
      'this session is not on the deck, so it has no run to put a status table against',
    );
  }
  return run;
}

/**
 * Whether the daemon may write into `dir`: an absolute checkout of the very repository
 * the run registered from. The daemon writes nowhere else a caller names, so a loopback
 * caller cannot plant a run.json in some other repository for `pilot integrate` to push.
 */
function isWorktree(dir, runRepo) {
  const mine = path.isAbsolute(dir) ? repoOf(dir) : null;
  return mine !== null && typeof runRepo === 'string' && sameRepo(mine, repoOf(runRepo) ?? runRepo);
}

const repoOfRun = (id) => listStoredRuns().find((run) => run.id === id)?.repo;

/**
 * Write the record into the feature worktree as `docs/design/<slug>/run.json`, in
 * exactly the stored bytes (L20), so the mirror is a copy and never a re-serialisation;
 * `pilot integrate` commits it. Says what happened, in a clause for the answer.
 */
function mirrorRecord(record, runRepo) {
  if (record?.worktree === undefined) return 'no worktree, so run.json not written';
  if (!isWorktree(record.worktree, runRepo)) return 'run.json not written: the recorded worktree is gone';
  const file = path.join(record.worktree, 'docs', 'design', record.slug, 'run.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  return 'run.json written';
}

/**
 * Refuses a gate2 whose `sha` does not merge clean onto pilot (lander spec 3; L6), in the
 * item's `repo` as fetched, so the press meets no conflict; origin/<default> is not asked
 * (one-integration-line spec 1). A `repo` that is not a git checkout is not checked, as a
 * gate1's lineage is not; nor is a missing `sha`, which `postItem` refuses.
 */
function assertCleanOnPilot(repo, sha) {
  // A missing sha is the store's refusal to give, in its own words.
  if (typeof sha !== 'string' || typeof repo !== 'string' || !path.isAbsolute(repo) || repoOf(repo) === null) return;
  const clean = cleanOnPilot(repo, sha);
  if (!clean.ok) throw new DeckRefusal(cleanRefusal(sha, clean));
}

/** The id of a thread, as the tool that names one is given it. */
function threadId(args) {
  const id = args?.id;
  if (typeof id !== 'string' || id.trim() === '') {
    throw new DeckRefusal('id must be the item id deck_post gave you');
  }
  return id;
}

/**
 * Most of these are a question to the store and nothing more. `deck_read` is the one
 * exception: it hands the replies it is about to return over to `handOff`, which writes
 * once when that hand-off is new (D4), and announces its own change rather than through
 * `WRITING_TOOLS` below. Synchronous, so a refusal is thrown where the caller stands and
 * nothing is half-written behind it. `land` is `startLanding`'s seams, for the tests.
 */
export function callTool(name, args, land = {}) {
  if (name === 'deck_post') {
    // `repo` is the caller's own directory, stamped by the stdio client; a ticket may be
    // filed under a worktree of it and nowhere else (run-chaining S6).
    const dir = args?.kind === KIND_TICKET ? args.dir : undefined;
    if (dir !== undefined && !(typeof dir === 'string' && isWorktree(dir, args?.repo))) {
      throw new DeckRefusal('dir must be the absolute path of a worktree of this repository');
    }
    // A gate's poster is refused before its lineage or base runs git (three-lanes spec 14).
    refusePoster(args?.kind, args?.author);
    if (args?.kind === KIND_GATE1) {
      assertOnPilotTip(args.repo, args.branch);
      // The record is read off the gate's own ticket, in its own repository, whoever posts it (architect-runs-red A1).
      const ticket = listItems().find((item) => item.id === args.ticket && item.kind === KIND_TICKET && sameRepo(item.repo, args.repo));
      assertVerdicts(args.repo, args, { record: ticket?.verdicts });
    }
    if (args?.kind === KIND_GATE2) assertCleanOnPilot(args.repo, args.sha);
    // Neither the run nor a `subdeck` argument is stored on the item: a caller stamps nothing.
    const { run: _run, subdeck: _subdeck, ...fields } = args ?? {};
    // The lander's bodiless report is filled from the run record (lander S15).
    const item = postFilled(fields);
    // In yellow (thread-types-phase L12): the item stays open for a later answer, and the
    // caller goes on with its own default now rather than waiting for one.
    if (item.away) {
      return asText(
        `the user is away (implementing): go with ${JSON.stringify(item.recommended)}, record it as assumed, ` +
          `and revise if they answer on ${deckUrl()}/thread/${item.id}`,
      );
    }
    // A ticket is agreed work stored for later, not an argument (run-chaining L2, QA F4):
    // nobody answers it, so the ordinary "the human answers it ... deck_resolve" is
    // false for one and must not be said of it.
    if (item.kind === KIND_TICKET) {
      return asText(
        `Stored ${item.id} for this directory. It starts itself once it is the head ticket, ` +
          'after a clean finish here — do not deck_resolve it.',
      );
    }
    // A gate closes only on the user's Sign off press (merge-first L12): never told to resolve it.
    const close =
      isGate(item.kind)
        ? 'it passes only on their Sign off press: deck_resolve closes it after that, never before.'
        : 'you close it with deck_resolve.';
    return asText(
      `Posted ${item.id} to the deck. The human answers it at ${deckUrl()}/thread/${item.id}. ` +
        `They reply, you may push back with deck_reply, and ${close}`,
    );
  }
  if (name === 'deck_read') {
    const limit = readLimit(args);
    const onlyOpen = readFlag(args, 'open');
    const repo = readRepo(args);
    const reader = waiterKind(args?.author);
    const id = args?.id;
    const brief = readFlag(args, 'brief');
    const messages = readMessages(args);
    // The pilot reading its run takes what the owner fallback has for it first (ADR 0045),
    // so the thread is shown as its own and the reply handed over below, with the note.
    // Not on a read of one thread, nor a brief one: what it claimed would never be shown.
    const notes = new Map(
      (reader === 'pilot' && repo !== null && id === undefined && !brief ? fallbackFor(repo).claim() : []).map((reply) => [
        reply.itemId,
        reply.fallback,
      ]),
    );
    // Named or not, `total` counts what was asked about: the deck keeps every
    // item for ever (L14), so a run asking about itself must not be told how
    // much of the machine it is sharing the deck with.
    const items = repo === null
      ? listItems()
      : listItems().filter((item) => sameRepo(item?.repo, repo));
    const newest = selectItems(items, { id, open: onlyOpen, limit, brief, messages });
    // A brief read shows no message, so it hands none over (spec 2): never more than the full read.
    if (brief) return asText(JSON.stringify({ url: deckUrl(), seq: currentSeq(), total: items.length, items: newest }));
    // A thread this read just took is in its answer however old it is, or its note is never said.
    // It comes back whole, never windowed: the claim already recorded every reply it took as the
    // pilot's (`fallBack`), so a window would hide replies the store calls delivered.
    const shownIds = new Set(newest.map((item) => item.id));
    const taken = selectItems(items.filter((item) => notes.has(item.id) && !shownIds.has(item.id)), {
      open: onlyOpen,
      limit: Infinity,
    });
    const whole = new Map(items.filter((item) => notes.has(item.id)).map((item) => [item.id, item]));
    const handed = [...taken, ...newest]
      .map((item) => whole.get(item.id) ?? item)
      // A record's stored user reply is read on its page and handed to no pilot (report-record L3).
      .map((item) => (isRecord(item) ? { ...item, replies: messagesOf(item).filter((message) => message.from !== 'user') } : item))
      .map((item) => ({ ...item, owner: ownerOf(item), ...(notes.has(item.id) && { fallback: notes.get(item.id) }) }));
    // Every reply on an item this call returns has been handed over with it, so this is
    // the second of the deck's two hand-off paths (D4) and not only `deck_wait`: a
    // session that reads the deck rather than parking on it has the answer just the same.
    // Only when the call named the run, though: a read of the whole deck is every run on
    // the machine, and marking another run's reply "the pilot has it" would tell the user
    // a session has words that nothing of theirs ever read. And only on the threads the
    // reader's kind owns (ADR 0041): the rest are shown, never handed over. And only the
    // messages the read returned (session-row L5): one windowed out waits for `deck_wait`.
    if (repo !== null && reader !== null) {
      handOff(handed.filter((item) => item.owner === reader).flatMap(messagesOf), reader);
    }
    return asText(
      JSON.stringify(
        { url: deckUrl(), seq: currentSeq(), total: items.length, items: handed },
        null,
        2,
      ),
    );
  }
  if (name === 'deck_reply') {
    const item = addPilotMessage(threadId(args), args?.text, args?.author, args?.to, args?.promise);
    // The store took the pilot's or the lander's Land again (spec 5, L5; lander L2): land's fixed argv, nothing from the
    // reply. Only theirs, which the store applies or refuses; another author's same words are a plain message and start nothing.
    const mayLand = args.author === undefined || LANDING_KINDS.includes(authorKind(args.author));
    if (item.kind === KIND_GATE2 && mayLand && args.to === undefined && LAND_AGAIN.test(args.text)) startLanding(item.id, { announce: announceChange, ...land });
    return asText(`Said it on ${item.id}. The human sees it at ${deckUrl()}/thread/${item.id}`);
  }
  if (name === 'deck_resolve') {
    const item = resolveItem(threadId(args), args?.resolution, args?.author);
    return asText(`Closed ${item.id}: ${item.resolution}`);
  }
  if (name === 'deck_status') {
    // L7: every table writes the run record, so a call without its key is refused.
    if (args?.slug === undefined) throw new DeckRefusal("slug is required: the feature's slug, which keys the run record");
    // The architect's table is `ticket`, `slices` and `feature`; what moves a ticket on is the pilot's, refused on the hook's stamp.
    if (args?.author !== undefined && authorKind(args.author) === 'architect') {
      const barred = ['finished', 'next', 'qa', 'worktree'].filter((field) => args[field] !== undefined);
      if (barred.length > 0) throw new DeckRefusal(`deck_status from the architect carries ticket, slices and feature only, not ${barred.join(', ')}`);
    }
    // The deck this run is in, by the number the human reads on its tab, so an agent
    // can say which deck it means and be understood: "S2 in D4" (spec 10).
    // Checked before anything is stored: a worktree the daemon cannot write into is the
    // caller's mistake, refused like every other bad cell.
    const named = args?.worktree;
    if (named !== undefined && !(typeof named === 'string' && isWorktree(named, repoOfRun(args?.run)))) {
      throw new DeckRefusal("worktree must be the absolute path of a worktree of this run's repository");
    }
    // QA's worktree is resumed in by the pilot (ticket-states spec 19), so it is held to the same rule.
    const qaTree = args?.qa?.worktree;
    if (typeof qaTree === 'string' && !isWorktree(qaTree, repoOfRun(args?.run))) {
      throw new DeckRefusal("qa.worktree must be the absolute path of a worktree of this run's repository");
    }
    const { deckNumber, slices, record } = setSlices(statusRun(args), args?.slices, args?.feature, {
      slug: args?.slug,
      ticket: args?.ticket,
      branch: args?.branch,
      base: args?.base,
      worktree: named,
      qa: args?.qa,
      artefact: args?.artefact,
      findings: args?.findings,
      friction: args?.friction,
      report: args?.report,
      next: args?.next,
      finished: args?.finished,
    });
    // A finish hands the directory's next ticket to the session after this one (L3); which
    // finishes do is the chain's to say.
    const runRepo = repoOfRun(args?.run);
    const chained = args?.finished !== undefined && typeof runRepo === 'string' ? chainNext(runRepo) : null;
    // One line, never the record (spec 22.2): the answer is paid in the pilot's context
    // on every call, and the record is on disk for anything that needs it. A ticket taken
    // in place under the mark is named, so the same session knows it holds it (handoff-over-mark L2).
    const count = `${slices.length} slice${slices.length === 1 ? '' : 's'}`;
    const taken = chained?.handoff === null && chained.taken ? `; took ${chained.taken.join(' and ')} live here` : '';
    const trimmed = args?.friction !== undefined && record?.friction?.length === MAX_FRICTION ? `; friction keeps the newest ${MAX_FRICTION}` : '';
    return asText(`D${deckNumber}: ${count} saved; ${mirrorRecord(record, runRepo)}${trimmed}${taken}.`);
  }
  if (name === 'deck_ticket') {
    const id = threadId(args);
    // A ticket moves by the pilot's hand, but for the architect's merge step (three-lanes spec 14, L14):
    // refused on the hook's stamp, an unstamped call being the pilot's.
    const mover = args?.author === undefined ? 'pilot' : authorKind(args.author);
    if (mover !== 'pilot' && !(mover === 'architect' && args?.action === 'merge')) {
      throw new DeckRefusal(`deck_ticket ${args?.action} is the pilot's, not ${args.author}`);
    }
    // Need and pivot are the pilot's two state writes (overview-one-ticket spec 15, 18; L7, L8).
    // The pilot reads both lanes on the line that moves one (idle-main-lane spec 5; yellow-lane spec 2), read only by the answers that say them.
    const both = () => {
      const lanes = lanesOf(listItems().find((item) => item.id === id).repo);
      return `${lanes.yellowClause}. ${lanes.stageClause}.`;
    };
    if (args?.action === 'need') return asText(`Needed ${id}: ${stateOf(needTicket(id))}. ${both()}`);
    // The main session's co-pilot on a yellow ticket, set and released (clear-waits-co-pilot spec 2, L8).
    if (args?.action === 'co-pilot' || args?.action === 'release') {
      const entry = setCoPilot(id, args.action === 'co-pilot');
      if (args.action === 'co-pilot') return asText(`Co-pilot ${id}: live. ${both()}`);
      // A release naming another ticket leaves the live one holding the /clear, so it never reads "released".
      if (entry?.ticket === id && !entry.live) return asText(`Co-pilot ${id}: released. ${both()}`);
      return asText(`Co-pilot ${id}: ${entry?.live ? `not the live one; ${entry.ticket} is live` : 'no co-pilot is live here'}.`);
    }
    if (args?.action === 'pivot') {
      const { ticket, gate2 } = pivotTicket(id);
      return asText(`Pivoted ${id}: ${stateOf(ticket)}${gate2 ? `, gate2 ${gate2.id} superseded` : ''}.`);
    }
    // Take and park move the live pointer (ticket-states L4, L9); the phase follows it.
    if (args?.action === 'take') return asText(`Took ${id}: live in this directory, ${stateOf(takeTicket(id))}.`);
    if (args?.action === 'park') {
      const parked = parkTicket(id);
      // The other stage lane's ticket may still be live here (QA F2).
      const still = liveTicketOf(listItems(), parked.repo);
      return asText(`Parked ${id}: ${stateOf(parked)}${still ? `; ${still.id} is still live here` : ', and no ticket is live here'}.`);
    }
    // Merge folds a red ticket into the live red one (ticket-states spec 11, L15).
    if (args?.action === 'merge') {
      const { host } = mergeTicket(id, args?.author);
      return asText(`Merged ${id} into ${host.id}: ${host.sliceCount === undefined ? 'no slice count' : `${host.sliceCount} slices`}.`);
    }
    // The pilot's verdict record, which a gate1 on the ticket must match (architect-runs-red spec 4, L2).
    if (args?.action === 'verdicts') {
      const count = Object.keys(recordVerdicts(id, args?.verdicts).verdicts).length;
      return asText(`Recorded ${count} verdicts on ${id}.`);
    }
    // The tool's refusal names every action (QA F2); moveTicket's own names the page's two arrows.
    if (args?.action !== 'up' && args?.action !== 'down') throw new DeckRefusal(`a ticket moves up, down, take, park, merge, need, pivot, co-pilot, release or verdicts, not ${args?.action}`);
    // The arrow's own write (ticket-making L3): one store function, whichever hand moves it.
    const queue = moveTicket(id, args?.action);
    const place = queue.findIndex((item) => item.id === id) + 1;
    return asText(`Moved ${id} ${args.action}: ${place} of ${queue.length} in this directory's queue.`);
  }
  throw new DeckRefusal(`the deck has no tool named ${name}`);
}

/**
 * The tools that change the deck outright, announced here after every call. `deck_read`
 * and `deck_wait` write too — a hand-off, once — and announce themselves only when it
 * actually marked something: `deck_read` through `handOff`, every `deck_wait` through its
 * `take` inside `waitForReplies`. `deck_read` must NOT be added here, because that would
 * announce on every poll and defeat D5.
 */
const WRITING_TOOLS = new Set(['deck_post', 'deck_reply', 'deck_resolve', 'deck_status', 'deck_ticket']);

/** Ten hours with no word from the user on any item of a deck, and its pilot stops listening (spec 20). */
const IDLE_STOP_MS = 10 * 60 * 60 * 1000;

/**
 * Why the session waiting on its own run should stop listening, or null (independence
 * spec 20). Asked only when there is nothing of its own to hand over, so a stop never
 * swallows a reply. `finished` counts only when the record was written after this
 * session started: a new session in a directory whose last feature finished is a new
 * run, and its first `deck_status` has not happened yet. Ten hours are measured from
 * the newest user reply on the deck's items, or from the session's start if later.
 */
function stopReason(runId, ours, repo, since) {
  // Stored, not live: a run whose pid has gone must still stop.
  const run = listStoredRuns().find((candidate) => candidate.id === runId);
  if (!run) return null;
  if (repliesSince(since).replies.some(ours)) return null;
  const record = recordFor(repo);
  // A finish counts only for the session whose run wrote the record (A17).
  const own = record !== null && sameRepo(repo, run.repo);
  // A finish a resolved chain hand-off superseded is the last run's, not this session's (L5).
  const finished = own && record.finished && record.updatedAt >= run.startedAt && !isSuperseded(record, listItems(), repo);
  // A finish the deck wrote on one ticket's landing leaves a pilot that holds another lane listening (gate2-frees-lane spec 8).
  if (finished && !holdsALane(repo, run.startedAt)) return `the run is finished (${record.finished})`;
  const heard = listItems()
    .filter((item) => sameRepo(item.repo, repo))
    .flatMap(messagesOf)
    .filter((message) => message.from === 'user')
    .reduce((latest, message) => Math.max(latest, Date.parse(message.repliedAt) || 0), Date.parse(run.startedAt) || 0);
  return Date.now() - heard >= IDLE_STOP_MS ? 'no reply from the user in 10 hours' : null;
}

/**
 * Whether a lane of `repo` names a ticket in hand: a stage lane's held or switching ticket, or the live co-pilot's. A
 * ticket a chain hand-off of this run took is the next session's, the one `/clear` starts, so it never holds the
 * finishing one; a hand-off posted before the run started hands nothing on for it.
 */
function holdsALane(repo, startedAt) {
  const items = listItems();
  const handedOn = new Set(items.filter((item) => isChainHandoff(item, repo) && item.postedAt >= startedAt).map((item) => item.next));
  const switching = deckLanes().switches[repoKey(repo)];
  const stages = ['planning', 'concluding'].map((name) => laneOf(items, repo, name, { switching })).map((lane) => lane.ticket?.id ?? lane.pending);
  const coPilot = coPilotFor(repo);
  return [...stages, coPilot?.live === true ? coPilot.ticket : undefined].some((hand) => hand !== undefined && !handedOn.has(hand));
}

/** Every tool, including the one that parks. `signal` is the client hanging up. */
async function runTool(name, args, signal) {
  if (name !== 'deck_wait') return callTool(name, args);

  const timeoutMs = waitTimeout(args);
  const since = Number.isInteger(args?.since) ? args.since : 0;
  const repo = readRepo(args);
  // A run waits for its repository's answers, every thread of it (ADR 0039). The
  // cursor the wait hands back still counts the whole deck, so another run's reply is
  // read past rather than waited on again; and `deck/client.mjs` keeps polling on an
  // empty page, which is what a session that has been handed nothing of its own should do.
  // And of those, only the threads its kind owns (ADR 0041): the daemon decides who hears.
  const kind = waiterKind(args?.author);
  if (kind === null) {
    throw new DeckRefusal(`only ${OWNER_KINDS.slice(0, -1).join(', ')} and ${OWNER_KINDS.at(-1)} wait on the deck; this agent kind owns no thread`);
  }
  const owned = ownerFilter(kind);
  const untaken = readFlag(args, 'untaken');
  const only = readItem(args);
  const fresh = untaken ? untakenBy(kind) : () => true;
  const forWaiter = waiterFilter(repo);
  const heard = (reply) => forWaiter(reply) && (only === null || reply.itemId === only) && fresh(reply) && owned(reply);
  const stop = repo !== null && typeof args?.run === 'string' ? stopReason(args.run, heard, repo, since) : null;
  if (stop) return asText(`stop listening: ${stop}`);
  // A wait held is its kind at work (L6): held while parked and noted as it returns, so a
  // kind re-polling every `MAX_POLL_MS` is never quiet.
  const release = repo !== null ? holdWait(repo, kind) : () => {};
  const fallback = kind === 'pilot' && repo !== null ? fallbackFor(repo) : null;
  // The wait is the deck's plainest hand-off: these replies are on their way into a
  // session's context as this returns (D4). The pages and the other waits are told once
  // this pass is over, so no wait is woken half-way through one.
  const take = (replies) => {
    if (markDelivered(replies, kind)) queueMicrotask(announceChange);
  };
  let waited;
  try {
    waited = await waitForReplies({ since, timeoutMs, signal, heard, take, untaken, fallback });
  } finally {
    release();
    if (repo !== null) noteActive({ cwd: repo, kind });
  }
  // A reply on a parked green ticket's walkthrough names the ticket, whose record's qa refs say where to resume.
  const items = listItems();
  waited = { ...waited, replies: waited.replies.map((reply) => {
    const ticket = parkedTicketOf(items, reply);
    return ticket === undefined ? reply : { ...reply, ticket };
  }) };
  return asText(JSON.stringify(waited, null, 2));
}

export { WRITING_TOOLS, readLimit, runTool };
