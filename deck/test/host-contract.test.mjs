// other-host S1, spec 2, 3, 6; L1, L2, L5, A1, A2. The Host contract: `hostFor` reads `pilot.host`, and every verb
// of an adapter returns its shape over a fake CLI `run`. Nothing here reaches GitHub; `ghRun`'s refusal runs under
// the gh stub, so a process start would be seen.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { HOST_NAMES, hostFor } from '../host.mjs';
import { ghRun, githubHost } from '../host-github.mjs';
import { ghStub } from '../../scripts/gh-stub.mjs';

/** A fake `git` whose `config --get pilot.host` answers `value`, or exits 1 when it is undefined. */
const gitWith = (value) => (args) => {
  assert.deepEqual(args, ['config', '--get', 'pilot.host']);
  if (value === undefined) throw Object.assign(new Error('unset'), { status: 1 });
  return `${value}\n`;
};

test('unset reads as github, none as null', () => {
  const run = () => assert.fail('no CLI starts while choosing the host');
  assert.deepEqual(HOST_NAMES, ['github', 'gitlab', 'none']);
  assert.equal(hostFor('.', { git: gitWith(undefined), run }).name, 'github');
  assert.equal(hostFor('.', { git: gitWith('github'), run }).cli, 'gh');
  assert.equal(hostFor('.', { git: gitWith('none'), run }), null);
  assert.throws(() => hostFor('.', { git: gitWith('gitea'), run }), /pilot\.host.*"gitea"/);
  assert.throws(() => hostFor('.', { git: gitWith('github; rm -rf /'), run }), /pilot\.host/);
});

/** A PR as `gh pr list|view --json` prints it. */
const ghPr = (number, state, extra = {}) => ({
  number, state, baseRefName: 'pilot', headRefName: `feat/${number}`, headRefOid: 'a'.repeat(40),
  title: `t${number}`, body: 'b', url: `https://github.com/o/r/pull/${number}`, isCrossRepository: false, ...extra,
});

/** A fake `gh` answering every verb's argv as gh would, recording each call. */
function fakeGh() {
  const calls = [];
  const comments = [];
  const run = (args) => {
    calls.push(args);
    const [group, verb] = args;
    if (group === 'api' && args[1] === 'user') return 'alice\n';
    if (group === 'api') return '{}';
    if (group === 'label') return '';
    if (verb === 'list') return JSON.stringify([ghPr(1, 'OPEN'), ghPr(2, 'MERGED'), ghPr(3, 'CLOSED')]);
    if (verb === 'view' && args.includes('comments')) return JSON.stringify({ comments });
    if (verb === 'view') return JSON.stringify(ghPr(Number(args[2]), 'MERGED'));
    if (verb === 'create') return 'https://github.com/o/r/pull/41\n';
    if (verb === 'comment') {
      const body = fs.readFileSync(args[args.indexOf('--body-file') + 1], 'utf8');
      comments.push({ viewerDidAuthor: true, body, url: `https://github.com/o/r/pull/${args[2]}#issuecomment-900` });
      return '';
    }
    if (verb === 'edit') return '';
    throw new Error(`unexpected gh ${args.join(' ')}`);
  };
  return { run, calls };
}

const isReview = (review) => {
  assert.deepEqual(Object.keys(review).sort(), ['base', 'body', 'crossRepo', 'head', 'headSha', 'number', 'state', 'title', 'url']);
  assert.ok(['open', 'merged', 'closed'].includes(review.state), review.state);
  assert.ok(Number.isSafeInteger(review.number));
};

const CONTRACT = [
  ['whoami', (host) => host.whoami(), (said) => assert.equal(said, 'alice')],
  ['reviews', (host) => host.reviews({ state: 'all' }), (said) => { assert.equal(said.length, 3); said.forEach(isReview); assert.deepEqual(said.map((r) => r.state), ['open', 'merged', 'closed']); }],
  ['reviews mine by head', (host) => host.reviews({ head: 'feat/1', state: 'open', mine: true, limit: 5 }), (said) => said.forEach(isReview)],
  ['review', (host) => host.review(7), (said) => { isReview(said); assert.equal(said.number, 7); }],
  ['open', (host) => host.open({ base: 'pilot', head: 'feat/x', title: 'T', body: 'B', draft: true, label: 'release' }), (said) => assert.equal(said, 41)],
  ['edit', (host) => host.edit(7, { base: 'pilot', title: 'T', body: 'B', label: 'release' }), (said) => assert.equal(said, undefined)],
  ['comment', (host) => host.comment(7, 'landed'), (said) => assert.equal(said, undefined)],
  ['upsertComment', (host) => host.upsertComment(7, '<!-- m -->', 'text'), (said) => assert.equal(said, 'posted')],
  ['signedIn', (host) => host.signedIn(), (said) => assert.equal(said, true)],
];

test('every verb returns its shape', () => {
  for (const [verb, call, check] of CONTRACT) {
    const { run, calls } = fakeGh();
    const host = githubHost(run);
    assert.equal(host.name, 'github');
    check(call(host));
    assert.ok(calls.length > 0, `${verb} asks the CLI`);
    assert.ok(calls.every((args) => Array.isArray(args) && args.every((arg) => typeof arg === 'string')), `${verb}: argv only`);
  }
  const signedOut = githubHost(() => { throw Object.assign(new Error('not logged in'), { status: 1 }); });
  assert.equal(signedOut.signedIn(), false);
  const odd = githubHost(() => JSON.stringify([ghPr(1, 'DRAFT')]));
  assert.throws(() => odd.reviews({ state: 'open' }), /DRAFT/, 'a state off the three is refused, never guessed');
});

test('the upsert edits its own comment', () => {
  const { run, calls } = fakeGh();
  const host = githubHost(run);
  assert.equal(host.upsertComment(7, '<!-- pilot:qa -->', 'first'), 'posted');
  assert.equal(host.upsertComment(7, '<!-- pilot:qa -->', 'second'), 'edited');
  const writes = calls.filter((args) => args[1] !== 'view');
  assert.deepEqual(writes.map((args) => args.slice(0, 2)), [['pr', 'comment'], ['api', 'repos/o/r/issues/comments/900']]);
  assert.deepEqual(writes[1].slice(2), ['--method', 'PATCH', '-f', 'body=<!-- pilot:qa -->\nsecond']);
});

test('the allowlist still refuses', (t) => {
  const stub = ghStub();
  const saved = { PATH: process.env.PATH, NODE_OPTIONS: process.env.NODE_OPTIONS };
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(stub.dir, { recursive: true, force: true });
  });
  Object.assign(process.env, stub.env);
  const gh = ghRun(stub.dir);
  assert.throws(() => gh(['pr', 'merge', '7']), /gh pr merge: not a host verb/);
  assert.throws(() => gh(['auth', 'token']), /gh auth token: not a host verb/);
  assert.equal(fs.existsSync(path.join(stub.dir, 'calls.jsonl')), false, '0 processes started');
});
