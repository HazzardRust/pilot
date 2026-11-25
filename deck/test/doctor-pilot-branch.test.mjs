/**
 * `pilot doctor`'s pilot branch row (user-pilot-branch S7, spec 7). The git config and the host's login are fakes;
 * nothing here reaches a host. Each test deletes `PILOT_BRANCH` (the gate pins it) and restores it after.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { pilotBranchRow } from '../doctor.mjs';

/** A `git` over a config holding `stored` (null: unset, exit 1); it records every call and refuses a write. */
function gitStoring(stored) {
  const calls = [];
  const git = (args) => {
    calls.push(args);
    assert.deepEqual(args, ['config', '--local', '--get', 'pilot.branch'], 'doctor only reads pilot.branch');
    if (stored === null) throw Object.assign(new Error('no value'), { status: 1 });
    return `${stored}\n`;
  };
  return { git, calls };
}

const hostWith = (login) => ({ login: () => login });

/** Runs `body` with `PILOT_BRANCH` set to `value` (undefined: deleted), then restores the old one. */
function withEnv(value, body) {
  const old = process.env.PILOT_BRANCH;
  if (value === undefined) delete process.env.PILOT_BRANCH;
  else process.env.PILOT_BRANCH = value;
  try {
    return body();
  } finally {
    if (old === undefined) delete process.env.PILOT_BRANCH;
    else process.env.PILOT_BRANCH = old;
  }
}

test('a stored name passes', () => {
  withEnv(undefined, () => {
    const { git } = gitStoring('hazzardrust-pilot');
    const row = pilotBranchRow({ git, host: hostWith('HazzardRust') });
    assert.equal(row.name, 'pilot branch');
    assert.equal(row.verdict, 'pass');
    assert.equal(row.detail, 'hazzardrust-pilot (stored)');
  });
});

test('an env override passes and says so', () => {
  withEnv('x-pilot', () => {
    const { git, calls } = gitStoring('hazzardrust-pilot');
    const row = pilotBranchRow({ git, host: hostWith('Other') });
    assert.equal(row.verdict, 'pass');
    assert.equal(row.detail, 'x-pilot (PILOT_BRANCH)');
    assert.deepEqual(calls, [], 'an env name reads no config');
  });
});

test('a switched account warns, never switches', () => {
  withEnv(undefined, () => {
    const { git, calls } = gitStoring('hazzardrust-pilot');
    const row = pilotBranchRow({ git, host: hostWith('Other') });
    assert.equal(row.verdict, 'warn');
    assert.match(row.detail, /hazzardrust-pilot/);
    assert.match(row.detail, /Other/);
    assert.ok(calls.every((args) => args.includes('--get')), 'nothing was written');
  });
});

test('no name and signed out fails with the steps', () => {
  withEnv(undefined, () => {
    const { git } = gitStoring(null);
    const row = pilotBranchRow({ git, host: hostWith(null) });
    assert.equal(row.verdict, 'fail');
    const steps = row.steps.join('\n');
    assert.match(steps, /gh auth login/);
    assert.match(steps, /git config pilot\.branch/);
  });
});

test('no name but signed in warns that the next base derives it, writing nothing', () => {
  withEnv(undefined, () => {
    const { git, calls } = gitStoring(null);
    const row = pilotBranchRow({ git, host: hostWith('Other') });
    assert.equal(row.verdict, 'warn');
    assert.match(row.detail, /none stored yet/);
    assert.equal(calls.length, 1);
  });
});

test('a stored name off the shape fails naming the key', () => {
  withEnv(undefined, () => {
    const { git } = gitStoring('main');
    const row = pilotBranchRow({ git, host: hostWith('Other') });
    assert.equal(row.verdict, 'fail');
    assert.match(row.detail, /pilot\.branch/);
  });
});

test('no host and no name fails with the no-name line', () => {
  withEnv(undefined, () => {
    const { git } = gitStoring(null);
    const row = pilotBranchRow({ git, host: null });
    assert.equal(row.verdict, 'fail');
    assert.match(row.detail, /no pilot branch name/);
  });
});

test('a login that throws is read as signed out', () => {
  withEnv(undefined, () => {
    const { git } = gitStoring('hazzardrust-pilot');
    const host = { login: () => { throw new Error('gh exploded'); } };
    const row = pilotBranchRow({ git, host });
    assert.equal(row.verdict, 'pass');
    assert.equal(row.detail, 'hazzardrust-pilot (stored)');
  });
});

test('a bad PILOT_BRANCH fails with a step that fixes the env', () => {
  withEnv('Main', () => {
    const { git } = gitStoring('hazzardrust-pilot');
    const row = pilotBranchRow({ git, host: hostWith('Other') });
    assert.equal(row.verdict, 'fail');
    assert.match(row.detail, /PILOT_BRANCH/);
    assert.match(row.steps.join('\n'), /unset PILOT_BRANCH/);
  });
});

test('the legacy name is no mismatch', () => {
  withEnv(undefined, () => {
    const { git } = gitStoring('pilot');
    const row = pilotBranchRow({ git, host: hostWith('Other') });
    assert.equal(row.verdict, 'pass');
  });
});
