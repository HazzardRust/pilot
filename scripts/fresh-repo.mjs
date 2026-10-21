/**
 * The fresh public repository's one commit, built locally (fresh-public-repo spec 2, 3, 6;
 * L1-L3, A1). Run from the real checkout once the last feature PR has merged into `main`:
 *
 *   node scripts/fresh-repo.mjs --from <ref> --pilot <ref> --email <addr> [--name <name>] --out <dir>
 *
 * makes <dir> a new bare repository whose only ref is `main`: one parentless commit with
 * <from>'s tree, author and committer <name> <email>. It prints the push command and pushes
 * nothing; the push is the user's (L1). It refuses, building nothing, when <pilot>'s tree
 * differs from <from>'s (unlanded work), when <email> is not a GitHub noreply address, or
 * when <dir> exists.
 *
 * The identity is set in the environment of the one `commit-tree`, so the repository's
 * `user.email` is never read. Only the tree's objects reach <dir>: they travel as a pack
 * built from `rev-list --objects <tree>`, never by fetch or push, so no other history does.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const NOREPLY = /^[^\s@]+@users\.noreply\.github\.com$/;
// Inherited from a hook or a shell, these would redirect every call below or stamp the commit.
const REDIRECTS = new Set([
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_TEMPLATE_DIR', 'GIT_AUTHOR_DATE', 'GIT_COMMITTER_DATE',
]);

class Refusal extends Error {}
const refuse = (reason) => new Refusal(`fresh-repo: ${reason}`);

/** Build the orphan into a new bare repo at `out`. Answers `{ sha, tree }`; throws a refusal. */
export function buildOrphan({ cwd, from, pilot, email, name, out }) {
  if (!NOREPLY.test(email ?? '')) throw refuse(`${email} is not a GitHub noreply address`);
  const target = path.resolve(cwd, out);
  if (fs.existsSync(target)) throw refuse(`${out} exists`);
  const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !REDIRECTS.has(key.toUpperCase())));
  const git = (args, options = {}) => execFileSync('git', args, { cwd, env: clean, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 1 << 30, windowsHide: true, ...options });
  const treeOf = (ref) => {
    if (typeof ref !== 'string' || !ref || ref.startsWith('-')) throw refuse(`${ref} is not a commit`);
    try {
      return git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}^{tree}`], { encoding: 'utf8' }).trim();
    } catch {
      throw refuse(`${ref} is not a commit`);
    }
  };
  const tree = treeOf(from);
  if (treeOf(pilot) !== tree) throw refuse(`${pilot} has changes ${from} lacks`);

  const who = name || email.split('@')[0].replace(/^\d+\+/, '');
  const env = { ...clean, GIT_AUTHOR_NAME: who, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: who, GIT_COMMITTER_EMAIL: email };
  try {
    fs.mkdirSync(target); // no `recursive`: a directory that appeared since the check is not ours to remove
  } catch (err) {
    throw err.code === 'EEXIST' ? refuse(`${out} exists`) : err;
  }
  try {
    // No template, so no hook or config of the user's lands in the public repo.
    git(['init', '-q', '--bare', '--template=', '-b', 'main', target]);
    const objects = git(['rev-list', '--objects', '--no-object-names', tree]);
    const pack = git(['pack-objects', '-q', '--stdout'], { input: objects });
    git(['-C', target, 'index-pack', '--stdin'], { input: pack });
    const sha = git(['-C', target, 'commit-tree', tree, '-m', 'Initial public commit'], { encoding: 'utf8', env }).trim();
    git(['-C', target, 'update-ref', 'refs/heads/main', sha]);
    return { sha, tree };
  } catch (err) {
    fs.rmSync(target, { recursive: true, force: true });
    throw err;
  }
}

/** The CLI. Answers the exit code. */
export function main(argv, { cwd = process.cwd(), say = (t) => process.stdout.write(t), warn = (t) => process.stderr.write(t) } = {}) {
  let values;
  try {
    ({ values } = parseArgs({ args: argv, strict: true, options: Object.fromEntries(['from', 'pilot', 'email', 'name', 'out'].map((k) => [k, { type: 'string' }])) }));
  } catch (err) {
    warn(`fresh-repo: ${err.message}\n`);
  }
  // A usage error is not a refusal: exit 2, as `pilot base` does.
  if (!values?.from || !values.pilot || !values.email || !values.out) {
    warn('usage: node scripts/fresh-repo.mjs --from <ref> --pilot <ref> --email <addr> [--name <name>] --out <dir>\n');
    return 2;
  }
  try {
    const { sha } = buildOrphan({ cwd, ...values });
    say(`fresh-repo: ${sha} in ${values.out}; push with: git -C ${values.out} push <url> main\n`);
    return 0;
  } catch (err) {
    warn(`${err instanceof Refusal ? err.message : `fresh-repo: ${String(err.stderr || err.message).trim().split('\n')[0]}`}\n`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
