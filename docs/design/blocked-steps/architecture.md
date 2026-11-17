# Fewer blocked steps for the user

Ticket `itm_a2aeb8349afc` · slug `blocked-steps` · base `feat/blocked-steps` off `pilot` · grilling depth *forks* (itm_4f2967190d87, closed on its default) · merged: `itm_df2038a49471` Audit F4 (merge thread `itm_49e8d67ca528`)

## 1. Problem

The user is pulled onto the deck for `Blocked:` threads that never needed them. In their words (2026-11-16):
"do we have a fix for all these silly command blocked threads that keep showing up because i know most of them
dont need a thread", and "is there a lower level solution to stop them from even happening at all".

The deck holds 96 `Blocked:` items. 35 of them (36 %) carry `Reason: Classifier unavailable`: auto mode got no
verdict, the agent reissued the call, it ran, and the thread was closed `Moot` or `Skip it` with nothing for the
user to do. The rest are real refusals (`[Merge Without Review]` 8, `[Irreversible Local Destruction]` 11, ...), a
few file-edit and scope questions posted under a `Blocked:` title (`itm_6e83087a5ea9`), and command spellings no
allow rule matches (`node bin/pilot.mjs deck --scratch`, thread `itm_0a0de97af48a`).

Merged from Audit F4: two scripts past 900 lines (`scripts/install-settings.mjs` 1018, `hooks/context-size-guard.js`
913) must be read whole to edit safely, and no bar stops them growing. This run edits the first.

## 2. Spec

| # | Behaviour | Evidence | Bar |
| --- | --- | --- | --- |
| 1 | A no-verdict denial (`reason` `Classifier unavailable`) of a pilot lane's call posts no `Blocked:` item; a second no-verdict of the same call in the same session within the 10-min window posts one as today; a real refusal posts at once as today. | `hooks/test/permission-denied.test.js`: one no-verdict then nothing → 0 posts; two → 1; one `[Merge Without Review]` → 1. | 0 items for a no-verdict whose reissue ran; 35 of the deck's 96 would not have been posted. |
| 2 | An agent given a no-verdict denial reissues the call once, in a response of its own, instead of recording a blocked step; a second no-verdict is a blocked step as today. *assumed (A2)* | the sentence in `pilot-co-pilot.md`, `pilot-implementer.md`, `pilot-qa.md`, `pilot-lander.md`; `measure-prompt` within every pin; `check-references` exit 0. | 4 definitions; 0 pins raised. |
| 3 | The cause is named with its source: a no-verdict is the classifier or its server failing, and Claude Code ignores a `PermissionDenied` hook's `retry` for it; a call batched with others can also lose its review (the harness's denial text, §3). Not ours to fix; we stop paying for it. | §3 "Cause", with URLs. | 1 cited answer per claim. |
| 4 | A refused file edit is one question to the user with its diff and default, never a `Blocked:` item: the `PermissionRequest` hook still refuses an `Edit`/`Write`/`NotebookEdit` prompt but posts nothing, and the pilot's hand-back rule (`agents/pilot.md:160`) excepts it. | `hooks/test/permission-refuse.test.js`: a crew `Edit` prompt → deny output, 0 posts; a `Bash` prompt → deny, 1 post. The pilot.md sentence. | 0 `Blocked:` items for a file edit. |
| 5 | The install allows the read-only pilot commands that drew the most no-verdicts, so auto mode never asks the classifier for them: `Bash(pilot wait)`, `Bash(pilot wait *)`, `Bash(pilot budget)`, `Bash(pilot tickets)`. *practitioner: a platform engineer pre-approves read-only tooling and leaves writes reviewed.* | `scripts/test/install-allow-reads.test.mjs` lists each rule once, nothing wider; `pilot doctor` names a missing one. | 4 rules; no `pilot *`, no `git` rule (A6, security). |
| 6 | The install allows the scratch deck in the source-tree spelling QA uses on a branch, `Bash(node bin/pilot.mjs deck --scratch *)`. *assumed (A3, security)* | the same test lists it; a QA `node bin/pilot.mjs deck --scratch …` in a real auto-mode session runs with no item. | exactly one rule; 0 items for that call. |
| 7 | The pilot branch name reads `PILOT_BRANCH` (default `pilot`), so a QA scratch clone lands on a scratch branch with no file edit; the default branch is still asked of the remote and the push guard is unchanged. *assumed (A4)* | `scripts/test/pilot-branch-env.test.mjs`: env set → `base`/`land` use it; env `main` on a repo whose default is `main` → refused; `pilot help` lists the env. | 0 edits to `scripts/pilot-branch.mjs` in a QA clone. |
| 8 | `scripts/install-settings.mjs` is under 800 lines, its permission steps in `scripts/install-permissions.mjs`; every name it exports today still imports from it. | `wc -l`; `npm test` unchanged green; the fold tests. | at most 760 lines. |
| 9 | `hooks/context-size-guard.js` is under 800 lines, cut against the file as handoff-mod lands it. *assumed (A7)* | `wc -l`; `npm test`. | at most 780 lines. |
| 10 | A line-bar test fails any `scripts/*.mjs` or `hooks/*.js` over 800 lines, naming the file. | `scripts/test/line-bar.test.mjs` red on a planted 801-line fixture dir, green on the tree. | 800. |

Draft line 2 ("the crew calls the allowed spelling", wording pins) is already true: `grep -r "node bin/pilot.mjs" agents/`
finds nothing on `pilot`. It is not cut (A5). The ticket's `PILOT_DEFAULT_BRANCH` is not built: it would feed
`assertPushable` (`scripts/pilot-branch.mjs:96`), which must keep asking the remote (L4 of pilot-branch).

## 3. Findings

**Where a `Blocked:` item comes from.**
- `hooks/permission-denied.js:44` `onDenied`: on `PermissionDenied`, a pilot lane's denial goes to `postBlocked` with `source: 'denied'` and the payload's `reason`. File tools already post nothing (`:46`, blocked-yellow-yields A5).
- `hooks/permission-refuse.js:67` `decide`: on `PermissionRequest`, a crew prompt (and the pilot's while a run is live) is denied and posted with `source: 'refused'`. It has no file-tool exception: the gap behind spec 4.
- `hooks/lib/blocked.js:116` `postBlocked`: one claim file per `(session, command)` (`claimPath :44`), 10-min window (`WINDOW_MS :35`); `commandOf` (`permission-denied.js:37`) keys a non-Bash call by tool name only, so two different `SendMessage` calls share a key.
- `agents/pilot.md:160`: "A blocked step the co-pilot hands back goes up `blocking` ... titled `Blocked: <command>`" — no file-edit exception, while `:162` says a refused file edit is one question. `itm_6e83087a5ea9` (author `pilot`) followed `:160`.
- `agents/pilot-co-pilot.md:94` "A refused call is never retried"; `agents/pilot-qa.md:239` "Any command the permission classifier denies: stop". Read literally, a no-verdict becomes a hand-back and a second, pilot-posted item.
- `deck/blocked-shape.mjs:27` `isMoot`: the pilot already closes these without the user; the user still sees each one.

**Cause** (spec 3).
- `https://code.claude.com/docs/en/permission-modes`, "How the classifier evaluates actions": "Actions matching your allow, ask, or deny rules resolve immediately"; on classifier or server failure Claude Code "denies the action rather than run it unreviewed", and stops the turn "after ten responses in a row with no verdict".
- `https://code.claude.com/docs/en/hooks`: `PermissionDenied` fires "including denials without a classifier verdict"; "Claude Code ignores `retry` when the classifier produced no verdict". So the hook cannot ask for the retry; it can only not post.
- Batching: one source, the harness's own denial text, seen 2026-11-17 on a `Bash` and a `SendMessage` each batched with deck reads (`itm_eeb36e699b66`, `itm_d0d4848405d4`, both `Reason: Classifier unavailable`): "another call in this response was changed after auto mode reviewed it, or could not be confirmed unchanged, so this call's review no longer applies ... Issue the … call again in a response of its own". So a batched call can lose its review, and the hook sees the same `reason` as an outage. No docs page says so; issue #52867 (parallel calls cancelled) is a different symptom; #97812 reports a no-verdict even on an allow-listed `ls` (A1).
- The deck: 35 items `Reason: Classifier unavailable`, among them `SendMessage` 6, `Agent` 2, `pilot wait` 6, `pilot budget` 4, the rest compound read-only `git`/`cd && {…}` lines. Every one closed `Moot` or `Skip it`.

**Allow rules.** `scripts/install-settings.mjs:620` `PILOT_MERGE_ALLOW` is the one list; `pilotMergeStep :634` writes it, leaves out a rule the user's deny or ask covers; `deck/doctor.mjs` reads the same export. `--repair` does not add rules: a user gets new ones by `pilot install`, and `pilot doctor` names the missing. Uninstall's `isOwnAllow` (`:706`) knows `Bash(pilot ` and the deck server only, so it would leave a `Bash(node bin/pilot.mjs …)` rule behind: S3 adds the prefix. Auto mode drops `Agent` allow rules on entry (permission-modes page), so no rule can cover the `Agent` no-verdicts; spec 1 covers them.

**Branch name.** `PILOT_BRANCH` is a constant (`scripts/pilot-branch.mjs:14`) imported by `base`, `integrate`, `land`, `branches`. `assertPushable :96` asks the remote for the default branch.

**F4.** `install-settings.mjs` groups: status line and settings I/O (`:54-312`), web-fetch rules (`:313-364`), `readablePermissions` (`:365`), web-fetch step (`:392`), enable-plugin (`:454`), deck tools (`:476-537`), default-branch ask (`:539-610`), pilot allow (`:612-678`), merge/remove/install/repair/CLI (`:686-1018`). `deck/doctor.mjs` and four tests import `PILOT_MERGE_ALLOW`, `denyCovers` from it. `context-size-guard.js`: marks and reading (`:68-328`), advice text (`:329-484`), deck lookups (`:485-724`), status line (`:777-849`). `deck/test/facades.test.mjs:18` bars `deck/` only, and handoff-mod edits that test, so the new bar is its own file.

**Overlap.** handoff-mod (`itm_97c9e8fdf1d2`) touches `hooks/lib/deck.js`, `hooks/post-tool.js`, `hooks/context-size-guard.js`, `deck/doctor.mjs` and, in its S11, `agents/pilot.md`; none of this run's hook files. itm_9b7008e91201 changes how an unanswered blocking item pauses, not how one is posted.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `postBlocked` (`hooks/lib/blocked.js`) | `postBlocked(step, deps) -> Promise<id \| null>`; `step.source` `'denied' \| 'refused' \| 'no-verdict'` | the first-sight marker for a no-verdict, beside the existing claim; a no-verdict's key widened to the tool input | local-substitutable (`deps.claims` dir, `deps.now`) |
| `onDenied` (`hooks/permission-denied.js`) | `onDenied(payload, deps) -> null`; exports `isPilotLane`, `commandOf`, `isFileTool` | the reason → source mapping; the file-tool test both hooks share | in-process |
| `decide` (`hooks/permission-refuse.js`) | `decide(payload, deps) -> hook output \| null` | the file-tool skip of the post (the refusal stands) | in-process |
| `install-permissions` (`scripts/install-permissions.mjs`, new) | `readablePermissions`, `denyCovers`, `webFetchRule`, `coveringRule`, `defaultBranchAskStep`, `pilotMergeStep`, `deckToolsStep`, `PILOT_MERGE_ALLOW`, `isOwnAllow`; each step `(settingsPath) => (settings) => result` | the permission steps out of `install-settings.mjs`, which imports and re-exports them; the read rules and the source-tree scratch rule | local-substitutable (settings file) |
| `guard-status` (`hooks/lib/guard-status.js`, new) | `statusRows(payload)`, `colourFor(used, size)` | the subagent status-line rendering | in-process |
| `guard-advice` (`hooks/lib/guard-advice.js`, new) | `advice(input, seen, marks, threshold, onDeck)`'s text helpers: `howFull`, `whatComesNext`, `handoffNowIfIdle`, `workAdvice` | the advice prose | in-process |
| `lineBar` (`scripts/test/line-bar.test.mjs`, new) | `overBar(dir, glob, bar) -> string[]` | one bar over `scripts/` and `hooks/` | in-process |
| `pilotBranch` (`scripts/pilot-branch.mjs`) | `PILOT_BRANCH` export, read once from `process.env.PILOT_BRANCH` | the env read and its `PLAIN` check | in-process |

Deepening: deleting `onDenied` puts payload parsing into the harness entry, so it stays; its file-tool list moves to an exported `isFileTool` so `decide` does not grow a second copy. Deleting `postBlocked` spreads claims over two hooks, so the no-verdict deferral lives in it, not in `onDenied`. Deleting `install-settings.mjs`'s permission steps moves nothing to callers (one caller, `installSettings`), so they are a cluster, not a seam of their own: folded behind `install-permissions` with one test file, in four fold slices of at most 100 moved lines (200 changed). The guard's two folds are the same shape.

## 4. Ubiquitous language

- **No-verdict**: a `PermissionDenied` whose `reason` is `Classifier unavailable`; the classifier never judged the call.
- **Refusal**: a denial with a verdict (`[Merge Without Review]`, ...) or a hook-refused prompt. Posts at once.
- **Reissue**: the same call again, once, in a response of its own.
- **Blocked item**: a `question` titled `Blocked: <command>`, `blocking` on the lane's ticket.
- **Source-tree spelling**: `node bin/pilot.mjs <subcommand>` run in a clone of this repository.

## 5. Locked decisions

- **L1 The fix is in the hooks, not the deck.** A no-verdict never reaches the deck the first time. Rejected: post, then close the item when the call runs (a `PostToolUse` lane): a thread the user saw and a deck write per call on the hottest hook path.
- **L2 A second no-verdict of the same call posts.** The window and claim stay `postBlocked`'s. Rejected: never post a no-verdict, which hides a classifier outage that lasts.
- **L3 The no-verdict key is the tool input, not the tool name**, so two different `SendMessage` calls are two calls. Rejected: tool-name keys, where one call's no-verdict would make the next one's post.
- **L4 New allow rules join `PILOT_MERGE_ALLOW`**, under the same deny/ask-wins rule and the same doctor check. Rejected: a second list and step. ADR NNNN amends ADR 0110 with the read rules.
- **L5 Folds move code and re-export it**; no fold renames or rewrites a function. Rejected: one 600-line move slice.
- **L6 Prompt lines are evidenced by `measure-prompt` and `check-references`**, not phrase pins, as audit-f2-f3 A1. Every pin holds: pilot 21, QA 29.5 tokens of headroom on `pilot`.
- **L7 QA environment** (the user, `itm_2dec98752ac9`): this machine, a scratch deck (`pilot deck --scratch`), a real auto-mode session.

## 6. Assumed decisions

Answered by the user on the default (2026-11-17): A3 `itm_c1ce6cc0018c` "Allow it", A4 `itm_b125f439a47b` "Build PILOT_BRANCH", A6 `itm_ad209e413535` "No git rules". Closed on their default at *forks* depth: A2 `itm_73786b7070e5`, A7 `itm_b60519b57037`. A1, A5 not posted (no fork).

- **A1 The "issue alone" line is not built as a cause fix.** Default: spec 2 tells an agent to reissue a no-verdict once, alone; no rule bans batching. Tradeoff: if batching does raise the no-verdict rate, the first call still fails and costs a turn (no thread). Rejected: a batching ban in five definitions with no source behind it (§3 Cause).
  Verdict: stands. Its reason is corrected by the pilot: a source does tie batching to no-verdicts (§3 Cause, the harness's denial text), but once S1 lands a first no-verdict costs one turn and no thread, so the ticket's "when a no-verdict would cost a Blocked item" never holds, and a ban would spend pilot.md's 21 tokens of headroom (L6).
- **A2 Agents reissue a no-verdict once.** Default: spec 2's sentence. Tradeoff: an agent retries a call the classifier never saw, which `co-pilot.md:94`'s "never retried" forbade; the classifier still reviews the reissue, so nothing runs unreviewed. Rejected: leave the prose, so a co-pilot hands a no-verdict back and the pilot posts it by hand.
  Verdict: stands. The harness's denial text itself asks for the reissue in a response of its own.
- **A3 The source-tree scratch rule is written (security).** Default: `Bash(node bin/pilot.mjs deck --scratch *)` in the user's settings. Tradeoff: in any repository with a `bin/pilot.mjs`, that file runs with no review when called with those words. Rejected: no rule, so QA's branch deck stays one item per run; or `PILOT_PLUGIN_ROOT=<dir> pilot deck --scratch`, which no allow rule matches by its prefix.
  Verdict: stands. The user pressed "Allow it" on `itm_c1ce6cc0018c`.
- **A4 `PILOT_BRANCH` is built.** Default: env, default `pilot`, checked by `PLAIN`, the push guard unchanged. Tradeoff: an env in a lane's shell picks which branch `land` writes. Rejected: QA edits the constant in its clone (one item per run).
  Verdict: stands. The user pressed "Build PILOT_BRANCH" on `itm_b125f439a47b`.
- **A5 Draft line 2 is dropped as delivered.** No agent spells `node bin/pilot.mjs`. Tradeoff: nothing pins it. Rejected: a pin for an absent string.
  Verdict: stands. The pilot's own grep of `agents/` on this branch finds no `node bin/pilot.mjs`.
- **A6 No `git` allow rule (security).** Default: allow only the four `pilot` reads. Tradeoff: a `git` read with no verdict still costs a reissue turn (no thread). Rejected: the draft's `git status/log/diff` rules: a user-level rule covers every repository on the machine, and those commands run a repository's configured fsmonitor, diff drivers and pager.
  Verdict: stands. The user pressed "No git rules" on `itm_ad209e413535`.
- **A7 The guard split stays in this run, after handoff-mod lands.** Default: S9, S10 wait for handoff-mod (`itm_97c9e8fdf1d2`) on `pilot`. Tradeoff: the feature PR can wait on that landing. Rejected: split now (conflicts), or a later ticket (F4 half done).
  Verdict: stands. handoff-mod's S1 spike stood at 0 of 3 on 2026-11-17 and a failed spike stops that run; if it stops, S9 starts from `pilot` as it is, with nothing to wait for.

## 7. Out of scope

- `gh` writes, pushes to `main`: the user's.
- A hook that closes a posted item when its call later runs (L1).
- Timeouts and pauses of unanswered blocking items (itm_9b7008e91201).
- Workspace trust for live-check dirs (`itm_e987bd9e61c4`; itm_9b7008e91201 line 12).
- The real refusals: they stay one item each.
- `deck/ui/deck.css` (1241 lines; F4 line 3) and the `deck/` bar in `facades.test.mjs`.

## 8. Slices

Width 5; longest stem 5

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Walking skeleton: a no-verdict whose reissue runs leaves no thread | 1, 3, 4 | `hooks/lib/blocked.js`, `hooks/permission-denied.js`, `hooks/permission-refuse.js`, `hooks/test/permission-denied.test.js`, `hooks/test/permission-refuse.test.js`, `hooks/hooks.json` | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | Agents reissue a no-verdict once, and a refused edit is never posted Blocked | 2, 4 | `agents/pilot.md`, `agents/pilot-co-pilot.md`, `agents/pilot-implementer.md`, `agents/pilot-qa.md`, `agents/pilot-lander.md` | – | `pilot:security-reviewer` | [S2](slices/S2.md) |
| S3 | The install allows the read-only pilot commands and the source-tree scratch deck | 5, 6 | `scripts/install-permissions.mjs`, `scripts/test/install-allow-reads.test.mjs` (new), `docs/INSTALL.md`, `docs/adr/NNNN-blocked-steps.md` (new) | S8 (`scripts/install-permissions.mjs`: `PILOT_MERGE_ALLOW`, `isOwnAllow`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S3](slices/S3.md) |
| S4 | A scratch clone lands on `PILOT_BRANCH` with no file edit | 7 | `scripts/pilot-branch.mjs`, `scripts/test/pilot-branch-env.test.mjs` (new), `bin/pilot.mjs` | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S4](slices/S4.md) |
| S5 | Fold: the shared permission helpers live in `install-permissions` | 8 | `scripts/install-permissions.mjs` (new), `scripts/install-settings.mjs`, `scripts/test/install-permissions.test.mjs` (new) | – | `pilot:typescript-reviewer` | [S5](slices/S5.md) |
| S6 | Fold: the default-branch ask step moves | 8 | `scripts/install-permissions.mjs`, `scripts/install-settings.mjs`, `scripts/test/install-permissions.test.mjs` | S5 (`scripts/install-permissions.mjs`) | `pilot:typescript-reviewer` | [S6](slices/S6.md) |
| S7 | Fold: the pilot allow list and the own-rule test move | 8 | `scripts/install-permissions.mjs`, `scripts/install-settings.mjs`, `scripts/test/install-permissions.test.mjs` | S6 (`scripts/install-permissions.mjs`) | `pilot:typescript-reviewer` | [S7](slices/S7.md) |
| S8 | Fold: the deck-tools step moves; `install-settings.mjs` under 800 | 8 | `scripts/install-permissions.mjs`, `scripts/install-settings.mjs`, `scripts/test/install-permissions.test.mjs` | S7 (`scripts/install-permissions.mjs`) | `pilot:typescript-reviewer` | [S8](slices/S8.md) |
| S9 | Fold: the guard's status line moves to `guard-status` | 9 | `hooks/lib/guard-status.js` (new), `hooks/context-size-guard.js`, `hooks/test/guard-status.test.js` (new) | – (starts once handoff-mod is on `pilot`, A7) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S9](slices/S9.md) |
| S10 | Fold: the guard's advice text moves to `guard-advice`; the guard under 800 | 9 | `hooks/lib/guard-advice.js` (new), `hooks/context-size-guard.js`, `hooks/test/guard-advice.test.js` (new) | S9 (`hooks/context-size-guard.js`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S10](slices/S10.md) |
| S11 | No script or hook grows past 800 lines unseen | 10 | `scripts/test/line-bar.test.mjs` (new) | S8 (`scripts/install-settings.mjs` under the bar), S10 (`hooks/context-size-guard.js` under the bar) | `pilot:typescript-reviewer` | [S11](slices/S11.md) |

S1 goes first by risk: it carries 35 of the 96 items and the only hook payload question (the exact `reason` string). S1, S2, S4, S5 start at once; S9 when handoff-mod is on `pilot`. Stem: S5 → S6 → S7 → S8 → S3 (and → S11). The four install folds move about 294 lines in at most 100 a slice (1018 → about 734).

Red team (I assumed the cut had failed and looked for why):
- red team: S1's first red step keyed on `reason === 'Classifier unavailable'`; the deck's four items reading "The server-side auto mode classifier judged this action dangerous (it gave no explanation)" are verdicts, not no-verdicts, so the match is exact, not a prefix. Written into S1.
- red team: S1 keyed by `commandOf` would let one `SendMessage` no-verdict mark the next; L3 and S1 test 3.
- red team: S2 changing `pilot-co-pilot.md:94` while S1 posts nothing would leave a co-pilot's no-verdict nowhere if the reissue also fails: L2's second-sight post covers it, so S2 has no `after` on S1 (no shared file or seam).
- red team: S3 and F4 both edit the install's rule list; S3 now writes into `install-permissions.mjs` after the folds, so a fold never moves a list S3 just changed. S3 before the folds would put its rules into a 1018-line file the bar then fails.
- red team: S3's node-spelling rule would survive uninstall (`isOwnAllow` knows `Bash(pilot ` only); S3 test 6.
- red team: `deck/doctor.mjs` and four tests import `PILOT_MERGE_ALLOW`/`denyCovers` from `install-settings.mjs`; each fold re-exports, and its gate is the unchanged suite.
- red team: a single 294-line move breaks the 200-changed-line fold cap; cut into S5-S8.
- red team: S9/S10 against today's guard would conflict with handoff-mod's edits; A7 holds them until it lands, and their line numbers are re-read then.
- red team: S11 extending `deck/test/facades.test.mjs` would collide with handoff-mod, which edits it; a new file.
- red team: seams half-built by two slices: `install-permissions` is built across S5-S8, each slice leaving a working, re-exported module; no slice depends on a half.

## 9. Acceptance evidence

1. In a real auto-mode session on a scratch deck, a crew call that gets `Classifier unavailable` and runs on its reissue leaves no `Blocked:` item; a `pilot land` from a co-pilot still posts one (spec 1).
2. A crew agent's refused `Edit` prompt reaches `main` as one question; the deck gains no `Blocked:` item (spec 4).
3. `pilot install` then `pilot doctor` list the five new rules; `pilot wait` and `node bin/pilot.mjs deck --scratch …` run with no item (spec 5, 6).
4. `PILOT_BRANCH=qa-scratch pilot base` in a scratch clone prints `base qa-scratch …`; `PILOT_BRANCH=main` is refused (spec 7).
5. `measure-prompt` within every pin; §3 Cause read (spec 2, 3).
6. `wc -l scripts/install-settings.mjs hooks/context-size-guard.js` both under 800; `node --test scripts/test/line-bar.test.mjs` green (spec 8-10).
7. The PR's Gate workflow green on the feature PR (slice PRs into `feat/**` get no CI run).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | slice/blocked-steps-s1 | – | – | – | 1, 3, 4 |
| S2 | planned | slice/blocked-steps-s2 | – | – | – | 2, 4 |
| S3 | planned | slice/blocked-steps-s3 | – | – | S8 | 5, 6 |
| S4 | planned | slice/blocked-steps-s4 | – | – | – | 7 |
| S5 | planned | slice/blocked-steps-s5 | – | – | – | 8 |
| S6 | planned | slice/blocked-steps-s6 | – | – | S5 | 8 |
| S7 | planned | slice/blocked-steps-s7 | – | – | S6 | 8 |
| S8 | planned | slice/blocked-steps-s8 | – | – | S7 | 8 |
| S9 | planned | slice/blocked-steps-s9 | – | – | – (handoff-mod on pilot) | 9 |
| S10 | planned | slice/blocked-steps-s10 | – | – | S9 | 9 |
| S11 | planned | slice/blocked-steps-s11 | – | – | S8, S10 | 10 |
| feature | planned | feat/blocked-steps | – | – | S1-S11 | 1-10 |
