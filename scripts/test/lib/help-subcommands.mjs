// The subcommands `pilot help` lists, parsed once for every test that reads them.
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PILOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'bin', 'pilot.mjs');

export function helpSubcommands() {
  const help = spawnSync(process.execPath, [PILOT, 'help'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(help.status, 0, help.error?.message ?? help.stderr);
  const subs = [...new Set([...help.stdout.matchAll(/^ {2}pilot ([a-z][a-z0-9-]*)/gm)].map((m) => m[1]))];
  assert.ok(subs.includes('run'), 'pilot help lists its subcommands');
  return subs;
}
