---
status: accepted
date: 2026-09-30
tags: [deck]
supersedes: []
superseded_by: []
paths: [deck/tabs.mjs, deck/store.mjs]
---
# An added deck is a stored directory

The user wanted to put a directory on the strip by typing its path into a `+` tab (deck-polish spec 5), and to have it stay there across a restart until they close it. No existing state could hold it: a tab is built from runs and open items (`deck/tabs.mjs`), a run record is pruned once its session has gone and nothing is queued, and the chat is never queued. So we decided that an added deck is a stored list, `deck.added` (`{ repo, addedAt }[]` in `deck.json`, absent on an older store and read as empty), which `tabsOf` reads beside runs and items. `addDeck` in `deck/store.mjs` numbers the directory and gives it its chat in the same write, exactly as `registerRun` does, so a later run there lands on the same tab; `removeDeck`, the tab's Close, drops the entry.

The path is checked on the server, never only in the page, because the page is not a trust boundary: `POST /add-deck` is guarded by `fromOwnPage`, and `addDeck` refuses a path that is empty, not absolute, carries a credential (`refuseCredentials`), is a network (UNC) path, which it never stats, does not exist, or is not a directory by `fs.stat`. What it stores is `fs.realpath`'s spelling, so a junction or a second spelling of a directory already on the strip goes to that tab and writes nothing. Any existing directory may be added, a git repository or not. The deck stores the path and does nothing else with it: it never reads, lists or runs anything inside the directory, and shells out to nothing to check it.

Rejected:
- A run record with no live pid. It fails `newRun`'s pid rule, and `registerRun` prunes a dead record whose repository has nothing queued, so the tab would vanish at the next registration anywhere on the machine.
- A placeholder item. It would sit in the queue as something waiting on the user, which it is not.
- Validating the path in the page. A form's checks are advice to a browser; anything that can reach the route can skip them.

**Consequences**:
- An added deck with no run reads as ended on the strip, which is also what draws its Close.
- The D-number stays in the map after Close and is never reused (ADR 0023): adding the same directory again picks it back up.
