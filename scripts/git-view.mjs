/**
 * One command's view of a repository (land-batching L2-L4, ADR NNNN): a `Git`, `(args) => string`
 * in `cwd`, that asks each read once per epoch. A read is an argv on `isRead`'s allowlist; any other
 * argv is a write: it runs every time, and then, thrown or not, every answer is forgotten, since a
 * merge or a push moves HEAD and refs at once and guessing which is the bug this must not add (L3).
 * A throw is rethrown as it came and never remembered, so the next ask runs git again.
 * `git.forget()` drops every answer, for a write made outside the view (`commitRecords`). `tipOf` and
 * `holdsIn` keep their answers in the same epoch, so they are forgotten with the rest.
 * Nothing outlives the process.
 */

import { git as gitAt } from './pilot-branch.mjs';

const options = (args) => args.slice(1).filter((arg) => arg.startsWith('-'));
const operands = (args) => args.slice(1).filter((arg) => !arg.startsWith('-'));

/**
 * Whether `args` only reads: rev-parse, for-each-ref, ls-remote, `config --get <key>`, `worktree list`,
 * `merge-base --is-ancestor`, and `symbolic-ref` naming one ref with no delete or message. A global
 * option first (`-c`, `-C`) is never a read.
 */
export function isRead(args) {
  switch (args[0]) {
    case 'rev-parse':
    case 'for-each-ref':
    case 'ls-remote':
      return true;
    case 'config':
      return args.length === 3 && args[1] === '--get' && !args[2].startsWith('-');
    case 'worktree':
      return args[1] === 'list';
    case 'merge-base':
      return args[1] === '--is-ancestor';
    case 'symbolic-ref':
      return operands(args).length === 1 && options(args).every((opt) => opt === '-q' || opt === '--quiet' || opt === '--short' || opt === '--no-recurse');
    default:
      return false;
  }
}

/** A view's current epoch's answers, where `tipOf` and `holdsIn` keep theirs too; absent on a plain runner. */
const EPOCH = Symbol('epoch');

export function gitView(cwd, { run = (args) => gitAt(cwd, ...args) } = {}) {
  let answers = new Map();
  const view = (args) => {
    if (!isRead(args)) {
      try {
        return run(args);
      } finally {
        answers = new Map();
      }
    }
    const key = JSON.stringify(args);
    if (answers.has(key)) return answers.get(key);
    const answer = run(args);
    answers.set(key, answer);
    return answer;
  };
  view.forget = () => {
    answers = new Map();
  };
  view[EPOCH] = () => answers;
  return view;
}

/** `compute()` once per epoch of `git` under `key`, an object's JSON, which no argv's (an array's) can be; every time on a plain runner. */
function inEpoch(git, key, compute) {
  const answers = git[EPOCH]?.();
  if (!answers) return compute();
  if (!answers.has(key)) answers.set(key, compute());
  return answers.get(key);
}

/**
 * The SHA `ref` points at, or null when there is no such ref (L4). `ref` is `HEAD`, one `rev-parse HEAD`,
 * or a full branch ref (`refs/heads/...`, `refs/remotes/...`), answered from one `for-each-ref` snapshot per epoch, so every tip a
 * command reads between two writes costs one spawn. A short name throws: `rev-parse` would disambiguate it.
 */
export function tipOf(git, ref) {
  if (ref === 'HEAD') return git(['rev-parse', 'HEAD']);
  if (!/^refs\/(?:heads|remotes)\//.test(ref)) throw new Error(`tipOf takes a full branch ref (refs/heads/, refs/remotes/) or HEAD, not ${ref}`);
  // Branches only: a repository's tags could outgrow the runner's output buffer, and no caller reads one.
  const text = git(['for-each-ref', '--format=%(objectname) %(refname)', 'refs/heads', 'refs/remotes']);
  // The parse lives in the same epoch as the snapshot it parses, so the two are forgotten together.
  const tips = inEpoch(git, '{"tips":true}', () => new Map(text.split('\n').filter(Boolean).map((line) => {
    const space = line.indexOf(' ');
    return [line.slice(space + 1), line.slice(0, space)];
  })));
  return tips.get(ref) ?? null;
}

/**
 * Whether `args` exits 0 through `git`, any throw reading false as `holds` reads it. A read's answer,
 * false too, is remembered for the epoch; a write is run every time.
 */
export function holdsIn(git, args) {
  const attempt = () => {
    try {
      git(args);
      return true;
    } catch {
      return false;
    }
  };
  return isRead(args) ? inEpoch(git, JSON.stringify({ holds: args }), attempt) : attempt();
}
