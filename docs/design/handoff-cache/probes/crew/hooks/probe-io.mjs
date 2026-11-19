/**
 * The probe's file signals in the run's scratch directory, for the mod (`$.process.run`), the agent (Bash) and the
 * `SessionStart:clear` hook (`clearing`, which at `during` lets the agent send and waits for it). One line out.
 */

import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

async function waitFor(file, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (existsSync(file)) return true;
    await sleep(250);
  }
  return existsSync(file);
}

function log(dir, entry) {
  appendFileSync(join(dir, 'mod.jsonl'), `${JSON.stringify({ t: Date.now(), ...entry })}\n`);
}

const stamp = (dir, name) => writeFileSync(join(dir, name), String(Date.now()));

const [op, dir, arg] = process.argv.slice(2);

async function main() {
  switch (op) {
    case 'go': stamp(dir, 'go'); return 'GO WRITTEN';
    case 'wait':
      if (await waitFor(join(dir, 'go'), 90_000)) return 'GO';
      process.exitCode = 1;
      return 'NOT YET: run the same command again';
    case 'sent': stamp(dir, 'sent'); return 'SENT RECORDED';
    case 'work': await sleep(20_000); return 'WORKED';
    case 'done': stamp(dir, 'done'); return 'DONE RECORDED';
    case 'waitsent':
      if (await waitFor(join(dir, 'sent'), Number(arg))) return 'SENT';
      process.exitCode = 1;
      return 'NO SEND';
    case 'log': log(dir, JSON.parse(arg)); return 'LOGGED';
    case 'clearing': {
      const { config } = await import('./config.mjs');
      if (config.dir === null) return '';
      log(config.dir, { ev: 'clear-hook-start' });
      if (config.at === 'during') {
        stamp(config.dir, 'go');
        const sent = await waitFor(join(config.dir, 'sent'), 150_000);
        // Give the message a moment to reach the session while the clear is still in progress.
        await sleep(2_000);
        log(config.dir, { ev: 'clear-hook-sent', sent });
      }
      log(config.dir, { ev: 'clear-hook-end' });
      return '';
    }
    default:
      process.exitCode = 2;
      return `unknown op ${op}`;
  }
}

process.stdout.write(`${await main()}\n`);
