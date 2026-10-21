/**
 * Puts npm's command directory on the PATH a new terminal reads. On Windows that is the
 * registry, so presence is judged there and never on this process's PATH (a variable set
 * for one terminal only looks present). A missing directory is appended to the user value
 * with its kind kept and the change broadcast; no `setx` (truncates at 1024 characters),
 * no `SetEnvironmentVariable` (forces `REG_SZ`). On macOS and Linux it is the profile of
 * the user's `$SHELL`, which gets one marked pilot block appended. A PATH that cannot be
 * written is a `failed` result for the caller to report, never an exception.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hostPlatform } from '../hooks/lib/platform.js';

const USER_KEY = 'HKCU\\Environment\\Path';
const MACHINE_KEY = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment\\Path';
const KINDS = ['String', 'ExpandString'];

/** The value of `name` in `env`, whatever case Windows spells it in. */
const lookup = (env, name) => env[Object.keys(env).find((k) => k.toLowerCase() === name.toLowerCase())];

/** Each entry of a registry PATH value, `%VAR%` expanded, compared case-insensitively. */
function entries(value, env) {
  return (value || '')
    .split(';')
    .map((entry) => entry.replace(/%([^%]+)%/g, (whole, name) => lookup(env, name) ?? whole).trim())
    .filter(Boolean)
    .map(windowsKey);
}

const windowsKey = (dir) => path.win32.normalize(dir).replace(/[\\/]+$/, '').toLowerCase();

/** Make sure `dir` is on the persistent PATH: `added`, `present`, `would-add` (dry run) or `failed`. */
export function persistPath(dir, options = {}) {
  const platform = options.platform || hostPlatform();
  const env = options.env || process.env;

  if (platform !== 'win32') return persistProfile(dir, env, options.home || os.homedir(), options.dryRun, platform);

  // `;` would split the entry, `%` expand inside it, `"` quote it: not the directory checked.
  if (/[;%"\r\n]/.test(dir)) return { action: 'failed', where: USER_KEY, why: 'its name holds ; % or "' };
  const { registry } = options;
  if (!registry) throw new Error('persistPath needs a registry on Windows');
  let stored;
  try {
    stored = registry.read();
  } catch (err) {
    return { action: 'failed', where: USER_KEY, why: `the registry could not be read: ${err.message}` };
  }
  const want = windowsKey(dir);
  if (entries(stored.user, env).includes(want)) return { action: 'present', where: USER_KEY };
  if (entries(stored.machine, env).includes(want)) return { action: 'present', where: MACHINE_KEY };
  if (options.dryRun) return { action: 'would-add', where: USER_KEY };

  const kind = stored.userKind || 'ExpandString';
  const base = (stored.user || '').replace(/;+$/, '');
  const value = base ? `${base};${dir}` : dir;
  try {
    registry.write(value, kind);
  } catch (err) {
    return { action: 'failed', where: USER_KEY, why: err.message };
  }
  try {
    registry.broadcast();
  } catch (err) {
    return { action: 'added', where: USER_KEY, why: `running programs were not told (${err.message}); sign out and in` };
  }
  return { action: 'added', where: USER_KEY };
}

const OPEN = '# >>> pilot >>>';
const CLOSE = '# <<< pilot <<<';
const PROFILES = { zsh: ['.zshrc'], bash: ['.bashrc'], fish: ['.config', 'fish', 'conf.d', 'pilot.fish'] };

// A macOS terminal opens a login shell, and login bash reads only the first of these that exists (L5).
export const BASH_LOGIN =['.bash_profile', '.bash_login', '.profile'];

/** The startup file pilot writes for `shell` (a `$SHELL` path), or null for a shell it does not write. */
export function profileFor(shell, home, platform = hostPlatform()) {
  const name = path.posix.basename(shell || '');
  if (name === 'bash' && platform === 'darwin') {
    const login = BASH_LOGIN.map((file) => path.join(home, file));
    return login.find((file) => fs.existsSync(file)) || login[0];
  }
  return Object.hasOwn(PROFILES, name) ? path.join(home, ...PROFILES[name]) : null;
}

/**
 * The pilot block putting `dir` first on the PATH. The directory is single-quoted; one
 * holding `'`, `$`, a backslash (fish reads `\'` inside quotes) or a control character is refused
 * rather than escaped, since every terminal the user opens runs this text.
 */
export function pilotBlock(dir, shell) {
  if (/['$\\\x00-\x1f]/.test(dir)) throw new Error("its name holds ', $, \\ or a control character; add it by hand");
  const line = shell === 'fish' ? `contains -- '${dir}' $PATH; or set -gx PATH '${dir}' $PATH` : `export PATH='${dir}':"$PATH"`;
  return `${OPEN}\n${line}\n${CLOSE}\n`;
}

/** The POSIX branch: present on the process PATH or as a block in the profile, else appended there. */
function persistProfile(dir, env, home, dryRun, platform) {
  const want = path.posix.resolve(dir).replace(/\/+$/, '');
  if ((lookup(env, 'PATH') || '').split(':').some((entry) => entry.replace(/\/+$/, '') === want)) {
    return { action: 'present', where: 'the PATH' };
  }
  const shell = lookup(env, 'SHELL');
  const where = profileFor(shell, home, platform);
  if (!where) {
    return { action: 'failed', where: 'the PATH', why: `SHELL is ${shell || 'unset'}; pilot writes only a zsh, bash or fish profile` };
  }
  let before = '';
  try {
    before = fs.readFileSync(where, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') return { action: 'failed', where, why: `it could not be read: ${err.message}` };
  }
  let block;
  try {
    block = pilotBlock(want, path.posix.basename(shell));
  } catch (err) {
    return { action: 'failed', where, why: err.message };
  }
  if (before.replace(/\r\n/g, '\n').includes(block)) return { action: 'present', where };
  if (dryRun) return { action: 'would-add', where };
  try {
    fs.mkdirSync(path.dirname(where), { recursive: true });
    fs.appendFileSync(where, before && !before.endsWith('\n') ? `\n${block}` : block);
  } catch (err) {
    return { action: 'failed', where, why: err.message };
  }
  return { action: 'added', where };
}

/**
 * Cut every pilot block from `file`: the lines from `# >>> pilot >>>` through `# <<< pilot <<<`,
 * both markers included, and nothing around them. An opening marker with no close cuts nothing.
 * True when a block was (or, with `dryRun`, would be) cut; a missing file is false.
 */
export function removeProfileBlock(file, { dryRun = false } = {}) {
  let text;
  try {
    // latin1 maps each byte to one character and back, so a profile in any encoding keeps its bytes.
    text = fs.readFileSync(file, 'latin1');
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
  const lines = text.split(/(?<=\n)/);
  const kept = [];
  let cut = false;
  for (let i = 0; i < lines.length; i++) {
    // The next marker after an opening one must be its close; a second opening means this one pairs with nothing.
    const next = lines[i].trimEnd() === OPEN ? lines.findIndex((line, j) => j > i && [OPEN, CLOSE].includes(line.trimEnd())) : -1;
    const close = next !== -1 && lines[next].trimEnd() === CLOSE ? next : -1;
    if (close === -1) {
      kept.push(lines[i]);
      continue;
    }
    cut = true;
    i = close;
  }
  if (cut && !dryRun) fs.writeFileSync(file, kept.join(''), 'latin1');
  return cut;
}

// The scripts below are constant text. Every value reaches PowerShell through an
// environment variable, so a prefix holding a quote or `$(...)` is data, never code.
const PREAMBLE = "$ErrorActionPreference = 'Stop'; [Console]::OutputEncoding = [Text.Encoding]::UTF8;";
const READ = `${PREAMBLE}
$opt = [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames
$k = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment')
$user = $null; $kind = $null
if ($k -and ($k.GetValueNames() -contains 'Path')) { $user = $k.GetValue('Path', $null, $opt); $kind = $k.GetValueKind('Path').ToString() }
$m = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment')
$machine = ''; if ($m) { $machine = $m.GetValue('Path', '', $opt) }
[Console]::Out.Write((ConvertTo-Json -Compress @{ user = $user; userKind = $kind; machine = $machine }))`;
const WRITE = `${PREAMBLE}
$k = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment')
$k.SetValue('Path', $env:PILOT_PATH_VALUE, [Microsoft.Win32.RegistryValueKind]$env:PILOT_PATH_KIND)`;
const BROADCAST = `${PREAMBLE}
Add-Type -Namespace Pilot -Name Env -MemberDefinition '[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint msg, UIntPtr wParam, string lParam, uint flags, uint timeout, out UIntPtr result);'
$r = [UIntPtr]::Zero
if ([Pilot.Env]::SendMessageTimeout([IntPtr]0xffff, 0x1A, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$r) -eq [IntPtr]::Zero) { throw 'SendMessageTimeout failed' }`;

/** The user's registry, reached through Windows PowerShell; `spawn` is injected so a test records the call. */
export function powershellRegistry(spawn = spawnSync) {
  // By full path: a bare name is searched for in the current directory first.
  const exe = path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const run = (script, vars = {}) => {
    const result = spawn(exe, ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, ...vars },
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error((result.stderr || '').trim() || `PowerShell exited ${result.status}`);
    return result.stdout;
  };
  return {
    read: () => JSON.parse(run(READ)),
    write(value, kind) {
      if (!KINDS.includes(kind)) throw new Error(`refusing to write a ${kind} PATH`);
      run(WRITE, { PILOT_PATH_VALUE: value, PILOT_PATH_KIND: kind });
    },
    broadcast: () => void run(BROADCAST),
  };
}
