---
name: vertical-slicing
description: Cuts an agreed design into thin vertical slices — tickets that cross every layer a behaviour needs together (schema, service, API and UI in a web app; module, policy and pipeline in cloud configuration; loader, model and figure in research code) and produce visible progress — instead of horizontal layers built one at a time. Produces an ordered DAG of independently grabbable tickets, each in its own slice file naming its spec, blockers, owned files, interface, tests, expected behaviour, verification commands, required evidence, prohibited shortcuts and completion condition, and enforces a per-slice phase gate so each slice is proven green before the next begins. Use after a design is agreed and before implementation, whenever a plan or ticket list is being written for a multi-file change, when an existing plan reads as "phase 1 database, phase 2 API, phase 3 UI", or when the user says vertical slices, slice this up, break this down, or walking skeleton.
metadata:
  origin: hazzard
  tags: [planning, decomposition, tickets, tdd, orchestration, workflow]
---

# Vertical Slicing

A method for turning an agreed design into a ticket list that produces working
software at every step, rather than three layers of scaffolding and one anxious
integration at the end.

The practice is Matt Pocock's, taken from his published AI-coding workflow. The
failure it corrects is one models fall into by default: doing all of one layer
first, then all of the next — the database, then the API, then the front end;
the loaders, then the model, then the plots. That ordering
feels tidy and delays every piece of real feedback until the third phase, by
which point acting on it is expensive.

## Do Not Activate For

- Single-file changes, where the slice is the change.
- One-line fixes and typo corrections.
- A refactor with no behaviour change and no user-visible surface, where the
  verticality question has no honest answer by construction. Take it as one
  change through the phase gate instead.

## The verticality test

After this slice lands, what can a human do, see, or observe that they could not
before?

If that question has no answer, the slice is horizontal. Merge it into the slice
it serves, or re-cut the boundary until an answer exists. The answer does not
have to be impressive — "an admin can hit one endpoint and get back an empty
list that came from a real table" is a perfectly good answer — but it has to be
something a person could witness.

A ticket should produce visible progress through the system, not merely complete
one technical layer. Pocock's own example makes the contrast: "persist a draft,
retrieve it through the API, and prove the save-and-reopen flow" is a stronger
ticket than "Add the database."

Applied across kinds of work, with a web stack (Next.js, React, TypeScript,
Supabase and Postgres, API routes under `app/api/`) as the worked example:

| Horizontal tickets | The vertical slice that replaces them |
| --- | --- |
| Write the network module; write the IAM policies; add the deploy pipeline | **One service in staging answers a health check through the load balancer** — only the network, role and deploy step it needs, and one reviewed `terraform plan` |
| Write the allocator; write the page-table code; add the syscall | **A user program maps a page and reads back what it wrote** — the narrowest allocator path, one mapping, one syscall, one test under an emulator |
| Write every loader; implement the model; build the plots | **One figure regenerates from raw data with one command** — one loader, the baseline model, that plot, checked against the published number |
| Add the `drafts` table; build the drafts API; build the drafts UI | **A student can save a draft and reopen it** — one migration, one route under `app/api/drafts/`, one editor component, one test covering save-and-reopen |
| Add the `feedback_runs` schema; write the Gemini client; wire up the results page | **A teacher can submit one document and see a single returned comment** — the narrowest end-to-end path, one model call, one rendered comment |
| Add `role` to profiles; write the authorisation middleware; build the admin nav | **A non-admin is refused the admin page and an admin is let in** — the column, the guard, and one page that visibly proves the guard works both ways |

Each rewrite touches every layer and a test together, and each has an answer to
the verticality question a human can check: in a plan, under an emulator, in a
figure, in a browser.

## Anatomy of a slice

Every ticket names twelve things, and they live together in the ticket's own file,
`docs/design/<slug>/slices/S<n>.md`, so a brief passes a path instead of a pasted
section and `architecture.md` keeps only the slice list. Each field earns its
place by removing a decision the implementing agent would otherwise make badly
and silently.

| Field | Why it is there |
| --- | --- |
| **Source spec** | Points at the design or ADR section this slice implements, so the agent resolves ambiguity by reading the spec rather than inventing an answer. |
| **Dependencies** | Names the slices that must be green first, each with the file or seam it shares, which is what makes the list a DAG and lets a ticket be picked up independently. |
| **Reviewers** | A `Reviewers:` line under the header naming every reviewer the implementer spawns: the language reviewer, `pilot:database-reviewer` for SQL or a migration, and `pilot:security-reviewer` for a slice that hits the security trigger: auth, user input, secrets, an API boundary (a route, a hook input, a CLI argument), a process start, or agent configuration (`agents/`, `hooks/`, `skills/`, `settings*.json`, `.mcp.json`, `CLAUDE.md`). Gate 1 then shows who reviews each slice. |
| **Model** | A `Model: sonnet — <reason>` or `Model: opus — <reason>` line under the header: the implementer's model, chosen here so Gate 1 sees it and no brief re-derives it. Sonnet only for a **precise** slice: its Interface, Tests and Files owned leave no choice open, its estimated diff is within the small-diff limit, none of its spec lines is *assumed*, and it does not hit the security trigger above. Anything else is Opus. `check-slices` refuses a header without the line. |
| **Files owned** | One line per file, as `` `<path>`: <role, one line> `` (`(new)` marks a created file), so two slices running in parallel cannot collide and scope creep is visible as an unlisted file. |
| **Interface** | A fenced block with the seams this slice creates or changes — signatures, types, routes, CLI flags, hook payloads, or for a prompt file its headings and field names — as they stand after the slice, and the shapes crossing them, or a ubiquitous-language term that names one. |
| **Tests** | The implementer's red steps, in order, each as `` `<name>`: `<Interface symbol>` → <observable result> `` with the symbol in this slice's Interface block, then one `Rewrite check:` line: what stays true if the implementation behind the interface were replaced. `node "${CLAUDE_PLUGIN_ROOT}/scripts/check-slices.mjs" <path>` checks the shape. |
| **Expected behaviour** | States the observable outcome in user terms — the answer to the verticality question, written down so it can be checked rather than assumed. |
| **Verification commands** | Gives the exact commands whose output proves the slice works, so "done" is a command result rather than a feeling. |
| **Evidence required** | Says what must be produced and seen: test output, a command's output, a plan's diff, a plot, a screenshot, a browser flow exercised live. Evidence is what survives the agent forgetting. |
| **Prohibited shortcuts** | Names the specific cheats available in this slice — skipping a test, stubbing the client, loosening a type, deleting an assertion — because an agent under pressure will find them otherwise. |
| **Completion condition** | One sentence that is unambiguously true or false, so nobody negotiates about whether the slice is finished. |

A seam is stated once, in the slice that creates it. A later slice that reuses
it names it as `S<n>'s <symbol>` and reads the signature from the integration
branch instead of restating it — a restatement drifts on the first change to
the seam; a name by reference cannot.

A worked slice from the web example, filled in as its own `slices/S3.md`:

````markdown
# S3 A student can save a draft and reopen it

Feature `learnhub` · delivers spec 2, 4 · source: `../architecture.md` §2, §4 · after: S1 (the Supabase client), S2 (the signed-in session)
Reviewers: `pilot:typescript-reviewer`, `pilot:database-reviewer`, `pilot:security-reviewer`
Model: opus — the draft route takes user input and touches RLS, the security trigger.

## Files owned

- `supabase/migrations/20260905_drafts.sql` (new): the `drafts` table and its RLS policies.
- `app/api/drafts/route.ts` (new): reads and writes a draft scoped to the signed-in user.
- `app/(app)/editor/DraftEditor.tsx`: the editor that saves a draft and reopens it.
- `app/api/drafts/route.test.ts` (new): the pins.
- `e2e/draft-save-reopen.spec.ts` (new): the save-and-reopen browser flow.

## Interface

```
POST /api/drafts  { body: string } -> { id: string, updatedAt: string }
GET  /api/drafts  -> { id: string, body: string, updatedAt: string } | 404
DraftEditor(props: { draftId?: string }): JSX.Element
S2's session: the signed-in user both routes scope a draft to
```

## Tests

1. `a signed-in student's draft is scoped to their user_id under RLS`: `GET /api/drafts` → 404 for a second student.
2. `reloading the editor restores exactly what was typed`: `DraftEditor` → the saved body after a reload.

Rewrite check: replacing the `drafts` table with another store keeps both results above.

## Done

- **Expected**: a signed-in student types into the editor, the draft is written to `drafts` scoped by
  `user_id` under RLS, and reloading the page restores exactly what was typed. A second student cannot
  read it.
- **Verification**: `npx tsc --noEmit`; `npm run test -- app/api/drafts`; `npm run test:e2e -- draft-save-reopen`.
- **Evidence**: the RLS cross-user test failing before the policy is added and passing after; the
  save-and-reopen flow exercised in a real browser at localhost:3100, not only in unit tests.
- **Prohibited**: no service-role key on the request path to bypass RLS; no client-side-only persistence
  to make the test pass; no `any` on the draft payload type.
- **Done when**: type check, unit tests and the e2e spec are all green, and the reopen flow has been seen
  working in the browser.
````

## Sizing

A slice must fit inside the sharp zone of one context window; the budget and
what to do when a slice blows it are in `rules/vertical-execution.md`.

Two further sizing constraints:

- **One dominant risk per slice.** If a ticket carries both a schema-design risk
  and an unfamiliar-third-party-API risk, it is two tickets. When it fails you
  want one hypothesis to test, not two entangled ones.
- **Independently reviewable by someone who did not write it.** If explaining the
  diff requires walking a reviewer through three other in-flight slices, the
  boundary is in the wrong place.

## Ordering — the DAG

The first slice is the walking skeleton: the thinnest possible path that touches
every layer end to end and proves the architecture holds. It is allowed to do
almost nothing useful. A CLI that reads one real input and prints one computed
number, or a route that reads one hard-coded row from a real table through the
real client and renders it in a real page, has earned its place, because it
has proved the pieces connect — in the web case that the migration runs, the
client authenticates, the route resolves, and the component renders, four
assumptions that are cheap to fix now
and expensive to fix under five slices of dependent work. Every later slice
thickens the skeleton.

After that, dependencies are stated as explicit blockers on each slice rather
than implied by position. A slice with no unmet blockers is grabbable
immediately, which is what allows work to be picked up out of order and, later,
safely parallelised across agents.

Draw no line between two slices that share no file and no seam: a line that
only reflects the order you thought of them in serialises work that could run
at once. Each blocker carries its reason, the file or seam the two share, as
`after: S1 (<file or seam>), S2 (<file or seam>)`; `after: –` when there is
none. `check-slices` refuses a bare `S<n>`.

Order the ready set by risk. Where two slices are both unblocked, do the one
whose failure would invalidate more of the remaining plan.

## The phase gate

Only a slice that has passed the phase gate in `rules/vertical-execution.md`
lets the next one begin, so each slice's verification and evidence fields are
written to be that gate's inputs.

## Handoff

The input is an agreed design (under the pilot, the architecture artefact),
and this skill does not re-litigate it. The slice list is the DAG the human
approves at Gate 1.
