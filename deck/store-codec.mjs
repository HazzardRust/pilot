/**
 * The store codec (portable-store L1, L2, L3): `deck.json` holds every structured path as a stored path,
 * `@<root>/<rel>` with `/` separators, against the machine's roots; in memory the deck keeps absolute paths and
 * folded keys as before. Pure but for the realpath that collapses spellings of one directory (L2).
 */

import fs from 'node:fs';
import path from 'node:path';

import { hostPlatform, pathKey } from '../hooks/lib/platform.js';

/**
 * Every structured path of the store (F2): `[]` walks a list, a trailing `{}` names a map whose keys are paths.
 * Prose (bodies, replies, titles, urls, screens, landing lines, friction) keeps its words (A1).
 */
export const PATH_FIELDS = Object.freeze([
  'items[].repo',
  'items[].dir',
  'runs[].repo',
  'runs[].slices[].worktree',
  'records[].repo',
  'records[].record.worktree',
  'records[].record.slices[].worktree',
  'records[].record.report.worktreesLeft[]',
  'records[].record.qa.worktree',
  'added[].repo',
  'decks{}',
  'coPilots{}',
  'switches{}',
  'budgets{}',
]);

/** The fields held folded in memory, so a decoded value is re-folded by `pathKey` (F3). */
const FOLDED = new Set(['records[].repo', 'decks{}', 'coPilots{}', 'switches{}', 'budgets{}']);

const WIN_ABS = /^[A-Za-z]:[\\/]/;
const DRIVE_ROOT = /^drive-([a-z])$/;
const STORED = /^@([^/\\]+)\/(.*)$/s;

/** The path flavour of an absolute path, or null for anything else (relative, UNC, empty). */
const flavourOf = (p) => {
  if (typeof p !== 'string') return null;
  if (WIN_ABS.test(p)) return path.win32;
  return p.startsWith('/') && !p.startsWith('//') ? path.posix : null;
};

/** The roots a machine has without being told (L3): `home`, and the home's drive on win32 or `/` elsewhere. */
export function defaultRoots(home, platform) {
  if (platform === 'win32') return { home, [`drive-${home[0].toLowerCase()}`]: `${home[0].toUpperCase()}:\\` };
  return { home, root: '/' };
}

/** A root's directory: a named one, or any drive by its letter (L3: one per drive, derived). */
const rootDir = (name, roots) => {
  if (Object.hasOwn(roots, name)) return roots[name];
  const drive = DRIVE_ROOT.exec(name);
  return drive ? `${drive[1].toUpperCase()}:\\` : undefined;
};

const SPELLED = new Map();
const SPELLED_MAX = 8192;

/**
 * `abs` resolved, in its realpath's case when it exists on this host (L2, see `caseOnly`), so `projects` and
 * `Projects` are one stored path. A path that does not exist, or cannot be read, keeps its resolved spelling: the spelling is never a
 * reason to refuse a write, as `pathKey` never refuses a key. Remembered per process, misses included, since a
 * store write encodes thousands of worktrees that are long gone.
 */
function spelled(abs, P) {
  const resolved = P.resolve(abs);
  if (P !== (hostPlatform() === 'win32' ? path.win32 : path.posix)) return resolved;
  if (SPELLED.has(resolved)) return SPELLED.get(resolved);
  // A missing path takes its deepest existing ancestor's realpath, so it meets a root spelled through a link or an
  // 8.3 name (C:\Users\RUNNER~1) the way the root itself is spelled; with no readable ancestor it keeps its spelling.
  let real = resolved;
  for (let dir = resolved, rest = []; ; rest.unshift(P.basename(dir)), dir = P.dirname(dir)) {
    try {
      real = P.join(fs.realpathSync.native(dir), ...rest);
      break;
    } catch (error) {
      // Only a missing ancestor is walked past; anything else (EACCES, ELOOP) keeps the given spelling.
      if (!['ENOENT', 'ENOTDIR'].includes(error.code) || P.dirname(dir) === dir) break;
    }
  }
  const kept = caseOnly(resolved, real);
  if (SPELLED.size >= SPELLED_MAX) SPELLED.clear();
  SPELLED.set(resolved, kept);
  return kept;
}

/**
 * Assumed, L2 narrowed to case (user question pending): the realpath's spelling is taken only where it differs from
 * the given one by case, so `projects` stores as `Projects` while a junction, symlink, 8.3 name (`RUNNER~1`) or
 * macOS `/var` keeps the spelling it was given and reads back as it. L2 as written is this returning `real`. Linux
 * folds no case, so there a case-only difference is a symlink to another directory and the given spelling stands.
 */
const caseOnly = (resolved, real) =>
  hostPlatform() !== 'linux' && real.toLowerCase() === resolved.toLowerCase() ? real : resolved;

/**
 * `abs` as `@<root>/<rel>` under the deepest root holding it; anything not absolute in the roots' own flavour (a
 * Windows-shaped fixture on a posix host, a posix path on win32), or under no root, as it is, never resolved.
 */
export function encodePath(abs, roots) {
  const P = flavourOf(abs);
  if (!P || !Object.values(roots).some((dir) => flavourOf(dir) === P)) return abs;
  const real = spelled(abs, P);
  const fold = P === path.win32 ? (s) => s.toLowerCase() : (s) => s;
  const drive = P === path.win32 ? { [`drive-${real[0].toLowerCase()}`]: `${real[0].toUpperCase()}:\\` } : {};
  let best = null;
  for (const [name, dir] of Object.entries({ ...drive, ...roots })) {
    if (flavourOf(dir) !== P) continue;
    const realDir = spelled(dir, P);
    const base = realDir.endsWith(P.sep) ? realDir : realDir + P.sep;
    if (!fold(real + P.sep).startsWith(fold(base))) continue;
    if (!best || base.length > best.base.length) best = { name, base };
  }
  if (!best) return abs;
  return `@${best.name}/${real.slice(best.base.length).split(P.sep).join('/')}`;
}

/** A stored path as the absolute path it names here; throws on a non-stored value, `..`, or an unknown root (L5). */
export function decodePath(stored, roots) {
  const match = typeof stored === 'string' ? STORED.exec(stored) : null;
  if (!match) throw new Error(`not a stored path: ${JSON.stringify(stored)}`);
  const [, name, rel] = match;
  const dir = rootDir(name, roots);
  const P = flavourOf(dir);
  if (!P) throw new Error(`stored path ${stored} names root ${name}, which this machine does not have`);
  // A backslash separates on win32 only; under a posix root it is a character of the name, as encodePath kept it.
  const segments = rel.split(P === path.win32 ? /[\\/]/ : '/');
  if (segments.includes('..')) throw new Error(`stored path ${stored} climbs out of its root`);
  return P.join(dir, ...segments.filter(Boolean));
}

const isMap = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** `field`'s steps: `items[].repo` is `items`, `[]`, `repo`. */
const stepsOf = (field) => field.split('.').flatMap((part) => (part.endsWith('[]') || part.endsWith('{}') ? [part.slice(0, -2), part.slice(-2)] : [part]));

/** `value` with `change` applied at `steps`, copied on the way down; a step that is absent leaves it as it is. */
function mapAt(value, steps, change, field) {
  if (steps.length === 0) return change(value);
  const [step, ...rest] = steps;
  if (step === '[]') return Array.isArray(value) ? value.map((entry) => mapAt(entry, rest, change, field)) : value;
  if (step === '{}') {
    if (!isMap(value)) return value;
    const next = {};
    for (const [key, entry] of Object.entries(value)) {
      const changed = change(key);
      // Two keys meeting in one would drop an entry silently, so the codec refuses (L2: spellings collapse first).
      if (Object.hasOwn(next, changed)) throw new Error(`${field}: keys ${JSON.stringify(key)} and another both read ${changed}`);
      next[changed] = entry;
    }
    return next;
  }
  if (!isMap(value) || !Object.hasOwn(value, step)) return value;
  return { ...value, [step]: mapAt(value[step], rest, change, field) };
}

const eachField = (deck, changeFor) => PATH_FIELDS.reduce((next, field) => mapAt(next, stepsOf(field), changeFor(field), field), deck);

/** The deck as `deck.json` holds it: every field and map key of `PATH_FIELDS` encoded. */
export function toStored(deck, roots) {
  return eachField(deck, () => (value) => (typeof value === 'string' ? encodePath(value, roots) : value));
}

/** The deck as memory holds it: every stored path decoded, and map keys and `records[].repo` re-folded by `pathKey`. */
export function fromStored(stored, roots) {
  return eachField(stored, (field) => (value) => {
    if (typeof value !== 'string' || !value.startsWith('@')) return value;
    const abs = decodePath(value, roots);
    if (!FOLDED.has(field)) return abs;
    // Another host's flavour is folded by its own rule, never resolved against this host's cwd.
    if (flavourOf(abs) === (hostPlatform() === 'win32' ? path.win32 : path.posix)) return pathKey(abs);
    return flavourOf(abs) === path.win32 ? abs.toLowerCase() : abs;
  });
}

/** Version 3 to version 4 (L6): the same deck with its paths stored against `roots`. */
export function upgradeV3(deck, roots) {
  if (deck.version !== 3) throw new Error(`upgradeV3 takes a version 3 deck, not version ${deck.version}`);
  return { ...toStored(deck, roots), version: 4 };
}
