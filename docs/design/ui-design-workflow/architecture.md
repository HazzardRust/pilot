# UI design workflow

Ticket `itm_132a653de1fc` · slug `ui-design-workflow` · base `main` 5fd835e · branch `design/ui-design-workflow`

## 1. Problem

While the Rune deck was being built, the user and the agents kept meaning different things about how a surface should look, and found out late, at the walkthrough. The user wants pilot to have a design step for any feature with a surface. The user shapes the look themselves and the crew builds from it. The step must be general enough to serve a web page and a Rust (Rune) interface alike, and it must never block the run. It probably builds on an open-source agentic UI design tool.

Inputs:
- The ticket and its 11 draft lines.
- The Rune run's record (`docs/design/rune-deck-ui/run.json` friction).
- `deck/DESIGN.md` §1-7.
- Not found here: the notes file `ui-design-workflow-notes.md` (every `~/.claude/projects/*/memory/` is empty) and `DESIGN.md` §8 (no ref on `origin` has one). Neither is reconstructed (A5).

## 2. Spec

| # | Behaviour | Evidence and bar |
| --- | --- | --- |
| 1 | The look step is general. One skill, `ui-design`, names no stack. What a stack contributes is one **surface adapter**: a `surface.json` beside its token file. | The same `pilot look` commands run on the Rune deck and on the web fixture; the 2 adapters differ only in their `surface.json` (S1, S2). |
| 2 | Once Gate 1 is signed on a `surface: true` plan, the pilot posts a non-blocking **Shape the look** item. It carries the playground command, opened on the feature's token file. The crew builds from the export the user sends back. | The pilot's step 4 names the item. On a scratch run it is on the deck before the first slice is integrated. |
| 3 | The step never blocks. Slices build on the architect's default tokens. `pilot look apply <export> <surface.json>` changes only the token file, as one commit. | `applyExport` test: an unknown key or a wrong-shape value is refused and 0 bytes change; a valid export rewrites only the touched leaves, and every untouched byte is equal. |
| 4 | Before the user looks, the crew checks a surface against 4 stack-neutral checklists: library defaults to override; interaction probed live (hover, select, Tab, press); parity with a reference; what the reference platform gives for free. | 4 files under `skills/ui-design/checklists/`. A structural lint (ADR 0180: a link and a field, no phrase) checks that each one is linked from the skill and that the implementer and QA load the skill. |
| 5 | Research first: open-source agentic UI design tools against the token playground, with a recommendation. | §3.2: 10 tools, each with licence, output, stack ties, billing and install-safety, then one recommendation. |
| 6 | Before the user's first look, QA posts a region-by-region **difference list** against the plan's named reference. The user strikes rows in one pass. | Deck test: QA's walkthrough on a `surface: true` plan without a `Differences: itm_…` line naming a question on its ticket is refused; with it, stored. |
| 7 | Any screen opens directly by a start-up route, in light or dark, and is captured without driving the user's mouse. | `pilot look snap <surface.json> <screen> --mode light\|dark` writes a PNG for the Rune deck and for the web fixture: 4 PNGs, with 0 input events sent (the adapter starts a process with an argv; it never sends input). |
| 8 | A rebuild never takes the user's window. | Test: `openDeck` spawns a copy, never `target/release/pilot-deck.exe`. Live: with the window open, `cargo build --release` exits 0, the window stays up, and the next `pilot deck` opens the new build. The cause (the Windows exe lock) is a **hypothesis**, proven or refuted by S3's first behaviour. |
| 9 | Look notes are batched by surface, one agent per batch, and the pilot holds the walkthrough thread. | The pilot's and QA's definitions each carry a **Look notes** heading; a structural lint (heading exists) pins both. |
| 10 | The gate1 of a surface feature carries the fonts, what colour means, and a reference per region. | Deck test: a `surface: true` gate1 with no `Fonts:`, `Colour means:` or `Reference:` line is refused (3 refusals), and one with all three is stored. The architect's step 5 names the lines. |
| 11 | Line 4's checks gain: every icon-only control names itself. Each slice gate on the Rune deck runs a format check beside both test halves. | The interaction checklist has an icon-only row. `cargoStep` returns `cargo fmt --check` and `cargo test`; a gate test shows 1 unformatted file makes the gate red, with 0 test steps started. |
| 12 | *added, assumed (A6)*: the playground shows the WCAG contrast ratio of each text/surface role pair, and flags a pair under 4.5:1. practitioner: design-systems engineer | `contrast` test on `tokens.js`: `#777777` on `#ffffff` gives 4.48 and is flagged; `#767676` gives 4.54 and is not. |
| 13 | *added (§7 feedback 1, 2; L10)*: every surface carries a committed design ruleset (rules, what each token means, known gaps), and its `surface.json` names it as `rules`. | `readSurface` test: a `surface.json` without `rules`, or naming a file that is missing, is refused. Both adapters name one: `deck/DESIGN.md` and `fixtures/surface-web/DESIGN.md`. |
| 14 | *added (L10)*: a run's design notes are committed under `docs/design/<slug>/`, never kept only in a machine's memory folder. | The pilot's and the architect's definitions each carry a **Design notes** heading naming `docs/design/<slug>/notes.md`; a structural lint (the heading exists in both) pins it. |

### 2.1 DESIGN.md §7 against the spec (A5 overturned)

| §7 feedback | Covered by |
| --- | --- |
| 1 a ruleset given as a design doc; 2 "document that as a design.md" | **not covered**: became spec 13 (S1, S2) |
| 3 corners, panel snap, title bar, left separator | Rune-only, for itm_f9162b87414f |
| 4, 5 copy VS Code's side bar; symbols name themselves on hover | 10 (`Reference:` per region), 6, 11 |
| 6 buttons in a random palette, misaligned | 4 (defaults, parity), 12 |
| 7 skip tests while restyling | ADR 0185: style is `look` evidence, a test only for logic; 7's snaps |
| 8 text too close to the top; 12 kind line misaligned; 14 reply box layout | Rune-only, for itm_f9162b87414f |
| 9 a new font | 10 (`Fonts:`) |
| 10, 13 hover on everything; 11 selectable text | 4 (interaction) |
| 13 "suggest a better system … close the intent gap" | 2, 3, 5 |
| 14 live markdown | its own ticket (#137 reply-markdown) |
| 15 missing nuance region by region; Tab and Shift+Tab | 6, 4 |
| 16 separation lines as the HTML deck has | 4 (parity), 6 |

## 3. Findings

### 3.1 What exists

- **Token playground**: `deck/rune/playground/index.html` (251 lines) and `README.md`.
  - It opens from file:// with no network. Import, then a control per leaf chosen by value shape (`:192`). The export is byte-stable: untouched leaves keep their raw bytes (`:151`).
  - Its mock is Rune's deck. `cargo test --test theme playground_mix` pins its colour mix to `theme.rs` `hue_over` (`deck/rune/tests/theme.rs:436-450`).
- **Rune tokens**: `deck/rune/theme.json`, read by `build.rs` and `theme.rs`. Mode is ours: `theme::tokens(dark: bool)` (`theme.rs:235`).
- **Rune start-up**: `State::load` uses `Query::default()` (`deck/rune/src/app.rs:129-130`). The rune `tooling` feature gives `--snap <png>` and `--tree` (`Cargo.toml:13-14`). No route, no mode flag.
- **Rune launch**: `openDeck` spawns `runeBinary` = `deck/rune/target/release/pilot-deck(.exe)` directly, detached (`deck/open.mjs:34-99`).
- **Gate**:
  - `cargoStep` returns one `cargo test --manifest-path deck/rune/Cargo.toml` on Windows (`scripts/gate.mjs:253-258`), run by the gate entry (`:395`).
  - `cargo fmt --check` exits 0 on main today (5fd835e, rustfmt 1.11.0).
- **Deck refusals**:
  - Pure gaps functions in `deck/gate2-evidence.mjs`: `recutGate1Gaps` (`:96`) is the body-line pattern, and `walkthroughPlanGaps` (`:87`).
  - Called at `deck/store-items.mjs:167`. Gate1 has `surface` (`deck/items.mjs:221`).
- **Taste skill**: `skills/design-review/SKILL.md` is web-only (1440px, chrome-devtools). It stays QA's taste pass; the checklists sit before it.
- **Caps**:
  - `deck/test/facades.test.mjs` caps deck files at 800 lines: `items.mjs` is at 799 and `store-items.mjs` at 797.
  - Prompt pins (`scripts/measure-prompt.mjs`): pilot 12069.5, architect 10634.25 and QA 5168.25 all have 0 headroom. A pin is raised only by the measured delta, with a dated comment (`scripts/test/measure-prompt.test.mjs:195-215`, `qa-preview.test.mjs:81`).
- **Rune run friction** (`docs/design/rune-deck-ui/run.json`):
  - S27 drove the wrong window and sent clicks and Win+keys to the user's foreground app.
  - A light snap needed the system theme changed.
  - A shared target swapped the release exe between the gate and the live check.

### 3.2 Research: open-source agentic UI design tools (spec 5)

| Tool | Licence | Output; read by a Rust app without it? | Tied to | Billing | Install-safety |
| --- | --- | --- | --- | --- | --- |
| Token playground (ours) | repo | the stack's own token JSON; yes | Rune shape today | none | no network, no hooks |
| Onlook | Apache-2.0 (brand excluded) | edits web source; no | React dev servers | Claude Code / Codex plan | analytics on by default (`STUDIO_TELEMETRY=0` to stop) |
| Penpot + MCP | MPL-2.0 (MCP repo archived 2026-02) | Penpot file; no | web Penpot, Node 20 | not stated | agent runs arbitrary code in the plugin; browser must stay open |
| OpenUI (wandb) | Apache-2.0 | HTML/React/Svelte; no | web | BYO metered keys, or Ollama | no telemetry stated |
| tldraw make-real | SDK source-available | HTML; no | tldraw SDK | vision API | archived; licence allows usage data to tldraw |
| Excalidraw | MIT | .excalidraw/SVG/PNG; no tokens | web | none | not determined |
| Storybook + addon-mcp | not determined | stories manifest; no | JS frameworks | the agent's | telemetry page unread |
| Style Dictionary / DTCG 2025.10 | not determined | any format via hooks; no Rust output | Node | none | DTCG has no light/dark pairs; Rust readers `dxn_dtcg` (not on crates.io) and `geoff-theme` are single-maintainer |
| Tokens Studio | MIT | JSON | Figma (cloud) | none | needs Figma |
| Open Design | Apache-2.0 | HTML, DESIGN.md + tokens.css; no | web | Claude Code or BYOK | analytics, session replay, always-on telemetry; `.claude-plugin/` unread |
| frontend-design skill | not read | web code; no | web | subscription | no hooks, no .mcp.json |

Recommendation (A1): generalise the playground, and keep each stack's own token file as the exchange format. Every candidate outputs web only; four carry analytics, metered keys or agent-run plugin code. DTCG lacks light/dark pairs and would be a second file to drift.

### 3.3 Seams (deepening pass)

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| Surface adapter, `deck/look.mjs` | `readSurface(path)`, `snap(surface, screen, mode, out, spawn)`, `look(argv)` | screen → route lookup, argv templating, browser lookup; 2 adapters, `command` and `web` (a real seam) | local-substitutable (`spawn` injected) |
| Token leaves, `skills/ui-design/playground/tokens.js` | `leaves(text)`, `exportText(doc)`, `applyExport(current, exported)`, `contrast(a, b)` | the leaf parser now inline in the playground page (`index.html:103-152`), so page and CLI share one | in-process |
| Plan gaps, `deck/gate2-evidence.mjs` | `surfaceGate1Gaps(ticket, body)`, `walkthroughPlanGaps(ticket, kind, body, items)` | the look lines and the difference-list check, beside `recutGate1Gaps` | in-process |
| Rune start-up, `deck/rune/src/app.rs` | `Start::from_args(args) -> Start { query, mode }` | `--open <query>`, `--mode light\|dark` into `State::load` | in-process |
| Deck launch, `deck/open.mjs` | `launchCopy(binary, dir, copy) -> path` | copy the release exe to a run path before spawning | local-substitutable (fs injected) |
| Rune gate, `scripts/gate.mjs` | `cargoStep(env, which, platform) -> { steps: [{command, args}] } \| { skip }` | fmt check before test | local-substitutable (`which`) |

Deletion test:
- `design-review` survives: it is QA's taste pass, a different question from the checklists.
- A per-stack playground fails the test, since 2 copies would reappear. So the page takes a preview per adapter.

## 4. Ubiquitous language

- **Surface**: anything a user looks at that the feature changes (a web page, a native window).
- **Surface adapter**: a surface's `surface.json`, naming its token file, preview, screens and how to open one.
- **Token file**: the stack's own JSON of design values. The only place a value is defined.
- **Export**: the token file as the playground writes it back. Byte-stable for untouched leaves.
- **Look step**: the non-blocking **Shape the look** item and the export it brings back.
- **Reference**: what a region should match, named per region at Gate 1.
- **Difference list**: QA's region-by-region rows against the reference, posted before the walkthrough.

## 5. Locked decisions

- **L1** Grilling depth is *forks*: only a question whose answer forks the deliverable is posted, and the rest are assumed (user, itm_c1f720e4b48a).
- **L2** No third-party tool is installed or called. The playground stays one file:// page with no network. Rejected: an MCP-driven design tool (§3.2 install-safety).
- **L3** The refusals read body lines (`Fonts:`, `Colour means:`, `Reference:`, `Differences: itm_…`), as `recutGate1Gaps` does. Rejected: new `deck_post` fields. `items.mjs` sits at 799 of 800 lines, and a schema field costs the pilot's pinned prompt.
- **L4** Tests aim at §3.3's seams. Agent prose is held by structural lints only (ADR 0180).
- **L5** A capture opens by route and never sends input to a window. Rejected: driving a window (the S27 friction).
- **L6** One leaf parser, `tokens.js`, is loaded by the page as a classic script and by the CLI through `vm`. Rejected: a second parser in `deck/` (drift on the byte-stable rule).
- **L7** Two adapter kinds: `command`, an argv template run with no shell, and `web`, a headless Chromium found on the machine, with a temporary profile. Rejected: a shell string in `surface.json` (injection).
- **L8** Each crew prompt addition points at the skill, and its pin rises by the measured delta with a dated comment: at most 80 tokens each for the pilot, QA and the architect. Rejected: cutting other prose to fit, which is out of scope.
- **L9** The run's ADR is `docs/adr/NNNN-ui-design-workflow.md`, cited ADR NNNN. The landing numbers it.
- **L10** Replaces A5 (user, itm_47ebe79d7ce4). The notes file and DESIGN.md §8 are unrecoverable. DESIGN.md §7 is read line by line against the spec (§2.1), and its uncovered workflow rule becomes spec 13. From now on a run's design notes live in the repo (spec 14). Rejected: proceeding without them.

## 6. Assumed decisions

- **A1** The tool: generalise the playground. Posted itm_a93cebfdaf4c. Trade: we maintain the page and build the web preview. Rejected: a DTCG export, Onlook.
  No user answer: the deck closed itm_a93cebfdaf4c as assumed after 20 min, so the default stands for now.
  Verdict: stands — the deck took the default after 20 min with no answer (itm_a93cebfdaf4c), not the user; it fits their standing rule against tools with telemetry or metered keys
- **A2** The deck refuses a gate1 without the look lines and a QA walkthrough without its difference list. Posted itm_25145bc7061f. Trade: 1 deck slice and 4 body lines for agents to get right. Rejected: prose and lint only.
  No user answer: the deck closed itm_25145bc7061f as assumed after 20 min, so the default stands for now.
  Verdict: stands — deck default on itm_25145bc7061f, not the user; no queued ticket touches gate1 or walkthrough refusals
- **A3** The export reaches the crew as a file path in a reply on Shape the look. Posted itm_88eea115fae3. Trade: one copy-paste. Rejected: a loopback Save route, which would take a file:// page's `Origin: null` with a bearer the page must hold.
  No user answer: the deck closed itm_88eea115fae3 as assumed after 20 min, so the default stands for now.
  Verdict: stands — deck default on itm_88eea115fae3, not the user; it adds no write route or trust boundary
- **A4** The web surface is a static fixture, `fixtures/surface-web/`. With the user, itm_1e265416d839. Trade: not a real product page. Rejected: the HTML deck, whose routes need its bearer.
  No user answer: the deck closed itm_1e265416d839 as assumed after 20 min, so the default stands for now.
  Verdict: stands — deck default on itm_1e265416d839, not the user
- **A5** Proceed without the notes file and DESIGN.md §8. Trade: any rule only they held is missing.
  No user answer: the deck closed itm_4abbec087d33 as assumed after 20 min, so the default stands for now.
  Verdict: overturned: the user called the DESIGN.md question important; the two inputs are unrecoverable (old machine out of reach), and on itm_47ebe79d7ce4 they chose to have DESIGN.md section 7 read line by line against the spec, with design notes committed in the repo from now on
- **A6** Spec 12 (contrast flag) is in scope as an added line (pilot, on the user's behalf).
  Verdict: stands — one added spec line, marked added, within the user's AA rule in DESIGN.md
- **A7** An export is applied by a Sonnet implementer on a fix brief on `feat/<slug>`, running `pilot look apply`. Not posted (process). Trade: one spawn per export. Rejected: the co-pilot applying it, since it writes no code.
  Verdict: stands — the co-pilot writes no code, and a Sonnet fix brief is the existing route
- **A8** One `surface.json` per surface, beside its token file. Not posted. Trade: no repo-wide list of surfaces. Rejected: a repo-level registry (one adapter per stack is all spec 1 needs).
  Verdict: stands — no queued ticket needs a repo-wide surface list
- **A9** S3's cause (the exe lock) is a hypothesis. If its first behaviour shows `cargo build --release` succeeds with the window up, S3 is re-cut to the real cause before any change. Not posted.
  Verdict: stands — a hypothesis stays one until S3's first behaviour proves it
- **A10** red team: S4 moves the parser out of the Rune page while S5 moves the page itself. S5 comes after S4 (`index.html`), never beside it, so the page is never half-moved.
  Verdict: stands — reply-markdown (#137) and archive-page (#139) do not touch the playground page

## 7. Out of scope

- Any MCP design server, Figma or Penpot integration; DTCG.
- Restyling the Rune or HTML deck; this run gives them adapters only.
- A loopback route that receives exports (A3).
- `design-review`'s web-only scope; it is not generalised here.
- Sync of look exports between devices.
- Rune-only look fixes from §7 (feedback 3, 8, 12, 14's reply box), for itm_f9162b87414f to check against the Rune deck as built.

## 8. Slices

Width 6; longest stem 3 (S1 → S4 → S5, S1 → S6 → S9)

| Slice | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- |
| S1 `pilot look snap` captures a web fixture screen in light and dark | 1, 7, 13 | `deck/look.mjs` (new), `bin/pilot.mjs`, `fixtures/surface-web/` (new: `index.html`, `tokens.json`, `surface.json`, `DESIGN.md`), `skills/ui-design/SKILL.md` (new), `deck/test/look.test.mjs` (new), `docs/adr/NNNN-ui-design-workflow.md` (new) | – | typescript, security | [S1](slices/S1.md) |
| S2 The Rune deck opens any screen in either mode by start-up route | 1, 7, 13 | `deck/rune/src/app.rs`, `deck/rune/src/main.rs`, `deck/rune/tests/startup.rs` (new), `deck/rune/surface.json` (new) | S1 (`surface.json` shape) | rust, security | [S2](slices/S2.md) |
| S3 A rebuild keeps the user's Rune window | 8 | `deck/open.mjs`, `deck/test/open-copy.test.mjs` (new) | – | typescript, security | [S3](slices/S3.md) |
| S4 `pilot look apply` changes only the touched tokens | 3 | `skills/ui-design/playground/tokens.js` (new), `deck/rune/playground/index.html` (parser out), `deck/look.mjs` (`apply`), `deck/test/look-apply.test.mjs` (new) | S1 (`deck/look.mjs`) | typescript, security | [S4](slices/S4.md) |
| S5 One playground shapes any surface and flags low contrast | 1, 5, 12 | `skills/ui-design/playground/index.html` (moved from `deck/rune/playground/`), `deck/rune/playground/mock.html` (new), `fixtures/surface-web/index.html` (preview message), `deck/rune/surface.json` and `fixtures/surface-web/surface.json` (`preview`), `skills/ui-design/playground/tokens.js` (`contrast`), `deck/rune/tests/theme.rs` (path), `deck/look.mjs` (`shape`), `deck/test/look-contrast.test.mjs` (new) | S4 (`tokens.js`, `index.html`, `deck/look.mjs`), S2 (`deck/rune/surface.json`) | typescript, rust, security | [S5](slices/S5.md) |
| S6 Four checklists the implementer and QA load | 4, 11 | `skills/ui-design/checklists/*.md` (new, 4), `skills/ui-design/SKILL.md` (links), `agents/pilot-implementer.md`, `agents/pilot-qa.md` (skill load line), `scripts/test/ui-design.test.mjs` (new), `scripts/test/qa-preview.test.mjs` (pin) | S1 (`SKILL.md`) | typescript, security | [S6](slices/S6.md) |
| S7 The Rune gate checks format | 11 | `scripts/gate.mjs` (`cargoStep`, `runeDeck`), `scripts/test/gate-cargo.test.mjs` (new) | – | typescript, security | [S7](slices/S7.md) |
| S8 The deck refuses a surface gate1 without its look lines, and QA's walkthrough without its difference list | 6, 10 | `deck/gate2-evidence.mjs`, `deck/store-items.mjs` (line 167 in place), `deck/test/look-gaps.test.mjs` (new) | – | typescript, security | [S8](slices/S8.md) |
| S9 The pilot, QA and architect run the look step and commit design notes | 2, 6, 9, 10, 14 | `agents/pilot.md`, `agents/pilot-qa.md`, `agents/pilot-architect.md`, `scripts/test/ui-design.test.mjs` (look-notes and design-notes lints), `scripts/test/measure-prompt.test.mjs` (pins) | S6 (`agents/pilot-qa.md`, `ui-design.test.mjs`, `qa-preview.test.mjs` pin) | typescript, security | [S9](slices/S9.md) |

S1 is the walking skeleton. A real `surface.json` is read by the real CLI, which starts a real headless browser through the `web` adapter and leaves a PNG of the fixture in each mode. That proves the adapter seam, the argv-only process start and the fixture's token load, before any Rust or prose stands on them.

**Overlaps with other runs.** `bin/pilot.mjs` and `agents/pilot.md` are edited by most runs. `deck/store-items.mjs:167` is one line in place. `deck/rune/` is shared with itm_f9162b87414f (Rune side panes) and itm_ff5ace129388 (prebuilt Rune deck, which touches `deck/open.mjs` too: S3 conflicts with it if both run).

**Red team.**
- S8: `items.mjs` at 799 lines. A field would break the 800 cap, so this was changed to body lines (L3).
- S9: pins at 0 headroom. Raising a pin by its measured delta is cheaper than cuts (L8).
- S5 beside S4 would half-move the page, so it now comes after S4 (A10).
- S7: `cargo fmt --check` might fail today and flood the slice. Checked: it exits 0 on 5fd835e.
- S3: the cause is unproven, so its first behaviour is the probe (A9).
- S1/S2: the Rune adapter's `rules` is `../DESIGN.md`. S1's escape check was relative to the file's directory, which would have refused it. It is now relative to the repository.
- S1's fixture: Chromium blocks `fetch` of file:// JSON. The `web` adapter passes `--allow-file-access-from-files` to a temporary profile only.

## 9. Acceptance evidence

QA environment: this laptop, with the Rune deck built here, the web fixture in a local browser, and a scratch deck store; no database. This default was not chosen by the user: the deck closed itm_25709c626d1e as assumed after 20 min with no answer.

1. On the Rune deck plan's Gate 1, the gate1 body shows `Fonts:`, `Colour means:` and `Reference:` lines. A gate1 without them was refused (spec 10).
2. The **Shape the look** item appears after the sign. The user runs `pilot look shape deck/rune/surface.json`, moves a colour, sees a pair flagged under 4.5:1, and downloads the export (spec 2, 12).
3. Slices kept building meanwhile. The user replies with the export path, and one commit changes only the touched leaves of `theme.json` (spec 3).
4. `pilot look snap` writes light and dark PNGs of a named Rune screen and of the web fixture, with the mouse untouched (spec 1, 7).
5. With the Rune window open, `cargo build --release` succeeds, and the window stays up (spec 8).
6. QA's difference list is on the deck before its walkthrough, and the look notes come back in batches by surface (spec 6, 9).
7. The checklists sit under `skills/ui-design/checklists/`, and a Rune slice gate shows `cargo fmt --check` (spec 4, 11).
8. §3.2 holds the research and its recommendation (spec 5).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | – | – | – | – | 1, 7, 13 |
| S2 | planned | – | – | – | S1 | 1, 7, 13 |
| S3 | planned | – | – | – | – | 8 |
| S4 | planned | – | – | – | S1 | 3 |
| S5 | planned | – | – | – | S4, S2 | 1, 5, 12 |
| S6 | planned | – | – | – | S1 | 4, 11 |
| S7 | planned | – | – | – | – | 11 |
| S8 | planned | – | – | – | – | 6, 10 |
| S9 | planned | – | – | – | S6 | 2, 6, 9, 10, 14 |
| UI design workflow | planned | feat/ui-design-workflow | – | – | S1-S9 | 1-14 |
