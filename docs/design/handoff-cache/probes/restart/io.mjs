/**
 * The mod's hands outside the host (the host lets a mod import nothing of Node's). Run by the mod through
 * `$.process.run`, it inherits the scratch session's environment, which `run.mjs` set:
 *   node io.mjs mode           prints PROBE_MODE
 *   node io.mjs log <uri-json> appends the decoded record, stamped, as one JSON line to PROBE_LOG
 */

import fs from 'node:fs';

const [op, arg] = process.argv.slice(2);

if (op === 'mode') {
  process.stdout.write(`${process.env.PROBE_MODE ?? ''}\n`);
} else if (op === 'log' && process.env.PROBE_LOG) {
  const record = { at: Date.now(), ...JSON.parse(decodeURIComponent(arg)) };
  fs.appendFileSync(process.env.PROBE_LOG, `${JSON.stringify(record)}\n`);
} else {
  process.exitCode = 2;
}
