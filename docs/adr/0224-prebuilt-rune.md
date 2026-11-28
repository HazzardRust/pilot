---
status: proposed
date: 2026-11-26
tags: [deck, rune, release, download, security]
supersedes: []
superseded_by: []
paths: [deck/rune-bin.mjs, deck/open.mjs, bin/pilot.mjs, deck/rune/release.json, .github/workflows/rune-release.yml, scripts/rune-pin.mjs]
---
# A plugin install gets a prebuilt Rune deck, pinned by hash

We decided that `pilot deck` on a machine with no local build downloads the Rune deck CI built for its target, once, and keeps and runs it only while its sha256 matches the pin the installed plugin ships in `deck/rune/release.json`. Run `prebuilt-rune`, `docs/design/prebuilt-rune/architecture.md`.

## Context

The plugin shipped the Rune deck as Rust source only, so a machine without a Rust and C++ toolchain never got it: on a field machine `cargo build --release` failed with `linker link.exe not found` and only the HTML deck opened. The user chose prebuilt binaries over source builds. It is the plugin's first outbound request, and what it downloads is an executable it later starts.

## Decision

- **L1** The only trusted hash is the pin in the installed plugin; no hash is read from the network. Rejected: a `SHA256SUMS` asset beside the binaries (same host as what it checks).
- **L2** One seam, `deck/rune-bin.mjs`: `findRune` never touches the network, `ensureRune` is the only caller of `get`. Rejected: fetch code in `bin/pilot.mjs` (doctor and auto-open would re-derive the state).
- **L3** Fetched files live in the plugin's own `deck/rune/target/fetched/` (already gitignored), so each installed version has its own and a version change needs no cleanup. Rejected: `~/.claude/pilot` (cross-version pruning, and portable-store's export would carry binaries).
- **L4** Built beats fetched beats HTML. A Rune problem never changes `pilot deck`'s exit code.
- **L5** The release side adds no dependency: first-party `actions/checkout`/`setup-node`, the runner's `gh`, and a Node script. Draft release, all assets uploaded, then published.
- **L6** The request is one plain GET to `https://github.com/HazzardRust/pilot/releases/download/<tag>/<asset>`, the tag from the pin and matched against `^v\d+\.\d+\.\d+$|^rune-scratch-[0-9a-f]{7,40}$`; nothing else is sent, and the signed redirect URL is never printed.
- **L7** Evidence before main, because `workflow_dispatch` only exists once the file is on the default branch: a `pull_request` touching the workflow, `scripts/rune-pin.mjs` or `deck/rune/Cargo.{toml,lock}` runs build and pin only; a `rune-scratch-*` tag push adds a prerelease with no commit.

**Consequences**: a fetched binary is hashed at every reuse (~50-100 ms per open), and one that changed on disk is deleted and that launch opens the page; the next `pilot deck` fetches it again. Each hop of the download must be https, at most 5 hops, 30 s and 100 MB; any host is allowed, since the hash is the gate. The hash guards against the network and a damaged file, not a writer running as the user between the check and the run copy under `target/run`, who could already edit the pin. A poisoned build input is pinned faithfully (accepted; `--locked` and the rev pin mitigate). The binaries are unsigned, so where Smart App Control is enforced the page opens instead.
The Windows binary is not byte-reproducible across runs of one commit (PR run e2c39663 and tag run f0f0d3cb differ; macOS and Linux match), so its pin holds only for the run that made it; no build flag was changed for it.
