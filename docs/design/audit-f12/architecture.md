# audit-f12: a hook refuses shell edits of tracked source

Ticket `itm_14e3f5278542` · audit `2026-11-17T00-56-45-000Z.json` F12 · base `origin/pilot` fa28b73b.

## 1. Problem

Agents edit tracked source through the shell (`sed -i`, a heredoc or `echo` redirected into the file). On Windows
that mangles backslashes, `\n`, backticks and line endings, and the agent loses one to four rounds finding out. A
prose rule (`agents/pilot-implementer.md:31-33`, `agents/pilot-qa.md:45`) has not stopped it: the audit counts 20 of 72
run reports, lander and prose-concision after the rule; 18 of them read here as real breakages (§3). A hook should refuse the call before it runs and name Edit/Write.

## 2. Spec

| # | Behaviour | Evidence | Bar |
| --- | --- | --- | --- |
| 1 | A pilot-lane Bash `sed -i` / `sed --in-place` on a git-tracked file is refused before it runs; the reason names the file and the Edit and Write tools. | Unit fixtures; one live call in a scratch clone, the file's hash unchanged after. | 5 of 5 sed fixtures refused (relative, `C:/` absolute, Git Bash `/c/` absolute, `--in-place`, relative after a leading `cd <dir> &&`); hash equal. |
| 2 | A pilot-lane Bash call that writes a tracked file from a heredoc (`cat > f <<EOF`, `cat <<EOF > f`, `tee f <<EOF`) or from `echo`/`printf` redirected (`>`, `>>`) into it is refused the same way. | Unit fixtures, shaped on the forms the 18 reports name. | 6 of 6 refused. |
| 3 | Everything else still runs, with no output from the hook: a heredoc fed to a command (`pilot verdicts`, `pilot lesson-report`, `git commit -F -`), `>/dev/null`, `2>&1`, a program's output redirected (`node gen.mjs > f`), `tee` to a log, any write to an untracked or ignored path (scratch, temp), `>` inside quotes or a heredoc body. | Unit fixtures, the two crew-definition heredocs (`agents/pilot-architect.md:152`, `agents/pilot-teacher.md:53`) verbatim among them. | >=10 pass fixtures, 0 refused. |
| 4 | A refusal is not a blocked step: its reason says so and tells the agent to redo the change with Edit/Write; nothing is posted to the deck. | Test on the reason text; the hook has no deck import. PermissionDenied does not fire on a PreToolUse deny (hooks docs). | Reason contains `not a blocked step`; 0 deck calls. |
| 5 | The hook fails open: an unreadable payload, a target dir that is not a repo, git missing or erroring, all let the call run. | Unit tests, one per cause. | 4 of 4 return no output. |
| 6 | practitioner: hook author measuring its tax. A Bash call with no write candidate spawns no git; the hook adds little to every Bash call. | Test with an injected `isTracked` counting calls; QA times 20 live calls with and without the hook. | 0 git calls for 0 candidates; median added <=150 ms. |
| 7 | Only the pilot and its crew are guarded (A1): a payload that is not a pilot lane gets no output. | Unit fixture with `agent_type` `Explore` and with none. | 2 of 2 no output. |

Spec lines are *assumed* (A6): proposed to `main`, not confirmed by the user (no grilling, L6).

## 3. Findings

- `hooks/hooks.json:62-75`: one PreToolUse entry, `deck-author.js` on the deck tools; no hook in the repo denies a
  call through PreToolUse yet. This is the first `permissionDecision: "deny"`.
- `hooks/deck-author.js`: the PreToolUse pattern: pure function over the payload, `main()` reads stdin, writes JSON,
  exit 0, swallows parse errors. `hooks/test/deck-author.test.js`: pure-function asserts, one `spawnSync` of the hook,
  one manifest assertion.
- `hooks/permission-denied.js:41` exports `isPilotLane(payload)`: crew = `agent_id` + `agent_type` `pilot:*`;
  pilot session = no `agent_id`, `agent_type` `pilot:pilot`/`pilot`. Reused, not copied.
- `hooks/permission-refuse.js:39-53`: its messages open `Refused:` and say "record it as a blocked step"; the new
  reason must not read like them (spec 4).
- Hooks docs (code.claude.com/docs/en/hooks): deny is `{"hookSpecificOutput":{"hookEventName":"PreToolUse",
  "permissionDecision":"deny","permissionDecisionReason":"…"}}`, the reason shown to Claude; PermissionDenied "doesn't
  run … when a PreToolUse hook blocks a call". PowerShell's `tool_input.command` matches Bash's; matcher `Bash|PowerShell`.
- Run reports (deck.json, kind `report`, this repo): 18 real breakages. Forms named: heredoc 15, python 6, sed 6,
  node -e 4, perl 1, bare `cat >` 1; PowerShell 0. No report quotes the failing command; 7 say Git Bash.
- Crew definitions instruct two heredocs, both fed to a command: `agents/pilot-architect.md:152`,
  `agents/pilot-teacher.md:53`. None instructs `sed -i` or a redirect into a tracked file.
- Overlap: yellow-never-idle owns `hooks/test/stop-gate-idle-yellow.test.js` and deck/ files; home-store-guard owns
  `scripts/gate.mjs`, `deck/store-dir.mjs`, `store-core.mjs`. This run owns two new files and `hooks/hooks.json`;
  a text conflict only if yellow-never-idle edits `hooks.json`, and then in another event's array.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `hooks/shell-write-guard.js` | `decide(payload, deps?) -> output \| null`; `writeTargets(command) -> Target[]` | lane check, quote and heredoc-body stripping, form detection, path mapping, tracked lookup, the reason text | in-process |
| `isTracked` (dep of `decide`) | `isTracked(cwd, paths) -> string[]` (tracked subset) | one `git -C <dir> ls-files -- <names>` per distinct target dir | local-substitutable (a temp repo in tests) |
| `hooks/permission-denied.js` | `isPilotLane(payload)` | unchanged, imported | in-process |

Deletion test: `writeTargets` earns its keep (all form knowledge in one place, the main test surface); `isTracked`
is a seam with two adapters (git, the test's fake). No fold slice: no shallow module is touched.

## 4. Ubiquitous language

- **shell write**: a Bash call that writes a file by `sed -i`, a heredoc into it, or `echo`/`printf` redirected into it.
- **target**: the path a shell write would change, resolved against the call's `cwd`.
- **tracked**: listed by `git ls-files` in the target's directory at hook time.
- **pilot lane**: a payload `isPilotLane` accepts.
- **refusal**: the hook's PreToolUse deny; never a blocked step.

## 5. Locked decisions

- **L1** Deny through PreToolUse JSON (`permissionDecision: "deny"` + reason), exit 0. Rejected: exit 2 with stderr
  (same routing, but JSON is the documented path and testable as a value).
- **L2** Tracked means `git ls-files` at hook time, spawned only when a candidate exists, once per distinct target
  directory (`git -C <dir>`, so an absolute path into another worktree resolves in its own repo). Rejected: an
  extension rule (refuses a scratch `.mjs`, misses other files); a git spawn on every Bash call.
- **L3** Refused forms: `sed` with `-i`/`--in-place`; `cat`/`tee` fed by a heredoc writing the target; `echo`/
  `printf` redirected into it. Rejected: any `>` into a tracked file, which refuses a generator (`node gen.mjs > f`)
  whose bytes are not mangled.
- **L4** Fails open on every error, posts nothing, and its reason says "not a blocked step". Rejected: failing
  closed, which turns a git hiccup into a lost round, the cost the hook exists to remove.
- **L5** Quoted strings and heredoc bodies are stripped before redirections are scanned; Git Bash `/x/…` paths map
  to `X:/…` on win32. (red team)
- **L7** A relative target after a leading literal `cd <dir> &&` resolves against `<dir>` (itself resolved against
  the payload's `cwd`); a non-literal or later `cd` resolves against `cwd` and passes. From A4's overturn.
- **L6** Grilling depth: No grilling (user, itm_723c21644a7b). overridden: the hook's refusal line is first seen at
  Gate 1; a Not yet there costs a re-cut. No question thread is posted; every stash stands as an A‹n›.
- ADR 0195, `docs/adr/0195-audit-f12.md`, records L1-L4; the landing numbers it.

## 6. Assumed decisions

- **A1** *assumed*: Only the pilot and its crew agents are refused; a plain Claude session's shell write still runs.
  Default: `isPilotLane`. Trade: the user's own sessions stay unguarded. Rejected: every session, which cuts against
  itm_93cdec375a75 (plain sessions carry nothing of pilot).
  Verdict: stands — queued ticket itm_93cdec375a75 wants a plain session untouched by any pilot hook
- **A2** *assumed*: Only Bash calls are checked; a PowerShell `Set-Content`, `Out-File` or `>` into a tracked file
  still runs. Default: matcher `Bash`. Trade: PowerShell 5.1's UTF-16 `Out-File` stays unguarded. Rejected:
  `Bash|PowerShell` with a second parser, a third slice, on 0 of 18 reports.
  Verdict: stands — the ticket's words are "a Bash call"; 0 of 18 reports name PowerShell
- **A3** *assumed*: `python -c`, `node -e`, `perl -pi` and a heredoc fed to an interpreter that writes a tracked
  file still run. Default: pass. Trade: 6 + 4 + 1 of the 18 reports name these. Rejected: parsing interpreter
  source, which cannot be done reliably.
  Verdict: stands — the ticket names sed -i and heredoc redirection only; the gate1 body must say interpreter writers (11 of 18 report mentions) stay uncaught
- **A4** *assumed*: A shell write whose relative path depends on an earlier `cd` in the same command still runs.
  Default: resolve against the payload's `cwd`. Trade: that form is missed. Rejected: tracking `cd` through the
  command. The crew's own rule (`cd <dir> && { …; }`) makes absolute paths the common form, which is caught.
  Verdict: overturned: the pilot's own brief rule makes `cd <dir> && { …; }` the standard form for a command outside the cwd, so a relative path after a leading literal `cd <dir> &&` is the common case in crew worktrees and must be resolved against that dir; only a non-literal or later cd still passes
- **A5** *assumed*: QA checks this with the hook's unit tests plus one live Bash call in a scratch clone session:
  a `sed -i` on a tracked file refused, a `pilot verdicts`-style heredoc run.
  Verdict: stands — a hook unit suite plus one live Bash call in a scratch clone session; no database
- **A6** *assumed*: the spec of §2 as proposed to `main`. Default: as written. Trade: spec 6's latency bar and
  spec 7's lane fixtures are additions the ticket did not name.
  Verdict: stands — no queued ticket claims the hook's spec; the latency bar guards every Bash call the crew makes
- red team: absolute paths are the crew's habit and point into worktrees outside the session's `cwd`; one
  `git -C <cwd> ls-files` would fatal "outside repository" and fail open on every one. Changed L2: one spawn per
  target dir.
- red team: a `pilot verdicts <<'EOF'` body holding `x > y`, and `git commit -m "a > b.md"`, would read as
  redirections. Changed L5: strip heredoc bodies and quoted strings first; both are S2 pass fixtures.
- red team: Git Bash hands `/c/Users/...`; `path.resolve` on win32 makes it `C:\c\Users\...`, untracked, a silent
  pass. L5 maps it; an S1 fixture.
- red team: S1 and S2 half-build `writeTargets`. S1 creates it with the sed form and its Target shape; S2 only adds
  forms behind it; S2 after S1 on that file.

## 7. Out of scope

Interpreter writers (A3); PowerShell (A2); the prose rule in `agents/pilot-implementer.md` and `agents/pilot-qa.md`
(kept, now backed); a `.gitattributes` or `scripts/edit.mjs` (other reports' proposals); `cp`/`mv` onto a tracked file.

## 8. Slices

Width 1; longest stem 2

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | A sed -i on a tracked file is refused | 1, 4, 5, 6, 7 | `hooks/shell-write-guard.js` (new), `hooks/test/shell-write-guard.test.js` (new), `hooks/hooks.json` | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | Heredoc and echo writes are refused, read-only heredocs pass | 2, 3 | `hooks/shell-write-guard.js`, `hooks/test/shell-write-guard.test.js`, `docs/adr/0195-audit-f12.md` (new) | S1 (`hooks/shell-write-guard.js`, `writeTargets`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S2](slices/S2.md) |

S1 is the walking skeleton: payload, lane, one form, git lookup, deny, manifest, end to end. S2 thickens `writeTargets`.

## 9. Acceptance evidence

In a scratch clone of `feat/audit-f12`, a pilot-lane session with the plugin loaded from that clone:

1. `sed -i 's/a/b/' <abs path to a tracked .md>`: refused, reason names the file, Edit and Write, and "not a blocked step"; the file's hash unchanged (spec 1, 4).
2. `cat > <tracked .mjs> <<'EOF'` … `EOF`: refused (spec 2).
3. `pilot verdicts`-style `cat <<'EOF' | wc -l` with a `>` in the body, and `echo x > <scratch file>`: both run (spec 3).
4. 20 timed `true` calls with and without the hook: median difference <=150 ms (spec 6).
5. `node --test hooks/test/shell-write-guard.test.js`: green; `npm test` green (spec 1-7).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | `slice/audit-f12-s1` | – | – | – | 1, 4, 5, 6, 7 |
| S2 | planned | `slice/audit-f12-s2` | – | – | S1 | 2, 3 |
| audit-f12 | planned | `feat/audit-f12` | – | – | S1, S2 | 1-7 |
