# Fewer blocked steps for the user

Ticket `itm_a2aeb8349afc` · slug `blocked-steps` · base `feat/blocked-steps` off `pilot` · grilling depth *forks* (assumed until relayed)

## 1. Problem

The user is pulled onto the deck for `Blocked:` threads that never needed them. In their words (2026-11-16):
"do we have a fix for all these silly command blocked threads that keep showing up because i know most of them
dont need a thread", and "is there a lower level solution to stop them from even happening at all".

The deck holds 96 `Blocked:` items. 35 of them (36 %) carry `Reason: Classifier unavailable`: auto mode got no
verdict, the agent reissued the call, it ran, and the thread was closed `Moot` or `Skip it` with nothing for the
user to do. The rest are real refusals (`[Merge Without Review]` 8, `[Irreversible Local Destruction]` 11, ...), a
few file-edit and scope questions posted under a `Blocked:` title (`itm_6e83087a5ea9`), and command spellings no
allow rule matches (`node bin/pilot.mjs deck --scratch`, thread `itm_0a0de97af48a`).

## 2. Spec

| # | Behaviour | Evidence | Bar |
| --- | --- | --- | --- |
| 1 | A no-verdict denial (`reason` `Classifier unavailable`) of a pilot lane's call posts no `Blocked:` item; a second no-verdict of the same call in the same session within the 10-min window posts one as today; a real refusal posts at once as today. | `hooks/test/permission-denied.test.js`: one no-verdict then nothing → 0 posts; two → 1; one `[Merge Without Review]` → 1. | 0 items for a no-verdict whose reissue ran; 35 of the deck's 96 would not have been posted. |
| 2 | An agent given a no-verdict denial reissues the call once, in a response of its own, instead of recording a blocked step; a second no-verdict is a blocked step as today. *assumed (A2)* | the sentence in `pilot-co-pilot.md`, `pilot-implementer.md`, `pilot-qa.md`, `pilot-lander.md`; `measure-prompt` within every pin; `check-references` exit 0. | 4 definitions; 0 pins raised. |
| 3 | The cause is named with its source: a no-verdict is the classifier or its server failing, and Claude Code ignores a `PermissionDenied` hook's `retry` for it; no source ties it to batching. Not ours to fix; we stop paying for it. | §3 "Cause", with URLs. | 1 cited answer per claim. |
| 4 | A refused file edit is one question to the user with its diff and default, never a `Blocked:` item: the `PermissionRequest` hook still refuses an `Edit`/`Write`/`NotebookEdit` prompt but posts nothing, and the pilot's hand-back rule (`agents/pilot.md:160`) excepts it. | `hooks/test/permission-refuse.test.js`: a crew `Edit` prompt → deny output, 0 posts; a `Bash` prompt → deny, 1 post. The pilot.md sentence. | 0 `Blocked:` items for a file edit. |
| 5 | The install allows the read-only pilot commands that drew the most no-verdicts, so auto mode never asks the classifier for them: `Bash(pilot wait)`, `Bash(pilot wait *)`, `Bash(pilot budget)`, `Bash(pilot tickets)`. *practitioner: a platform engineer pre-approves read-only tooling and leaves writes reviewed.* | `scripts/test/install-allow-reads.test.mjs` lists each rule once, nothing wider; `pilot doctor` names a missing one. | 4 rules; no `pilot *`, no `git` rule. |
| 6 | The install allows the scratch deck in the source-tree spelling QA uses on a branch, `Bash(node bin/pilot.mjs deck --scratch *)`. *assumed (A3, security)* | the same test lists it; a QA `node bin/pilot.mjs deck --scratch …` in a real auto-mode session runs with no item. | exactly one rule; 0 items for that call. |
| 7 | The pilot branch name reads `PILOT_BRANCH` (default `pilot`), so a QA scratch clone lands on a scratch branch with no file edit; the default branch is still asked of the remote and the push guard is unchanged. *assumed (A4)* | `scripts/test/pilot-branch-env.test.mjs`: env set → `base`/`land` use it; env `main` on a repo whose default is `main` → refused; `pilot help` lists the env. | 0 edits to `scripts/pilot-branch.mjs` in a QA clone. |

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
- Batching: no source. Issue #52867 (parallel calls cancelled) is a different symptom; #97812 reports a no-verdict even on an allow-listed `ls`, against the docs (A1).
- The deck: 35 items `Reason: Classifier unavailable`, among them `SendMessage` 6, `Agent` 2, `pilot wait` 6, `pilot budget` 4, the rest compound read-only `git`/`cd && {…}` lines. Every one closed `Moot` or `Skip it`.

**Allow rules.** `scripts/install-settings.mjs:620` `PILOT_MERGE_ALLOW` is the one list; `pilotMergeStep :634` writes it, leaves out a rule the user's deny or ask covers; `deck/doctor.mjs` reads the same export. `--repair` does not add rules: a user gets new ones by `pilot install`, and `pilot doctor` names the missing. Auto mode drops `Agent` allow rules on entry (permission-modes page), so no rule can cover the `Agent` no-verdicts; spec 1 covers them.

**Branch name.** `PILOT_BRANCH` is a constant (`scripts/pilot-branch.mjs:14`) imported by `base`, `integrate`, `land`, `branches`. `assertPushable :96` asks the remote for the default branch.

**Overlap.** handoff-mod (`itm_97c9e8fdf1d2`) touches `hooks/lib/deck.js`, `hooks/post-tool.js`, `hooks/context-size-guard.js`, `deck/doctor.mjs` and, in its S11, `agents/pilot.md`; none of this run's hook files. itm_9b7008e91201 changes how an unanswered blocking item pauses, not how one is posted.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `postBlocked` (`hooks/lib/blocked.js`) | `postBlocked(step, deps) -> Promise<id \| null>`; `step.source` `'denied' \| 'refused' \| 'no-verdict'` | the first-sight marker for a no-verdict, beside the existing claim; a no-verdict's key widened to the tool input | local-substitutable (`deps.claims` dir, `deps.now`) |
| `onDenied` (`hooks/permission-denied.js`) | `onDenied(payload, deps) -> null`; exports `isPilotLane`, `commandOf`, `isFileTool` | the reason → source mapping; the file-tool test both hooks share | in-process |
| `decide` (`hooks/permission-refuse.js`) | `decide(payload, deps) -> hook output \| null` | the file-tool skip of the post (the refusal stands) | in-process |
| `PILOT_MERGE_ALLOW` (`scripts/install-settings.mjs`) | the exported rule list; `installSettings({ pilotMerge: true })` | the read rules and the source-tree scratch rule | local-substitutable (settings file) |
| `pilotBranch` (`scripts/pilot-branch.mjs`) | `PILOT_BRANCH` export, read once from `process.env.PILOT_BRANCH` | the env read and its `PLAIN` check | in-process |

Deepening: deleting `onDenied` puts payload parsing into the harness entry, so it stays; its file-tool list moves to an exported `isFileTool` so `decide` does not grow a second copy. Deleting `postBlocked` spreads claims over two hooks, so the no-verdict deferral lives in it, not in `onDenied`. No fold changes code on its own: no fold slice.

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
- **L5 No `git` allow rule.** A `git status`/`diff`/`log` runs the repository's configured fsmonitor, diff drivers and pagers, and a user-level rule covers every repository on the machine; spec 1 already removes their items. Rejected: the draft's `git status/log/diff` rules.
- **L6 Prompt lines are evidenced by `measure-prompt` and `check-references`**, not phrase pins, as audit-f2-f3 A1. Every pin holds: pilot 21, QA 29.5 tokens of headroom on `pilot`.
- **L7 QA environment** (proposed): this machine, a scratch deck (`pilot deck --scratch`), a real auto-mode session.

## 6. Assumed decisions

- **A1 The "issue alone" line is not built as a cause fix.** Default: spec 2 tells an agent to reissue a no-verdict once, alone; no rule bans batching. Tradeoff: if batching does raise the no-verdict rate, the first call still fails and costs a turn (no thread). Rejected: a batching ban in five definitions with no source behind it (§3 Cause).
- **A2 Agents reissue a no-verdict once.** Default: spec 2's sentence. Tradeoff: an agent retries a call the classifier never saw, which `co-pilot.md:94`'s "never retried" forbade; the classifier still reviews the reissue, so nothing runs unreviewed. Rejected: leave the prose, so a co-pilot hands a no-verdict back and the pilot posts it by hand.
- **A3 The source-tree scratch rule is written (security).** Default: `Bash(node bin/pilot.mjs deck --scratch *)` in the user's settings. Tradeoff: in any repository with a `bin/pilot.mjs`, that file runs with no review when called with those words. Rejected: no rule, so QA's branch deck stays one item per run; or `PILOT_PLUGIN_ROOT=<dir> pilot deck --scratch`, which no allow rule matches by its prefix.
- **A4 `PILOT_BRANCH` is built.** Default: env, default `pilot`, checked by `PLAIN`, the push guard unchanged. Tradeoff: an env in a lane's shell picks which branch `land` writes. Rejected: QA edits the constant in its clone (one item per run).
- **A5 Draft line 2 is dropped as delivered.** No agent spells `node bin/pilot.mjs`. Tradeoff: nothing pins it. Rejected: a pin for an absent string.

## 7. Out of scope

- `gh` writes, pushes to `main`: the user's.
- A hook that closes a posted item when its call later runs (L1).
- Timeouts and pauses of unanswered blocking items (itm_9b7008e91201).
- Workspace trust for live-check dirs (`itm_e987bd9e61c4`; itm_9b7008e91201 line 12).
- The real refusals: they stay one item each.

## 8. Slices

Width 3; longest stem 1

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Walking skeleton: a no-verdict whose reissue runs leaves no thread | 1, 3, 4 | `hooks/lib/blocked.js`, `hooks/permission-denied.js`, `hooks/permission-refuse.js`, `hooks/test/permission-denied.test.js`, `hooks/test/permission-refuse.test.js`, `hooks/hooks.json` | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | Agents reissue a no-verdict once, and a refused edit is never posted Blocked | 2, 4 | `agents/pilot.md`, `agents/pilot-co-pilot.md`, `agents/pilot-implementer.md`, `agents/pilot-qa.md`, `agents/pilot-lander.md` | – | `pilot:security-reviewer` | [S2](slices/S2.md) |
| S3 | The install allows the read-only pilot commands and the source-tree scratch deck | 5, 6 | `scripts/install-settings.mjs`, `scripts/test/install-allow-reads.test.mjs` (new), `docs/INSTALL.md`, `docs/adr/NNNN-blocked-steps.md` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S3](slices/S3.md) |
| S4 | A scratch clone lands on `PILOT_BRANCH` with no file edit | 7 | `scripts/pilot-branch.mjs`, `scripts/test/pilot-branch-env.test.mjs` (new), `bin/pilot.mjs` | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S4](slices/S4.md) |

S1 goes first by risk: it carries 35 of the 96 items and the only hook payload question (the exact `reason` string).

Red team (I assumed the cut had failed and looked for why):
- red team: S1's first red step keyed on `reason === 'Classifier unavailable'`; the deck's four items reading "The server-side auto mode classifier judged this action dangerous (it gave no explanation)" are verdicts, not no-verdicts, so the match is exact, not a prefix. Written into S1.
- red team: S1 keyed by `commandOf` would let one `SendMessage` no-verdict mark the next; L3 and S1 test 3.
- red team: S2 changing `pilot-co-pilot.md:94` while S1 posts nothing would leave a co-pilot's no-verdict nowhere if the reissue also fails: L2's second-sight post covers it, so S2 has no `after` on S1 (no shared file or seam).
- red team: S3 and the merge candidate F4 (`itm_df2038a49471`) both own `scripts/install-settings.mjs`; see the merge thread `itm_49e8d67ca528`.
- red team: seams half-built by two slices: none; `isFileTool` is built and used inside S1.

## 9. Acceptance evidence

1. In a real auto-mode session on a scratch deck, a crew call that gets `Classifier unavailable` and runs on its reissue leaves no `Blocked:` item; a `pilot land` from a co-pilot still posts one (spec 1).
2. A crew agent's refused `Edit` prompt reaches `main` as one question; the deck gains no `Blocked:` item (spec 4).
3. `pilot install` then `pilot doctor` list the five new rules; `pilot wait` and `node bin/pilot.mjs deck --scratch …` run with no item (spec 5, 6).
4. `PILOT_BRANCH=qa-scratch pilot base` in a scratch clone prints `base qa-scratch …`; `PILOT_BRANCH=main` is refused (spec 7).
5. `measure-prompt` within every pin; §3 Cause read (spec 2, 3).
6. The PR's Gate workflow green on the feature PR (slice PRs into `feat/**` get no CI run).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | slice/blocked-steps-s1 | – | – | – | 1, 3, 4 |
| S2 | planned | slice/blocked-steps-s2 | – | – | – | 2, 4 |
| S3 | planned | slice/blocked-steps-s3 | – | – | – | 5, 6 |
| S4 | planned | slice/blocked-steps-s4 | – | – | – | 7 |
| feature | planned | feat/blocked-steps | – | – | S1, S2, S3, S4 | 1-7 |
