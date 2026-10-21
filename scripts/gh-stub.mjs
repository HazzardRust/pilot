/**
 * `pilot gh-stub` — a `gh` that answers a live PR probe without reaching GitHub (ADR 0173).
 *
 * The stub is node itself, hard-linked (or copied) into a fresh dir as `gh(.exe)`, because
 * `execFileSync('gh', …)` finds only a real exe on Windows, never a `gh.cmd`. `NODE_OPTIONS`
 * preloads `stub.cjs`, which does nothing unless the running exe is named gh; under gh it
 * appends the args to `calls.jsonl`, prints `reply.txt` and exits 0. It prints the shell lines
 * that put the dir first on PATH: sh by default, `--powershell` on request.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isWindows } from '../hooks/lib/platform.js';

// Node resolves its first argument against the cwd as a script path; the stub takes it back.
const STUB = `const fs = require('node:fs');
const path = require('node:path');
if (/^gh(\\.exe)?$/i.test(path.basename(process.execPath))) {
  const [first, ...rest] = process.argv.slice(1);
  const args = first === undefined ? [] : [path.relative(process.cwd(), first), ...rest];
  fs.appendFileSync(path.join(__dirname, 'calls.jsonl'), JSON.stringify(args) + '\\n');
  const reply = path.join(__dirname, 'reply.txt');
  if (fs.existsSync(reply)) fs.writeSync(1, fs.readFileSync(reply));
  process.exit(0);
}
`;

/** Make the stub dir. Answers its paths and the two variables that put it in front. */
export function ghStub({ dir } = {}) {
  dir = path.resolve(dir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-gh-stub-')));
  fs.mkdirSync(dir, { recursive: true });
  const gh = path.join(dir, isWindows() ? 'gh.exe' : 'gh');
  const stub = path.join(dir, 'stub.cjs');
  // Never write through an old or planted link, which could be node itself: remove, then create exclusively.
  fs.rmSync(gh, { force: true });
  fs.rmSync(stub, { force: true });
  try {
    fs.linkSync(process.execPath, gh);
  } catch {
    fs.copyFileSync(process.execPath, gh, fs.constants.COPYFILE_EXCL); // across volumes, or where links are refused
  }
  fs.writeFileSync(stub, STUB, { flag: 'wx' });
  // Forward slashes: NODE_OPTIONS reads a backslash inside quotes as an escape.
  const NODE_OPTIONS = `--require "${stub.replaceAll('\\', '/')}"`;
  return { dir, gh, env: { PATH: `${dir}${path.delimiter}${process.env.PATH ?? ''}`, NODE_OPTIONS } };
}

// Single quotes keep `$`, backticks and `;` inert under eval; PowerShell also closes on the curly quotes.
const sh = (s) => `'${s.replaceAll("'", "'\\''")}'`;
const ps = (s) => `'${s.replace(/['‘-‛]/g, '$&$&')}'`;

/** `pilot gh-stub [--dir <d>] [--powershell]`'s entry point from `bin/pilot.mjs`. */
export function main(argv) {
  let dir;
  let powershell = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--powershell') powershell = true;
    else if (argv[i] === '--dir' && argv[i + 1] && !/[\0-\x1f]/.test(argv[i + 1])) dir = argv[++i];
    else {
      const why = argv[i] === '--dir' ? '--dir needs a directory, with no control characters' : `unknown flag ${argv[i]}`;
      process.stderr.write(`pilot gh-stub: ${why}\nusage: pilot gh-stub [--dir <d>] [--powershell]\n`);
      return 2;
    }
  }
  const stub = ghStub({ dir });
  const { NODE_OPTIONS } = stub.env;
  if (powershell) {
    process.stdout.write(`$env:PATH = ${ps(stub.dir + path.delimiter)} + $env:PATH\n$env:NODE_OPTIONS = ${ps(NODE_OPTIONS)}\n# dir ${stub.dir}\n`);
    return 0;
  }
  // Under Git Bash the Windows form of the dir loses to the real gh; it needs /c/....
  const shDir = isWindows() && process.env.MSYSTEM ? stub.dir.replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`).replaceAll('\\', '/') : stub.dir;
  process.stdout.write(`export PATH=${sh(shDir)}:"$PATH"\nexport NODE_OPTIONS=${sh(NODE_OPTIONS)}\n# dir ${stub.dir}\n`);
  return 0;
}
