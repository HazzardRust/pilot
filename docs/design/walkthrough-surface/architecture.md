# walkthrough-surface: a walkthrough only for a surface; every command step names where it runs

Ticket `itm_9e228d2d345e` (merged: itm_9698e873efd7) · slug `walkthrough-surface` · base `origin/pilot` 368eaa2a · depth: forks (itm_4cd733a3a2bc) · precondition: #885 (short-path) on `pilot`

## 1. Problem

Every full run gets a QA walkthrough before Gate 2, whether or not there is anything only a human can look at: "if it
is information that can fit in the gate 2 sign off, lets not have random walkthroughs." Merged in, on the steps that
remain: "we need to specify exactly where commands run, i hate having to hunt for where an agent wants me to run a
command" (a Git Bash grep in a walkthrough step failed in PowerShell, itm_d7b6fa5560c4).

## 2. Spec

Agreed by the user on itm_1298fd7dd93e (2026-10-20): all 11 lines; line 4 still rides on A1.

| # | Behaviour | Evidence (bar) |
| --- | --- | --- |
| 1 | Every gate1 names `surface: true` or `false` (true when some slice's evidence is something only the user can look at: a GUI, a picture, a plot, CLI output read by eye, a binary, a device, a notebook); the signed plan stores it, `false` included. *added: implied by "the plan marks"* | Deck tests: a 3-slice gate1 without `surface` refused naming `surface` (1); a signed plan reads `false` and `true` (2). |
| 2 | pilot-qa posts a walkthrough only when its ticket's plan has `surface: true`; otherwise it posts the gate2 on its evidence, the one press. | Wording pin on pilot-qa.md `## The procedure`; on the scratch deck, a fixture run with `surface: false` ends with 1 gate2 and 0 walkthrough items. |
| 3 | A full-run gate2 (plan of 3 slices or more) with no `walkthrough` carries QA's checks table: a head naming spec line, result and evidence, one row or more, each with all 3 cells filled; the deck refuses one lacking both, naming the table. *practitioner: release manager — a sign-off row without evidence is a gap* | Deck tests: accepted with a table (1); refused with neither (1); refused with an empty evidence cell (1). |
| 4 | A full-run gate2 on a plan with `surface: true` names its walkthrough, or says why there is none: a body line `surface planned, no walkthrough: <reason>`; refused with neither. *locked (L11)* | Deck tests: refused with a table, no walkthrough and no reason line (1); accepted with the reason line (1); accepted with a walkthrough (1). |
| 5 | The deck refuses QA's walkthrough on a ticket whose plan has `surface: false`, naming the plan's artefact; the pilot's wizard stages are untouched. | Deck tests: refusal contains `docs/design/<slug>/architecture.md` (1); the pilot's walkthrough on that ticket accepted (1). |
| 6 | A ticket signed before this lands (plan without `surface`), or with no plan, is unchanged. *added: existing data* | Deck tests: QA walkthrough and a bare gate2 accepted on a legacy plan (2); `qa-gate2` and short-path suites pass unedited. |
| 7 | pilot.md steps 8–9, pilot-qa.md, pilot-co-pilot.md's outcome row, OPERATING.md and a new ADR read the same: the walkthrough is conditional on `surface`. | `node scripts/check-references.mjs` exits 0; no pin raised for pilot, pilot-qa, pilot-co-pilot; a prose pin on the step 8 clause. |
| 8 | Every wizard and report step that is a command shows, on a prefix line above it, its shell (PowerShell, cmd, Git Bash, WSL or a named cloud CLI) and directory. | Render tests: a command step with shell and dir shows `<shell> · <dir>` (1); a prose step shows none (1); a scratch-deck wizard stage of 2 command steps looked at. |
| 9 | The deck refuses a command step whose item names no `dir`, naming the step; `shell` absent is filled with the platform default (PowerShell on Windows, the login shell elsewhere) and stored. *agreed (A3, itm_7c858c5d2317)* | Deck tests: refused with the step number (1); prose stage passes (1); default per platform (2); default stored (1). |
| 10 | A command is in the syntax of its shell: `grep -o`, `~/`, `export ` under PowerShell or cmd, and `$env:` under Git Bash, WSL or a POSIX shell, are refused naming the step and token. | Deck tests: 2 refusals, 1 match passes, 1 cloud CLI unchecked; the itm_d7b6fa5560c4 step reposted on a scratch deck and refused. |
| 11 | pilot.md, pilot-lander.md, the wizard skill, INSTALL.md and OPERATING.md name `shell` beside `dir`, the syntax rule and the per-platform default. | Prose pins (3); check-references exits 0; no pin raised for the pilot. |

Practitioner lines: a release manager signs off a checklist whose every row carries its evidence (3); a technical
writer labels every command block with its shell and prompt (8). Raw material: the last runs' records, §9 item 1.
Outside confirmation: the next real full run with `surface: false` shows 1 press and 0 walkthroughs.

## 3. Findings

- QA always posts: `agents/pilot-qa.md:155-157` "A feature with nothing to look at gets the body and Sign off alone, or
  one step at the closest observable thing." pilot.md is already conditional (`agents/pilot.md:488-490`, `:145`,
  `:498`); the co-pilot has outcome `nothing to walk` (`agents/pilot-co-pilot.md:103`). QA's prompt is the one that disagrees.
- A gate2's `walkthrough` is optional (`deck/items.mjs:234`); QA may post a gate2 on evidence alone
  (`agents/pilot-qa.md:226-227`); a gate2 body has no cap and markdown tables render (`deck/ui/markdown.mjs:213-240`).
- Walkthrough checks run by author (`deck/store-items.mjs:134`, ADR 0090 L3): QA's steps already refuse commands, so
  spec 8–10 bite the pilot's wizard stages and reports. `dir` exists and renders (`deck/items-bounds.mjs:176`,
  `deck/ui/render-parts.mjs:183-190`); `commandWord` (`deck/walkthrough-shape.mjs:19`) detects a command step.
- #885 (short-path, open) adds gate1 `surface`, required only at 2 slices or fewer, stored only when true (`planOf`),
  and `deck/short-path-shape.mjs` `shortGate2Gaps`, called once from `postItem`. This run stands on all three.
- Size: on #885 `deck/items.mjs` is 799 lines and `deck/store-items.mjs` 790 (800 bar, `deck/test/facades.test.mjs:18`).
- Pins: `measure-prompt` own share is definition plus deck tool schemas; headroom 0 for pilot, pilot-qa, pilot-architect.
  A `shell` schema property raises every pinned agent (S5 owns that raise).
- 20 test files post a gate1 without `surface` on #885; `withTicket` (`deck/testUtils.mjs:149`) builds most.
- QA's live pass on this package is a scratch deck (`agents/pilot-qa.md:95`).
- Overlap: #913 (plain-session) edits pilot.md, OPERATING.md and pins; S4 and S8 rebase on it.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `deck/gate2-evidence.mjs` (new) | `gate2EvidenceGaps(ticket, { body, walkthrough }) -> string[]`; `walkthroughPlanGaps(ticket, kind) -> string[]` | #885's `shortGate2Gaps` (from `deck/short-path-shape.mjs`, deleted), the full-run table and surface rules, the QA walkthrough refusal | in-process |
| `deck/step-shell.mjs` (new) | `defaultShell(platform, env) -> string`; `stepShellGaps(screens, { shell, dir }) -> string[]` | the dir refusal, the default, the syntax table | in-process |
| `deck/store-items.mjs` post | `postItem({ kind, surface?, shell?, dir?, … })` (existing) | `surface` required on every gate1, stored boolean; the shell default | local-substitutable (scratch store dir) |
| `deck/ui/render-parts.mjs` | `renderSteps(screens, { shell, dir })` (existing, widened) | the prefix line | in-process |
| crew prose | pilot-qa.md `## The procedure`; pilot.md `### 8.`; wizard skill field list, read by wording pins | when QA walks; where a command runs | prose pin |

Deletion test: `short-path-shape.mjs` is a one-function module read at the same call as the full-run rules; folded,
`store-items.mjs` keeps one call per kind and stays under its bar. `step-shell.mjs` earns its keep: deleted, the
default and syntax table land in a 790-line file. `walkthrough-shape.mjs` stays; it only exports `commandWord`.

## 4. Ubiquitous language

- **Surface**: something only the user can look at to judge; marked on the gate1 as `surface`.
- **Plan**: a signed gate1's references stored on the ticket (`ticket.plan`), `surface` among them.
- **Full run**: a ticket whose plan has 3 slices or more (not short path).
- **Checks table**: QA's `spec line | result | evidence` table, one row per spec line.
- **Walkthrough**: QA's look-for-taste item; distinct from the pilot's **wizard stage**, which shares the kind.
- **Command step**: a step `commandWord` finds a command in; it carries **shell** and **dir**.

## 5. Locked decisions

- **L1 `surface` required on every gate1.** The deck holds only what the plan states. Rejected: optional above 2 slices (cheaper by ~20 fixture lines; a forgotten flag uncaught).
- **L2 Absent `surface` is legacy, not false**; `planOf` stores `false`. Rejected: absent = false (breaks in-flight QA).
- **L3 Only a QA-authored walkthrough is refused on `surface: false`** (ADR 0090 L3). Rejected: every walkthrough (breaks a wizard stage on the ticket).
- **L4 One module for gate2 evidence**, folding #885's. Rejected: a sibling module (two shallow modules, two calls in a 790-line file).
- **L5 Short path keeps its own evidence** (`Verdict:`, `Gate:`); the table rule is full run only. Rejected: a table there too (moves #885's locked shape).
- **L6 The checks table stays in QA's PR comment**; the gate2 body carries it too when there is no walkthrough. Rejected: dropping the comment (the landing record reads it).
- **L7 Refusal wording reuses #885's** `a gate1 of <n> slices names surface: true or false`, so its test passes unedited.
- **L8 Depth: forks** (user, itm_4cd733a3a2bc): only decisions whose paths give materially different deliverables reach the user; the rest are assumed here.
- **L9 `shell` is per item, beside `dir`.** One stage runs in one place; a step needing another shell is its own stage. Rejected: a per-step label (a step grammar, more for every author to learn).
- **L11 A surface gate2 without a walkthrough says why** (user, itm_f40973b48d8c). Accepted with `surface planned, no walkthrough: <reason>` in its body, refused without; the flag is set at Gate 1, before the build, and the user sees the skip on the gate2. Rejected: refuse outright (A1).
- **L10 The default is the daemon's platform**, read where `postItem` runs, the user's machine. Rejected: the posting agent's (a cloud session would mislabel).

## 6. Assumed decisions

- **A1 A surface full run needs its walkthrough at gate2** (itm_f40973b48d8c). Default: refuse without, as short path does. Trade: a QA that died cannot be bypassed by the pilot's gate2; QA is resumed. Rejected: accept the table alone.
  Verdict: overturned: the user chose the stated-reason middle (L11); the surface flag is set before the build and a gate2 that says why it skipped the look keeps Not yet as the guard.
  overridden: a planned surface can reach Gate 2 unseen on QA's say-so; Not yet on the gate2 is the remaining guard.
- **A2 QA runs on a scratch deck** (itm_7fbba0795d52). **Answered: Scratch deck (user, 2026-10-20).** `pilot deck --scratch --seed-run`, fixtures for `surface` true, false and absent, and wizard stages in each shell. Trade: no real run's history. Rejected: the user's live deck.
  Verdict: stands — answered by the user; no live deck overlap.
- **A3 Shell defaults, dir is required** (itm_7c858c5d2317). **Answered: Default the shell (user, 2026-10-20).** The merged spec both refused a step without a shell and gave a default. Default: fill the platform's, refuse a missing `dir`; spec 10 still refuses a Git Bash grep under the PowerShell default. Trade: an agent can leave `shell` out silently. Rejected: require `shell` on every command stage.
  Verdict: stands — answered by the user; the every-step-names-shell ticket merged here, nothing else in the queue touches step shape.

red team: S2's required `surface` breaks 20 gate1 fixtures, so S2 owns them and `deck/testUtils.mjs`. S1 moves #885's file and cannot start before #885 is on `pilot`. S2 and S3 both write `gate2-evidence.mjs`; S3 comes after S2. S5's schema raises every pin while S4 must not raise any; S8 comes after S5 and S4. S6's `postItem` call shares `store-items.mjs` with S2; after S2. S7's `&&` under PowerShell dropped: PowerShell 7 takes it, a false refusal. S5 must not add a line to `items.mjs` (799).

## 7. Out of scope

- Short path's gate2 shape (#885). The report the deck fills (itm_6971c0f47a93). Detecting a surface from the diff.
- Commands in QA walkthroughs (refused today, ADR 0090). A shell list the deck refuses names against (any string up to 40 characters).

## 8. Slices

Precondition: #885 on `pilot` before S1 starts. Width 3; longest stem 4

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | One module holds a gate2's evidence | 6 | `deck/gate2-evidence.mjs` (new), `deck/short-path-shape.mjs` (deleted), `deck/store-items.mjs`, `deck/README.md`, `deck/test/gate2-evidence.test.mjs` (new) | – | typescript | [S1](slices/S1.md) |
| S2 | A plan marks its surface; QA cannot walk a plan without one | 1, 5, 6 | `deck/store-items.mjs`, `deck/gate2-evidence.mjs`, `deck/testUtils.mjs`, 20 gate1 fixtures, `deck/test/walkthrough-surface.test.mjs` (new) | S1 (`deck/gate2-evidence.mjs`, `deck/store-items.mjs`) | typescript | [S2](slices/S2.md) |
| S3 | A full-run gate2 without a walkthrough carries the checks table | 3, 4 | `deck/gate2-evidence.mjs`, `deck/test/gate2-checks-table.test.mjs` (new) | S2 (`deck/gate2-evidence.mjs`) | typescript | [S3](slices/S3.md) |
| S4 | The crew's prose says the walkthrough is for a surface | 2, 7 | `agents/pilot-qa.md`, `agents/pilot.md`, `agents/pilot-co-pilot.md`, `docs/OPERATING.md`, new ADR, `docs/adr/README.md`, `scripts/test/walkthrough-surface-wording.test.mjs` (new) | – | typescript, security | [S4](slices/S4.md) |
| S5 | A command step shows its shell and directory | 8 | `deck/items-bounds.mjs`, `deck/items.mjs`, `deck/tools.mjs`, `deck/walkthrough-shape.mjs`, `deck/ui/render-parts.mjs`, `scripts/test/measure-prompt.test.mjs`, `deck/test/step-prefix-render.test.mjs` (new) | – | typescript | [S5](slices/S5.md) |
| S6 | A command step without a directory is refused; shell defaults | 9 | `deck/step-shell.mjs` (new), `deck/store-items.mjs`, `deck/README.md`, `deck/test/step-shell.test.mjs` (new) | S2 (`deck/store-items.mjs`), S5 (`item.shell`, `commandWord`) | typescript | [S6](slices/S6.md) |
| S7 | A command in another shell's syntax is refused | 10 | `deck/step-shell.mjs`, `deck/test/step-shell-syntax.test.mjs` (new) | S6 (`deck/step-shell.mjs`) | typescript | [S7](slices/S7.md) |
| S8 | The crew names where every command runs | 11 | `agents/pilot.md`, `agents/pilot-lander.md`, `skills/wizard/SKILL.md`, `docs/INSTALL.md`, `docs/OPERATING.md`, `scripts/test/measure-prompt.test.mjs`, `scripts/test/step-shell-wording.test.mjs` (new) | S4 (`agents/pilot.md`, `docs/OPERATING.md`), S5 (`scripts/test/measure-prompt.test.mjs`) | typescript, security | [S8](slices/S8.md) |

Reviewers are `pilot:typescript-reviewer` and `pilot:security-reviewer`. S1 and S6 both list `deck/README.md`; S6 comes after S2, which comes after S1.
Walking skeleton: S1 folds the seam with behaviour kept; S2 is the first end-to-end cut (gate1 → plan → QA walkthrough refused).

## 9. Acceptance evidence

1. Scratch deck, a fixture full run signed `surface: false`: no walkthrough; its gate2 shows the checks table; Sign off is the one press (1, 2, 3).
2. QA's walkthrough on it refused, naming `docs/design/<slug>/architecture.md` (5).
3. A fixture signed `surface: true`: gate2 without its walkthrough refused; with one, accepted (4).
4. A legacy ticket (plan without `surface`) takes a walkthrough and a bare gate2 (6).
5. A wizard stage with two command steps: each shows `PowerShell · <dir>` above it (8); one without `dir` refused naming the step (9).
6. The itm_d7b6fa5560c4 Git Bash grep posted under PowerShell refused, naming the step and `grep -o` (10).
7. `node scripts/check-references.mjs` exits 0; `node scripts/measure-prompt.mjs` shows no agent over its pin; the ADR listed (7, 11).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | – | – | – | – | 6 |
| S2 | planned | – | – | – | S1 | 1, 5, 6 |
| S3 | planned | – | – | – | S2 | 3, 4 |
| S4 | planned | – | – | – | – | 2, 7 |
| S5 | planned | – | – | – | – | 8 |
| S6 | planned | – | – | – | S2, S5 | 9 |
| S7 | planned | – | – | – | S6 | 10 |
| S8 | planned | – | – | – | S4, S5 | 11 |
| walkthrough-surface | planned | feat/walkthrough-surface | – | – | S1–S8 | 1–11 |
