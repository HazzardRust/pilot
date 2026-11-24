/**
 * classifier-env S1: a Start tells the auto-mode classifier about the pilot's environment
 * (spec 1-5; L1-L4, A1-A3). Every call passes `env` and a scratch `home`, so neither the
 * real environment (a shell with the off switch set) nor the real home is ever read.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { CLASSIFIER_ENVIRONMENT, CLASSIFIER_SWITCH, runSettings, startArgs } from '../run-env.mjs';

const LEVELS = ['nothing', 'rules', 'everything'];
const ON = Object.freeze({});
const OFF = Object.freeze({ [CLASSIFIER_SWITCH]: 'off' });

/** A scratch directory of the test's own, removed after it. */
const scratch = (t, prefix = 'pilot-classifier-') => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};

/** The settings file a Start wrote, parsed, given the argv it answered. */
const writtenSettings = (args) => JSON.parse(fs.readFileSync(args[args.indexOf('--settings') + 1], 'utf8'));

test('every level writes the pilot lines after the defaults', (t) => {
  const home = scratch(t);
  for (const level of LEVELS) {
    const { environment } = runSettings(level, undefined, { home, env: ON }).settings.autoMode;
    assert.equal(environment[0], '$defaults', level);
    assert.deepEqual(environment.slice(1), [...CLASSIFIER_ENVIRONMENT], level);
  }
  assert.ok(
    CLASSIFIER_ENVIRONMENT.some((line) => line.includes('<repo>-*') && /git worktree/.test(line)),
    'one line names <repo>-* and git worktree',
  );
  assert.ok(
    CLASSIFIER_ENVIRONMENT.some((line) => /git-ignored/.test(line) && /build output/.test(line)),
    'one line names git-ignored build output',
  );
});

test('the prose is the same from any repo', (t) => {
  const was = process.cwd();
  t.after(() => process.chdir(was));
  const blocks = ['alpha', 'beta & co'].map((name) => {
    const repo = path.join(scratch(t), name);
    fs.mkdirSync(repo);
    process.chdir(repo);
    const settings = writtenSettings(startArgs({ level: 'nothing' }, { home: scratch(t, `pilot-home-${name.length}-`), env: ON }));
    return JSON.stringify(settings.autoMode);
  });
  assert.ok(blocks[0].includes('$defaults'), 'the block is written');
  assert.equal(blocks[1], blocks[0]);
});

test('it loosens no rule', (t) => {
  const { autoMode } = runSettings('nothing', undefined, { home: scratch(t), env: ON }).settings;
  assert.deepEqual(Object.keys(autoMode), ['environment']);
  assert.ok(Object.isFrozen(CLASSIFIER_ENVIRONMENT), 'the lines cannot be changed at run time');
  assert.ok(CLASSIFIER_ENVIRONMENT.length > 0);
  for (const line of CLASSIFIER_ENVIRONMENT) {
    if (/\bdelet|\bremov|\brm\b/i.test(line)) {
      assert.match(line, /git-ignored/, line);
      assert.match(line, /worktree/, line);
    }
    assert.doesNotMatch(line, /rm -rf|any file/i, line);
    assert.doesNotMatch(line, /[\\/~]|\b[A-Za-z]:[\\/]/, `no path: ${line}`);
  }
});

test("the user's settings are untouched", (t) => {
  const home = scratch(t);
  const userFile = path.join(home, '.claude', 'settings.json');
  fs.mkdirSync(path.dirname(userFile), { recursive: true });
  fs.writeFileSync(userFile, `${JSON.stringify({ autoMode: { environment: ['**Trusted repo**: the user\'s own line'] } }, null, 2)}\n`);
  const before = fs.readFileSync(userFile);

  const settings = writtenSettings(startArgs({ level: 'nothing' }, { home, env: ON }));

  assert.ok(settings.autoMode, 'the Start wrote its own block');
  assert.ok(fs.readFileSync(userFile).equals(before), 'user settings bytes unchanged');
});

test('the off switch omits the block', (t) => {
  const home = scratch(t);
  for (const level of LEVELS) {
    const on = runSettings(level, undefined, { home, env: ON });
    const off = runSettings(level, undefined, { home, env: OFF });
    assert.equal('autoMode' in off.settings, false, level);
    const { autoMode, ...rest } = on.settings;
    assert.ok(autoMode, level);
    assert.deepEqual(off, { ...on, settings: rest }, level);
  }
  const written = writtenSettings(startArgs({ level: 'rules' }, { home, env: OFF }));
  assert.equal('autoMode' in written, false, 'the Start threads env to the file');
});
