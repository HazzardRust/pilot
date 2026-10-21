# The install allows pilot land and pilot integrate

Ticket `itm_d56afbf23351` · slug `install-allow-land` · base `pilot` 178c7e5e · merge: none (itm_62bca170c565)

## 1. Problem

On 2026-10-08, after the user signed Gate 2 (itm_44285f624faa), Claude Code's auto-mode classifier refused
the pilot's `pilot land` as "Merge Without Review". The classifier reads the command text and cannot see
the signed gate, so the closing report had to hand the landing back to the user (itm_38b3049df6ba). The
user took two fixes. This is fix A: the install allows the pilot's own three merge commands. Fix B
(itm_0e8a129d4e4d) lands the feature from the deck in a later run, and nothing here designs against it.

## 2. Spec

| # | Behaviour | Evidence |
| --- | --- | --- |
| 1 | The install's command line writes `Bash(pilot sync *)`, `Bash(pilot integrate *)` and `Bash(pilot land *)` to `permissions.allow` in `~/.claude/settings.json`, beside L22's ask rules. It does so idempotently and keeps the user's rules byte for byte. When the user's `deny` or `ask` list covers one of the rules, the install names that rule and leaves it out. The spelling and the ask case were sharpened from the draft (L2, L3) and agreed (itm_d32a0226f51c). The sync rule is the user's addition (itm_52e743e90913). | `node scripts/install-settings.mjs --settings <scratch>` adds all three rules, and a second run adds nothing. With `Bash(pilot land*)` in `deny`, the install prints a named line and writes no land allow rule. With `Bash(pilot *)` in `ask`, it names all three rules and adds none of them. The pins are in `scripts/test/install-allow-merge.test.mjs`. |
| 2 | The push stays guarded in code. `pilot land` and `pilot integrate` still refuse the default branch by name, whatever the allow rule says. | The `assertPushable` tests in `scripts/test/pilot-branch.test.mjs` stay green, and `git diff` on that file is empty. |
| 3 | `docs/INSTALL.md` names all three rules in its settings row and says why they are allow rules while the main-branch rules are ask rules. Neither its ask-rules paragraph nor its second-run row says any longer that no allow rule is written. | The three passages, read. |
| 4 | *Implied.* In an auto-mode session with the rules, the pilot's form `cd "<feat worktree>" && pilot land` runs with no classifier refusal. | QA runs it live (L8). `/permissions` lists both rules in auto mode, and `pilot land` fast-forwards the scratch origin's `pilot`. |
| 5 | *Implied.* The amendment to L22 ("adds no allow or deny rule") is recorded as an ADR. | `docs/adr/0110-the-install-allows-the-pilots-own-merge-commands.md` and its README row exist, and the `adr-index` and `adr-format` tests are green. |
| 6 | *Agreed (L11, itm_444260acedd1).* `pilot land`, `pilot integrate` and `pilot sync` take no `--test`. They read the test command from the repository: `npm test` when a `package.json` is present, otherwise `git config pilot.test`. When neither exists they refuse, naming `git config pilot.test "<command>"`. Without `--test`, an allowed command line can carry no shell text of its own. | `pilot land --test x` prints the usage line and exits 1. In a repository with no package.json, `git config pilot.test "exit 0"` makes `pilot integrate` go green, and unsetting it gives the named refusal. The pins are in `scripts/test/test-command.test.mjs`. |

## 3. Findings

| What | Where |
| --- | --- |
| Every merge step is a `(settings) => result` with an optional `change`. All steps go through one read, one write and one backup. | `scripts/install-settings.mjs` `applyMerges` (~:560), `installSettings` :621-649 |
| L22's ask step is the nearest pattern: a fixed list, then the denied, already-present and added rules, then the notes. | `defaultBranchAskStep` :502-547, `DEFAULT_BRANCH_ASK` :482 |
| `denyCovers(deny, rule)` tests a Bash rule's glob, including the `:*` form, against another rule's text. It works unchanged for ask rules. | :493-500 |
| The deck-tools allow is opt-in in the library and on by default in the command line (`--no-deck-tools`), which keeps the library tests free of allow rules. | :630, :768, :814 |
| The existing tests pin `permissions` exactly, for example `{ ask: ASK }`, "no allow and no deny rule". | `scripts/test/install-ask.test.mjs:51,130`; `install.test.mjs:728,745,775` |
| `pilot land`, `pilot integrate` and `pilot sync` take `--test "<cmd>"` and run it with `shell: true`. With no `package.json` and no `--test`, `integrate` refuses with exit code 2. | `scripts/integrate.mjs:83,89-97,157,166-169,263-274`; `land.mjs:116-120`; `sync.mjs:95-99` |
| `--test` appears in the command-line tests and in the pilot's prompt. | `scripts/test/cli-wiring.test.mjs:41-53`; `land.test.mjs:242,250`; `integrate.test.mjs:239,246`; `agents/pilot.md:387` |
| `assertPushable` guards every push. | `scripts/pilot-branch.mjs:63`; `land.mjs:45,46,65`; `integrate.mjs:177,248` |
| Step 9 runs `pilot land` "in the feature worktree". | `agents/pilot.md:482` |
| The sub-deck allows `pilot *`, but only through its own `--settings`. ADR 0086 rejected putting that wide a list in `~/.claude/settings.json`. | `docs/adr/0086-…md:14,20` |
| L22 asks before main and writes no allow rule. L4 and L23 make the guard in code the control. | `docs/design/pilot-branch/architecture.md:37,75,93-96` |
| In auto mode, "Actions matching your allow, ask, or deny rules resolve immediately". Entering auto mode drops "broad allow rules that grant arbitrary code execution": `Bash(*)`, wildcarded interpreters, package-manager runs, `Agent` and `Monitor`. "Narrow rules like `Bash(npm test)` stay in effect." | code.claude.com/docs/en/permission-modes, "How the classifier evaluates actions", read 2026-10-10 |
| `Bash(ls *)` matches `ls`. `Bash(ls*)` "matches `lsof` too". "A rule must match each subcommand independently." In auto mode, ask rules "fall back to a permission prompt". `.git` is a protected path. | code.claude.com/docs/en/permissions |
| This machine's settings hold two allow rules and none of L22's ask rules. `--repair` touches only the status lines, so the user has to re-run the merge for these rules to arrive. | `C:/Users/Hazzard/.claude/settings.json:9-11` |

## 4. Ubiquitous language

- **Merge commands**: `pilot sync`, `pilot integrate` and `pilot land`, the commands that push to `pilot` and to `feat/*`.
- **Merge allow rules**: `Bash(pilot sync *)`, `Bash(pilot integrate *)` and `Bash(pilot land *)`.
- **Covered**: a rule in the user's `deny` or `ask` whose glob matches the text of a merge allow rule, as `denyCovers` reads it.
- **The guard**: `assertPushable`, which refuses the default branch in code.
- **The repository's test command**: `npm test` when a `package.json` is present, otherwise `git config pilot.test` (spec 6).

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
| --- | --- | --- | --- |
| L1 | Grilling depth is **forks**: only decisions whose paths differ materially are stashed (user, itm_85b9c5ea6861). | The user set it for this run. | Every branch. |
| L2 | Each rule is written `Bash(<cmd> *)`, with a space before the `*`. | Per the docs, that form matches the bare command and does not match `pilot landfoo`. | The draft's `pilot land*`, which is wider. A bare rule plus a ` *` rule per command, which the docs make redundant. |
| L3 | A merge allow rule that the user's `deny` **or** `ask` covers is named and not added, using `denyCovers` unchanged. | Deny and ask beat allow, and ask still prompts in auto mode, so an allow rule beside either reads as a grant that never takes effect. `deckToolsStep` reasons the same way. | Covering deny only: that writes a rule that silently does nothing. |
| L4 | `pilotMergeStep(settingsPath)` sits beside `defaultBranchAskStep`, takes the same shape, and goes into the one write. | It is the codebase's step pattern: one backup, and separate results. | Folding it into the ask step, so that one step writes two lists. |
| L5 | The library is opt-in (`options.pilotMerge === true`), and the command line passes `true`. | This follows the `deckTools` precedent, and the existing tests stay unchanged. | Always on in the library, which rewrites five passing assertions. |
| L6 | An allow rule counts as already present only on an exact string match. | It matches L22, and a narrow rule next to a broader one does no harm. | Glob coverage on allow, which is code for a cosmetic gain. |
| L7 | Spec 2 needs no code: the guard and its tests are not touched. | The guard is the control (L23). | A duplicate guard test. |
| L8 | QA uses a scratch settings file (spec 1), `npm test` (2, 6) and a reading (3, 5). Spec 4 runs in a scratch Claude Code session started with `claude --permission-mode auto --settings <scratch settings>`, in a scratch clone whose `origin` is a local bare repo with `main` and `pilot`, and with a `feat/x` worktree. The user's own `settings.json` is never written. | A live session is the only place the classifier is real. | The user's settings, or a unit test in place of the classifier. |
| L9 | *(Locked on the evidence here; the user chose (a) without seeing this source.)* The test command comes from `git config pilot.test` when no `package.json` exists, and from no committed file. | Setting it is a Bash `git config`, which the classifier or a prompt sees, and an Edit to `.git/config` is a protected-path write. A file committed in the working directory would let an auto-approved Edit followed by `pilot land` reopen the hole. The library's `test` option stays as the tests' seam. | A committed `.pilot.json`; the brief's prose; keeping `--test`. |
| L10 | `Bash(pilot sync *)` is the third merge allow rule (user, itm_52e743e90913). | `sync` pushes `pilot` at the start of a ticket, and the classifier can refuse it as it refused `land`. Its `--test` is closed by S2 under (a). | Leaving it out of scope. |
| L11 | The rules stay wide and `--test` is removed from `land`, `integrate` and `sync`, which take the test command from the repository (spec 6, S2) (user, itm_444260acedd1, option (a)). | Without `--test`, an allowed command line carries no shell text of its own. `npm test` or `pilot.test` can still run code the agent can edit, for example a committed `package.json` script. That holds today with or without the rules, so this closes the one-call injection and not every route to running code. | (b) wide rules that keep `--test`, which lets an injected `--test "<shell>"` run unclassified. (c) an exact `Bash(pilot land)` only, which sends `integrate` and every `--test` call back to the classifier. |


## 6. Assumed decisions awaiting the user

| # | Default taken | Tradeoff |
| --- | --- | --- |
| A1 | The command line always writes the merge allow rules: there is no flag and no install question. *The pilot took this as assumed.* | Step 9 needs the rules on every install. The alternative is a deck-tools-style question plus `--no-pilot-merge`, which costs about 15 lines. |
| A3 | The `cd` half is left alone. If `cd` into a worktree outside the working directory prompts on its own, QA reports it as a finding for fix B. | The docs say such a `cd` needs its own approval. A machine-wide `Read` rule would grant more than this ticket asked for. |

## 7. Out of scope

- Fix B (itm_0e8a129d4e4d) and step 9's flow.
- Adding the rules through `--repair`; L22's ask rules; the sub-deck's allowlist; `assertPushable`.

## 8. Slices

| Slice | Title | Spec | Files owned | After | File |
| --- | --- | --- | --- | --- | --- |
| S1 | The install allows the pilot's merge commands (walking skeleton) | 1, 2, 3, 4, 5 | `scripts/install-settings.mjs`, `scripts/test/install-allow-merge.test.mjs` (new), `docs/INSTALL.md`, `docs/adr/0110-…md` (new), `docs/adr/README.md` | – | [S1](slices/S1.md) |
| S2 | The merge commands read the test command from the repository | 6 | `scripts/integrate.mjs` (`testArgs`, `main`, the refusal line, `repoTestCommand`), `scripts/land.mjs` (`main`, usage), `scripts/sync.mjs` (`main`, usage), `scripts/test/test-command.test.mjs` (new), `scripts/test/cli-wiring.test.mjs`, `scripts/test/land.test.mjs`, `scripts/test/integrate.test.mjs`, `agents/pilot.md` (:387) | – | [S2](slices/S2.md) |

S1 and S2 own disjoint files and can run in parallel.

## 9. Acceptance evidence

1. In a scratch settings file, the first run prints that it added three allow rules, and a second run prints that they are already present and writes nothing. The deny and ask fixtures each print a named line.
2. `npm test` is green, and `git diff origin/pilot -- scripts/test/pilot-branch.test.mjs` is empty.
3. The settings row and paragraph in `INSTALL.md`, read.
4. In a scratch auto-mode session, `/permissions` shows all three rules, and `cd "<feat worktree>" && pilot land` lands with no "Merge Without Review" refusal.
5. ADR 0110, read.
6. `pilot land --test x` prints the usage line. With no package.json, `git config pilot.test` drives `pilot integrate`, and unsetting it gives the named refusal.

## 10. Status

| Slice | State | Branch | PR | Worktree | Blocker | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | integrated at 8b2db0a4 | slice/install-allow-land-s1 | #460 | | – | 1, 2, 3, 4, 5 |
| S2 | integrated at 94c20298 | slice/install-allow-land-s2 | #458 | | – | 6 |
| install-allow-land | in QA; fix round | feat/install-allow-land | #455 | | S1, S2 | 1–6 |
## 11. Principles findings (co-pilot verdicts, 2026-10-10)

| Id | Verdict | Reason |
| --- | --- | --- |
| F1 integrate rule never matches `pilot --dir <wt> integrate` (agents/pilot.md:386) | kept | Fixed in the prompt, not the rule: :386 becomes `cd "<worktree>" && pilot integrate <slice-branch> --trailer ...`, the form `land` already takes; L2 and the rules stay. QA's spec 4 adds the integrate form. |
| F2 merge-step notes unasserted (mutants at install-settings.mjs:573-582) | kept | +3 assertions. |
| F3 sync/land no-test-command refusal untested | kept | One sync.test case. |
| F4 S2 Interface omits `--local --no-includes` and `NO_TEST` | kept | Recorded in S2.md by the co-pilot. |
| N1 test-command test 3 duplicates integrate.test | kept | Removal. |
| N2 fourth copy of the rule-list step | dropped | Outside the diff; L4 chose the same shape. |
| N3 `pilotMerge` library option has one caller | dropped | L5 locks it. |
| N4 sync picks the test command in the caller tree, `npm ci` in the merged tree | kept | Resolve in the merged tree. |
| N5 integrate.test name still says `--test` | kept | Rename. |
| N6 INSTALL.md omits sync as guarded; ADR 0110 says the agent can edit pilot.test, against L9 | kept | Two wording edits, plus QA's INSTALL.md wrap nit. |
