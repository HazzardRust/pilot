/**
 * The scratch repositories, fake `gh` and stdout capture that `land.test.mjs` and
 * `land-main-pr.test.mjs` share: one file split in two so neither is the gate's long pole
 * (git-light-tests S8). Every repository is built through `gitFixture`, imported first.
 */

import { gitFixture } from './git-fixture.mjs';

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const { land, main } = await import('../../land.mjs');
export { land };

export const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
export const isAncestor = (repo, a, b) => {
  try {
    git(repo, 'merge-base', '--is-ancestor', a, b);
    return true;
  } catch {
    return false;
  }
};

export function commitFile(repo, file, text, message) {
  fs.writeFileSync(path.join(repo, file), text);
  git(repo, 'add', file);
  git(repo, 'commit', '-q', '-m', message);
}

/**
 * A bare origin with main and `pilot` from it, a seed clone to move them, and `clone(feat)` for
 * each feature; each of `names` is already cloned, as `clone(name)` would, under its own name.
 */
export function repos(t, ...names) {
  return gitFixture(t, `land:repos:${names}`, (dir) => buildRepos(dir, names));
}

export function buildRepos(dir, names) {
  const origin = path.join(dir, 'origin.git');
  const seed = path.join(dir, 'seed');
  git(dir, 'init', '--bare', '-b', 'main', origin);
  git(origin, 'config', 'core.logAllRefUpdates', 'always');
  git(dir, 'clone', '-q', origin, seed);
  git(seed, 'checkout', '-q', '-b', 'main');
  commitFile(seed, 'shared.txt', 'one\n', 'main');
  git(seed, 'push', '-q', 'origin', 'main', 'main:pilot');
  /** A clone on a new `feat/<name>` cut from `from`, origin's pilot tip by default, with one commit, pushed. */
  const clone = (name, from = 'origin/pilot') => {
    const work = path.join(dir, name);
    git(dir, 'clone', '-q', origin, work);
    git(work, 'checkout', '-q', '-b', `feat/${name}`, from);
    commitFile(work, `${name}.txt`, `${name}\n`, `feat ${name}`);
    git(work, 'push', '-q', 'origin', `feat/${name}`);
    return work;
  };
  /** A test command that pushes `<src>:pilot` from `repo` on its first `times` runs, then passes. */
  const mover = (repo, src, times) => {
    const script = path.join(dir, `mover-${path.basename(repo)}.mjs`);
    const count = path.join(dir, `count-${path.basename(repo)}`);
    fs.writeFileSync(
      script,
      `import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const n = fs.existsSync(${JSON.stringify(count)}) ? Number(fs.readFileSync(${JSON.stringify(count)}, 'utf8')) : 0;
fs.writeFileSync(${JSON.stringify(count)}, String(n + 1));
if (n < ${times}) {
  if (${JSON.stringify(src)} === 'new') {
    execFileSync('git', ['fetch', '-q', 'origin'], { cwd: ${JSON.stringify(repo)} });
    execFileSync('git', ['checkout', '-q', '-B', 'mover', 'origin/pilot'], { cwd: ${JSON.stringify(repo)} });
    fs.writeFileSync(${JSON.stringify(repo)} + '/moved' + n + '.txt', 'x');
    execFileSync('git', ['add', '.'], { cwd: ${JSON.stringify(repo)} });
    execFileSync('git', ['commit', '-q', '-m', 'moved'], { cwd: ${JSON.stringify(repo)} });
    execFileSync('git', ['push', '-q', 'origin', 'mover:pilot'], { cwd: ${JSON.stringify(repo)} });
  } else {
    execFileSync('git', ['push', '-q', 'origin', ${JSON.stringify(src)} + ':pilot'], { cwd: ${JSON.stringify(repo)} });
  }
}
console.log('ℹ pass 1'); console.log('ℹ fail 0');
`,
    );
    return `node "${script}"`;
  };
  const cloned = Object.fromEntries(names.map((name) => [name, clone(name)]));
  return { origin, seed, clone, mover, gitIn: (repo) => (args) => git(repo, ...args), ...cloned };
}

export const passing = `node -e "console.log('ℹ pass 3'); console.log('ℹ fail 0')"`;

/**
 * A fake `gh` that records its argv, answers `pr list --head <h>` with the `prs` whose
 * head is `h`, else `pr list --base <b>` with those whose base is `b` (`--state` keeps that state's),
 * `pr comment` with `comment()`, `pr close`, `pr edit` and `label create` with '', and `pr create`
 * with PR `created`'s URL. A PR's state defaults to MERGED, as GitHub
 * reads a feature PR once pilot holds its head (one-integration-line A5); its base to main.
 */
export function fakeGh(prs = [], comment = () => '', { created = 900 } = {}) {
  const calls = [];
  const gh = (args) => {
    calls.push(args);
    if (args[0] === 'pr' && args[1] === 'list') {
      const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
      const [head, base, state] = [flag('--head'), flag('--base'), flag('--state')];
      const listed = prs
        .map((pr) => ({ state: 'MERGED', baseRefName: 'main', isCrossRepository: false, ...pr }))
        .filter((pr) => (head === undefined ? base === undefined || pr.baseRefName === base : pr.headRefName === head))
        .filter((pr) => state === undefined || state === 'all' || pr.state === state.toUpperCase());
      return JSON.stringify(listed);
    }
    if (args[0] === 'pr' && args[1] === 'comment') return comment(args);
    if (args[0] === 'pr' && (args[1] === 'close' || args[1] === 'edit')) return '';
    if (args[0] === 'label' && args[1] === 'create') return '';
    if (args[0] === 'pr' && args[1] === 'create') return `https://github.com/o/r/pull/${created}\n`;
    throw new Error(`unexpected gh ${args.join(' ')}`);
  };
  return { gh, calls };
}

/** `git log` of `rev` in `repo`, first parents only, as "<subject> <parents>" lines. */
export const merges = (repo, rev) => git(repo, 'log', '--first-parent', '--format=%s %P', rev).split('\n');

/** `main`'s stdout and exit code, with `land`'s calls out injected. */
export function mainSays(argv, inject) {
  const said = [];
  const write = process.stdout.write;
  process.stdout.write = (text) => said.push(String(text));
  try {
    return { code: main(argv, inject), out: said.join('') };
  } finally {
    process.stdout.write = write;
  }
}
