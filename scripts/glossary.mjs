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

function main(argv) {
  const [command, file, ...rest] = argv;
  if (command !== 'check' || !file || rest.length > 0) {
    process.stderr.write('usage: node scripts/glossary.mjs check <file>\n');
    process.exit(2);
  }
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    process.stderr.write(`glossary: cannot read ${file}: ${error.code ?? error.message}\n`);
    process.exit(2);
  }
  const problems = lintGlossary(text);
  for (const { line, term, token } of problems) process.stdout.write(`${line} ${term}: names a path ${token}\n`);
  process.exitCode = problems.length > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
