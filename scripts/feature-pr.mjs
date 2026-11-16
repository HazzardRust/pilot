/**
 * `pilot pr --ticket <id>`: the deck's one writer of a run's feature PR (deck-writes-github spec 2;
 * L1, L2, L3, L7'). It reads the ticket's run record from the deck (`/api/record`, as `pilot ready`
 * does) and the artefact from `origin/feat/<slug>`, then makes GitHub match them:
 *
 *   no open PR for `feat/<slug>`  -> one `gh pr create --draft` on the record's base
 *   a body or a base that differs -> one `gh pr edit <n>` carrying only what differs
 *   both the same                 -> nothing
 *
 * With `record.qaComment` set it then upserts QA's one comment, the one of this account's starting with
 * `QA_MARKER` (spec 3): posted once, edited when the text differs, its id read off GitHub every time.
 *
 * The body is the artefact's §2, the record's slice table and the brief's PR footer, and goes
 * through a file for `pr create`, `pr edit` and `pr comment`; the one exception is the QA comment's
 * PATCH, whose body rides on argv as `-f body=`. Every @mention in it is written so GitHub notifies
 * nobody (`quiet`). The PR is found by its head every time; its number is never
 * stored (L3). The one local write is the fetch that refreshes `refs/remotes/origin/feat/<slug>`,
 * the ref the artefact is read from. A run remote other than origin, or a `feat/<slug>` origin
 * does not have yet, prints one line and exits 0. Any failure is one line naming the step, exit 1.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { bearer } from '../hooks/lib/deck-secret.js';
import { hostIn } from '../deck/host.mjs';
import { RUN_BASE, SLUG } from '../deck/runs.mjs';
import { deckUrl } from '../deck/tools.mjs';
import { listeningRepo } from '../deck/wait.mjs';
import { firstLine, git as gitAt, PILOT_BRANCH } from './pilot-branch.mjs';
import { runRemote } from './remotes.mjs';

const USAGE = 'usage: pilot pr --ticket <itm_id>';
const TICKET = /^itm_[0-9a-f]+$/;
/** How long the deck has to answer before this calls it down. */
const TIMEOUT_MS = 5000;
/** The longest feature name a title carries. */
const TITLE_MAX = 200;
/** How many open PRs on the head are read, so a fork's PR of the same branch name cannot hide this repository's. */
const LIST_LIMIT = '30';

/** The first line of QA's one comment on the feature PR, the only comment the deck edits (deck-writes-github spec 3). */
export const QA_MARKER = '<!-- pilot:qa -->';

/** A failure that already names its step. */
class StepError extends Error {}

/** C0 and C1 controls and the Unicode line and paragraph separators (U+2028, U+2029). */
const BREAKS = new RegExp(`[\\x00-\\x1f\\x7f-\\x9f${String.fromCharCode(0x2028, 0x2029)}]+`, 'g');
/** Every line break and control character folded to one space: text that stays on one line. */
const oneLine = (value) => String(value ?? '').replace(BREAKS, ' ').trim();

/** An @ that opens a GitHub mention: not after a word character, so an email address is left alone. */
const MENTION = /(?<!\w)@(?=[A-Za-z0-9])/g;
/** `text` with a zero-width joiner after every mention's @: it reads the same, and GitHub notifies nobody. */
const quiet = (text) => text.replace(MENTION, `@${String.fromCharCode(0x200d)}`);

/** One table cell: a pipe escaped, line breaks folded, so a row stays one row. */
const cell = (value) => oneLine(value).replace(/\|/g, '\\|');

/**
 * The feature PR's body: `spec` (the artefact's §2) as it stands, the record's slices as a
 * `Slice | State | PR` table, one row per record row, and `footer` last when there is one.
 */
export function featureBody(spec, record, footer) {
  const rows = (record.slices ?? []).map((row) => {
    const pr = Number.isInteger(row.pr) ? `#${row.pr}` : '';
    return `| ${cell(row.slice)} | ${cell(row.state)} | ${pr} |`;
  });
  const parts = [spec.trimEnd(), ['| Slice | State | PR |', '| --- | --- | --- |', ...rows].join('\n')];
  if (footer?.trim()) parts.push(footer.trim());
  return quiet(`${parts.join('\n\n')}\n`);
}

/** The `## 2` section of `markdown`, its heading to the next `## ` outside a fence; throws when absent. */
function specOf(markdown) {
  const lines = markdown.split(/\r?\n/);
  let fenced = false;
  let start = -1;
  let end = lines.length;
  for (let at = 0; at < lines.length; at++) {
    if (/^\s*(```|~~~)/.test(lines[at])) fenced = !fenced;
    if (fenced) continue;
    if (start === -1 && /^## 2(?:[.\s]|$)/.test(lines[at])) start = at;
    else if (start !== -1 && lines[at].startsWith('## ')) {
      end = at;
      break;
    }
  }
  if (start === -1) throw new StepError('artefact: no ## 2 section');
  return lines.slice(start, end).join('\n');
}

/** The fenced block under the brief's `## PR footer`, or '' when there is none. */
function footerOf(brief) {
  const match = /^## PR footer\s*\n+```[^\n]*\n([\s\S]*?)\n```/m.exec(brief.replace(/\r\n/g, '\n'));
  return match ? match[1] : '';
}

/** Line ends and trailing space aside, the same text: GitHub hands a body back with CRLF. */
const sameText = (a, b) => String(a ?? '').replace(/\r\n/g, '\n').trimEnd() === String(b ?? '').replace(/\r\n/g, '\n').trimEnd();

/** Runs a gh call, rethrowing a failure as `gh <group> <verb>: <first line>`. */
function step(gh, args) {
  try {
    return gh(args);
  } catch (err) {
    throw new StepError(`gh ${args[0]} ${args[1]}: ${firstLine(err)}`);
  }
}

/** Runs a git call, rethrowing a failure as `git <verb>: <first line>`. */
function gitStep(git, args) {
  try {
    return git(args);
  } catch (err) {
    throw new StepError(`git ${args[0]}: ${firstLine(err)}`);
  }
}

/** Writes `body` to a file in a fresh private temp dir, hands its path to `use`, and removes the dir. */
function withBodyFile(body, use) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-pr-'));
  try {
    const file = path.join(dir, 'body.md');
    fs.writeFileSync(file, body, { mode: 0o600 });
    return use(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Throws unless the record names a slug and a base `gh` and git may take as argv. */
function checked(record) {
  if (!record || typeof record !== 'object') throw new StepError('record: none');
  if (typeof record.slug !== 'string' || !SLUG.test(record.slug)) throw new StepError(`record: slug ${JSON.stringify(record.slug)} is not a slug`);
  const base = record.base ?? PILOT_BRANCH;
  if (typeof base !== 'string' || !RUN_BASE.test(base)) throw new StepError(`record: base ${JSON.stringify(base)} is not ${PILOT_BRANCH} or feat/<slug>`);
  const artefact = record.artefact ?? `docs/design/${record.slug}/architecture.md`;
  if (typeof artefact !== 'string' || !/^[\w./-]+$/.test(artefact) || artefact.split('/').includes('..')) {
    throw new StepError(`record: artefact ${JSON.stringify(artefact)} is not a repository path`);
  }
  const feature = typeof record.feature === 'string' ? oneLine(record.feature).slice(0, TITLE_MAX) : '';
  return { slug: record.slug, base, artefact, feature: feature || record.slug };
}

/**
 * Makes the feature PR of `record` match it: `{ line, number?, wrote }`, `wrote` one of `created`,
 * `edited`, `none`. `gh` is the host's runner and `git` is `(args) => string` in the repository,
 * both argv only. Throws, naming the step, on a failure.
 */
export function syncFeaturePr({ gh, git, record }) {
  const { slug, base, artefact, feature } = checked(record);
  const head = `feat/${slug}`;

  let runs;
  try {
    runs = runRemote(git);
  } catch (err) {
    throw new StepError(`run remote: ${firstLine(err)}`);
  }
  if (runs !== 'origin') return { line: `no PR: run remote ${runs ?? 'none'}`, wrote: 'none' };

  try {
    git(['ls-remote', '--exit-code', '--heads', 'origin', `refs/heads/${head}`]);
  } catch (err) {
    if (err.status === 2) return { line: `no PR yet: origin has no ${head}`, wrote: 'none' };
    throw new StepError(`git ls-remote: ${firstLine(err)}`);
  }
  gitStep(git, ['fetch', '-q', 'origin', `+refs/heads/${head}:refs/remotes/origin/${head}`]);
  const tip = `refs/remotes/origin/${head}`;
  const spec = specOf(gitStep(git, ['show', `${tip}:${artefact}`]));
  const briefPath = `docs/design/${slug}/brief.md`;
  const hasBrief = gitStep(git, ['ls-tree', '--name-only', tip, '--', briefPath]).trim() !== '';
  const footer = hasBrief ? footerOf(gitStep(git, ['show', `${tip}:${briefPath}`])) : '';
  const body = featureBody(spec, record, footer);

  let open;
  const listed = step(gh, ['pr', 'list', '--head', head, '--state', 'open', '--json', 'number,body,baseRefName,isCrossRepository', '--limit', LIST_LIMIT]);
  try {
    open = JSON.parse(listed);
  } catch {
    throw new StepError('gh pr list: an answer that is not JSON');
  }
  if (!Array.isArray(open)) throw new StepError('gh pr list: an answer that is not a list');
  // `--head` matches a branch name from any fork: only this repository's own PR is the feature PR.
  open = open.filter((pr) => pr?.isCrossRepository === false);

  const done = writePr(gh, open, { base, head, body, title: `feat(${slug}): ${feature}` });
  const qa = typeof record.qaComment === 'string' && record.qaComment.trim() !== '' ? record.qaComment : null;
  if (qa === null) return done;
  const comment = syncQaComment(gh, done.number, qa, done.wrote === 'created');
  return comment === 'none' ? done : { ...done, line: `${done.line}; QA comment ${comment}` };
}

/** Opens the feature PR when none is `open`, or edits the open one where it differs from `body` and `base`. */
function writePr(gh, open, { base, head, body, title }) {
  if (open.length === 0) {
    const out = withBodyFile(body, (file) => step(gh, ['pr', 'create', '--draft', '--base', base, '--head', head, '--title', title, '--body-file', file]));
    const number = Number(/\/pull\/(\d+)\s*$/.exec(String(out).trim())?.[1]);
    if (!Number.isInteger(number)) throw new StepError('gh pr create: no PR url in its answer');
    return { line: `feature PR #${number} opened`, number, wrote: 'created' };
  }

  const pr = open[0];
  if (!Number.isInteger(pr?.number) || pr.number < 1) throw new StepError('gh pr list: a PR with no number');
  const flags = pr.baseRefName === base ? [] : ['--base', base];
  const bodyChanged = !sameText(pr.body, body);
  if (!bodyChanged && flags.length === 0) return { line: `feature PR #${pr.number} unchanged`, number: pr.number, wrote: 'none' };
  const edit = ['pr', 'edit', String(pr.number), ...flags];
  if (bodyChanged) withBodyFile(body, (file) => step(gh, [...edit, '--body-file', file]));
  else step(gh, edit);
  return { line: `feature PR #${pr.number} updated`, number: pr.number, wrote: 'edited' };
}

/** A comment's url as GitHub gives it: the repository and the comment's own id. */
const COMMENT_URL = /^https:\/\/[^/\s]+\/([\w.-]+)\/([\w.-]+)\/pull\/\d+#issuecomment-(\d+)$/;

/**
 * Upserts QA's one comment on PR `number` from `text` (spec 3; L3, A2): the first of this account's comments
 * that starts with `QA_MARKER` is it, found every time and its id never stored. None -> one `gh pr comment`;
 * a different text -> one PATCH of that comment; the same -> nothing. Another account's comment carrying the
 * marker is never edited. A PR just `created` has no comments to read. Answers `posted`, `edited` or `none`.
 */
function syncQaComment(gh, number, text, created) {
  const body = `${QA_MARKER}\n${quiet(text.trimEnd())}\n`;
  let mine;
  if (!created) {
    let comments;
    try {
      comments = JSON.parse(step(gh, ['pr', 'view', String(number), '--json', 'comments'])).comments;
    } catch (err) {
      if (err instanceof StepError) throw err;
      throw new StepError('gh pr view: an answer that is not JSON');
    }
    if (!Array.isArray(comments)) throw new StepError('gh pr view: no comments list');
    mine = comments.find((each) => each?.viewerDidAuthor === true && typeof each.body === 'string' && each.body.startsWith(QA_MARKER));
  }
  if (!mine) {
    withBodyFile(body, (file) => step(gh, ['pr', 'comment', String(number), '--body-file', file]));
    return 'posted';
  }
  if (sameText(mine.body, body)) return 'none';
  const [, owner, repo, id] = COMMENT_URL.exec(String(mine.url ?? '')) ?? [];
  if (id === undefined) throw new StepError('gh pr view: the QA comment has no comment url');
  // `-f`, a raw string: the host refuses `--input` and `-F`, whose `@file` reads a local file into the request.
  step(gh, ['api', `repos/${owner}/${repo}/issues/comments/${id}`, '--method', 'PATCH', '-f', `body=${body}`]);
  return 'edited';
}

/** The deck's record for `ticket`, read as `pilot ready` reads it; null when the deck has none. */
const deckRecord = (cwd) => async (ticket) => {
  const query = new URLSearchParams({ repo: listeningRepo(cwd), ticket });
  const response = await fetch(`${deckUrl()}/api/record?${query}`, { headers: bearer(), signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) {
    const refusal = await response.json().catch(() => ({}));
    throw new Error(refusal.error ?? `the deck answered ${response.status}`);
  }
  return (await response.json())?.record ?? null;
};

/**
 * `pilot pr --ticket <itm_id>`'s entry point from `bin/pilot.mjs`: prints one line and answers 0
 * when it wrote, skipped or had nothing to do, 1 on any failure.
 */
export async function main(argv, inject = {}) {
  const cwd = process.cwd();
  const say = inject.say ?? ((text) => process.stdout.write(text));
  if (argv.length !== 2 || argv[0] !== '--ticket' || !TICKET.test(argv[1])) {
    say(`${USAGE}\n`);
    return 1;
  }
  const gh = inject.gh ?? hostIn(cwd);
  const git = inject.git ?? ((args) => gitAt(cwd, ...args));
  const readRecord = inject.readRecord ?? deckRecord(cwd);
  try {
    let record;
    try {
      record = await readRecord(argv[1]);
    } catch (err) {
      throw new StepError(`record: ${firstLine(err)}`);
    }
    if (!record) throw new StepError(`record: ticket ${argv[1]} has none`);
    say(`${syncFeaturePr({ gh, git, record }).line}\n`);
    return 0;
  } catch (err) {
    say(`${oneLine(err instanceof StepError ? err.message : `pilot pr: ${firstLine(err)}`)}\n`);
    return 1;
  }
}
