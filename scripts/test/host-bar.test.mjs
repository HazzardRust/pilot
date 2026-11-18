// other-host S6, spec 2: the two adapters are the only places a host CLI starts, `gh` in
// `deck/host-github.mjs` and `glab` in `deck/host-gitlab.mjs`. A scan of `deck/` and `scripts/` (tests
// excluded) is the bar; every caller reaches an adapter through `hostFor`, and no module exports `hostIn`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ghRun, githubHost } from '../../deck/host-github.mjs';
import { openRuns } from '../../deck/tickets.mjs';
import { ghStub } from '../gh-stub.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ADAPTERS = [path.join(ROOT, 'deck', 'host-github.mjs'), path.join(ROOT, 'deck', 'host-gitlab.mjs')];
const SKIP_DIRS = new Set(['test', 'node_modules']);

/** Every non-test module under `deck/` and `scripts/`. */
function modules() {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full);
      } else if (/\.(mjs|cjs|js)$/.test(entry.name) && !/\.test\.(mjs|cjs|js)$/.test(entry.name)) {
        found.push(full);
      }
    }
  };
  walk(path.join(ROOT, 'deck'));
  walk(path.join(ROOT, 'scripts'));
  return found;
}

// A file-and-args start (`'gh'`, `'glab'`) or a command string (`'gh pr …'`), through any child_process starter.
const HOST_START = /\b(?:exec|execSync|execFile|execFileSync|spawn|spawnSync)\(\s*['"`](?:gh|glab)(?:['"`]|\s)/g;

/** A comment line, which names a call without making one. */
const COMMENT = /^\s*(?:\/\/|\/\*|\*)/;

/** `path:line` for every `gh` or `glab` process start in `files`. */
function hostStarts(files) {
  return files.flatMap((file) => fs.readFileSync(file, 'utf8').split('\n').flatMap((line, at) => {
    HOST_START.lastIndex = 0;
    return !COMMENT.test(line) && HOST_START.test(line) ? [`${path.relative(ROOT, file)}:${at + 1}`] : [];
  }));
}

/** Put a fresh `gh` stub first on PATH for this test; answers its dir and the argv it has seen. */
function stubbed(t, reply) {
  const stub = ghStub();
  if (reply !== undefined) fs.writeFileSync(path.join(stub.dir, 'reply.txt'), reply);
  const saved = { PATH: process.env.PATH, NODE_OPTIONS: process.env.NODE_OPTIONS };
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(stub.dir, { recursive: true, force: true });
  });
  Object.assign(process.env, stub.env);
  const calls = () => {
    const file = path.join(stub.dir, 'calls.jsonl');
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)) : [];
  };
  return { dir: stub.dir, calls };
}

test('no host CLI starts outside the adapters', () => {
  const files = modules();
  for (const adapter of ADAPTERS) {
    assert.ok(files.includes(adapter), `the scan reaches ${path.relative(ROOT, adapter)}`);
    assert.ok(hostStarts([adapter]).length > 0, `${path.relative(ROOT, adapter)} starts its CLI, so the scan is not blind`);
  }
  assert.deepEqual(hostStarts(files.filter((file) => !ADAPTERS.includes(file))), []);
});

test('no module exports hostIn', () => {
  // A declared export, an export list naming it (`{ hostIn }`, `{ ghRun as hostIn }`), or a re-export from elsewhere.
  const exportsHostIn = /export\s+(?:const|let|var|(?:async\s+)?function\*?)\s+hostIn\b|export\s*\{[^}]*\bhostIn\b[^}]*\}/;
  assert.deepEqual(modules().filter((file) => exportsHostIn.test(fs.readFileSync(file, 'utf8'))).map((file) => path.relative(ROOT, file)), []);
});

test('the old callers keep their reads', (t) => {
  const records = [
    { branch: 'feat/a', updatedAt: '2026-11-16T09:00:00.000Z' },
    { branch: 'feat/b', updatedAt: '2026-11-16T10:00:00.000Z' },
    { branch: 'feat/c', finished: 'abandoned', updatedAt: '2026-11-16T11:00:00.000Z' },
    { branch: 'main' },
  ];
  // A2: the one field set every review read asks; `--author @me` is gh's own signed-in account.
  const PR_LIST = ['pr', 'list', '--state', 'open', '--author', '@me', '--json', 'number,state,baseRefName,headRefName,headRefOid,title,body,url,isCrossRepository', '--limit', '100'];

  // The runs, over a fake gh that answers each argv as gh would.
  const seen = [];
  const fake = (args) => {
    seen.push(args);
    return JSON.stringify([
      { number: 5, headRefName: 'feat/a', state: 'OPEN', isCrossRepository: false },
      { number: 6, headRefName: 'feat/b', state: 'OPEN', isCrossRepository: true },
    ]);
  };
  assert.deepEqual(openRuns(records, { host: githubHost(fake) }), [{ branch: 'feat/a', pr: 5, updatedAt: '2026-11-16T09:00:00.000Z' }]);
  assert.deepEqual(seen, [PR_LIST]);

  // The same argv passes the host's verb check and reaches a gh process unchanged.
  const stub = stubbed(t, '[]');
  assert.deepEqual(openRuns(records, { host: githubHost(ghRun(stub.dir)) }), []);
  assert.deepEqual(stub.calls(), [PR_LIST]);
});

test("the release PR's label create is a host verb", (t) => {
  const stub = stubbed(t);
  const gh = ghRun(stub.dir);
  assert.throws(() => gh(['label', 'delete', 'pilot-release']), /gh label delete: not a host verb/);
  assert.throws(() => gh(['label', 'create']), /not a host verb/, 'a label create with no name is refused');
  assert.throws(() => gh(['label', 'create', '--force']), /not a host verb/, 'a flag is never the name');
  assert.deepEqual(stub.calls(), [], 'no process started for a refused verb');
  gh(['label', 'create', 'pilot-release', '--force']);
  assert.deepEqual(stub.calls(), [['label', 'create', 'pilot-release', '--force']]);
});

/** Asserts every pr verb refuses each of `flags`, before any process starts. */
function refusesOnEveryPrVerb(t, flags) {
  const stub = stubbed(t);
  const gh = ghRun(stub.dir);
  for (const verb of ['create', 'edit', 'comment', 'view', 'list']) {
    for (const flag of flags) assert.throws(() => gh(['pr', verb, '7', ...flag]), /not a host verb/, `pr ${verb} ${flag.join(' ')}`);
  }
  assert.deepEqual(stub.calls(), [], 'no process started');
}

test('a pr verb never names another repository', (t) => {
  refusesOnEveryPrVerb(t, [['-R', 'o/r'], ['-Ro/r'], ['--repo', 'o/r'], ['--repo=o/r'], ['-dRo/r']]);
});

test('a pr verb never opens a browser', (t) => {
  refusesOnEveryPrVerb(t, [['--web'], ['--web=true'], ['-w'], ['-w=true'], ['-wR']]);
});

test('a pr verb never opens an editor', (t) => {
  refusesOnEveryPrVerb(t, [['--editor'], ['--editor=true'], ['-e'], ['-e=1'], ['-we'], ['-ew']]);
});
