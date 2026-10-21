#!/usr/bin/env node
/**
 * The plugin's instruction surface — the agents, skills and rules a session actually
 * loads — must address only what this package ships and must locate itself only by
 * `${CLAUDE_PLUGIN_ROOT}`. Both halves failed silently before: a reference to another
 * plugin's namespace resolves on the machine the files were written on and nowhere
 * else, and an absolute home path resolves for exactly one person. Neither shows up in
 * a test of behaviour, because nothing in this package executes these files; the
 * harness hands them to a model, which quietly does its best with a dead address.
 *
 * Usage: node scripts/check-references.mjs [<path> ...]
 *   e.g. node scripts/check-references.mjs
 *        node scripts/check-references.mjs agents/ rules/
 *
 * With no argument it checks the whole shipped surface. `docs/` is deliberately not in
 * it: ADR 0011 puts the credit in documentation, so the ADRs and the architecture
 * artefact name both upstreams on purpose, and so does every provenance header — which
 * is why the forbidden patterns below are addresses (`<name>:`) rather than bare words.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** What a friend's session loads as instructions. Everything else is documentation. */
export const SURFACE = ['agents', 'skills', 'rules', 'commands', 'hooks', '.mcp.json'];

const SKIPPED_DIRS = new Set(['node_modules', '.git']);
const CHECKED_EXTENSIONS = new Set(['.md', '.json', '.mjs', '.js']);

/**
 * Each pattern is a way a file works here and nowhere else. The message says what
 * breaks, because the fix differs: an address is rewritten, a path becomes a variable.
 */
const FORBIDDEN = [
  {
    pattern: /\becc:/gi,
    why: 'addresses a plugin this package does not ship; use the pilot: name it vendored to',
  },
  {
    pattern: /\bmattpocock-skills:/gi,
    why: 'addresses a plugin this package does not ship; use the skills/ copy it vendored to',
  },
  {
    pattern: /[A-Za-z]:[\\/]+Users[\\/]+[A-Za-z]/g,
    why: 'names one machine\'s home directory; use ${CLAUDE_PLUGIN_ROOT}',
  },
  {
    pattern: /\/(?:home|Users)\/[A-Za-z]/g,
    why: 'names one machine\'s home directory; use ${CLAUDE_PLUGIN_ROOT}',
  },
  {
    pattern: /installed_plugins\.json/g,
    why: 'reads the harness\'s private plugin registry at runtime; use ${CLAUDE_PLUGIN_ROOT}',
  },
];

/**
 * A `${CLAUDE_PLUGIN_ROOT}/...` reference and the path it names. Stops at whitespace and
 * at the punctuation that ends a path in markdown or JSON, so a backticked path keeps
 * its backtick out and a sentence keeps its full stop out. A backslash ends it too: in
 * JSON it escapes the closing quote, and on POSIX `x.js\` is another file.
 */
const PLUGIN_ROOT_PATH = /\$\{CLAUDE_PLUGIN_ROOT\}((?:\/[^\s\\"'`),\]}]+)+)/g;

/**
 * Prose showing the *shape* of a reference rather than making one: `rules/…` in the
 * rules README, or a `<name>` a brief fills in. Resolving those would fail forever and
 * the only way to pass would be to stop explaining the shape.
 */
const PLACEHOLDER = /…|\.\.\.|[<>*]/;

const posix = (value) => value.split(path.sep).join('/');

function walk(root, rel, found = []) {
  const full = path.join(root, rel);
  if (fs.statSync(full).isFile()) {
    found.push(rel);
    return found;
  }
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) walk(root, `${rel}/${entry.name}`, found);
    } else if (entry.isFile()) {
      found.push(`${rel}/${entry.name}`);
    }
  }
  return found;
}

/** The files under `paths` this checker reads, in a stable order. */
function surfaceFiles(root, paths = SURFACE) {
  const files = [];
  for (const entry of paths) {
    const clean = posix(entry).replace(/\/+$/, '');
    if (!fs.existsSync(path.join(root, clean))) continue;
    for (const rel of walk(root, clean)) {
      if (CHECKED_EXTENSIONS.has(path.extname(rel))) files.push(rel);
    }
  }
  return files.sort();
}

const lineOf = (source, index) => source.slice(0, index).split('\n').length;

/**
 * Every plugin-root path referenced in the surface, as `{ file, line, target }` where
 * `target` is repository-relative. The tests resolve each against the tree; a path that
 * does not exist is a reference the model will follow to nothing.
 */
export function pluginRootPaths(root, paths = SURFACE) {
  const found = [];
  for (const rel of surfaceFiles(root, paths)) {
    const source = fs.readFileSync(path.join(root, rel), 'utf8');
    for (const match of source.matchAll(PLUGIN_ROOT_PATH)) {
      const target = match[1].replace(/^\/+/, '').replace(/[.,;:]+$/, '');
      if (PLACEHOLDER.test(target)) continue;
      found.push({ file: rel, line: lineOf(source, match.index), target });
    }
  }
  return found;
}

/**
 * A rules file is copied into a fresh install's `~/.claude/rules/`, where there is no
 * CLAUDE.md, no retired `rules/common/` and only the skills this package ships. An
 * upstream re-sync brings each of those back, so a rules file is held to all three.
 */
const MD_LINKS = [
  // `[a](b.md)`, `[a](b.md#x)`, `[a](<b.md>)`, `[a](b.md "title")`
  /\]\(\s*<?([^)\s#<>]+\.md)(?:#[^)\s>]*)?>?(?:\s+["'(][^)]*)?\s*\)/g,
  // `[a]: b.md`, a reference definition
  /^ {0,3}\[[^\]]+\]:\s*<?([^\s#<>]+\.md)(?:[#>\s]|$)/gm,
];

/** The three shapes that name a skill: `skill: x` quoted or bare, `skills/x/SKILL.md`, a `skills:` list. */
const SKILL_NAMES = [
  (source) => [...source.matchAll(/skill:[ \t]*(?:`([^`]+)`|([\w-]+))/gi)].map((m) => [m.index, m[1] ?? m[2]]),
  (source) => [...source.matchAll(/skills\/([\w-]+)\/SKILL\.md/g)].map((m) => [m.index, m[1]]),
  (source) =>
    [...source.matchAll(/\bskills?:(.*)$/gim)].flatMap((m) =>
      [...m[1].matchAll(/`([^`]+)`/g)].map((n) => [m.index, n[1]]),
    ),
];

function rulesFailures(root, rel) {
  const source = fs.readFileSync(path.join(root, rel), 'utf8');
  const failures = [];

  for (const match of source.matchAll(/CLAUDE\.md/g)) {
    failures.push(`${rel}:${lineOf(source, match.index)}: "CLAUDE.md" defers to a CLAUDE.md a fresh install does not have`);
  }

  for (const match of MD_LINKS.flatMap((pattern) => [...source.matchAll(pattern)])) {
    const target = match[1];
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('/') || PLACEHOLDER.test(target)) continue;
    if (!fs.existsSync(path.join(root, path.dirname(rel), target))) {
      failures.push(`${rel}:${lineOf(source, match.index)}: ${target} does not resolve beside this file`);
    }
  }

  for (const [index, name] of SKILL_NAMES.flatMap((names) => names(source))) {
    if (PLACEHOLDER.test(name)) continue;
    if (!fs.existsSync(path.join(root, 'skills', name, 'SKILL.md'))) {
      failures.push(`${rel}:${lineOf(source, index)}: skill \`${name}\` is not one skills/ ships`);
    }
  }

  // A line can name one skill in two shapes, as an `ECC skill:` line does; it is one dead reference.
  return [...new Set(failures)];
}

/**
 * A `pilot` subcommand as a prompt names it: backticked `pilot <word>` (after an optional
 * `--dir <path>`), or the plugin-root form `bin/pilot.mjs" <word>`. Prose ("the pilot
 * merges") is never backticked, so it never reads as a command.
 */
const PILOT_COMMAND = /(?:`pilot (?:--dir \S+ )?|bin\/pilot\.mjs"? )([a-z][\w-]*)/g;

/** A deck tool's full address; a hook matcher's `deck_(a|b)` alternation names each of a, b. */
const DECK_ADDRESS = /mcp__plugin_pilot_deck__(deck_(?:\w|\([\w|]+\))*)/g;

const expand = (name) => {
  const group = /^(.*?)\(([^)]*)\)(.*)$/.exec(name);
  return group ? group[2].split('|').flatMap((alt) => expand(group[1] + alt + group[3])) : [name];
};

/** A file the names are read from; a root without it would fail every name, so it throws instead. */
const textAt = (root, rel) => {
  if (!fs.existsSync(path.join(root, rel))) throw new Error(`no ${rel} under ${root}`);
  return fs.readFileSync(path.join(root, rel), 'utf8');
};

/** What the package can actually be asked for: each subcommand `bin/pilot.mjs` dispatches, each tool `TOOLS` names. */
export function shippedNames(root) {
  return {
    commands: new Set([...textAt(root, 'bin/pilot.mjs').matchAll(/command === '([^']+)'/g)].map((m) => m[1])),
    tools: new Set([...textAt(root, 'deck/tools.mjs').matchAll(/^ {4}name: '(\w+)'/gm)].map((m) => m[1])),
  };
}

/** An agent's frontmatter `tools:` entries, trimmed; a body line starting `tools:` grants nothing. */
const grantedTools = (source) => {
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(source.replace(/\r\n/g, '\n'))?.[1] ?? '';
  return (/^tools:(.*)$/m.exec(frontmatter)?.[1] ?? '').split(',').map((entry) => entry.trim());
};

/** `shipped()` reads the dispatcher and the tool list on the first name, so a tree naming none needs neither. */
function namedFailures(rel, source, shipped) {
  const failures = [];
  for (const match of source.matchAll(PILOT_COMMAND)) {
    if (!shipped().commands.has(match[1])) {
      failures.push(`${rel}:${lineOf(source, match.index)}: \`pilot ${match[1]}\` is not a subcommand bin/pilot.mjs dispatches`);
    }
  }
  const agent = /^agents\/[^/]+\.md$/.test(rel);
  const granted = agent ? grantedTools(source) : [];
  for (const match of source.matchAll(DECK_ADDRESS)) {
    const line = lineOf(source, match.index);
    for (const tool of expand(match[1])) {
      const address = `mcp__plugin_pilot_deck__${tool}`;
      if (!shipped().tools.has(tool)) {
        failures.push(`${rel}:${line}: deck tool ${tool} is not one deck/tools.mjs TOOLS names`);
      } else if (agent && !granted.includes(address) && !granted.includes('mcp__plugin_pilot_deck')) {
        failures.push(`${rel}:${line}: ${rel} names ${address}, which its tools: does not grant`);
      }
    }
  }
  return failures;
}

/**
 * @param {string} root repository root
 * @param {string[]} paths files and directories to check, relative to the root
 * @returns {{ok: boolean, failures: string[], checked: string[], references: number}}
 */
export function checkReferences(root, paths = SURFACE) {
  const failures = [];
  const checked = surfaceFiles(root, paths);
  let names;
  const shipped = () => (names ??= shippedNames(root));

  for (const rel of checked) {
    const source = fs.readFileSync(path.join(root, rel), 'utf8');
    for (const { pattern, why } of FORBIDDEN) {
      for (const match of source.matchAll(pattern)) {
        failures.push(`${rel}:${lineOf(source, match.index)}: ${JSON.stringify(match[0])} ${why}`);
      }
    }
    failures.push(...namedFailures(rel, source, shipped));
  }

  const references = pluginRootPaths(root, paths);
  for (const { file, line, target } of references) {
    if (!fs.existsSync(path.join(root, target))) {
      failures.push(`${file}:${line}: \${CLAUDE_PLUGIN_ROOT}/${target} is not a file this package ships`);
    }
  }

  for (const rel of checked.filter((file) => file.startsWith('rules/'))) {
    failures.push(...rulesFailures(root, rel));
  }

  return { ok: failures.length === 0, failures, checked, references: references.length };
}

function main(argv) {
  const root = process.cwd();
  const paths = argv.length ? argv : SURFACE;
  const { ok, failures, checked, references } = checkReferences(root, paths);

  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.log(
    `${checked.length} file(s) checked; ${references} plugin-root reference(s) resolved.`,
  );
  if (!ok) {
    console.error(`${failures.length} reference problem(s) in ${paths.join(', ')}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
