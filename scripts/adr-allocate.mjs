/**
 * ADR allocation at the landing (one-integration-line spec 5; L4, A4). A run names its own ADR
 * `docs/adr/NNNN-<slug>.md` and cites it `ADR NNNN`; inside the landing merge, before its
 * suite, `allocateAdr` renames that placeholder to the next free number and amends the merge, so
 * pilot still moves by one tested merge and two features never take the same number.
 *
 * Citations are rewritten only in the files the feature changed: `NNNN-<slug>` and a plain
 * `ADR NNNN` in every one, and the bare `NNNN` in the front matter of a changed `docs/adr/*.md`
 * (a `superseded_by`). An `ADR NNNN` inside a code span or fence is the convention quoted
 * (ADR-FORMAT.md, pilot-architect.md), never a citation, and is kept.
 */

import fs from 'node:fs';
import path from 'node:path';

import { nextNumber, PLACEHOLDER } from './adr-index.mjs';
import { refreshIndex } from './merge-generated.mjs';
import { git } from './pilot-branch.mjs';

const ADRS = 'docs/adr';
const PLACEHOLDER_FILE = new RegExp(`^${PLACEHOLDER}-.+\\.md$`);
const ADR_PATH = new RegExp(`^${ADRS}/[^/]+\\.md$`);
// A fence or a code span is matched first and kept, so only a plain `ADR NNNN` is a citation.
const CITATION = new RegExp(`(\`\`\`[\\s\\S]*?\`\`\`|\`[^\`\\n]*\`)|ADR ${PLACEHOLDER}\\b`, 'g');
// The ADR tooling and its tests hold the placeholder as data, in plain strings: never a citation.
const TOOLING = /^scripts\/(test\/)?(land-)?adr-[^/]*\.mjs$/;
const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---(?=\r?\n|$)/;
const BARE = new RegExp(`\\b${PLACEHOLDER}\\b`, 'g');

/**
 * Allocates the placeholder ADR of the merge checked out in the worktree `dir` (HEAD, a merge
 * whose second parent is the feature). `since` is pilot's tip the merge went onto; the feature's
 * files are `git diff --name-only since...HEAD^2`. Answers `{ from, to }`, `from` the placeholder's
 * name without `.md` and `to` its number, or null when the tree holds no placeholder. Two or more
 * throw with `exitCode` 1 before anything is changed.
 */
export function allocateAdr(dir, { since }) {
  const adrs = path.join(dir, ADRS);
  const found = fs.existsSync(adrs) ? fs.readdirSync(adrs).filter((f) => PLACEHOLDER_FILE.test(f)).sort() : [];
  if (!found.length) return null;
  if (found.length > 1) throw Object.assign(new Error(`two placeholder ADRs: ${found.join(', ')}; one per feature`), { exitCode: 1 });
  const from = found[0].slice(0, -'.md'.length);
  const slug = from.slice(PLACEHOLDER.length + 1);
  const to = nextNumber(adrs);
  const changed = git(dir, 'diff', '--name-only', '-z', `${since}...HEAD^2`).split('\0').filter(Boolean);
  try {
    amend(dir, { placeholder: found[0], slug, to, changed });
  } catch (err) {
    // A half-made allocation is undone: a kept worktree must not reach the next landing dirty.
    git(dir, 'reset', '-q', '--hard', 'HEAD');
    throw Object.assign(err, { exitCode: 1 });
  }
  return { from, to };
}

/** Renames `placeholder` to `<to>-<slug>.md`, rewrites the citations in `changed`, refreshes the index and amends HEAD. */
function amend(dir, { placeholder, slug, to, changed }) {
  git(dir, 'mv', '--', `${ADRS}/${placeholder}`, `${ADRS}/${to}-${slug}.md`);
  const rename = (file) => (file === `${ADRS}/${placeholder}` ? `${ADRS}/${to}-${slug}.md` : file);
  const rewritten = [];
  for (const file of changed.map(rename)) {
    const at = path.join(dir, file);
    // A deleted file, a symlink or a binary file is left as it is.
    if (!fs.existsSync(at) || !fs.lstatSync(at).isFile()) continue;
    const text = fs.readFileSync(at, 'utf8');
    if (text.includes('\0')) continue;
    // Function replacements, so a `$&` or `` $` `` in the slug is copied, not expanded.
    let next = text.replaceAll(`${PLACEHOLDER}-${slug}`, () => `${to}-${slug}`);
    if (!TOOLING.test(file)) next = next.replace(CITATION, (match, quoted) => (quoted === undefined ? `ADR ${to}` : match));
    if (ADR_PATH.test(file)) next = next.replace(FRONT_MATTER, (block) => block.replace(BARE, () => to));
    if (next === text) continue;
    fs.writeFileSync(at, next, 'utf8');
    rewritten.push(file);
  }
  if (rewritten.length) git(dir, 'add', '--', ...rewritten);
  refreshIndex(dir);
  git(dir, 'commit', '-q', '--amend', '--no-edit');
}
