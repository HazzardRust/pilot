---
status: accepted
date: 2026-10-07
tags: [deck, deck-ui]
supersedes: []
superseded_by: []
paths: [docs/design/deck-press-feedback/architecture.md, deck/store.mjs, deck/items.mjs, deck/server.mjs]
---
# An agent-closed thread leaves a notice the user clears

When the pilot closed a question while the user was away, nothing told them: the thread left the Notifications panel the moment it closed, and the panel's "seen" marks lived in one browser's `localStorage`, which neither survives a different browser nor says anything about a close. So we decided that an agent's close leaves a **notice**, the item field `notice: true`, stored by the deck and cleared only by the user.

- **Set in the close's own write.** `resolveItem` in `deck/store.mjs` sets it when the kind is not in `SILENT_KINDS` (`deck/items.mjs`: handoff, crew-handoff, report, confirmed by the user as A3) and the user's last choice was not Sign off (A4: the user did the closing). `resolveItem` is only the agents' `deck_resolve`; the user's own Close and Dismiss go through `closeItem` and `dismissItem` and leave none.
- **Cleared only by the user.** GET `/thread/<id>` deletes it, because opening the thread is the user being there, and the page's own refresh is that same GET, so a thread closed while open clears at once. The panel's × posts `/clear-notice`, own-page Origin only, as a form so a page running no script still clears it. A resolve, a new session or a daemon restart never clears one.
- **Drawn by the server.** The Notifications panel lists notices above the open-thread rows, newest close first, each with its kind, its title as a link, and the resolution's first line, all escaped.
- **Closing reports stay separate (L7).** A report is a standing item whose × hides it per browser (`deck.hiddenReports`), a different lifecycle; folding it in would change behaviour the user has not asked to change.

Rejected:
- A separate notices list in `deck.json`: a second record to keep in step with the items.
- Clearing by a script POST on page load: a page running no script would never clear.
- Keeping notices in `localStorage`: neither restart-proof across browsers nor server-rendered.
- Making closing reports the first case of notices.

**Consequences**:
- Old data carries no field, so it gets no notices and needs no migration.
- After a Sign off the user gets no confirmation that the gate passed (A4).
- A GET of a thread from anywhere that can reach the loopback port clears its notice; the deck answers only its own loopback host.

Recorded in `docs/design/deck-press-feedback/architecture.md` (§2 spec 7, 8, 10, 11; L6, L7; A3, A4), which numbers it 0076; the sequence had reached 0096 by the time it landed.
