---
status: accepted
date: 2026-10-04
tags: [gates]
supersedes: []
superseded_by: []
paths: [docs/design/merge-first/architecture.md]
---
# A gate passes only on the Sign off press

This completes ADR 0052 and thread-types-phase A9 ("a gate is resolved only on a pass, and Not yet keeps it open"), which never said what a pass is. On 2026-10-04 the pilot closed a `gate1` with `deck_resolve` after the user typed "i want to sign off on this gate". The deck moves a ticket and writes its plan only on the pressed Sign off, so the ticket stayed green with no plan and the gate had to be posted again. The user: "the old system was that you could just infer when i sign off, but now it relies on me pressing on the button ... lets find that rot and get rid of it otherwise future pilots will make the same mistake". A sweep found the cause was mostly not prose: the deck accepted the close with a plain "Closed", and the inbox and Stop hooks told the pilot to close any answered thread and held its turn until it did. So we decided the deck refuses it.

- **The deck refuses `deck_resolve` on a `gate1` or `gate2` whose Sign off was not pressed (L12).** The refusal names the press and the user's Dismiss.
- **On a gate the hooks ask for the press (L7).** The inbox notice and the Stop gate say to reply asking for the Sign off press and never to resolve it unsigned; that reply ends the turn. Text only: a reply now carries its item's kind, and the Stop gate already ends a turn on a `deck_reply`.
- **The prose names the button.** Every line that defined a gate by the user "saying" or being "satisfied" is reworded, in the pilot, QA, the shipped rules, the CLAUDE excerpt and the glossary.
- **A stale gate leaves by the user's Dismiss (L8).** No supersede mechanism: the deck refuses a second open gate per ticket, so Dismiss is the exit (A10).
- **A gate's Dismiss and its Sign off reply are taken only from the deck's own page.** A `POST /dismiss-item` or a Sign off `POST /reply` on a gate with no Origin, or another site's, is refused 403. This stops an agent pressing by accident or from another site; it is not a boundary against a local process that forges the Origin or writes the store file.
- **The `deck_post` answer for a gate names the press.** It says the gate passes only on the user's Sign off press and that `deck_resolve` closes it after that, never before.

Rejected:
- Wording only: the next pilot that misreads is told, not stopped, and the hook text outweighs the agent's prose.
- A new hold rule in the Stop gate for gates: the existing reply rule already covers it.
- Auto-superseding a gate on re-post: new mechanism for a case Dismiss handles.

**Consequences**:
- Two deck tests that pinned "an unsigned gate1 resolves, stays green and writes no plan" now pin the refusal.
- A typed bare "Sign off" is still the same text as the button's and passes; the deck cannot tell them apart.
- A walkthrough has no such refusal: QA's instructions say the pressed Sign off, never typed approval.

Recorded in `docs/design/merge-first/architecture.md` (§5 L7, L8, L12); deck threads itm_b58f8bb5c63a, itm_441c4946c405.
