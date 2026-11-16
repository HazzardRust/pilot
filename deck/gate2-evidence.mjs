/**
 * A short-path ticket's gate2 carries its evidence in the body (short-path spec 2, L4, A2): one `Verdict:` line per
 * slice of the signed plan, a `Gate:` line, and a walkthrough when the plan changes a screen. A long-path gate2
 * with no walkthrough carries QA's checks table (walkthrough-surface spec 3, 4). Pure: the ticket and the gate2's fields in, the gaps out, so `postItem` refuses before it writes.
 */

import { isShortPath } from './items.mjs';

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
 * evidence (case-blind), its rule line, then every table line after it; `null` when there is no such table.
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
    rows.push(Array.from({ length: width }, (_, i) => cells[i] ?? ''));
  }
  return rows.length > 0 ? rows : null;
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
  const rows = checksRows(lines);
  if (!rows) return ['a gate2 with no walkthrough carries the checks table: | spec line | result | evidence |'];
  const empty = rows.findIndex((cells) => cells.includes(''));
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
 * The gaps in a walkthrough by `kind` on `ticket` (walkthrough-surface spec 5, 6; L2, L3): QA's on a plan marked
 * `surface: false` is one; the pilot's wizard, a plan without `surface` (signed before it existed) or no plan, none.
 */
export function walkthroughPlanGaps(ticket, kind) {
  if (kind !== 'qa' || ticket?.plan?.surface !== false) return [];
  return [`the plan ${ticket.plan.artefact} marks no surface: no walkthrough; the checks table goes in the gate2`];
}
