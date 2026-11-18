/**
 * S4 of other-host: at `pilot.host none` a feature lands with no host CLI (spec 3; A1). `pilot land`
 * comments on nothing, retargets nothing and says main gets pilot by a merge by hand. `gh` is the
 * PATH stub (ADR 0173), so a start is counted, never sent to GitHub.
 */

import { repos, passing, mainSays, git } from './lib/land-repos.mjs';

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { ghStub } from '../gh-stub.mjs';

const stubs = [];
after(() => stubs.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

test('none lands quietly', (t) => {
  const stub = ghStub();
  stubs.push(stub.dir);
  const saved = { PATH: process.env.PATH, NODE_OPTIONS: process.env.NODE_OPTIONS };
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  Object.assign(process.env, stub.env);
  const { origin, gitIn, a } = repos(t, 'a');
  git(a, 'config', 'pilot.host', 'none');

  const said = mainSays([], { cwd: a, git: gitIn(a), test: passing, wait: 0 });

  assert.equal(said.code, 0, said.out);
  assert.match(said.out, /^landed feat\/a on pilot at /m);
  assert.equal(git(origin, 'log', '-1', '--format=%s', 'pilot'), 'Merge feat/a into pilot');
  const calls = path.join(stub.dir, 'calls.jsonl');
  assert.equal(fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8') : '', '', 'no host CLI starts at none');
  assert.doesNotMatch(said.out, /comment failed/);
  assert.equal(said.out.trimEnd().split('\n').at(-1), 'main gets pilot: merge pilot into main by hand');
});
