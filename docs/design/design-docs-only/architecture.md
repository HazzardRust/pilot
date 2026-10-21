# A design branch is pilot plus docs commits only

Ticket itm_7397a07f0e86, with itm_70316ba6afe7 (the architect cuts slices for the graph) merged
into it on the merge thread itm_360b0769d28a. Base `pilot` 178c7e5e.

## 1. Problem

On 2026-10-08 `pilot integrate` could not take the `pilot` base for feat/walkthrough-taste:
13 conflicting files. The design branch had been re-anchored twice by replaying pilot's commits
onto it, so it carried 87 patch-equivalent copies of pilot's history beside 9 real docs commits,
and Gate 1 cut the feature branch from that. Nothing said how to re-anchor, nothing refused the
gate1, and integrate's failure line did not say why. The user: "let us think of the systematic
change that needs to happen first. rebase and force-push. yes and".

Merged in: the architect cuts slices as one chain by habit. The user wants the cut made for the
graph, as many independent stems as the files allow, each wait line justified, and the width shown
at Gate 1 ("the architect should be able to optimise the creation of slices for this system").

## 2. Spec

Agreed by the user on itm_196ba3065083, all seven lines.

| # | Behaviour | Evidence |
| --- | --- | --- |
| 1 | The architect re-anchors its design branch only with `git rebase origin/pilot` (its docs commits onto pilot's tip), never by merging, cherry-picking or replaying pilot's commits onto it. | A wording pin on `agents/pilot-architect.md` "Where you work"; in the QA scratch repo `git cherry origin/pilot design/<slug>` after a re-anchor prints only `+` lines. |
| 2 | The deck refuses a `gate1` whose design branch does not have pilot's tip as an ancestor, or carries any commit patch-equivalent to one of pilot's; the refusal names the branch, the copy count when it is not 0, and the fix `git rebase origin/pilot`. A branch merely behind pilot is refused with the same fix. | A deck test posting a gate1 for a fixture branch carrying one copied pilot commit is refused with that line; one for a branch cut from pilot's tip posts. |
| 3 | When `pilot integrate` fails to take the base, its one line ends `; <n> of <branch>'s commits are copies of pilot's` when n > 0, and says nothing of copies when n is 0. | An integrate test against a fixture with copied commits reads the count in the failure line; a conflict fixture with none has no count. |
| 4 | The architect cuts for width: slices that share no owned file and no seam get no `after` between them, and a stem is as long as its shared files make it, never longer. | A wording pin on §8 of `agents/pilot-architect.md`; QA runs the architect once by hand on a three-surface fixture brief and reads three roots (L10). |
| 5 | Every `after` says why: each blocker is written `S<n> (<shared file or seam>)` in the slice file's header line and §8's after column, and `check-slices` refuses a bare `S<n>`. | A check-slices test refusing `after: S1` and passing `after: S1 (scripts/x.mjs)`; this artefact's slice files pass. |
| 6 | The architect reports the cut's width (the most slices runnable at once) and longest stem beside the slice count, and the pilot names both in the gate1 body. | §8 of this artefact carries both; a pin on `agents/pilot.md`'s gate1 sentence; the pilot's prompt share stays at or under 10044.25. |
| 7 | The `vertical-slicing` skill carries the width rule and the reasoned `after`, pinned. | Its worked example passes `check-slices`; a wording pin on the skill. |

## 3. Findings

- `agents/pilot-architect.md:104-116` "Where you work": the worktree-add line and "Never push". No
  re-anchoring text exists anywhere (`grep -n "rebase\|re-anchor\|cherry"` finds none): the replay
  was improvised.
- `scripts/integrate.mjs:205-214`: the base merge (`merge --no-ff origin/pilot`) and its one-line
  failure `base NOT taken: taking base pilot stopped (<first line>); not pushed`. `baseOf` (:137)
  already refuses a repo with no `origin/pilot`.
- `scripts/pilot-branch.mjs`: the pilot-branch vocabulary (`PILOT_BRANCH`, `holds`, `firstLine`);
  `deck/tickets.mjs:17` already imports it from the deck side.
- `deck/server.mjs:803-813` `callTool('deck_post')`: the one daemon path every `deck_post` takes,
  already holding a repository-aware check (`isWorktree`, :766) before `postItem`. `postItem`
  (`deck/store.mjs`) runs no git; nine deck test files post a gate1 through `callTool` with
  `repo` a path that is not a git repository (`withTicket`, `deck/testUtils.mjs:109`).
- Daemon git precedent: `deck/wait.mjs:113` (sync, 5 s timeout), `deck/telemetry.mjs:32` (async).
- Live design branches, `git cherry origin/pilot design/*` over all 28 on 2026-10-10: only
  `design/walkthrough-taste` carries copies (95 `-`, 0 `+`; its docs already landed).
  `design/co-pilot-successor` and `design/yellow-is-the-subdecks` are behind pilot with no copies:
  one rebase each before their gate1. No other branch needs a path.
- `scripts/check-slices.mjs:55-90` checks a slice file's Tests, Rewrite check and length, and a
  SKILL.md's worked example (:100); it reads no `after`. The skill's example header is
  `after: S1, S2` (`skills/vertical-slicing/SKILL.md:94`).
- `scripts/test/slice-graph.test.mjs:28` pins the architect's §8 blockers sentence.
- Prompt budgets: the pilot's share measures 10037 against its pin 10044.25
  (`scripts/test/measure-prompt.test.mjs:133`); the architect has no pin.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `scripts/pilot-branch.mjs` | `pilotLineage(cwd, ref)` → `{ tip, copies }`, or null with no `origin/pilot` | `merge-base --is-ancestor` and `git cherry` reading, today nowhere | local-substitutable (a real git repo in a temp dir) |
| `scripts/integrate.mjs` | `integrate(branch, options)` → `{ ok, line, failing }` | unchanged; its base-failure line gains the count | local-substitutable |
| `deck/server.mjs` | `callTool('deck_post', args)` | the gate1 lineage refusal beside `isWorktree` | local-substitutable |
| `scripts/check-slices.mjs` | `checkSlice(text)` → problems | the `after-reason` rule beside `tests-shape` | in-process |
| prompt files | `agents/pilot-architect.md` "Where you work" and §8; `agents/pilot.md` gate1 sentence; `skills/vertical-slicing/SKILL.md` "Ordering" | wording | in-process (pins) |

## 4. Ubiquitous language

- **Design branch**: `design/<slug>`, pilot's tip plus the architect's docs commits and nothing else.
- **Re-anchor**: move a design branch onto pilot's current tip by `git rebase origin/pilot`.
- **Copy**: a commit on a branch patch-equivalent (`git patch-id --stable`) to one of pilot's commits not reachable from the branch's fork points; `git cherry` misses it once the branch has merged pilot (S1 seam change).
- **Lineage**: the pair (pilot's tip is an ancestor; how many copies), what `pilotLineage` answers.
- **Wait reason**: the shared file or seam written beside each blocker, `S<n> (<reason>)`.
- **Width**: the most slices the graph lets run at once. **Longest stem**: the longest chain of `after` lines.

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
| --- | --- | --- | --- |
| L1 | Grilling depth *forks*: no Gate 1 walk; the gate1 is the only item. | The user, itm_63b08b74407c. | *every*. |
| L2 | QA runs in a scratch clone whose origin is a local bare repository holding a `pilot` branch, one design branch carrying a replayed pilot commit and one carrying docs commits only, plus a scratch deck daemon on its own port; never the live deck on 4321 or this repository's branches. | The user, itm_77fe2587c0bc. | This repository's live branches. |
| L3 | One seam, `pilotLineage(cwd, ref)` in `scripts/pilot-branch.mjs`, answers both the deck and integrate. | Spec 2 and 3 read the same two git facts; one place to get `git cherry` parsing right. | The check written twice, in the deck and in integrate. |
| L4 | The gate1 check runs in the daemon's `callTool('deck_post')`, beside `isWorktree`, synchronous with a 5 s timeout, in the item's `repo`. | Every writer (MCP client, hand curl to `/api/tool`) passes there; `postItem` stays git-free. | The stdio client (a hand post skips it); `postItem` (the store's gate1 tests would need repositories). |
| L5 | The check reads the gate1's `branch` as the local repository has it, without fetching. | The design branch is local before Gate 1 pushes it and shares refs with the architect's worktree; a fetch puts the network on a post path. | `git fetch origin pilot` first. |
| L6 | Both conditions refuse: pilot's tip not an ancestor, or copies > 0. A stale branch with no copies is refused too. | The user's words: "merge-base with `origin/pilot` is pilot's tip". A branch that merged pilot after a replay passes the ancestor test yet carries copies; a rebase onto pilot drops copies by itself, so one fix clears both. | Ancestor test alone; copies alone. |
| L7 | Integrate counts copies of the branch it stands on (`HEAD`) against `origin/pilot`, after its reset, and only on the base-take failure. | That branch is the one that failed to take the base; a slice-merge failure has another cause. | Counting on every failure. |
| L8 | The wait reason lives in the slice file header and §8's after column; `check-slices` checks the header. | `check-slices` already reads slice files and the skill's example; §8 is copied from them. | Parsing §8's table in `architecture.md`. |
| L9 | The pilot carries width and longest stem by rewording its gate1 sentence, not by new gate1 fields. | The deck needs nothing new; the pilot's budget has 7 tokens of room. | `width` and `stem` gate1 fields in `deck/items.mjs`. |
| L10 | Spec 4's evidence is one architect run by QA on a three-surface fixture brief in the scratch repo, read by hand; no automated eval. | Agreed with the spec (itm_196ba3065083); an eval harness for an LLM's cut is a feature of its own. | An automated architect eval. |

## 6. Assumed decisions

| # | Decision | Default taken | Tradeoff | Stashed |
| --- | --- | --- | --- | --- |
| A2 | A gate1 whose `repo` is a git repository with no `origin/pilot`, or whose `branch` git cannot resolve or answer within 5 s. | Refused, naming the missing pilot branch (`pilot base`) or the branch. A `repo` that is not a git repository at all (`repoOf` null, as `isWorktree` reads it) is not checked. | Refusing early is cheaper than integrate's later refusal; the not-a-repository carve-out keeps the nine deck test files that post through `callTool` with fake paths unchanged. | no (the pilot's call) |
| A4 | Width and longest stem. | Computed by the architect by hand and written in §8. | `check-slices` could compute them from the reasoned `after` headers; deferred. | no |

## 7. Out of scope

- Re-anchoring text for the pilot itself (`agents/pilot.md` has none and its budget has 7 tokens).
- Rewriting existing design branches; the two stale ones rebase when their gate1 comes.
- Checking `feat/<slug>` or slice branches for copies anywhere but integrate's base failure.
- Fetching in the deck; the HTTP `POST /api/items` path, which agents do not post gate1s through.
- A computed width in `check-slices` (A4).

## 8. Slices

Width 3 (S1, S3, S4 run at once); longest stem 2 (S1 → S2, S3 → S5, S4 → S5). 5 slices.

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Integrate's base failure counts pilot's copies (walking skeleton) | 3 | `scripts/pilot-branch.mjs`, `scripts/integrate.mjs`, `scripts/test/integrate-copies.test.mjs` (new) | – | typescript | [S1](slices/S1.md) |
| S2 | The deck refuses a gate1 off pilot's tip | 2 | `deck/server.mjs`, `deck/test/gate1-lineage.test.mjs` (new) | S1 (`pilotLineage`) | typescript | [S2](slices/S2.md) |
| S3 | The architect re-anchors by rebase only | 1 | `agents/pilot-architect.md` ("Where you work"), `scripts/test/pilot-agents.test.mjs` | – | typescript | [S3](slices/S3.md) |
| S4 | Every after carries its reason | 5, 7 | `scripts/check-slices.mjs`, `scripts/test/check-slices.test.mjs`, `skills/vertical-slicing/SKILL.md` | – | typescript | [S4](slices/S4.md) |
| S5 | The architect cuts for width and the gate1 names it | 4, 6 | `agents/pilot-architect.md` (§8), `agents/pilot.md`, `scripts/test/slice-graph.test.mjs` | S3 (`agents/pilot-architect.md`), S4 (the `S<n> (<reason>)` format) | typescript | [S5](slices/S5.md) |

## 9. Acceptance evidence

In the L2 scratch environment (a clone with origin a local bare repository; a scratch deck with
its own `PILOT_DECK_DIR` and `PILOT_DECK_PORT`):

1. Spec 1: an architect brief in which pilot moves mid-design ends with
   `git cherry origin/pilot design/<slug>` printing only `+`.
2. Spec 2: a gate1 for the replayed design branch is refused, naming the branch, the copy count
   and `git rebase origin/pilot`; after that rebase the same gate1 posts.
3. Spec 3: `pilot integrate` on a feature branch cut from the replayed design branch prints the
   copy count in its failure line; on a clean branch with a conflict it prints none.
4. Spec 4, 6: the architect run on a three-surface fixture brief writes a §8 with three roots,
   its width and longest stem; the gate1 body names them.
5. Spec 5, 7: `node scripts/check-slices.mjs` refuses a slice file with `after: S1` and passes
   this artefact's `slices/` and the skill.

## 10. Status

| Slice | State | Branch | PR | Worktree | Blocker | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 3 |
| S2 | planned | | | | S1 | 2 |
| S3 | planned | | | | – | 1 |
| S4 | planned | | | | – | 5, 7 |
| S5 | planned | | | | S3, S4 | 4, 6 |
| feature | planned | feat/design-docs-only | | | S1-S5 | 1-7 |
