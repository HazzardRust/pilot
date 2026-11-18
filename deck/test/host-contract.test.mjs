// other-host S1, spec 2, 3, 6; L1, L2, L5, A1, A2. The Host contract: `hostFor` reads `pilot.host`, and every verb
// of an adapter returns its shape over a fake CLI `run`. Nothing here reaches GitHub; `ghRun`'s refusal runs under
// the gh stub, so a process start would be seen.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { HOST_NAMES, hostFor } from '../host.mjs';
import { ghRun, githubHost } from '../host-github.mjs';
import { gitlabHost, glabRun } from '../host-gitlab.mjs';
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

/** Puts a fresh gh stub first on PATH for this test, so a process start is recorded; answers its dir. */
function stubbed(t) {
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
  return stub.dir;
}

test('every verb returns its shape', (t) => {
  const sent = [];
  for (const [, call, check] of CONTRACT) {
    const { run, calls } = fakeGh();
    const host = githubHost(run);
    assert.equal(host.name, 'github');
    check(call(host));
    sent.push(...calls);
  }
  // Every argv the adapter sent passes the real allowlist: a refused one throws here, before any process starts.
  const gh = ghRun(stubbed(t));
  for (const args of sent) gh(args);
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
  // The fake's PATCH stores nothing, so it still holds `first`: the same text again writes nothing.
  assert.equal(host.upsertComment(7, '<!-- pilot:qa -->', 'first'), 'none');
  const writes = calls.filter((args) => args[1] !== 'view');
  assert.deepEqual(writes.map((args) => args.slice(0, 2)), [['pr', 'comment'], ['api', 'repos/o/r/issues/comments/900']]);
  assert.deepEqual(writes[1].slice(2), ['--method', 'PATCH', '-f', 'body=<!-- pilot:qa -->\nsecond']);
});

// The gitlab column (S7, spec 4, 6; A3): `glab api` REST v4 answers, written from the docs into fixtures/glab/
// and replaced by recorded ones in QA's live run.
const fixture = (name) => JSON.parse(fs.readFileSync(new URL(`fixtures/glab/${name}.json`, import.meta.url), 'utf8'));

/** A fake `glab` answering each `api` call by method and path from the fixtures, recording `{ args, input }`. */
function fakeGlab() {
  const calls = [];
  const notes = fixture('notes');
  const run = (args, input) => {
    calls.push({ args, input });
    if (args[0] === 'auth') return '';
    const at = args.indexOf('-X');
    const method = at === -1 ? 'GET' : args[at + 1];
    const [route] = args.at(-1).split('?');
    if (route === 'user') return JSON.stringify(fixture('user'));
    if (route === 'projects/:id/merge_requests') {
      if (method === 'GET') return JSON.stringify(fixture('merge_requests'));
      const asked = JSON.parse(input);
      return JSON.stringify({ ...fixture('merge_request'), iid: 41, state: 'opened', title: asked.title });
    }
    const one = /^projects\/:id\/merge_requests\/(\d+)$/.exec(route);
    if (one) return JSON.stringify({ ...fixture('merge_request'), iid: Number(one[1]) });
    if (/\/notes$/.test(route) && method === 'GET') return JSON.stringify(notes);
    if (/\/notes$/.test(route) && method === 'POST') {
      const note = { ...fixture('note'), body: JSON.parse(input).body };
      notes.push(note);
      return JSON.stringify(note);
    }
    if (/\/notes\/\d+$/.test(route) && method === 'PUT') return JSON.stringify(fixture('note'));
    throw new Error(`unexpected glab ${args.join(' ')}`);
  };
  return { run, calls };
}

/** Puts a fresh `glab` stub (node, linked as glab) first on PATH for this test, recording each start; answers its dir. */
function glabStubbed(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-glab-stub-'));
  const exe = path.join(dir, process.platform === 'win32' ? 'glab.exe' : 'glab');
  try {
    fs.linkSync(process.execPath, exe);
  } catch {
    fs.copyFileSync(process.execPath, exe);
  }
  const stub = path.join(dir, 'stub.cjs');
  fs.writeFileSync(stub, `const fs = require('node:fs');
const path = require('node:path');
if (/^glab(\\.exe)?$/i.test(path.basename(process.execPath))) {
  fs.appendFileSync(path.join(__dirname, 'calls.jsonl'), JSON.stringify(process.argv.slice(1)) + '\\n');
  process.exit(0);
}
`);
  const saved = { PATH: process.env.PATH, NODE_OPTIONS: process.env.NODE_OPTIONS };
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
  process.env.PATH = `${dir}${path.delimiter}${process.env.PATH ?? ''}`;
  process.env.NODE_OPTIONS = `--require "${stub.replaceAll('\\', '/')}"`;
  return dir;
}

test('every verb returns its shape on gitlab', (t) => {
  assert.equal(hostFor('.', { git: gitWith('gitlab'), run: () => assert.fail('no CLI starts while choosing the host') }).cli, 'glab');
  const sent = [];
  for (const [verb, call, check] of CONTRACT) {
    const { run, calls } = fakeGlab();
    const host = gitlabHost(run);
    assert.equal(host.name, 'gitlab');
    check(call(host));
    sent.push(...calls);
    if (verb === 'reviews') assert.deepEqual(call(host).map((r) => [r.number, r.title, r.body, r.crossRepo]), [[1, 't1', 'b', false], [2, 't2', '', true], [3, 't3', '', false]]);
  }
  const mineByHead = sent.find(({ args }) => args.at(-1).includes('source_branch'));
  assert.equal(mineByHead.args.at(-1), 'projects/:id/merge_requests?state=opened&source_branch=feat%2F1&scope=created_by_me&per_page=5');
  const opened = sent.find(({ args }) => args.includes('POST') && args.at(-1) === 'projects/:id/merge_requests');
  assert.deepEqual(JSON.parse(opened.input), { source_branch: 'feat/x', target_branch: 'pilot', title: 'Draft: T', description: 'B', labels: 'release' });
  // Every argv the adapter sent passes the real allowlist: a refused one throws here, before any process starts.
  const glab = glabRun(glabStubbed(t));
  for (const { args, input } of sent) glab(args, input);
  const signedOut = gitlabHost(() => { throw Object.assign(new Error('not logged in'), { status: 1 }); });
  assert.equal(signedOut.signedIn(), false);
  const odd = gitlabHost(() => JSON.stringify([{ ...fixture('merge_request'), state: 'locked' }]));
  assert.throws(() => odd.reviews({ state: 'open' }), /locked/, 'a state off the three is refused, never guessed');
});

test('the upsert edits its own note', () => {
  const { run, calls } = fakeGlab();
  const host = gitlabHost(run);
  assert.equal(host.upsertComment(7, '<!-- pilot:qa -->', 'first'), 'posted');
  assert.equal(host.upsertComment(7, '<!-- pilot:qa -->', 'second'), 'edited');
  // The fake's PUT stores nothing, so it still holds `first`: the same text again writes nothing.
  assert.equal(host.upsertComment(7, '<!-- pilot:qa -->', 'first'), 'none');
  // bob's note carries the marker too, and the system note is alice's: neither is this account's note.
  const writes = calls.filter(({ args }) => args.includes('-X'));
  assert.deepEqual(writes.map(({ args }) => [args[2], args.at(-1)]), [['POST', 'projects/:id/merge_requests/7/notes'], ['PUT', 'projects/:id/merge_requests/7/notes/900']]);
  assert.deepEqual(writes.map(({ input }) => JSON.parse(input)), [{ body: '<!-- pilot:qa -->\nfirst' }, { body: '<!-- pilot:qa -->\nsecond' }]);
});

test('the upsert finds its note past the first page', () => {
  // 120 notes, this account's marker note the last: GitLab answers 100 a page, so it sits on page 2.
  const others = Array.from({ length: 119 }, (_, at) => ({ ...fixture('note'), id: 1000 + at, body: 'added 1 commit', system: true }));
  const all = [...others, { ...fixture('note'), id: 2000, body: '<!-- pilot:qa -->\nfirst' }];
  const writes = [];
  const host = gitlabHost((args) => {
    const target = args.at(-1);
    if (target === 'user') return JSON.stringify(fixture('user'));
    if (args.includes('-X')) {
      writes.push([args[2], target]);
      return JSON.stringify(fixture('note'));
    }
    const page = Number(new URLSearchParams(target.split('?')[1]).get('page') ?? 1);
    return JSON.stringify(all.slice((page - 1) * 100, page * 100));
  });
  assert.equal(host.upsertComment(7, '<!-- pilot:qa -->', 'second'), 'edited');
  assert.deepEqual(writes, [['PUT', 'projects/:id/merge_requests/7/notes/2000']]);
});

test('a title edit keeps a draft a draft', () => {
  for (const [draft, title] of [[true, 'Draft: T'], [false, 'T']]) {
    const puts = [];
    const host = gitlabHost((args, input) => {
      if (args.includes('PUT')) puts.push(JSON.parse(input));
      return JSON.stringify({ ...fixture('merge_request'), title: draft ? '[Draft] old' : 'old', draft });
    });
    assert.equal(host.review(7).title, 'old', 'the Review title carries no draft prefix, as on GitHub');
    host.edit(7, { title: 'T' });
    assert.deepEqual(puts, [{ title }]);
  }
});

test('off the list is refused', (t) => {
  const dir = glabStubbed(t);
  const glab = glabRun(dir);
  const body = '{"body":"x"}';
  const refused = [
    [['api', '-X', 'DELETE', 'projects/:id']],
    [['api', '-X', 'DELETE', 'projects/:id/merge_requests/7/notes/900']],
    [['api', '-X', 'PUT', '-H', 'Content-Type: application/json', '--input', '-', 'projects/:id/merge_requests/7/merge'], body],
    [['api', '-X', 'POST', '-H', 'Content-Type: application/json', '--input', '-', 'projects/:id/merge_requests/7'], body],
    [['api', '-X', 'POST', '-F', 'body=@/etc/passwd', 'projects/:id/merge_requests/7/notes']],
    [['api', '-X', 'POST', '--input', 'secrets.txt', 'projects/:id/merge_requests/7/notes']],
    [['api', '-H', 'PRIVATE-TOKEN: x', 'user']],
    [['api', '--hostname', 'evil.example', 'user']],
    [['api', 'projects/other%2Frepo/merge_requests']],
    [['api', 'projects/:id/merge_requests/../../../user/keys']],
    [['api', 'projects/:id/merge_requests', 'user']],
    [['auth', 'status', '--show-token']],
    [['auth', 'token']],
    [['mr', 'merge', '7']],
  ];
  for (const [args, input] of refused) assert.throws(() => glab(args, input), /not a host verb/, args.join(' '));
  assert.equal(fs.existsSync(path.join(dir, 'calls.jsonl')), false, '0 processes started');
  glab(['auth', 'status']);
  assert.ok(fs.existsSync(path.join(dir, 'calls.jsonl')), 'an allowed verb does start one, so the 0 above is seen');
});

test('no token is read', () => {
  const line = 'Token: glpat-AbCdEf0123456789xyz';
  const calls = [];
  const host = gitlabHost((args) => {
    calls.push(args);
    return `gitlab.com\n  ✓ Logged in to gitlab.com as alice\n  ✓ ${line}\n`;
  });
  assert.strictEqual(host.signedIn(), true);
  assert.deepEqual(calls, [['auth', 'status']], 'never --show-token, never `auth token`');
  // Signed out, glab's own failure text (which may hold the line) is dropped, not carried into a throw.
  const out = gitlabHost(() => { throw Object.assign(new Error(`Command failed: glab auth status\n${line}`), { status: 1, stderr: line }); });
  assert.strictEqual(out.signedIn(), false);
});

test('the allowlist still refuses', (t) => {
  const dir = stubbed(t);
  const gh = ghRun(dir);
  assert.throws(() => gh(['pr', 'merge', '7']), /gh pr merge: not a host verb/);
  assert.throws(() => gh(['auth', 'token']), /gh auth token: not a host verb/);
  assert.equal(fs.existsSync(path.join(dir, 'calls.jsonl')), false, '0 processes started');
  gh(['pr', 'view', '7']);
  assert.ok(fs.existsSync(path.join(dir, 'calls.jsonl')), 'an allowed verb does start one, so the 0 above is seen');
});
