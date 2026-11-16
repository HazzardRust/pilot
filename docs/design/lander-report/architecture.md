# The lander's bodiless closing report is accepted

Ticket itm_09a7f609e937 · slug `lander-report` · base `origin/pilot` 6ea49cac · merge: decided before (itm_9faf1ca57766's thread; none merged)

## 1. Problem

On the landing of pilot-develop-line (gate2 itm_a7b0978a208f), the lander posted the closing report with
`body: ""`. The deck refused it ("body must be a non-empty string"), and the pilot posted the report by hand
(itm_6c69689d2c06). Every landing would end this way.

The code that accepts the report is already on `pilot` and on `main` (lander-tail). What ran was the
installed copy, `cache/pilot/pilot/0.9.5`, and that copy predates lander-tail. `main` still says 0.9.5, so a
same-version `plugin update` leaves the cache stale. The 0.9.6 bump is on `pilot` (PR #35, e6defba3), but the
user asked for this ticket to "land a new bump with it".

## 2. Spec

Agreed by the user on itm_3463d61dd2bd (Agree).

| # | Behaviour | Evidence | Bar |
| --- | --- | --- | --- |
| 1 | The plugin version moves 0.9.6 -> 0.9.7 on `pilot` by `npm run bump 0.9.7`. That sets package.json, both package-lock.json fields, and plugin.json, and the two version pins follow. | At the landed tip, `git grep -n 0.9.7` shows package.json:3, package-lock.json:3 and :9, plugin.json:4, status-command.test.mjs:74, store-upgrade.test.mjs:97. The pins go red before the bump and green after. The gate is green (local referee). practitioner: a release engineer, who ships a behaviour change to installed users only under a version that moved, and checks every place the version is stated (toolbox.test.mjs:209). | 5 files, 6 lines, 6 matches; 2 pins red then green; 1 Windows `npm test` green and 5/5 WSL `gate.mjs` green |
| 2 | After the user's pilot -> main merge and `claude plugin update`, the installed copy carries lander-tail's deck. A bodiless lander report is filled, and the lander's hand-back ends `report: <id>`. | `installed_plugins.json` names 0.9.7. The cache's `deck/tools.mjs` holds `required: ['kind']` and its `deck/closing-report.mjs` holds `const bodiless =`. The next landed gate2's thread shows the lander's own report. | 1 match per file (0 today in 0.9.5's tools.mjs); 1 lander report, 0 pilot-posted |

Ticket lines 1 and 2 (the fill and the hand-back) are on `pilot` at 6ea49cac and are not rebuilt:
`deck/closing-report.mjs:130` (`const bodiless = body === undefined || … trim() === ''`),
`deck/tools.mjs:196` (`required: ['kind']`), and `agents/pilot-lander.md:52,54` (`report: <id>`, and a refusal
in its place). Spec 2's two steps are the user's.

## 3. Findings

- `scripts/bump.mjs:18-22` `EDITS`: package.json (`version`), package-lock.json (top `version` and `packages[""].version`), and `.claude-plugin/plugin.json`. It refuses a non-semver. `package.json:23` is `"bump": "node scripts/bump.mjs"`.
- e6defba3 (0.9.6) is the pattern: the 3 files plus `deck/test/status-command.test.mjs:74` and `deck/test/store-upgrade.test.mjs:97`, 5 files, 6 lines.
- `scripts/test/toolbox.test.mjs:209` asserts that every place the package states its version agrees. It has no literal, so it stays green across the bump.
- No other version pin exists. Every other `0.9.x` in the tree is a test fixture (`daemon-replace`, `health-root`, `spawn-root`, `doctor-deck`). `rules/` has none. `.claude-plugin/marketplace.json` carries no version.
- `deck/version.mjs:9` reads `PLUGIN_VERSION` from package.json, and `GET /api/health` reports it.
- `origin/main`: package.json 0.9.5, but tools.mjs already holds `required: ['kind']`. `pilot` is 2 commits ahead.
- `~/.claude/plugins/installed_plugins.json`: pilot@pilot 0.9.5, lastUpdated 2026-10-20. The cache's `deck/tools.mjs` has 0 matches for `required: ['kind']`.
- Found, not acted on: the 0.9.6 already on `pilot` would refresh the cache at the next main merge by itself. 0.9.7 is the user's call (spec agreed), and it gives this ticket its own release marker.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `scripts/bump.mjs` | `bump(version, { root }) -> string[]`; `npm run bump <x.y.z>` | nothing; the 3 files already sit behind it | in-process |
| `deck/version.mjs` via `GET /api/health` | `PLUGIN_VERSION`; `{ version }` | nothing | in-process |

Deletion test: deleting `bump.mjs` would scatter 4 hand edits across 3 files per release, so it earns its keep.
The pins are tests, not modules. Nothing is shallow, so there is no fold slice.

## 4. Ubiquitous language

- **installed copy**: `~/.claude/plugins/cache/pilot/pilot/<version>/`, which the deck and the agents run.
- **bodiless report**: a lander's `report` with a `ticket` and a body that is absent or blank.
- **bump**: one version written into the 3 files by `npm run bump`.
- **version pin**: a test literal equal to the package version (2 of them).

## 5. Locked decisions

- **L1 Ship by a patch bump and change no deck code.** The fill and the schema are on `pilot` and tested; the defect is distribution. Rejected: re-editing `postFilled` or the schema.
- **L2 Bump to the literal 0.9.7 (spec 1).** If `pilot` is past 0.9.6 at slice start, the implementer stops and asks `main`, because another bump has landed. *red team:* a concurrent bump would make 0.9.7 a downgrade or a 5-file conflict. Rejected: "one patch above whatever pilot says" (the spec names 0.9.7).
- **L4 Grilling depth: forks** (the user, itm_661f5d3d7ffe). Was A2.
- **L5 QA environment: the local gate only** (the user, itm_b0a0a27a3d2f): Windows `npm test` once, WSL
  `node scripts/gate.mjs` 5/5 on a fresh clone at the sha. Spec 2's live check is the user's, after main. Was A3.
- **L3 No ADR.** The bump follows e6defba3; nothing structural changes. Rejected: an ADR making every behaviour change bump the version.

## 6. Assumed decisions

- **A1** Run one slice that bumps to 0.9.7 (itm_13f986d5b324, where the user answered "land a new bump with
  it"; spec agreed on itm_3463d61dd2bd). The fix itself needs no 0.9.7: `main` already has lander-tail, and the
  0.9.6 on `pilot` would refresh the cache at the next main merge by itself. 0.9.7 is this run's release
  marker. Trades a run and its QA for 6 changed lines. Rejected: (b), close as delivered by lander-tail and
  0.9.6 (the user declined it). This replaces the old A1, itm_9faf1ca57766, which was superseded when 0.9.6
  landed in PR #35.
  Verdict: stands
- **A2** answered by the user, now L4, itm_661f5d3d7ffe. Depth: forks (default). Trades nothing for a 1-slice cut. Rejected: a
  deeper pass, since nothing is left to design.
  Verdict: stands
- **A3** answered by the user, now L5, itm_b0a0a27a3d2f. QA environment: the local gate only (default). Spec 2's live check (the
  update and the next landing) is the user's, after main. Rejected: a scratch deck walk at 0.9.7. Its health
  version is already covered by spec 1's pin.
  Verdict: stands

red team: I walked S1's red step against the files at 6ea49cac. Editing status-command.test.mjs:74 and
store-upgrade.test.mjs:97 to 0.9.7 makes exactly those 2 tests red. toolbox.test.mjs:209 stays green because
it compares files and has no literal. bump.test.mjs uses a temp root. I attacked four things: a missed pin
(only these 2 literals exist), lock drift (bump edits text; `npm ci` reads the same tree), a concurrent bump
(L2), and the suite touching the user's deck on 4321 (tests use temp decks). I found nothing else.

## 7. Out of scope

- A session-start warning when the installed copy lags `pilot` or `main`.
- Any change to `postFilled`, deck_post's schema or the lander's prose.
- The pilot -> main merge (merge commit, never squash) and `claude plugin update`: the user's steps.

## 8. Slices

Width 1; longest stem 1

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | The plugin version moves to 0.9.7 so an update installs the bodiless report | 1, 2 | `package.json`, `package-lock.json`, `.claude-plugin/plugin.json`, `deck/test/status-command.test.mjs`, `deck/test/store-upgrade.test.mjs` | – | `pilot:typescript-reviewer` | [S1](slices/S1.md) |

Walking skeleton: S1. The 3 version files, the 2 pins and the health route move together. After the main
merge and an update, the installed deck carries lander-tail's fill.

## 9. Acceptance evidence

1. On `feat/lander-report`, `git grep -n 0.9.7` shows 6 matches in 5 files, and `GET /api/health` on a scratch deck reports 0.9.7 (spec 1).
2. The gate is green: 1 Windows `npm test`, and 5/5 WSL `node scripts/gate.mjs` at the exact sha (spec 1).
3. After the user merges pilot -> main and updates, `installed_plugins.json` names 0.9.7, and its cache holds `const bodiless =` and `required: ['kind']` (spec 2).
4. The next landed gate2's thread holds the lander's own report, and the hand-back ends `report: <id>` (spec 2).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | slice/lander-report-s1 | – | – | – | 1, 2 |
| lander-report | planned | feat/lander-report | – | – | S1 | 1, 2 |
