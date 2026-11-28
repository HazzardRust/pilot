/**
 * The scratch repositories, fake `gh` and stdout capture that `land.test.mjs` and
 * `land-main-pr.test.mjs` share: one file split in two so neither is the gate's long pole
 * (git-light-tests S8). Every repository is built through `gitFixture`, imported first.
 */

import { gitFixture } from './git-fixture.mjs';

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { githubHost } from '../../../deck/host-github.mjs';
import { seed as seedHistory } from './seed.mjs';

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

/**
 * Rewrites the refs, reflogs and branch config a one-git `git clone` of the seeded origin wrote in `repo` (`origin`
 * when bare) to what the porcelain build left there (test-body-git S10): `loose` maps a ref to a SHA or
 * a `ref: …` symref (every ref is written loose, whatever the porcelain build packed), `logs` a ref (or HEAD) to its `[from, to, message]` entries, `branches` the config's
 * `[branch]` sections to their merge ref. Each entry is stamped `stamp`, an identity and time.
 */
function setRefs(repo, stamp, { bare = false, loose, logs, branches = {} }) {
  const gitDir = bare ? repo : path.join(repo, '.git');
  const at = (...parts) => path.join(gitDir, ...parts);
  for (const old of ['refs/heads', 'refs/remotes', 'logs', 'packed-refs']) fs.rmSync(at(old), { recursive: true, force: true });
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  };
  for (const [ref, value] of Object.entries(loose)) write(at(ref), `${value}\n`);
  for (const [ref, entries] of Object.entries(logs)) write(at('logs', ref), entries.map(([from, to, message]) => `${from} ${to} ${stamp}\t${message}\n`).join(''));
  if (bare) return;
  const config = fs.readFileSync(at('config'), 'utf8');
  const cut = config.indexOf('[branch ');
  if (cut < 0) throw new Error(`setRefs: no [branch] section in ${at('config')}`);
  write(at('config'), config.slice(0, cut) + Object.entries(branches).map(([branch, merge]) => `[branch "${branch}"]\n\tremote = origin\n\tmerge = ${merge}\n`).join(''));
}

const NONE = '0'.repeat(40);

/** The identity and time a fresh clone's first reflog entry carries. */
const stampOf = (work) => fs.readFileSync(path.join(work, '.git', 'logs', 'HEAD'), 'utf8').match(/^\S+ \S+ (.*? \d+ [+-]\d{4})\t/)[1];

export function buildRepos(dir, names) {
  const seed = path.join(dir, 'seed');
  // Origin's main, pilot and each feat/<name> in one fast-import: the history is known up front (test-body-git S10).
  const { origin, sha } = seedHistory(dir, [
    { branch: 'main', files: { 'shared.txt': 'one\n' }, message: 'main' },
    ...names.map((name) => ({ branch: `feat/${name}`, from: 'main', files: { [`${name}.txt`]: `${name}\n` }, message: `feat ${name}` })),
  ], { pilot: 'main' });
  // The line `git config core.logAllRefUpdates always` adds to the [core] that ends a new bare config (land-batching S6).
  fs.appendFileSync(path.join(origin, 'config'), '\tlogAllRefUpdates = always\n');
  // Each repository is one clone (origin none), its refs and reflogs then set to what the porcelain build's commits and pushes left.
  git(dir, 'clone', '-q', origin, seed);
  const stamp = stampOf(seed);
  const pushed = (at) => [[NONE, at, 'push']];
  setRefs(origin, stamp, {
    bare: true,
    loose: Object.fromEntries(Object.entries(sha).map(([branch, at]) => [`refs/heads/${branch}`, at])),
    logs: { HEAD: pushed(sha.main), ...Object.fromEntries(Object.entries(sha).map(([branch, at]) => [`refs/heads/${branch}`, pushed(at)])) },
  });
  setRefs(seed, stamp, {
    loose: { 'refs/heads/main': sha.main, 'refs/remotes/origin/main': sha.main, 'refs/remotes/origin/pilot': sha.main },
    logs: {
      HEAD: [[NONE, sha.main, 'commit (initial): main']],
      'refs/heads/main': [[NONE, sha.main, 'commit (initial): main']],
      'refs/remotes/origin/main': [[NONE, sha.main, 'update by push']],
      'refs/remotes/origin/pilot': [[NONE, sha.main, 'update by push']],
    },
    branches: { main: 'refs/heads/main' },
  });
  const seeded = (name, earlier) => {
    const work = path.join(dir, name);
    const feat = `feat/${name}`;
    git(dir, 'clone', '-q', '-b', feat, origin, work);
    const cloned = `clone: from ${origin}`;
    setRefs(work, stampOf(work), {
      loose: {
        'refs/heads/main': sha.main,
        [`refs/heads/${feat}`]: sha[feat],
        'refs/remotes/origin/HEAD': 'ref: refs/remotes/origin/main',
        [`refs/remotes/origin/${feat}`]: sha[feat],
        'refs/remotes/origin/main': sha.main,
        'refs/remotes/origin/pilot': sha.main,
        ...Object.fromEntries(earlier.map((other) => [`refs/remotes/origin/feat/${other}`, sha[`feat/${other}`]])),
      },
      logs: {
        HEAD: [[NONE, sha.main, cloned], [sha.main, sha.main, `checkout: moving from main to ${feat}`], [sha.main, sha[feat], `commit: feat ${name}`]],
        [`refs/heads/${feat}`]: [[NONE, sha.main, 'branch: Created from origin/pilot'], [sha.main, sha[feat], `commit: feat ${name}`]],
        'refs/heads/main': [[NONE, sha.main, cloned]],
        [`refs/remotes/origin/${feat}`]: [[NONE, sha[feat], 'update by push']],
        'refs/remotes/origin/HEAD': [[NONE, sha.main, cloned]],
      },
      branches: { main: 'refs/heads/main', [feat]: 'refs/heads/pilot' },
    });
    return work;
  };
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
  const cloned = Object.fromEntries(names.map((name, i) => [name, seeded(name, names.slice(0, i))]));
  return { origin, seed, clone, mover, gitIn: (repo) => (args) => git(repo, ...args), ...cloned };
}

/** One check run that passed, the shape `gh api …/check-runs` lists: the default every land test lands on. */
export const GREEN_RUN = { name: 'gate (ubuntu-latest)', status: 'completed', conclusion: 'success', html_url: 'https://github.com/o/r/actions/runs/1/job/1' };

/** A test's own `gh` with the check-runs GET answered green first, so a landing's checks read passes (ci-gate S3). */
export const greenChecks = (gh) => (args) =>
  args[0] === 'api' && /\/check-runs\?/.test(args[1]) ? JSON.stringify({ total_count: 1, check_runs: [GREEN_RUN] }) : gh(args);

export const passing = `node -e "console.log('ℹ pass 3'); console.log('ℹ fail 0')"`;

/**
 * A fake `gh` that records its argv, answers `pr list --head <h>` with the `prs` whose
 * head is `h`, else `pr list --base <b>` with those whose base is `b` (`--state` keeps that state's),
 * `pr comment` with `comment()`, `pr edit` and `label create` with '', and `pr create`
 * with PR `created`'s URL, and `pr view <n> --json state` with the next of `views` (the last
 * repeats), else the PR's listed state. A PR's state defaults to MERGED, as GitHub
 * reads a feature PR once pilot holds its head (one-integration-line A5); its base to main.
 * `pr close` is not stubbed: the landing never closes a PR (pilot-develop-line A1). Each
 * `--body-file <f>` is recorded, and passed on, as `--body <text>`, read at the call since the
 * adapter removes the file after. `host` is `githubHost` over this `gh`, as `land` takes it.
 * `api …/check-runs` answers `checks`, check-run JSON as GitHub gives it, one success run by default (ci-gate S3).
 */
export function fakeGh(prs = [], comment = () => '', { created = 900, views = [], checks = [GREEN_RUN] } = {}) {
  const calls = [];
  let viewed = 0;
  const gh = (given) => {
    const at = given.indexOf('--body-file');
    const args = at < 0 ? given : [...given.slice(0, at), '--body', fs.readFileSync(given[at + 1], 'utf8'), ...given.slice(at + 2)];
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
    if (args[0] === 'pr' && args[1] === 'view') {
      const state = views.length ? views[Math.min(viewed++, views.length - 1)] : prs.find((pr) => String(pr.number) === args[2])?.state ?? 'MERGED';
      return JSON.stringify({ state });
    }
    if (args[0] === 'pr' && args[1] === 'edit') return '';
    if (args[0] === 'label' && args[1] === 'create') return '';
    if (args[0] === 'pr' && args[1] === 'create') return `https://github.com/o/r/pull/${created}\n`;
    if (args[0] === 'api' && /\/check-runs\?/.test(args[1])) return JSON.stringify({ total_count: checks.length, check_runs: checks });
    throw new Error(`unexpected gh ${args.join(' ')}`);
  };
  return { gh, calls, host: githubHost(gh) };
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
