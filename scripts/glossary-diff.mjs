/**
 * Term candidates in a feature's diff (project-glossary S7; spec 12; L10), for the fundamentalist
 * to judge, never findings on their own:
 *
 * - `avoid`: an added line of a Markdown file outside `docs/design/` and `docs/adr/` (and outside
 *   the glossary and its log) uses an `_Avoid_` word of the head's glossary.
 * - `orphaned`: a term of the head's glossary that the base used and the head does not (L3's
 *   measure, a whole-word, case-insensitive fixed-string `git grep`, taken at each commit).
 * - `unlogged`: a glossary entry the diff adds, changes or removes with no `GLOSSARY-LOG.md` row
 *   of that change and term added by the diff (L12).
 *
 * The diff runs from the merge base of `base` and `head` to `head`, the feature's own change, as
 * `git diff base...head` reads it. Both refs are checked for shape, then resolved to commit ids
 * with `git rev-parse`; only those ids reach any later `git` call, each as one argv entry with no
 * shell between.
 * `node scripts/glossary-diff.mjs <repo> <base> <head>` prints one line per candidate and exits 0;
 * 2 when a ref is refused or `git` fails.
 */
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { matchGlossary, parseGlossary } from './glossary.mjs';
import { readLog } from './glossary-log.mjs';

const GLOSSARY = 'GLOSSARY.md';
const LOG = 'GLOSSARY-LOG.md';
/** Where a term is defined, logged or planned rather than used. */
const NOT_USE = [`:(exclude)${GLOSSARY}`, `:(exclude)${LOG}`, ':(exclude)docs/design/', ':(exclude)docs/adr/'];
const COMMIT_ID = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;

/** `git args…` in `repoDir`: its result, thrown when git cannot start or exits outside `ok`. */
function git(repoDir, args, ok = [0]) {
  const result = spawnSync('git', ['-c', 'core.quotePath=false', ...args], {
    cwd: repoDir,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    shell: false,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (!ok.includes(result.status)) {
    throw new Error(`git ${args[0]} failed in ${repoDir} (exit ${result.status ?? result.signal}): ${result.stderr.trim()}`);
  }
  return result;
}

/** The commit id `ref` names; a ref shaped like an option, blank or holding a control character is refused first. */
function commitOf(repoDir, ref) {
  if (typeof ref !== 'string' || ref === '' || ref.length > 256 || ref.startsWith('-') || /[\s\x00-\x1f\x7f]/.test(ref)) {
    throw new Error(`ref ${JSON.stringify(ref)} is refused: empty, too long, an option, or holding whitespace`);
  }
  const { status, stdout } = git(repoDir, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`], [0, 1]);
  const id = stdout.trim();
  if (status !== 0 || !COMMIT_ID.test(id)) throw new Error(`ref ${ref} is not a commit in ${repoDir}`);
  return id;
}

/** The text of the root file `name` at commit `id`, or '' when that commit has none. */
function fileAt(repoDir, id, name) {
  const listed = git(repoDir, ['ls-tree', '--name-only', id, '--', name]).stdout.trim();
  return listed === name ? git(repoDir, ['cat-file', 'blob', `${id}:${name}`]).stdout : '';
}

/** True when some file of commit `id`, outside NOT_USE, holds `term` as a whole word, any case. */
function usedAt(repoDir, id, term) {
  return git(repoDir, ['grep', '-q', '-i', '-F', '-w', '-e', term, id, '--', ...NOT_USE], [0, 1]).status === 0;
}

/** A diff header's path: `b/x`, or C-quoted `"b/x"`, with git's trailing tab after a name holding a space dropped. */
function pathOf(header) {
  let name = header.replace(/\t$/, '');
  if (name.startsWith('"')) {
    try {
      name = JSON.parse(name);
    } catch {
      name = name.slice(1, -1);
    }
  }
  return name.startsWith('b/') ? name.slice(2) : null;
}

/** Each added line of the scanned Markdown files as `{ file, line, text }`, `line` 1-based in the head. */
function addedProse(repoDir, base, head) {
  const { stdout } = git(repoDir, [
    'diff', '--no-color', '--no-ext-diff', '--no-textconv', '--unified=0', '-M',
    '--src-prefix=a/', '--dst-prefix=b/', base, head, '--', '*.md', ...NOT_USE,
  ]);
  const added = [];
  let file = null;
  let line = 0;
  for (const raw of stdout.split('\n')) {
    if (raw.startsWith('+++ ')) file = pathOf(raw.slice(4));
    else if (raw.startsWith('@@ ')) line = Number(/\+(\d+)/.exec(raw)?.[1] ?? 0);
    else if (raw.startsWith('+') && file) added.push({ file, line: line++, text: raw.slice(1) });
  }
  return added;
}

/** Each entry's term mapped to what defines it, so an edit to either shows. */
const entriesBy = (text) => new Map(parseGlossary(text).map(({ term, definition, avoid }) => [term, `${definition}\n${avoid.join(',')}`]));

/** The glossary's entries the diff added, changed or removed, as `{ term, change }`. */
function glossaryEdits(before, after) {
  const was = entriesBy(before);
  const is = entriesBy(after);
  const edits = [];
  for (const [term, body] of is) {
    if (!was.has(term)) edits.push({ term, change: 'added' });
    else if (was.get(term) !== body) edits.push({ term, change: 'changed' });
  }
  for (const term of was.keys()) if (!is.has(term)) edits.push({ term, change: 'removed' });
  return edits;
}

/** The log rows the head holds beyond the base's, as `change term` keys; a row the cap dropped never counts. */
function rowsAdded(before, after) {
  const key = ({ date, run, change, term }) => [date, run, change, term].join('|');
  const left = new Map();
  for (const row of readLog(before)) left.set(key(row), (left.get(key(row)) ?? 0) + 1);
  const added = new Set();
  for (const row of readLog(after)) {
    const k = key(row);
    if (left.get(k) > 0) left.set(k, left.get(k) - 1);
    else added.add(`${row.change} ${row.term}`);
  }
  return added;
}

/** The term candidates the diff from `base` to `head` in `repoDir` raises. */
export function termsInDiff(repoDir, base, head) {
  const to = commitOf(repoDir, head);
  const from = git(repoDir, ['merge-base', commitOf(repoDir, base), to]).stdout.trim();
  const glossary = fileAt(repoDir, to, GLOSSARY);
  const candidates = [];
  for (const { file, line, text } of addedProse(repoDir, from, to)) {
    for (const { term, via, word } of matchGlossary(text, glossary)) {
      if (via === 'avoid') candidates.push({ kind: 'avoid', word, term, file, line });
    }
  }
  for (const { term } of parseGlossary(glossary)) {
    if (!usedAt(repoDir, to, term) && usedAt(repoDir, from, term)) candidates.push({ kind: 'orphaned', term });
  }
  const logged = rowsAdded(fileAt(repoDir, from, LOG), fileAt(repoDir, to, LOG));
  for (const { term, change } of glossaryEdits(fileAt(repoDir, from, GLOSSARY), glossary)) {
    if (!logged.has(`${change} ${term}`)) candidates.push({ kind: 'unlogged', term, change });
  }
  return candidates;
}

const lineOf = (c) =>
  c.kind === 'avoid' ? `avoid ${c.file}:${c.line} ${c.word} -> ${c.term}`
    : c.kind === 'orphaned' ? `orphaned ${c.term}`
      : `unlogged ${c.change} ${c.term}`;

function main(argv) {
  if (argv.length !== 3) {
    process.stderr.write('usage: node scripts/glossary-diff.mjs <repo> <base> <head>\n');
    process.exit(2);
  }
  let candidates;
  try {
    candidates = termsInDiff(...argv);
  } catch (error) {
    process.stderr.write(`glossary-diff: ${error.message}\n`);
    process.exit(2);
  }
  for (const candidate of candidates) process.stdout.write(`${lineOf(candidate)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
