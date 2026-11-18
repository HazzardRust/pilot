/**
 * `pilot host [<name>] [--local]` (other-host spec 1, L2, L3): a name on `HOST_NAMES` is written to git config as
 * `pilot.host`, any other is refused before git is called, and no name prints the host in force. Every test runs
 * over an in-memory git, so none reads or writes this machine's git config.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { main } = await import('../host-setting.mjs');
const { planUninstall, applyPlan } = await import('../uninstall.mjs');

/** An in-memory git config with `--global` and `--local` scopes; every call recorded as argv. */
function fakeGit(start = {}) {
  const scopes = { global: { ...start.global }, local: { ...start.local } };
  const calls = [];
  const unset = () => Object.assign(new Error('git config: key not set'), { status: 1 });
  const git = (args) => {
    calls.push(args);
    const [verb, ...rest] = args;
    assert.equal(verb, 'config', `only git config is run: ${args.join(' ')}`);
    if (rest[0] === '--get') {
      const value = scopes.local[rest[1]] ?? scopes.global[rest[1]];
      if (value === undefined) throw unset();
      return `${value}\n`;
    }
    const scope = rest[0] === '--local' ? scopes.local : rest[0] === '--global' ? scopes.global : null;
    assert.ok(scope, `a write names its scope: ${args.join(' ')}`);
    if (rest[1] === '--get') {
      if (scope[rest[2]] === undefined) throw unset();
      return `${scope[rest[2]]}\n`;
    }
    if (rest[1] === '--unset') {
      if (scope[rest[2]] === undefined) throw unset();
      delete scope[rest[2]];
      return '';
    }
    scope[rest[1]] = rest[2];
    return '';
  };
  return { git, calls, scopes };
}

/** `main` over `git`, its printed and refused lines captured. */
function run(argv, git) {
  const out = [];
  const err = [];
  const code = main(argv, { git, log: (line) => out.push(line), error: (line) => err.push(line) });
  return { code, out, err };
}

test('three answers, three values', () => {
  for (const name of ['github', 'gitlab', 'none']) {
    const global = fakeGit();
    assert.equal(run([name], global.git).code, 0, name);
    assert.deepEqual(global.scopes, { global: { 'pilot.host': name }, local: {} }, `${name} is written globally`);

    const local = fakeGit();
    assert.equal(run([name, '--local'], local.git).code, 0, `${name} --local`);
    assert.deepEqual(local.scopes, { global: {}, local: { 'pilot.host': name } }, `${name} --local is written in the repository`);
    assert.equal(run([], local.git).out.join('\n'), name, 'the host in force is the one written');
  }
});

test('a fourth name is refused', () => {
  for (const argv of [['gitea'], ['gitea', '--local'], ['GitHub'], ['github ; rm -rf ~'], ['--global']]) {
    const { git, calls, scopes } = fakeGit();
    const { code, err } = run(argv, git);
    assert.notEqual(code, 0, argv.join(' '));
    assert.match(err.join('\n'), /pilot\.host|usage: pilot host/, argv.join(' '));
    assert.deepEqual(calls, [], `${argv.join(' ')}: git is never called`);
    assert.deepEqual(scopes, { global: {}, local: {} });
  }
  const { code, err } = run(['gitea'], fakeGit().git);
  assert.equal(code, 1);
  assert.match(err.join('\n'), /pilot\.host/);
});

test('no name prints the host in force', () => {
  const unset = fakeGit();
  const { code, out } = run([], unset.git);
  assert.equal(code, 0);
  assert.deepEqual(out, ['github']);
  assert.ok(unset.calls.every((args) => !args.includes('--unset') && args.length <= 4 && args.includes('--get')), 'printing writes nothing');

  assert.deepEqual(run([], fakeGit({ global: { 'pilot.host': 'gitlab' } }).git).out, ['gitlab']);
  assert.deepEqual(run([], fakeGit({ global: { 'pilot.host': 'gitlab' }, local: { 'pilot.host': 'none' } }).git).out, ['none']);

  const bad = run([], fakeGit({ global: { 'pilot.host': 'gitea' } }).git);
  assert.equal(bad.code, 1);
  assert.match(bad.err.join('\n'), /pilot\.host/);
});

test('uninstall unsets the global host and leaves an unset one alone', async () => {
  const set = fakeGit({ global: { 'pilot.host': 'gitlab' }, local: { 'pilot.host': 'none' } });
  const deps = { prefix: '/nowhere', platform: 'linux', deckPid: async () => null, storeDir: '/nowhere', git: set.git };
  const steps = (await planUninstall('/nowhere-home', deps)).filter((step) => step.what === 'the pilot.host setting');
  assert.equal(steps.length, 1);
  assert.equal(steps[0].action, 'remove');
  assert.deepEqual(applyPlan(steps), ['unset pilot.host (gitlab) in your global git config']);
  assert.deepEqual(set.scopes, { global: {}, local: { 'pilot.host': 'none' } }, 'only the global value goes');

  const none = fakeGit();
  const planned = await planUninstall('/nowhere-home', { ...deps, git: none.git });
  assert.deepEqual(planned.filter((step) => step.what === 'the pilot.host setting'), []);
});
