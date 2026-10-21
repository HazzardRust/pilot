// Every test runs against an in-memory registry or a recording spawn, never this machine's registry.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { persistPath, powershellRegistry } = await import('../install-path.mjs');

const DIR = 'C:\\Users\\friend\\AppData\\Roaming\\npm';
const USER_KEY = 'HKCU\\Environment\\Path';
const MACHINE_KEY = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment\\Path';

/** A registry holding `user` and `machine`, recording every write and broadcast. */
function memoryRegistry({ user = null, userKind = user === null ? null : 'ExpandString', machine = '', refuse } = {}) {
  const calls = { writes: [], broadcasts: 0 };
  const write = (value, kind) => (refuse ? assert.fail(refuse) : calls.writes.push({ value, kind }));
  return { calls, read: () => ({ user, userKind, machine }), write, broadcast: () => calls.broadcasts++ };
}

const windows = (registry, extra = {}) => ({ platform: 'win32', env: { PATH: '' }, registry, ...extra });

test('a directory in neither registry value is appended to the user value', () => {
  const registry = memoryRegistry({ user: '%USERPROFILE%\\bin;C:\\tools', userKind: 'String', machine: 'C:\\Windows' });

  const result = persistPath(DIR, windows(registry));

  assert.deepEqual(result, { action: 'added', where: USER_KEY });
  assert.deepEqual(registry.calls.writes, [{ value: `%USERPROFILE%\\bin;C:\\tools;${DIR}`, kind: 'String' }]);
  assert.equal(registry.calls.broadcasts, 1);
});

test('a directory only on the process PATH is still added', () => {
  const registry = memoryRegistry({ user: null, machine: 'C:\\Windows' });

  const result = persistPath(DIR, windows(registry, { env: { Path: `C:\\Windows;${DIR}` } }));

  assert.equal(result.action, 'added');
  assert.deepEqual(registry.calls.writes, [{ value: DIR, kind: 'ExpandString' }], 'a new value is REG_EXPAND_SZ');
});

test('a directory already in the user or machine value, %VAR% expanded, writes nothing', () => {
  const env = { PATH: '', AppData: 'C:\\Users\\friend\\AppData\\Roaming' };
  const inUser = memoryRegistry({ user: 'C:\\tools;%APPDATA%\\NPM\\' });
  const inMachine = memoryRegistry({ user: 'C:\\tools', machine: `C:\\Windows;${DIR.toLowerCase()}` });

  assert.deepEqual(persistPath(DIR, windows(inUser, { env })), { action: 'present', where: USER_KEY });
  assert.deepEqual(persistPath(DIR, windows(inMachine, { env })), { action: 'present', where: MACHINE_KEY });
  for (const registry of [inUser, inMachine]) {
    assert.deepEqual(registry.calls.writes, []);
    assert.equal(registry.calls.broadcasts, 0);
  }
});

test('a refused write is a failed result naming the directory', () => {
  const registry = memoryRegistry({ user: 'C:\\tools', refuse: 'Requested registry access is not allowed.' });

  const result = persistPath(DIR, windows(registry));

  assert.equal(result.action, 'failed');
  assert.match(result.why, /not allowed/);
  assert.equal(registry.calls.broadcasts, 0);
  const willing = memoryRegistry({ user: 'C:\\tools' });
  for (const odd of ['C:\\a;b', 'C:\\100%\\npm', 'C:\\"npm"']) {
    assert.equal(persistPath(odd, windows(willing)).action, 'failed', `${odd} is one PATH entry only by hand`);
  }
  assert.deepEqual(willing.calls.writes, []);
});

test('a registry that cannot be read is a failed result, and none given throws', () => {
  const unreadable = { read: () => assert.fail('registry locked'), write: assert.fail, broadcast: assert.fail };

  const result = persistPath(DIR, windows(unreadable));

  assert.deepEqual([result.action, result.where], ['failed', USER_KEY]);
  assert.match(result.why, /could not be read.*registry locked/);
  assert.throws(() => persistPath(DIR, { platform: 'win32', env: { PATH: '' } }), /needs a registry/);
});

test('a broadcast that fails still leaves the directory added, with a sign-out hint', () => {
  const registry = memoryRegistry({ user: 'C:\\tools' });
  registry.broadcast = () => {
    throw new Error('SendMessageTimeout failed');
  };

  const result = persistPath(DIR, windows(registry));

  assert.deepEqual([result.action, result.where], ['added', USER_KEY]);
  assert.match(result.why, /SendMessageTimeout failed.*sign out and in/);
  assert.equal(registry.calls.writes.length, 1);
});

test('a dry run writes nothing', () => {
  const registry = memoryRegistry({ user: 'C:\\tools' });

  const result = persistPath(DIR, windows(registry, { dryRun: true }));

  assert.deepEqual(result, { action: 'would-add', where: USER_KEY });
  assert.deepEqual(registry.calls.writes, []);
  assert.equal(registry.calls.broadcasts, 0);
});

test('the directory reaches PowerShell as data, not script text', () => {
  const hostile = "C:\\npm'; $(calc) #";
  const spawned = [];
  const spawn = (command, args, options) => {
    spawned.push({ command, args, options });
    return { status: 0, stdout: '', stderr: '' };
  };

  powershellRegistry(spawn).write(`C:\\tools;${hostile}`, 'ExpandString');

  assert.equal(spawned.length, 1);
  const [{ command, args, options }] = spawned;
  assert.ok(![command, ...args].some((arg) => arg.includes('calc')), 'the value is never in the command line');
  assert.ok(Object.values(options.env).includes(`C:\\tools;${hostile}`), 'it travels in the environment');
  assert.equal(options.shell, undefined, 'and no shell parses anything');
  assert.equal(options.windowsHide, true, 'and no console window opens');
});

test('the PowerShell registry throws on a failed script, parses the read, and writes only a string kind', () => {
  const answer = (reply) => {
    const spawned = [];
    return { spawned, spawn: (command, args, options) => (spawned.push({ command, args, options }), reply) };
  };
  const failing = answer({ status: 1, stdout: '', stderr: 'Access denied\n' });
  const reading = answer({ status: 0, stdout: '{"user":"C:\\\\tools","userKind":"String","machine":""}', stderr: '' });
  const writing = answer({ status: 0, stdout: '', stderr: '' });

  assert.throws(() => powershellRegistry(failing.spawn).read(), /Access denied/);
  assert.deepEqual(powershellRegistry(reading.spawn).read(), { user: 'C:\\tools', userKind: 'String', machine: '' });
  assert.throws(() => powershellRegistry(writing.spawn).write('C:\\tools', 'DWord'), /refusing to write a DWord PATH/);
  assert.equal(writing.spawned.length, 0, 'nothing reached PowerShell');
});

// POSIX: every test writes into a temp `home`, never the real `~`.

const { profileFor, pilotBlock } = await import('../install-path.mjs');
const fs = await import('node:fs');
const os = await import('node:os');
const path = await import('node:path');
const { spawnSync } = await import('node:child_process');

const BIN = '/home/friend/.npm-global/bin';
const POSIX_BLOCK = `# >>> pilot >>>\nexport PATH='${BIN}':"$PATH"\n# <<< pilot <<<\n`;
const FISH_BLOCK = `# >>> pilot >>>\ncontains -- '${BIN}' $PATH; or set -gx PATH '${BIN}' $PATH\n# <<< pilot <<<\n`;

function tempHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-home-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

const posix = (home, shell, extra = {}) => ({ platform: 'linux', env: { PATH: '/usr/bin:/bin', SHELL: shell }, home, ...extra });

test('zsh and bash profiles get one block that exports the directory', (t) => {
  for (const [shell, file] of [['/bin/zsh', '.zshrc'], ['/usr/bin/bash', '.bashrc']]) {
    const home = tempHome(t);
    const profile = path.join(home, file);
    const earlier = 'alias ll="ls -l"\nexport EDITOR=vi'; // no trailing newline
    fs.writeFileSync(profile, earlier);

    const result = persistPath(BIN, posix(home, shell));

    assert.deepEqual(result, { action: 'added', where: profile });
    const written = fs.readFileSync(profile, 'utf8');
    if (file === '.zshrc') t.diagnostic(`fixture ~/.zshrc after the install:\n${written}`);
    assert.equal(written, `${earlier}\n${POSIX_BLOCK}`, 'earlier content byte-identical, then one block');
  }
});

// darwin: a Terminal opens a login shell, and bash reads only the first login file that exists.
const darwin = (home, shell, extra = {}) => posix(home, shell, { platform: 'darwin', ...extra });

test('darwin bash writes .bash_profile when no login file exists', (t) => {
  const home = tempHome(t);
  const profile = path.join(home, '.bash_profile');
  assert.equal(profileFor('/bin/bash', home, 'darwin'), profile);

  assert.deepEqual(persistPath(BIN, darwin(home, '/bin/bash')), { action: 'added', where: profile });
  assert.equal(fs.readFileSync(profile, 'utf8'), POSIX_BLOCK);
  assert.deepEqual(fs.readdirSync(home), ['.bash_profile'], 'one profile written');
});

test('darwin bash keeps an existing .profile', (t) => {
  const home = tempHome(t);
  fs.writeFileSync(path.join(home, '.profile'), 'export EDITOR=vi\n');
  assert.equal(profileFor('/bin/bash', home, 'darwin'), path.join(home, '.profile'));
  assert.deepEqual(persistPath(BIN, darwin(home, '/bin/bash')), { action: 'added', where: path.join(home, '.profile') });
  assert.deepEqual(fs.readdirSync(home), ['.profile'], 'no .bash_profile beside it to shadow it');

  fs.writeFileSync(path.join(home, '.bash_login'), '');
  assert.equal(profileFor('/bin/bash', home, 'darwin'), path.join(home, '.bash_login'), '.bash_login before .profile');
  fs.writeFileSync(path.join(home, '.bash_profile'), '');
  assert.equal(profileFor('/bin/bash', home, 'darwin'), path.join(home, '.bash_profile'), '.bash_profile before both');
});

test('darwin zsh and linux are unchanged', (t) => {
  const home = tempHome(t);
  fs.writeFileSync(path.join(home, '.bash_profile'), '');
  assert.equal(profileFor('/bin/zsh', home, 'darwin'), path.join(home, '.zshrc'));
  assert.equal(profileFor('/bin/bash', home, 'linux'), path.join(home, '.bashrc'), 'linux ignores the login file');
  assert.equal(profileFor('/bin/zsh', home, 'linux'), path.join(home, '.zshrc'));
});

test('fish gets its own conf.d file with a guarded set -gx', (t) => {
  const home = tempHome(t);

  const result = persistPath(BIN, posix(home, '/opt/homebrew/bin/fish'));

  const file = path.join(home, '.config', 'fish', 'conf.d', 'pilot.fish');
  assert.deepEqual(result, { action: 'added', where: file });
  assert.equal(fs.readFileSync(file, 'utf8'), FISH_BLOCK);
});

test('a second run, or a directory on the process PATH, writes nothing', (t) => {
  for (const shell of ['/bin/zsh', '/bin/bash', '/usr/bin/fish']) {
    const home = tempHome(t);
    const first = persistPath(BIN, posix(home, shell));
    const before = fs.readFileSync(first.where);

    assert.deepEqual(persistPath(BIN, posix(home, shell)), { action: 'present', where: first.where });
    assert.deepEqual(fs.readFileSync(first.where), before, `${shell}: profile bytes identical`);
  }
  const home = tempHome(t);
  const onPath = persistPath(BIN, posix(home, '/bin/zsh', { env: { PATH: `/usr/bin:${BIN}/`, SHELL: '/bin/zsh' } }));
  assert.equal(onPath.action, 'present');
  assert.deepEqual(fs.readdirSync(home), [], 'no profile written');
});

test('an unknown or unset SHELL, or an unwritable profile, is failed with the directory', (t) => {
  for (const shell of ['/bin/tcsh', undefined, '']) {
    const home = tempHome(t);
    const result = persistPath(BIN, posix(home, shell));
    assert.equal(result.action, 'failed', `SHELL=${shell}`);
    assert.match(result.why, /zsh, bash or fish/);
    assert.deepEqual(fs.readdirSync(home), []);
  }
  assert.equal(profileFor('/bin/tcsh', '/h'), null);
  assert.equal(profileFor(undefined, '/h'), null);

  const home = tempHome(t);
  fs.mkdirSync(path.join(home, '.bashrc')); // a profile that cannot be read or appended to
  const result = persistPath(BIN, posix(home, '/bin/bash'));
  assert.equal(result.action, 'failed');
  assert.equal(result.where, path.join(home, '.bashrc'));
  assert.deepEqual(fs.readdirSync(path.join(home, '.bashrc')), []);

  const fishHome = tempHome(t);
  fs.writeFileSync(path.join(fishHome, '.config'), ''); // conf.d cannot be made under a file
  assert.equal(persistPath(BIN, posix(fishHome, '/bin/fish')).action, 'failed');
  assert.equal(fs.readFileSync(path.join(fishHome, '.config'), 'utf8'), '');
});

test('the block names the resolved directory', (t) => {
  const home = tempHome(t);
  assert.equal(persistPath(`${BIN}/`, posix(home, '/bin/bash')).action, 'added');
  assert.equal(fs.readFileSync(path.join(home, '.bashrc'), 'utf8'), pilotBlock(BIN, 'bash'));
});

test('a directory containing a quote, a newline or $ is refused, not written', (t) => {
  for (const odd of ["/home/o'brien/bin", '/home/x\n/bin', '/home/$(id)/bin', '/home/x\r/bin', '/home/x\t/bin', '/home/x\\/bin']) {
    for (const shell of ['zsh', 'bash', 'fish']) assert.throws(() => pilotBlock(odd, shell), /add it by hand/, JSON.stringify(odd));
    const home = tempHome(t);
    const profile = path.join(home, '.zshrc');
    fs.writeFileSync(profile, 'export EDITOR=vi\n');

    const result = persistPath(odd, posix(home, '/bin/zsh'));

    assert.equal(result.action, 'failed', JSON.stringify(odd));
    assert.equal(result.where, profile);
    assert.equal(fs.readFileSync(profile, 'utf8'), 'export EDITOR=vi\n', 'the profile untouched');
  }
});

test('a dry run writes nothing', (t) => {
  for (const shell of ['/bin/zsh', '/bin/fish']) {
    const home = tempHome(t);

    const result = persistPath(BIN, posix(home, shell, { dryRun: true }));

    assert.deepEqual(result, { action: 'would-add', where: profileFor(shell, home) });
    assert.deepEqual(fs.readdirSync(home), [], 'the profile absent');
  }
});

test('the block puts the directory on the PATH of the shell that sources it', { skip: process.platform === 'win32' && 'POSIX shells only' }, (t) => {
  // The shell's own PATH, read after sourcing the profile; fish passes `-c` arguments in $argv.
  const scripts = { bash: 'source "$1"; printf %s "$PATH"', zsh: 'source "$1"; printf %s "$PATH"', fish: 'source $argv[1]; string join : $PATH' };
  for (const [shell, script] of Object.entries(scripts)) {
    if (spawnSync(shell, ['-c', 'exit 0']).status !== 0) {
      t.diagnostic(`${shell} not installed here`);
      continue;
    }
    const home = tempHome(t);
    const dir = path.join(home, 'npm global', 'bin'); // a space, so the quoting is load-bearing
    fs.mkdirSync(dir, { recursive: true }); // the directory exists, as a real prefix does
    // The host's own platform, so the profile written is the one this host's shell reads (darwin bash: its login file).
    assert.equal(persistPath(dir, posix(home, `/bin/${shell}`, { platform: process.platform })).action, 'added');
    const args = shell === 'fish' ? [profileFor(shell, home)] : ['pilot', profileFor(shell, home)];
    const run = spawnSync(shell, ['-c', script, ...args], { encoding: 'utf8', env: { ...process.env, HOME: home } });
    assert.equal(run.status, 0, run.stderr);
    assert.ok(run.stdout.split(':').includes(dir), `${shell}: ${run.stdout}`);
  }
});
