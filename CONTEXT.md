# Pilot

The pilot is an orchestration package for Claude Code: one main session interviews the user and holds the gates while a small crew of agents designs, implements and reviews a feature of any kind of software slice by slice and QAs it whole. This context covers the package and its deck.

## Language

### The run

**Pilot**:
The main Claude Code session the user talks to. It grills, holds the queue and the gates, and spawns the crew.
_Avoid_: Orchestrator, main agent, controller

**Crew**:
The agents the pilot spawns: explorer, architect, implementer, fundamentalist, QA, teacher, auditor.
_Avoid_: Subagents, workers, team

**Run**:
One piloted feature, identified by repository path plus slug. Several runs can be live at once.
_Avoid_: Session, job, project

**Spec**:
The numbered behaviours a feature must deliver, each with the evidence that shows it done, agreed with the user before any design question and carried in the artefact.
_Avoid_: Requirements, PRD, acceptance criteria, user stories

**Slice**:
One vertical cut of a design that a user can exercise end to end, implemented as one draft PR against the integration branch and merged there by the pilot; it is never marked ready.
_Avoid_: Ticket, ticket, step

**Integration branch**:
`feat/<slug>`, the branch every slice PR targets and the head of the one feature PR, which lands on `pilot` at the Gate 2 Sign off press.
_Avoid_: Feature branch, trunk, release branch

**Pilot branch**:
`pilot`, the one branch per repository the pilot owns and treats as its default; every run is cut from it and every finished run lands on it.
_Avoid_: Trunk, develop, staging

**Base**:
The ref a run is cut from and keeps taking: the pilot branch, always.
_Avoid_: Parent branch, upstream, target

**Take the base**:
Merge the base's current tip into the integration branch with a merge commit, inside `pilot integrate`.
_Avoid_: Sync, rebase, update the branch

**Land**:
Fast-forward the pilot branch to a feature's tip after taking the pilot tip into it, at Gate 2, with `pilot land`; the only way work reaches the pilot branch.
_Avoid_: Merge, ship, release

**Sync**:
Merge the default branch into the pilot branch with `pilot sync`; the only way the default branch's work reaches the pilot branch.
_Avoid_: Take the base, rebase, pull

**Promote**:
Merge the one main PR, `pilot` → the default branch, with a merge commit; the user's act, never the pilot's.
_Avoid_: Release, ship, land

**Open run**:
A run of this directory whose feature PR is open, draft or ready.
_Avoid_: Active run, live run

**Fix round**:
The pilot's verdict on a principles review, and the fresh implementer that lands the kept findings on the same branch.
_Avoid_: Rework, follow-up, patch

**Procedure**:
The QA agent's walkthrough item for the whole feature, the user's ticket before Gate 2: a look for taste at what QA left running, UI first, with its machine checks in a table under the steps.
_Avoid_: Test plan, checklist, script

**Artefact**:
The architecture document for a run: spec, design, locked and assumed decisions, slice DAG, verdicts, status table.
_Avoid_: Plan, PRD

**Slice file**:
`docs/design/<slug>/slices/S<n>.md`, holding one slice's fields beside the artefact, which keeps the slice list; a brief passes its path.
_Avoid_: Slice section, ticket

**Interface block**:
The fenced block in a slice file holding the seams that slice creates or changes, as they stand after it: declarations, types and one-line comments only.
_Avoid_: Contract, pseudo-code

**Owning slice**:
The one slice whose Interface block states a seam; a later slice names it as `S<n>'s <symbol>`.
_Avoid_: Defining slice, source slice

**Seam change**:
An implementer's request to alter an Interface block, sent to `main` as the replacement block; the pilot decides it and edits the owning slice file.
_Avoid_: Interface drift, signature tweak

**Red steps**:
The slice file's Tests names, in order; each fails before the implementer writes the code it pins.
_Avoid_: Test plan, test list

**Gate 1**:
The user approving the artefact, on the pilot's `gate1` thread.
_Avoid_: Plan approval, sign-off

**Gate 2**:
The user pressing Sign off on the whole feature, running where it is meant to run, after the procedure, on the pilot's `gate2` thread citing the signed walkthrough when there is one.
_Avoid_: Acceptance, QA pass

### The deck

**Deck**:
The one long-lived local process per machine and its browser view on a fixed port. It is the only inbox.
_Avoid_: UI, dashboard, queue UI, MCP

**Item**:
One thing needing the user, optionally attached to a slice. Its kind is an open string: question, walkthrough, signoff and the gate kinds `gate1` and `gate2` each render their own way; a `signoff` is never a gate, and any other kind renders plainly and is never the user's next action.
_Avoid_: Ticket, todo, ticket, message

**Thread**:
The ordered messages inside an item. The pilot posts, the user replies, the pilot may push back, the pilot resolves.
_Avoid_: Conversation, comments

**Yours**:
The status-table column naming the user's next action for a slice, rendered from that slice's open item.
_Avoid_: Action, todo

**Store**:
The deck's JSON on disk under `~/.claude/pilot/`. The daemon is its only writer.
_Avoid_: Database, state file

**Deck number**:
`D‹n›`, minted once for a working-directory path from a monotonic counter in the store and never reused; the canonical address of a deck, so "S2 in D4" names a slice.
_Avoid_: Run id, tab index

**Roster**:
The agents live for a deck, observed from their tool calls by the context guard hook and held in the daemon's memory; live means a tool call within the liveness window.
_Avoid_: Agent list, registry, process table

**Delivery**:
The moment `deck_wait` gives the user's reply to the session that asked, recorded on the reply as `deliveredAt`.
_Avoid_: Hand-off (that is the context sense)

**Hand-off**:
A crew agent stashing its work and returning at the context guard's hard threshold so a fresh agent finishes the slice; never the deck's delivery of a reply.
_Avoid_: Delivery, handover, checkpoint

**Ticket**:
A deck item of kind `ticket`: a spec-shaped text (title and body) the user has agreed to, stored on a directory's deck until a run takes it as its argument. Read-only on the tab, oldest first, the head marked next.
_Avoid_: Queue entry, job, backlog item

**Ticket state**:
A ticket's colour on the deck, written by the store alone: red is planning (posted, or live and being grilled, up to Gate 1), yellow is implementing (the co-pilot's lane), green is concluding (from `need` to the closing report). Red before green, as in red/green TDD (ADR 0147).

**Stage**:
Planning, implementing or concluding: a ticket's state, called by its word. The prose says the stage and leaves the colour implied (ADR 0151).
_Avoid_: Phase, colour (in prose)

**Lane**:
What holds one ticket of a stage: `planning` and `concluding` are the main deck's, one live ticket each, and `co-pilot` is the co-pilot's (ADR 0151).
_Avoid_: Slot, main lane

**Held lane**:
A lane with a live ticket, or for `co-pilot` a live co-pilot's ticket. The Status tab's selector lists these.
_Avoid_: Busy lane, open lane

**Chain hand-off**:
The `handoff` item the daemon posts when a run's record finishes with "closing report posted" and a ticket is open; `pilot run` types `/clear` on it and the fresh session starts the head ticket. Never a headless session.
_Avoid_: Launch, spawn, auto-start

**Main deck**:
The pilot session in a repository's own checkout: it carries a ticket through planning to Gate 1 and one through concluding, one live in each of its lanes, and never takes an implementing ticket.
_Avoid_: Mode, primary session

**Co-pilot**:
The subagent (`pilot-co-pilot`) the main session spawns to carry one implementing ticket through steps 4 to 8; one per main session at a time.
_Avoid_: Builder, sub-deck, worker

**Yellow lane**:
The `co-pilot` lane's agents: the co-pilot and its children, three levels below the main session, holding the `yellow` half of the budget.
_Avoid_: Sub-deck, holder, background session

**Report**:
A deck item of kind `report`: a run's closing report, listed in its own section and left open after the session moves on so the user can reply to it later.
_Avoid_: Summary, closing item, walkthrough, Audit report

**Standing kind**:
An item kind (`ticket`, `report`) that is never the user's next action: shown in its own section, never in the waiting list, never holding a turn at the Stop gate.
_Avoid_: Passive item, note

### The audit

**Audit**:
One on-demand pass over one repository producing one audit report. Never per run, never a fix.
_Avoid_: Friction section, health check

**Auditor**:
`pilot-auditor`, the Opus agent that runs the audit, measures in the scratch worktree and judges.
_Avoid_: Explorer, reviewer

**Scratch worktree**:
The detached worktree outside the repository the auditor measures in and removes.
_Avoid_: Slice worktree, sandbox

**Area**:
One measured concern, briefed by a file in `skills/audit/areas/`; `open` is the auditor's area for what no named area covers.
_Avoid_: Category, check

**Row**:
One finding with the command that measured it and its output, saving per run, fix, effort and spec text.
_Avoid_: Issue, item

**Audit report**:
The ranked rows plus cost and what went unmeasured, saved in the deck store and posted as one `audit` item that waits for picks.
_Avoid_: Report

**Offer**:
The `question` beside the depth question asking whether to run the audit: on a repository's first piloted run, then every tenth counted run. Never an audit started unasked.
_Avoid_: Prompt, nag

**Pick**:
The user's typed reply of row ids on an audit report; the only words that post a `ticket` from it.
_Avoid_: Selection, approval

### Run analytics

**Transcript**:
One JSONL file under `~/.claude/projects`, a session's or a subagent's. Read for numbers, never for text.
_Avoid_: Log, history

**Counted message**:
One `message.id`, however many entries it was streamed across. Tokens are counted once per counted message.
_Avoid_: Entry, line

**Agent usage**:
One `agentId`'s counted messages across every session of the run, with its role, model, tool calls and duration.
_Avoid_: Agent file, session usage

**Bucket**:
Where an agent usage is counted: a slice, `design`, `feature`, `pilot` or `unattributed`.
_Avoid_: Group, category

**Needle**:
A slice's branch or worktree from the run record, looked for in an agent's brief to choose its bucket.
_Avoid_: Pattern, keyword

**Price table**:
Dollars per million tokens by model and token kind: the shipped defaults, overridden per model by the user's file. It gives an API-equivalent cost, never a bill.
_Avoid_: Rates, billing

### Usage telemetry

**Usage log**:
`usage.jsonl` in the deck's store: append-only, one line per half-hour window, written by the daemon.
_Avoid_: Telemetry file, metrics, history

**Window**:
The half-open interval `[from, to)` a line's tokens were counted over.
_Avoid_: Period, bucket, tick

**Snapshot**:
The status line's usage state as read when a line is written, dated by that file's modification time.
_Avoid_: Reading, status

**Logging switch**:
The file `pilot logging on|off` writes and every log the deck keeps reads. Off means nothing is recorded, then or afterwards.
_Avoid_: Flag, setting, opt-out

**Measured spend**:
A repository's summed tokens over a period of the usage log.
_Avoid_: Cost, usage, budget

**Closing report data**:
The `report` field of a run record in the deck's store. The Markdown item is the closing report itself.
_Avoid_: Report file, summary

### The package

**Toolbox**:
The vendored single-purpose reviewers and skills the crew loads. Never orchestration.
_Avoid_: Library, plugins, dependencies

**Vendored file**:
A file copied from ECC or mattpocock-skills, carrying a provenance header and a row in `VENDOR.md`, marked verbatim or adapted.
_Avoid_: Dependency, import, fork

**Re-sync**:
The manual act of comparing vendored files with upstream and choosing what to take.
_Avoid_: Update, upgrade, pull

**Install prompt**:
The text a friend pastes into Claude Code to install the package; Claude does the rest.
_Avoid_: Setup script, installer, bootstrap
