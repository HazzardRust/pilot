# Deck — a strip of run tabs, and one run on screen at a time

## 1. Problem

The deck serves every pilot run on the machine on one page. This morning the user
opened `127.0.0.1:4321` and found an old session's questions sitting beside the
current run's status table with nothing to tell them apart, and the current run
called "Hazzard" because that session had been started in the home directory.
Their words: "sounds like we need to add a section of tabs dedicated to what deck
is currently on screen." So the page shows one run at a time, a strip of tabs
chooses which, an overview tab holds every open thread across all runs and is what
the deck opens on, and the pilot can tell the deck what its run is called.

## 2. Spec

Lines 1–4 are the user's own, answered during grilling. Lines 5 and 6 are the
pilot's, marked *assumed*. Line 7 is this artefact's, *assumed*: deck-tree's
slice 4 established that a new `deck_status` field is not delivered until the
pilot's own wording tells it to send one.

| # | Behaviour | Evidence |
| --- | --- | --- |
| 1 | The home page shows one run at a time: that run's queue of open items, its status table and its tree, and nothing of any other run | with two runs live, the page for A carries none of B's items or rows — absent from the HTML, not merely hidden by CSS |
| 2 | A strip of tabs selects the run: one tab per run carrying the count of that run's open items, plus an **Overview** tab holding every open thread across all runs, each card naming the run it came from and linking to that run's tab | clicking B's tab shows B's page; the overview lists A's and B's items each labelled; a tab shows "2" when two of its items are open, and that number always equals the number of cards the tab renders |
| 3 | On arrival with no `run` in the URL, the page is the sole live run when exactly one is live, and the overview otherwise (none, or two or more) | with one run live, opening `http://127.0.0.1:4321` fresh lands on that run's page with Overview one click away; with two live, or none, it lands on the overview |
| 4 | A run's tab is named by the pilot: `deck_status` takes an optional `feature`, the tab shows it, and the directory name stays the fallback. A later call that omits `feature` keeps the name; an empty one is refused; it is bounded and credential-scanned like every other cell | a `deck_status` with `feature: "deck-tree"` renames the tab from "Hazzard"; the next table without it keeps "deck-tree"; a run that never sends one keeps the directory name |
| 5 *(assumed)* | The selected tab survives the deck's self-reload on every change | with B selected, a `deck_status` from A leaves B on screen |
| 6 *(assumed)* | A run whose session has ended keeps its tab, its name and its last table while it has open items, marked as ended, and drops off once none are open | kill a session with an open question: its tab stays, named as it was, marked; resolve the question: the tab goes |
| 7 *(assumed)* | `skills/pilot/SKILL.md`, the `deck_status` row of `agents/pilot.md`'s tool table and the architect's status-table section say to name the run, so a 0.2.x pilot names its own tab without being told | `scripts/test/pilot-agents.test.mjs` pins the wording |

## 3. Findings

| Fact | Where |
| --- | --- |
| An item carries `repo` and **never a run id** — the `Yours` join is repo + slice, keyed that way deliberately so it survives the session closing and is shared by two sessions on one feature | `deck/status.mjs:105`, `:85-95` |
| `queueOf` is every open item, whichever run and whichever slice; the home page renders it as one list | `deck/status.mjs:368`, `deck/ui/render.mjs:328` |
| `yoursIndex(items)` / `yoursFor(run, row, index)` join on repo + slice, so an index built from one run's items is still correct for that run | `deck/status.mjs:343`, `:358` |
| A run record is `repo` + `pid` + a minted `run_<hex>` id; the id is new on every registration | `deck/runs.mjs:78-95` |
| `runName(repo)` is `path.basename` — the source of "Hazzard"; `sameRepo` normalises separators and, on Windows, case | `deck/runs.mjs:51`, `:67` |
| `liveRuns` drops any run whose pid is dead, so `listRuns()` cannot see an ended run at all | `deck/runs.mjs:109`, `deck/store.mjs:397` |
| `registerRun` prunes every dead run whenever **any** session registers, and bounds the list at `MAX_RUNS` = 32 | `deck/store.mjs:407-430`, `deck/runs.mjs:29` |
| `setSlices(runId, slices)` hangs the table on the run record and credential-scans every cell | `deck/store.mjs:444-476` |
| `deck/client.mjs` injects `run: runId` into `deck_status` and spreads the rest of the args, so a new field needs no client change | `deck/client.mjs:148` |
| The run is registered with `process.cwd()` at MCP startup, so `/cd` in a session does not move it — which is why the name has to be sayable | `deck/client.mjs:134` |
| `renderHomePage(items, runs)` stacks `renderRunTree` and `renderRunStatus` per run into the `TREE` and `TABLE` slots and puts the whole queue in `QUEUE` | `deck/ui/render.mjs:328`, `:240`, `:309` |
| The home page is the only page with a script: an `EventSource('/events')` that calls `location.reload()` on every change, carrying the open bookmarks through `sessionStorage` | `deck/ui/home.html:36-65` |
| `/` is one line in the router; nothing reads a query string anywhere in the server today | `deck/server.mjs:480` |
| `/reply` already redirects back to the thread, not to the home page — replying does not lose a tab | `deck/server.mjs:499-511` |
| `.tab` and `.strip` are deck-tree's edge bookmarks; the page is a 46rem column centred with blank space either side | `deck/ui/deck.css:149-205`, `:19-24` |
| Every byte of HTML goes through `escapeHtml`; only `http`/`https` ever becomes an `href`; the deck answers only to loopback | `deck/ui/render.mjs:11-22`, `deck/server.mjs:442` |
| **No database anywhere in this project.** The store is one JSON file at `~/.claude/pilot/deck.json`, `PILOT_DECK_DIR` moves it, `PILOT_DECK_PORT` moves the port. There is no migration in this feature and the QA agent's "which database" question is moot | `deck/store.mjs:105-114` |
| `npm test` is `node --test`; the deck's render tests assert on the HTML string, so spec 1 is unit-testable | `deck/test/status.test.mjs:256-345` |

## 4. Ubiquitous language

| Term | Means exactly |
| --- | --- |
| **Run** | Everything the deck holds for one repository: its live sessions, their status tables, and every item posted from it. This is what a tab is, and what the user means by "a run". |
| **Run record** | One registered session — `repo` + `pid` + id — in `deck.json`. A run has one usually, two when the user opens a second session on the same repository, and none once its sessions have gone. |
| **Tab** | One run's entry in the strip, and the page that entry selects. Never the **bookmark**, which is deck-tree's `<details>` at each edge. |
| **Overview** | The page with no run selected: every open item from every run, each labelled with its run. Never a status table and never a tree. |
| **Count** | The number on a tab: the run's open items, which is exactly the number of cards that tab renders. Not unread — the store has no read state. |
| **Ended** | A run with no live session left. It keeps its tab while it has open items. |
| **Feature name** | The name `deck_status` gives a run. The directory name is the fallback, never a second name. |

## 5. Locked decisions

| # | Decision | Rationale, and what was rejected |
| --- | --- | --- |
| **D1** | Selection lives in the URL: `GET /?run=<repo path>`, server-rendered, no script | `location.reload()` keeps the query, so spec 5 is free. Rejected `:target` and the radio hack: both leave every other run's HTML in the page, so spec 1's evidence is false to Ctrl-F and can only be asserted against CSS, and a no-target default needs a `:has()` trick this codebase's plainness does not need. |
| **D2** | A `run` that matches nothing renders the overview, and its value is never echoed into the page | A run can vanish between two self-reloads, and a 404 on the home page during a reload is hostile. Rejected a redirect (a second round-trip for the same answer) and a 404. It also removes reflected XSS from the only new user-controlled input. |
| **D3** | A tab is a **repository**, matched with `sameRepo`; two sessions on one repository are one tab | Items carry `repo` and no run id, so a repository is the only key under which an ended run's items can still be found (spec 6), and run ids are minted per registration. Rejected keying on the run record: two identically-named tabs showing the same queue twice is this morning's confusion one level down. |
| **D4** | An ended run's record is kept while its repository still has an open item; `registerRun` prunes only records that are neither live nor wanted | Without it, any other session registering anywhere wipes the record, and the ended tab silently reverts to "Hazzard" — the exact thing spec 4 exists to fix. Rejected deriving the ended tab from items alone: it loses the feature name and the table. The items-only tab stays as the floor for a record `MAX_RUNS` has evicted. |
| **D5** | Tab grouping, ordering, naming and counting live in a new pure module `deck/tabs.mjs` (`tabsOf(runs, items)`, `tabFor(tabs, repo)`), beside `items.mjs` and `status.mjs` | Same seam the codebase already uses: reads no file, opens no socket, emits no HTML, so the server and the renderer both depend on it and not on each other. Rejected putting the join in `render.mjs`, which is declared to decide only what a page looks like, and in `server.mjs`, which is declared to decide only which page answers. |
| **D6** | The overview carries no status table and no tree; the edge bookmarks are absent there | Otherwise the stacked tables the user complained about survive on the very page the deck opens on. The strip itself, with names and counts, is the overview of runs. |
| **D7** | Inside a tab, the panels draw each of that tab's runs that has posted a table; a run with no table contributes nothing to the panels | The strip is now where a run says it exists, which is what `renderRunStatus`'s "a run that has posted no table is still a run" was for. |
| **D8** | The count is open items, including kinds the deck does not render specially | It must equal the list underneath it or it is a bug generator. `appearsInYours`'s narrower rule stays where it is — the `Yours` column — because that is a next action, and a count is a queue length. |
| **D9** | The feature name is validated in `deck/runs.mjs` (`MAX_FEATURE_CHARS` = 40, refused empty, trimmed), which is the module that owns what a run is called | Rejected `status.mjs`: that module is the slice table, and a run's name is not a row. |
| **D10** | The strip is `<nav class="runs-strip">` of plain links, the selected one carrying `aria-current="page"` | With no script they are links, not ARIA tabs, and saying so is the honest markup. `.tab` and `.strip` belong to deck-tree's bookmarks and are not reused. |
| **D11** | With no `run` in the URL, the page is the sole live run when exactly one is live, and the overview otherwise; `?run=` always wins when it resolves | The user's answer to A1. One rule in `tabs.mjs` (`landingFor(tabs)`), decided in slice 1. Rejected: always the overview, which put the common case's table one click away on every visit. |

## 6. Assumed decisions — awaiting the user

| # | Taken | The question, and the tradeoff |
| --- | --- | --- |
| ~~A1~~ | **Answered by the user 2026-09-17, now D11:** with no `run` in the URL, land on the sole live run when exactly one is live, on the overview otherwise | The single-run user (the common case) keeps their table and tree on screen on arrival; the overview is still one click away and still holds every open thread. Cost: the landing page changes shape the day a second run starts. |
| **A2** | A `deck_status` that omits `feature` keeps the name the run already had | The pilot names the run once and posts tables many times; clearing on every table would flicker the tab back to "Hazzard". The cost is that there is no way to unset a name short of restarting the session, which is a small inconsistency with `deck_status` replacing the table wholesale. |
| **A3** | An ended run's open items keep their reply box, and the thread page says nothing about the session having ended | A reply typed there is read by the next session opened in that repository — which re-adopts the tab, since a tab is a repository (D3). The cost is that the user can type into a thread nobody is currently listening to. Marking it would mean touching the thread page, which this feature otherwise leaves alone. |

### Spec change requested by the user, 2026-09-17 (after slices 1, 2, 5 integrated and slice 3 in PR #28)

The user's words: "instead of getting the main session to label each of the decks as
it goes, they should just be numbered D1, D2, D3 and so on, whilst slices can be S1,
S2 and so on. this solves a second problem where the slices are just numbers." And,
seeing a counter on the deck: "i notice that the current deck is deck 15 and i like
that to be honest."

Recorded as the replacement for spec 4 and D9/A2, answered (itm_4ea366691f92): **the tab reads the D-number plus the directory
name, quiet — "D2 · pilot"**. The deck mints a run's number once at registration (D1, D2, …,
stable for the run's life, never the change counter) and shows it on the tab; each
table's rows are numbered S1, S2, … in the pilot's order, display-only — `after` and
`slice` still refer to rows by name. The pilot names nothing. Consequences for the
successor pilot: close PR #28 unmerged (the `feature` field), replace slice 3 with
"the deck numbers runs and rows", rewrite slice 5's wording (already integrated at
8abaab2) to say the deck numbers things rather than telling the pilot to send
`feature`, and amend ADR 0015 and the pilot skill accordingly.

## 7. Out of scope

- Editing or resolving an item from the overview (the user's earlier decision).
- Any change to deck-tree's edge bookmarks, their contents or their `sessionStorage` carry.
- Any JavaScript for the tabs: D1 and deck-tree's D5/D10 hold.
- The history page `/items` and `renderDeckPage`: no tabs, no scoping.
- The thread page: no back-to-this-tab link, no ended marker (A3).
- `/api/runs`, `deck_read`'s `repo` filter, and `deck/client.mjs` — the new field needs no client change.
- Renaming a run from the page, or any name the user types.
- Migrations: there is no database. The only existing data is one JSON file, and every field this feature adds is optional, so a `deck.json` written before it renders unchanged.

## 8. Slices

```
1 strip, and one run on screen ──> 2 the overview ──> 3 the run is named ──> 4 an ended run
5 the pilot is told (parallel, disjoint files)
```

1 → 2 → 3 → 4 is a chain because they share `deck/tabs.mjs`, `deck/ui/render.mjs`
and `deck/ui/deck.css`; after slice 1 the ready set is 2, 3 and 4, ordered by
risk — 2 finishes the complaint, 3 fixes the name, 4 is the edge case. Slice 5
owns only documentation and the test that pins it, so it may run beside any of
them, but it must not reach `main` ahead of slice 3.

Two runs are needed on the preview from slice 1 onwards. Register a second one
with `POST /api/runs {"repo": "<a second path>", "pid": <a live pid>}` and give it
a table with `POST /api/tool {"name":"deck_status","arguments":{"run":"<id>","slices":[…]}}`
— the HTTP API takes `run` directly, which the stdio client would otherwise inject.
The same goes for items: an item seeded over `POST /api/tool` with `deck_post` must
carry `repo` explicitly, or it joins no tab and appears only on the overview and
`/items` (slice 1 found this in a fixture; the stdio client injects `repo` itself).

### Slice 1 — A strip of tabs, and one run on screen

| Field | |
| --- | --- |
| **Source spec** | Spec 1, 3, 5, and the strip half of 2; D1, D2, D3, D5, D7, D10, D11 |
| **Dependencies** | none (walking skeleton) |
| **Files owned** | `deck/tabs.mjs` (new), `deck/ui/render.mjs`, `deck/ui/home.html`, `deck/ui/deck.css`, `deck/server.mjs`, `deck/test/tabs.test.mjs` (new) |
| **Expected behaviour** | `tabs.mjs` gains `tabsOf(runs, items)` — one tab per repository, `{ repo, name, runs, open }`, grouped with `sameRepo`, named with `runName`, in registration order — and `tabFor(tabs, repo)`. The header grows a `<!--TABS-->` strip: an Overview link and one link per run, the selected one marked `aria-current="page"`. `/` reads `?run=`; `renderHomePage(items, runs, selected)` resolves it with `tabFor` and, when it resolves, fills `QUEUE`, `TABLE` and `TREE` from that tab alone — its open items, its runs' tables, its runs' trees — with `yoursIndex` built from the tab's own items. A `run` that resolves to nothing renders the overview, which in this slice is the page exactly as it is today. With no `run` at all, `landingFor(tabs)` picks the sole live tab when exactly one tab has a live run, and the overview otherwise (D11). |
| **Verification** | `npm install` first — a fresh worktree has no `node_modules` and `deck/client.mjs` needs `@modelcontextprotocol/sdk`, without which four tests error rather than fail. Then `npm test` (542 passing at `afa5aec`, run and confirmed, no known failures); `PILOT_DECK_DIR=$TMP/deck-tabs PILOT_DECK_PORT=4331 node bin/pilot.mjs deck` with the live `deck.json` copied in and a second run registered as above |
| **Evidence** | A test asserting run B's item id and slice name are **absent from the string** `renderHomePage` returns for A, failing before the change and passing after; the browser at `127.0.0.1:4331` showing the strip, clicking B and getting B's queue, table and tree and none of A's, and the live deck on 4321 untouched. **And the reload probe**: with B selected, land a `deck_status` for A and report in one line whether B was still on screen (spec 5). |
| **Prohibited** | No script added — the existing `EventSource` block is not this slice's to grow, and the probe only reports. No reuse of `.tab` or `.strip`. No change to `renderCard`, `renderSliceRow`, `renderState`, `renderYours`, `yoursFor`, `yoursIndex` or `queueOf`. No echoing the `run` value into the page, in any branch. No touching `deck/client.mjs`, `deck/store.mjs` or `deck/daemon.mjs`. |
| **Completion** | `npm test` green, one run's page seen in the browser carrying nothing of the other, and the reload probe reported. |

### Slice 2 — The overview becomes an overview

| Field | |
| --- | --- |
| **Source spec** | Spec 2 (counts, labelled cards), spec 1 (the overview stops stacking); D6, D8 |
| **Dependencies** | Slice 1 |
| **Files owned** | `deck/tabs.mjs`, `deck/ui/render.mjs`, `deck/ui/home.html` (added during the slice: the edge bookmarks move from the template into a `<!--BOOKMARKS-->` slot the renderer fills only when a tab is selected), `deck/ui/deck.css`, `deck/test/tabs.test.mjs`, `deck/test/status.test.mjs` |
| **Expected behaviour** | Every tab link carries its count — `tab.open.length`, and for Overview the whole open queue. The overview renders the open queue in one list, oldest first as today, each card naming its run and linking to that run's tab, and renders **no** status table and **no** tree: the `TREE` and `TABLE` slots are empty and the edge bookmarks are not drawn at all when no run is selected. The home-page tests that assert a table on `/` move to asserting it on `/?run=…`. |
| **Verification** | `npm test`; the preview on 4331 with two runs, each holding open items |
| **Evidence** | A test that the overview's HTML contains no `<table class="slices">` and no `class="tree"`, red before and green after; the browser showing the strip with "2" beside a run that has two open items, the overview listing both runs' threads each labelled, and a label clicking through to that run's tab |
| **Prohibited** | No count that is computed differently from the list beneath it (D8). No grouping the overview by run — flat, labelled, one queue. No reply buttons or resolve controls on the overview (out of scope). No new item field: the label comes from the tab, not from the item. |
| **Completion** | `npm test` green, counts matching the cards in the browser for two runs, and the overview carrying no table. |

### Slice 3 — The pilot names the run

| Field | |
| --- | --- |
| **Source spec** | Spec 4; D9, A2 |
| **Dependencies** | Slice 1 |
| **Files owned** | `deck/runs.mjs`, `deck/store.mjs`, `deck/tools.mjs`, `deck/tabs.mjs`, `deck/ui/render.mjs` (added after slice 1's review: the panel headings must take the tab's name, or the strip reads "deck-tree" while the headings beneath it still read "Hazzard"), `deck/test/tabs.test.mjs`, `deck/test/status.test.mjs` |
| **Expected behaviour** | `deck_status` takes an optional `feature`, advertised in its schema and description. `runs.mjs` gains `MAX_FEATURE_CHARS` = 40 and the validation that trims it, refuses an empty one in the deck's voice the way an empty `after` is refused, and refuses one over the bound; the store scans it for credentials with the rest of the call and writes it to `run.feature`; a call that omits it leaves `run.feature` as it was (A2). `tabsOf` names a tab from the newest registered run record that carries a `feature`, falling back to `runName(repo)`; `renderRunStatus` and `renderRunTree` head their panels with the tab's name, not `run.name`, so the strip and the panels never disagree. |
| **Verification** | `npm test`; the preview on 4331, renaming the seeded run through `POST /api/tool` |
| **Evidence** | The refusal tests red before the validation lands; the browser showing a tab renamed from "Hazzard" to "deck-tree" by one `deck_status`, and still reading "deck-tree" after a second `deck_status` that sends only slices |
| **Prohibited** | No touching `deck/client.mjs` — it spreads `...args` already. No name on `registerRun` or on `deck_post`. No second name on the run record, and no rename of `run.name`. No truncating a long name with an ellipsis in place of a refusal. No loosening `additionalProperties: false`. |
| **Completion** | `npm test` green, both refusals asserted, and the rename plus its persistence seen in the browser. |

### Slice 4 — An ended run keeps its tab while it has open items

| Field | |
| --- | --- |
| **Source spec** | Spec 6; D3, D4 |
| **Dependencies** | Slice 3 |
| **Files owned** | `deck/store.mjs`, `deck/tabs.mjs`, `deck/ui/render.mjs`, `deck/ui/deck.css`, `deck/test/tabs.test.mjs`, `deck/test/daemon.test.mjs` |
| **Expected behaviour** | The store gains `listStoredRuns()` — every stored run with `live: isRunning(pid)` — which the home page reads instead of `listRuns()`; `listRuns()` keeps its contract for `/api/runs` and `/items`. `registerRun` keeps a dead record whose repository still has an open item, still bounded by `MAX_RUNS`. `tabsOf` marks a tab ended when none of its runs is live, drops an ended tab with no open items, and still builds a tab for a repository that has open items and no record at all. An ended tab reads as its name and a quiet "ended", and its page says so above the queue; its last table and tree stay. |
| **Verification** | `npm test`; the preview on 4331: a second run registered against a throwaway node process, an item posted for it, then the process killed |
| **Evidence** | A store test that a dead run with an open item survives another registration and one without it does not, red before and green after; the browser showing the killed run's tab still there, named and marked ended, with its table intact — then resolving its last item and the tab going on the next reload |
| **Prohibited** | No heartbeat, no timer, no expiry state — liveness stays `isRunning` asked at the moment the question is put. No changing what `listRuns()` returns. No dropping an ended run's items (L14). No mutation testing on `deck/store.mjs`, `deck/client.mjs`, `deck/daemon.mjs` or `deck/server.mjs`, and any mutation run points `USERPROFILE`/`HOME` at a scratch directory. |
| **Completion** | `npm test` green, and the kill-then-resolve sequence watched end to end in the browser. |

### Slice 5 — The pilot is told to name its run

| Field | |
| --- | --- |
| **Source spec** | Spec 7 |
| **Dependencies** | none; disjoint files, may run beside 1–4, but must not reach `main` ahead of slice 3 |
| **Files owned** | `skills/pilot/SKILL.md`, `agents/pilot.md`, `agents/pilot-architect.md`, `docs/adr/0015-the-deck-shows-one-run-at-a-time.md` (new), `scripts/test/pilot-agents.test.mjs` |
| **Expected behaviour** | The `deck_status` row of `agents/pilot.md`'s tool table names `feature` beside `slice`, `state`, `after` and `delivers`, and says to send the feature's name so the user's tab is not the directory. `skills/pilot/SKILL.md` says the same where it says the table is replaced wholesale. The architect's status-table section matches. ADR 0015 records D1, D3, D4, D6 and D11 in the form of 0012–0014. |
| **Verification** | `npm test`; `node --test scripts/test/pilot-agents.test.mjs` |
| **Evidence** | The new assertions in `pilot-agents.test.mjs` failing against the current wording and passing after |
| **Prohibited** | No rewriting judgement text that is the user's. No new crew agent, no new tool, no change to any `Agent(...)` list. No ADR that re-argues a decision this artefact locks — it records them. |
| **Completion** | `npm test` green with the new wording pinned, and ADR 0015 committed in the form of 0012–0014. |

## 9. Acceptance evidence

On a preview of the integration branch beside the live deck, never on top of it:
`PILOT_DECK_DIR` at a scratch directory seeded with a copy of the live
`deck.json`, `PILOT_DECK_PORT` at 4331, and a second run registered and given a
table through the HTTP API. The live deck on 4321 and its store are untouched.

1. `127.0.0.1:4331` with two runs registered opens on the overview: a strip under
   the heading with **Overview** selected and one tab per run, each carrying a
   number, and beneath it every open thread from every run, each card naming its
   run (2, 3). With the second run not yet registered, the same URL opened on the
   sole run's page (3).
2. Clicking a run's tab shows that run's queue, its status table in the right
   bookmark and its tree in the left, and nothing of the other run anywhere on the
   page — including in the page source (1).
3. With that run selected, a `deck_status` posted for the *other* run reloads the
   page and leaves the selection where it was (5).
4. A `deck_status` carrying `feature: "deck-run-tabs"` renames the tab from its
   directory name; a second one carrying only slices leaves the name alone (4).
5. `feature: ""` and a 41-character name are each refused with a message that says
   what is wrong (4).
6. The second session is killed. Its tab stays, named as the pilot named it and
   marked ended, its table still readable; its last open item is resolved and the
   tab is gone on the next reload (6).
7. A run's number always equals the number of cards its tab renders (2).
8. `agents/pilot.md` and `skills/pilot/SKILL.md` read back `feature`, and
   `npm test` is green (7).

## 10. Status table

| Slice | State | Branch | PR | Worktree |
| --- | --- | --- | --- | --- |
| 1 Strip, and one run on screen | integrated at 7ea83f3 (PR #25; principles review kept: Overview href `/?run=` so it is reachable under D11, `hasTable` pinned for `[]`, `landingFor`'s inert filter documented, `yoursIndex(waiting)`, unused defaults dropped — fix round 42bbb30; F3 moved into slice 3; N3 dropped; implementer's reviewer: blank `?run=` resolved to the daemon's cwd, guarded in `tabFor`; assumed: an item with no `repo` joins no tab, D7 inside a tab only, the strip inside `<header>`; browser gate handed to the user) | `slice/rt1-strip` | #25 | — |
| 2 The overview becomes an overview | integrated at 55effa6 (PR #27; principles review: one finding kept — the overview's bookmarks slot pinned exactly empty, 64fcb56; assumed: a tab with no open items shows `0`, the run label heads the card's meta line, the count sits inside the link; both reviewers clean; browser gate handed to the user) | `slice/rt2-overview` | #27 | — |
| 3 The pilot names the run | **draft PR #28 at 760b664 (572 tests), on the integrated tip; principles review NOT yet spawned — the successor pilot's first step.** Implementer's reviewers: non-string `feature` refused (fixed), raw-vs-trimmed bound noted as repo-wide and left; security clean. Assumed: `MAX_FEATURE_CHARS` declared in `deck/tools.mjs` and re-exported from `deck/runs.mjs` (the stdio client's module graph must not reach `runs.mjs`, `daemon.test.mjs` pins it) — this row's "declared in runs.mjs" is therefore wrong; tabs named in a second pass; `feature` validated after the table. Outside ownership: `deck/server.mjs:418` one argument, approved. Preview on 4337 may still be up | `slice/rt3-feature-name` | #28 | `pilot-slice-rt3` |
| 4 An ended run keeps its tab | planned | — | — | — |
| 5 The pilot is told | integrated at 8abaab2 (PR #26; principles review: two nits kept — SKILL.md now carries the A2 clause and the test pins it, b64d683) | `slice/rt5-pilot-told` | #26 | — |
| **deck-run-tabs (the feature)** | slices 1, 2 and 5 integrated at 55effa6 (564 tests); 3 in flight; 4 not started (depends on 3; owns `deck/store.mjs`, `deck/tabs.mjs`, `deck/ui/render.mjs`, `deck/ui/deck.css`, tests); then the feature-level review (Opus) and QA. Draft PR #24 against `feat/deck-tree`, to be retargeted to `main` once #17 merges. **Handover note 2026-09-17:** the pilot session that ran this reached its context limit here. Successor's order of work: (1) Sonnet fundamentalist on PR #28, verdicts, fix round, merge into `feat/deck-run-tabs`; (2) slice 4 from that tip (Opus); (3) feature-level review (Opus) beside QA; (4) retarget #24 to `main` after #17 merges, absorbing deck-tree's Gate 2 fix (panels on every page: `renderStrips` in `render.mjs` vs this feature's `renderBookmarks`). Reviewers get their own worktree and never mutate `store/client/daemon/server.mjs` | `feat/deck-run-tabs` | #24 | `pilot-feat-deck-run-tabs` |
