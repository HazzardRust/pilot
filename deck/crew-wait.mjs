/**
 * A crew-handoff nobody has closed reads `waiting <age>` (handoff-self-close spec 5, L4, L5): derived off the clock and
 * the thread, never stored. It imports nothing, so `items.mjs`'s `threadState` can read it without an import cycle.
 */

/** How long a crew-handoff stays owed a successor before the deck wakes the pilot (crew-handoff-trace spec 6, A3). */
export const CREW_WAIT_MS = 10 * 60_000;

/** `11m`, or `1h05m` from the hour. */
function ageOf(ms) {
  const minutes = Math.floor(ms / 60_000);
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}m`;
}

/**
 * `waiting <age>` for an open crew-handoff at least `CREW_WAIT_MS` past its posting, or null. A Handoff failed press
 * the pilot has not answered keeps its own state (`not picked up yet`), so it reads null (spec 6, A1).
 */
export function crewWaitingOf(item, now = Date.now()) {
  if (item?.kind !== 'crew-handoff' || item.resolvedAt) return null;
  const messages = Array.isArray(item.replies) ? item.replies : [];
  // Twin of `pressUnanswered` (crew-handoff.mjs), on raw fields: the last user message is a Handoff failed press, with or without a note.
  const press = messages.findLastIndex((message) => message?.from === 'user');
  const text = messages[press]?.text;
  const pressed = typeof text === 'string' && (text === 'Handoff failed' || text.startsWith('Handoff failed\n\n'));
  if (pressed && !messages.slice(press + 1).some((message) => message?.from === 'pilot')) return null;
  const age = now - (typeof item.postedAt === 'string' ? Date.parse(item.postedAt) : NaN);
  return age >= CREW_WAIT_MS ? `waiting ${ageOf(age)}` : null;
}
