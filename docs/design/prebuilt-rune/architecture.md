# A plugin install gets a prebuilt Rune deck

Ticket `itm_ff5ace129388` · slug `prebuilt-rune` · base `main` at 6701cc7 (`pilot base`; ADR 0200) · design branch `design/prebuilt-rune`

Re-cut 2026-11-26 from gate1 itm_dcb61dfe0b0c (6966e99, cut on `feat/ui-design-workflow`, merged to main as #140):
`origin/main` merged in, every anchor re-read. Spec, L0-L7 and A1-A10 unchanged; changes: ADR number, anchors,
S3's verdict word, the brief.

## 1. Problem

The plugin ships the Rune deck (`deck/rune`) as Rust source only, so a machine without a working Rust and C++
toolchain never gets it. On HazzardLaptop, 2026-11-21, plugin 0.9.10: `cargo build --release` failed with
`linker link.exe not found` (Rust installed, Visual C++ build tools not), so only the HTML deck opened. The user
chose prebuilt binaries over source builds for installs.

## 2. Spec

Each line: the behaviour, *evidence*, **bar**. Lines are *assumed* until Gate 1; lines 1 and the target list are
also the pilot's spec questions itm_9914932172bc and itm_5d271bb6c718 (A7, A8).

1. One dispatch of `rune-release.yml` on the bumped branch publishes release `v<version>` holding the Rune deck for
   Windows x64, macOS arm64 and Linux x64, each `cargo build --release --locked` from that commit, each checked for
   its OS's executable header (and on macOS its ad-hoc signature) before publish. *The feature PR's build run lists
   **exactly 3** binaries as artifacts, **0** others; with A9 allowed, `gh release view rune-scratch-<sha7> --json
   assets` lists the same 3.* practitioner: release engineer (uv/ripgrep-style per-target matrix with a pre-publish
   smoke check).
2. The same run writes `deck/rune/release.json` (version, tag, per target the file and its sha256), on a dispatch
   committed to that branch, otherwise in the job summary and artifacts. *An independent `certutil -hashfile`/`shasum
   -a 256` of each built binary:* **3 of 3** equal their pin. practitioner: supply-chain reviewer (hash computed in the
   build run and shipped in the package, as esbuild).
3. `pilot deck` with no local build and a pin for its version downloads its OS's binary **once**, verifies it, stores
   it under the plugin's `deck/rune/target/fetched/`, and names it in its `open` line. *Stubbed-download test:* **1**
   request on the first run, **0** on the second; the `open` line names the fetched copy.
4. A download whose sha256 differs from the pin is refused: nothing stored, nothing run, the HTML open file named,
   **one** line naming the file and both hash prefixes. A stored binary whose hash no longer matches is deleted at
   the next launch the same way. *Tampered-bytes test:* **0** spawns of the binary, **0** files left in `fetched/`.
5. Offline, an HTTP error, a timeout (**30 s**), a body over **100 MB**, or a redirect off https opens the HTML deck
   with one line saying why, and `pilot deck`'s exit code is unchanged. *A test per case:* **5** cases, each **one**
   line, **0** files left.
6. No pin for this version (no `release.json`, or it names another version) or no asset for this platform (Intel
   macOS, Windows ARM) opens the HTML deck with one line. *Test:* **0** requests made.
7. A local `target/release` build wins over a fetched one, and the daemon's auto-open runs a built or verified
   fetched binary but never downloads. *Test:* auto-open path makes **0** requests; with both present the built one
   is named.
8. `pilot doctor` has a Rune row: `built here, <path>`, `fetched <version>, verified`, or `missing: <reason>` naming
   what to do; doctor makes **0** requests. *A test per state:* **3** states, and **one** per missing reason.
9. On a Windows machine with no cargo on PATH, a CI-built binary is fetched and `pilot deck` opens the Rune window.
   *QA per A10, this machine, a scratch home, cargo off PATH:* **1** Rune window from a CI-built binary (downloaded
   from the scratch prerelease under A9, else loaded by `ensureRune` with a `get` reading the PR run's artifact from
   disk); HazzardLaptop after the first real release is a human step, **0** build tools there. practitioner: release
   engineer (the field machine is the test).
10. *(added)* Where Windows Smart App Control is enforced, which blocks unsigned code, `pilot deck` downloads nothing and opens
    HTML with one line, and doctor's row says so. *Test with the registry read stubbed to enforced:* **0** requests,
    **one** line. (Found by A5's research; build-now.)

Nothing the download sends but the GET: no query string, no custom header, no version ping, no telemetry (L6).

## 3. Findings

- `deck/open.mjs:34` `runeBinary(root, platform)` stats `deck/rune/target/release/pilot-deck[.exe]`; callers are
  `openDeck`'s default (`open.mjs:142`, the daemon's auto-open on `POST /api/runs`) and `pilot deck`
  (`bin/pilot.mjs:391`), which prints `open <copy>` and never spawns. `runCopy`/`launchCopy` (`open.mjs:55-131`) copy
  to `target/run` so Windows' exe lock spares the build (A9 of rune-deck-ui); a fetched file reuses them unchanged.
- The binary is self-contained: fonts `include_bytes!` (`deck/rune/src/app.rs:247`), theme `include_str!`
  (`theme.rs:233`); it finds the deck from the secret file and port itself.
- Rune at the pinned rev targets macOS, Windows and Linux; a Linux build needs `libxkbcommon-dev libwayland-dev`
  (Rune `crates/rune/README.md:2461`). `.github/workflows/ci.yml` builds and tests on Windows only (ADR 0206 A3).
- `HazzardRust/pilot` is public; no tags or releases exist; neither `main` nor `pilot` is protected. Versions move by
  hand with `npm run bump` (`scripts/bump.mjs`; 0.9.11 at 579c3f3). Public-repo runners, macOS included, cost nothing;
  each release costs ~3 jobs × 10-20 min wall time.
- Every `fetch` in the plugin today is loopback (`deck/probe.mjs:12`, `client.mjs:151`, ...): this is the first
  outbound call. Node's fetch follows an https→http redirect (undici `httpRedirectFetch`), so https is enforced per hop
  by hand. GitHub release downloads redirect once, to `release-assets.githubusercontent.com` since 2025.
- A Node-written file carries no Mark-of-the-Web or quarantine, so SmartScreen and Gatekeeper do not prompt; Smart
  App Control, when enforced, blocks unsigned code regardless (Microsoft Learn); `doctor.mjs:51-63` (Defender) and
  `deck/power.mjs` (stay-awake's row, `doctor.mjs:505`) already read Windows state through an injected `run`.
- Doctor's verdicts on main are `pass`, `fail`, `cannot tell` (`doctor.mjs:583` fails on `fail` only); `warn` arrives
  with user-pilot-branch (PR #157, on the pilot branch, not main).
- The gate's `--since` selection runs `cargo fmt --check` and `cargo test` of the Rune deck whenever a file under
  `deck/` changed (`scripts/gate.mjs:301-312`), into the shared `CARGO_TARGET_DIR` (`scripts/rune-target.mjs`, cheap-suite).
  It never sets the release build's target: a built deck is still `deck/rune/target/release`.
- ADR 0211 is taken (`0211-handoff-no-wait.md`), so this run's ADR is `NNNN`, numbered at landing.
- Overlap: `deck/doctor.mjs` and `bin/pilot.mjs` are edited by user-pilot-branch (PR #157, landing); this run adds
  one row and edits only the `deck` branch (`bin/pilot.mjs:385-396`). `deck/rune/` (rune-panes, on the pilot branch)
  is not touched.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `deck/rune-bin.mjs` | `findRune(root, host) → RuneState` (sync, no network); `ensureRune(root, host, get) → Promise<RuneState>` (the one network caller) | `runeBinary`'s stat, the pin read, sha256, the download, the SAC read, the `.part`-then-rename store | 4 true external (download: real `get` and a test stub); 2 local-substitutable (a temp package root) |
| `scripts/rune-pin.mjs` | `pinRelease({ version, tag, dir }) → { json, problems }` | per-target names, header and signature checks, hashing | 1 in-process |

Deletion test: `runeBinary` alone is shallow (one stat); it stays as `findRune`'s first step and its callers move to
`findRune`. `ensureRune` survives: deleted, the pin, the hop rule and the hash would reappear in `pilot deck`.

## 4. Ubiquitous language

- **Pin**: a target's file name and sha256 in `deck/rune/release.json`, shipped in the plugin.
- **Target**: `win32-x64`, `darwin-arm64` or `linux-x64`; one asset each.
- **Built** binary: `deck/rune/target/release/pilot-deck[.exe]`, made on this machine.
- **Fetched** binary: `deck/rune/target/fetched/<asset>`, downloaded and matching its pin.
- **RuneState**: `{ source: 'built'|'fetched', file }` or `{ source: null, reason, fetchable }`.
- **Scratch release**: a prerelease on tag `rune-scratch-<sha7>`, used as evidence, deleted after QA.

## 5. Locked decisions

ADR NNNN (`docs/adr/NNNN-prebuilt-rune.md`; the landing numbers it).

- **L0** Grilling depth: forks (itm_dd645b74ccff, closed 06:10Z by the deck's 20-minute default, not a press): no
  Gate 1 walk; the gate1 is the only item once every question thread is closed. Rejected: a full walk.
- **L1** The only trusted hash is the pin in the installed plugin; no hash is read from the network. Rejected: a
  `SHA256SUMS` asset beside the binaries (same host as what it checks).
- **L2** One seam, `deck/rune-bin.mjs`: `findRune` never touches the network, `ensureRune` is the only caller of
  `get`. Rejected: fetch code in `bin/pilot.mjs` (doctor and auto-open would re-derive the state).
- **L3** Fetched files live in the plugin's own `deck/rune/target/fetched/` (already gitignored), so each installed
  version has its own and a version change needs no cleanup. Rejected: `~/.claude/pilot` (cross-version pruning,
  and portable-store's export would carry binaries).
- **L4** Built beats fetched beats HTML. A Rune problem never changes `pilot deck`'s exit code.
- **L5** The release side adds no dependency: first-party `actions/checkout`/`setup-node` as `ci.yml` uses, the
  runner's `gh`, and a Node script. Draft release, all assets uploaded, then published.
- **L6** The request is one plain GET to `https://github.com/HazzardRust/pilot/releases/download/<tag>/<asset>`,
  the tag from the pin and matched against `^v\d+\.\d+\.\d+$|^rune-scratch-[0-9a-f]{7,40}$`; nothing else is sent,
  and the signed redirect URL is never printed.
- **L7** Evidence before main, because `workflow_dispatch` only exists once the file is on the default branch: a
  `pull_request` touching the workflow, `scripts/rune-pin.mjs` or `deck/rune/Cargo.{toml,lock}` runs build and pin
  only, the 3 binaries and `release.json` as artifacts; a `rune-scratch-*` tag push (A9) adds a prerelease with no
  commit. Either A9 answer works with no re-cut.

## 6. Assumed decisions

- **A1** Who writes the pin: CI commits `release.json` in the build run (itm_fd5feb14a5a1). Default taken. Trades
  a bot push to a run branch for no trust-on-first-use window. Rejected: local `npm run rune-pin`. Assumed: closed
  by the deck's 20-minute timeout, not by the user; unconfirmed.
  Verdict: stands — CI writes the pin; no queued ticket touches release.json
- **A2** Download rule: https on every hop, any host, at most 5 hops, 30 s, 100 MB; sha256 is the gate
  (itm_f5aceacfeafc). Rejected: exact-host allowlist (broke elsewhere when GitHub moved hosts in 2025). Assumed:
  closed by the deck's 20-minute timeout, not by the user; unconfirmed.
  Verdict: stands — sha256 against the installed pin is the gate, hosts may move
- **A3** Verify at download and at every reuse (itm_991b2f11334c). Costs ~50-100 ms per open. Rejected: download
  only. Assumed: closed by the deck's 20-minute timeout, not by the user; unconfirmed.
  Verdict: stands — ~50-100 ms per open is cheap against a tampered reuse
- **A4** Residual risk accepted, no repo setting (itm_7ba44d9a0d49): a poisoned build input is pinned faithfully;
  mitigated by `--locked` and the rev pin. Rejected: release immutability as a handoff. User answered: "Accept, no
  extra setting".
  Verdict: stands — user answered "Accept, no extra setting"
- **A5** No code signing (itm_326ee0d80b61); Smart App Control enforced → HTML (spec 10). Rejected: Artifact
  Signing + Apple Developer ID. Assumed: closed by the deck's 20-minute timeout, not by the user; unconfirmed.
  Verdict: stands — no signing matches the user's no-extra-cost preference; spec 10 covers Smart App Control
- **A6** Fetch on `pilot deck` only (itm_60338a16a5ec); auto-open and doctor never download. Rejected: daemon
  background fetch; prefetch at `pilot update`. Assumed: thread closed by the deck's
  20-minute timeout ("First pilot deck"), not by the user; default stands, unconfirmed.
  Verdict: stands — fetch only on pilot deck; no background network use
- **A7** A release is a manual dispatch, not automatic on a version change (pilot's itm_9914932172bc). Assumed:
  thread closed by the deck's 20-minute timeout, not by the user; default stands, unconfirmed.
  Verdict: stands — manual dispatch; the user merges and releases
- **A8** Three targets: win32-x64, darwin-arm64, linux-x64 on ubuntu-22.04 for an older glibc (pilot's
  itm_5d271bb6c718). Rejected: also Intel macOS and Windows ARM. Assumed: thread closed by the deck's 20-minute
  timeout, not by the user; Rune tests stay Windows-only, macOS and Linux build-only.
  Verdict: stands — three targets; the user's machines are covered
- **A9** A public scratch prerelease is allowed (pilot's itm_bb030b7c165e). Confirmed by the user, who pressed
  "Allow scratch prerelease (default)": a `rune-scratch-<sha7>` tag and public prerelease during S4 and QA, deleted
  by QA afterwards. Trades a short-lived public release for evidence against real GitHub. Rejected: no public write,
  the PR run's artifacts only, the download proven by `ensureRune` with a `get` reading the artifact from disk.
  Verdict: stands — user pressed "Allow scratch prerelease" on itm_bb030b7c165e
- **A10** QA runs on this Windows machine in a scratch home with cargo off PATH; macOS and Linux by CI build and
  header check only; HazzardLaptop a human step after landing (pilot's itm_e374d036106d).
  Verdict: stands — QA on this Windows machine, laptop as a human step

red team (re-cut): S3's `warn` was a new verdict word against its own Prohibited line; it is now named as the
non-failing word user-pilot-branch also adds, so the two meet on one meaning. red team (re-cut): every S1-S3 gate
touches `deck/`, so each runs the Rune `cargo test`; the brief serialises heavy gates (heat). red team (re-cut):
PR #157's rename leaves this run's cut (main) and its CI alone: `rune-release.yml`'s `pull_request` has no branch
filter, and `ci.yml`/`gate.yml` already run on PRs to main.
red team: S3 needs the SAC reason S2 adds, so S3 now comes after S2, not only S1. red team: `workflow_dispatch`
cannot run from a feature branch, so spec 1, 2 and 9 had no in-run evidence; L7's scratch tag added to S4. red team:
S1 and S4 each half-built `release.json`'s shape; S1 owns the reader and the format, S4 round-trips through it.
red team: a fetched file on Linux/macOS lacks the exec bit; S1 sets 0755 before the rename.

## 7. Out of scope

Signing and notarization (A5); Intel macOS and Windows ARM (A8); running the Rune tests on macOS/Linux (build
only); an automatic release on version change (A7); updating a fetched binary inside a version; building from
source at install; changes to the Rune deck itself (rune-panes).

## 8. Slices

Width 2; longest stem 3 (S1 → S2 → S3)

| Slice | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- |
| S1 `pilot deck` downloads, verifies and opens a pinned Rune binary | 3, 4, 7 | `deck/rune-bin.mjs` (new), `deck/open.mjs`, `bin/pilot.mjs`, `deck/test/rune-bin.test.mjs` (new), `docs/adr/NNNN-prebuilt-rune.md` (new) | – | typescript, security | [S1](slices/S1.md) |
| S2 every failure opens HTML with one line | 5, 6, 10 | `deck/rune-bin.mjs`, `deck/test/rune-fail.test.mjs` (new) | S1 (`deck/rune-bin.mjs`) | typescript, security | [S2](slices/S2.md) |
| S3 `pilot doctor` has a Rune row | 8 | `deck/doctor.mjs`, `deck/test/doctor-rune.test.mjs` (new) | S2 (`findRune`'s reasons) | typescript | [S3](slices/S3.md) |
| S4 a release run publishes three binaries and pins them | 1, 2, 9 | `.github/workflows/rune-release.yml` (new), `scripts/rune-pin.mjs` (new), `scripts/test/rune-pin.test.mjs` (new), `docs/OPERATING.md` | S1 (`release.json` format, `readPin`) | typescript, security | [S4](slices/S4.md) |

## 9. Acceptance evidence

In the order the user meets it: the feature PR's build run green with 3 binary artifacts, and under A9 a scratch
prerelease listing the same 3 (spec 1); its `release.json` matching 3 independent hashes (2); on this machine, a
scratch home with cargo off PATH and a scratch worktree holding that `release.json`: the binary fetched once (from the
prerelease, or under A9's other path by `ensureRune` reading the artifact from disk), `pilot deck` opening the Rune
window, a second run downloading nothing (3, 7, 9); after landing, HazzardLaptop as a human step (9); a byte flipped in the stored file → HTML and one line (4); network off → HTML and one line (5); `pilot doctor`'s
Rune row in each state (8, 10); the tests for 6 and 10.

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | – | – | – | – | 3, 4, 7 |
| S2 | planned | – | – | – | S1 | 5, 6, 10 |
| S3 | planned | – | – | – | S2 | 8 |
| S4 | planned | – | – | – | S1 | 1, 2, 9 |
| prebuilt-rune | planned | `feat/prebuilt-rune` | – | – | S1-S4 | 1-10 |
