/**
 * `pilot pr --ticket <id>`: the deck's one writer of a run's feature PR (deck-writes-github spec 2;
 * L1, L2, L3, L7'). It reads the ticket's run record from the deck (`/api/record`, as `pilot ready`
 * does) and the artefact from `origin/feat/<slug>`, then makes the host match them through its
 * **Host** (`deck/host.mjs`; other-host spec 2, 3):
 *
 *   no open review for `feat/<slug>` -> one `open({ draft: true })` on `prBase` of the record's base
 *   a body or a base that differs    -> one `edit(n)` carrying only what differs
 *   both the same                    -> nothing
 *
 * With `record.qaComment` set it then upserts QA's one comment, the one of this account's starting with
 * `QA_MARKER` (spec 3), through `upsertComment`: posted once, edited when the text differs.
 *
 * The body is the artefact's §2, the record's slice table and the brief's PR footer. Every @mention
 * in it is written so GitHub notifies nobody (`quiet`). The PR is found by its head every time; its
 * number is never stored (L3). The one local write is the fetch that refreshes
 * `refs/remotes/origin/feat/<slug>`, the ref the artefact is read from. `pilot.host` at `none`, a run
 * remote other than origin, or a `feat/<slug>` origin does not have yet, prints one line and exits 0.
 * Any failure is one line naming the step, exit 1.
 */

import { bearer } from '../hooks/lib/deck-secret.js';
import { hostFor } from '../deck/host.mjs';
import { RUN_BASE, SLUG } from '../deck/runs.mjs';
import { deckUrl } from '../deck/tools.mjs';
import { listeningRepo } from '../deck/wait.mjs';
import { firstLine, git as gitAt, namePilotBranch, pilotBranch } from './pilot-branch.mjs';
import { runRemote } from './remotes.mjs';
import { prBase } from './stack.mjs';

const USAGE = 'usage: pilot pr --ticket <itm_id>';
const TICKET = /^itm_[0-9a-f]+$/;
/** How long the deck has to answer before this calls it down. */
const TIMEOUT_MS = 5000;
/** The longest feature name a title carries. */
const TITLE_MAX = 200;
/** How many open PRs on the head are read, so a fork's PR of the same branch name cannot hide this repository's. */
const LIST_LIMIT = 30;

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

/** Runs one **Host** verb, rethrowing a failure as `<cli> <verb>: <first line>`. */
function step(host, verb, call) {
  try {
    return call();
  } catch (err) {
    throw new StepError(`${host.cli} ${verb}: ${firstLine(err)}`);
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

/**
 * Throws unless the record names a slug and, when it names one, a base `gh` and git may take as argv; `base` is null
 * for a record with none, the user's pilot branch. `nameOf` answers that branch's name, or null when none can be read,
 * for the refusal.
 */
function checked(record, nameOf) {
  if (!record || typeof record !== 'object') throw new StepError('record: none');
  if (typeof record.slug !== 'string' || !SLUG.test(record.slug)) throw new StepError(`record: slug ${JSON.stringify(record.slug)} is not a slug`);
  const base = record.base ?? null;
  if (base !== null && (typeof base !== 'string' || !RUN_BASE.test(base))) {
    throw new StepError(`record: base ${JSON.stringify(base)} is not ${nameOf() ?? '<login>-pilot'} or feat/<slug>`);
  }
  const artefact = record.artefact ?? `docs/design/${record.slug}/architecture.md`;
  if (typeof artefact !== 'string' || !/^[\w./-]+$/.test(artefact) || artefact.split('/').includes('..')) {
    throw new StepError(`record: artefact ${JSON.stringify(artefact)} is not a repository path`);
  }
  const feature = typeof record.feature === 'string' ? oneLine(record.feature).slice(0, TITLE_MAX) : '';
  return { slug: record.slug, base, artefact, feature: feature || record.slug };
}

/**
 * Makes the feature PR of `record` match it: `{ line, number?, wrote }`, `wrote` one of `created`,
 * `edited`, `unchanged`, `none`. `host` is the repository's **Host**, null at `none` (A1), and `git`
 * is `(args) => string` in the repository, argv only. Throws, naming the step, on a failure.
 */
export function syncFeaturePr({ host, git, record }) {
  // A refusal names the stored pilot branch, never deriving one.
  const nameOf = () => {
    try {
      return pilotBranch(git);
    } catch {
      return null;
    }
  };
  const { slug, base: recorded, artefact, feature } = checked(record, nameOf);
  const head = `feat/${slug}`;
  if (host === null) return { line: 'no PR: host none', wrote: 'none' };
  // The user's pilot branch (user-pilot-branch L5), derived from `host` and stored when neither the env nor the config
  // names it; a `feat/` base never needs it.
  let name = null;
  if (recorded === null || !recorded.startsWith('feat/')) {
    try {
      ({ name } = namePilotBranch({ git, host }));
    } catch (err) {
      throw new StepError(`pilot branch: ${firstLine(err)}`);
    }
  }
  const base = recorded ?? name;

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

  // `head` matches a branch name from any fork: only this repository's own PR is the feature PR.
  const open = step(host, 'reviews', () => host.reviews({ head, state: 'open', limit: LIST_LIMIT })).filter((pr) => pr?.crossRepo === false);

  // The PR's base is worked out on every write, so a write never undoes a retarget (audit-f14 L6).
  let prOn;
  try {
    prOn = prBase({ git, host, base, name });
  } catch (err) {
    throw new StepError(`base: ${firstLine(err)}`);
  }
  const done = writePr(host, open, { base: prOn, head, body, title: quiet(`feat(${slug}): ${feature}`) });
  const qa = typeof record.qaComment === 'string' && record.qaComment.trim() !== '' ? record.qaComment : null;
  if (qa === null) return done;
  // QA's one comment (spec 3; L3, A2): the host finds this account's comment carrying the marker every time.
  const comment = step(host, 'upsertComment', () => host.upsertComment(done.number, QA_MARKER, `${quiet(qa.trimEnd())}\n`));
  return comment === 'none' ? done : { ...done, line: `${done.line}; QA comment ${comment}` };
}

/** Opens the feature PR when none is `open`, or edits the open one where it differs from `body` and `base`. */
function writePr(host, open, { base, head, body, title }) {
  if (open.length === 0) {
    const { number } = step(host, 'open', () => host.open({ base, head, title, body, draft: true }));
    return { line: `feature PR #${number} opened`, number, wrote: 'created' };
  }

  const pr = open[0];
  if (!Number.isInteger(pr?.number) || pr.number < 1) throw new StepError(`${host.cli} reviews: a PR with no number`);
  const change = {
    ...(pr.base === base ? {} : { base }),
    ...(sameText(pr.body, body) ? {} : { body }),
  };
  if (Object.keys(change).length === 0) return { line: `feature PR #${pr.number} unchanged`, number: pr.number, wrote: 'unchanged' };
  step(host, 'edit', () => host.edit(pr.number, change));
  return { line: `feature PR #${pr.number} updated`, number: pr.number, wrote: 'edited' };
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
  const git = inject.git ?? ((args) => gitAt(cwd, ...args));
  const readRecord = inject.readRecord ?? deckRecord(cwd);
  try {
    let host;
    try {
      host = 'host' in inject ? inject.host : hostFor(cwd, { git });
    } catch (err) {
      throw new StepError(`host: ${firstLine(err)}`);
    }
    let record;
    try {
      record = await readRecord(argv[1]);
    } catch (err) {
      throw new StepError(`record: ${firstLine(err)}`);
    }
    if (!record) throw new StepError(`record: ticket ${argv[1]} has none`);
    say(`${syncFeaturePr({ host, git, record }).line}\n`);
    return 0;
  } catch (err) {
    say(`${oneLine(err instanceof StepError ? err.message : `pilot pr: ${firstLine(err)}`)}\n`);
    return 1;
  }
}
