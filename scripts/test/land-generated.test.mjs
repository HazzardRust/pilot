/**
 * A landing never stops on a generated file, and a real conflict names only the real files
 * (clean-landing spec 4; L1-L3). Every case runs against a scratch bare "origin" under
 * os.tmpdir() and clones of it, with `gh` faked; nothing here reaches a real remote. No
 * `.gitattributes` is carried, so the ADR index conflicts as a merge without `merge=union` would.
 */

import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { githubHost } from '../../deck/host-github.mjs';
import { greenChecks } from './lib/land-repos.mjs';
import { seed } from './lib/seed.mjs';

const { main } = await import('../land.mjs');
const { sync } = await import('../sync.mjs');
const { checkIndex, renderIndex } = await import('../adr-index.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const passing = `node -e "console.log('ℹ pass 1'); console.log('ℹ fail 0')"`;
const RUN = 'docs/design/x/run.json';
const INDEX = 'docs/adr/README.md';

function write(repo, file, text) {
  fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  fs.writeFileSync(path.join(repo, file), text);
}

function commit(repo, files, message) {
  for (const [file, text] of Object.entries(files)) write(repo, file, text);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', message);
}

const adrFile = (number) => {
  const front = ['---', 'status: accepted', 'date: 2026-10-11', 'tags: []', 'supersedes: []', 'superseded_by: []', 'paths: []', '---'];
  return { [`docs/adr/${number}-decision-${number}.md`]: [...front, `# Decision ${number}`, '', `We decided ${number}.`, ''].join('\n') };
};

/** ADR `number` and the generated index over every ADR the checkout holds. */
function adr(repo, number) {
  for (const [file, text] of Object.entries(adrFile(number))) write(repo, file, text);
  return { [INDEX]: renderIndex(path.join(repo, 'docs', 'adr')) };
}

/** ADRs `numbers` and their generated index, rendered in a scratch directory under `dir`, since a seeded tree has no checkout. */
function adrs(dir, ...numbers) {
  const scratchDir = fs.mkdtempSync(path.join(dir, 'adr-'));
  try {
    const files = Object.assign({}, ...numbers.map(adrFile));
    for (const [file, text] of Object.entries(files)) write(scratchDir, file, text);
    return { ...files, [INDEX]: renderIndex(path.join(scratchDir, 'docs', 'adr')) };
  } finally {
    fs.rmSync(scratchDir, { recursive: true, force: true });
  }
}

/**
 * Origin with main at a commit holding ADR 0001, its index, a run record and src/a.mjs; feat/b
 * and pilot each grow one commit from it, `feature(dir)` and `pilotSide(dir)` answering
 * `{ files, message }` (no `feature`: feat/b is main). `seed` is a clone on pilot, `b` one on
 * feat/b. `name` keys the shape: one name, one pair of changes.
 */
function scratch(t, name, { feature, pilotSide }) {
  return gitFixture(t, `land-generated:${name}`, (dir) => buildScratch(dir, { feature, pilotSide }));
}

function buildScratch(dir, { feature, pilotSide }) {
  const history = [{ branch: 'main', files: { ...adrs(dir, '0001'), [RUN]: '{"slices":[]}\n', 'src/a.mjs': 'export const a = 1;\n' }, message: 'main' }];
  if (feature) history.push({ branch: 'feat/b', from: 'main', ...feature(dir) });
  history.push({ branch: 'pilot', from: 'main', ...pilotSide(dir) });
  const { origin } = seed(dir, history, feature ? {} : { 'feat/b': 'main' });
  const clone = (name, branch) => {
    const repo = path.join(dir, name);
    git(dir, 'clone', '-q', '-b', branch, origin, repo);
    return repo;
  };
  const pilotClone = clone('seed', 'pilot');
  const b = clone('b', 'feat/b');
  const land = () => mainSays({ cwd: b, git: (args) => git(b, ...args), host: githubHost(greenChecks(() => '[]')), test: passing });
  return { dir, origin, seed: pilotClone, b, land };
}

/** `main`'s stdout and exit code. */
function mainSays(inject) {
  const said = [];
  const write = process.stdout.write;
  process.stdout.write = (text) => said.push(String(text));
  try {
    return { code: main([], inject), out: said.join('') };
  } finally {
    process.stdout.write = write;
  }
}

const keptDir = (out) => out.match(/; the lander resolves in (.+)\n$/)?.[1];

/** `file` as origin's pilot holds it, read from origin itself; git's object, not a checkout's line endings. */
const onPilot = (origin, file) => git(origin, 'show', `pilot:${file}`);

/** Origin's pilot, checked out fresh in `seed`. */
function pilotIn(seed) {
  git(seed, 'fetch', '-q', 'origin');
  git(seed, 'checkout', '-q', '-B', 'pilot', 'origin/pilot');
  return seed;
}

/**
 * feat/b and pilot each edit src/a.mjs differently and each add an ADR whose index row lands
 * last (feat/b 0003, pilot 0002), so the index conflicts too; a later pilot ADR (0004) lands
 * last again, against the resolution's 0003.
 */
const sourceAndIndex = (t) =>
  scratch(t, 'source-and-index', {
    feature: (dir) => ({ files: { ...adrs(dir, '0001', '0003'), 'src/a.mjs': 'export const a = 3;\n' }, message: 'b' }),
    pilotSide: (dir) => ({ files: { ...adrs(dir, '0001', '0002'), 'src/a.mjs': 'export const a = 2;\n' }, message: 'pilot' }),
  });

test('a run.json changed on both sides lands with the feature\'s record', (t) => {
  const { origin, land } = scratch(t, 'run-json', {
    feature: () => ({ files: { [RUN]: '{"slices":["feature"]}\n' }, message: 'b records' }),
    pilotSide: () => ({ files: { [RUN]: '{"slices":["pilot"]}\n' }, message: 'pilot records' }),
  });

  const { code, out } = land();

  assert.equal(code, 0, out);
  assert.match(out, /^landed feat\/b on pilot at /);
  assert.equal(onPilot(origin, RUN), '{"slices":["feature"]}');
});

test('a source conflict beside an index conflict names only the source file', (t) => {
  const { land } = sourceAndIndex(t);

  const { code, out } = land();

  assert.equal(code, 3, out);
  assert.match(out, /^NOT landed: feat\/b conflicts with pilot in src\/a\.mjs; the lander resolves in .+\n$/);
  assert.doesNotMatch(out, /README/);
});

test('a resolver that cannot finish stops on every path and says why', (t) => {
  // A directory named as an ADR: the index cannot be rendered over it.
  const { land } = scratch(t, 'resolver', {
    feature: (dir) => ({ files: { ...adrs(dir, '0001', '0003'), 'docs/adr/0005-a-directory.md/keep.txt': 'x\n' }, message: 'b' }),
    pilotSide: (dir) => ({ files: adrs(dir, '0001', '0002'), message: 'pilot' }),
  });

  const { code, out } = land();

  assert.equal(code, 3, out);
  assert.match(out, /^NOT landed: feat\/b conflicts with pilot in docs\/adr\/README\.md \(generated files not resolved: EISDIR[^\n]*\); regenerate docs\/adr\/README\.md with `node scripts\/adr-index\.mjs`, never by hand; the lander resolves in .+\n$/);
});

test('a kept resolution re-merged after pilot moved resolves the index', (t) => {
  const { origin, seed, land } = sourceAndIndex(t);
  const dir = keptDir(land().out);
  write(dir, 'src/a.mjs', 'export const a = 23;\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '--no-edit');
  commit(seed, adr(seed, '0004'), 'pilot moves with an ADR');
  git(seed, 'push', '-q', 'origin', 'pilot');

  const { code, out } = land();

  assert.equal(code, 0, out);
  assert.match(out, /^landed feat\/b on pilot at /);
  const tip = pilotIn(seed);
  assert.equal(onPilot(origin, 'src/a.mjs'), 'export const a = 23;', 'the resolution is kept');
  assert.deepEqual(checkIndex(path.join(tip, 'docs', 'adr')), { ok: true, problems: [] });
});

test('sync keeps pilot\'s run.json', (t) => {
  const { origin, seed, b } = scratch(t, 'sync', {
    pilotSide: () => ({ files: { [RUN]: '{"slices":["pilot"]}\n' }, message: 'pilot records' }),
  });
  git(seed, 'checkout', '-q', 'main');
  commit(seed, { [RUN]: '{"slices":["main"]}\n' }, 'main holds an older record');
  git(seed, 'push', '-q', 'origin', 'main');

  const { merged } = sync({ cwd: b, git: (args) => git(b, ...args), test: passing });

  assert.equal(merged, true);
  assert.equal(onPilot(origin, RUN), '{"slices":["pilot"]}');
});
