/**
 * `seed(dir, history, refs)` (test-body-git S1, L3; ADR NNNN): a fixture's origin, its branches,
 * commits and merges, written by one `git init --bare` and one `git fast-import`, where a porcelain
 * build spends an init, add, commit, checkout, merge and push per step. Working copies stay `git clone`.
 *
 * - `history` is `{ branch, files, message, merge? }[]`, one commit each, in order. A branch's first
 *   commit grows from the previous commit in history (none for the first); later ones from its tip.
 * - A commit's tree is its parent's files with its own `files` laid over. A merge (`merge`: branch
 *   names, joined after the first parent) lays each merged branch's files over the first parent's,
 *   then its own: a history whose merge would conflict, or needs a merge base, is not one to seed.
 * - `refs` sets each new branch to an existing branch's tip once the history is in.
 * - Commit times count up by a second from a fixed epoch in history order, so topological and date
 *   order agree; author and committer are the identity in the fixture's global config.
 *
 * Returns `{ origin, sha }`: `origin` is `<dir>/origin.git`, its HEAD `main`; `sha` each branch's tip,
 * `refs` included. Every name and path is checked before any git starts, and git gets argv and stdin
 * only, never a shell string.
 */

import './git-fixture.mjs';

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EPOCH = 1_700_000_000;

// A plain ref name: no whitespace, control character, `..`, `@{`, or the characters git refuses.
const BRANCH = /^(?!.*\.\.)(?!.*\/\/)(?!.*@\{)(?!.*\.lock$)[A-Za-z0-9_][A-Za-z0-9._/-]*(?<![/.])$/;

function checkBranch(name) {
  if (typeof name !== 'string' || !BRANCH.test(name)) throw new Error(`seed: not a branch name: ${JSON.stringify(name)}`);
}

function checkPath(file) {
  const parts = file.split('/');
  if (/[\0\r\n\\]/.test(file) || file === '' || parts.some((part) => part === '' || part === '.' || part === '..' || part === '.git')) {
    throw new Error(`seed: not a relative path: ${JSON.stringify(file)}`);
  }
}

/** `name <email>` from the global config the fixture seam wrote. */
function identity() {
  const text = fs.readFileSync(process.env.GIT_CONFIG_GLOBAL, 'utf8');
  const name = text.match(/^\s*name\s*=\s*(.+?)\s*$/m)?.[1];
  const email = text.match(/^\s*email\s*=\s*(.+?)\s*$/m)?.[1];
  if (!name || !email || /[<>\n]/.test(name + email)) throw new Error(`seed: no identity in ${process.env.GIT_CONFIG_GLOBAL}`);
  return `${name} <${email}>`;
}

const data = (text) => `data ${Buffer.byteLength(text)}\n${text}\n`;
const quote = (file) => `"${file.replace(/["]/g, '\\"')}"`;

export function seed(dir, history, refs = {}) {
  // Plan every commit before any git: a bad name or a merge of an unknown branch throws here.
  const tips = new Map();
  const planned = [];
  history.forEach((commit, i) => {
    checkBranch(commit.branch);
    for (const file of Object.keys(commit.files)) checkPath(file);
    const merge = (commit.merge ?? []).map((name) => {
      checkBranch(name);
      if (!tips.has(name)) throw new Error(`seed: merge of a branch not yet in history: ${name}`);
      return tips.get(name);
    });
    const parent = tips.get(commit.branch) ?? (i > 0 ? i - 1 : undefined);
    const tree = { ...(parent === undefined ? {} : planned[parent].tree) };
    for (const from of merge) Object.assign(tree, planned[from].tree);
    Object.assign(tree, commit.files);
    planned[i] = { ...commit, parent, mergeMarks: merge, tree };
    tips.set(commit.branch, i);
  });
  for (const [name, target] of Object.entries(refs)) {
    checkBranch(name);
    checkBranch(target);
    if (!tips.has(target)) throw new Error(`seed: ref to a branch not in history: ${target}`);
  }

  const who = identity();
  const stream = [];
  planned.forEach((commit, i) => {
    const when = `${who} ${EPOCH + i} +0000`;
    stream.push(`commit refs/heads/${commit.branch}\nmark :${i + 1}\nauthor ${when}\ncommitter ${when}\n${data(commit.message)}`);
    if (commit.parent !== undefined) stream.push(`from :${commit.parent + 1}\n`);
    for (const from of commit.mergeMarks) stream.push(`merge :${from + 1}\n`);
    stream.push('deleteall\n');
    for (const [file, text] of Object.entries(commit.tree)) stream.push(`M 100644 inline ${quote(file)}\n${data(text)}`);
    stream.push('\n');
  });
  for (const [name, target] of Object.entries(refs)) stream.push(`reset refs/heads/${name}\nfrom :${tips.get(target) + 1}\n\n`);
  stream.push('done\n');

  const origin = path.join(dir, 'origin.git');
  const marks = path.join(dir, 'origin.git.marks');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin], { cwd: dir, stdio: 'pipe' });
  try {
    execFileSync('git', [`--git-dir=${origin}`, 'fast-import', '--quiet', '--done', `--export-marks=${marks}`], { cwd: dir, input: stream.join(''), stdio: 'pipe' });
    const byMark = new Map(fs.readFileSync(marks, 'utf8').split('\n').filter(Boolean).map((line) => line.slice(1).split(' ')));
    const sha = {};
    for (const [branch, i] of tips) sha[branch] = byMark.get(String(i + 1));
    for (const [name, target] of Object.entries(refs)) sha[name] = sha[target];
    return { origin, sha };
  } finally {
    fs.rmSync(marks, { force: true });
  }
}
