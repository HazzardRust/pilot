#!/usr/bin/env node
/**
 * Copies this package's `rules/` into a friend's `~/.claude/rules/`, and brings an
 * earlier copy up to date.
 *
 * Why a copy and not a reference: Claude Code loads rules from `.claude/rules/`
 * only, and a plugin can carry files but cannot register them as loaded context
 * (ADR 0008). Symlinks were rejected because they need developer mode on
 * Windows. So the install copies, and the copy is the one part of the install
 * that touches a hundred and forty files in someone else's home directory.
 *
 * What it may change there is decided by one ledger, `shipped-rules.json`: the sha256
 * of every version of every file this package ever shipped under `rules/`, generated
 * from git history by `build-rules-ledger.mjs` (ADR 0055).
 *
 *   - a file whose bytes match a version we shipped, under that same path, is ours: it
 *     is replaced with the current one, or deleted when we no longer ship that path;
 *   - anything else - a file a friend edited by even a byte, a file they wrote, a file
 *     from another plugin - is theirs. It is left byte-for-byte alone and named;
 *   - a file that is already identical is not rewritten, so a second run changes
 *     nothing on disk and says so;
 *   - written, updated, already there, deleted and left alone are different answers,
 *     and the report keeps them apart.
 *
 * Usage:
 *   node install-rules.mjs [--target <dir>] [--source <dir>] [--dry-run]
 *   node install-rules.mjs --repair [--target <dir>] [--state <dir>]
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import atomicWrite from '../hooks/lib/atomic-write.js';
import { RULES_LEDGER, filesUnder } from './build-rules-ledger.mjs';
import { isInPluginCache } from './install-settings.mjs';
import { listOf, split } from './measure-prompt.mjs';
import { readReach, rootRules, rulesPlan } from './reach.mjs';

const { atomicWriteFileSync, privateDir } = atomicWrite;

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The rules tree that ships in this package, from where this script sits. */
export function rulesSource() {
  return path.join(path.resolve(HERE, '..'), 'rules');
}

/** Where the harness reads rules from when nothing overrides it. */
export function defaultRulesTarget(home = os.homedir()) {
  return path.join(home, '.claude', 'rules');
}

// Byte comparison, not a normalised one. A friend's copy that differs only in
// line endings is still their file, and rewriting it to ours would be the
// overwrite this script exists to refuse.
function sameBytes(a, b) {
  try {
    return fs.readFileSync(a).equals(fs.readFileSync(b));
  } catch {
    return false;
  }
}

// A missing or unreadable file is not a shipped copy, so it is never replaced or deleted.
export function isShippedCopy(ledger, at, file) {
  try {
    return Object.hasOwn(ledger, file) && ledger[file].includes(createHash('sha256').update(fs.readFileSync(at)).digest('hex'));
  } catch {
    return false;
  }
}

// L4: a scoped rule has `paths:` in its frontmatter; the two without are always on. Read as
// measure-rules reads it, so the install and the measure agree on which rules load at start.
export function isScoped(from) {
  return listOf(split(fs.readFileSync(from, 'utf8')).front, 'paths').length > 0;
}

/** Which shipped rules `only` keeps: `all`, `scoped`, `always` or `none`. */
function selected(source, files, only) {
  if (only === 'all') return files;
  if (only === 'none') return [];
  return files.filter((file) => isScoped(path.join(source, file)) === (only === 'scoped'));
}

/**
 * Whether writing `to` lands inside `target`: the nearest part of it that exists, once
 * every link is resolved, has to sit under the resolved target. A directory link in the
 * target pointing elsewhere would otherwise carry the write out of it.
 */
function landsInside(target, to) {
  if (!fs.existsSync(target)) return true; // Created fresh, so nothing in it can be a link.
  let at = to;
  while (!fs.existsSync(at)) at = path.dirname(at);
  const root = fs.realpathSync(target);
  const real = fs.realpathSync(at);
  return real === root || real.startsWith(root + path.sep);
}

/** Remove each directory `file` sat in that is now empty, up to but never `target`. */
function removeEmptied(target, file) {
  for (let dir = path.dirname(file); dir !== '.'; dir = path.dirname(dir)) {
    try {
      fs.rmdirSync(path.join(target, dir));
    } catch {
      return; // Not empty, or already gone: either way it is not ours to remove.
    }
  }
}

const countOf = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`;
const listed = (items) => items.map(({ file }) => `    ${file}`);

function summarise({ written, updated, identical, differing, pruned, failed, dryRun, target }) {
  const notes = [];
  const would = (done, maybe) => (dryRun ? maybe : done);
  notes.push(
    `${countOf(written.length, 'file')} ${would('written', 'would be written')} to ${target}; ` +
      `${updated.length} ${would('updated', 'would be updated')}; ` +
      `${identical.length} already present and identical; ` +
      `${countOf(differing.length, 'file')} left alone.`,
  );
  if (updated.length) {
    notes.push(
      `These were a copy an earlier version of this package shipped, and ${would('have been', 'would be')} replaced with the current one:`,
      ...listed(updated),
    );
  }
  const left = (reason) => differing.filter((item) => item.reason === reason);
  if (left('edited').length) {
    notes.push(
      'These match no version this package shipped, and have not been touched.',
      'Compare them yourself if you want this package\'s version:',
      ...listed(left('edited')),
    );
  }
  if (left('retired').length) {
    notes.push(
      'These are no longer shipped, but differ from every copy that was, and have not been deleted:',
      ...listed(left('retired')),
    );
  }
  if (left('own').length) {
    notes.push('These are not files this package ever shipped, and have not been touched:', ...listed(left('own')));
  }
  if (pruned.length) {
    notes.push(
      `These are no longer shipped and were byte-identical to a copy that was, and ${would('have been', 'would be')} deleted:`,
      ...listed(pruned),
    );
  }
  if (failed.length) {
    notes.push(
      'These could not be written or deleted, and the rest of the run carried on without them:',
      ...failed.map(({ file, error }) => `    ${file} - ${error}`),
    );
  }
  if (!written.length && !updated.length && !differing.length && !pruned.length && !failed.length) {
    notes.push('Every rules file is already in place. Nothing was changed.');
  }
  return notes;
}

/**
 * Bring `target` to the rules tree at `source`, touching only what `ledger` says we
 * shipped. Returns `written`, `updated`, `identical`, `differing` (each with a `reason`:
 * `edited`, `retired` or `own`), `pruned` and `failed` as disjoint lists of `{ file }`;
 * `changed` is true only when something on disk actually changed.
 *
 * `only` (plain-session L4) narrows what is installed to `scoped`, `always` or `none`; a
 * shipped copy outside it is pruned like a retired path, and an edited one is left and named.
 */
export function installRules(options = {}) {
  const source = options.source || rulesSource();
  const target = options.target || defaultRulesTarget();
  const dryRun = Boolean(options.dryRun);
  // No ledger, no install: without it a stale copy and a friend's edit look the same.
  const ledger = options.ledger || JSON.parse(fs.readFileSync(RULES_LEDGER, 'utf8'));

  const written = [];
  const updated = [];
  const identical = [];
  const differing = [];
  const pruned = [];
  const failed = [];

  const all = filesUnder(source);
  const shipped = selected(source, all, options.only || 'all');
  for (const file of shipped) {
    const from = path.join(source, file);
    const to = path.join(target, file);
    const exists = fs.existsSync(to);

    if (exists && sameBytes(from, to)) {
      identical.push({ file });
      continue;
    }
    if (exists && !isShippedCopy(ledger, to, file)) {
      differing.push({ file, reason: 'edited' });
      continue;
    }

    // One file that cannot be written - a permission, a full disk, a directory sitting
    // where a file has to go - is not a reason to abandon the other hundred and thirty.
    // It is a reason to say which one, which a throw from inside the loop would not.
    try {
      if (!landsInside(target, to)) throw new Error('reached through a link out of the target; not written');
      if (!dryRun) {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        // A buffer, not a decoded string: the copy is meant to be byte-identical, and a
        // UTF-8 round trip would quietly rewrite anything that is not valid UTF-8.
        atomicWriteFileSync(to, fs.readFileSync(from));
      }
      (exists ? updated : written).push({ file });
    } catch (err) {
      failed.push({ file, error: err.message });
    }
  }

  const current = new Set(shipped);
  const stillShipped = new Set(all);
  for (const file of fs.existsSync(target) ? filesUnder(target) : []) {
    if (current.has(file)) continue;
    if (!isShippedCopy(ledger, path.join(target, file), file)) {
      const reason = stillShipped.has(file) ? 'edited' : Object.hasOwn(ledger, file) ? 'retired' : 'own';
      differing.push({ file, reason });
      continue;
    }
    try {
      if (!dryRun) {
        fs.rmSync(path.join(target, file));
        removeEmptied(target, file);
      }
      pruned.push({ file });
    } catch (err) {
      failed.push({ file, error: err.message });
    }
  }

  return {
    source,
    target,
    dryRun,
    ok: failed.length === 0,
    changed: !dryRun && written.length + updated.length + pruned.length > 0,
    written,
    updated,
    identical,
    differing,
    pruned,
    failed,
    notes: summarise({ written, updated, identical, differing, pruned, failed, dryRun, target }),
  };
}

/** Where the repair remembers which edited rules it has already named: the deck's state dir. */
function defaultStateDir(home = os.homedir()) {
  return path.join(home, '.claude', 'pilot-inbox');
}

function readNamed(file) {
  try {
    const names = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(names) ? names : [];
  } catch {
    return []; // Never written, or unreadable: the cost is naming the edits once more.
  }
}

/**
 * `--repair`: `installRules` on a SessionStart trigger (ADR 0079). Nothing new decides
 * what is ours; the ledger does, as for the install. What is new is when it speaks: a
 * message when a file changed or could not be, and an edited rule named only while the
 * set of edited rules holds one this hook has not named before, so an edit kept on
 * purpose is not repeated into every session. `message` is null when there is nothing
 * to say.
 *
 * Which rules go where is the stored reach's (plain-session L4): `rulesPlan(level).home` into
 * `<home>/.claude/rules`, `.root` into the rules root's `.claude/rules`. Given a `target`, the
 * repair is today's: every rule there and nothing else, whatever a home's reach says.
 */
export function repairRules(options = {}) {
  const home = options.home || os.homedir();
  const plan = options.target ? rulesPlan('everything') : rulesPlan(readReach({ home }).level);
  const install = (target, only) => installRules({ target, only, source: options.source, ledger: options.ledger });
  const reports = [{ label: '', report: install(options.target || defaultRulesTarget(home), plan.home) }];
  if (!options.target) {
    reports.push({ label: 'rules-root/', report: install(rootRules({ home }), plan.root) });
  }
  const stateFile = path.join(options.stateDir || defaultStateDir(home), 'rules-edited.json');
  const edited = reports
    .flatMap(({ label, report }) => report.differing.filter((item) => item.reason !== 'own').map((item) => label + item.file))
    .sort();
  const named = new Set(readNamed(stateFile));
  const newEdit = edited.some((file) => !named.has(file));
  if (edited.length !== named.size || newEdit) {
    try {
      // The default state dir is inside the store, which this may be first to make (L6); a --state of the user's own is left alone.
      if (options.stateDir) fs.mkdirSync(path.dirname(stateFile), { recursive: true });
      else privateDir(path.dirname(stateFile));
      atomicWriteFileSync(stateFile, `${JSON.stringify(edited)}\n`);
    } catch {
      // Unremembered, the edits are named again next session; that beats losing this message.
    }
  }

  const parts = [];
  for (const { report } of reports) {
    if (!report.changed) continue;
    parts.push(
      `pilot rules brought up to this version in ${report.target}: ` +
        `${report.updated.length} updated, ${report.written.length} added, ${report.pruned.length} deleted.`,
    );
  }
  if (newEdit) {
    parts.push(`Left alone because they differ from every copy shipped: ${edited.join(', ')}. Run install-rules.mjs to compare.`);
  }
  const failed = reports.flatMap(({ label, report }) => report.failed.map(({ file, error }) => `${label}${file} (${error})`));
  if (failed.length) parts.push(`Could not be written or deleted: ${failed.join(', ')}.`);
  const changed = reports.some(({ report }) => report.changed);
  return { changed, message: parts.length ? parts.join(' ') : null };
}

/**
 * `pilot uninstall`'s half of `installRules`: delete each file in `target` the ledger says
 * we shipped at that path, byte for byte, and each directory that leaves empty; and the
 * repair's state file, which only named edits to them. An edited copy stays and is named in
 * `kept`; a file the ledger never heard of is the user's and is not looked at. With `dryRun`
 * it only reports. `filesUnder` follows no links, so nothing outside `target` is reached.
 */
export function removeShippedRules(options = {}) {
  const target = options.target || defaultRulesTarget(options.home);
  const ledger = JSON.parse(fs.readFileSync(RULES_LEDGER, 'utf8'));
  const removed = [];
  const kept = [];
  for (const file of fs.existsSync(target) ? filesUnder(target) : []) {
    if (!isShippedCopy(ledger, path.join(target, file), file)) {
      if (Object.hasOwn(ledger, file)) kept.push(file);
      continue;
    }
    if (!options.dryRun) {
      fs.rmSync(path.join(target, file));
      removeEmptied(target, file);
    }
    removed.push(file);
  }
  if (!options.dryRun) fs.rmSync(path.join(options.stateDir || defaultStateDir(options.home), 'rules-edited.json'), { force: true });
  return { removed, kept };
}

const USAGE = [
  'Usage: node install-rules.mjs [--target <dir>] [--source <dir>] [--dry-run]',
  '       node install-rules.mjs --repair [--target <dir>] [--state <dir>]',
  '',
  '  --target   the rules directory to copy into (default: ~/.claude/rules)',
  '  --source   the rules tree to copy from (default: the rules/ beside this script)',
  '  --dry-run  report what would be written, and write nothing',
  '  --repair   the SessionStart hook: the same copy, one JSON line only when there is news',
  '  --state    where --repair remembers the edited rules it named (default: ~/.claude/pilot-inbox)',
].join('\n');

export function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') return { help: true };
    if (flag === '--dry-run' || flag === '--repair') {
      options[flag === '--repair' ? 'repair' : 'dryRun'] = true;
      continue;
    }
    const key = { '--target': 'target', '--source': 'source', '--state': 'stateDir' }[flag];
    if (!key) throw new Error(`Unknown argument ${flag}.\n${USAGE}`);
    const value = argv[i + 1];
    if (value === undefined) throw new Error(`${flag} needs a path after it.\n${USAGE}`);
    options[key] = value;
    i++;
  }
  if (options.repair && options.dryRun) throw new Error(`--repair always writes; drop --dry-run.\n${USAGE}`);
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

  if (options.repair) {
    // Unattended, at every session start: the real home is written only from a
    // plugin in the cache, never from a worktree that can vanish (as for the status line).
    if (!options.target && !isInPluginCache(path.resolve(HERE, '..'))) {
      console.error(`--repair: ${path.resolve(HERE, '..')} is not inside the plugin cache; nothing was changed.`);
      return;
    }
    try {
      const { message } = repairRules(options);
      if (message) console.log(JSON.stringify({ systemMessage: message }));
    } catch (err) {
      console.error(`--repair: ${err.message}`);
      process.exitCode = 1;
    }
    return;
  }

  let report;
  try {
    report = installRules(options);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  }
  for (const note of report.notes) console.log(note);
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2));
}
