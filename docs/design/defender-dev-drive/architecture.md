# defender-dev-drive: a Windows host is told about Defender before it pays for it

Ticket `itm_2cde11b40d8a`. Merge thread `itm_d6b1857e13e6`: merged none (itm_c570093cafb5 touches INSTALL.md's
owner pins only; itm_8a85a7dbe884 lives in deck/run.mjs). Base `pilot` at fef95d6c. Grilling depth: forks (L7).

## 1. Problem

On Windows, Defender's real-time scan opens every file a gate reads before the gate does. Pilot uses many
worktrees, runs `npm ci` and has five-minute test suites, so the scanner eats the CPU and the machine crawls.
`pilot doctor` can already say so, but nothing runs it. The install does not mention it, and neither does a
run. The user wants the advice in the install and in the run's wizard, before they pay for the slowdown.
They will set up their own Dev Drive.

## 2. Spec

The user agreed these 5 lines on itm_9eee7dc2f4df. Lines 2 and 3 still carry A1 (the trigger, itm_df94aa952930) and A2.

practitioner: a Windows developer running pilot from an ordinary, non-administrator shell, as every agent does.

| # | Behaviour | Evidence |
|---|---|---|
| 1 | `pilot doctor defender` prints exactly 1 row, the Defender row (its 2 steps the exclusion first, L8), byte-identical to the one `pilot doctor` prints under the same probes. It exits 1 on `fail` and 0 otherwise. | a test comparing both outputs under one faked probe; one test per verdict (3: pass, fail, cannot tell) |
| 2 | `pilot doctor defender due` exits 0 and prints the exclusion step, then the Dev Drive upgrade (2 lines, in that order, L8), only when all 3 hold: the platform is win32, the row is `fail` or is `cannot tell` with real-time scanning on, and no advice marker exists. Otherwise it exits 1 with 1 line naming why: `not due: not windows`, `not due: pass`, `not due: advised <where> <date>`. *assumed* (A1) | one test per reason; a probe that throws if called proves 0 probes run off Windows and 0 run once a marker exists |
| 3 | `pilot doctor defender advised <where>` writes the advice marker, where `<where>` is `install` or a deck item id. After it, `due` exits 1. Any other `<where>` exits 2 and writes nothing. *assumed* (A2) | a due → advised → due test; a refusal test on a bad `<where>`; the marker read back |
| 4 | docs/INSTALL.md's step 4a, on Windows only, runs `pilot doctor defender`. On `fail` or `cannot tell` it shows the user the 2 printed steps, the exclusion first and the Dev Drive in performance mode as the upgrade (L8), both for the user to do as administrator. It then records `pilot doctor defender advised install`. The "What this changes" and "Running this again" tables each gain 1 row. | a wording pin in a new scripts/test; `node scripts/check-references.mjs` exits 0; the command run in this worktree prints `cannot tell  Defender: …` |
| 5 | agents/pilot.md step 1 runs `pilot doctor defender due`. On exit 0 it posts exactly 1 `walkthrough` (the wizard's shape: `Stage 1/1`, the 2 printed steps as its screens, exclusion first), then records `advised <item id>`. On exit 1 it posts nothing. | a wording pin on step 1; spec 2 and 3's tests carry "the first run posts, the second run posts nothing"; measure-prompt's pin moved by exactly the clause's cost |

Not meant here: pilot changing Defender, creating a volume or elevating to administrator. The doctor stays read-only
(process-gc L12).

## 3. Findings

- **The row exists.** `deck/doctor.mjs:94` `checkScanner({platform, run, root})` (exported) returns a state and lines.
  `defenderRow` (:135, private) maps the state to a verdict through `SCANNER_VERDICT` (:132): `off`, `excluded`,
  `dev-drive` and `not-windows` pass, `not-excluded` fails, and `unknown` is `cannot tell`. `steps(root)` (:85) ends every
  non-pass row with the Dev Drive step, then `Add-MpPreference -ExclusionPath '<root>'`; L8 reverses that order. Tests:
  `deck/test/doctor.test.mjs:34-133`. Spec 1 of the draft was therefore delivered by process-gc; what is missing is a
  way to reach the row alone.
- **A non-administrator never sees `fail`.** I ran both probes on this machine. Real-time protection reads `True`;
  `Get-MpPreference` answers `N/A: Must be an administrator to view exclusions`; and `fsutil devdrv query C:` answers
  `Access is denied`. So `checkScanner` returns `unknown`, which is `cannot tell`. The draft's "post on fail" would
  post nothing on the user's own machine (A1).
- **Dispatch.** `bin/pilot.mjs:332` calls `doctor()` with no arguments. The help text (:144) describes the whole doctor.
  `scripts/test/operating-commands.test.mjs:12` lists `doctor` as non-moving, so it needs no OPERATING row.
- **Precedent for "offer once".** `pilot audit due` / `pilot audit offered <key>` (`deck/audit.mjs:292-430`). The CLI
  decides and records; the pilot agent posts. The store is `storeDir()` (`deck/store-dir.mjs:15`), and
  `PILOT_DECK_DIR` isolates it in tests.
- **The wizard's walkthrough is unchecked.** `deck/store-items.mjs:133` applies `walkthroughShapeGaps` to QA's
  walkthroughs only, so a pilot walkthrough may carry the `Add-MpPreference` line.
- **Prompt budget.** `scripts/test/measure-prompt.test.mjs` pins agents/pilot.md's measured size. A clause added to
  step 1 moves it.
- **INSTALL.md** is `docs/INSTALL.md`, with steps 1-10, a precedent `6a.`, the "What this changes" table (:13) and the
  "Running this again" table (:283). Its pins are in `scripts/test/install.test.mjs`.

### Seams

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| `deck/doctor.mjs` Defender | `checkScanner`, `defenderRow` (exported), `defenderDue`, `markAdvised`, `main({args})` | the verdict mapping, the marker read and write, and the order of checks (platform, then marker, then probe) | true external (PowerShell, fsutil) behind the injected `run`; local-substitutable store under `PILOT_DECK_DIR` |
| `bin/pilot.mjs` doctor dispatch | `pilot doctor [defender [due \| advised <where>]]` | argument passing only | in-process |
| `docs/INSTALL.md` step 4a | the step's heading and its 2 commands | none | prose, pinned by wording |
| `agents/pilot.md` step 1 Defender clause | the clause's 2 commands and the walkthrough's shape | none | prose, pinned by wording |

Deletion test: `checkScanner` is deep, because deleting it spreads the probes into every caller, so it stays.
`defenderRow` is thin but holds the verdict mapping that both callers must share, so it is exported, not
inlined. No fold changes code beyond that, so there is no fold slice.

## 4. Ubiquitous language

- **Defender row**: the one line, plus its indented steps, that `defenderRow` renders: `pass`, `fail` or `cannot tell`.
- **Projects root**: the parent of the repository (`projectsRoot`), the folder the advice is about.
- **Advice marker**: `<store>/defender-advised.json`, `{ where, at }`. It is per machine, written
  once the user has been shown the steps.
- **Due**: the advice is owed. That means Windows, a `fail` row or a `cannot tell` row with scanning on, and no
  advice marker.
- **The two steps**: the exclusion first, then the Dev Drive in performance mode as the upgrade (L8), as `steps(root)` prints them.

## 5. Locked decisions

- **L1** The CLI decides, prints and records; the pilot agent posts the walkthrough. This follows `pilot audit
  due`/`offered`. Rejected: the CLI posting through `deck/client.mjs`. It would be a new posting path with no
  precedent, and the wizard's prose would no longer be the pilot's.
- **L2** `due` checks the platform first, then the marker, then probes. On a machine already advised, step 1 costs no
  PowerShell call (the probes take up to 15 s each). Rejected: probing first, which pays that cost on every run.
- **L3** The walkthrough's screens are `due`'s printed lines, copied verbatim, so the two steps have 1 source
  (`steps(root)`). Rejected: wording the steps again in pilot.md.
- **L4** The walkthrough names no `ticket` and is not `blocking`. The advice is about the machine, not this run, and
  must never hold a gate.
- **L5** An unreadable or malformed marker reads as absent, so the advice is shown again. Being advised twice costs a
  click; never being advised costs the slowdown.
- **L6** No ADR: an advisory read and a one-file marker after an existing precedent lock nothing structural.
- **L7** Grilling depth: forks (itm_5c5043c5d40e). Only a decision whose paths give materially different deliverables
  reaches the user as an item of its own.
- **L8** *(the user, itm_3917e36b4424)* The exclusion leads and the Dev Drive is the upgrade, in `steps(root)` and so
  in every caller. The exclusion is 1 admin cmdlet, `Add-MpPreference -ExclusionPath <projects root>`. It is the largest
  cut, reversible with `Remove-MpPreference`, and gives up scanning of that tree, postinstall scripts included. The
  Dev Drive works on Home as a VHDX on C: with no repartition, 50 GB and admin. It takes about 5 steps plus moving the
  worktrees and the npm cache, keeps scanning on but deferred, and is about 25% faster by Microsoft's figure. A process
  exclusion is no safer, and nothing else throttles real-time scanning. Sources: learn.microsoft.com on dev-drive,
  Defender performance mode and Add-MpPreference. Rejected: the Dev Drive first with the exclusion as the fallback (the
  ticket's wording), for its friction.

## 6. Assumed decisions

- **A1** *(posted by the pilot as the spec frontier)* `due` fires on `fail` or on `cannot tell` with real-time
  scanning on. Default: both. Tradeoff: a user who already made an exclusion, but runs pilot without admin, is told
  once, needlessly. Rejected: `fail` only, which never fires from a non-admin shell, as this machine shows.
  Answered: "Fail, or cannot tell with real-time on" (itm_df94aa952930).
  Verdict: stands — the user took the default.
- **A2** One marker per machine, shared by the install and the wizard: whichever advises first silences the other.
  Tradeoff: a user who ignores the install's advice gets no second prompt from a run. Rejected: a marker per
  projects root, which would advise again after a move onto a Dev Drive, since a non-admin still reads `cannot tell`.
  Verdict: stands — no other run touches the store's markers; one per machine matches the user's "once per machine" reading on itm_df94aa952930.
- **A3** `due` and `advised` are verbs under `pilot doctor defender`, not a new top-level command. Tradeoff: a
  3-word command. Rejected: `pilot defender due`, which adds a help entry and an OPERATING classification.
  Verdict: stands — pilot help already groups doctor; nothing queued adds a top-level verb.

red team: the strongest case against this design is that `cannot tell` is the normal answer, so the "check" mostly
says "maybe". The advice then rests on a guess. The design answers it by firing once per machine (A2), and by the
walkthrough saying plainly that pilot cannot see the answer without an administrator. It does not claim a fault.
The case against L1 is that an agent may skip the clause. It is answered by the wording pin and by `due` being one
command whose exit code decides.

## 7. Out of scope

- Changing Defender, creating or formatting a Dev Drive, moving repositories, and elevating to administrator.
- A non-admin way to detect a Dev Drive (none found: `fsutil devdrv query` is refused).
- Other scanners, other platforms, and re-advising after time passes.

## 8. Slices

Width 2; longest stem 3 (S1 → S2 → S3).

| # | Title | Spec | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|---|
| S1 | Walking skeleton: `pilot doctor defender` prints the Defender row alone, exclusion first | 1 | `deck/doctor.mjs`, `bin/pilot.mjs`, `deck/test/doctor-defender.test.mjs` (new), `deck/test/doctor.test.mjs`, `docs/OPERATING.md` | – | ts, security | [S1](slices/S1.md) |
| S2 | `due` says whether the advice is owed, `advised` records it once | 2, 3 | `deck/doctor.mjs`, `bin/pilot.mjs`, `deck/test/doctor-advised.test.mjs` (new) | S1 (`deck/doctor.mjs`, `bin/pilot.mjs`) | ts, security | [S2](slices/S2.md) |
| S3 | The install walks a Windows user to an exclusion, or a Dev Drive | 4 | `docs/INSTALL.md`, `scripts/test/install-defender.test.mjs` (new) | S1 (`pilot doctor defender`), S2 (`advised`) | ts | [S3](slices/S3.md) |
| S4 | A run's step 1 posts the Defender wizard once per machine | 5 | `agents/pilot.md`, `scripts/test/pilot-defender-wizard.test.mjs` (new), `scripts/test/measure-prompt.test.mjs` | S2 (`due`, `advised`) | ts, security | [S4](slices/S4.md) |

## 9. Acceptance evidence

1. On this Windows machine, a non-admin shell in the feature worktree runs `node bin/pilot.mjs doctor defender`. It
   prints 1 row, `cannot tell  Defender: …`, with the 2 steps indented below, and it is the same row `pilot doctor`
   prints.
2. Following INSTALL.md step 4a shows the user the 2 steps, the exclusion first, and writes the marker with `where: install`.
3. With the marker removed (a scratch `PILOT_DECK_DIR`), `pilot doctor defender due` exits 0 and prints the 2 steps.
   A pilot session's step 1 posts 1 walkthrough on the scratch deck. A second session's step 1 posts nothing, and
   `due` prints `not due: advised itm_… <date>`.
4. On Linux CI, `due` prints `not due: not windows` and the test proves no probe ran.

## 10. Status

| Slice | State | Branch | PR | Worktree | Blockers | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 1 |
| S2 | planned | | | | S1 | 2, 3 |
| S3 | planned | | | | S1, S2 | 4 |
| S4 | planned | | | | S2 | 5 |
| defender-dev-drive | planned | feat/defender-dev-drive | | | S1–S4 | 1–5 |
