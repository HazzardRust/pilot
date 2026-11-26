// `pilot pr --ticket <id>` (deck-writes-github S1, spec 2; L2, L3, L7'): the deck's one writer of the
// feature PR, over a fake `gh` and a git fixture whose origin holds `feat/<slug>` and its artefact.

import { gitFixture } from './lib/git-fixture.mjs';

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { ghRun, githubHost } from '../../deck/host-github.mjs';
import { featureBody, main, syncFeaturePr } from '../feature-pr.mjs';
import { ghStub } from '../gh-stub.mjs';
import { git as gitAt } from '../pilot-branch.mjs';

const SLUG = 'demo-feature';
const SPEC = ['## 2. Spec', '', '1. A user can do the thing. *Evidence: a test.*', '2. Another | piped line.', ''].join('\n');
const ARTEFACT = ['# Demo', '', '## 1. Problem', '', 'Why.', '', SPEC, '## 3. Findings', '', 'Not in the body.', ''].join('\n');
const FOOTER = '🤖 Generated with [Claude Code](https://claude.com/claude-code)\n\nhttps://example.com/session';
const BRIEF = ['# Brief', '', '## PR footer', '', '```', FOOTER, '```', '', '## PR titles', ''].join('\n');

const record = (over = {}) => ({
  slug: SLUG,
  feature: 'the demo does a thing',
  ticket: 'itm_0123abcd',
  base: 'pilot',
  artefact: `docs/design/${SLUG}/architecture.md`,
  slices: [
    { slice: 'S1 the first slice', state: 'integrated', branch: `slice/${SLUG}-s1`, pr: 11 },
    { slice: 'S2 the second slice', state: 'planned', after: ['S1'] },
  ],
  ...over,
});

/** origin (bare) holding feat/<slug> with the artefact and brief, and a clone of it; `pushed` false leaves feat/ local. */
function buildRepos(root, { pushed = true } = {}) {
  const origin = path.join(root, 'origin.git');
  const clone = path.join(root, 'clone');
  gitAt(root, 'init', '-q', '--bare', '-b', 'main', origin);
  gitAt(root, 'clone', '-q', origin, clone);
  gitAt(clone, 'checkout', '-q', '-b', `feat/${SLUG}`);
  const dir = path.join(clone, 'docs', 'design', SLUG);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'architecture.md'), ARTEFACT);
  fs.writeFileSync(path.join(dir, 'brief.md'), BRIEF);
  gitAt(clone, 'add', '.');
  gitAt(clone, 'commit', '-q', '-m', 'artefact');
  if (pushed) gitAt(clone, 'push', '-q', 'origin', `feat/${SLUG}`);
  return clone;
}

const repo = (t) => gitFixture(t, 'feature-pr', (root) => buildRepos(root));
const unpushed = (t) => gitFixture(t, 'feature-pr-unpushed', (root) => buildRepos(root, { pushed: false }));
const gitIn = (cwd) => (args) => gitAt(cwd, ...args);

const WRITES = (call) => call[0] === 'pr' && ['create', 'edit', 'comment'].includes(call[1]);

/**
 * A fake `gh`: `pr list` answers `open` (the PRs open for the head), `pr create` a PR url; every call is
 * kept with the text of any `--body-file` it named, read at the call, since the file goes after.
 */
function fakeGh({ open = [], fail } = {}) {
  const calls = [];
  const bodies = [];
  const gh = (args) => {
    calls.push(args);
    if (fail && args[0] === fail[0] && args[1] === fail[1]) {
      throw Object.assign(new Error('Command failed: gh'), { status: 1, stderr: 'HTTP 401: Bad credentials\nmore\n' });
    }
    const at = args.indexOf('--body-file');
    if (at !== -1) bodies.push(fs.readFileSync(args[at + 1], 'utf8'));
    if (args[0] === 'pr' && args[1] === 'list') return JSON.stringify(open.map((pr) => ({ state: 'OPEN', isCrossRepository: false, ...pr })));
    if (args[0] === 'pr' && args[1] === 'create') return 'https://github.com/o/r/pull/42\n';
    return '';
  };
  return { gh, host: githubHost(gh), calls, bodies, writes: () => calls.filter(WRITES) };
}

/** The body the deck writes for `record()` on the fixture: what an up-to-date PR reads. */
const bodyOf = (rec = record()) => featureBody(SPEC, rec, FOOTER);

test('the first run opens one draft PR against the record\'s base', (t) => {
  const cwd = repo(t);
  const fake = fakeGh();
  const out = syncFeaturePr({ host: fake.host, git: gitIn(cwd), record: record() });
  const [create, ...more] = fake.writes();
  assert.deepEqual(more, []);
  assert.deepEqual(create.slice(0, 2), ['pr', 'create']);
  assert.ok(create.includes('--draft'));
  assert.equal(create[create.indexOf('--base') + 1], 'pilot');
  assert.equal(create[create.indexOf('--head') + 1], `feat/${SLUG}`);
  assert.equal(create[create.indexOf('--title') + 1], `feat(${SLUG}): the demo does a thing`);
  assert.equal(fake.bodies[0], bodyOf());
  assert.deepEqual(out, { line: 'feature PR #42 opened', number: 42, wrote: 'created' });

  // A PR already open for the head (the architect's, before S6): never a second one.
  const again = fakeGh({ open: [{ number: 7, body: 'the architect wrote this', baseRefName: 'pilot' }] });
  syncFeaturePr({ host: again.host, git: gitIn(cwd), record: record() });
  assert.equal(again.writes().filter((c) => c[1] === 'create').length, 0);

  // A fork's PR from a branch of the same name is not the feature PR: never edited, and it hides nothing.
  const fork = fakeGh({ open: [{ number: 9, body: 'a fork', baseRefName: 'pilot', isCrossRepository: true }] });
  assert.equal(syncFeaturePr({ host: fork.host, git: gitIn(cwd), record: record() }).wrote, 'created');
  assert.deepEqual(fork.writes().map((c) => c.slice(0, 2)), [['pr', 'create']]);
});

test('a changed row edits the body once', (t) => {
  const cwd = repo(t);
  const fake = fakeGh({ open: [{ number: 7, body: bodyOf(), baseRefName: 'pilot' }] });
  const changed = record({ slices: [{ slice: 'S1 the first slice', state: 'pushed', pr: 11 }, record().slices[1]] });
  const out = syncFeaturePr({ host: fake.host, git: gitIn(cwd), record: changed });
  const edits = fake.writes();
  assert.equal(edits.length, 1);
  assert.deepEqual(edits[0].slice(0, 3), ['pr', 'edit', '7']);
  assert.ok(edits[0].includes('--body-file'));
  assert.ok(!edits[0].includes('--base'));
  assert.equal(fake.bodies[0], bodyOf(changed));
  assert.deepEqual(out, { line: 'feature PR #7 updated', number: 7, wrote: 'edited' });
});

test('a changed base retargets once', (t) => {
  const cwd = repo(t);
  const fake = fakeGh({ open: [{ number: 7, body: bodyOf(), baseRefName: 'feat/earlier-run' }] });
  const out = syncFeaturePr({ host: fake.host, git: gitIn(cwd), record: record() });
  assert.deepEqual(fake.writes(), [['pr', 'edit', '7', '--base', 'pilot']]);
  assert.deepEqual(out, { line: 'feature PR #7 updated', number: 7, wrote: 'edited' });
});

test('the same record writes nothing', (t) => {
  const cwd = repo(t);
  // GitHub hands a body back with CRLF line ends and no final newline: still the same body.
  const fake = fakeGh({ open: [{ number: 7, body: bodyOf().replace(/\n/g, '\r\n').trimEnd(), baseRefName: 'pilot' }] });
  const out = syncFeaturePr({ host: fake.host, git: gitIn(cwd), record: record() });
  assert.deepEqual(fake.writes(), []);
  assert.deepEqual(out, { line: 'feature PR #7 unchanged', number: 7, wrote: 'unchanged' });
});

test('the body is the spec and the slice table', () => {
  const body = featureBody(SPEC, record(), FOOTER);
  assert.ok(body.startsWith(SPEC.trimEnd()), 'the spec, verbatim, first');
  const rows = body.split('\n').filter((line) => /^\| S\d/.test(line));
  assert.deepEqual(rows, ['| S1 the first slice | integrated | #11 |', '| S2 the second slice | planned |  |']);
  assert.ok(body.includes('| Slice | State | PR |'));
  assert.ok(body.trimEnd().endsWith(FOOTER), 'the footer last');
  assert.ok(!featureBody(SPEC, record()).includes('Generated with'), 'no footer, none written');
  // A cell cannot break the table: a pipe is escaped and a newline folded.
  const odd = featureBody(SPEC, record({ slices: [{ slice: 'S9 a | b', state: `one\ntwo\rthree${String.fromCharCode(0x2028)}four` }] }));
  assert.ok(odd.includes('| S9 a \\| b | one two three four |  |'));
});

test('an @mention in what the deck writes notifies nobody', (t) => {
  const ZWJ = String.fromCharCode(0x200d);
  const body = featureBody('## 2. Spec\n\n1. Ask @octocat and @org/team.', record({ slices: [{ slice: 'S1 ping @someone', state: 'done' }] }), FOOTER);
  assert.ok(!/(?<!\w)@\w/.test(body), 'no mention GitHub would expand');
  assert.ok(body.includes(`@${ZWJ}octocat`) && body.includes(`@${ZWJ}org/team`) && body.includes(`@${ZWJ}someone`));

  // QA's comment is rendered the same way, through the one PR write.
  const cwd = repo(t);
  const fake = fakeGh({ open: [{ number: 7, body: bodyOf(), baseRefName: 'pilot' }] });
  const host = githubHost((args) => (args[1] === 'view' ? JSON.stringify({ comments: [] }) : fake.gh(args)));
  syncFeaturePr({ host, git: gitIn(cwd), record: record({ qaComment: 'thanks @reviewer' }) });
  assert.ok(fake.bodies.at(-1).includes(`thanks @${ZWJ}reviewer`));

  // And the title, from the record's feature name.
  const fresh = fakeGh();
  syncFeaturePr({ host: fresh.host, git: gitIn(cwd), record: record({ feature: 'ask @octocat' }) });
  const [create] = fresh.writes();
  assert.equal(create[create.indexOf('--title') + 1], `feat(${SLUG}): ask @${ZWJ}octocat`);
});

test('no branch on origin is quiet', async (t) => {
  const cwd = unpushed(t);
  const fake = fakeGh();
  const out = syncFeaturePr({ host: fake.host, git: gitIn(cwd), record: record() });
  assert.deepEqual(out, { line: `no PR yet: origin has no feat/${SLUG}`, wrote: 'none' });
  assert.deepEqual(fake.writes(), []);

  const said = [];
  const code = await main(['--ticket', 'itm_0123abcd'], { host: fake.host, git: gitIn(cwd), readRecord: async () => record(), say: (s) => said.push(s) });
  assert.equal(code, 0);
  assert.deepEqual(said, [`no PR yet: origin has no feat/${SLUG}\n`]);
});

test('a run remote other than origin opens nothing', (t) => {
  const cwd = repo(t);
  gitAt(cwd, 'remote', 'add', 'fork', gitAt(cwd, 'remote', 'get-url', 'origin'));
  gitAt(cwd, 'config', 'pilot.remote', 'fork');
  const fake = fakeGh();
  const out = syncFeaturePr({ host: fake.host, git: gitIn(cwd), record: record() });
  assert.deepEqual(out, { line: 'no PR: run remote fork', wrote: 'none' });
  assert.deepEqual(fake.calls, []);

  gitAt(cwd, 'config', 'pilot.remote', 'none');
  assert.equal(syncFeaturePr({ host: fake.host, git: gitIn(cwd), record: record() }).line, 'no PR: run remote none');
  assert.deepEqual(fake.calls, []);
});

test('a gh failure is one line and exit 1', async (t) => {
  const cwd = repo(t);
  const fake = fakeGh({ fail: ['pr', 'list'] });
  const said = [];
  const code = await main(['--ticket', 'itm_0123abcd'], { host: fake.host, git: gitIn(cwd), readRecord: async () => record(), say: (s) => said.push(s) });
  assert.equal(code, 1);
  assert.deepEqual(said, ['gh reviews: HTTP 401: Bad credentials\n']);

  // A malformed ticket or a record the deck does not have is one line too, and starts nothing.
  const none = [];
  assert.equal(await main(['--ticket', '--draft'], { host: fake.host, git: gitIn(cwd), readRecord: async () => record(), say: (s) => none.push(s) }), 1);
  assert.equal(await main(['--ticket', 'itm_0123abcd'], { host: fake.host, git: gitIn(cwd), readRecord: async () => null, say: (s) => none.push(s) }), 1);
  assert.equal(none.length, 2);
  assert.ok(none.every((line) => line.split('\n').length === 2));
  assert.equal(fake.calls.length, 1);
});

test('none writes nothing', (t) => {
  const cwd = repo(t);
  const calls = [];
  const git = (args) => {
    calls.push(args);
    return gitAt(cwd, ...args);
  };
  assert.deepEqual(syncFeaturePr({ host: null, git, record: record() }), { line: 'no PR: host none', wrote: 'none' });
  assert.deepEqual(calls.filter((args) => args[0] === 'ls-remote' || args[0] === 'fetch'), [], 'not even origin is asked');
});

test('pilot pr reads pilot.host: none is exit 0, an unknown name one line and exit 1', async (t) => {
  const cwd = repo(t);
  const said = [];
  const run = () => main(['--ticket', 'itm_0123abcd'], { git: gitIn(cwd), readRecord: async () => record(), say: (s) => said.push(s) });

  gitAt(cwd, 'config', 'pilot.host', 'none');
  assert.equal(await run(), 0);
  assert.deepEqual(said, ['no PR: host none\n']);

  gitAt(cwd, 'config', 'pilot.host', 'bogus');
  assert.equal(await run(), 1);
  assert.match(said[1], /^host: .*"bogus".*\n$/);
});

test('pilot pr with no pilot branch name, signed out, is refused and writes nothing', async (t) => {
  const cwd = repo(t);
  const pinned = process.env.PILOT_BRANCH;
  delete process.env.PILOT_BRANCH;
  t.after(() => (pinned === undefined ? delete process.env.PILOT_BRANCH : (process.env.PILOT_BRANCH = pinned)));
  const fake = fakeGh(); // `gh api user` answers nothing: signed out
  const refsBefore = gitAt(cwd, 'for-each-ref');
  const said = [];
  const code = await main(['--ticket', 'itm_0123abcd'], { host: fake.host, git: gitIn(cwd), readRecord: async () => record(), say: (s) => said.push(s) });
  assert.equal(code, 1);
  assert.match(said.join(''), /^pilot branch: no pilot branch name/);
  assert.deepEqual(fake.writes(), []);
  assert.throws(() => gitAt(cwd, 'config', '--get', 'pilot.branch'), 'no name stored');
  assert.equal(gitAt(cwd, 'for-each-ref'), refsBefore, 'no ref written');
});

test('create then edit', (t) => {
  const cwd = repo(t);
  // One fake GitHub across three runs: what `pr create` and `pr edit` write is what `pr list` answers next.
  let pr = null;
  const calls = [];
  const run = (args) => {
    calls.push(args);
    const at = args.indexOf('--body-file');
    const body = at === -1 ? undefined : fs.readFileSync(args[at + 1], 'utf8');
    if (args[1] === 'list') return JSON.stringify(pr ? [pr] : []);
    if (args[1] === 'create') {
      pr = { number: 42, state: 'OPEN', body, baseRefName: args[args.indexOf('--base') + 1], isCrossRepository: false };
      return 'https://github.com/o/r/pull/42\n';
    }
    if (args[1] === 'edit' && body !== undefined) pr.body = body;
    return '';
  };
  const host = githubHost(run);
  const sync = (rec) => syncFeaturePr({ host, git: gitIn(cwd), record: rec }).wrote;
  const changed = record({ slices: [{ slice: 'S1 the first slice', state: 'pushed', pr: 11 }] });
  assert.deepEqual([sync(record()), sync(changed), sync(changed)], ['created', 'edited', 'unchanged']);
  assert.deepEqual(calls.filter(WRITES).map((c) => c.slice(0, 3)), [['pr', 'create', '--draft'], ['pr', 'edit', '42']]);
});

const stubs = [];
after(() => stubs.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

test('a verb outside the table is refused', (t) => {
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
  const calls = () => {
    const file = path.join(stub.dir, 'calls.jsonl');
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  };
  const gh = ghRun(stub.dir);

  assert.throws(() => gh(['pr', 'merge', '7']), /pr merge/);
  assert.throws(() => gh(['api', 'user', '-X', 'DELETE']), /api/);
  assert.throws(() => gh(['api', 'user', '-f', 'name=x']), /api/);
  assert.throws(() => gh(['api', '-X', 'PATCH', 'repos/../../issues/comments/1', '-f', 'body=x']), /api/);
  assert.throws(() => gh(['api', '-X', 'PATCH', 'repos/o/r/issues/comments/1', '-F', 'body=@secret.txt']), /api/);
  assert.throws(() => gh(['api', '-X', 'PATCH', 'repos/o/r/pulls/7']), /api/);
  // A comment is posted with `gh pr comment`: the api POST, an explicit GET, `-q` and `--raw-field` have no caller.
  assert.throws(() => gh(['api', '-X', 'POST', 'repos/o/r/issues/1/comments', '-f', 'body=x']), /api/);
  assert.throws(() => gh(['api', 'user', '-X', 'GET', '--jq', '.login']), /api/);
  assert.throws(() => gh(['api', 'user', '-q', '.login']), /api/);
  assert.throws(() => gh(['api', '-X', 'PATCH', 'repos/o/r/issues/comments/9', '--raw-field', 'body=x']), /api/);
  assert.equal(calls(), '', 'no process started for a refused verb');

  // The stub would have seen one: a verb in the table reaches it.
  gh(['pr', 'view', '7']);
  gh(['api', '-X', 'PATCH', 'repos/o/r/issues/comments/9', '-f', 'body=x']);
  gh(['api', 'user', '--jq', '.login']);
  assert.equal(calls(), [
    '["pr","view","7"]',
    '["api","-X","PATCH","repos/o/r/issues/comments/9","-f","body=x"]',
    '["api","user","--jq",".login"]',
    '',
  ].join('\n'));
});

// pr-overview S1: the artefact's `## Overview` opens the body, the tables below it unchanged.
const OVERVIEW = '- **What changes**: the demo says what it does.\n- **Why**: a reader needs it.';
const BLOCK = `## Overview\n\n${OVERVIEW}\n\nBuilt so far: 1 of 2 parts.`;

test('the body opens with the overview and the tables are untouched', () => {
  const body = featureBody(SPEC, record(), FOOTER, BLOCK);
  assert.equal(body.split('\n')[0], '## Overview');
  const section = body.split('\n## 2')[0];
  assert.ok(section.includes(OVERVIEW) && section.includes('Built so far: 1 of 2 parts.'));
  assert.equal(body.slice(`${BLOCK}\n\n`.length), featureBody(SPEC, record(), FOOTER));
  assert.equal(featureBody(SPEC, record(), FOOTER, null), featureBody(SPEC, record(), FOOTER));
});

/** `pushOverview` commits an artefact carrying `## Overview` above §1 to origin's feature branch. */
function pushOverview(clone, text) {
  const file = path.join(clone, 'docs', 'design', SLUG, 'architecture.md');
  fs.writeFileSync(file, ARTEFACT.replace('## 1. Problem', `## Overview\n\n${text}\n\n## 1. Problem`));
  gitAt(clone, 'commit', '-q', '-am', 'overview');
  gitAt(clone, 'push', '-q', 'origin', `feat/${SLUG}`);
}

test('an artefact with an overview opens the PR with it, and a changed one is one edit', (t) => {
  const cwd = repo(t);
  pushOverview(cwd, 'First text.');
  const first = fakeGh();
  syncFeaturePr({ host: first.host, git: gitIn(cwd), record: record() });
  assert.equal(first.bodies[0], featureBody(SPEC, record(), FOOTER, '## Overview\n\nFirst text.\n\nBuilt so far: 1 of 2 parts.'));

  const same = fakeGh({ open: [{ number: 7, body: first.bodies[0], baseRefName: 'pilot' }] });
  assert.equal(syncFeaturePr({ host: same.host, git: gitIn(cwd), record: record() }).wrote, 'unchanged');
  assert.deepEqual(same.writes(), []);

  pushOverview(cwd, 'Second text.');
  const edit = fakeGh({ open: [{ number: 7, body: first.bodies[0], baseRefName: 'pilot' }] });
  syncFeaturePr({ host: edit.host, git: gitIn(cwd), record: record() });
  assert.equal(edit.writes().length, 1);
  assert.ok(edit.bodies[0].includes('Second text.') && !edit.bodies[0].includes('First text.'));
});

test('an artefact with no overview gets today\'s body', (t) => {
  const cwd = repo(t);
  const fake = fakeGh();
  syncFeaturePr({ host: fake.host, git: gitIn(cwd), record: record() });
  assert.equal(fake.bodies[0], bodyOf());
});
