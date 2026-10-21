# Deck — a run as a design tree, beside the table

## 1. Problem

The deck shows a run as a flat `Slice | State | Yours` table in the middle of the
page. The user wants the design itself on the deck: "a minimalistic design tree
where progress of the slices can be seen", with the spec as part of the UI — and,
having seen the first draft, wants the table kept: "the status table is a vital
piece of information that should always be accessible". Both fit, because the page
is a 46rem column centred in the window and the space either side of it is blank.
So the tree goes in a bookmark tab at the left edge, the table moves into one at
the right edge, each collapsible, the open one extending further than the rest,
and the queue keeps the main column. The tab strip is the pattern later features
reuse.

## 2. Spec

Lines 1, 3, 4, 7 are the request's draft, which the pilot agreed with the user.
Line 5 is rewritten and line 6 is new, from the user's answer of 2026-09-16.
Lines 2 and 8 are marked *assumed*: 2 because splitting what the tree shows from
what the table shows is a consequence of keeping both, and 8 because it comes
from the store rather than from the request.

| # | Behaviour | Evidence |
| --- | --- | --- |
| 1 | The tree draws each run as a nested list: the feature at the root, each slice a node under the slice its row names in `after` (a row without `after` directly under the root), and the spec lines it `delivers` as leaves under it | a table whose row B says `after: A` renders B inside A's list, with B's spec lines beneath B |
| 2 *(assumed)* | A tree node is its progress marker and its slice name, and nothing else: the state text and the `Yours` link stay in the table, which keeps every column it has today | the tree panel reads as a list of names down a narrow edge; the same run's state text and `Yours` link are in the table tab, unchanged |
| 3 | Each node carries a progress marker from the first word of its state: `planned` ○, `implementing`/`draft`/`in`/`fixing` ◐, `integrated`/`ready`/`merged` ●, any other first word no marker | the marker changes when the state does; "blocked on CI" renders without a marker rather than with a wrong one |
| 4 | A row takes two optional fields, `after` (one slice name) and `delivers` (a list of spec-line strings), both advertised in `deck_status`'s schema and description. `after` must name another row of the same call — matched the way the `Yours` join matches slice names — and must not close a cycle; `delivers` is bounded in count and in length. Anything else is refused with a message saying what is wrong, as a typed `yours` is today | `after: "nope"` is refused naming the row; A-after-B-after-A is refused naming both; a 13th `delivers` line is refused |
| 5 *(widened at Gate 2)* | Both views live on **every page the deck serves** at once — the home page, a thread, and `/items`: the tree in a tab at the left edge, the status table — the same `Slice \| State \| Yours`, rendered as it is today — in a tab at the right edge, and each page's own content alone in the main column | each of the three pages shows its own content between the same two edge tabs; the table's markup is unchanged from `main` |
| 6 *(last clause added at Gate 2)* | The tabs are bookmarks that peek out of the screen edge: each opens and closes with no JavaScript, the open one extends further than the closed ones, the table's is open on a first arrival and the tree's is closed, and opening or closing either leaves the main column where it was. **Which bookmarks are open then follows the user** — across the deck's own reload and from page to page — until they change it | clicking the tree's bookmark slides the tree out over the blank space and makes that bookmark the longer one; clicking it again closes it; the main column does not move; the tree left open is still open after a reload and after following a `Yours` link |
| 7 | `skills/pilot/SKILL.md`, the `deck_status` row of `agents/pilot.md`'s tool table, and the architect's status-table section say the two new fields and when to send them, so a 0.2.x pilot fills the tree without being told | `scripts/test/pilot-agents.test.mjs` pins the wording |
| 8 *(assumed)* | A deck written before this change — rows carrying neither field — still renders: every slice hangs from the root as one flat level, no error | the live deck's own `deck.json` served by the branch's deck shows every slice under the root |

## 3. Findings

| Fact | Where |
| --- | --- |
| A row is `slice` + free-text `state`, and `ROW_FIELDS` is the closed list that refuses anything else; a duplicate slice name is already refused by name | `deck/status.mjs:53`, `:136` |
| `sliceKey` trims and lower-cases, because the pilot types a slice name twice; the `Yours` join is repo + `sliceKey` | `deck/status.mjs:69`, `:93` |
| `status.mjs` reads no file, opens no socket and emits no HTML — that is why the store and the renderer can both depend on it | `deck/status.mjs:1-8` |
| `MAX_SLICES` 32, `MAX_STATE_CHARS` 400, `MAX_SLICE_CHARS` re-exported from `items.mjs` | `deck/status.mjs:47-50` |
| `deck_status` declares `additionalProperties: false` on the row, so a pilot sending `after` today is refused by the schema before the store sees it | `deck/tools.mjs:195-230` |
| `setSlices` calls `newSliceTable` and stores the flat list on `run.slices` | `deck/store.mjs:444-465` |
| `renderRunStatus` → `renderSliceRow` → `renderState` (linkifies `http(s)` only), `renderYours` (join, never typed); `renderHomePage` fills two slots, `RUNS` and `QUEUE` | `deck/ui/render.mjs:206-274` |
| Every byte of HTML goes through `escapeHtml`; only `http`/`https` ever become an `href` | `deck/ui/render.mjs:11-22`, `:65` |
| **The page is a 46rem column centred with `margin: 0 auto`** — the blank space the tabs move into is everything either side of it | `deck/ui/deck.css:19-24` |
| The whole stylesheet is 142 lines, inlined into every page through the `<!--CSS-->` slot; every rule is spacing or a hairline | `deck/ui/deck.css:1-10` |
| **`home.html` already carries a script**: an `EventSource('/events')` that calls `location.reload()` on every `changed` event. So "no JavaScript" is a lock on the tree and the tabs, not a fact about the deck — and a reload fires whenever any `deck_status`, `deck_post` or reply lands | `deck/ui/home.html:18-25` |
| `store.mjs` already tolerates a deck written before runs existed (`runsOf`); the store file is `~/.claude/pilot/deck.json` and is kept for ever (L14) | `deck/store.mjs:39`, `:106-111`, `:183-186` |
| `PILOT_DECK_DIR` and `PILOT_DECK_PORT` move the store and the port; single-instance is nothing but the port bind (`EADDRINUSE`) | `bin/pilot.mjs:27-28`, `deck/daemon.mjs:72-96` |
| The home-page render tests live beside the vocabulary tests and assert on `<td class="yours">` | `deck/test/status.test.mjs:256-345` |
| Agent wording is pinned by an executable test, which is where spec 7's evidence comes from | `scripts/test/pilot-agents.test.mjs:56`, `:300` |
| **No database anywhere in this project.** The store is one JSON file; there is no migration step in the whole feature, and the only existing data is that file | `deck/store.mjs:39` |

## 4. Ubiquitous language

| Term | Means exactly |
| --- | --- |
| **Row** | One entry of the `slices` list in a `deck_status` call: `slice`, `state`, and now `after` and `delivers`. What is stored. |
| **Node** | One slice as the tree draws it: marker and name, and its children. **Leaf**: one `delivers` string under a node, text only, joined to nothing. |
| **`after`** | The name of the one row this row hangs under. Not a list, not an ordering. |
| **Phase** | `planned` \| `doing` \| `done` \| none, derived from the state's first word. The vocabulary. **Marker**: the glyph a phase is drawn as, ○ ◐ ●. The presentation. |
| **Tab** | One collapsible bookmark at a screen edge: a **bookmark** (the box that peeks out, always visible) and a **panel** (what it opens). |
| **Strip** | The column of tabs on one edge. Left holds the tree, right holds the table, and later features add to either. |
| **Queue** | The open items in the main column. Untouched by this feature. |

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
| --- | --- | --- | --- |
| D1 | Rows stay flat on disk; the tree is computed at render time by `treeOf(slices)` in `deck/status.mjs` | every deck already written keeps rendering, and `deck_status` stays one flat replace-the-table call the pilot emits from its artefact's table | storing a nested structure on `run.slices` — it breaks old decks and makes the pilot nest by hand |
| D2 | `after` is validated in `newSliceTable`: unknown name refused, cycle refused | it is the only place that sees the whole call, and it already refuses a duplicate slice name there in the deck's voice | hanging a bad `after` from the root — the deck would silently draw a design that is not the design |
| D3 | `after` matches through `sliceKey` — trimmed, lower-cased | the pilot now types a slice name three times; "Slice 1" against "slice 1" is not a different slice, and the `Yours` join already settled this | exact string match, which would flatten a tree over a capital letter and say nothing |
| D4 | `status.mjs` returns a **phase**; `render.mjs` chooses the **marker** | the state words are the pilot skill's vocabulary and belong with the other vocabulary; the glyph is HTML, and `status.mjs` emits none by construction | the glyph in `status.mjs`; the word list in `render.mjs` |
| D5 | The tree is a nested `<ul>`/`<li>` and the tabs are CSS: no box-drawing characters, no build step, and no JavaScript for the disclosure itself. *Amended after slice 1's reload probe:* the tab snapped shut on the deck's self-reload, so fix (a) was taken — about fourteen lines carried the open bookmarks through `sessionStorage`. *Amended again at Gate 2:* the user asked for that state to travel with them between pages too, so those lines moved into `strips.html` and now write on every `toggle` rather than only before a reload — one copy, on every page, covering the reload and a plain navigation alike. Opening and closing a tab is still the platform's `<details>`, with nothing wired to it | the aesthetic the user locked, and A3 — every page here is server-rendered. The `EventSource` reload already in `home.html` is the deck's, not this feature's | ASCII art (`└─`), a second escaping problem that reflows badly; a client-side tree or tab widget; keeping the carry in `home.html`, which would have meant a second copy the day the strip reached a second page |
| D6 | `delivers` is bounded in `status.mjs`: at most 12 lines, each held to `MAX_STATE_CHARS` | the deck has a bound for text that must fit one line of the home screen; a second number for the same thing is a number to keep in step | a new `MAX_SPEC_CHARS`; an unbounded list, which turns the home screen into the artefact |
| D7 | No nesting-depth cap | cycles are refused and `MAX_SLICES` is 32, so depth is bounded by the row count; the indent is one CSS rule. Cost: a 32-deep chain indents 32 steps, and the vertical-slicing skill stops the architect at four slices | a depth cap, a second refusal for a case nobody has hit |
| D8 | No migration, anywhere | there is no database in this project; the one piece of existing data is `deck.json`, and spec 8 is the whole compatibility requirement | a store-version field and an upgrade path for two optional fields |
| **D9** | **Both views, at the edges of every page: the tree left, the table right, the page's own content in the main column.** The table's markup and its three columns do not change. The strip is one fragment, `deck/ui/strips.html`, that `home.html`, `thread.html` and `index.html` each fill through a `<!--STRIPS-->` slot | the user's answer: the table is vital information that must stay reachable, and the blank space beside a 46rem column is the only room on the page that is currently wasted. **Widened at Gate 2**: the panels were built into the home page alone, so following a `Yours` link — the one thing the table is for — landed the user on a thread with both gone. Their words: "I want to take this stuff with me" | the tree replacing the table (the first draft's default, reversed by the user); a second page, which is a click away and out of sight; the strip duplicated into each template, which is three copies of the same markup to keep in step |
| **D10** | **A tab is a `<details>` with its `<summary>` styled as the bookmark**; the open one extends further through extra inline padding on `details[open] > summary` | the platform's own disclosure: keyboard-operable, announced, no script, and it degrades to an open block if the CSS never loads | a checkbox-and-label hack, which has no disclosure semantics; a JS toggle, which D5 forbids |
| **D11** | **Panels are fixed to the edge and scroll inside themselves**, with one breakpoint below which an open panel overlays the main column rather than sitting beside it | the deck is opened on the machine running the pilot, where the blank space exists; a fixed panel cannot push the column, and a 32-row table needs its own scrollbar | a responsive reflow of the whole page, which is a layout system for a local 46rem page |

**The one thing D10 does not settle**, and slice 1 must probe in the browser: the
deck reloads itself on every `changed` event (`home.html:18-25`), and a reload may
reset a `<details>` a user had opened. Whether it does is a browser behaviour, not
a design choice, so slice 1 opens the tree, triggers a change, and reports. If the
tab does snap shut, the two fixes are (a) carry the open tabs through the reload in
the script that already performs it — two lines, in the deck's own script rather
than a script for the tabs — or (b) drive the open tab from the URL fragment with
`:target`, which survives a reload with no script but allows only one tab open at a
time. Recommended: (a). The pilot decides; nothing else in the design depends on it.

## 6. Assumed decisions — awaiting the user

| # | Question | Default taken | Tradeoff |
| --- | --- | --- | --- |
| A1 | Which tab is open when the page loads? | **The table's is open, the tree's is closed** | The page opens on what the user called vital, and the tree is one click away. Cost: the feature they asked for is the one that is hidden on arrival. |
| A2 | Is progress a marker derived from the state's first word, or a new `phase` field on the row? | **Derived** (spec 3) | Nothing new for the pilot to keep in step, and the vocabulary already exists in the skill. Cost: the marker is a guess at free text — "blocked on CI" gets no marker, so the one state a user most wants to spot on a tree is the one it cannot show. |
| A3 | Should the root carry the feature's own state — the artefact's last row? | **No.** The root is the run's name; a feature row sent as a slice renders as another node at root level | Keeps the request's two fields, and a third optional `feature` field is purely additive later. Cost: until then the deck never shows where the feature as a whole stands. |
| A4 | Does a tree node repeat the state text and the `Yours` link, or leave them to the table? | **Leaves them to the table** (spec 2) | A panel in the margin is about 20rem wide; a 400-character state cell there is a wall of text, and it would be the same text the table tab shows one click away. The tree stays the minimal thing the user asked for: structure and progress. Cost: with the tree open and the table closed the state is not on screen, and this reverses part of the draft's spec 2 ("nothing the table showed is missing from the tree"), which the user agreed to before the table was kept. |

## 7. Out of scope

Editing the spec from the deck. A per-behaviour "done" roll-up, or any state on a
leaf. Any change to what an item is, to the `Yours` join, or to the table's three
columns. Tabs beyond the two — the strip is built so later features add one, and
this feature adds none. A second blocker per slice: a nested list has one parent
per node, so `after` is one name and a second blocker lives in the state text.
Deriving the tree from the artefact file — the deck has no repository access, so
the tree is exactly as current as the pilot's last `deck_status` call.

## 8. Slices

```
1 tab shell, table right, flat tree left ──> 2 after nests ──> 3 delivers leaves
4 the pilot is told (parallel, disjoint files)
```

Slices 1 → 2 → 3 are a chain because they share `deck/ui/render.mjs` and
`deck/status.mjs`; slice 4 owns only documentation and the test that pins it, so it
may run in parallel with any of them. **The shell is one slice, not two**: a tab
strip with an empty left panel is not something a human can witness working, and
the shell and the flat tree are proved in the same browser pass — open the tree,
see names and markers, close it, see the table still there.

### Slice 1 — Two bookmark tabs, the table in one and a flat tree in the other

| Field | |
| --- | --- |
| **Source spec** | Spec 2, 3, 5, 6, 8; decisions D1, D4, D5, D9, D10, D11 |
| **Dependencies** | none (walking skeleton) |
| **Files owned** | `deck/status.mjs`, `deck/ui/render.mjs`, `deck/ui/home.html`, `deck/ui/deck.css`, `deck/test/status.test.mjs` |
| **Expected behaviour** | The home page keeps the queue in its column and grows two edge strips. The right tab holds the status table, rendered by today's code with its markup unchanged, open on load. The left tab holds the tree: the run's name at the root and one node per row beneath it, each node a marker and a slice name, closed on load. Each bookmark peeks out of its edge, opens and closes on click and on keyboard, and the open one extends further than the closed one. Every row is a child of the root — nesting arrives in slice 2 — so a deck written before this change renders identically to one written after it. `status.mjs` gains `treeOf(slices)` returning `[{ row, children: [] }]` and `phaseOf(state)` returning `'planned' \| 'doing' \| 'done' \| null`; `renderHomePage` fills three slots, `TREE`, `TABLE` and `QUEUE`. |
| **Verification** | `npm test` (488 passing at `main`, no known failures); `PILOT_DECK_DIR=$TMP/deck-s1 PILOT_DECK_PORT=4331 node bin/pilot.mjs deck` with the live deck's `deck.json` copied into that directory |
| **Evidence** | The new home-page tests failing against `main`'s renderer and passing after; the branch's deck in a real browser at `127.0.0.1:4331` beside the live one at `4321`, showing both bookmarks, the table open, the tree opening to names and markers, the queue not moving, and the 4321 deck untouched. **And the probe D10 leaves open**: with the tree open, land a `deck_status` call, and report in one line whether the tab survived the reload. |
| **Prohibited** | No JavaScript added — the existing `EventSource` script is not this slice's to grow, and the probe above only reports. No change to `renderSliceRow`, `renderState`, `renderYours`, `yoursFor` or `yoursIndex`. No glyph inside `status.mjs`. No second breakpoint or layout framework. No state text or `Yours` link on a tree node (A4). |
| **Completion** | `npm test` is green, both tabs have been opened and closed in a browser on port 4331 with the queue unmoved, and the reload probe is reported. |

### Slice 2 — `after` nests one slice under another

| Field | |
| --- | --- |
| **Source spec** | Spec 1 (nesting), 4 (the `after` half); decisions D2, D3 |
| **Dependencies** | Slice 1 |
| **Files owned** | `deck/status.mjs`, `deck/tools.mjs`, `deck/test/tree.test.mjs` |
| **Expected behaviour** | A row takes an optional `after`. `newSliceTable` resolves it through `sliceKey` against the other rows of the same call, refusing a name that matches none of them and refusing a chain that closes a cycle, each with a message naming the rows involved. `treeOf` hangs each row under its blocker and rows without `after` under the root, keeping the order the call listed them in. `deck_status`'s schema and description carry the field. |
| **Verification** | `npm test`; the preview on 4331 with a three-row table posted through the branch's own `deck_status` |
| **Evidence** | Each refusal test seen red before the validation lands; the browser showing B indented under A inside the tree tab, and the refusal message for `after: "nope"` read as the tool's own text |
| **Prohibited** | No silent fallback to the root for an `after` that names nothing. No accepting `after` as a list. No second pass over the rows in `render.mjs` — the shaping is `treeOf`'s. No loosening `additionalProperties: false`. No change to the table or the tabs. |
| **Completion** | `npm test` green, both refusals asserted, and nesting seen in the browser. |

### Slice 3 — `delivers` puts the spec on the screen

| Field | |
| --- | --- |
| **Source spec** | Spec 1 (leaves), 4 (the `delivers` half); decision D6 |
| **Dependencies** | Slice 2 |
| **Files owned** | `deck/status.mjs`, `deck/tools.mjs`, `deck/ui/render.mjs`, `deck/ui/deck.css`, `deck/test/tree.test.mjs` |
| **Expected behaviour** | A row takes an optional `delivers`, a list of at most 12 strings each within `MAX_STATE_CHARS`, refused in the deck's voice when it is neither. Each string renders as a leaf under its slice node in the tree panel, quieter than the node's own line, escaped like everything else, wrapping rather than overflowing the panel; a slice that delivers nothing renders no leaf list at all. |
| **Verification** | `npm test`; the preview on 4331 with a table whose rows carry spec lines |
| **Evidence** | The bound tests red then green; the browser showing this feature's own spec lines under its own slices, inside a panel that scrolls rather than spills |
| **Prohibited** | No markdown, no linkifying and no state on a leaf — a leaf is escaped text (out of scope). No new character bound where `MAX_STATE_CHARS` already applies. No truncation with an ellipsis in place of a refusal. |
| **Completion** | `npm test` green, the bounds asserted, and a spec line seen under its slice in the browser. |

### Slice 4 — The pilot is told about the two fields

| Field | |
| --- | --- |
| **Source spec** | Spec 7 |
| **Dependencies** | none; disjoint files, may run in parallel with 1–3, but must not reach `main` ahead of them |
| **Files owned** | `skills/pilot/SKILL.md`, `agents/pilot.md`, `agents/pilot-architect.md`, `docs/adr/0014-the-deck-draws-a-run-as-a-tree.md`, `scripts/test/pilot-agents.test.mjs` |
| **Expected behaviour** | The `deck_status` row of `agents/pilot.md`'s tool table, which today says "write only Slice and State", says the four fields and that `after` names another row of the same call. `skills/pilot/SKILL.md`'s artefact section says the status table it mirrors carries the blocker and the spec lines each slice delivers. The architect's status-table section says the same. ADR 0014 records D1, D2, D9 and D10 — including the edge tab strip as the pattern later features reuse — in the repository's ADR form. |
| **Verification** | `npm test`; `node --test scripts/test/pilot-agents.test.mjs` |
| **Evidence** | The new assertions in `pilot-agents.test.mjs` failing against `main`'s wording and passing after |
| **Prohibited** | No rewriting judgement text that is the user's. No new crew agent, no new tool, no change to `Agent(...)` lists. No ADR that re-argues a decision this artefact locks — it records them. |
| **Completion** | `npm test` green with the new wording pinned, and ADR 0014 committed in the form of 0012 and 0013. |

### Incident: mutation testing wrote to the live deck (2026-09-17)

Both slice reviews ran Stryker with `deck/store.mjs` in the mutate list. A mutant of
`store.mjs:111` (`process.env.PILOT_DECK_DIR || defaultStoreDir()`) ignores the
override, so under that mutant the suite wrote its fixtures ("Merge it", "Which
port?", "Context is at 40%") into the user's live store at `~/.claude/pilot`, twice
(08:52 and 09:11). The pilot closed the ten stray items; the run's table was not
touched. Standing rule from here: mutation never includes `deck/store.mjs`,
`deck/client.mjs`, `deck/daemon.mjs` or `deck/server.mjs`, and any mutation run sets
`USERPROFILE`/`HOME` to a scratch directory so `os.homedir()` cannot reach the live
store. Recorded in the fundamentalist's definition by a separate fix on `main`.

### Feature-level principles review (2026-09-17, Opus, at afa5aec)

Diff coverage 100% (293 changed lines); mutation on `status.mjs` and `render.mjs`
changed ranges 173/204 killed (86%); no cycles; no unused export. Verdicts:

| Finding | Verdict |
| --- | --- |
| `phaseOf`'s `^` anchor unpinned — `/[a-z]+/` survives; `'#21 draft'` would read as doing | kept: swap the test case for a state starting with a non-letter |
| ◐ never rendered through the tree in any test | kept: a fourth `implementing` row in the node test |
| `<section class="tree">` unasserted; every tree CSS rule hangs on it | kept: one `assert.match` |
| slice 3 copied slice 2's credential test setup whole — a third copy of `tempDeck` | kept: one test, one temp store, two `assert.throws` (−14) |
| deferred (a): third `requireCell` + empty check | kept: `requireNonEmptyCell` (−3) |
| deferred (b): `requireRow` CCN 13 | rejected: subsumed by (a), which lands it at 11; further extraction is an addition with no symptom |
| `.tree`/`.tree ul` duplicate `.runs`/`.runs ul` | dropped after QA's objection: `.runs` is live on `/items`, so the rules are identical for unrelated reasons and a merge couples two pages |
| test message "no JavaScript of their own" overclaims since D5's amendment | kept: reword |
| `phaseOf` guard simplification; duplicated run-name line; `.node` span with no rule | dropped: no consequence named |

## 9. Acceptance evidence

What the user watches, in the order they meet it, on a preview of the integration
branch. The preview runs beside the live deck, never on top of it:
`PILOT_DECK_DIR` points at a scratch directory and `PILOT_DECK_PORT` at 4331, and
the deck's only single-instance check is the port bind — so the live deck on
`127.0.0.1:4321` and its store in `~/.claude/pilot` are untouched. Seeding the
scratch directory with a copy of the live `deck.json` is also spec 8's evidence.

1. The branch's deck at `127.0.0.1:4331`, serving a copy of the live store, opens
   with the queue in the middle, a bookmark at each edge, and the status table
   already out on the right exactly as it reads today (5, 6, 8).
2. Clicking the left bookmark slides the tree out over the blank space, that
   bookmark now extending further than the other; clicking it again puts it away,
   and the queue has not moved (6).
3. The tree is the run's name with every slice beneath it, each one a marker and a
   name, the markers reading ○ ◐ ● and changing when a state does; a state the
   vocabulary does not know shows no marker (2, 3).
4. A `deck_status` call for this feature's own four slices, with `after` and
   `delivers`, redraws the tree as the DAG above with the spec lines beneath their
   slices (1).
5. The same call with `after: "nope"`, then with a cycle, then with thirteen
   `delivers` lines, is refused each time with a message that says which row and
   why (4).
6. `agents/pilot.md` and `skills/pilot/SKILL.md` read back the two fields, and
   `npm test` is green (7).

## 10. Status table

| Slice | State | Branch | PR | Worktree |
| --- | --- | --- | --- | --- |
| 1 Tab shell, table right, flat tree left | integrated at c9dc20e (principles review clean; fix round: open tabs carried through the reload, D10 fix a) | `slice/1-tab-shell-and-tree` | #19 | — |
| 2 `after` nests | integrated at 7c25add (principles review: 3 kept — a row pointing into a cycle it does not close was refused naming that row rather than the cycle, fixed; the "takes" field list and the empty-`after` message pinned by tests; fix round 4b07b8b; implementer's reviewer finding on re-validating `run.slices` in `readDeck` dropped: one writer, D2; browser gate handed to the user, no browser tool this session) | `slice/2-after-nests` | #20 | — |
| 3 `delivers` leaves | integrated at afa5aec (PR #21; principles review: field-list regex dropped as already fixed in d889fc2, exactly-twelve assertion kept at d6e8652, the third `requireCell`+empty-check copy and `requireRow`'s complexity deferred to the feature-level review; implementer's reviewer: map-over-a-hole fixed, getter double-read dismissed; assumed: an empty `delivers` list is stored absent; browser gate handed to the user) | `slice/3-delivers-leaves` | #21 | — |
| 4 The pilot is told | integrated at 3f60e59 (principles review clean) | `slice/4-pilot-told` | #18 | — |
| **deck-tree (the feature)** | at Gate 2. Fix round landed at 89cabde (items 1–5 and 7; `tempDeck` moved to `deck/testUtils.mjs` because a helper inside `deck/test/` is run as a test file; net +6, 541 tests), QA re-probed it clean. QA read-only pass clean before that: 8/8 spec lines, no bug. Procedure `itm_ca7e01ffd38b` posted; the user working through it found three things, all fixed — spec 5 widened to every page (dc42709, reviewed clean by `pilot:typescript-reviewer`, two LOW findings), spec 6's carry widened to follow them between pages ("b"), and the reply redirect landing them at the top of the page. 546 tests | `feat/deck-tree` | #17 | `pilot-qa-deck-tree` (QA is the branch's only writer from the procedure onward) |
