# remote-run-branches design notes

- Probe of the ownership rule over origin's real heads at design time (2026-11-27): 104 heads, 57 known runs, 91 claimed, 0 claimed twice. The 13 unclaimed are `main`, `pilot`, `hazzardrust-pilot`, `HazzardRust-patch-1`, `archive/`, `chore/`, `drift/`, `drift2/`, `fix2/`, `qa3/` names and `fix/ledger-append-only`, `fix/wait-50` (no known run).
- Merged into their feat at design time: `fix/prune-worktrees-{drift,drift2,drift3,macos,windows}`, `qa/prune-worktrees`, `qa/{crew-refusals,prebuilt-rune,rune-deck-ui}-2`, `slice/cheap-suite-s8fix`, `slice/rune-deck-ui-base`. Not merged: `slice/prune-worktrees-s9`, `slice/rune-deck-ui-s1`, `slice/tested-once-s*`.
- `qa/prune-worktrees` has no PR, predates the landing (19:19 vs 19:51 +1000) and was still on origin: cause not recorded (F3).
