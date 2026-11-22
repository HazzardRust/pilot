/**
 * A short-path ticket's gate2 carries its evidence in the body (short-path spec 2, L4, A2): one `Verdict:` line per
 * slice of the signed plan, a `Gate:` line, and a walkthrough when the plan changes a screen. A long-path gate2
 * with no walkthrough carries QA's checks table (walkthrough-surface spec 3, 4). Pure: the ticket and the gate2's fields in, the gaps out, so `postItem` refuses before it writes.
 */

import { KIND_QUESTION, KIND_WALKTHROUGH, isShortPath, sameRepo } from './items.mjs';

/** Lines of `body` that start with `label`, leading space aside. */
const linesStarting = (body, label) => body.split('\n').filter((line) => line.trimStart().startsWith(label)).length;

const REASON = 'surface planned, no walkthrough:';

/** The cells of a markdown table line, or `null` when the line is not one. */
function cellsOf(line) {
  const text = line.trim();
  if (!text.startsWith('|')) return null;
  return text.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

/**
 * The checks table's data rows in `body` (walkthrough-surface spec 4, L11): the first head naming spec, result and
 * evidence (case-blind), its rule line, then every table line after it, and the head's width; `null` when there is no
 * such table. Rows are not padded to the width: a wide head over many short rows would cost rows × width.
 */
function checksRows(lines) {
  const at = lines.findIndex((line, i) => {
    const head = cellsOf(line)?.map((cell) => cell.toLowerCase());
    const rule = cellsOf(lines[i + 1] ?? '');
    return head && rule && ['spec', 'result', 'evidence'].every((name) => head.some((cell) => cell.includes(name)))
      && rule.every((cell) => /^:?-+:?$/.test(cell));
  });
  if (at === -1) return null;
  const width = cellsOf(lines[at]).length;
  const rows = [];
  for (const line of lines.slice(at + 2)) {
    const cells = cellsOf(line);
    if (!cells) break;
    rows.push(cells);
  }
  return rows.length > 0 ? { rows, width } : null;
}

/**
 * A full run's gate2 (walkthrough-surface spec 3, 4; L11): one that names no walkthrough carries the checks table,
 * and on a plan with a surface it says why there is none. A gate2 naming its walkthrough is not read.
 */
function fullRunGaps(surface, body, walkthrough) {
  if (walkthrough !== undefined) return [];
  const lines = body.split('\n');
  const reasoned = lines.some((line) => line.trimStart().startsWith(REASON) && line.trimStart().slice(REASON.length).trim() !== '');
  if (surface && !reasoned) return [`a gate2 on a plan with a surface names its walkthrough or says why not: ${REASON} <reason>`];
  const table = checksRows(lines);
  if (!table) return ['a gate2 with no walkthrough carries the checks table: | spec line | result | evidence |'];
  const empty = table.rows.findIndex((cells) => cells.length < table.width || cells.includes(''));
  return empty === -1 ? [] : [`checks table row ${empty + 1} has an empty cell`];
}

/**
 * The gaps in a gate2 on `ticket`: a short path's evidence lines, or a full run's checks table on a plan that names
 * `surface`; `[]` for a plan signed before `surface` existed, or no plan.
 */
export function gate2EvidenceGaps(ticket, { body, walkthrough }) {
  if (!isShortPath(ticket)) return typeof ticket?.plan?.surface === 'boolean' ? fullRunGaps(ticket.plan.surface, body, walkthrough) : [];
  const { sliceCount, surface } = ticket.plan;
  const verdicts = linesStarting(body, 'Verdict:');
  if (verdicts < sliceCount) return [`a short-path gate2 carries one Verdict: line per slice: ${verdicts} for ${sliceCount} slices`];
  if (linesStarting(body, 'Gate:') === 0) return ["a short-path gate2 carries a Gate: line, the slice gate's pass and fail counts"];
  if (surface === true && walkthrough === undefined) return ['a short-path gate2 with a surface names its walkthrough'];
  return [];
}

/**
 * The gap in the walkthrough a gate2 names among `items` (walkthrough-surface F1): it is a walkthrough on the gate2's
 * own ticket, or a made-up id would skip the checks table. The refusal does not echo the id.
 */
export function namedWalkthroughGaps(items, { walkthrough, ticket }) {
  if (walkthrough === undefined) return [];
  const named = items.find((item) => item.id === walkthrough);
  return named?.kind === KIND_WALKTHROUGH && named.ticket === ticket ? [] : ['a gate2 names a walkthrough on its ticket, and the walkthrough it names is not one'];
}

/**
 * The gaps in a walkthrough by `kind` on `ticket` (walkthrough-surface spec 5, 6; L2, L3): QA's on a plan marked
 * `surface: false` is one; QA's on `surface: true` owes a `Differences: itm_…` line naming a question on its ticket
 * (ui-design-workflow spec 6, L3), the id never echoed; the pilot's wizard, a plan without `surface` (signed before it
 * existed) or no plan, none.
 */
export function walkthroughPlanGaps(ticket, kind, body = '', items = []) {
  if (kind !== 'qa') return [];
  const surface = ticket?.plan?.surface;
  if (surface === false) return [`the plan ${ticket.plan.artefact} marks no surface: no walkthrough; the checks table goes in the gate2`];
  if (surface !== true) return [];
  const id = differencesOf(body);
  const list = id === undefined ? undefined : items.find((item) => item.id === id);
  return list?.kind === KIND_QUESTION && list.ticket === ticket.id ? [] : ["QA's walkthrough on a surface plan names its difference list, a question on its ticket: Differences: itm_…"];
}

/** The look lines a surface gate1 owes (ui-design-workflow spec 10, L3). */
const LOOK_LINES = ['Fonts:', 'Colour means:', 'Reference:'];

/**
 * What a gate1 still owes when its plan has a surface (ui-design-workflow spec 10, L3, A2): a body line for each of
 * the fonts, what colour means and a reference per region, so the user reads the look at Gate 1. None otherwise.
 */
export function surfaceGate1Gaps(surface, body) {
  if (surface !== true) return [];
  return LOOK_LINES.filter((label) => linesStarting(String(body), label) === 0)
    .map((label) => `a gate1 with a surface carries a \`${label} <what>\` line in its body`);
}

/** The id a `Differences:` line names in `body`, or `undefined`. */
const differencesOf = (body) => /^\s*Differences:\s*(itm_[0-9a-z]+)/m.exec(String(body))?.[1];

/**
 * What a gate1 on `ticket` still owes when the ticket carries a re-cut mark (never-stuck spec 15, L5): a body line
 * `Changed since <sha7>:` telling the user what moved since the plan they signed. An empty list for any other gate1.
 */
export function recutGate1Gaps(ticket, body) {
  if (!ticket?.recut || /^Changed since [0-9a-f]{7}:/m.test(String(body))) return [];
  const from = typeof ticket.recut.from === 'string' ? ticket.recut.from.slice(0, 7) : 'the signed plan';
  return [`a re-cut's gate1 lists what changed since ${from}: add a line \`Changed since ${from}: <what>\` to its body`];
}

/** A gate2 naming a branch (host none, other-host spec 3) names its ticket's own, from its run record (QA F1). */
export function ownBranchGaps(records, ticket, pr) {
  if (typeof pr !== 'string' || !pr.startsWith('feat/')) return [];
  const record = (Array.isArray(records) ? records : []).findLast((entry) => sameRepo(entry?.repo, ticket.repo) && entry?.record?.ticket === ticket.id)?.record;
  const own = record?.branch ?? (typeof record?.slug === 'string' ? `feat/${record.slug}` : 'none');
  return pr === own ? [] : [`a gate2's pr is its ticket's own branch, and ${ticket.id}'s run record names ${own}, not ${pr}`];
}
