---
status: accepted
date: 2026-10-04
tags: [crew]
supersedes: []
superseded_by: []
paths: [deck/wait.mjs, docs/design/crew-waits/architecture.md]
---
# A crew agent waits in a background shell, and a wait takes what it prints

This extends ADR 0041's owner kinds and relies on ADR 0045's owner fallback. In the ticket-states runs a crew agent parked inside `deck_wait` could not hear the pilot: a `SendMessage` is delivered only between an agent's tool calls, so the pilot's messages queued for up to 55 minutes, and stopping the agent killed its scratch deck. Separately, `pilot wait` marked nothing delivered (`deck/wait.mjs`: "mark nothing until a real turn reads it") and matched on a seq baseline, so every wait in a directory printed the same reply and no reply could show who had it. The user asked for crew agents to wait the way the pilot does. So we decided there is one wait, and it takes what it prints.

- **A crew agent waits by starting `pilot wait --as <kind>` with `run_in_background` and ending its turn (L9).** A live probe on 2026-10-04 showed both halves: a `SendMessage` to an agent parked that way answers "Resuming agent <id>" and the agent acts at once with its shell still running, and the shell's exit resumes the agent through its own background-shell notification. No crew file tells its agent to wait inside `deck_wait`.
- **A wait takes what it prints (L3).** `pilot wait` becomes a client of the daemon's `deck_wait` long poll, and the daemon marks the reply `deliveredTo` the wait's kind in the call that returns it. A later wait of that kind is never handed that reply. The walkthrough Sign off is still taken once by QA and once by the pilot, by the existing two-recipient rule. This supersedes `wait.mjs`'s "mark nothing until a real turn reads it", and ADR 0045's description of `pilot wait` as a 2 s poll.
- **`--item <id>` narrows a wait to one thread (L4).** The teacher waits on its lesson and the auditor on its audit item, so two live lessons never take each other's replies.
- **The kind is a flag the agent types (L14).** No hook stamps it. Any loopback caller can already name any author over HTTP, so the flag is no weaker than what exists.
- **`untaken` and `item` are declared arguments of `deck_wait` (L6), and `deck_wait` leaves the frontmatter of the pilot, QA, the teacher and the auditor (L5).** The tool stays for plain sessions and skills.
- **The teacher gets Bash, limited by prose to `pilot wait` (L12).**

Rejected:
- A pilot message waking a parked `deck_wait`: a second mechanism beside the one the pilot already uses; withdrawn by the user.
- The pilot's wait taking crew threads' replies and resuming each owner by `SendMessage`: pilot context on every reply.
- Keeping the delivery mark at the next `deck_read`: the two-waits case stays unsolved and the seen mark arrives late.
- One wait per kind per directory, a newer one superseding the older: it breaks two concurrent lessons.
- A PreToolUse hook on Bash that rewrites `pilot wait` with the real agent type: unforgeable and cheap (about 42 ms a call, no context tokens), but it fails open, and a hook rewriting a Bash command is unverified. A fair later ticket.
- A new `/api/wait` route: a second wait implementation beside `runTool`.

**Consequences**:
- A reply printed to a session that then dies is marked seen with no reader. On a crew thread the 5-minute owner fallback hands it to the pilot; on the pilot's own thread the session is the run, and its death is ADR 0059's recovery.
- The "Seen by <kinds>" mark under a reply is drawn from the stored `deliveredTo`; nothing new is stored.
- An agent that types the wrong kind takes another kind's replies. The crew files name the kind, and a test pins each.
- The teacher holds a shell its prose, not its tool list, limits.
- A stray wait is harmless rather than reaped: it cannot print a reply another wait of its kind took.

Recorded in `docs/design/crew-waits/architecture.md` (§5 L3–L6, L9, L12, L14); deck threads itm_9ff19d0cd2b1, itm_501abddaff23, itm_11eefabe4039.
