# Pilot sessions tell the auto-mode classifier about the pilot's environment

Ticket itm_2295bb1ac43e (from itm_d3a5b3919505, thread itm_8ec05078e9df). Slug `classifier-env`. Branch
`design/classifier-env` from `origin/main` at `ffc8384`.

## 1. Problem

In auto mode the server-side classifier blocks, or gives no verdict on, actions a pilot session makes routinely:
commands in the sibling worktrees the pilot creates (`<repo>-feat-<slug>`, `<repo>-design-<slug>`), and deleting
regenerable build output there. It knows nothing of the pilot's environment. The user once ran a prompt that taught
the classifier about them in a plain Claude Code session and wants `pilot start` to do the same for pilot sessions,
so fewer actions are blocked: "can we get pilot deck to do that for the classifier so we get less blocked actions?"

## 2. Spec

*Proposed by the architect, taken by `main` as the working spec; assumed until Gate 1. Line 8 waits on
itm_1d8272a673d9.*

| # | Behaviour | Evidence | Bar |
| --- | --- | --- | --- |
| 1 | Every Start (the deck's Start and `pilot start`, all three reach levels) writes `autoMode.environment` into `start-settings.json`: `"$defaults"` first, then the pilot lines: the trusted repo is the one the session started in, its remotes, and its git worktrees beside it named `<repo>-*`; git-ignored build output inside them is regenerable. | test reads the written file per level | 3 of 3 levels; `environment[0] === "$defaults"`; 1 line names `<repo>-*`, 1 names git-ignored build output |
| 2 | The pilot lines are a constant: no path, repo name, branch or other string read from disk or the repo enters classifier prose (practitioner: security engineer, prompt injection). | test: Starts from two repos and two homes | 2 of 2 files byte-identical in `autoMode` |
| 3 | The block loosens no rule: `autoMode` carries `environment` only; every pilot line that speaks of deleting or removing names git-ignored output and a pilot worktree. | key-set test; prose lint over `CLASSIFIER_ENVIRONMENT` | key set exactly `["environment"]`; 0 lint failures |
| 4 | The user's `~/.claude/settings.json` is never written. | test: scratch home seeded with a user file carrying its own `autoMode`, a Start | 0 bytes changed after 1 Start |
| 5 | With `PILOT_CLASSIFIER_ENV=off` in its environment, a Start writes no `autoMode` key and the rest of the file unchanged. | test with the variable set and unset | zero `autoMode` keys; all other keys deep-equal (2 runs) |
| 6 | In a pilot session the block is in effect: `claude --settings <start-settings.json> auto-mode config` lists the pilot lines after the user's lines and the defaults; `claude auto-mode critique` is read once on them (practitioner: Claude Code's own critique tool as the outside reader). | run in S1 and once in QA, output in the PR | config `environment` length = user lines + 21 defaults + pilot lines; critique flags 0 pilot lines as ambiguous or over-broad |
| 7 | `docs/OPERATING.md` says what the block adds, that it loosens no rule, how to see it, and how to turn it off. | doc lint over the section | all 3 names present: `PILOT_CLASSIFIER_ENV`, `auto-mode config`, `"$defaults"` |
| 8 | *Assumed, itm_1d8272a673d9.* `pilot doctor` fails a row when the user-level `autoMode` sets a list without `"$defaults"`, and names `claude auto-mode reset`; it reads that file only. | test per state: absent, with, without | 3 verdicts: pass, pass, fail; settings bytes unchanged |

## 3. Findings

- `deck/run-env.mjs:23` `runSettings(level, pluginRoot, { home })` is the one composer of what a Start session
  carries (`agent`, `enabledPlugins`, below `everything` the status lines). `:38` `startSettingsFile(home)` is
  **one file per home**, `~/.claude/pilot/start-settings.json`, rewritten whole and renamed into place by
  `startArgs` (`:46`) on every Start in any repo. Callers: `deck/session.mjs:127` (`openPilot`, the deck's Start and
  `pilot start` on Windows; `env` is already a dep at `:116`) and `bin/pilot.mjs:286` (the POSIX line).
- Pinned by `deck/test/start-session.test.mjs:303` (file deep-equals `runSettings(level).settings`) and `:280`
  (the argv); neither pins the key set, so adding `autoMode` keeps both green.
- Claude Code 2.1.331, probed live: `claude --settings <file> auto-mode config` reads `autoMode` from a settings
  **file**; scopes concatenate: the user's 24 lines + 21 defaults (spliced at `"$defaults"`) + 1 probe line = 46.
  Allow with `"$defaults"` gave 16 + 1, so defaults are not doubled.
- Docs (code.claude.com/docs/en/auto-mode-config): `autoMode` is read from user, managed and `--settings` only,
  never project `.claude/settings*.json`; keys `environment`, `allow`, `soft_deny`, `hard_deny`, `classifyAllShell`;
  each section independent, so `environment` alone keeps the default rules; "Include `"$defaults"` in every list
  you set"; "by default the classifier trusts only the working directory and the current repo's remotes".
  Subagents run "with the same block and allow rules" as the parent (permission-modes), so one `--settings` block
  covers the whole crew. A `/bg` session keeps `--settings` (run-env.mjs:20).
- **Found, changes the request**: the user's own `~/.claude/settings.json:62` carries `autoMode.environment`, 24
  lines, no `"$defaults"`, generated from `C:\Users\jrylk`, saying "Trusted repo: ... no identifiable trusted
  repo". It replaced the default trust line in every session, plain ones too. Never written by this feature (spec
  4); the user's fix is `claude auto-mode reset` or `/auto-mode-setup` inside a repo. Spec 8 surfaces it.
- `deck/doctor.mjs:333` `allowRow({ readSettings })` is the pattern for a read-only row over user settings;
  `checkAll` (`:474`) already reads `settings` once (`:496`) and passes it to `modsRow`.
- Doc lint pattern: `scripts/test/operating-runbook.test.mjs` slices one `## ` section of OPERATING.md and asserts on it.
- ADR 0110 and INSTALL.md:209 already note the classifier refuses pilot commands it cannot read; their answer was
  allow rules in user settings, written by the installer with consent. This feature adds context, not rules.

### Seams

Deepening pass: `runSettings` passes the deletion test (without it the settings shape spreads over `openPilot` and
`start`); `startArgs` keeps the atomic write; `allowRow` is the row pattern. No shallow module on the path, so no
fold slice.

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `runSettings` (`deck/run-env.mjs`) | `runSettings(level, pluginRoot?, { home?, env? })`, `CLASSIFIER_ENVIRONMENT`, `CLASSIFIER_SWITCH` | the `autoMode` block, its constant prose, the off switch | in-process |
| `startArgs` (`deck/run-env.mjs`) | `startArgs(reach, { settingsFile?, home?, env? }) -> string[]` | writing the file whole; threading `env` to `runSettings` | local-substitutable (scratch home) |
| `autoModeRow` (`deck/doctor.mjs`) | `autoModeRow({ settings }) -> { name, verdict, detail, steps }` | which user lists lack `"$defaults"` | in-process |

## 4. Ubiquitous language

- **Classifier**: Claude Code's server-side auto-mode reviewer of each action.
- **Pilot lines**: the constant `CLASSIFIER_ENVIRONMENT` strings the Start appends after `"$defaults"`.
- **Start settings**: `~/.claude/pilot/start-settings.json`, the one file `--settings` names, rewritten each Start.
- **Pilot worktree**: a git worktree of the session's repository beside it, named `<repo>-*`.
- **Off switch**: `PILOT_CLASSIFIER_ENV=off` in the environment of the process that runs the Start.

## 5. Locked decisions

ADR NNNN (`docs/adr/NNNN-classifier-env.md`, written in S1) records L1-L4.

- **L1** The block goes only in the start settings, never user or project settings. Rationale: the draft's line,
  the user's file stays theirs; project files are ignored for `autoMode` anyway. Rejected: an installer step
  writing `~/.claude/settings.json` (reaches plain sessions, needs consent, and `auto-mode reset` deletes it).
- **L2** `"$defaults"` is the first entry. Rationale: the draft's "keeps the defaults" and the docs' caution; it
  also restores the default trust line the user's own block dropped. Rejected: pilot lines alone (would leave
  sessions with no default context when the user's block also omits it).
- **L3** A pilot worktree is defined by being a git worktree of the same repository, not by its name alone.
  Rationale (red team): a stranger's clone `pilot-fork` beside `pilot` matches `<repo>-*` but is not trusted.
  Rejected: name pattern alone (the draft's wording).
- **L4** Pilot lines are written in English prose in the docs' "describe to a new engineer" style, each with a
  bolded label as the default lines have, e.g. `**Trusted repo (pilot)**: ...`.

## 6. Assumed decisions

- **A1** Constant prose naming no repo; the classifier resolves `<repo>` from the working directory. Tradeoff: no
  literal path given. Rejected: a per-repo settings file with the sanitised path (a second file family, and the
  shared file would point a live session at the last-started repo). Asked: itm_e68bc690faee.
- **A2** Context only: `environment`, no `allow` rule. Tradeoff: if context alone does not unblock a build-output
  delete in `<repo>-feat-x`, it stays blocked until a follow-up. Rejected: a narrow allow rule (real loosening; an
  allow overrides a soft_deny). Asked: itm_b3d18023a002.
- **A3** Off switch is the environment variable `PILOT_CLASSIFIER_ENV=off`, read at the Start. Tradeoff: the deck's
  Start needs the deck restarted after `setx`. Rejected: a stored setting behind a new `pilot classifier` command.
  Asked: itm_fe2e6aa41d19. Closed by the deck, not the user: "Assumed: Env var (default) (no answer 20 min)".
- **A4** Spec 8, the `pilot doctor` row, `main`'s question itm_1d8272a673d9 (default yes). Cut as S3 with no edge, so
  a no drops S3 and nothing else. Closed by the deck, not the user: "Assumed: Warn in pilot doctor (no answer 20
  min)"; S3 and spec 8 stand.
- **A5** QA environment, `main`'s question itm_d24c3c01f382: a scratch home, plus one read-only
  `claude auto-mode config` against the real home. Tradeoff: the real start-settings.json is written only by the
  user's own Start. Rejected: QA running a Start against the real home. Closed by the deck, not the user:
  "Assumed: Scratch home + read-only look at the real one".
- **A6** Grilling depth: Every, assumed (itm_af228ea26e6d closed by the deck after 20 min, no answer); Gate 1 is a
  walk, one question per locked decision.
- red team: walked S1 behaviour 1 against `start-session.test.mjs:303`: it deep-equals the file to
  `runSettings(level).settings` under the test's own `process.env`; a CI or shell with `PILOT_CLASSIFIER_ENV=off`
  set would still pass, so S1's tests pass `env` explicitly. Walked the shared file: two Starts in two repos now
  write identical `autoMode` (A1), so a `/bg` session that re-reads the file sees no other repo. Found L3.

## 7. Out of scope

- Writing or repairing the user's `~/.claude/settings.json` autoMode block (the user's step; spec 8 only reports).
- Any `allow`, `soft_deny`, `hard_deny` or `classifyAllShell` entry (A2).
- Worktree removal, pushes, merges: not named in the ask; landing commands keep ADR 0110's allow rules.
- Plain (non-pilot) sessions.

## 8. Slices

Width 2; longest stem 2

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Walking skeleton: a Start writes the pilot lines into start-settings.json, with an off switch | 1, 2, 3, 4, 5, 6 | `deck/run-env.mjs`, `deck/session.mjs`, `deck/test/classifier-env.test.mjs` (new), `docs/adr/NNNN-classifier-env.md` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | OPERATING.md says what the block adds and how to turn it off | 7 | `docs/OPERATING.md`, `scripts/test/operating-classifier.test.mjs` (new) | S1 (`CLASSIFIER_SWITCH`) | `pilot:typescript-reviewer` | [S2](slices/S2.md) |
| S3 | `pilot doctor` fails when the user's autoMode drops the defaults | 8 | `deck/doctor.mjs`, `deck/test/doctor-automode.test.mjs` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S3](slices/S3.md) |

## 9. Acceptance evidence

1. `pilot start` in a repo opens the pilot as before (spec 1).
2. `~/.claude/pilot/start-settings.json` holds `autoMode.environment` with `"$defaults"` and the pilot lines; the
   user's `~/.claude/settings.json` hash unchanged (spec 1, 2, 3, 4).
3. `claude --settings ~/.claude/pilot/start-settings.json auto-mode config` lists user lines, 21 defaults, then the
   pilot lines; `claude auto-mode critique` remarks pasted in the PR (spec 6).
4. With `PILOT_CLASSIFIER_ENV=off`, a fresh Start's file has no `autoMode` (spec 5).
5. `pilot doctor` shows the autoMode row failing on today's user block, naming `claude auto-mode reset` (spec 8).
6. OPERATING.md's section read (spec 7).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 1, 2, 3, 4, 5, 6 |
| S2 | planned | | | | S1 | 7 |
| S3 | planned | | | | – | 8 |
| classifier-env | planned | feat/classifier-env | | | S1, S2, S3 | 1-8 |
