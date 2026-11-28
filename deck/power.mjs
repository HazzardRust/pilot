/**
 * The doctor's Power row (stay-awake spec 3, 4, 9; L4, L6, A3): what would still stop the work while the
 * deck holds its keep-awake request. Reads only: every risk names the user's own setting and nothing here
 * changes one (spec 9's scan, `deck/test/power-writes.test.mjs`). Each read is an absolute command and an
 * argv array, never a shell string; a read that fails or answers junk is null, never a guess.
 */

import path from 'node:path';

const SYSTEM32 = path.win32.join(process.env.SystemRoot ?? 'C:/Windows', 'System32');
const POWERCFG = path.win32.join(SYSTEM32, 'powercfg.exe');
const POWERSHELL = path.win32.join(SYSTEM32, 'WindowsPowerShell', 'v1.0', 'powershell.exe');

/** By GUID, so a localised Windows parses alike; `/qh` because `LIDACTION` is a hidden setting `/q` omits. */
const SUB_BUTTONS = '4f971e89-eebd-4455-a8de-9e59040e7347';
const LIDACTION = '5ca83367-6e45-459f-a27b-476b1d01c936';
const PBUTTONACTION = '7648efa3-dd9c-4e3e-b566-50f929386280';
/** The setting's index: 0 do nothing, 1 sleep, 2 hibernate, 3 shut down; only the button has 4, which turns off the display, so the machine runs on. */
const LID_ACTIONS = ['nothing', 'sleep', 'hibernate', 'shutdown'];
const BUTTON_ACTIONS = [...LID_ACTIONS, 'nothing'];

/**
 * GetSystemPowerStatus's ACLineStatus (byte 0: 0 battery, 1 plugged in, 255 unknown) and GetPwrCapabilities'
 * LidPresent (byte 2) and AoAc (byte 20, Modern Standby), read into byte buffers. Single-quoted C#: PowerShell expands nothing in it.
 */
const STATUS_QUERY = [
  "$ErrorActionPreference = 'Stop'",
  "Add-Type -Namespace PilotPower -Name Native -MemberDefinition '",
  '[DllImport("kernel32.dll")] public static extern bool GetSystemPowerStatus(byte[] status);',
  '[DllImport("powrprof.dll")] public static extern bool GetPwrCapabilities(byte[] caps);',
  "'",
  '$s = New-Object byte[] 12; $c = New-Object byte[] 128',
  '$r = @{ ac = $null; aoac = $null; lid = $null }',
  'if ([PilotPower.Native]::GetSystemPowerStatus($s)) { $r.ac = [int]$s[0] }',
  'if ([PilotPower.Native]::GetPwrCapabilities($c)) { $r.aoac = [bool]$c[20]; $r.lid = [bool]$c[2] }',
  '$r | ConvertTo-Json -Compress',
].join('\n');

/** logind's actions: `lock` and `ignore` leave the machine running. */
const LOGIND_ACTIONS = {
  ignore: 'nothing',
  lock: 'nothing',
  suspend: 'sleep',
  hibernate: 'hibernate',
  'hybrid-sleep': 'hibernate',
  'suspend-then-hibernate': 'hibernate',
  poweroff: 'shutdown',
  halt: 'shutdown',
};

const attempt = (read) => {
  try {
    return read() ?? null;
  } catch {
    return null;
  }
};

/** The current AC and DC indexes of one setting: the last two hex values `powercfg /qh` prints, read by position, not label. */
function windowsAction(run, setting, actions) {
  const values = [...run(POWERCFG, ['/qh', 'SCHEME_CURRENT', SUB_BUTTONS, setting]).matchAll(/:\s*0x([0-9a-f]{8})\s*$/gim)];
  if (values.length < 2) return { ac: null, dc: null };
  const [ac, dc] = values.slice(-2).map(([, hex]) => actions[Number.parseInt(hex, 16)] ?? null);
  return { ac, dc };
}

function readWindows(run) {
  const status = attempt(() => JSON.parse(run(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', STATUS_QUERY]).replace(/^\uFEFF/, '')));
  return {
    source: status?.ac === 1 ? 'ac' : status?.ac === 0 ? 'battery' : null,
    lid: attempt(() => windowsAction(run, LIDACTION, LID_ACTIONS)),
    button: attempt(() => windowsAction(run, PBUTTONACTION, BUTTON_ACTIONS)),
    modernStandby: typeof status?.aoac === 'boolean' ? status.aoac : null,
    lidless: status?.lid === false,
  };
}

function readMac(run) {
  const from = attempt(() => /Now drawing from '(AC|Battery) Power'/.exec(run('/usr/bin/pmset', ['-g', 'batt']))?.[1]);
  return { source: from === 'AC' ? 'ac' : from === 'Battery' ? 'battery' : null };
}

/** One logind or UPower property through busctl: `s "suspend"` or `b true`. */
function busctl(run, service, objectPath, iface, property) {
  return attempt(() => /^[sb] "?([\w-]*)"?\s*$/.exec(run('/usr/bin/busctl', ['--system', 'get-property', service, objectPath, iface, property]))?.[1]);
}

function readLinux(run) {
  const logind = (property) => LOGIND_ACTIONS[busctl(run, 'org.freedesktop.login1', '/org/freedesktop/login1', 'org.freedesktop.login1.Manager', property)] ?? null;
  const onBattery = busctl(run, 'org.freedesktop.UPower', '/org/freedesktop/UPower', 'org.freedesktop.UPower', 'OnBattery');
  const button = logind('HandlePowerKey');
  const dc = logind('HandleLidSwitch');
  // Unset (`s ""`), HandleLidSwitchExternalPower takes HandleLidSwitch's action (logind.conf(5)).
  const external = busctl(run, 'org.freedesktop.login1', '/org/freedesktop/login1', 'org.freedesktop.login1.Manager', 'HandleLidSwitchExternalPower');
  return {
    source: onBattery === 'true' ? 'battery' : onBattery === 'false' ? 'ac' : null,
    lid: { ac: external === '' ? dc : (LOGIND_ACTIONS[external] ?? null), dc },
    button: { ac: button, dc: button },
  };
}

/** What the OS says about power: its source, the lid and power-button actions per source, Modern Standby, and `lidless: true` where the machine has no lid. */
export function readPower({ platform, run }) {
  const read = { win32: readWindows, darwin: readMac, linux: readLinux }[platform];
  const found = (read && attempt(() => read(run))) ?? {};
  const pair = (value) => ({ ac: value?.ac ?? null, dc: value?.dc ?? null });
  const power = { source: found.source ?? null, lid: pair(found.lid), button: pair(found.button), modernStandby: found.modernStandby ?? null };
  return found.lidless ? { ...power, lidless: true } : power;
}

const SAYS = { nothing: 'does nothing', sleep: 'sleeps', hibernate: 'hibernates', shutdown: 'shuts down' };
const says = (action) => SAYS[action] ?? 'cannot tell';
const ON = { ac: 'plugged in', battery: 'on battery' };

/** Where the user changes the lid action for `source`, per OS (spec 4). */
function lidStep(platform, source) {
  if (platform === 'win32') return `set the lid to Do nothing ${ON[source]}: Control Panel > Power Options > "Choose what closing the lid does"`;
  if (platform === 'linux') return `set ${source === 'ac' ? 'HandleLidSwitchExternalPower' : 'HandleLidSwitch'}=ignore in /etc/systemd/logind.conf (as root), then restart systemd-logind`;
  return null;
}

/** Where the user changes the power-button action, per OS (spec 4); the Mac's is not a setting. */
function buttonStep(platform) {
  if (platform === 'win32') return 'set the power button to Do nothing: Control Panel > Power Options > "Choose what the power buttons do"';
  if (platform === 'linux') return 'set HandlePowerKey=ignore in /etc/systemd/logind.conf (as root), then restart systemd-logind';
  return null;
}

/** The Power row: whether the deck holds the request, and what still sleeps the machine (A3: `fail` on battery or a lid that acts). */
export function powerRow({ power, awake, platform }) {
  const { source, lid, button, modernStandby, lidless } = power;
  const held = awake?.held === true ? `held since ${awake.since ?? 'cannot tell'}` : 'not held';
  const facts = [held, source ? ON[source] : 'power source cannot tell'];
  if (lidless) facts.push('no lid');
  else if (lid.ac || lid.dc) facts.push(`lid ${says(lid.ac)} plugged in, ${says(lid.dc)} on battery`);
  if (button.ac || button.dc) facts.push(`power button ${says(source === 'battery' ? button.dc : button.ac)}`);
  if (modernStandby !== null) facts.push(`Modern Standby ${modernStandby ? 'yes' : 'no'}`);
  if (platform === 'darwin') facts.push('a lid close sleeps a Mac unless it is in clamshell mode on power (an external display, keyboard and power)');
  facts.push('the keep-awake request does not stop the lid, the power button or Sleep');
  const detail = facts.join('; ');

  const lidNow = lidless ? 'nothing' : source ? lid[source === 'ac' ? 'ac' : 'dc'] : null;
  const steps = [];
  if (source === 'battery') {
    steps.push('plug in: on battery the machine sleeps on its own timers and lid close');
    if (modernStandby) steps.push('on Modern Standby on battery, Windows ends the keep-awake request 5 minutes after the sleep timeout');
  }
  if (lidNow && lidNow !== 'nothing' && lidStep(platform, source)) steps.push(lidStep(platform, source));
  // A risk, never a verdict (A3 fails on the source and the lid only), so the step rides a passing row too.
  const buttonNow = source === 'battery' ? button.dc : button.ac;
  if (buttonNow && buttonNow !== 'nothing' && buttonStep(platform)) steps.push(buttonStep(platform));

  const verdict = source === 'battery' ? 'fail' : source === null || lidNow === null ? 'cannot tell' : lidNow === 'nothing' ? 'pass' : 'fail';
  return verdict === 'pass' && steps.length === 0 ? { name: 'Power', verdict, detail } : { name: 'Power', verdict, detail, steps };
}
