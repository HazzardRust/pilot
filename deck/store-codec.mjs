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
 * `abs` resolved, in its realpath spelling when it exists on this host (L2), so `projects` and `Projects` are one
 * stored path. A path that does not exist, or cannot be read, keeps its resolved spelling: the spelling is never a
 * reason to refuse a write, as `pathKey` never refuses a key. Remembered per process, misses included, since a
 * store write encodes thousands of worktrees that are long gone.
 */
function spelled(abs, P) {
  const resolved = P.resolve(abs);
  if (P !== (hostPlatform() === 'win32' ? path.win32 : path.posix)) return resolved;
  if (SPELLED.has(resolved)) return SPELLED.get(resolved);
  let real = resolved;
  try {
    real = fs.realpathSync.native(resolved);
  } catch {
    // Missing or unreadable: kept as spelled (see above).
  }
  if (SPELLED.size >= SPELLED_MAX) SPELLED.clear();
  SPELLED.set(resolved, real);
  return real;
}

/** `abs` as `@<root>/<rel>` under the deepest root holding it; anything not absolute, or under no root, as it is. */
export function encodePath(abs, roots) {
  const P = flavourOf(abs);
  if (!P) return abs;
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
  const segments = rel.split(/[\\/]/);
  if (segments.includes('..')) throw new Error(`stored path ${stored} climbs out of its root`);
  const dir = rootDir(name, roots);
  const P = flavourOf(dir);
  if (!P) throw new Error(`stored path ${stored} names root ${name}, which this machine does not have`);
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
const encoded = (deck, roots) => eachField(deck, () => (value) => (typeof value === 'string' ? encodePath(value, roots) : value));

/** A run's fields that name this machine's process (F4), kept in the machine file by run id. */
const SESSION = ['pid', 'session', 'lastSeenAt'];

/**
 * The deck split as the store keeps it (spec 2, F4): `stored`, what `deck.json` holds, every field and map key of
 * `PATH_FIELDS` encoded and no machine state; `machine`, the machine file's state with absolute keys, no roots.
 */
export function toStored(deck, roots) {
  const { coPilots, switches, ...portable } = deck;
  // A map the deck has, even empty, is kept; one it lacks stays absent (`JSON.stringify` drops undefined).
  const machine = { sessions: {}, coPilots, switches, live: [], landingPids: {} };
  // Only what has an id to be found by moves: anything else stays where it is, so nothing is dropped.
  const runs = (portable.runs ?? []).map((run) => {
    if (!isMap(run) || typeof run.id !== 'string') return run;
    const session = Object.fromEntries(SESSION.filter((name) => run[name] !== undefined).map((name) => [name, run[name]]));
    if (Object.keys(session).length > 0) machine.sessions[run.id] = session;
    return Object.fromEntries(Object.entries(run).filter(([name]) => !SESSION.includes(name)));
  });
  const items = (portable.items ?? []).map((item) => {
    if (!isMap(item) || typeof item.id !== 'string') return item;
    const { live, ...rest } = item;
    if (live === true) machine.live.push(item.id);
    if (!isMap(item.landing) || !Number.isInteger(item.landing.pid)) return rest;
    machine.landingPids[item.id] = item.landing.pid;
    const { pid, ...landing } = item.landing;
    return { ...rest, landing };
  });
  return { stored: encoded({ ...portable, ...(portable.runs && { runs }), ...(portable.items && { items }) }, roots), machine };
}

/**
 * The deck as memory holds it: every stored path decoded, map keys and `records[].repo` re-folded by `pathKey`, and
 * the machine file's state rejoined. Machine state a `deck.json` from before the split still holds is read too, the
 * machine file winning entry by entry; the next write moves it out. Winning only adds or overrides: a pre-split
 * `deck.json` put back by hand (`pilot store restore`, a version backup) brings its leases and live marks back with it.
 */
export function fromStored(stored, machine, roots) {
  const deck = { ...eachField(stored, (field) => (value) => {
    if (typeof value !== 'string' || !value.startsWith('@')) return value;
    const abs = decodePath(value, roots);
    if (!FOLDED.has(field)) return abs;
    // Another host's flavour is folded by its own rule, never resolved against this host's cwd.
    if (flavourOf(abs) === (hostPlatform() === 'win32' ? path.win32 : path.posix)) return pathKey(abs);
    return flavourOf(abs) === path.win32 ? abs.toLowerCase() : abs;
  }) };
  // A map neither file holds reads absent, and one either holds, even empty, reads as a map, as before the split.
  for (const name of ['coPilots', 'switches']) {
    if (deck[name] !== undefined || machine[name] !== undefined) deck[name] = { ...deck[name], ...machine[name] };
  }
  if (Array.isArray(deck.runs)) deck.runs = deck.runs.map((run) => (isMap(run) && isMap(machine.sessions[run.id]) ? { ...run, ...machine.sessions[run.id] } : run));
  if (Array.isArray(deck.items)) {
    deck.items = deck.items.map((item) => {
      if (!isMap(item)) return item;
      const live = machine.live.includes(item.id) ? { live: true } : {};
      const pid = machine.landingPids[item.id];
      return { ...item, ...live, ...(isMap(item.landing) && pid !== undefined && { landing: { ...item.landing, pid } }) };
    });
  }
  return deck;
}

/** Version 3 to version 4 (L6): the same deck with its paths stored against `roots`; its machine state moves at the next write. */
export function upgradeV3(deck, roots) {
  if (deck.version !== 3) throw new Error(`upgradeV3 takes a version 3 deck, not version ${deck.version}`);
  return { ...encoded(deck, roots), version: 4 };
}
