# architect-runs-red: the architect runs red to the Gate 1 post

Ticket `itm_7168f2dafd64` · slug `architect-runs-red` · base `origin/pilot` 7c987d3c · ADR 0169 · depth: forks

## 1. Problem

After the architect finishes, the pilot still spends about 12 calls of its own context finishing red: recording
answers, a rebase, fixing the Verdict-line format, creating `feat/<slug>`, its worktree and the draft PR, posting the
gate1 twice, resolving threads (deck-spawn-root's red, 2026-10-19). The user wants the architect to take the routine
rest of red under a contract, the pilot keeping only what is the user's: the question queue, pushback and the
Verdict pass.

## 2. Spec

| # | Behaviour | Evidence (bar) |
| --- | --- | --- |
| 1 | The handover is a contract of two calls: once every question thread of the ticket is closed, the pilot records its verdicts with `deck_ticket verdicts` and sends the architect one message holding the same text, one line per A‹n› (`A<n> Verdict: stands[ — why]` or `A<n> Verdict: overturned: <why>`), and nothing else. | Wording pin on pilot.md `### 3. Grilling, with the user` and pilot-architect.md naming both calls and the line shape (2 files); ADR 0169. |
| 2 | The architect records every answer the pilot relays as it lands, writes the Verdict lines with `pilot verdicts <artefact>` (message on stdin), commits, then rebases `design/<slug>` onto `<remote>/pilot` and pushes. *(order corrected at QA: a rebase refuses the dirty tree `pilot verdicts` leaves)* | Test: a fixture message and a fixture artefact through `pilot verdicts` leave `unverdicted` = 0 ids and pass the deck's `assertVerdicts` on the 1st run; a message missing 1 id exits 1 naming it. |
| 3 | The architect creates `feat/<slug>` from the design tip, its worktree `<repo>-feat-<slug>`, pushes both, opens the draft feature PR (spec and slice table as body), sends `deck_status` (every row `planned`), and posts the gate1 itself; on a deck refusal it fixes the named cause and posts again, at most 3 times, then sends the refusal to `main`. *assumed (A2)* | Deck test: a gate1 stamped `pilot:pilot-architect` is accepted (today refused, `deck/store-items.mjs:79`); an implementer-stamped one still refused. Pin: pilot.md's text after the hand-back names 0 `git`/`gh` commands. |
| 4 | The pilot keeps the question queue, pushback, the Verdict pass and the Sign off: the deck refuses a gate1 whose artefact's Verdict lines at `sha` differ from the ticket's verdict record, or that has an A‹n› and no record, whoever posts it. *assumed (A1)* | Deck tests, 4 cases: no record refused; 1 differing verdict refused naming its id; an id on 1 side only refused; matching accepted. Pin: pilot.md's `## What is yours and never delegated` keeps its 3 lines on the interview and queue, verdicts and gates. |
| 5 | A gate1 is the pilot's thread whoever posts it, so the user's Sign off or Not yet wakes the pilot, not the stopped architect. | Test: an architect-posted gate1's `ownerOf` is `pilot`, and 1 user reply on it is handed to the pilot's wait, 0 to the architect's. |
| 6 | orchestration.md's `## Agents cannot ask the user` names the architect's exception: it posts its own questions and the gate1 on the deck, where the user is, and why. | Wording pin on that section; `node scripts/check-references.mjs` exits 0; the rules ledger holds the new hash. |
| 7 | The pilot's red after the hand-back costs at most 3 calls (record, message, wait) and 0 git calls. *practitioner: SRE counting toil* | On the 1st run after landing, the pilot's transcript from its last grilling answer to the gate1 post: at most 3 tool calls, 0 Bash `git`/`gh` (§9 item 4). |
| 8 | *added (S5)*: a slice with more than one commit touching `rules/` integrates green: the rules ledger check counts the commits a merge in progress brings in. | Test: a `--no-commit` merge of a branch that edits a rule twice passes `build-rules-ledger --check` (`scripts/test/rules-ledger.test.mjs`). |
| 9 | *added (S6)*: a red `pilot integrate` leaves the feature worktree at its start, with no merge in progress, or names that it could not. | Test: a gate that rewrites a merged file and fails leaves no `MERGE_HEAD`; a failed reset is named in the line. |

Cannot mean here: the architect resolving or signing the gate1 (the deck refuses `deck_resolve` on an unsigned gate1),
or sending `finished: "planned"` (the pilot's, on the press).

## 3. Findings

- The gate1 post path: `callTool('deck_post')` (`deck/server-tools.mjs:213-218`) runs `refusePoster`, then
  `assertOnPilotTip` (`deck/lineage.mjs:27`) and `assertVerdicts` (`deck/lineage.mjs:59`), before `postFilled`.
  Every refusal throws before a write, so a refused post stores nothing and a re-post meets no twin; the twin rule
  (`deck/store-items.mjs:219-221`) refuses only a second *stored* open gate1.
- `POSTERS` (`deck/store-items.mjs:79`) gives gate1 to `pilot` alone. The author is the harness's stamp
  (`hooks/deck-author.js`), mapped by `authorKind` (`deck/items.mjs:370`).
- A thread's owner is its poster's kind (`deck/store-items.mjs:148`); `ownerOf` (`deck/items.mjs:417`) pins
  chat, user and ticket to the pilot. An architect-posted gate1 would be the architect's today.
- `scripts/verdicts.mjs` is the pure grammar of §6 (`assumedIds`, `unverdicted`), shared by the deck.
- `deck_ticket` (`deck/server-tools.mjs:363`) is the pilot's but for the architect's `merge`; ticket writes live in
  `deck/store-tickets.mjs` (`needTicket` :316 is the pattern); the tool schema is `deck/tools.mjs:356`.
- The architect's tools lack `deck_status` (`agents/pilot-architect.md:5`); it is told "Never push, never open a PR"
  (:169). The pilot's Verdict pass, answer recording and Gate 1 git steps are `agents/pilot.md:285-363`.
- Editing `rules/orchestration.md` needs its new hash in `scripts/shipped-rules.json` (`build-rules-ledger.mjs`).
- Wording pins read a pilot.md section by heading (`scripts/test/landing-wording.test.mjs:16`).
- Overlap: `feat/short-path` S3/S4 own `deck/items.mjs`, `deck/tools.mjs`, `deck/store-items.mjs`,
  `agents/pilot.md` (`## Yellow`), `docs/adr/README.md`; `one-integration-line` S9 owns `agents/pilot.md`. ADRs
  0165-0168 are reserved by other designs. Whichever lands second rebases; this run's pilot.md edit is Phase A only.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `scripts/verdicts.mjs` | `assumedIds`, `unverdicted` (existing), `parseVerdictMessage`, `verdictsOf`, `writeVerdicts` | the message grammar and placement the deck, the CLI and the architect would each restate | in-process |
| `deck/lineage.mjs` | `assertVerdicts(repo, gate, { record })` | the record comparison | local-substitutable (temp git repos) |
| `deck/store-tickets.mjs` + `deck_ticket` | `recordVerdicts(id, text)`; `deck_ticket { action: 'verdicts' }` | the ticket's verdict record | local-substitutable (scratch store) |
| `deck/store-items.mjs` / `deck/items.mjs` | `refusePoster`, `ownerOf` (existing) | gate1 posters and ownership | in-process |
| `bin/pilot.mjs` | `pilot verdicts <artefact>` | file read/write around `writeVerdicts` | local-substitutable (temp file) |
| prose | pilot.md `### 3.`, pilot-architect.md `## The planning relay`, `## Where you work`; orchestration.md section | the contract | prose pin |

Deepening: every module passes the deletion test (each folds rules N callers would restate); no shallow module to
fold, so no fold slice.

## 4. Ubiquitous language

- **Verdict message**: the pilot's one message to the architect, one `A<n> Verdict: …` line per A‹n›, nothing else.
- **Verdict record**: the same verdicts stored on the ticket by `deck_ticket verdicts`; the deck's reference.
- **Hand-back**: the architect's report to `main` once the gate1 is posted; it then stops.
- **Routine red**: recording answers, rebasing, Verdict lines, `feat/<slug>`, its worktree, the draft PR,
  `deck_status`, the gate1 post.

## 5. Locked decisions

- **L1 Depth: forks** (itm_70d5333a5305). Only stashes whose paths fork are posted; the rest stand assumed.
- **L2 Two calls, a deck record then the message** (itm_a14f1c5dea2f). The deck cannot see a SendMessage, so
  spec 4 needs the pilot's verdicts stored where the gate1 check reads them; `deck_ticket` is already pilot-only on
  the harness's stamp. Rejected: one message only (spec 4 uncheckable); parsing a pilot `deck_reply` (free text).
- **L3 `pilot verdicts <artefact>`** (itm_d7687c97a8e0). Placement by the same grammar the deck checks with, so the
  lines are right the first time. Rejected: hand-written lines (today's format miss).
- **L4 A gate1 is the pilot's thread whoever posts it** (`ownerOf`). Rejected: the architect owning it (it stops at
  the post; the press would wake no one).
- **L5 Re-post only after a refusal.** A refused post stores nothing; a stored gate1 with a fault is the pilot's to
  handle on its thread, never a second gate1 (the twin rule stands).
- **L6 QA environment** (itm_907754ab155f): scratch decks on this machine (`pilot deck --scratch`), `npm test` on
  Windows, `node scripts/gate.mjs` five times in WSL as referee; no migrations.
- **L7 The pilot judges at the cut, sends after the last answer.** The Verdict pass still decides which A‹n› fork
  at cut time; the verdict message carries the final verdicts once every thread is closed.

## 6. Assumed decisions

- **A1 Every gate1 needs the record.** Default: any gate1 whose artefact has an A‹n›, pilot-posted included, must
  match the ticket's verdict record (decided by the pilot, not posted). Trades: a pilot posting a gate1 itself
  records first, 1 call. Rejected: architect-posted only (two rules; unrecorded verdicts pass).
    Verdict: stands — the pilot's own gate1s (trivial work, a re-cut) cost one `deck_ticket verdicts` call; one rule beats two, and nothing queued posts a gate1 another way
- **A2 At most 3 re-posts.** Default: after 3 refused posts the architect sends the last refusal to `main` and
  stops. Trades: a 4th fixable refusal costs the pilot a turn. Rejected: unbounded retry (a loop on a cause it
  cannot fix, such as an open pilot-owned question).
    Verdict: stands — three covers every fixable refusal seen this week (format, open question, stale tip); a fourth is a cause the pilot must clear

## 7. Out of scope

- Gate 2, the yellow conversion, and the `finished: "planned"` write: the pilot's.
- Re-posting a stored gate1 (`Not yet` handling is unchanged).
- The merge-decision rule's looseness (`mergeDecisionOf` counts any resolved architect item): untouched.

## 8. Slices

Width 2; longest stem 3

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | The architect posts a gate1 the pilot owns | 3, 5 | `deck/store-items.mjs`, `deck/items.mjs`, `deck/test/architect-gate1.test.mjs` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | `pilot verdicts` writes the lines from a message | 2 | `scripts/verdicts.mjs`, `bin/pilot.mjs`, `scripts/test/verdicts-write.test.mjs` (new), `fixtures/verdicts/message.txt` (new), `fixtures/verdicts/architecture.md` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S2](slices/S2.md) |
| S3 | A gate1 must match the pilot's verdict record | 4 | `deck/store-tickets.mjs`, `deck/store.mjs`, `deck/server-tools.mjs`, `deck/tools.mjs`, `deck/lineage.mjs`, `deck/test/gate1-verdicts.test.mjs`, `deck/test/verdict-record.test.mjs` (new) | S2 (`parseVerdictMessage`, `verdictsOf`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S3](slices/S3.md) |
| S4 | The contract in the agents and the rules | 1, 2, 3, 4, 6, 7 | `agents/pilot.md`, `agents/pilot-architect.md`, `rules/orchestration.md`, `scripts/shipped-rules.json`, `docs/adr/0169-the-architect-runs-red.md` (new), `docs/adr/README.md`, `scripts/test/architect-runs-red-wording.test.mjs` (new) | S1 (architect gate1 poster), S2 (`pilot verdicts`), S3 (`deck_ticket verdicts`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S4](slices/S4.md) |
| S5 | The rules ledger counts the commits a merge is bringing in *(added)* | 8 | `scripts/build-rules-ledger.mjs`, `scripts/test/rules-ledger.test.mjs` | – | `pilot:typescript-reviewer` | [S5](slices/S5.md) |
| S6 | A failed integrate never leaves the worktree mid-merge in silence *(added)* | 9 | `scripts/integrate.mjs`, its test | – | `pilot:typescript-reviewer`, `pilot:silent-failure-hunter` | [S6](slices/S6.md) |

S1 is the walking skeleton: an architect-stamped gate1 goes through the real tool and lands as the pilot's thread.

Red team: assumed the run failed and walked each first red step against the files.
- red team: S3's record rule breaks `deck/test/gate1-verdicts.test.mjs`'s accepting cases, which post a gate1 over a
  §6 with no record; S3 owns that file and adds the record to them. No other test posts a gate1 over a §6 in a real
  git repo (grep of `deck/test`, `scripts/test`).
- red team: S1 changes `ownerOf`; `deck/test/architect-owner.test.mjs` pins architect ownership of questions only,
  not gates, so it holds.
- red team: S4's pilot.md fallback (the pilot posting a gate1 itself) would be refused by S3 without a record; S4
  states the pilot records first (A1).
- red team: the `pilot verdicts` command and the prose naming it ship in the same plugin version, so no run sees one
  without the other.

## 9. Acceptance evidence

1. On a scratch deck, an architect-stamped gate1 posts and its thread reads owner `pilot` (S1).
2. `pilot verdicts` on the fixture artefact with the fixture message, then `git diff` shows one `Verdict:` line under
   each A‹n›; a short message exits 1 naming the id (S2).
3. On a scratch deck, a gate1 with one verdict differing from `deck_ticket verdicts` is refused naming the id; the
   matching one is accepted (S3).
4. The next real red: the pilot's transcript from last answer to gate1 shows at most 3 calls and 0 git calls; the
   draft feature PR, `feat/<slug>` worktree and gate1 exist, made by the architect (S4).
5. `npm test` green on Windows; `node scripts/gate.mjs` five times green in WSL.

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | – | – | – | – | 3, 5 |
| S2 | planned | – | – | – | – | 2 |
| S3 | planned | – | – | – | S2 | 4 |
| S4 | planned | – | – | – | S1, S2, S3 | 1, 2, 3, 4, 6, 7 |
| S5 | planned (added) | – | – | – | – | 8 |
| S6 | planned (added) | – | – | – | – | 9 |
| architect-runs-red | planned | feat/architect-runs-red | – | – | S1-S4 | 1-7 |
