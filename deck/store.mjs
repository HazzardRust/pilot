/**
 * The deck's store: one plain JSON file, read and written only inside the daemon.
 *
 * Locked decisions this file carries. L5 — the store lives under `~/.claude/pilot/`
 * and never inside the repository being worked on, so installing the package never
 * asks a friend to edit a `.gitignore`. A6 — the file is unencrypted, because a key
 * the deck could read is a key a local attacker could read too; what the deck does
 * instead is refuse to write anything that looks like a credential, so a pilot that
 * pastes a diff containing a token fails loudly rather than leaving it on disk.
 *
 * Write-then-rename comes from `hooks/lib/atomic-write.js`, which is now the package's
 * one copy: slice 1 carried a second, and this file dropped it the moment the daemon
 * became the sole writer. Rename is atomic on POSIX and on NTFS, so a process killed
 * mid-write cannot leave a half-written deck behind; a rename that fails (on Windows,
 * antivirus or a concurrent reader holding the target open) throws rather than dropping
 * the write silently.
 *
 * L3 — the daemon is the only writer. This file is the facade every importer uses; the
 * writes live in `store-core.mjs` and its siblings (`store-items`, `store-tickets`,
 * `store-runs`), which run inside the daemon. A Claude session reaches the deck through
 * `deck/client.mjs` over HTTP and never loads the store, so the read-modify-write race
 * between two sessions posting at the same moment cannot arise.
 */

export { KINDS } from './tools.mjs';
export {
  DeckRefusal, MAX_TEXT_BYTES, MAX_WAIT_REPLIES, addDeck, defaultStoreDir, findCredential, listAdded,
  listDeckNumbers, removeDeck, storeDir, storeFile, storedTabFor,
} from './store-core.mjs';
export {
  LANDING_INTERRUPTED, addPilotMessage, addReply, beginLanding, clearAllNotices, clearNotice, closeItem, dismissItem,
  interruptLandings, noteLaneFilled, postItem, refusePoster, reopenItem, resolveItem, settleLanding,
} from './store-items.mjs';
export { archiveOld, archivedItem } from './store-archive.mjs';
export {
  cancelSwitch, mergeTicket, moveTicket, needTicket, parkTicket, parkedTicketOf, pivotTicket, recordVerdicts, refuseLaneSwitch, requestSwitch,
  takeTicket, yieldTicket,
} from './store-tickets.mjs';
export {
  budgetFor, createThread, currentSeq, deckLanes, dismissRun, fallBack, fallbackDue, coPilotFor, listItems,
  listLiveRuns, listRuns, listStoredRuns, markDelivered, namedWorktrees, ownerFilter, recordFor,
  noteLanding, recordForTicket, recordsFor, registerRun, releaseCoPilot, repliesSince, resumableRecordFor, setBudget, setCoPilot,
  setSlices, yellowHeadOf,
} from './store-runs.mjs';
