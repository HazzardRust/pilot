# handoff-books: the hand-off is when the run keeps its books

Ticket itm_b561a9d42212 · base `feat/handoff-books` from `origin/pilot` (d7569a49 at the cut) · ADR NNNN.
Runs after handoff-mod (itm_97c9e8fdf1d2); its pilot.md slices land after blocked-steps S2 (itm_a2aeb8349afc).

## 1. Problem

> i want you to find when logging actually occurs for stuff like friction sources and attention losses. if it isnt
> occuring at handoff, i think it should
> so basically i think number of handoffs and the handoff itself is when some stuff should happen. for example i
> think the audit runs every N rounds, but i think it should be every N handoffs, we should bump it up to like 20
> and when i say at the handoff, just before it is when the agent should be writing it down

Friction rows and the pilot's drains reach the run record only when a `deck_status` happens to carry `friction`.
The hand-off asks for none (ADR 0146, `scripts/test/yellow-lane-wording.test.mjs:19-21` lints it out), so what the
pilot or a crew agent had not yet sent is lost at `/clear`. The audit is offered every 10th counted run
(`OFFER_EVERY_RUNS`, `deck/audit.mjs:256`), not by hand-offs.

## 2. Spec

Lines 1-5 accepted by main as sharpened (2026-11-17); line 6 added by the user's "At the hand-off"
(itm_3f291c03f1c1). A "+n rows" line on `pilot handoff` was dropped (itm_1ab20e272b77, "Drop it").

| # | Behaviour | Evidence (bar) |
| --- | --- | --- |
| 1 | The pilot's hand-off step 1 `deck_status` carries `friction`: every crew row not yet sent and its own drains, before `pilot handoff` runs. | The guard's pilot hard-mark message names `friction` in step 1 (1 test); pilot.md's "When your own context fills" names it, within the own-share pin 11871 (measure-prompt, re-measured after blocked-steps S2); the yellow-lane-wording lint is gone; ADR NNNN supersedes ADR 0146's "writes no friction summary". |
| 2 | A crew agent past its mark puts its friction row in the handoff it sends `main`; a co-pilot past its mark sends its unsent rows in one `deck_status` before it hands back `paused`. | 2 guard tests: the crew hard message and the co-pilot message each name `friction`. |
| 3 | Rows written before a hand-off survive it. | 1 test: a record with n rows, committed by the hand-off's record commit, has n rows in `run.json`; the next session's `deck_status` with 1 row leaves n+1. A pin: `deck/runs.mjs:464` already appends. |
| 4 | Hand-offs are counted per repository, once per hand-off id, where the counting site (A4) sees it. | Tests: n distinct hand-offs leave the count at n; the same id claimed twice counts 1; a hand-off in another repository counts 0 here. |
| 5 | The audit comes due every 20 hand-offs, not every 10 runs. | `pilot audit due` exits 1 at 19 counted hand-offs and 0 at the 20th; `pilot audit count` answers the usage (exit 2); an offer or a saved report re-arms to 0; a record.json holding only old `counted` runs reads without error and is not due. |
| 6 | The hand-off that makes the audit due tells the fresh session so in one line, and the pilot offers it then, not at the next run's start. | 1 lane test: the 20th claimed hand-off's notice carries exactly 1 audit-due line, the 19th's 0; pilot.md's audit paragraph names the notice, within the pin. |

Cannot mean here: the deck writing the pilot's drains itself (it cannot see the context); a hand-off refused for
missing rows (the hand-off fires at the hard mark and is never blocked).

practitioner: a bookkeeper closing the books — the entry is made at the close; the check at the commit point was
offered and dropped by the user.

## 3. Findings

| What | Where | Leans on it |
| --- | --- | --- |
| Friction appends per `deck_status`, newest 40 kept | `deck/runs.mjs:319-338, 445, 464-465` | spec 3 is already true; pinned |
| The hand-off asks for no friction | ADR 0146 last bullet; `scripts/test/yellow-lane-wording.test.mjs:19-21` (`// lint:`) | superseded by ADR NNNN, lint deleted |
| Pilot hand-off text | `hooks/context-size-guard.js:431-454` (`advice`, pilot branch); `agents/pilot.md:576-606` | spec 1 |
| Crew and co-pilot hard text | `hooks/context-size-guard.js:456-471` (crew), `387-397` (co-pilot "pause, hand back paused") | spec 2 |
| The audit record and verbs | `deck/audit.mjs:252-311, 416-434`: `countRun`, `auditDue`, `recordOffer`, `{offers, counted}` | spec 4, 5 |
| Only caller of `audit count` | `agents/pilot.md:226-231`; usage `bin/pilot.mjs:132` | removed with the verb |
| The hand-off lane claims each `handoff` item once | `hooks/session-handoff.js:490-495` (`handoff-<id>`, before chain and plain branches) | A4 count site |
| handoff-mod L9: count attaches to the look's `cleared` | `origin/feat/handoff-mod` `deck/run-look.mjs:141-152` | amended by A4 |
| Store dir shared by hook and deck | `deck/store-dir.mjs:20` (`PILOT_DECK_DIR`), `hooks/lib/deck.js` | the lane can import `deck/audit.mjs` |
| pilot.md own share 11850, pin 11871, headroom 21 | `node scripts/measure-prompt.mjs` in this worktree at d7569a49 | spec 1's words paid by spec 5's deleted sentence |
| Guard split moves `advice` text | blocked-steps S10 → `hooks/lib/guard-advice.js` | S2's file is wherever `advice`'s text is on `pilot` |

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| The audit record, `deck/audit.mjs` | `countHandoff(repo, id) -> number`, `auditDue(repo) -> 'first' \| 'every' \| null`, `recordOffer(repo, key)`, CLI `due \| offered` | run counting retired (`countRun`, `counted`); old records read | in-process (store dir by `PILOT_DECK_DIR`) |
| The hand-off lane, `hooks/session-handoff.js` | `run(input) -> result \| null` | the count at the claim; the audit-due line | local-substitutable (stub deck) |
| The guard's advice | `advice(input, seen, marks, threshold, onDeck) -> { systemMessage, additionalContext }` | the three hand-off texts | in-process |
| The record across a hand-off | `nextRecord(previous, given)`, `commitRecords(dir, trailers)` | nothing new; pinned | local-substitutable (temp git repo) |

Deletion test: `countRun` and `OFFER_EVERY_RUNS` vanish with nothing reappearing (their one caller goes too). No
module is shallow enough to fold; no fold slice.

## 4. Ubiquitous language

- **Hand-off**: a pilot `handoff` item for this repository, by `pilot handoff` or a chain at a clean finish.
- **Counted hand-off**: a hand-off id in the audit record's `handoffs`; each id once.
- **Books**: the run record's `friction` rows: crew rows `{agent, what, evidence, size?}` and drains `{kind: "drain", what, size}`.
- **Keeping the books**: one `deck_status` carrying every row not yet sent, as the step before a hand-off.
- **Due**: `pilot audit due` exits 0: `first` (never offered nor audited) or `every` (20 counted hand-offs).

## 5. Locked decisions

- **L1 Grilling depth: forks** (itm_1d37b1424d2e).
- **L2 The count lives in the audit record** as `handoffs: [id]`, reset by an offer or a saved report, as `counted` was.
  Rejected: a counter in the run record (per run, not per repository; lost when a run lands).
- **L3 `pilot audit count` and `counted` go.** A record with `counted` and no `handoffs` reads as 0 hand-offs; the
  next write drops `counted`. Rejected: keeping the verb as a no-op (a call that does nothing, and pilot.md tokens).
- **L4 The lane counts through a dynamic `import()` of `deck/audit.mjs`** from the CommonJS hook; a failed count logs
  `lane: hand-off not counted (<why>)` and the notice is still delivered. Rejected: spawning `pilot audit` (a process
  per session start); counting in the daemon (it does not see a `/clear`).
- **L5 Spec 1 and 2 are said where each agent already reads its hand-off steps**: the guard's three hard texts and
  pilot.md's hand-off section; `pilot-co-pilot.md` is not edited (blocked-steps S2 owns it; the guard's co-pilot
  text names the step). Rejected: a deck check that refuses `pilot handoff` without rows (blocks at the hard mark).
- **L6 ADR NNNN supersedes ADR 0146's last bullet** and records L2-L4 and the 20.
- **L7 QA environment** (itm_3dec402c588e, "This machine, scratch deck, 1 live hand-off"): this machine, a scratch deck (`pilot deck --scratch`) and a
  scratch `PILOT_DECK_DIR`; 20 hand-offs driven through the lane by script, 1 live pilot hand-off in a scratch repo
  reading its rows in `run.json` after `/clear`.

## 6. Assumed decisions

- **A1 No friction row for the hand-off itself** (itm_3a9ab2d90372). Default: no row; the count records it.
  Tradeoff: the closing report does not show how many hand-offs a run took. Rejected: a row per hand-off (evicts
  real rows under the 40 cap).
  Answer: "No row" (itm_3a9ab2d90372), the default.
  Verdict: stands — the user's press, read on the deck by the pilot.
- **A2 The first-run offer stays** (itm_6ff1fe2b3fef). Default: `auditDue` still answers `first`. Tradeoff: one extra
  offer per repository, ever. Rejected: a new repository waits 20 hand-offs.
  Answer: "Keep first-run offer" (itm_6ff1fe2b3fef), the default.
  Verdict: stands — the user's press, read on the deck by the pilot.
- **A3 Only pilot hand-offs count** (itm_748a9402637b), chain hand-offs included; `crew-handoff` items and co-pilot
  pauses do not. Tradeoff: crew context pressure does not bring the audit sooner. Rejected: a second count site in
  the guard.
  Answer: "Pilot hand-offs only" (itm_748a9402637b), the default.
  Verdict: stands — a co-pilot's forced pause happened again today with its implementers live; counting those would bring audits on harness noise, not on the pilot's context.
- **A4 The count site is the SessionStart lane's claim** (itm_5f9645e90d42), amending handoff-mod L9. Default: lane,
  so a typed `/clear` with mods off counts too. Tradeoff: amends a signed plan's lock. Rejected: the look's
  `cleared` (L9 as signed: mods-off hand-offs uncounted).
  Answer: "Lane (amend L9)" (itm_5f9645e90d42), the default. Edit owed to handoff-mod's artefact (main makes it on
  `feat/handoff-mod`): L9's last sentence becomes "itm_b561a9d42212's count is made at the SessionStart lane's claim
  instead (handoff-books A4, itm_5f9645e90d42); this run builds neither."
  Verdict: stands — the user's press, read on the deck by the pilot; the L9 edit is made on `feat/handoff-mod`.
- **A5 A "+n rows" line on `pilot handoff`** (itm_1ab20e272b77, main's). Answer: "Drop it". Not built.
  Verdict: stands — the user's press; nobody acts on the number.
- **A6 The audit is offered at the hand-off that makes it due** (itm_3f291c03f1c1, main's). Answer: "At the hand-off";
  spec 6, folded into S1 (the lane's notice line and pilot.md's audit paragraph).
  Verdict: stands — the user's press.

## 7. Out of scope

- The hand-off notice naming a live red ticket (itm_9b7008e91201 line 2).
- What the auditor measures; the closing report's ranking of friction.
- Splitting the guard (blocked-steps S9, S10); the mod and the look (handoff-mod).
- Renaming `deck/test/handoff.test.mjs` (audit F7, itm_7f308083566b).
- A count of friction rows on `pilot handoff`'s line (A5, dropped).

## 8. Slices

Width 2; longest stem 2 (S1 → S3).

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Walking skeleton: a hand-off is counted and the 20th makes the audit due | 4, 5, 6 | `deck/audit.mjs`, `deck/test/audit-offer.test.mjs`, `hooks/session-handoff.js`, `hooks/test/session-handoff-count.test.js` (new), `bin/pilot.mjs`, `agents/pilot.md` (the audit paragraph, 226-231), `docs/adr/NNNN-handoff-books.md` (new), `docs/adr/README.md` | – (waits: blocked-steps S2 on `pilot`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | Crew and co-pilot keep their books before handing off, and the guard asks the pilot too | 1, 2, 3 | the guard's `advice` text (`hooks/context-size-guard.js`, or `hooks/lib/guard-advice.js` once blocked-steps S10 is on `pilot`), its test (`hooks/test/context-size.test.js` or `hooks/test/guard-advice.test.js`), `scripts/test/handoff-books.test.mjs` (new) | – (waits: handoff-mod on `pilot`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S2](slices/S2.md) |
| S3 | The pilot's hand-off section asks for its books | 1 | `agents/pilot.md` (the hand-off section, 576-606), `scripts/test/yellow-lane-wording.test.mjs` (deleted), `scripts/test/measure-prompt.test.mjs` | S1 (`agents/pilot.md`: the tokens spec 5 frees) | `pilot:security-reviewer` | [S3](slices/S3.md) |

What waits for another ticket's landing: S1 for blocked-steps S2 (`agents/pilot.md`, re-measure the pin); S2 for
handoff-mod (the guard text and `scripts/handoff.mjs`'s commit, which its test drives), and reads `advice` wherever
blocked-steps S10 left it; S3 for both through S1, and for handoff-mod S11 (pilot.md 592-593 reworded).

Red team (assumed the cut failed and walked each first red step against the files):

- red team: S1's lane test and `pilot audit due` must read one record: both key on the session's cwd through
  `repoKey`, and both stores resolve `PILOT_DECK_DIR` (`deck/store-dir.mjs:20`); S1 test 3 drives the lane and then
  `pilot audit due` in that cwd.
- red team: the lane's claim can be undone when delivery fails (`hooks/session-handoff.js:503`), so the same id is
  claimed again: `countHandoff` is idempotent by id (S1 test 2).
- red team: removing `audit count` in one slice and its pilot.md call in another would leave the pilot calling a
  dead verb on the integration branch → both in S1.
- red team: S1 and S3 both spend pilot.md's 21 tokens beside blocked-steps S2 → S1 deletes a sentence (net
  negative), S3 is after S1 and re-measures; the pin is never raised.
- red team: S2's guard text would collide with blocked-steps S10's move → S2 owns `advice`'s text wherever it is on
  `pilot` at its start, and names the file in its PR.

## 9. Acceptance evidence

1. A crew agent pushed past its mark on a scratch run sends `main` a handoff with its friction row; a co-pilot's
   `deck_status` with rows precedes its `paused` (spec 2).
2. The pilot past its mark sends one `deck_status` with `friction`, runs `pilot handoff`, and after `/clear` the
   fresh session's `run.json` holds those rows (spec 1, 3).
3. In a scratch store, 19 hand-offs leave `pilot audit due` at exit 1 (`not due 19`), the 20th at exit 0
   (`due every 20`); a second `/clear` of the 20th leaves 20 (spec 4, 5).
4. The fresh session after the 20th hand-off reads one line saying the audit is due, and the pilot posts the offer
   then (spec 6).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | slice/handoff-books-s1 | – | – | – | 4, 5, 6 |
| S2 | planned | slice/handoff-books-s2 | – | – | – | 1, 2, 3 |
| S3 | planned | slice/handoff-books-s3 | – | – | S1 | 1 |
| handoff-books | planned | feat/handoff-books | – | – | S1, S2, S3 | 1-6 |
