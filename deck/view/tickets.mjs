/**
 * The Tickets panel as data (rune-deck-ui S15, spec 2, 3): the red, yellow and green queues the page's `renderStrips`
 * draws for a repository tab, each row with its state label, which arrows it has and its Continue state. The lane
 * reads are the page's (`laneOf`, `coPilotStateOf`); `swapOf` is `renderTicketQueue`'s, which lives inline there.
 */
import {
  KIND_STEPS,
  coPilotStateOf,
  isBlocking,
  isLanding,
  isOpen,
  isPaused,
  isQueued,
  isShortPath,
  laneOfState,
  nextTicketOf,
  openQuestionsOf,
  stateOf,
  ticketQueueOf,
} from '../items.mjs';
import { laneOf, runnableYellowOf } from '../lanes.mjs';
import { landingFor, tabFor, tabsOf } from '../tabs.mjs';
import { ticketLabelOf } from '../ui/render-rail.mjs';

/** The page's three queues, in its order and under its headings (ticket-states spec 3). */
const QUEUES = [
  ['red', 'Red'],
  ['yellow', 'Yellow'],
  ['green', 'Green'],
];

export function ticketsView(reads, query = {}) {
  const { run = null } = query;
  const tabs = tabsOf(reads.runs, reads.items, reads.numbers, reads.agents, reads.added, reads.lanes);
  const tab = run === null ? landingFor(tabs) : tabFor(tabs, run);
  if (!tab) return { repo: null, groups: [] };
  const { items } = reads;
  const { repo, switching, coPilot } = tab;
  const lanes = Object.fromEntries(['red', 'green'].map((state) => [state, laneOf(items, repo, laneOfState(state), { switching })]));
  // The rows in hand: every live ticket, else each stage's next (overview-one-ticket spec 10; three-lanes spec 6).
  const live = Object.values(lanes).map((lane) => lane.ticket).filter(Boolean);
  const marked = new Set((live.length ? live : Object.values(lanes).map((lane) => lane.next).filter(Boolean)).map((ticket) => ticket.id));
  const coPilotState = coPilotStateOf(items, repo, coPilot, switching);
  const coPilotPendingTo = coPilotState === 'switching' ? switching.coPilot.to : null;
  // A `queued` co-pilot lane's yellow head carries the co-pilot's `next` (the page's `yellowHead`).
  const yellowHead = coPilotState === 'queued' ? runnableYellowOf(items, repo)[0] : undefined;
  const groups = QUEUES.map(([colour, label]) => {
    const tickets = ticketQueueOf(items, repo, colour);
    const pendingTo = lanes[colour]?.pending ?? null;
    // A main-lane switch pending locks its own lane's arrows (ticket-state-accents spec 14).
    const locked = colour !== 'yellow' && pendingTo !== null;
    const swapOf = (ticket) =>
      colour === 'yellow'
        ? ticket.id === coPilot ? null : ticket.id === coPilotPendingTo ? 'pending' : coPilotPendingTo ? 'locked' : 'idle'
        : marked.has(ticket.id) || isLanding(ticket, items) ? null : ticket.id === pendingTo ? 'pending' : isPaused(ticket) ? null : pendingTo ? 'locked' : 'idle';
    // The page row's further lines (`renderTicketRow`): `next`, live, re-cut, questions, size, artefact, short path, threads, spec.
    const head = lanes[colour] ? nextTicketOf(items, repo, colour) : yellowHead;
    const rows = tickets.map((ticket, index) => {
      const asked = openQuestionsOf(items, ticket.id);
      const slices = ticket.plan ? ticket.plan.sliceCount : ticket.sliceCount;
      return {
        id: ticket.id,
        name: ticket.title,
        href: `/thread/${encodeURIComponent(ticket.id)}`,
        state: ticketLabelOf(ticket, stateOf(ticket), items),
        canMove: { up: !locked && index > 0, down: !locked && index < tickets.length - 1 },
        switch: swapOf(ticket),
        next: ticket.id === head?.id ? (colour === 'yellow' ? 'co-pilot' : 'main') : null,
        mark: colour === 'yellow' && ticket.id === coPilot ? 'co-pilot' : marked.has(ticket.id) ? 'in-hand' : null,
        live: ticket.live === true && !isLanding(ticket, items),
        recut: ticket.recut && colour === 'red' ? String(ticket.recut.why ?? '') : null,
        questions: { count: asked.length, blocking: asked.filter(isBlocking).length },
        slices: Number.isInteger(slices) ? slices : null,
        artefact: ticket.plan ? { name: String(ticket.plan.artefact), gate1: ticket.plan.gate1 } : null,
        shortPath: isShortPath(ticket),
        threads: items
          .filter((item) => item.ticket === ticket.id && (isQueued(item) || (item.kind === KIND_STEPS && isOpen(item))))
          .map(({ id, kind, title }) => ({ id, kind, title })),
        spec: ticket.body ?? '',
      };
    });
    return { colour, label, rows };
  });
  return { repo, groups };
}

export default ({ reads, query }) => ticketsView(reads, query);
