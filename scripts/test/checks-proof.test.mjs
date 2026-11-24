// cheap-suite S4, spec 5; L7, A2. The proof a green CI run gives a landing: `provenTree` turns at least three
// `gate (<os>)` rows, all success and all naming one tree, into that tree, and anything short of it into one
// line saying why not. Host and git are fakes; nothing here starts a process.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { provenTree } from '../checks.mjs';

const SHA = '5fef2abeeab467094301df1737d521b3898d1739';
const BASE = '91bb068e1f2a3b4c5d6e7f8091a2b3c4d5e6f708';
const TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const OTHER = 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391';

const row = (os, conclusion = 'success', tree = TREE) => ({ name: `gate (${os})`, conclusion, tree });
const THREE = [row('ubuntu-latest'), row('macos-latest'), row('windows-latest')];

/** A fake host whose `testedTrees` answers `rows` for SHA only. */
const hostOf = (rows) => ({
  testedTrees(sha) {
    assert.equal(sha, SHA, 'the proof is read on the exact tip');
    return rows;
  },
});

/** A fake git whose three-dot diff of BASE...SHA names `files`. */
const gitOf = (files = ['deck/items.mjs']) => (args) => {
  assert.deepEqual(args, ['diff', '--name-only', '--no-renames', '-z', `${BASE}...${SHA}`, '--']);
  return files.map((file) => `${file}\0`).join('');
};

const prove = (host, git = gitOf()) => provenTree({ host, git, sha: SHA, base: BASE });

test('a three-job green run proves its tree', () => {
  assert.deepEqual(prove(hostOf(THREE)), { tree: TREE, line: 'ci proved 4b825dc on 3 jobs' });
});

test('anything short of that proves nothing', () => {
  const none = (host, why, git) => assert.deepEqual(prove(host, git), { tree: null, line: `no ci proof: ${why}` }, why);
  none(null, 'no host');
  none({ testedTrees() { throw Object.assign(new Error('Command failed: gh api'), { stderr: 'HTTP 502: Bad Gateway\n' }); } }, 'HTTP 502: Bad Gateway');
  none(hostOf(THREE.slice(0, 2)), '2 gate jobs, fewer than 3');
  none(hostOf([THREE[0], THREE[0], THREE[1]]), '2 gate jobs, fewer than 3');
  none(hostOf([THREE[0], row('macos-latest', 'failure'), THREE[2]]), 'gate (macos-latest) concluded failure');
  none(hostOf([THREE[0], THREE[1], row('windows-latest', 'success', OTHER)]), 'the gate jobs tested different trees');
  none(hostOf([THREE[0], row('macos-latest', 'success', null), THREE[2]]), 'gate (macos-latest) named no tree');
  none(hostOf([THREE[0], row('macos-latest', 'success', 'HEAD'), THREE[2]]), 'gate (macos-latest) named no tree');
  none(hostOf(THREE), '.github/workflows/gate.yml changed', gitOf(['deck/items.mjs', '.github/workflows/gate.yml']));
  none(hostOf(THREE), 'scripts/gate.mjs changed', gitOf(['scripts/gate.mjs']));
  none(hostOf(THREE), 'package-lock.json changed', gitOf(['package-lock.json']));
  none(hostOf(THREE), 'package.json changed', gitOf(['package.json']));
  none(hostOf(THREE), '.github/dependabot.yml changed', gitOf(['.github/dependabot.yml']));
  none(hostOf(THREE), 'the feature diff is unreadable: fatal: bad revision', () => { throw new Error('fatal: bad revision'); });
});

test('a sha or base that is not a full commit sha is refused before any read', () => {
  const host = { testedTrees: () => assert.fail('no host read') };
  const git = () => assert.fail('no git read');
  assert.throws(() => provenTree({ host, git, sha: '5fef2ab', base: BASE }), /not a full commit sha/);
  assert.throws(() => provenTree({ host, git, sha: SHA, base: '--output=x' }), /not a full commit sha/);
});
