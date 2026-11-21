/**
 * Stale glossary terms (project-glossary S4; spec 4, 7; L3): a term of `GLOSSARY.md` that no tracked
 * file uses outside the glossary, `docs/design/` and `docs/adr/` is a word the code has dropped.
 * The terms come from the audited repository, so each reaches `git` as one argv entry after `-e`,
 * matched as a fixed string (`-F`), with no shell between: a term is only ever text.
 * `node scripts/glossary-stale.mjs <repo>` prints `<line> <term>` per stale term and exits 0 with
 * none, 1 with some, 2 when the repository has no glossary or `git` cannot search it.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { parseGlossary } from './glossary.mjs';

/** Where a term is defined or planned rather than used. */
const EXCLUDED = [':(exclude)GLOSSARY.md', ':(exclude)docs/design/', ':(exclude)docs/adr/'];

/** True when some tracked file of `repoDir`, outside EXCLUDED, holds `term` as a whole word, any case. */
function isUsed(repoDir, term) {
  const result = spawnSync(
    'git',
    ['-c', 'core.fsmonitor=false', 'grep', '-q', '-i', '-F', '-w', '-e', term, '--', ...EXCLUDED],
    { cwd: repoDir, stdio: 'ignore', shell: false, windowsHide: true },
  );
  if (result.error) throw result.error;
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new Error(`git grep failed in ${repoDir} (exit ${result.status ?? result.signal})`);
}

/** Each term of the glossary `text` that `repoDir` does not use, with the 1-based line it is defined on. */
export function staleTerms(repoDir, text) {
  return parseGlossary(text)
    .filter(({ term }) => !isUsed(repoDir, term))
    .map(({ term, line }) => ({ term, line }));
}

function main(argv) {
  const [repo, ...rest] = argv;
  if (!repo || rest.length > 0) {
    process.stderr.write('usage: node scripts/glossary-stale.mjs <repo>\n');
    process.exit(2);
  }
  let text;
  try {
    text = fs.readFileSync(path.join(repo, 'GLOSSARY.md'), 'utf8');
  } catch (error) {
    process.stderr.write(`glossary-stale: no glossary in ${repo}: ${error.code ?? error.message}\n`);
    process.exit(2);
  }
  let stale;
  try {
    stale = staleTerms(repo, text);
  } catch (error) {
    process.stderr.write(`glossary-stale: ${error.message}\n`);
    process.exit(2);
  }
  for (const { line, term } of stale) process.stdout.write(`${line} ${term}\n`);
  process.exitCode = stale.length > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
