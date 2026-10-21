#!/usr/bin/env node
/**
 * Puts the `pilot` command on a friend's PATH, so `pilot run` and `pilot deck` work
 * from any terminal, and keep working across `claude plugin update`.
 *
 * The harness keeps each plugin version in its own directory, so a global command
 * linked to the plugin directory would keep running the version it was linked to. So
 * the command is not linked there. This script copies `bin/launcher.mjs` into a
 * directory no update moves (`~/.claude/pilot/command`, beside the deck's own state),
 * and links npm's global `pilot` to that. The launcher asks `claude plugin list --json`
 * where the plugin is each time it starts, so an update needs nothing from here.
 *
 * The same rules as the rest of the install:
 *
 *   - a `pilot` command that belongs to some other package is never replaced. It is
 *     reported, and left exactly as it was, and nothing is written for it;
 *   - a link that already points at the launcher is not reinstalled, so a second run
 *     changes nothing and says so. A link an earlier install made to one version of this
 *     plugin, or one left pointing at a version since deleted, is re-pointed;
 *   - installed is not the same as working. The command is run once, `pilot help`
 *     through the shim npm wrote, and the report says whether it answered;
 *   - npm's global directory is put on the PATH a new terminal reads (`install-path.mjs`).
 *     When that cannot be done the command is still installed, and the report names the
 *     directory to add by hand.
 *
 * Usage:
 *   node install-command.mjs [--root <dir>] [--prefix <dir>] [--dir <dir>] [--dry-run]
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { privateDir } from '../hooks/lib/atomic-write.js';
import { hostPlatform, isWindows } from '../hooks/lib/platform.js';
import { persistPath, powershellRegistry } from './install-path.mjs';

export const REPOSITORY = 'HazzardRust/pilot';

// The manifest of the launcher's own tiny package. Its version is the launcher's, not
// the plugin's: it changes only when the launcher does, so an update rewrites nothing.
const LAUNCHER_MANIFEST = `${JSON.stringify(
  {
    name: 'pilot',
    version: '1.0.0',
    private: true,
    description: "The global pilot command: runs the installed pilot plugin's bin/pilot.mjs.",
    license: 'MIT',
    repository: { type: 'git', url: `git+https://github.com/${REPOSITORY}.git` },
    bin: { pilot: './launcher.mjs' },
  },
  null,
  2,
)}\n`;

/** The package this script ships in. */
function packageRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

/** Where the launcher lives: beside the deck's state, which no plugin update touches. */
function defaultCommandDir(home = os.homedir()) {
  return path.join(home, '.claude', 'pilot', 'command');
}

/** Where npm keeps global packages under `prefix`. */
export function modulesDir(prefix) {
  return isWindows() ? path.join(prefix, 'node_modules') : path.join(prefix, 'lib', 'node_modules');
}

/** Where npm writes global command shims under `prefix`. */
function binDir(prefix) {
  return isWindows() ? prefix : path.join(prefix, 'bin');
}

// On Windows npm is `npm.cmd`, which only a shell can start, and a shell joins its
// arguments unquoted: each argument is quoted so a path with a space survives. The
// name `npm` is not, because a quoted name makes `npm.cmd` find itself in the cwd.
function npm(args) {
  if (!isWindows()) return spawnSync('npm', args, { encoding: 'utf8', windowsHide: true });
  return spawnSync(`npm ${args.map((arg) => `"${arg}"`).join(' ')}`, { encoding: 'utf8', shell: true, windowsHide: true });
}

export function globalPrefix() {
  const result = npm(['prefix', '-g']);
  if (result.status !== 0) throw new Error(`npm prefix -g failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

function manifestAt(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
}

/** This plugin or its launcher, at any version: the name alone is not enough, since `pilot` is a common one. */
function isThisPlugin(manifest) {
  const url = typeof manifest?.repository === 'string' ? manifest.repository : manifest?.repository?.url;
  return manifest?.name === 'pilot' && typeof url === 'string' && url.includes(REPOSITORY);
}

function lstatOrNull(target) {
  try {
    return fs.lstatSync(target);
  } catch {
    return null;
  }
}

function realpathOrNull(target) {
  try {
    return fs.realpathSync(target);
  } catch {
    return null;
  }
}

/** What is at the global `pilot` now, and so what this run should do about it. */
function decide(dir, prefix) {
  const installed = path.join(modulesDir(prefix), 'pilot');
  const shims = ['pilot', 'pilot.cmd'].map((name) => path.join(binDir(prefix), name));

  // `lstat`, not `existsSync`: a link whose target has gone, which is what a plugin
  // update leaves once the old version is cleared, is still something here, and
  // replacing a link to nothing loses nothing.
  const entry = lstatOrNull(installed);
  if (entry?.isSymbolicLink() && !fs.existsSync(installed)) {
    return { action: 'repointed', current: `${fs.readlinkSync(installed)} (no longer there)` };
  }
  if (!entry && !shims.some((shim) => fs.existsSync(shim))) return { action: 'linked' };
  if (!entry) {
    return {
      action: 'refused',
      why: `a pilot command in ${binDir(prefix)} with no package named pilot beside it, from another package or an interrupted install`,
    };
  }
  const current = realpathOrNull(installed);
  if (current === (realpathOrNull(dir) || path.resolve(dir))) return { action: 'already', current };
  if (isThisPlugin(manifestAt(installed))) return { action: 'repointed', current };
  return { action: 'refused', why: `a different package named pilot, at ${current || installed}` };
}

/** Write the launcher's package into `dir`, touching only files whose bytes differ. */
function writeLauncher(root, dir, dryRun) {
  const files = [
    ['launcher.mjs', fs.readFileSync(path.join(root, 'bin', 'launcher.mjs'))],
    ['package.json', Buffer.from(LAUNCHER_MANIFEST)],
  ];
  const stale = files.filter(([name, bytes]) => {
    try {
      return !fs.readFileSync(path.join(dir, name)).equals(bytes);
    } catch {
      return true;
    }
  });
  if (!stale.length) return 'identical';
  if (!dryRun) {
    // The default dir is inside the store, which this may be first to make (L6); a --dir of the user's own is left alone.
    if (dir === defaultCommandDir()) privateDir(path.dirname(dir));
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, bytes] of stale) fs.writeFileSync(path.join(dir, name), bytes);
  }
  return 'written';
}

/** Run `pilot help` through the shim npm wrote, the way a terminal would. */
function answers(prefix, env) {
  const result = isWindows()
    ? spawnSync(`"${path.join(binDir(prefix), 'pilot.cmd')}" help`, { encoding: 'utf8', shell: true, windowsHide: true, env })
    : spawnSync(path.join(binDir(prefix), 'pilot'), ['help'], { encoding: 'utf8', windowsHide: true, env });
  return { answered: result.status === 0 && /pilot run/.test(result.stdout || ''), said: (result.stderr || '').trim() };
}

function pathNote({ action, where, why }, bin, windows) {
  if (action === 'added') {
    const told = why ? ` ${why[0].toUpperCase()}${why.slice(1)}.` : '';
    const target = windows ? `your user PATH (${where})` : where;
    return `Added ${bin} to ${target}. Open a new terminal for pilot to be found.${told}`;
  }
  if (action === 'present') return `${bin} is already on ${where === 'the PATH' ? "this shell's PATH" : `your PATH (${where})`}.`;
  if (action === 'would-add') return `pilot would add ${bin} to ${windows ? `your user PATH (${where})` : where}.`;
  return `${bin} could not be put on your PATH (${why}). Add it by hand, or a terminal will not find pilot.`;
}

// Apple's platform security guide: since macOS 10.15 an app needs consent for these locations.
const TCC_NOTE =
  'macOS asks before a terminal reads ~/Desktop, ~/Documents, ~/Downloads or iCloud Drive: keep repositories elsewhere, or give your terminal Full Disk Access in System Settings > Privacy & Security.';

function describe({ action, why, current, launcher, dryRun, dir, prefix, answered, said, onPath, windows, darwin }) {
  const would = dryRun ? 'would be' : 'was';
  const notes = [];
  if (launcher === 'written') notes.push(`The launcher ${would} written to ${dir}.`);
  if (action === 'linked') notes.push(`pilot ${would} linked to the launcher.`);
  if (action === 'repointed') notes.push(`pilot ${would} re-pointed from ${current} to the launcher.`);
  if (action === 'already') {
    notes.push(`pilot already points at the launcher in ${dir}.${launcher === 'identical' ? ' Nothing was changed.' : ''}`);
  }
  if (action === 'refused') {
    notes.push(
      `There is already ${why}. It has been left alone, and pilot was not installed.`,
      'Decide whether to remove it yourself; this script will not.',
    );
  }
  if (answered === false) notes.push(`pilot help did not print the usage through the installed command. ${said}`.trim());
  if (onPath) notes.push(pathNote(onPath, binDir(prefix), windows));
  if (darwin) notes.push(TCC_NOTE);
  return notes;
}

/**
 * Write the launcher into `dir` and link the global `pilot` to it. Returns what it did:
 * `action` is one of `linked`, `repointed`, `already` or `refused`, `launcher` is
 * `written` or `identical`, and `ok` is false on a refusal or a command that was
 * installed but does not answer. `path` is where the command directory stands on the
 * persistent PATH; `options.path` is passed to `persistPath`.
 */
export function installCommand(options = {}) {
  const root = path.resolve(options.root || packageRoot());
  const dir = path.resolve(options.dir || defaultCommandDir());
  const prefix = options.prefix || globalPrefix();
  const env = options.env || process.env;
  const dryRun = Boolean(options.dryRun);
  const verify = options.verify !== false;

  const { action, why, current } = decide(dir, prefix);
  const launcher = action === 'refused' ? undefined : writeLauncher(root, dir, dryRun);

  if (!dryRun && (action === 'linked' || action === 'repointed')) {
    const result = npm(['install', '-g', '--prefix', prefix, dir]);
    if (result.status !== 0) throw new Error(`npm install -g failed: ${(result.stderr || '').trim()}`);
  }

  const { answered, said } = !dryRun && action !== 'refused' && verify ? answers(prefix, env) : {};
  const pathOptions = { env, dryRun, ...options.path };
  const platform = pathOptions.platform || hostPlatform();
  const windows = platform === 'win32';
  const darwin = platform === 'darwin';
  let onPath;
  if (action !== 'refused') {
    try {
      onPath = persistPath(binDir(prefix), pathOptions);
    } catch (err) {
      onPath = { action: 'failed', where: 'the PATH', why: err.message };
    }
  }

  return {
    root,
    dir,
    prefix,
    dryRun,
    action,
    launcher,
    ok: action !== 'refused' && answered !== false,
    changed: !dryRun && (launcher === 'written' || action === 'linked' || action === 'repointed'),
    answers: answered,
    path: onPath,
    notes: describe({ action, why, current, launcher, dryRun, dir, prefix, answered, said, onPath, windows, darwin }),
  };
}

/**
 * Undo `installCommand` for the launcher in `home`, removing only what `decide()` proves is
 * this plugin's: npm's global `pilot` when it is this plugin at any version or a link to
 * nothing, then the launcher directory when its manifest is ours. Anything else is `left`,
 * named and untouched. `dryRun` reports the same `removed` paths and writes nothing; `run`
 * is npm, injected for a test.
 */
export function removeCommand(options = {}) {
  const dir = defaultCommandDir(options.home);
  const prefix = options.prefix || globalPrefix();
  const run = options.run || npm;
  const removed = [];
  const left = [];

  const { action, why } = decide(dir, prefix);
  const installed = path.join(modulesDir(prefix), 'pilot');
  if (action === 'refused') left.push(`${why}; it has been left alone`);
  let linked = action === 'already' || action === 'repointed';
  if (linked && !options.dryRun) {
    const result = run(['uninstall', '-g', '--prefix', prefix, 'pilot']);
    linked = result.status === 0 && !lstatOrNull(installed);
    if (!linked) left.push(`npm could not uninstall ${installed}: ${(result.stderr || '').trim() || 'it is still there'}`);
  }
  if (linked) removed.push(installed);

  // The launcher stays while npm's link to it does, so nothing is left pointing at nothing.
  const stuck = left.length && action !== 'refused';
  if (fs.existsSync(dir) && !stuck) {
    if (!isThisPlugin(manifestAt(dir))) left.push(`${dir} does not hold pilot's launcher; it has been left alone`);
    else {
      if (!options.dryRun) fs.rmSync(dir, { recursive: true, force: true });
      removed.push(dir);
    }
  }
  return left.length ? { removed, left: left.join('; ') } : { removed };
}

const USAGE = [
  'Usage: node install-command.mjs [--root <dir>] [--prefix <dir>] [--dir <dir>] [--dry-run]',
  '',
  '  --root     the plugin directory the launcher is copied from (default: the package this script is in)',
  "  --prefix   npm's global prefix (default: npm prefix -g)",
  '  --dir      where the launcher lives (default: ~/.claude/pilot/command)',
  '  --dry-run  report what would be done, and write and install nothing',
].join('\n');

export function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') return { help: true };
    if (flag === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (!['--root', '--prefix', '--dir'].includes(flag)) throw new Error(`Unknown argument ${flag}.\n${USAGE}`);
    const value = argv[i + 1];
    if (value === undefined) throw new Error(`${flag} needs a path after it.\n${USAGE}`);
    options[flag.slice(2)] = value;
    i++;
  }
  return options;
}

function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    console.log(USAGE);
    return;
  }

  let report;
  try {
    report = installCommand(isWindows() ? { ...options, path: { registry: powershellRegistry() } } : options);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  }
  for (const note of report.notes) console.log(note);
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2));
}
