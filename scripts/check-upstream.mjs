#!/usr/bin/env node
/**
 * Reports which vendored files and which rules files have drifted from the upstream
 * installed on this machine.
 *
 * ADR 0003 copies rather than depends, so staying current is a manual re-sync and the
 * ledgers under `vendor/` are the map for doing it. A map nobody checks rots: the whole
 * point of the copy is that this project's adaptations survive, and the price is that
 * upstream can move without anything here noticing. This is what notices. It is a report
 * and not a gate — "the ledger reports drift, a human decides" is in the design's scope
 * section — so drift never makes it exit non-zero. The one failure it does report is an
 * upstream it could not find at all, because a comparison against nothing is not a
 * clean bill of health.
 *
 * What it compares, and what it deliberately ignores:
 *
 *   - the provenance header this package inserts, and the blank lines around it. The
 *     header goes after any frontmatter, which shifts every line below it; counting that
 *     as drift would mark all 137 files drifted on day one;
 *   - trailing whitespace and line endings, because upstream ships CRLF and this
 *     repository is LF by `.gitattributes`.
 *
 * A row the ledger calls `verbatim` that no longer matches upstream is drift. A row it
 * calls adapted differs by design; what it cannot tell you is whether upstream *also*
 * moved, because no hash of the file as it was taken is recorded anywhere. Those rows
 * are listed with the size of the difference, which is the size of the re-sync, and the
 * fourth ledger column says what to keep.
 *
 * Usage:
 *   node check-upstream.mjs [--root <project>=<path>] [--quiet]
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// The header pattern comes from the script that defines what a header is, rather than
// being written out a second time here. Two copies of it disagreed about a trailing
// space, and the disagreement surfaced as drift rather than as an error.
import { parseHeader, HEADER_BLOCK } from './check-provenance.mjs';

/**
 * Where a vendored file can be: the instruction surface, the rules tree, and `lib/` —
 * where the one vendored file that is not instructions sits, at the root because that
 * is where the vendored gate's own unchanged require resolves (S10, `vendor/toolbox.md`).
 */
const SCANNED = ['agents', 'skills', 'rules', 'commands', 'hooks', 'lib'];

const SKIPPED_DIRS = new Set(['node_modules', '.git']);

/**
 * Where each upstream sits once Claude Code has installed it. A marketplace clone is
 * tried first when there is one: it is a git checkout, so the report can name the commit
 * a human would diff against, where a version cache can only name the version.
 */
const KNOWN_ROOTS = {
  ecc: {
    git: [['marketplaces', 'ecc']],
    cache: [(version) => ['cache', 'ecc', 'ecc', version]],
  },
  'mattpocock-skills': {
    git: [['marketplaces', 'claude-plugins-official', 'plugins', 'mattpocock-skills']],
    cache: [(version) => ['cache', 'claude-plugins-official', 'mattpocock-skills', version]],
  },
};

const posix = (value) => value.split(path.sep).join('/');

function listDirs(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * The directories an upstream could be installed in, best first. Everything is derived
 * from the home directory passed in, so a test can point the whole search somewhere else.
 */
export function upstreamCandidates(project, version, home = os.homedir()) {
  const plugins = path.join(home, '.claude', 'plugins');
  const known = KNOWN_ROOTS[project.toLowerCase()] || { git: [], cache: [] };
  const candidates = [];
  const add = (full, kind) => {
    if (!candidates.some((candidate) => candidate.path === full)) candidates.push({ path: full, kind });
  };

  for (const rel of known.git) add(path.join(plugins, ...rel), 'git checkout');
  for (const rel of known.cache) add(path.join(plugins, ...rel(version)), 'version cache');

  // Anything installed from another marketplace, found rather than hard-coded.
  const cache = path.join(plugins, 'cache');
  for (const marketplace of listDirs(cache)) {
    add(path.join(cache, marketplace, project, version), 'version cache');
  }

  return candidates;
}

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

/** Every file carrying a provenance header, with where it says it came from. */
function vendoredFiles(root, scan = SCANNED) {
  const found = [];
  for (const dir of scan) {
    const clean = posix(dir).replace(/\/+$/, '');
    if (!fs.existsSync(path.join(root, clean))) continue;
    for (const rel of walk(root, clean)) {
      const fields = parseHeader(fs.readFileSync(path.join(root, rel), 'utf8'));
      if (!fields || !fields.upstream) continue;
      const [project, version] = fields.upstream.split(' - ')[0].trim().split(/\s+/);
      found.push({
        file: rel,
        project,
        version: version || '',
        upstream: fields.upstream.split(' - ').at(-1).trim(),
        adapted: fields.adapted || '',
        group: rel.startsWith('rules/') ? 'rules' : 'other',
      });
    }
  }
  return found.sort((a, b) => a.file.localeCompare(b.file));
}

/** Content as it can fairly be compared: no header, no blank lines, no trailing space. */
export function comparable(source) {
  return source
    .replace(/\r\n/g, '\n')
    .replace(HEADER_BLOCK, '')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .filter((line) => line !== '');
}

/**
 * Lines here that upstream does not have, and upstream lines that are not here. A
 * multiset comparison rather than a diff: it is order-insensitive, which is the right
 * answer for "how big is the re-sync", and it needs no diff algorithm to read.
 */
function lineDifference(mine, theirs) {
  const counts = new Map();
  for (const line of mine) counts.set(line, (counts.get(line) ?? 0) + 1);

  let added = 0;
  for (const line of theirs) {
    const seen = counts.get(line) ?? 0;
    if (seen > 0) counts.set(line, seen - 1);
    else added += 1;
  }
  let removed = 0;
  for (const seen of counts.values()) removed += seen;

  return { added, removed };
}

function gitFacts(root) {
  if (!fs.existsSync(path.join(root, '.git'))) return {};
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true }).trim();
  try {
    return { commit: git('rev-parse', '--short', 'HEAD'), date: git('log', '-1', '--format=%cs') };
  } catch {
    return {};
  }
}

/** The version the installed copy claims, when it says so anywhere obvious. */
function installedVersion(root) {
  const version = path.join(root, 'VERSION');
  if (fs.existsSync(version)) return fs.readFileSync(version, 'utf8').trim();
  const manifest = path.join(root, 'package.json');
  if (fs.existsSync(manifest)) {
    try {
      return JSON.parse(fs.readFileSync(manifest, 'utf8')).version || null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * The upstream file a header points at, or null when that path climbs out of the root.
 * The path comes from a header inside a file, which is data rather than code, and a
 * comparison that wandered up out of the upstream would be reading a machine at random.
 */
function upstreamFile(root, upstream) {
  const full = path.resolve(root, upstream);
  return full.startsWith(path.resolve(root) + path.sep) ? full : null;
}

const heldBy = (root, files) =>
  files.filter(({ upstream }) => {
    const full = upstreamFile(root, upstream);
    return full !== null && fs.existsSync(full);
  }).length;

/**
 * The installed copy that holds most of what we vendored from this project. Taking the
 * first candidate that holds *any* of them was wrong in a way that reads as upstream
 * having deleted things: a stray partial checkout earlier in the list would win, and
 * every file it did not hold would be reported GONE.
 */
function resolveRoot(project, version, files, options) {
  const override = (options.roots || {})[project];
  if (override) {
    return {
      path: override,
      kind: 'given on the command line',
      held: heldBy(override, files),
      ...gitFacts(override),
    };
  }

  const candidates = (options.candidates || upstreamCandidates)(project, version, options.home);
  let best = null;
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate.path)) continue;
    const held = heldBy(candidate.path, files);
    if (held === 0) continue;
    if (!best || held > best.held) best = { ...candidate, held };
    if (best.held === files.length) break;
  }
  return best ? { ...best, ...gitFacts(best.path) } : null;
}

const tally = (files) => ({
  total: files.length,
  inSync: files.filter((one) => one.state === 'in-sync').length,
  drifted: files.filter((one) => one.state === 'drifted').length,
  adapted: files.filter((one) => one.state === 'adapted').length,
  gone: files.filter((one) => one.state === 'gone').length,
});

const LABEL = { drifted: 'DRIFTED', adapted: 'adapted', gone: 'GONE', 'in-sync': 'in sync' };

function projectLines(project) {
  const lines = [];
  if (!project.found) {
    lines.push(
      `${project.project} ${project.version} — not installed on this machine.`,
      `  Looked in: ${project.looked.join(', ') || 'nowhere; no candidate path is known'}`,
      `  Point at a checkout with --root ${project.project}=<path> to compare against it.`,
      '',
    );
    return lines;
  }

  const where = [project.kind, project.commit && `at ${project.commit}`, project.date]
    .filter(Boolean)
    .join(', ');
  lines.push(`${project.project} ${project.version} — ${project.root} (${where})`);

  if (project.held < project.files.length) {
    lines.push(
      `  It holds ${project.held} of the ${project.files.length} file(s) vendored from this ` +
        'project; the rest are reported as gone, which may mean the wrong copy was found.',
    );
  }

  if (project.installedVersion && project.installedVersion !== project.version) {
    lines.push(
      `  The copy installed here says it is ${project.installedVersion}, and every header ` +
        `below says ${project.version}: the whole set may be a version behind.`,
    );
  }

  for (const [group, label] of [['rules', 'rules/'], ['other', 'agents, skills']]) {
    const counts = project.counts[group];
    if (!counts.total) continue;
    lines.push(
      `  ${label.padEnd(14)} ${String(counts.total).padStart(3)} file(s): ${counts.inSync} in sync, ` +
        `${counts.drifted} drifted, ${counts.adapted} adapted and differing, ${counts.gone} gone upstream`,
    );
  }

  const notable = project.files.filter((one) => one.state !== 'in-sync');
  if (notable.length) lines.push('');
  for (const one of notable) {
    const how =
      one.state === 'gone'
        ? `upstream no longer has ${one.upstream}`
        : `+${one.added} / -${one.removed} lines against ${one.upstream}`;
    lines.push(`  ${LABEL[one.state].padEnd(8)} ${one.file}`, `           ${how}`);
  }
  lines.push('');
  return lines;
}

/**
 * @param {string} root repository root
 * @param {{roots?: object, scan?: string[], home?: string, candidates?: Function}} options
 */
export function checkUpstream(root, options = {}) {
  const files = vendoredFiles(root, options.scan || SCANNED);
  const byProject = new Map();
  for (const file of files) {
    const key = `${file.project} ${file.version}`;
    if (!byProject.has(key)) byProject.set(key, []);
    byProject.get(key).push(file);
  }

  const projects = [];
  for (const [, theirs] of [...byProject.entries()].sort()) {
    const { project, version } = theirs[0];
    const resolved = resolveRoot(project, version, theirs, options);

    if (!resolved) {
      projects.push({
        project,
        version,
        found: false,
        looked: ((options.candidates || upstreamCandidates)(project, version, options.home) || []).map(
          (candidate) => candidate.path,
        ),
        files: theirs.map((file) => ({ ...file, state: 'unknown' })),
        counts: { rules: tally([]), other: tally([]) },
      });
      continue;
    }

    const compared = theirs.map((file) => {
      const full = upstreamFile(resolved.path, file.upstream);
      if (full === null || !fs.existsSync(full)) return { ...file, state: 'gone', added: 0, removed: 0 };

      const mine = comparable(fs.readFileSync(path.join(root, file.file), 'utf8'));
      const { added, removed } = lineDifference(mine, comparable(fs.readFileSync(full, 'utf8')));
      const same = added === 0 && removed === 0;
      const state = same ? 'in-sync' : file.adapted === 'verbatim' ? 'drifted' : 'adapted';
      return { ...file, state, added, removed };
    });

    projects.push({
      project,
      version,
      found: true,
      root: resolved.path,
      kind: resolved.kind,
      commit: resolved.commit || null,
      date: resolved.date || null,
      held: resolved.held,
      installedVersion: installedVersion(resolved.path),
      files: compared,
      counts: {
        rules: tally(compared.filter((one) => one.group === 'rules')),
        other: tally(compared.filter((one) => one.group !== 'rules')),
      },
    });
  }

  const lines = projects.flatMap(projectLines);
  const drifted = projects.reduce(
    (sum, one) => sum + one.counts.rules.drifted + one.counts.other.drifted + one.counts.rules.gone + one.counts.other.gone,
    0,
  );
  lines.push(
    drifted
      ? `${drifted} file(s) marked DRIFTED or GONE: a row the ledger calls verbatim no longer matches upstream.`
      : 'No file the ledger calls verbatim has drifted from upstream.',
    'An adapted row differs on purpose; nothing here can tell you whether upstream moved as',
    'well, so re-sync by diffing it and keeping what the ledger\'s fourth column describes.',
  );

  return { ok: projects.every((one) => one.found), projects, lines };
}

const USAGE = [
  'Usage: node scripts/check-upstream.mjs [--root <project>=<path>] [--quiet]',
  '',
  '  --root   compare one project against this directory instead of the installed copy',
  '  --quiet  print only the summary counts, not every differing file',
].join('\n');

export function parseArgs(argv) {
  const options = { roots: {} };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') return { help: true };
    if (flag === '--quiet') {
      options.quiet = true;
      continue;
    }
    if (flag !== '--root') throw new Error(`Unknown argument ${flag}.\n${USAGE}`);
    const value = argv[i + 1];
    if (!value || !value.includes('=')) {
      throw new Error(`--root needs <project>=<path> after it.\n${USAGE}`);
    }
    const at = value.indexOf('=');
    options.roots[value.slice(0, at)] = value.slice(at + 1);
    i++;
  }
  return options;
}

function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    console.log(USAGE);
    return;
  }

  const { ok, lines } = checkUpstream(process.cwd(), options);
  let lastWasBlank = false;
  for (const line of lines) {
    if (options.quiet && /^\s+(DRIFTED|adapted|GONE|\+|upstream)/.test(line)) continue;
    if (line === '' && lastWasBlank) continue;
    lastWasBlank = line === '';
    console.log(line);
  }
  if (!ok) {
    console.error('At least one upstream could not be found, so this is not a clean comparison.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2));
}
