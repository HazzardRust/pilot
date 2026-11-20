/**
 * One line per decision, appended to `~/.claude/pilot/wrapper.log` (S17) by the
 * SessionStart lane (`hooks/lib/deck.js`) and by the hand-off mod (`hooks/handoff-mod.mjs`).
 * A hand-off that left a session idle on 2026-10-02 had no line anywhere saying
 * which half stopped, or why. Control characters become a space so a value from
 * the deck cannot forge a line; past half a megabyte the file is moved aside to
 * `.old`, so it never grows without end. Never throws: a log that cannot be
 * written costs nothing.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { privateDir } = require('./atomic-write.js');
const { deckDir } = require('./deck-secret.js');

const MAX_LOG_BYTES = 512 * 1024;

/** The one rotation: a file at half a megabyte moves to `.old` before the line lands. */
function append(file, line) {
  try {
    privateDir(path.dirname(file));
    try {
      if (fs.statSync(file).size >= MAX_LOG_BYTES) fs.renameSync(file, file + '.old');
    } catch (err) { /* no log yet */ }
    fs.appendFileSync(file, line + '\n');
  } catch (err) { /* an unwritable home is not worth a session */ }
}

function log(text) {
  append(path.join(os.homedir(), '.claude', 'pilot', 'wrapper.log'),
    new Date().toISOString() + ' ' + String(text).replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').slice(0, 300));
}

/**
 * Where the hand-off trace lives (crew-handoff-trace A1): one JSON row per line, beside the deck's
 * store. With no home given that is `deckDir()`, so a scratch deck (`PILOT_DECK_DIR`) traces into its
 * own directory and a test run cannot reach the real file (deckDir throws on it).
 */
function traceFile(home) {
  const dir = home === undefined ? deckDir() : path.join(home, '.claude', 'pilot');
  return path.join(dir, 'handoff-trace.jsonl');
}

/**
 * One hand-off step, stamped `at`. A row carries ids, step names and kinds only, never a body, title or
 * prompt (spec 7): any other field, or one not a short string, is dropped. Never throws. The ticket's
 * field name is the hooks' one `STORED` spelling, required here rather than at load because deck.js
 * requires this module.
 */
function step(row) {
  try {
    if (!row || typeof row.step !== 'string') return;
    const kept = { at: new Date().toISOString() };
    for (const name of ['step', 'kind', 'item', require('./deck.js').STORED.field, 'agent', 'session', 'version']) {
      if (typeof row[name] === 'string' && row[name].length <= 100) kept[name] = row[name];
    }
    // A `deck started` row's code directory, which a deep install path can take past 100 characters.
    if (typeof row.root === 'string' && row.root.length <= 1000) kept.root = row.root;
    append(traceFile(), JSON.stringify(kept));
  } catch (err) { /* a trace that cannot be written costs nothing */ }
}

module.exports = { log: log, step: step, traceFile: traceFile };
