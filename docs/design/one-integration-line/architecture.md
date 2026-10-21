# One integration line: pilot

Ticket itm_d1054e1ebb14 · slug `one-integration-line` · base `origin/pilot` 54d11846 · ADR 0167 · stands on
`suite-at-landing` (ADR 0166, Gate 1 at 95702e9a)

## 1. Problem

A feature crosses four merge lines today: main→pilot (`pilot sync`, also inside `pilot land`), pilot→feat
(`pilot integrate`'s base), main→feat (`pilot integrate --default` before Gate 2) and feat→pilot (`pilot land`).
Each is a merge, a possible conflict, a suite run and a push race; the prose-concision landing failed on one. Then
the user merges each feature PR on main in merge-first order (8 open now, #827 to #882), and ADR numbers collide
between parallel runs (9 renumber commits in `git log --all`). The user wants one systematic change: pilot is the
one integration line, features land on it, main gets pilot, and ADR numbers are allocated at landing.

## 2. Spec

Sharpened from the ticket's five lines; line 3 is A1, answered by the user (itm_a5231c2c9d5c); 7 is added (found).

1. A gate2 posts at the feature's tip: the deck refuses a gate2 only when the tip conflicts with pilot
   (`cleanOnPilot`), never for lacking origin/main, and `pilot integrate --default` is gone; `pilot integrate
   --trial` pushes the tip and tries it on pilot. *Evidence: a deck test posts a tip behind origin/main; bar: 0
   `Merge origin/main into feat/` commits in a run's log.*
2. `pilot land` runs no sync: one merge (feat→pilot), one full suite, one push of pilot. *Evidence: a land test
   with origin/main ahead; bar: pilot gains exactly 1 commit, the feature's merge.*
3. main gets pilot (A1, the user's): the feature PR targets `pilot` and reads merged once the landing pushes; `pilot
   land` keeps one open PR `pilot → main`, opening it when none is open, and prints `main gets pilot: #<n>`; the
   closing report's first human step is "Merge #<n> with a merge commit". Merge-first, the ready step and its
   retry go. *Evidence: land tests with a fake gh; bar: `gh pr create` 1 time with none open, 0 with one open.*
4. The sync is main→pilot only, run at take (`pilot base` then `pilot sync`, `agents/pilot.md:199`, unchanged) or
   by hand, never inside a landing. practitioner: release engineer: right after the user merges the pilot→main
   PR, `pilot sync` prints `pilot already has main@<sha7>` and pushes nothing, because the merge would change no
   file. *Evidence: a sync test over a main that merged pilot; bar: 0 pushes.*
5. ADR numbers are allocated at landing: a run names its ADR `docs/adr/NNNN-<slug>.md` and cites it `ADR NNNN`;
   the landing's merge renames it to one past the highest number on the merged tree, rewrites its citations in the
   files the feature changed, regenerates `docs/adr/README.md`, then runs the suite. A feature carrying 2
   placeholders is refused. *Evidence: a land test where two features with `NNNN` land in sequence; bar: they get
   n+1 and n+2, `npm run adr-index` exits 0, no renumber commit.*
6. ADR 0140 is superseded by 0167; ADR 0083, 0154 (L4) and 0161 (L3) are amended with the reason; the crew, the
   rules, the ADR format, `docs/OPERATING.md` and `pilot help` say the same. *Evidence: wording pins;
   `check-references` and `adr-index` exit 0.*
7. Added (found): `adr-index` names a duplicate number; today two `0161` files read "missing from the index"
   (`scripts/adr-index.mjs:146`). *Evidence: a test with two files sharing a number; bar: 1 problem naming both.*
8. Added (found, from the pilot, 2026-10-19): the lander's closing `report` posts. `agents/pilot-lander.md:46` posts it with no body for the deck to fill from the record, and `deck/store-core.mjs:440` refuses an empty body; gate2 itm_995aef3419a5 landed at 42b6ba5 with its report refused (posted by hand as itm_f29a72323c90). Built in S3. *Evidence: a daemon test over a fixture record; bar: the empty-body report stored with the rendered body, 0 refusals.*
9. Added (found by the S2 implementer, 2026-10-19): a re-landing closes the feature PR the first landing left open. On the already-on-pilot path `land.mjs` runs no `comment`, so a feature PR against pilot whose first close failed stays open. Built in S8. *Evidence: a land fixture with the feature already on pilot and its PR open; bar: the PR is closed with the landing comment, and a closed PR or one against main gets no new comment.*

## 3. Findings

- `scripts/land.mjs:184` `landCaughtUp` runs `sync` first (l.186), then `mergeIntoPilot` of the feature, then
  `comment`, `ready` (readies the feat→main draft, l.282), `mergeFirst` (l.313, gh + pilot's first-parent log).
- `scripts/sync.mjs:53` `mergeIntoPilot` is the one tested merge onto pilot (sync, land, the trial with `push`
  false); `mergeResolved` (`scripts/merge-generated.mjs:216`) refreshes the generated ADR index before committing.
- `scripts/integrate.mjs:418` `takeDefault` merges origin/main into feat with `measurePins`, gates, pushes, reads
  GitHub's mergeable, then `trialOnPilot` (l.506) prepares the landing merge in `<checkout>-land-<slug>` for the
  lander. `measurePins` has no other caller.
- `deck/gate2-base.mjs:40` `holdsDefault` and `:78` `cleanOnPilot`, both enforced at `deck/server-tools.mjs:179`.
- `deck/landing.mjs:133-320` retries `pilot land --ready`; `deck/closing-report.mjs:35,69` parses the ready and
  merge-first lines; `deck/store-items.mjs:406` flags `pr ready failed:` and `merge first: unknown`.
- The feature PR is opened at Gate 1 against the default branch (`agents/pilot.md:360`, ADR 0083:18); nothing opens
  a pilot→main PR. `agents/pilot.md:494`, `agents/pilot-qa.md:228`, `agents/pilot-lander.md:61` name `--default`.
- ADR numbers: prose only (`skills/domain-modeling/ADR-FORMAT.md:10`, vendored, ledger `vendor/methodology.md:70`);
  `adr-index.mjs` matches `^\d{4}-` and checks no duplicate. `scripts/test/lander-adrs.test.mjs` pins 0154/0161 text.
- What 0154 and 0161 decide: 0154 the deck lands and retries ready (L4); 0161 the lander owns every merge, and its
  L3 says feat moves through `--default`. The main→feat merge itself is ADR 0140's; 0083 puts the feature PR on main.
- The deck on 4321 runs the installed plugin's `bin/pilot.mjs land` (`deck/landing.mjs:371`), not the feature's,
  so spec 2, 3 and 5 take effect after `claude plugin update`; this feature's own ADR therefore takes the real
  number 0167 (0165 deck-spawn-root's, 0166 suite-at-landing's), renumbered by hand on a collision as today.
- Stands on suite-at-landing: its S5/S6 change `runTests`/`testCommand` and `mergeIntoPilot`'s `since` (L8: full
  unless given `since`, only `sync` passes it), its S7 `comment`'s counts, S8 the crew prose, S9 OPERATING and help.
  Each slice below names the one it rebases on; none re-cuts those seams.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `scripts/land.mjs` | `land()`, `mainGetsPilot({ git, gh })`, `mainLine` | sync call, `ready`, `readyAlone`, `mergeFirst`, `askGh`, `deckGate2Prs`, `landBase` deleted | true external (`gh`, injected) |
| `scripts/sync.mjs` | `sync()`, `mergeIntoPilot({ ..., since })` → `{ sha, merged, line, counts, adr }` | the no-file-change check; the allocation call | local-substitutable (git fixture) |
| `scripts/adr-allocate.mjs` (new) | `allocateAdr(dir, { since })`, `PLACEHOLDER` | rename, citation rewrite, index refresh, amend | local-substitutable |
| `scripts/adr-index.mjs` | `checkIndex(dir)`, `nextNumber(dir)` | duplicate check, placeholder tolerance | in-process |
| `scripts/integrate.mjs` | `integrate(branch, { trial })`, `trialOnPilot` | `takeDefault`, `keepDefault`, `resumeDefault`, `mergeableOf` deleted | local-substitutable |
| `scripts/merge-generated.mjs` | `mergeResolved(dir, source, message, { side })` | `measurePins`, `resolvePin`, `measuredPilot` deleted | local-substitutable |
| `deck/gate2-base.mjs` | `cleanOnPilot`, `cleanRefusal` | `holdsDefault`, `refusalFor` deleted | local-substitutable |
| `deck/closing-report.mjs` | `closingReportOf(record, gate)` | the main line's step; `readyStep`, merge-first parse deleted | in-process |
| `deck/landing.mjs` | `startLanding` | the ready retry (`readyOwed`, `askReady`, `READY_DELAYS_MS`) deleted | true external (spawn) |

Deletion test: `landBase` and `ready` serve only the ready and merge-first steps, so they go with them;
`trialOnPilot` survives behind `--trial`, because it is what prepares a conflicted landing for the lander.

## 4. Ubiquitous language

- **Integration line**: `pilot`; every merge a feature makes after its cut goes onto it, once.
- **Landing**: `pilot land`'s one tested merge of `feat/<slug>` into pilot, and its push.
- **Main PR**: the one open PR `pilot → main`; its merge is how main gets pilot.
- **Placeholder ADR**: `docs/adr/NNNN-<slug>.md`, one per feature, cited `ADR NNNN`.
- **Allocation**: the landing's rename of the placeholder to the next free number, citations included.
- **Trial**: `pilot integrate --trial`, the feature tip tried on pilot before its gate2.

## 5. Locked decisions

- **L1** Depth: forks only (itm_234366650dde, user). Questions go up only where paths fork.
- **L2** Scope covers `deck/gate2-base.mjs`, `server-tools.mjs`, `closing-report.mjs`, `store-items.mjs`,
  `rules/vertical-execution.md`, `rules/orchestration.md` and `skills/domain-modeling/ADR-FORMAT.md` (main, on the
  user's "an actual change, not a rule"). Rejected: leaving the main-merge check in the deck.
- **L3** suite-at-landing's seams are used as they land: `mergeIntoPilot` stays full unless given `since`; removing
  the sync leaves the feature merge the landing's one full run with no change to its call. Rejected: a `full` flag.
- **L4** Allocation runs inside `mergeIntoPilot`, on a merge it will push, after the merge (or the lander's reused
  one) and before the suite, amending that merge commit, so pilot still moves by one tested merge (ADR 0161 L10).
  The trial's prepared merge (`push` false) allocates nothing. Rejected: a renumber commit on feat before the
  merge (a second push, and a race with the next landing).
- **L5** `--trial` keeps the pre-gate2 push and the prepared `-land-` merge, so the lander and `cleanOnPilot`'s
  prepared-merge path are unchanged. Rejected: dropping the step (a conflicted gate2 would be refused with nothing
  prepared for the lander).
- **L6** The feature's own ADR is 0167 and supersedes 0140; the deck lands it with the installed plugin's land.

## 6. Assumed decisions

- **A1** main gets pilot through one open PR `pilot → main` the user merges when they like; feature PRs target
  pilot. The user took the default, "One pilot→main PR" (itm_a5231c2c9d5c, 2026-10-19). Tradeoff: one review on main instead of one per feature, for no merge-first
  order and no conflict pilot already resolved coming back on GitHub. Rejected: feat→main PRs with merge-first.
    Verdict: stands — the user took the default; one PR to merge instead of N in merge-first order, and the #576 conflict cannot recur.
- **A2** `--default` is replaced by `--trial`, not kept under its old name: push, `trialOnPilot`, print
  `on pilot: clean at <sha7>` or the lander's conflict line (exit 3); GitHub's mergeable read goes. Rejected:
  `--default` doing the trial (a name that says main).
    Verdict: stands — a trial merge-tree on pilot is the check the gate2 actually needs; `--default` goes with the main line it served.
- **A3** `sync` skips a main whose merge changes no file (`git merge-tree --write-tree` equals pilot's tree), so
  pilot never takes the empty merge of its own PR, squash-merged or not. Rejected: pushing that empty merge.
    Verdict: stands — a sync that would change no file pushing nothing is what the user sees as "pilot already has main".
- **A4** Allocation rewrites `ADR NNNN` and `NNNN-<slug>` in the files the feature changed, and the bare word
  `NNNN` inside changed `docs/adr/*.md` (front matter); nothing outside the feature's diff, since
  `ADR-FORMAT.md` documents the placeholder itself. Rejected: rewriting the whole tree; numbered placeholders.
    Verdict: stands — rewriting only feature-changed files bounds the blast radius; two placeholders refusing is the right failure.
- **A5** The feature PR reads merged when pilot's push contains its head (GitHub's rule, not confirmed from its docs
  by research); `land` reads its state and closes it with the landing comment if it stays open. Rejected: relying
  on GitHub alone; marking it ready before the push.
    Verdict: stands — GitHub marks a PR merged when its head becomes reachable from its base by any push; land's close-with-comment covers the case it does not.
- **A6** The main PR is opened ready, titled `main gets pilot`, body listing nothing; under a run remote other than
  origin or `none` land prints `main gets pilot: open a PR from <remote>/pilot to main by hand` and opens none.
  Rejected: a fork-head `gh pr create` (untested path).
    Verdict: stands — a ready pilot→main PR is the one merge the user makes; a fork or no remote printing the by-hand line fails safe.
- **A7** No migration: the open feat→main PRs close themselves as merged when the main PR's merge brings their heads
  onto main (A5's rule); features in flight keep their PR base. Rejected: retargeting them by script.
    Verdict: stands — the 8 open feat→main PRs belong to yellow tickets the installed lander closes today; they read merged once main gets pilot, no migration needed.
- **A8** `measurePins` is deleted with its only caller; a pin conflict at the landing goes to the lander as any
  conflict. Rejected: moving the rule into the landing merge (a measured value inside an unattended merge).
    Verdict: stands — a removal with its only caller; the lander already owns conflicts at landing.
- red team: S8's first red step against `mergeIntoPilot` found the reuse path skips the merge block, so an
  allocation placed beside `mergeResolved` would miss the lander's resolution: L4 places it after both.
- red team: `adr-index` on a feature branch ignores `NNNN-*.md` (`^\d{4}-`), but 0140's `superseded_by: [NNNN]`
  would fail the supersession check before landing: S7 accepts `NNNN` links when a placeholder file exists.
- red team: S2 and S3 would each half-build the `main gets pilot:` line; S2 exports `mainLine`, S3 parses that shape.
- red team: removing `--default` breaks `bin/pilot.mjs` help pins and three prompt pins at once; help goes to S10,
  the prompt pins to S9, both after S5, so no slice leaves the other's pin red.
- red team: a grep for the removed lines found 10 more tests pinning `merge first`/`ready:` output (land-clear,
  land-remote, lander-wording, pilot-branch-rules, seven deck landing tests): each is owned by the slice that
  removes the line it pins (S2, S3, S9), so no slice leaves another's test red.
- red team: editing the vendored `ADR-FORMAT.md` fails `check-provenance` unless its ledger row says so: S9 owns
  `vendor/methodology.md`.

## 7. Out of scope

- The suite selection itself (suite-at-landing); CI and the Linux referee.
- Trivial work's one PR to the default branch (`agents/pilot.md:192`): it stays, and the take's sync brings it in.
- The short path and the architect's red run (itm_3f18af072438, itm_7168f2dafd64), queued separately.
- Retargeting or closing today's open feat→main PRs (A7).

## 8. Slices

Width 5; longest stem 3

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | The landing runs no sync | 2 | `scripts/land.mjs`, `scripts/test/land.test.mjs` | – | typescript | [S1](slices/S1.md) |
| S2 | The landing keeps one PR from pilot to main | 3 | `scripts/land.mjs`, `scripts/test/land-main-pr.test.mjs` (new), `scripts/test/land-ready.test.mjs` (deleted), `scripts/test/merge-first.test.mjs` (deleted), `scripts/test/land-merge-first.test.mjs` (deleted), `scripts/test/land-offline.test.mjs`, `land.test.mjs`, `land-clear.test.mjs`, `land-remote.test.mjs` | S1 (`land.mjs`) | typescript, security | [S2](slices/S2.md) |
| S3 | The deck's report says merge the main PR | 3, 8 (added) | `deck/closing-report.mjs`, `deck/landing.mjs`, `deck/store-items.mjs`, `deck/test/landing-ready.test.mjs` (deleted), `deck/test/land-again.test.mjs`, `deck/test/closing-main-pr.test.mjs` (new), seven landing and report tests (slice file) | S2 (`mainLine`) | typescript | [S3](slices/S3.md) |
| S4 | A gate2 posts at the feature's tip | 1 | `deck/gate2-base.mjs`, `deck/server-tools.mjs`, `deck/README.md`, `deck/test/gate2-base.test.mjs` | – | typescript, security | [S4](slices/S4.md) |
| S5 | `pilot integrate --trial` replaces `--default` | 1 | `scripts/integrate.mjs`, `scripts/merge-generated.mjs`, `scripts/test/integrate-default.test.mjs` (deleted), `scripts/test/integrate-trial.test.mjs`, `scripts/test/merge-generated.test.mjs` | – | typescript, security | [S5](slices/S5.md) |
| S6 | Sync pushes nothing when main has only pilot | 4 | `scripts/sync.mjs`, `scripts/test/sync-noop.test.mjs` (new) | – | typescript | [S6](slices/S6.md) |
| S7 | `adr-index` names a duplicate number and knows the placeholder | 7 | `scripts/adr-index.mjs`, `scripts/test/adr-index-placeholder.test.mjs` (new) | – | typescript | [S7](slices/S7.md) |
| S8 | The landing allocates the ADR number | 5, 9 (added) | `scripts/adr-allocate.mjs` (new), `scripts/sync.mjs`, `scripts/land.mjs`, `scripts/test/adr-allocate.test.mjs` (new), `scripts/test/land-adr.test.mjs` (new) | S2 (`land.mjs`), S6 (`sync.mjs`), S7 (`nextNumber`) | typescript | [S8](slices/S8.md) |
| S9 | The crew, the rules and the ADR format name one line | 6 | `agents/pilot.md`, `agents/pilot-qa.md`, `agents/pilot-lander.md`, `agents/pilot-architect.md`, `rules/vertical-execution.md`, `rules/orchestration.md`, `skills/domain-modeling/ADR-FORMAT.md`, `vendor/methodology.md`, `scripts/test/three-lanes-qa-wording.test.mjs`, `scripts/test/measure-prompt.test.mjs`, `scripts/test/qa-preview.test.mjs`, `scripts/test/one-line-wording.test.mjs` (new), `lander-wording.test.mjs`, `pilot-branch-rules.test.mjs` | S2 (`mainLine`), S5 (`--trial`) | typescript, security | [S9](slices/S9.md) |
| S10 | The docs, the help and ADR 0167 | 6 | `docs/OPERATING.md`, `bin/pilot.mjs`, `docs/adr/0167-pilot-is-the-one-integration-line.md` (new), `docs/adr/0140-a-gate2-holds-the-default-branch.md`, `docs/adr/0083-the-pilot-owns-a-branch.md`, `docs/adr/0154-gate2-frees-the-lane.md`, `docs/adr/0161-the-lander-owns-every-merge.md`, `docs/adr/README.md`, `scripts/test/lander-adrs.test.mjs`, `scripts/test/one-line-docs.test.mjs` (new) | S2 (`land --ready` gone), S5 (`--trial`) | typescript | [S10](slices/S10.md) |

S1 is the walking skeleton: `pilot land` on a fixture with main ahead lands with one merge and no sync line. Stems:
S1→S2→S3, S1→S2→S8, S1→S2→S9, S1→S2→S10, 3 each; S4, S5, S6, S7 start beside S1.
Rebases on suite-at-landing: S1, S2, S8 on its S7 (`land.mjs`); S5 on its S6 (`integrate.mjs`); S6, S8 on its S6
(`sync.mjs`); S9 on its S8 (crew prose); S10 on its S9 (OPERATING, help, README with 0166).

## 9. Acceptance evidence

0. QA updates the installed plugin from the feature (`claude plugin update`), since the deck lands with it.
1. QA runs `pilot integrate --trial` in a feature worktree behind origin/main: `on pilot: clean at <sha7>`, no
   main merge in `git log` (spec 1); a gate2 at that sha is accepted by a scratch deck (spec 1).
2. `pilot land` in a fixture with main ahead: one `Merge feat/<slug> into pilot`, no sync line (spec 2), and
   `main gets pilot: #<n>`; run again with that PR open, the same number and no new PR (spec 3).
3. A scratch closing report's first human step reads "Merge #<n> with a merge commit" (spec 3).
4. After a fixture main merges pilot, `pilot sync` prints `pilot already has main@<sha7>` (spec 4).
5. Two fixture features each with `docs/adr/NNNN-x.md` land in turn and read `0168-x.md`, `0169-y.md` with their
   citations rewritten, `npm run adr-index` clean (spec 5); a duplicate number is named by `adr-index` (spec 7).
6. `node scripts/check-references.mjs` exits 0; ADR 0140 reads superseded by 0167 (spec 6).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | `slice/one-integration-line-s1` | – | – | – | 2 |
| S2 | planned | `slice/one-integration-line-s2` | – | – | S1 | 3 |
| S3 | planned | `slice/one-integration-line-s3` | – | – | S2 | 3 |
| S4 | planned | `slice/one-integration-line-s4` | – | – | – | 1 |
| S5 | planned | `slice/one-integration-line-s5` | – | – | – | 1 |
| S6 | planned | `slice/one-integration-line-s6` | – | – | – | 4 |
| S7 | planned | `slice/one-integration-line-s7` | – | – | – | 7 |
| S8 | planned | `slice/one-integration-line-s8` | – | – | S2, S6, S7 | 5 |
| S9 | planned | `slice/one-integration-line-s9` | – | – | S2, S5 | 6 |
| S10 | planned | `slice/one-integration-line-s10` | – | – | S2, S5 | 6 |
| one-integration-line | planned | `feat/one-integration-line` | – | – | S1–S10 | 1–7 |
