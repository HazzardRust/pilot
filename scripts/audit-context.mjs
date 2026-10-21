#!/usr/bin/env node
/**
 * Measures every always-loaded context source for a repository and a home
 * directory: `CLAUDE.md`s, unconditional and path-scoped rules, skill
 * descriptions, hooks and MCP servers (housekeeping-audit spec 8, 9; S4).
 * Read-only, deterministic; `tokens` is always bytes / 4, an estimate - a
 * hook is never run, only sized from its referenced script or its command
 * string. Scope is the repository and the machine config loaded in it,
 * never this package's own agents or skills (A4).
 *
 *   node scripts/audit-context.mjs <repo> [--home <dir>]
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { split, listOf, BYTES_PER_TOKEN } from './measure-prompt.mjs';

const MAX_MATCHES_SHOWN = 10;
const MAX_FILE_BYTES = 5 * 1024 * 1024; // F4: past this, size from the stat, never read the content
const MAX_WILDCARD_TOKENS = 12; // F2: a glob with more wildcard tokens is refused, not compiled
const HOOK_SCRIPT = /(?:^|["'\s])([^"'\s]+\.(?:mjs|cjs|js|py|sh|ps1))(?:["'\s]|$)/;

const bytes = (text) => Buffer.byteLength(text, 'utf8');
const tokensOf = (text) => bytes(text) / BYTES_PER_TOKEN;
const toPosix = (rel) => rel.split(path.sep).join('/');

// True when `candidate` resolves at or under `root` (F1, F3): the boundary a hook command
// naming a path outside the repo, or a symlink whose target does, must not cross.
function withinRoot(root, candidate) {
  const rel = path.relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * The one guarded read for every file this script opens. Resolves symlinks and, whenever
 * a `root` is given, refuses a real path that leaves it (F1, F3) - the audited repo is
 * untrusted input, the user's home is not, so a home-scope read passes no root at all.
 * Never reads past `MAX_FILE_BYTES` (F4): past it, `tokens` comes from the stat size and
 * `text` is `null`, the content never opened. Returns `null` when the file does not exist
 * or its real path escapes the root.
 */
function guardedRead(file, root) {
  let real;
  try { real = fs.realpathSync(file); } catch { return null; }
  if (root) {
    const realRoot = fs.realpathSync(root);
    if (!withinRoot(realRoot, real)) return null;
  }
  const { size } = fs.statSync(real);
  if (size > MAX_FILE_BYTES) return { text: null, tokens: size / BYTES_PER_TOKEN };
  const text = fs.readFileSync(real, 'utf8');
  return { text, tokens: tokensOf(text) };
}

function fieldOf(front, key) {
  const at = front.findIndex((line) => line.startsWith(`${key}:`));
  return at < 0 ? undefined : front[at].slice(key.length + 1).trim() || undefined;
}

const stripQuotes = (value) => value.replace(/^["']|["']$/g, '');

// A glob to a RegExp, covering only `**`, `*` and `{a,b}` - the three a dependency would otherwise be pulled in for.
export function globToRegExp(glob) {
  let re = '';
  let i = 0;
  while (i < glob.length) {
    if (glob.slice(i, i + 3) === '**/') { re += '(?:.*/)?'; i += 3; continue; }
    if (glob.slice(i, i + 2) === '**') { re += '.*'; i += 2; continue; }
    const c = glob[i];
    if (c === '*') { re += '[^/]*'; i += 1; continue; }
    if (c === '{') {
      const end = glob.indexOf('}', i);
      if (end === -1) { re += '\\{'; i += 1; continue; }
      const options = glob.slice(i + 1, end).split(',').map((opt) => opt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      re += `(?:${options.join('|')})`;
      i = end + 1;
      continue;
    }
    re += /[.*+?^${}()|[\]\\]/.test(c) ? `\\${c}` : c;
    i += 1;
  }
  return new RegExp(`^${re}$`);
}

// Collapses a run of consecutive `**/` (and a trailing bare `**`) to one before compiling
// (F2): an unbounded repeat of `(?:.*/)?` is what backtracks exponentially against a
// non-matching path.
function collapseGlobstars(glob) {
  let result = glob;
  let prev;
  do {
    prev = result;
    result = result.replace(/\*\*\/\*\*\//g, '**/').replace(/\*\*\/\*\*$/g, '**');
  } while (result !== prev);
  return result;
}

// Counts each `**` or lone `*` once. A single segment can pack many wildcard tokens -
// `*a*a*a*...*b` - and compile to a chain of `[^/]*` that is polynomial against a long
// non-matching name.
function wildcardTokenCount(glob) {
  let count = 0;
  let i = 0;
  while (i < glob.length) {
    if (glob[i] !== '*') { i += 1; continue; }
    count += 1;
    i += glob[i + 1] === '*' ? 2 : 1;
  }
  return count;
}

// Compiles every glob whose wildcard-token count stays within `MAX_WILDCARD_TOKENS`; one
// past it is refused outright, rather than compiled, and named in `skipped` so the rule's
// row says so instead of silently matching nothing.
export function compileGlobs(globs) {
  const regexes = [];
  const skipped = [];
  for (const glob of globs) {
    const hostile = wildcardTokenCount(glob) > MAX_WILDCARD_TOKENS;
    if (hostile) skipped.push(glob);
    else regexes.push(globToRegExp(collapseGlobstars(glob)));
  }
  return { regexes, skipped };
}

// `{ files, ok }`: `ok` is false when `git ls-files` itself failed, so a caller can tell
// "no tracked files matched" from "the match could not be computed at all" (F6).
function trackedFiles(repo) {
  try {
    const out = execFileSync('git', ['ls-files'], { cwd: repo, encoding: 'utf8', windowsHide: true });
    return { files: out.split(/\r?\n/).filter(Boolean), ok: true };
  } catch {
    return { files: [], ok: false };
  }
}

function claudeMdRows(dir, scope, prefix, names, read) {
  return names.flatMap((name) => {
    const result = read(path.join(dir, name));
    return result === null ? [] : [{ source: `${prefix}${name}`, scope, kind: 'claude-md', tokens: result.tokens }];
  });
}

function rulesUnder(claudeDir, scope, prefix, repoFiles, read) {
  const rulesDir = path.join(claudeDir, 'rules');
  if (!fs.existsSync(rulesDir)) return [];
  const entries = fs.readdirSync(rulesDir, { recursive: true }).filter((file) => file.endsWith('.md')).sort();
  return entries.flatMap((rel) => {
    const result = read(path.join(rulesDir, rel));
    if (result === null) return [];
    const source = `${prefix}rules/${toPosix(rel)}`;
    const globs = result.text === null ? [] : listOf(split(result.text).front, 'paths').map(stripQuotes);
    if (globs.length === 0) return [{ source, scope, kind: 'rule', tokens: result.tokens }];
    const { regexes, skipped } = compileGlobs(globs);
    const skippedField = skipped.length ? { skipped } : {};
    if (!repoFiles.ok) return [{ source, scope, kind: 'path-rule', tokens: result.tokens, matches: [], matchCount: null, ...skippedField }];
    const matched = repoFiles.files.filter((file) => regexes.some((re) => re.test(file)));
    return [{
      source, scope, kind: 'path-rule', tokens: result.tokens,
      matches: matched.slice(0, MAX_MATCHES_SHOWN), matchCount: matched.length, ...skippedField,
    }];
  });
}

// Only the frontmatter `description:` is always loaded; the body loads on invocation.
function skillsUnder(claudeDir, scope, prefix, read) {
  const skillsDir = path.join(claudeDir, 'skills');
  if (!fs.existsSync(skillsDir)) return [];
  return fs.readdirSync(skillsDir).sort().flatMap((name) => {
    const result = read(path.join(skillsDir, name, 'SKILL.md'));
    if (result === null) return [];
    if (result.text === null) return [{ source: `${prefix}skills/${name}/SKILL.md`, scope, kind: 'skill-description', tokens: result.tokens }];
    const description = fieldOf(split(result.text).front, 'description') ?? '';
    return [{ source: `${prefix}skills/${name}/SKILL.md`, scope, kind: 'skill-description', tokens: tokensOf(description) }];
  });
}

function hookTokens(command, dir, read) {
  const match = HOOK_SCRIPT.exec(command);
  const candidate = match && (path.isAbsolute(match[1]) ? match[1] : path.join(dir, match[1]));
  const result = candidate ? read(candidate) : null;
  return result === null ? tokensOf(command) : result.tokens;
}

const mcpServerRows = (servers, scope, source) => Object.entries(servers ?? {}).map(([, server]) => ({
  source, scope, kind: 'mcp-server', tokens: tokensOf(JSON.stringify(server)),
}));

// `{ exists, value, unreadable }`: a file that exists but fails to parse (or was too large
// to read at all) is `unreadable`, never silently "nothing configured" (F5).
function readJson(file, read) {
  const result = read(file);
  if (result === null) return { exists: false };
  if (result.text === null) return { exists: true, unreadable: true };
  try { return { exists: true, value: JSON.parse(result.text) }; } catch { return { exists: true, unreadable: true }; }
}

function settingsUnder(file, scope, source, read) {
  const result = readJson(file, read);
  if (!result.exists) return [];
  if (result.unreadable) return [{ source, scope, kind: 'unreadable', tokens: 0 }];
  const settings = result.value;
  const dir = path.dirname(file);
  const hooks = Object.entries(settings.hooks ?? {}).flatMap(([event, matchers]) =>
    (Array.isArray(matchers) ? matchers : []).flatMap((entry) => (entry.hooks ?? [])
      .filter((hook) => hook.type === 'command' && hook.command)
      .map((hook) => ({
        source, scope, kind: 'hook', tokens: hookTokens(hook.command, dir, read), event, matcher: entry.matcher || '*',
      }))));
  return [...hooks, ...mcpServerRows(settings.mcpServers, scope, source)];
}

function mcpJsonRows(file, scope, source, read) {
  const result = readJson(file, read);
  if (!result.exists) return [];
  if (result.unreadable) return [{ source, scope, kind: 'unreadable', tokens: 0 }];
  return mcpServerRows(result.value.mcpServers, scope, source);
}

// The repo is untrusted input: this is the one place its guard is bound, so a mutant that
// drops it has one line to hit rather than six (P1).
function repoRows(repo, repoFiles) {
  const claudeDir = path.join(repo, '.claude');
  const read = (file) => guardedRead(file, repo);
  return [
    ...claudeMdRows(repo, 'repo', '', ['CLAUDE.md', 'CLAUDE.local.md'], read),
    ...rulesUnder(claudeDir, 'repo', '.claude/', repoFiles, read),
    ...skillsUnder(claudeDir, 'repo', '.claude/', read),
    ...['settings.json', 'settings.local.json'].flatMap((name) => settingsUnder(path.join(claudeDir, name), 'repo', `.claude/${name}`, read)),
    ...mcpJsonRows(path.join(repo, '.mcp.json'), 'repo', '.mcp.json', read),
  ];
}

// The user's home is not untrusted input, so this binds no root at all: no confinement.
function homeRows(home, repoFiles) {
  const claudeDir = path.join(home, '.claude');
  const read = (file) => guardedRead(file, undefined);
  return [
    ...claudeMdRows(claudeDir, 'user', '~/.claude/', ['CLAUDE.md'], read),
    ...rulesUnder(claudeDir, 'user', '~/.claude/', repoFiles, read),
    ...skillsUnder(claudeDir, 'user', '~/.claude/', read),
    ...settingsUnder(path.join(claudeDir, 'settings.json'), 'user', '~/.claude/settings.json', read),
  ];
}

// Every always-loaded context source, repo rows first then the home's.
export function measureContext({ repo, home } = {}) {
  const repoFiles = trackedFiles(repo);
  return [...repoRows(repo, repoFiles), ...(home ? homeRows(home, repoFiles) : [])];
}

function main([repo, ...rest]) {
  const homeAt = rest.indexOf('--home');
  if (!repo || (homeAt >= 0 && homeAt === rest.length - 1)) {
    process.stderr.write('usage: node scripts/audit-context.mjs <repo> [--home <dir>]\n');
    return 1;
  }
  const home = homeAt < 0 ? undefined : rest[homeAt + 1];
  const rows = measureContext({ repo: path.resolve(repo), home: home && path.resolve(home) });
  process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 1;
  }
}
