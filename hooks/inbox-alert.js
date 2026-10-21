#!/usr/bin/env node
/**
 * The deck's inbox, delivered without being asked for. One of the three lanes
 * `post-tool.js` runs after every tool call.
 *
 * A1's middle layer. `deck_wait` costs a tool call and only returns when the
 * pilot has decided to wait; this costs nothing and fires while it is busy with
 * something else, so an answer the user typed thirty seconds ago is in the
 * pilot's context at its next tool call rather than whenever it next thinks to
 * look. It never blocks and never fails a tool call: a deck that is not there
 * is said once and then let be.
 *
 * Three things decide whether a reply is this session's to receive:
 *
 *   - it is the pilot, not a crew agent. A subagent's tool calls carry the
 *     session's own id with an `agent_id` beside them, so an injection there
 *     would land in the implementer's context and be gone from the pilot's.
 *   - the session is a run on the deck, joined on the repository path, because
 *     every Claude session on this machine runs this hook and only some of them
 *     are pilots — and then the reply itself is on the *item's* repository,
 *     which slice 4 stamps from the posting session, because one deck serves
 *     every repository on this machine and a pilot in one of them has no
 *     business reading an answer typed for another.
 *   - the reply arrived after the session did, and no copy of this hook has
 *     already handed it over. The claim file is that record, and an exclusive
 *     create is what makes it exactly once when a turn's parallel tool calls
 *     spawn several copies at the same instant.
 */

'use strict';

const deck = require('./lib/deck.js');

/**
 * What one reply may take of the pilot's context, and what they may take
 * together. The deck accepts 64KB per field and this hook fires after every
 * tool call, so every piece of what it says is bounded here — a title and an id
 * as well as the text, because all three arrive over HTTP from a port anything
 * on this machine may write to (A6) and none of them is the deck's promise.
 */
const MAX_REPLY_CHARS = 4000;
const MAX_TITLE_CHARS = 200;
const MAX_ID_CHARS = 64;
const MAX_NOTICE_CHARS = 16000;

/** A park long enough to return what is already written and not long enough to wait. */
const NO_WAIT_MS = 1;

const claimName = function (sessionId, seq) {
  return deck.sessionKey(sessionId) + '-r' + seq;
};

function clip(text, limit) {
  const value = typeof text === 'string' ? text : '';
  return value.length <= limit ? value : value.slice(0, limit) + '\n[…clipped]';
}

/** The deck's `report due` line on its own closing report (gate2-frees-lane spec 4), not a landing. */
const reportDue = function (reply) { return reply.from === 'deck' && reply.kind === 'report'; };

/** One reply, as the pilot reads it: which thread, what it was about, what was said. */
function quote(reply) {
  const when = typeof reply.repliedAt === 'string' ? ' at ' + clip(reply.repliedAt, MAX_ID_CHARS) : '';
  // The deck's owner fallback says why a QA thread's reply reached the pilot (ADR 0045).
  const fellBack = typeof reply.fallback === 'string' ? '\n' + clip(reply.fallback, MAX_REPLY_CHARS) : '';
  // A short landing's line, or a report due, is the deck's, never the user's (three-lanes L7).
  const by = reportDue(reply) ? ' (the deck wrote this, not the user)'
    : reply.from === 'deck' ? ' (a landing ended short; the deck wrote this, not the user)' : '';
  return clip(reply.itemId, MAX_ID_CHARS) + ' — "' + clip(reply.title, MAX_TITLE_CHARS) + '"' +
    when + by + ':\n' + clip(reply.text, MAX_REPLY_CHARS) + fellBack;
}

/** The Sign off on QA's walkthrough: not Gate 2 (`pilot.md` step 9), and QA's thread to close. */
const signsWalkthrough = function (reply) { return reply.text === 'Sign off' && reply.owner === 'qa'; };

/**
 * The thread a reply is on, as `deck.notToClose` reads it: the open item when the read has it,
 * whose earlier presses decide a gate (gate-stays-signed spec 1), else the reply alone. When a
 * read was made (`items` given, even null) and lacks the thread, a typed reply on a gate is not
 * known to be unsigned (it may follow a Sign off the read missed), so it gets no gate sentence;
 * the deck's own "has not signed" refusal is the backstop.
 */
function threadOf(reply, items, batch) {
  const item = (Array.isArray(items) ? items : []).find(function (it) { return it && it.id === reply.itemId; });
  if (item) return item;
  // The batch's own replies on this thread, in order: a Sign off withdrawn by a later Not yet in it reads unsigned.
  const same = (Array.isArray(batch) ? batch : [reply]).filter(function (r) { return r.itemId === reply.itemId; })
    .sort(function (a, b) { return (a.seq || 0) - (b.seq || 0); });
  const alone = { kind: reply.kind, replies: same.map(function (r) { return { from: 'user', text: r.text }; }) };
  const pressed = typeof reply.text === 'string' && deck.GATE_PRESSES.some(function (o) {
    return reply.text === o || reply.text.indexOf(o + '\n\n') === 0;
  });
  return items !== undefined && deck.isUnsignedGate(alone) && !pressed ? { id: reply.itemId } : alone;
}

/** What follows a reply whose thread the pilot does not close with deck_resolve; '' for one it does. */
const notToClose = function (reply, items, batch) {
  if (reportDue(reply)) return '\nAnswer it with one deck_reply on the report that starts "Findings:"; the deck adds it to the report.';
  if (reply.from === 'deck') return '\nAnswer the landing with deck_reply on its gate2 once you have acted; a gate2 is never closed with deck_resolve.';
  if (signsWalkthrough(reply)) {
    return '\nThis Sign off is on QA\'s walkthrough, not Gate 2: QA closes that thread and posts its QA comment; ask for Gate 2 with a gate2.';
  }
  const sentence = deck.notToClose(threadOf(reply, items, batch));
  return sentence ? '\n' + sentence : '';
};

function notice(replies, items) {
  const many = replies.length > 1;
  const open = replies.filter(function (reply) { return notToClose(reply, items, replies) === ''; }).length;
  const due = !many && reportDue(replies[0]);
  const landing = !many && !due && replies[0].from === 'deck';
  const heading = many
    ? 'SYSTEM NOTICE: the user has answered ' + replies.length + ' threads on the deck while you were working.'
    : due
      ? 'SYSTEM NOTICE: a closing report is due on the deck while you were working.'
      : landing
      ? 'SYSTEM NOTICE: a landing ended short on the deck while you were working.'
      : 'SYSTEM NOTICE: the user has answered a thread on the deck while you were working.';

  return {
    systemMessage: many
      ? '💬 ' + replies.length + ' replies on the deck'
      : (due ? '💬 Report due: ' : landing ? '💬 A landing ended short: ' : '💬 The user replied on the deck: ') + clip(replies[0].title, MAX_TITLE_CHARS),
    additionalContext: clip(
      heading +
        ' Act on it now: from the next tool call on you are shown only its id and title until you answer.\n\n' +
        replies.map(function (reply) {
          return quote(reply) + notToClose(reply, items, replies);
        }).join('\n\n') +
        (open === 0 ? '' : '\n\n' +
          (open > 1 ? 'Those threads are' : 'That thread is') +
          ' still open: close ' +
          (open > 1 ? 'each of them' : 'it') +
          ' with deck_resolve once you have acted, or push back with deck_reply. You cannot end ' +
          'your turn while an answer is unresolved.'),
      MAX_NOTICE_CHARS
    ),
  };
}

/**
 * Said once per session, and only to a session that has reached the deck at
 * least once: a session that never did is an ordinary Claude session that has
 * this plugin installed, and telling it about a deck it does not use is noise.
 */
function deckIsDown(sessionId) {
  if (!deck.claim(deck.deckDownClaim(sessionId))) return null;
  return {
    systemMessage: '⚠ The deck is not answering; replies will not reach you on their own.',
    additionalContext:
      'SYSTEM NOTICE: the deck at http://127.0.0.1:' + deck.deckPort() + ' is not answering, so ' +
      'anything the user types there will not reach you by itself and deck_wait will fail too. ' +
      'Nothing else in this session is affected: carry on, and tell the user their deck is down ' +
      'if you are waiting on them. Said once.',
  };
}

/** The first time this session is seen: take its place on the deck and say nothing. */
async function arrive(sessionId, cwd) {
  let listed;
  try {
    listed = await deck.runs();
  } catch (err) {
    return null; // no deck, and no reason yet to believe this session wanted one
  }
  if (!deck.isOnDeck(listed, cwd)) return null;

  let seq;
  try {
    seq = (await deck.health()).seq;
  } catch (err) {
    return null;
  }
  if (!Number.isInteger(seq)) return null;

  // Where the session starts reading. Everything the user typed before it opened
  // belongs to whoever was asking then, not to this session's context.
  deck.startState(sessionId, seq);
  deck.sweep();
  return null;
}

/**
 * The short line for every unanswered thread (L4) not quoted in full by this
 * call or a parallel copy of it (A1: the words are said once, the repeats name
 * the thread). Read without `repo` (L5): a read naming one marks that
 * repository's replies delivered. A read that fails, or an item it cannot
 * read, says nothing more: the repeat never costs the pilot its full notice.
 */
async function readOpen() {
  try {
    const read = await deck.tool('deck_read', { open: true, limit: deck.OPEN_READ_LIMIT, messages: 'all' });
    return read && read.items;
  } catch (err) {
    return null;
  }
}

function stillUnanswered(items, sessionId, cwd, state, quoted) {
  let still;
  try {
    still = deck.unanswered(items, deck.readPosted(sessionId), state.baseline, cwd)
      .filter(function (item) { return quoted.indexOf(item.id) === -1; });
  } catch (err) {
    return '';
  }
  if (still.length === 0) return '';
  const sentences = still.map(function (item) { return deck.notToClose(item); });
  return 'SYSTEM NOTICE: still unanswered on the deck: ' +
    still.map(function (item) {
      return clip(item.id, MAX_ID_CHARS) + ' "' + clip(item.title, MAX_TITLE_CHARS) + '"';
    }).join(', ') +
    (sentences.indexOf('') === -1
      ? '. Act on each, then answer with deck_reply.'
      : '. Act on each, then deck_resolve it or answer with deck_reply.') +
    sentences.filter(function (s, i) { return s && sentences.indexOf(s) === i; }).map(function (s) { return ' ' + s; }).join('');
}

/** Whatever has been said since the cursor, minus whatever is not this session\'s. */
async function deliver(sessionId, cwd, state) {
  let waited;
  try {
    // Named, so the deck records the hand-off against this session's run and not
    // against whoever else is on the machine. `isForThisRepo` below stays all the
    // same: this hook runs against whatever deck answers the port, and the older
    // one hands back the lot. No `author`, so the deck reads this wait as the
    // pilot's (A8) and hands back only the threads the pilot owns (ADR 0041).
    waited = await deck.tool('deck_wait', {
      since: state.cursor,
      timeout: NO_WAIT_MS,
      repo: cwd,
    });
  } catch (err) {
    return deckIsDown(sessionId);
  }

  const replies = Array.isArray(waited.replies) ? waited.replies : [];
  // Read before any claim is taken: nothing that waits sits between a claim and its commit or rollback.
  const open = await readOpen();
  const claimed = [];
  const mine = [];
  const quoted = []; // threads this call or a parallel copy is quoting in full
  let held = 0;
  for (const reply of replies) {
    if (!reply || !Number.isInteger(reply.seq)) continue;
    if (!deck.isForThisRepo(reply, cwd)) continue;
    quoted.push(reply.itemId);
    const name = claimName(sessionId, reply.seq);
    if (!deck.claim(name)) { held += 1; continue; } // another copy is delivering it
    claimed.push(name);
    mine.push(reply);
  }

  const repeat = stillUnanswered(open, sessionId, cwd, state, quoted);
  const seq = Number.isInteger(waited.seq) ? waited.seq : null;
  if (mine.length === 0) {
    // Nothing here is this repository\'s, so read past it rather than ask for it
    // again after every tool call. The deck hands back twenty replies at a time,
    // and one busy repository would otherwise fill every wait this session ever
    // makes. Only when no copy of this hook holds a claim: a claim it gives back
    // has to bring that reply round again, and a cursor past it could not.
    if (held === 0) deck.advanceCursor(sessionId, seq);
    return repeat === '' ? null : { additionalContext: repeat };
  }
  const said = notice(mine, open);
  return {
    systemMessage: said.systemMessage,
    additionalContext: said.additionalContext + (repeat === '' ? '' : '\n\n' + repeat),
    // The cursor moves only once the harness has the bytes. A cursor advanced
    // over a delivery that never landed would step past the reply for good,
    // and the claim given back below is what brings it round again.
    commit: function () { deck.advanceCursor(sessionId, seq); },
    rollback: function () { claimed.forEach(deck.unclaim); },
  };
}

/** What `deck_post` answers with, and the only place an item's id is said out loud. */
const POSTED = /Posted (itm_[0-9a-f]+)/;

/** How much of a tool result is worth reading for one. */
const MAX_RESULT_CHARS = 4000;

/**
 * The text of a tool result, as MCP shapes one, without serialising the rest of
 * it. Deliberately not `JSON.stringify(response)`: this runs after every tool
 * call, the whole string would be built before any bound could be applied to it,
 * and the daemon's port trusts any loopback caller — so a process that won the
 * race for 4321 could answer one `deck_post` with something enormous and make
 * this hook build it in memory. Reading the one field means the bound is on what
 * is read rather than on what is thrown away, and a cycle or a BigInt somewhere
 * else in the object is simply never touched.
 */
function resultText(response) {
  if (typeof response === 'string') return response;
  const first = response && Array.isArray(response.content) ? response.content[0] : null;
  return first && typeof first.text === 'string' ? first.text : '';
}

/**
 * Note an item the pilot has just posted, so that the Stop gate knows which
 * threads are its own.
 *
 * The gate needs that to refuse a turn ending on a question nobody has answered,
 * and the tool result is where it can be had without two paths having to agree —
 * see `readPosted` in `lib/deck.js` for why they do not. A crew agent's post is
 * not recorded: it is that agent that is waiting on the answer, not the pilot.
 */
function notePost(input) {
  const name = input.tool_name;
  if (typeof name !== 'string' || !name.endsWith('deck_post')) return;

  const found = POSTED.exec(resultText(input.tool_response).slice(0, MAX_RESULT_CHARS));
  if (found) deck.recordPosted(input.session_id, found[1]);
}

/** The lane, as `post-tool.js` calls it: the hook payload in, something to say or null out. */
async function run(input) {
  if (!input) return null;
  if (input.agent_id) return null; // a crew agent is not the pilot

  notePost(input);

  const sessionId = input.session_id;
  const state = deck.readState(sessionId);
  const dir = deck.projectDir(input, process.env); // the project, not the shell's worktree (L3)
  if (!state) return arrive(sessionId, dir);
  return deliver(sessionId, dir, state);
}

module.exports = {
  MAX_ID_CHARS: MAX_ID_CHARS,
  MAX_NOTICE_CHARS: MAX_NOTICE_CHARS,
  MAX_REPLY_CHARS: MAX_REPLY_CHARS,
  MAX_TITLE_CHARS: MAX_TITLE_CHARS,
  claimName: claimName,
  notePost: notePost,
  notice: notice,
  resultText: resultText,
  run: run,
  stillUnanswered: stillUnanswered,
};
