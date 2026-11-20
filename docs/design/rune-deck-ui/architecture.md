# The deck's UI, rebuilt in Rune

Ticket `itm_0dcd9aa67146` · slug `rune-deck-ui` · base `origin/pilot` fa28b73b · ADR NNNN (`docs/adr/NNNN-rune-deck-ui.md`, S1)

## 1. Problem

The user likes the deck's colours, layout and features, and where everything sits. It feels blocky, without the
motion and feedback of a modern app, and it carries minor bugs. They want it redone in a Rust framework, Rune
(anomalyco/rune), for this repository: the deck is how they run pilot, and Rune is not to become a pilot feature
that other people's projects are pushed onto.

## 2. Spec

| # | Behaviour | Evidence | Bar |
| --- | --- | --- | --- |
| 1 | Rune is the primary deck where it is built: the daemon's own open at session start and `pilot deck --rotate` open the native Rune window, and `pilot deck` names it, when the release binary exists; the HTML page otherwise. A deck URL printed elsewhere still opens the browser. *A1 locked; A2 as main reads it* | headless `--snap` PNG and `--tree` JSON of each screen state in the run; the window seen on the walkthrough | 8 states: overview, deck tab, `all=1`, thread open, thread closed, gate, items page, empty deck |
| 2 | Colours, layout and where each feature sits are kept: the deck.css tokens and the regions (header usage and tabs, queue, six left panels, right strip). | `theme` test against `deck/ui/deck.css`; each region's tree beside the HTML page's screenshot | every token value equal, light and dark; 0 regions or controls missing against §3's checklist |
| 3 | Every action the HTML deck offers works from the Rune deck and ends in the same store change as its form POST. | one scripted replay per action against a scratch daemon | 17 of 17 (§3 Actions) |
| 4 | A post made by a tool call appears without input; a half-typed reply, the scroll and the open panels survive it. | headless replay on a scratch daemon | shown within 1 s; draft, scroll offset and open set unchanged |
| 5 | It no longer feels blocky: springs on panel open and close and on card arrival, press feedback in the same frame, no flash on a live update. | the user's look on the walkthrough; the headless tree shows the transition tracks | press shown within 16 ms (one frame); each spring settles under 300 ms; the taste call is the user's |
| 6a | State updates are neither slow nor out of step: every region is drawn from one view of one `seq`, the agents panel included (the user's named case); each agents row shows seconds since its last tool call and dims once quiet (L11). | S2 replay: a heartbeat to `/api/agents` and a post on a scratch daemon; S14 view test on a fixture roster | each region changed within spec 4's 1 s; 0 regions on an older `seq`; age within 30 s, dim after 30 s quiet, gone at 90 s |
| 6b | One spacing and grouping system across regions: a 4 px scale, gaps between groups at least twice those within, fixed row heights, and status lines as aligned columns (state, name, time), the overview's lane lines the first case. *practitioner: design-system engineer (Carbon, Atlassian, Primer)* | S4 scan of `src/regions/*.rs`; S7 replay of the three lane lines; the user's look | 0 spacing literals outside `theme::space`; state, name and time each start at one x across the lines |
| 6c | The two recorded bugs: a refused typed reply keeps its words (ADR 0096), and two quick ticket-arrow presses move once. | S9, S15 replays | each red before, green after |
| 6d | Dragging a left-strip panel's resize handle tracks the pointer, with no lag or snap near the default size (the user's named bug). | S20 scripted drag across the default | frame positions monotonic; each frame within 1 px of the pointer |
| 6e | A notification count of three digits stays on one line and moves no panel (the user's named bug). | S20 headless snapshot at 99 and at 100 | panel bounds identical at both counts; the count on 1 line |
| 7 | The Rune deck's tests run in the gate: a broken screen fails it. *assumed A3* | `npm test` runs `cargo test` where cargo is on PATH | a broken region fails `npm test`; no cargo prints 1 skip line |
| 8 | Nothing about Rune becomes a pilot feature: no agent, rule or skill names or requires it. | `git grep -i rune -- agents rules skills` | 0 lines |
| 9 | The Rune deck reads the deck secret, talks to loopback only, and never writes or logs the secret. *security* | client test refusing a non-loopback base; grep of its log output | 0 non-loopback requests; 0 secret bytes in logs |
| 10 | With the daemon down or restarting the window says so and reconnects when it returns, with no crash. *practitioner: desktop-app engineer, who designs for the server going away* | headless replay: stop and restart a scratch daemon | "deck not running" shown; view back within 2 s of restart |
| 11 | A thread kind the Rune deck has never seen (human-steps' `steps`, its green-group label) draws from the labels the view carries, with no Rust change. *practitioner: client engineer who keeps product words on the server* | view test with an unknown kind | title, kind and state line drawn; 0 Rust edits |
| 12 | *added (S8 review)*: Escape and ← leave an open thread as soon as it opens, with no Tab first, and never while a text field holds the key. | S21 key replay | red before, green after |
| 13 | *added (S12 review)*: the overview shows one status table per tab, as the page does. | S22 view test against the page | same tabs, order and rows |
| 14 | *added (S9 review)*: moving to another thread shows that thread at once, and a view of the thread just left never draws its reply box. | S23 key replay and late-view test | red before, green after |
| 15 | *added (step 7 F6, F5, F9)*: a press is posted off the UI thread and its answer settles in one place; a refusal shows on the control that sent it, and a refused dismiss can be pressed again. | S24, S25 replays; a grep of `src/regions` for `.act(` and `thread::Builder` | each red before, green after; 0 lines |

## 3. Findings

- `deck/ui/render-*.mjs` (2,500 lines), `deck/ui/deck.css` (1,246), `deck/ui/js/*.mjs` (15 modules): the HTML deck is
  server-rendered strings; every write is a urlencoded form POST answered by a 303 (`deck/server-routes.mjs:235-541`).
- `GET /events` (`server-routes.mjs:231`, `server-wait.mjs:594`) is SSE with one bare `changed` ping; the page
  refetches itself and swaps `data-live` regions (ADR 0016).
- No JSON exists for tabs, notices, lanes, ticket queues, the status table and graph, chat or the alert switch:
  the home route hands 14 positional reads to `renderHomePage` (`server-routes.mjs:133-154`).
- The derivations are already outside the markup: `tabsOf`/`tabFor`/`landingFor` (`deck/tabs.mjs:87,177,195`),
  `accentOf` (`deck/items.mjs:698`), `pilotStateOf` (`deck/pilot-state.mjs:37`), `graphOf` (`deck/status.mjs:366`),
  `daySections` (`deck/ui/render-pages.mjs:122`). The view calls these and copies no logic.
- Guards: `isOwnHost` on every route; writes need `isTrustedOrigin`, deck-wide writes `fromOwnPage`
  (`server-routes.mjs:72`, Origin == `http://<Host>`); every route but `OPEN_ROUTES` needs `Authorization: Bearer`
  or the `/open` cookie. Secret: `hooks/lib/deck-secret.js` (`secretFile`, `PILOT_DECK_DIR`).
- `GET /thread/<id>` clears that thread's notice (`server-routes.mjs:195-199`): the view's thread screen must too.
- `deck/open.mjs:46` `openerFor(platform, url)` is the one place the deck starts a viewer; `deck/scratch.mjs` spawns
  a scratch daemon on its own dir and port, the fixture the Rust tests use.
- Rune at `7cba77c` (2026-11-19): MIT, pre-release, no tags, not on crates.io, edition 2024, wgpu + winit (both
  patched: a consumer copies its `[patch.crates-io]` block). `AppSpec::new(title, size, init, view)`, `rune::run`,
  `AppHandle::update` from a thread, `text_input`, `.scroll`, `Spring`, `Theme::from_json`; headless
  `App::headless_runtime`, `Runtime::frame/key`, `rt.elements()`, CLI `--snap`, `--tree`, `--script`. Headless paint
  needs a GPU or software Vulkan.
- This machine has no cargo or rustc. Only the user can install rustup and the VS C++ Build Tools.

Actions (spec 3): reply, option press, gate Sign off / Not yet, close, reopen, dismiss item, dismiss run, create,
add deck, remove deck, start/resume, move, switch, cancel switch, alerts, clear notice, mark all seen.
Regions (spec 2 checklist): header (usage, tabs, add deck), queue, notifications, chat, status (table, ticket
selector), graph, agents, tickets, reports, right strip (toggle, create, start, close deck, alerts), thread
(kind line, nav, body, messages, resolution), reply (box, options, confirm, reopen, dismiss), history (`all=1`, items).

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| Deck view | `GET /api/view?screen&run&all&ticket&id` → `View`; `viewOf(reads, query)` | one module per region, labels resolved server-side, thread notice clear | in-process (pure) behind a route |
| Deck reads | `readDeck()` → `DeckReads` | the 8 store reads the home route passes positionally | in-process |
| Deck client | `Client::from_env()`, `view(&Query)`, `act(&Action)`, `events()` | secret file, loopback-only base, Bearer + Origin, urlencoded body, 303/400 to `Acted` | true external, local-substitutable (scratch daemon) |
| Regions | `regions::<r>::draw(&Value, &Local, &mut Cx<State>) -> El` | parse, draw, local state per region | in-process |
| Theme | `theme::tokens(dark) -> Tokens`, `theme::motion` | deck.css palette, font, springs | in-process (pure) |
| Prefs | `Prefs::load(dir)`, `Prefs::save` | folds, panel sizes, open panels, seen map, hidden reports | local-substitutable (temp dir) |
| Opener | `openerFor(platform, url, rune)` | browser or built Rune binary | in-process (pure) |

Deletion test: `render-*.mjs` survive (the HTML deck stays, A2). `renderHomePage`'s 14 positional reads are shallow:
`readDeck` folds them for the view; the HTML route is left as is (L4).

## 4. Ubiquitous language

- **Rune deck**: the native client under `deck/rune/`. **HTML deck**: today's pages, unchanged.
- **View**: the JSON `GET /api/view` returns, one object per region.
- **Region**: one named part of a screen, one view module and one Rust file.
- **Action**: one write the Rune deck makes, always an existing form route.
- **Scratch daemon**: a daemon on its own dir and port that a test starts and stops.
- **Prefs**: the Rune deck's local view state, never the store's.

## 5. Locked decisions

- **L1** The daemon stays the only writer; the Rune deck is an HTTP client of 127.0.0.1. Rejected: Rune reading
  the store files (two writers, ADR 0149's read-only inference broken).
- **L2** The view is computed on the server from the existing derivations, with every display string (kind label,
  state, accent, options, ticket standing) resolved there, so a new kind needs no Rust change (spec 11). Rejected:
  raw store JSON with the derivations ported to Rust (two copies drifting).
- **L3** Writes reuse the existing form routes with `Authorization: Bearer` and `Origin: http://<Host>`; no new
  write route. Rejected: a JSON action route (a second write path to guard and test).
- **L4** The HTML renderers are not refactored onto the view; they stay the parity reference. Rejected: one view
  feeding both (a 6.7k-line refactor of a fallback, past the diff limit many times).
- **L5** One file per region on both sides, stubbed in S1, so region slices own disjoint files. Rejected: one
  `view.mjs` and one `ui.rs` (every slice serialised).
- **L6** Rune pinned by `rev` with its `[patch.crates-io]` block and a committed `Cargo.lock`; an upgrade is a ticket.
- **L7** Rust tests run against a real scratch daemon started from node; region drawing tests feed a recorded view.
  Rejected: a fake HTTP server (a second adapter that passes while the daemon disagrees).
- **L8** Markdown bodies reach Rune as markdown with ids already turned into titles server-side; Rune draws them
  with `rune-kit`'s `Markdown`. Rejected: porting `deck/ui/markdown.mjs`.
- **L9** Nothing a Gate 1 sign-off needs lives only in a slice file.
- **L10** Spacing comes from one scale, `theme::space`: 0, 2, 4, 8, 12, 16, 24, 32, 48 px; within a group 4, card padding 8,
  between groups 16, between panels 24; list rows 20 px, card lines 24 px; status lines are three columns, the state
  12 ch fixed and left, the name flexible and clipped, the time 7 ch right, 16 px apart, no `·`; lane lines in phase
  order planning, implementing, concluding. Taken from Carbon (carbondesignsystem.com/elements/spacing,
  /components/data-table/style, /patterns/status-indicator-pattern: 4/8 scale, xs 24 rows, fixed status column),
  Atlassian (atlassian.design/foundations/spacing: small within, large between) and Primer
  (primer.style/foundations/primitives/size: 8/16 stack gaps). The 2× rule and the phase order are ours; Material 3
  and Apple were not readable. Rejected: keeping deck.css's ad hoc rem gaps.
- **L11** (A7 overturned, itm_671096e1253c) The 90 s window (`LIVE_WINDOW_MS`, ADR 0024) is kept; each agents-panel
  row shows seconds since the agent's last tool call and dims once it goes quiet. An agent reports in at most once
  per 30 s (`HEARTBEAT_MS`, `hooks/agent-roster.js:43`), so the age is accurate to 30 s: a quiet agent dims after
  about 30 s and leaves at 90 s. `listAgents` (`deck/agents.mjs:333`) holds `lastSeen` but drops it; S14 adds it.
  Rejected: a shorter window (reopens ADR 0024; an agent in one long tool call vanishes); the roster as it is.

## 6. Assumed decisions

- **A1** Native window, not a browser tab. Trade: no Rune deck in a browser; Rune's web target is unproven.
  Rejected: Rune web build at 4321.
  Answer: the user pressed "Native window" (itm_d184d1341214).
  Verdict: stands — the user pressed "Native window" on itm_d184d1341214
- **A2** The HTML deck stays as the fallback and what other installers get; where the Rune deck is built (locally,
  cargo, no shipped binaries) it is the primary and what every pilot open shows (itm_6aa2534e84f0: "HTML stays,
  Rune opt-in" then "lets have rune as the primary", read by main). Trade: two UIs; a new kind draws in both (eased
  by L2). Rejected: Rune only.
  Verdict: stands — the user's words on itm_6aa2534e84f0: HTML stays, Rune primary where built
- **A3** `npm test` runs `cargo test --manifest-path deck/rune/Cargo.toml` only where cargo is on PATH, else one
  skip line; CI adds one `windows-latest` job with Rust that builds and runs the client tests, and runs the paint
  tests only if the runner paints headless. Trade: a machine without Rust catches a broken screen only in CI.
  Verdict: stands — S19 shares scripts/gate.mjs with the two landings in concluding; a rebase, not a re-cut
- **A4** Prefs start empty in `~/.claude/pilot/rune-deck.json`; the browser's localStorage (seen threads, panel
  sizes, folds) is not migrated. Trade: one reset of folds and seen marks. Rejected: a server-side prefs route.
  Verdict: stands — no queued ticket claims deck prefs; one reset of folds and seen marks accepted
- **A5** Bugs (itm_b7272bb6e63c): the user named slow, inconsistent state updates (the agents panel) and weird
  separation between objects (the three lane lines), and asked to pull ideas from elsewhere: spec 6a, 6b, L10. The
  two recorded bugs are built too (6c). Answer: "small things everywhere, mostly to do with state updates being
  slow/inconsistent, such as the agents panel … the seperatio between different objects can be weird"; then
  "dragging around the resizing of the different panels on the left side feels laggy near the default position, and
  when the notifications hit 3 digits, it creates a new line and resizes and puts the panels misaligned" (6d, 6e).
  Verdict: stands — the user's words on itm_b7272bb6e63c: spec 6a-6e
- **A7** An agent leaves the agents panel only after 90 s without a tool call (`LIVE_WINDOW_MS`, ADR 0024); the
  Rune deck shows that roster as it is. Trade: a finished agent lingers up to 90 s. Rejected here: a stop hook, which
  moves ADR 0024 (killed agents never fire one); sent to `main` as a question.
  Verdict: overturned: the user chose "Keep 90 s, show last-seen age" on itm_671096e1253c, not the roster as it is
- **A6** Depth: Forks.
  Answer: the user pressed "forks" (itm_af9e1f649d17).

Red team (each a change to §8):
  Verdict: stands — the user pressed "forks" on itm_af9e1f649d17
- red team: S1 cannot build until the user installs rustup and the C++ Build Tools: every slice is blocked on it,
  so the brief names it as the first human step and S1's Done needs `cargo --version` output.
- red team: region slices would each need a field on one `State` in `app.rs`: each region file now owns a `Local`
  struct, stubbed in S1, so `app.rs` stays S1's and S2's.
- red team: view slices may need a helper that lives only in `render-cards.mjs`/`render-rail.mjs`, which
  human-steps S1 edits: a view slice may add `export` to such a helper and nothing else, and rebases on `pilot`.
- red team: native writes carry no Origin, and `fromOwnPage` would 403 nine actions: L3 sends it (S5).
- red team: `/api/view?screen=thread` must clear the notice as `/thread/<id>` does, or notices never clear from
  the Rune deck: S8 behaviour 2.

- red team: S1 is the widest diff (crate, route, harness, stubs): `Cargo.lock` is generated and outside the
  300-line limit; the stubs are one line each; past the limit the implementer stops and asks `main` to split the
  harness (`tests/support`) into its own slice before S2.
- red team (re-cut, landing 7b2a4f5): `runGate` now stats the home store around the suite and passes the guard
  env (`scripts/gate.mjs` `gateEnv` 4th arg, `homeStoreLine`, `writerLines`); a cargo step outside that window
  would let a Rust test's scratch daemon write the home store unseen. S19's `cargoStep` seam, behaviours and DAG
  stand; its Files owned role and Prohibited now pin the window. No other slice owns a landed file.

## 7. Out of scope

Rune's web target; prebuilt binaries for other installers; macOS and Linux runs of the Rune deck (they build, nobody
gates them); any change to the HTML deck beyond an `export`; a Rust daemon or store; Rune upgrades past the pin.

## 8. Slices

Width 15; longest stem 5

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Walking skeleton: a Rune window shows the deck's tabs read from `/api/view` | 1, 2, 9, 11 | `deck/rune/Cargo.toml`, `Cargo.lock`, `src/main.rs`, `src/app.rs`, `src/client.rs`, `src/regions/*.rs` (stubs), `src/theme.rs`, `src/prefs.rs`, `src/layout.rs`, `src/act.rs`, `src/act_deck.rs`, `tests/support/mod.rs`, `tests/skeleton.rs`, `deck/view/*.mjs` (index, reads, tabs, stubs), `deck/server-routes.mjs`, `deck/test/view-route.test.mjs`, `.gitignore`, `docs/adr/NNNN-rune-deck-ui.md` | – | `pilot:rust-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | A post appears live, and a stopped daemon is said and survived | 4, 6a, 10 | `deck/rune/src/live.rs`, `src/app.rs`, `tests/live.rs` | S1 (`app.rs`, `Client::events`) | `pilot:rust-reviewer` | [S2](slices/S2.md) |
| S3 | The deck opens as the Rune window wherever it is built | 1 | `deck/open.mjs`, `bin/pilot.mjs`, `deck/test/open.test.mjs` | S1 (the binary's path) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S3](slices/S3.md) |
| S4 | The deck's palette, font, spacing and motion, light and dark | 2, 5, 6b | `deck/rune/src/theme.rs`, `tests/theme.rs` | S1 (`theme::tokens`) | `pilot:rust-reviewer` | [S4](slices/S4.md) |
| S5 | Thread actions post their form routes and change the store | 3, 9 | `deck/rune/src/act.rs`, `tests/act_thread.rs` | S1 (`Client`) | `pilot:rust-reviewer`, `pilot:security-reviewer` | [S5](slices/S5.md) |
| S6 | Deck actions post their form routes and change the store | 3 | `deck/rune/src/act_deck.rs`, `tests/act_deck.rs` | S5 (`act::post`) | `pilot:rust-reviewer`, `pilot:security-reviewer` | [S6](slices/S6.md) |
| S7 | The queue's cards and lane lines, with option presses | 2, 3, 5, 6b, 11 | `deck/view/queue.mjs`, `deck/test/view-queue.test.mjs`, `deck/rune/src/regions/queue.rs`, `tests/queue.rs` | S5 (`Action::Reply`) | `pilot:rust-reviewer`, `pilot:typescript-reviewer` | [S7](slices/S7.md) |
| S8 | A thread reads whole, with its nav and Escape | 2, 11 | `deck/view/thread.mjs`, `deck/test/view-thread.test.mjs`, `deck/rune/src/regions/thread.rs`, `tests/thread.rs` | S1 (`viewOf`) | `pilot:rust-reviewer`, `pilot:typescript-reviewer` | [S8](slices/S8.md) |
| S9 | The reply box, options, confirm, reopen and dismiss | 3, 5, 6c | `deck/view/reply.mjs`, `deck/test/view-reply.test.mjs`, `deck/rune/src/regions/reply.rs`, `tests/reply.rs` | S5 (`Action`) | `pilot:rust-reviewer`, `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S9](slices/S9.md) |
| S10 | Notifications, seen marks and prefs | 2, 3 | `deck/view/notifications.mjs`, `deck/test/view-notifications.test.mjs`, `deck/rune/src/regions/notifications.rs`, `src/prefs.rs`, `tests/notifications.rs` | S6 (`Action::ClearNotice`) | `pilot:rust-reviewer`, `pilot:typescript-reviewer` | [S10](slices/S10.md) |
| S11 | The chat panel | 2, 3, 4 | `deck/view/chat.mjs`, `deck/test/view-chat.test.mjs`, `deck/rune/src/regions/chat.rs`, `tests/chat.rs` | S5 (`Action::Reply`) | `pilot:rust-reviewer`, `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S11](slices/S11.md) |
| S12 | The status table and its ticket selector | 2 | `deck/view/status.mjs`, `deck/test/view-status.test.mjs`, `deck/rune/src/regions/status.rs`, `tests/status.rs` | S1 (`viewOf`) | `pilot:rust-reviewer`, `pilot:typescript-reviewer` | [S12](slices/S12.md) |
| S13 | The run's git graph | 2 | `deck/view/graph.mjs`, `deck/test/view-graph.test.mjs`, `deck/rune/src/regions/graph.rs`, `tests/graph.rs` | S1 (`viewOf`) | `pilot:rust-reviewer`, `pilot:typescript-reviewer` | [S13](slices/S13.md) |
| S14 | The agents and reports panels | 2, 6a | `deck/agents.mjs` (`listAgents` adds `lastSeen`), `deck/view/agents.mjs`, `deck/view/reports.mjs`, `deck/test/view-agents-reports.test.mjs`, `deck/rune/src/regions/agents.rs`, `src/regions/reports.rs`, `tests/agents_reports.rs` | S10 (`Prefs`) | `pilot:rust-reviewer`, `pilot:typescript-reviewer` | [S14](slices/S14.md) |
| S15 | The tickets panel: folds, move, switch | 2, 3, 6c | `deck/view/tickets.mjs`, `deck/test/view-tickets.test.mjs`, `deck/rune/src/regions/tickets.rs`, `tests/tickets.rs` | S6 (`Action::Move`), S10 (`Prefs`) | `pilot:rust-reviewer`, `pilot:typescript-reviewer` | [S15](slices/S15.md) |
| S16 | The header: usage readout, tab strip, add deck | 2, 3 | `deck/view/usage.mjs`, `deck/test/view-usage.test.mjs`, `deck/rune/src/regions/usage.rs`, `src/regions/tabs.rs`, `tests/header.rs` | S6 (`Action::AddDeck`) | `pilot:rust-reviewer`, `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S16](slices/S16.md) |
| S17 | The right strip: toggle, create, start, close deck, alerts | 2, 3 | `deck/view/strip.mjs`, `deck/test/view-strip.test.mjs`, `deck/rune/src/regions/strip.rs`, `tests/strip.rs` | S6 (`Action::Create`) | `pilot:rust-reviewer`, `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S17](slices/S17.md) |
| S18 | Settled threads by day, and the items page | 2, 3 | `deck/view/history.mjs`, `deck/test/view-history.test.mjs`, `deck/rune/src/regions/history.rs`, `tests/history.rs` | S7 (`queue::card`) | `pilot:rust-reviewer`, `pilot:typescript-reviewer` | [S18](slices/S18.md) |
| S19 | `npm test` and CI run the Rune deck's tests | 7, 8 | `scripts/gate.mjs`, `scripts/test/gate-cargo.test.mjs`, `.github/workflows/ci.yml` | S1 (`deck/rune/Cargo.toml`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S19](slices/S19.md) |
| S20 | The panels open, close and resize with springs, and stay as left | 2, 5, 6d, 6e | `deck/rune/src/layout.rs`, `tests/layout.rs` | S10 (`Prefs`) | `pilot:rust-reviewer` | [S20](slices/S20.md) |
| S21 | Escape and left-arrow go back without a Tab first (added) | 12 | `deck/rune/src/regions/thread.rs`, `src/app.rs`, `tests/thread.rs` | S8 | `pilot:rust-reviewer` | [S21](slices/S21.md) |
| S23 | A thread move fetches its view at once (added) | 14 | `deck/rune/src/live.rs`, `src/app.rs`, `tests/thread.rs` | S9 | `pilot:rust-reviewer` | [S23](slices/S23.md) |
| S22 | The overview shows one status table per tab (added) | 13 | `deck/view/status.mjs`, `deck/test/view-status.test.mjs`, `deck/rune/src/regions/status.rs`, `tests/status.rs` | S12 | `pilot:rust-reviewer`, `pilot:typescript-reviewer` | [S22](slices/S22.md) |
| S24 | A press posts off the UI thread, and its answer settles in one place (added) | 15 | `deck/rune/src/act.rs`, `src/app.rs`, `src/regions/queue.rs`, `regions/history.rs`, `regions/notifications.rs`, `tests/history.rs`, `tests/notifications.rs` | step 7 fix round | `pilot:rust-reviewer` | [S24](slices/S24.md) |
| S25 | Every other press posts through act::send (added) | 15 | `deck/rune/src/regions/chat.rs`, `regions/reply.rs`, `regions/tickets.rs`, `regions/strip.rs`, `regions/tabs.rs`, `src/app.rs`, their tests | S24 | `pilot:rust-reviewer` | [S25](slices/S25.md) |

Rust paths after S1 are under `deck/rune/`. S1 first by risk: if Rune will not build or paint headless here, every
other slice's plan changes. Then S5 (the write seam nine actions share), then the regions by the actions they need.

## 9. Acceptance evidence

1. A new session on this machine opens the Rune window on the overview (spec 1); with the binary removed the HTML
   page opens.
2. Each screen beside the HTML page's screenshot: same colours, regions and controls, light and dark (spec 2).
3. Panels open and close with springs; a press answers in its frame (spec 5).
4. Each of the 17 actions pressed in the window changes the deck as the page would (spec 3); an agent starting shows
   on the panel at once, every panel in step (6a); the lane lines read as aligned columns (6b); the bugs do not
   reproduce: refused words, double move, drag lag, a 100-count badge (6c-6e).
5. A tool-call post appears while a reply is half typed, the draft kept (spec 4); a new kind's thread draws (spec 11).
6. Stop the daemon: the window says so; start it: the window comes back (spec 10).
7. `npm test` runs the Rune tests (spec 7); the grep finds 0 lines (spec 8); the secret is in no log (spec 9).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 1, 2, 9, 11 |
| S2 | planned | | | | S1 | 4, 6a, 10 |
| S3 | planned | | | | S1 | 1 |
| S4 | planned | | | | S1 | 2, 5, 6b |
| S5 | planned | | | | S1 | 3, 9 |
| S6 | planned | | | | S5 | 3 |
| S7 | planned | | | | S5 | 2, 3, 5, 6b, 11 |
| S8 | planned | | | | S1 | 2, 11 |
| S9 | planned | | | | S5 | 3, 5, 6c |
| S10 | planned | | | | S6 | 2, 3 |
| S11 | planned | | | | S5 | 2, 3, 4 |
| S12 | planned | | | | S1 | 2 |
| S13 | planned | | | | S1 | 2 |
| S14 | planned | | | | S10 | 2, 6a |
| S15 | planned | | | | S6, S10 | 2, 3, 6c |
| S16 | planned | | | | S6 | 2, 3 |
| S17 | planned | | | | S6 | 2, 3 |
| S18 | planned | | | | S7 | 2, 3 |
| S19 | planned | | | | S1 | 7, 8 |
| S20 | planned | | | | S10 | 2, 5, 6d, 6e |
| S21 | planned (added) | | | | S8 | 12 |
| S22 | planned (added) | | | | S12 | 13 |
| S23 | planned (added) | | | | S9 | 14 |
| S24 | planned (added) | | | | step 7 fix round | 15 |
| S25 | planned (added) | | | | S24 | 15 |
| Deck UI rebuilt in Rune | planned | `feat/rune-deck-ui` | | | S1-S20 | 1-11 |
