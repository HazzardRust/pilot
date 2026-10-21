/**
 * `pilot uninstall` (daemon-lifecycle spec 12, L10, A4): it plans first and changes nothing,
 * and with `--yes` removes only what is provably pilot's, names what it left, and ends naming
 * the plugin uninstall. Every test works on a scratch home and a scratch npm prefix; none
 * reads the real home, the real global `pilot`, the registry or the user's deck.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const { installCommand, modulesDir, removeCommand } = await import('../install-command.mjs');
const { pilotBlock, removeProfileBlock } = await import('../install-path.mjs');
const { planUninstall, applyPlan, main } = await import('../uninstall.mjs');

const scratch = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-uninstall-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};

/** An in-memory registry, so nothing here reads or writes this machine's PATH. */
const memory = () => ({ platform: 'win32', registry: { read: () => ({ user: '', userKind: 'ExpandString', machine: '' }), write() {}, broadcast() {} } });

/** Every file under `dir` with its bytes, so a run that changes one byte is caught. */
function snapshot(dir) {
  const out = {};
  for (const entry of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) {
    const full = path.join(entry.parentPath, entry.name);
    out[path.relative(dir, full)] = entry.isFile() ? fs.readFileSync(full, 'base64') : entry.isSymbolicLink() ? 'link' : 'dir';
  }
  return out;
}

/** A scratch home as an install leaves it: launcher, store, audits, a bash block and the excerpt. */
function installedHome(home) {
  const pilot = path.join(home, '.claude', 'pilot');
  fs.mkdirSync(path.join(pilot, 'command'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'bin', 'launcher.mjs'), path.join(pilot, 'command', 'launcher.mjs'));
  fs.writeFileSync(
    path.join(pilot, 'command', 'package.json'),
    JSON.stringify({ name: 'pilot', repository: { url: 'git+https://github.com/HazzardRust/pilot.git' } }),
  );
  fs.writeFileSync(path.join(pilot, 'deck.json'), '{"items":[]}\n');
  fs.mkdirSync(path.join(pilot, 'audits', 'repo'), { recursive: true });
  fs.writeFileSync(path.join(pilot, 'audits', 'repo', 'report.json'), '{}\n');
  fs.writeFileSync(path.join(home, '.bashrc'), `alias ll='ls -l'\n${pilotBlock('/opt/npm/bin', 'bash')}export EDITOR=vim\n`);
  fs.writeFileSync(path.join(home, '.claude', 'CLAUDE.md'), '# Mine\n\n## pilot\nthe excerpt\n');
  return home;
}

/** `main` over a scratch home and prefix, its printed lines captured. */
async function runMain(argv, home, prefix, extra = {}) {
  const lines = [];
  const code = await main(argv, { home, prefix, platform: 'linux', deckPid: async () => null, log: (line) => lines.push(line), ...extra });
  return { code, lines };
}

test('the plan changes nothing', async (t) => {
  const home = installedHome(scratch(t));
  const prefix = scratch(t);
  const before = snapshot(home);

  const { code, lines } = await runMain([], home, prefix);

  assert.equal(code, 0);
  assert.ok(lines.some((line) => /^\s*remove\b.*command/.test(line)), lines.join('\n'));
  assert.ok(lines.some((line) => /^\s*leave\b/.test(line)), lines.join('\n'));
  assert.deepEqual(snapshot(home), before, 'the scratch home is byte-identical');
});

test('--yes removes the command and launcher', async (t) => {
  const home = scratch(t);
  const prefix = scratch(t);
  const dir = path.join(home, '.claude', 'pilot', 'command');
  installCommand({ root: ROOT, prefix, dir, verify: false, path: memory() });
  assert.ok(fs.existsSync(path.join(modulesDir(prefix), 'pilot')), 'the install linked the global pilot');

  const steps = await planUninstall(home, { prefix, platform: 'linux', deckPid: async () => null });
  const lines = applyPlan(steps);

  assert.equal(fs.existsSync(dir), false, lines.join('\n'));
  assert.equal(fs.lstatSync(path.join(modulesDir(prefix), 'pilot'), { throwIfNoEntry: false }), undefined, lines.join('\n'));
  for (const shim of ['pilot', 'pilot.cmd']) assert.equal(fs.existsSync(path.join(process.platform === 'win32' ? prefix : path.join(prefix, 'bin'), shim)), false);
});

test("another package's pilot is left and named", async (t) => {
  const home = installedHome(scratch(t));
  const prefix = scratch(t);
  const foreign = path.join(modulesDir(prefix), 'pilot');
  fs.mkdirSync(foreign, { recursive: true });
  fs.writeFileSync(path.join(foreign, 'package.json'), JSON.stringify({ name: 'pilot', repository: 'github:someone/else' }));
  const runs = [];

  const result = removeCommand({ prefix, home, run: (args) => (runs.push(args), { status: 0, stdout: '', stderr: '' }) });

  assert.deepEqual(runs, [], 'npm was never asked to uninstall it');
  assert.ok(fs.existsSync(path.join(foreign, 'package.json')), 'the foreign pilot stays');
  assert.match(result.left, /different package named pilot/);
  assert.ok(result.left.includes(foreign) || result.left.includes(fs.realpathSync(foreign)), result.left);
  assert.equal(fs.existsSync(path.join(home, '.claude', 'pilot', 'command')), false, "pilot's own launcher still goes");

  // Through main: the foreign pilot is a leave, named once, and not a failure.
  installedHome(home);
  const { code, lines } = await runMain(['--yes'], home, prefix);
  assert.equal(code, 0, lines.join('\n'));
  assert.deepEqual(lines.filter((line) => /could not/.test(line)), []);
  assert.equal(lines.filter((line) => /different package named pilot/.test(line)).length, 1, lines.join('\n'));
  assert.ok(fs.existsSync(path.join(foreign, 'package.json')));
});

test('the profile block goes and nothing else', (t) => {
  const home = scratch(t);
  const file = path.join(home, '.zshrc');
  const above = 'export A=1\r\n# a comment\n';
  const below = 'alias g=git\n';
  fs.writeFileSync(file, `${above}${pilotBlock('/opt/npm/bin', 'zsh')}${below}`);

  assert.equal(removeProfileBlock(file), true);
  assert.equal(fs.readFileSync(file, 'utf8'), `${above}${below}`);
  assert.equal(removeProfileBlock(file), false, 'a second run finds no block');
  assert.equal(fs.readFileSync(file, 'utf8'), `${above}${below}`);

  const unclosed = path.join(home, '.bashrc');
  fs.writeFileSync(unclosed, 'x\n# >>> pilot >>>\nexport PATH=/mine:"$PATH"\n');
  assert.equal(removeProfileBlock(unclosed), false, 'an opening marker with no close cuts nothing');
  assert.equal(fs.readFileSync(unclosed, 'utf8'), 'x\n# >>> pilot >>>\nexport PATH=/mine:"$PATH"\n');

  // A stray opening marker pairs with nothing: only the block nearest its close goes.
  const stray = '# >>> pilot >>>\nexport KEEP=1\n';
  fs.writeFileSync(unclosed, `${stray}${pilotBlock('/opt/npm/bin', 'bash')}`);
  assert.equal(removeProfileBlock(unclosed), true);
  assert.equal(fs.readFileSync(unclosed, 'utf8'), stray);

  const latin = path.join(home, 'latin1.sh');
  const bytes = Buffer.concat([Buffer.from([0x23, 0xe9, 0x0a]), Buffer.from(pilotBlock('/opt/npm/bin', 'bash'))]);
  fs.writeFileSync(latin, bytes);
  assert.equal(removeProfileBlock(latin), true);
  assert.deepEqual(fs.readFileSync(latin), Buffer.from([0x23, 0xe9, 0x0a]), 'a byte that is not UTF-8 survives');
});

test('a pid whose command only mentions deck/daemon.mjs is not stopped', async (t) => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', '--', '--log=deck/daemon.mjs.log'], { stdio: 'ignore' });
  t.after(() => child.kill());
  await new Promise((resolve) => child.once('spawn', resolve));

  const [line] = applyPlan([{ what: 'the deck', path: 'http://localhost:1', action: 'stop', why: `pid ${child.pid}`, pid: child.pid }]);

  assert.match(line, /^could not stop/, line);
  assert.equal(child.exitCode, null, 'the process is still running');

  // A node process running a pilot checkout's deck/daemon.mjs is stopped (a scratch stand-in, never the user's deck).
  const checkout = scratch(t);
  const fake = path.join(checkout, 'deck', 'daemon.mjs');
  fs.mkdirSync(path.dirname(fake));
  fs.mkdirSync(path.join(checkout, 'bin'));
  fs.writeFileSync(path.join(checkout, 'bin', 'pilot.mjs'), '');
  fs.writeFileSync(fake, 'setInterval(() => {}, 1000);\n');
  const deck = spawn(process.execPath, [fake], { stdio: 'ignore' });
  t.after(() => deck.kill());
  await new Promise((resolve) => deck.once('spawn', resolve));
  const exited = new Promise((resolve) => deck.once('exit', resolve));

  const [stopped] = applyPlan([{ what: 'the deck', path: 'http://localhost:1', action: 'stop', why: `pid ${deck.pid}`, pid: deck.pid }]);

  assert.match(stopped, /^stopped the deck/, stopped);
  await exited;
});

test('a node process given deck/daemon.mjs only as an argument is never stopped', async (t) => {
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1e3)', '--', '--log=deck/daemon.mjs'], { stdio: 'ignore' });
  t.after(() => child.kill());
  await new Promise((resolve) => child.once('spawn', resolve));

  const [line] = applyPlan([{ what: 'the deck', path: 'http://localhost:1', action: 'stop', why: `pid ${child.pid}`, pid: child.pid }]);

  assert.match(line, /^could not stop/, line);
  assert.equal(child.exitCode, null, 'the process is still running');
});

test('the store, audits, Windows PATH and excerpt are left and named', async (t) => {
  const home = installedHome(scratch(t));
  const prefix = scratch(t);
  const pilot = path.join(home, '.claude', 'pilot');
  fs.mkdirSync(path.join(home, '.zshrc')); // a profile that cannot be read stops nothing else

  const { code, lines } = await runMain(['--yes'], home, prefix, { platform: 'win32' });

  assert.equal(code, 0, lines.join('\n'));
  const left = lines.filter((line) => /^\s*left\b/.test(line)).join('\n');
  assert.match(left, /store/);
  assert.ok(left.includes(path.join(pilot, 'audits')), left);
  assert.match(left, /Windows PATH/);
  assert.ok(left.includes(prefix), left);
  assert.match(left, /CLAUDE\.md/);
  assert.ok(left.includes(path.join(home, '.zshrc')), left);
  assert.ok(fs.existsSync(path.join(pilot, 'deck.json')));
  assert.ok(fs.existsSync(path.join(pilot, 'audits', 'repo', 'report.json')));
  assert.equal(fs.readFileSync(path.join(home, '.claude', 'CLAUDE.md'), 'utf8'), '# Mine\n\n## pilot\nthe excerpt\n');
  assert.equal(fs.existsSync(path.join(pilot, 'command')), false, 'the launcher went');
  assert.equal(fs.readFileSync(path.join(home, '.bashrc'), 'utf8'), "alias ll='ls -l'\nexport EDITOR=vim\n", 'the block went');
});

test('a Mac uninstall finds the block in every bash file it could be in', async (t) => {
  const home = installedHome(scratch(t)); // the block an install before S8 wrote to ~/.bashrc
  fs.writeFileSync(path.join(home, '.profile'), pilotBlock('/opt/npm/bin', 'bash'));
  fs.writeFileSync(path.join(home, '.bash_profile'), 'export A=1\n'); // shadows .profile since the install

  const blocks = async (platform) =>
    (await planUninstall(home, { prefix: scratch(t), platform, deckPid: async () => null }))
      .filter((step) => step.what === 'the pilot PATH block')
      .map((step) => path.basename(step.path));

  assert.deepEqual(await blocks('darwin'), ['.bashrc', '.profile']);
  assert.deepEqual(await blocks('linux'), ['.bashrc'], 'linux looks where linux writes');
});

test('the store left is the one PILOT_DECK_DIR names, when it names one', async (t) => {
  const home = installedHome(scratch(t));
  const elsewhere = scratch(t);
  fs.mkdirSync(path.join(elsewhere, 'audits'));

  const steps = await planUninstall(home, { prefix: scratch(t), platform: 'linux', deckPid: async () => null, storeDir: elsewhere });

  const left = steps.filter((step) => step.action === 'leave');
  assert.equal(left.find((step) => step.what === 'the store')?.path, elsewhere);
  assert.equal(left.find((step) => step.what === 'the audits')?.path, path.join(elsewhere, 'audits'));
});

test('it ends naming the plugin uninstall', async (t) => {
  const home = installedHome(scratch(t));
  const prefix = scratch(t);
  const stopped = [];

  const { code, lines } = await runMain(['--yes'], home, prefix, { deckPid: async () => 4242, stopDeck: (pid) => stopped.push(pid) });

  assert.equal(code, 0, lines.join('\n'));
  assert.deepEqual(stopped, [4242], "the user's deck was stopped by the pid it answered");
  assert.equal(lines.at(-1), 'last: claude plugin uninstall pilot@pilot');
  assert.equal((await runMain([], home, prefix)).lines.at(-1), 'last: claude plugin uninstall pilot@pilot');
  const usage = await runMain(['--force'], home, prefix);
  assert.equal(usage.code, 1);
});
