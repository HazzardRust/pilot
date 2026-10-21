/**
 * The test selection (suite-at-landing spec 1; L5, L6, L10): `npm run test:changed -- --since=<ref>`
 * runs the test files a diff touches, not the whole tree. The diff runs from merge-base(ref, HEAD)
 * to the working tree, untracked files included, because integrate's slice merge is still
 * uncommitted when its tests run. A test file is selected when it reaches a changed file through
 * any chain of relative imports (itself changed included), when it names the basename of a file so
 * reached, or when it is in `TREE_TESTS` (A1). The ref is resolved by `git rev-parse --verify` to a sha before any other
 * use, and reaches git as one argv entry after `--end-of-options`, never through a shell.
 *
 * `scopeLine` is the line the gate prints for a selection, and `scopeOf` reads the last one back
 * out of a gate's output, so the format is written in one place.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * `node --test`'s own default pattern, less the helpers: the files a full run starts. A module
 * under a `test/lib/` directory is a helper (spec 7), so `test/**` becomes `test/*` and every
 * `test/` subdirectory but `lib`.
 */
export const TEST_GLOB = '**/{test,test/*,test/!(lib)/**/*,test-*,*[._-]test}.{js,mjs,cjs,ts,mts,cts}';

/**
 * A change to one of these alters how every test runs (the install, the runner, the selection
 * itself), so the diff runs the whole suite and says which file asked for it.
 */
export const FULL_TRIGGERS = Object.freeze([
  'package.json',
  'package-lock.json',
  'scripts/gate.mjs',
  'scripts/gate-slots.mjs',
  'scripts/count-spawns.mjs',
  'scripts/select-tests.mjs',
]);

/** The longest the selected absolute paths may be, joined, before the run goes full: Windows caps a command line near 32767. */
export const ARGV_LIMIT = 24000;

/**
 * The whole-tree tests (A2): each reads every tracked file of a kind, so a file added or changed
 * anywhere can break it without being imported or named. Every selection runs the ones that exist.
 * `treeWalkers` finds the walkers it can see and a pin fails when one is missing here; the rest
 * (a walk inside a local helper, a listing of a local variable holding a root path) are added by
 * hand, and a new one of those is missed until someone adds it.
 */
export const TREE_TESTS = Object.freeze([
  'deck/test/audit-pick.test.mjs',
  'deck/test/chain.test.mjs',
  'deck/test/daemon.test.mjs',
  'deck/test/facades.test.mjs',
  'deck/test/live.test.mjs',
  'deck/test/open.test.mjs',
  'deck/test/resize.test.mjs',
  'deck/test/tickets-region.test.mjs',
  'deck/test/ui-route.test.mjs',
  'scripts/test/audit-agent.test.mjs',
  'scripts/test/crew-waits.test.mjs',
  'scripts/test/deck-readme.test.mjs',
  'scripts/test/frontmatter-crlf.test.mjs',
  'scripts/test/gitignore.test.mjs',
  'scripts/test/hidden-spawns.test.mjs',
  'scripts/test/install.test.mjs',
  'scripts/test/line-endings.test.mjs',
  'scripts/test/methodology-skills.test.mjs',
  'scripts/test/one-line-wording.test.mjs',
  'scripts/test/path-length.test.mjs',
  'scripts/test/pilot-agents.test.mjs',
  'scripts/test/pilot-rules.test.mjs',
  'scripts/test/platform-reads.test.mjs',
  'scripts/test/readme-flow.test.mjs',
  'scripts/test/rules-dedup.test.mjs',
  'scripts/test/rules-globs.test.mjs',
  'scripts/test/rules-references.test.mjs',
  'scripts/test/run-remote-readme.test.mjs',
  'scripts/test/state-words.test.mjs',
  'scripts/test/ticket-states.test.mjs',
]);

/**
 * A relative specifier in a static `import`/`export ... from`, a literal `import()`, a `require()`,
 * or a `createRequire(import.meta.url)(...)` call. A `?query` stays on the path, so such a test is
 * reached by its basename mention of the module instead.
 */
const RELATIVE_IMPORT = /(?:\b(?:from|import|require)|\))\s*\(?\s*(['"])(\.{1,2}\/[^'"\n]+)\1/g;
/** A file name as source text names it, a dotfile included; a name built at run time is not seen. */
const FILE_NAME = /[\w.-]*\.\w+/g;
/** `git ls-files` run as an argv entry, or `readdirSync` of a root constant (`ROOT`, `path.join(UI, ...)`). */
const WALKS_TREE = /(['"])ls-files\1|readdirSync\(\s*(?:path\.(?:join|resolve|dirname)\(\s*)?[A-Z][A-Z0-9_]*\b/;
const SCRIPT = /\.(?:mjs|cjs|js)$/;
const SOURCE = /\.(?:mjs|cjs|js|mts|cts|ts)$/;
const SCOPE = /^(?:selected \d+ of \d+ test files since [0-9a-f]{7}|full suite: .+)$/;

const lines = (out) => out.split('\0').filter(Boolean);
const gitIn = (cwd) => (args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });

/** The tracked and untracked files of `cwd` that exist, repository-relative with forward slashes. */
const presentFiles = (cwd, git) =>
  lines(git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'])).filter((rel) => fs.existsSync(path.join(cwd, rel)));

/** The repository-relative paths, forward slashes, that `text` imports from `rel`. */
function importsOf(text, rel) {
  const dir = path.posix.dirname(rel);
  return [...text.matchAll(RELATIVE_IMPORT)].map((m) => path.posix.normalize(path.posix.join(dir, m[2])));
}

/**
 * The selection for `since` in `cwd`: `files` the absolute test paths to run, sorted, or null for a
 * full run with `reason`; `total` the test files a full run starts; `since` the merge-base sha.
 */
export function selectTests({ cwd, since, git = gitIn(cwd) }) {
  const present = presentFiles(cwd, git);
  const tests = present.filter((rel) => path.posix.matchesGlob(rel, TEST_GLOB));
  const total = tests.length;
  let base;
  try {
    const sha = git(['rev-parse', '--verify', '--quiet', '--end-of-options', `${since}^{commit}`]).trim();
    base = git(['merge-base', sha, 'HEAD']).trim();
  } catch {
    // A control character in the ref would forge a line of the gate's output, so it prints as `?`.
    return { files: null, total, since, reason: `cannot resolve ${since.replace(/[\x00-\x1f\x7f]/g, '?')}` };
  }
  let changed;
  try {
    changed = new Set([
      // `--no-renames`: a rename lists its old path too, so the tests still naming it are selected.
      ...lines(git(['diff', '--name-only', '--no-renames', '--relative', '-z', base, '--'])),
      ...lines(git(['ls-files', '-z', '--others', '--exclude-standard'])),
    ]);
  } catch {
    // A failed diff is not an empty one: nothing is known about what changed, so everything runs.
    return { files: null, total, since: base, reason: 'git diff failed' };
  }
  const trigger = FULL_TRIGGERS.find((rel) => changed.has(rel));
  if (trigger) return { files: null, total, since: base, reason: `${trigger} changed` };
  const source = new Map(present.filter((rel) => SOURCE.test(rel)).map((rel) => [rel, fs.readFileSync(path.join(cwd, rel), 'utf8')]));
  const importers = new Map();
  for (const [rel, text] of source) {
    for (const dep of importsOf(text, rel)) (importers.get(dep) ?? importers.set(dep, []).get(dep)).push(rel);
  }
  // Every file reaching a changed one through relative imports, the changed ones included.
  const reached = new Set(changed);
  for (const dep of reached) for (const rel of importers.get(dep) ?? []) reached.add(rel);
  // A test naming a reached file's basename reads it (a prose pin) or spawns it (a script by path).
  const names = new Set([...reached].map((rel) => path.posix.basename(rel)));
  const tree = new Set(TREE_TESTS);
  const named = (rel, set) => (source.get(rel) ?? '').match(FILE_NAME)?.some((name) => set.has(name));
  const selected = tests.filter((rel) => reached.has(rel) || tree.has(rel) || named(rel, names));
  // A changed script no test imports or names is a change nothing would check, so everything runs.
  const lonely = [...changed].find((rel) => {
    if (!SCRIPT.test(rel) || !source.has(rel)) return false;
    const from = new Set([rel]);
    for (const dep of from) for (const imp of importers.get(dep) ?? []) from.add(imp);
    const fromNames = new Set([...from].map((r) => path.posix.basename(r)));
    return !tests.some((t) => from.has(t) || named(t, fromNames));
  });
  if (lonely) return { files: null, total, since: base, reason: `${lonely} reaches no test` };
  const files = selected.map((rel) => path.resolve(cwd, rel)).sort();
  const argv = files.join(' ').length;
  if (argv > ARGV_LIMIT) return { files: null, total, since: base, reason: `selection is ${argv} characters of argv, over ${ARGV_LIMIT}` };
  return { files, total, since: base };
}

/**
 * The census behind `TREE_TESTS`: the test files of `root` whose source, or a helper they import
 * from a test directory, runs `git ls-files` or lists a root constant with `readdirSync`.
 */
export function treeWalkers(root) {
  const present = presentFiles(root, gitIn(root));
  const read = (rel) => (SOURCE.test(rel) && fs.existsSync(path.join(root, rel)) ? fs.readFileSync(path.join(root, rel), 'utf8') : '');
  return present
    .filter((rel) => path.posix.matchesGlob(rel, TEST_GLOB))
    .filter((rel) => {
      const text = read(rel);
      return [text, ...importsOf(text, rel).filter((dep) => dep.split('/').includes('test')).map(read)].some((t) => WALKS_TREE.test(t));
    })
    .sort();
}

/** The median of each row's `selected / total`, a full row counting as 1; 0 with no rows. */
export function medianShare(rows) {
  const sorted = rows.map((r) => (r.selected === 'full' ? 1 : r.selected / r.total)).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * The selection replayed over the last `count` first-parent merges whose subject starts
 * `Merge S<n>` (A4) and whose diff changes no `FULL_TRIGGERS` file, newest first: each is the
 * diff from its first parent, selected in one temporary detached worktree that is moved from
 * merge to merge, never in the caller's. `skipped` counts the newer trigger merges passed over;
 * `median` is `medianShare(rows)`.
 */
export function replay({ cwd, count }) {
  const git = gitIn(cwd);
  const merges = git(['log', '--first-parent', '--merges', '-z', '--format=%H%x09%s'])
    .split('\0').filter(Boolean)
    .map((entry) => entry.trim().split('\t'))
    .filter(([, subject]) => /^Merge S\d+/.test(subject));
  if (merges.length === 0) return { rows: [], median: 0, skipped: 0 };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-replay-'));
  const wt = path.join(tmp, 'wt');
  try {
    git(['worktree', 'add', '--detach', '-q', wt, merges[0][0]]);
    const inWt = gitIn(wt);
    const rows = [];
    let skipped = 0;
    for (const [sha, subject] of merges) {
      if (rows.length === count) break;
      inWt(['checkout', '-q', '--detach', sha]);
      const s = selectTests({ cwd: wt, since: `${sha}^1`, git: inWt });
      if (s.files === null && FULL_TRIGGERS.some((rel) => s.reason === `${rel} changed`)) skipped++;
      else rows.push({ sha, subject, selected: s.files === null ? 'full' : s.files.length, total: s.total });
    }
    return { rows, median: medianShare(rows), skipped };
  } finally {
    try {
      git(['worktree', 'remove', '--force', wt]);
    } catch {
      // The worktree is already gone; the directory below goes either way.
    }
    fs.rmSync(tmp, { recursive: true, force: true });
    try {
      git(['worktree', 'prune']);
    } catch {
      // A stale worktree entry is untidy; the replay's answer stands.
    }
  }
}

/** `<sha7> <subject>  <n> of <m>`, or `... full (<m>)` for a full run. */
const replayLine = (r) => `${r.sha.slice(0, 7)} ${r.subject}  ${r.selected === 'full' ? `full (${r.total})` : `${r.selected} of ${r.total}`}`;

/** `selected <n> of <m> test files since <sha7>`, or `full suite: <reason>`. */
export function scopeLine(selection) {
  if (selection.files === null) return `full suite: ${selection.reason}`;
  return `selected ${selection.files.length} of ${selection.total} test files since ${selection.since.slice(0, 7)}`;
}

/** The last scope line in a gate's `output`, or null when it printed none. */
export function scopeOf(output) {
  return output.split(/\r?\n/).findLast((line) => SCOPE.test(line)) ?? null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const at = process.argv.indexOf('--replay');
  const count = Number(process.argv[at + 1]);
  if (at < 0 || !Number.isInteger(count) || count < 1) {
    console.error('usage: node scripts/select-tests.mjs --replay <n>');
    process.exit(2);
  }
  const { rows, median: k, skipped } = replay({ cwd: process.cwd(), count });
  for (const row of rows) console.log(replayLine(row));
  console.log(`skipped, a full-suite trigger changed: ${skipped}`);
  console.log(`median ${Math.round(100 * k)}% of the suite`);
}
