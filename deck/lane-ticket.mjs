/**
 * The ticket a denied agent's lane works on (blocked-yellow-yields spec 7, A2): the one its Blocked item is filed
 * under, so a crew denial holds the gate2 of the ticket it holds up and not the planning ticket's. Decided here
 * once, deck-side, by agent type; the hooks ask `GET /api/tickets?repo=&agent=` and hold no copy of the table.
 */

import { KIND_TICKET, liveTicketOf, sameRepo, stateOf } from './items.mjs';

/** The co-pilot and every agent it or its implementers spawn: the yellow lane's crew. */
const CO_PILOT_CREW = Object.freeze([
  'pilot:pilot-co-pilot',
  'pilot:pilot-implementer',
  'pilot:pilot-fact-sheet',
  'pilot:pilot-fundamentalist',
  'pilot:pilot-evidence-runner',
  'pilot:typescript-reviewer',
  'pilot:react-reviewer',
  'pilot:python-reviewer',
  'pilot:go-reviewer',
  'pilot:rust-reviewer',
  'pilot:cpp-reviewer',
  'pilot:database-reviewer',
  'pilot:security-reviewer',
  'pilot:silent-failure-hunter',
  'pilot:build-error-resolver',
  'pilot:react-build-resolver',
]);

const QA = 'pilot:pilot-qa';

/** An open yellow ticket of `repo`: what a live co-pilot holds, checked again so a stale entry files nothing. */
const isYellowTicketIn = (item, repo) => item.kind === KIND_TICKET && sameRepo(item.repo, repo) && stateOf(item) === 'yellow';

/**
 * `agentType`'s lane ticket in `repo`, or undefined for none: the crew's is the live co-pilot's ticket, else the
 * live concluding one; QA's the live concluding one; anyone else's (the pilot, its planning roles) the live
 * planning one. `coPilot` is `coPilotFor(repo)`, `{ ticket, live }` or null.
 */
export function laneTicketOf(items, repo, agentType, coPilot) {
  if (CO_PILOT_CREW.includes(agentType)) {
    const held = coPilot?.live === true ? items.find((item) => item?.id === coPilot.ticket && isYellowTicketIn(item, repo)) : undefined;
    return held ?? liveTicketOf(items, repo, 'green');
  }
  return liveTicketOf(items, repo, agentType === QA ? 'green' : 'red');
}
