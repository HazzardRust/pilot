/**
 * The thread screen's `thread` and `nav` regions as data (rune-deck-ui S8, spec 2, 11): what
 * `renderThreadPage` draws, with every label resolved here (L2) and the body and messages left as
 * markdown with ids read as titles (L8), so the Rune deck draws them with `rune-kit`'s `Markdown`.
 * `threadView` is pure; `seeThread` is the one write, the notice clear `GET /thread/<id>` makes.
 */
import {
  KIND_STEPS, KIND_TICKET, KIND_USER, accentOf, isBlocking, isOpen, lastSaidAt, messagesOf, noteFor, ownerOf, repoKey,
  standingOf, threadState, ticketWornBy, waitingOn,
} from '../items.mjs';
import { clearNotice, listItems } from '../store.mjs';
import { tabFor, tabsOf } from '../tabs.mjs';
import { GATE_NAMES, STATE_BUCKETS } from '../ui/render-cards.mjs';
import { threadWalk } from '../ui/render-pages.mjs';
import { tabCode } from '../ui/render-strip.mjs';

/** Prose with each id of an item the deck holds read as that item's title, as `withTitles` does for the page. */
export const titled = (text, items) =>
  String(text ?? '').replace(/(\/thread\/)?\b(itm_[0-9a-f]{12})\b/g, (said, _path, id) => items.find((each) => each.id === id)?.title ?? said);

/** The ticket line of `renderTicketStanding`, as words: the ticket's title and where it stands; a card's too (A2). */
export function ticketLineOf(item, items, lanes) {
  const ticket = item.kind === KIND_TICKET ? undefined : ticketWornBy(item, items);
  if (!ticket) return undefined;
  const coPilot = typeof ticket.repo === 'string' ? lanes.coPilots[repoKey(ticket.repo)] ?? null : null;
  const standing = standingOf(ticket, items, coPilot);
  return `${ticket.title} ${standing === 'paused' ? `paused on ${waitingOn(ticket, items)}` : standing}`;
}

const kindOf = (item) =>
  (item.kind === KIND_USER ? 'user generated' : GATE_NAMES[item.kind] ?? item.kind) + (isBlocking(item) ? ' · blocking' : '');

const byOf = (message) =>
  message.from === 'user' ? 'you' : message.from === 'deck' || message.author === 'deck' ? 'deck' : message.author ?? 'pilot';

const step = (item) => (item ? { id: item.id, title: item.title } : undefined);

/** `query` is `{ id, all }`; null for an id the deck does not hold. */
export function threadView(reads, { id, all = false }) {
  const { items, lanes } = reads;
  const item = items.find((each) => each.id === id);
  if (!item) return null;
  const tab = tabFor(tabsOf(reads.runs, items, reads.numbers, reads.agents, reads.added, lanes), item.repo);
  const { prev, next, at, list } = threadWalk(item, items, all);
  const state = threadState(item);
  return {
    title: item.title,
    kindLine: {
      accent: accentOf(item, items),
      state,
      tone: STATE_BUCKETS[state] ?? 'waiting',
      kind: kindOf(item),
      at: lastSaidAt(item),
      standing: ticketLineOf(item, items, lanes),
      owner: ownerOf(item),
    },
    // `run` is the owning deck's address, as the page's way back (`hrefFor(tab)`) carries it: Escape goes there.
    nav: {
      prev: step(prev),
      code: tab ? tabCode(tab) : undefined,
      run: tab ? tab.repo : null,
      next: step(next),
      position: at === -1 ? undefined : `${at + 1}/${list.length}`,
    },
    typeNote: noteFor(item) ?? undefined,
    body: titled(item.body, items),
    messages: messagesOf(item).map((message) => ({ by: byOf(message), at: message.repliedAt, text: titled(message.text, items) })),
    resolution: isOpen(item) ? undefined : titled(item.resolution, items),
    // A steps thread's list, with Done while it is open (L5): drawn by the thread region, not the reply box.
    ...(item.kind === KIND_STEPS ? { steps: { texts: (item.steps ?? []).map((each) => String(each?.text ?? '')), open: isOpen(item) } } : {}),
    archived: false,
  };
}

/**
 * The user at a thread has seen its close (spec 8, L6), as `GET /thread/<id>` says: its notice goes and
 * `announce` runs once; a thread with no notice, or not on the deck, writes nothing.
 */
export function seeThread(id, announce) {
  if (listItems().find((each) => each.id === id)?.notice === undefined) return;
  clearNotice(id);
  announce();
}

export default ({ reads, query }) => (query.screen === 'thread' ? threadView(reads, query) : null);
