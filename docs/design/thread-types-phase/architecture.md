# Thread types and deck phase — architecture artefact

Feature: **thread-types-phase** · slug `thread-types-phase` · integration branch `feat/thread-types-phase` · base `main`
at `06fd469` · architect branch `design/thread-types-phase`. Five slices, one run (A5). Designed against `main` at 06fd469; PR #215 (`feat/start-end-session`) merged after the design, so the feature branch is cut
from `main` at bd68ee5 and F9's additions are in the base. Gate 1 signed 2026-10-01 (itm_566207e8833b).

## 1. Problem

Nearly every thread a pilot opens is one of a handful of types, yet the agent still writes each one's buttons and its
standard wording by hand, and the deck accepts any kind it is given. The user: "lock it down — move as much work from the
agent to the orchestrator as possible so that it can focus on the real work". The agent picks a type, and the deck
supplies that type's buttons and common text. A handoff thread today offers Dismiss and Reply ("close or reply"). It should
offer **Handoff failed** and **Reply**.

The second request: each deck shows where its run stands. Green means planning, before Gate 1 passes. Yellow means
implementing, between Gate 1 and Gate 2. Red means closing, after Gate 2. The colour clears as soon as the closing report
is posted. This is a day and night cycle: the user is present at the gates, in green and red, and in yellow the crew
assumes the user is away and never waits on them.

## 2. Spec

| # | Behaviour | Evidence |
|---|---|---|
| 1 | `deck_post` accepts only the deck's thread types: question, spec, signoff, walkthrough, report, ticket, audit, handoff, crew-handoff. Any other kind is refused, and the refusal names the types. An item already stored under another kind keeps rendering as today, with Dismiss. | `deck_post {kind:"note"}` is refused with the list. An old unknown-kind item still opens and still dismisses. |
| 2 | A type with deck buttons gets them from the deck when it is posted: spec `agree` / `agree with edits`; signoff `Sign off` / `Not yet`; audit `none`; handoff and crew-handoff `Handoff failed`. Posting `options` for one of these is refused. A question keeps the agent's own options. Teach me stays on question, spec and signoff. Spec, a gate sign-off and both handoffs also carry one deck-written note line, on the card and on the page. | Post a spec with no options: the page shows agree / agree with edits / Teach me and the spec's note. Post a spec with options: refused. |
| 3 | A handoff or crew-handoff thread shows **Handoff failed** and **Reply**, and no Dismiss. Pressing Handoff failed on a crew agent's handoff tells the pilot to brief a fresh agent from that agent's branch. The pilot resolves a crew-handoff when the agent's own handoff reaches it. | The context guard's crew-handoff shows exactly those two controls. Pressing Handoff failed wakes `pilot wait` with that text. pilot.md carries the rule. |
| 4 | Each deck's tab on the strip shows its run's phase in its colour and its word, in the slot that reads `ended` once the deck's sessions have gone (`ended` keeps the slot then): green `planning` until Gate 1 passes, yellow `implementing` until Gate 2 passes, red `closing` after. A gate passes when its gate-tagged item is resolved (A1, A9). | A new run's tab reads green `planning`. Resolve its `gate: "1"` sign-off: yellow `implementing`. Resolve a `gate: "2"` item: red `closing`. The same after a reload and after a daemon restart. |
| 5 | The phase clears as soon as a `report` item is posted in that directory. The next run item posted there (a question, spec, signoff or walkthrough) starts it green. | Post a report: the tab shows no phase. Post a question: green `planning`. |
| 6 | In yellow the user is away. A `question` posted in yellow must carry `recommended`. The deck answers "the user is away: go with <recommended>, record it as assumed, and revise if they answer" and stamps the item `away`. The item stays open for a later answer, and the Stop hook never holds a turn on it. Gate items are never `away`. pilot.md says so. | In yellow, a question without `recommended` is refused. With one, the answer names it, and a pilot turn ending with it open is not held. (L12) |

Withdrawn from the draft: "notifications change in yellow". The deck has no OS or browser notifications today (F6), only
the in-page Notifications panel, so there is nothing to change. Line 4 names only the tab, not a header: the page
`<header>` is not live-swapped (F8), and the strip is.

## 3. Findings

- **F1 Kinds.** `KINDS` (`deck/items.mjs:73`) is question, walkthrough, signoff, spec, report, ticket and audit. It is what
  `deck_post` advertises (`deck/tools.mjs:146-151`) and what full auto decides (`deck/store.mjs:556`). `postItem`
  (`store.mjs:510-517`) accepts any kind that matches `KIND_SHAPE` (`store.mjs:433`), and refuses only `chat` and `user`.
- **F2 Unknown kinds.** A kind outside `SPECS` (`items.mjs:298-310`) renders generically. Its page has Reply and Dismiss
  (`deck/ui/render.mjs:375-433`), and its card has Dismiss and a Reply link (`render.mjs:578-590`). That pair is the "close
  or reply" the user saw. `isKnownKind` also decides Yours (`items.mjs:543`).
- **F3 Handoffs.** Three writers: `scripts/handoff.mjs:105` (the pilot's own), `deck/chain.mjs:81` (the next run, carrying
  `next`), and `hooks/context-size-guard.js:556` (`crew-handoff`, a crew agent past its hard mark, deliberately not
  `handoff`, L17 there). The kind is spelled in four places: `items.mjs:60`, `deck/run.mjs:113`,
  `hooks/session-handoff.js:49` and `scripts/handoff.mjs:105`. `crew-handoff` has no constant at all. Nothing in `agents/`
  says what the pilot does with a reply on a crew-handoff.
- **F4 Buttons are options.** A press posts `choice`, and `replyFrom` sends it as the reply (`deck/server.mjs:180-190`).
  `chosenOf` (`items.mjs:462`), `renderChoices` (`render.mjs:238`), `pilot wait` and the Stop hook all read
  `item.options` or the reply text. Options the deck writes into `item.options` at post therefore need no change to
  reply, wait or the Stop hook. The agent currently writes `agree` / `agree with edits` on every spec (`agents/pilot.md:172-174`)
  and `["none"]` on every audit (`skills/audit/SKILL.md:45`). No sign-off options are fixed anywhere.
- **F5 Gates.** The deck has no gate concept. Gate 1 and Gate 2 are both `signoff` items, told apart only in prose
  (`agents/pilot.md:289`, `:466`). Gate 2 may also be the user pressing Sign off on QA's feature walkthrough
  (`pilot.md:467`, `agents/pilot-qa.md:128-154`). The run record holds `finished` / `finishedAt` and no phase
  (`deck/runs.mjs:223`). A `report` is standing (`items.mjs:80`) and ends nothing on its own.
- **F6 Full auto and notifications.** Full auto resolves a decidable post synchronously, `resolution: 'auto'`, with no
  timer (`store.mjs:556-564`), and tells the agent in the post's answer (`server.mjs:654-659`). That answer is the
  pattern spec 6 copies. The deck makes no OS or browser notification. The Notifications panel is an in-page unseen count
  (`deck/ui/js/notifications.mjs`).
- **F7 Stop hold.** `hooks/stop-gate.js:132-138` `awaitsUser` holds the pilot's turn for up to 570 s on any open,
  non-standing item the session posted that has no user reply. In yellow, that queues crew completion notifications behind
  a question the user will not see for hours.
- **F8 Where a deck shows.** A tab is one per repository (`deck/tabs.mjs:87-140`). The strip, `renderStrip`
  (`render.mjs:1010-1022`), is live-swapped (`data-live="tabs"`). The page `<header>` holds the usage readout and is
  deliberately not live (`render.mjs:1533`, D1 there). The CLI status line reads `deck.json` directly in CommonJS
  (`hooks/context-usage-statusline.js:225-235`).
- **F9 PR #215.** It adds `renderSession` to the right rail, `tab.wrapped` in `tabsOf`, routes in `server.mjs`, and
  `storedTabFor` in `store.mjs`. It changes no kind, no `deck_post` / `deck_status` field, the strip link, or the Stop hook.
  S4's `tabsOf` and strip edits sit beside its edits, so whichever merges second rebases trivially.

## 4. Ubiquitous language

- **Thread type**: an item's `kind`, drawn from the closed list `deck_post` accepts. There is no separate type field.
- **Deck buttons**: the options a type's post is given by the deck, stored in `item.options` exactly as an agent's would be.
- **Type note**: one line of the deck's own words about a type, drawn on its card and page and never stored.
- **Gate item**: a `signoff` carrying `gate: "1"` or `"2"`, or QA's feature walkthrough carrying `gate: "2"`. It *passes*
  when resolved.
- **Phase**: `planning`, `implementing` or `closing` (green, yellow, red), or none. It is derived from a directory's items
  since its last `report`, and never stored.
- **Away**: a question posted while its directory is `implementing`, stamped at post, which nobody waits on.

## 5. Locked decisions

- **L1 The kind is the type.** The closed set is the list of kinds `deck_post` accepts. Rejected: a new `type` field
  beside `kind`, which would put two words on one idea across every reader of an item.
- **L2 Deck buttons are stored as `options` at post, inside `postItem`.** Reply, `chosenOf`, `pilot wait` and the Stop
  hook read options already (F4), and the chain's handoff, which bypasses `deck_post`, gets its button through the same
  path. Rejected: rendering buttons from the type table at read time, which would teach reply validation and `chosenOf` a
  second source.
- **L3 The closed list is a posting rule, not a storage rule.** `postItem` refuses a kind outside it. A stored item of any
  kind still reads and renders as today (A11 of the earlier runs). Rejected: migrating or deleting old unknown-kind items.
- **L4 Handoffs are known but never decidable.** `handoff` and `crew-handoff` join `SPECS` and the posting list, and stay
  out of `KINDS`, which full auto reads. Otherwise full auto would close a handoff at post and the fresh session's
  `pickup` would never see it. Rejected: adding them to `KINDS`.
- **L5 A gate is a field, not a kind.** `signoff` takes `gate: "1" | "2"`, and `walkthrough` takes `gate: "2"`, validated
  like `size` (`only`). A wizard's closing sign-off carries none. Rejected: new `gate-1` / `gate-2` kinds, which would
  rewrite `GATED_KINDS`, full auto, the Stop hook and every existing sign-off.
- **L6 The phase is derived, never stored** (`runPhaseOf(items, repo)` in `items.mjs`, a pure function like
  `threadState`). The boundary is the directory's newest `report`. Rejected: a stored phase written on each event, which
  can drift from the items it describes.
- **L7 Away is stamped on the item at post.** The hook then reads one field and needs no CommonJS copy of the phase rule
  (the one-spelling rule of L35 and `join.test.js`). Rejected: the Stop hook computing the phase itself.
- **L8 The phase shows on the strip tab.** The strip is live-swapped and the `<header>` is not (F8). The tab's own page
  carries it on its current tab.
- **L9 Structural decisions get ADRs**: `docs/adr/0051-thread-types-are-a-closed-list-with-deck-buttons.md` (L1-L5, S2)
  and `docs/adr/0052-the-run-phase-is-derived-from-gate-items.md` (L6-L7, S4).
- **L10 Grilling depth: forks.** The user chose *forks* on itm_fcef15bb7eaf: only decisions whose paths give materially
  different deliverables are asked; the rest are assumed and named in §6. Gate 1 is the signoff alone, with no walk.
- **L11 The phase takes the tab's `ended` slot.** The user (itm_33b067667e38): "when a deck has ended, the tab has a little
  thing that says `ended`. When it is running, we can have the phases show there." So `renderStripLink` draws `ended` when
  the deck's sessions have all gone, else the phase's word in its colour, else nothing. Not the page header (not live, F8)
  and not the CLI status line. Rejected: a second span beside `ended`, which would put two states on one tab.
- **L12 In yellow the deck answers at post.** The user (itm_ea2d1e8ef914) chose "deck answers at post": a `question` posted
  while its directory is `implementing` must carry `recommended`; `deck_post` answers "the user is away: go with
  <recommended>, record it as assumed, and revise if they answer", stamps the item `away`, leaves it open, and the Stop
  hook never holds a turn on it. Gate items are exempt. Rejected: a timed default (every yellow question stalls an agent N
  minutes) and a rule in the definitions only (the Stop hook keeps holding, F7).

## 6. Assumed decisions awaiting the user

| # | Decision | Default taken | Tradeoff |
|---|---|---|---|
| A1 | Who sets the phase | The deck derives it from gate-tagged items and the report | The pilot tags gate posts, in return for a phase that cannot drift. Rejected: `deck_status` setting it. |
| ~~A2~~ | What yellow changes (spec 6) | Decided by the user: L12. | – |
| ~~A3~~ | Where the phase shows | Decided by the user: L11. | – |
| A4 | Word with the colour | Yes: `planning` / `implementing` / `closing` | A wider tab. |
| A5 | Runs | One run of five slices | ~2.5 h, under the 5–7 h band even as one. |
| A6 | Deck buttons | spec agree / agree with edits; signoff Sign off / Not yet; audit none | The pilot can no longer word a sign-off's options. |
| A7 | Which handoffs change | All three writers (pilot, chain, crew) | The user can no longer Dismiss a pilot handoff to stop a `/clear`. They reply instead. |
| A8 | Abandoned runs | Only a `report` clears the phase | An abandoned run's colour stays until the next report. |
| A9 | When a gate passes | When its item is resolved. A gate is resolved only on a pass, and Not yet keeps it open. | The rule lives in the definitions, not in code. |

## 7. Out of scope

- OS or browser notifications, in any phase (none exist, F6).
- The CLI status line (A3), and a phase anywhere but the strip.
- A timer that closes a yellow question, and any change to full auto.
- Migrating stored items: old sign-offs keep their own options, and old unknown kinds keep Dismiss (L3).
- Clearing the phase on an abandoned run (A8), and a phase for a small ticket's side job (its Gate 2 walkthrough carries
  `ticket`, not `gate`).
- What the `pilot run` wrapper does on Handoff failed for the pilot's own handoff: it stays a reply the next pilot reads.

## 8. Slices

A straight chain. Each slice shares `deck/items.mjs` or `deck/store.mjs` with the one before it, so none run in parallel.

| Slice | Delivers | Files owned | After | File |
|---|---|---|---|---|
| S1 Handoff threads offer Handoff failed and Reply (walking skeleton) | 3, 2 (handoffs) | `deck/items.mjs`, `deck/store.mjs`, `deck/ui/render.mjs`, `deck/test/handoff-buttons.test.mjs` (new), `agents/pilot.md` | – | [S1](slices/S1.md) |
| S2 deck_post accepts only the thread types | 1 | `deck/items.mjs`, `deck/store.mjs`, `deck/tools.mjs`, `deck/test/types.test.mjs` (new), `deck/test/run.test.mjs`, `deck/test/spec-gate.test.mjs`, `docs/adr/0051-…md` (new) | S1 | [S2](slices/S2.md) |
| S3 Spec, sign-off and audit buttons come from the deck, and gates are tagged | 2 | `deck/items.mjs`, `deck/store.mjs`, `deck/tools.mjs`, `deck/test/type-buttons.test.mjs` (new), `agents/pilot.md`, `agents/pilot-qa.md`, `skills/audit/SKILL.md` | S2 | [S3](slices/S3.md) |
| S4 The strip shows each deck's phase | 4, 5 | `deck/items.mjs`, `deck/tabs.mjs`, `deck/ui/render.mjs`, `deck/ui/deck.css`, `deck/test/phase.test.mjs` (new), `docs/adr/0052-…md` (new) | S3 | [S4](slices/S4.md) |
| S5 In yellow the user is away | 6 | `deck/store.mjs`, `deck/server.mjs`, `hooks/stop-gate.js`, `hooks/test/away.test.js` (new), `deck/test/away.test.mjs` (new), `agents/pilot.md` | S4 | [S5](slices/S5.md) |

## 9. Acceptance evidence, in the order the user meets it

On a scratch deck (preview port, as deck-polish's QA used), in a browser:

1. A crew-handoff appears (posted as the context guard posts it). Its card and page show **Handoff failed** and Reply, and
   no Dismiss. Pressing Handoff failed wakes a running `pilot wait` with that text (spec 3).
2. `deck_post` of kind `note` is refused, and the refusal names the nine types. An old stored `note` item still opens
   with Dismiss (spec 1).
3. A spec posted with no options shows agree / agree with edits / Teach me and its note. With options it is refused. A
   sign-off shows Sign off / Not yet / Teach me, and an audit shows `none` (spec 2).
4. A new run's tab reads green `planning`. After the `gate: "1"` sign-off is resolved, yellow `implementing`. A reload and
   a daemon restart keep it (spec 4).
5. In yellow, a question without `recommended` is refused. With one, the answer says the user is away and names the
   default, and a pilot turn ending on it is not held by the Stop hook (spec 6).
6. After the `gate: "2"` walkthrough is resolved, red `closing`. Post the `report`: no phase. Post a question: green (spec
   4, 5).

## 10. Status

| Slice | State | Branch | PR | Worktree | Blocker | Delivers |
|---|---|---|---|---|---|---|
| S1 Handoff threads offer Handoff failed and Reply | integrated | slice/thread-types-phase-s1 | #223 | removed | – | 3, 2 |
| S2 deck_post accepts only the thread types | integrated | slice/thread-types-phase-s2 | #224 | removed | S1 | 1 |
| S3 Spec, sign-off and audit buttons come from the deck, and gates are tagged | integrated | slice/thread-types-phase-s3 | #225 | removed | S2 | 2 |
| S4 The strip shows each deck's phase | integrated | slice/thread-types-phase-s4 | #226 | removed | S3 | 4, 5 |
| S5 In yellow the user is away | integrated | slice/thread-types-phase-s5 | #227 | removed | S4 | 6 |
| Fix round: principles findings and QA | integrated | fix/thread-types-phase-r1 | #228 | removed | S5 | – |
| feature thread-types-phase | Gate 2 signed 2026-10-01 02:37Z (itm_1ebce76d254f); PR #222 ready for review at 5bfc7d3 | feat/thread-types-phase | #222 | pilot-feat-thread-types-phase | S5 | 1–6 |

## 11. Verdicts on the principles review, and Gate 2

Kept (PR #228): `recommended` removed from buttoned kinds; the `PHASES` export deleted; two phase asserts (report then
walkthrough / signoff); pilot.md's Legend repeat and resolve-before-Gate-2 clause cut; `postStored` writes the store
file; `NOT_YET` imported; the gate enum derived from the type table; and QA's five: the Gate 2 note holds for a
walkthrough, the handoff note only with its button, the type note above the body on card and page, an away line on an
away question, gate+ticket refused in code. Dropped: the dedicated options refusal (its wording is S3's Interface);
clearing `away` on reopen (spec 6 reads literally, and it is an addition).

Gate 2: the user pressed Sign off on QA's walkthrough itm_1ebce76d254f at 2026-10-01 02:37Z with no bugs reported; QA
made no commits. PR #222 left draft at 5bfc7d3.
