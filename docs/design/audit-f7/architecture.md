# audit-f7: the deck's hand-off bar test gets a name of its own

Ticket `itm_7f308083566b` · base `origin/pilot` d7569a49 · audit report `2026-10-20T21-42-00-000Z.json`, finding F7.

**Worth it?** The audit itself called F7 `unnecessary`, score 2: "paths already disambiguate; no run confused them".
The user picked it anyway. It costs one rename, no content change, and one slice.

## 1. Problem

Two unrelated test files share the name `handoff.test.mjs`. A search for that name finds both, so an agent or a person
can open the wrong one. `deck/test/handoff.test.mjs` tests the deck's hand-off bar. `scripts/test/handoff.test.mjs`
tests the `pilot handoff` command.

## 2. Spec

Agreed with the user through `main` on 2026-11-17.

| # | Behaviour | Evidence | Bar |
|---|---|---|---|
| 1 | `deck/test/handoff.test.mjs` becomes `deck/test/handoff-bar.test.mjs` as a pure rename. | `git diff -M --name-status origin/pilot...feat/audit-f7`; `git ls-files '*.test.*' \| xargs -n1 basename \| sort \| uniq -d` | exactly one `R100` line; the dup list has 0 lines (it lists `handoff.test.mjs` today) |
| 2 | The gate still runs the renamed file. | `node --test deck/test/handoff-bar.test.mjs`; `npm test` | 18 pass, 0 fail (18 tests today); exit 0 |
| 3 | No live reference to the old path is left. | `git grep -n "deck/test/handoff.test.mjs" -- ':!docs/design'` | 0 lines (0 today too) |
| 4 | practitioner: maintainer. The file's history follows it. | `git log --follow --oneline deck/test/handoff-bar.test.mjs` | at least 1 commit from before the rename, down to `18a5d2f0` |

## 3. Findings

- `deck/test/handoff.test.mjs`: 359 lines, 18 tests. It comes from deck-usability S8, and its header reads "the
  hand-off, and the bar that shows it". It tests `threadState` and the `deliveredAt` marking. `handoff-bar` fits what it
  tests.
- `scripts/test/handoff.test.mjs`: the `pilot handoff` command. Out of scope here.
- handoff-mod (`origin/feat/handoff-mod`, 62288663) changes `scripts/test/handoff.test.mjs` (status `M`). It does not
  touch the deck file, and no other remote branch does either. So the ticket is not moot and needs no ordering.
- No script, `package.json`, `scripts/select-tests.mjs` map, ADR or test names the deck path.
  `deck/test/free-port.test.mjs:38` names the scripts file, not this one.
- Only landed design records name the deck path: `docs/design/deck-usability/architecture.md:255` and
  `docs/design/thread-ownership/slices/S3.md:38-39`.
- How the gate finds the file: `TEST_GLOB` in `scripts/select-tests.mjs:24` matches `*[._-]test.mjs`, so it still
  matches `handoff-bar.test.mjs`. Selection works through imports. There is no `deck/handoff.mjs`, and the file is not
  in `TREE_TESTS`, so selection does not change.
- Known flaky tests: ADR 0036 names `deck/test/usage.test.mjs:656`, the "in 2 hrs" against "in 1 hr" clock test.

### Seams

Deepening pass: the only module involved is test discovery. The deletion test leaves it in place, because every test
run depends on it. Nothing shallow sits nearby to fold, so there is no fold slice.

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| test discovery (`scripts/select-tests.mjs`) | `TEST_GLOB`, `TREE_TESTS` | nothing | in-process |

## 4. Ubiquitous language

- **hand-off bar**: the status line on each deck card. It moves from "not picked up yet" to "the pilot has it", and is
  derived from `deliveredAt`.
- **pure rename**: git records the move as `R100`, with no content change in the same commit.
- **live reference**: a path named in code, config, tests, ADRs or the README. It is not a landed design record.

## 5. Locked decisions

- **L1 Rename the deck file, not the scripts file.** The ticket names the deck file, and handoff-mod is changing the
  scripts file right now. Rejected: renaming `scripts/test/handoff.test.mjs`, which would conflict with handoff-mod.
- **L2 Name it `handoff-bar.test.mjs`.** The file's own header says it tests the bar. Rejected: `handoff-delivered`,
  because `deliveredAt` is only one of the three claims the file tests.
- **L3 Leave landed design records as written.** They record what a past run did, under the names of that time.
  Rejected: rewriting `docs/design/deck-usability` and `thread-ownership`, which rewrites history for no reader's gain.
- **L4 No ADR.** A rename sets no structural decision.

## 6. Assumed decisions

None. `main` asked for none on 2026-11-17.

## 7. Out of scope

- `scripts/test/handoff.test.mjs`, and any other handoff file.
- Any edit to the content of the renamed file, its header included.
- Duplicate basenames that are not test files, such as `S1.md` and `README.md`.

## 8. Slices

Width 1; longest stem 1.

| # | Title | Spec | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|---|
| S1 | Walking skeleton: the hand-off bar test is renamed and still runs | 1, 2, 3, 4 | `deck/test/handoff.test.mjs` → `deck/test/handoff-bar.test.mjs` | – | `pilot:typescript-reviewer` | [S1](slices/S1.md) |

red team: I attacked S1's first red step against the real tree, looking for anything that finds the file by name:

- a test that enumerates `deck/test` names: `git grep` for `'handoff'` and `handoff.test` finds only the scripts path,
  at `free-port.test.mjs:38`;
- a glob miss: `TEST_GLOB` matches the new name;
- the import-based selection: there is no `deck/handoff.mjs`;
- the `TREE_TESTS` census: the file is not in it;
- a handoff-mod conflict: that branch only touches the scripts file.

None found.

## 9. Acceptance evidence

1. `git ls-files '*.test.*' | xargs -n1 basename | sort | uniq -d` prints nothing.
2. `git diff -M --name-status origin/pilot...feat/audit-f7` shows one `R100` line.
3. `node --test deck/test/handoff-bar.test.mjs` gives 18 pass; `npm test` exits 0.
4. `git grep -n "deck/test/handoff.test.mjs" -- ':!docs/design'` finds nothing.
5. `git log --follow --oneline deck/test/handoff-bar.test.mjs` reaches `18a5d2f0`.

## 10. Status

| Slice | State | Branch | PR | Worktree | Blockers | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 1, 2, 3, 4 |
| audit-f7 | planned | feat/audit-f7 | | | S1 | 1-4 |
