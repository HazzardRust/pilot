# plain-session: a plain `claude` session carries only what the install was told to

Ticket `itm_44266e980748` · branch `design/plain-session` · base `pilot` 4c6448b8 · feature `plain-session`

## 1. Problem

> when a user installs this, i want the only way for the deck to work is if they do "pilot run", their regular
> claude sessions remain untouched, never eats into their normal context
> … add it as a step on the install wizard for the user to choose how much it effects their regular sessions

Today a plain `claude` session carries ~9k tokens of pilot: deck tool schemas, 22 agents, 20 skills,
`orchestration.md` and `vertical-execution.md` always on. `post-tool.js` runs five lanes after every tool
call, and SessionStart copies ~113 rule files into `~/.claude/rules` and rewrites `statusLine`.

## 2. Spec

The **reach** has three levels: `nothing` (default), `rules`, `everything`. A **plain session** is any
`claude` not started by `pilot run`.

| # | Behaviour | Evidence (bar) |
| --- | --- | --- |
| 1 | The install asks the reach. `pilot reach <level>` applies it and stores it in `~/.claude/pilot/reach.json`. | An apply test per level over a fake HOME writes `reach.json` and exactly the files in §5 L4's table. INSTALL.md names the question and the command (1 question, 1 step). |
| 2 | At `nothing` and `rules`, no pilot hook starts in a plain session. | `claude -p --output-format stream-json --verbose` on a throwaway HOME shows 0 `hook_started` events. Probe 2026-10-19: 0 disabled vs 4 enabled. |
| 3 | At `nothing`, no session writes a pilot rule into `~/.claude/rules` or a `statusLine` into user settings. `pilot run`'s own process carries the rules and the status line. | A repair test over an empty fake HOME at `nothing` leaves `~/.claude/rules` with 0 files and settings with no `statusLine`. `pilot run`'s argv carries `--add-dir <rules root>` and `statusLine`. Live: the pilot and one subagent quote a line of `orchestration.md`. |
| 4 | Agents, skills and MCP servers load only in `pilot run`'s process at `nothing` and `rules`, and in every session at `everything`. There is one plugin, installed disabled; `pilot run` enables it for itself. | Init event on a plain session: 0 `pilot` tools, agents, skills, MCP servers. Under `pilot run`'s settings: 25 agents, 20 skills, deck `connected`. `enabledPlugins["pilot@pilot"]` in user settings is `false`. |
| 5 | `pilot doctor` shows the reach, flags drift between `reach.json` and `enabledPlugins`, and names the fix. | Doctor test: one row per level, one row for "not chosen", one for drift, each with its `pilot reach` step. |
| 6 | A plain session at the default measures 0 pilot tokens. | `scripts/measure-plain.mjs` on a throwaway HOME prints 0 for each of tools, agents, skills, MCP servers, hooks, shipped rules, `statusLine`, excerpt. |
| 7 | Below `everything`, the install does not offer the `CLAUDE.excerpt.md` append (~0.9k tokens in every session). | INSTALL.md's step 7 is conditional on `everything`. A wording test pins it. |
| 8 | The install's verify step and the docs that say `claude --agent pilot:pilot` work at every level. | INSTALL step 9 carries the enable. A grep of README, INSTALL, OPERATING and the excerpt finds 0 bare `claude --agent pilot:pilot` starts. |
| 9 | `pilot run` carries the same crew at every level. *practitioner: a Claude Code plugin author, who reads the session's init event* | Live, per level, the init event under `pilot run`'s argv lists 25 agents, 20 skills and both MCP servers. |

Lines 1–8 are the ones sent to the user on `itm_a31214ab269d` (Agree/Change). Line 9 comes from the depth pass.

## 3. Findings

| What | Where |
| --- | --- |
| `pilot run` argv is a constant, and already passes `--settings` (`{agent}`) because `--agent` does not survive `/bg` | `deck/run.mjs:96`. Used at `:585`, `:614`, `:689`; pinned in `deck/test/run.test.mjs:1264,1274` |
| `pilot run` env sets `PILOT_RUN_PID`/`PILOT_RUN_REPO` (pty only) | `deck/run.mjs:624` |
| The deck daemon is started by the first session's MCP client or by `pilot deck` | `deck/client.mjs:215-225`, `bin/pilot.mjs:232` |
| The launcher finds the plugin through `claude plugin list --json`, which lists a disabled plugin too (probed) | `bin/launcher.mjs:39-60` |
| The install is a prompt (INSTALL.md) run by an agent. Answers are CLI flags; there is no per-user settings file | `docs/INSTALL.md:31-48`, steps `:50-274` |
| Rules: 113 files, 111 with `paths:`; only `rules/orchestration.md` and `rules/vertical-execution.md` are always on | `rules/` |
| `installRules` / `repairRules` / `removeShippedRules` are ledger-driven (ADR 0055, 0079) | `scripts/install-rules.mjs:158,260,300` |
| `statusLineSetting`, `removeOwnSettings`, `repairSettings`. Nothing writes `enabledPlugins` | `scripts/install-settings.mjs:78,667,801` |
| Doctor rows `{name, verdict, detail, steps}` are built in `checkAll` with injected deps | `deck/doctor.mjs:249-271` |
| The store-file pattern (read tolerant, write tmp+rename) | `deck/usage-switch.mjs` |
| Only `markTurnEnded` reads `PILOT_RUN_PID` in hooks; it is already a no-op in plain sessions | `hooks/lib/deck.js:706-710` |
| **Probe** (throwaway `USERPROFILE`/`HOME`/`CLAUDE_CONFIG_DIR`, no login): the init event and hooks are emitted before auth | scratch, 2026-10-19 |
| Probe: disabled plugin = 0 tools/agents/skills/MCP/hooks. `--settings '{"enabledPlugins":{"pilot@pilot":true}}'` = 29 tools, 25 agents, 20 skills, 4 hooks, and user settings stay `false`. `--plugin-dir` loads it as `pilot@inline` | same |
| **Found**: `install-rules`/`install-settings` use `os.homedir()` and ignore `CLAUDE_CONFIG_DIR`. A cwd under `C:\Users\Hazzard` makes Claude read the real `~/.claude` as an ancestor project dir (debug log: `project=[C:\Users\Hazzard\.claude\skills]`). QA's HOME **and** cwd must sit outside the user's home tree, with all three variables set | `scripts/install-rules.mjs:50,239`, `install-settings.mjs:69` |

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `scripts/reach.mjs` (new) | `readReach`, `rulesPlan`, `runSettings`, `PLUGIN_ID`, `rulesRoot` | Level → what each place holds. The only reader of `reach.json` | Local-substitutable (fs under a fake HOME) |
| `scripts/apply-reach.mjs` (new) | `applyReach` | `reach.json` write, both rules targets, `enabledPlugins`, `statusLine` | Local-substitutable |
| `scripts/install-rules.mjs` | `installRules({ only })`, `repairRules` | Subset selection and pruning of out-of-subset shipped copies | Local-substitutable |
| `scripts/install-settings.mjs` | `installSettings({ enablePlugin, statusLine })`, `repairSettings` | The `enabledPlugins` merge; the statusLine is conditional on the reach | Local-substitutable |
| `deck/run.mjs` | `claudeArgs`, `runEnv` | Replaces `CLAUDE_ARGS` | In-process (pty injected) |
| `deck/doctor.mjs` | `reachRow` | Level, not chosen, drift | In-process (deps injected) |
| `scripts/measure-plain.mjs` (new) | `pilotFootprint` | Counting pilot entries in an init event and a HOME | In-process (pure over parsed input) |

Deletion test: hook entries need no gate (L3), so none was added. `CLAUDE_ARGS` dies into `claudeArgs`. `reach.mjs`
earns its place: four callers (run, repairs, doctor, apply) and one meaning of a level.

## 4. Ubiquitous language

- **reach**: `nothing` | `rules` | `everything`, how much of the pilot a plain session carries.
- **plain session**: any `claude` process not started by `pilot run`.
- **rules root**: `~/.claude/pilot/rules-root`, whose `.claude/rules` holds the rules `pilot run` loads with `--add-dir`.
- **scoped rules**: the 111 rules with `paths:` frontmatter. **always-on rules**: `orchestration.md` and `vertical-execution.md`.
- **run settings**: the `--settings` JSON `pilot run` passes: `agent`, `enabledPlugins`, and `statusLine` below `everything`.

## 5. Locked decisions

- **L1 One plugin, enabled per process.** The marketplace entry carries `defaultEnabled: false`. `pilot reach` writes
  `enabledPlugins["pilot@pilot"]`, and the run settings set it `true` for `pilot run` (probed). *Rejected:* a second
  plugin (two manifests, two installs, and fresh-public-repo would publish two plugins for no gain). Also rejected
  `--plugin-dir`: it loads as `pilot@inline` and double-loads at `everything`.
- **L2 No hook gate on `PILOT_RUN_PID`.** A disabled plugin loads no hooks. A gate would break plain pickup and
  hand-off at `everything` and does nothing below it. *Rejected:* draft spec 2's per-hook exit.
- **L3 The repair hooks follow the reach.** `repairRules` applies `rulesPlan` to both targets. `repairSettings` writes
  `statusLine` only at `everything`. *Rejected:* a separate hook entry per level.
- **L4 What each level holds:**

  | reach | `~/.claude/rules` | rules root | `enabledPlugins` | user `statusLine` | `pilot run` adds |
  | --- | --- | --- | --- | --- | --- |
  | nothing | no shipped copy | all 113 | false | none | enable, statusLine, `--add-dir` |
  | rules | 111 scoped | 2 always-on | false | none | enable, statusLine, `--add-dir` |
  | everything | all 113 | empty | true | set | enable |

  Edited rules are left and named, as the ledger already does. Moving down removes only shipped copies and the
  pilot's own `statusLine` (`removeOwnSettings`'s rule).
- **L5 Store** in `~/.claude/pilot/reach.json` `{ level, at }`, beside `usage-log.json`, with the same read and write
  pattern. The rules root is under `os.homedir()`, not `storeDir()`, so a scratch deck does not move it.
- **L6 The wizard is INSTALL.md.** A fourth question asks the reach, and a step runs `pilot reach <level>`. There is
  no new interactive installer. *Rejected:* a stdin wizard (ADR 0002: the install is a prompt).
- **L7 `claude --agent pilot:pilot` by hand is not a supported start below `everything`.** Per the user's words, the
  deck works only through `pilot run`.
- **L8 The token measurement reads the init event** (`--output-format stream-json --verbose`), which needs no login.
  *Rejected:* `measure-prompt.mjs`'s byte count, which cannot see what Claude Code actually loaded.
- **L9 Grilling depth: forks** (coordinator, 2026-10-19).
- **L10 QA environment:** this machine, a throwaway HOME with the plugin installed there, `claude -p` to read the
  plain session's prompt, `pilot run` with a scratch deck. The user's `~/.claude` is never touched. `USERPROFILE`,
  `HOME` and `CLAUDE_CONFIG_DIR` are all set, and HOME and cwd sit outside `C:\Users\Hazzard` (§3 Found).

## 6. Assumed decisions

- **A1 "rules" means the scoped rules only** (`itm_e06e5f099123`; **user, 2026-10-19: the default, language rules only**). Default: the 111 scoped rules go in `~/.claude/rules`
  (0 tokens at start) and the always-on two stay out. Tradeoff: plain sessions lose the orchestration rules, which are
  useless without the crew. Rejected: two levels.
  Verdict: stands — the user asked that plain sessions never pay for the crew; the scoped rules cost nothing until a file matches.
- **A2 An install with no `reach.json` reads as `everything`** (`itm_a8d44190ac02`; **user, 2026-10-19: the default, keep everything until chosen**). Default: nothing is removed on
  upgrade, and doctor says "not chosen". Tradeoff: an upgraded machine keeps ~9k tokens until one command is run.
  Rejected: applying `nothing` on upgrade.
  Verdict: stands — an upgrade that silently empties ~/.claude/rules would surprise every existing install; doctor names the unchosen reach and one command sets it.
- **A3 Rules reach `pilot run` through `--add-dir`** (`itm_fdcaff13d43f`; **user, 2026-10-19: the default, `--add-dir` root**). Default: `--add-dir <rules root>` with
  `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1`. Tradeoff: add-dir also grants file access to the root. Unprovable
  without a login, so S1 proves it live. If a subagent misses the rules, S1 stops and asks `main`; the fallback is
  `--append-system-prompt-file`, main session only. Rejected: a per-process `CLAUDE_CONFIG_DIR`, and copying into
  each repo.
  Verdict: stands — S1 proves it live before anything stands on it, and the fallback is named.
- **red team: A4 `--add-dir` is variadic.** Placed before the positional prompt, it would swallow `RESUME_PROMPT` as
  a directory. `claudeArgs` puts `--add-dir <root>` before `--agent`, and S1's test pins the prompt as the last
  argv entry.
  Verdict: stands — S1 pins the prompt as the last argv entry.
- **red team: A5 the repair hooks run inside `pilot run` at `nothing`.** Unchanged, `start:any:rules-repair` would copy
  all 113 rules back into `~/.claude/rules` and `statusline-repair` would rewrite `statusLine`, undoing spec 3 on the
  first run. S2 and S3 make both follow `rulesPlan`. S2's first red step is exactly this: repair at `nothing` writes
  0 files home.
  Verdict: stands — S2 and S3 make both repair hooks follow rulesPlan; its red step is the proof.
- red team, also attacked: S5's drift read and S3's write both name `pilot@pilot`, so both take `PLUGIN_ID` from S1's
  `reach.mjs`. The launcher's copy stays (it runs before the plugin root is known). The pty and plain spawn paths
  both use `claudeArgs` (S1 owns both). Nothing found in S7 (pure parser).

## 7. Out of scope

A second plugin. A hook-level gate. Per-project reach. Changing what `pilot run` does at `everything`. The
deck-spawn-root change. A stdin installer. Migrating anyone's `reach` automatically (A2). The permission `allow`
rules, which cost no context and stay at every level.

## 8. Slices

Width 4; longest stem 4 (S1 → S2 → S4 → S6).

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Walking skeleton: `pilot run` carries the crew with the plugin disabled | 3, 4, 9 | `scripts/reach.mjs` (new), `scripts/test/reach.test.mjs` (new), `deck/run.mjs`, `deck/test/run.test.mjs` | – | ts, security | [S1](slices/S1.md) |
| S2 | Rules follow the reach, repair included | 3 | `scripts/install-rules.mjs`, `scripts/test/install-rules-reach.test.mjs` (new) | S1 (`reach.mjs` `rulesPlan`) | ts, security | [S2](slices/S2.md) |
| S3 | Settings follow the reach: `enabledPlugins` and `statusLine` | 3, 4 | `scripts/install-settings.mjs`, `scripts/test/install-settings-reach.test.mjs` (new) | S1 (`reach.mjs` `readReach`, `PLUGIN_ID`) | ts, security | [S3](slices/S3.md) |
| S4 | `pilot reach <level>` applies and stores the choice | 1, 2, 4 | `scripts/apply-reach.mjs` (new), `scripts/test/apply-reach.test.mjs` (new), `bin/pilot.mjs`, `.claude-plugin/marketplace.json` | S2 (`installRules({only})`), S3 (`installSettings({enablePlugin})`) | ts, security | [S4](slices/S4.md) |
| S5 | `pilot doctor` shows the reach and its drift | 5 | `deck/doctor.mjs`, `deck/test/doctor-reach.test.mjs` (new) | S1 (`reach.mjs` `readReach`, `PLUGIN_ID`) | ts | [S5](slices/S5.md) |
| S6 | The install asks the reach; docs start through `pilot run` | 1, 7, 8 | `docs/INSTALL.md`, `README.md`, `docs/OPERATING.md`, `CLAUDE.excerpt.md`, `agents/pilot.md`, `rules/orchestration.md`, the rules ledger if regenerated, `docs/adr/<next>-plain-session-reach.md` (new), `docs/adr/README.md`, `scripts/test/install-reach-wording.test.mjs` (new) | S4 (`pilot reach` CLI) | ts, security | [S6](slices/S6.md) |
| S7 | A plain session measures 0 pilot tokens | 6 | `scripts/measure-plain.mjs` (new), `scripts/test/measure-plain.test.mjs` (new), `scripts/test/fixtures/init-*.json` (new) | – | ts, security | [S7](slices/S7.md) |

Overlaps outside this run: deck-writes-github (`itm_5f1725c876a7`) also edits `scripts/install-settings.mjs` (S3)
and adds a doctor row (S5). The Defender ticket adds a doctor row (S5). crew-tests-behaviour (#906) sweeps
`agents/pilot.md` (S6). fresh-public-repo publishes the same single plugin with `defaultEnabled: false` (S4); no
second plugin changes what it ships.

## 9. Acceptance evidence

In a throwaway HOME and cwd outside `C:\Users\Hazzard` (L10), with the plugin installed from the run branch:

1. The install prompt asks the reach. The answer `nothing` runs `pilot reach nothing`, and `reach.json` says `nothing` (spec 1).
2. The excerpt is not offered (spec 7).
3. `pilot doctor` prints `reach: nothing` with the command to change it. After `claude plugin enable pilot@pilot` by hand, it prints the drift (spec 5).
4. `node scripts/measure-plain.mjs --home <throwaway>` prints 0 on every row (specs 2, 4, 6).
5. `~/.claude/rules` holds no shipped rule and settings hold no `statusLine`, after a plain session and after a `pilot run` (spec 3).
6. `pilot run` on a scratch deck: the init event lists 25 agents, 20 skills and the deck `connected`, and the status line shows. Asked, the pilot and a spawned explorer each quote `orchestration.md` (specs 3, 4, 9).
7. `pilot reach rules`: 111 scoped rules home, 0 always-on; measure-plain still 0 at start. `pilot reach everything`: today's behaviour, and `pilot run` still works (specs 1, 9).
8. README, INSTALL and OPERATING start the pilot only through `pilot run` (spec 8).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 3, 4, 9 |
| S2 | planned | | | | S1 | 3 |
| S3 | planned | | | | S1 | 3, 4 |
| S4 | planned | | | | S2, S3 | 1, 2, 4 |
| S5 | planned | | | | S1 | 5 |
| S6 | planned | | | | S4 | 1, 7, 8 |
| S7 | planned | | | | – | 6 |
| plain-session | planned | `feat/plain-session` | | | S1–S7 | 1–9 |
