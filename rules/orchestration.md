# Orchestration: the main session directs, agents implement

How work is split between you, when you are the main Claude Code session, and the
agents you launch. The two failure modes are opposite and both cost money: a main
session that writes every implementation burns its own context on mechanical work,
and one that spawns freely burns the account's rate limit and leaves half-finished
agents with no output.

For feature-sized work the shape is fixed in the pilot's definition
(`${CLAUDE_PLUGIN_ROOT}/agents/pilot.md`, started with `pilot run`) and
its crew agents carry the standing rules. This file is the law those files assume,
and it applies unchanged to any smaller piece of work that needs more than one agent.

## The split

As the **main session you are a system-level orchestrator**. You:

- clarify scope with the user (the `grilling` skill, or a plain question),
  independent questions together and one at a time only where one answer would
  change another question, never a numbered batch,
- decide what each workstream is and which branch it lands on,
- launch one implementing agent per workstream with a brief that carries the facts
  of the ticket,
- hold the question queue: every agent question comes to you, and you answer what
  you can, ask the user what is theirs, and relay,
- spot-check an agent's safety-critical claims against the code before relaying them
  (fail-closed paths, grants, invariants, byte-identity),
- relay the outcome and the human steps.

Past a handful of tool calls your default is to delegate; a couple of reads and a
small edit you still do directly. When delegating would cost more than it returns,
say so plainly and carry on directly. Going solo *silently* is what is not
acceptable: state the reasoning either way.

As an **implementing agent you own the whole slice loop for your workstream**: plan,
vertical slices, tests first, implement, gate, one fresh review per slice, commit,
push the branch, a report per slice. You may load this package's skills and spawn
children for review and exploration.

**Both human gates survive delegation.** `vertical-execution.md` defines them, and
you hold them as the orchestrator, because an agent cannot ask the user anything.
Gate 1 is signed off before you write the brief, since the brief *is* the approved
plan. For Gate 2 the
agent stops with its work pushed on its branch, and you bring the
result to the user before anything is landed. A brief that lets a
workstream merge on the agent's own say-so has skipped a gate the user asked for.

## Agents cannot ask the user

An agent's conversation is not where the user is. Send every question, decision
request, blocked command and Sign off request to `main` with `SendMessage`, and keep
working on what does not depend on the answer. A decision you made alone goes in your
report as *assumed*. `main` queues what is the user's and relays each answer back.

A piloted architect posts its questions and the gate1 on the deck itself: the deck is
where the user is.

## Concurrency: the middle ground

Parallelism is welcome; the user would rather several agents ran at once than wait
on a queue. The middle ground is a ceiling on count and a rule about shape.

- **Up to thirteen agents in flight**, counting the main session and every child of
  every agent. Above that the rate limit binds and everything dies at once. It is
  the ceiling, not the target: count before you spawn. Spawns run in the background;
  never wait on one, act on its completion notification. It rose from eight on
  2026-10-11 (bigger-jobs), when the user asked for bigger jobs and more children.
  It rose to thirteen on 2026-10-18 (lander): a lander runs beside the co-pilot, and
  the main session's share went from four to five to hold it.
- **Parallel across workstreams, not over one diff.** Slices with disjoint owned
  files, the review or fix round of one slice beside the next slice's
  implementation, read-only research fanned out by an architect: welcome. Four
  reviewers on one diff, or a reviewer per file: never. The cure for the 2026-09-05
  review fan-out is one reviewer per slice, chosen by language, with a second only
  when the slice touches auth, user input or SQL.
- **Per-agent child budgets.** An architect holds up to six researchers; an
  implementer up to five children; a QA agent up to three; an explorer none and
  a fundamentalist one, its evidence runner. A co-pilot holds the implementer, the fundamentalist, QA and
  the reviewers, all within the `yellow` half of `pilot budget`, itself
  included. Helpers do not spawn. The type list inside the main
  session's `Agent(...)` is inherited by every agent it spawns, so a type that list
  omits cannot be reached by any child; the main session lists every agent the crew
  names, and a crew agent's own permitted children are named in its prose.
- **Nesting is two levels below the main session, three on the yellow lane: main,
  co-pilot, role agent, helper** at most; elsewhere orchestrator, role agent,
  helper.
- **Pick the model per job, not per habit.** Fable for the pilot; Opus where a
  wrong judgement is expensive (architect, implementer, QA, the fundamentalist's
  pass over the whole feature), Sonnet 5.5 for an implementer slice that is
  precise, as its `Model:` line says, and for reviewers and explorers, Haiku for
  pure fan-out (greps, candidate finding, moving files) and the two helpers, the
  fact sheet and the evidence runner. Say in the brief which model you chose and why.
- **Opus goes on tangents.** Every brief to an Opus agent carries scope discipline:
  one probe per claim, gates run once on the final state, the minimal fix, a
  small-diff limit past which the agent stops and asks `main`, and tables not
  narrative in the report.
- Prefer a skill over an agent whenever both would do; a skill runs in the caller's
  context and costs nothing until invoked.

The user's calibration, on 2026-09-06: "I like high autonomy and a parallel agents,
i just limited us earlier today because we went a bit overboard. I think we need to
find a middleground."

## Reports are decided, not forwarded

The fundamentalist, and the QA agent until the user's procedure is posted, are
readers: they report to the main session and change nothing. The main session decides
what each finding is worth — checked against the diff, its consequence weighed
against the diff its fix costs, a removal preferred to an addition at equal
consequence — and a fresh implementer with a fix brief makes the change on the same
branch. Neither the reviewer that found it nor the session that judged it writes the
fix, and no finding reaches a fixer unjudged. The one exception is the end of a
piloted run, where the QA agent is the integration branch's only writer for what its
walkthrough and the user's find.

## Agent briefs

Standing rules belong in the agent's definition, not in the brief; a brief that
restates them hides the ticket facts. What a brief carries: the repository and base
branch, the exact worktree and branch to create (never the shared checkout, never
another session's worktree), the findings or decisions with file:line anchors or the
artefact section verbatim, the slices in order with their verification, the gates
(the project's own checks, with any known pre-existing failure named, and migrations
applied to the agreed development database), the commit trailer, the push and PR
instructions, the environment, seed data and logins, the model and why, and the
shape of the report wanted back.

**Ask for large reads one at a time.** A context reading only exists between turns,
so an agent that emits a dozen `Read` calls in one message can go from a third full
to over its window with nothing observable in between, and is dropped mid-slice
having stashed nothing.

**Name the live-verification gate explicitly whenever the slice has a surface
someone uses**: a GUI or a web page opened, a CLI run, a config applied to a
cluster, a binary on its device, a notebook executed, a plot, picture, video or game
looked at. A brief that lists only typecheck, lint, build and tests reads as a
complete gate list, and the agent never runs the thing. If the agent cannot reach
that environment, say so in the brief and do that verification yourself.

## Verification stays with the orchestrator

An agent's report is evidence, not a verdict. Before you tell the user something is
done, check the claims that would hurt if wrong and say which you checked. If a
report contradicts the code, the code wins.
