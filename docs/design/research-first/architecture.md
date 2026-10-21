# Research first: a recommendation rests on research when the answer lives outside the repo

Ticket itm_a513988b403c · slug `research-first` · base `pilot` 023185b9 · branch `design/research-first`

## 1. Problem

The user wants the crew's recommendations to become reliable enough that less of the
grilling has to be manual. The first step: the agent that owns a thread with a user
question knows when to send an explorer to research before it recommends, instead of
waiting for the user to say "do some research". On itm_49d87121223d (the git-workflow
question) the pilot recommended "pilot into the feature"; the user asked for research;
an explorer read eight sources, the pilot flipped to "feature into pilot", and the user
took it. That should be standard, and what does and does not need research is what this
feature defines. "We will need to bump the caps on some of the prompts."

## 2. Spec

| # | Behaviour | Evidence |
|---|---|---|
| 1 | `skills/grilling/SKILL.md` says when a default needs research. **Research** when it rests on (a) a practice or convention outside the repository (branching, release, versioning, CI), (b) a library's, tool's or service's current behaviour or API, (c) a security, privacy, data or licensing rule, (d) a standard or source the user named, (e) the user asking for research on any question. **Skip** for (f) a codebase fact (an explorer finds it, as today), (g) a preference or taste, (h) a scope call, (i) a decision already locked or covered by an ADR, (j) research already done for it this run. *Locked (L8).* | A wording pin naming every item of both lists. |
| 2 | A researched question goes up only after its research, its body carrying one `Research:` line (what was read, how many sources, which option it favours); the rest of the frontier goes up meanwhile. *Locked (L7).* | A pin; itm_49d87121223d's question re-run on the scratch deck posts with the `Research:` line and no table; the explorer's report to the pilot carries the table. |
| 3 | `agents/pilot.md` §3 says, in one clause, research first, then recommend, through a `pilot-explorer` research brief. | A wording pin. |
| 4 | `agents/pilot-architect.md`: an assumed decision whose default needs research reaches `main` with its research table; `pilot:pilot-explorer` joins its child list. | A wording pin. |
| 5 | `agents/pilot-qa.md`: a question QA sends its addressee whose default needs research carries it; `pilot-explorer` joins its child list. *Assumed (A5).* | A wording pin. |
| 6 | `agents/pilot-explorer.md` has one research-brief section: the brief names the decision, the options, the practice to read and a fetch limit; the explorer returns a table (Practice, What it does, Source, one "Implies for" column per option), unfetched rows marked and never filled from memory, then which option practice favours; it reports the table to its owner only, never on the thread (L6). The owner may quote a source or a row on the thread when it judges the user needs it, never the whole table by rule. *Assumed (A4).* | A pin on the section (fields, columns, owner-only); on the scratch run the explorer's report to the pilot carries the table and the thread has none. |
| 7 | When research overturns a recommended default, the owner says so in one reply on the thread and puts the question again with the new default. | A wording pin in the grilling skill. |
| 8 | The prompt-budget pins move up by exactly the measured cost of these clauses and nothing else moves. | The pin diff in the PR: pilot (10088), explorer (2209), QA (4357.25) raised, each with its history comment. |

It cannot mean research on every question (the skip list exists for cost), the explorer
deciding or resolving a thread, or research reopening a locked decision.

## 3. Findings

- `skills/grilling/SKILL.md` (37 lines): vendored from mattpocock-skills; its header's
  `adapted:` line and the row at `vendor/methodology.md:67` are checked by
  `scripts/check-provenance.mjs` and change with it. Its "Finding _facts_ is your job"
  paragraph already sends a sub-agent for a fact without blocking the rest of the
  frontier: the research rule extends that paragraph, not a new mechanism.
- No agent preloads `grilling` (`node scripts/measure-prompt.mjs`: pilot's skills 0), so
  the skill's new lines cost no budget pin. The pilot reads it at steps 1 and 3
  (`agents/pilot.md:94`).
- `agents/pilot.md` §3 (lines 254-310) restates grilling; `scripts/test/grilling-voice.test.mjs`
  pins both copies. "Facts are never the user's to supply" (line 295) is where the clause goes.
- Own shares today: pilot 10087 of 10088, explorer 2209 of 2209, QA 4356 of 4357.25
  (pins in `scripts/test/measure-prompt.test.mjs` and `qa-preview.test.mjs:135`). Every
  clause raises a pin; the architect has none.
- `agents/pilot-explorer.md` already answers on a deck thread named in its brief (unused by
  this feature: a research brief names no thread, L6)
  (`deck_reply`, never resolve); budget about twenty-five tool calls.
- The architect's children (`agents/pilot-architect.md:57-60`) and QA's
  (`agents/pilot-qa.md:186-189`) exclude `pilot-explorer`; the main session's `Agent(...)`
  list holds it, so both reach it once their prose names it.
  `scripts/test/pilot-agents.test.mjs:167` accepts any `pilot:` child.
- itm_49d87121223d (read from `~/.claude/pilot/deck.json`): the explorer's reply, authored
  `explorer` on a pilot-owned thread, is the template: eight fetches, a table of practice,
  what it does, source, implies for option 1, implies for option 2, two rows marked not
  fetched, a three-line conclusion; 46 s from the request to the table.
- A question body is capped at 1200 characters (`deck_post`), so the table goes on the
  owner's report, not in the body (L6).

### Seams

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| Grilling research rule | `skills/grilling/SKILL.md` "Finding facts" paragraph: research list (a)-(e), skip list (f)-(j), the `Research:` line | the three agents' clauses name it instead of restating the lists | in-process |
| Research brief | `agents/pilot-explorer.md` `## A research brief`: Decision, Options, Practice, Fetch limit; the returned table's columns | the one shape every owner briefs with | in-process |
| Prompt budget | `measure({ root, home })` in `scripts/measure-prompt.mjs` → rows of `definition`, `skills`, `tools` | unchanged; the pins read it | local-substitutable |

Deletion test: pilot.md §3's restatement of grilling fails it (deleting it moves only a
pin), but the fold is not this request; it goes to `main` as a candidate ticket.

## 4. Ubiquitous language

- **Research**: reading sources outside the repository for one decision, by a `pilot-explorer` on a research brief. Finding a codebase fact is not research.
- **Research brief**: an explorer brief with the fields of spec 6.
- **Research line**: the one `Research:` line in a question's body.
- **Owner**: the agent whose thread or stashed decision carries the question: pilot, architect or QA.
- **Practice**: a convention, rule, API or standard whose source is outside the repository.

## 5. Locked decisions

- **L1** The lists live once, in the grilling skill; each agent's clause names them. Rejected: the lists in each agent (three copies, three pins, three budget costs).
- **L2** The researcher is the existing `pilot-explorer`; no new agent or skill. Rejected: a `researching` skill (another file to load; the explorer already holds WebFetch, WebSearch and `deck_reply`).
- **L3** The explorer returns its table to its owner in its report (`SendMessage` to the owner, or its final report); the owner names no thread to it, and the explorer's `deck_reply` is unused by this feature. Rejected: the owner naming the thread after posting so the explorer posts the table there (A3's default, overridden in L6).
- **L4** Wording pins go in new test files, one per slice. Rejected: adding them to `grilling-voice` and `pilot-agents` (two slices in one large file).
- **L5** Each budget pin rises by its measured cost with a history comment, as the pilot's pin's comments already do.
- **L6** (was A3; decided on itm_4b6d6c8b8098) Research is behind the scenes: the table goes to the owner only, the question body carries one `Research:` line, and the owner may quote a source or a row on the thread by its own judgement, never the whole table by rule. The user: "it is meant for the pilot to make better decisions, a behind the scenes thing to make it better. we want the user to only see what is necessary." and "if the pilot feels like referencing it, it should". Rejected: the table on the thread. overridden: the user cannot check sources from the deck.
- **L7** (was A2; decided on itm_cd6bda0c7f95) A researched question waits for its research and goes up with its `Research:` line; the rest of the frontier goes up meanwhile, as grilling already does for a fact an explorer is finding. Rejected: posting at once and amending in a reply when the research lands, which lets the user answer a default that then flips.
- **L8** (was A1; decided on itm_1560607c2b01; revised on itm_f3a2464c6f11 and itm_d69d3a72b82c) The two lists as written in spec 1: research for (a) a practice or convention outside the repository, (b) a library, tool or service's current behaviour or API, (c) a security, privacy, data or licensing rule, (d) a standard or source the user named, (e) the user asking; skip for (f) a codebase fact, (g) a preference, (h) a scope call, (i) a locked decision or an ADR, narrowed: a question asking whether to change a decision already locked or a convention the code follows is not covered by it and is researched, (j) research already done for it this run. Rejected: dropping (c), which would leave the riskiest defaults unsourced.
- **L9** Grilling depth: forks (itm_ec2bb571facb, the recommended default). Only materially different forks reach the user; Gate 1 is one item, no walk. Rejected: a walk of every decision.
- **L10** (was A6; decided on itm_1a5cc6ce1e0f) QA runs against a scratch deck daemon on a spare port (`PILOT_DECK_PORT=4512`) with a scratch repository and `claude --plugin-dir <worktree>`, re-running the question of itm_49d87121223d there. Rejected: the live deck on 4321, whose inbox the research thread would land in.

## 6. Assumed decisions (awaiting the user)

- **A1** Locked as L8 on itm_1560607c2b01.
- **A2** Locked as L7 on itm_cd6bda0c7f95.
- **A3** Locked as L6 on itm_4b6d6c8b8098.
- **A4** Fetch limit: at most eight web fetches per brief, stopping at three agreeing sources. Higher costs Sonnet tokens per question; the cited thread used eight.
- **A5** Owners are the pilot, architect and QA only; the co-pilot, auditor and teacher are out.
- **A6** Locked as L10 on itm_1a5cc6ce1e0f.

## 7. Out of scope

Research for the co-pilot, auditor or teacher; folding pilot.md §3's restatement of
grilling; measuring recommendation accuracy over time (the user's "eventually"); any
deck or daemon code.

## 8. Slices

Width 1; longest stem 2

| Slice | Title | Spec | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|---|
| S1 | The pilot's researched question goes up with its research attached | 1, 2, 3, 6, 7, 8 | `skills/grilling/SKILL.md`, `vendor/methodology.md`, `agents/pilot-explorer.md`, `agents/pilot.md`, `scripts/test/measure-prompt.test.mjs`, `scripts/test/research-first.test.mjs` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | The architect and QA research before they recommend | 4, 5, 8 | `agents/pilot-architect.md`, `agents/pilot-qa.md`, `scripts/test/qa-preview.test.mjs`, `scripts/test/research-first-crew.test.mjs` (new) | S1 (grilling research rule, research brief) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S2](slices/S2.md) |

S1 is the walking skeleton: rule, brief, the pilot's clause and the pins, end to end on
the scratch deck. `agents/pilot.md` is also edited by handoff-closed-on-pickup S2 (#496)
and red-lands-on-pilot S1 (#499): S1 rebases onto `pilot` once they land and measures the
pilot's pin then. Estimated diff about 120 changed lines, under the 300 limit.

## 9. Acceptance evidence

1. On the scratch deck, the pilot given the itm_49d87121223d question posts it only after an explorer ran; its body has a `Research:` line (spec 1, 2, 3).
2. The owner's report from the explorer holds the table (Practice, What it does, Source, one Implies-for column per option, unfetched rows marked); the thread holds the `Research:` line only (spec 6).
3. A skip-list question (a scope call) goes up with no research (spec 1).
4. A user reply "research this" on an unresearched question gets an explorer, and a flipped default is said in one reply (spec 1e, 7).
5. `npm test` green; the PR names each pin's old and new number (spec 4, 5, 8).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | – | – | – | – | 1, 2, 3, 6, 7, 8 |
| S2 | planned | – | – | – | S1 | 4, 5, 8 |
| research-first | planned | `feat/research-first` | – | – | S1, S2 | 1-8 |
