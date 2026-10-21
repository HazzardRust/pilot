#!/usr/bin/env node
/**
 * The vocabulary guard (co-pilot-tickets S7, S15; L5, A7, A10): each retired word, outside the closed
 * exception list of architecture section 7, as `path:line:word`, and exit 1; exit 0 when the whole
 * repository (or its tracked files under the paths) is clean. A file's name is its line 0.
 *
 *   node scripts/vocabulary.mjs check [<paths...>]
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The retired words, spelt in halves so this file stays clean under its own guard.
const t = 'ta' + 'sk';
const T = 'Ta' + 'sk';

/**
 * The path prefixes whose whole file is exempt, one per line of vocabulary-exempt.txt: a list
 * of its own, merged with `merge=union`, so two features that each add a path do not conflict.
 */
export function exemptPaths() {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'vocabulary-exempt.txt');
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((line) => line.trim() !== '');
}

/** Section 7, closed: Claude Code's names, other languages' own word, and vendored upstream text (A7, A10). */
export const EXCEPTIONS = Object.freeze([
  // A regex's word-boundary escape before a name is not a letter that joins it to another word.
  { pattern: new RegExp(String.raw`(?<!\w(?<!\\[bntr]))(?:${T}(?:Create|Update|List|Get|Output|Stop)\b|${T} tool\b|${t}-notification\b)`, 'g') },
  { pattern: new RegExp(String.raw`\b(?:${t}kill|${t}list|queueMicro${t}|micro${t})\b`, 'g') },
  { pattern: new RegExp(String.raw`System\.Threading\.${T}s|\b${T}Group\b|\b${T}\b|\b${t} \{`, 'g'), paths: ['rules/csharp/', 'rules/fsharp/', 'rules/swift/'] },
  { pattern: new RegExp(`unless required by the ${t}`, 'g'), paths: ['agents/'] },
  { pattern: new RegExp(`wider than the ${t} needs`, 'g'), paths: ['agents/security-reviewer.md'] },
  // A10: the user's own words stay theirs, so ADR 0152 (its title is their request) is exempt whole, with its index row.
  { pattern: /[\s\S]+/g, paths: exemptPaths() },
  // The deck writes every run's record from agents' reports, not the repository's prose: docs/design/<slug>/run.json, whole.
  { pattern: /[\s\S]+/g, paths: [/^docs\/design\/[^/]+\/run\.json$/] },
  // The user's README stays as they typed it (itm_96efa0d83799, 2026-10-17).
  { pattern: /[\s\S]+/g, paths: ['README.md'] },
  { pattern: /^\| 0152 \|.*$/gm, paths: ['docs/adr/README.md'] },
  { pattern: /^\| 0153 \|.*$/gm, paths: ['docs/adr/README.md'] },
  { pattern: /^\| 0159 \|.*$/gm, paths: ['docs/adr/README.md'] },
  // L13: the one-way v3 step reads the v2 spelling, the run-record reader the legacy key, and their fixtures.
  { pattern: /^function fromV2Spelling\(deck\) \{$[\s\S]*?^\}$/gm, paths: ['deck/store-core.mjs'] },
  { pattern: new RegExp(String.raw`\brecord\.${t}\b`, 'g'), paths: ['deck/runs.mjs'] },
  { pattern: /[\s\S]+/g, paths: ['deck/test/store-v3.test.mjs', 'deck/test/run-record-legacy.test.mjs'] },
]);

const under = (file, prefix) => (prefix instanceof RegExp ? prefix.test(file.replace(/\\/g, '/')) : file.replace(/\\/g, '/').startsWith(prefix));

/**
 * A retired word: the old agent in any case or spelling, or the old ticket word in the spellings the
 * codemod renamed, at a word boundary or a camelCase hump, so `multi` plus the word is English and a
 * capitalised one after a lower-case letter is not (S4's seam).
 */
const RETIRED = [
  new RegExp('fore' + 'm[ae]n', 'gi'),
  new RegExp(String.raw`\b[Uu]n${t}(?=ed\b)`, 'g'),
  new RegExp(`(?<![A-Z])${t.toUpperCase()}(?=S?(?![A-Z]))`, 'g'),
  new RegExp(`(?<![A-Z])${T}(?=(?:s|ed)?(?![a-z]))`, 'g'),
  // A regex's word-boundary escape, or a newline or tab escape, before the word does not join it to a letter.
  new RegExp(String.raw`(?<![A-Za-z](?<!\\[bntr]))${t}(?=(?:s|ed)?(?![a-z]))`, 'g'),
];

/** Each retired word in `text` outside the exceptions that apply at `path`, by line, in order. */
export function retiredHits(text, path) {
  let open = text;
  for (const { pattern, paths } of EXCEPTIONS) {
    if (!paths || paths.some((prefix) => under(path, prefix))) open = open.replace(pattern, (held) => held.replace(/[^\n]/g, '\u0000'));
  }
  const starts = new Set();
  for (const pattern of RETIRED) for (const { index } of open.matchAll(pattern)) starts.add(index);
  return [...starts].sort((a, b) => a - b).map((at) => {
    const before = open.slice(0, at);
    const word = open.slice(at - before.match(/[\w-]*$/)[0].length).match(/^[\w-]+/)[0];
    return { line: before.split('\n').length, word };
  });
}

const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tracked = (args) => execFileSync('git', ['ls-files', '-z', ...args], { cwd: TOP, encoding: 'utf8', maxBuffer: 64 << 20, windowsHide: true }).split('\0').filter(Boolean);

/** The guard's scope: every tracked file in the repository, history included. */
export const SCOPE = Object.freeze(tracked([]));

/** `path:line:word` for each retired word in the files, a file's name as its line 0. */
function check(files) {
  const lines = [];
  for (const file of files) {
    const hit = ({ line, word }) => lines.push(`${file}:${line}:${word}`);
    retiredHits(file, file).forEach(({ word }) => hit({ line: 0, word }));
    const bytes = fs.readFileSync(path.join(TOP, file));
    if (!bytes.includes(0)) retiredHits(bytes.toString('utf8'), file).forEach(hit);
  }
  return lines;
}

function main(argv) {
  const [command, ...rest] = argv;
  if (command !== 'check') {
    process.stderr.write(`unknown command ${command ?? ''}\nusage: node scripts/vocabulary.mjs check [<paths...>]\n`);
    process.exitCode = 2;
    return;
  }
  const files = rest.length ? tracked(['--', ...rest.map((target) => path.resolve(target))]) : SCOPE;
  if (files.length === 0) {
    process.stderr.write(`check: no tracked file under ${rest.join(' ')}\n`);
    process.exitCode = 2;
    return;
  }
  const hits = check(files);
  if (hits.length) process.stdout.write(`${hits.join('\n')}\n${hits.length} retired word(s) outside architecture section 7\n`);
  process.exitCode = hits.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
