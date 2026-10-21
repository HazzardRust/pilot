---
status: proposed
date: 2026-10-21
tags: [cli, testing, windows]
supersedes: []
superseded_by: []
paths: [docs/design/audit-f2-f3/architecture.md, scripts/gh-stub.mjs, bin/pilot.mjs]
---
# A gh stub is node, linked as gh

An implementer or QA agent that probes a PR command live (`scripts/integrate.mjs:55` runs `execFileSync('gh', …)`) either reaches real GitHub or rebuilds a fake gh by hand, and on Windows the obvious fake, a `gh.cmd`, is never found because `execFileSync` resolves only a real exe (`docs/design/audit-f2-f3/architecture.md` §3, audit row F3). So we decided that `pilot gh-stub` makes the fake once, in the shape that worked in PR #312.

- **L1 The stub is node itself**, hard-linked into a fresh dir as `gh.exe` (`gh` off Windows), a copy where a link is refused or crosses volumes, with `NODE_OPTIONS=--require <dir>/stub.cjs`. An old `gh` in a reused `--dir` is removed before the link, so a copy never writes through it into node.
- **L2 The preload is a no-op unless the running exe's base name is `gh` or `gh.exe`**, because `NODE_OPTIONS` reaches every node under that env, `pilot` and the test runner included.
- **L3 One reply for every call, and a calls log**: under gh, the args go to `<dir>/calls.jsonl` as one JSON line, `<dir>/reply.txt` goes to stdout (nothing when absent), and the exit is 0, with no network.
- **L4 The output is shell lines**: sh `export` lines by default, the dir in `/c/...` form under Git Bash (`MSYSTEM`), where the Windows form loses to the real gh; `$env:` lines with `--powershell`; a fresh `mkdtemp` dir unless `--dir`, so parallel agents' replies stay apart. The agent runs `eval "$(pilot gh-stub)" && <probe>` in one Bash call, since shell state does not persist between calls.

Node reads its first argument as a script path and resolves it against the cwd before the preload runs; the stub takes it back relative to the cwd. A first argument starting with `-` (`gh --version`) is read by node as its own option, so the stub answers subcommands only.

Rejected:
- A `gh.cmd` or shell script: `execFileSync` never finds it on Windows.
- A Node SEA build: needs postject and a signing step.
- Unsetting `NODE_OPTIONS` per call instead of the guard: the caller would have to remember.
- A per-subcommand reply table: no run asked for one.
- Printing only a PATH value: loses the `NODE_OPTIONS` half and the `/c/` form.
