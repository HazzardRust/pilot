# The README becomes a pitch: new ideas first, one line each

Ticket `itm_acab2d47e56b` · feature `readme-pitch` · base `pilot` 2ea8122f · merge: none (itm_85fc537b6a42) · one run, 3 slices

## 1. Problem

The user: "it was written a while ago and by an agent that wasn't that good at writing, i want it re-written with
updated information by opus 5.5 … should be treated like a pitch - dont talk for too long, keep them hooked - most
interesting features mentioned one after another, not large paragraphs … there are new ideas in here, they always come
first." They want a quick install, a one-line-per-feature list, a short walkthrough beside the mermaid graph, and their
five product principles, in their order, with the honourable mention.

## 2. Spec

The ticket's lines 1–7 (column T) as sharpened against 2ea8122f; 8 and 9 are implied by the code (*added*), and the
guard in 4's evidence is *added* because `check-references` does not scan `README.md`.

| # | T | Behaviour a reader can watch | Evidence |
| --- | --- | --- | --- |
| 1 | 1 | The README opens with a one-line tagline and three one-line hooks naming the new ideas (*assumed* A3), before any instruction; no prose paragraph runs over 4 lines anywhere. | `readme-pitch.test.mjs`: every paragraph outside fences and tables is ≤ 4 source lines and ≤ 320 characters (README.md:53 is one 600-character line); the hooks sit above `## Install`; a cold reviewer names the three ideas back |
| 2 | 2 | Quick install: today's paste prompt (ADR 0002) with every command in it kept verbatim (the two `claude plugin` commands, `claude plugin list --json`, `claude plugin update pilot@pilot`), its prose shortened only, then `pilot run` under `## Use`. | `install.test.mjs`'s Install and Use pins green; the guard finds each of today's commands verbatim; QA reads the rendered Install on GitHub's PR view and runs its commands once in a temp directory (L8) |
| 3 | 3 | A feature list of at least 15 one-line bullets, newest ideas first, each naming a mechanism in the fact sheet (§3). | the guard counts ≥ 15 single-line bullets under `## Features`; each bullet maps to a fact-sheet row in the S3 claim table |
| 4 | 4 | Nothing stale: every claim holds at the tip, in co-pilot/ticket words, no retired name or removed command; the stale "there is no separate audit pass" (README.md:204, contradicted by ADR 0040) goes. | the vocabulary guard (it scans README.md); *added*: the guard checks every relative link resolves, every `pilot <cmd>` is in `pilot help` and every `pilot:<agent>` is a file in `agents/`; S3's PR carries the claim-by-claim table with no row stale |
| 5 | 5 | A walkthrough of an average run, under 12 lines, sits directly above the graph in `## How it fits together` (*assumed* A4); every step names a node of the graph. | `readme-flow.test.mjs`: walkthrough ≤ 11 lines, each step's named node is a node label; the graph's existing pins stay green |
| 6 | 6 | `## Principles`: the six, numbered 1–6 in the user's order (the sixth added by line 10), each one or two lines naming the mechanism that delivers it today, then model and harness agnosticity as intent, never as a claim. | the guard reads six numbered items in order and a line after them naming agnosticity; the claim table maps each principle to its mechanism |
| 7 | 7 | Every slice that writes README prose runs on Opus (the user's "opus 5.5"). | each slice header's `Model: opus`; each PR names the model |
| 8 | – | *added*: the README's 27 existing pins (§3) move with the wording in the slice that moves it, never deleted, keeping the rule each one guards. | each moved pin's diff in its slice PR; `npm test` green |
| 9 | – | *added* (L1): the operator detail (starting without the wrapper, where run branches live, slow gates on Windows) moves to a new human-facing `docs/OPERATING.md`, linked once from the README and once from INSTALL.md's step 10, which says the installing session runs nothing in it. | `run-remote-readme.test.mjs` and `doctor.test.mjs` read OPERATING.md; the guard finds one link to it in the README; INSTALL.md's step 10 holds the line |
| 10 | – | *added* (the user, on the ticket, 2026-10-17): a sixth principle, in their words: "the system wayfinds on its own. there is no memorisation of commands or workflow steps, the moment the idea has been put into the system, it does the rest for you - grills you to ensure alignment, reviews, merges, architects, schedules, you just have to answer the questions." One or two lines under `## Principles`, naming the mechanism (the deck's questions, the lanes and the chain) as the others do. | the guard reads six numbered principles; the sixth's words hold "wayfinds" and "answer the questions" |

## 3. Findings

- **README at 2ea8122f**: 250 lines (not 131): Install (paste prompt, 15-line fence, 6-line rationale), "Where run
  branches live" (one 1-paragraph line), Use (wrapper, Defender), How it fits together (90-line mermaid fence),
  Your part, Philosophy, Layout, Built on, Licence. It already reads co-pilot and ticket: PR #729 changes nothing in
  `README.md` against 2ea8122f (`git diff 2ea8122f origin/feat/co-pilot-tickets-history -- README.md` is empty), so
  this run waits on nothing.
- **`pilot doctor`** is a Defender real-time-scan check only (`deck/doctor.mjs`); the README promises no preflight.
  itm_f520e253fe50 builds that and the operator runbook, extending `docs/OPERATING.md`.
- **INSTALL.md is the installing Claude's script** (`docs/INSTALL.md:3-5`: "Follow them in order, run the commands
  yourself"); the README's Defender passage carries an admin command (`Add-MpPreference`, README.md:89).
- **Guards**: `scripts/check-references.mjs:26` `SURFACE` is agents, skills, rules, commands, hooks, `.mcp.json`: the
  README is outside it. `scripts/vocabulary.mjs check` scans every tracked file but `docs/adr`, `docs/design`, so the
  README is inside it (run by `scripts/test/vocabulary-guard.test.mjs`).
- **README pins (27, 7 files)**: `scripts/test/install.test.mjs` 954-1221 (Install is one fenced paste block with no
  ```` ```bash ````, names "global `pilot` command", links INSTALL.md, the update sentence, "run it again" absent;
  Use holds a `pilot run` bash fence; `pilot@pilot`, `HazzardRust/pilot`; `127.0.0.1:4321`, "loopback", "key or a
  token"; credit order and both copyrights, NOTICES and VENDOR links; Use < Your part < Layout; Your part's three
  bullets, its exact Gate 1 sentence, "mostly AI", the CLAUDE.md standing-rule sentence, no self-merge claim; the
  `agents/` Layout row and the count 24). `scripts/test/readme-flow.test.mjs` (every agent and moving subcommand a
  node, labelled edges, run order, depth edges, no "the deck" node, the "any repository / any stack / same agents /
  same deck" paragraph, the contents line links every `##`). `scripts/test/deck-readme.test.mjs:31-42` (a Layout row
  per top-level directory, "start here"). `scripts/test/pilot-rules.test.mjs:435-440` (the `docs/adr/` row links its
  index). `scripts/test/run-remote-readme.test.mjs:30-36` (`### Where run branches live`). `deck/test/doctor.test.mjs:118-123`
  (`pilot doctor` and the scanner's last two lines). `scripts/test/pilot-agents.test.mjs:1321-1325` (agent efficiency
  is philosophy, names friction).
- **House pattern**: `docs/design/readme-flow/` built the graph and its test; `docs/design/co-pilot-tickets/` the shape.

### Fact sheet: what the README may claim (2ea8122f)

| Feature | One line | Where |
| --- | --- | --- |
| Deck | One local page where every question, walkthrough and sign-off waits as a thread; a reply typed there reaches the agent | `deck/`, ADR 0004 |
| Loopback, no secrets | Binds 127.0.0.1:4321 only; the store refuses anything shaped like a key or token | `deck/daemon.mjs:86`, `deck/store-core.mjs:85-125` |
| `pilot run` | Starts the pilot and types the `/clear` and first prompt at a hand-off, so a run resumes unattended | `deck/run.mjs` |
| Depth dial | The run's first question sets how hard you are grilled: every decision, only the forks, or none | ADR 0021, `skills/grilling` |
| Researched defaults | A question with a recommended answer is refused without its `Research:` line | `deck/question-shape.mjs`, ADR 0119, 0126 |
| Teach me | Press it on any decision and a teacher walks you through it until your explain-back holds | `agents/pilot-teacher.md`, ADR 0032 |
| Gates are presses | Gate 1 (the plan) and Gate 2 (the finished feature) pass only on your Sign off press | ADR 0057, 0064 |
| Tickets rail | Work queues as tickets: red planning, yellow implementing, green concluding | `deck/ui/render-rail.mjs:72-200` |
| Three lanes | A planning, an implementing and a concluding ticket run at once | `deck/lanes.mjs`, ADR 0151 |
| Co-pilot | Builds a signed ticket in the background, slice by slice, while the pilot plans the next | `agents/pilot-co-pilot.md`, ADR 0088 |
| Vertical slices | Each plan is cut into slices that work end to end, tests first, one fresh reviewer each | `skills/vertical-slicing`, `skills/tdd-workflow` |
| Fact sheet | Before an implementer reads, a Haiku helper lists every symbol and call site its slice names | `agents/pilot-fact-sheet.md` |
| Principles review | One Opus pass over the whole feature, subtraction first, backed by measured evidence | `agents/pilot-fundamentalist.md`, `agents/pilot-evidence-runner.md` |
| QA walkthrough | QA runs the feature where it runs and hands you a step-by-step look for taste | `agents/pilot-qa.md`, ADR 0090 |
| Landing from the deck | Signing Gate 2 lands the feature; `pilot landing` reports how it went | `deck/landing.mjs`, ADR 0111 |
| Permission refusal | A crew permission prompt never stalls a run: it is refused and posted as a blocked item | `hooks/permission-refuse.js`, ADR 0137 |
| Hand-off and recovery | A full context hands off to a fresh session; a crashed run recovers from its record | `scripts/handoff.mjs`, ADR 0059, 0144 |
| Run record and ADRs | The run's state lives in the deck and mirrors into the repo; decisions become ADRs | ADR 0028, `skills/architecture-decision-records` |
| Closing report | Each run ends with a report: slices, PRs, and friction ranked into "make agents cheaper here" | ADR 0036, 0146, 0148 |
| Audit | `/pilot:audit` measures what slows agents in a repo, every row with its command and output | `skills/audit`, `agents/pilot-auditor.md` |
| Analytics | `pilot analytics <slug>`: per-agent tokens, tool calls, time and cost | `deck/analytics.mjs` |
| Budgets | `pilot budget` caps agents per lane; models are chosen per role and per slice | `deck/budget.mjs`, ADR 0150 |
| Housekeeping | `pilot ps` / `pilot gc` find and stop orphans; `pilot worktrees prune` removes merged-clean ones | `deck/procs.mjs`, `scripts/worktrees.mjs` |
| Status line | Context, five-hour and weekly use in Claude Code's status line | `hooks/context-usage-statusline.js` |
| Scratch deck | `pilot deck --scratch`: an agent's throwaway deck for live checks | `deck/scratch.mjs` |
| Mechanisms over habits | A move agents keep re-deriving becomes a script, record or refusal | ADR 0141 |

### Seams

Deepening pass: `README.md` survives the deletion test (seven pin files and GitHub read it). A shared
`scripts/test/lib/readme.mjs` was rejected: one caller is a hypothetical seam, and the 30 other `section()` copies
are outside the request. `docs/OPERATING.md` takes the operator passages out of the README.

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `README.md` | its `##` headings in order (Install, Use, Features, How it fits together, Principles, Your part, Layout, Built on, Licence), the contents line, the hooks block, the one mermaid fence | – | in-process |
| `docs/OPERATING.md` (new) | `## Starting a run by hand`, `## Where run branches live`, `## Slow gates on Windows` | README's Use detail, `### Where run branches live`, the Defender passage | in-process |
| `scripts/test/readme-pitch.test.mjs` (new) | `paragraphs(text)`, `bullets(text)`, `section(text, heading)` over README.md | the shape rules of spec 1, 3, 4, 6 | in-process |
| `scripts/test/readme-flow.test.mjs` | `readFlow(text)`, gains `walkthrough(text)` | the graph's pins, and spec 5 | in-process |

## 4. Ubiquitous language

- **Hook**: one line on the first screen naming a new idea; three of them, above Install.
- **Pin**: a test asserting README wording; it moves with the wording, never goes.
- **Claim**: a README sentence stating a mechanism exists; each maps to a fact-sheet row.
- **Walkthrough** (here): the ≤ 11-line average run above the graph; not QA's walkthrough item.
- **Operator detail**: what a person needs after install; lives in `docs/OPERATING.md`.

## 5. Locked decisions

| # | Decision | Rationale and source | Rejected |
| --- | --- | --- | --- |
| L1 | Operator detail (Use's wrapper and environment, run branches, Defender) leaves the README for a new human-facing `docs/OPERATING.md`, linked once from the README and once from INSTALL.md's step 10 with the line that the installing session runs nothing in it. itm_f520e253fe50's runbook extends OPERATING.md. | The user: "dont talk for too long, keep them hooked … not large paragraphs". An admin command (`Add-MpPreference`) must never sit in a file an installing session executes (INSTALL.md:3-5). `main`, 2026-10-17. | Into INSTALL.md; kept in the README shortened. |
| L2 | The install stays one paste prompt (ADR 0002); its commands are kept verbatim and only its prose is shortened; the 6-line rationale becomes one line. No slice changes a command. | ADR 0002; the settings merge, rules copy and consent excerpt need an agent. `install.test.mjs` pins the shape. | A command list; a curl script. |
| L3 | The graph stays as drawn; the walkthrough is added above it in the same section, its steps naming graph nodes. | `readme-flow` built and pins the graph; the user asked for the walkthrough beside it, not a new graph. | Redrawing the graph; a second, smaller graph. |
| L4 | One new guard file pins the pitch's shape (paragraph length, bullet count, principle order, links, named commands and agents). | ADR 0082: a wording pin where the wording is the product; here the shape is the user's spec. `check-references` does not cover the README. | Reviewer judgement alone; extending `check-references` to `docs/`-like prose. |
| L5 | The claim table is S3's PR evidence (sentence, mechanism, path, holds/stale), not a committed file. | It is checked once against one tip; a committed copy goes stale. | A `docs/design/readme-pitch/claims.md`. |
| L6 | One run, one chain: every slice owns `README.md`. | Files owned are disjoint across parallel lanes; a README cannot be split by file. | Parallel slices merging hunks of one file. |
| L8 | QA reads the rendered README on GitHub's PR view and runs the install commands once in a temp directory; the commands stay verbatim from today's README, prose shortened only. | The user, itm_b2fc60c5d273: GitHub render + scratch install. | Render only; no QA of the install. |
| L7 | Grilling depth is *forks*: only a question that forks materially different READMEs goes to the user (A3, itm_0c953567335a); A1, A2, A4 and A5 stay assumed. | The user, itm_9446480b2afe. | Every decision; no grilling. |

## 6. Assumed decisions

- **A1 Layout and Built on stay at the bottom, shortened.** Default: Layout keeps a row per top-level directory (pinned)
  in one line each; Built on stays whole, as ADR 0011's attribution. Tradeoff: about 30 lines below the pitch that a
  newcomer skips. Rejected: dropping Layout to `docs/architecture.md`, which moves three pins and the "start here" read.
  Verdict: stands
- **A2 Each pin is rewritten in the slice that moves its wording.** Default: the house rule; the rule a pin guards
  stays. Tradeoff: each slice PR edits tests beside prose. Rejected: folding all README pins into one file first,
  a fold of about 200 lines over tests the request does not touch.
  Verdict: stands
- **A3 Which ideas open the README.** Taken: mechanisms first, the default. The three hooks are what a newcomer
  watches happen: (1) every question the agents have waits as a thread on a local web page and the reply in the browser
  reaches them while the run keeps going; (2) grilling to a depth you set, with researched defaults and Teach me; (3)
  the two presses only you make, Gate 1 and Gate 2 after QA’s walkthrough. The principles come further down, as the
  reasons. Tradeoff: the principles are not the opening. Rejected: the principles themselves as the hooks. Posted:
  itm_0c953567335a; the user first answered "Principles first", then on the pilot’s pushback "okay go with recommended".
  Verdict: stands
- **A4 "Beside" the graph is directly above it, in the same section.** Default: a numbered list above the fence.
  Tradeoff: on a wide screen it is above, not to the side. Rejected: an HTML two-column table, which GitHub's mermaid
  rendering does not support reliably inside a cell.
  Verdict: stands
- **A5 The README ends under 200 lines, the graph's ~90 included.** Default: about 60 lines of pitch, install, features
  and principles above the graph. Tradeoff: some current detail survives only in OPERATING.md and the ADRs. Rejected:
  no length target.
  Verdict: relaxed by the co-pilot at S3's seam (S3.md): about 60 lines of pitch above the graph, the 200-line ceiling not a gate; the README ends at 243 lines

## 7. Out of scope

- The operator runbook, `pilot doctor` as a preflight, `pilot uninstall` (itm_f520e253fe50).
- Redrawing the graph or changing what `readme-flow.test.mjs` requires of it.
- `deck/README.md`, `docs/architecture.md`, `CONTEXT.md`, the ADRs.
- Model or harness agnosticity itself: the README states it as intent only.

## 8. Slices

Width 1; longest stem 3 (S1 → S2 → S3). Every slice owns `README.md` (L6).

| # | Title | Spec | Files owned | After | Reviewers | Model | File |
|---|---|---|---|---|---|---|---|
| S1 | Skeleton: the pitch and the quick install open the README, operator detail in OPERATING.md | 1, 2, 7, 8, 9 | `README.md`, `docs/OPERATING.md` (new), `docs/INSTALL.md`, `scripts/test/readme-pitch.test.mjs` (new), `scripts/test/install.test.mjs`, `scripts/test/run-remote-readme.test.mjs`, `deck/test/doctor.test.mjs` | – | ts, security | opus | [S1](slices/S1.md) |
| S2 | The feature list and the principles, and the bottom of the page shortened | 3, 4, 6, 7, 8 | `README.md`, `scripts/test/readme-pitch.test.mjs`, `scripts/test/pilot-agents.test.mjs`, `scripts/test/install.test.mjs`, `scripts/test/deck-readme.test.mjs`, `scripts/test/pilot-rules.test.mjs` | S1 (README.md, readme-pitch.test.mjs, install.test.mjs) | ts | opus | [S2](slices/S2.md) |
| S3 | The walkthrough beside the graph, and every claim checked against the tip | 4, 5, 7, 8 | `README.md`, `scripts/test/readme-flow.test.mjs`, `scripts/test/readme-pitch.test.mjs` | S2 (README.md, readme-pitch.test.mjs) | ts | opus | [S3](slices/S3.md) |
| S4 | The vocabulary guard exempts this run's design docs (added) | 4 | `scripts/vocabulary.mjs` | – | ts | sonnet | [S4](slices/S4.md) |

## 9. Acceptance evidence

1. On GitHub's PR view of the README, the first screen shows the tagline and three hooks; nothing above Install runs past one line.
2. The Install section renders as one short paste prompt whose commands are today's, unchanged, and they run as written in a temp directory.
3. The feature list reads as ≥ 15 one-line bullets, newest ideas first.
4. Every claim holds: S3's claim table has no stale row; the guard and the vocabulary guard are green.
5. The walkthrough reads in under 12 lines directly above the rendered graph, each step a node in it.
6. The five principles read in order, then agnosticity as intent.
7. Each slice PR names Opus.
8. `docs/OPERATING.md` holds the run-branch and Defender detail, and INSTALL.md's step 10 says the session runs none of it.

## 10. Status

| Slice | State | Branch | PR | Worktree | Blockers | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 1, 2, 7, 8, 9 |
| S2 | planned | | | | S1 | 3, 4, 6, 7, 8 |
| S3 | planned | | | | S2 | 4, 5, 7, 8 |
| readme-pitch | planned | `feat/readme-pitch` | | | S1, S2, S3 | 1–9 |
