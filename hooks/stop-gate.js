#!/usr/bin/env node
/**
 * The Stop hook: the pilot may not go idle while the user's answer is sitting
 * unread on the deck.
 *
 * A1's third layer, and the one that covers what the other two cannot. The
 * PostToolUse lane only fires on a tool call, so a pilot that has finished its
 * turn and gone quiet never sees the reply that arrived while it was writing
 * its last message; `deck_wait` only helps a pilot that decided to wait. This
 * fires exactly when the turn is about to end.
 *
 * What counts as unread is the thread's own state, not this hook's bookkeeping:
 * an open item whose last message is the user's. That is slice 3's "answered,
 * unresolved". It is deliberately blind to *how* the pilot came by the reply,
 * so a reply delivered by the PostToolUse lane and then ignored still blocks,
 * while a thread the pilot has closed with deck_resolve never does — and a
 * thread the pilot has pushed back on with deck_reply is the user's turn again
 * and is not the pilot's to answer.
 *
 * And since 2026-09-16 it covers the other half of the same failure, which is
 * the larger half: a turn ending on a question the user has *not* answered yet.
 * That day the pilot posted, parked three times on a wait capped at two minutes,
 * ended its turn with a status line, and never heard the answer that arrived
 * fourteen minutes later — every rule below was about a reply already on the
 * deck, and there was none. So when the pilot's own thread is open and still
 * waiting on the user, this hook holds the turn open and watches the deck until
 * the answer comes, and hands that answer back as the reason. The reply is the
 * wake-up, which is what makes this work without depending on a backgrounded
 * tool call reaching a session that has already gone quiet. If nobody answers
 * inside `HOLD_MS` it says so once and sends the pilot to one long `deck_wait`,
 * which since the same day can park for hours rather than for two minutes.
 *
 * Two rules keep the gate from becoming a trap, which is the one thing it must
 * never be:
 *
 *   - the reply must have arrived after this session did. A thread answered and
 *     forgotten last week would otherwise block every session opened since,
 *     none of which can resolve an argument they were not part of.
 *   - the item must have been posted from this session's repository. One deck
 *     serves every repository on this machine, and a pilot refused its stop over
 *     an argument in a repository it has never opened cannot end its turn at all.
 *   - `stop_hook_active` means the turn is already being held open by a stop
 *     hook, and this one then stands aside. The pilot is told once, acts, and
 *     the next stop is its own.
 *
 * And a deck that is not answering never blocks anything at all.
 *
 * Since idle-main-lane (ADR 0123) it also refuses, once per stop, a turn ending with the main
 * lane idle and a red or green ticket queued, in the daemon's words (`/api/record` `lanes.refusal`).
 */

'use strict';

const fs = require('fs');
const deck = require('./lib/deck.js');

/**
 * What the refusal may take of the pilot's context. Every part is bounded, not
 * just the quoted answer: the deck accepts 64KB per field, twenty open items
 * come back at once, and unlike the delivery — which is said once — this is
 * recomputed at every attempt to end a turn while the thread stays unresolved.
 */
const MAX_REPLY_CHARS = 2000;
const MAX_TITLE_CHARS = 200;
const MAX_ID_CHARS = 64;
const MAX_REASON_CHARS = 8000;

/**
 * How long this hook will hold a turn open waiting for the user to answer the
 * pilot's own question, and how often it looks while it does.
 *
 * 570s because the harness's documented default timeout for a command hook is
 * 600s (https://code.claude.com/docs/en/hooks.md), and a hook killed at its
 * timeout writes nothing at all — so the wait has to end with enough of the
 * budget left to say what it found. Nothing here relies on a longer timeout
 * being honoured; `PILOT_STOP_HOLD_MS` is for a user who has raised the one in
 * `hooks/hooks.json` to match, and for the tests, which cannot sit out nine
 * minutes to watch a poll go round.
 */
const HOLD_MS = Number(process.env.PILOT_STOP_HOLD_MS) > 0
  ? Number(process.env.PILOT_STOP_HOLD_MS)
  : 570_000;
const POLL_MS = 500;

/** A `deck_wait` cursor past every reply, so the deck hands back only the owner fallback's (ADR 0045). */
const FALLBACK_ONLY = Number.MAX_SAFE_INTEGER;

const sleep = function (ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
};

function clip(text, limit) {
  const value = typeof text === 'string' ? text : '';
  return value.length <= limit ? value : value.slice(0, limit) + '\n[…clipped]';
}

/**
 * Whether this thread is waiting on the *user*: the pilot's own, still open, and
 * nothing said on it since the pilot last spoke. That is the state a turn must
 * not end in, and it is the state a freshly posted question is in.
 */
function awaitsUser(item, posted, items) {
  if (!item || deck.isClosed(item) || deck.isChat(item)) return false;
  if (deck.isStanding(item)) return false; // a ticket or a report stands open without waiting (L6)
  // A question on a ticket not live waits as green-phase grilling, a gate2 on one is never this turn's to wait on (ticket-states L21, spec 16).
  const onTicket = (item.kind === 'question' || item.kind === 'gate2') && item[deck.STORED.field] !== undefined;
  if (onTicket && !isOnLiveTicket(item, items)) return false;
  if (item.away === true) return false; // posted in yellow: the deck stamped it, the pilot goes on (thread-types-phase L7, L12)
  if (posted.indexOf(item.id) === -1) return false; // not this session's to wait on
  const last = deck.lastMessage(item);
  return !last || last.from !== 'user';
}

/** Whether this item names a ticket `tickets` holds as live and open: this run's ticket (L6). */
function isOnLiveTicket(item, tickets) {
  const field = deck.STORED.field;
  return Boolean(item && item[field] !== undefined && (tickets || []).some(function (ticket) {
    return Boolean(ticket && ticket.id === item[field] && ticket.kind === deck.STORED.kind && ticket.live === true && !deck.isClosed(ticket));
  }));
}

/**
 * The tickets the open questions in `posted` name that the read left out, asked for by id: the
 * read is the newest open items only, and a live ticket posted long ago falls outside it. A ticket
 * the deck will not hand back reads as not live, so its question never holds the turn. `ids`
 * are the threads to look at: this session's posts, or the answered threads, as after a hand-off (L6).
 */
async function namedTickets(items, ids, cwd) {
  const field = deck.STORED.field;
  const have = items.map(function (item) { return item.id; });
  const wanted = items.filter(function (item) {
    return (item.kind === 'question' || item.kind === 'gate2') && typeof item[field] === 'string' && ids.indexOf(item.id) !== -1 && have.indexOf(item[field]) === -1;
  }).map(function (item) { return item[field]; });
  const found = [];
  for (const id of wanted.filter(function (id, at) { return wanted.indexOf(id) === at; })) {
    try {
      const answer = await deck.record(cwd, id);
      if (answer && answer[field]) found.push(answer[field]);
    } catch (err) { /* not this repository's ticket, or the deck is gone: not live */ }
  }
  return found;
}

function reasonFor(items, tickets) {
  const many = items.length > 1;
  // A thread the user opened, or one on this run's ticket, is this pilot's whoever posted it (L6).
  const ownLine = function (item) {
    const id = clip(item.id, MAX_ID_CHARS);
    if (deck.isUserOpened(item)) return 'The user opened ' + id + ' in this repository: it is yours.';
    if (isOnLiveTicket(item, tickets)) return id + ' is on this run\'s ticket: it is yours.';
    return null;
  };
  const own = [];
  const others = [];
  items.forEach(function (item) {
    const line = ownLine(item);
    if (line) own.push(line); else others.push(item);
  });
  // A gate is never closed unsigned (merge-first L7), nor a user thread by the pilot (user-threads-open L4):
  // each gets its sentence, not the close.
  const closing = items.filter(function (item) { return deck.notToClose(item) === ''; }).length;
  const quoted = items.map(function (item) {
    const last = deck.lastMessage(item);
    return clip(item.id, MAX_ID_CHARS) + ' — "' + clip(item.title, MAX_TITLE_CHARS) + '":\n' +
      clip(last.text, MAX_REPLY_CHARS) + (typeof last.fallback === 'string' ? '\n' + clip(last.fallback, MAX_REPLY_CHARS) : '') +
      (deck.notToClose(item) ? '\n' + deck.notToClose(item) : '');
  });

  const which = others.length < items.length
    ? others.map(function (item) { return clip(item.id, MAX_ID_CHARS); }).join(' or ')
    : many ? 'one of these' : 'this';

  return (
    'The user has answered on the deck and you have not answered it, so this turn is not ' +
    'over yet.\n\n' +
    clip(quoted.join('\n\n'), MAX_REASON_CHARS) +
    (closing === 0
      ? '\n\nOnce you have replied, the turn may end — ' + (items.some(deck.isUnsignedGate) ? 'the press is the user\'s move to make next.' : 'the next move is the user\'s.')
      : '\n\nAct on ' + (many ? 'them' : 'it') + ' now, then close ' + (closing > 1 ? 'each thread' : 'the thread') +
        ' with deck_resolve saying what was decided. If the argument is not over, answer with ' +
        'deck_reply instead and the turn may end — that is the user\'s move to make next.') +
    (own.length ? ' ' + own.join(' ') : '') +
    (others.length === 0 ? '' : ' One deck serves every run on this machine: if you never posted ' +
      which +
      ', it belongs to another session — say so and end your turn, and this gate will stand aside.')
  );
}

/**
 * What the pilot is told when nobody answered inside the hold. Not the end of
 * the matter: it names the threads and sends the pilot to one long `deck_wait`,
 * which parks for as long as it is asked to, and the gate stands aside on the
 * next stop so this can never become a loop.
 */
function stillWaitingFor(items) {
  const many = items.length > 1;
  const named = items.map(function (item) {
    return clip(item.id, MAX_ID_CHARS) + ' — "' + clip(item.title, MAX_TITLE_CHARS) + '"';
  });

  return clip(
    'You posted ' + (many ? 'these and nobody has answered them' : 'this and nobody has answered it') +
      ' yet, so your turn is not over:\n\n' + named.join('\n') +
      '\n\nDo not end a turn on an item you posted and nobody has answered. Start one ' +
      'background `pilot wait` (Bash, run_in_background) and act on what it prints when it ' +
      'exits, rather than a loop of short checks. If ' +
      (many ? 'none of these is' : 'this is not') + ' yours to wait on, say so and end your ' +
      'turn: this gate stands aside the second time.',
    MAX_REASON_CHARS
  );
}

/** The held hand-off's refusal (L6): said at each fresh stop while the item is open, never waited on. */
function heldReason(item) {
  const id = clip(item.id, MAX_ID_CHARS);
  return 'You were handed ' + id + ' — "' + clip(item.title, MAX_TITLE_CHARS) + '" — and it is still open, ' +
    'so this turn is not over. If you have not, deck_reply on ' + id + ' saying you hold the run; then ' +
    'deck_resolve on ' + id + '. Once it is resolved your turns end freely.';
}

/** The held item read by id, when it is not on the open page: the item, null if gone, undefined if the read failed. */
async function heldItem(id) {
  try {
    const read = await deck.tool('deck_read', { id: id, messages: 'all' });
    return (Array.isArray(read.items) && read.items[0]) || null;
  } catch (err) {
    return undefined;
  }
}

/**
 * `GET /api/record`'s `lanes.refusal` for `dir` (idle-main-lane L2, ADR 0123): the line, or ''.
 * A read that fails, or an answer without the line, refuses nothing (L6).
 */
async function laneRefusal(dir) {
  try {
    const refusal = typeof dir === 'string' && dir !== '' && (await deck.record(dir)).lanes.refusal;
    return typeof refusal === 'string' ? refusal : '';
  } catch (err) {
    return ''; // a deck that does not answer, or answers without lanes, never traps the pilot
  }
}

/**
 * The claim that makes "you are still waiting on this" something said once per
 * thread rather than once per turn.
 *
 * `stop_hook_active` only covers the continuation this hook itself caused. The
 * next stop after a new user prompt carries it as false again, so without this
 * a pilot that has already been told — and has gone on to other work while the
 * question sits open — would be held for the whole of `HOLD_MS` at the end of
 * every turn until somebody answered. That is the trap the gate must never be,
 * and the refusal's own last sentence promises it is not one.
 *
 * `deck.sessionKey` is the "make this safe to put in a file name" sanitiser; an
 * item id needs it for the same reason a session id does, and reaching for the
 * one that exists beats a second copy of the same regex.
 */
const waitedClaim = function (sessionId, id) {
  return deck.sessionKey(sessionId) + '-w-' + deck.sessionKey(id);
};

/** Said once per session, and never as a refusal: a deck that is down is not a reason to stay up. */
function deckIsDown(sessionId) {
  if (!deck.claim(deck.deckDownClaim(sessionId))) return null;
  return {
    systemMessage:
      '⚠ The deck at http://127.0.0.1:' + deck.deckPort() + ' is not answering, so nothing is ' +
      'checking whether a reply is waiting. Said once.',
  };
}

/** The gate. Returns what the hook should say, or null to let the turn end in silence. */
async function run(input) {
  if (!input) return null;
  if (input.stop_hook_active === true) return null; // told once already; a gate that repeats is a trap
  if (input.agent_id) return null; // a crew agent's turn is not the pilot's

  const sessionId = input.session_id;
  const state = deck.readState(sessionId);
  const posted = deck.readPosted(sessionId);
  // The hand-off delivered to this session (L4, L5), held only once the first tool call has judged
  // the pick-up (post-tool.js `plainPickup` deletes the pickup marker): until then it may be a plain session.
  let held = fs.existsSync(deck.pickupPath(sessionId)) ? null : deck.heldHandoff(sessionId);
  // Never on the deck, never posted and never handed anything: an ordinary Claude
  // session that happens to have this plugin installed, and none of this is its business.
  if (!state && posted.length === 0 && !held) return null;
  const baseline = state ? state.baseline : Infinity;
  const dir = deck.projectDir(input, process.env); // the project, not the shell's worktree (L3)

  const deadline = Date.now() + HOLD_MS;
  let laneRead = false;
  for (;;) {
    let read;
    let fell;
    try {
      // The owner fallback first (ADR 0045): a cursor past every reply, so the deck hands back
      // only a reply QA never picked up, now the pilot's, which is a reason to hold the turn.
      fell = await deck.tool('deck_wait', { since: FALLBACK_ONLY, timeout: 1, repo: dir });
      read = await deck.tool('deck_read', { open: true, limit: deck.OPEN_READ_LIMIT, messages: 'all' });
    } catch (err) {
      return deckIsDown(sessionId); // and never a block: a dead deck must not trap the pilot
    }
    const handed = Array.isArray(fell && fell.replies) ? fell.replies : [];
    if (handed.length) {
      return {
        decision: 'block',
        reason: reasonFor(handed.map(function (reply) { return { id: reply.itemId, title: reply.title, replies: [reply] }; })),
      };
    }
    const items = Array.isArray(read.items) ? read.items : [];
    const tickets = items.concat(await namedTickets(items, posted, dir));

    // An answer the pilot has not acted on ends the wait whichever way it got
    // here, and it is the reason the turn is held open — the reply text is the
    // wake-up, so nothing has to be delivered to a session that has gone quiet.
    // Only the pilot's threads (ADR 0041): a reply on one QA or a teacher owns is theirs to act on.
    // The owner is the one `deck_read` stamps on every item; none reads as the pilot's.
    // No fallback timing here (L6, L7): the deck_wait above is what runs the daemon's.
    const answered = deck.unanswered(items, posted, baseline, dir);
    if (answered.length) {
      // Only now, about to block: the ticket of an answered thread this session did not post (L6).
      const ids = answered.map(function (item) { return item.id; });
      return { decision: 'block', reason: reasonFor(answered, tickets.concat(await namedTickets(tickets, ids, dir))) };
    }

    // The held hand-off (L6, L8): after an answer, before the wait, and never waited on itself.
    if (held) {
      const item = items.find(function (open) { return open.id === held; }) || await heldItem(held);
      if (item && !deck.isClosed(item)) return { decision: 'block', reason: heldReason(item) };
      if (item !== undefined) deck.dropHeldHandoff(sessionId); // resolved or gone: the turn is the session's again
      held = null; // a failed confirm read drops nothing and never blocks (L6)
    }

    // An idle main lane with a red or green pick (idle-main-lane A3): after an answer and the held
    // hand-off, before the hold, read once. The rule and its line are the daemon's (L2).
    if (!laneRead) {
      laneRead = true;
      const refusal = await laneRefusal(dir);
      if (refusal) return { decision: 'block', reason: clip(refusal, MAX_REASON_CHARS) };
    }

    // Only threads the pilot has not already been told about are worth waiting
    // on. Checked before the wait rather than after it, because a hold that ends
    // in silence has still held the turn for nine minutes.
    const waitingOnUser = items.filter(function (item) {
      return awaitsUser(item, posted, tickets) && !deck.claimed(waitedClaim(sessionId, item.id));
    });
    if (waitingOnUser.length === 0) return null; // nothing of the pilot's is open and unsaid

    if (Date.now() >= deadline) {
      const saying = waitingOnUser.filter(function (item) {
        return deck.claim(waitedClaim(sessionId, item.id));
      });
      if (saying.length === 0) return null; // another copy of this hook got there first
      return { decision: 'block', reason: stillWaitingFor(saying) };
    }

    await sleep(Math.min(POLL_MS, Math.max(1, deadline - Date.now())));
  }
}

function main() {
  let raw = '';
  let started = false;

  function start() {
    if (started) return;
    started = true;

    let input;
    try {
      input = JSON.parse(raw);
    } catch (err) {
      return; // a payload that cannot be read is never a reason to hold the turn open
    }

    // A turn this gate does not hold has ended: `pilot run` may type into it now.
    const ended = function () { if (!input.agent_id) deck.markTurnEnded(process.env, input.cwd); };
    run(input).then(
      function (said) {
        if (!said || said.decision !== 'block') ended();
        if (!said) return;
        try {
          process.stdout.write(JSON.stringify(said));
        } catch (err) { /* EPIPE: the harness stopped reading, and the turn ends */ }
      },
      ended // never trap the pilot over this
    );
  }

  process.stdout.on('error', function () { /* the turn ends rather than crashing */ });
  process.stdin.on('error', start);
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', function (chunk) { raw += chunk; });
  process.stdin.on('end', start);
}

module.exports = {
  HOLD_MS: HOLD_MS,
  MAX_ID_CHARS: MAX_ID_CHARS,
  MAX_REASON_CHARS: MAX_REASON_CHARS,
  MAX_REPLY_CHARS: MAX_REPLY_CHARS,
  MAX_TITLE_CHARS: MAX_TITLE_CHARS,
  awaitsUser: awaitsUser,
  namedTickets: namedTickets,
  reasonFor: reasonFor,
  stillWaitingFor: stillWaitingFor,
  run: run,
};

if (require.main === module) main();
