#!/usr/bin/env node
/**
 * How big each model's context window is.
 *
 * `context-size-guard.js` warns at flat token counts, the same for every
 * agent (2026-09-28) — but a window small enough that those flat counts would
 * leave no room to act on them gets its marks scaled down, and this table is
 * what "small" is measured against. A model absent from it is never a reason
 * to guess: the guard falls back to the flat marks unscaled, on the working
 * assumption that most windows are large enough for them to fit — so the
 * slice's test reads every `model:` out of `agents/*.md` and fails when one of
 * them has no window here, as the maintenance schedule for the table.
 *
 * Two rules hold the honesty of it:
 *
 *   - A model that is not in the table gets `null`, never a guessed size.
 *     `windowFor` says so plainly rather than assuming a window that may not
 *     be the model's own.
 *   - An alias is not a window. `agents/*.md` declares `model: opus`, which is
 *     Claude Code's name for "the current opus", while a transcript always
 *     carries the resolved id. So the alias table below says which id an alias
 *     resolves to — one explicit fact that a person can check — and the window
 *     table only ever answers about ids.
 *
 * Sizes are from the Claude model reference (context column), 2026-06-24.
 */

'use strict';

const K = 1000;
const M = 1000 * K;

/**
 * `model: inherit` in an agent's frontmatter is not a model. It means "whatever
 * spawned me is running", and the id the guard reads at runtime is that
 * parent's own resolved id — which is in the table like any other. Named here
 * so the coverage test can skip it by name rather than by a bare string.
 */
const INHERIT = 'inherit';

/**
 * What Claude Code resolves a bare alias to. Consulted only when reading an
 * agent's frontmatter; nothing at runtime needs it, because every transcript
 * carries the resolved id. When a new generation ships, this is the other line
 * that has to move.
 */
const ALIASES = {
  fable: 'claude-fable-5-1',
  mythos: 'claude-mythos-5-1',
  opus: 'claude-opus-5',
  sonnet: 'claude-sonnet-5',
  haiku: 'claude-haiku-4-5',
};

/**
 * Id to window. A dated snapshot of a model (`claude-opus-5-20260401`) is the
 * same model with the same window, so each pattern allows the suffix rather
 * than needing a row of its own.
 */
function idPattern(id) {
  return new RegExp('^' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:-\\d{8})?$');
}

const WINDOWS = [
  ['claude-fable-5', 1 * M],
  ['claude-fable-5-1', 1 * M],
  ['claude-mythos-5', 1 * M],
  ['claude-mythos-5-1', 1 * M],
  ['claude-opus-5', 1 * M],
  ['claude-opus-5-5', 1 * M],
  ['claude-opus-4-8', 1 * M],
  ['claude-opus-4-7', 1 * M],
  ['claude-opus-4-6', 1 * M],
  ['claude-sonnet-5', 1 * M],
  ['claude-sonnet-4-6', 1 * M],
  ['claude-haiku-4-5', 200 * K],
].map(function (row) {
  return { pattern: idPattern(row[0]), tokens: row[1] };
});

/** The id an alias names, or whatever was passed if it is already an id. */
function resolveAlias(name) {
  if (typeof name !== 'string') return name;
  return Object.hasOwn(ALIASES, name) ? ALIASES[name] : name;
}

/** That model's window in tokens, or null if this table has never heard of it. */
function windowFor(modelId) {
  if (typeof modelId !== 'string' || modelId === '') return null;
  for (const row of WINDOWS) {
    if (row.pattern.test(modelId)) return row.tokens;
  }
  return null;
}

module.exports = {
  INHERIT: INHERIT,
  resolveAlias: resolveAlias,
  windowFor: windowFor,
};
