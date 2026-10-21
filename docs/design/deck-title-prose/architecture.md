# deck-title-prose: a title inside deck prose is set off from the prose

Ticket itm_e24283466e43 · base `pilot` 178c7e5e · branch `design/deck-title-prose` · grilling depth: forks (itm_c8bfdf4835bd)

## 1. Problem

The user, 2026-10-08 (walkthrough itm_93f3b3cb8bd9): "it will literally just be 'waits on <title>' and that
title can look weird because it is the same font and might even read naturally, making it hard immediately
determine what is being said … in other parts of the deck it can be bad, such as in titles that reference
tickets." The gate2's "Waits on:" line sets its question titles off as underlined links, and the user accepted
that ("you did it fine, you underlined it"). Elsewhere the deck puts a thread's or ticket's title into a line in
the running font, so the title reads as part of the sentence around it.

## 2. Spec

Agreed with the user on itm_df6a7ca20d87, all four lines.

| # | Behaviour | Evidence |
| --- | --- | --- |
| 1 | Every title the deck itself places in a line is wrapped in the one **set-off element**: the gate2 "Waits on:" links, the card's ticket line, the thread header's ticket line, a gate's Ticket row, Continue's "Switch to ‹title›?" step, and the ticket inside a chain hand-off's "Next run: ‹ticket›" title wherever that title is drawn (the card heading, the thread heading, both notice rows) | one render test per site asserting `class="ref"` around the title (S1); screenshots of the overview and of a hand-off's thread page on the PR |
| 2 | In a refused press's reason on a thread page, and in a closed notice's resolution line, an item id naming an item on the deck is drawn as that item's **set-off title**, linked to its thread. An id the deck does not hold stays as it is, and the text agents are sent is unchanged | a render test of the `store.mjs:919` gate2 refusal showing both titles set off and no bare `itm_` id; a test that an unknown id is kept (S2) |
| 3 | The set-off style is **one rule** in `deck.css`, and every site in lines 1 and 2 reuses it through the class | `git grep -n '\.ref\b\|class="ref' deck/ui` finds one stylesheet rule and only the renderer sites; no inline `style=` |
| 4 | A long set-off title still reads: a 120-character title wraps inside the element, each line keeps the style, and nothing truncates it. The page's `<title>` tag stays plain text | a render test with a 120-character title (whole text present, no ellipsis); the rule carries no `nowrap` or `text-overflow`; the screenshot in line 1 |

## 3. Findings

- `deck/ui/render.mjs` (2267 lines at 178c7e5e) is the only place a title is turned into HTML. The client script (`deck/ui/js/*`) swaps whole regions the server has already rendered (ADR 0016, 0030), so a change to the server render reaches the live page with no client change.
- Sites where the deck places a title in a line:
  - Already links: `renderAsked` 269-282 ("Waits on:"); `ticketLink` 232, used by `renderTicketOf` 236-239 (the card's kind line), `renderTicketStanding` 242-249 (the thread header) and `GATE_ROWS.ticket` 265.
  - Bare text in a sentence: `renderSwitchForm` 1452, "Switch to ${title}?".
  - A title that contains a ticket title: `deck/chain.mjs:93` posts `` title: `Next run: ${head.title}` ``, `next: head.id`. It is drawn as one escaped string by the card h2 at 837, `renderNotice` 1618, `renderClosedNotice` 1661 and the thread heading through the `TITLE` slot (2219).
  - `deck/ui/thread.html:6` and `:31` share `<!--TITLE-->` between `<title>` and the `<h2>`, so markup in that slot would land inside `<title>`. S1 gives the heading its own slot.
- Refusals carry ids, not titles: `renderRefusal` 2264 draws `?refused=` (`server.mjs:530`, `landRefusedPress`), e.g. `gate2 ${id} waits on N open question(s) on ticket ${ticket}: ${ids}` (`store.mjs:919`), "item X is merged into Y" (958), "item X is closed: <resolution>" (719). The one refusal with a title, `store.mjs:1096`, answers `deck_ticket take`, a call only agents make. `renderClosedNotice` 1662 draws a resolution's first line, which agents write with ids (e.g. "merged none: itm_…").
- Links: `deck.css:387` is `a { color: inherit; }`, and the browser's underline is kept everywhere except `.threads`, `.runs-strip`, `h1 a` and `.back`. So "Waits on:" is underlined because it is a link, not because of a class. The card's `h2` (452, weight 600) is a whole link, and underline cannot set anything off inside it.
- Id shape: `deck/ticket-shape.mjs:12`, `THREAD_ID = /\bitm_[0-9a-f]{12}\b/`.
- Tests that already pin these sites: `deck/test/gate-render.test.mjs` (Waits on), `card.test.mjs` and `accents.test.mjs` (ticket line), `switch-request.test.mjs` and `co-pilot-switch.test.mjs` (Switch to), `notices.test.mjs` and `notifications.test.mjs`, `press-refused.test.mjs`.
- QA environment: `pilot deck --scratch` does not exist yet (audit F4, itm_f323d36f1473). A daemon gets a scratch store and port from `PILOT_DECK_DIR`, `PILOT_DECK_PORT` and `PILOT_DECK_NO_OPEN`.

## 4. Ubiquitous language

- **Set-off element**: an element carrying `class="ref"`, the only way a title is marked out from the line around it. It is an `<a>` where the title is the way into its thread, and a `<span>` inside a link or a form.
- **Set-off title**: an item's title, escaped, inside a set-off element.
- **Placed title**: a title the deck itself puts into a line it composes (spec 1). Text an agent writes is not a placed title.
- **Chain hand-off**: a `handoff` carrying `next`, posted by `deck/chain.mjs` with the title "Next run: ‹ticket title›".

## 5. Locked decisions

| # | Decision | Rationale · rejected |
| --- | --- | --- |
| L1 | Grilling depth is *forks* | Decided by the user (itm_c8bfdf4835bd) |
| L2 | One class, `ref`, goes on whichever element the site already draws (an `<a>` stays a link, the rest are `<span>`), styled by one rule in `deck.css` | Spec 3, and a later site gets the style by adding the class. Rejected: a wrapper span inside every existing link, which is two elements for one idea; and a separate class per site |
| L3 | A chain hand-off's title is split at render time, from `item.next` and the ticket's current title: "Next run: " then the set-off title, drawn only when the stored title is exactly `Next run: ${ticket.title}`; otherwise the title is drawn plain | It needs no store migration and no change to `chain.mjs`, and an old hand-off whose ticket was renamed falls back to plain text rather than drawing a wrong title. Rejected: a structured title-parts field on the item, a schema change for one composer |
| L4 | The heading gets its own template slot (`HEADING`), and `TITLE` stays escaped plain text for `<title>` | Markup in `<title>` shows as literal text in the tab. Rejected: stripping tags from one shared slot |
| L5 | Ids are turned into titles by the renderer only (S2). The store's `DeckRefusal` and resolution text keep their ids | Agents act on ids, and `press-refused.test.mjs` and `red-grilling.test.mjs` pin the exact strings. Rejected: writing titles into the refusal strings, which would reach agents and break exact-string pins |
| L6 | The 300-character refusal cap (`capRefusal`) applies to the reason before ids are swapped | The cap guards the URL, not the drawing (deck-press-feedback L3) |
| L7 | Two slices, in series, since both edit `render.mjs` | S2 reuses S1's class and helper |
| L8 | **The style is a tinted chip**: a faint `currentColor` background, small horizontal padding, rounded corners, and `box-decoration-break: clone` so every wrapped line keeps the chip; a link keeps its underline | Decided by the user (itm_6d8354c896c2). It shows everywhere, including inside the card heading, which is already an underlined link. Rejected: underline only like "Waits on:", which cannot be seen inside a heading link; and a heavier weight, which is lost in the 600-weight `h2` |

## 6. Assumed decisions awaiting the user

A2 and A3 were taken as assumed by the pilot, not asked; they stand unless the user raises them at Gate 1.

| # | Default taken | Tradeoff |
| --- | --- | --- |
| A2 | **Ids become set-off titles in refusals and in closed notices' resolution lines** (spec 2) *(taken as assumed by the pilot, not asked)* | The user's "a refusal reason" has no title in it today, only `itm_` ids, which are worse to read. Cost: S2, about 60 lines. The alternative is dropping spec 2, so refusals keep their bare ids |
| A3 | **Titles quoted inside text agents write are out of scope** (e.g. "Merge into ‹title›?", bodies, messages) *(taken as assumed by the pilot, not asked)* | The deck cannot tell a quoted title from the prose around it. Catching them needs a convention agents follow (write the id, and let S2's rule draw it), which belongs in a follow-up ticket on the crew's wording |

## 7. Out of scope

- Text agents write: item titles other than the chain hand-off's, bodies, messages and full resolutions (A3).
- `deck_ticket take`'s refusal (`store.mjs:1096`): only agents receive it.
- Restyling links in general, or any title that stands alone (the card heading, Tickets rows, the chat's thread list).
- Overlap in `deck/ui/render.mjs`, so the integrator rebases whichever lands second:
  - feat/user-threads-open (#451): touches store and tools, and render only near the chat list (1680-1690);
  - feat/co-pilot-successor (#445): status and the pilot bin, plus the Tickets-panel render;
  - the queued itm_f1eb46885542 (Tickets panel marks the yellow ticket): `renderTicketRow` 1406-1421, beside S1's edit at 1452;
  - audit F7 (itm_f323d36f1473) splits `render.mjs`; this feature should land before it.

## 8. Slices

| Slice | Delivers | Files owned | After | Detail |
| --- | --- | --- | --- | --- |
| **S1 Placed titles are set off** (walking skeleton) | 1, 3, 4 | `deck/ui/render.mjs` (helpers and the spec 1 sites), `deck/ui/deck.css` (`.ref`), `deck/ui/thread.html` (`HEADING` slot), `deck/test/title-ref.test.mjs` (new), the Waits on pin in `deck/test/gate-render.test.mjs` | – | [slices/S1.md](slices/S1.md) |
| **S2 Ids in a refusal or a notice read as titles** | 2, 3 | `deck/ui/render.mjs` (`withTitles`, `renderRefusal`, `renderClosedNotice`), `deck/test/title-ref-ids.test.mjs` (new) | S1 | [slices/S2.md](slices/S2.md) |

Width 1, longest stem 2.

## 9. Acceptance evidence, in the order the user meets it

On a scratch deck (`PILOT_DECK_DIR` a temp dir, `PILOT_DECK_PORT` a free port, `PILOT_DECK_NO_OPEN=1`), seeded
with a live ticket with a 120-character title, a question and a gate2 on it, a chain hand-off for a second ticket,
and an agent-closed question whose resolution names an id, all viewed in a real browser:

1. The overview: the hand-off card's heading reads "Next run:" and then the ticket title as a chip. Each card's
   ticket line is a chip, and so are the gate2 card's "Waits on:" titles. The 120-character title wraps, with
   every line chipped. (spec 1, 3, 4)
2. The Notifications panel: the hand-off's row carries the chip, and the closed notice's resolution line shows
   the named item's title as a chip where the id was. (spec 1, 2)
3. A Tickets row's Continue: "Switch to ‹title›?" shows the title as a chip. (spec 1)
4. The gate2's thread page: the header's ticket line and Waits on are chips, and the browser tab reads as plain
   text. Pressing Sign off while its question is open lands on the refusal, which shows the gate's ticket and
   question titles as chips, not `itm_` ids. (spec 1, 2, 4)

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Delivers |
| --- | --- | --- | --- | --- | --- | --- |
| S1 Placed titles are set off | planned | | | | – | 1, 3, 4 |
| S2 Ids in a refusal or a notice read as titles | planned | | | | S1 | 2, 3 |
| deck-title-prose | planned | | | | S2 | 1-4 |
