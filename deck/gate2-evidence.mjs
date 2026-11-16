/**
 * A short-path ticket's gate2 carries its evidence in the body (short-path spec 2, L4, A2): one `Verdict:` line per
 * slice of the signed plan, a `Gate:` line, and a walkthrough when the plan changes a screen. A long-path gate2 is
 * not read. Pure: the ticket and the gate2's fields in, the gaps out, so `postItem` refuses before it writes.
 */

import { isShortPath } from './items.mjs';

/** Lines of `body` that start with `label`, leading space aside. */
const linesStarting = (body, label) => body.split('\n').filter((line) => line.trimStart().startsWith(label)).length;

/** The gaps in a gate2 on `ticket`, `[]` unless that ticket is short path and the gate2 lacks its evidence. */
export function gate2EvidenceGaps(ticket, { body, walkthrough }) {
  if (!isShortPath(ticket)) return [];
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
