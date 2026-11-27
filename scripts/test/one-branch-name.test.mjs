/**
 * user-pilot-branch S6: the pilot branch's name comes from one module (spec 4; L5, L11). A structural scan of the
 * shipped code in `bin/`, `scripts/` and `deck/` (tests and comments aside) for the legacy name used as a ref, and
 * the module's exports, which no longer carry the import-time constant.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOME = path.join('scripts', 'pilot-branch.mjs');

/** The shipped `.mjs`/`.js` files directly in `bin/`, `scripts/` and `deck/`, test files and helpers aside. */
function shipped() {
  return ['bin', 'scripts', 'deck'].flatMap((dir) => readdirSync(path.join(ROOT, dir), { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.m?js$/.test(entry.name) && !/\.test\.m?js$/.test(entry.name) && entry.name !== 'testUtils.mjs')
    .map((entry) => path.join(dir, entry.name)));
}

/** `source` with its comments blanked, line numbers kept; `//` after a quote or `:` is left (a URL in a string). */
const code = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

const Q = String.raw`['"\x60]pilot['"\x60]`;

/**
 * A use of the legacy name as a ref: a remote-tracking or full ref, a merge subject, a quoted `pilot` compared with,
 * assigned to or defaulting a base, branch, ref or head, or a quoted `pilot` in a git argv after its subcommand.
 */
const AS_REF = [
  /\b(?:origin|remotes\/[\w.-]+)\/pilot(?![\w.-])/,
  /\brefs\/heads\/pilot(?![\w.-])/,
  /\binto pilot(?![\w.-])/,
  new RegExp(String.raw`\w*(?:base|branch|ref|head)\w*\s*(?:[!=]==?|:|=|\?\?|\|\|)\s*${Q}`, 'i'),
  new RegExp(String.raw`${Q}\s*[!=]==?\s*\w*(?:base|branch|ref|head)`, 'i'),
  new RegExp(String.raw`['"\x60](?:push|fetch|merge|checkout|switch|rev-parse|branch|ls-remote|origin)['"\x60][^\]\n]*${Q}`),
];

test('no literal pilot branch outside its module', () => {
  const sites = [];
  for (const file of shipped()) {
    if (file === HOME) continue;
    code(readFileSync(path.join(ROOT, file), 'utf8')).split('\n').forEach((line, i) => {
      if (AS_REF.some((re) => re.test(line))) sites.push(`${file.replaceAll('\\', '/')}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(sites, [], `the legacy name as a ref outside ${HOME}; name it through pilotBranch or LEGACY_PILOT`);
});

test('the scan finds a planted site', () => {
  const planted = [
    "git(['push', 'origin', 'pilot']);", 'const ref = "refs/heads/pilot";', '`Merge ${head} into pilot`', 'x = origin/pilot',
    "if (record.base === 'pilot') {", "const branch = env.PILOT_BRANCH || 'pilot';", "{ base: 'pilot' }",
  ];
  for (const line of planted) assert.ok(AS_REF.some((re) => re.test(code(line))), line);
  const innocent = [
    "if (message.from === 'pilot') return;", "path.join(home, '.claude', 'pilot')", '// push to origin/pilot', 'origin/hazzardrust-pilot',
    "item.replies.push({ from: 'pilot', text });", "flavour.join(base, 'pilot', 'rune-target')", "if (mover !== 'pilot' && args?.action === 'merge') {",
  ];
  for (const line of innocent) {
    assert.ok(!AS_REF.some((re) => re.test(code(line))), line);
  }
});

test('no PILOT_BRANCH import remains', async () => {
  const mod = await import('../pilot-branch.mjs');
  assert.equal('PILOT_BRANCH' in mod, false, 'pilot-branch.mjs exports no PILOT_BRANCH');
  const importers = shipped().filter((file) => /import\s*\{[^}]*\bPILOT_BRANCH\b[^}]*\}\s*from/.test(readFileSync(path.join(ROOT, file), 'utf8')));
  assert.deepEqual(importers, []);
});
