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
  assert.equal(hostFor('.', { git: gitWith(undefined), run }).cli, 'gh');
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
  assert.deepEqual(Object.keys(review).sort(), ['base', 'body', 'crossRepo', 'head', 'headSha', 'number', 'state']);
  assert.ok(['open', 'merged', 'closed'].includes(review.state), review.state);
  assert.ok(Number.isSafeInteger(review.number));
};

/** The **Host** surface, whole: no `whoami` and no `name` (user answer itm_6eca66849bdb). */
const HOST_KEYS = ['checks', 'cli', 'comment', 'edit', 'open', 'review', 'reviews', 'signedIn', 'testedTrees', 'upsertComment'];

const CONTRACT = [
  ['reviews', (host) => host.reviews({ state: 'all' }), (said) => { assert.equal(said.length, 3); said.forEach(isReview); assert.deepEqual(said.map((r) => r.state), ['open', 'merged', 'closed']); }],
  ['reviews mine by head', (host) => host.reviews({ head: 'feat/1', state: 'open', mine: true, limit: 5 }), (said) => said.forEach(isReview)],
  ['review', (host) => host.review(7), (said) => { isReview(said); assert.equal(said.number, 7); }],
  ['open', (host) => host.open({ base: 'pilot', head: 'feat/x', title: 'T', body: 'B', draft: true, label: 'release' }), (said) => assert.deepEqual(said, { number: 41 })],
  ['edit', (host) => host.edit(7, { base: 'pilot', title: 'T', body: 'B', label: 'release' }), (said) => assert.deepEqual(said, {})],
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
    assert.deepEqual(Object.keys(host).sort(), HOST_KEYS);
    assert.equal(host.cli, 'gh');
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

test('a refused label is said', () => {
  const { run, calls } = fakeGh();
  const refusing = (args) => {
    if (args[0] === 'label') throw new Error('HTTP 403: Resource not accessible\nsecond line');
    return run(args);
  };
  const host = githubHost(refusing);
  assert.deepEqual(host.open({ base: 'pilot', head: 'feat/x', title: 'T', body: 'B', label: 'release' }), { number: 41, why: 'HTTP 403: Resource not accessible' });
  assert.deepEqual(host.edit(7, { title: 'T', label: 'release' }), { why: 'HTTP 403: Resource not accessible' });
  const writes = calls.filter((args) => args[0] === 'pr');
  assert.equal(writes.length, 2);
  assert.ok(writes.every((args) => !args.includes('--label') && !args.includes('--add-label')), 'no label it could not make');
});

test('a refusal reads from stderr, and an empty one still says something', () => {
  const { run } = fakeGh();
  const refusing = (err) => githubHost((args) => {
    if (args[0] === 'label') throw err;
    return run(args);
  });
  const real = Object.assign(new Error('Command failed: gh label create release --force'), { stderr: 'HTTP 403: Resource not accessible\n' });
  assert.equal(refusing(real).edit(7, { label: 'release' }).why, 'HTTP 403: Resource not accessible');
  assert.equal(refusing(new Error('')).edit(7, { label: 'release' }).why, 'label refused');
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
    assert.deepEqual(Object.keys(host).sort(), HOST_KEYS);
    assert.equal(host.cli, 'glab');
    check(call(host));
    sent.push(...calls);
    if (verb === 'reviews') assert.deepEqual(call(host).map((r) => [r.number, r.body, r.crossRepo]), [[1, 'b', false], [2, '', true], [3, '', false]]);
  }
  const mineByHead = sent.find(({ args }) => args.at(-1).includes('source_branch'));
  assert.equal(mineByHead.args.at(-1), 'projects/:id/merge_requests?state=opened&source_branch=feat%2F1&scope=created_by_me&per_page=5&page=1');
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

test('reviews reads on past a full page of 100, up to the limit', () => {
  /** A gitlab over pages of `sizes` merge requests, recording the page each call asked for. */
  const paged = (sizes) => {
    const pages = [];
    const host = gitlabHost((args) => {
      const page = Number(new URLSearchParams(args.at(-1).split('?')[1]).get('page'));
      pages.push(page);
      return JSON.stringify(Array.from({ length: sizes[page - 1] ?? 0 }, (_, at) => ({ ...fixture('merge_request'), iid: page * 1000 + at })));
    });
    return { host, pages };
  };
  const short = paged([100, 100, 50]);
  assert.equal(short.host.reviews({ state: 'all', limit: 1000 }).length, 250);
  assert.deepEqual(short.pages, [1, 2, 3], 'a short page is the last');
  const full = paged([100, 100, 100]);
  assert.equal(full.host.reviews({ state: 'all', limit: 150 }).length, 150);
  assert.deepEqual(full.pages, [1, 2], 'no page past the limit');
  const one = paged([100, 100]);
  assert.equal(one.host.reviews({ state: 'all', limit: 100 }).length, 100);
  assert.deepEqual(one.pages, [1]);
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

// ci-gate S1, spec 10; L2. The one GET of a commit's check runs, by full sha.
const SHA = '5fef2abeeab467094301df1737d521b3898d1739';
const CHECK_RUNS = `repos/{owner}/{repo}/commits/${SHA}/check-runs?filter=latest&per_page=100`;

test('only the one GET reaches gh', (t) => {
  const calls = [];
  const host = githubHost((args) => {
    calls.push(args);
    return JSON.stringify({ total_count: 2, check_runs: [
      { name: 'gate (ubuntu-latest)', status: 'completed', conclusion: 'failure', html_url: 'https://github.com/o/r/actions/runs/1/job/2' },
      { name: 'gate (macos-latest)', status: 'in_progress', conclusion: null, html_url: 'https://github.com/o/r/actions/runs/1/job/3' },
    ] });
  });
  assert.deepEqual(host.checks(SHA), [
    { name: 'gate (ubuntu-latest)', outcome: 'fail' },
    { name: 'gate (macos-latest)', outcome: 'pending' },
  ]);
  assert.deepEqual(calls, [['api', CHECK_RUNS]]);
  for (const sha of ['5fef2ab', SHA.toUpperCase(), `${SHA}/../x`, 'pilot']) assert.throws(() => host.checks(sha), /not a full commit sha/, sha);
  assert.equal(calls.length, 1, 'a short sha starts no run');
  const dir = stubbed(t);
  const gh = ghRun(dir);
  const refused = [
    ['api', CHECK_RUNS.replace(SHA, '5fef2ab')],
    ['api', '-X', 'POST', CHECK_RUNS],
    ['api', '--method', 'GET', CHECK_RUNS],
    ['api', CHECK_RUNS, '-f', 'name=x'],
    ['api', CHECK_RUNS, '-F', 'name=@/etc/passwd'],
    ['api', CHECK_RUNS.replace('check-runs', 'statuses')],
    ['api', CHECK_RUNS.replace('{owner}/{repo}', 'other/repo')],
    ['api', CHECK_RUNS.replace('filter=latest', 'filter=all')],
    ['api', `${CHECK_RUNS}&page=2`],
    ['api', CHECK_RUNS, 'user'],
  ];
  for (const args of refused) assert.throws(() => gh(args), /^Error: gh api .*: not a host verb$/, args.join(' '));
  assert.equal(fs.existsSync(path.join(dir, 'calls.jsonl')), false, '0 processes started');
  gh(['api', CHECK_RUNS]);
  assert.ok(fs.existsSync(path.join(dir, 'calls.jsonl')), 'the one GET does start one, so the 0 above is seen');
});

// cheap-suite S4, spec 5; L7. The tree each Gate job tested, read from its `tested-tree` annotation: one more GET.
const annotations = (id) => `repos/{owner}/{repo}/check-runs/${id}/annotations?per_page=100`;

test('the host reads annotations and nothing more', (t) => {
  const calls = [];
  const TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
  const notice = (message, title = 'tested-tree') => ({ annotation_level: 'notice', title, message });
  const said = {
    [CHECK_RUNS]: { total_count: 4, check_runs: [
      { id: 11, name: 'gate (ubuntu-latest)', status: 'completed', conclusion: 'success' },
      { id: 12, name: 'gate (windows-latest)', status: 'in_progress', conclusion: null },
      { id: 13, name: 'gate (macos-latest)', status: 'completed', conclusion: 'success' },
      { id: 14, name: 'CodeQL', status: 'completed', conclusion: 'success' },
    ] },
    [annotations(11)]: [notice('a warning', 'Node'), notice(TREE)],
    [annotations(12)]: [],
    [annotations(13)]: [notice(TREE), notice('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391')],
  };
  const host = githubHost((args) => {
    calls.push(args);
    return JSON.stringify(said[args[1]]);
  });
  assert.deepEqual(host.testedTrees(SHA), [
    { name: 'gate (ubuntu-latest)', conclusion: 'success', tree: TREE },
    { name: 'gate (windows-latest)', conclusion: 'in_progress', tree: null },
    { name: 'gate (macos-latest)', conclusion: 'success', tree: null },
  ]);
  assert.deepEqual(calls.map((args) => args[1]), [CHECK_RUNS, annotations(11), annotations(12), annotations(13)], 'no annotations read for a run not named gate');
  assert.throws(() => host.testedTrees('5fef2ab'), /not a full commit sha/);
  assert.deepEqual(gitlabHost(() => assert.fail('no glab call')).testedTrees(SHA), [], 'a GitLab landing has no proof');
  const dir = stubbed(t);
  const gh = ghRun(dir);
  for (const args of [
    ['api', '-X', 'POST', annotations(11)],
    ['api', annotations(11), '-f', 'title=x'],
    ['api', annotations('11/../12')],
    ['api', annotations(11).replace('{owner}/{repo}', 'other/repo')],
    ['api', 'repos/{owner}/{repo}/actions/runs/11/logs'],
  ]) assert.throws(() => gh(args), /^Error: gh api .*: not a host verb$/, args.join(' '));
  assert.equal(fs.existsSync(path.join(dir, 'calls.jsonl')), false, '0 processes started');
  gh(['api', annotations(11)]);
  assert.ok(fs.existsSync(path.join(dir, 'calls.jsonl')), 'the annotations GET does start one, so the 0 above is seen');
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
