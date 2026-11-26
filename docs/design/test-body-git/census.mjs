/**
 * The fixture git census (test-body-git S1, spec 4; architecture §3's probe as a tool).
 *
 *     node docs/design/test-body-git/census.mjs [<test files...>]
 *
 * Runs the gate (`scripts/gate.mjs`) on the files, or the whole suite when none are named, with this
 * file preloaded into every node of it, and prints fixture git per test file split three ways:
 * - built: started inside a `gitFixture` build (`scripts/test/lib/git-fixture.mjs` on the stack),
 * - lib: started by a test helper under a `test/lib/` directory, outside a build,
 * - body: started by the test file itself.
 * A git with any product frame on its stack (a repo file outside `test/` and `docs/`), or started by a
 * process other than the test file's own (a CLI, a hook), is product git and only counted in the last
 * line, which sets every git the run started beside the gate's own `spawns` line.
 */

import dc from 'node:diagnostics_channel';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), '..', '..', '..');
const { TEST_GLOB } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'select-tests.mjs')).href);

const rel = (file) => path.relative(ROOT, file).replaceAll('\\', '/');
const isTestFile = (file) => !file.startsWith('../') && path.posix.matchesGlob(file, TEST_GLOB);
const isGit = (file) => path.win32.basename(String(file ?? '')).toLowerCase().replace(/\.exe$/, '') === 'git';

/** The repo-relative files on the current stack, innermost first. */
function stackFiles() {
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 200;
  const stack = new Error().stack;
  Error.stackTraceLimit = limit;
  const files = [];
  for (const line of stack.split('\n').slice(1)) {
    const at = line.match(/\((.+):\d+:\d+\)$/)?.[1] ?? line.match(/at (.+):\d+:\d+$/)?.[1];
    // `node:` internals and evaluated code name no file of the repository.
    if (!at) continue;
    const abs = at.startsWith('file:') ? fileURLToPath(at) : at;
    if (!path.isAbsolute(abs)) continue;
    const file = rel(abs);
    if (!file.startsWith('../') && !path.isAbsolute(file)) files.push(file);
  }
  return files;
}

/** `built`, `lib`, `body` or `product` for a git this test file's own process starts now. */
function classify(owner) {
  // The gate's own counter wraps the same binding, so its frame sits on every sync spawn's stack.
  const files = stackFiles().filter((file) => !file.startsWith('node_modules/') && file !== rel(SELF) && file !== 'scripts/count-spawns.mjs');
  if (files.some((file) => !/(^|\/)test\//.test(file) && !isTestFile(file) && !file.startsWith('docs/'))) return 'product';
  if (files.some((file) => file.endsWith('test/lib/git-fixture.mjs'))) return 'built';
  if (files.some((file) => file !== owner && /(^|\/)test\/lib\//.test(file))) return 'lib';
  return 'body';
}

function probe(out) {
  const argv1 = process.argv[1] ? rel(path.resolve(process.argv[1])) : '';
  const own = !process.env.CENSUS_OWNER && isTestFile(argv1);
  if (own) process.env.CENSUS_OWNER = argv1;
  const owner = process.env.CENSUS_OWNER || '-';
  const { openSync, writeSync, closeSync } = fs;
  const record = (kind) => {
    try {
      const fd = openSync(out, 'a');
      try {
        writeSync(fd, `${owner} ${kind}\n`);
      } finally {
        closeSync(fd);
      }
    } catch {
      // A census must not change what it counts.
    }
  };
  const kind = () => {
    try {
      return own ? classify(owner) : 'product';
    } catch {
      // A census must not change what it counts: a stack it cannot read is counted, as `unread`.
      return 'unread';
    }
  };
  // The channel fires before `spawnfile` is set: the stack is read now, the name a microtask later.
  dc.subscribe('child_process', ({ process: child }) => {
    const k = kind();
    queueMicrotask(() => isGit(child.spawnfile) && record(k));
  });
  const binding = process.binding('spawn_sync');
  const spawn = binding.spawn;
  binding.spawn = function censusSpawn(options) {
    if (isGit(options?.file)) record(kind());
    return spawn.apply(this, arguments);
  };
}

const INSTALLED = Symbol.for('pilot.census');
// Only where the gate's own counter runs, so the last line counts the git the gate's `spawns` line does.
if (process.env.CENSUS_OUT && process.env.PILOT_GATE_SPAWNS && !globalThis[INSTALLED]) {
  globalThis[INSTALLED] = true;
  probe(process.env.CENSUS_OUT);
}

/** Per owner `{ built, body, lib, product }` from the probe's lines. */
export function tally(lines) {
  const owners = new Map();
  for (const line of lines) {
    const cut = line.lastIndexOf(' ');
    if (cut < 0) continue;
    const owner = line.slice(0, cut);
    if (!owners.has(owner)) owners.set(owner, { built: 0, body: 0, lib: 0, product: 0, unread: 0 });
    owners.get(owner)[line.slice(cut + 1)]++;
  }
  return owners;
}

function main(files) {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-census-')), 'census.txt');
  fs.writeFileSync(out, '');
  const run = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'gate.mjs'), ...files], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1 << 30,
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, CENSUS_OUT: out, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${pathToFileURL(SELF).href}`.trim() },
  });
  const owners = tally(fs.readFileSync(out, 'utf8').split('\n').filter(Boolean));
  fs.rmSync(path.dirname(out), { recursive: true, force: true });

  const rows = [...owners].filter(([owner]) => owner !== '-').map(([file, c]) => [file, c.built, c.body, c.lib, c.built + c.body + c.lib]);
  rows.sort((a, b) => b[4] - a[4] || a[0].localeCompare(b[0]));
  const sum = (i) => rows.reduce((n, row) => n + row[i], 0);
  const product = [...owners.values()].reduce((n, c) => n + c.product, 0);
  const unread = [...owners.values()].reduce((n, c) => n + c.unread, 0);
  const width = Math.max(4, ...rows.map(([file]) => file.length));
  const line = (cells) => `${String(cells[0]).padEnd(width)} ${cells.slice(1).map((c) => String(c).padStart(6)).join(' ')}`;
  const print = [line(['file', 'built', 'body', 'lib', 'total']), ...rows.map(line), line(['total', sum(1), sum(2), sum(3), sum(4)])];
  print.push(`git ${sum(4) + product + unread} (fixture ${sum(4)}, product ${product}, unread ${unread})`);
  for (const gate of (run.stdout ?? '').split('\n')) if (/^(spawns |ℹ (tests|pass|fail) )/.test(gate)) print.push(`gate: ${gate}`);
  print.push(`gate exit ${run.status ?? run.signal}`);
  process.stdout.write(`${print.join('\n')}\n`);
  return run.status === 0 ? 0 : 1;
}

if (path.resolve(process.argv[1] ?? '') === SELF) process.exitCode = main(process.argv.slice(2));
