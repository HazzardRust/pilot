/**
 * The deck starts a run's mid-run prune (prune-worktrees spec 2, 4; A4). `deck_status` with `finished`
 * `planned` (Gate 1 signed) or `abandoned…` spawns `node <bin/pilot.mjs> worktrees prune --run <slug> --stage
 * <stage>` in the run's repository, detached, with the landing's spawn options and its `watch`, as
 * `startPrWrite` does; the MCP request runs no git itself. Nothing from the request reaches argv but a slug
 * checked to be one and a stage from a fixed list; the repository reaches the child as `cwd` alone. The
 * child's lines, removed and kept, become one note on the ticket.
 */

import { spawn as spawnChild } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { killTree } from '../hooks/lib/platform.js';
import { landingSpawnOptions, watch } from './landing.mjs';
import { findCredential } from './store.mjs';
import { noteDeck } from './store-items.mjs';

const PILOT_BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'pilot.mjs');

/** A ticket id as the store mints one, and a run slug as `--run` takes it: anything else never reaches argv. */
const TICKET = /^itm_[0-9a-f]+$/;
const SLUG = /^\w[\w.-]*$/;
const STAGES = ['planned', 'abandoned'];

/** How long a prune may run before its tree is killed: a 13 GB tree takes minutes to delete. */
const RUN_PRUNE_TIMEOUT_MS = 15 * 60_000;

/** The most of the child's output a note keeps. */
const MAX_NOTE_CHARS = 1500;

/** The prune stage a `finished` value starts, or null: Gate 1 signed, or the run abandoned. */
export function pruneStageOf(finished) {
  if (finished === 'planned') return 'planned';
  if (typeof finished === 'string' && /^abandoned\b/.test(finished)) return 'abandoned';
  return null;
}

/**
 * Start `pilot worktrees prune --run <slug> --stage <stage>` in `repo` and note its outcome on `ticket`.
 * Never throws. `spawn`, `env`, `clock` and `note` are seams for the tests; `PILOT_DECK_NO_LAND` stops it.
 */
export function startRunPrune(ticket, repo, slug, stage, deps = {}) {
  const { spawn = spawnChild, env = process.env, clock = { setTimeout, clearTimeout }, note = noteDeck } = deps;
  if (env.PILOT_DECK_NO_LAND) return;
  if (typeof ticket !== 'string' || !TICKET.test(ticket) || typeof repo !== 'string' || !path.isAbsolute(repo)) return;
  if (typeof slug !== 'string' || !SLUG.test(slug) || !STAGES.includes(stage)) return;

  const say = (text) => {
    try {
      note(ticket, text);
    } catch (err) {
      console.error('[deck] a run prune note failed:', err?.message ?? err);
    }
  };
  const head = `worktrees after ${stage}`;
  const settle = (text) => {
    const credential = findCredential(text);
    say(credential ? `${head}: output withheld, it looks like ${credential}` : `${head}: ${text.slice(-MAX_NOTE_CHARS)}`);
  };

  try {
    const child = spawn(process.execPath, [PILOT_BIN, 'worktrees', 'prune', '--run', slug, '--stage', stage],
      { ...landingSpawnOptions(repo, env), windowsHide: true });
    watch(child, {
      clock,
      kill: (held) => killTree(held.pid, { group: true }),
      timeoutMs: RUN_PRUNE_TIMEOUT_MS,
      done: ({ code, stdout, stderr, error, timedOut }) => {
        if (error) return settle(`pilot worktrees could not start (${error.message})`);
        if (timedOut) return settle(`pilot worktrees timed out after ${RUN_PRUNE_TIMEOUT_MS / 60_000} min`);
        const lines = [stdout, stderr].map((text) => (text ?? '').trim()).filter(Boolean).join('\n');
        settle(lines.split(/\r?\n/).join('; ') || `pilot worktrees exited ${code ?? 'killed'} and printed nothing`);
      },
    });
  } catch (err) {
    settle(`pilot worktrees could not start (${err?.message ?? err})`);
  }
}
