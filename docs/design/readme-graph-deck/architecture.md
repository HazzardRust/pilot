# readme-graph-deck: the README's graph shows the deck, not the CLI

Ticket itm_ba20129038a9 · base `pilot 1a4fd385` · branch `feat/readme-graph-deck`

## 1. Problem

The README's mermaid graph (`README.md:105`, under `## How it fits together`) maps the CLI. It has nine
`pilot …` subcommand nodes (run, wait, tickets, handoff, ready, integrate, land, landing, sync) and a
"pilot branch" node, and a user never types or sees any of them. The user's words: "it has too many CLI
commands on it that the user never actually sees when using the product - they just see the deck". What
a user meets is the deck: its threads, the two gates and the crew's replies. The graph should draw that,
and the commands should be documented where an operator looks under the hood, in `docs/OPERATING.md`.

## 2. Spec

| # | Behaviour | Evidence |
| --- | --- | --- |
| 1 | No node and no edge label in the graph names a `pilot` subcommand: nothing in the fence matches `pilot <sub>` for any subcommand `pilot help` lists. The `pilot:pilot` agent type and prose like "the pilot interviews you" are not commands. | readme-flow test `no subcommand is in the graph`: red on today's README, green after. |
| 2 | Each deck thread a run puts in front of you is its own node, at its point in the flow: a grilling question, Gate 1, the queued ticket, QA's walkthrough, Gate 2, the closing report, the teacher's lesson and the auditor's audit. An edge into a thread says who posts it; an edge out says what your answer does (*assumed* A1). | readme-flow test `every thread you meet is a node`; the graph rendered on GitHub's PR view, looked at by QA. |
| 3 | The graph ends where you stop: Gate 2, then the PR marked ready, then the closing report. The land, landing, sync and "pilot branch" nodes leave. | The run-order test, extended so that Gate 2 < PR < the closing report, counted in edges from `you`. |
| 4 | Every agent file stays a node, and the run order, the depth question's three answers, the edge labels and the walkthrough-names-a-node rule are kept. | readme-flow's existing tests are unchanged and green. |
| 5 | `docs/OPERATING.md`'s `## Commands under the hood` names each of the 9 moving subcommands (run, handoff, integrate, sync, land, landing, tickets, ready, wait), each with who runs it and when, and names no `pilot x` that `pilot help` does not list. | New test `scripts/test/operating-commands.test.mjs`: red before, green after. |
| 6 | The README's other tests stay green (readme-pitch, including "the README names `pilot run`", the credit order, the 4-line paragraph rule, the vocabulary guard, deck-readme). | `npm test` green: the old count, minus the 1 readme-flow test that moves, plus the new tests. |

The ticket's draft said 12 commands. `interviews` and `branch` are not subcommands ("pilot branch" is the git
branch named `pilot`), and "flags" is not one either, so the moving set is the 9 above: `pilot help` minus
readme-flow's `NON_MOVING`. The draft's other evidence, `check-references` exiting 0, proves nothing here,
because that script deliberately skips `docs/` and README (`scripts/check-references.mjs:15`). Spec 5's test
replaces it.

## 3. Findings

- `README.md:105-194`: the fence. 10 CLI nodes (`run`, `wait`, `tickets`, `handoff`, `ready`, `integrate`,
  `land`, `landing`, `sync`, `pilotbranch`) and 13 edges touch them.
- `README.md:94-103`: the 9-step walkthrough. Step 1 names `pilot run` in code, which `readme-pitch`
  requires (`scripts/test/readme-pitch.test.mjs:201`), and `pilot:pilot`, which stays a node. So
  "every step is a node" holds without editing the steps.
- `scripts/test/readme-flow.test.mjs`: `readFlow` parses the fence into labels and edges. The test `every
  moving subcommand is a node` pins the opposite of spec 1. `no node is the deck` pins L8 of readme-flow.
  The run-order test checks depths from `you` by exact label.
- `docs/design/readme-flow/architecture.md` L8: "remove the deck and it's connections" (the user,
  itm_db56dcd975f5). That is the constraint behind A1.
- `docs/OPERATING.md:17-22`: `## Commands under the hood` already names `pilot run` and `pilot landing`,
  and no other moving command.
- `bin/pilot.mjs:55-138`: the help text, the one source both tests read the subcommand list from.
- `deck/items.mjs:95-150`: the thread kinds. `report` is the closing report (`agents/pilot.md:605`),
  `lesson` is the teacher's, `audit` the auditor's. `handoff` and `crew-handoff` are the crew's and are
  not drawn.
- Who runs what: `ready` the co-pilot; `integrate` the co-pilot and QA; `land` the co-pilot; `sync` the
  pilot, and `land` runs it too; `handoff` the pilot; `tickets` the architect; `wait` every agent that
  owns a thread; `landing` the pilot after a Gate 2 Sign off; `run` you (`grep pilot <cmd> agents/*.md`).

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| The README graph parser | `readFlow(readme) -> { nodes, edges }` in `readme-flow.test.mjs` | nothing new; S1's tests read it | in-process |
| The subcommand list | `pilot help` stdout, `^  pilot <sub>` lines; the 9 moving ones = help minus `NON_MOVING` | `NON_MOVING` moves whole from readme-flow to the operating test (S2) | local-substitutable (a spawn of our own CLI) |
| The operator section | `docs/OPERATING.md` `## Commands under the hood`, read by `commandsSection(md)` | nothing | in-process |

Deletion test: removing `readFlow` would bring parsing back into every graph test, so it earns its keep.
`NON_MOVING` has one reader after the cut, so it moves rather than being shared. No fold changes code.

## 4. Ubiquitous language

- **thread**: one deck item a run posts to you (question, ticket, gate1, walkthrough, gate2, report, lesson, audit).
- **moving subcommand**: a `pilot help` subcommand outside `NON_MOVING`, one that passes work along.
- **the graph**: the first mermaid fence under `## How it fits together`.
- **the closing report**: the run's last `report` thread, after its PR is marked ready.
- **under the hood**: `docs/OPERATING.md`'s `## Commands under the hood`.

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
| --- | --- | --- | --- |
| L1 | The spec 1 bar is per subcommand: `\bpilot <sub>(?![\w-])` over node labels and edge labels, for every subcommand `pilot help` lists, moving or not. | A bare `pilot ` grep hits "the pilot interviews you". | A literal grep for `pilot `. |
| L2 | The `pilot help`-derived pin moves to OPERATING.md, and `NON_MOVING` moves with it. | The commands keep a test that fails when one goes undocumented. | Dropping the pin with the nodes. |
| L3 | Hooks, the gate and the integration branch stay nodes. | They are not CLI commands, and the request names only commands. | Cutting all machinery. |
| L4 | The walkthrough steps are not edited. | Step 1's `pilot run` is the one command you type, and readme-pitch requires it. | Rewording step 1. |
| L5 | Thread nodes are pinned by label head: a node whose text before `: ` ends with the thread's word (`a question`, `Gate 1`, `the ticket`, `the walkthrough`, `Gate 2`, `the closing report`, `a lesson`, `the audit`). | Same convention as `every step is a node`. The depth node's head ends "run", so it cannot pass by accident. | Matching the word anywhere in a label. |
| L6 | 2 slices with no shared file, so width 2. | The ticket asked for about 2, no wider. | One slice. |
| L7 | Grilling depth: No grilling (itm_0723887264e1, 2026-10-17); A1 stands assumed at its default. | The user's answer to the depth question. | Forks; every decision. |

## 6. Assumed decisions

- **A1 How the deck shows.** (itm_7b5f34dc7f8f, closed at the default; the user's reply was "Threads as nodes") Default: each thread is a rounded (stadium) node in
  the flow, with no deck node and no deck subgraph, so L8 and `no node is the deck` stand. The paragraph
  and the walkthrough keep naming the deck. Trade-off: the deck is never drawn as one place. Rejected: a
  "the deck" subgraph around the threads, because Mermaid clusters a subgraph's nodes and threads from
  different steps would bunch up and break the top-down order. Also rejected: one deck hub node, which
  reverses L8.
  Verdict: stands — L8 was the user's own call on readme-flow (itm_db56dcd975f5) and nothing queued redraws the deck.

## 7. Out of scope

The walkthrough's wording; the README's Install section (itm_1d6f74c3861a takes it); `NON_MOVING`
commands in OPERATING.md beyond what is already there; `check-references`' scope; a deck box or node;
readme-flow's own design file, which stays as history.

## 8. Slices

Width 2; longest stem 1

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | The graph draws the deck's threads, not the CLI (walking skeleton) | 1, 2, 3, 4, 6 | `README.md`, `scripts/test/readme-flow.test.mjs` | – | `pilot:typescript-reviewer` | [S1](slices/S1.md) |
| S2 | OPERATING.md names every moving subcommand | 5 | `docs/OPERATING.md`, `scripts/test/operating-commands.test.mjs` (new) | – | `pilot:typescript-reviewer` | [S2](slices/S2.md) |

Between the two merges, the moving commands are pinned in neither place. That lasts only on the
integration branch, and Gate 2 sees both.

## 9. Acceptance evidence

1. Open README.md on the feature PR's GitHub view: the graph renders and has no `pilot <command>` node.
   You can follow it from `you` through the grilling's question, Gate 1, the ticket, the crew, QA's
   walkthrough and Gate 2 to the PR marked ready and the closing report (spec 1, 2, 3).
2. Every agent is still in it, every edge still says what flows (spec 4).
3. Open docs/OPERATING.md: `## Commands under the hood` names the 9 commands, each with who runs it (spec 5).
4. `npm test` is green at the expected count (spec 6).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 1, 2, 3, 4, 6 |
| S2 | planned | | | | – | 5 |
| readme-graph-deck | planned | feat/readme-graph-deck | | | S1, S2 | 1-6 |
