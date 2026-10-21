/**
 * One line per decision, appended to `~/.claude/pilot/wrapper.log` (S17) by the
 * SessionStart lane (`hooks/lib/deck.js`) and by `pilot run` (`deck/run.mjs`).
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

const MAX_LOG_BYTES = 512 * 1024;

function log(text) {
  try {
    const file = path.join(os.homedir(), '.claude', 'pilot', 'wrapper.log');
    privateDir(path.dirname(file));
    try {
      if (fs.statSync(file).size > MAX_LOG_BYTES) fs.renameSync(file, file + '.old');
    } catch (err) { /* no log yet */ }
    fs.appendFileSync(file, new Date().toISOString() + ' ' + String(text).replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').slice(0, 300) + '\n');
  } catch (err) { /* an unwritable home is not worth a session */ }
}

module.exports = { log: log };
