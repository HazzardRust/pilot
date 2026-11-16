// deck-writes-github S8, spec 8: `deck/host.mjs` is the one place a `gh` process starts. A scan of
// `deck/` and `scripts/` (tests excluded) is the bar; the moved callers keep the argv they sent.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { hostIn } from '../../deck/host.mjs';
import { openRuns } from '../../deck/tickets.mjs';
import { ghStub } from '../gh-stub.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOST = path.join(ROOT, 'deck', 'host.mjs');
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

// A file-and-args start (`'gh'`) or a command string (`'gh pr …'`), through any child_process starter.
const GH_START = /\b(?:exec|execSync|execFile|execFileSync|spawn|spawnSync)\(\s*['"`]gh(?:['"`]|\s)/g;

/** A comment line, which names a call without making one. */
const COMMENT = /^\s*(?:\/\/|\/\*|\*)/;

/** `path:line` for every `gh` process start in `files`. */
function ghStarts(files) {
  return files.flatMap((file) => fs.readFileSync(file, 'utf8').split('\n').flatMap((line, at) => {
    GH_START.lastIndex = 0;
    return !COMMENT.test(line) && GH_START.test(line) ? [`${path.relative(ROOT, file)}:${at + 1}`] : [];
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

test('no gh process starts outside the host', () => {
  const files = modules();
  assert.ok(files.includes(HOST), 'the scan reaches deck/host.mjs');
  assert.ok(ghStarts([HOST]).length > 0, 'the host itself starts gh, so the scan is not blind');
  assert.deepEqual(ghStarts(files.filter((file) => file !== HOST)), []);
});

test('no module exports ghIn', () => {
  const exportsGhIn = /export\s+(?:const|let|var|(?:async\s+)?function\*?)\s+ghIn\b|export\s*\{[^}]*\bghIn\b[^}]*\}/;
  assert.deepEqual(modules().filter((file) => exportsGhIn.test(fs.readFileSync(file, 'utf8'))).map((file) => path.relative(ROOT, file)), []);
});

test('the old callers keep their reads', (t) => {
  const records = [
    { branch: 'feat/a', updatedAt: '2026-11-16T09:00:00.000Z' },
    { branch: 'feat/b', updatedAt: '2026-11-16T10:00:00.000Z' },
    { branch: 'feat/c', finished: 'abandoned', updatedAt: '2026-11-16T11:00:00.000Z' },
    { branch: 'main' },
  ];
  const API_USER = ['api', 'user', '--jq', '.login'];
  const PR_LIST = ['pr', 'list', '--state', 'open', '--author', '@me', '--json', 'number,headRefName,state,isCrossRepository,author', '--limit', '100'];

  // The runs, over a fake gh that answers each argv as gh would.
  const seen = [];
  const fake = (args) => {
    seen.push(args);
    if (args[0] === 'api') return 'me\n';
    return JSON.stringify([
      { number: 5, headRefName: 'feat/a', state: 'OPEN', isCrossRepository: false, author: { login: 'me' } },
      { number: 6, headRefName: 'feat/b', state: 'OPEN', isCrossRepository: false, author: { login: 'someone' } },
    ]);
  };
  assert.deepEqual(openRuns(records, { gh: fake }), [{ branch: 'feat/a', pr: 5, updatedAt: '2026-11-16T09:00:00.000Z' }]);
  assert.deepEqual(seen, [API_USER, PR_LIST]);

  // The same two argv pass the host's verb check and reach a gh process unchanged.
  const stub = stubbed(t, '[]');
  assert.deepEqual(openRuns(records, { gh: hostIn(stub.dir) }), []);
  assert.deepEqual(stub.calls(), [API_USER, PR_LIST]);
});

test("the release PR's label create is a host verb", (t) => {
  const stub = stubbed(t);
  const gh = hostIn(stub.dir);
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
  const gh = hostIn(stub.dir);
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
