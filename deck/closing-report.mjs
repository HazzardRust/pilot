/**
 * The closing report on landed (gate2-frees-lane spec 4; lander S15, spec 8b, L12). Once a landing is
 * `landed`, the deck resolves the gate2 if it is open and posts nothing: the lander posts the closing report,
 * and there is no orphan fallback. The lander's report comes bodiless, and the deck fills it with the minimal
 * report built from the ticket's run record and land's line before it is stored; that report closes the
 * ticket and wakes the pilot with `REPORT_DUE`. It never chains: the press already filled the lanes (L3).
 */

import fs from 'node:fs';

import { runWorktrees } from '../scripts/worktrees.mjs';
import { KIND_GATE2, KIND_REPORT, KIND_TICKET, authorKind, gate2Blockers, isOpen, ownerOf, sameRepo } from './items.mjs';
import { REPORT_DUE } from './items-bounds.mjs';
import { LANDING_KINDS } from './landing-replies.mjs';
import { reportAskGaps } from './report-shape.mjs';
import { rankFriction, repoOf } from './runs.mjs';
import { DeckRefusal } from './store-core.mjs';
import { noteDeck, postItem, resolveItem } from './store-items.mjs';
import { listItems, recordForTicket } from './store-runs.mjs';

export { REPORT_DUE };

/** A line as the report shows it: in a code span when its own words would ask, so a report never asks (ADR 0148). */
const said = (text) => {
  const line = String(text ?? '').replace(/\s+/g, ' ').trim();
  return reportAskGaps(line).length === 0 ? line : `\`${line.replace(/`/g, "'")}\``;
};

/**
 * Land's main line, in S2's `mainLine` shapes only (one-integration-line A1): `main gets pilot: #<n>`, with
 * ` (opened)` or not; `… open a PR from <x> to main by hand`; `… no open PR`; `… unknown (<why>)`. The last one land printed.
 */
const MAIN_LINE = /^main gets pilot: (?:#(\d+)(?: \(opened\))?|open a PR from (\S+) to main by hand|no open PR|unknown \(.*\))$/gm;

/** The closing report's first human step, from land's main line (spec 3): the one PR the user merges for main. */
function mainStep(number, byHand) {
  if (number !== undefined) return `Human step: Merge #${number} into main with a merge commit, when you want main to have it.`;
  // A bare branch is on no remote yet (run remote `none`): it is pushed before a PR can name it.
  if (byHand === 'pilot') return 'Human step: Push pilot, then open a PR from pilot to main by hand, and merge it with a merge commit.';
  if (byHand !== undefined) return `Human step: Open a PR from ${said(byHand)} to main by hand, and merge it with a merge commit.`;
  return 'Human step: land named no main PR, so check which PR brings pilot to main.';
}

/** The closing report's last human step: other runs' branches are the user's to prune (lander S10, S15). */
const PRUNE_STEP = "Human step: Prune other runs' branches: pilot branches prune --dry-run first.";

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
export function closingReportOf(record, gate, left) {
  const { sha, line } = gate?.landing ?? {};
  const name = record?.feature ?? record?.slug ?? 'the feature';
  const rows = (Array.isArray(record?.slices) ? record.slices : []).filter((row) => row?.slice !== record?.slug);
  const { agents, drains } = rankFriction(record?.friction);
  const list = (entries, none) => (entries.length > 0 ? entries.map((entry) => `- ${entry}`) : [`- ${none}`]);
  // Land's main line, whole, and the PR or the by-hand branch it names.
  const [mainLine, number, byHand] = [...String(line ?? '').matchAll(MAIN_LINE)].at(-1) ?? [];
  const body = [
    `Landed ${said(gate?.pr ?? 'the feature PR')} at ${said(sha ?? 'an unknown SHA')}.`,
    mainLine === undefined ? 'main gets pilot: not printed by land' : said(mainLine),
    mainStep(number, byHand),
    // The lander leaves other runs' branches to the user (lander S10 took the prune out of the pilot's tail).
    PRUNE_STEP,
    '',
    'Slices:',
    ...list(rows.map((row) => `${said(row.slice)}${row.pr ? ` (#${row.pr})` : ''}`), 'none recorded'),
    '',
    // What is on disk when the report posts (lander-tail spec 5, L7), never land's earlier `kept` lines.
    'Worktrees left:',
    ...(Array.isArray(left) ? list(left.map(said), 'none') : [noneRecorded(left)]),
    '',
    'Friction:',
    ...list([
      ...agents.map((row) => `${said(row.agent)}: ${said(row.what)} (${said(row.evidence)})`),
      ...drains.map((row) => `drain: ${said(row.what)} (${row.size})`),
    ], 'none recorded'),
  ].join('\n');
  return { title: `Closing report: ${said(name)}`, body };
}

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
  // A blocked item the user owes keeps the gate2 open.
  if (gate2Blockers(items, ticket.id).length > 0) return null;
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
 */
export function postFilled(fields) {
  const { kind, body, ticket, author, repo } = fields ?? {};
  const bodiless = body === undefined || (typeof body === 'string' && body.trim() === '');
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
  // Filed under the gate2's repository, as the deck's own report was, never the poster's worktree.
  const report = postItem({ ...fields, repo: gate.repo, ...closingReportOf(record, gate, worktreesLeft(gate.repo, record.slug)) });
  noteDeck(report.id, REPORT_DUE);
  return report;
}
