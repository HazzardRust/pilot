#!/usr/bin/env node
/**
 * Every file copied from an upstream project carries a provenance header, and every
 * header has a row in a vendoring ledger under `vendor/`. This checks both directions,
 * because either half alone erodes: a header nobody lists stops being re-syncable, and a
 * row whose header was deleted leaves a file with no trace of where it came from. ADR
 * 0011 makes that header the only in-tree trace of origin, so this script is what keeps
 * the credit from rotting.
 *
 * Usage: node scripts/check-provenance.mjs <dir> [<dir> ...]
 *   e.g. node scripts/check-provenance.mjs skills/
 *        node scripts/check-provenance.mjs agents/ skills/ rules/
 *
 * The header, documented for humans at the top of `vendor/methodology.md`:
 *
 *   <!-- provenance
 *   upstream: <project> <version> - <path inside that project>
 *   copyright: Copyright (c) <year> <holder>
 *   licence: <licence> - see THIRD-PARTY-NOTICES.md
 *   adapted: verbatim | <what changed and why>
 *   ledger: vendor/<fragment>.md
 *   -->
 *
 * A file with no header is this project's own work and passes: `agents/pilot.md` was
 * written here, not copied, and demanding a header of it would be a lie.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const HEADER_KEYS = ['upstream', 'copyright', 'licence', 'adapted', 'ledger'];

/** L13: no upstream brand in a path a friend types or reads. */
const BRANDS = /(^|[^a-z])(ecc|pocock|mattpocock)([^a-z]|$)/i;

/**
 * What a provenance header looks like, exported because three scripts have to agree
 * on it: this one decides whether a file is vendored, `check-upstream.mjs` strips the
 * header before comparing against upstream, and both answers have to be the same
 * answer. They were not — a second copy of this pattern rejected a trailing space on
 * the opening line that this one accepts, so a header it could not find was six lines
 * of drift in a file that had not moved.
 */
export const HEADER_BLOCK = /<!--\s*provenance\s*\n([\s\S]*?)-->/;
const SKIPPED_DIRS = new Set(['node_modules', '.git']);

/** Where the ledger fragments live (L13: `vendor/methodology.md`, `vendor/toolbox.md`). */
export const LEDGER_DIR = 'vendor';

/** The heading a ledger's rows live under; everything above it is documentation. */
export const LEDGER_HEADING = /^##\s+Vendored files\s*$/;

const posix = (value) => value.split(path.sep).join('/');

function walk(root, dir, found = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) walk(root, rel, found);
    } else if (entry.isFile()) {
      found.push(rel);
    }
  }
  return found;
}

/** The header's fields, or null when the file carries no header at all. */
export function parseHeader(source) {
  const block = HEADER_BLOCK.exec(source);
  if (!block) return null;

  const fields = {};
  for (const line of block[1].split('\n')) {
    const field = /^\s*([a-z]+)\s*:\s*(.*?)\s*$/.exec(line);
    if (field && field[2]) fields[field[1]] = field[2];
  }
  return fields;
}

/**
 * Ledger rows, keyed by the file they describe. The format is one markdown table with
 * `File | Upstream | Adapted | What changed and why`; slice 8's `vendor/toolbox.md`
 * reuses it unchanged, which is why the parser lives here and not in either ledger.
 *
 * Only the table under `## Vendored files` counts. A ledger also documents the format in
 * prose, and those tables are not rows: anchoring to the heading is what stops the
 * documentation from being read as a list of files that do not exist.
 */
export function parseLedger(source) {
  const rows = new Map();
  let inFiles = false;
  for (const line of source.split('\n')) {
    if (line.startsWith('## ')) inFiles = LEDGER_HEADING.test(line);
    if (!inFiles) continue;

    const cells = line.trim();
    if (!cells.startsWith('|')) continue;
    const [file, upstream] = cells
      .slice(1, cells.endsWith('|') ? -1 : undefined)
      .split('|')
      .map((cell) => cell.trim().replace(/^`|`$/g, ''));
    if (!file || file === 'File' || /^-+$/.test(file)) continue;
    rows.set(file, { upstream });
  }
  return rows;
}

/** The upstream file path alone, without the project and version that precede it. */
const upstreamPath = (upstream) => upstream.split(' - ').at(-1).trim();

function readLedger(root, rel, cache) {
  if (!cache.has(rel)) {
    const full = path.join(root, rel);
    cache.set(rel, fs.existsSync(full) ? parseLedger(fs.readFileSync(full, 'utf8')) : null);
  }
  return cache.get(rel);
}

/**
 * @param {string} root repository root
 * @param {string[]} dirs directories to scan, relative to the root
 * @returns {{ok: boolean, failures: string[], vendored: string[], own: string[]}}
 */
export function checkProvenance(root, dirs) {
  const failures = [];
  const vendored = [];
  const own = [];
  const ledgers = new Map();

  for (const dir of dirs) {
    const clean = posix(dir).replace(/\/+$/, '');
    if (!fs.existsSync(path.join(root, clean))) {
      failures.push(`${clean}: no such directory to check`);
      continue;
    }

    for (const rel of walk(root, clean)) {
      const header = parseHeader(fs.readFileSync(path.join(root, rel), 'utf8'));
      if (!header) {
        own.push(rel);
        continue;
      }
      vendored.push(rel);

      if (rel.split('/').some((segment) => BRANDS.test(segment))) {
        failures.push(`${rel}: an upstream name in the path; L13 keeps the credit in the header, not the tree`);
      }

      const missing = HEADER_KEYS.filter((key) => !header[key]);
      if (missing.length) {
        failures.push(`${rel}: provenance header is missing ${missing.join(', ')}`);
        continue;
      }

      const rows = readLedger(root, header.ledger, ledgers);
      if (!rows) {
        failures.push(`${rel}: names ledger ${header.ledger}, which does not exist`);
        continue;
      }

      const row = rows.get(rel);
      if (!row) {
        failures.push(`${rel}: no row in ${header.ledger}; a vendored file must be listed for re-sync`);
      } else if (upstreamPath(row.upstream) !== upstreamPath(header.upstream)) {
        failures.push(`${rel}: ledger says upstream ${row.upstream}, header says ${header.upstream}`);
      }
    }
  }

  // Every ledger is read even when nothing pointed at it, or deleting the last header in a
  // directory would take its ledger rows out of the check along with it.
  const ledgerDir = path.join(root, LEDGER_DIR);
  if (fs.existsSync(ledgerDir)) {
    for (const rel of walk(root, LEDGER_DIR)) {
      if (rel.endsWith('.md')) readLedger(root, rel, ledgers);
    }
  }

  // The other direction: a row whose file lost its header, so deleting a header fails loudly.
  const listed = new Set(vendored);
  for (const [ledgerPath, rows] of ledgers) {
    if (!rows) continue;
    for (const rel of rows.keys()) {
      if (listed.has(rel)) continue;
      const full = path.join(root, rel);
      if (!fs.existsSync(full)) {
        failures.push(`${ledgerPath} lists ${rel}, which does not exist`);
      } else if (!parseHeader(fs.readFileSync(full, 'utf8'))) {
        failures.push(`${rel}: listed in ${ledgerPath} but has no provenance header`);
      }
    }
  }

  return { ok: failures.length === 0, failures, vendored, own };
}

function main(dirs) {
  if (!dirs.length) {
    console.error('usage: node scripts/check-provenance.mjs <dir> [<dir> ...]');
    process.exit(2);
  }

  const root = process.cwd();
  const { ok, failures, vendored, own } = checkProvenance(root, dirs);

  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.log(`${vendored.length} vendored file(s) with a header and a ledger row; ${own.length} written here.`);
  if (!ok) {
    console.error(`${failures.length} provenance problem(s) in ${dirs.join(', ')}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
