/**
 * The pilot's replies on a gate2 whose landing stopped on a conflict (gate2-frees-lane spec 5, L5, L7), and the check
 * that the worktree land kept is still the one it stored. Beside `deck/store-items.mjs`, which calls both inside its
 * one write; the landing itself is started by `deck_reply` in `deck/server-tools.mjs` once the store has taken it.
 */

import fs from 'node:fs';
import path from 'node:path';
import { KIND_GATE2, KIND_TICKET, SIGN_OFF, chosenOf, isOpen, messagesOf } from './items.mjs';
import { repoOf, sameRepo } from './runs.mjs';
import { DeckRefusal } from './store-core.mjs';

/** The kinds whose `Resolving` and `Land again` count: the pilot's, and the lander's it spawns for them (lander L2, L9). */
export const LANDING_KINDS = Object.freeze(['pilot', 'lander']);
/** The pilot or the lander taking a conflict, which stops its clock (A1). */
const RESOLVING = /^Resolving\b/;
/** The pilot's or the lander's word that a resolution is committed and the feature lands again. */
export const LAND_AGAIN = /^Land again\b/;

/**
 * `dir` when it is an absolute, linked worktree of the gate2's repository, never the checkout itself, because it is
 * handed to an agent as its worktree and land runs again on its word; otherwise undefined.
 */
export function keptWorktree(dir, gate2) {
  // Absolute, already normal, and never a share: everything below reads the disk at it.
  if (typeof dir !== 'string' || !path.isAbsolute(dir) || path.resolve(dir) !== dir || /^[\\/]{2}/.test(dir)) return undefined;
  const repo = repoOf(gate2.repo) ?? gate2.repo;
  if (!sameRepo(repoOf(dir), repo) || sameRepo(dir, repo)) return undefined;
  try {
    // A real directory, no link, that the repository names back as its worktree, as `git worktree add` wrote it.
    if (!fs.lstatSync(dir).isDirectory()) return undefined;
    const gitdir = path.resolve(dir, /^gitdir:\s*(.+?)\s*$/m.exec(fs.readFileSync(path.join(dir, '.git'), 'utf8'))[1]);
    return sameRepo(fs.readFileSync(path.join(gitdir, 'gitdir'), 'utf8').trim(), path.join(dir, '.git')) ? dir : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A `Resolving` or `Land again` on a gate2, applied to `item.landing` in the caller's write; true when it is one, so
 * the pilot or the lander writes it whoever owns the gate2 (L7). Only theirs (`LANDING_KINDS`): another author's is refused while a conflict stands, and the user's are
 * plain replies that never reach here. `Land again` needs a refused landing: with a conflict, one whose kept worktree still holds (the pilot's or the
 * lander's); without one, the lander's alone, which lands fresh. It leaves it `running` with the conflict cleared, so a second one is refused.
 */
export function landingReply(item, text, kind, at) {
  const again = LAND_AGAIN.test(text);
  if (item.kind !== KIND_GATE2 || !(again || RESOLVING.test(text))) return false;
  const { landing } = item;
  const mayLand = LANDING_KINDS.includes(kind);
  // The lander's Resolving claims any signed gate2, conflict or none (lander L9): `landerDue` reads it off the thread.
  const claim = !again && kind === 'lander' && chosenOf(item) === SIGN_OFF;
  // Without a conflict another author's words are plain; the pilot's or lander's Land again is still refused below.
  if (!landing?.conflict && !(again && mayLand) && !claim) return false;
  const word = again ? 'Land again' : 'Resolving';
  if (!mayLand) throw new DeckRefusal(`${word} on ${item.id} is the pilot's or the lander's word, not ${kind}'s`);
  if (!again) {
    if (landing?.conflict) landing.conflict.resolving ??= at;
    return true;
  }
  // A refusal with no conflict (a red gate, an interrupted landing) is the lander's alone, and lands fresh (lander L7).
  const fresh = landing?.state === 'refused' && !landing.conflict && kind === 'lander';
  if (landing?.state !== 'refused' || (!landing.conflict && !fresh)) {
    throw new DeckRefusal(`${item.id} has no refused landing to land again from (it is ${landing?.state ?? 'not landing'}); nothing run`);
  }
  if (!fresh && keptWorktree(landing.conflict.dir, item) === undefined) {
    throw new DeckRefusal(`${item.id}'s kept worktree ${landing.conflict.dir} is no longer a worktree of ${item.repo}; nothing run`);
  }
  item.landing = { state: 'running', startedAt: at };
  return true;
}

/** An item id as the deck mints it: `firstPrompt` types it into the terminal, so nothing else gets that far. */
const ITEM_ID = /^itm_[0-9a-f]{12}$/;

/** The lander's `Resolving` on this gate2, as `landingReply` stored it (L9). */
const claimed = (item) => messagesOf(item).some((message) => message?.author === 'lander' && RESOLVING.test(String(message.text ?? '')));

/**
 * The signed gate2s in `repo` that wait on a lander, oldest first as the deck lists them (spec 5, L5, L9): signed, no
 * lander's `Resolving` on them, and open, or landed with their ticket open, since a clean landing resolves the gate2
 * but only the lander's report closes the ticket. Derived from items, never stored. One lander per repository, so while
 * one has claimed a due gate2 there, none is: the next waits on its hand-back, and a lander that dies after its claim
 * holds the queue until that gate2 stops being due. The claim trusts the reply's author kind, as `Land again` does. Pure.
 */
export function landerDue(items, repo) {
  const list = Array.isArray(items) ? items : [];
  const ticketOpen = (gate) => list.some((item) => item?.kind === KIND_TICKET && item.id === gate.ticket && isOpen(item));
  // A landing needs the press, and a resolved gate2 has no `chosenOf`, so landed stands for signed.
  const due = (item) => chosenOf(item) === SIGN_OFF || (item.landing?.state === 'landed' && ticketOpen(item));
  const signed = list.filter((item) => item?.kind === KIND_GATE2 && sameRepo(item.repo, repo) && due(item) && ITEM_ID.test(String(item.id)));
  return signed.some(claimed) ? [] : signed.map((item) => item.id);
}
