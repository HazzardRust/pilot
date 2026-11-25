/**
 * The closing report on landed (gate2-frees-lane spec 4; lander S15, spec 8b, L12). Once a landing is
 * `landed`, the deck resolves the gate2 if it is open and posts nothing: the lander posts the closing report,
 * and there is no orphan fallback. The lander's report comes bodiless, and the deck fills it with the minimal
 * report built from the ticket's run record and land's line before it is stored; that report closes the
 * ticket and wakes the pilot with `REPORT_DUE`. It never chains: the press already filled the lanes (L3).
 */

import fs from 'node:fs';

import { git as gitAt } from '../scripts/pilot-branch.mjs';
import { runWorktrees } from '../scripts/worktrees.mjs';
import { readRefusals } from './classifier-log.mjs';
import { isPilotClose, mayPilotClose } from './blocked-shape.mjs';
import { KIND_GATE2, KIND_REPORT, KIND_STEPS, KIND_TICKET, authorKind, gate2Blockers, isAnswered, isBlocking, isOpen, ownerOf, sameRepo } from './items.mjs';
import { findCredential } from './credential.mjs';
import { MAX_HUMAN_STEPS, MAX_HUMAN_STEP_CHARS, REPORT_DUE } from './items-bounds.mjs';
import { CONFLICT_TITLE, LANDING_KINDS } from './landing-replies.mjs';
import { reportAskGaps } from './report-shape.mjs';
import { mergeMethodOf } from './host.mjs';
import { rankFriction, repoOf } from './runs.mjs';
import { DeckRefusal } from './store-core.mjs';
import { noteDeck, postItem, resolveItem } from './store-items.mjs';
import { postSteps } from './store-steps.mjs';
import { listItems, recordForTicket } from './store-runs.mjs';

export { REPORT_DUE };

/** A line as the report shows it: in a code span when its own words would ask, so a report never asks (ADR 0148). */
const said = (text) => {
  const line = String(text ?? '').replace(/\s+/g, ' ').trim();
  return reportAskGaps(line).length === 0 ? line : `\`${line.replace(/`/g, "'")}\``;
};

/** The pilot's closes as the gate2 and the report list them (blocking-close spec 3, L6), bounded so a thread cannot flood either. */
const [CLOSED_BY_PILOT, MAX_CLOSES, MAX_CLOSE_TEXT] = ['Closed by the pilot:', 20, 300];

/** The closed blocking questions of `ticketId` in `repo` that the pilot closed and the user never answered (the veto is in `isPilotClose`). */
export const pilotClosesOf = (items, ticketId, repo) => items.filter((item) => item.ticket === ticketId && sameRepo(item.repo, repo)
  && !isOpen(item) && !isAnswered(item) && isPilotClose(item, item.resolution, item.resolvedBy));

/** Text past `MAX_CLOSE_TEXT` characters, cut with an ellipsis. */
const clipped = (text) => (text.length > MAX_CLOSE_TEXT ? `${text.slice(0, MAX_CLOSE_TEXT - 1)}…` : text);

/** The section's lines: the heading, then each close as `- <id> <title>: <resolution>`, at most `MAX_CLOSES` and `- and N more`, or `- none`. */
export const closedByPilotLines = (closes) => [
  CLOSED_BY_PILOT,
  ...closes.slice(0, MAX_CLOSES).map((item) => `- ${item.id} ${said(clipped(`${item.title}: ${item.resolution}`))}`),
  ...(closes.length > MAX_CLOSES ? [`- and ${closes.length - MAX_CLOSES} more`] : []),
  ...(closes.length === 0 ? ['- none'] : []),
];

/** The section's lines: `Blocked steps: <n>`, then `- <agent> <reason>: <count>` by count, agent, reason; or `Blocked steps: none`. */
export function blockedStepLines(refusals) {
  if (refusals.length === 0) return ['Blocked steps: none'];
  const counts = new Map();
  for (const { agent, reason } of refusals) {
    const row = JSON.stringify([agent, reason]);
    counts.set(row, { agent, reason, count: (counts.get(row)?.count ?? 0) + 1 });
  }
  const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const rows = [...counts.values()].sort((a, b) => b.count - a.count || order(a.agent, b.agent) || order(a.reason, b.reason));
  return [`Blocked steps: ${refusals.length}`, ...rows.map((row) => `- ${said(row.agent)} ${said(row.reason)}: ${row.count}`)];
}

/** The repository's `pilot.merge`, or the Error that says why it cannot be read: the step names it and never hides it. */
function methodAt(repo) {
  try {
    return mergeMethodOf((args) => gitAt(repo, ...args));
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err));
  }
}

/**
 * The ticket's blocked-step lines from the classifier log, by ticket id alone: a crew session logs its own
 * worktree's spelling of the repo, never the gate's. A log that cannot be read says so and never stops the report.
 */
function blockedStepsOf(ticket) {
  try {
    return blockedStepLines(readRefusals({ ticket }));
  } catch (err) {
    return [`Blocked steps: unknown (${said(String(err?.message ?? err).split('\n')[0])})`];
  }
}

/**
 * Land's main line, in S2's `mainLine` shapes only (one-integration-line A1): `main gets pilot: #<n>`, with
 * ` (opened)` or not; `… open a PR from <x> to main by hand`; `… no open PR`; `… unknown (<why>)`. The last one land printed.
 */
const MAIN_LINE = /^main gets pilot: (?:#(\d+)(?: \(opened\))?|open a PR from (\S+) to main by hand|merge (\S+) into main by hand|no open PR|unknown \(.*\))$/gm;

/** Land's main line and the PR or by-hand branch it names: `[line, number, byHand, merged]`, the last one land printed. */
const mainLineOf = (gate) => [...String(gate?.landing?.line ?? '').matchAll(MAIN_LINE)].at(-1) ?? [];

/**
 * Land's feature line, in S4's `featureLine` shapes (audit-f14): `feature PR: #<n> into <base>` with ` (after #<below>)`
 * for a stack, `none (no host)`, or `unknown (<why>)`.
 */
const FEATURE_LINE = /^feature PR: (?:#(\d+) into (\S+?)(?: \(after #(\d+)\))?|none \(.*\)|unknown \((.*)\))$/gm;

/** The step's method words: `pilot.merge`'s `merge` is a merge commit, `squash` a squash. */
const METHOD_WORDS = { merge: 'a merge commit', squash: 'a squash' };

/**
 * The human step for a main-cut feature, from land's last `feature PR:` line: "Merge #<below>, then #<n> with a <method>",
 * or "Merge #<n> with a <method>". A line that names no PR asks the pilot; no feature line at all is undefined.
 */
export function humanStep({ line, method }) {
  const [, number, , below, why] = [...String(line ?? '').matchAll(FEATURE_LINE)].at(-1) ?? [];
  if (number === undefined && why === undefined && !/^feature PR: none/m.test(String(line ?? ''))) return undefined;
  if (number === undefined) return why === undefined ? 'Land opened no feature PR (no host): merge the feature branch by hand' : `Land named no feature PR (${said(why)}): check which PR brings this feature in`;
  // A setting that cannot be read still gets the default words, with the cause beside them.
  const how = method instanceof Error ? `${METHOD_WORDS.merge} (${said(String(method.message).split('\n')[0])})` : (METHOD_WORDS[method] ?? METHOD_WORDS.merge);
  return below === undefined ? `Merge #${number} with ${how}` : `Merge #${below}, then #${number} with ${how}`;
}

/** Land's last `feature PR:` line, whole, or undefined. */
const featureLineOf = (gate) => [...String(gate?.landing?.line ?? '').matchAll(FEATURE_LINE)].at(-1)?.[0];

/** A legacy landing's first human step, from land's main line (spec 3): the one PR the user merges for main. */
function mainStep(number, byHand, merged) {
  // No branch named: the PR's base is the host's default branch, which land does not print (QA F3).
  if (number !== undefined) return `Merge #${number} with a merge commit, when you want main to have it.`;
  // Run host `none` (other-host spec 3): no PR exists to open, so the branch itself is merged by hand.
  if (merged !== undefined) return `Merge ${said(merged)} into main by hand, with a merge commit.`;
  // A bare branch is on no remote yet (run remote `none`): it is pushed before a PR can name it. A pilot branch's
  // name holds no `/`; on a run remote it reads `<remote>/<name>`.
  if (byHand !== undefined && !byHand.includes('/')) return `Push ${said(byHand)}, then open a PR from ${said(byHand)} to main by hand, and merge it with a merge commit.`;
  if (byHand !== undefined) return `Open a PR from ${said(byHand)} to main by hand, and merge it with a merge commit.`;
  return 'land named no main PR, so check which PR brings pilot to main.';
}

/** A landing's last human step: other runs' branches are the user's to prune (lander S10, S15). */
const PRUNE_STEP = "Prune other runs' branches: pilot branches prune --dry-run first.";

/** What stands in for a step or a worktree path that looks like a credential, so the thread and report still post and store none. */
const REMOVE_WITHHELD = 'Remove a worktree the closing report lists when you are done with it.';
const STEP_WITHHELD = 'A step is in the run record; it named a credential-shaped value.';
const LEFT_WITHHELD = 'a worktree whose path looks like a credential (withheld)';

/** A step as the thread may store it: one line of at most `MAX_HUMAN_STEP_CHARS`, or `STEP_WITHHELD`. */
const stepText = (text) => {
  const line = text.replace(/\s+/g, ' ');
  return findCredential(line) ? STEP_WITHHELD : line.length > MAX_HUMAN_STEP_CHARS ? `${line.slice(0, MAX_HUMAN_STEP_CHARS - 1)}…` : line;
};

/**
 * A landing's first human step: the feature PR(s) land's `feature PR:` line names, merged by `method`
 * (audit-f14), else a legacy run's main-PR step.
 */
function firstStepOf(gate, method) {
  const featureLine = featureLineOf(gate);
  if (featureLine !== undefined) return `${humanStep({ line: featureLine, method })}.`;
  const [, number, byHand, merged] = mainLineOf(gate);
  return mainStep(number, byHand, merged);
}

/**
 * A landing's human steps (human-steps spec 1, A5): the feature-PR or main-PR step, the record's recorded steps, one
 * `Remove <path>` per worktree `left`, the prune step. Past 20 the removes fold into one and the
 * recorded steps' overflow into a pointer to the record. Each one line of at most 300 characters; one
 * naming a credential-shaped value is a neutral pointer, since `postSteps` would refuse the thread.
 */
export function stepsOf(record, gate, left, method = 'merge') {
  const recorded = (Array.isArray(record?.humanSteps) ? record.humanSteps : []).map((step) => String(step?.text ?? '').trim()).filter(Boolean);
  const removes = (Array.isArray(left) ? left : []).map((dir) => (findCredential(dir) ? REMOVE_WITHHELD : `Remove ${said(dir)} when you are done with it.`));
  const over = 2 + recorded.length + removes.length > MAX_HUMAN_STEPS;
  const tail = over && removes.length > 1 ? [`Remove the ${removes.length} worktrees the closing report lists when you are done with them.`] : removes;
  const room = MAX_HUMAN_STEPS - 2 - tail.length;
  const kept = recorded.length > room ? [...recorded.slice(0, room - 1), `${recorded.length - room + 1} more steps are in the run record's humanSteps.`] : recorded;
  return [firstStepOf(gate, method), ...kept, ...tail, PRUNE_STEP].map((text) => ({ text: stepText(text) }));
}

/** The `left` line of a git that could not list: the cause's first line when there is one. */
const noneRecorded = (cause) => {
  const why = String(cause?.message ?? '').split('\n')[0];
  return why ? `- none recorded: ${said(why)}` : '- none recorded';
};

/**
 * The minimal closing report (spec 4): the landing SHA, land's main line, the record's slices and
 * their PRs, the run's worktrees `left` on disk, and the record's friction ranked. Built from the record,
 * the gate2's landing and `left`; it asks nothing (report-shape, ADR 0148). `left` not a list is a git
 * that could not list (an Error says why): `none recorded`.
 */
export function closingReportOf(record, gate, left, closes = [], blocked = blockedStepLines([])) {
  const { sha } = gate?.landing ?? {};
  const name = record?.feature ?? record?.slug ?? 'the feature';
  const rows = (Array.isArray(record?.slices) ? record.slices : []).filter((row) => row?.slice !== record?.slug);
  const { agents, drains } = rankFriction(record?.friction);
  const list = (entries, none) => (entries.length > 0 ? entries.map((entry) => `- ${entry}`) : [`- ${none}`]);
  // Land's feature line, else a legacy run's main line, whole: a record line; its step is the steps thread's (human-steps L2).
  const [mainLine] = mainLineOf(gate);
  const landLine = featureLineOf(gate) ?? mainLine;
  const body = [
    `Landed ${said(gate?.pr ?? 'the feature PR')} at ${said(sha ?? 'an unknown SHA')}.`,
    landLine === undefined ? 'main gets pilot: not printed by land' : said(landLine),
    '',
    'Slices:',
    ...list(rows.map((row) => `${said(row.slice)}${row.pr ? ` (#${row.pr})` : ''}`), 'none recorded'),
    '',
    // What is on disk when the report posts (lander-tail spec 5, L7), never land's earlier `kept` lines.
    'Worktrees left:',
    ...(Array.isArray(left) ? list(left.map((dir) => (findCredential(dir) ? LEFT_WITHHELD : said(dir))), 'none') : [noneRecorded(left)]),
    '',
    ...closedByPilotLines(closes),
    '',
    ...blocked,
    '',
    'Friction:',
    ...list([
      ...agents.map((row) => `${said(row.agent)}: ${said(row.what)} (${said(row.evidence)})`),
      ...drains.map((row) => `drain: ${said(row.what)} (${row.size})`),
    ], 'none recorded'),
  ].join('\n');
  return { title: `Closing report: ${said(name)}`, body };
}

/** An open blocking question on `ticketId` the deck or the lander posted about the landing, and a pilot close may clear. */
const isLandingQuestion = (item, ticketId) => isBlocking(item) && item.ticket === ticketId && mayPilotClose(item)
  && (item.author === 'lander' || (item.author === undefined && String(item.title).startsWith(CONFLICT_TITLE)));

/**
 * Resolve a landed gate2 (spec 4, lander S15): the gate2 only, if it is open. It posts no report and
 * finishes no record: the lander does both. Null when there is nothing to resolve: no landed open gate2,
 * its ticket already closed, or a blocked item open on it. Never `chainNext` (L3). A refusal from the
 * store throws to the caller.
 */
export function closeLanded(gate2Id) {
  const items = listItems();
  const gate = items.find((item) => item.id === gate2Id && item.kind === KIND_GATE2);
  if (gate?.landing?.state !== 'landed' || !isOpen(gate)) return null;
  const ticket = items.find((item) => item.id === gate.ticket && item.kind === KIND_TICKET);
  if (!ticket || !isOpen(ticket)) return null;
  // The landing's own questions are moot now (never-stuck spec 5); a close the user vetoed stays, and holds the gate2.
  const sha = String(gate.landing.sha ?? '').slice(0, 7) || 'an unknown SHA';
  for (const item of items) if (isLandingQuestion(item, ticket.id)) resolveItem(item.id, `Moot: landed ${sha}`, 'pilot');
  // A blocked item the user owes keeps the gate2 open.
  if (gate2Blockers(listItems(), ticket.id).length > 0) return null;
  return resolveItem(gate.id, `landed at ${gate.landing.sha ?? 'an unknown SHA'}`, ownerOf(gate));
}

/**
 * Run `slug`'s worktree paths still on disk as the report posts (lander-tail spec 5, A3): read from git
 * only, no fetch and no prune. The error when git cannot list, so the post goes on with `none recorded: <why>`.
 */
function worktreesLeft(repo, slug) {
  try {
    return runWorktrees(repo, slug).filter((dir) => fs.existsSync(dir));
  } catch (err) {
    return err;
  }
}

/**
 * Post an item as `deck_post` does, filling the lander's bodiless report first (lander S15, L12): a `report`
 * with a ticket and no body, on a ticket whose newest gate2 has landed, takes its title and body from
 * `closingReportOf` over the ticket's run record, and the deck notes `REPORT_DUE` on it so the pilot's
 * `Findings:` reply follows as before (one-integration-line spec 8). Only the lander's, or the pilot's
 * unstamped, is filled, and only from a gate2 of the caller's own repository. A blank body (`""`, whitespace)
 * is no body: an MCP client may send one for an optional string (lander-tail spec 1). A report with a body is
 * posted as it came; a bodiless one before its gate2 has landed is refused: there is nothing to fill it from.
 * The fill posts the ticket's steps thread (`stepsOf`) first, unless one already names the ticket, and refuses
 * a second report on the ticket (human-steps L2, spec 8).
 */
export function postFilled(fields) {
  const { kind, body, ticket, author, repo } = fields ?? {};
  const bodiless = body === undefined || (typeof body === 'string' && body.trim() === '');
  // A blank gate2 body gets no section, so the empty-body refusal still fires.
  if (kind === KIND_GATE2 && typeof ticket === 'string' && typeof body === 'string' && !bodiless) {
    const closes = pilotClosesOf(listItems(), ticket, repoOf(repo) ?? repo);
    return postItem(closes.length > 0 ? { ...fields, body: `${body}\n\n${closedByPilotLines(closes).join('\n')}` } : fields);
  }
  if (kind !== KIND_REPORT || !bodiless || typeof ticket !== 'string') return postItem(fields);
  // Only the lander, or the pilot unstamped, closes a ticket this way; any other writer gets the empty-body refusal.
  if (!LANDING_KINDS.includes(author === undefined ? 'pilot' : authorKind(author))) return postItem(fields);
  const gate = listItems().findLast((item) => item.kind === KIND_GATE2 && item.ticket === ticket);
  if (gate && !sameRepo(repoOf(repo) ?? repo, repoOf(gate.repo) ?? gate.repo)) {
    throw new DeckRefusal(`a report without a body is filled from its own repository's gate2, and ${ticket}'s is in another repository`);
  }
  if (gate?.landing?.state !== 'landed') {
    const state = gate ? `is ${gate.landing?.state ?? 'not pressed'}` : 'is missing';
    throw new DeckRefusal(`a report without a body is filled from a landed gate2, and ${ticket}'s newest gate2 ${state}`);
  }
  const { record } = recordForTicket(gate.repo, ticket);
  // A report built from no record would close the ticket on an empty one; the lander is told instead.
  if (!record) throw new DeckRefusal(`a report without a body is filled from the run record, and no run record names ${ticket}`);
  // A retried post (human-steps spec 8): the ticket's one report stands, and a lost one finds its thread posted.
  const items = listItems();
  const first = items.find((item) => item.kind === KIND_REPORT && item.ticket === ticket);
  if (first) throw new DeckRefusal(`${ticket} already has its closing report, ${first.id}`);
  const left = worktreesLeft(gate.repo, record.slug);
  // The steps thread before the report (L2), so the report's post leaves the ticket green under it.
  if (!items.some((item) => item.kind === KIND_STEPS && item.ticket === ticket)) {
    postSteps({ ticket, repo: gate.repo, title: `Human steps: ${said(record.feature ?? record.slug)}`, steps: stepsOf(record, gate, left, methodAt(gate.repo)) });
  }
  // Filed under the gate2's repository, as the deck's own report was, never the poster's worktree.
  const report = postItem({ ...fields, repo: gate.repo, ...closingReportOf(record, gate, left, pilotClosesOf(listItems(), ticket, gate.repo), blockedStepsOf(ticket)) });
  noteDeck(report.id, REPORT_DUE);
  return report;
}
