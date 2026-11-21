/**
 * The store reads a view is computed from (rune-deck-ui, Deck reads seam): the ones the home route
 * hands `renderHomePage` positionally, folded into one object, plus the `seq` they were read at, so
 * `viewOf` stays pure and every region of one view is drawn from one read (spec 6a).
 */
import { readAlertSwitch } from '../alert-switch.mjs';
import { heldWaits, listAgents } from '../agents.mjs';
import { currentSeq, deckLanes, listAdded, listDeckNumbers, listItems, listStoredRuns } from '../store.mjs';

export function readDeck() {
  return {
    seq: currentSeq(),
    items: listItems(),
    runs: listStoredRuns(),
    numbers: listDeckNumbers(),
    agents: listAgents(),
    added: listAdded(),
    alerts: readAlertSwitch(),
    lanes: deckLanes(),
    held: heldWaits(),
  };
}
