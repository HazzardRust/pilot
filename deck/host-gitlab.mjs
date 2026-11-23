/**
 * The GitLab adapter (other-host spec 4, 6; L1, L4, A3): **Host** over `glab api`, REST v4 on the current
 * project's `projects/:id/merge_requests…` and one commit's statuses (ci-gate S8), never `glab mr` porcelain,
 * whose flags move between versions. A JSON body rides on stdin (`--input -`). `glabRun` is the one place a `glab` process starts; the call is
 * `execFileSync('glab', argv)`, no shell, and it inherits the environment: the pilot never reads a token, and
 * `signedIn` reads only `glab auth status`'s exit status.
 */

import { execFileSync } from 'node:child_process';

import { FULL_SHA } from './host-github.mjs';

/**
 * The current project's merge requests, one by iid, its notes, or one note by id, with an optional query of
 * URL-encoded words. `:id` is `glab`'s placeholder for the repository's own project, so no path reaches another.
 * Groups: 1 the iid, 2 `/notes`, 3 the note id, 4 the query.
 */
const MR_PATH = /^projects\/:id\/merge_requests(?:\/(\d+)(\/notes(?:\/(\d+))?)?)?(\?[A-Za-z0-9_.%=&+*-]*)?$/;
/**
 * The one read of CI (ci-gate L1, spec 8): the current project's latest statuses on one full sha, a page of 100 by
 * number. GET only, no flag: no `all=true` (every retry), no other project.
 */
const STATUSES_PATH = new RegExp(`^projects/:id/repository/commits/${FULL_SHA.source.slice(1, -1)}/statuses\\?per_page=100&page=[1-9]\\d{0,2}$`);
/** The one header the adapter sends, so a body on stdin reads as JSON; any other header is refused. */
const JSON_HEADER = 'Content-Type: application/json';

/**
 * True when `args` is a `glab api` call on the list: `api user`, a bare GET of `STATUSES_PATH`, a GET under
 * `MR_PATH`, a POST of a merge request or a note, a PUT of a merge request or a note. A write's body comes only from stdin (`--input -`); `-F` and
 * `-f` are refused (`-F`'s `@file` reads a local file into the request), as are `--hostname` and any other flag.
 */
function apiAllowed(args) {
  let method = 'GET';
  let methods = 0;
  let input = false;
  let target = null;
  if (args.length === 2 && STATUSES_PATH.test(args[1])) return true;
  for (let at = 1; at < args.length; at++) {
    const arg = args[at];
    if (!arg.startsWith('-')) {
      if (target !== null) return false;
      target = arg;
      continue;
    }
    if (at + 1 >= args.length) return false;
    const value = args[++at];
    if (arg === '-X' || arg === '--method') {
      method = value.toUpperCase();
      methods += 1;
    } else if (arg === '--input' && value === '-') input = true;
    else if (!((arg === '-H' || arg === '--header') && value === JSON_HEADER)) return false;
  }
  if (methods > 1 || target === null) return false;
  if (target === 'user') return method === 'GET' && !input;
  const match = MR_PATH.exec(target);
  if (match === null) return false;
  const [, iid, notes, noteId, query] = match;
  if (method === 'GET') return !input;
  if (!input || query !== undefined) return false;
  if (method === 'POST') return iid === undefined || (notes !== undefined && noteId === undefined);
  if (method === 'PUT') return iid !== undefined && (notes === undefined || noteId !== undefined);
  return false;
}

/** Throws, naming the verb, unless `args` is on the host's allowlist. */
function assertHostVerb(args) {
  if (!Array.isArray(args) || !args.every((arg) => typeof arg === 'string')) throw new Error('glab: the host takes an argv of strings');
  const [group, verb] = args;
  if (group === 'auth' && verb === 'status' && args.length === 2) return;
  if (group === 'api' && apiAllowed(args)) return;
  throw new Error(`glab ${[group, verb].filter((word) => word !== undefined).join(' ')}: not a host verb`);
}

/**
 * The `glab` runner in `cwd`: `(args, input?, { timeout }?) => stdout`, argv only, no shell; `input` is the request
 * body on stdin, `timeout` the milliseconds before the process is killed and the call throws.
 */
export const glabRun = (cwd) => (args, input, { timeout } = {}) => {
  assertHostVerb(args);
  if (input !== undefined && typeof input !== 'string') throw new Error('glab: a request body is a string');
  return execFileSync('glab', args, {
    cwd, encoding: 'utf8', input, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'], windowsHide: true,
    ...(timeout === undefined ? {} : { timeout }),
  });
};

const MRS = 'projects/:id/merge_requests';
const STATES = { opened: 'open', merged: 'merged', closed: 'closed' };
const ASKED = { open: 'opened', merged: 'merged', closed: 'closed', all: 'all' };
/** The most pages of notes `upsertComment` reads, so a misbehaving answer cannot loop it for ever. */
const PAGES = 100;
/** How long the checks read waits on `glab`, as GitHub's does: a hung read throws, which `checksAt` reads as unread. */
const CHECKS_TIMEOUT_MS = 30_000;
/** The most pages of statuses `checks` reads; `STATUSES_PATH` allows no page past it. */
const STATUS_PAGES = 999;
/** GitLab's commit status states (ci-gate L3); a state off the table throws, never read as pass. */
const OUTCOMES = {
  success: 'pass', skipped: 'pass', failed: 'fail', canceled: 'fail',
  created: 'pending', pending: 'pending', running: 'pending', manual: 'pending',
  waiting_for_resource: 'pending', preparing: 'pending', scheduled: 'pending',
};

/** A GitLab commit status as a **Check**. */
function checkOf(status) {
  if (typeof status?.name !== 'string') throw new Error('glab api statuses: a status with no name');
  const outcome = Object.hasOwn(OUTCOMES, status.status ?? '') ? OUTCOMES[status.status] : undefined;
  if (outcome === undefined) throw new Error(`glab api statuses: ${status.name} has status ${JSON.stringify(status.status)}`);
  return { name: status.name, outcome };
}

/** A GitLab MR as a **Review**; a state off the three (`locked`) throws rather than being guessed at. */
function reviewOf(mr) {
  const state = Object.hasOwn(STATES, mr?.state ?? '') ? STATES[mr.state] : undefined;
  if (state === undefined) throw new Error(`glab: a merge request in state ${JSON.stringify(mr?.state)}`);
  return {
    number: mr.iid, state, base: mr.target_branch, head: mr.source_branch, headSha: mr.sha,
    body: mr.description ?? '', crossRepo: mr.source_project_id !== mr.target_project_id,
  };
}

function json(said, what) {
  try {
    return JSON.parse(said);
  } catch {
    throw new Error(`glab ${what}: an answer that is not JSON`);
  }
}

/** A review number as its path segment; anything but a positive integer throws, so nothing else rides in the path. */
function numbered(n) {
  if (!Number.isSafeInteger(n) || n < 1) throw new Error(`glab: ${JSON.stringify(n)} is not a merge request number`);
  return String(n);
}

/**
 * **Host** over `run(args, input?) -> stdout` (`glabRun(cwd)` in use, a fake in tests).
 * @param {(args: string[], input?: string) => string} run
 * @returns {import('./host.mjs').Host}
 */
export function gitlabHost(run) {
  const get = (target, what) => json(run(['api', target]), what);
  const send = (method, target, body, what) =>
    json(run(['api', '-X', method, '-H', JSON_HEADER, '--input', '-', target], JSON.stringify(body)), what);
  const review = (n) => reviewOf(get(`${MRS}/${numbered(n)}`, 'merge request'));
  return {
    cli: 'glab',
    reviews({ head, base, state, mine = false, limit = 100 }) {
      if (!Object.hasOwn(ASKED, state)) throw new Error(`glab: no merge request state ${JSON.stringify(state)}`);
      const query = new URLSearchParams({ state: ASKED[state] });
      if (head !== undefined) query.set('source_branch', head);
      if (base !== undefined) query.set('target_branch', base);
      if (mine) query.set('scope', 'created_by_me');
      const want = Number.isFinite(limit) ? Math.max(1, Math.trunc(limit)) : 100;
      query.set('per_page', String(Math.min(want, 100)));
      // GitLab's page holds at most 100: read on until a page comes back short or `want` are in.
      const found = [];
      for (let page = 1; found.length < want; page++) {
        query.set('page', String(page));
        const said = get(`${MRS}?${query}`, 'merge requests');
        if (!Array.isArray(said)) throw new Error('glab merge requests: an answer that is not a list');
        found.push(...said.map(reviewOf));
        if (said.length < 100) break;
      }
      return found.slice(0, want);
    },
    review,
    open({ base, head, title, body, draft = false, label }) {
      const asked = { source_branch: head, target_branch: base, title: draft ? `Draft: ${title}` : title, description: body };
      if (label !== undefined) asked.labels = label;
      const number = send('POST', MRS, asked, 'merge request create')?.iid;
      if (!Number.isSafeInteger(number) || number < 1) throw new Error('glab merge request create: no iid in its answer');
      // The label rides in the same request, so GitLab has no separate refusal to say.
      return { number };
    },
    edit(n, { base, title, body, label } = {}) {
      const change = {};
      if (base !== undefined) change.target_branch = base;
      // A title written bare would undraft the MR; GitHub's title edit keeps a draft a draft, so this does too.
      if (title !== undefined) change.title = get(`${MRS}/${numbered(n)}`, 'merge request')?.draft === true ? `Draft: ${title}` : title;
      if (body !== undefined) change.description = body;
      if (label !== undefined) change.add_labels = label;
      if (Object.keys(change).length > 0) send('PUT', `${MRS}/${numbered(n)}`, change, 'merge request edit');
      return {};
    },
    comment(n, body) {
      send('POST', `${MRS}/${numbered(n)}/notes`, { body }, 'note create');
    },
    /** One note of this account per `marker` on review `n`: posted, edited in place, or left. Answers which. */
    upsertComment(n, marker, body) {
      const text = `${marker}\n${body}`;
      // This account's username, so only its own note is edited.
      const me = get('user', 'api user')?.username;
      if (typeof me !== 'string' || me === '') throw new Error('glab api user: no username');
      const ours = (note) => note?.system !== true && note?.author?.username === me && typeof note.body === 'string' && note.body.startsWith(marker);
      let mine;
      // GitLab answers at most 100 notes a page; read on until the note is found or a page comes back short.
      for (let page = 1; mine === undefined; page++) {
        if (page > PAGES) throw new Error(`glab notes: more than ${PAGES * 100} notes`);
        const notes = get(`${MRS}/${numbered(n)}/notes?sort=asc&order_by=created_at&per_page=100&page=${page}`, 'notes');
        if (!Array.isArray(notes)) throw new Error('glab notes: an answer that is not a list');
        mine = notes.find(ours);
        if (notes.length < 100) break;
      }
      if (!mine) {
        send('POST', `${MRS}/${numbered(n)}/notes`, { body: text }, 'note create');
        return 'posted';
      }
      if (mine.body.trimEnd() === text.trimEnd()) return 'none';
      if (!Number.isSafeInteger(mine.id) || mine.id < 1) throw new Error('glab notes: the note has no id');
      send('PUT', `${MRS}/${numbered(n)}/notes/${mine.id}`, { body: text }, 'note edit');
      return 'edited';
    },
    /** The latest status of each job on one full sha, every page read; GitLab keeps only a retry's last by default. */
    checks(sha) {
      if (typeof sha !== 'string' || !FULL_SHA.test(sha)) throw new Error(`glab: ${JSON.stringify(sha)} is not a full commit sha`);
      const found = [];
      for (let page = 1; ; page++) {
        if (page > STATUS_PAGES) throw new Error(`glab api statuses: more than ${STATUS_PAGES * 100} statuses`);
        const target = `projects/:id/repository/commits/${sha}/statuses?per_page=100&page=${page}`;
        const said = json(run(['api', target], undefined, { timeout: CHECKS_TIMEOUT_MS }), 'api statuses');
        if (!Array.isArray(said)) throw new Error('glab api statuses: an answer that is not a list');
        found.push(...said.map(checkOf));
        if (said.length < 100) return found;
      }
    },
    /** No Gate job names its tree on GitLab (cheap-suite S4), so a GitLab landing has no proof and runs full. */
    testedTrees() {
      return [];
    },
    signedIn() {
      try {
        run(['auth', 'status']);
        return true;
      } catch {
        return false;
      }
    },
  };
}
