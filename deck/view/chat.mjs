/**
 * The Chat panel as data (rune-deck-ui S11, spec 2, 3, 4): the selected deck's chat thread and its
 * messages, oldest first, as `renderChat` (`deck/ui/render-rail.mjs`) draws them, each byline the word
 * the page prints (L2). `id` is what the send posts `/reply` to, the one route every thread's reply
 * takes; no deck, or a deck with no chat, has no id and so no send box. `threads` are the deck's Create
 * (`user`) threads, listed above the messages whether or not a chat is open.
 */
import { KIND_CHAT, KIND_USER, authorKind, messagesOf, sameRepo } from '../items.mjs';
import { landingFor, tabFor, tabsOf } from '../tabs.mjs';

/** The page's byline word for a message: `you`, `deck`, or the author's crew kind. */
const byOf = (message) =>
  message.from === 'user'
    ? 'you'
    : message.from === 'deck' || message.author === 'deck'
      ? 'deck'
      : message.author === undefined ? 'pilot' : authorKind(message.author);

/** `query` is `{ run }`, the address's deck; null lands where the page lands. */
export function chatView(reads, { run = null } = {}) {
  const tabs = tabsOf(reads.runs, reads.items, reads.numbers, reads.agents, reads.added, reads.lanes);
  const tab = run === null ? landingFor(tabs) : tabFor(tabs, run);
  const chat = tab && reads.items.find((item) => item.kind === KIND_CHAT && sameRepo(item.repo, tab.repo));
  // The threads Create opened for this deck, open and closed alike, each as the page's link to it.
  const threads = tab
    ? reads.items
        .filter((item) => item.kind === KIND_USER && sameRepo(item.repo, tab.repo))
        .map((item) => ({ id: item.id, title: String(item.title ?? ''), href: `/thread/${encodeURIComponent(item.id)}` }))
    : [];
  if (!chat) return { messages: [], threads };
  return {
    id: chat.id,
    messages: messagesOf(chat).map((message) => ({ by: byOf(message), at: message.repliedAt ?? null, text: String(message.text ?? '') })),
    threads,
  };
}

export default ({ reads, query }) => chatView(reads, query);
