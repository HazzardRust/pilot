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

/** ADR `number` and the generated index over every ADR the checkout holds. */
function adr(repo, number) {
  const front = ['---', 'status: accepted', 'date: 2026-10-11', 'tags: []', 'supersedes: []', 'superseded_by: []', 'paths: []', '---'];
  write(repo, `docs/adr/${number}-decision-${number}.md`, [...front, `# Decision ${number}`, '', `We decided ${number}.`, ''].join('\n'));
  return { [INDEX]: renderIndex(path.join(repo, 'docs', 'adr')) };
}

/**
 * Origin with main and pilot at a commit holding ADR 0001, its index, a run record and
 * src/a.mjs; `b` is a clone on feat/b from pilot. `feature` and `pilotSide` each commit their
 * own change (`(repo) => void`), the feature's pushed to feat/b, pilot's to pilot. `name`
 * keys the shape: one name, one pair of changes.
 */
function scratch(t, name, { feature, pilotSide }) {
  return gitFixture(t, `land-generated:${name}`, (dir) => buildScratch(dir, { feature, pilotSide }));
}

function buildScratch(dir, { feature, pilotSide }) {
  const origin = path.join(dir, 'origin.git');
  git(dir, 'init', '--bare', '-b', 'main', origin);
  const clone = (name) => {
    const repo = path.join(dir, name);
    git(dir, 'clone', '-q', origin, repo);
    return repo;
  };
  const seed = clone('seed');
  git(seed, 'checkout', '-q', '-b', 'main');
  commit(seed, { ...adr(seed, '0001'), [RUN]: '{"slices":[]}\n', 'src/a.mjs': 'export const a = 1;\n' }, 'main');
  git(seed, 'push', '-q', 'origin', 'main', 'main:pilot');
  const b = clone('b');
  git(b, 'checkout', '-q', '-b', 'feat/b', 'origin/pilot');
  feature(b);
  git(b, 'push', '-q', 'origin', 'feat/b');
  git(seed, 'checkout', '-q', '-B', 'pilot', 'origin/pilot');
  pilotSide(seed);
  git(seed, 'push', '-q', 'origin', 'pilot');
  const land = () => mainSays({ cwd: b, git: (args) => git(b, ...args), gh: () => '[]', test: passing });
  return { dir, origin, seed, b, land };
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

/** `file` as origin's pilot holds it, fetched into `seed`; git's object, not a checkout's line endings. */
const onPilot = (seed, file) => (git(seed, 'fetch', '-q', 'origin'), git(seed, 'show', `origin/pilot:${file}`));

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
    feature: (b) => commit(b, { ...adr(b, '0003'), 'src/a.mjs': 'export const a = 3;\n' }, 'b'),
    pilotSide: (seed) => commit(seed, { ...adr(seed, '0002'), 'src/a.mjs': 'export const a = 2;\n' }, 'pilot'),
  });

test('a run.json changed on both sides lands with the feature\'s record', (t) => {
  const { seed, land } = scratch(t, 'run-json', {
    feature: (b) => commit(b, { [RUN]: '{"slices":["feature"]}\n' }, 'b records'),
    pilotSide: (seed) => commit(seed, { [RUN]: '{"slices":["pilot"]}\n' }, 'pilot records'),
  });

  const { code, out } = land();

  assert.equal(code, 0, out);
  assert.match(out, /^landed feat\/b on pilot at /);
  assert.equal(onPilot(seed, RUN), '{"slices":["feature"]}');
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
    feature: (b) => commit(b, { ...adr(b, '0003'), 'docs/adr/0005-a-directory.md/keep.txt': 'x\n' }, 'b'),
    pilotSide: (seed) => commit(seed, adr(seed, '0002'), 'pilot'),
  });

  const { code, out } = land();

  assert.equal(code, 3, out);
  assert.match(out, /^NOT landed: feat\/b conflicts with pilot in docs\/adr\/README\.md \(generated files not resolved: EISDIR[^\n]*\); regenerate docs\/adr\/README\.md with `node scripts\/adr-index\.mjs`, never by hand; the lander resolves in .+\n$/);
});

test('a kept resolution re-merged after pilot moved resolves the index', (t) => {
  const { seed, land } = sourceAndIndex(t);
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
  assert.equal(onPilot(seed, 'src/a.mjs'), 'export const a = 23;', 'the resolution is kept');
  assert.deepEqual(checkIndex(path.join(tip, 'docs', 'adr')), { ok: true, problems: [] });
});

test('sync keeps pilot\'s run.json', (t) => {
  const { seed, b } = scratch(t, 'sync', {
    feature: () => {},
    pilotSide: (seed) => commit(seed, { [RUN]: '{"slices":["pilot"]}\n' }, 'pilot records'),
  });
  git(seed, 'checkout', '-q', 'main');
  commit(seed, { [RUN]: '{"slices":["main"]}\n' }, 'main holds an older record');
  git(seed, 'push', '-q', 'origin', 'main');

  const { merged } = sync({ cwd: b, git: (args) => git(b, ...args), test: passing });

  assert.equal(merged, true);
  assert.equal(onPilot(seed, RUN), '{"slices":["pilot"]}');
});
