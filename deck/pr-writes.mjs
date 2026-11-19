/**
 * The deck writes the feature PR (deck-writes-github spec 2, 7; L1, L4, L5). The daemon still runs no
 * `gh`: a trigger spawns `node <bin/pilot.mjs> pr --ticket <id>` in the repository, with the landing's
 * spawn options and its `watch`, and the verb does the write. Nothing from a request reaches argv but
 * the ticket id, checked to be one; the repository reaches the child as `cwd` alone.
 *
 * Triggers coalesce per ticket (L4): one child in flight, at most one rerun queued. A write that fails
 * is one line on the ticket's thread, the same line once, its credential withheld; the next trigger
 * retries, and nothing blocks or waits on the user (spec 7).
 */

import { spawn as spawnChild } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { killTree } from '../hooks/lib/platform.js';
import { landingSpawnOptions, watch } from './landing.mjs';
import { findCredential } from './store.mjs';
import { noteDeck } from './store-items.mjs';

const PILOT_BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'pilot.mjs');

/** A ticket id as the store mints one: anything else never reaches argv. */
const TICKET = /^itm_[0-9a-f]+$/;

/** How long a `pilot pr` may run before its tree is killed and the write reads timed out. */
const PR_WRITE_TIMEOUT_MS = 5 * 60_000;

/** The most of the verb's line a note keeps. */
const MAX_LINE_CHARS = 500;

/** Per ticket while its child is live: `{ queued }`, the one rerun waiting behind it, or null. */
const writes = new Map();
/** Per ticket: the last failure line noted, so the same failure is said once; a success clears it. */
const lastFailure = new Map();

/** The verb's one line, or, when it carries a credential, the step that printed it and what it looked like. */
function lineOf(code, stdout, stderr) {
  const held = stdout.trim() || stderr.trim();
  if (held === '') return `pilot pr exited ${code ?? 'killed'} and printed nothing`;
  const credential = findCredential(held);
  if (credential) {
    const step = /^([a-z][a-z -]{0,40}):/i.exec(held)?.[1] ?? 'pilot pr';
    return `${step}: output withheld, it looks like ${credential}`;
  }
  return held.split('\n').at(-1).trim().slice(-MAX_LINE_CHARS);
}

/**
 * Start a `pilot pr` for `ticketId` in `repo`, or queue one rerun behind the child in flight. Never throws.
 * `spawn`, `env`, `clock` and `note` are seams for the tests; `PILOT_DECK_NO_LAND` stops it (L5).
 */
export function startPrWrite(ticketId, repo, deps = {}) {
  const { spawn = spawnChild, env = process.env, clock = { setTimeout, clearTimeout }, note = noteDeck } = deps;
  if (env.PILOT_DECK_NO_LAND) return;
  if (typeof ticketId !== 'string' || !TICKET.test(ticketId) || typeof repo !== 'string' || !path.isAbsolute(repo)) return;
  const live = writes.get(ticketId);
  if (live) {
    live.queued = { repo, deps };
    return;
  }
  const state = { queued: null };
  writes.set(ticketId, state);

  const say = (text) => {
    try {
      note(ticketId, text);
    } catch (err) {
      console.error('[deck] a feature PR note failed:', err?.message ?? err);
    }
  };
  const settle = ({ ok, line }) => {
    if (ok) {
      lastFailure.delete(ticketId);
      if (/^feature PR #\d+ opened$/.test(line)) say(line);
    } else if (lastFailure.get(ticketId) !== line) {
      lastFailure.set(ticketId, line);
      say(`feature PR not updated: ${line}`);
    }
    writes.delete(ticketId);
    if (state.queued) startPrWrite(ticketId, state.queued.repo, state.queued.deps);
  };

  // The options, the spawn and the watch in one try: a throw in any of them settles, so the ticket is never left in flight.
  try {
    const child = spawn(process.execPath, [PILOT_BIN, 'pr', '--ticket', ticketId], { ...landingSpawnOptions(repo, env), windowsHide: true });
    watch(child, {
      clock,
      kill: (held) => killTree(held.pid, { group: true }),
      timeoutMs: PR_WRITE_TIMEOUT_MS,
      done: ({ code, stdout, stderr, error, timedOut }) => {
        if (error) settle({ ok: false, line: `pilot pr could not start (${error.message})` });
        else if (timedOut) settle({ ok: false, line: `pilot pr timed out after ${PR_WRITE_TIMEOUT_MS / 60_000} min` });
        else settle({ ok: code === 0, line: lineOf(code, stdout, stderr) });
      },
    });
  } catch (err) {
    settle({ ok: false, line: `pilot pr could not start (${err?.message ?? err})` });
  }
}
