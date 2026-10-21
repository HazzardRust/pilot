#!/usr/bin/env node
/**
 * An agent filling its context stashes and hands off, instead of getting dumb.
 *
 * One of the three lanes `post-tool.js` runs after every tool call, and — when
 * it is executed rather than required — the plugin's `subagentStatusLine`.
 * Those are the same file because they are the same fact rendered twice: how
 * full the acting agent's context is. The lane says it to the agent; the status
 * line says it to the person watching.
 *
 * `rules/vertical-execution.md` already says a slice that cannot reach green
 * inside its context was mis-cut, and that pushing on into the degraded zone
 * hides the mis-cut. The trouble is that the only party who could act on that
 * is the agent whose judgement is already going. So the guard does not rely on
 * it: at the hard mark — 260,000 tokens, the same flat count for a crew agent
 * and the pilot alike (2026-09-28, replacing the window-relative 35%/30% of
 * A3/L23) — the hook posts an item to the deck itself (A11) — `crew-handoff`
 * for a crew agent's own crossing, never the pilot's `handoff` (L17) — and the
 * pilot learns of it whether or not the agent says a word.
 *
 * Two sources for one number (A12):
 *
 *   a subagent   `agent_id` in the hook input. Its own transcript is read from
 *                the tail, and the model id in that same record picks the
 *                window. Note the input's `transcript_path` is the *parent's* —
 *                see `ownTranscript` below, which is a probed fact, not a guess.
 *   the pilot    no `agent_id`. There is no transcript to read that would mean
 *                anything, so the reading is the `ctx` figure slice 9's status
 *                line already writes to ~/.claude/context-usage-state.json. It
 *                lags by up to a status line refresh, which is the price of not
 *                keeping a third state file.
 *
 * And it never blocks. ADR 0010: this recommends, and slice 5's inbox gate is
 * the one hook in the package that refuses a stop. A guard that could stop an
 * agent at its hard mark could strand one there.
 *
 * One limit worth knowing, measured rather than reasoned about. A reading only
 * exists between turns, because it comes from an assistant message — so an
 * agent that issues many large tool calls *in one turn* can go from a third
 * full to over its limit with nothing in between for this to read. Seen on
 * 2026-09-14: a Haiku subagent asked for fourteen files emitted fourteen `Read`
 * blocks in a single message (one `requestId`, one `message.id`), and the next
 * request came back too long — last reading 31K, no crossing ever observable.
 * The guard is honest about that and says nothing rather than guessing between
 * turns. A brief that asks for many large reads at once is the mis-cut there,
 * and `subagentStatusLine` is the surface that still shows the climb.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const deck = require('./lib/deck.js');
const { lastAssistantUsage } = require('./lib/transcript-tail.js');
const { resolveAlias, windowFor } = require('./lib/model-windows.js');

/**
 * The user's decision of 2026-09-28, replacing A3/L23's window-relative
 * percentages (25%/30% for the pilot, 25%/35% for a crew agent) with flat
 * token counts that mean the same thing whoever is asked: advisory at
 * 225,000, hard at 260,000 (raised the same day from 200,000 and 250,000).
 * A crew agent and the pilot share both — the asymmetry that used to buy the
 * pilot's hand-off five points of room is gone with the percentages it was
 * measured in.
 */
const ADVISORY_TOKENS = 225000;
const HARD_TOKENS = 260000;

/**
 * A14/L23, now a token count rather than five points of hysteresis: below
 * this, an agent's claims are dropped and it can be warned again, so an
 * agent that compacts and climbs back up is told a second time. It has to
 * sit below the advisory, or a reading that crosses both in one step would be
 * swallowed by the re-arm check before the advisory is ever seen.
 */
const REARM_TOKENS = 150000;

/**
 * Below this many tokens, the flat marks would leave too little of the
 * window to act on them — today only claude-haiku-4-5, at 200,000. Scaled
 * down twice by window/250,000: once because each flat mark is itself a
 * fraction of a window near 250,000, and once more because a small model's
 * own window is smaller still. For a 200,000 window that is advisory
 * 144,000, hard 166,400, re-arm 96,000 — not the one-time scaling
 * (180,000/208,000/120,000) that would put the hard mark past the window
 * itself and leave no room to hand off inside it. 2026-09-28 decision;
 * `marksFor` below is the whole of it.
 */
const SMALL_WINDOW_CEILING = 256000;
const REFERENCE_WINDOW = 250000;

/**
 * The reference window assumed for the pilot's own reading. Slice 9's status
 * line snapshot has only ever carried a percentage, never a token count or a
 * window size (`reading()` below), and the pilot runs on Fable alone
 * (`CLAUDE.md`), whose window is 1,000,000 (`model-windows.js`) — the same
 * window as every model a pilot could plausibly be. Reading the percentage
 * as a fraction of that window is safe for exactly that reason, and because
 * 1,000,000 sits well above `SMALL_WINDOW_CEILING`, so the flat marks below
 * apply to the pilot unscaled either way.
 */
const PILOT_REFERENCE_WINDOW = 1000000;

/**
 * The three marks, in tokens, for a model with this window. `size` may be
 * null — an unknown model, or (for the pilot) a reading with no window at
 * all — and that is never a reason to guess small: only a *known* window
 * under the ceiling is scaled down, so an unknown one gets the flat marks
 * unscaled, on the working assumption that most windows are large enough for
 * them to fit.
 */
function marksFor(size) {
  if (typeof size !== 'number' || !(size > 0) || size >= SMALL_WINDOW_CEILING) {
    return { advisory: ADVISORY_TOKENS, hard: HARD_TOKENS, rearm: REARM_TOKENS };
  }
  // (size*size)/(REFERENCE_WINDOW*REFERENCE_WINDOW) rather than the squared
  // ratio computed the other way round: `(size/REFERENCE_WINDOW) ** 2` lands on
  // 0.6400000000000001 for a 200,000 window, which would put the advisory a
  // fraction of a token above 128,000 and miss an exact reading of it.
  const scale = (size * size) / (REFERENCE_WINDOW * REFERENCE_WINDOW);
  return {
    advisory: ADVISORY_TOKENS * scale,
    hard: HARD_TOKENS * scale,
    rearm: REARM_TOKENS * scale,
  };
}

/**
 * Whether this payload is one of the crew rather than the pilot's own session.
 * A subagent carries `agent_id` and the pilot does not — `reading()` below
 * reads the same field to choose where the token count itself comes from, and
 * `announce()` to decide whether the crossing is the deck's business, so the
 * three of them cannot come to disagree about who is speaking.
 */
function isSubagent(input) {
  return Boolean(input && input.agent_id);
}

/** The one crew agent whose crossing is a pause rather than a stash (co-pilot-successor L4). */
const CO_PILOT_TYPE = 'pilot:pilot-co-pilot';

/**
 * A co-pilot of a yellow ticket. It owns no slice branch to stash to, so its marks
 * ask it to pause and hand back `paused`, and its item is posted at the advisory
 * (L3): draining its live children needs the room between the two marks.
 */
function isCoPilot(input) {
  return isSubagent(input) && input.agent_type === CO_PILOT_TYPE;
}

/** Slice 9's snapshot, which is the pilot's own reading. Resolved per call. */
function snapshotPath() {
  return path.join(os.homedir(), '.claude', 'context-usage-state.json');
}

/** A name that is safe to put in a path, or null. Ids come from the harness. */
function safeName(value) {
  if (typeof value !== 'string') return null;
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : null;
}

/** The most of an agent type this will repeat back. A type is a short name. */
const MAX_AGENT_TYPE_CHARS = 60;

/**
 * The acting agent's type, as it is safe to put on the deck.
 *
 * This is the one value in the guard that travels: everything else it says is a
 * percentage or a token count it computed itself, but `agent_type` comes in on
 * the hook payload and goes out into a deck item the pilot later reads. So it
 * is held to the shape an agent type actually has (a plugin's carry a `:`, as in
 * `pilot:pilot-implementer`) and to a length, and anything
 * else becomes the generic word. An unbounded string here would be a way to
 * write into another agent's context through the deck.
 */
function safeAgentType(value) {
  if (typeof value !== 'string') return 'an agent';
  const trimmed = value.trim();
  // Shape first, length second. Clipping before the test would cut a hostile
  // value down to a well-formed-looking prefix and repeat *that* back, which
  // reads as a real agent type and hides that anything was wrong.
  if (!/^[A-Za-z0-9][A-Za-z0-9 _.:-]*$/.test(trimmed)) return 'an agent';
  return trimmed.length <= MAX_AGENT_TYPE_CHARS ? trimmed : 'an agent';
}

/**
 * Where a subagent's own transcript really is.
 *
 * The hook input's `transcript_path` is the *session's* transcript even inside a
 * subagent's tool loop — proved by probe on 2026-09-14, Claude Code 2.1.270:
 * a PostToolUse payload with `agent_id: a96a55151f78b7c83` carried the parent's
 * `<session>.jsonl`, while the subagent's own messages were being written to
 * `<session>/subagents/agent-a96a55151f78b7c83.jsonl` beside it. Reading the
 * path as handed over would have measured the pilot's context and warned the
 * wrong agent, which is the one failure a guard must not have.
 *
 * So the session's transcript locates the directory and the two ids name the
 * file. Both ids are checked against a plain-name shape first: they arrive from
 * outside this process and are about to become a path.
 */
function ownTranscript(input) {
  const parent = input && input.transcript_path;
  if (typeof parent !== 'string' || parent === '') return null;
  const session = safeName(input && input.session_id);
  const agent = safeName(input && input.agent_id);
  if (!session || !agent) return null;
  return path.join(path.dirname(parent), session, 'subagents', 'agent-' + agent + '.jsonl');
}

/** Which agent this is, for claim purposes. The pilot is its session. */
function agentKey(input) {
  const agent = input && input.agent_id;
  return deck.sessionKey(input && input.session_id) + '-' +
    (agent ? deck.sessionKey(agent) : 'main');
}

const claimFor = function (key, threshold) { return key + '-ctx' + threshold; };
const deckClaimFor = function (key, hard) { return key + '-ctx' + hard + '-deck'; };

/**
 * This session's own reading out of the snapshot's `decks` map, or null.
 *
 * The map is keyed by working directory (L31 of deck-workspace), which is what
 * tells two pilots on one machine apart: the top-level figure below is whichever
 * status line refreshed last, and the `session_id` beside it only lets the loser
 * stay silent — so with two pilots up, each one hears its own reading about half
 * the time and neither is reliably told to hand off.
 *
 * The key is compared with `samePath` rather than spelled again here, because
 * the status line resolves and lower-cases it and the two must not drift. No
 * staleness check: an entry for *this* directory is written by the status line
 * of the session working in it, on every turn, and a session calling tools is a
 * session whose status line is refreshing — so its own entry cannot be old. The
 * lag of up to one refresh is the one this guard has always had.
 *
 * Two sessions in the *same* directory still share one entry — the key L31
 * chose is a directory, not a session — but they no longer share credit for
 * it: the status line stamps the entry with the session that wrote it
 * (S22-fix), and this refuses one stamped by anybody else, absent stamp
 * included. Without that check, a hand-off followed by `/clear` left the
 * outgoing session's hard-mark figure in the map, and the fresh session in the
 * same directory read it as its own on its very first tool call — a reading
 * about a context it had never filled. Null is the same silence a directory
 * the map says nothing about already gets, so a session whose own status line
 * has not refreshed yet is not told about a figure that was never its own.
 */
function deckReading(snapshot, cwd, sessionId) {
  const decks = snapshot && snapshot.decks;
  if (!decks || typeof decks !== 'object') return null;
  const key = Object.keys(decks).find(function (dir) { return deck.samePath(dir, cwd); });
  const entry = key === undefined ? null : decks[key];
  if (!entry || typeof entry !== 'object') return null;
  if (typeof entry.session_id !== 'string' || entry.session_id === '' || entry.session_id !== sessionId) {
    return null;
  }
  const ctx = entry.ctx;
  return (typeof ctx === 'number' && isFinite(ctx)) ? ctx : null;
}

/**
 * Whether the session working in `dir` is past the pilot's advisory mark: the
 * deck's chain asks this on a clean finish, so a session with room left takes
 * the next ticket in place instead of being cleared (handoff-over-mark L3, ADR
 * 0117). The mark stays here, the one place it lives. No session check, unlike
 * `deckReading`: the daemon asking does not know the finishing session's id,
 * and the entry for a directory is written by the session working there (L4).
 * Null is no reading — no snapshot, no `decks` entry, no figure — and the chain
 * hands off on null, as it did before it asked (L9).
 */
function pastAdvisoryAt(dir, snapshot) {
  let read = snapshot;
  if (read === undefined) {
    try {
      read = JSON.parse(fs.readFileSync(snapshotPath(), 'utf8'));
    } catch (err) {
      return null;
    }
  }
  const decks = read && read.decks;
  if (!decks || typeof decks !== 'object') return null;
  const key = Object.keys(decks).find(function (candidate) { return deck.samePath(candidate, dir); });
  const ctx = key === undefined ? null : decks[key] && decks[key].ctx;
  if (typeof ctx !== 'number' || !isFinite(ctx)) return null;
  return (ctx / 100) * PILOT_REFERENCE_WINDOW >= marksFor(PILOT_REFERENCE_WINDOW).advisory;
}

/**
 * How full this agent's context is, in tokens, or null for "no idea" — an
 * unreadable transcript, a status line that has not written a snapshot yet.
 * `size` may itself be null (an unknown model): that is never a reason to
 * return null here, only a reason for `marksFor` to leave its marks unscaled.
 * Null from this function is always silence.
 */
function reading(input) {
  if (isSubagent(input)) {
    const usage = lastAssistantUsage(ownTranscript(input));
    if (!usage) return null;
    return { used: usage.tokens, size: windowFor(usage.model) };
  }

  let snapshot;
  try {
    snapshot = JSON.parse(fs.readFileSync(snapshotPath(), 'utf8'));
  } catch (err) {
    return null;
  }
  const mine = deckReading(snapshot, input && input.cwd, input && input.session_id);
  if (mine !== null) return { used: (mine / 100) * PILOT_REFERENCE_WINDOW, size: PILOT_REFERENCE_WINDOW };

  // No entry for this directory: an older snapshot, or a session whose status
  // line has not refreshed since this hook started asking. Fall back to what
  // this guard read before the map existed.
  const ctx = snapshot && snapshot.ctx;
  if (typeof ctx !== 'number' || !isFinite(ctx)) return null;
  // One file, every session on this machine, and several of them run at once.
  // The figure in it is this session's reading only if this session's status
  // line is what wrote it; anything else — another instance, or a snapshot from
  // before slice 9 recorded a writer — is not evidence about this context, and
  // the cost of waiting for the next status line refresh is a few hundred
  // milliseconds. Warning the wrong session is the one failure a guard must not
  // have.
  const wroteIt = snapshot.session_id;
  if (typeof wroteIt !== 'string' || !input || wroteIt !== input.session_id) return null;
  return { used: (ctx / 100) * PILOT_REFERENCE_WINDOW, size: PILOT_REFERENCE_WINDOW };
}

const ROUND = function (pct) { return pct.toFixed(0); };

/** `412k`, `1M` — short enough for a status line and exact enough to act on. */
function tokens(count) {
  if (count >= 1000000) return (count / 1000000).toFixed(count % 1000000 === 0 ? 0 : 1) + 'M';
  return Math.round(count / 1000) + 'k';
}

/** How much of the window is gone, said the one way every message says it now (2026-09-28). */
function howFull(seen) {
  return tokens(seen.used) + ' tokens';
}

/** What the hard text will ask for, named at the advisory so it can be prepared for. */
function whatComesNext(isPilot, onDeck) {
  if (!onDeck) return 'wrap up and hand over what you are doing';
  return isPilot ? 'bring the status table current and run `pilot handoff`' : 'stash and hand off';
}

/**
 * Between tickets the hand-off costs the least it ever will, so the pilot on the
 * deck is told at the advisory not to spend the tokens before the hard mark
 * waiting for it. Only the pilot: a `handoff` item is the pilot's kind. A live
 * co-pilot holds the hand-off's /clear, so it is paused now, while the buffer to
 * the hard mark is whole (clear-waits-co-pilot spec 6, A3).
 */
function handoffNowIfIdle(isPilot, onDeck) {
  if (!isPilot || !onDeck) return '';
  return ' If nothing is in flight — no live agent, no open run — the cheapest move is the ' +
    'handoff now: one `deck_status` call, then run `pilot handoff`. If your co-pilot is live, ' +
    'send it the pause now: it integrates the slice in flight and hands back `paused`; ' +
    '`deck_ticket release` it then.';
}

/**
 * What to say. The texts differ along two axes, because advice is only
 * actionable when it names something the agent actually has.
 *
 *   the two thresholds  the advisory names what is coming; the recommendation
 *                       asks for it.
 *   who is being told   on this run's deck a crew agent owns a slice branch to
 *                       stash to, a brief with a trailer, and a `main` to report
 *                       to, and the pilot owns the artefact's status table —
 *                       the only thing a fresh pilot can be rebuilt from. Off
 *                       the deck an agent owns none of those.
 *
 * That second axis is the one that is easy to miss, because the hook cannot see
 * it from the payload: every Claude session on this machine runs this file and
 * most of them are not pilot runs. Telling an unrelated repository's agent to
 * commit `wip:` to a slice branch and message `main` is an instruction it cannot
 * follow and a context invented for work it is not doing — so off the deck the
 * same two crossings are said in words that assume nothing.
 */
function advice(input, seen, marks, threshold, onDeck) {
  const isPilot = !isSubagent(input);
  const full = howFull(seen);

  // Off the deck a co-pilot has no ticket to pause, so it gets the generic words below.
  if (onDeck && isCoPilot(input)) {
    const hard = threshold === marks.hard;
    return {
      systemMessage: '⚠ Context ' + tokens(seen.used) + ' tokens — pause and hand back `paused`.',
      additionalContext:
        'SYSTEM NOTICE: you are at ' + full + ', past the ' +
        (hard ? tokens(marks.hard) + ' token mark, and your pause is overdue'
          : tokens(marks.advisory) + ' token advisory') +
        ". Pause now as your definition's Hand-back says: start no slice, fix round or QA, and " +
        'hand back `paused`, no `wip:` commit. This is advice and never a block. Said once.',
    };
  }

  if (threshold === marks.advisory) {
    return {
      systemMessage: '⚠ Context ' + tokens(seen.used) + ' tokens — finish the step in hand.',
      additionalContext:
        'SYSTEM NOTICE: you are at ' + full + ', past the ' + tokens(marks.advisory) +
        ' token advisory. Finish the ' +
        'step you are on and start nothing new — no fresh area of the codebase, no new ' +
        'child agent, no refactor you had been considering. At ' + tokens(marks.hard) +
        ' tokens you will be asked to ' + whatComesNext(isPilot, onDeck) +
        ', and anything begun now will not survive that.' + handoffNowIfIdle(isPilot, onDeck) +
        ' This is said once.',
    };
  }

  if (!onDeck) {
    return {
      systemMessage: '⚠ Context ' + tokens(seen.used) + ' tokens — wrap up and hand over.',
      additionalContext:
        'SYSTEM NOTICE: you are at ' + full + ', past the ' + tokens(marks.hard) +
        ' token mark, where the work in hand stops being finishable in the context that is ' +
        'left. Wrap up now, in this order:\n' +
        '1. Put what you have somewhere it survives this session, the way this project ' +
        'already saves work.\n' +
        '2. Write down what is done, what is not, what you learned that is written down ' +
        'nowhere else, and the exact next step.\n' +
        '3. Give that to whoever is waiting on you.\n' +
        '4. Stop there. Do not begin the next thing.\n' +
        'This is advice and never a block. Said once.',
    };
  }

  if (isPilot) {
    return {
      systemMessage: '⚠ Context ' + tokens(seen.used) + ' tokens — deck_status, then pilot handoff.',
      additionalContext:
        'SYSTEM NOTICE: you are at ' + full + ', past the ' + tokens(marks.hard) +
        ' token mark. Hand off now, in two steps and nothing more:\n' +
        "1. Bring the status table current with one `deck_status` call: every row as it " +
        "stands right now, with each slice's state, branch, worktree and PR, including what " +
        'is in flight, and `slug`, `branch`, `worktree`, `artefact`, `findings` and `next`, the ' +
        'exact next move.\n' +
        '2. Run `pilot handoff` once (Bash; `--trailer "<line>"` per commit trailer). It commits ' +
        'and pushes the `docs/design/<slug>/run.json` the deck wrote into your `feat/<slug>` ' +
        'worktree as `chore(<slug>): run record`, posts the one `handoff` item for this repository from the record, and answers ' +
        'in one line. Under `pilot run` the `/clear` is typed for you: stop there. If the line ' +
        'says it is not under `pilot run`, tell the user to type `/clear` — the fallback — and ' +
        'stop there; if it names a failure, nothing was posted, so fix that and run it again.\n' +
        'No prose hand-off is written anywhere; the record is the hand-off. A session start ' +
        'hands the next session that item, the run record and the open threads by itself, and ' +
        'the user pastes nothing, so what `next` leaves out is lost; it is ' +
        'handed over once — a second `/clear` is silent. The record is the only thing a fresh ' +
        'pilot can be rebuilt from, and a pilot that reads past here starts losing the run it ' +
        'is holding. This is advice and never a block. Said once.',
    };
  }

  return {
    systemMessage: '⚠ Context ' + tokens(seen.used) + ' tokens — stash and hand off.',
    additionalContext:
      'SYSTEM NOTICE: you are at ' + full + ', past the ' + tokens(marks.hard) +
      ' token mark, where a slice stops ' +
      'being finishable in the context that is left. Stash and hand off now, in this order:\n' +
      '1. Commit what you have to your slice branch with a `wip:` subject and your brief\'s ' +
      'trailer, staging only the files you changed, by name. Never `git add -A`, and never ' +
      'a credential.\n' +
      '2. Write a handoff a fresh agent could be briefed from: what is done, what is not, ' +
      'what you learned that is not written down in the code, and the exact next step.\n' +
      '3. Send that handoff to `main` with SendMessage.\n' +
      '4. Stop there. Do not begin the next step.\n' +
      'This is advice and never a block — but the pilot has already been told on the deck, ' +
      'so stopping here is what is expected of you. Said once.',
  };
}

/**
 * The main repository a git worktree belongs to, or null when `dir` is not one.
 *
 * A worktree's `.git` is a *file* reading `gitdir: <main>/.git/worktrees/<name>`,
 * so this is one file read and no shell. It exists because the deck's runs are
 * keyed on the repository a pilot opened, while a crew agent may be working in
 * a worktree of it — and an item that failed that join would never be posted.
 * Observed on this machine: a subagent's hook `cwd` is the *session's* cwd, so
 * the worktree case does not arise for the crew; this is the belt for the case
 * where an agent is launched in a worktree directly.
 */
function mainRepoOf(dir) {
  if (typeof dir !== 'string' || dir === '') return null;
  let pointer;
  try {
    const marker = path.join(dir, '.git');
    if (!fs.statSync(marker).isFile()) return null;
    pointer = fs.readFileSync(marker, 'utf8');
  } catch (err) {
    return null;
  }
  const found = /^gitdir:\s*(.+?)\s*$/m.exec(pointer);
  if (!found) return null;
  const inside = found[1].replace(/\\/g, '/');
  const at = inside.lastIndexOf('/.git/worktrees/');
  return at === -1 ? null : path.normalize(inside.slice(0, at));
}

/**
 * The most items this asks the deck for: the ceiling `deck_read` itself allows,
 * because the read below cannot name a repository and so counts back from the
 * newest across every run on the machine. See there.
 */
const MAX_ITEMS = 100;

/**
 * The pilot run this session belongs to, or false.
 *
 * Being a registered run is necessary and nowhere near sufficient, which is the
 * correction QA made to this: `deck/client.mjs` registers *every* session that
 * loads the plugin's MCP server, under its own working directory, and starts a
 * deck itself when none answers. So on a machine with this installed every
 * session is a run, and a gate that stopped at registration would tell a
 * stranger's agent to commit `wip:` to a slice branch nobody ever briefed it on.
 *
 * What distinguishes a pilot run is that the deck is holding work for it. The
 * pilot posts its first item at intake, before any implementer exists, so every
 * crew agent that could ever cross a threshold is working under a run with at
 * least one item; a session that merely loaded the plugin has never posted and
 * never will, because this guard will not post for it either.
 *
 * Two requests rather than one, both behind the crossing's claim and both
 * bounded by the client's timeout, and any failure at all is false: silence and
 * the generic wording are the safe side of every one of these questions.
 */
async function pilotRunFor(cwd) {
  let listed;
  try {
    listed = await deck.runs();
  } catch (err) {
    return false; // no deck, nothing to tell
  }

  let repo = deck.isOnDeck(listed, cwd) ? cwd : null;
  if (!repo) {
    const main = mainRepoOf(cwd);
    repo = main && deck.isOnDeck(listed, main) ? main : null;
  }
  if (!repo) return false;

  // **Not** named, and the join is made below instead. `deck/server.mjs` hands
  // every reply on the items a read returns over to the pilot when the call
  // names a repository, so asking that way would mark the user's unanswered
  // replies "the pilot has it" — on every crossing, including the advisory,
  // and for a crew agent that is not the pilot at all. The stop gate reads the
  // deck the same way and for the same reason.
  //
  // The cost is the window: `limit` counts back from the newest across every
  // run on the machine and the deck keeps every item for ever (L14), so a run
  // whose only item is old enough can fall out of it and read as no pilot run.
  // Asking for the most the tool allows is the whole of the mitigation, and
  // silence is the safe side of this question anyway.
  let read;
  try {
    read = await deck.tool('deck_read', { limit: MAX_ITEMS, messages: 'all' });
  } catch (err) {
    return false;
  }

  // An item with no repository on it was posted by a session that never
  // registered, and belongs to no run in particular. The stop gate reads those
  // as everybody's, because showing one reply too many costs a glance; here the
  // same item would promote a stranger to a pilot run, so it counts for nobody.
  const items = Array.isArray(read && read.items) ? read.items : [];
  const ours = items.some(function (item) {
    return item && typeof item.repo === 'string' && deck.samePath(item.repo, repo);
  });
  return ours ? repo : false;
}

/**
 * A11: the pilot learns of this whether or not the agent complies, because the
 * agent most likely to ignore an advisory is the degraded one the guard exists
 * for. Its own claim, so a parallel turn's copies post one item between them.
 *
 * `repo` is the pilot run this session belongs to, or false — the join `run`
 * has already made, because the same answer decides which words the agent is
 * given. A session that is not one is an ordinary Claude session that happens
 * to have this plugin installed, and posting unconditionally would drop an
 * unrelated project's handoff onto the pilot's deck.
 *
 * The pilot's own crossing posts nothing, and that is not a detail of wording.
 * Everything below assumes an agent that reports to somebody — it was told to
 * commit `wip:` and message you, and if nothing arrives it did not comply —
 * and the pilot reports to no one; what the pilot is told instead is to post
 * its *own* `handoff` item, whose body is the index a fresh session resumes
 * from. Two items would be one too many, and the wrong one would be the newer:
 * `deck/run.mjs` types `/clear` on the hand-off item appearing rather than on
 * the hard-mark reading (L34), so an item posted here — at the reading, before the
 * pilot has stashed anything — is a `/clear` over a run that was never saved.
 *
 * Failing open is the whole of the error handling: a deck that is down must
 * cost the agent nothing, and the injection returned beside this still tells it
 * to hand over by hand. The claim is not given back when the post fails,
 * deliberately — the guard has said its piece for this crossing either way, and
 * a claim handed back would only be re-taken by a call that no longer warns.
 * A co-pilot's is: its advisory claim given back is taken again at its hard
 * crossing, which still posts.
 */
async function announce(input, seen, marks, repo) {
  if (!repo) return;
  if (!isSubagent(input)) return;
  // A co-pilot's one item is claimed at the advisory, so its hard crossing finds the claim held.
  const coPilot = isCoPilot(input);
  if (!deck.claim(deckClaimFor(agentKey(input), coPilot ? marks.advisory : marks.hard))) return;

  const who = safeAgentType(input && input.agent_type);
  try {
    if (coPilot) {
      // `post`, not `tool`: the deck's prose answer would read as a failure and release the claim.
      await deck.post(await coPilotItem(seen, repo));
      return;
    }
    await deck.tool('deck_post', {
      // L17: a crew agent's own kind, not the pilot's `handoff` — the pilot's
      // `pickup` (`deck/run.mjs`) and `session-handoff.js` match `handoff`
      // only and are left unchanged, so a crew agent's crossing never types
      // `/clear` and never reaches the next SessionStart's injection.
      kind: 'crew-handoff',
      title: 'Handoff: ' + who + ' is at ' + tokens(seen.used) + ' tokens of its context window',
      body:
        who + ' is at ' + howFull(seen) + ', past the ' + tokens(marks.hard) +
        ' token mark. It was told to commit its work in progress with a `wip:` subject, write a handoff and ' +
        'message you. If nothing arrives from it, it did not comply: read its branch and ' +
        'brief a fresh agent from there.',
      repo: repo,
    });
  } catch (err) {
    /* A11: a deck that is not there is not a reason to fail a tool call */
    if (coPilot) deck.unclaim(deckClaimFor(agentKey(input), marks.advisory));
  }
}

/**
 * This directory's co-pilot's ticket, from `GET /api/record?repo=` (F14): a read that
 * marks nothing delivered. Null on any failure. The ticket is
 * the deck's own id, written by `deck_ticket co-pilot`.
 */
async function coPilotTicketOf(repo) {
  let found;
  try {
    found = await deck.record(repo);
  } catch (err) {
    return null;
  }
  const { coPilot: coPilotKey } = deck.STORED;
  const coPilot = found && found[coPilotKey];
  return (coPilot && coPilot[deck.STORED.field]) || null;
}

/** The `crew-handoff` a pausing co-pilot's successor is briefed with (spec 4, L1). */
async function coPilotItem(seen, repo) {
  const ticket = await coPilotTicketOf(repo);
  const record = ticket
    ? '`GET /api/record?ticket=' + ticket + '&repo=' + encodeURIComponent(repo) + '`'
    : 'unknown: the deck named no co-pilot ticket for this directory';
  return {
    kind: 'crew-handoff',
    title: 'Handoff: pilot-co-pilot on ' + (ticket || 'ticket unknown') + ' paused itself at ' +
      tokens(seen.used) + ' tokens',
    body:
      'Ticket: ' + (ticket || 'ticket unknown') + '.\n' +
      'Reason: self-pause at the advisory (' + howFull(seen) + ').\n' +
      'Record: ' + record + '.\n' +
      "On `paused`, the main session spawns its successor with this item's id. " +
      'Handoff failed: spawn a fresh co-pilot from the plan.',
    repo: repo,
  };
}

/**
 * A5 (yellow-lane spec 16-19): at this many signed gates since the pilot's last
 * hand-off (each gate1 a design, each gate2 a landing), it is told to hand off
 * before the token mark. The deck counts them (`deck/work.mjs`) and serves them
 * as `work` on `GET /api/record`.
 */
const WORK_CEILING = 2;

function workAdvice(work) {
  const plural = function (n, noun) { return n + ' ' + noun + (n === 1 ? '' : 's'); };
  return plural(work.landings, 'landing') + ', ' + plural(work.designs, 'design') +
    ' since the last hand-off: hand off now if idle (pilot handoff)';
}

/**
 * The pilot's work lane, under the token marks: the directory's `work` off
 * `GET /api/record`, a read that marks no reply delivered, said once per
 * crossing — the claim is keyed on the newest hand-off the deck names, so the
 * next hand-off re-arms it. Any failure is silence; this never blocks and never posts.
 *
 * The cost, taken knowingly: every non-crew session under the marks pays one
 * local record read per tool call, a few hundred bytes of counts bounded by the
 * client's 1,500 ms timeout, and a plain session in a pilot's own directory
 * would hear the advice too.
 */
async function workLane(input, key) {
  const cwd = input && input.cwd;
  if (typeof cwd !== 'string' || cwd === '') return null;
  let answer;
  try {
    answer = await deck.record(mainRepoOf(cwd) || cwd);
  } catch (err) {
    return null; // no deck, nothing to count
  }
  const work = answer && answer.work;
  // Whole numbers only: the counts are written into the pilot's context.
  if (!work || !Number.isSafeInteger(work.landings) || !Number.isSafeInteger(work.designs)) return null;
  if (work.landings + work.designs < WORK_CEILING) return null;

  const name = key + '-work-' + deck.sessionKey(work.since || 'none');
  if (!deck.claim(name)) return null;
  const said = workAdvice(work);
  return {
    systemMessage: '⚠ ' + said + '.',
    additionalContext: 'SYSTEM NOTICE: ' + said + '. Bring the status table current with one ' +
      '`deck_status` call first. This is advice and never a block. Said once.',
    rollback: function () { deck.unclaim(name); },
  };
}

/** The lane, as `post-tool.js` calls it: the hook payload in, something or null out. */
async function run(input) {
  if (!input) return null;

  const seen = reading(input);
  if (!seen) return null;
  const key = agentKey(input);
  const marks = marksFor(seen.size);

  if (seen.used < marks.rearm) {
    // A14. Compacted, or a fresh agent on a reused id: arm it again and say
    // nothing, because being under the advisory is not news.
    deck.unclaim(claimFor(key, marks.advisory));
    deck.unclaim(claimFor(key, marks.hard));
  }

  const threshold = seen.used >= marks.hard ? marks.hard : (seen.used >= marks.advisory ? marks.advisory : 0);
  if (threshold === 0) return isSubagent(input) ? null : workLane(input, key);

  // Claim the advisory alongside the hard one, so an agent that crosses both
  // between two tool calls cannot be handed the milder text afterwards as a
  // trailer for a crossing it has already been told about. Slice 9's idiom.
  const names = threshold === marks.hard
    ? [claimFor(key, marks.advisory), claimFor(key, marks.hard)]
    : [claimFor(key, marks.advisory)];
  const won = names.map(function (name) { return deck.claim(name); });
  if (!won[won.length - 1]) return null; // another copy of this hook is saying it
  const claimed = names.filter(function (name, i) { return won[i]; });

  deck.sweep();
  // One lookup, two uses: whether there is a run here decides both whether the
  // pilot is told and which words the agent is told in. It is asked only on a
  // crossing, which a claim has just made at most once per agent per threshold.
  const onDeck = await pilotRunFor(input && input.cwd);
  if (threshold === marks.hard || isCoPilot(input)) await announce(input, seen, marks, onDeck);

  const said = advice(input, seen, marks, threshold, onDeck);
  return {
    systemMessage: said.systemMessage,
    additionalContext: said.additionalContext,
    // The claim is taken before the harness has the bytes, so give it back if
    // the write never landed: an agent warned twice is a nuisance, and an agent
    // that was never warned is the thing this exists to prevent.
    rollback: function () { claimed.forEach(deck.unclaim); },
  };
}

// --- the display -----------------------------------------------------------

/**
 * The bands slice 9's status line already uses, now the same flat marks
 * `run()` warns at (`marksFor`, scaled the same way for a small window).
 */
function colourFor(used, size) {
  const marks = marksFor(size);
  if (used >= marks.hard) return '\x1b[1;31m'; // bold red
  if (used >= marks.advisory) return '\x1b[33m'; // yellow
  return '\x1b[32m'; // green
}

const MAX_DESCRIPTION_CHARS = 40;

/** The most stdin a status line refresh will be held in memory. */
const MAX_STATUS_INPUT_CHARS = 1024 * 1024;

function clip(text, limit) {
  const value = typeof text === 'string' ? text : '';
  return value.length <= limit ? value : value.slice(0, limit - 1) + '…';
}

/**
 * How big that row's window is.
 *
 * `contextWindowSize` is the harness's own answer and is preferred whenever it
 * sends one. It does not always: the field is absent until the ticket's model is
 * resolved, and the user's A13 check on 2026-09-15 found a running Haiku
 * subagent rendering as Claude Code's default row — `↓ 92.7k tokens`, so the
 * token count was known — while this file, which required the window and took
 * its absence as "say nothing", produced no row at all.
 *
 * A row that names its model does not need the harness to size it, because
 * sizing a model is what this slice's table is for. Still never a guess: a
 * model the table has never heard of leaves the row to its default rendering,
 * the same rule the lane follows.
 */
function windowOf(ticket) {
  const sent = ticket.contextWindowSize;
  if (typeof sent === 'number' && sent > 0) return sent;
  return windowFor(resolveAlias(ticket.model));
}

/**
 * A13. One row per subagent, `tokenCount` against that row's own window. A row
 * whose window cannot be established at all is left alone rather than rendered
 * as zero: the harness's default rendering is the right thing meanwhile.
 */
function statusRows(payload) {
  const tickets = payload && Array.isArray(payload.tickets) ? payload.tickets : [];
  const rows = [];

  for (const ticket of tickets) {
    if (!ticket || typeof ticket.id !== 'string' || ticket.id === '') continue;
    const size = windowOf(ticket);
    const used = ticket.tokenCount;
    if (typeof size !== 'number' || !(size > 0)) continue;
    if (typeof used !== 'number' || !(used >= 0)) continue;

    const pct = (used / size) * 100;
    const parts = [clip(ticket.name, MAX_DESCRIPTION_CHARS)];
    if (ticket.description) parts.push(clip(ticket.description, MAX_DESCRIPTION_CHARS));
    parts.push(
      colourFor(used, size) + tokens(used) + '/' + tokens(size) + ' ' + ROUND(pct) + '%' + '\x1b[0m'
    );
    rows.push({ id: ticket.id, content: parts.join(' · ') });
  }

  return rows;
}

/**
 * Executed, this file is the status line and nothing else — the lane is reached
 * by `require` from `post-tool.js`, which is the one PostToolUse process (A1).
 * The flag is in `settings.json` so that reading the setting tells you which of
 * the two this file is being asked to be, and so that wiring it up as a hook by
 * mistake is quiet rather than wrong.
 */
function main() {
  if (!process.argv.includes('--subagent-status-line')) return;

  let raw = '';
  let done = false;

  function finish() {
    if (done) return;
    done = true;

    let payload = null;
    try {
      // The leading byte-order mark is Windows PowerShell's, not the harness's,
      // and JSON.parse throws on it — the same guard slice 9's status line has.
      payload = JSON.parse(raw.replace(/^﻿/, ''));
    } catch (err) {
      return; // no rows means every row keeps its default rendering
    }

    let lines = [];
    try {
      lines = statusRows(payload).map(function (row) { return JSON.stringify(row); });
    } catch (err) {
      return;
    }
    if (lines.length === 0) return;
    try { process.stdout.write(lines.join('\n')); } catch (err) { /* EPIPE */ }
  }

  process.stdout.on('error', function () { /* the harness stopped reading */ });
  process.stdin.on('error', finish);
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', function (chunk) {
    // Bounded for the same reason `lib/deck.js` bounds a response and
    // `transcript-tail.js` bounds a read: this runs on every refresh tick, and
    // a payload larger than a status line could ever need is not one to hold in
    // memory. Past the ceiling every row keeps its default rendering.
    if (raw.length > MAX_STATUS_INPUT_CHARS) return;
    raw += chunk;
  });
  process.stdin.on('end', finish);
}

/**
 * `run` is the lane `post-tool.js` calls; the rest are what the slice's tests
 * reach for by name. Nothing is exported for the sake of being exported: an
 * export is a promise to a caller, and a promise nobody asked for is a hostage
 * to fortune when the thing behind it wants to change.
 */
module.exports = {
  CO_PILOT_TYPE: CO_PILOT_TYPE,
  PILOT_REFERENCE_WINDOW: PILOT_REFERENCE_WINDOW,
  mainRepoOf: mainRepoOf,
  marksFor: marksFor,
  ownTranscript: ownTranscript,
  pastAdvisoryAt: pastAdvisoryAt,
  safeAgentType: safeAgentType,
  run: run,
  statusRows: statusRows,
  WORK_CEILING: WORK_CEILING,
  workAdvice: workAdvice,
};

if (require.main === module) main();
