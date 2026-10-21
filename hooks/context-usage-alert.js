#!/usr/bin/env node
/**
 * Slice 9's plan-usage alert. PostToolUse and SessionStart both reach it: on
 * PostToolUse it is one of `post-tool.js`'s lanes, named there and called
 * through the shim that file defines; on SessionStart it is registered
 * directly in `hooks.json`, since it is the only lane that event has so far.
 * Warns once when the rolling five-hour session window passes 90%, and again
 * at 95%, so the agent can wrap up and commit instead of being cut off
 * mid-ticket. The seven-day weekly window warns at 95% only, and not at all
 * while the deck's Weekly alerts switch is off (ADR 0098).
 *
 * It says nothing about the context window: filling that means "compact",
 * which the harness already does on its own — slice 12's guard covers an
 * agent filling its own context, which is a different thing.
 *
 * No hook payload carries usage figures, so this reads the snapshot that
 * `context-usage-statusline.js` writes from the status line, which does see
 * them. That snapshot and the claim files below both live under the home
 * directory rather than anything scoped to one session, so the state a
 * crossing needs is already there for whichever process next asks — the gap
 * this hook actually has to close is the trigger, not the storage: a resumed
 * session still carries an earlier warning in its own transcript, but a
 * genuinely fresh session has no memory of one and, wired to PostToolUse
 * alone, would stay blind to an already-crossed limit until after its first
 * tool call. Running the same check on SessionStart as well closes that gap:
 * whichever event gets there first claims the crossing for that session, so
 * it is announced exactly once either way.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const STATE_PATH = path.join(os.homedir(), '.claude', 'context-usage-state.json');
const CLAIM_DIR = path.join(os.homedir(), '.claude', 'context-usage-claims');

const TRACKS = [
  { name: 'session', label: 'Session usage (5h)' },
  { name: 'weekly', label: 'Weekly usage' },
];

function band(pct, track) {
  if (typeof pct !== 'number') return 0;
  if (pct >= 95) return 95;
  if (pct >= 90 && track !== 'weekly') return 90;
  return 0;
}

// The deck's Weekly alerts switch, `<deck store>/alerts.json`, found by the
// statusline's path rule: PILOT_DECK_DIR, else ~/.claude/pilot, resolved per
// call. A file and not the deck's HTTP API, so it holds while the deck is down.
// Only an explicit `weekly: false` is off; absent or unreadable is on.
function weeklyAlertsOn() {
  const dir = process.env.PILOT_DECK_DIR || path.join(os.homedir(), '.claude', 'pilot');
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, 'alerts.json'), 'utf8'));
    return !(parsed && parsed.weekly === false);
  } catch (err) {
    return true;
  }
}

// resets_at doubles as the window's identity: when the window rolls over the
// timestamp changes, so the next crossing gets fresh claim files and warns
// again. That saves keeping a re-arm counter in sync across two processes.
//
// The session id is in the name because a plan limit is account-wide while the
// warning is per-agent. Several Claude Code instances often run at once, all
// spending the same budget; keying the claim on the window alone let the first
// instance to run a tool take it, and the others carried on unaware of a limit
// they were also burning. Keyed per session, each one is told exactly once.
// A missing id falls back to a shared key, which is the old account-wide
// behaviour — warning too rarely is better than the alternative it guards
// against, which is a fresh id per process and so a warning after every call.
//
// A session is not one agent, though: the orchestration rules routinely run
// several subagents at once under the same top-level session_id (up to twelve
// in flight). Each subagent's tool call carries its own agent_id alongside
// that shared session_id (the main thread has none). Keying on session_id
// alone let whichever agent's tool call landed first take the claim, and
// every sibling running in parallel under that same session went quiet for
// the rest of its own life — the same bug this whole scheme was built to
// prevent, just one level down. Folding agent_id into the key when present
// gives the main thread and every concurrent subagent its own claim, so each
// is warned once independently.
function sessionKey(sessionId, agentId) {
  const safeSession = typeof sessionId === 'string'
    ? sessionId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64)
    : '';
  const safeAgent = typeof agentId === 'string'
    ? agentId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64)
    : '';
  const key = safeAgent ? safeSession + '~' + safeAgent : safeSession;
  return key || 'x';
}

function claimName(sessionId, agentId, track, limit, threshold) {
  return sessionKey(sessionId, agentId) + '-' + track + '-' +
    (limit.resetsAt === null ? 'x' : limit.resetsAt) + '-' + threshold;
}

// The hook has no matcher, so a turn with parallel tool calls spawns several
// copies at once. An exclusive create is atomic across processes, so exactly
// one of them wins and the rest stay quiet. The file's existence is the record;
// nothing deletes it on the happy path, so there is no lock to be left held.
function claim(name) {
  try {
    fs.mkdirSync(CLAIM_DIR, { recursive: true });
    fs.closeSync(fs.openSync(path.join(CLAIM_DIR, name + '.claim'), 'wx'));
    return true;
  } catch (err) {
    // EEXIST means someone else is announcing it. Anything else (unwritable
    // home, disk full) errs toward warning the user twice rather than never.
    return !err || err.code !== 'EEXIST';
  }
}

function unclaim(name) {
  try { fs.unlinkSync(path.join(CLAIM_DIR, name + '.claim')); } catch (err) { /* fine */ }
}

// Claims outlive their window, so drop anything older than the longest one.
function sweep() {
  const cutoff = Date.now() - 8 * 24 * 60 * 60 * 1000;
  try {
    for (const file of fs.readdirSync(CLAIM_DIR)) {
      const full = path.join(CLAIM_DIR, file);
      try {
        if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
      } catch (err) { /* next sweep */ }
    }
  } catch (err) { /* nothing to sweep */ }
}

function formatReset(resetsAt) {
  if (typeof resetsAt !== 'number') return '';
  const when = new Date(resetsAt * 1000);
  if (isNaN(when.getTime())) return '';
  const hhmm = String(when.getHours()).padStart(2, '0') + ':' +
    String(when.getMinutes()).padStart(2, '0');
  // The weekly window often resets days out, where a bare time would read as
  // today; within a day the clock time alone is clearer.
  if (resetsAt * 1000 - Date.now() < 24 * 60 * 60 * 1000) return ', resets ' + hhmm;
  return ', resets ' + ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][when.getDay()] + ' ' + hhmm;
}

function run(sessionId, agentId, hookEventName) {
  let state;
  try {
    state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch (err) {
    return null;
  }

  const claimed = [];
  const parts = [];
  let highest = 0;
  const weeklyOn = weeklyAlertsOn();

  for (const track of TRACKS) {
    if (track.name === 'weekly' && !weeklyOn) continue;
    const limit = state && state[track.name];
    if (!limit || typeof limit.pct !== 'number') continue;
    const threshold = band(limit.pct, track.name);
    if (threshold === 0) continue;

    // Claim 90 alongside 95 so the lower warning can't arrive afterwards as a
    // trailer for the same crossing.
    const names = threshold === 95
      ? [claimName(sessionId, agentId, track.name, limit, 90), claimName(sessionId, agentId, track.name, limit, 95)]
      : [claimName(sessionId, agentId, track.name, limit, 90)];
    const won = names.map(claim);
    if (!won[won.length - 1]) continue; // someone else is announcing this one

    names.forEach(function (n, i) { if (won[i]) claimed.push(n); });
    parts.push(
      track.label + ' is at ' + limit.pct.toFixed(0) + '%' + formatReset(limit.resetsAt)
    );
    if (threshold > highest) highest = threshold;
  }

  if (parts.length === 0) return null;

  const joined = parts.join('; ');
  const advice = highest === 95
    ? 'Wrap up now: finish and commit the current step, start nothing new, and tell the user which limit is nearly spent.'
    : 'Start wrapping up — commit work in progress and avoid launching expensive new work.';

  return {
    claimed: claimed,
    payload: {
      systemMessage: '⚠ ' + joined + '.',
      hookSpecificOutput: {
        // Echoing back whichever event actually triggered this run — the
        // harness accepts either name here, and getting it wrong on a
        // SessionStart call is the kind of mismatch that only shows up once
        // some future harness version starts validating it.
        hookEventName: hookEventName === 'SessionStart' ? 'SessionStart' : 'PostToolUse',
        additionalContext: 'SYSTEM NOTICE: ' + joined + '. ' + advice,
      },
    },
  };
}

function main() {
  let emitted = false;
  let raw = '';

  function emit() {
    if (emitted) return;
    emitted = true;

    // Both PostToolUse and SessionStart payloads carry session_id and
    // hook_event_name, and agent_id when the call came from a subagent
    // rather than the main thread; together the first two key the claim.
    // SessionStart also carries a `source` (startup/resume/clear/compact/
    // fork), but it does not reliably tell a genuinely new conversation
    // apart from one being resumed, so it is not read here — every source
    // gets the same check, and the claim file is what actually decides
    // whether this particular session has already been told about this
    // particular crossing. A payload that is truncated or unparseable
    // leaves everything undefined, and sessionKey() falls back to the
    // shared account-wide key rather than letting a parse failure turn
    // into silence.
    let sessionId;
    let agentId;
    let hookEventName;
    try {
      const parsed = JSON.parse(raw);
      sessionId = parsed.session_id;
      agentId = parsed.agent_id;
      hookEventName = parsed.hook_event_name;
    } catch (err) {
      sessionId = undefined;
      agentId = undefined;
      hookEventName = undefined;
    }

    let result = null;
    try {
      result = run(sessionId, agentId, hookEventName);
    } catch (err) {
      return; // never block a tool call over this
    }
    if (!result) return;

    try {
      process.stdout.write(JSON.stringify(result.payload), function (err) {
        // The claim is taken before the write, so give it back if the message
        // never landed — better to repeat a warning than to lose one.
        if (err) result.claimed.forEach(unclaim);
        else sweep();
      });
    } catch (err) {
      result.claimed.forEach(unclaim); // EPIPE: harness stopped reading
    }
  }

  // Without these listeners a broken pipe is rethrown as an uncaught exception,
  // and this hook runs after every single tool call.
  process.stdout.on('error', function () { /* handled by the write callback */ });
  process.stdin.on('error', emit);
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', function (c) { raw += c; });
  process.stdin.on('end', emit);
}

module.exports = { run, band, formatReset, claim, unclaim, sessionKey, TRACKS, STATE_PATH, CLAIM_DIR };

if (require.main === module) main();
