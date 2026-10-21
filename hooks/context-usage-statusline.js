#!/usr/bin/env node
/**
 * StatusLine command. The status line is the only Claude Code surface that
 * receives live usage figures on stdin — no hook event payload carries them —
 * so this renders them and drops a snapshot in a file for the alert hook.
 *
 *   context_window          displayed only; running out means "compact",
 *                           which the harness already handles itself
 *   rate_limits.five_hour   the session limit, displayed and alerted on
 *   rate_limits.seven_day   the weekly limit, displayed and alerted on
 *
 * Payload shape, per the Claude Code binary:
 *   rate_limits: { five_hour|seven_day: { used_percentage, resets_at } }
 * where resets_at is unix epoch SECONDS. The block is missing entirely on some
 * auth modes and before the first API response, so a missing limit means
 * "unknown" and the previous reading is kept rather than overwritten with zero.
 *
 * It also renders which deck this directory is, as the number D1, D2… the store
 * minted for it (spec 10), read out of the deck's own snapshot
 * (~/.claude/pilot/deck.json), never a second state file. It draws no count of
 * waiting items (L10): the deck's own surfaces say that.
 *
 * This file has to keep working as a bare "node <path>" with no package around
 * it, because that is how statusLine in settings.json launches it. So it stays
 * dependency-free CommonJS and re-derives the deck's path instead of importing
 * the ESM store that owns it.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { atomicWriteFileSync } = require('./lib/atomic-write.js');
// The hooks' one spelling of "the same directory".
const { repoKey } = require('./lib/deck.js');

const STATE_PATH = path.join(os.homedir(), '.claude', 'context-usage-state.json');

const DECK_FILENAME = 'deck.json';

// The same two rules deck/store.mjs applies: the deck lives under ~/.claude/pilot,
// and PILOT_DECK_DIR overrides it, which is how the tests isolate. Resolved per
// call rather than at load, so setting the variable later still takes effect.
function deckFile() {
  const dir = process.env.PILOT_DECK_DIR || path.join(os.homedir(), '.claude', 'pilot');
  return path.join(dir, DECK_FILENAME);
}

// The deck's snapshot, or null for anything unexpected: a friend who has never
// opened the deck, a file caught mid-write, a future shape this build does not
// know. None of those is worth breaking the status line over. Read once and
// asked both of the deck's questions, so the two answers are one deck's.
function readDeck(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return null;
  }
}

// The number the deck minted for this directory, or null — which is the ordinary
// answer for a deck that has not registered since numbering arrived, because a
// number is minted lazily (A5). Null rather than a placeholder: the status line
// says what it knows, and "D?" would be a name for something it does not.
function deckNumberFor(deck, dir) {
  const decks = deck && deck.decks;
  if (!decks || typeof decks !== 'object') return null;
  const number = decks[repoKey(dir)];
  return Number.isInteger(number) && number > 0 ? number : null;
}

function computePercentage(data) {
  const cw = data && data.context_window;
  if (!cw) return null;
  if (typeof cw.used_percentage === 'number') return cw.used_percentage;
  if (
    typeof cw.total_input_tokens === 'number' &&
    typeof cw.context_window_size === 'number' &&
    cw.context_window_size > 0
  ) {
    return (cw.total_input_tokens / cw.context_window_size) * 100;
  }
  return null;
}

function readLimit(block) {
  if (!block || typeof block.used_percentage !== 'number') return null;
  return {
    pct: block.used_percentage,
    resetsAt: typeof block.resets_at === 'number' ? block.resets_at : null,
  };
}

function readLimits(data) {
  const rl = (data && data.rate_limits) || {};
  return { session: readLimit(rl.five_hour), weekly: readLimit(rl.seven_day) };
}

// How long a directory's reading stays in the map (A11). Long enough that a
// session parked over a lunch or a meeting still shows its figure, short enough
// that yesterday's run does not. `deck/usage.mjs` hides an entry older than this
// and declares the same twelve hours for the reason it re-declares the path;
// this comment is the join, so change one and change the other.
const DECK_WINDOW_MS = 12 * 60 * 60 * 1000;

// Every session's last reading, under its own working directory (spec 31, L31).
//
// The top-level `ctx` below is whichever status line refreshed last, which is
// what put one deck's percentage on every deck's tab. This map is keyed the way
// the deck keys a directory, so a page can ask for the reading of the deck it is
// showing and get nothing — never a neighbour's number — when that session has
// not reported.
//
// Bounded rather than kept: this file is rewritten on every turn of every
// session on the machine, and what it holds here is liveness. The deck's own
// `decks` map is no precedent — a deck number is never reused, so that map may
// never lose an entry, and this one holds nothing but a figure that expires.
// A refresh with no reading of its own leaves the directory's last one where it
// is, exactly as the top-level `ctx` is left.
// `sessionId` is recorded on the entry this call writes, never on one it only
// keeps: it is who is speaking *now*, not a fact about an entry from a turn
// ago. The context-size guard is why — two sessions can work the same
// directory one after another (a hand-off, then `/clear`), and a directory
// alone cannot tell them apart. Without the writer on the entry, a fresh
// session's first read of the map finds the directory's last figure and has
// no way to know it was never this session's own.
function decksWith(previous, ctx, dir, sessionId) {
  const was = (previous && typeof previous === 'object') ? previous : {};
  const now = Date.now();
  const kept = {};
  Object.keys(was).forEach(function (key) {
    const entry = was[key];
    const at = entry ? Date.parse(entry.at) : NaN;
    if (Number.isFinite(at) && now - at <= DECK_WINDOW_MS) kept[key] = entry;
  });
  if (typeof ctx === 'number' && typeof dir === 'string' && dir.trim() !== '') {
    kept[repoKey(dir)] = {
      ctx: ctx,
      at: new Date(now).toISOString(),
      session_id: typeof sessionId === 'string' && sessionId !== '' ? sessionId : null,
    };
  }
  return kept;
}

// A plain snapshot — no history, no thresholds. The alert hook derives
// everything it needs from this, so there is no shared state to keep in sync.
//
// `session_id` is the writer, not a reading: every session on this machine
// writes this one file, and several of them run at once. The context-size guard
// reads `ctx` back as the main session's own reading, so without a name beside
// it that figure can be another instance's. Never inherited from the previous
// snapshot — a refresh that carried no id is an unidentified writer, and saying
// so is what lets a reader refuse it.
//
// `decks` is added beside those four and never instead of them: the guard reads
// the top level and belongs to another slice, so an older reader of this file
// goes on reading exactly what it always read (L31).
function buildState(prev, ctx, limits, sessionId, dir) {
  const old = (prev && typeof prev === 'object') ? prev : {};
  return {
    ctx: typeof ctx === 'number' ? ctx : (old.ctx ?? null),
    session: limits.session || old.session || null,
    weekly: limits.weekly || old.weekly || null,
    session_id: typeof sessionId === 'string' && sessionId !== '' ? sessionId : null,
    decks: decksWith(old.decks, ctx, dir, sessionId),
  };
}

// Write-then-rename: the alert hook reads this after every tool call and would
// otherwise be able to catch a half-written file.
function writeState(state) {
  try {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    atomicWriteFileSync(STATE_PATH, JSON.stringify(state));
  } catch (err) {
    // Best effort. A failed write just means no alert until the next refresh.
  }
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch (err) {
    return {};
  }
}

// The \x1b is load-bearing: without the ESC byte these are not escape sequences
// at all, and the line renders as "claude repo | [1;31mctx 92%[0m".
function colorFor(pct) {
  if (pct >= 95) return '\x1b[1;41m'; // bold, red background
  if (pct >= 90) return '\x1b[1;31m'; // bold red
  if (pct >= 80) return '\x1b[33m'; // yellow
  return '\x1b[32m'; // green
}

function segment(label, pct) {
  return colorFor(pct) + label + ' ' + pct.toFixed(0) + '%' + '\x1b[0m';
}

// Bold cyan, the one colour on this line that is not a band.
const DECK_COLOR = '\x1b[1;36m';

// The deck this directory is, in the notation the whole deck uses for it.
function deckNumberSegment(number) {
  return DECK_COLOR + 'D' + number + '\x1b[0m';
}

// Which directory this session is in — the launch directory the harness sends
// as workspace.project_dir, which is the same directory the deck MCP client
// registers via its own process.cwd() at startup (L13, deck/client.mjs:153),
// falling back to current_dir for a payload that carries no project_dir, and
// to this process's cwd when there is no workspace block at all. Keyed on the
// launch directory rather than current_dir because a session that cd's keeps
// sending the same project_dir beside a current_dir that has moved on, and
// current_dir is not the directory the deck minted a number for.
//
// The label at the front of the line and the deck this directory is are one
// subject, so they are both this one directory.
function workspaceDir(data) {
  const ws = data && data.workspace;
  return (ws && ws.project_dir) || (ws && ws.current_dir) || process.cwd();
}

function buildLine(data, ctx, limits, deckNumber) {
  const model = (data && data.model && (data.model.display_name || data.model.id)) || 'claude';
  const parts = [model + ' ' + path.basename(workspaceDir(data))];
  const l = limits || {};

  // A segment whose reading is unknown is left out rather than shown as 0%.
  if (typeof ctx === 'number') parts.push(segment('ctx', ctx));
  if (l.session) parts.push(segment('ses', l.session.pct));
  if (l.weekly) parts.push(segment('wk', l.weekly.pct));
  if (typeof deckNumber === 'number') parts.push(deckNumberSegment(deckNumber));

  return parts.join(' | ');
}

function main() {
  let raw = '';
  let emitted = false;
  process.stdin.setEncoding('utf8');
  // Without these listeners a broken pipe is rethrown and the status line
  // silently stops rendering.
  process.stdout.on('error', function () { /* harness stopped reading */ });
  process.stdin.on('error', function () { finish(); });
  process.stdin.on('data', function (c) { raw += c; });
  process.stdin.on('end', finish);

  function finish() {
    if (emitted) return;
    emitted = true;

    // The leading byte-order mark is stripped because Windows PowerShell puts
    // one in front of anything it pipes to a native process and JSON.parse
    // throws on it. The harness writes the payload itself and never adds one,
    // but a render by hand goes through a shell, and losing every reading to an
    // invisible character looks exactly like a status line that does not work.
    let data = {};
    try { data = JSON.parse(raw.replace(/^\uFEFF/, '')); } catch (err) { data = {}; }

    let ctx = null;
    let limits = { session: null, weekly: null };
    try {
      ctx = computePercentage(data);
      limits = readLimits(data);
    } catch (err) { /* leave both unknown */ }

    try {
      writeState(
        buildState(readState(), ctx, limits, data && data.session_id, workspaceDir(data))
      );
    } catch (err) {
      // Never let state bookkeeping break the status line itself.
    }

    // Read after the state write, so a deck file that is slow or momentarily
    // locked cannot delay the snapshot the alert hook depends on.
    let deckNumber = null;
    try {
      const deck = readDeck(deckFile());
      const dir = workspaceDir(data);
      deckNumber = deckNumberFor(deck, dir);
    } catch (err) { /* no deck to name */ }

    let line = 'claude';
    try { line = buildLine(data, ctx, limits, deckNumber); } catch (err) { /* keep fallback */ }
    try { process.stdout.write(line); } catch (err) { /* EPIPE */ }
  }
}

module.exports = {
  computePercentage, readLimits, buildState, buildLine,
  deckFile, readDeck, deckNumberFor,
  STATE_PATH,
};

if (require.main === module) main();
