#!/usr/bin/env node
/**
 * Writes `scripts/shipped-rules.json`: for every path this package ever shipped under
 * `rules/`, the sha256 of every version of it (ADR 0055).
 *
 * The rules install reads it to tell a stale shipped copy, which it replaces, from a
 * file someone edited, which it leaves alone; and a file the package stopped shipping,
 * which it deletes, from one a person wrote there themselves, which it never touches.
 * It is generated from git history rather than kept by hand because a hash typed wrong
 * fails safe in the worst way: the stale copy is never updated, and nobody notices.
 * `--check` turns that into a failing test.
 *
 * Every commit that touched `rules/` contributes its whole `rules/` tree, and the working
 * tree contributes the files as they stand, so a rules edit and its ledger entry land in
 * the same commit. The ledger already committed is a third input, because history can lose
 * versions (the public origin is one squashed commit): a rebuild never drops a hash once
 * shipped, and removing one on purpose is a hand edit of the file. `.gitattributes` pins `eol=lf`, so the bytes hashed are the bytes a
 * checkout holds and the install copies.
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

/**
 * The ledger already at `root`, `{}` when there is none. History can lose versions a machine
 * still holds (the public origin began as one squashed commit), so every hash the ledger
 * once carried is kept; a ledger that is not a map of hash lists throws rather than being dropped.
 */
function committedLedger(root) {
  const file = path.join(root, RULES_LEDGER_FILE);
  if (!fs.existsSync(file)) return {};
  let ledger;
  try { ledger = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) { throw new Error(`${RULES_LEDGER_FILE}: ${err.message}`); }
  const valid = ledger && typeof ledger === 'object' && !Array.isArray(ledger)
    && Object.values(ledger).every((hashes) => Array.isArray(hashes) && hashes.every((h) => /^[0-9a-f]{64}$/.test(h)));
  if (!valid) throw new Error(`${RULES_LEDGER_FILE} is not a map of sha256 lists; restore it from git.`);
  return ledger;
}

/** The ledger as the history, working tree and committed ledger of the checkout at `root` say it should be. */
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
  const commits = git(root, ['log', '--full-history', '--format=%H', 'HEAD', ...mergeHead, '--', 'rules/']).toString().split('\n').filter(Boolean);
  for (const commit of commits) {
    for (const entry of git(root, ['ls-tree', '-r', '-z', commit, '--', 'rules/']).toString('utf8').split('\0')) {
      const match = /^\d+ blob ([0-9a-f]+)\trules\/(.+)$/.exec(entry);
      if (!match) continue;
      if (!blobsByPath.has(match[2])) blobsByPath.set(match[2], new Set());
      blobsByPath.get(match[2]).add(match[1]);
    }
  }
  const bytes = blobBytes(root, [...new Set([...blobsByPath.values()].flatMap((set) => [...set]))]);
  const hashes = new Map([...blobsByPath].map(([rel, shas]) => [rel, new Set([...shas].map((s) => sha256(bytes.get(s))))]));
  const add = (rel, hash) => {
    if (!hashes.has(rel)) hashes.set(rel, new Set());
    hashes.get(rel).add(hash);
  };
  const rules = path.join(root, 'rules');
  for (const rel of filesUnder(rules)) add(rel, sha256(fs.readFileSync(path.join(rules, rel))));
  for (const [rel, kept] of Object.entries(committedLedger(root))) for (const hash of kept) add(rel, hash);
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
