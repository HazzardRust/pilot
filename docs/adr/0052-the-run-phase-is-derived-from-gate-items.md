---
# Amended by ADR 0057: the phase reads the `gate1` and `gate2` kinds, a report no longer clears it, a new ticket's start resets it, and red is *concluding*, not *closing*.
status: amended
date: 2026-10-01
tags: [gates, runs]
supersedes: []
superseded_by: [0057, 0105]
paths: [deck/items.mjs]
---
# The run phase is derived from gate items

The user wanted each deck to say where its run is: planning until Gate 1 passes, implementing with them away until Gate 2, closing after (thread-types-phase spec 4-6). The deck had no gate concept and the run record holds no phase (F5). Whatever holds the phase also has to be readable by the Stop hook, which is CommonJS and keeps one spelling of each rule (L35). So we decided the phase is computed from the items the deck already stores, and the one fact the hook needs is stamped on the item at post.

- **Derived, never stored (L6).** `runPhaseOf(items, repo)` in `deck/items.mjs` is a pure function, like `threadState`. It reads the directory's items (`sameRepo`) after its newest `report`: `closing` if a `gate: "2"` item there is resolved, `implementing` if a `gate: "1"` item is, else `planning`. After a report with no question, spec, signoff or walkthrough behind it, it is null: the tab shows no phase. A gate passes when its item is resolved, because a gate item is resolved only on a pass and Not yet keeps it open (A9). `tabsOf` sets `tab.phase` from it on every read, so a reload and a daemon restart read the same answer back.
- **Away is stamped on the item at post (L7).** The hook then reads one field and needs no CommonJS copy of the phase rule.
- **It takes the tab's `ended` slot (L11).** `renderStripLink` draws `ended` once the deck's sessions have gone, else the phase's word in its colour, else nothing.

Rejected:
- A stored phase written on each event: it can drift from the items it describes, and a lost write leaves it wrong for good.
- `deck_status` setting the phase (A1): the pilot would have one more thing to keep true by hand.
- The Stop hook computing the phase itself: a second spelling of the rule on the CommonJS side.
- A second span beside `ended`: two states on one tab.

**Consequences**:
- The pilot moves the phase only by tagging gate posts with `gate` and posting the run's `report`; an untagged sign-off moves nothing.
- An abandoned run keeps its colour until the next report in its directory (A8).
- Full auto moves the phase at post, since it resolves a gate item when it is posted.
