# README: the information flow between the agents, the machinery and the deck

Ticket `itm_79f3f533ec7c` · slug `readme-flow` · base `pilot` 2426af8f · names are those of the day this was written, before `itm_8b75a1e6b83d` renamed them.

## 1. Problem

People reading the README should see how general the product is: the same agents, machinery and deck on any repository and stack.
Nothing there shows the information flow between them. The user: "a graph that represents the general information flow between agents and other important machinery ... a node that sits off to the side which represents the deck and the flow that goes to and from certain agents/machinery."

## 2. Spec

| # | Behaviour | Evidence |
| --- | --- | --- |
| 1 | `README.md` carries one mermaid flowchart, under the heading `## How it fits together`, of the general flow, top to bottom "in run order, from your first prompt to the feature PR marked ready" (the user on itm_db56dcd975f5, 09:58, L7): Gate 1 before the co-pilot, Gate 2 before the PR marked ready. It has a node for every file in `agents/` (the language reviewers and helpers share one node that lists their names, *assumed* A2), for the user, for the first question of every run (how deep to be grilled, with its three answers on its edges) and the grilling it opens (L10), and for the machinery: the `pilot` CLI, the hooks, the gate, `pilot run`, `handoff`, `integrate`, `sync`, `land`, `landing`, `wait`, `tickets` and `ready`, the integration branch and the feature PR. Every edge carries a label. | `scripts/test/readme-flow.test.mjs`: each `agents/*.md` name and each moving subcommand is in the fence, no edge is unlabelled, and counted in edges from `you`, the depth question comes before the grilling, the grilling before Gate 1, Gate 1 before the co-pilot and Gate 2 before the PR marked ready; the depth question's edges say "every decision", "only the forks" and "no grilling". | `node scripts/check-references.mjs` passes. GitHub's README view renders it (QA, A3). |
| 2 | ~~The deck is one node in its own subgraph beside the main graph. It has an edge to each agent whose tool list holds a `deck_*` tool (pilot, architect, auditor, explorer, co-pilot, qa, teacher today) and to the machinery that touches it (hooks, `wait`, `handoff`, `landing`), and to you, and to nothing else.~~ Dropped, see L8. | ~~The same test derives the agent set from the `tools:` lines of `agents/*.md` and compares it with the deck node's neighbours among agents; the one other neighbour it allows is the user node, `you`, by its `you <--> the deck` edge.~~ |
| 3 | A short paragraph under the same heading says what is general: any repository, any stack, the same agents, the same deck. The README lists its sections in a one-line contents list under the intro (*assumed* A1) and the heading is in it. | A wording pin: the paragraph names "any repository", "any stack", "the same agents" and "the same deck"; the contents list links each `##` heading of the README. |
| 4 | Adding an agent file or a moving `pilot` subcommand without a node fails the test (implied: the graph cannot silently go stale). | The test reads `agents/` and `pilot help`; a subcommand is either drawn or in the test's named list of ones that move no work. |

## 3. Findings

| Area | What exists | Anchor |
| --- | --- | --- |
| README | Sections Install, Use, Your part, Philosophy, Layout, Built on, Licence. No table of sections; Layout lists directories. | `README.md` |
| README pins | Layout rows and "start here" are pinned; two prose pins (doctor, philosophy). Nothing pins the section order. | `scripts/test/deck-readme.test.mjs:30-41`, `deck/test/doctor.test.mjs:119`, `scripts/test/pilot-agents.test.mjs:1322` |
| Agents | 24 files. `deck_*` in tools: pilot, architect, auditor, explorer, co-pilot, qa, teacher. None: implementer, fundamentalist, fact-sheet, evidence-runner, reviewers. | `agents/*.md` `tools:` |
| Subcommands | Work-moving: run, handoff, integrate (+ `--default`), sync, land, landing, wait, tickets, ready. The rest report or tidy (deck, base, worktrees, branches, audit, analytics, logging, budget, ps, gc, doctor). | `bin/pilot.mjs:49-125` |
| Hooks | One node is enough: they stamp authors, alert the inbox, hand off sessions, refuse prompts and gate Stop, all through the deck. | `hooks/*.js` |
| check-references | Checks `agents skills rules commands hooks .mcp.json` only; `README.md` is outside it, so it passes by construction. | `scripts/check-references.mjs:25` |
| Mermaid | No existing diagram in the repository; GitHub renders mermaid fences natively. | `grep -ril mermaid` |

Seams (deepening pass: the feature adds a document and one test; the deletion test on each module):

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| README graph reader | `readFlow(readme: string): { nodes: string[], edges: { from, to, label }[] }` in the test file | parsing the fence once for tests 1-4 | in-process |

No code is folded: nothing existing is shallow here.

## 4. Ubiquitous language

- **flow**: one labelled edge, what moves from one node to the next.
- **machinery**: the `pilot` CLI commands, hooks, gate and branches an agent passes work through.
- **deck node**: the single node standing for the deck, with edges only to its callers.
- **moving subcommand**: a `pilot` subcommand that carries work between agents or branches.

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
| --- | --- | --- | --- |
| L1 | The graph is `flowchart TD`, so it reads down the page (the user on itm_db56dcd975f5, 2026-10-16; it was `LR`), the deck in a `subgraph` below it, with quoted labels and no HTML. | Native GitHub rendering, no build step, and the subgraph is the "off to the side" the user asked for. | An image file (stale, unreviewable); a second graph for the deck. |
| L2 | The test is the contract: it parses the fence and ties it to `agents/` and `pilot help`. | The graph is documentation about changing files; a pin keeps it true. | A manual list (goes stale). |
| L3 | Section heading `## How it fits together`, placed after `## Use` and before `## Your part`. | Readers meet the flow after they know how to start. | Before Install (buries the install). |
| L4 | Two slices: graph and its test first, deck node and paragraph second. | Both edit `README.md` and the test file, so S2 follows S1. | One slice (the deck is the user's second ask and reviews better apart). |
| L5 | Grilling depth: *No grilling* (itm_a98114ed7f7c); the spec was agreed on itm_b65675d0d537 and A1–A3 stand as assumed, no design question posted. | The user's choice for a docs-only run. | *every*, *forks*. |
| L6 | L: you ↔ deck edge (itm_9f66cf5a6f7c, 2026-10-16, the recommended default): spec 2 widened to its callers, its machinery and you. | The user meets the flow on the deck: questions, gates, lessons, walkthroughs, and their answers and Sign off. | Relabelling user→wait only. |
| L7 | The graph runs down the page in run order, "from your first prompt to the feature PR marked ready" (the user's words, itm_db56dcd975f5, 2026-10-16 09:58): you, pilot run, pilot, architect, Gate 1, tickets, co-pilot, implementer, gate, integrate, the integration branch, fundamentalist, QA, Gate 2, the PR marked ready, land, with side branches off that line and the deck in its own box at the bottom. | The user reads the README as a workflow that follows time. | A second, timeline graph beside the flow graph (two graphs, against L1). |
| L8 | The deck and its edges come out of the graph: "okay remove the deck and it's connections" (the user's decision, itm_db56dcd975f5, 2026-10-16 10:13). It overrides the deck edges of L6 and L7 and drops spec 2; L6 and L7 stay as history. Overridden: the deck is the README's central surface; the paragraph above the graph now carries it alone. | The user's call on the walkthrough. | Keeping the deck below the flow. |
| L9 | Every node and edge label reads on its own, in plain words, with no term from elsewhere in the README: the user on itm_db56dcd975f5 (2026-10-16), "i want it to be more independent and can be read on it's own", whose example "starts the terminal wrapper, clears the context when full" is taken as written on the `pilot run` to `pilot:pilot` edge. Agent and subcommand names stay as node names (spec 1 and 4); `/clear`, `slug`, `run.json`, `Teach me`, `Sign off`, the red queue, slice, artefact and fact sheet are said in words instead. | The graph is read by someone who has not read the rest of the README. | A glossary under the graph (a second thing to read). |
| L10 | The grilling is in the graph, between your first prompt and the architect: "include where \"grilling\" happens, and the decision that gets made on how deep to grill" (the user, itm_db56dcd975f5, 2026-10-16). Two nodes: the run's first question, how deep to be grilled, with its three answers on its edges in plain words (every decision reaches you; only the forks that change what gets built; no grilling, the pilot's recommended answers stand), and the grilling itself, one question per decision with a recommended answer, whose answers go to the architect (agents/pilot.md, steps 1 and 3; skills/grilling/SKILL.md). | The reader asked where the interview sits in time and what the first decision is. | A note under the graph instead of nodes (against L9: the graph reads on its own). |
| L11 | The drawing is narrower so GitHub, which scales it to the column, shows it larger: "can we consider methods to reduce width of the rendered chart so it shows up a little a bit big larger and with more readable text?" (the user, itm_db56dcd975f5, 2026-10-16). Labels wrap at 140px instead of 320, and each pair of opposite edges between the same two nodes (pilot and explorer, implementer and fact-sheet, implementer and the reviewers, fundamentalist and evidence-runner) is one two-way edge carrying both texts, "<down>; back: <up>". Measured with mermaid-cli: 1847 wide at 71683fff, 1492 with these two means. Stacking helpers with invisible links and clustering them in subgraphs were measured too and made the drawing wider (1537 to 2024), so they are not used; `nodeSpacing` and `rankSpacing` changed nothing. | The widest row is the pilot's fan-out, and each edge label is its own box in that row. | Smaller type (no larger on screen, since GitHub scales the width); the ELK layout (not known to render on GitHub). |

## 6. Assumed decisions (stand, per L5)

| # | Default taken | Tradeoff |
| --- | --- | --- |
| A1 | Add a one-line contents list under the README intro linking every `##` heading, so spec 3's "table of sections" exists. | Eight lines in the README; without it spec 3's evidence has nothing to check. |
| A2 | The eleven reviewers and helpers are one node listing their names. | Eleven nodes would bury the shape; one node still lets the test see each name. |
| A3 | QA environment: the PR's README on GitHub plus a local render (`npx @mermaid-js/mermaid-cli`, or mermaid.live). | GitHub is the only real proof of what readers see; the local render shows syntax errors earlier. |

## 7. Out of scope

Renaming the day's names (`itm_8b75a1e6b83d`); the deck's internal modules (`deck/README.md`); a Mermaid CI renderer; an ADR (no structural decision).

## 8. Slices

Width 1; longest stem 2

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | The README shows the main flow (walking skeleton) | 1, 4 | `README.md`, `scripts/test/readme-flow.test.mjs` | – | `pilot:typescript-reviewer` | [S1](slices/S1.md) |
| S2 | The deck sits beside it, and the paragraph says what is general | 2, 3 | `README.md`, `scripts/test/readme-flow.test.mjs` | S1 (`README.md`, the test file) | `pilot:typescript-reviewer` | [S2](slices/S2.md) |

## 9. Acceptance evidence

1. Open the README on the PR: the graph renders, with the deck apart on one side.
2. Each agent in `agents/` and each moving subcommand is a node; every edge reads as what flows.
3. The deck's edges go only to the agents and machinery that call it.
4. The paragraph under "How it fits together" says any repository, any stack, the same agents and deck, and the contents list links it.
5. `node --test scripts/test/readme-flow.test.mjs`, `node scripts/check-references.mjs` and `npm test` pass.

## 10. Status

| Slice | State | Branch | PR | Worktree | Blockers | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 1, 4 |
| S2 | planned | | | | S1 | 2, 3 |
| feature `readme-flow` | planned | | | | | 1-4 |
