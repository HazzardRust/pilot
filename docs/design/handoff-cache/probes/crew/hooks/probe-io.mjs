/**
 * The probe's file signals, shared by the mod (through `$.process.run`, since a mod may import nothing of
 * Node's), the background agent (through its Bash tool) and the `SessionStart:clear` hook. Every op works on the
 * run's own scratch directory and prints one line.
 *
 *   go <dir>             the agent may send now
 *   wait <dir>           the agent's wait for `go`, at most 90 s a call (exit 1: call again)
 *   sent <dir>           the agent's SendMessage returned
 *   work <dir>           the rest of the agent's task: 20 s
 *   done <dir>           the agent finished its task
 *   waitsent <dir> <ms>  the mod's wait for `sent` (exit 1: not within <ms>)
 *   log <dir> <json>     one line of the mod's log, stamped
 *   clearing             the SessionStart:clear hook: logs, and at `during` lets the agent send and waits for it
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
