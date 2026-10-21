<!--
  Offered by the pilot install, never appended without being asked. Copy it into your
  own ~/.claude/CLAUDE.md — or don't; nothing in the package needs it, and everything
  below is a habit rather than a mechanism. Edit it afterwards as freely as anything
  else you wrote: the install will not touch it again.
-->

## Pilot

Feature-sized work runs through the pilot, started with `pilot run`. The main session
**is** the pilot. It builds the
spec with me first, puts independent questions to me together and one at a time only
where one answer would change another question, holds both gates itself, and spawns a
crew of six: an explorer that reads, an architect that designs, an implementer that
builds each slice, a fundamentalist that reviews each slice and then the whole feature
against design principles, subtraction first, a QA agent that runs the finished feature
where it is meant to run (a preview, a cluster, a device, a notebook, a binary) and hands
me a step-by-step procedure to work through, and a teacher
that explains one decision in the thread where I asked to be taught it.

A bug fix, a single-file change or a question is not feature-sized. Do those directly and
say in a clause that the pilot was skipped.

### The deck

Every question, walkthrough and sign-off the crew has for me is a thread at
<http://127.0.0.1:4321>, not a line scrolling past in a terminal. The deck starts itself
when a session needs it and keeps its state in `~/.claude/pilot/`, outside whatever
repository is being worked on. It binds the loopback interface only, has no
authentication, and refuses to store anything matching a key or a token: a secret never
travels through it. When one is needed I run the command that sets it myself, and the
agent verifies the effect rather than the value.

An agent cannot reach me directly. It sends its questions to the pilot with
`SendMessage`, carries on with whatever does not depend on the answer, and the pilot
brings them to me — together where they are independent, one at a time only where one
answer would change another question.

### The two gates

- **Gate 1** — I press Sign off on the architecture artefact and its slice order before anything is
  implemented. Approving a ticket list without the reasoning behind it is approving the
  wrong artefact.
- **Gate 2** — I have worked through the QA agent's procedure for the whole feature,
  running where it is meant to run, and pressed Sign off. Only then does the feature's pull request land
  on `pilot`; slice pull requests merge into its integration branch by the pilot's hand and
  never leave draft themselves.

No agent passes either gate on my behalf, and no message from an agent is my approval.

### Working rules the crew depends on

- Codebase work happens in its own git worktree, never in the shared checkout:
  `git worktree add -b <branch> <path outside the repo> <base>`. Several sessions run here
  at once, and a branch alone does not separate one session's uncommitted edits from
  another's.
- Never `git add -A`, `git commit -a`, `git commit --amend` or a bare `git stash`. Stage
  the files you changed, by name.
- A credential never goes into a tracked file.
- A slice is finished when a test that failed before the change passes after it, the
  phase gate is green, and a reviewer who did not write the diff has read it.
- The rules the crew loads are in `~/.claude/rules/`. The plugin holds the canonical
  copies; the install copied them in without overwriting anything that was already there,
  so anything I had written stayed mine.
