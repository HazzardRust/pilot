---
name: ticket-making
description: How the pilot cuts a list of jobs into queued tickets on the deck. One ticket is one run; a ticket is posted planning with a slice count, the cut goes to the user as one proposal table with a slice count and a queue position per row, nothing is posted before the user's yes, and the architect merges same-surface planning tickets into the live one before it designs. Use in a thread titled `Add`, or in any thread where agreed work is about to become tickets.
metadata:
  origin: hazzard
  aimed-at: Fable
  tags: [tickets, queue, deck, slices, planning]
---

# Making tickets

A ticket is a queued piece of work the chain starts as a run of its own. This skill is how a
list of jobs becomes those tickets: cut, checked, estimated, proposed, agreed, then posted
in the agreed order.

## When

- A thread titled `Add`: the Tickets tab's **Add** button opens it, a `user` thread that is
  yours. You answer it yourself, never through an explorer. In an `Add` thread a queued
  ticket also gains spec lines as a comment on it (`deck_reply`), or is closed
  (`deck_resolve`) on the user's word when they remove it.
- Any other thread where work the user has agreed is about to become tickets.

Answer in the thread with `deck_reply`. Ask what you need to cut the list the way grilling
asks: independent questions together, one at a time only where one answer would change
another, never a numbered round.

## One ticket is one run

**One ticket is one run**: the chain takes it live for one run, ending at its own Gate 2, so
the user signs each ticket off whole. Aim big: each ticket costs a grilling, a Gate 1, a QA pass
and a Gate 2 whatever its size, so a ticket of one or two slices pays all four for little work.

- **Jobs on the same surface merge**, however many there are. Two jobs that would touch
  the same screen, module or files are cheaper as one run than as two that rebase on each
  other. Case: ticket A of the worked example, five deck-UI jobs on the same files and one
  QA pass.
- **A job goes into a ticket of its own only when its surface is completely different**: a
  screen, module or files no other job touches. Case: ticket B, thread types, which changes
  how every agent posts.
- **Work that starts with third-party code or a credential stands alone.** Its first step
  is the user's (an account, a key, a vendored upstream), and a run that waits on it should
  not hold other work up. Case: ticket D, which starts by inspecting a third-party repository.

## States

The deck stores a ticket's state and is its only writer; the Tickets tab shows one queue per
state, in queue order, and marks each stage's live ticket; the colours are ADR 0147's.

- **red**: planning. Posted, or taken live and being grilled; the user is here.
  Everything in this skill happens to planning tickets.
- **yellow**: implementing. Its Gate 1 is signed and its plan is on the row; it is implemented
  while the user is away.
- **green**: concluding. The pilot's `need` made it concluding; the walkthrough, any questions
  it queued and then its `gate2` wait for the user.
- **closed**: its closing report is posted, or it was merged into another ticket. It leaves
  the tab.

## Estimates

Every ticket carries one size, its slice count, shown on its row.

- **The slice count** is yours, on every post: the slices you expect the ticket to take,
  aimed at 20 slices. 20 is an aim, never a refusal: the deck refuses a ticket without a
  count, never one over it. Once Gate 1 is signed the row shows the approved plan's count.
- **A job past the aim** is still one ticket: the architect cuts one run unless the user
  asks for a split at Gate 1, each later run a ticket of its own. Do not split it here.

## Check first

Before the table, run `pilot tickets --open`: every open ticket of this directory, planning,
implementing and concluding, with its body, and each unmerged feature PR with the files it changes.
Read each row's jobs against it; what you find goes in Found. On exit 1 Found is
unknown: say so in the thread, never `nothing found`.

## The proposal

Post the whole cut as a `question` of its own, options Yes and Change, with `proposal: true` and no `ticket`, its body naming the
source thread and carrying one table, one row per ticket. The flag holds no gate, so it is only for a ticket proposal the user has not
adopted, never for a decision a run stands on. Never a chat reply, and never on a thread closed or closing in the same turn: the user
cannot miss a question, and closing the source thread leaves the proposal open:

| # | Ticket | Holds | Why together | Found | Estimate | Position |
|---|---|---|---|---|---|---|

- **Holds**: which of the user's jobs the ticket carries.
- **Why together**: the rule from One ticket is one run that joined them, or why it stands
  alone; a row past the aim says why here.
- **Found**: `merge into <ticket>` for a queued planning ticket it belongs in (Merging item 1),
  `drop: in #N` or `drop: in <ticket>` when an unmerged PR or an implementing or concluding ticket already
  holds it, else `nothing found`.
- **Estimate**: the ticket's size in slices, as Estimates says.
- **Position**: where it sits in this repository's planning queue, against the tickets already
  there (`head`, `after <ticket>`, `tail`).

Re-cut first: a row of one or two slices is merged into a same-surface row before the table
goes up, unless no row shares its surface or it starts with third-party code or a credential
and so stands alone. Nothing is posted before the user's yes. Not a ticket to show the format,
not the rows they agreed while others are still argued. A change to a row gets a revised
table, not a post. Case: the pilot posted nine tickets straight away and withdrew them; the
user: "no i want you to confirm with me before making the tickets".

## The body

Each ticket's body, in this order; the deck refuses a `ticket` out of this shape and names
what is missing:

1. The user's own words for the job, quoted on `>` lines.
2. Numbered spec lines, each with its evidence in italics on the number's own line: what
   the ticket must do, and *what shows it did it*.
3. The proposal item's id when the ticket came from one, else the thread's id (`itm_…`).

A run-split ticket passes by naming its approved `docs/design/<slug>/architecture.md`, and
an audit pick by naming its saved report's path, which `pilot audit spec` appends.

## Posting

After the yes, one `deck_post` of kind `ticket` per agreed ticket, titled with its name, in
the table's order; every `deck_post` carries `sliceCount`, the row's Estimate. Each post
lands planning at the tail of its repository's queue. Then move each to its agreed position
with `deck_ticket` `up` or `down`, one place a call, as the arrows on the Tickets tab do. Read
the Tickets tab's order back against the table's Position column before you say it is done.

## Merging

A job agreed in any thread merges, in this order:

1. **Into a queued ticket** it belongs to, while you are cutting: a `deck_reply` on that
   ticket; never edit its body. A ticket's comments travel with its chained hand-off, after
   the body, so the session that takes it reads them.
2. **Into the live planning ticket**: the architect's first act, `${CLAUDE_PLUGIN_ROOT}/agents/pilot-architect.md`, "Merge first".
3. **Into a new ticket** only when no queued ticket fits: proposed and posted as above.

## Worked example

The thread this skill was drawn from (itm_d2f9ed260436). The user listed nine jobs; the
pilot's restated table read them:

| Job | Pilot's read |
|---|---|
| 1. Remove button becomes Close; confirmation says "close deck" | short |
| 2. A pressed choice stays shown as pressed, on the thread and its card, until the thread closes | short |
| 3. Thread types: a fixed set, each with its own buttons and common fields; handoff gets "handoff failed" / "reply" | feature |
| 4. Fundamentalist is adversarial | short |
| 5. Less verbosity and step narration from every agent, depth scaling with risk | medium |
| 6. Chat tab: tables render; the view stops jumping to the bottom | short |
| 7. Security reviewer works and is called automatically; fundamentalist told to consider it | medium |
| 8. A "+" tab adds a deck by file path | short |
| 9. Closing reports tab: an "x" per item | short |

The cut into four the user agreed ("yep this looks good"); columns that round lacked are
*asked*, what this skill has the pilot ask or check before the yes. As five tickets, short jobs
1, 2, 6, 8 and 9 would cost five grillings, five Gate 1s, five QA passes and five Gate 2s.

| # | Ticket | Holds | Why together | Found | Estimate | Position |
|---|---|---|---|---|---|---|
| A | Deck polish | jobs 1, 2, 6, 8, 9 | all deck UI, same files, one QA pass | *asked* | *asked* | *asked* |
| B | Thread types | job 3, the schema with the handoff buttons | a completely different surface: how every agent posts | *asked* | *asked* | *asked* |
| C | Crew voice | jobs 4, 5 | both are edits to the agent definitions | *asked* | *asked* | *asked* |
| D | Security reviewer | job 7 | starts with inspecting a third-party repository, so it stands alone | *asked* | *asked* | *asked* |

Each of the four bodies quotes the user's words for its jobs, then spec lines with their
evidence, then names the proposal item (`itm_3f9a1c07b2d4`) as its thread. Had ticket A been queued when job 6 arrived, job 6 would have gone in by reply;
had A been live and planning, a planning ticket holding job 6 would have merged into it.
