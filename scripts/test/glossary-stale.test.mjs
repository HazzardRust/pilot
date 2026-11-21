/** project-glossary S4: `staleTerms` names each glossary term the repository no longer uses (L3). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { staleTerms } from '../glossary-stale.mjs';

const FIXTURE = fileURLToPath(new URL('./fixtures/glossary-stale/', import.meta.url));

/** A fresh git repository in a temp directory: `from` copied in, then `files` written, all tracked. */
function makeRepo(t, { from, files = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'glossary-stale-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  if (from) fs.cpSync(from, dir, { recursive: true });
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  }
  const git = (...args) => execFileSync('git', ['-c', 'core.autocrlf=false', ...args], { cwd: dir, stdio: 'pipe' });
  git('init', '-q');
  git('add', '.');
  return dir;
}

const glossaryOf = (dir) => fs.readFileSync(path.join(dir, 'GLOSSARY.md'), 'utf8');

test('one unused term is one result', (t) => {
  const dir = makeRepo(t, { from: FIXTURE });
  assert.deepEqual(staleTerms(dir, glossaryOf(dir)), [{ term: 'Orphan', line: 9 }]);
});

test('a term in a hostile shape stays a literal', (t) => {
  const hostile = ['--output=x', '-Otouch pwned', '$(touch pwned)'];
  const glossary = hostile.map((term) => `**${term}**:\nA hostile word.\n`).join('\n');
  // The first two appear in the source as text; the third does not, so it is stale.
  const dir = makeRepo(t, {
    files: { 'GLOSSARY.md': glossary, 'src/flags.txt': 'pass --output=x or -Otouch pwned here\n' },
  });
  assert.deepEqual(staleTerms(dir, glossary), [{ term: '$(touch pwned)', line: 7 }]);
  assert.equal(fs.existsSync(path.join(dir, 'pwned')), false, 'no shell or pager ran');
  assert.equal(fs.existsSync(path.join(dir, 'x')), false, 'no output file was written');
});

test('a term used only in docs/design is stale', (t) => {
  const glossary = '**Pending**:\nA plan not yet built.\n\n**Built**:\nA plan in the code.\n';
  const dir = makeRepo(t, {
    files: {
      'GLOSSARY.md': glossary,
      'docs/design/plan.md': 'The pending plan.\n',
      'docs/adr/0001-pending.md': 'Pending, decided.\n',
      'src/plan.js': '// built\n',
    },
  });
  assert.deepEqual(staleTerms(dir, glossary), [{ term: 'Pending', line: 1 }]);
});
