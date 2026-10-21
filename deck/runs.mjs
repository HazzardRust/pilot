/**
 * What a run is, and whether its session is still there.
 *
 * A run is one piloted feature in one repository: the session Claude Code is
 * running, identified by the repository it sits in and the pid of the stdio
 * client that registered it. L3 says several runs share one deck, so the deck
 * has to be able to say which sessions are live — otherwise every session that
 * was ever opened stays on the page for ever.
 *
 * Liveness is the session's pid, asked of the operating system at the moment
 * the question is put. That is deliberately the cheapest answer that works on
 * Windows as well as POSIX: no heartbeat to keep alive, no timer in the daemon,
 * no state to expire, and a session that is killed hard (which is how a Claude
 * Code session usually ends) disappears from the deck without having had to say
 * goodbye. What it buys with that is one inaccuracy: pids are reused, so a run
 * can be held up by an unrelated process that happened to inherit its number.
 * The cost of being wrong is a stale row on a page, which the next registration
 * clears.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { MAX_STATE_CHARS } from './status.mjs';
import { MAX_FEATURE_CHARS, MAX_FINDINGS, MAX_SLUG_CHARS } from './tools.mjs';

/**
 * The most runs the deck will keep. Dead runs are dropped on every
 * registration, so this only binds if sessions leak faster than they are
 * replaced — and a deck page listing hundreds of rows would be useless anyway.
 */
export const MAX_RUNS = 32;

/** What a session key may be: a UUID is 36 of these, so the length is room, not a target. */
const SESSION_KEY = /^[\w-]{1,200}$/;

/**
 * The longest name the pilot may give its run. The number lives in `tools.mjs`
 * because the schema that advertises the field has to carry it too, and that
 * file is the one below both halves of the deck; it is re-exported here because
 * this is the module that decides what a run is called (D9 of run-tabs).
 */
export { MAX_FEATURE_CHARS };

/** Refusal of a run that is not one. Its own class so the store can rewrap it. */
export class RunRefusal extends Error {
  constructor(message) {
    super(message);
    this.name = 'RunRefusal';
  }
}

/**
 * The short name the page shows. `path.basename` is wrong for a bare drive or a
 * root, both of which give '' — in that case the whole path is the best name
 * there is.
 *
 * The trailing-separator strip is deliberately kept although no test can kill it:
 * `path.basename` already ignores separators native to the platform, so on Windows
 * this changes nothing, and the case it does change — a backslash-terminated path
 * read on POSIX — cannot arise while `repo` comes from the session's own `cwd`.
 * It stays as the cheap guard it is; a mutation run reporting it is right, and
 * removing it would trade a dead line for a platform-dependent one.
 */
export function runName(repo) {
  return path.basename(repo.replace(/[\\/]+$/, '')) || repo;
}

/**
 * The name the pilot gives its run, trimmed, or the refusal that says which
 * rule it broke. This lives here because this module owns what a run is called
 * (D9 of run-tabs): `runName` is the fallback the pilot is overriding, and the two answers
 * to "what does this tab say" belong side by side.
 *
 * A name that was sent but says nothing is refused rather than read as "go back
 * to the directory name", exactly as an empty `after` is refused rather than
 * read as "this slice comes first": leaving the field out is how the pilot says
 * that, and a blank one is the pilot meaning something it did not type. An
 * over-long one is refused rather than cut down, because a tab ending in an
 * ellipsis is a name the user cannot read and the pilot cannot tell was
 * shortened.
 */
export function featureName(feature) {
  if (typeof feature !== 'string') throw new RunRefusal('feature must be a string');
  const text = feature.trim();
  if (text === '') {
    throw new RunRefusal(
      'feature must name what this run is building; it is what the tab reads. ' +
        'Leave it out to keep the name the run already has.',
    );
  }
  if (text.length > MAX_FEATURE_CHARS) {
    throw new RunRefusal(
      `that feature name is longer than a tab (${MAX_FEATURE_CHARS} characters). ` +
        'The strip is read at a glance; name the feature, not what it does.',
    );
  }
  return text;
}

// "The same directory" is spelled once on the daemon's side, in `items.mjs`
// (L13); re-exported here because this is where its callers have always found it.
export { repoKey, sameRepo } from './items.mjs';

/** The repository a checkout belongs to: itself, or the one a worktree's `.git` file names. */
export function repoOf(dir) {
  try {
    const marker = path.join(dir, '.git');
    if (fs.statSync(marker).isDirectory()) return dir;
    const named = /^gitdir:\s*(.+?)\s*$/m.exec(fs.readFileSync(marker, 'utf8'))?.[1];
    // Resolved before it is read, so a `..` cannot walk one repository's path off to another's.
    const gitdir = named ? path.resolve(dir, named).replace(/\\/g, '/') : '';
    const at = gitdir.lastIndexOf('/.git/worktrees/');
    return at === -1 ? null : gitdir.slice(0, at);
  } catch {
    return null;
  }
}

/** One run, validated. The caller supplies the identity; the deck supplies the id. */
export function newRun({ repo, pid, session, now = new Date() }) {
  if (typeof repo !== 'string' || repo.trim() === '') {
    throw new RunRefusal('repo must be the path of the repository the session is in');
  }
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new RunRefusal(`pid must be the session's process id, not ${JSON.stringify(pid)}`);
  }
  // The key the client minted once (session-row A1). Absent from an older client, which
  // is replaced as before (L2); never echoed back in a refusal.
  if (session !== undefined && (typeof session !== 'string' || !SESSION_KEY.test(session))) {
    throw new RunRefusal('session must be the key this session minted: 1-200 letters, digits, - or _');
  }

  // One moment, written twice: a run that has just registered was last seen
  // registering, which is the first activity it has (D12).
  const at = now.toISOString();
  return {
    id: `run_${crypto.randomBytes(6).toString('hex')}`,
    repo,
    name: runName(repo),
    pid,
    startedAt: at,
    lastSeenAt: at,
    ...(session === undefined ? {} : { session }),
  };
}

/**
 * Whether that process is still there. Signal 0 performs the permission and
 * existence checks without delivering anything, on Windows as on POSIX. EPERM
 * means the process exists and belongs to someone else, which is still alive.
 */
export function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

/** Whether a run's session is still up: its pid asked now, never stored. */
export const isLive = (run) => isRunning(run.pid);

/** The runs whose sessions are still up, in the order they were registered. */
export function liveRuns(runs) {
  return runs.filter(isLive);
}

/**
 * How long a run may say nothing before the deck stops serving it (spec 7).
 * Measured from its last activity rather than from when it started, because a
 * run three days into one feature is the most alive a run gets (D12).
 */
export const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

/**
 * A stamp, or nothing at all. Only a string is one: the deck writes ISO strings
 * and nothing else, so a number, a null or an object in that field is a file
 * somebody edited by hand — and `Date.parse` reads the number `0` as the year
 * 2000, which would age a live run out on the strength of a field it never
 * wrote.
 */
const stampOf = (value) => (typeof value === 'string' ? value : '');

/**
 * When this run was last heard from. A run stored before this slice carries no
 * `lastSeenAt`: there is no migration in this feature and the store is not
 * rewritten to add one, so the moment it registered is the only activity it has
 * ever recorded and it is timed from that.
 */
const lastSeenOf = (run) => stampOf(run.lastSeenAt) || stampOf(run.startedAt);

/**
 * Whether the deck has stopped serving this run: two days of silence, or the
 * user taking it off the page by hand. Both of those are the one word the
 * glossary spells **stale**, and neither of them is *ended* — that is the pid,
 * which `isRunning` above answers and this does not touch (D12).
 *
 * A stamp this process cannot read is not stale. `Date.parse` gives NaN for
 * anything that is not a date and for the empty string `stampOf` falls back to,
 * and every comparison with NaN is false, so a run the deck cannot time stays on
 * the page for the pid check to judge rather than vanishing on the strength of a
 * field nobody can read.
 *
 * At exactly 48 hours it is gone, because the spec's sentence is that a run with
 * no activity for 48 h disappears. The millisecond either side of that is not
 * something a test constructs — `freshRuns` reads the clock itself — so the
 * comparison is written the way the sentence reads rather than the other way.
 */
function isStale(run, now) {
  if (run.dismissedAt) return true;
  return now - Date.parse(lastSeenOf(run)) >= STALE_AFTER_MS;
}

/**
 * The runs the deck still serves, in the order they were registered. One `now`
 * for the whole list, so two runs a millisecond either side of the bound are
 * judged against the same moment.
 */
export function freshRuns(runs) {
  const now = Date.now();
  return runs.filter((run) => !isStale(run, now));
}

/**
 * The run record (L5, L19 of run-record, ADR 0028): the durable state of one
 * feature in one directory, which outlives every session that writes it. A run
 * is a session's registration and goes when the session does; a record is keyed
 * by the directory and the feature's slug, and is written only by `deck_status`.
 *
 * Its fields, in the order they are stored and mirrored. Open thread ids are not
 * among them: they are derived when the record is read (L6), because a stored
 * copy goes stale the moment a thread closes. `friction` is last because it is the
 * field that grows: the session-start hook clips the record at 16,000 characters, and
 * the clip falls on it rather than on `next`, `finished` or `report`.
 */
const RECORD_ORDER = ['slug', 'feature', 'ticket', 'branch', 'base', 'worktree', 'qa', 'artefact', 'slices', 'findings', 'report', 'next', 'finished', 'finishedAt', 'updatedAt', 'friction'];

/** The one spelling of a clean finish: the only `finished` that chains the next ticket (L3). */
export const FINISHED_CLEAN = 'closing report posted';

/** A slug names `docs/design/<slug>/`, so it is kebab-case and nothing a path could misread. */
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A run's base (pilot-develop-line L6): `pilot`, or the concluding feature's `feat/<slug>` it is chained on. */
export const RUN_BASE = new RegExp(`^(?:pilot|feat/${SLUG.source.slice(1, -1)})$`);

const TICKET_ID = /^itm_[0-9a-f]+$/;

/** A finding the pilot has decided, and which way (L5). */
const DECIDED = /^(?:kept|dropped): \S/;

function recordCell(field, value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new RunRefusal(`${field} must say something; leave it out to keep the one the record has`);
  }
  const text = value.trim();
  if (text.length > MAX_STATE_CHARS) {
    throw new RunRefusal(`that ${field} is longer than the record keeps (${MAX_STATE_CHARS} characters)`);
  }
  return text;
}

/** A non-blank string of the report, which unlike a record field cannot be left out. */
function reportText(field, value) {
  if (typeof value !== 'string' || value.trim() === '') throw new RunRefusal(`${field} must be a non-blank string`);
  return recordCell(field, value);
}

function reportPr(field, value) {
  if (!Number.isInteger(value) || value < 1) throw new RunRefusal(`${field} must be a pull request number`);
  return value;
}

function reportSha(field, value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{7,40}$/i.test(value)) {
    throw new RunRefusal(`${field} must be a commit SHA, 7 to 40 hex characters`);
  }
  return value;
}

function reportId(field, value) {
  const id = reportText(field, value);
  if (!/^A\d+$/.test(id)) throw new RunRefusal(`${field} must be an assumed decision's id, A<n>`);
  return id;
}

/** An object of exactly `shape`'s keys, each checked; only `optional` may be left out. */
function reportObject(field, value, shape, optional = []) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new RunRefusal(`${field} must be an object of ${Object.keys(shape).join(', ')}`);
  }
  const unknown = Object.keys(value).find((key) => !Object.hasOwn(shape, key));
  if (unknown !== undefined) throw new RunRefusal(`${field} has no field ${JSON.stringify(unknown)}`);
  const checked = {};
  for (const [key, check] of Object.entries(shape)) {
    if (value[key] !== undefined) checked[key] = check(`${field}.${key}`, value[key]);
    else if (!optional.includes(key)) throw new RunRefusal(`${field}.${key} is missing`);
  }
  return checked;
}

function reportList(field, value, check) {
  if (!Array.isArray(value) || value.length > MAX_FINDINGS) {
    throw new RunRefusal(`${field} must be a list of at most ${MAX_FINDINGS}`);
  }
  return value.map((entry, at) => check(`${field}[${at}]`, entry));
}

function reportSize(field, value) {
  if (!Number.isFinite(value) || value < 0) throw new RunRefusal(`${field} must be a number, 0 or more`);
  return value;
}

/** The friction rows the record keeps, newest last (yellow-lane A6). */
export const MAX_FRICTION = 40;

/**
 * One friction row (yellow-lane spec 21): a drain row `{kind: 'drain', what, size}`, or an
 * agent row `{agent, what, evidence, size?}`. A row of neither shape is refused, named.
 */
function frictionRow(field, row) {
  if (row?.kind !== undefined) {
    if (row.kind !== 'drain') throw new RunRefusal(`${field}.kind must be "drain", the one kind a friction row has`);
    return reportObject(field, row, { kind: () => 'drain', what: reportText, size: reportSize });
  }
  return reportObject(field, row, { agent: reportText, what: reportText, evidence: reportText, size: reportSize }, ['size']);
}

/** How many rows of each kind the closing report ranks (yellow-lane A7). */
const RANKED = 5;

/**
 * The closing report's friction (yellow-lane spec 23, L8, A7): the record's rows, never a
 * fresh list, as the top 5 agent rows and the top 5 drains, each by size (an agent row
 * without one counts as 0) and then by the record's order.
 */
export function rankFriction(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const top = (drain) => list.filter((row) => (row.kind === 'drain') === drain).sort((a, b) => (b.size ?? 0) - (a.size ?? 0)).slice(0, RANKED);
  return { agents: top(false), drains: top(true) };
}

const rowsOf = (shape) => (field, value) => reportList(field, value, (at, row) => reportObject(at, row, shape));

/** The closing report (spec 11, L10, ADR 0044): data, so every key is checked and none is free-form. */
const REPORT = {
  featurePr: (field, value) => reportObject(field, value, { number: reportPr, state: reportText, mergeSha: reportSha }, ['mergeSha']),
  slices: rowsOf({ slice: reportText, pr: reportPr, mergeSha: reportSha }),
  assumed: rowsOf({ id: reportId, decision: reportText, taken: reportText }),
  humanSteps: (field, value) => reportList(field, value, reportText),
  worktreesLeft: (field, value) => reportList(field, value, reportText),
};

/** A loopback deck's address: QA's scratch deck runs on this machine, and nothing else may be named. */
function loopbackUrl(field, value) {
  const text = recordCell(field, value);
  const url = URL.canParse(text) ? new URL(text) : null;
  if (url?.protocol !== 'http:' || url.username !== '' || url.password !== '' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new RunRefusal(`${field} must be the scratch deck's loopback http URL`);
  }
  return text;
}

/** QA's refs (ticket-states spec 19): its branch, its absolute worktree, and its scratch deck's URL. */
const QA_REFS = {
  branch: (field, value) => {
    // Never a git option when the pilot hands it to git (security review).
    const text = recordCell(field, value);
    if (text.startsWith('-')) throw new RunRefusal(`${field} must be a branch name, not an option`);
    return text;
  },
  worktree: recordCell, // an absolute worktree of the run's repository, which `deck_status` checks first
  url: loopbackUrl,
};

/**
 * The ticket id a run record names (spec 4, L13): `ticket`, else the legacy key a run.json written
 * before co-pilot-tickets S5 carries in another repository.
 */
export function recordTicket(record) {
  return record.ticket ?? record.task;
}

/**
 * The record fields of one `deck_status` call, validated, or null when the call
 * names no slug and so writes no record. Only the fields the call sent come back:
 * the store keeps the rest from the record it already holds.
 */
export function recordFields({ slug, ticket, branch, base, worktree, qa, artefact, findings, friction, report, next, finished }) {
  if (slug === undefined) {
    // A record field with no slug has no record to go in; dropping it quietly would
    // lose the pilot's next move, so it is refused like every other bad cell.
    const sent = Object.entries({ ticket, branch, base, worktree, qa, artefact, findings, friction, report, next, finished }).find(([, v]) => v !== undefined);
    if (sent) throw new RunRefusal(`${sent[0]} belongs to the run record; send slug with it`);
    return null;
  }
  if (typeof slug !== 'string' || slug.length > MAX_SLUG_CHARS || !SLUG.test(slug)) {
    throw new RunRefusal(
      `slug must be the feature's slug, lower-case words joined by hyphens and at most ` +
        `${MAX_SLUG_CHARS} characters, not ${JSON.stringify(slug)}`,
    );
  }

  const fields = { slug };
  // The ticket this record is the run of, by id: how a parked ticket finds its record (ticket-states L5).
  if (ticket !== undefined) {
    if (typeof ticket !== 'string' || !TICKET_ID.test(ticket)) throw new RunRefusal(`ticket must be the ticket's item id, not ${JSON.stringify(ticket)}`);
    fields.ticket = ticket;
  }
  if (branch !== undefined) fields.branch = recordCell('branch', branch);
  // The ref `pilot integrate` merges at every slice, so never anything git could read as an option.
  if (base !== undefined) {
    fields.base = recordCell('base', base);
    if (!RUN_BASE.test(fields.base)) throw new RunRefusal(`base must be pilot or feat/<slug>, not ${JSON.stringify(fields.base)}`);
  }
  if (worktree !== undefined) {
    // Where the daemon writes run.json (independence spec 22.2), so never a relative path.
    fields.worktree = recordCell('worktree', worktree);
    if (!path.isAbsolute(fields.worktree)) throw new RunRefusal("worktree must be the feature worktree's absolute path");
  }
  // Where the ticket's QA ran, so a reply on its walkthrough resumes QA there (ticket-states spec 19).
  if (qa !== undefined) fields.qa = reportObject('qa', qa, QA_REFS);
  if (artefact !== undefined) fields.artefact = recordCell('artefact', artefact);
  if (next !== undefined) fields.next = recordCell('next', next);
  // Why the run is over, which is what stops its `deck_wait` (independence spec 20).
  if (finished !== undefined) fields.finished = recordCell('finished', finished);
  if (findings !== undefined) {
    if (!Array.isArray(findings) || findings.length > MAX_FINDINGS) {
      throw new RunRefusal(`findings must be a list of at most ${MAX_FINDINGS} lines`);
    }
    fields.findings = Array.from(findings, (line) => {
      const text = recordCell('finding', line);
      if (!DECIDED.test(text)) {
        throw new RunRefusal(`a finding starts "kept: " or "dropped: ", and ${JSON.stringify(text)} does not`);
      }
      return text;
    });
  }
  // A call's own rows; `nextRecord` appends them to the record's (L8).
  if (friction !== undefined) fields.friction = reportList('friction', friction, frictionRow);
  if (report?.friction !== undefined) throw new RunRefusal("report.friction is derived from the record's friction rows");
  if (report !== undefined) fields.report = reportObject('report', report, REPORT);
  return fields;
}

/**
 * The record as it is stored and mirrored: the one it replaces, overwritten by
 * what this call sent, in `RECORD_ORDER`, so the mirror's bytes do not move
 * because a field was sent in a different order. `friction` is the one field not
 * overwritten: the call's rows go after the record's, and only the newest
 * `MAX_FRICTION` are kept (yellow-lane L8, A6).
 */
export function nextRecord(previous, given) {
  // A record with a next move is not finished: a later call on the same slug that
  // names one without `finished` clears it, or the run's own wait would stop.
  const kept = given.next !== undefined && given.finished === undefined ? { ...previous, finished: undefined, finishedAt: undefined } : previous;
  // When the finish was said, which a later call on the slug does not move (L5, `isSuperseded`).
  const merged = { ...kept, ...given, ...(given.finished === undefined ? {} : { finishedAt: given.updatedAt }) };
  if (given.friction !== undefined) {
    merged.friction = [...(Array.isArray(previous.friction) ? previous.friction : []), ...given.friction].slice(-MAX_FRICTION);
  }
  // A finished record's report ranks every session's rows (spec 23); the caller never sends them.
  if (merged.finished !== undefined && merged.report !== undefined) merged.report = { ...merged.report, friction: rankFriction(merged.friction) };
  const record = {};
  for (const field of RECORD_ORDER) {
    if (merged[field] !== undefined) record[field] = merged[field];
  }
  return record;
}
