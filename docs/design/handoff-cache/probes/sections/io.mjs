// The mod's hands outside the host, run through `$.process.run` with the env run.mjs set (the host lets a mod
// import nothing of Node's). `config` prints {start, trim}; `log <uri-json>` appends the decoded record, stamped,
// as one JSON line to PROBE_LOG; `seed` posts a hand-off item for the scratch repo to the scratch deck, so the
// clear that follows picks up a frame the way a real hand-off does. No section text ever reaches this file.

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const [op, arg] = process.argv.slice(2);
const env = process.env;

async function seed() {
  // The scratch deck only: run.mjs never sets the user's port (4321), and the secret is the scratch dir's.
  if (!env.PILOT_DECK_PORT || env.PILOT_DECK_PORT === '4321' || !env.PILOT_DECK_DIR || !env.PROBE_PILOT_ROOT) {
    throw new Error('no scratch deck in the environment');
  }
  const { bearer } = createRequire(import.meta.url)(path.join(env.PROBE_PILOT_ROOT, 'hooks', 'lib', 'deck-secret.js'));
  const item = { kind: 'handoff', title: 'Handoff: sections probe', body: 'Resume from the run record.', repo: env.PROBE_REPO };
  const response = await fetch(`http://127.0.0.1:${env.PILOT_DECK_PORT}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...bearer(env.PILOT_DECK_DIR) },
    body: JSON.stringify({ name: 'deck_post', arguments: item }),
    signal: AbortSignal.timeout(5000),
  });
  const body = await response.json().catch(() => null);
  const id = /\bitm_[0-9a-f]+\b/.exec(body?.content?.[0]?.text ?? '')?.[0] ?? null;
  process.stdout.write(`${JSON.stringify({ status: response.status, id })}\n`);
  if (!id) process.exitCode = 1;
}

if (op === 'config') {
  const trim = env.PROBE_TRIM === '*' ? '*' : (env.PROBE_TRIM ?? '').split(',').filter(Boolean);
  process.stdout.write(`${JSON.stringify({ start: env.PROBE_START ?? '', trim })}\n`);
} else if (op === 'log' && env.PROBE_LOG) {
  const record = { at: Date.now(), ...JSON.parse(decodeURIComponent(arg)) };
  fs.appendFileSync(env.PROBE_LOG, `${JSON.stringify(record)}\n`);
} else if (op === 'seed') {
  await seed().catch((err) => {
    process.stdout.write(`${JSON.stringify({ error: String(err?.message ?? err).slice(0, 200) })}\n`);
    process.exitCode = 1;
  });
} else {
  process.exitCode = 2;
}
