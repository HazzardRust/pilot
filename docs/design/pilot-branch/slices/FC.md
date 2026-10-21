# FC Fix: the sub-deck's worktree is trusted before `claude` starts

Feature `pilot-branch` · added on the user's answer to A21 (itm_4c95715302a4, 2026-10-05) · traces to spec 7, 11 · after: FB

**Closed with no code, 2026-10-05 (A22):** Claude Code keys a worktree's trust on its main checkout's root, so a sub-deck worktree of a trusted repository shows no trust screen. Kept as the record of what was asked.

## The problem

A new `<repo>-subdeck` worktree is a folder Claude Code has never seen. `claude` stops at "Is this a project you trust?" before anything runs, and `--permission-mode dontAsk` does not skip that screen (seen by QA on a scratch config). An unattended sub-deck sits there on its first start in every repository.

## The decision, the user's

`pilot run --sub` marks its own worktree trusted before it starts `claude`. Bounded by the pilot:

- Only the sub-deck worktree's own path (`openSubdeck`'s `dir`), never another folder.
- Only when the main deck's folder (the directory `pilot run --sub` was started in) is already trusted in the same config. When it is not, mark nothing, start as today, and print one line saying the window will ask.
- The config is the one `claude` will read: `CLAUDE_CONFIG_DIR` when set, the default otherwise.

## First, find the mechanism, and stop if it is the risky one

1. Look for a way Claude Code supports: `claude --help`, `claude config --help`, and the current docs (settings, CLI reference). Report what exists.
2. If the only way is to rewrite the config's `.claude.json` (the `projects` map), **do not build it**. Other `claude` sessions of the user rewrite that file while they run, and a read-modify-write from the wrapper can lose their changes or be lost to theirs. Send `main` what you found: the key, how the trust entry differs before and after a hand-accepted prompt in a scratch config, and how Claude Code itself guards the file (a lock file, an atomic rename), so the user can decide with that in front of them.

## Files owned

`deck/subdeck.mjs` (the marking, beside `openSubdeck`), `deck/run.mjs` (the one call in the `--sub` branch), `deck/test/subdeck.test.mjs` or a new `deck/test/subdeck-trust.test.mjs`.

## Tests

1. `the sub-deck's worktree is marked trusted when its main deck's folder is`.
2. `nothing is marked when the main deck's folder is not trusted`, and the line is printed.
3. `no other folder's entry and no other key of the config changes` (the rest is byte-identical or deep-equal).
4. `a missing or unreadable config marks nothing and the start goes on`.

## Done

- **Verification**: `npm test`; the two check scripts; with a scratch `CLAUDE_CONFIG_DIR` and a scratch clone: `pilot run --sub` on a fresh worktree reaches the session with no trust screen.
- **Prohibited**: no write to the real `~/.claude` or `~/.claude.json` in any test or live run; no trust for any path but the worktree's; no retry loop on the config file.
- **Done when**: tests are green and the scratch start is seen passing the screen.
