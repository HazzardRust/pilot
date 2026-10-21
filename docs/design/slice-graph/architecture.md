# The slice graph is a git graph

Ticket `itm_846b8ed427e8` · slug `slice-graph` · branch `design/slice-graph` from `pilot` 620e60c9 · merge step: none (itm_5201f4e6db80)

## 1. Problem

The deck's Tree panel draws a run's slices as a nested list, built from each row's single `after` and its
`delivers` leaves. In the user's words it is "kind of broken" and "doesnt really show what i want": you have to
work out parallelism from the indentation, because the drawing does not show it. They want a git graph instead.
Each slice is a commit on a lane. Lanes fork where a slice lays groundwork for several others, and converge where
a slice needs several. A dependent chain stays on its own lane. A slice independent of everything after S1 runs
beside the whole flow and joins the trunk after the last slice, never into a slice it does not block. The only
text on the graph is each slice's identifier.

## 2. Spec

The fixture throughout is the user's example: S1 → S2 ‖ S3 → S4 → S5 ‖ (S6 → S7) → S8, and S9 after S1 alone.
`after` lists, in table order: S2 [S1], S3 [S1], S4 [S2,S3], S5 [S4], S6 [S4], S7 [S6], S8 [S5,S7], S9 [S1].

| # | Behaviour | Evidence |
|---|-----------|----------|
| 1 | Each slice is a dot on a lane, one row per slice, top to bottom in the table's order with blockers always above. The first child stays on its parent's lane. Each further child opens a lane at the parent (a **fork**). A slice with several blockers sits on the leftmost incoming lane, and the other lanes end in it (a **convergence**). | `graph.test.mjs`: `graphOf(fixture)` gives lanes S1 0, S2 0, S3 1, S4 0, S5 0, S6 1, S7 1, S8 0, S9 2, forks S1→S3 and S1→S9, and convergences S3→S4 and S7→S8. The rendered SVG draws them. |
| 2 | A chain stays on one lane, beside its sibling. | Same test: S6 and S7 both on lane 1 while S5 is on lane 0. |
| 3 | Every slice that nothing comes after merges into one unlabelled **end point** below the last row, the feature's trunk. A slice never meets a slice it is not a blocker of. | Same test: edges S8→end and S9→end, and no edge S9→S8. |
| 4 | `deck_status`'s `after` is a list. Each entry names a row by its full name or by its **identifier**. The stored table and `run.json` carry the list. A 0.7.20 string `after`, in `deck.json` or a record, still loads and draws as a one-item list. An entry implied by another path is drawn only through that path. | `tree.test.mjs`: `after: ["S2","S3"]` stored as a list and drawn as a convergence. A stored string row merged by a new call becomes a list. S4 after [S1,S2,S3] draws no third lane. |
| 5 | Parallelism is read off the lanes. pilot.md's pipeline relaxation is "the next slice on N's lane", and its parallel relaxation is "slices no line joins, top to bottom". The architect's §8 and §10 say lanes and blockers in the plural. | Wording pins in `scripts/test/slice-graph.test.mjs`, with the pilot's prompt pin not raised. |
| 6 | The graph's only drawn text is each row's identifier, the leading `S<n>` of its name. A row with none (a "Feature" row) gets no dot. | A render test: the SVG's `<text>` contents are exactly `S1`…`S9`, and a "Feature" row adds no dot. |
| 7 | A slice's phase is the fill of its dot: hollow when planned, a ring with a centre while in progress, solid when done, quiet hollow when unknown. *assumed (A5)* | The render test reads each dot's `class` from three states. |
| 8 | The graph folds nothing. The tree's `<details>` disclosure and `live.mjs`'s fold memory are gone. *assumed (A6)* | No `details.branch` in the page. The `live.mjs` fold code and its tests are removed. |

## 3. Findings

- `deck/status.mjs`: a pure vocabulary module that the store and the renderer both import. It holds `requireRow`
  (`after` must be a non-blank string, :203), `requireChain` (walks one `after`, refusing an unknown name or a
  cycle, :255), `mergeSliceTable` (re-validates the **stored** rows on every call, :319), and
  `treeOf`/`layersFrom`/`viewOf`/`nodesAt`, the tree and its L22 layer rule (:362-440), plus `phaseOf` (:450).
- `deck/ui/render.mjs:965-1075`: `MARKERS`, `renderMarker`, `renderLeaves`, `renderTreeNode`, `renderTreeLevel` and
  `renderRunTree`, a nested `<ul>` with `<details class="branch">`. Its only caller is the Tree bookmark panel
  (:1720).
- `deck/ui/deck.css:1078-1150`: `.tree`, `.marker`, `.path`, `.indent`, `.delivers`, `.branch`.
  `deck/ui/js/live.mjs:130,159` remember folds by `data-branch` across live swaps.
- `deck/tools.mjs:318`: `after` is `{type:'string'}`. `delivers` (:323) is drawn only by the tree. The
  description says "after and delivers draw the tree". Every byte is paid by the pilot (its own share is 10098.5
  against the pin of 10107, in `scripts/test/measure-prompt.test.mjs:127`), the co-pilot, and each agent holding
  the server grant.
- In real records (`docs/design/*/run.json`) rows are named "S1 Long title", `after` repeats the whole title, and
  one run sends a "Feature" row. Records are written from the table (`deck/store.mjs:1698`,
  `deck/server.mjs:770`). Nothing reads `after` back from a `run.json` file.
- Tests on the tree: `deck/test/tree.test.mjs` (40 tests: after validation :47-214, delivers :262-366,
  disclosure and layers :394-662) and `deck/test/live.test.mjs:252,940-1000` (fold memory).
  `scripts/test/pilot-agents.test.mjs:393-440` pins `after` in tools.mjs, pilot.md and ADR 0014.
- `docs/adr/0014-the-deck-draws-a-run-as-a-tree.md` records the tree (D1 computed at render time, D2 validated
  `after`). It is superseded, not edited.
- The vertical-slicing skill already writes a slice file's blockers as a list (`after: S1, S2`).

## 4. Ubiquitous language

- **Lane**: a vertical line of the graph. Every dot sits on one, and an edge runs down one.
- **Fork**: a dot with more than one line leaving it downward. Each child after the first opens a lane.
- **Convergence**: a dot with more than one line entering it. It sits on the leftmost one.
- **End point**: the unlabelled dot below the last row that every slice nothing comes after merges into. It
  stands for the feature.
- **Identifier**: the leading `S<n>` of a row's slice name, the only text drawn.
- **Blockers**: a row's `after` list, which is the DAG edge set. Two slices that no line joins, top to bottom, are
  **parallel**.

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
|---|----------|-----------|----------|
| L1 | `graphOf(slices)` replaces `treeOf`/`layersFrom`/`viewOf` in `deck/status.mjs`, computed at render time from flat rows. | Keeps ADR 0014's D1 (nothing stored, every deck already written renders) and the module's role. It reuses the private `sliceKey` and `phaseOf` without exporting them. | A new `deck/graph.mjs`, which would need `sliceKey` exported and adds a second vocabulary home. |
| L2 | Lane rule (spec 1): process rows in stable topological order (table order among the ready). A dot takes the leftmost lane whose open edge targets it, or the first free lane if none does. Its children by row order: the first keeps its lane, each other one takes the first free lane. A sink's lane stays open to the end point. | This is how `git log --graph` assigns lanes. It is deterministic and needs one pass. No line ever crosses a foreign dot, because a dot takes only an incoming lane or a free one. | Lane packing by longest path, which reorders rows away from the plan's order. |
| L3 | Transitive reduction before layout: a blocker reachable through another blocker is not drawn. | The user's S4 "requires S1, S2, S3", yet the drawing they described has two lanes converging, not three. | Drawing every listed edge, which adds a phantom lane from S1. |
| L4 | `after` entries match a row by full name (`sliceKey`, as today) or by identifier. Two rows with one identifier are refused on write. | It cuts bytes per call (`"S2"` instead of a 60-character title) and is the user's own spelling (`after: ["S2","S3"]`). | Matching by identifier only, which breaks every record written before. |
| L5 | Write path: `requireRow` accepts a string or a list and stores a non-empty list. A blank entry, an empty list or a duplicate entry is refused. Read path: one `blockersOf(row)` reads a string as `[string]`. | A legacy row passes through `requireRow` on the next merge (`mergeSliceTable`) and is upgraded there, so no migration step is needed (spec 4). | A one-off migration of `deck.json`, which is irreversible for no gain. |
| L6 | Inline SVG emitted by `render.mjs`, with geometry constants in the renderer: lanes 14px apart, rows 22px, identifiers in one column right of the widest lane, and edges as paths with a bend in the half row next to the fork or convergence. | The page is server-rendered, so SVG needs no client code and survives `live.mjs` swaps as bytes. | A canvas or client-side layout, which needs script and has no text nodes to test. |
| L7 | Rows without an identifier get no dot, and an edge to such a row is dropped. The Tree bookmark keeps its name. | Spec 6, and the bookmark is not the graph. | Drawing "Feature" as a dot. |
| L8 | QA runs on a scratch deck (`PILOT_DECK_DIR`/`PILOT_DECK_PORT`, left running). The user's last look is on the real deck after the merge and a daemon restart. | The environment the user chose for walkthrough-taste (itm_e4c98a382758). | QA on the live deck, which carries the user's own runs. |
| L10 | Row text drawn into the SVG (the hover `<title>`, the identifier column) goes through `render.mjs`'s `escapeHtml`, as the slice table's does. No attribute ever carries row text unescaped. A test proves that a row named `S1 <img src=x onerror=alert(1)>` renders inert, and that `<img src=x onerror=alert(1)> S1` draws no dot. | Rows are agent-supplied text, and inline SVG is parsed as markup. | Trusting that the identifier regex makes the row safe: the full name still reaches the `<title>`. |
| L11 | Grilling depth is forks (itm_91a062421c61, 2026-10-08): only decisions whose paths change the deliverable reached the user (A1–A3); the rest are read here at Gate 1, the only gate item. | The user's choice; the feature touches no schema, auth, money or irreversible data. | Every: one item per locked decision before the gate. |
| L9 | Every slice pays for its prompt text in the same file: the pilot's pin and the five agents' tool bytes never rise, and a slice that lowers the measure lowers the pin with a history line. | `measure-prompt.test.mjs`'s standing rule. | Raising the pin. |

**Byte accounting.** S1 and S2 add no prompt text. S3's list `after` costs about 40 bytes of schema, and dropping
`delivers` (A2) and rewording the description to "after draws the graph" frees about 190, so the net is roughly
150 bytes out of the tool every agent pays for, and S3 lowers the pilot pin. If A2 is refused, S3 pays its 40 bytes
from the `after` description itself ("the rows it comes after, by S<n>"). S4's wording must be net ≤ 0 bytes in
both `pilot.md` and `pilot-architect.md`. Removing ", the spec lines as `delivers`" (A2) pays for the lane words.

## 6. Assumed decisions

| # | Decision | Default taken | Tradeoff | Thread |
|---|----------|---------------|----------|--------|
| A1 | Where the slice name shows | Hover only: an SVG `<title>` on each dot and identifier. Nothing else is drawn. | Inline names would make the graph readable without a pointer, but break spec 6's "only identifiers". | decided by the user on itm_8425ac82900f, 2026-10-08: hover only, as recommended |
| A2 | `delivers` | Dropped from the schema and pilot.md. A stored value is accepted and discarded. | Spec lines vanish from the deck (they stay in the artefact). In return the bytes pay for spec 4. | decided by the user on itm_9f59643a7f6b, 2026-10-08: dropped, as recommended |
| A3 | Where a long independent slice's dot sits | Table order: S9's dot at the bottom, its lane drawn from S1. | Directly under S1 would show its start sooner, but reorders the plan. | decided by the user on itm_fdf274519f61, 2026-10-08: table order, as recommended |
| A4 | The end point | A small unlabelled dot on lane 0, one row below the last dot. | Lines simply stopping would draw no trunk to join. | taken by the pilot |
| A5 | Phase by dot fill (spec 7) | Hollow, ring with centre, solid. | The glyphs would be text, which spec 6 forbids. | taken by the pilot |
| A6 | Folding removed (spec 8) | The disclosure and its memory are deleted. | A git graph has no branches to fold. | taken by the pilot |

## 7. Out of scope

- The Status table, `Yours`, and the bookmark rail's names and order. The table still lists every row, including
  "Feature".
- Linking a dot to its status row or slice file (A1 may reopen this).
- Any change to how the co-pilot or pilot schedules slices beyond the two wording relaxations.
- Rewriting `run.json` files already committed in `docs/design/*/`.

## 8. Slices

| Slice | Title | Spec | Files owned | After | File |
|-------|-------|------|-------------|-------|------|
| S1 | The Tree panel draws the run as a git graph (walking skeleton) | 1, 2, 3, 6, 7 | `deck/status.mjs` (graph added), `deck/ui/render.mjs` (renderer added, panel switched), `deck/ui/deck.css` (graph rules), `deck/test/graph.test.mjs` (new), `deck/test/tree.test.mjs` (only the tests that assert the tree renders) | – | [S1](slices/S1.md) |
| S2 | The old tree leaves the deck (Sonnet) | 8 | `deck/status.mjs`, `deck/ui/render.mjs`, `deck/ui/deck.css` (tree removed), `deck/ui/js/live.mjs`, `deck/test/tree.test.mjs` (tree tests), `deck/test/live.test.mjs` | S1 | [S2](slices/S2.md) |
| S3 | `deck_status` takes a list of blockers | 4 | `deck/status.mjs` (row half), `deck/tools.mjs`, `deck/test/tree.test.mjs` (after/delivers tests), `scripts/test/pilot-agents.test.mjs` (:393-402), `scripts/test/measure-prompt.test.mjs` | S2 | [S3](slices/S3.md) |
| S4 | The crew reads parallelism off the lanes | 5 | `agents/pilot.md`, `agents/pilot-architect.md`, `scripts/test/slice-graph.test.mjs` (new), `scripts/test/pilot-agents.test.mjs` (:404-440), `scripts/test/measure-prompt.test.mjs`, `docs/adr/0101-the-deck-draws-a-run-as-a-git-graph.md` (new) | S3 | [S4](slices/S4.md) |

It is a single lane, because each slice shares a file with the one before it: S1 and S2 the tree's files, S2 and S3
`status.mjs` and `tree.test.mjs`, S3 and S4 the pin line and `pilot-agents.test.mjs`. Deletions count toward the
400-line bound. S1 adds about 350 lines and leaves the old tree in place but unreached. S2 deletes about 600 lines,
mechanically. S3 and S4 are small.

## 9. Acceptance evidence

On the scratch deck (L8), in this order:
1. Send `deck_status` with the fixture (S1 to S9 with list `after`s). The Tree panel shows two lanes forking at S1
   plus S9's lane, the convergence at S4, S6 and S7 on one lane beside S5, the convergence at S8, and S8 and S9
   merging into the end point. No line joins S9 to S8 (spec 1 to 3).
2. The only text in the graph is S1…S9. Hovering a dot shows its full name (spec 6, A1).
3. Move S2 to `implementing` and S1 to `integrated`: their dots change fill on the live swap with no reload
   (spec 7).
4. Send a row with a string `after`: it draws as before. Send `after: ["S1","S2","S3"]` on S4: no third lane
   (spec 4).
5. Read `pilot.md`'s step 4 relaxations: they name lanes (spec 5).
6. After the merge and a daemon restart, the user looks at the real deck's Tree panel on this run itself.

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
|-------|-------|--------|----|----------|-------|------|
| S1 | planned | | | | – | 1, 2, 3, 6, 7 |
| S2 | planned | | | | S1 | 8 |
| S3 | planned | | | | S2 | 4 |
| S4 | planned | | | | S3 | 5 |
| Feature | planned | feat/slice-graph | | | S4 | 1–8 |
