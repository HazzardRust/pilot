/**
 * `pilot doctor`: one preflight, a row per local check, each `pass`, `fail` or `cannot tell`
 * (daemon-lifecycle spec 10). Every probe is injected and none guesses: an answer it cannot read
 * is "cannot tell", which never fails the run (A5).
 *
 * The Defender row: whether Windows Defender's real-time scan sits in front of every file a gate
 * opens under the projects root, and the step that takes it out of the way (process-gc L12). It
 * reads and advises only: nothing here changes Defender, an exclusion or a volume. The probes are
 * one PowerShell read of Defender's status and exclusions (a fixed script, no path in it) and one
 * `fsutil devdrv query <drive>`, both by absolute System32 path with an argv array, never a shell.
 * A non-administrator cannot read either answer, and `HideExclusionsFromLocalAdmins` can hide the
 * exclusions even from one, so an unreadable answer is "cannot tell", never a guess. Its one write
 * is `defender advised`'s marker, `<store>/defender-advised.json`, a fixed name in the store.
 *
 * The other rows: Node against package.json's engines, the deck's dependency resolvable from the
 * plugin root, the store directory writable (one temp file, removed), and `gh`, `git` and `claude`
 * on PATH (`<cmd> --version` by argv array, never a shell).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { atomicWriteFileSync, privateDir } from '../hooks/lib/atomic-write.js';
import { hostPlatform, isWindows } from '../hooks/lib/platform.js';
import { defaultSettingsPath } from '../scripts/install-settings.mjs';
import { PLUGIN_ID, readReach as defaultReadReach, rulesPlan } from '../scripts/reach.mjs';
import { probeDeck } from './probe.mjs';
import { storeDir as defaultStoreDir } from './store-dir.mjs';
import { DECK_PORT, deckUrl } from './tools.mjs';
import { ENGINES, PLUGIN_VERSION, isOlder, isVersion } from './version.mjs';

const SYSTEM32 = path.win32.join(process.env.SystemRoot ?? 'C:/Windows', 'System32');
const POWERSHELL = path.win32.join(SYSTEM32, 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const FSUTIL = path.win32.join(SYSTEM32, 'fsutil.exe');
const DEFENDER_QUERY = [
  '[Console]::OutputEncoding = [Text.Encoding]::UTF8;',
  '$r = @{ rtp = $null; excl = $null };',
  'try { $r.rtp = [bool](Get-MpComputerStatus -ErrorAction Stop).RealTimeProtectionEnabled } catch {};',
  'try { $x = (Get-MpPreference -ErrorAction Stop).ExclusionPath; if ($null -ne $x) { $r.excl = [string[]]@($x | Where-Object { $_ }) } } catch {};',
  '$r | ConvertTo-Json -Compress',
].join(' ');

const defaultRun = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', windowsHide: true, timeout: 15000, killSignal: 'SIGKILL', stdio: ['ignore', 'pipe', 'pipe'] });

/** Defender's answer: real-time protection on, off or null, and the exclusion paths or null when unreadable. */
function readDefender(run) {
  try {
    const { rtp, excl } = JSON.parse(run(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', DEFENDER_QUERY]).replace(/^\uFEFF/, ''));
    // A bare string too, should ConvertTo-Json unroll a one-element array.
    const paths = excl == null ? null : [excl].flat().map(String);
    const hidden = !paths || paths.some((entry) => /^N\/A\b/i.test(entry));
    return { rtp: typeof rtp === 'boolean' ? rtp : null, exclusions: hidden ? null : paths };
  } catch {
    return { rtp: null, exclusions: null };
  }
}

/**
 * True on a Dev Drive in performance mode, false where fsutil names the volume as another kind
 * (not a developer volume, or one without performance mode), null when it cannot say.
 */
function onDevDrive(run, root) {
  const drive = /^[A-Za-z]:/.exec(root)?.[0];
  if (!drive) return null;
  try {
    const out = run(FSUTIL, ['devdrv', 'query', drive]);
    if (/performance mode enabled/i.test(out)) return true;
    return /developer volume/i.test(out) ? false : null;
  } catch {
    return null;
  }
}

const norm = (p) => {
  const trimmed = p.replace(/[\\/]+$/, '');
  return (/^[A-Za-z]:$/.test(trimmed) ? trimmed : path.win32.normalize(trimmed)).toLowerCase();
};
const covers = (exclusion, root) => {
  const ex = norm(exclusion);
  const r = norm(root);
  return ex !== '' && (r === ex || r.startsWith(`${ex}\\`));
};
/** An entry Defender expands (a wildcard, an environment variable), which a literal match cannot judge. */
const expands = (exclusion) => /[*?%]/.test(exclusion);

/** A PowerShell single-quoted literal: nothing in it expands, and every quote character (ASCII or typographic) is doubled. */
const psLiteral = (text) => `'${text.replace(/['\u2018-\u201B]/g, (q) => q + q)}'`;

/** The exclusion first, the Dev Drive as the upgrade (defender-dev-drive L8). */
function steps(root) {
  return [
    `one-time, as administrator: Add-MpPreference -ExclusionPath ${psLiteral(root)} (reversible with Remove-MpPreference)`,
    `upgrade, as administrator: create a Dev Drive in performance mode and move ${root} onto it (Settings > System > Storage > Advanced > Disks & volumes > Create Dev Drive)`,
  ];
}

/** The scanner state for the projects root and the lines `pilot doctor` prints for it. */
export function checkScanner({ platform = hostPlatform(), run = defaultRun, root }) {
  if (platform !== 'win32') {
    return { state: 'not-windows', lines: [`no scanner check on ${platform}: real-time scanning is checked on Windows only`] };
  }
  const { rtp, exclusions } = readDefender(run);
  if (rtp === false) return { state: 'off', lines: ['Defender real-time scanning: off; nothing to do for Defender'] };
  const head = [`real-time scanning: ${rtp ? 'on' : 'cannot tell'}`, `projects root: ${root}`];
  const devDrive = rtp ? onDevDrive(run, root) : null;
  if (devDrive) {
    return { state: 'dev-drive', lines: [...head, `${root} is on a Dev Drive in performance mode: files are scanned after they open, not before; nothing to do`] };
  }
  if (rtp && exclusions?.some((ex) => covers(ex, root))) {
    return { state: 'excluded', lines: [...head, `${root} is excluded from real-time scanning; nothing to do`] };
  }
  if (rtp && exclusions && devDrive === false && !exclusions.some(expands)) {
    return { state: 'not-excluded', lines: [...head, `${root} is neither on a Dev Drive in performance mode nor excluded, so every file a gate opens is scanned first:`, ...steps(root)] };
  }
  return {
    state: 'unknown',
    scanning: rtp === true,
    lines: [...head, `cannot tell without an administrator whether ${root} is on a Dev Drive or excluded (run pilot doctor as administrator to see); if gates are slow:`, ...steps(root)],
  };
}

/** The projects root: the parent of the repository holding `cwd`, or of `cwd` outside one. */
export function projectsRoot(cwd = process.cwd()) {
  let dir = path.resolve(cwd);
  while (!fs.existsSync(path.join(dir, '.git'))) {
    const up = path.dirname(dir);
    if (up === dir) return path.dirname(path.resolve(cwd));
    dir = up;
  }
  return path.dirname(dir);
}

/** The plugin's own root, where its package.json and node_modules sit. */
const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DECK_DEP = '@modelcontextprotocol/sdk';
const CLIS = ['gh', 'git', 'claude'];

/** The scanner states that need nothing done; `not-excluded` needs the admin step; `unknown` cannot tell. */
const SCANNER_VERDICT = { off: 'pass', excluded: 'pass', 'dev-drive': 'pass', 'not-windows': 'pass', 'not-excluded': 'fail' };

/** The Defender row: `checkScanner`'s state as a verdict, the two steps split off a row that is not `pass`. */
export function defenderRow({ platform, run, root }) {
  const { state, lines } = checkScanner({ platform, run, root });
  const verdict = SCANNER_VERDICT[state] ?? 'cannot tell';
  if (verdict === 'pass') return { name: 'Defender', verdict, detail: lines.join('; ') };
  // checkScanner ends every state that needs the admin step with the two steps themselves.
  return { name: 'Defender', verdict, detail: lines.slice(0, -2).join('; '), steps: lines.slice(-2) };
}

/** `install`, or a deck item id; never anything that could name a path. */
const ADVISED_WHERE = /^(install|itm_[0-9a-f]{12})$/;
const ADVISED_FILE = 'defender-advised.json';

/** The advice marker, or null when it is absent, unreadable or malformed (L5: absent means advise again). */
function readAdvised(storeDir) {
  try {
    const marker = JSON.parse(fs.readFileSync(path.join(storeDir, ADVISED_FILE), 'utf8'));
    const valid = typeof marker?.where === 'string' && ADVISED_WHERE.test(marker.where) && typeof marker.at === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(marker.at);
    return valid ? marker : null;
  } catch {
    return null;
  }
}

/**
 * Whether the Defender advice is owed: Windows, no advice marker, and a `fail` row or a
 * `cannot tell` row with real-time scanning on (A1). The platform first, then the marker, and only
 * then the probes (L2), so a machine already advised pays no PowerShell call.
 */
export function defenderDue({ platform, run, root, storeDir }) {
  if (platform !== 'win32') return { due: false, why: 'not windows' };
  const advised = readAdvised(storeDir);
  if (advised) return { due: false, why: `advised ${advised.where} ${advised.at.slice(0, 10)}` };
  const { state, scanning, lines } = checkScanner({ platform, run, root });
  const verdict = SCANNER_VERDICT[state] ?? 'cannot tell';
  if (verdict === 'pass' || (verdict === 'cannot tell' && !scanning)) return { due: false, why: 'pass' };
  return { due: true, steps: lines.slice(-2) };
}

/** Records that the user was shown the steps, once per machine (A2); `main` has already refused a `where` not `install` or an item id. */
export function markAdvised({ where, storeDir = defaultStoreDir(), now = new Date() }) {
  privateDir(storeDir);
  atomicWriteFileSync(path.join(storeDir, ADVISED_FILE), `${JSON.stringify({ where, at: now.toISOString() })}\n`);
}

function nodeRow({ nodeVersion, engines }) {
  const name = 'Node';
  // Only a plain `>=x.y.z` is judged; any other range would be a guess.
  const need = /^\s*>=\s*(\S+)\s*$/.exec(engines ?? '')?.[1];
  if (!isVersion(nodeVersion) || !isVersion(need)) return { name, verdict: 'cannot tell', detail: `cannot compare Node ${nodeVersion} with engines ${engines ?? '(none)'}` };
  if (!isOlder(nodeVersion, need)) return { name, verdict: 'pass', detail: `${nodeVersion} meets ${engines}` };
  return { name, verdict: 'fail', detail: `${nodeVersion} is below ${engines}`, steps: [`install Node ${need} or later`] };
}

function dependencyRow({ resolveDep }) {
  const name = 'deck dependency';
  if (resolveDep(DECK_DEP)) return { name, verdict: 'pass', detail: `${DECK_DEP} is installed` };
  return { name, verdict: 'fail', detail: `${DECK_DEP} is not installed in ${PLUGIN_ROOT}`, steps: [`run npm ci in ${PLUGIN_ROOT}`] };
}

function storeRow({ storeDir, canWrite }) {
  const name = 'store directory';
  if (canWrite(storeDir)) return { name, verdict: 'pass', detail: `${storeDir} is writable` };
  return { name, verdict: 'fail', detail: `cannot write to ${storeDir}` };
}

/** Whether user settings enable the pilot plugin: true, false, or undefined when settings say nothing or cannot be read. */
function defaultReadEnabled() {
  try {
    const value = JSON.parse(fs.readFileSync(defaultSettingsPath(), 'utf8')).enabledPlugins?.[PLUGIN_ID];
    return typeof value === 'boolean' ? value : undefined;
  } catch {
    return undefined;
  }
}

/** What a plain session carries, and whether the enabled plugin agrees: only `everything` carries the plugin. Read-only. */
export function reachRow({ reach, enabled }) {
  const name = 'Reach';
  if (!reach.chosen) return { name, verdict: 'cannot tell', detail: 'not chosen; reads as everything', steps: ['pilot reach nothing'] };
  const { level } = reach;
  const wantsPlugin = rulesPlan(level).user;
  if (enabled !== undefined && enabled !== wantsPlugin) {
    return { name, verdict: 'fail', detail: `reach ${level} but ${PLUGIN_ID} is ${enabled ? '' : 'not '}enabled`, steps: [`pilot reach ${level}`] };
  }
  const detail = level === 'nothing' ? 'nothing: plain sessions carry no pilot' : `${level}: plain sessions carry the ${level === 'rules' ? 'rules only' : 'whole pilot'}`;
  return { name, verdict: 'pass', detail, steps: ['change with: pilot reach <level>'] };
}

function cliRow(cmd, onPath) {
  const name = `${cmd} on PATH`;
  const found = onPath(cmd);
  if (found === true) return { name, verdict: 'pass', detail: `\`${cmd} --version\` answers` };
  if (found === false) return { name, verdict: 'fail', detail: `${cmd} is not on PATH`, steps: [`install ${cmd} and put it on PATH`] };
  return { name, verdict: 'cannot tell', detail: `\`${cmd} --version\` gave no answer doctor can read` };
}

/** The deck's dependency, resolved the way the deck imports it, from the plugin's own directory. */
function defaultResolveDep(name) {
  try {
    import.meta.resolve(`${name}/server/index.js`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether a file can be created in `dir`, or, before the deck has made it, in the nearest
 * directory that exists (the deck creates the rest). The probe file is removed; nothing else is written.
 */
function defaultCanWrite(dir) {
  let existing = path.resolve(dir);
  while (!fs.existsSync(existing) && path.dirname(existing) !== existing) existing = path.dirname(existing);
  const probe = path.join(existing, `.pilot-doctor-${process.pid}-${Date.now()}.tmp`);
  try {
    fs.writeFileSync(probe, '', { flag: 'wx' });
  } catch {
    return false;
  }
  try {
    fs.rmSync(probe, { force: true });
  } catch {
    // The write already proved the directory writable; a scanner holding the file open is no fail.
  }
  return true;
}

/** A Windows npm shim (`claude.cmd`) is on PATH even though only a shell can run it. */
const shimOnPath = (cmd) =>
  (process.env.PATH ?? '').split(path.delimiter).some((dir) => path.isAbsolute(dir) && ['.cmd', '.bat'].some((ext) => fs.existsSync(path.join(dir, cmd + ext))));

/**
 * True when `<cmd> --version` answers, false when no such command is found, null otherwise. The
 * bare name is safe from a command planted in the cwd only because bin/pilot.mjs runs
 * `searchPathOnly()` before doctor; a caller importing this module directly must do the same.
 */
function defaultOnPath(cmd) {
  try {
    execFileSync(cmd, ['--version'], { windowsHide: true, timeout: 15000, killSignal: 'SIGKILL', stdio: 'ignore' });
    return true;
  } catch (error) {
    if (error.code !== 'ENOENT') return null;
    return isWindows() && shimOnPath(cmd) ? null : false;
  }
}

/** The port, version and root rows, from one probe of the deck's url; nothing here stops or starts a deck. */
function deckRows({ found, port }) {
  const portName = `port ${port}`;
  if (found.state === 'none') {
    return [{ name: portName, verdict: 'pass', detail: 'free' }, { name: 'deck version', verdict: 'pass', detail: 'no deck running' }];
  }
  if (found.state !== 'deck') {
    return [
      { name: portName, verdict: 'fail', detail: `held by another program (${found.why})` },
      { name: 'deck version', verdict: 'pass', detail: 'no deck running' },
    ];
  }
  const stale = isOlder(found.version, PLUGIN_VERSION);
  const restart = `when no landing runs: taskkill /PID ${found.pid} /F (kill ${found.pid} off Windows), then pilot deck`;
  const rootRow =
    found.checkout === false && found.root
      ? { name: 'deck root', verdict: 'pass', detail: `installed, ${found.root}` }
      : {
          name: 'deck root',
          verdict: 'fail',
          detail: found.checkout === true && found.root ? `serves from checkout ${found.root}; ${restart}` : `no root reported; ${restart}`,
        };
  // Only the shared deck must run the installed plugin; a scratch or --from deck on another port may run a checkout.
  const rows = [
    { name: portName, verdict: 'pass', detail: `our deck, pid ${found.pid}` },
    {
      name: 'deck version',
      verdict: stale ? 'fail' : 'pass',
      detail: stale
        ? `${found.version ?? 'an unreported version'} is older than the plugin's ${PLUGIN_VERSION}; the next session replaces it`
        : `${found.version} matches the plugin's ${PLUGIN_VERSION}`,
    },
  ];
  return port === String(DECK_PORT) ? [...rows, rootRow] : rows;
}

/** Every local check as a row, in the order `pilot doctor` prints them. */
export async function checkAll({
  platform = hostPlatform(),
  run = defaultRun,
  root = projectsRoot(),
  nodeVersion = process.versions.node,
  engines = ENGINES,
  resolveDep = defaultResolveDep,
  storeDir = defaultStoreDir(),
  canWrite = defaultCanWrite,
  onPath = defaultOnPath,
  url = deckUrl(),
  probe = probeDeck,
  readReach = defaultReadReach,
  readEnabled = defaultReadEnabled,
} = {}) {
  const found = await probe(url);
  return [
    defenderRow({ platform, run, root }),
    nodeRow({ nodeVersion, engines }),
    dependencyRow({ resolveDep }),
    storeRow({ storeDir, canWrite }),
    reachRow({ reach: readReach(), enabled: readEnabled() }),
    ...CLIS.map((cmd) => cliRow(cmd, onPath)),
    ...deckRows({ found, port: new URL(url).port }),
  ];
}

/** `<verdict>  <name>: <detail>`, each step indented below it. */
function rowLine({ name, verdict, detail, steps = [] }) {
  return [`${verdict}  ${name}: ${detail}`, ...steps.map((step) => `    ${step}`)].join('\n');
}

/**
 * Print every row, or with `defender` the Defender row alone; 1 when a printed row fails, else 0
 * (`cannot tell` never fails, A5). `defender due` prints the two steps and exits 0 when the advice
 * is owed, else `not due: <why>` and 1; `defender advised <where>` writes the advice marker and
 * exits 0. Any other argument prints the usage on stderr, probes and writes nothing, 2.
 */
export async function main({ cwd = process.cwd(), deps = {}, log = console.log, args = [] } = {}) {
  const [first, verb, where] = args;
  const known =
    args.length === 0 ||
    (first === 'defender' && (args.length === 1 || (args.length === 2 && verb === 'due') || (args.length === 3 && verb === 'advised' && ADVISED_WHERE.test(where))));
  if (!known) {
    process.stderr.write('usage: pilot doctor [defender [due | advised <install|item id>]]\n');
    return 2;
  }
  const options = { root: projectsRoot(cwd), ...deps };
  const defender = { platform: options.platform ?? hostPlatform(), run: options.run ?? defaultRun, root: options.root };
  const store = options.storeDir ?? defaultStoreDir();
  if (verb === 'due') {
    const result = defenderDue({ ...defender, storeDir: store });
    if (!result.due) {
      log(`not due: ${result.why}`);
      return 1;
    }
    for (const step of result.steps) log(step);
    return 0;
  }
  if (verb === 'advised') {
    markAdvised({ where, storeDir: store });
    log(`advised ${where}: ${path.join(store, ADVISED_FILE)}`);
    return 0;
  }
  const rows = args.length ? [defenderRow(defender)] : await checkAll(options);
  for (const row of rows) log(rowLine(row));
  return rows.some((row) => row.verdict === 'fail') ? 1 : 0;
}
