/**
 * The repository's glossary (project-glossary S1; spec 3, 7; L2, L4-L6): `GLOSSARY.md` at the
 * root defines words, never where things live. `parseGlossary` reads its entries, `lintGlossary`
 * names every definition token that is a path (L4), and `check <file>` is the CLI the gate's
 * test and a hand run share: exit 0 clean, 1 with one line per problem, 2 when the file cannot
 * be read or the command is wrong.
 */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const TERM = /^\*\*(.+)\*\*:\s*$/;
const AVOID = /^_Avoid_:\s*(.*)$/;
const HEADING = /^#/;

/** Extensions that make a bare `name.ext` a file: source, config and doc files. */
const FILE_EXTENSIONS = new Set([
  'md', 'mdx', 'txt', 'json', 'jsonl', 'yml', 'yaml', 'toml', 'ini', 'csv', 'html', 'css',
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'py', 'rs', 'go', 'rb', 'java', 'c', 'h', 'cpp',
  'sh', 'ps1', 'sql', 'tf', 'lock', 'log',
]);

/**
 * `line` with each control, format, line- and paragraph-separator character as `?`: the audited
 * repository's text cannot forge a line, drive a terminal or reorder what is shown.
 */
export const printable = (line) => line.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '?');

/**
 * Each glossary entry: a `**Term**:` line, the definition lines under it, and an optional
 * `_Avoid_:` line. A `#` heading groups entries and is never one; a blank line ends an entry.
 * `line` is the 1-based line of the term.
 */
export function parseGlossary(text) {
  return entriesOf(text).map(({ lines: _lines, ...entry }) => entry);
}

/** The entries with `lines`, the 1-based line of each definition line, for the lint. */
function entriesOf(text) {
  const entries = [];
  let entry = null;
  let body = [];
  const close = () => {
    if (entry) entries.push({ ...entry, definition: body.join('\n') });
    entry = null;
    body = [];
  };
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trimEnd();
    const term = TERM.exec(line);
    if (term) {
      close();
      entry = { term: term[1].trim(), definition: '', avoid: [], line: index + 1, lines: [] };
      return;
    }
    if (!entry) return;
    if (line === '' || HEADING.test(line)) return close();
    const avoid = AVOID.exec(line);
    if (avoid) {
      entry.avoid = avoid[1].split(',').map((word) => word.trim()).filter(Boolean);
      return;
    }
    body.push(line);
    entry.lines.push(index + 1);
  });
  close();
  return entries;
}

/** Trailing punctuation a word carries in prose; stripped by a loop, since an unanchored `[…]+$` backtracks quadratically. */
const TRAILING = new Set('`\'")]}>,;:.!?');

/**
 * The path a token names, or null: `~/…` or `./…`, `a/b/…`, `a/b.ext`, or a bare `name.ext` file.
 * Slashes are read by splitting, never by an unanchored regex, so a long token costs linear time.
 */
function pathOf(word) {
  let end = word.length;
  while (end > 0 && TRAILING.has(word[end - 1])) end -= 1;
  const token = word.slice(0, end).replace(/^[`'"([{<]+/, '');
  if (token === '') return null;
  if (/^(?:~|\.{1,2})\//.test(token)) return token;
  const parts = token.split('/');
  // a/b/: two non-empty segments in a row, the second followed by a slash.
  if (parts.some((part, i) => i > 0 && i < parts.length - 1 && part && parts[i - 1])) return token;
  // a/b.ext: a non-empty segment, then a last segment ending in `.ext`.
  if (parts.length > 1 && parts.at(-2) && /\.[A-Za-z0-9]+$/.test(parts.at(-1))) return token;
  const bare = /^[\w.-]*[\w-]\.([A-Za-z0-9]+)$/.exec(token);
  if (bare && FILE_EXTENSIONS.has(bare[1].toLowerCase())) return token;
  return null;
}

/** Every definition token naming a path, as `{ term, line, problem: 'path', token }`; `line` is the token's. */
export function lintGlossary(text) {
  const problems = [];
  for (const { term, definition, lines } of entriesOf(text)) {
    definition.split('\n').forEach((defLine, index) => {
      for (const word of defLine.split(/\s+/)) {
        const token = pathOf(word);
        if (token) problems.push({ term, line: lines[index], problem: 'path', token });
      }
    });
  }
  return problems;
}

/**
 * The lower-case words of a text, split on every run of non-letters and non-digits: one fixed
 * character class, so a long CLI argument costs linear time and no glossary text becomes a regex.
 */
function wordsOf(text) {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** An entry's own lines in the file, from its `**Term**:` line to the blank line or heading that ends it. */
function entryText(lines, { line }) {
  const own = [lines[line - 1].trimEnd()];
  for (let i = line; i < lines.length; i += 1) {
    const next = lines[i].trimEnd();
    if (next === '' || HEADING.test(next) || TERM.test(next)) break;
    own.push(next);
  }
  return own.join('\n');
}

/** Each entry's names: its term first, then its `_Avoid_` words, a trailing `(…)` note dropped. */
function namesOf(glossary) {
  return parseGlossary(glossary).map((entry) => ({
    entry,
    names: [
      { word: entry.term, via: 'term' },
      ...entry.avoid.map((avoid) => ({ word: avoid.split('(')[0].trim(), via: 'avoid' })),
    ]
      .map((name) => ({ ...name, words: wordsOf(name.word) }))
      .filter(({ words }) => words.length > 0),
  }));
}

/**
 * The glossary entries a text's words name, whole-word and case-insensitive (spec 9, L11): at
 * each word the longest term or `_Avoid_` name starting there hits, and its words are consumed,
 * so "take the base" is the `Take the base` entry rather than `Base` as well. Each entry comes
 * once, by the first name that hit it, in the file's order.
 */
export function matchGlossary(text, glossary) {
  const lines = glossary.split(/\r?\n/);
  const entries = namesOf(glossary);
  const byFirst = new Map();
  entries.forEach(({ names }, index) => {
    for (const name of names) {
      const first = name.words[0];
      if (!byFirst.has(first)) byFirst.set(first, []);
      byFirst.get(first).push({ ...name, index });
    }
  });
  const words = wordsOf(text);
  const hits = new Map();
  let at = 0;
  while (at < words.length) {
    let longest = 0;
    let matched = [];
    for (const name of byFirst.get(words[at]) ?? []) {
      const length = name.words.length;
      if (length < longest || !name.words.every((word, k) => words[at + k] === word)) continue;
      if (length > longest) matched = [];
      longest = length;
      matched.push(name);
    }
    // a term wins over an `_Avoid_` hit on the same words, as in termOf.
    const terms = matched.filter(({ via }) => via === 'term');
    for (const { index, via, word } of terms.length > 0 ? terms : matched) {
      if (hits.has(index)) continue;
      const { entry } = entries[index];
      hits.set(index, { term: entry.term, via, word, entry: entryText(lines, entry) });
    }
    at += Math.max(longest, 1);
  }
  return [...hits.keys()].sort((a, b) => a - b).map((index) => hits.get(index));
}

/**
 * The text of the one entry whose term is `name`, else the first whose `_Avoid_` word is, case
 * insensitive; null when none is. A term wins, since `Sync` is also `Take the base`'s Avoid word.
 */
export function termOf(name, glossary) {
  const wanted = wordsOf(name).join(' ');
  if (wanted === '') return null;
  const entries = namesOf(glossary);
  const is = ({ words }) => words.join(' ') === wanted;
  const found =
    entries.find(({ names }) => names.some((n) => n.via === 'term' && is(n))) ??
    entries.find(({ names }) => names.some(is));
  return found ? entryText(glossary.split(/\r?\n/), found.entry) : null;
}

const USAGE =
  'usage: node scripts/glossary.mjs check <file>\n' +
  '       node scripts/glossary.mjs match <text…> [--file GLOSSARY.md] [-- <text…>]\n' +
  '       node scripts/glossary.mjs term <name> [--file GLOSSARY.md] [-- <name>]\n';

function usage() {
  process.stderr.write(USAGE);
  process.exit(2);
}

function readGlossary(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    process.stderr.write(`glossary: cannot read ${file}: ${error.code ?? error.message}\n`);
    process.exit(2);
  }
}

/** `match` and `term`'s arguments: the words, and the glossary `--file`, `GLOSSARY.md` in the working directory by default; after `--` every argument is a word. */
function lookupArgs(args) {
  const words = [];
  let file = 'GLOSSARY.md';
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--') {
      words.push(...args.slice(i + 1));
      break;
    }
    if (args[i] !== '--file') words.push(args[i]);
    else if (i + 1 < args.length) file = args[(i += 1)];
    else usage();
  }
  if (words.length === 0) usage();
  return { text: words.join(' '), file };
}

function main(argv) {
  const [command, ...args] = argv;
  if (command === 'match') {
    const { text, file } = lookupArgs(args);
    const hits = matchGlossary(text, readGlossary(file));
    const blocks = hits.map(({ term, word, entry }) =>
      [`${term} (via ${word})`, ...entry.split('\n').slice(1)].join('\n'),
    );
    if (blocks.length > 0) process.stdout.write(`${blocks.join('\n\n')}\n`);
    return;
  }
  if (command === 'term') {
    const { text, file } = lookupArgs(args);
    const entry = termOf(text, readGlossary(file));
    if (entry === null) {
      process.stderr.write(`no entry for ${text}\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`${entry}\n`);
    return;
  }
  const [file, ...rest] = args;
  if (command !== 'check' || !file || rest.length > 0) usage();
  const problems = lintGlossary(readGlossary(file));
  for (const { line, term, token } of problems) process.stdout.write(`${printable(`${line} ${term}: names a path ${token}`)}\n`);
  process.exitCode = problems.length > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
