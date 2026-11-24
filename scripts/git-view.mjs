/**
 * One command's view of a repository (land-batching L2-L4, ADR NNNN): a `Git`, `(args) => string`
 * in `cwd`, that asks each read once per epoch. A read is an argv on `isRead`'s allowlist; any other
 * argv is a write: it runs every time, and then, thrown or not, every answer is forgotten, since a
 * merge or a push moves HEAD and refs at once and guessing which is the bug this must not add (L3).
 * A throw is rethrown as it came and never remembered, so the next ask runs git again.
 * `git.forget()` drops every answer, for a write made outside the view (`commitRecords`).
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
      return args.length === 3 && args[1] === '--get';
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
  return view;
}
