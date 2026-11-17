/**
 * handoff-mod S12: `pilot start` opens the pilot in a new window through S9's `openPilot` and
 * returns at once (spec 13, L12, L15). Nothing here starts a process: the verb is handed a
 * recorder for `spawn`, and every settings file lands under a scratch home.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { run } from '../../bin/pilot.mjs';
import { rulesRoot } from '../../scripts/reach.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-start-home-'));
after(() => fs.rmSync(HOME, { recursive: true, force: true }));

const CLAUDE = 'C:/Program Files/Claude/claude.exe';

/** A `spawn` that records each call and answers a child that never exits. */
const aRecorder = () => {
  const calls = [];
  const spawn = (command, args, options) => {
    const child = { command, args, options, unrefed: false, events: [], on(event) { child.events.push(event); }, unref() { child.unrefed = true; } };
    calls.push(child);
    return child;
  };
  return { calls, spawn };
};

/** Runs `pilot <argv>` on a recorder at reach `nothing`, answering the exit code, stderr and stdout's lines, all restored after. */
const pilot = async (t, argv, deps) => {
  let stderr = '';
  const lines = [];
  t.mock.method(process.stderr, 'write', (chunk) => {
    stderr += chunk;
    return true;
  });
  t.mock.method(console, 'log', (line) => lines.push(line));
  const before = process.exitCode;
  try {
    await run(argv, { platform: 'win32', env: { PATH: 'C:/Windows' }, claude: CLAUDE, home: HOME, reach: { level: 'nothing', chosen: true }, ...deps });
    return { code: process.exitCode ?? 0, stderr, lines };
  } finally {
    process.exitCode = before;
    t.mock.restoreAll();
  }
};

test('start opens one window and returns', async (t) => {
  const { calls, spawn } = aRecorder();

  const { code } = await pilot(t, ['start'], { spawn });

  assert.equal(code, 0);
  assert.equal(calls.length, 1);
  const [child] = calls;
  assert.equal(child.options.detached, true);
  assert.equal(child.options.stdio, 'ignore');
  assert.equal(child.options.cwd, process.cwd());
  assert.equal(child.unrefed, true);
  // The child never exits, and `run` has returned: nothing waits on it.
  assert.deepEqual(child.events.filter((e) => e === 'exit' || e === 'close'), [], 'no wait on the child');
});

test("start passes the reach's plugin and rules", async (t) => {
  const { calls, spawn } = aRecorder();

  await pilot(t, ['start'], { spawn });

  const { args } = calls[0];
  assert.equal(args[args.indexOf('--add-dir') + 1], `"${rulesRoot({ home: HOME })}"`);
  const file = args[args.indexOf('--settings') + 1].replace(/^"(.*)"$/, '$1');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).enabledPlugins?.['pilot@pilot'], true);
});

test('start takes no argument', async (t) => {
  const { calls, spawn } = aRecorder();

  const { code, stderr } = await pilot(t, ['start', '--now'], { spawn });

  assert.equal(code, 2);
  assert.match(stderr, /usage: pilot start/);
  assert.equal(calls.length, 0);
});

test('off Windows start prints a line a shell runs as the window would: the rules variable set, the paths quoted', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "pilot start's home-"));
  const quoted = (p) => `'${p.replace("start's", "start'\\''s")}'`; // the one quote: closed, escaped, reopened
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const { calls, spawn } = aRecorder();

  const { lines } = await pilot(t, ['start'], { spawn, platform: 'linux', home });

  assert.equal(calls.length, 0, 'no window');
  assert.deepEqual(lines, [
    `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1 claude --add-dir ${quoted(rulesRoot({ home }))} --agent pilot:pilot --settings ${quoted(path.join(home, '.claude', 'pilot', 'start-settings.json'))}`,
  ]);
});

// lint: start-is-not-mechanics (ADR 0180). The file `pilot start` writes is read by the window it opens, never by the hand-off.
test('nothing on the hand-off path reads what start wrote', () => {
  const files = (rel) => {
    const full = path.join(ROOT, rel);
    if (!fs.statSync(full).isDirectory()) return [full];
    return fs.readdirSync(full, { recursive: true }).map((f) => path.join(full, f)).filter((f) => fs.statSync(f).isFile());
  };
  const paths = ['hooks', 'deck/run-look.mjs', 'scripts/handoff.mjs', 'deck/client.mjs'].flatMap(files);
  assert.ok(paths.length > 4);
  assert.deepEqual(paths.filter((f) => fs.readFileSync(f, 'utf8').includes('start-settings')), []);
});
