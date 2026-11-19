// The mod's hands outside the host, run through `$.process.run` with the env run.mjs set: `mode` prints
// PROBE_MODE; `log <uri-json>` appends the decoded record, stamped, as one JSON line to PROBE_LOG.

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
