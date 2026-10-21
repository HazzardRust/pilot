# A thread's back arrow returns to the deck that owns it

Ticket `itm_ede5c093eaf4` · slug `back-arrow` · base `origin/pilot` 023185b9 · merge: none (itm_34e612234cdc)

## 1. Problem

> pressing the back-arrow that is supposed to navigate me out of a thread and back to the previous page takes me to overview instead. i want it to take me back to the deck that owns the thread.

## 2. Spec

| # | Behaviour | Evidence |
| --- | --- | --- |
| 1 | A thread's ← links to the tab of the deck that owns it: `/?run=<repo>`, or `/?run=<repo>&all=1` when the thread was opened with `?all=1` (from Everything). | A render test: a thread of repo R, with R's run on the page, renders `<a class="back" href="/?run=R"`; with `all` it renders `href="/?run=R&amp;all=1"`. In Chrome, ← from a thread opened off deck R's tab lands on R's tab, not the overview. |
| 2 | A thread that no deck owns (no repo, or a repo with no tab) links to the overview, `/?run=` (with `&all=1` under all). *Assumed* (A2). | A render test: a thread with no repo renders `href="/?run="`. |
| 3 | ← and Esc are one way off a thread with two triggers. When the referrer is a deck page (the overview or a tab, not a thread) and the tab has history, both go back (`history.back()`), so a thread reached from the overview returns to the overview and one reached from deck S returns to S. Otherwise both follow the arrow's href (lines 1, 2). A modified or middle click on ← is left to the browser. The All toggle on a thread replaces the history entry instead of pushing one, so ← never lands on the same thread (decision itm_498a61106fc8). | An `escape.mjs` test: a plain click on the arrow with a deck referrer and history calls `history.back()` and assigns nothing; without a referrer it assigns the arrow's `/?run=R`; Esc does the same in both cases. In Chrome, ← from a thread opened off the overview lands on the overview, off deck R's tab on R's tab, and in a fresh tab on R's tab. |

Line 2 makes a small change to today's no-owner case. `/` goes through `landingFor` (`deck/tabs.mjs`), which lands on the only live tab when exactly one exists, and that tab may belong to another repository. `/?run=` is always the overview.

## 3. Findings

- `deck/ui/thread.html:24`: the arrow is a literal `<a class="back" href="/" title="Back to deck" aria-label="Back to deck">←</a>`. A `/` with no `run` resolves through `landingFor`, which gives null (the overview) whenever zero, or two or more, tabs are live. **That is the bug.**
- `deck/ui/render-pages.mjs:385` `renderThreadPage` already resolves `tab = tabFor(theTabs, item.repo)` (:390) and uses it for the panels (`USAGE`, `STRIPS`) and for the D‹n› code between the nav arrows (`renderThreadNav`, :355, `hrefFor(tab, all)`). The owning deck is already decided on this page; only the arrow ignores it.
- `deck/ui/render-cards.mjs:87` `hrefFor(tab, all)`: `/?run=<encoded repo>`, or `OVERVIEW_HREF` (`/?run=`, :67) when there is no tab, plus `&all=1` (:78). `renderDeckPage` uses it for its own `back` (render-pages.mjs:257).
- `deck/ui/render-parts.mjs:67` `renderTemplate` replaces `<!--SLOT-->` markers anywhere, including inside attributes (thread.html already has `<h1><a href="<!--HOME-->">`).
- `deck/tabs.mjs:98-115` `tabsOf` gives every *open* thread's repo a tab, even with no recorded run. That leaves two kinds of thread with no owner: a settled thread whose repo has no live run, open ticket or added entry, and a thread with no repo.
- `deck/ui/js/escape.mjs:42-44`: Esc calls `history.back()` when the referrer is this deck and `history.length > 1` (since (decision itm_498a61106fc8): and a deck page, not a thread), and otherwise `location.assign(arrow.href)`. Line 3 moves this function behind the arrow's click as well (L3).
- `deck/server-routes.mjs:201` passes `query.get('all') === '1'` to `renderThreadPage`.
- Pins:
  - `deck/test/live.test.mjs:1308` pins `href="/"`; it moves.
  - `deck/test/tabs.test.mjs:980` stubs the arrow's href as `http://127.0.0.1:4399/`.
  - `deck/test/thread-nav.test.mjs:224` pins the header order with `[^>]*` and is unaffected.
  - `card.test.mjs:319` and `alert-switch.test.mjs:64` are about POST `back` fields (the Location header), not this link.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `renderThreadPage` | `renderThreadPage(item, items, runs, agents, numbers, all, added, refused, lanes): string` | nothing new: the arrow's href becomes one more output of the tab it already resolves, through `hrefFor` | in-process |
| `escape.mjs install` | `install(env: { document, location, history }): void` | the way off a thread (`leave`, private): Esc's keydown and the arrow's plain click both call it; it is back when there is a deck referrer and history, otherwise the arrow's href | in-process |

Deepening pass:
- `hrefFor` passes the deletion test: its four callers would otherwise each rebuild the address, so it stays.
- `escape.mjs` takes the arrow's click behind the same `install`, so the decision of where to leave to lives in one function (L3). Its interface is unchanged and it gets a second trigger.
- No other fold. A new helper for one slot would be a shallow module.

## 4. Ubiquitous language

- **Owning deck**: `tabFor(tabsOf(listRuns(), items, …), item.repo)`, the one tab whose panels and D‹n› code the thread page already shows; not the raw `item.repo`.
- **Arrow**: `a.back`, in the thread header.
- **Overview**: `/?run=` (`OVERVIEW_HREF`); not `/`, which is the landing.
- **Everything**: the `all=1` toggle, carried in the thread's address as in the tab's.

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
| --- | --- | --- | --- |
| L1 | The arrow's href becomes a `<!--BACK-->` slot, filled with `escapeHtml(hrefFor(tab, all))` in `renderThreadPage`. | The page already holds `tab` and `all`. `hrefFor` already spells the address for the nav's code and the deck page's `back`, so the arrow and the code cannot disagree. | Building it client-side from `data-item`, which would resolve the owner a second time. Reusing `HOME`, which is the title link and stays the overview. |
| L2 | The owner is the resolved tab, not `item.repo`. | `/?run=<repo>` for a repo with no tab renders the overview anyway (`renderDeckPage`: `tabFor` gives null), so the link would promise a deck the page cannot show. | `/?run=${item.repo}` always. |
| L3 | `escape.mjs` owns the one way off a thread: a private `leave()` that Esc's keydown and a plain left click on `a.back` both call (with `preventDefault` on the click). A modified or middle click is left to the browser, as in `navigate.mjs:34-35`. It goes back only from a deck page (not a thread) with history (decision itm_498a61106fc8); `navigate.mjs` replaces rather than pushes on the All toggle of a thread. | The user wants ← and Esc to behave the same (A1, overridden). One function keeps them from drifting. The href stays real, so a new tab and no-script still reach the owning deck. | Making Esc always follow the href (the reverse unification), which loses Back's scroll and bookmarks and is not what the user asked for. |
| L4 | `title` and `aria-label` stay "Back to deck". | They now say exactly what the arrow does. | Naming the deck in the label, which was not asked for. |
| L5 | One slice. | About 15 production lines (a slot, one render line, a click listener and `leave` in escape.mjs) carrying one risk. The click test shares S1's red step with the render pins. | A separate escape slice, which would deliver nothing a user could see without the owner's href. |
| L6 | QA runs against a scratch deck daemon on a spare port (4399) in Chrome, with runs from two repos. | The bug only reproduces with two or more live tabs; with one, `/` already lands on it. Locked by the user on itm_9a115ab4821c. | The live deck at :4321, whose inbox QA's seeded threads would land in. |
| L7 | Grilling depth: forks. Only materially different forks reach the user; Gate 1 is one item, no walk. | The user's answer on itm_814e78c8104c, the recommended default. | A full walk of every decision. |
| A1 | ← and Esc behave the same: back to the deck page the thread was reached from, else the owning deck's href. **overridden**: the default (← to the owner, Esc keeps Back) avoided the cost of the two ways off a thread disagreeing; the user wants one behaviour (itm_0dedc5e1787e: "i want them to have the same functionality. if the thread was reached from the overview, it takes back to the overview"). | The user's words. | ← always to the owner while Esc goes back (the default it overrode). |

## 6. Assumed decisions (awaiting the user)

| # | Question | Default taken | Tradeoff |
| --- | --- | --- | --- |
| A2 | Should a thread with no owning deck go to the overview `/?run=` rather than `/`, the landing, which can be another repo's only live tab? | `/?run=`, the overview. | `/` keeps a single-run user on their one tab; `/?run=` never lands on an unrelated deck. |

## 7. Out of scope

- Back navigation from anything but this deck's own pages: a referrer from another origin follows the href.
- The `HOME` title link.
- POST `back` fields.
- Any change to `tabFor`, `tabsOf` or `landingFor`.

## 8. Slices

Width 1; longest stem 1

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | A thread's arrow and Esc leave the same way, to where it came from or its owning deck (walking skeleton) | 1, 2, 3 | `deck/ui/thread.html`, `deck/ui/render-pages.mjs`, `deck/ui/js/escape.mjs`, `deck/test/live.test.mjs`, `deck/test/tabs.test.mjs` | – | `pilot:typescript-reviewer` | [S1](slices/S1.md) |

## 9. Acceptance evidence

On a scratch deck with runs from two repos (L6), in Chrome:

1. Open the overview, open a thread of R, and press ←. It lands back on the overview (spec 3).
2. Open deck R's tab, open one of its threads, and press ←. It lands on R's tab (spec 1, 3). Repeat with Esc; it lands on the same page.
3. From R's tab, middle-click a card into a new tab and press ← there. It lands on `/?run=R`, R's tab (spec 1, 3). Repeat with Esc.
4. In a fresh tab, open a thread of R with `?all=1` by address and press ←. It lands on `/?run=R&all=1` (spec 1).
5. In a fresh tab, open a thread no deck owns and press ←. It lands on the overview, `/?run=` (spec 2).
6. Middle-click ← on a thread. The browser opens the href in a new tab and the page stays (spec 3).
7. `npm test` passes, including the moved pin in `live.test.mjs`.

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 1, 2, 3 |
| back-arrow | planned | | | | S1 | 1, 2, 3 |
