/**
 * project-glossary S7 (spec 12, L10): `termsInDiff` lists the term candidates a feature's diff
 * raises between two commits of a scratch repository, for the fundamentalist to judge. The
 * glossary entry is the real `Crew` entry and every log row is written by S6's `appendLog`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { termsInDiff } from '../glossary-diff.mjs';
import { termOf } from '../glossary.mjs';
import { appendLog } from '../glossary-log.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CREW = termOf('Crew', fs.readFileSync(path.join(ROOT, 'GLOSSARY.md'), 'utf8'));
const CLI = path.join(ROOT, 'scripts', 'glossary-diff.mjs');

/** A scratch repository: `base` committed and tagged `base`, then `head` written over it and tagged `head`. */
function makeRepo(t, base, head) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'glossary-diff-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      cwd: dir,
      stdio: 'pipe',
    });
  const commit = (files, tag) => {
    for (const [file, text] of Object.entries(files)) {
      const full = path.join(dir, file);
      if (text === null) {
        fs.rmSync(full);
        continue;
      }
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, text);
    }
    git('add', '-A');
    git('commit', '-q', '--allow-empty', '-m', tag);
    git('tag', tag);
  };
  git('init', '-q');
  commit(base, 'base');
  commit(head, 'head');
  return dir;
}

const BASE = { 'GLOSSARY.md': `# Glossary\n\n${CREW}\n`, 'README.md': 'The Crew does the work.\n' };
const of = (kind, candidates) => candidates.filter((c) => c.kind === kind);

test('an Avoid word in added prose is a candidate', (t) => {
  const dir = makeRepo(t, BASE, { 'README.md': 'The Crew does the work.\nAsk the subagents first.\n' });
  assert.deepEqual(termsInDiff(dir, 'base', 'head'), [
    { kind: 'avoid', word: 'Subagents', term: 'Crew', file: 'README.md', line: 2 },
  ]);
});

test('an added line opening "++ " is prose, not a file header', (t) => {
  const dir = makeRepo(t, BASE, { 'README.md': 'The Crew does the work.\n++ the subagents\nAsk the subagents.\n' });
  assert.deepEqual(
    termsInDiff(dir, 'base', 'head').map(({ file, line }) => `${file}:${line}`),
    ['README.md:2', 'README.md:3'],
  );
});

test('a term whose last use goes is orphaned', (t) => {
  const dir = makeRepo(t, BASE, { 'README.md': 'The work gets done.\n' });
  assert.deepEqual(of('orphaned', termsInDiff(dir, 'base', 'head')), [{ kind: 'orphaned', term: 'Crew' }]);
});

test('code and design docs are not scanned for Avoid words', (t) => {
  const prose = 'Ask the subagents first.\n';
  const dir = makeRepo(t, BASE, {
    'scripts/run.mjs': `// ${prose}`,
    'docs/design/x/architecture.md': prose,
    'docs/adr/0001-x.md': prose,
    'docs/guide.md': prose,
  });
  assert.deepEqual(
    of('avoid', termsInDiff(dir, 'base', 'head')).map(({ file }) => file),
    ['docs/guide.md'],
    'only the prose file outside docs/design and docs/adr is scanned',
  );
});

test('an unlogged glossary edit is a candidate', (t) => {
  const entry = '**Lane**:\nOne of three ways a ticket runs.\n';
  const glossary = `${BASE['GLOSSARY.md']}\n${entry}`;
  const lane = 'Each ticket takes one Lane.\n';
  const unlogged = makeRepo(t, BASE, { 'GLOSSARY.md': glossary, 'README.md': lane });
  assert.deepEqual(of('unlogged', termsInDiff(unlogged, 'base', 'head')), [
    { kind: 'unlogged', term: 'Lane', change: 'added' },
  ]);
  const log = appendLog('', { date: '2026-11-22', run: 'project-glossary', change: 'added', term: 'Lane' });
  const logged = makeRepo(t, BASE, { 'GLOSSARY.md': glossary, 'README.md': lane, 'GLOSSARY-LOG.md': log });
  assert.deepEqual(of('unlogged', termsInDiff(logged, 'base', 'head')), []);
});

test('an Avoid word added in the glossary or its log is not a candidate', (t) => {
  const log = appendLog('', { date: '2026-11-22', run: 'project-glossary', change: 'added', term: 'Subagents' });
  const dir = makeRepo(t, BASE, {
    'GLOSSARY.md': `${BASE['GLOSSARY.md']}\nThe subagents are the Crew.\n`,
    'GLOSSARY-LOG.md': log,
  });
  assert.deepEqual(of('avoid', termsInDiff(dir, 'base', 'head')), []);
});

test('a changed or removed entry is unlogged until its row is added', (t) => {
  const lane = '**Lane**:\nOne of three ways a ticket runs.\n';
  const base = { ...BASE, 'GLOSSARY.md': `${BASE['GLOSSARY.md']}\n${lane}`, 'README.md': 'The Crew takes a Lane.\n' };
  const edits = {
    changed: `${BASE['GLOSSARY.md']}\n**Lane**:\nOne of four ways a ticket runs.\n`,
    removed: BASE['GLOSSARY.md'],
  };
  for (const [change, glossary] of Object.entries(edits)) {
    const unlogged = makeRepo(t, base, { 'GLOSSARY.md': glossary });
    assert.deepEqual(of('unlogged', termsInDiff(unlogged, 'base', 'head')), [{ kind: 'unlogged', term: 'Lane', change }]);
    const log = appendLog('', { date: '2026-11-22', run: 'project-glossary', change, term: 'Lane' });
    const logged = makeRepo(t, base, { 'GLOSSARY.md': glossary, 'GLOSSARY-LOG.md': log });
    assert.deepEqual(of('unlogged', termsInDiff(logged, 'base', 'head')), [], `${change}, logged`);
  }
});

test('the CLI prints a C1 or bidi control from the repository as ?', (t) => {
  const glossary = '# Glossary\n\n**Bidi\u{202e}\u{85}\u{200b}**:\nA term holding invisible controls.\n_Avoid_: subagents\n';
  const dir = makeRepo(t, { 'GLOSSARY.md': glossary }, { 'README.md': 'Ask the subagents.\n' });
  const run = spawnSync(process.execPath, [CLI, dir, 'base', 'head'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, 'avoid README.md:1 subagents -> Bidi???\n');
});

test('a ref shaped like an option is refused before git sees it', (t) => {
  const dir = makeRepo(t, BASE, {});
  for (const ref of ['--output=pwned', '-p', 'base\nhead', '']) {
    assert.throws(() => termsInDiff(dir, ref, 'head'), /is refused/);
  }
  assert.throws(() => termsInDiff(dir, 'base', 'no-such-ref'), /no-such-ref is not a commit/);
  assert.equal(fs.existsSync(path.join(dir, 'pwned')), false);
});

test('the CLI prints one line per candidate and exits 0', (t) => {
  const dir = makeRepo(t, BASE, { 'README.md': 'Ask the subagents first.\n' });
  const run = spawnSync(process.execPath, [CLI, dir, 'base', 'head'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(run.stdout.trim().split('\n').sort(), [
    'avoid README.md:1 Subagents -> Crew',
    'orphaned Crew',
  ]);
  const bad = spawnSync(process.execPath, [CLI, dir, '-p', 'head'], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
});

test('the CLI prints a control character from the repository as ?', (t) => {
  const glossary = '# Glossary\n\n**Bell\x07\x1b[2J**:\nA term holding control characters.\n_Avoid_: subagents\n';
  const dir = makeRepo(t, { 'GLOSSARY.md': glossary }, { 'README.md': 'Ask the subagents.\n' });
  const run = spawnSync(process.execPath, [CLI, dir, 'base', 'head'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, 'avoid README.md:1 subagents -> Bell??[2J\n');
});
