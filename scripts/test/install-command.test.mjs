/**
 * The install step that puts `pilot` on the PATH, and the launcher that command runs.
 * Everything runs against a scratch npm prefix and a scratch command directory, so the
 * real global `pilot` on this machine is never touched. Real npm, real links, a real
 * `pilot` through the shim npm writes: the failures this step exists to prevent were a
 * command that installed cleanly and then did nothing, and a command that kept running
 * the previous version after `claude plugin update`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'install-command.mjs');
const LAUNCHER = path.join(ROOT, 'bin', 'launcher.mjs');
const WINDOWS = process.platform === 'win32';

const { installCommand, modulesDir } = await import('../install-command.mjs');

const scratch = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-command-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};

/** The environment with one variable set or removed, whatever case Windows spells PATH in. */
function envWith(changes) {
  const env = { ...process.env };
  for (const [name, value] of Object.entries(changes)) {
    for (const key of Object.keys(env)) if (key.toLowerCase() === name.toLowerCase()) delete env[key];
    if (value !== undefined) env[name] = value;
  }
  return env;
}

/** A plugin root whose `pilot` says which one it is, standing in for a version in the cache. */
function fakePlugin(dir, says) {
  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'bin', 'pilot.mjs'),
    `export async function run(argv) { console.log(${JSON.stringify(says)} + ' ' + argv.join(' ')); }\n`,
  );
  return dir;
}

/** A package directory with the given manifest, installed as some earlier global `pilot`. */
function fakePackage(dir, manifest) {
  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(dir, 'bin', 'pilot.mjs'), '#!/usr/bin/env node\nconsole.log("someone else");\n');
  return dir;
}

/** Install `dir` as the global `pilot` under `prefix` directly, the way an earlier install left it. */
function npmInstall(prefix, dir) {
  const args = ['install', '-g', '--prefix', prefix, dir];
  const result = WINDOWS
    ? spawnSync(`npm ${args.map((arg) => `"${arg}"`).join(' ')}`, { encoding: 'utf8', shell: true })
    : spawnSync('npm', args, { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

/** Run the installed `pilot` through npm's shim, as a terminal would. */
function runInstalled(prefix, args, env) {
  return WINDOWS
    ? spawnSync(`"${path.join(prefix, 'pilot.cmd')}" ${args.join(' ')}`, { encoding: 'utf8', shell: true, env })
    : spawnSync(path.join(prefix, 'bin', 'pilot'), args, { encoding: 'utf8', env });
}

const atRoot = (root) => envWith({ PILOT_PLUGIN_ROOT: root });

/** An in-memory registry, so no test here reads or writes this machine's PATH. */
function memory({ refuse, user = 'C:\\tools', broadcast = () => {} } = {}) {
  const calls = { reads: 0, writes: [] };
  const read = () => (calls.reads++, { user, userKind: 'ExpandString', machine: '' });
  const write = (value, kind) => (refuse ? assert.fail(refuse) : calls.writes.push({ value, kind }));
  return { platform: 'win32', calls, registry: { read, write, broadcast } };
}

test('a machine with no pilot command gets one that answers', (t) => {
  const prefix = scratch(t);
  const dir = path.join(scratch(t), 'command');

  const report = installCommand({ root: ROOT, prefix, dir, env: atRoot(ROOT), path: memory() });

  assert.equal(report.action, 'linked');
  assert.equal(report.ok, true, report.notes.join('\n'));
  assert.equal(report.answers, true, 'pilot help printed the usage through the shim');
  assert.equal(fs.realpathSync(path.join(modulesDir(prefix), 'pilot')), fs.realpathSync(dir));
  assert.ok(fs.readFileSync(path.join(dir, 'launcher.mjs')).equals(fs.readFileSync(LAUNCHER)));
});

test('the installed command runs whichever version the plugin is at now, with nothing reinstalled', (t) => {
  // The point of the launcher: `claude plugin update` moves the plugin to a new
  // versioned directory, and the command follows it on the next start.
  const prefix = scratch(t);
  const dir = path.join(scratch(t), 'command');
  const first = fakePlugin(path.join(scratch(t), '0.5.1'), 'the first version');
  const second = fakePlugin(path.join(scratch(t), '0.5.2'), 'the second version');
  installCommand({ root: ROOT, prefix, dir, verify: false, path: memory() });

  const before = runInstalled(prefix, ['run'], atRoot(first));
  const after = runInstalled(prefix, ['run'], atRoot(second));

  assert.match(before.stdout, /the first version run/, before.stderr);
  assert.match(after.stdout, /the second version run/, after.stderr);
});

test('a second run changes nothing and says so', (t) => {
  const prefix = scratch(t);
  const dir = path.join(scratch(t), 'command');
  const bin = WINDOWS ? prefix : path.join(prefix, 'bin');
  installCommand({ root: ROOT, prefix, dir, env: atRoot(ROOT), path: memory() });

  const again = installCommand({ root: ROOT, prefix, dir, env: atRoot(ROOT), path: memory({ user: `C:\\tools;${bin}` }) });

  assert.equal(again.action, 'already');
  assert.equal(again.launcher, 'identical');
  assert.equal(again.ok, true);
  assert.match(again.notes.join('\n'), /already/i);
  assert.ok(again.notes.includes(`${bin} is already on your PATH (HKCU\\Environment\\Path).`), again.notes.join('\n'));
});

test('a link an earlier install made to one version of the plugin is re-pointed to the launcher', (t) => {
  const prefix = scratch(t);
  const dir = path.join(scratch(t), 'command');
  npmInstall(
    prefix,
    fakePackage(path.join(scratch(t), '0.5.1'), {
      name: 'pilot',
      repository: { type: 'git', url: 'git+https://github.com/HazzardRust/pilot.git' },
      bin: { pilot: './bin/pilot.mjs' },
    }),
  );

  const report = installCommand({ root: ROOT, prefix, dir, env: atRoot(ROOT), path: memory() });

  assert.equal(report.action, 'repointed');
  assert.equal(report.ok, true, report.notes.join('\n'));
  assert.equal(fs.realpathSync(path.join(modulesDir(prefix), 'pilot')), fs.realpathSync(dir));
});

test('a link whose version has since been deleted is re-pointed, not refused', (t) => {
  const prefix = scratch(t);
  const dir = path.join(scratch(t), 'command');
  const gone = fakePackage(path.join(scratch(t), '0.4.0'), { name: 'pilot', bin: { pilot: './bin/pilot.mjs' } });
  npmInstall(prefix, gone);
  fs.rmSync(gone, { recursive: true, force: true });

  const report = installCommand({ root: ROOT, prefix, dir, env: atRoot(ROOT), path: memory() });

  assert.equal(report.action, 'repointed', report.notes.join('\n'));
  assert.equal(report.ok, true, report.notes.join('\n'));
});

test('a pilot command that belongs to some other package is left alone, and named', (t) => {
  const prefix = scratch(t);
  const dir = path.join(scratch(t), 'command');
  const theirs = fakePackage(path.join(scratch(t), 'theirs'), {
    name: 'pilot',
    description: 'an unrelated tool that happens to share the name',
    bin: { pilot: './bin/pilot.mjs' },
  });
  npmInstall(prefix, theirs);

  const report = installCommand({ root: ROOT, prefix, dir, env: atRoot(ROOT), path: memory() });

  assert.equal(report.action, 'refused');
  assert.equal(report.ok, false);
  assert.equal(fs.realpathSync(path.join(modulesDir(prefix), 'pilot')), fs.realpathSync(theirs), 'untouched');
  assert.equal(fs.existsSync(dir), false, 'and nothing was written for a command that will not be installed');
  assert.match(report.notes.join('\n'), /left alone/i);
});

test('a dry run writes and installs nothing, and still says what it would do', (t) => {
  const prefix = scratch(t);
  const dir = path.join(scratch(t), 'command');

  const report = installCommand({ root: ROOT, prefix, dir, dryRun: true, path: memory() });

  assert.equal(report.action, 'linked');
  const bin = WINDOWS ? prefix : path.join(prefix, 'bin');
  assert.ok(report.notes.includes(`pilot would add ${bin} to your user PATH (HKCU\\Environment\\Path).`), report.notes.join('\n'));
  assert.equal(fs.existsSync(path.join(modulesDir(prefix), 'pilot')), false);
  assert.equal(fs.existsSync(dir), false);
  assert.match(report.notes.join('\n'), /would/i);
});

test('the report says what was written and to open a new terminal; a failure keeps ok', (t) => {
  const prefix = scratch(t);
  const dir = path.join(scratch(t), 'command');
  const bin = WINDOWS ? prefix : path.join(prefix, 'bin');

  const added = installCommand({ root: ROOT, prefix, dir, verify: false, path: memory() });
  const refused = installCommand({ root: ROOT, prefix, dir, verify: false, path: memory({ refuse: 'access denied' }) });

  assert.equal(added.path.action, 'added');
  assert.ok(
    added.notes.includes(`Added ${bin} to your user PATH (HKCU\\Environment\\Path). Open a new terminal for pilot to be found.`),
    added.notes.join('\n'),
  );
  assert.equal(refused.ok, true, "the command is installed; the PATH is the user's to finish");
  assert.equal(refused.path.action, 'failed');
  assert.ok(
    refused.notes.includes(`${bin} could not be put on your PATH (access denied). Add it by hand, or a terminal will not find pilot.`),
    refused.notes.join('\n'),
  );
});

test('a registry that cannot be read, a failed broadcast, or none at all keeps ok and says what to do', (t) => {
  const prefix = scratch(t);
  const dir = path.join(scratch(t), 'command');
  const bin = WINDOWS ? prefix : path.join(prefix, 'bin');
  const unreadable = memory();
  unreadable.registry.read = () => assert.fail('registry locked');

  const unread = installCommand({ root: ROOT, prefix, dir, verify: false, path: unreadable });
  const unheard = installCommand({
    root: ROOT, prefix, dir, verify: false,
    path: memory({ broadcast: () => assert.fail('no window answered') }),
  });
  const none = installCommand({ root: ROOT, prefix, dir, verify: false, path: { platform: 'win32' } });

  assert.equal(unread.ok, true);
  assert.equal(unread.path.action, 'failed');
  assert.match(unread.notes.join('\n'), /could not be put on your PATH \(the registry could not be read/);
  assert.equal(unheard.path.action, 'added');
  assert.match(unheard.notes.join('\n'), /Sign out and in\./i);
  assert.equal(none.ok, true, 'no registry is a failed PATH, never a real one');
  assert.ok(none.notes.some((note) => note.startsWith(`${bin} could not be put on your PATH`)), none.notes.join('\n'));
});

test('off Windows the notes name the profile, not a user PATH', { skip: WINDOWS && 'POSIX paths only' }, (t) => {
  const prefix = scratch(t);
  const dir = path.join(scratch(t), 'command');
  const home = scratch(t);
  const bin = path.join(prefix, 'bin');
  const at = (PATH) => ({ platform: 'linux', home, env: { PATH, SHELL: '/bin/zsh' } });

  const added = installCommand({ root: ROOT, prefix, dir, verify: false, path: at('/usr/bin') });
  const onPath = installCommand({ root: ROOT, prefix, dir, verify: false, path: at(`/usr/bin:${bin}`) });

  assert.ok(added.notes.includes(`Added ${bin} to ${path.join(home, '.zshrc')}. Open a new terminal for pilot to be found.`), added.notes.join('\n'));
  assert.ok(onPath.notes.includes(`${bin} is already on this shell's PATH.`), onPath.notes.join('\n'));
});

const TCC =
  'macOS asks before a terminal reads ~/Desktop, ~/Documents, ~/Downloads or iCloud Drive: keep repositories elsewhere, or give your terminal Full Disk Access in System Settings > Privacy & Security.';

test('a Mac install prints the TCC note', (t) => {
  const home = scratch(t);
  const install = (platform) => {
    const at = platform === 'win32' ? memory() : { platform, home, env: { PATH: '/usr/bin', SHELL: '/bin/zsh' } };
    return installCommand({ root: ROOT, prefix: scratch(t), dir: path.join(scratch(t), 'command'), dryRun: true, verify: false, path: at }).notes;
  };

  assert.ok(install('darwin').includes(TCC), install('darwin').join('\n'));
  for (const platform of ['linux', 'win32']) assert.ok(!install(platform).some((note) => note.includes('Full Disk Access')), platform);
});

test('a refused install writes no PATH', (t) => {
  const prefix = scratch(t);
  const dir = path.join(scratch(t), 'command');
  npmInstall(prefix, fakePackage(path.join(scratch(t), 'theirs'), { name: 'pilot', bin: { pilot: './bin/pilot.mjs' } }));
  const registry = memory();

  const report = installCommand({ root: ROOT, prefix, dir, env: atRoot(ROOT), path: registry });

  assert.equal(report.action, 'refused');
  assert.equal(report.path, undefined);
  assert.deepEqual(registry.calls, { reads: 0, writes: [] });
});

test('the command line takes the root, the prefix, the directory and the dry run, and exits non-zero on a refusal', (t) => {
  const prefix = scratch(t);
  npmInstall(prefix, fakePackage(path.join(scratch(t), 'theirs'), { name: 'pilot', bin: { pilot: './bin/pilot.mjs' } }));
  const dir = path.join(scratch(t), 'command');

  const dry = spawnSync(
    process.execPath,
    [SCRIPT, '--root', ROOT, '--prefix', scratch(t), '--dir', dir, '--dry-run'],
    { encoding: 'utf8' },
  );
  const refused = spawnSync(process.execPath, [SCRIPT, '--root', ROOT, '--prefix', prefix, '--dir', dir], {
    encoding: 'utf8',
  });

  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /would/i);
  assert.equal(refused.status, 1);
});

// --- the launcher asking claude where the plugin is ------------------------------

/** A `claude` on the PATH that prints `plugins` for `claude plugin list --json`. */
function fakeClaude(t, plugins, notice = '') {
  const bin = scratch(t);
  fs.writeFileSync(path.join(bin, 'list.json'), `${notice ? `${notice}\n` : ''}${JSON.stringify(plugins, null, 2)}\n`);
  if (WINDOWS) {
    fs.writeFileSync(path.join(bin, 'claude.cmd'), '@type "%~dp0list.json"\r\n');
  } else {
    fs.writeFileSync(path.join(bin, 'claude'), '#!/bin/sh\ncat "$(dirname "$0")/list.json"\n', { mode: 0o755 });
  }
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') || 'PATH';
  return envWith({ PILOT_PLUGIN_ROOT: undefined, PATH: `${bin}${path.delimiter}${process.env[pathKey]}` });
}

test('the launcher runs the plugin wherever claude says it is installed', (t) => {
  const root = fakePlugin(path.join(scratch(t), '0.5.2'), 'the installed version');
  const env = fakeClaude(t, [{ id: 'other@market', installPath: 'nowhere' }, { id: 'pilot@pilot', installPath: root }]);

  const result = spawnSync(process.execPath, [LAUNCHER, 'run'], { encoding: 'utf8', env });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /the installed version run/);
});

test('the launcher finds the plugin even when claude prints something around the JSON', (t) => {
  const root = fakePlugin(path.join(scratch(t), '0.5.2'), 'the installed version');
  const env = fakeClaude(t, [{ id: 'pilot@pilot', installPath: root }], 'A new version of Claude Code is available.');

  const result = spawnSync(process.execPath, [LAUNCHER, 'run'], { encoding: 'utf8', env });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /the installed version run/);
});

test('the exit code the plugin chooses is the exit code of the command', (t) => {
  const root = path.join(scratch(t), '0.5.2');
  fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(root, 'bin', 'pilot.mjs'), 'export async function run() { process.exitCode = 7; }\n');

  const result = spawnSync(process.execPath, [LAUNCHER, 'run'], { encoding: 'utf8', env: atRoot(root) });

  assert.equal(result.status, 7, result.stderr);
});

test('the launcher says so plainly when the plugin is not installed', (t) => {
  const env = fakeClaude(t, [{ id: 'other@market', installPath: 'nowhere' }]);

  const result = spawnSync(process.execPath, [LAUNCHER, 'run'], { encoding: 'utf8', env });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /claude plugin install pilot@pilot/);
});
