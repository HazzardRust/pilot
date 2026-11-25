/**
 * The machine stays awake while work is in flight (stay-awake spec 1, 2, 6-8; L1-L5, A1, A2, ADR 0215).
 *
 * The user's deck holds one OS keep-awake request while work is in flight, owned by a child process
 * (the holder) whose death, or its deck's, releases it (L1). One unref'd tick spawns a holder on a
 * false-to-true change and kills it on true-to-false (L5). A lid close, the power button and Start >
 * Sleep still end the request; nothing here writes a power setting (L4).
 */

import fs from 'node:fs';
import path from 'node:path';

/** A1: how long after the last heartbeat work still counts as in flight; it covers a background gate. */
export const LINGER_MS = 15 * 60_000;

/** L5: one tick a minute bounds the holder starts, and releases within a minute of the linger. */
const TICK_MS = 60_000;

/** The reason the OS lists against the request (`powercfg /requests`). */
export const REASON = 'pilot: work in flight';

/** By absolute path, as `procs.mjs` does: a bare name is searched for in the current directory first. */
const POWERSHELL = path.win32.join(process.env.SystemRoot ?? 'C:/Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

/**
 * The Windows holder: it opens the deck's process first, so a deck already gone holds nothing; makes a
 * SystemRequired request (the display may still turn off); prints `held`; and exits when the deck does,
 * which closes the request's handle. Single-quoted C#: PowerShell expands nothing inside it.
 */
const windowsHolder = (pid) => [
  "$ErrorActionPreference = 'Stop'",
  `try { $deck = Get-Process -Id ${pid} } catch { exit 2 }`,
  "Add-Type -Namespace PilotAwake -Name Power -MemberDefinition '",
  '[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] public struct Reason { public uint Version; public uint Flags; [MarshalAs(UnmanagedType.LPWStr)] public string Text; }',
  '[DllImport("kernel32.dll", SetLastError = true)] public static extern IntPtr PowerCreateRequest(ref Reason context);',
  '[DllImport("kernel32.dll", SetLastError = true)] public static extern bool PowerSetRequest(IntPtr request, int type);',
  "'",
  // Version 0 and Flags 1: POWER_REQUEST_CONTEXT_SIMPLE_STRING; then type 1, PowerRequestSystemRequired.
  `$reason = New-Object PilotAwake.Power+Reason; $reason.Version = 0; $reason.Flags = 1; $reason.Text = '${REASON}'`,
  '$request = [PilotAwake.Power]::PowerCreateRequest([ref]$reason)',
  'if ($request -eq [IntPtr]::Zero -or $request -eq [IntPtr]-1) { exit 1 }',
  'if (-not [PilotAwake.Power]::PowerSetRequest($request, 1)) { exit 1 }',
  "[Console]::Out.WriteLine('held'); [Console]::Out.Flush()",
  '$deck.WaitForExit()',
  'exit 0',
].join('\n');

/** Whether work is in flight (spec 1, 5): a heartbeat within the linger, a landing, or an armed default. */
export function inFlight({ lastHeardAt, landings, armedDefaults }, now) {
  return (lastHeardAt !== null && now - lastHeardAt < LINGER_MS) || landings > 0 || armedDefaults > 0;
}

/** The POSIX holders, by absolute path (L1); neither takes `sudo`. */
const CAFFEINATE = '/usr/bin/caffeinate';
const SYSTEMD_INHIBIT = '/usr/bin/systemd-inhibit';

/**
 * The holder for `platform`, watching `pid`: an absolute command and an argv array, never a shell
 * string (L1). Darwin's `caffeinate -i` takes PreventUserIdleSystemSleep until `pid` exits; linux's
 * inhibitor blocks sleep and idle only (A4: never handle-lid-switch) around a `tail` that ends with `pid`.
 * Neither prints `held`. Null on a platform with no holder.
 */
export function holderFor(platform, pid) {
  if (!Number.isInteger(pid) || pid < 1) throw new RangeError(`holderFor: not a pid: ${pid}`);
  if (platform === 'win32') return { cmd: POWERSHELL, args: ['-NoProfile', '-NonInteractive', '-Command', windowsHolder(pid)] };
  if (platform === 'darwin') return { cmd: CAFFEINATE, args: ['-i', '-w', String(pid)] };
  if (platform === 'linux') {
    return { cmd: SYSTEMD_INHIBIT, args: ['--what=sleep:idle', '--who=pilot', `--why=${REASON}`, '--mode=block', 'tail', `--pid=${pid}`, '-f', '/dev/null'] };
  }
  return null;
}

const executable = (file) => {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

/** Why `platform` cannot hold on this machine, for the log; null when its holder can run. */
export function holderUnavailable(platform) {
  if (platform === 'win32') return null;
  if (platform === 'darwin') return executable(CAFFEINATE) ? null : `no ${CAFFEINATE}`;
  if (platform === 'linux') {
    if (!executable(SYSTEMD_INHIBIT)) return `no ${SYSTEMD_INHIBIT}`;
    // sd_booted(): without systemd as init there is no logind to take the inhibitor.
    return fs.existsSync('/run/systemd/system') ? null : 'systemd is not running, so logind cannot take an inhibitor';
  }
  return `no keep-awake holder for ${platform}`;
}

/** On POSIX the holder leads its own process group, so a stop reaches `tail` as well (L1). */
const killGroupOf = (pid) => process.kill(-pid, 'SIGTERM');

const NOT_HELD = Object.freeze({ held: false, since: null });

/** One deck per machine holds (L2), so the state is the module's. */
let state = NOT_HELD;

/** What `/api/health` carries (L6): whether a holder said `held`, and since when. */
export const awakeState = () => ({ ...state });

/**
 * Ticks every `intervalMs` and holds while `inFlight(facts(), now())`. A holder that fails to start
 * or dies is logged once until one holds again, and the next tick may try again (spec 6).
 * Returns stop(), which kills a holder it has.
 */
export function holdAwake({ facts, spawn, platform, pid, now = Date.now, intervalMs = TICK_MS, log = console.error, killGroup = killGroupOf }) {
  // POSIX holders say nothing, so the spawn is the hold, and they are stopped by their group.
  const posix = platform !== 'win32';
  let child = null;
  let quiet = false; // a failure was logged and no holder has held since

  const fail = (why) => {
    state = NOT_HELD;
    if (quiet) return;
    quiet = true;
    log(`[deck] the keep-awake holder failed (${why}); the machine may sleep, trying again next minute`);
  };

  const start = () => {
    let proc;
    try {
      const holder = holderFor(platform, pid);
      if (holder === null) return fail(holderUnavailable(platform));
      proc = spawn(holder.cmd, holder.args, { stdio: ['ignore', posix ? 'ignore' : 'pipe', 'ignore'], windowsHide: true, detached: posix });
    } catch (err) {
      return fail(String(err?.message ?? err).split('\n')[0]);
    }
    child = proc;
    const held = () => {
      if (child !== proc || state.held) return;
      state = { held: true, since: new Date(now()).toISOString() };
      // A spawn is no proof the OS took the hold, so a POSIX holder re-arms the log only by outliving a tick.
      if (!posix) quiet = false;
    };
    let out = '';
    if (posix) proc.on('spawn', held);
    proc.stdout?.on('data', (chunk) => {
      out = (out + chunk).slice(-64);
      if (/^held\r?$/m.test(out)) held();
    });
    const ended = (why) => {
      if (child !== proc) return; // released on purpose, or already ended
      child = null;
      fail(posix ? (holderUnavailable(platform) ?? why) : why);
    };
    proc.on('error', (err) => ended(String(err?.message ?? err).split('\n')[0]));
    proc.on('exit', (code, signal) => ended(signal ? `killed by ${signal}` : `exit ${code}`));
  };

  const release = () => {
    const proc = child;
    child = null;
    state = NOT_HELD;
    try {
      if (posix && Number.isInteger(proc.pid)) killGroup(proc.pid);
      else proc.kill();
    } catch (err) {
      if (err?.code === 'ESRCH') return; // it had already exited
      log(`[deck] the keep-awake holder could not be stopped (${String(err?.message ?? err).split('\n')[0]}); it exits with the deck`);
    }
  };

  const tick = () => {
    let want;
    try {
      want = inFlight(facts(), now());
    } catch (err) {
      return log(`[deck] keep-awake: cannot read what is in flight (${String(err?.message ?? err).split('\n')[0]}); left as it is`);
    }
    if (want && child === null) start();
    else if (!want && child !== null) release();
    else if (child !== null && state.held) quiet = false;
  };

  const timer = setInterval(tick, intervalMs);
  // The server keeps the daemon alive; the keep-awake tick alone never should.
  timer.unref?.();
  return {
    stop() {
      clearInterval(timer);
      if (child !== null) release();
    },
  };
}
