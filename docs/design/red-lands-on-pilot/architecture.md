# A red ticket lands on pilot before its Gate 2

Ticket `itm_bc0fbea3ab2b` · slug `red-lands-on-pilot` · cut from `pilot` at `26547862` · thread `itm_905b2760de27`

## 1. Problem

Overnight, a large yellow ticket (audit-f1-f7) stopped integrating because its slices waited
for earlier tickets' PRs (#445, #451) to land. Those tickets were red: finished, and waiting on
the user's walkthrough and Gate 2. A feature reaches `pilot` only at Gate 2 (ADR 0083 L14,
ADR 0111), so everything cut after it waits on the user. The user wants a finished feature
on `pilot` as soon as its yellow phase ends, so the next yellow ticket builds on it at once.
Gate 2 fixes then land on top, and the fix round resolves the conflicts. The goal is more
volume finished overnight.

## 2. Spec

| # | Behaviour | Evidence |
|---|---|---|
| 1 | A yellow ticket's feature lands on `pilot` at the end of its fix round. Step 7's "`pilot integrate` alone" becomes `pilot land`, run by the co-pilot. `pilot land` merges `feat/<slug>` into `pilot`: after `pilot sync`, it makes a merge commit in a temporary worktree at `origin/pilot`, runs the full test suite there, and pushes, never forced. A red run leaves `pilot` unmoved and says why. A ticket that goes red on a blocking question before its fix round lands nothing. The moment is *assumed* (A1). | On a scratch origin, `origin/pilot`'s tip is `Merge feat/a into pilot` with the feature tip as second parent, before any gate2 exists. A red test leaves `origin/pilot` unmoved and prints `NOT landed: … red`. The feature row reads `landed on pilot at <sha>`. |
| 2 | A wait on another ticket is never a slice blocker. check-slices refuses `#N` in `after:` with its own rule, `after-ticket`, and says why: a red ticket is on `pilot` already, and the order between tickets is the deck queue. | A check-slices test: `after: S3 (x), #445 on pilot` reports `after-ticket`. |
| 3 | Gate 2 fixes land as one more merge of `feat/<slug>` into `pilot` at the gate2 press: a new commit, never a rewind. `feat/<slug>` never takes a later feature: once a feature has landed, `pilot integrate` takes no base into it. On a conflict, `land` keeps its merge worktree and names it. QA resolves there with `resolving-merge-conflicts` and commits, and the next Sign off press tests that merge and pushes it. | A land test: A lands, B (cut on A) lands, A gains a fix and lands again as a second merge. `feat/a` never contains B's commit. `origin/pilot`'s reflog shows no forced update. A conflict test: exit 3 with the kept worktree named; after a resolving commit, `land` pushes it. |
| 4 | The feature PR stays a draft until the Sign off press, as today. Each landing comments `landed on pilot at <sha>` on it, and a failed comment does not fail the landing. `merge first` lists the open feature PRs that share a commit with this feature's head that is not on the default branch and whose first landing on pilot came before this one's (the earlier features it stands on, even after they re-land; revised on itm_f05ad052b4ec, S8), oldest landing first, each draft marked `#N (Gate 2 open)`. A PR never carries a later feature. The comment-instead-of-body is *assumed* (A4). | A land test with a fake gh: B's `merge first` is `#A (Gate 2 open)`, A's is `none` even with B on `pilot`, the comment carries the sha, and a failing comment still exits 0. |
| 5 | The definitions say when the landing happens and what a refusal does. A `NOT landed` at step 7 is a blocked step in the co-pilot's hand-back: QA gets the feature tip, and nothing waits on it. A `NOT landed` at the gate2 press goes to QA. A feature rejected at Gate 2 leaves `pilot` by a revert commit landed through the same press, a human step the closing report names. The prompt budgets hold. | Pins on `agents/pilot.md` steps 7 and 9 and the "Ending a run" human steps, and on `agents/pilot-co-pilot.md` "Steps 4 to 8". `measure-prompt` and `qa-preview` stay green with their bounds unmoved. |

## 3. Findings

| Finding | Where |
|---|---|
| `land()` today merges `pilot` into the feature (via `integrate()`), then pushes `feat/<slug>:pilot` as a fast-forward and retakes once if `pilot` moved. This is the shape the user overrode. | `scripts/land.mjs:58-89` |
| `sync()` is already the shape the user chose. It merges a ref into `pilot` in a temporary detached worktree at `origin/pilot`, runs `npm ci` and the tests, pushes `<sha>:refs/heads/pilot` never forced, reports a conflict's paths as exit 3, and removes the worktree. Its source is fixed to the default branch. | `scripts/sync.mjs:37-98` |
| `integrate()` cannot be reused for the landing: it merges into the checked-out branch and refuses `pilot` by name. It also takes `origin/pilot` into the feature on every call, which would carry a later feature into an earlier one. | `scripts/integrate.mjs:181`, `:211` |
| `mergeFirst` lists every open `feat/` PR whose head is on `origin/pilot` and not on the default branch. Under merges into `pilot`, a later feature's head is on `pilot` too, so the filter must become "an ancestor of this head". | `scripts/land.mjs:99-120` |
| The gate2 Sign off press lands from the deck. A `NOT landed` gate2 offers Sign off again. Step 9 routes a refusal "as a human step". | `deck/landing.mjs`; ADR 0111; `agents/pilot.md:479-481` |
| The co-pilot runs pilot.md steps 4–8 "as written". `Bash(pilot land *)` is allowed by the install. | `agents/pilot-co-pilot.md:27-29`; ADR 0110 |
| The audit-f1-f7 wait was its L12 plus `after` cells like `#445 on pilot`. `REASONED` already rejects those, with the generic `after-reason` message. | `origin/feat/audit-f1-f7:docs/design/audit-f1-f7/architecture.md:76`; `scripts/check-slices.mjs:23` on `pilot` (the main checkout is on `main`, which predates it; the plugin copy `…/pilot/0.8.1/scripts/check-slices.mjs:23` is the same) |
| Prompt shares at 26547862: pilot 10087.75 of 10088, pilot-qa 4357.25 of 4357.25, pilot-co-pilot 2046 with no pin. Two signed features also edit `agents/pilot.md`. | `scripts/test/measure-prompt.test.mjs:136`; `scripts/test/qa-preview.test.mjs:142` |

### What `land.mjs` changes

| Lines | Today | After |
|---|---|---|
| :1-13 | doc: take the tip into the feature, fast-forward | doc: merge the feature into `pilot` |
| :17-18 | imports `integrate`, `sync` | imports `sync`, `mergeIntoPilot` (S4) |
| :24 | `conflicts()` via `merge-tree` | removed: `mergeIntoPilot` names the conflicting paths |
| :58-89 | `integrate()` take, push `head:pilot`, retake once | push `head` (never forced), `mergeIntoPilot(<head sha>, 'Merge <head> into pilot')`, retry once when the push to `pilot` is rejected because it moved; already an ancestor of `pilot` → `already on pilot` (S5); a conflict keeps the worktree (S6) |
| :99-120 | `on(oid, pilot) && !on(oid, default)` | `isAncestor(oid, sha) && !on(oid, default)`, reads `isDraft` (S3) |

### Seams

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| `mergeIntoPilot` (`scripts/sync.mjs`, new export) | `mergeIntoPilot({ cwd, git, source, message, test, keep? }) -> { sha, merged, line, counts? }`, throws `{ exitCode: 3, paths, dir? }` | `sync.mjs:58-97`'s worktree, merge, install, test, push and cleanup. `sync()` and `land()` are its two callers. | 2, local-substitutable: real git on a scratch bare origin |
| `land` (`scripts/land.mjs`) | `land({ cwd, git, gh, test }) -> { head, sha, retried, mergeFirst, unknown?, commentFailed? }`; `main(argv, inject)` | the PR comment and the draft marker | 2, `gh` injected |
| `integrate` (`scripts/integrate.mjs`) | `integrate(branch, options)`, unchanged signature | skips the base take for a landed feature | 2 |
| `checkSlice` (`scripts/check-slices.mjs`) | `checkSlice(text) -> problem[]` | `after-ticket` | 1, in-process |
| Step text (`agents/pilot.md`, `agents/pilot-co-pilot.md`) | `### 7.`, `### 9. Gate 2 and ready`, `## Ending a run`, `## Steps 4 to 8`, the skills row `resolving-merge-conflicts` | nothing | 1 |

Deletion test: removing `mergeIntoPilot` would put the worktree, merge, test and push back
into both `sync` and `land`. It has two callers, so it is a real seam, and folding it is S4.

## 4. Ubiquitous language

- **Landing**: one `pilot land` run that pushes a tested merge of `feat/<slug>` into `pilot`.
- **Early landing**: a feature's first landing, at its fix round's tip, before its Gate 2.
- **Re-landing**: a later landing of a feature already on `pilot`, at the gate2 press, carrying its Gate 2 fixes.
- **Landed feature**: one whose `Merge feat/<slug> into pilot` is on `origin/pilot`'s first-parent history.
- **Land worktree**: the merge worktree `land` keeps on a conflict, for QA to resolve.
- **Merge first**: the open feature PRs this head stands on, which the user promotes first.

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
|---|---|---|---|
| L1 | The early landing is step 7's existing call: "`pilot integrate` alone" becomes `pilot land`, run by the co-pilot. | One word moves it for every yellow ticket. | The deck landing on `deck_ticket need`: ADR 0111 rejected an agent-callable path that lands. |
| L2 | `pilot land` merges `feat/<slug>` into `pilot`. The merge commit is made and tested in a temporary worktree at `origin/pilot` after `sync`, then pushed, never forced. A red run leaves `pilot` unmoved. The user chose this on itm_49d87121223d knowing `pilot` gains merge commits. | Merge queues, Gerrit/Chromium and trunk-based development keep the integration branch moving by merges and back out by revert. A feature PR then holds only its own work and what it was cut on. | The recommendation it overrode: merging `pilot` into the feature and fast-forwarding. That makes an earlier PR carry later, unsigned work that was never its own, which none of those practices do. |
| L3 | `sync`'s body is folded behind `mergeIntoPilot` and reused by `land`. | `sync` is already the merge-test-push-into-`pilot` shape. `integrate` targets the checked-out branch and refuses `pilot`. | Reusing `integrate`; a third copy of the worktree dance. |
| L4 | A `NOT landed` at step 7 is a blocked step. QA gets `feat/<slug>`'s tip, and the gate2 press retries the landing. | Nothing waits on a refusal. | Holding QA until the landing goes through. |
| L5 | A conflict keeps the land worktree, named in the line. At the gate2 press, step 9 sends the line to QA, who resolves there with `resolving-merge-conflicts` and commits. The next press tests that merge and pushes it. | The resolution lives in `pilot`'s merge commit, never in the feature. | QA merging `pilot` into the feature, which brings later work into it. A human step, which is today's behaviour. |
| L6 | Once a feature has landed, `integrate` takes no base into `feat/<slug>`. | A pivot's slices must not pull later features into an earlier PR. | Leaving it as it is. |
| L7 | `merge first` lists the open feature PRs whose head is an ancestor of this head, with drafts marked. `land` comments its sha on the PR; a failed comment does not fail the landing. | Under L2 a later head is on `pilot` too. `land` already calls `gh`, which the dontAsk lane may refuse to an agent. | Keeping the "on pilot" filter; the co-pilot running `gh pr comment`. |
| L8 | `agents/pilot.md` changes by net ≤ 0 bytes, paid for by the narrowed `resolving-merge-conflicts` row and by step 7 losing "alone". `pilot-qa.md` is untouched. | pilot has 0.25 tokens of headroom, QA none. | Raising a bound. |
| L9 | check-slices refuses `#\d+` in `after:` as `after-ticket`. | Every architect runs it, and it works offline. | Reading ticket states from the deck. |
| L10 | A feature rejected at Gate 2 leaves `pilot` by a revert commit landed through the same press, a human step the closing report names. `pilot` carries unsigned features by design. | The user's word (itm_c9862260276b). | Rewinding `pilot`. |
| L11 | Grilling depth is every fork (itm_3b199f2ec916). Overridden: every fork was recommended because a landing on `pilot` cannot be rewound. | The user held it after pushback. | — |
| L12 | QA runs on a scratch bare origin with its own `pilot` branch and a scratch deck on a free port with a temporary store (itm_7ddcd63dd799). It never touches this repository's `origin/pilot` or the deck on 4321. | Nothing a test lands can be rewound. | The live origin. |
| L13 | ADR 0114 records L2, L5, L6 and L10, amending ADR 0083 L14 and ADR 0111's refusal routing. | A structural change to what `pilot` is. | No ADR. |

## 6. Assumed decisions awaiting the user

| # | Default taken | Tradeoff |
|---|---|---|
| A1 | The early landing is at the fix round's tip, before QA's pass, not at the hand-back. | QA walks exactly what is on `pilot`, but `pilot` gets code before QA's machine checks run. |
| A4 | The "already on pilot" note is a PR comment per landing, not a line in the body. | Append-only, with no edit race, but less visible on the PR page. |

## 7. Out of scope

- Reordering the deck queue for cross-ticket dependencies.
- Automating a rejected feature's revert (L10).
- Resolving, on the default branch, a promotion conflict between a later PR and an earlier feature's Gate 2 fix: the user merges in `merge first` order.
- `pilot-qa.md`, `deck/landing.mjs` and `deck_ticket need`.
- itm_22ad234ca009 and itm_ede5c093eaf4 (merged none, itm_ab5456336ffa).

## 8. Slices

Width 4; longest stem 4

| Slice | Title | Spec | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|---|
| S1 | A finished yellow feature lands at its fix-round tip, and a refusal goes to QA (walking skeleton) | 1, 3, 5 | `agents/pilot.md` (steps 7, 9, Ending a run, skills row), `agents/pilot-co-pilot.md`, `scripts/test/integrate-base.test.mjs` (:231), `scripts/test/pilot-branch-rules.test.mjs`, `scripts/test/yellow-co-pilot.test.mjs`, `scripts/test/measure-prompt.test.mjs` (comment), `docs/adr/0114-…md` (new), `docs/adr/README.md` | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | check-slices names a cross-ticket wait | 2 | `scripts/check-slices.mjs`, `scripts/test/check-slices.test.mjs` | – | `pilot:typescript-reviewer` | [S2](slices/S2.md) |
| S4 | `sync`'s merge into `pilot` becomes `mergeIntoPilot` (fold) | 3 | `scripts/sync.mjs`, `scripts/test/merge-into-pilot.test.mjs` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S4](slices/S4.md) |
| S5 | `pilot land` merges the feature into `pilot` | 1, 3 | `scripts/land.mjs` (:1-89), `scripts/test/land.test.mjs` | S4 (`mergeIntoPilot`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S5](slices/S5.md) |
| S6 | A landing conflict keeps its worktree, and the next land pushes the resolution | 3, 5 | `scripts/land.mjs`, `scripts/sync.mjs` (`keep`), `scripts/test/land-conflict.test.mjs` (new) | S5 (`scripts/land.mjs`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S6](slices/S6.md) |
| S7 | A landed feature's integration takes no base | 3 | `scripts/integrate.mjs`, `scripts/test/integrate-landed.test.mjs` (new) | S5 (the `Merge <head> into pilot` message) | `pilot:typescript-reviewer` | [S7](slices/S7.md) |
| S3 | Merge first names what this head stands on; a landing comments on its PR | 4 | `scripts/land.mjs` (:99-131), `scripts/test/land.test.mjs` | S6 (`scripts/land.mjs`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S3](slices/S3.md) |
| S8 | Merge first names an earlier feature this head shares unmerged commits with (added, itm_f05ad052b4ec) | 4 | `scripts/land.mjs` (`mergeFirst`), `scripts/test/land.test.mjs` | S3 (`mergeFirst`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S8](slices/S8.md) |

S1, S2 and S4 start together. S1 is the skeleton: the landing moves to step 7 through
whatever `pilot land` is on `pilot` when the feature ships, and S4 → S5 → S6 → S3 changes
that command underneath it.

## 9. Acceptance evidence

On a scratch bare origin with its own `pilot` and a scratch deck (L12), in the order the user meets it:

1. A yellow ticket's fix round ends: `origin/pilot` gains `Merge feat/a into pilot`, the feature row reads `landed on pilot at <sha>`, and PR A carries the comment, all before any walkthrough or gate2 (spec 1, 4).
2. A second ticket's first `pilot integrate` takes A's code with no wait. `check-slices` refuses `after: #A` (spec 1, 2).
3. A walkthrough fix on A is committed and A's gate2 is signed. The press adds a second merge of `feat/a` on top of B. `feat/a` has none of B's commits, B's `merge first` is `#A`, and the reflog shows no forced update (spec 3, 4).
4. With a conflicting fix, the press reads `NOT landed: … resolve in <dir>`. QA resolves and commits there, and Sign off again lands (spec 3, 5).
5. `npm test` is green, including `measure-prompt` and `qa-preview` at unmoved bounds (spec 5).

## 10. Status

| Slice | State | Branch | PR | Worktree | Blockers | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 1, 3, 5 |
| S2 | planned | | | | – | 2 |
| S4 | planned | | | | – | 3 |
| S5 | planned | | | | S4 | 1, 3 |
| S6 | planned | | | | S5 | 3, 5 |
| S7 | planned | | | | S5 | 3 |
| S3 | planned | | | | S6 | 4 |
| S8 | planned (added) | | | | S3 | 4 |
| red-lands-on-pilot | planned | feat/red-lands-on-pilot | | | S1–S7 | 1–5 |
