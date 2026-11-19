/**
 * `pilot update` (handoff-cache S10, spec 11 and 12, L6): the version read around the two
 * `claude plugin` calls, through an injected runner, never the user's install.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { main, update } from '../update.mjs';

/** A scratch home holding an install record of pilot@pilot at `version`, in the shape Claude Code 2.1.328 writes it. */
function homeAt(t, version) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-update-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  writeInstalled(home, version);
  return home;
}

function writeInstalled(home, version) {
  const dir = path.join(home, '.claude', 'plugins');
  fs.mkdirSync(dir, { recursive: true });
  const entry = {
    scope: 'user',
    installPath: path.join(dir, 'cache', 'pilot', 'pilot', version),
    version,
    installedAt: '2026-09-15T07:21:31.144Z',
    lastUpdated: '2026-11-18T23:53:17.887Z',
    gitCommitSha: 'cfb2f3cd609a8d33df128e7aaee85758f6946195',
  };
  fs.writeFileSync(path.join(dir, 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: { 'pilot@pilot': [entry] } }));
}

/**
 * The pilot marketplace's clone offering `version`, recorded where Claude Code 2.1.328 records it: the
 * `known_marketplaces.json` entry is copied from a real one, its `installLocation` moved to the scratch home.
 */
function writeMarketplace(home, version) {
  const plugins = path.join(home, '.claude', 'plugins');
  const clone = path.join(plugins, 'marketplaces', 'pilot');
  fs.mkdirSync(path.join(clone, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(clone, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'pilot', version }));
  const known = { pilot: { source: { source: 'github', repo: 'HazzardRust/pilot' }, installLocation: clone, lastUpdated: '2026-11-18T23:53:11.147Z' } };
  fs.writeFileSync(path.join(plugins, 'known_marketplaces.json'), JSON.stringify(known));
}

/**
 * A runner that records each argv; on `marketplace update` the clone offers `offer`, and on
 * `plugin update` it installs `next`, the way the real CLI does.
 */
function runner(home, { next, offer = next, failOn } = {}) {
  const calls = [];
  const run = async (argv) => {
    calls.push(argv);
    if (failOn && argv.join(' ') === failOn) return { exitCode: 1, stdout: '', stderr: 'Failed to update plugin "pilot@pilot": network unreachable\n' };
    if (offer && argv.join(' ') === 'plugin marketplace update pilot') writeMarketplace(home, offer);
    if (next && argv.join(' ') === 'plugin update pilot@pilot') writeInstalled(home, next);
    return { exitCode: 0, stdout: '', stderr: '' };
  };
  return { run, calls };
}

/** `main`'s exit code and what it printed on each stream. */
async function cli(args, deps) {
  const out = [];
  const err = [];
  // An empty env: a CLAUDE_CONFIG_DIR in the caller's would point main at another install record.
  const code = await main(args, { env: {}, ...deps, stdout: (s) => out.push(s), stderr: (s) => err.push(s) });
  return { code, out: out.join(''), err: err.join('') };
}

test('an update prints both versions', async (t) => {
  const home = homeAt(t, '0.9.9');
  const { run, calls } = runner(home, { next: '0.9.10' });
  assert.deepEqual(await update({ run, home, deckLive: false }), { before: '0.9.9', after: '0.9.10', changed: true });
  assert.deepEqual(calls, [['plugin', 'marketplace', 'update', 'pilot'], ['plugin', 'update', 'pilot@pilot']], 'the marketplace first, then the plugin');

  const again = homeAt(t, '0.9.9');
  const printed = await cli([], { ...runner(again, { next: '0.9.10' }), home: again, deckLive: false });
  assert.deepEqual(printed, { code: 0, out: 'pilot 0.9.9 -> 0.9.10\n', err: '' });
});

test('nothing to update says so', async (t) => {
  const home = homeAt(t, '0.9.9');
  const { run } = runner(home);
  assert.deepEqual(await cli([], { run, home, deckLive: false }), { code: 0, out: 'pilot 0.9.9 is up to date\n', err: '' });
});

test('nothing to update makes no update call', async (t) => {
  const home = homeAt(t, '0.9.9');
  const { run, calls } = runner(home, { offer: '0.9.9' });
  assert.deepEqual(await cli([], { run, home, deckLive: false }), { code: 0, out: 'pilot 0.9.9 is up to date\n', err: '' });
  assert.deepEqual(calls, [['plugin', 'marketplace', 'update', 'pilot']], 'the marketplace only: its version is the installed one');
});

test('a live run refuses', async (t) => {
  const home = homeAt(t, '0.9.9');
  const { run, calls } = runner(home, { next: '0.9.10' });
  assert.equal((await update({ run, home, deckLive: true })).refused, 'live run');
  const printed = await cli([], { run, home, deckLive: true });
  assert.equal(printed.code, 1);
  assert.equal(printed.out, '');
  assert.match(printed.err, /live run/);
  assert.equal(calls.length, 0, 'no claude call is made while a run is live');
});

test('a failed call is said', async (t) => {
  const home = homeAt(t, '0.9.9');
  const { run } = runner(home, { failOn: 'plugin update pilot@pilot' });
  const printed = await cli([], { run, home, deckLive: false });
  assert.equal(printed.code, 1);
  assert.equal(printed.out, '');
  assert.match(printed.err, /Failed to update plugin "pilot@pilot": network unreachable/);
});

test('a missing install record is said, and no claude call is made', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-update-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const { run, calls } = runner(home);
  const printed = await cli([], { run, home, deckLive: false });
  assert.equal(printed.code, 1);
  assert.match(printed.err, /pilot@pilot/);
  assert.equal(calls.length, 0);
});

test('pilot update takes no arguments', async (t) => {
  const home = homeAt(t, '0.9.9');
  const { run, calls } = runner(home);
  const printed = await cli(['--force'], { run, home, deckLive: false });
  assert.equal(printed.code, 2);
  assert.match(printed.err, /usage: pilot update/);
  assert.equal(calls.length, 0);
});
