/**
 * Tests for the install: the rules copy, the vendoring ledger, the drift report and
 * the documents a friend's install is driven from.
 *
 * Everything here runs against scratch directories. The one thing this slice must
 * never do is change a file on the machine running the tests: the install writes
 * into someone else's `~/.claude/`, and a test that reached the real one would be
 * the same bug it is written to prevent.
 *
 * Passing an explicit path is how each test does that, and on 2026-09-15 it was shown
 * not to be enough on its own: a mutation run dropped the option and the suite merged
 * its own fixtures into a real `~/.claude/`. `lib/fake-home.mjs` moves the home
 * directory itself, which is why it is imported before anything else here.
 */

// First, and before any module that can resolve a path from the home directory.
import { REAL_HOME, FAKE_HOME } from './lib/fake-home.mjs';
// The fixture seam gives the one git repository below its identity (A6: it keeps its own git init).
import './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const { installRules, rulesSource, defaultRulesTarget } = await import('../install-rules.mjs');
const { filesUnder } = await import('../build-rules-ledger.mjs');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const shippedLedger = () => JSON.parse(read('scripts/shipped-rules.json'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function scratch(t, prefix = 'pilot-install-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A source tree standing in for `rules/`: two languages and a shared file. */
function fakeRules(t, files = { 'common/testing.md': 'coverage\n', 'typescript/style.md': 'types\n' }) {
  const dir = scratch(t, 'pilot-rules-src-');
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body, 'utf8');
  }
  return dir;
}

const entries = (report, key) => report[key].map((item) => item.file).sort();

// --- the rules copy --------------------------------------------------------

test('a machine with no rules of its own gets every one of them, and is told which', (t) => {
  const source = fakeRules(t);
  const target = path.join(scratch(t), 'rules');

  const report = installRules({ source, target });

  assert.deepEqual(entries(report, 'written'), ['common/testing.md', 'typescript/style.md']);
  assert.equal(report.changed, true);
  assert.equal(fs.readFileSync(path.join(target, 'common/testing.md'), 'utf8'), 'coverage\n');
  assert.equal(fs.readFileSync(path.join(target, 'typescript/style.md'), 'utf8'), 'types\n');

  const said = report.notes.join('\n');
  assert.match(said, /2 files written/, 'the report has to say how many files it wrote');
});

test('a rules file a friend already had is left exactly as it was, and named', (t) => {
  const source = fakeRules(t);
  const target = path.join(scratch(t), 'rules');
  fs.mkdirSync(path.join(target, 'common'), { recursive: true });
  fs.writeFileSync(path.join(target, 'common/testing.md'), 'my own rules\n', 'utf8');

  const report = installRules({ source, target });

  assert.equal(
    fs.readFileSync(path.join(target, 'common/testing.md'), 'utf8'),
    'my own rules\n',
    'their file survives byte for byte',
  );
  assert.deepEqual(entries(report, 'differing'), ['common/testing.md']);
  assert.deepEqual(entries(report, 'written'), ['typescript/style.md']);

  const said = report.notes.join('\n');
  assert.match(said, /common[\/]testing\.md/, 'a file left alone must be named, not counted');
});

test('a file already identical is reported as already there, not as written', (t) => {
  const source = fakeRules(t);
  const target = path.join(scratch(t), 'rules');
  fs.mkdirSync(path.join(target, 'common'), { recursive: true });
  fs.writeFileSync(path.join(target, 'common/testing.md'), 'coverage\n', 'utf8');

  const report = installRules({ source, target });

  assert.deepEqual(entries(report, 'identical'), ['common/testing.md']);
  assert.deepEqual(entries(report, 'written'), ['typescript/style.md']);
});

test('running the copy a second time changes nothing at all', (t) => {
  const source = fakeRules(t);
  const target = path.join(scratch(t), 'rules');

  installRules({ source, target });
  const after = fs.readdirSync(path.join(target, 'common')).map((name) => ({
    name,
    body: fs.readFileSync(path.join(target, 'common', name), 'utf8'),
  }));

  const second = installRules({ source, target });

  assert.equal(second.changed, false, 'a second run is a no-op');
  assert.deepEqual(entries(second, 'written'), []);
  assert.equal(second.identical.length, 2);
  assert.deepEqual(
    fs.readdirSync(path.join(target, 'common')).map((name) => ({
      name,
      body: fs.readFileSync(path.join(target, 'common', name), 'utf8'),
    })),
    after,
  );
  assert.match(second.notes.join('\n'), /already/i, 'and it says so rather than staying silent');
});

test('a dry run writes nothing and still says what it would have written', (t) => {
  const source = fakeRules(t);
  const target = path.join(scratch(t), 'rules');

  const report = installRules({ source, target, dryRun: true });

  assert.deepEqual(entries(report, 'written'), ['common/testing.md', 'typescript/style.md']);
  assert.equal(fs.existsSync(target), false, 'a dry run does not even create the directory');
  assert.match(report.notes.join('\n'), /would/i);
});

test('the rules that ship are the ones copied, and the default target is the friend\'s own', () => {
  assert.equal(rulesSource(), path.join(ROOT, 'rules'));
  assert.ok(fs.existsSync(path.join(rulesSource(), 'orchestration.md')), 'the tree it copies is this one');
  assert.equal(defaultRulesTarget(), path.join(os.homedir(), '.claude', 'rules'));
});

test('the whole shipped tree copies, nested directories and all', (t) => {
  const target = path.join(scratch(t), 'rules');

  const report = installRules({ target });

  assert.ok(report.written.length > 100, `the tree is ~140 files, not ${report.written.length}`);
  assert.equal(
    read('rules/orchestration.md'),
    fs.readFileSync(path.join(target, 'orchestration.md'), 'utf8'),
    'a copied rule is byte-identical to the one that shipped',
  );
  assert.ok(
    fs.existsSync(path.join(target, 'typescript', 'coding-style.md')),
    'the language directories come with it',
  );
});

// --- the retired common/ layer ---------------------------------------------

// The one commit that ever shipped `rules/common/`. The prune's hashes are checked
// against it, so a hash that was typed wrong cannot quietly spare every file.
const COMMON_SHIPPED_AT = '46bd9b7';
const shippedCommon = (name) =>
  execFileSync('git', ['-C', ROOT, 'show', `${COMMON_SHIPPED_AT}:rules/common/${name}`]);
const hasHistory = () => {
  try {
    shippedCommon('testing.md');
    return true;
  } catch {
    return false;
  }
};

test('the package no longer ships a common/ layer', () => {
  assert.equal(fs.existsSync(path.join(rulesSource(), 'common')), false);
});

test('every retired common/ hash is a file this package really shipped', (t) => {
  if (!hasHistory()) return t.skip('no git history to check the hashes against');
  const ledger = shippedLedger();
  const names = Object.keys(ledger)
    .filter((rel) => rel.startsWith('common/'))
    .map((rel) => rel.replace(/^common\//, ''));
  assert.equal(names.length, 10, 'all ten files that shipped');
  for (const name of names) {
    const digest = createHash('sha256').update(shippedCommon(name)).digest('hex');
    assert.ok(ledger[`common/${name}`].includes(digest), `common/${name}`);
  }
});

test('a common/ file byte-identical to a shipped copy is deleted and named', (t) => {
  if (!hasHistory()) return t.skip('no git history to recover the shipped bytes from');
  const target = path.join(scratch(t), 'rules');
  fs.mkdirSync(path.join(target, 'common'), { recursive: true });
  fs.writeFileSync(path.join(target, 'common/agents.md'), shippedCommon('agents.md'));

  const report = installRules({ source: fakeRules(t, { 'typescript/style.md': 'types\n' }), target });

  assert.equal(fs.existsSync(path.join(target, 'common/agents.md')), false);
  assert.deepEqual(entries(report, 'pruned'), ['common/agents.md']);
  assert.equal(report.changed, true);
  assert.match(report.notes.join('\n'), /common[\/]agents\.md/, 'each deletion is named');
});

test('a common/ file edited by even one byte survives the prune', (t) => {
  if (!hasHistory()) return t.skip('no git history to recover the shipped bytes from');
  const target = path.join(scratch(t), 'rules');
  fs.mkdirSync(path.join(target, 'common'), { recursive: true });
  const edited = Buffer.concat([shippedCommon('testing.md'), Buffer.from(' ')]);
  fs.writeFileSync(path.join(target, 'common/testing.md'), edited);
  fs.writeFileSync(path.join(target, 'common/mine.md'), 'my own\n');
  // Another file's shipped bytes under the wrong name are not that file's shipped copy.
  fs.writeFileSync(path.join(target, 'common/hooks.md'), shippedCommon('agents.md'));

  const report = installRules({ source: fakeRules(t, { 'typescript/style.md': 'types\n' }), target });

  assert.deepEqual(fs.readFileSync(path.join(target, 'common/testing.md')), edited);
  assert.equal(fs.readFileSync(path.join(target, 'common/mine.md'), 'utf8'), 'my own\n');
  assert.ok(fs.existsSync(path.join(target, 'common/hooks.md')));
  assert.deepEqual(entries(report, 'pruned'), []);
});

test('a dry run names the common/ files it would delete and deletes none', (t) => {
  if (!hasHistory()) return t.skip('no git history to recover the shipped bytes from');
  const target = path.join(scratch(t), 'rules');
  fs.mkdirSync(path.join(target, 'common'), { recursive: true });
  fs.writeFileSync(path.join(target, 'common/agents.md'), shippedCommon('agents.md'));

  const report = installRules({ source: fakeRules(t, {}), target, dryRun: true });

  assert.ok(fs.existsSync(path.join(target, 'common/agents.md')));
  assert.deepEqual(entries(report, 'pruned'), ['common/agents.md']);
  assert.match(report.notes.join('\n'), /would be deleted/);
});

// --- bringing an earlier install up to date (ADR 0055) ----------------------

// The release the user's machine was still on when the install learned to update.
const STALE_AT = '7df34ba';
const shippedAt = (rel) => execFileSync('git', ['-C', ROOT, 'show', `${STALE_AT}:rules/${rel}`]);
const staleTarget = (t, files) => {
  const target = path.join(scratch(t), 'rules');
  for (const [rel, bytes] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(target, rel)), { recursive: true });
    fs.writeFileSync(path.join(target, rel), bytes);
  }
  return target;
};

test('a copy of an older shipped version is replaced', (t) => {
  if (!hasHistory()) return t.skip('no git history to recover the shipped bytes from');
  const old = shippedAt('orchestration.md');
  assert.notDeepEqual(old, fs.readFileSync(path.join(rulesSource(), 'orchestration.md')), 'it is stale');
  const target = staleTarget(t, { 'orchestration.md': old });

  const report = installRules({ target });

  assert.deepEqual(fs.readFileSync(path.join(target, 'orchestration.md')), fs.readFileSync(path.join(rulesSource(), 'orchestration.md')));
  assert.deepEqual(entries(report, 'updated'), ['orchestration.md']);
  assert.equal(report.changed, true);
  assert.match(report.notes.join('\n'), /orchestration\.md/, 'each replacement is named');
});

test('the install replaces the old orchestration rule', (t) => {
  if (!hasHistory()) return t.skip('no git history to recover the shipped bytes from');
  // 0.7.20's rule, the one every machine holds before yellow-agent (S7, spec 7).
  const old = execFileSync('git', ['-C', ROOT, 'show', '492fc62b:rules/orchestration.md']);
  assert.ok(shippedLedger()['orchestration.md'].includes(sha256(old)), "the previous file's bytes are in the ledger");
  const target = staleTarget(t, { 'orchestration.md': old });

  const report = installRules({ target });

  assert.deepEqual(entries(report, 'updated'), ['orchestration.md']);
  assert.match(fs.readFileSync(path.join(target, 'orchestration.md'), 'utf8').replace(/\s+/g, ' '), /three on the yellow lane: main, co-pilot, role agent, helper/);
});

test('a hand-edited file is left alone and named', (t) => {
  if (!hasHistory()) return t.skip('no git history to recover the shipped bytes from');
  const edited = Buffer.concat([shippedAt('orchestration.md'), Buffer.from('my line\n')]);
  const target = staleTarget(t, { 'orchestration.md': edited, 'mine/own.md': 'my own\n' });

  const report = installRules({ target });

  assert.deepEqual(fs.readFileSync(path.join(target, 'orchestration.md')), edited);
  assert.equal(fs.readFileSync(path.join(target, 'mine/own.md'), 'utf8'), 'my own\n');
  assert.deepEqual(entries(report, 'updated'), []);
  assert.deepEqual(entries(report, 'differing'), ['mine/own.md', 'orchestration.md']);
  const said = report.notes.join('\n');
  assert.match(said, /orchestration\.md/);
  assert.match(said, /mine\/own\.md/, 'a file that is not ours is named, not counted');
});

test('a shipped file since removed is deleted', (t) => {
  if (!hasHistory()) return t.skip('no git history to recover the shipped bytes from');
  const ledger = { ...shippedLedger(), 'gone/old.md': [sha256('old\n')], 'kept/old.md': [sha256('old\n')] };
  const target = staleTarget(t, {
    'common/agents.md': shippedCommon('agents.md'),
    'gone/old.md': 'old\n',
    'kept/old.md': 'old\n',
    'kept/mine.md': 'my own\n',
  });

  const report = installRules({ source: fakeRules(t, { 'typescript/style.md': 'types\n' }), target, ledger });

  assert.deepEqual(entries(report, 'pruned'), ['common/agents.md', 'gone/old.md', 'kept/old.md']);
  assert.equal(fs.existsSync(path.join(target, 'gone')), false, 'an emptied directory goes with it');
  assert.equal(fs.existsSync(path.join(target, 'common')), false);
  assert.equal(fs.readFileSync(path.join(target, 'kept/mine.md'), 'utf8'), 'my own\n');
  assert.match(report.notes.join('\n'), /gone\/old\.md/, 'each deletion is named');
});

test('a shipped copy reached through a link out of the target is not written', (t) => {
  const outside = scratch(t, 'pilot-rules-elsewhere-');
  fs.writeFileSync(path.join(outside, 'a.md'), 'old\n');
  const target = path.join(scratch(t), 'rules');
  fs.mkdirSync(target);
  fs.symlinkSync(outside, path.join(target, 'linked'), 'junction');

  const report = installRules({
    source: fakeRules(t, { 'linked/a.md': 'new\n' }),
    target,
    ledger: { 'linked/a.md': [sha256('old\n')] },
  });

  assert.equal(fs.readFileSync(path.join(outside, 'a.md'), 'utf8'), 'old\n');
  assert.deepEqual(entries(report, 'failed'), ['linked/a.md']);
});

test("every current rules file's hash is in the ledger", (t) => {
  const ledger = shippedLedger();
  for (const rel of filesUnder(rulesSource())) {
    assert.ok(ledger[rel]?.includes(sha256(fs.readFileSync(path.join(rulesSource(), rel)))), rel);
  }
  if (!hasHistory()) return t.skip('no git history to rebuild the ledger from');
  const check = spawnSync(process.execPath, [path.join(ROOT, 'scripts/build-rules-ledger.mjs'), '--check'], {
    encoding: 'utf8',
  });
  assert.equal(check.status, 0, `build-rules-ledger --check: ${check.stdout}${check.stderr}`);
});

test('a second install changes nothing', (t) => {
  if (!hasHistory()) return t.skip('no git history to recover the shipped bytes from');
  const target = staleTarget(t, {
    'orchestration.md': shippedAt('orchestration.md'),
    'vertical-execution.md': shippedAt('vertical-execution.md'),
    'mine/own.md': 'my own\n',
  });
  installRules({ target });

  const second = installRules({ target });

  assert.equal(second.changed, false);
  for (const key of ['written', 'updated', 'pruned', 'failed']) assert.deepEqual(entries(second, key), [], key);
  assert.deepEqual(entries(second, 'differing'), ['mine/own.md']);
});

// --- the vendoring ledger --------------------------------------------------

const { buildLedger, checkLedger, LEDGER_FILE } = await import('../build-vendor-ledger.mjs');
const { parseLedger } = await import('../check-provenance.mjs');

/** A whole miniature repository: a ledger fragment and the files it lists. */
function fakeRepo(t, { fragment, files }) {
  const root = scratch(t, 'pilot-vendor-');
  fs.mkdirSync(path.join(root, 'vendor'), { recursive: true });
  fs.writeFileSync(path.join(root, 'vendor', 'sample.md'), fragment, 'utf8');
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body, 'utf8');
  }
  return root;
}

const header = (fields) =>
  ['<!-- provenance', ...Object.entries(fields).map(([k, v]) => `${k}: ${v}`), '-->', ''].join('\n');

const sampleFragment = [
  '# Vendoring ledger: a sample',
  '',
  'From **something-else 9.9.9**, prose nobody should trust.',
  '',
  '## Vendored files',
  '',
  '| File | Upstream | Adapted | What changed and why |',
  '| --- | --- | --- | --- |',
  '| `skills/one/SKILL.md` | `skills/one/SKILL.md` | verbatim | nothing |',
  '',
].join('\n');

const sampleFile = (project) =>
  header({
    upstream: `${project} 1.0.0 - skills/one/SKILL.md`,
    copyright: 'Copyright (c) 2026 A Person',
    licence: 'MIT - see THIRD-PARTY-NOTICES.md',
    adapted: 'verbatim',
    ledger: 'vendor/sample.md',
  }) + '\n# One\n';

test('the assembled ledger carries a row for every vendored file in both fragments', () => {
  const rows = ['methodology', 'toolbox'].flatMap((name) => [
    ...parseLedger(read(`vendor/${name}.md`)).keys(),
  ]);
  const assembled = buildLedger(ROOT);

  assert.ok(rows.length > 130, `both fragments should list the whole vendored set, not ${rows.length}`);
  for (const file of rows) {
    assert.ok(assembled.includes(file), `${file} has a fragment row but no row in ${LEDGER_FILE}`);
  }
});

test('the ledger checked into the repository is the one the script generates', () => {
  assert.equal(read(LEDGER_FILE), buildLedger(ROOT), `${LEDGER_FILE} is stale; regenerate it`);
});

test('the ledger credits the author first, then both upstreams and their licences', () => {
  const assembled = buildLedger(ROOT);

  assert.ok(
    assembled.indexOf('HazzardRust') < assembled.indexOf('Matt Pocock'),
    'L13: the author comes first, then the upstreams',
  );
  assert.match(assembled, /Copyright \(c\) 2026 Matt Pocock/);
  assert.match(assembled, /Copyright \(c\) 2026 Affaan Mustafa/);
  assert.match(assembled, /THIRD-PARTY-NOTICES\.md/, 'the notices are where the licence text lives');
});

test('a generated file says it is generated and what to edit instead', () => {
  const assembled = buildLedger(ROOT);

  assert.match(assembled, /generated/i);
  assert.match(assembled, /build-vendor-ledger\.mjs/, 'and names the command that regenerates it');
  assert.match(assembled, /vendor\/methodology\.md/, 'and the fragment a row actually lives in');
});

test('--check notices a ledger that no longer matches its fragments', (t) => {
  const stale = path.join(scratch(t), 'VENDOR.md');
  fs.writeFileSync(stale, '# Vendoring ledger\n\nsomething from last week\n', 'utf8');

  const report = checkLedger(ROOT, stale);

  assert.equal(report.ok, false);
  assert.match(report.reason, /build-vendor-ledger\.mjs/, 'and says how to fix it');
});

test('--check passes on the ledger as it stands', () => {
  assert.equal(checkLedger(ROOT).ok, true);
});

test('the upstream a section names comes from the files, not from the fragment\'s prose', (t) => {
  const root = fakeRepo(t, {
    fragment: sampleFragment,
    files: { 'skills/one/SKILL.md': sampleFile('some-upstream') },
  });

  const assembled = buildLedger(root);

  assert.match(assembled, /some-upstream 1\.0\.0/, 'the provenance header is the source of truth');
  assert.doesNotMatch(assembled, /something-else 9\.9\.9/, 'the prose is not');
});

test('rows that disagree about where they came from are refused, not averaged', (t) => {
  const root = fakeRepo(t, {
    fragment: sampleFragment.replace(
      '| `skills/one/SKILL.md` | `skills/one/SKILL.md` | verbatim | nothing |',
      '| `skills/one/SKILL.md` | `skills/one/SKILL.md` | verbatim | nothing |\n' +
        '| `skills/two/SKILL.md` | `skills/two/SKILL.md` | verbatim | nothing |',
    ),
    files: {
      'skills/one/SKILL.md': sampleFile('some-upstream'),
      'skills/two/SKILL.md': sampleFile('another-upstream').replace(
        'skills/one/SKILL.md',
        'skills/two/SKILL.md',
      ),
    },
  });

  assert.throws(() => buildLedger(root), /upstream/i);
});

// --- the drift report ------------------------------------------------------

const { checkUpstream, upstreamCandidates } = await import('../check-upstream.mjs');

const PROJECT = 'some-upstream';

/**
 * A vendored file and the upstream it came from, so drift can be made to happen
 * rather than waited for. Nothing here reads the caches on the machine running
 * the tests: a test that needed a particular plugin installed would pass here and
 * fail on the next machine.
 */
function vendoredPair(t, { mine, theirs, adapted = 'verbatim', at = 'rules/common/testing.md' }) {
  const root = scratch(t, 'pilot-upstream-repo-');
  const upstream = scratch(t, 'pilot-upstream-src-');

  fs.mkdirSync(path.join(root, path.dirname(at)), { recursive: true });
  fs.writeFileSync(
    path.join(root, at),
    header({
      upstream: `${PROJECT} 2.2.0 - ${at}`,
      copyright: 'Copyright (c) 2026 A Person',
      licence: 'MIT - see THIRD-PARTY-NOTICES.md',
      adapted,
      ledger: 'vendor/sample.md',
    }) + mine,
    'utf8',
  );

  if (theirs !== null) {
    fs.mkdirSync(path.join(upstream, path.dirname(at)), { recursive: true });
    fs.writeFileSync(path.join(upstream, at), theirs, 'utf8');
  }

  return { root, upstream, roots: { [PROJECT]: upstream } };
}

const onlyFile = (result) => result.projects[0].files[0];

test('a vendored file that still matches upstream is in sync', (t) => {
  const { root, roots } = vendoredPair(t, { mine: '\n# Testing\n\nCoverage.\n', theirs: '# Testing\n\nCoverage.\n' });

  const result = checkUpstream(root, { roots, scan: ['rules'] });

  assert.equal(result.ok, true);
  assert.equal(onlyFile(result).state, 'in-sync');
});

test('the provenance header this package added is never counted as drift', (t) => {
  // The header is inserted after any frontmatter, which shifts every line below it.
  const { root, roots } = vendoredPair(t, {
    mine: '---\npaths:\n  - "**/*.ts"\n---\n\n\n# Style\n\nRules.\n',
    theirs: '---\npaths:\n  - "**/*.ts"\n---\n# Style\n\nRules.\n',
    at: 'rules/typescript/coding-style.md',
  });

  const result = checkUpstream(root, { roots, scan: ['rules'] });

  assert.equal(onlyFile(result).state, 'in-sync', 'only the header and blank lines differ');
});

test('a header whose opening line has a trailing space is still a header', (t) => {
  const { root, roots } = vendoredPair(t, {
    mine: '\n# Testing\n\nCoverage.\n',
    theirs: '# Testing\n\nCoverage.\n',
  });
  // One trailing space, invisible in every diff view and in most editors. The
  // provenance pattern had two homes that disagreed about it: the one that decides
  // whether a file is vendored accepted it, and the one that strips the header
  // before comparing did not - so the six header lines it failed to strip were
  // reported as drift in a file that had not moved a byte.
  const file = path.join(root, 'rules/common/testing.md');
  fs.writeFileSync(
    file,
    fs.readFileSync(file, 'utf8').replace('<!-- provenance\n', '<!-- provenance \n'),
    'utf8',
  );

  const result = checkUpstream(root, { roots, scan: ['rules'] });

  assert.equal(onlyFile(result).state, 'in-sync', 'one pattern, so the two cannot disagree');
});

test('a file the ledger calls verbatim that no longer matches upstream is drift', (t) => {
  const { root, roots } = vendoredPair(t, {
    mine: '\n# Testing\n\nCoverage is 80%.\n',
    theirs: '# Testing\n\nCoverage is 90%.\nAnd a new line.\n',
  });

  const result = checkUpstream(root, { roots, scan: ['rules'] });
  const file = onlyFile(result);

  assert.equal(file.state, 'drifted');
  assert.equal(file.removed, 1, 'one line here that upstream no longer has');
  assert.equal(file.added, 2, 'two lines upstream that are not here');
  assert.match(result.lines.join('\n'), /rules[\/]common[\/]testing\.md/, 'and the file is named');
});

test('a file this project adapted on purpose differs without being drift', (t) => {
  const { root, roots } = vendoredPair(t, {
    mine: '\n# Testing\n\nOurs.\n',
    theirs: '# Testing\n\nTheirs.\n',
    adapted: 'the deck replaces the terminal prompt',
  });

  const result = checkUpstream(root, { roots, scan: ['rules'] });

  assert.equal(onlyFile(result).state, 'adapted');
  assert.equal(result.ok, true, 'an adaptation is the ledger working, not a problem');
});

test('a file whose upstream has been moved or deleted is reported, not skipped', (t) => {
  const { root, roots } = vendoredPair(t, { mine: '\n# Testing\n', theirs: null });

  const result = checkUpstream(root, { roots, scan: ['rules'] });

  assert.equal(onlyFile(result).state, 'gone');
  assert.match(result.lines.join('\n'), /gone/i);
});

test('an upstream that is not installed anywhere fails and says how to point at one', (t) => {
  const { root } = vendoredPair(t, { mine: '\n# Testing\n', theirs: '# Testing\n' });

  const result = checkUpstream(root, { roots: {}, candidates: () => [], scan: ['rules'] });

  assert.equal(result.ok, false);
  assert.match(result.lines.join('\n'), /--root/, 'the flag that fixes it has to be in the message');
  assert.equal(result.projects[0].found, false);
});

test('an upstream held in git is reported with the commit it is at', (t) => {
  const { root, upstream, roots } = vendoredPair(t, { mine: '\n# Testing\n', theirs: '# Testing\n' });
  const git = (...args) =>
    execFileSync('git', ['-C', upstream, ...args], { encoding: 'utf8' }).trim();
  git('init', '-q');
  git('add', '.');
  git('commit', '-q', '-m', 'upstream');

  const result = checkUpstream(root, { roots, scan: ['rules'] });
  const project = result.projects[0];

  assert.equal(project.commit, git('rev-parse', '--short', 'HEAD'));
  assert.match(result.lines.join('\n'), new RegExp(project.commit), 'the report names the commit');
});

test('rules are counted apart from the agents and skills', (t) => {
  const { root, roots, upstream } = vendoredPair(t, { mine: '\n# Testing\n', theirs: '# Testing\n' });
  for (const dir of ['agents', 'skills/one']) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    fs.mkdirSync(path.join(upstream, dir), { recursive: true });
  }
  const skill = 'skills/one/SKILL.md';
  fs.writeFileSync(
    path.join(root, skill),
    header({
      upstream: `${PROJECT} 2.2.0 - ${skill}`,
      copyright: 'Copyright (c) 2026 A Person',
      licence: 'MIT - see THIRD-PARTY-NOTICES.md',
      adapted: 'verbatim',
      ledger: 'vendor/sample.md',
    }) + '\n# One\n',
    'utf8',
  );
  fs.writeFileSync(path.join(upstream, skill), '# One\n', 'utf8');

  const result = checkUpstream(root, { roots, scan: ['rules', 'skills'] });
  const { counts } = result.projects[0];

  assert.equal(counts.rules.total, 1);
  assert.equal(counts.other.total, 1);
  assert.match(result.lines.join('\n'), /rules\//);
});

test('the places an upstream is looked for are this machine\'s plugin directories', () => {
  const candidates = upstreamCandidates('ECC', '2.2.0', path.join('C:', 'home'));

  assert.ok(candidates.length >= 2, 'a git checkout first, then the version cache');
  assert.ok(
    candidates.every((candidate) => candidate.path.startsWith(path.join('C:', 'home'))),
    'and both under the home directory it was given, never a hard-coded one',
  );
});

// --- the WebFetch allowlist (slice 8's live security review) ----------------

// `installSettings` and not a single-merge function per setting: three singles in a
// row took three backups, two of them copies of a half-merged file, each report
// calling its own backup "the previous file". The composed merge is what the command
// line runs, so it is what these assert against.
const { installSettings, statusLineSetting, webFetchRule, parseArgs, defaultSettingsPath } =
  await import('../install-settings.mjs');

const PLUGIN_ROOT = '/opt/pilot';

function settingsFile(t, contents) {
  const file = path.join(scratch(t, 'pilot-allowlist-'), 'settings.json');
  if (contents !== undefined) fs.writeFileSync(file, contents, 'utf8');
  return file;
}

/**
 * A settings file this package has already merged into, so a later run has nothing
 * left to do but the allowlist. It is what lets a test still assert "this changed
 * nothing" now that the merge is one composed run rather than three isolated ones.
 */
function settled(t, contents) {
  const file = settingsFile(t, contents);
  installSettings({ settingsPath: file, pluginRoot: PLUGIN_ROOT });
  return file;
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

const backupsBeside = (file) =>
  fs.readdirSync(path.dirname(file)).filter((name) => name.includes('pilot-backup'));

test('naming no documentation host leaves the permissions block alone entirely', (t) => {
  const file = settled(t, JSON.stringify({ permissions: { allow: ['Bash(git status)'] } }, null, 2));
  const before = fs.readFileSync(file, 'utf8');

  const report = installSettings({ settingsPath: file, pluginRoot: PLUGIN_ROOT, domains: [] });

  assert.equal(report.changed, false);
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'an allowlist is offered, never forced');
  assert.equal(report.webFetch, null, 'with no host named there is no permissions step at all');
  assert.doesNotMatch(
    report.notes.join('\n'),
    /WebFetch/,
    'not read, not written, and not mentioned',
  );
});

test('a host the friend names becomes a WebFetch rule they can see', (t) => {
  const file = settingsFile(t, '{}');

  const report = installSettings({
    settingsPath: file,
    pluginRoot: PLUGIN_ROOT,
    domains: ['nodejs.org', 'react.dev'],
  });

  assert.deepEqual(readJson(file).permissions.allow, [
    'WebFetch(domain:nodejs.org)',
    'WebFetch(domain:react.dev)',
  ]);
  assert.equal(report.changed, true);
  assert.match(report.notes.join('\n'), /WebFetch\(domain:react\.dev\)/, 'the report quotes what it granted');
});

test('the permissions a friend already had are kept exactly as they were', (t) => {
  const file = settingsFile(t, JSON.stringify({
    statusLine: { type: 'command', command: 'node theirs.js' },
    permissions: { allow: ['Bash(git status)'], deny: ['Read(./.env)'] },
  }, null, 2));

  installSettings({ settingsPath: file, pluginRoot: PLUGIN_ROOT, domains: ['nodejs.org'] });

  const settings = readJson(file);
  assert.deepEqual(settings.permissions.allow, ['Bash(git status)', 'WebFetch(domain:nodejs.org)']);
  assert.deepEqual(settings.permissions.deny, ['Read(./.env)'], 'a deny list is never edited');
  assert.equal(settings.statusLine.command, 'node theirs.js', 'and their status line is not touched either');
});

test('naming the same host twice grants it once', (t) => {
  const file = settingsFile(t, '{}');
  const options = { settingsPath: file, pluginRoot: PLUGIN_ROOT, domains: ['nodejs.org'] };

  installSettings(options);
  const after = fs.readFileSync(file, 'utf8');
  const second = installSettings(options);

  assert.equal(second.changed, false);
  assert.equal(fs.readFileSync(file, 'utf8'), after, 'a second run changes nothing');
  assert.deepEqual(second.webFetch.alreadyAllowed, ['WebFetch(domain:nodejs.org)']);
});

test('a host the friend has already denied is reported, not quietly granted', (t) => {
  const file = settingsFile(t, JSON.stringify({
    permissions: { deny: ['WebFetch(domain:internal.example.com)'] },
  }, null, 2));

  const report = installSettings({
    settingsPath: file,
    pluginRoot: PLUGIN_ROOT,
    domains: ['internal.example.com', 'nodejs.org'],
  });

  assert.deepEqual(report.webFetch.denied, ['WebFetch(domain:internal.example.com)']);
  assert.deepEqual(readJson(file).permissions.allow, ['WebFetch(domain:nodejs.org)']);
  assert.match(report.notes.join('\n'), /internal\.example\.com/, 'and says why it was skipped');
});

test('a friend who has denied WebFetch outright is not granted a host around it', (t) => {
  // A bare tool name is the whole tool. This one used not to be read as covering
  // anything, so the allow rule went in beside a deny that goes on refusing it.
  const file = settingsFile(t, JSON.stringify({ permissions: { deny: ['WebFetch'] } }, null, 2));

  const report = installSettings({
    settingsPath: file,
    pluginRoot: PLUGIN_ROOT,
    domains: ['nodejs.org'],
  });

  assert.deepEqual(report.webFetch.added, [], 'a rule that reads as a grant and behaves as a refusal is worse than none');
  assert.deepEqual(report.webFetch.denied, ['WebFetch(domain:nodejs.org)']);
  assert.equal(readJson(file).permissions.allow, undefined, 'nothing was added to allow');
  assert.deepEqual(readJson(file).permissions.deny, ['WebFetch'], 'and their deny list is still theirs');
});

test('something that is not a hostname is refused before the file is opened', (t) => {
  const file = settingsFile(t, '{}');

  for (const bad of ['https://nodejs.org', 'nodejs.org/docs', 'node js.org', '*']) {
    assert.throws(
      () => installSettings({ settingsPath: file, pluginRoot: PLUGIN_ROOT, domains: [bad] }),
      /host/i,
      `${bad} is not a host and must not become a permission rule`,
    );
  }
  assert.equal(fs.readFileSync(file, 'utf8'), '{}', 'and nothing was written on the way to finding out');
});

test('a permissions block that is not the shape Claude Code reads is refused, not rewritten', (t) => {
  // A malformed block is still theirs. `typeof [] === 'object'`, so a permissions array
  // used to be spread into an object and come back out with numeric keys; an `allow`
  // that was not a list was read as empty and written back as ours. And a `deny` that is
  // a string is a refusal this script would have failed to see and granted around.
  const malformed = {
    'permissions as a list': { permissions: ['WebFetch(domain:nodejs.org)'] },
    'allow as a string': { permissions: { allow: 'WebFetch(domain:nodejs.org)' } },
    'deny as a string': { permissions: { deny: 'WebFetch' } },
  };

  for (const [what, settings] of Object.entries(malformed)) {
    const original = JSON.stringify(settings, null, 2);
    const file = settingsFile(t, original);

    assert.throws(
      () => installSettings({ settingsPath: file, pluginRoot: PLUGIN_ROOT, domains: ['nodejs.org'] }),
      /permissions/,
      `${what} must stop the merge`,
    );
    assert.equal(fs.readFileSync(file, 'utf8'), original, `${what}: and the file is left as it was`);
    assert.deepEqual(backupsBeside(file), [], `${what}: a run that writes nothing backs nothing up`);
  }
});

test('a settings file about to gain nothing but a rule is backed up first', (t) => {
  // Everything else this package merges is already in place, so the allowlist is the
  // only reason to write - and a run that writes for any reason takes a backup first.
  // The clock stands still, as it does on a fast host when both runs fall in one millisecond.
  t.mock.timers.enable({ apis: ['Date'] });
  const file = settled(t, JSON.stringify({ includeCoAuthoredBy: true }));
  const before = fs.readFileSync(file, 'utf8');
  const taken = backupsBeside(file).length;

  const report = installSettings({
    settingsPath: file,
    pluginRoot: PLUGIN_ROOT,
    domains: ['nodejs.org'],
  });

  assert.ok(report.backupPath, 'the merge reformats the file, so the old one has to survive');
  assert.equal(fs.readFileSync(report.backupPath, 'utf8'), before);
  assert.equal(backupsBeside(file).length, taken + 1, 'one run, one backup, whatever it merged');
});

test('two backups taken in the same millisecond are two files, the first still the original', (t) => {
  t.mock.method(Date.prototype, 'toISOString', () => '2026-01-01T00:00:00.000Z');
  const file = settingsFile(t, JSON.stringify({ includeCoAuthoredBy: true }));
  const original = fs.readFileSync(file, 'utf8');
  installSettings({ settingsPath: file, pluginRoot: PLUGIN_ROOT });
  installSettings({ settingsPath: file, pluginRoot: PLUGIN_ROOT, domains: ['nodejs.org'] });

  const backups = backupsBeside(file).sort();
  assert.equal(backups.length, 2);
  assert.equal(fs.readFileSync(path.join(path.dirname(file), backups[0]), 'utf8'), original);
});

test('the domains come off the command line as a list, however they were typed', () => {
  assert.deepEqual(parseArgs(['--allow-web-fetch', 'nodejs.org,react.dev']).domains, [
    'nodejs.org',
    'react.dev',
  ]);
  assert.deepEqual(
    parseArgs(['--allow-web-fetch', 'nodejs.org', '--allow-web-fetch', 'react.dev']).domains,
    ['nodejs.org', 'react.dev'],
  );
  assert.equal(parseArgs([]).domains, undefined, 'and no flag means no allowlist at all');
});

test('the rule written is the one Claude Code actually reads', () => {
  assert.equal(webFetchRule('nodejs.org'), 'WebFetch(domain:nodejs.org)');
});

// --- the deck tools (audit-fixes S4, spec 12-13) ---------------------------

// The deck server's tools, and nothing wider: a deck call that waits on a terminal
// prompt stalls a background lane nobody is watching.
const DECK_TOOLS = 'mcp__plugin_pilot_deck__*';

const installCli = (args) =>
  spawnSync(
    process.execPath,
    [path.join(ROOT, 'scripts', 'install-settings.mjs'), '--plugin-root', PLUGIN_ROOT, ...args],
    { encoding: 'utf8' },
  );

test('answered yes, the rule is in permissions.allow', (t) => {
  const file = settingsFile(t, JSON.stringify({ permissions: { allow: ['Bash(git status)'] } }));

  // Yes is the default: the question is asked in docs/INSTALL.md, and no flag is the yes.
  const run = installCli(['--settings', file]);

  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(readJson(file).permissions.allow, [
    'Bash(git status)', DECK_TOOLS, 'Bash(pilot sync *)', 'Bash(pilot integrate *)', 'Bash(pilot land *)', 'Bash(pilot landing *)', 'Bash(pilot ps)', 'Bash(pilot gc)', 'Bash(pilot deck --stop *)', 'Bash(pilot deck --scratch *)',
  ]);
  assert.match(run.stdout, /mcp__plugin_pilot_deck__\*/, 'the report quotes what it granted');
});

test('answered no, no deck rule is written', (t) => {
  const file = settled(t, JSON.stringify({ permissions: { allow: ['Bash(git status)'] } }));

  const run = installCli(['--settings', file, '--no-deck-tools']);

  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(readJson(file).permissions.allow, [
    'Bash(git status)', 'Bash(pilot sync *)', 'Bash(pilot integrate *)', 'Bash(pilot land *)', 'Bash(pilot landing *)', 'Bash(pilot ps)', 'Bash(pilot gc)', 'Bash(pilot deck --stop *)', 'Bash(pilot deck --scratch *)',
  ]);
  assert.doesNotMatch(run.stdout, /mcp__plugin_pilot_deck/, 'not written, and not mentioned');
});

test('two runs leave one rule', (t) => {
  const file = settingsFile(t, '{}');
  const options = { settingsPath: file, pluginRoot: PLUGIN_ROOT, deckTools: true };

  installSettings(options);
  const after = fs.readFileSync(file, 'utf8');
  const second = installSettings(options);

  assert.equal(second.changed, false);
  assert.equal(fs.readFileSync(file, 'utf8'), after, 'a second run changes nothing');
  assert.deepEqual(readJson(file).permissions.allow, [DECK_TOOLS]);
  assert.equal(second.deckTools.state, 'already-allowed');
});

test('the deck rule and a WebFetch host land together in one run', (t) => {
  const file = settingsFile(t, '{}');

  installSettings({ settingsPath: file, pluginRoot: PLUGIN_ROOT, domains: ['nodejs.org'], deckTools: true });

  assert.deepEqual(readJson(file).permissions.allow, ['WebFetch(domain:nodejs.org)', DECK_TOOLS]);
});

test('a covering deny is left alone and reported, and no allow is added', (t) => {
  for (const deny of ['mcp__plugin_pilot_deck__*', 'mcp__plugin_pilot_deck', 'mcp__*',
    'mcp__plugin_pilot_deck__deck_post', '*__deck_read', 'mcp__plugin_pilot_*__deck_read']) {
    const file = settingsFile(t, JSON.stringify({ permissions: { deny: [deny] } }));

    const report = installSettings({ settingsPath: file, pluginRoot: PLUGIN_ROOT, deckTools: true });

    const permissions = readJson(file).permissions;
    assert.equal(permissions.allow, undefined, `${deny}: nothing was added to allow`);
    assert.deepEqual(permissions.deny, [deny], `${deny}: and their deny list is still theirs`);
    assert.equal(report.deckTools.state, 'denied', deny);
    assert.match(report.notes.join('\n'), new RegExp(deny.replace(/\*/g, '\\*')), deny);
  }
});

test('a deny that names another tool does not stop the deck allow', (t) => {
  const file = settingsFile(t, JSON.stringify({ permissions: { deny: ['Bash(rm:*)'] } }));

  const report = installSettings({ settingsPath: file, pluginRoot: PLUGIN_ROOT, deckTools: true });

  assert.equal(report.deckTools.state, 'added');
  assert.deepEqual(readJson(file).permissions.allow, [DECK_TOOLS]);
});

// --- what a friend reads ---------------------------------------------------

const README = () => read('README.md');
const INSTALL = () => read('docs/INSTALL.md');
const NOTICES = () => read('THIRD-PARTY-NOTICES.md');
const EXCERPT = () => read('CLAUDE.excerpt.md');

/** The text between one `## ` heading and the next. */
function section(source, heading) {
  const start = source.indexOf(`## ${heading}`);
  assert.notEqual(start, -1, `there is no "## ${heading}" section`);
  const rest = source.slice(start + 3);
  const end = rest.indexOf('\n## ');
  return end === -1 ? rest : rest.slice(0, end);
}

/** A numbered step of the instructions, found by its title so a new step cannot shift it. */
function stepNamed(source, title) {
  const start = source.search(new RegExp(`^## \\d+\\. ${title}`, 'm'));
  assert.notEqual(start, -1, `there is no numbered step titled "${title}"`);
  const end = source.indexOf('\n## ', start + 3);
  return end === -1 ? source.slice(start) : source.slice(start, end);
}

test('the README hands a friend one prompt to paste, not a list of commands to type', () => {
  const install = section(README(), 'Install');

  assert.match(install, /paste/i, 'L2: the install is a prompt, and the README has to say so');
  assert.match(install, /docs\/INSTALL\.md/, 'and the prompt sends Claude to the instructions');
  assert.equal(
    (install.match(/```/g) || []).length,
    2,
    'exactly one fenced block: the thing to paste, and nothing that reads as a second step',
  );
  assert.doesNotMatch(install, /```bash/, 'a bash block is a command list a friend will type');
});

test('the prompt a friend pastes names the pilot command as a step, and Use starts a run with it', () => {
  // The prompt lists the steps by name, and Claude does what the list says: a step the
  // list leaves out is one an install can skip, which is how `pilot run` came to be
  // missing from a machine the install had finished on.
  assert.match(section(README(), 'Install'), /global `pilot` command/);
  assert.match(section(README(), 'Use'), /```bash\s+pilot run\s+```/);
  assert.match(stepNamed(INSTALL(), 'Put the `pilot` command on the PATH'), /scripts\/install-command\.mjs/);
});

test('the install still asks no question about the profile, and step 4 does not write a shell function', () => {
  // S1 once wrote a `pilot` function into the profile and asked first; the launcher
  // replaced that step. The PATH edit (ADR 0128) names the profile file in step 4, but it
  // is announced, not asked: the questions (four since plain-session S6 asked the reach)
  // gain none about a profile.
  assert.doesNotMatch(INSTALL(), /shell function/i);
  assert.doesNotMatch(section(INSTALL(), 'The four questions to ask'), /profile|PATH/);
  assert.match(INSTALL(), /answers to the four questions below/);
});

test('step 4 says the install edits the PATH and never tells Claude not to', () => {
  const step = stepNamed(INSTALL(), 'Put the `pilot` command on the PATH');

  assert.match(step, /open a new terminal/i);
  assert.doesNotMatch(step, /do not edit their PATH/i);
  assert.match(step, /could not write the PATH/i);
});

test('the changes table names where the PATH is written', () => {
  const table = section(INSTALL(), 'What this changes, and what it never touches');

  assert.match(table, /^\| `HKCU\\Environment\\Path`/m);
  assert.match(table, /^\| The shell profile file/m);
  assert.match(table, /`~\/\.bash_profile`, `~\/\.bash_login` or `~\/\.profile`/, 'the darwin bash login files');
});

test('README and INSTALL carry the note', () => {
  const install = section(README(), 'Install');

  assert.match(install, /Full Disk Access/);
  assert.match(install, /windows.*macos.*ubuntu/i, 'the Install line names the CI OSes');
  assert.equal((install.match(/```/g) || []).length, 2, 'the note adds no fence');
  assert.match(stepNamed(INSTALL(), 'Put the `pilot` command on the PATH'), /Full Disk Access/);
});

test('INSTALL.md asks the deck-tools question and says why', () => {
  const questions = section(INSTALL(), 'The four questions to ask');

  assert.match(questions, /mcp__plugin_pilot_deck__\*/, 'the rule, named exactly');
  assert.match(questions, /terminal prompt/i, 'why: a deck call would wait on one');
  assert.match(questions, /auto[- ]mode\s+classifier/i, 'and auto mode may refuse it');
  assert.match(questions, /--no-deck-tools/, 'and what a no runs');
  assert.match(
    section(INSTALL(), 'What this changes, and what it never touches'),
    /mcp__plugin_pilot_deck__\*/,
    'the settings row says the rule goes in',
  );
});

test('updating is claude plugin update and nothing else, because the command follows the plugin', () => {
  // The command once linked one version's directory, and the README told a friend to
  // re-run the install after every update. The launcher made that step unnecessary.
  assert.match(section(README(), 'Install'), /claude plugin update\s+pilot@pilot` is all there is/);
  assert.doesNotMatch(README(), /run it again/i);
  assert.match(stepNamed(INSTALL(), 'Put the `pilot` command on the PATH'), /never has to run again/);
});

test('the README describes the crew that is here now, not the one that was', () => {
  // It said "in this slice, one stub pilot" five slices after the stub was replaced.
  // A layout table is read by exactly the person who has not looked in the directory.
  const row = README().split('\n').find((line) => line.startsWith('| `agents/`'));
  const shipped = fs.readdirSync(path.join(ROOT, 'agents')).filter((name) => name.endsWith('.md'));

  assert.doesNotMatch(row, /stub|in this slice/i, 'the stub pilot is long gone');
  assert.equal(shipped.length, 25, 'twenty-five agents: change the README row with this number');
});

test('the README and the instructions agree on what is being installed', () => {
  for (const source of [README(), INSTALL()]) {
    assert.match(source, /pilot@pilot/, 'the plugin id a friend installs');
    assert.match(source, /HazzardRust\/pilot/, 'from the marketplace this repository is');
  }
});

test('the README still says where the deck listens and what it refuses to hold', () => {
  const source = README();

  assert.match(source, /127\.0\.0\.1:4321/);
  assert.match(source, /loopback/i, 'A6: it binds the loopback interface only');
  assert.match(source, /key or a token|key or token/i, 'and refuses to store a credential');
});

test('both upstream notices are carried whole, not summarised', () => {
  const notices = NOTICES();
  const permission = notices.match(/Permission is hereby granted, free of charge/g) || [];
  const warranty = notices.match(/THE SOFTWARE IS PROVIDED "AS IS"/g) || [];

  assert.equal(permission.length, 3, 'L8: one full MIT text per upstream, verbatim');
  assert.equal(warranty.length, 3);
  assert.match(notices, /chrome-devtools-mcp/, 'and the one external dependency is named');
  assert.match(notices, /Apache-2\.0/, 'L7: with its licence, which is not MIT');
});

test('the instructions carry every step the design says the install performs', () => {
  const install = INSTALL();

  for (const step of [
    'claude plugin marketplace add',
    'claude plugin install',
    'npm install --omit=dev',
    'scripts/install-command.mjs',
    'scripts/install-settings.mjs',
    'scripts/install-rules.mjs',
    'CLAUDE.excerpt.md',
    '127.0.0.1:4321',
  ]) {
    assert.ok(install.includes(step), `docs/INSTALL.md never mentions ${step}`);
  }
});

test('every script the instructions tell Claude to run is one this package ships', () => {
  const named = new Set(INSTALL().match(/scripts\/[a-z-]+\.mjs/g) || []);

  assert.ok(named.size >= 2, 'the install runs scripts; they have to be named');
  for (const script of named) {
    assert.ok(fs.existsSync(path.join(ROOT, script)), `docs/INSTALL.md names ${script}, which is not here`);
  }
});

test('the pinned browser dependency in the instructions is the pinned one in the manifest', () => {
  const declared = JSON.parse(read('.mcp.json')).mcpServers['chrome-devtools'].args.join(' ');
  const pin = /chrome-devtools-mcp@[0-9.]+/.exec(declared)[0];

  assert.equal(pin, 'chrome-devtools-mcp@1.9.0', 'L7 pins the version');
  assert.ok(INSTALL().includes(pin), `docs/INSTALL.md does not name ${pin}`);
  assert.ok(NOTICES().includes(pin.split('@')[0]), 'and the notices name the package');
});

test('nothing is appended to a friend\'s CLAUDE.md without them saying yes', () => {
  const install = INSTALL();
  const excerptStep = install.slice(install.indexOf('CLAUDE.excerpt.md'));

  assert.match(excerptStep, /consent|ask|say yes|permission/i, 'the excerpt is offered, never taken');
  assert.match(excerptStep, /do not append|only .*(?:if|when) they/i, 'and the refusal path is explicit');
});

test('the instructions say what a second run does, because a friend will run it twice', () => {
  assert.match(INSTALL(), /again|second time|re-?run/i);
  assert.match(INSTALL(), /never overwrit|without overwriting/i, 'L11: nothing already there is replaced');
});

test('the excerpt a friend may take is short, and is about how to use the pilot', () => {
  const excerpt = EXCERPT();

  assert.ok(excerpt.split('\n').length < 80, 'an excerpt that long is a document, not an excerpt');
  assert.match(excerpt, /pilot/i);
  assert.match(excerpt, /127\.0\.0\.1:4321/, 'it has to say where the deck is');
  assert.match(excerpt, /worktree/i, 'and the one working rule the crew depends on');
});

test('nothing this slice adds is named after an upstream project', () => {
  const upstream = new RegExp(['\b' + 'e' + 'cc\b', 'poc' + 'ock'].join('|'), 'i');
  const added = [
    'docs/INSTALL.md',
    'THIRD-PARTY-NOTICES.md',
    'VENDOR.md',
    'CLAUDE.excerpt.md',
    'scripts/check-upstream.mjs',
    'scripts/build-vendor-ledger.mjs',
    'scripts/install-rules.mjs',
    'scripts/test/install.test.mjs',
  ];

  for (const rel of added) {
    assert.ok(!upstream.test(rel), `${rel} is named after an upstream project`);
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `${rel} is not here`);
  }
  assert.ok(!upstream.test(EXCERPT()), 'the excerpt goes into a friend\'s CLAUDE.md and names no vendor');
});

test('the README has a "Your part" section, after Use and before Layout', () => {
  const source = README();
  const use = source.indexOf('## Use');
  const yourPart = source.indexOf('## Your part');
  const layout = source.indexOf('## Layout');

  assert.notEqual(yourPart, -1, 'there is no "## Your part" section');
  assert.ok(use < yourPart, '"Your part" belongs after Use');
  assert.ok(yourPart < layout, '"Your part" belongs before Layout');
});

test('the README names the three steps that stay the human\'s, and where each is enforced', () => {
  const yourPart = section(README(), 'Your part');

  assert.match(yourPart, /spec design/i, 'spec §4: names spec design');
  assert.match(yourPart, /Gate 1/, 'and where it is enforced');
  assert.match(yourPart, /quality assurance/i, 'spec §4: names QA');
  assert.match(yourPart, /Gate 2/, 'and where it is enforced');
  assert.match(yourPart, /walkthrough/i, 'Gate 2 is the QA walkthrough, not just a name');
  assert.match(yourPart, /code review/i, 'spec §4: names code review');
  assert.match(yourPart, /mostly AI/i, 'code review is mostly AI, one human step among three');

  const bullets = yourPart.split('\n').filter((line) => /^\s*[-*]\s/.test(line));
  assert.equal(bullets.length, 3, 'exactly the three steps, one line each');
});

test("the README's Spec design bullet names no exception and Your part keeps three bullets", () => {
  // S7 (spec 17, 20) gave the Spec design bullet a small-ticket clause; ticket-states S11
  // (spec 10) retired the small ticket, so every run is signed off at Gate 1.
  const yourPart = section(README(), 'Your part');

  assert.match(yourPart, /sign off the architecture artefact at Gate 1, before a slice is built\./);
  assert.doesNotMatch(yourPart, /small ticket|skips it/i, 'no ticket skips Gate 1 (spec 10)');

  const bullets = yourPart.split('\n').filter((line) => /^\s*[-*]\s/.test(line));
  assert.equal(bullets.length, 3, 'the three steps, one line each');
});

test('the README never claims the plugin merges on its own', () => {
  const yourPart = section(README(), 'Your part');

  assert.doesNotMatch(
    yourPart,
    /the plugin merges|merges (it|the (feature )?(pull request|PR)) (for you|itself|automatically)/i,
    'the plugin stops before merge; only an explicit ask merges',
  );
  assert.match(yourPart, /merge/i, 'it still has to say a merge is possible, and who asks for it');
  assert.match(
    yourPart,
    /to have it merge its own PRs, say so as a standing rule in your own `CLAUDE\.md`/,
    'a merge of its own is a standing rule the user writes, not a default or a one-off ask',
  );
});

// --- the subagent status line, and one backup per run ----------------------

const { subagentStatusLineCommand } = await import('../install-settings.mjs');

test('a machine with no subagent status line gets this package\'s', (t) => {
  const file = settingsFile(t, '{}');

  const report = installSettings({ settingsPath: file, pluginRoot: PLUGIN_ROOT });

  assert.equal(report.subagentStatusLine, 'installed');
  assert.equal(readJson(file).subagentStatusLine.type, 'command');
  assert.match(readJson(file).subagentStatusLine.command, /context-size-guard\.js/);
});

test('the settings module offers one composed merge, not a single per setting', async () => {
  // Pinned on purpose. Three single-setting merges used to be exported with no caller
  // outside the tests, and calling them in sequence took three backups - two of them
  // copies of a half-merged file, each report calling its own "the previous file".
  // `installStatusLine` survives because slice 9's tests are its caller; anything new
  // belongs inside `installSettings` as another step, so adding an export here is a
  // decision to be made deliberately rather than by habit.
  const surface = await import('../install-settings.mjs');

  assert.deepEqual(Object.keys(surface).sort(), [
    // plain-session fix round: measure-plain reads the status line with the install's own test.
    'STATUSLINE_SCRIPT',
    'defaultSettingsPath',
    'installSettings',
    'installStatusLine',
    'isInPluginCache',
    'ownCommandPath',
    'parseArgs',
    // daemon-lifecycle S8: the uninstall's reversal of the merges, beside them on purpose.
    'removeOwnSettings',
    'repairSettings',
    'resolvePluginRoot',
    'statusLineCommand',
    'statusLineSetting',
    'subagentStatusLineCommand',
    'subagentStatusLineSetting',
    'webFetchRule',
  ]);
});

test('the subagent status line names the guard and the flag that makes it render', () => {
  const command = subagentStatusLineCommand(path.join('C:', 'plugins', 'pilot'));

  assert.match(command, /--subagent-status-line$/, 'the flag is what tells the guard to render');
  assert.ok(command.includes('"'), 'and the path is quoted, because a plugin root can have spaces');
  assert.ok(command.includes(path.join('hooks', 'context-size-guard.js')));
});

test('the file the subagent status line points at is one this package ships', () => {
  // Slice 10 wrote this command and slice 12 shipped the script it names. Until the
  // two were on one branch the install would have written a settings entry pointing
  // at a file the friend does not have, and a status line that cannot run is a status
  // line that renders nothing with no error anyone sees.
  const target = subagentStatusLineCommand(ROOT).match(/"(.+)"/)[1];

  assert.equal(target, path.join(ROOT, 'hooks', 'context-size-guard.js'));
  assert.ok(fs.existsSync(target), `${target} is not in the plugin root`);
  assert.match(
    fs.readFileSync(target, 'utf8'),
    /--subagent-status-line/,
    'and the script answers to the flag the command passes it',
  );
});

test('a subagent status line that is already someone else\'s is reported, never overwritten', (t) => {
  const theirs = { type: 'command', command: 'node /opt/theirs/subagent.js' };
  // This package's own status line is already set, so the subagent line is the only
  // thing this run could change - and it is theirs, so the run changes nothing. The
  // default-branch ask rules (L22) are in place too, taken from an install of their own.
  const ask = installSettings({ settingsPath: settingsFile(t, '{}'), pluginRoot: PLUGIN_ROOT }).ask.added;
  const file = settingsFile(t, JSON.stringify({
    permissions: { ask },
    statusLine: statusLineSetting(PLUGIN_ROOT),
    subagentStatusLine: theirs,
  }, null, 2));
  const before = fs.readFileSync(file, 'utf8');

  const report = installSettings({ settingsPath: file, pluginRoot: PLUGIN_ROOT });

  assert.equal(report.subagentStatusLine, 'left-alone');
  assert.equal(report.changed, false);
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'not even reformatted');
  assert.match(report.notes.join('\n'), /subagent\.js/, 'the report quotes what is already there');
  assert.match(report.notes.join('\n'), /"subagentStatusLine" block/, 'and names the key to change');
});

test('running the subagent merge twice changes nothing the second time', (t) => {
  const file = settingsFile(t, '{}');

  installSettings({ settingsPath: file, pluginRoot: PLUGIN_ROOT });
  const after = fs.readFileSync(file, 'utf8');
  const second = installSettings({ settingsPath: file, pluginRoot: PLUGIN_ROOT });

  assert.equal(second.subagentStatusLine, 'already-installed');
  assert.equal(second.changed, false);
  assert.equal(fs.readFileSync(file, 'utf8'), after);
});

test('one run of the whole merge writes once and backs the file up once', (t) => {
  const original = JSON.stringify({ includeCoAuthoredBy: true }, null, 2) + '\n';
  const file = settingsFile(t, original);

  const report = installSettings({
    settingsPath: file,
    pluginRoot: '/opt/pilot',
    domains: ['nodejs.org'],
  });

  const backups = backupsBeside(file);
  assert.equal(backups.length, 1, `three settings merged, one backup, not ${backups.length}`);
  assert.equal(
    fs.readFileSync(path.join(path.dirname(file), backups[0]), 'utf8'),
    original,
    'and the backup is the file as the friend had it, not a half-merged one',
  );

  const settings = readJson(file);
  assert.ok(settings.statusLine, 'all three landed in the one write');
  assert.ok(settings.subagentStatusLine);
  assert.deepEqual(settings.permissions.allow, ['WebFetch(domain:nodejs.org)']);
  assert.equal(settings.includeCoAuthoredBy, true, 'and what was theirs is still there');
  assert.equal(report.statusLine, 'installed');
  assert.equal(report.subagentStatusLine, 'installed');
});

test('the whole merge run twice is a no-op, and takes no second backup', (t) => {
  const file = settingsFile(t, '{}');
  const options = { settingsPath: file, pluginRoot: '/opt/pilot', domains: ['nodejs.org'] };

  installSettings(options);
  const after = fs.readFileSync(file, 'utf8');
  const backups = backupsBeside(file).length;

  const second = installSettings(options);

  assert.equal(second.changed, false);
  assert.equal(fs.readFileSync(file, 'utf8'), after);
  assert.equal(backupsBeside(file).length, backups, 'a run that changes nothing backs nothing up');
});

test('the command line merges all three in one invocation', (t) => {
  const file = settingsFile(t, JSON.stringify({ includeCoAuthoredBy: true }));

  const run = execFileSync(
    process.execPath,
    [
      path.join(ROOT, 'scripts', 'install-settings.mjs'),
      '--settings', file,
      '--plugin-root', path.join('C:', 'opt', 'pilot'),
      '--allow-web-fetch', 'nodejs.org',
    ],
    { encoding: 'utf8' },
  );

  const settings = readJson(file);
  assert.ok(settings.statusLine && settings.subagentStatusLine && settings.permissions.allow.length);
  assert.equal(backupsBeside(file).length, 1, 'one invocation, one backup');
  assert.match(run, /WebFetch\(domain:nodejs\.org\)/);
  assert.equal(
    (run.match(/The previous file is at/g) || []).length,
    1,
    'and the friend is told about that one backup once',
  );
});

test('a bad host stops the run before the status line is written either', (t) => {
  const file = settingsFile(t, '{}');

  assert.throws(
    () => installSettings({ settingsPath: file, pluginRoot: '/opt/pilot', domains: ['not a host'] }),
    /host/i,
  );
  assert.equal(fs.readFileSync(file, 'utf8'), '{}', 'nothing at all was written');
});

// --- --repair: the status line survives a version bump (S5, D18/D20) -------

const { repairSettings, subagentStatusLineSetting } = await import('../install-settings.mjs');

// A path shaped like the one an older plugin root actually wrote, and the root
// a session running today would resolve. Neither carries meaning as a string;
// only the `hooks/<script>` tail at the end does. Built under this process's own
// (fake) home directory rather than a hardcoded drive, because S11 makes `--repair`
// refuse any plugin root that is not under `<home>/.claude/plugins/cache`.
const OLD_ROOT = path.join(os.homedir(), '.claude', 'plugins', 'cache', 'pilot', 'pilot', '0.1.0');
const CURRENT_ROOT = path.join(os.homedir(), '.claude', 'plugins', 'cache', 'pilot', 'pilot', '0.3.0');

test('a stale path from an older plugin root is repaired to the current one', (t) => {
  const file = settingsFile(t, JSON.stringify({
    statusLine: statusLineSetting(OLD_ROOT),
    subagentStatusLine: subagentStatusLineSetting(OLD_ROOT),
  }, null, 2));

  const report = repairSettings({ settingsPath: file, pluginRoot: CURRENT_ROOT });

  assert.equal(report.statusLine, 'repaired');
  assert.equal(report.subagentStatusLine, 'repaired');
  assert.equal(report.changed, true);
  assert.deepEqual(readJson(file).statusLine, statusLineSetting(CURRENT_ROOT));
  assert.deepEqual(readJson(file).subagentStatusLine, subagentStatusLineSetting(CURRENT_ROOT));
  assert.equal(report.notes.length, 3, 'one line per command actually repaired, plus the backup path');
  assert.match(report.notes.join('\n'), /[Rr]epaired/);
});

test('recognised by the hooks/<script> layout, not by any version string in the path', (t) => {
  // No version segment at all — a directory-source marketplace root, which D18
  // says a script that guessed the cache path would get wrong.
  const devRoot = path.join('D:', 'code', 'pilot-dev');
  const file = settingsFile(t, JSON.stringify({ statusLine: statusLineSetting(devRoot) }, null, 2));

  const report = repairSettings({ settingsPath: file, pluginRoot: CURRENT_ROOT });

  assert.equal(report.statusLine, 'repaired');
  assert.equal(readJson(file).statusLine.command, statusLineSetting(CURRENT_ROOT).command);
});

test('a genuinely foreign status line is left alone, not overwritten', (t) => {
  const theirs = { type: 'command', command: 'node /opt/theirs/statusline.js' };
  const file = settingsFile(t, JSON.stringify({ statusLine: theirs }, null, 2));
  const before = fs.readFileSync(file, 'utf8');

  const report = repairSettings({ settingsPath: file, pluginRoot: CURRENT_ROOT });

  assert.equal(report.statusLine, 'unchanged');
  assert.equal(report.changed, false);
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'not even reformatted');
  assert.deepEqual(report.notes, [], 'a foreign command is left alone in silence');
  assert.deepEqual(backupsBeside(file), [], 'nothing changed, so nothing was backed up');
});

test('a quoted foreign command whose script does not match ours is left alone too', (t) => {
  // Shaped exactly like our own commands — `node "…"`, and for the subagent line the
  // same trailing flag — so this is the tail comparison actually being exercised,
  // not rejected by the quoting check the way an unquoted foreign command would be.
  const theirStatusLine = { type: 'command', command: 'node "/opt/theirs/hooks/other-statusline.js"' };
  const theirSubagentLine = {
    type: 'command',
    command: 'node "/opt/theirs/hooks/other-guard.js" --subagent-status-line',
  };
  const file = settingsFile(t, JSON.stringify({
    statusLine: theirStatusLine,
    subagentStatusLine: theirSubagentLine,
  }, null, 2));
  const before = fs.readFileSync(file, 'utf8');

  const report = repairSettings({ settingsPath: file, pluginRoot: CURRENT_ROOT });

  assert.equal(report.statusLine, 'unchanged');
  assert.equal(report.subagentStatusLine, 'unchanged');
  assert.equal(report.changed, false);
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'not even reformatted');
  assert.deepEqual(report.notes, []);
  assert.deepEqual(backupsBeside(file), []);
});

test('a settings file with no status line at all is left alone', (t) => {
  const file = settingsFile(t, '{}');

  const report = repairSettings({ settingsPath: file, pluginRoot: CURRENT_ROOT });

  assert.equal(report.changed, false);
  assert.deepEqual(report.notes, []);
  assert.deepEqual(readJson(file), {});
});

test('a status line already at the current root does nothing, and says nothing', (t) => {
  const file = settingsFile(t, '{}');
  installSettings({ settingsPath: file, pluginRoot: CURRENT_ROOT });
  const before = fs.readFileSync(file, 'utf8');
  const backupsBefore = backupsBeside(file).length;

  const report = repairSettings({ settingsPath: file, pluginRoot: CURRENT_ROOT });

  assert.equal(report.changed, false);
  assert.deepEqual(report.notes, [], 'the happy path prints nothing');
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.equal(backupsBeside(file).length, backupsBefore, 'no change means no backup either');
});

test('a repair takes the usual backup before rewriting', (t) => {
  const original = JSON.stringify(
    { statusLine: statusLineSetting(OLD_ROOT), includeCoAuthoredBy: true },
    null,
    2,
  );
  const file = settingsFile(t, original);

  const report = repairSettings({ settingsPath: file, pluginRoot: CURRENT_ROOT });

  assert.ok(report.backupPath, 'a change was made, so a backup has to exist');
  assert.equal(fs.readFileSync(report.backupPath, 'utf8'), original);
  assert.ok(
    report.notes.some((note) => note.includes(report.backupPath)),
    'a repair that rewrites the file has to say where the backup landed, same as install does',
  );
});

test('a settings file that cannot be parsed is left silently alone by the automatic repair', (t) => {
  // The Expected behaviour is "prints one line when it changed anything and nothing
  // when it did not", and this hook fires at every session start on every machine —
  // so a hand-edited or BOM'd settings file must not become a repeating error forever.
  // `install`'s own user-invoked path (`installSettings`/`installStatusLine`) is
  // covered elsewhere and keeps throwing; only the automatic `--repair` path goes quiet.
  const file = settingsFile(t, '{ this is not json');
  const before = fs.readFileSync(file, 'utf8');

  const report = repairSettings({ settingsPath: file, pluginRoot: CURRENT_ROOT });

  assert.equal(report.changed, false);
  assert.deepEqual(report.notes, []);
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'a file we cannot read is a file we do not touch');
  assert.deepEqual(backupsBeside(file), [], 'nothing changed, so nothing was backed up');
});

test('the command line repair exits 0 and prints nothing for malformed settings', (t) => {
  const file = settingsFile(t, '{ this is not json');

  const run = runScript('install-settings.mjs', [
    '--settings', file,
    '--plugin-root', CURRENT_ROOT,
    '--repair',
  ]);

  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, '');
  assert.equal(run.stderr, '');
});

test('a write failure during repair is not swallowed as "nothing to repair"', (t) => {
  // The catch in `repairSettings` has to be scoped to the read/parse step only. A
  // repair that reads fine but fails on the backup or the write itself — disk full,
  // a locked file, a permissions error — is a real failure, not the "nothing here is
  // ours" case the silent shape exists for, and it must still be visible.
  const file = settingsFile(t, JSON.stringify({ statusLine: statusLineSetting(OLD_ROOT) }, null, 2));
  t.mock.method(fs, 'copyFileSync', () => {
    throw new Error('ENOSPC: no space left on device');
  });

  assert.throws(
    () => repairSettings({ settingsPath: file, pluginRoot: CURRENT_ROOT }),
    /ENOSPC/,
    'a genuine write failure must propagate, not report as a silent no-op',
  );
});

test('repair only ever touches the two command keys', (t) => {
  const file = settingsFile(t, JSON.stringify({
    statusLine: statusLineSetting(OLD_ROOT),
    includeCoAuthoredBy: false,
    permissions: { allow: ['Bash(git status)'] },
  }, null, 2));

  repairSettings({ settingsPath: file, pluginRoot: CURRENT_ROOT });

  const settings = readJson(file);
  assert.equal(settings.includeCoAuthoredBy, false);
  assert.deepEqual(settings.permissions, { allow: ['Bash(git status)'] });
  assert.equal(settings.subagentStatusLine, undefined, 'absent stays absent, not invented');
});

test('a status line whose command is not a string is left alone, not crashed on', (t) => {
  // A hand-edited settings.json can carry a non-string value here; `ownCommandPath`
  // has to say no rather than call string methods on it.
  const file = settingsFile(t, JSON.stringify({ statusLine: { type: 'command', command: 123 } }, null, 2));
  const before = fs.readFileSync(file, 'utf8');

  const report = repairSettings({ settingsPath: file, pluginRoot: CURRENT_ROOT });

  assert.equal(report.statusLine, 'unchanged');
  assert.equal(report.changed, false);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('a foreign command whose tail matches ours but is not invoked with node is left alone', (t) => {
  // Same trailing path segments as our own statusline script, but a different
  // interpreter in front of it — the `node "` prefix check has to be the one
  // that catches this, not just the tail comparison.
  const foreign = { type: 'command', command: 'deno run "/x/hooks/context-usage-statusline.js"' };
  const file = settingsFile(t, JSON.stringify({ statusLine: foreign }, null, 2));
  const before = fs.readFileSync(file, 'utf8');

  const report = repairSettings({ settingsPath: file, pluginRoot: CURRENT_ROOT });

  assert.equal(report.statusLine, 'unchanged');
  assert.equal(report.changed, false);
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'not even reformatted');
});

test('the command line accepts --repair without needing a value after it', () => {
  assert.deepEqual(parseArgs(['--repair']), { repair: true });
  assert.deepEqual(
    parseArgs(['--settings', '/tmp/x', '--repair', '--plugin-root', '/tmp/y']),
    { repair: true, settingsPath: '/tmp/x', pluginRoot: '/tmp/y' },
  );
});

test('the command line repairs a stale path and prints what it did', (t) => {
  const file = settingsFile(t, JSON.stringify({ statusLine: statusLineSetting(OLD_ROOT) }));

  const run = runScript('install-settings.mjs', [
    '--settings', file,
    '--plugin-root', CURRENT_ROOT,
    '--repair',
  ]);

  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /[Rr]epaired/);
  assert.equal(readJson(file).statusLine.command, statusLineSetting(CURRENT_ROOT).command);
});

test('the command line repair prints nothing when nothing needed repairing', (t) => {
  const file = settingsFile(t, JSON.stringify({ statusLine: statusLineSetting(CURRENT_ROOT) }));

  const run = runScript('install-settings.mjs', [
    '--settings', file,
    '--plugin-root', CURRENT_ROOT,
    '--repair',
  ]);

  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, '', 'no output on the happy path');
});

test('hooks.json wires the repair as a SessionStart entry of its own', () => {
  const hooks = JSON.parse(read('hooks/hooks.json'));
  const sessionStart = hooks.hooks.SessionStart;

  // Found by id rather than counted: what this pins is that the repair is
  // wired as a lane of its own, and a count re-breaks every time the event
  // gains another lane, which it did at S20.
  const repair = sessionStart.find((entry) => entry.id === 'start:any:statusline-repair');
  assert.ok(repair, 'the repair is still a SessionStart entry of its own');
  const command = repair.hooks[0].command;
  assert.match(command, /install-settings\.mjs/);
  assert.match(command, /--repair/);
  assert.match(command, /\$\{CLAUDE_PLUGIN_ROOT\}/, 'resolved at session start, not baked in');
});

// --- S11: `--repair` trusts only the plugin cache ---------------------------

test('a plugin root outside the cache is refused, and nothing changes', (t) => {
  const file = settingsFile(t, JSON.stringify({ statusLine: statusLineSetting(OLD_ROOT) }, null, 2));
  const before = fs.readFileSync(file, 'utf8');
  const outsideCache = path.join(os.tmpdir(), 'pilot-s11-worktree');

  const report = repairSettings({ settingsPath: file, pluginRoot: outsideCache });

  assert.equal(report.changed, false);
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'not even reformatted');
  assert.deepEqual(backupsBeside(file), [], 'a refused repair takes no backup');
  assert.match(report.refused, /plugin cache/i);
  assert.equal((report.refused.match(/\n/g) || []).length, 0, 'one line, not a paragraph');
});

test('a plugin root inside the cache still repairs as before', (t) => {
  const file = settingsFile(t, JSON.stringify({ statusLine: statusLineSetting(OLD_ROOT) }, null, 2));

  const report = repairSettings({ settingsPath: file, pluginRoot: CURRENT_ROOT });

  assert.equal(report.statusLine, 'repaired');
  assert.equal(report.changed, true);
  assert.equal(report.refused, undefined);
});

test('a directory that only shares the cache\'s prefix is not "inside" it', (t) => {
  // "...\\plugins\\cache-evil\\..." starts with the cache root as a string but is a
  // sibling directory, not something under it - a bare prefix check would be fooled.
  const file = settingsFile(t, JSON.stringify({ statusLine: statusLineSetting(OLD_ROOT) }, null, 2));
  const lookalike = `${path.join(os.homedir(), '.claude', 'plugins', 'cache')}-evil`;

  const report = repairSettings({ settingsPath: file, pluginRoot: lookalike });

  assert.equal(report.changed, false);
  assert.match(report.refused, /plugin cache/i);
});

test('a plugin root inside the cache with a trailing separator still repairs', (t) => {
  const file = settingsFile(t, JSON.stringify({ statusLine: statusLineSetting(OLD_ROOT) }, null, 2));

  const report = repairSettings({ settingsPath: file, pluginRoot: `${CURRENT_ROOT}${path.sep}` });

  assert.equal(report.statusLine, 'repaired');
  assert.equal(report.refused, undefined);
});

test('the command line prints the refusal on stderr and still exits 0', (t) => {
  const file = settingsFile(t, JSON.stringify({ statusLine: statusLineSetting(OLD_ROOT) }, null, 2));
  const before = fs.readFileSync(file, 'utf8');
  const outsideCache = path.join(os.tmpdir(), 'pilot-s11-worktree');

  const run = runScript('install-settings.mjs', [
    '--settings', file,
    '--plugin-root', outsideCache,
    '--repair',
  ]);

  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, '', 'nothing is said on stdout when the repair is refused');
  const stderrLines = run.stderr.trimEnd().split('\n');
  assert.equal(stderrLines.length, 1, 'one line, not a paragraph');
  assert.match(stderrLines[0], /plugin cache/i);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

// --- what the friend's own rules already cover -----------------------------

test('a deny rule that covers the host by wildcard or by case is still a deny', (t) => {
  const file = settingsFile(t, JSON.stringify({
    permissions: { deny: ['WebFetch(domain:*.example.com)', 'WebFetch(domain:Nodejs.org)'] },
  }, null, 2));

  const report = installSettings({
    settingsPath: file,
    pluginRoot: PLUGIN_ROOT,
    domains: ['api.example.com', 'nodejs.org', 'react.dev'],
  });

  assert.deepEqual(report.webFetch.added, ['WebFetch(domain:react.dev)'], 'only the uncovered one is added');
  assert.deepEqual(report.webFetch.denied, [
    'WebFetch(domain:api.example.com)',
    'WebFetch(domain:nodejs.org)',
  ]);
  assert.match(report.notes.join('\n'), /denied by WebFetch\(domain:\*\.example\.com\)/);
});

test('an allow rule that already covers the host is not written a second time', (t) => {
  const file = settled(t, JSON.stringify({
    permissions: { allow: ['WebFetch(domain:*.example.com)'] },
  }, null, 2));
  const before = fs.readFileSync(file, 'utf8');

  const report = installSettings({
    settingsPath: file,
    pluginRoot: PLUGIN_ROOT,
    domains: ['docs.example.com'],
  });

  assert.equal(report.changed, false);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.deepEqual(report.webFetch.alreadyAllowed, ['WebFetch(domain:docs.example.com)']);
});

// --- when a copy or a comparison cannot finish -----------------------------

test('a rules file that cannot be written is reported, and the rest still are', (t) => {
  const source = fakeRules(t, {
    'common/testing.md': 'coverage\n',
    'typescript/style.md': 'types\n',
    'python/style.md': 'python\n',
  });
  const target = path.join(scratch(t), 'rules');
  // A file where a directory has to go: the copy of everything under it fails, and
  // nothing about that is this package's to fix - but a friend who is never told is
  // left with a silent gap in the rules their sessions load.
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'typescript'), 'not a directory\n', 'utf8');

  const report = installRules({ source, target });

  assert.deepEqual(entries(report, 'written'), ['common/testing.md', 'python/style.md']);
  assert.equal(report.ok, false, 'the run did not do everything it was asked to');
  assert.match(report.notes.join('\n'), /typescript[\/]style\.md/, 'and names what it could not do');
});

test('the upstream root chosen is the one that holds most of what we vendored', (t) => {
  const { root, upstream } = vendoredPair(t, { mine: '\n# Testing\n', theirs: '# Testing\n' });
  const partial = scratch(t, 'pilot-upstream-partial-');

  // Two more vendored files, so a candidate can hold some of them and not the rest.
  for (const name of ['one', 'two']) {
    const at = `rules/common/${name}.md`;
    fs.writeFileSync(
      path.join(root, at),
      header({
        upstream: `${PROJECT} 2.2.0 - ${at}`,
        copyright: 'Copyright (c) 2026 A Person',
        licence: 'MIT - see THIRD-PARTY-NOTICES.md',
        adapted: 'verbatim',
        ledger: 'vendor/sample.md',
      }) + `\n# ${name}\n`,
      'utf8',
    );
    fs.writeFileSync(path.join(upstream, at), `# ${name}\n`, 'utf8');
  }
  // The stray checkout holds exactly one of the three.
  fs.mkdirSync(path.join(partial, 'rules', 'common'), { recursive: true });
  fs.writeFileSync(path.join(partial, 'rules/common/testing.md'), '# Testing\n', 'utf8');

  const result = checkUpstream(root, {
    scan: ['rules'],
    candidates: () => [
      { path: partial, kind: 'a stray checkout holding one of them' },
      { path: upstream, kind: 'version cache' },
    ],
  });

  assert.equal(result.projects[0].root, upstream, 'the root that holds one of three is not it');
  assert.equal(
    result.projects[0].files.filter((one) => one.state === 'gone').length,
    0,
    'picking the thin candidate would report the other two as deleted upstream',
  );
});

test('a provenance header cannot point the comparison outside the upstream root', (t) => {
  const { root, upstream, roots } = vendoredPair(t, { mine: '\n# Testing\n', theirs: '# Testing\n' });
  // A real file, outside the upstream root, that the header will try to reach.
  const outside = path.join(path.dirname(upstream), `${path.basename(upstream)}-outside.md`);
  fs.writeFileSync(outside, '# Testing\n', 'utf8');
  t.after(() => fs.rmSync(outside, { force: true }));

  const file = path.join(root, 'rules/common/testing.md');
  fs.writeFileSync(
    file,
    fs
      .readFileSync(file, 'utf8')
      .replace('- rules/common/testing.md', `- ../${path.basename(outside)}`),
    'utf8',
  );

  const result = checkUpstream(root, { roots, scan: ['rules'] });

  assert.equal(onlyFile(result).state, 'gone', 'a path that climbs out of the root is not compared');
});

test('the instructions say what the rules copy means before they run it', () => {
  const install = INSTALL();
  const step = stepNamed(install, 'Choose the reach');

  assert.match(step, /before\s+you\s+run\s+it/i, 'the consequence is stated first, not reported after');
  assert.match(step, /every\s+session/i, 'and it says the files become loaded context');
  assert.match(step, /skip this step|rather not/i, 'so a friend can decline it');
});

test('the rules step does not promise a file count the tree cannot keep', () => {
  // It said "about a hundred and forty" while the tree held a hundred and twenty-four.
  // A number in the step where a stranger consents to files landing in their home is a
  // promise, and a promise that drifts with the tree is one nothing here was checking.
  const install = INSTALL();
  const step = stepNamed(install, 'Choose the reach');
  const shipped = installRules({
    source: rulesSource(),
    target: path.join(os.tmpdir(), 'pilot-rules-never-written'),
    dryRun: true,
  }).written.length;

  assert.match(step, /over a hundred/i, 'a friend deciding is entitled to the magnitude');
  assert.match(step, /--dry-run/, 'and to the exact count, which only the script can give');
  assert.ok(shipped > 100, `the tree is ${shipped} files, so "over a hundred" is no longer true`);
});

test('the instructions cover the subagent status line the plugin could not carry itself', () => {
  assert.match(INSTALL(), /subagent status line/i);
});

// --- the command lines a friend's install actually runs --------------------

/**
 * A script run the way `docs/INSTALL.md` runs it: a real process, real flags, a real
 * exit code. Every function below was covered and every `main` was not, which leaves a
 * flag that reaches nothing, or an exit code that is always zero, invisible from inside
 * the module. `spawnSync` rather than `execFileSync` because a non-zero exit is the
 * assertion here rather than an accident.
 */
const runScript = (script, args, options = {}) =>
  spawnSync(process.execPath, [path.join(ROOT, 'scripts', script), ...args], {
    encoding: 'utf8',
    ...options,
  });

test('the rules copy takes its source, its target and its dry run off the command line', (t) => {
  const source = fakeRules(t);
  const target = path.join(scratch(t), 'rules');

  const dry = runScript('install-rules.mjs', ['--source', source, '--target', target, '--dry-run']);

  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /would be written/, 'a dry run says what it would have done');
  assert.equal(
    fs.existsSync(target),
    false,
    'and writes nothing: INSTALL.md offers this before a hundred and forty files land in a home directory',
  );

  const copied = runScript('install-rules.mjs', ['--source', source, '--target', target]);

  assert.equal(copied.status, 0, copied.stderr);
  assert.equal(
    fs.readFileSync(path.join(target, 'common', 'testing.md'), 'utf8'),
    'coverage\n',
    'the source is read and the target is written, not the other way round',
  );
});

test('a copy that could not do everything it was asked says so in its exit code', (t) => {
  const source = fakeRules(t);
  const target = path.join(scratch(t), 'rules');
  // A file where a directory has to go. The copy carries on past it, so the only way a
  // caller learns that something was missed is the exit code and the report.
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'common'), 'not a directory\n', 'utf8');

  const run = runScript('install-rules.mjs', ['--source', source, '--target', target]);

  assert.equal(run.status, 1, 'a partial copy is not a successful one');
  assert.match(run.stdout, /could not be written/, 'and it names what it could not do');
  assert.match(run.stdout, /1 file written/, 'having copied the one it could');
});

test('the drift report takes the upstream to compare against off the command line', (t) => {
  const { root, upstream } = vendoredPair(t, {
    mine: '\n# Testing\n\nCoverage is 80%.\n',
    theirs: '# Testing\n\nCoverage is 90%.\n',
  });

  const run = runScript('check-upstream.mjs', ['--root', `${PROJECT}=${upstream}`], { cwd: root });

  assert.equal(run.status, 0, `an upstream it could compare against is not a failure: ${run.stderr}`);
  assert.match(run.stdout, /DRIFTED/, 'the flag reached the comparison');
  assert.match(run.stdout, /testing\.md/, 'and the drifted file is named');

  const quiet = runScript('check-upstream.mjs', ['--root', `${PROJECT}=${upstream}`, '--quiet'], {
    cwd: root,
  });

  assert.equal(quiet.status, 0, quiet.stderr);
  assert.doesNotMatch(quiet.stdout, /DRIFTED\s+rules/, '--quiet drops the per-file lines');
  assert.match(quiet.stdout, /1 file\(s\) marked DRIFTED/, 'and keeps the count they summarise');
});

test('an upstream the report cannot find at all is a failing exit, not a clean bill', (t) => {
  const { root } = vendoredPair(t, { mine: '\n# Testing\n', theirs: '# Testing\n' });
  // A home with no plugins in it, so this asserts on an empty search rather than on
  // whatever happens to be installed on the machine running the tests.
  const home = scratch(t, 'pilot-empty-home-');

  const run = runScript('check-upstream.mjs', [], {
    cwd: root,
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });

  assert.equal(run.status, 1, 'a comparison against nothing is not a clean bill of health');
  assert.match(run.stderr, /could not be found/);
  assert.match(run.stdout, /--root/, 'and the flag that fixes it is in what a human reads');
});

test('the ledger is written by the command line, and --check is what catches a stale one', (t) => {
  const root = fakeRepo(t, {
    fragment: sampleFragment,
    files: { 'skills/one/SKILL.md': sampleFile(PROJECT) },
  });
  const ledger = path.join(root, LEDGER_FILE);

  const absent = runScript('build-vendor-ledger.mjs', ['--check'], { cwd: root });
  assert.equal(absent.status, 1, 'a ledger that does not exist is not a current one');

  const wrote = runScript('build-vendor-ledger.mjs', [], { cwd: root });
  assert.equal(wrote.status, 0, wrote.stderr);
  assert.match(
    fs.readFileSync(ledger, 'utf8'),
    /skills\/one\/SKILL\.md/,
    'the ledger is written to disk, not only described on the way past',
  );

  const current = runScript('build-vendor-ledger.mjs', ['--check'], { cwd: root });
  assert.equal(current.status, 0, `--check passes on what the script just wrote: ${current.stderr}`);

  fs.appendFileSync(ledger, '| `skills/two/SKILL.md` | nobody generated this | | |\n', 'utf8');
  const stale = runScript('build-vendor-ledger.mjs', ['--check'], { cwd: root });

  assert.equal(stale.status, 1, 'and fails once the file and the fragments disagree');
  assert.match(stale.stderr, /regenerate it/, 'saying how to make them agree again');
});

// --- the canary: this suite cannot reach the real home --------------------

/**
 * These are not tests of the install. They are tests of the isolation the rest of the
 * file depends on, and they exist because on 2026-09-15 that isolation turned out to be
 * one argument deep: every test passed an explicit path, a mutation run dropped it, and
 * the suite wrote its fixtures into a real person's `~/.claude/`.
 *
 * So the two below assert the opposite of what a test usually asserts — not that the
 * code does what it should, but that when it does the *wrong* thing the damage lands
 * somewhere harmless.
 */

test('the home directory this suite writes into is not the real one', () => {
  assert.notEqual(os.homedir(), REAL_HOME, 'the redirect has to move os.homedir() itself');
  assert.equal(os.homedir(), FAKE_HOME);

  // The two functions every write falls back to when an option is missing.
  assert.ok(defaultSettingsPath().startsWith(FAKE_HOME), 'a call with no settingsPath lands here');
  assert.ok(defaultRulesTarget().startsWith(FAKE_HOME), 'and one with no target lands here too');

  // Subprocess tests spawn real CLIs; they inherit process.env, so they are covered
  // by the same move rather than by each one remembering to pass a home.
  const child = spawnSync(process.execPath, ['-e', 'process.stdout.write(require("os").homedir())'], {
    encoding: 'utf8',
  });
  assert.equal(child.stdout, FAKE_HOME, 'a spawned command line gets the same home');
});

test('a call that passes no path at all still cannot touch the real profile', (t) => {
  // The incident, reproduced: both writers called the way a mutant leaves them, with
  // no destination at all. Hashed rather than compared, because a failure prints what
  // it compared and the real file is not this suite's to put in a test report.
  const realClaude = path.join(REAL_HOME, '.claude');
  const realSettings = path.join(realClaude, 'settings.json');
  const digest = (file) =>
    fs.existsSync(file) ? createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null;

  const before = digest(realSettings);
  const backupsBefore = fs.existsSync(realClaude)
    ? fs.readdirSync(realClaude).filter((name) => name.includes('pilot-backup')).length
    : 0;

  installSettings({ pluginRoot: PLUGIN_ROOT, domains: ['nodejs.org'] });
  installRules({ source: fakeRules(t) });

  assert.equal(digest(realSettings), before, 'the real settings.json is byte-for-byte as it was');
  assert.equal(
    fs.existsSync(realClaude)
      ? fs.readdirSync(realClaude).filter((name) => name.includes('pilot-backup')).length
      : 0,
    backupsBefore,
    'and no backup was taken there, which is what a write would have left behind',
  );

  // And it did land somewhere - a guard that silently did nothing would pass the above.
  assert.ok(fs.existsSync(path.join(FAKE_HOME, '.claude', 'settings.json')), 'it went to the fake home');
  assert.ok(fs.existsSync(path.join(FAKE_HOME, '.claude', 'rules', 'common', 'testing.md')));
});

test('a settings file whose backup names are all taken fails closed before any write', (t) => {
  const file = settingsFile(t, '{"model":"opus"}');
  const before = fs.readFileSync(file, 'utf8');
  const copy = t.mock.method(fs, 'copyFileSync', () => {
    throw Object.assign(new Error('exists'), { code: 'EEXIST' });
  });
  assert.throws(() => installSettings({ settingsPath: file, pluginRoot: PLUGIN_ROOT }), (err) => err.message.includes(file));
  assert.equal(copy.mock.callCount(), 100);
  copy.mock.restore();
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});
