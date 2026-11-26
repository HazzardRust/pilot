/**
 * The landing runs the full suite unless green CI proved a tree (suite-at-landing spec 3, 7, L8;
 * cheap-suite spec 5, L7, A2): with no proof the feature merge passes `mergeIntoPilot` no `since`,
 * so a repository with a `test:changed` script still runs `npm test` once, and the comment on the
 * feature PR carries that run's counts; with a proof it passes the proved tree, and the selection
 * runs since it. `gh` is faked; the landing runs against a scratch bare "origin".
 */

import { gitFixture } from './lib/git-fixture.mjs';
import { buildRepos, repos, land, fakeGh, git, commitFile, mainSays } from './lib/land-repos.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const { comment } = await import('../land.mjs');

const bodyOf = (calls) => calls.find((args) => args[1] === 'comment')?.[4];

test('no counts, the old comment', () => {
  const { host, calls } = fakeGh([{ number: 7, headRefName: 'feat/a' }]);

  comment({ host, head: 'feat/a', sha: 'abc1234', counts: null });

  assert.equal(bodyOf(calls), 'landed on pilot at abc1234');
});

test('the feature merge is the full run', (t) => {
  const { gitIn, a: work } = repos(t, 'a');
  const trace = path.join(path.dirname(work), 'suite-trace.txt');
  // A package with no dependencies: `npm ci` has nothing to fetch. Each script logs how it was called.
  commitFile(work, 'run.mjs', `import fs from 'node:fs';\nfs.appendFileSync(${JSON.stringify(trace)}, process.argv.slice(2).join(' ') + '\\n');\nconsole.log('ℹ pass 12');\nconsole.log('ℹ fail 0');\n`, 'run');
  const pkg = { name: 'fixture', version: '1.0.0', scripts: { test: 'node run.mjs full', 'test:changed': 'node run.mjs changed' } };
  commitFile(work, 'package.json', `${JSON.stringify(pkg, null, 2)}\n`, 'package');
  commitFile(work, 'package-lock.json', `${JSON.stringify({ name: 'fixture', version: '1.0.0', lockfileVersion: 3, requires: true, packages: { '': { name: 'fixture', version: '1.0.0' } } }, null, 2)}\n`, 'lock');
  git(work, 'push', '-q', 'origin', 'feat/a');
  const { host, calls } = fakeGh([{ number: 7, headRefName: 'feat/a' }]);

  const result = land({ cwd: work, git: gitIn(work), host });

  assert.equal(result.commentFailed, undefined);
  const runs = fs.readFileSync(trace, 'utf8').trim().split('\n');
  assert.equal(runs.filter((line) => line.startsWith('full')).length, 1, 'npm test ran once');
  assert.ok(runs.every((line) => !line.startsWith('changed')), 'no test:changed run');
  assert.ok(runs.every((line) => !line.includes('--since')), 'no --since');
  assert.equal(bodyOf(calls), `landed on pilot at ${result.sha}; full suite 12 pass, 0 fail`);
});

/**
 * A pilot already holding a package whose `test` and `test:changed` scripts log how they were
 * called, and `feat/a` cut from it changing only `a.txt`, so no trigger file stands in the feature's diff.
 */
function suiteOnPilot(t) {
  // Built once per file and restored per test (test-body-git S11): four tests start from it.
  return gitFixture(t, 'land-suite:on-pilot', (dir) => {
    const { seed, clone } = buildRepos(dir, []);
    const trace = path.join(dir, 'suite-trace.txt');
    commitFile(seed, 'run.mjs', `import fs from 'node:fs';\nfs.appendFileSync(${JSON.stringify(trace)}, process.argv.slice(2).join(' ') + '\\n');\nconsole.log('ℹ pass 12');\nconsole.log('ℹ fail 0');\n`, 'run');
    const pkg = { name: 'fixture', version: '1.0.0', scripts: { test: 'node run.mjs full', 'test:changed': 'node run.mjs changed' } };
    commitFile(seed, 'package.json', `${JSON.stringify(pkg, null, 2)}\n`, 'package');
    commitFile(seed, 'package-lock.json', `${JSON.stringify({ name: 'fixture', version: '1.0.0', lockfileVersion: 3, requires: true, packages: { '': { name: 'fixture', version: '1.0.0' } } }, null, 2)}\n`, 'lock');
    git(seed, 'push', '-q', 'origin', 'main', 'main:pilot');
    const work = clone('a');
    return { work, trace, tree: git(work, 'rev-parse', 'HEAD^{tree}') };
  });
}

const OSES = ['ubuntu-latest', 'windows-latest', 'macos-latest'];

/** `host` with its `testedTrees` answering one row per OS on `tree`, each concluding `conclusion(os)`. */
const proving = (host, tree, conclusion = () => 'success') => ({ ...host, testedTrees: () => OSES.map((os) => ({ name: `gate (${os})`, conclusion: conclusion(os), tree })) });

test('a proved landing runs the selection since the proved tree', (t) => {
  const { work, trace, tree } = suiteOnPilot(t);
  const { host, calls } = fakeGh([{ number: 7, headRefName: 'feat/a' }]);

  const said = mainSays([], { cwd: work, git: (args) => git(work, ...args), host: proving(host, tree) });

  assert.equal(said.code, 0, said.out);
  assert.deepEqual(fs.readFileSync(trace, 'utf8').trim().split('\n'), [`changed --since=${tree}`]);
  assert.match(said.out, new RegExp(`^ci proved ${tree.slice(0, 7)} on 3 jobs$`, 'm'));
  assert.match(bodyOf(calls), new RegExp(`; ci proved ${tree.slice(0, 7)} on 3 jobs, then 12 pass, 0 fail$`), 'the PR is not told the full suite ran');
});

test('a feature that changes .github/ since pilot is never proved, even on a green tree', (t) => {
  const { work, trace } = suiteOnPilot(t);
  fs.mkdirSync(path.join(work, '.github'));
  commitFile(work, '.github/ci.yml', 'on: push\n', 'ci');
  git(work, 'push', '-q', 'origin', 'feat/a');
  const { host } = fakeGh([{ number: 7, headRefName: 'feat/a' }]);

  const said = mainSays([], { cwd: work, git: (args) => git(work, ...args), host: proving(host, git(work, 'rev-parse', 'HEAD^{tree}')) });

  assert.equal(said.code, 0, said.out);
  assert.deepEqual(fs.readFileSync(trace, 'utf8').trim().split('\n'), ['full']);
  assert.match(said.out, /^no ci proof: \.github\/ci\.yml changed$/m);
});

test('a proof that cannot be read is no proof: the landing runs the full suite and says why', (t) => {
  const { work, trace, tree } = suiteOnPilot(t);
  const { host } = fakeGh([{ number: 7, headRefName: 'feat/a' }]);
  // The first read of pilot's tip, the proof's base, answers no sha: provenTree throws before it asks the host.
  let first = true;
  const garbled = (args) => {
    const said = git(work, ...args);
    // The tip read is the for-each-ref snapshot's pilot line (land-batching S2); garble that line, first snapshot only.
    if (!first || args[0] !== 'for-each-ref' || !/ refs\/remotes\/origin\/pilot$/m.test(said)) return said;
    return ((first = false), said.replace(/^\S+(?= refs\/remotes\/origin\/pilot$)/m, 'not-a-sha'));
  };

  const said = mainSays([], { cwd: work, git: garbled, host: proving(host, tree) });

  assert.equal(first, false, "the proof read pilot's tip");
  assert.equal(said.code, 0, said.out);
  assert.deepEqual(fs.readFileSync(trace, 'utf8').trim().split('\n'), ['full']);
  assert.match(said.out, /^no ci proof: checks: "not-a-sha" is not a full commit sha$/m);
});

test('an unproved landing runs the full suite', (t) => {
  const { work, trace, tree } = suiteOnPilot(t);
  const { host } = fakeGh([{ number: 7, headRefName: 'feat/a' }]);
  const failing = proving(host, tree, (os) => (os === 'windows-latest' ? 'failure' : 'success'));

  const said = mainSays([], { cwd: work, git: (args) => git(work, ...args), host: failing });

  assert.equal(said.code, 0, said.out);
  assert.deepEqual(fs.readFileSync(trace, 'utf8').trim().split('\n'), ['full']);
  assert.match(said.out, /^no ci proof: gate \(windows-latest\) concluded failure$/m);
});
