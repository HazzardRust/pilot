/**
 * The pilot's closes of a ticket's blocking questions, as the gate2 and the closing report list them
 * (blocking-close spec 3, L6): what the pilot cleared without the user, shown before Sign off and kept in the report.
 * Pure: the items in, the lines out.
 */

import { isPilotClose } from './blocked-shape.mjs';
import { isAnswered, isOpen } from './items.mjs';
import { reportAskGaps } from './report-shape.mjs';

const HEADING = 'Closed by the pilot:';

/** A line as the report shows it: in a code span when its own words would ask, so a report never asks (ADR 0148). */
const said = (text) => {
  const line = String(text ?? '').replace(/\s+/g, ' ').trim();
  return reportAskGaps(line).length === 0 ? line : `\`${line.replace(/`/g, "'")}\``;
};

/** The closed blocking questions of `ticketId` that the pilot closed and the user never answered (the veto is in `isPilotClose`). */
export const pilotClosesOf = (items, ticketId) => items.filter((item) =>
  item.ticket === ticketId && !isOpen(item) && !isAnswered(item) && isPilotClose(item, item.resolution, item.resolvedBy));

/** The section's lines: the heading, then each close as `- <id> <title>: <resolution>`, or `- none`. */
export const closedByPilotLines = (closes) => [
  HEADING,
  ...(closes.length > 0 ? closes.map((item) => `- ${said(`${item.id} ${item.title}: ${item.resolution}`)}`) : ['- none']),
];
