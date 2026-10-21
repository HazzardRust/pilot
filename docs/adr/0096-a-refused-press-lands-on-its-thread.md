---
status: accepted
date: 2026-10-07
tags: [deck, deck-ui]
supersedes: []
superseded_by: []
paths: [docs/design/deck-press-feedback/architecture.md, deck/server.mjs]
---
# A refused press lands on its thread

On 2026-10-04 the user pressed Sign off on a Gate 2 whose ticket had two open questions. The deck refused it, rightly, and the browser showed a page holding only the refusal text: "we obviously need better feedback than to just send the user to a blank page". So we decided that a press the deck refuses on a thread (an option, Sign off, a typed reply, Close, Reopen, Dismiss) answers a browser navigation with a 303 to `/thread/<id>?refused=<reason>#reply`, and the thread page draws the reason above the reply box.

- **Only a navigation lands.** `landRefusedPress` in `deck/server.mjs` redirects when the request carries `Sec-Fetch-Mode: navigate`, and serves `/reply`, `/close`, `/reopen` and `/dismiss-item`. An agent, curl, the page's own fetch, and an old browser without the header get today's 400 text, so no refusal rule or reason changes and every existing 400 pin holds. `reply.mjs` needs no change: its resend is the navigation.
- **The Location is the stored item's own thread.** It is built from the id of the item the deck holds, never from `back` or another form field, so there is no redirect to vet. A card press that is refused lands on the thread, not on the overview, because the overview has no reply box. An id the deck does not hold keeps the 400.
- **A crafted `?refused=` is bounded.** The value is a caller-supplied GET parameter, so a link could draw text on a real thread as if the deck had refused something. The thread page draws it only for a navigation whose `Sec-Fetch-Site` is `same-origin` (the 303 from our own POST is; a link from elsewhere or a typed URL is not), and outside every live region: the page's own refresh fetches `location.href`, same-origin, so a crafted link's query would otherwise come back on the first refresh. It escapes it, caps it at 300 code points, and always prefixes "The deck refused that press:". The deck is loopback-only and single-user.

Rejected:
- Re-rendering the thread page as the 400 body: the address reads `/reply`, and a reload re-posts.
- A flash message in daemon memory: shared state with a clearing rule of its own.
- A header set by `reply.mjs`: a client change for no gain.
- Honouring `back`: the reason would land on an overview with no reply box.
- A reason code looked up server-side: about 60 refusal messages carry dynamic ids, so a code table would duplicate the store's wording and drift.

**Consequences**:
- A refused typed reply does not carry its words back into the box (A1); the words would ride in the URL and the history. The user retypes.
- What is left of the spoofing path is a same-origin link the deck itself would have to draw.

Recorded in `docs/design/deck-press-feedback/architecture.md` (§2 spec 1, 2, 3, 6; L1, L2, L3; A1, A2).
