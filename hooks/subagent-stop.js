#!/usr/bin/env node
/**
 * The SubagentStop hook (crew-handoff-trace S3, spec 1; L1, L4): a co-pilot that stops writes
 * `stopped` with its agent id and, when the deck answers, its ticket. The payload's `agent_type` and
 * `agent_id` are the fields S3's live probe found on SubagentStop. Any other agent is left alone.
 * Prints nothing and always exits 0, so it can never block or steer a subagent's stop.
 */

'use strict';

const { CO_PILOT_TYPE, traceCoPilot } = require('./spawn-trace.js');

/** Reads the payload from `stdin` and writes the row; resolves when the row is written or skipped. */
function main(stdin) {
  const from = stdin || process.stdin;
  return new Promise(function (resolve) {
    let raw = '';
    let started = false;
    const start = function () {
      if (started) return;
      started = true;
      let input;
      try {
        input = JSON.parse(raw);
      } catch (err) {
        return resolve(); // a truncated payload is nothing to trace
      }
      if (!input || input.agent_type !== CO_PILOT_TYPE) return resolve();
      traceCoPilot(input, { step: 'stopped', agent: input.agent_id }).then(resolve, resolve);
    };
    from.setEncoding('utf8');
    from.on('data', function (chunk) { raw += chunk; });
    from.on('end', start);
    from.on('error', start);
  });
}

module.exports = { main: main };

if (require.main === module) main().then(function () { process.exitCode = 0; });
