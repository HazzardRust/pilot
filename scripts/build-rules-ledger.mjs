#!/usr/bin/env node
/**
 * Writes `scripts/shipped-rules.json`: for every path this package ever shipped under
 * `rules/`, the sha256 of every version of it (ADR 0055).
 *
 * The rules install reads it to tell a stale shipped copy, which it replaces, from a
 * file someone edited, which it leaves alone; and a file the package stopped shipping,
 * which it deletes, from one a person wrote there themselves, which it never touches.
 * It is generated rather than kept by hand because a hash typed wrong
 * fails safe in the worst way: the stale copy is never updated, and nobody notices.
 * `--check` turns that into a failing test.
 *
 * Every commit that touched `rules/` contributes its whole `rules/` tree, and the working
 * tree contributes the files as they stand, so a rules edit and its ledger entry land in
 * the same commit. The ledger is append-only (ADR 0174): every committed version of it
 * contributes its entries too, so a history that has lost versions, as after the fresh-repo
 * move, never drops a hash or a path. The working-tree ledger is never read as input, so a
 * hand edit to it fails `--check`. `.gitattributes` pins `eol=lf`, so the bytes hashed are
 * the bytes a checkout holds and the install copies.
 *
 * Usage:
 *   node build-rules-ledger.mjs            write scripts/shipped-rules.json
 *   node build-rules-ledger.mjs --check    exit 1 if it is not what this produces
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Where the install looks for the ledger, beside itself. */
export const RULES_LEDGER_FILE = 'scripts/shipped-rules.json';
export const RULES_LEDGER = path.join(ROOT, RULES_LEDGER_FILE);

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const git = (root, args, input) =>
  execFileSync('git', ['-C', root, ...args], { input, maxBuffer: 1 << 28, windowsHide: true });

/** Every file under `dir`, as paths relative to it, in a stable order. Links are not followed. */
export function filesUnder(dir, prefix = '') {
  return fs.readdirSync(path.join(dir, prefix), { withFileTypes: true }).flatMap((entry) => {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? filesUnder(dir, rel) : entry.isFile() ? [rel] : [];
  }).sort();
}

/** The bytes of each blob, read in one `git cat-file --batch` rather than a process each. */
function blobBytes(root, shas) {
  const out = git(root, ['cat-file', '--batch'], shas.join('\n') + '\n');
  const bytes = new Map();
  let at = 0;
  for (const sha of shas) {
    const eol = out.indexOf(0x0a, at);
    const [name, type, size] = out.subarray(at, eol).toString('utf8').split(' ');
    if (name !== sha || type !== 'blob') throw new Error(`git cat-file: expected blob ${sha}, got ${name} ${type}`);
    bytes.set(sha, out.subarray(eol + 1, eol + 1 + Number(size)));
    at = eol + 1 + Number(size) + 1;
  }
  return bytes;
}

/** The ledger as the history and working tree of the checkout at `root` say it should be. */
function buildRulesLedger(root) {
  // A shallow clone has lost the versions a machine may still hold, and a ledger built
  // from it would quietly stop recognising them.
  if (git(root, ['rev-parse', '--is-shallow-repository']).toString().trim() === 'true') {
    throw new Error('This clone is shallow; the ledger needs every commit that touched rules/.');
  }
  const blobsByPath = new Map();
  // Inside `git merge --no-commit` the incoming side's commits are reachable only from MERGE_HEAD.
  let mergeHead = [];
  try { git(root, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']); mergeHead = ['MERGE_HEAD']; } catch { /* no merge in progress */ }
  const commitsTouching = (where) =>
    git(root, ['log', '--full-history', '--format=%H', 'HEAD', ...mergeHead, '--', where]).toString().split('\n').filter(Boolean);
  for (const commit of commitsTouching('rules/')) {
    for (const entry of git(root, ['ls-tree', '-r', '-z', commit, '--', 'rules/']).toString('utf8').split('\0')) {
      const match = /^\d+ blob ([0-9a-f]+)\trules\/(.+)$/.exec(entry);
      if (!match) continue;
      if (!blobsByPath.has(match[2])) blobsByPath.set(match[2], new Set());
      blobsByPath.get(match[2]).add(match[1]);
    }
  }
  // Every committed version of the ledger itself (ADR 0174): what history no longer holds stays recorded.
  const ledgerBlobs = new Set();
  for (const commit of commitsTouching(RULES_LEDGER_FILE)) {
    const match = /^\d+ blob ([0-9a-f]+)\t/.exec(git(root, ['ls-tree', '-z', commit, '--', RULES_LEDGER_FILE]).toString('utf8'));
    if (match) ledgerBlobs.add(match[1]);
  }
  const bytes = blobBytes(root, [...new Set([...blobsByPath.values(), ledgerBlobs].flatMap((set) => [...set]))]);
  const hashes = new Map([...blobsByPath].map(([rel, shas]) => [rel, new Set([...shas].map((s) => sha256(bytes.get(s))))]));
  const add = (rel, hash) => {
    if (!hashes.has(rel)) hashes.set(rel, new Set());
    hashes.get(rel).add(hash);
  };
  // A malformed version would be carried forever, so it is an error naming the blob, never skipped.
  for (const blob of ledgerBlobs) {
    let recorded;
    try { recorded = JSON.parse(bytes.get(blob).toString('utf8')); } catch (err) { recorded = err; }
    const wellFormed = recorded?.constructor === Object && Object.values(recorded)
      .every((list) => Array.isArray(list) && list.every((hash) => /^[0-9a-f]{64}$/.test(hash)));
    if (!wellFormed) throw new Error(`${RULES_LEDGER_FILE} at blob ${blob} is malformed; it must map each path to sha256 hashes.`);
    for (const [rel, list] of Object.entries(recorded)) for (const hash of list) add(rel, hash);
  }
  const rules = path.join(root, 'rules');
  for (const rel of filesUnder(rules)) add(rel, sha256(fs.readFileSync(path.join(rules, rel))));
  const ledger = {};
  for (const rel of [...hashes.keys()].sort()) ledger[rel] = [...hashes.get(rel)].sort();
  return ledger;
}

// One line per path, so a rules change shows in a diff as the one line it changes.
const render = (ledger) =>
  `{\n${Object.entries(ledger)
    .map(([rel, hashes]) => `  ${JSON.stringify(rel)}: ${JSON.stringify(hashes)}`)
    .join(',\n')}\n}\n`;

/** The rendered `scripts/shipped-rules.json` for the checkout at `root`; throws on a shallow clone. */
export const rulesLedgerText = (root) => render(buildRulesLedger(root));

function main(argv) {
  const unknown = argv.filter((arg) => arg !== '--check');
  if (unknown.length) {
    console.error(`Unknown argument ${unknown[0]}.\nUsage: node build-rules-ledger.mjs [--check]`);
    process.exitCode = 2;
    return;
  }
  try {
    const want = rulesLedgerText(ROOT);
    if (!argv.includes('--check')) {
      fs.writeFileSync(RULES_LEDGER, want);
      console.log(`Wrote ${path.relative(ROOT, RULES_LEDGER)}.`);
      return;
    }
    const have = fs.existsSync(RULES_LEDGER) ? fs.readFileSync(RULES_LEDGER, 'utf8') : '';
    if (have === want) {
      console.log(`${path.relative(ROOT, RULES_LEDGER)} is current.`);
    } else {
      console.error(`${path.relative(ROOT, RULES_LEDGER)} is stale; run node scripts/build-rules-ledger.mjs.`);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2));
}
