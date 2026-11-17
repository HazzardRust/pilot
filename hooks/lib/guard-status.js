#!/usr/bin/env node
/**
 * The subagent status line `context-size-guard.js` renders when it is executed
 * with `--subagent-status-line`: one row per subagent, its tokens against its
 * own window, coloured by the marks the guard warns at. Moved out of the guard
 * verbatim (blocked-steps S9); the guard requires it back and re-exports
 * `statusRows`.
 *
 * `marksFor` stays the guard's, so `colourFor` reaches it by a call-time
 * `require`: the guard requires this module at load, and a load-time require
 * the other way round would see the guard's exports before they exist.
 */

'use strict';

const { resolveAlias, windowFor } = require('./model-windows.js');

const ROUND = function (pct) { return pct.toFixed(0); };

/** `412k`, `1M` — short enough for a status line and exact enough to act on. */
function tokens(count) {
  if (count >= 1000000) return (count / 1000000).toFixed(count % 1000000 === 0 ? 0 : 1) + 'M';
  return Math.round(count / 1000) + 'k';
}

/**
 * The bands slice 9's status line already uses, now the same flat marks
 * `run()` warns at (`marksFor`, scaled the same way for a small window).
 */
function colourFor(used, size) {
  const marks = require('../context-size-guard.js').marksFor(size);
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

module.exports = {
  colourFor: colourFor,
  MAX_STATUS_INPUT_CHARS: MAX_STATUS_INPUT_CHARS,
  statusRows: statusRows,
  tokens: tokens,
};
