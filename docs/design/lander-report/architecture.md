# The lander's bodiless closing report is accepted

Ticket itm_09a7f609e937 · slug `lander-report` · base `origin/pilot` c8365943 · merge: none (itm_2bd2d2987965)

## 1. Problem

On the landing of pilot-develop-line (gate2 itm_a7b0978a208f) the lander posted the closing report with
`body: ""`, the deck refused it ("body must be a non-empty string"), and the pilot posted the report by hand
(itm_6c69689d2c06). Every landing would end this way.

The code that would have accepted it is already on `pilot` and `main`: the lander-tail run made a blank body
on a lander's report a bodiless one and dropped `body` from deck_post's required list. What ran was the
installed plugin, `cache/pilot/pilot/0.9.5`, which predates lander-tail. The version has stood at 0.9.5 since
f8ea91f7, so an update did not refresh the cache dir: the fix never reached the running deck.

## 2. Spec

| # | Behaviour | Evidence | Bar |
| --- | --- | --- | --- |
| 1 | A lander's `report` with `ticket` and an empty, blank or absent body is filled from the run record, closes the ticket and notes `REPORT_DUE`; deck_post's schema requires only `kind`. On `pilot` today (lander-tail spec 1); this run ships it to the installed plugin. | `deck/test/report-post-body.test.mjs` stays green; after the user merges pilot to main and updates, `cache/pilot/pilot/<new>/deck/closing-report.mjs` holds `const bodiless =` and its `deck/tools.mjs` holds `required: ['kind']`. | 9/9 tests pass; 1 match in each installed file |
| 2 | A landing ends with the lander's own report: its hand-back line carries `report: <id>` (prose on `pilot`, agents/pilot-lander.md:47-54). | The next landed gate2's thread shows a report authored by the lander and the pilot's `Findings:` reply on it. | 1 lander report, 0 pilot-posted reports on that gate2 |
| 3 | *added* The plugin's version moves one patch past `pilot`'s at slice start (0.9.6 from 0.9.5), the same in its three files, so a plugin update copies a new cache dir and a new session replaces the 0.9.5 deck (ADR 0156). practitioner: a release engineer, who ships a behaviour change to installed users only with a version that moved. | `deck/test/status-command.test.mjs:74` health version and `deck/test/store-upgrade.test.mjs:97` package version pins, red at the new version before the bump, green after; `installed_plugins.json` names the new version after update; `GET /api/health` on the user's deck reports it after a new session. | 2 pins red then green; 3 files, one version |

Cannot mean: re-implementing the fill or the schema change (both on `pilot`); a warning when the installed
plugin lags `pilot` (a wider ticket, out of scope).

## 3. Findings

- `deck/closing-report.mjs:118-121` `postFilled`: `bodiless = body === undefined || blank`; lander or unstamped pilot only (`LANDING_KINDS`); refuses on another repo's gate2, an unlanded gate2, or no run record.
- `deck/tools.mjs:195-196`: `required: ['kind']`, commented `lander-tail spec 1`. Installed 0.9.5: `required: ['kind', 'title', 'body']` (tools.mjs:195) and `body !== undefined` (closing-report.mjs:110).
- `deck/test/report-post-body.test.mjs`: 9 tests, 9 pass at c8365943 (blank `""` and `"  \n"`, question still refused, post then `finished` closes the record).
- `agents/pilot-lander.md:47-54`: post with no body, then `deck_status finished`, then `landed … · report: <id>`; refusal in place of the id.
- `~/.claude/plugins/installed_plugins.json`: pilot@pilot 0.9.5, gitCommitSha 769cd877 (2026-10-21 07:58), which predates lander-tail; the cache dir's files date 07:22 and 7 deck files differ even from 769cd877. A same-version update leaves the cache stale.
- `scripts/bump.mjs` (`npm run bump <x.y.z>`): writes package.json, package-lock.json (top and `packages[""]`), `.claude-plugin/plugin.json`; `scripts/test/bump.test.mjs` pins it on a temp root. f8ea91f7 is the pattern: the three files plus the two version pins, 6 lines.
- ADR 0156 (`deck/exit-route.mjs`): a session finding an older deck asks it to exit. ADR 0165: the deck spawns from the installed plugin root.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `scripts/bump.mjs` | `bump(version, { root })`; `npm run bump <x.y.z>` | nothing; the three files already sit behind it | in-process |
| `deck/version.mjs` via `GET /api/health` | `{ version }` read from package.json | nothing | in-process |
| `deck/closing-report.mjs` | `postFilled(fields) -> item` | unchanged by this run | local-substitutable (temp deck store) |

Deletion test: deleting `bump.mjs` scatters three hand edits per release, so it earns its keep; the version
pins are tests, not modules. No shallow module to fold; no fold slice.

## 4. Ubiquitous language

- **installed copy**: `~/.claude/plugins/cache/pilot/pilot/<version>/`, what the deck and agents run.
- **bodiless report**: a `report` with a `ticket` and a body absent or blank.
- **bump**: one version written into the three files by `npm run bump`.
- **hand-back line**: the lander's one line to `main`, ending `report: <id>`.

## 5. Locked decisions

- **L1 Ship by a patch bump, change no deck code.** The fill and schema are correct on `pilot` and tested; the defect is distribution. Rejected: re-editing `postFilled` or the schema (no behaviour left to change).
- **L2 One patch above `pilot`'s version at slice start**, read then, not hard-coded 0.9.6. *red team:* another ticket landing a bump first would make a literal 0.9.6 a no-op or a conflict on five files. Rejected: a minor bump (lander S13 bumps by a patch).
- **L3 No ADR.** No structural decision: the bump follows f8ea91f7. Rejected: an ADR that every behaviour change bumps (a policy wider than this ticket).

## 6. Assumed decisions

- **A1** *assumed*, itm_9faf1ca57766. Default: run one slice that bumps the version. Trades a run for about 10 changed lines. Rejected: close the ticket as delivered by lander-tail and bump by hand outside a run (no QA, no record).
  Verdict: stands

red team: I walked S1's red step against the real files. `status-command.test.mjs:74` and `store-upgrade.test.mjs:97` are the only literal version pins (f8ea91f7 touched exactly those); editing them first makes 2 tests red, the bump makes them green. `bump.test.mjs` uses a temp root and does not pin the repo's version. Attacked: a concurrent bump (L2), package-lock drift under `npm ci` (bump edits text only), the user's deck being replaced by the suite (tests use `tempDeck`, never 4321). Nothing else found.

## 7. Out of scope

- A session-start warning when the installed copy lags `pilot` or main.
- Any change to `postFilled`, deck_post's schema or the lander's prose.
- The merge of pilot to main and the plugin update: the user's human steps.

## 8. Slices

Width 1; longest stem 1

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | The plugin version moves so an update installs the bodiless report | 1, 2, 3 | `package.json`, `package-lock.json`, `.claude-plugin/plugin.json`, `deck/test/status-command.test.mjs`, `deck/test/store-upgrade.test.mjs` | – | `pilot:typescript-reviewer` | [S1](slices/S1.md) |

Walking skeleton: S1. The version pins, the three files and the health route move together; after main and an
update, the installed deck carries lander-tail's fill.

## 9. Acceptance evidence

1. On the feature branch, `GET /api/health` on a scratch deck reports the new version; `report-post-body.test.mjs` 9/9 (spec 3, 1).
2. After the user merges pilot to main and runs the plugin update, `installed_plugins.json` names the new version and its cache dir holds `const bodiless =` and `required: ['kind']` (spec 1, 3).
3. A new session replaces the 0.9.5 deck; `GET /api/health` on 4321 reports the new version (spec 3).
4. The next landed gate2's thread holds the lander's report and the pilot's `Findings:` reply; the hand-back line ends `report: <id>` (spec 2).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | slice/lander-report-s1 | – | – | – | 1, 2, 3 |
| lander-report | planned | feat/lander-report | – | – | S1 | 1, 2, 3 |
