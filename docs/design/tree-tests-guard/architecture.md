# tree-tests-guard: the narrow loop runs the vocabulary guard and the TREE_TESTS census

Ticket `itm_da45ed4593f8` (Audit F6, report 2026-11-17T00-56-45). Base `pilot` at d27abc48.

## 1. Problem

`npm run test:changed -- --since=<ref>` runs only the test files a diff reaches. A docs or prose change that adds a
retired word passes it, because `scripts/test/vocabulary-guard.test.mjs` reads every tracked file yet is not in
`TREE_TESTS`; its red shows only in the full 8-13 minute gate (three runs hit it: blocked-yellow-yields,
readme-graph-deck, architect-deeper). The census that should have caught the omission has the same gap one level up.

## 2. Spec

| # | Behaviour | Evidence | Bar |
| --- | --- | --- | --- |
| 1 | A diff touching only a `.md` file runs the vocabulary guard in `npm run test:changed -- --since=HEAD`. | CLI run in a worktree after appending a line to a `.md` file (§9 step 1). | scope line `selected <n> of <m>`, not `full suite`; the guard's 14 tests reported; 0 fail. |
| 2 | A select-tests test pins it: a fixture `.md`-only diff selects `scripts/test/vocabulary-guard.test.mjs`. | `node --test scripts/test/select-tests.test.mjs` | 1 new test, failing on d27abc48; 0 fail after. |
| 3 | *assumed* (A1) The census ("every tree walker is listed") rides every selection, so a new tree-reading test missing from `TREE_TESTS` goes red in the narrow loop. practitioner: build-system maintainer (a selection's own guard must run inside the selection). | CLI run: add an unlisted test file containing `'ls-files'`, run `test:changed` (§9 step 2). | exit 1; the new file's path in the output. |
| 4 | *assumed* The narrow loop stays narrow: the two added tree tests each run in under 3 s alone. practitioner: build-system maintainer. | `node --test` on each file, timed. | each < 3 s (measured at design: guard 1.0 s, census 1.3 s; all of `select-tests.test.mjs` is 12 s). |

## 3. Findings

- `scripts/select-tests.mjs:50-83` `TREE_TESTS`, 32 entries (the audit counted 30); `vocabulary-guard` absent.
- `scripts/select-tests.mjs:44-49`: the comment names two hand-added kinds; a walk inside a non-test module the
  test imports is a third, not named.
- `scripts/select-tests.mjs:173-183` `treeWalkers`: follows imports only into a `test/` directory, so the walk at
  `scripts/vocabulary.mjs:82-85` (`SCOPE = tracked([])`, `'ls-files'` at module load) is invisible to it.
- Census today finds 27; 5 of the 32 entries are hand-listed (open, tickets-region, pilot-rules, platform-reads,
  state-words).
- `scripts/test/select-tests.test.mjs:82-93` pins the riding behaviour with a fixture (`whole-tree tests ride every
  selection`); `:133-138` is the census pin. `select-tests.test.mjs` is not in `TREE_TESTS`, so the census runs only
  when `select-tests.mjs` or the test file itself changes (select-tests.mjs is a `FULL_TRIGGERS` entry, `:37`).
- `scripts/test/vocabulary-guard.test.mjs:67-74` `the whole repository is clean` spawns `scripts/vocabulary.mjs check`.
- Probe (design time): widening the census one hop into non-test modules flags 46 tests, 45 of them integrate/land/
  deck fixtures that walk a temp repository, not this one.
- Prior design: `docs/design/suite-at-landing/architecture.md` A2: a named list kept honest by a pin; detection at run
  time rejected. This run keeps that.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `scripts/select-tests.mjs` selection | `selectTests({ cwd, since, git? })`, `TREE_TESTS`, `treeWalkers(root)` | nothing: each survives the deletion test (selection, the list, the census) | local-substitutable (a git fixture, fs) |

No fold: the change is one list entry, one comment, and one test moved between files.

## 4. Ubiquitous language

- **Narrow loop**: `npm run test:changed -- --since=<ref>`, the selection run.
- **Tree test**: a test that reads every tracked file of a kind; listed in `TREE_TESTS`, run by every selection.
- **Census**: `treeWalkers` and the pin `every tree walker is listed`, which fails when a tree test it can see is not listed.
- **Hand-listed**: a tree test the census cannot see, listed by hand.

## 5. Locked decisions

- **L1** Add `scripts/test/vocabulary-guard.test.mjs` to `TREE_TESTS` by hand and pin it with a fixture selection test.
  Rationale: the auditor's fix, one line; suite-at-landing A2's list stands. Rejected: widening `treeWalkers` one hop
  into non-test modules (45 false positives of 46, each a slower narrow loop); a marker comment in tree tests (a new
  convention for one case).
- **L2** The pin is a selection result, not a membership assert: a fixture repo holding a stub at the guard's path and a
  changed `docs/note.md` selects exactly the stub. Rationale: it pins the behaviour spec 1 names; the pattern is
  `select-tests.test.mjs:82`. Rejected: `assert.ok(TREE_TESTS.includes(...))`, which a reorder of the list could pass
  while selection broke.
- **L3** Name the third hand-added kind in the `TREE_TESTS` comment. Rationale: the next reader of the list learns why
  the census misses it. Rejected: nothing; one line.
- ADR: `docs/adr/0189-tree-tests-guard.md` (ADR 0189), on L1 and A1; the landing numbers it.

## 6. Assumed decisions

- **A1** Spec 3: move the census test out of `select-tests.test.mjs` into `scripts/test/tree-census.test.mjs`, listed in
  `TREE_TESTS`. Default: move it. Tradeoff: about 1.3 s on every narrow run and about 25 lines. Rejected: listing all
  of `select-tests.test.mjs` (12 s per run); leaving the census full-gate only (the friction recurs). Asked as spec
  line 3 in `itm_2a16f080261d` (`itm_400c4f3d2c70` closed as covered by it).
- **A2** Spec 4's bar of 3 s per added tree test. Default: 3 s, twice the measured times. Tradeoff: a slow machine may
  need more headroom. Rejected: no bar. Part of `itm_2a16f080261d`.
- **A3** QA environment: the CLI in a worktree, no database. Default from the pilot's brief.

## 7. Out of scope

- Making the census see hand-listed kinds automatically (rejected in L1).
- The 5 existing hand-listed entries and their pins.
- Speeding up `select-tests.test.mjs` or the full gate.
- Dead exports in `scripts/vocabulary.mjs` (ticket `itm_4be41dcb9ee3`).

## 8. Slices

Width 1; longest stem 1

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | A prose-only diff runs the vocabulary guard and the census in the narrow loop | 1-4 | `scripts/select-tests.mjs`, `scripts/test/select-tests.test.mjs`, `scripts/test/tree-census.test.mjs` (new), `docs/adr/0189-tree-tests-guard.md` (new) | – | `pilot:typescript-reviewer` | [S1](slices/S1.md) |

S1 is the walking skeleton and the whole feature, about 60 lines. It changes a list and tests, starts no new
process and takes no input, so no security reviewer. `select-tests.mjs` is a `FULL_TRIGGERS` entry: the slice's own
narrow loop runs the full suite.

red team: attacked S1's first red step against the files. Test 1 (`a prose-only diff selects the vocabulary guard`)
fails before: in the fixture only `docs/note.md` changes, the stub neither imports nor names it, and the path is not
in `TREE_TESTS`. Found: the stub must not mention `note.md`, or the basename rule selects it and the test passes
before the change; written into S1's Prohibited. Found: these design docs fall under the guard themselves
(`vocabulary-guard.test.mjs:67`); checked with `node scripts/vocabulary.mjs check docs/design/tree-tests-guard`.
Found: if A1 is answered No, S1 drops `tree-census.test.mjs` and spec 3 and stays one slice; no re-cut.

## 9. Acceptance evidence

In a worktree of `feat/tree-tests-guard` after `npm ci`:

1. Append a line to `docs/design/tree-tests-guard/architecture.md`; `npm run test:changed -- --since=HEAD`: first
   line `selected <n> of <m> test files since <sha7>`, the guard's `the whole repository is clean` reported, 0 fail
   (spec 1). Revert.
2. Write `scripts/test/zz-walker.test.mjs` containing `execFileSync('git', ['ls-files'])` and nothing else listed;
   `npm run test:changed -- --since=HEAD`: exit 1, `scripts/test/zz-walker.test.mjs` in the census failure (spec 3).
   Delete it.
3. `node --test scripts/test/select-tests.test.mjs`: the new pin passes (spec 2); on d27abc48 it fails.
4. `node --test scripts/test/vocabulary-guard.test.mjs` and `node --test scripts/test/tree-census.test.mjs`, each
   timed: under 3 s (spec 4).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | `slice/tree-tests-guard-s1` | – | – | – | 1-4 |
| tree-tests-guard | planned | `feat/tree-tests-guard` | – | – | S1 | 1-4 |
