# Audit fixes: what costs agents most in this repository

Ticket `itm_a331c85c66a7`, with `itm_5db3d3b5da83` (ADR schema and index) and
`itm_17e9243f39ff` (the install allows the deck tools) merged in on
`itm_fbe5c5b66200`. Base `feat/deck-press-feedback` 2fc81c9.

## 1. Problem

The first housekeeping audit (2026-09-29, origin/main 8145ba4) measured what makes an
agent slow or expensive here; the user picked five findings, then added three jobs on
the same surfaces. In their terms:

- A checkout in a deep directory fails on Windows because fixture paths are 127 chars (F1, F8).
- A hand-off picked up by a plain session costs ~32k more tokens and has no pilot tools (F2).
- The rules every session loads go stale across upgrades (F13, with F15 riding along).
- Merged worktrees pile up beside the checkout, so Glob, Grep and branch choice see stale copies (F14).
- ADRs are cited by number with no index, and their status is not filterable (F3, merged ADR ticket).
- "i want to get rid of the pre-bash hook." / "yes the gateguard" (comment on this ticket, from `itm_6f0d1770fbae`, 2026-10-03).
- "yes lets make the install do it": the install allows the deck tools so a deck call never waits on a terminal prompt (`itm_17e9243f39ff`).

## 2. Spec

Re-measured on 2fc81c9 (§3). F2's line 1 is already true and is kept only as evidence;
F13's lines 1–2 are already true of the install and the remaining gap is that nothing
re-runs it after an upgrade.

| # | Behaviour | Evidence | Source |
|---|---|---|---|
| 1 | No tracked path is longer than 90 characters, so a plain worktree in a deep directory checks out clean. | `git ls-files \| awk '{print length}' \| sort -n \| tail -1` prints ≤ 90 (today 127); `git worktree add --detach <scratchpad>/audit-<stamp> HEAD` exits 0 without core.longpaths (today 128). | F1.1, F1.3, F8 |
| 2 | A test fails when a tracked path passes the bound. | Its failure on a scratch file with a long name. | F1.2 |
| 3 | The plugin registers no gateguard hook and ships none of its files. | no gateguard hook, file or helper is tracked and `check-references` is clean; the word survives only in the leftovers remover, INSTALL.md, the ADRs and design history. | G1–G3 |
| 4 | An install over a version that had the gateguard leaves none behind, its state dir included (L13). | The built plugin's hooks.json has no gateguard; in a scratch home seeded with `~/.gateguard/state-x.json`, the install removes it and says so. | G4 |
| 5 | On the first session after a plugin upgrade, every installed rule that is a byte copy of a version the package shipped is replaced with the current one, and a retired one deleted (L14). | In a scratch home seeded with 0.7.10's rules, a SessionStart run leaves `orchestration.md` `cmp`-identical to the package's; `README.md` gone. | F13.1, F15 |
| 6 | An installed rule the user edited is never touched, and is named once, not on every session. | Hook test: edited bytes unchanged, the first run's message names it, a second run is silent. | F13.2 |
| 7 | The Gate 1 small-ticket exception reaches the installed rules through 5, with no by-hand step. | 5's `cmp` on `vertical-execution.md`; `check-references rules/` clean. | F13.3, ticket note |
| 8 | A session not started as the pilot that receives a hand-off shows the user a warning naming `pilot run`, and the hand-off is released for the next session. | Hook test feeding a plain-role payload: the warning text, the claim gone; `audit-session-start.mjs` still shows `pickupsWithoutPilot` empty (today empty since 2026-09-28 05:41). | F2.1, F2.2 |
| 9 | `pilot worktrees` lists every worktree of the repository as merged-clean, merged-dirty or open. | Its output in a scratch clone naming each. | F14.3 |
| 10 | `pilot worktrees prune` removes only merged-clean worktrees and their local branches; dirty, open, locked worktrees and the main checkout stay. | Test leaving a dirty merged and an unmerged worktree in place, both named. | F14.2 |
| 11 | After a run's feature PR merges, the pilot's closing step prunes, so that run's slice, QA and integration worktrees are gone (L12). | Pin on `agents/pilot.md`; `git worktree list` after the QA walk shows none of the run's branches. | F14.1 |
| 12 | The install offers to allow `mcp__plugin_pilot_deck__*`, default yes; answered no, it writes nothing to `permissions` for the deck. | Tests of `install-settings.mjs` for yes and no. | D1, D2 |
| 13 | A second install adds no second rule, and a deny that covers the deck tools is left alone and reported. | Tests: one rule after two runs; no allow beside a matching deny. | D3 |
| 14 | `docs/INSTALL.md` names that question and why the rule matters. | The install table row and the question list. | D4 |
| 15 | Every ADR opens with front matter: `status`, `date`, `tags`, `supersedes`, `superseded_by`, `paths`; the format in `domain-modeling` shows it, and a repository's own rule may replace it. | Pin on the six keys and the allowed statuses. | A1, A2 |
| 16 | `docs/adr/README.md` is generated, one line per ADR: number, title, status, one sentence; regenerating changes nothing; a check fails when it is stale or an ADR is missing from it. | Running it twice; the check failing on a scratch ADR. | F3.1, F3.3, A3 |
| 17 | The check fails when an ADR lacks front matter, or when `supersedes` on one has no matching `superseded_by` on the other. | Check failing on two scratch ADRs. | A3, A4 |
| 18 | The repository's ADRs are backfilled, prose `**Status:**` lines moved into front matter. | The check passes on `docs/adr/`; the index lists every file. | A5 |
| 19 | The README Layout table links `docs/adr`, and the pilot and architect read the index before opening an ADR. | The row; pins on both agents. | F3.2, A6 |

## 3. Findings

| Area | What exists | Path |
|---|---|---|
| F1 | 22 paths > 90, all `deck/test/fixtures/{transcripts,telemetry}/<project>/<uuid>/subagents/agent-<16 hex>.*`; the reader keys on `agent-(.+)\.jsonl` and any session name, no UUID shape | `deck/transcripts.mjs:205-208`; consumers `deck/test/{transcripts,telemetry,analytics-buckets}.test.mjs` (15 refs) |
| F2 | `pilot run` always starts `--agent pilot:pilot --settings {agent}`; a pickup by hand (`claude`, `/clear` outside the wrapper) is unguarded | `deck/run.mjs:72-78,91` |
| F2 | SessionStart payload has no `agent_type` (probed live); tool-call payloads carry it for a main session started with `--agent` | `hooks/session-handoff.js:21`; `hooks/deck-author.js:5-14` |
| F2 | Pickup claim is an exclusive-create file per item | `hooks/session-handoff.js:88-107`; `hooks/lib/deck.js:452-480` |
| F2 | Audit's pickup test: `PICKUP_MARK` in hook context, role from `prompt_snapshot` | `scripts/audit-session-start.mjs:36-40,115-117,165` |
| F13 | Install replaces a file whose sha256 matches a shipped version under the same path (ledger `scripts/shipped-rules.json`, ADR 0055), leaves and names edited ones, prunes retired copies; never writes through a link | `scripts/install-rules.mjs:12-24,64-84,156-234` |
| F13 | Dry run on this machine: 113 updated, 0 edited, `README.md` pruned | `node scripts/install-rules.mjs --dry-run` |
| F13 | Precedent: the settings install repairs itself at SessionStart, silent unless changed | `hooks/hooks.json` id `start:any:statusline-repair` → `install-settings.mjs --repair` |
| F14 | 32 worktrees: main, 24 merged into origin/main (2 dirty), 7 open; repo merges with merge commits, so ancestry is the merge test | `git worktree list --porcelain` + `merge-base --is-ancestor` |
| F14 | No script creates or removes a run's worktrees; the closing prose "tears down … worktrees" has no command | `agents/pilot.md:617-619`; creators in `agents/pilot-{architect,implementer,qa}.md` |
| F14 | Subcommands: `bin/pilot.mjs:23-35` imports `main` per module, `run()` chains `command ===` | `bin/pilot.mjs:85-157` |
| D | WebFetch host question and deny check | `scripts/install-settings.mjs:276,298-313,328-410,616-646`; `scripts/test/install.test.mjs:657-870` |
| G | Gateguard: `hooks/gateguard.js`, `hooks/gateguard-fact-force.js`, `hooks/test/gateguard.test.js`, `lib/shell-substitution.js` (used only by it), rows in `vendor/toolbox.md`, `VENDOR.md`, `scripts/test/toolbox.test.mjs`; registered on `Edit\|Write\|MultiEdit` only (the "pre-bash" path is unreachable); state in `~/.gateguard/` | `hooks/hooks.json` id `pre:edit-write:gateguard-fact-force`; `hooks/gateguard-fact-force.js:40` |
| ADR | 69 ADRs, `# <sentence>` + one paragraph; 0 front matter; 4 `**Status:**` lines (0023, 0031, 0051, 0052); cross-refs in 0023, 0024, 0031, 0051, 0052; format says "No status frontmatter" | `skills/domain-modeling/ADR-FORMAT.md:16-27` (adapted vendor) |
| ADR | ECC's ADR skill already appends to and reads `docs/adr/README.md` | `skills/architecture-decision-records/SKILL.md:83-97` |

**Shared with the base's planned features.** `agents/pilot.md` (user-thread-listener S1;
deck-press-feedback S6, S9, S11) with S7, S11; `bin/pilot.mjs` (UTL S5) with S6;
`docs/INSTALL.md` (UTL S5, DPF S12) with S2, S3, S4; `scripts/test/pilot-rules.test.mjs`
(UTL S1, DPF S9) with S7, S11; `deck/test/telemetry.test.mjs` (UTL S5) with S1;
`hooks/lib/deck.js` (UTL S2, S3) with S5; `docs/adr/` (0070–0077 reserved there) with
S9, S10. New ADRs here are 0078–0081.

## 4. Ubiquitous language

- **Shipped copy**: an installed file whose sha256 is in `shipped-rules.json` under the same relative path. Only a shipped copy is ever replaced or deleted.
- **Edited rule**: an installed file under a shipped path that is not a shipped copy. Never touched.
- **Rules repair**: the install's rules step run at SessionStart with `--repair`.
- **Plain pickup**: a session that received a hand-off notice and whose first tool call carries no `agent_type` of `pilot:pilot` (or `pilot`).
- **Merged-clean worktree**: a non-main, unlocked worktree that has moved since it was created (L10), whose HEAD is an ancestor of `origin/main` after a fetch, with no tracked or untracked changes.
- **ADR index**: the generated `docs/adr/README.md`.

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
|---|---|---|---|
| L1 | Shorten the fixture names (session dir `s-a`…, agent ids `a1`…), keep the tree shape. | The reader has no shape constraint; the shape is what the tests exercise. | Moving fixtures to a shorter root: saves 17 of the 37 chars needed. |
| L2 | The bound is a test over `git ls-files`, 90 chars. | The audit's bound; leaves ~160 chars of checkout path on Windows. | A pre-commit hook: not run by agents' worktrees. |
| L3 | A plain pickup is judged at its first tool call, in the existing `post-tool.js` (PostToolUse `*`), from a marker `session-handoff.js` writes when it delivers. | SessionStart has no `agent_type`; tool payloads do; no new hook registration. | Asking the model to judge its own system prompt: unobservable, untestable. |
| L4 | Rules repair reuses `installRules` behind `--repair`; nothing new decides what is ours. | One ledger, one rule (ADR 0055); the repair is the same function on a trigger. | A second, looser comparison in a hook. |
| L5 | `pilot worktrees [prune]` is one module `scripts/worktrees.mjs`; prune is `git worktree remove` (never `--force`) then `git branch -d` (never `-D`). | git itself refuses a dirty tree and an unmerged branch, so a bug in our test cannot lose work. | Deleting directories with `fs.rm`. |
| L6 | Remote branches are never deleted by prune. | GitHub's own setting handles them; irreversible for others' clones. | `push --delete`. |
| L10 | A worktree counts as merged only if it has moved since it was created: its HEAD differs from the creation point in the oldest entry of its own reflog (the branch's reflog, or the worktree's `HEAD` reflog when detached). No reflog, or a HEAD still at the creation point, is `open`. This rejects a worktree just cut from `origin/main` or at a merged tip, which another session's agent is about to work in. | Local only: no network beyond the fetch; fails closed when the reflog is missing or expired. | The upstream or PR being gone (needs `gh`, and a just-pushed branch has neither); a minimum age (a guess that is wrong both ways). |
| L7 | Gateguard's removal deletes `lib/shell-substitution.js` too. | Its only user is the gateguard. | Leaving it as dead vendor code. |
| L8 | QA runs against a scratch home and a scratch clone: the install with a temporary home standing in for `~/.claude`; the prune in a throwaway clone with its own merged, unmerged and dirty worktrees. Never the user's real `~/.claude` or this repository's worktrees (user, `itm_b2b59264fd74`, 2026-10-05). | No irreversible step on real data during QA. | The real setup. |
| L9 | The index generator is a script with a `--check` mode, wired into `npm test` by a test, as `check-references` is. | The repo's existing pattern for corpus checks. | A git hook. |
| L11 | Grilling depth: forks. Only decisions whose paths produce materially different deliverables reach the user as items (user, `itm_49e7760b7ab8`, 2026-10-05). | The user's choice. | Every: each locked decision as an item of its own. |
| L12 | F14 removal is both: the command exists, and the pilot's closing step runs `pilot worktrees prune` after the feature PR merges, removing every merged-clean worktree of the repository, not only the run's, under L10's guard (user, `itm_61055e2d6f8a`, 2026-10-05; was Q4). | Worktrees stop accumulating between runs; the run record does not list slice worktrees, so run-only is not available. | Command only: nothing removed unless the user runs it. |
| L13 | The gateguard's state goes with it: the install deletes only the `state-*.json` plain files directly under `~/.gateguard`, then the directory if that left it empty, and names what it removed; anything else there is kept and named, and it never follows a link (user, `itm_e9b1ca028653`, 2026-10-05; was Q3). | "Any state it keeps is deleted" (G2) holds. | Leaving the directory: harmless bytes, G2 false, removal by hand. |
| L14 | Stale rules are repaired at SessionStart, unprompted, within the bounds Q1 states: a file is ours only when its sha256 equals a version the package shipped at that relative path (`shipped-rules.json`); an edited file is left and named; deletes only a shipped copy at a retired path, inside the resolved target, never through a link; no backup (user, `itm_e6cbe453a1b2`, 2026-10-05; was Q1). | Rules are never stale and an edit is never lost. | Warn only: nothing written, but the drift stays until someone acts, which is how F13 arose. |

## 6. Assumed decisions

| # | Question | Default taken | Tradeoff |
|---|---|---|---|
| Q1 (answered by the user: locked as L14) | Rules repair at SessionStart (writes and deletes under `~/.claude/rules` unprompted) vs a SessionStart warning naming the install command. | Repair, as the status line already does. Proof of "ours": sha256 of the installed bytes equals a version the package shipped under that same relative path (`shipped-rules.json`, built from git history). Delete bound: only a shipped copy at a path the package no longer ships, inside the resolved target, never through a link, never a directory except one left empty by that delete. No backup: every replaced or deleted file is reproducible from git history. | Repair: rules are never stale, and an edit is never lost; but the user's home changes without a prompt. Warning: nothing written, but the drift stays until someone acts, which is how F13 arose. |
| Q2 | How often an edited rule is named. | Once per distinct set of edited files, remembered in the plugin's state dir; silent after. | Every session is noise in every spawn's context. |
| Q3 | The gateguard's `~/.gateguard/` state. | Answered by the user: locked as L13. | |
| Q4 | F14 removal at the pilot's closing step, or only as a command. | Answered by the user: locked as L12. | |
| Q5 | Join the unpicked findings on the same files. | F8 joins F1 (same fix); F15 joins F13 (arrives with the repair); F6 (fast-forward the clean main checkout) and F7 (react rules matching `hooks/**/*.js`) stay out. | F6 is one line at the closing step but writes to the user's checkout; F7 needs an install option over verbatim vendor rules, a different mechanism. |
| Q6 | Index file name. | `docs/adr/README.md` (F3, and what ECC's ADR skill already appends to). | `INDEX.md` (the merged ADR ticket's word): GitHub would not render it on opening the folder. |
| Q7 | The backfill touches all ADRs (~70 × 8 lines ≈ 560) over the 400-line slice limit. | One slice, exempt: the diff is generated, and the check, not an eye, reviews it. | Two slices need a temporary lax mode in the check. |
| Q8 | A plain pickup's hand-off is released (claim deleted) so the next session gets it. | Release. | Not releasing: the warning names `pilot run`, but that session would then receive nothing. |

## 7. Out of scope

F4–F12, F16–F18 of the audit; F6 and F7 (Q5); deleting remote branches; any change to
`pilot run`; a schema for ADR bodies beyond front matter; re-ordering or renumbering ADRs.

## 8. Slices

S1 is the walking skeleton only in the weak sense: the eight jobs are independent, and S1
goes first because every later QA and audit worktree lives under a deep scratchpad.

| Slice | Title | Spec | Files owned | After | File |
|---|---|---|---|---|---|
| S1 | A deep worktree checks out clean (walking skeleton) | 1, 2 | `deck/test/fixtures/transcripts/**`, `deck/test/fixtures/telemetry/**` (renamed), `deck/test/transcripts.test.mjs`, `deck/test/telemetry.test.mjs`, `deck/test/analytics-buckets.test.mjs`, `scripts/test/path-length.test.mjs` (new) | – | [S1](slices/S1.md) |
| S2 | The gateguard is gone | 3, 4 | `hooks/gateguard.js`, `hooks/gateguard-fact-force.js`, `hooks/test/gateguard.test.js`, `lib/shell-substitution.js` (all deleted), `hooks/hooks.json`, `vendor/toolbox.md`, `VENDOR.md`, `scripts/test/toolbox.test.mjs`, `scripts/install-leftovers.mjs` (new), `scripts/test/install-leftovers.test.mjs` (new), `docs/INSTALL.md`, `docs/adr/0078-…` (new) | – | [S2](slices/S2.md) |
| S3 | Rules repair themselves after an upgrade | 5, 6, 7 | `scripts/install-rules.mjs`, `hooks/hooks.json`, `scripts/test/rules-repair.test.mjs` (new), `docs/INSTALL.md`, `docs/adr/0079-…` (new) | S2 | [S3](slices/S3.md) |
| S4 | The install allows the deck tools | 12, 13, 14 | `scripts/install-settings.mjs`, `scripts/test/install.test.mjs`, `docs/INSTALL.md` | S3 | [S4](slices/S4.md) |
| S5 | A plain pickup is warned and released | 8 | `hooks/session-handoff.js`, `hooks/post-tool.js`, `hooks/lib/deck.js` (`release`), `hooks/test/plain-pickup.test.js` (new), `docs/adr/0080-…` (new) | – | [S5](slices/S5.md) |
| S6 | `pilot worktrees` lists and prunes merged-clean worktrees | 9, 10 | `scripts/worktrees.mjs` (new), `bin/pilot.mjs`, `scripts/test/worktrees.test.mjs` (new), `docs/adr/0081-…` (new) | – | [S6](slices/S6.md) |
| S7 | The pilot prunes when its run closes | 11 | `agents/pilot.md` (Ending a run), `scripts/test/pilot-rules.test.mjs` | S6 | [S7](slices/S7.md) |
| S8 | The ADR format has front matter | 15 | `skills/domain-modeling/ADR-FORMAT.md`, `vendor/methodology.md`, `scripts/test/adr-format.test.mjs` (new) | – | [S8](slices/S8.md) |
| S9 | The ADR index is generated and checked | 16 | `scripts/adr-index.mjs` (new), `scripts/test/adr-index.test.mjs` (new), `docs/adr/README.md` (new, generated), `package.json` | S8 | [S9](slices/S9.md) |
| S10 | Every ADR carries front matter, checked both ways | 17, 18 | `docs/adr/*.md`, `scripts/adr-index.mjs`, `scripts/test/adr-index.test.mjs`, `docs/adr/README.md` | S9, S2, S3, S5, S6 | [S10](slices/S10.md) |
| S11 | Agents find ADRs through the index | 19 | `README.md` (Layout), `agents/pilot.md` (ADR lines), `agents/pilot-architect.md` (ADR line), `scripts/test/pilot-rules.test.mjs` | S9, S7 | [S11](slices/S11.md) |

Parallel sets with disjoint files: {S1, S2, S5, S6, S8} first; S10 waits for every slice
that adds an ADR so the backfill covers them. 11 slices, one run.

## 9. Acceptance evidence

In the order the user meets it, all in a scratch clone and a scratch home (L8):

1. `git worktree add --detach <deep scratchpad>/audit-x HEAD` exits 0; `git status` there is empty (1, 2).
2. no gateguard hook, file or helper is tracked and `check-references` is clean (the word survives only in the leftovers remover, INSTALL.md, the ADRs and design history); a scratch home seeded with `~/.gateguard/state-x.json` is emptied by the install, which names it (3, 4).
3. A scratch home holding 0.7.10's rules and one edited file: start a session with the built plugin; `cmp` of `orchestration.md` and `vertical-execution.md` exits 0, `README.md` is gone, the edited file is byte-identical and named once; a second start says nothing (5, 6, 7).
4. Run the install against the scratch home, answer yes to the deck tools, then again: one rule in `permissions.allow`; with a covering deny, none and a report line; `docs/INSTALL.md` names the question (12, 13, 14).
5. Post a hand-off on a scratch deck, start plain `claude` in the clone, make one tool call: the warning names `pilot run`; then `pilot run` picks the hand-off up (8).
6. In the scratch clone with merged-clean, merged-dirty, unmerged and locked worktrees: `pilot worktrees` names all four states; `pilot worktrees prune` removes only the merged-clean one and its local branch (9, 10); the closing-step prose names the command (11).
7. Open `docs/adr/` on the branch: the README lists every ADR with status; `npm test` fails on a scratch ADR missing from it, and on a one-sided `supersedes` (15–18); the README Layout row links it (19).

## 10. Status

| Slice | State | Branch | PR | Worktree | Blocker | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 1, 2 |
| S2 | planned | | | | – | 3, 4 |
| S3 | planned | | | | S2 | 5, 6, 7 |
| S4 | planned | | | | S3 | 12, 13, 14 |
| S5 | planned | | | | – | 8 |
| S6 | planned | | | | – | 9, 10 |
| S7 | planned | | | | S6 | 11 |
| S8 | planned | | | | – | 15 |
| S9 | planned | | | | S8 | 16 |
| S10 | planned | | | | S9, S2, S3, S5, S6 | 17, 18 |
| S11 | planned | | | | S9, S7 | 19 |
| audit-fixes | planned | feat/audit-fixes | | | S1–S11 | 1–19 |
