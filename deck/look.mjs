/**
 * `pilot look`: the surface adapter (ui-design-workflow S1, ADR NNNN).
 *
 * A surface's `surface.json` names its token file, its ruleset, its screens by start-up route,
 * and how to open one. `snap` captures a screen by starting one process from an argv, never a
 * shell line and never input sent to a window (L5, L7): `web` starts a headless Chromium found on
 * the machine with a temporary profile, and `command` runs the file's argv template with only
 * `{route}`, `{mode}` and `{out}` substituted, each as one whole argv element's text.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const MODES = ['light', 'dark'];
const USAGE = 'usage: pilot look snap <surface.json> <screen> [--mode light|dark] [--out <png>]\n';

/** The nearest directory at or above `dir` holding `.git` (a directory, or a worktree's file). */
function repositoryRoot(dir) {
  for (let at = dir; ; at = dirname(at)) {
    if (existsSync(join(at, '.git'))) return at;
    if (dirname(at) === at) return null;
  }
}

/** `value` resolved against `dir`, refused when absolute, missing, or outside `root` once links resolve. */
function insidePath(key, value, dir, root) {
  if (typeof value !== 'string' || value === '') throw new Error(`${key}: missing`);
  if (isAbsolute(value)) throw new Error(`${key}: ${value} is an absolute path; name it relative to the surface.json`);
  const path = resolve(dir, value);
  if (outside(root, path)) throw new Error(`${key}: ${value} is outside the repository`);
  if (!existsSync(path)) throw new Error(`${key}: ${value} does not exist`);
  if (outside(realpathSync(root), realpathSync(path))) throw new Error(`${key}: ${value} is outside the repository through a link`);
  return path;
}

/** Whether `path` lies outside the directory `root`. */
function outside(root, path) {
  const rel = relative(root, path);
  return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel);
}

/**
 * Reads and checks a `surface.json`, returning its paths resolved. Throws naming the key on a
 * missing key or file, an absolute path, or a path outside the repository the file sits in.
 */
export function readSurface(file) {
  const path = resolve(file);
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`${file}: ${err.code === 'ENOENT' ? 'no such surface.json' : err.message}`);
  }
  const dir = dirname(path);
  const root = repositoryRoot(dir);
  if (root === null) throw new Error(`${file}: not inside a repository`);
  if (typeof raw?.name !== 'string' || raw.name === '') throw new Error('name: missing');
  const screens = raw.screens;
  if (!screens || typeof screens !== 'object' || Array.isArray(screens) || !Object.keys(screens).length
    || !Object.values(screens).every((route) => typeof route === 'string')) {
    throw new Error('screens: missing, or not an object of screen names to routes');
  }
  const surface = {
    name: raw.name,
    dir,
    root,
    tokens: insidePath('tokens', raw.tokens, dir, root),
    rules: insidePath('rules', raw.rules, dir, root),
    screens: { ...screens },
  };
  const open = raw.open;
  if (open?.kind === 'web') return { ...surface, open: { kind: 'web', page: insidePath('open.page', open.page, dir, root) } };
  if (open?.kind === 'command') {
    if (!Array.isArray(open.argv) || !open.argv.length || !open.argv.every((a) => typeof a === 'string' && a !== '')) {
      throw new Error('open.argv: not a non-empty array of strings');
    }
    return { ...surface, open: { kind: 'command', argv: [...open.argv] } };
  }
  throw new Error('open: kind is neither web nor command');
}

/** Where Chromium-family browsers install, per platform; `PILOT_LOOK_BROWSER` names any other. */
function browserCandidates(env, platform) {
  if (platform === 'win32') {
    const roots = [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean);
    return roots.flatMap((r) => [
      join(r, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(r, 'Chromium', 'Application', 'chrome.exe'),
      join(r, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ]);
  }
  if (platform === 'darwin') {
    return ['Google Chrome', 'Chromium', 'Microsoft Edge'].map((app) => `/Applications/${app}.app/Contents/MacOS/${app}`);
  }
  return (env.PATH ?? '').split(':').filter(Boolean)
    .flatMap((d) => ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge'].map((b) => join(d, b)));
}

/** The browser `snap` starts: `PILOT_LOOK_BROWSER` when set, else the first installed candidate. */
function findBrowser(env = process.env, platform = process.platform) {
  const named = env.PILOT_LOOK_BROWSER;
  const found = named ? [named].filter((p) => isAbsolute(p) && existsSync(p)) : browserCandidates(env, platform).filter(existsSync);
  if (!found.length) {
    throw new Error(named
      ? `PILOT_LOOK_BROWSER: ${named} is not an absolute path to an existing browser`
      : 'no Chromium-family browser found; set PILOT_LOOK_BROWSER to its absolute path');
  }
  return found[0];
}

/** The web adapter: one headless browser on the page at `route`, a throwaway profile, removed after. */
function snapWeb(surface, route, mode, out, spawn) {
  if (route !== '' && !route.startsWith('#') && !route.startsWith('?')) {
    throw new Error(`screen route ${route}: a web route is a query (?…) or a fragment (#…) on the page`);
  }
  const browser = findBrowser();
  const profile = mkdtempSync(join(tmpdir(), 'pilot-look-'));
  try {
    const args = [
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${profile}`,
      // The fixture reads its token file from file://; only this throwaway profile is allowed to.
      '--allow-file-access-from-files',
      '--virtual-time-budget=5000',
      '--window-size=1280,800',
      `--screenshot=${out}`,
      // Both modes are set, since a headless browser otherwise takes the system theme (0 dark, 1 light).
      ...(mode === 'dark' ? ['--force-dark-mode', '--blink-settings=preferredColorScheme=0'] : ['--blink-settings=preferredColorScheme=1']),
      `${pathToFileURL(surface.open.page).href}${route}`,
    ];
    return spawn(browser, args, { stdio: 'ignore', timeout: 60_000, windowsHide: true });
  } finally {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

/** The command adapter: the argv template with `{route}`, `{mode}` and `{out}` replaced, run with no shell. */
function snapCommand(surface, route, mode, out, spawn) {
  const values = { route, mode, out };
  const [command, ...args] = surface.open.argv.map((a) => a.replace(/\{(route|mode|out)\}/g, (_, key) => values[key]));
  return spawn(command, args, { cwd: surface.dir, stdio: 'inherit', timeout: 300_000, windowsHide: true });
}

/**
 * Captures `screen` of `surface` in `mode` to `out` by starting one process. Throws, starting
 * nothing, on an unknown screen or mode; `status` is the process's exit code, 1 when it did not start.
 */
export function snap(surface, screen, mode, out, spawn = spawnSync) {
  if (!Object.hasOwn(surface.screens, screen)) {
    throw new Error(`no screen ${screen}; this surface has ${Object.keys(surface.screens).join(', ')}`);
  }
  if (!MODES.includes(mode)) throw new Error(`no mode ${mode}; use light or dark`);
  const target = resolve(out);
  const run = surface.open.kind === 'web' ? snapWeb : snapCommand;
  const result = run(surface, surface.screens[screen], mode, target, spawn);
  return { status: result.error || result.status === null ? 1 : result.status, out: target };
}

/** `pilot look snap <surface.json> <screen> [--mode m] [--out f]`: 0 with the PNG written, 1 failed, 2 bad args. */
export function look(argv, { spawn = spawnSync, out: stdout = process.stdout, err: stderr = process.stderr } = {}) {
  const [verb, file, screen, ...rest] = argv;
  const flags = { '--mode': 'light', '--out': null };
  for (let i = 0; i < rest.length; i += 2) {
    if (!(rest[i] in flags) || rest[i + 1] === undefined) {
      stderr.write(USAGE);
      return 2;
    }
    flags[rest[i]] = rest[i + 1];
  }
  if (verb !== 'snap' || !file || !screen || file.startsWith('-') || screen.startsWith('-') || !MODES.includes(flags['--mode'])) {
    stderr.write(USAGE);
    return 2;
  }
  const mode = flags['--mode'];
  try {
    const { status, out } = snap(readSurface(file), screen, mode, flags['--out'] ?? `${screen}-${mode}.png`, spawn);
    if (status !== 0 || !existsSync(out)) {
      stderr.write(`pilot look: the capture exited ${status}${existsSync(out) ? '' : ` and wrote no ${out}`}\n`);
      return 1;
    }
    stdout.write(`${out}\n`);
    return 0;
  } catch (error) {
    stderr.write(`pilot look: ${error.message}\n`);
    return 1;
  }
}
