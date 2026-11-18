/**
 * `pilot doctor`'s host row (other-host S9, spec 1 and 6). The git config and the host CLI's answers are fakes;
 * nothing here runs `gh` or `glab`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { checkAll } from '../doctor.mjs';
import { hostFor } from '../host.mjs';

const TOKEN_LINE = 'Token: ghp_SECRET0123456789abcdefghijklmnopqrstuv';

function passing(overrides = {}) {
  return {
    platform: 'linux',
    run: () => assert.fail('no Defender probe off Windows'),
    root: '/home/dev/projects',
    nodeVersion: '22.8.0',
    engines: '>=22.8.0',
    resolveDep: () => true,
    storeDir: '/home/dev/.claude/pilot',
    canWrite: () => true,
    onPath: () => true,
    probe: async () => ({ state: 'none' }),
    readSettings: () => ({}),
    ...overrides,
  };
}

/** A `git` over a config of `host` (null: unset, `git config --get` exits 1). */
const gitConfigured = (host) => (args) => {
  assert.deepEqual(args, ['config', '--get', 'pilot.host']);
  if (host === null) throw Object.assign(new Error('no value'), { status: 1 });
  return `${host}\n`;
};

/** The real adapters over a fake CLI runner that prints `out` on stdout and exits `ok`. */
const hostOver = (out, ok = true) => (cwd, { git }) =>
  hostFor(cwd, {
    git,
    run: () => {
      if (!ok) throw new Error('not signed in');
      return out;
    },
  });

test('none checks no host CLI', async () => {
  const asked = [];
  const rows = await checkAll(passing({ git: gitConfigured('none'), onPath: (cmd) => (asked.push(cmd), true) }));
  const host = rows.filter((r) => r.name === 'host');
  assert.equal(host.length, 1);
  assert.equal(host[0].verdict, 'pass');
  assert.match(host[0].detail, /none/);
  assert.ok(!asked.includes('gh') && !asked.includes('glab'), asked.join());
  assert.ok(!rows.some((r) => /^(gh|glab)\b/.test(r.name)), rows.map((r) => r.name).join());
});

test('gitlab names glab', async () => {
  const rows = await checkAll(passing({ git: gitConfigured('gitlab'), onPath: (cmd) => cmd !== 'glab' }));
  const host = rows.find((r) => r.name === 'host');
  assert.equal(host.verdict, 'fail');
  assert.match(`${host.detail} ${(host.steps ?? []).join(' ')}`, /glab/);
});

test('signed in prints no token', async () => {
  const rows = await checkAll(passing({ git: gitConfigured(null), hostFor: hostOver(TOKEN_LINE) }));
  const host = rows.find((r) => r.name === 'host');
  assert.equal(host.verdict, 'pass');
  // The forge by name, never `undefined` (QA: the row read the adapter's dropped `name`).
  assert.equal(host.detail, 'github: gh signed in');
  assert.ok(!JSON.stringify(rows).includes('ghp_'), JSON.stringify(host));
});

test('a failing probe whose error carries a token prints none of it', async () => {
  const leaky = (cwd, { git }) =>
    hostFor(cwd, {
      git,
      run: () => {
        throw Object.assign(new Error(TOKEN_LINE), { stderr: TOKEN_LINE });
      },
    });
  const rows = await checkAll(passing({ git: gitConfigured('gitlab'), hostFor: leaky }));
  assert.equal(rows.find((r) => r.name === 'host').verdict, 'fail');
  assert.ok(!JSON.stringify(rows).includes('ghp_'));
});

test('github off PATH fails naming gh', async () => {
  const rows = await checkAll(passing({ git: gitConfigured('github'), onPath: (cmd) => cmd !== 'gh' }));
  const host = rows.find((r) => r.name === 'host');
  assert.equal(host.verdict, 'fail');
  assert.match(host.detail, /gh/);
});

test('an unreadable PATH answer cannot tell', async () => {
  const rows = await checkAll(passing({ git: gitConfigured('github'), onPath: (cmd) => (cmd === 'gh' ? null : true) }));
  assert.equal(rows.find((r) => r.name === 'host').verdict, 'cannot tell');
});

test('a bad pilot.host value fails the row and names the key', async () => {
  const rows = await checkAll(passing({ git: gitConfigured('bitbucket') }));
  const host = rows.find((r) => r.name === 'host');
  assert.equal(host.verdict, 'fail');
  assert.match(host.detail, /pilot\.host/);
});

test('not signed in fails and names the CLI', async () => {
  const rows = await checkAll(passing({ git: gitConfigured('github'), hostFor: hostOver('', false) }));
  const host = rows.find((r) => r.name === 'host');
  assert.equal(host.verdict, 'fail');
  assert.match(`${host.detail} ${(host.steps ?? []).join(' ')}`, /gh/);
});
