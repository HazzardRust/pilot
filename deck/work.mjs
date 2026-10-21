/**
 * The work the pilot has handled in a directory since its last hand-off (yellow-lane spec 16-19,
 * A5; S12's F1 seam): each signed gate1 a design and each signed gate2 a landing, counted after
 * the newest `handoff` item. Derived rather than stored, so it survives the hand-off it advises;
 * an abandoned session with no `handoff` item carries its count on. Computed here and served on
 * `GET /api/record` as `work`, beside `owed`, because the hooks are CommonJS and cannot import it.
 */

import { KIND_GATE1, KIND_GATE2, KIND_HANDOFF, SIGN_OFF, chosenOf, messagesOf, sameRepo } from './items.mjs';

/**
 * When a gate was signed: the time of its newest press, when that press is Sign off. Each
 * message is read by `chosenOf` alone, the way a reply's press is read at the route, because
 * a signed gate is closed and a closed thread chooses nothing.
 */
function signedAt(item) {
  const choiceOf = (message) => chosenOf({ kind: item.kind, options: item.options, replies: [message] });
  const press = messagesOf(item).findLast((message) => message?.from === 'user' && choiceOf(message) !== null);
  return press && choiceOf(press) === SIGN_OFF ? Date.parse(press.repliedAt) : NaN;
}

/** `repo`'s `{ landings, designs, since }`, `since` the newest hand-off's id or null, pure. */
export function workSince(items, repo) {
  const ours = (Array.isArray(items) ? items : []).filter((item) => sameRepo(item?.repo, repo));
  const handoff = ours.reduce((newest, item) => {
    const at = item.kind === KIND_HANDOFF ? Date.parse(item.postedAt) : NaN;
    return at > (newest ? Date.parse(newest.postedAt) : -Infinity) ? item : newest;
  }, null);
  const after = handoff ? Date.parse(handoff.postedAt) : -Infinity;
  const count = (kind) => ours.filter((item) => item.kind === kind && signedAt(item) > after).length;
  return { landings: count(KIND_GATE2), designs: count(KIND_GATE1), since: handoff?.id ?? null };
}
