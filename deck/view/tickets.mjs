/**
 * The Tickets panel as data (rune-deck-ui S15, spec 2, 3): the red, yellow and green queues the page's `renderStrips`
 * draws for a repository tab, each row with its state label, which arrows it has and its Continue state. The lane
 * reads are the page's (`laneOf`, `coPilotStateOf`); `swapOf` is `renderTicketQueue`'s, which lives inline there.
 */
import { coPilotStateOf, isLanding, isPaused, laneOfState, stateOf, ticketQueueOf } from '../items.mjs';
import { laneOf } from '../lanes.mjs';
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
  const coPilotPendingTo = coPilotStateOf(items, repo, coPilot, switching) === 'switching' ? switching.coPilot.to : null;
  const groups = QUEUES.map(([colour, label]) => {
    const tickets = ticketQueueOf(items, repo, colour);
    const pendingTo = lanes[colour]?.pending ?? null;
    // A main-lane switch pending locks its own lane's arrows (ticket-state-accents spec 14).
    const locked = colour !== 'yellow' && pendingTo !== null;
    const swapOf = (ticket) =>
      colour === 'yellow'
        ? ticket.id === coPilot ? null : ticket.id === coPilotPendingTo ? 'pending' : coPilotPendingTo ? 'locked' : 'idle'
        : marked.has(ticket.id) || isLanding(ticket, items) ? null : ticket.id === pendingTo ? 'pending' : isPaused(ticket) ? null : pendingTo ? 'locked' : 'idle';
    const rows = tickets.map((ticket, index) => ({
      id: ticket.id,
      name: ticket.title,
      href: `/thread/${encodeURIComponent(ticket.id)}`,
      state: ticketLabelOf(ticket, stateOf(ticket), items),
      canMove: { up: !locked && index > 0, down: !locked && index < tickets.length - 1 },
      switch: swapOf(ticket),
    }));
    return { colour, label, rows };
  });
  return { repo, groups };
}

export default ({ reads, query }) => ticketsView(reads, query);
