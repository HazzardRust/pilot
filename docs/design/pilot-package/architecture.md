# Pilot — package and deck

## 1. Problem

The pilot orchestration lives in one person's `~/environment/claude` and only
works there. It references two installed plugins by name, resolves one of them
by reading `~/.claude/plugins/installed_plugins.json` at runtime, and carries
absolute `C:\Users\Hazzard` paths in three files. A friend cannot run it.

Two things are wanted. First, a shareable package that vendors the skills and
agents the crew actually uses out of ECC and Matt Pocock's plugin, adapted to
output in this project's shapes rather than their own, with no runtime
dependency on either. Second, a lightweight UI for a run: one place where
grilling questions, QA walkthroughs and PR sign-offs queue up as threads, so
the to-do list stops being restated in chat and so a pending question stops
pausing the pilot's other work.

## 2. Findings

| Fact | Where |
| --- | --- |
| Six pilot agents, 676 lines; `pilot` skill 330; `vertical-slicing` 230; `policy-review` 376 + 5 references (1,146) | `~/environment/claude/agents/`, `skills/` |
| `pilot.md` resolves Pocock's skills at runtime from `~/.claude/plugins/installed_plugins.json`, deliberately, so plugin updates reach it | `agents/pilot.md`, "Matt Pocock's methodology" |
| 23 distinct `ecc:*` names referenced; only six skills are preloaded in agent frontmatter (`tdd-workflow`, `verification-loop`, `iterative-retrieval`, `browser-qa`, `codebase-design`, `diagnosing-bugs`) | `agents/*.md` frontmatter |
| `mattpocock-skills` is not in `enabledPlugins`; the runtime file read is the only thing resolving it | `settings.json` |
| statusLine is settings-only; a plugin's own `settings.json` supports only `agent` and `subagentStatusLine` | code.claude.com/docs/en/statusline.md, /plugins.md |
| `${CLAUDE_PLUGIN_ROOT}` expands in hook commands, MCP `command`/`args`/`env`, and **plugin skill markdown content** (skills.md, "Substituted only in plugin skills"). Expansion in **agent** content is not documented anywhere (the pilot checked sub-agents.md, plugins.md, plugins-reference.md); slice 1 proves it one way or the other | code.claude.com/docs/en/skills.md, /plugins-reference.md |
| `claude --agent plugin-name:agent-name` is documented; plugin subagents silently ignore `hooks`, `mcpServers`, `permissionMode` frontmatter (none of ours use them) | code.claude.com/docs/en/sub-agents.md |
| Private-repo marketplaces install with normal git credentials; background auto-refresh disables credential helpers, so auto-update needs extra config | code.claude.com/docs/en/plugin-marketplaces.md |
| ECC v2.2.0, MIT, "Copyright (c) 2026 Affaan Mustafa", github.com/affaan-m/ECC. All reviewers are `model: sonnet`, `tools: Read, Grep, Glob, Bash` — portable as-is | `~/.claude/plugins/cache/ecc/ecc/2.2.0` |
| ECC `tdd-workflow` is 583 lines and mandates its own 80% coverage reporting; `architecture-decision-records` 180; `context-budget` 136 | same |
| ECC binds `*` matchers on PreToolUse, PostToolUse, Stop, SessionStart, including session telemetry (`observe-runner`, `evaluate-session`, `cost-tracker`) | `hooks/hooks.json` |
| ECC's chrome-devtools declaration is `{"command": "npx", "args": ["-y", "chrome-devtools-mcp@latest"]}` — unpinned | `<ecc>/.mcp.json` |
| mattpocock-skills v1.2.3, MIT, "Copyright (c) 2026 Matt Pocock". Ships **no** agents, commands, hooks or MCP. `grilling` is 28 lines; there is no `vertical-slicing` skill in it | `~/.claude/plugins/cache/claude-plugins-official/mattpocock-skills/1.2.3` |
| The existing hooks are plain CommonJS, no dependencies, tested with `node --test` (19 tests, 336 lines), and `lib/atomic-write.js` is the write-then-rename helper the deck store can reuse | `hooks/`, `hooks/test/` |
| `chrome-devtools-mcp` latest is 1.9.0, Apache-2.0 | registry.npmjs.org |
| **Found by slice 1, 2026-09-13**: a main session's `Agent(a, b, c)` restriction is inherited by every agent it spawns — under `claude --agent pilot` the implementer could spawn only the five crew types, and `ecc:typescript-reviewer` was unreachable although installed. `rules/orchestration.md` believed the list bound the main session only. This run substitutes a `pilot-explorer` child carrying the reviewer's checklist verbatim; the plugin's `agents/pilot.md` must therefore list every vendored toolbox agent in its `Agent(...)`, or leave `Agent` unrestricted, or the crew's reviewers are dead on arrival | `~/environment/claude/agents/pilot.md:5`; the slice 1 implementer's probe |

The existing alert hook is the proof that a PostToolUse hook can push text into
the model's context with no tool call: it reads a JSON snapshot and emits
`hookSpecificOutput.additionalContext`. The deck's wake-up path reuses that
exact mechanism rather than inventing one.

## 3. Ubiquitous language

- **Deck** — one long-lived local process per machine, and its browser view at a
  fixed port. It is the only inbox. It is not "the UI" and not "the dashboard".
- **Run** — one piloted feature, identified by repository path plus slug. Several
  runs are live on one deck at once.
- **Item** — one thing needing the user, of kind `question`, `walkthrough` or
  `signoff`, optionally attached to a slice.
- **Thread** — the ordered messages inside an item: the pilot posts, the user
  replies, the pilot may push back, the pilot resolves. Only the pilot closes a
  thread; the user's reply never closes it by itself.
- **Yours** — the column of the status table naming the user's next action for a
  slice. It is rendered from that slice's open item, never typed.
- **Toolbox** — the vendored single-purpose reviewers and skills the crew loads.
  Never orchestration.
- **Vendored file** — a file copied from ECC or mattpocock-skills, carrying a
  provenance header and a row in `VENDOR.md`, marked verbatim or adapted.

## 4. Locked decisions

| # | Decision | Rationale | Rejected |
| --- | --- | --- | --- |
| L1 | Ship as a Claude Code plugin from a private GitHub marketplace; the repo `HazzardRust/pilot` is its own marketplace (`.claude-plugin/marketplace.json` beside `plugin.json`) | One artefact carries agents, skills, `hooks/hooks.json` and `.mcp.json`; namespacing, discovery and updates are the harness's job, not ours; `${CLAUDE_PLUGIN_ROOT}` removes every absolute path | A dotfiles repo with a bootstrap script — reimplements all four by hand and collides with any friend who already has `pilot-*` agents |
| L2 | Install is a prompt the friend pastes into Claude Code, pointing at `docs/INSTALL.md`; Claude performs marketplace add, plugin install, the settings merge, the CLAUDE.md excerpt append with consent, and a verification | The package is agent-first, so its install should be too; and a settings merge is exactly the fiddly step a human gets wrong | A numbered command list in the README, with the friend editing `settings.json` by hand |
| L3 | The deck is one process per machine on a fixed port, serving stdio MCP to every Claude session and HTTP to one browser tab, over one store | Several runs at once is the user's normal state; one place was the whole point. One writer removes the cross-process write race | One process per run — several URLs, and the pile-up problem returns |
| L4 | The status table and the queue are one view. `Slice \| State \| Yours` is the home screen; `Yours` links to the slice's open thread | The user's own sketch already fuses them: "Verdict" in the `Yours` column *is* the open item | Separate queue and status pages |
| L5 | Deck state lives at `~/.claude/pilot/`, never in the target repository. The architecture artefact keeps the design, the decisions and the slice DAG | The package must not require editing a friend's `.gitignore`. Queue state is per-machine and disposable; the artefact is per-repo and durable | `.pilot/` inside the target repo |
| L6 | Namespace `pilot:`; all agents flat in `agents/` | `ecc:security-reviewer` becomes `pilot:security-reviewer`, 23 rewrites. Flat keeps names two-part | `agents/toolbox/` — addresses become `pilot:toolbox:security-reviewer` |
| L7 | Chrome DevTools MCP is the one declared external dependency, pinned to `chrome-devtools-mcp@1.9.0` (Apache-2.0, fetched by `npx`, not vendored) | Reproducibility: `@latest` means a browser-driving dependency can change under the QA agent between runs | ECC's unpinned `@latest` |
| L8 | Package is MIT under the user's copyright. `THIRD-PARTY-NOTICES.md` carries both upstream MIT notices verbatim; every vendored file carries a provenance header; `VENDOR.md` is the re-sync ledger | MIT's only condition is that the notice travels with substantial portions | Attribution in the README alone |
| L9 | No ECC orchestration and no ECC hooks: `orch-*`, `multi-*`, `plan-*`, `loop-*`, `autonomous-loops`, `plan-canvas`, and the whole `hooks/hooks.json` tree | The brief excludes the pipelines; the hooks bind `*` on four events and include session telemetry whose network behaviour we did not trace. Shipping a friend a `*` PostToolUse hook we have not read is not acceptable | Vendoring the hooks and gating them behind a config flag |
| L10 | Merge as you go; no database, so no QA-database decision on this run | The user owns the repository | Stacked PRs with a re-chain |
| L11 | Ship the whole `rules/` tree — `orchestration.md`, `vertical-execution.md` and all ~6,000 lines of ECC's 22-language rules. The plugin holds the canonical copies; the install step copies them into the friend's `~/.claude/rules/`, idempotently, never overwriting a file that is already there, and reports what it did | A plugin cannot register rules as loaded context, only carry the files. Agents reference specific files by `${CLAUDE_PLUGIN_ROOT}/rules/...`; the copy is what makes the language rules load the way they do today | Shipping only the two orchestration rules, or symlinking (breaks on Windows without developer mode) |
| L12 | `~/environment` installs the package the same way a friend does, and then drops its own copies of everything the plugin provides, keeping only what is genuinely personal (`CLAUDE.md`, `settings.json`, `MACHINE-SETUP.md`, `bootstrap.ps1`). Slice 11 | The package is only trustworthy if it is the thing actually being run; two copies drift and the shipped one stops being tested | Keeping both copies and re-syncing by hand |
| L13 | No upstream name in anything addressable or on disk: agent, skill and command names, directories, hook and script files carry no `ecc`, `pocock` or `mattpocock`. Attribution is documentation: the README's *Built on* section, `THIRD-PARTY-NOTICES.md`, `VENDOR.md`, `docs/INSTALL.md` and the provenance header inside every vendored file all name the author (HazzardRust, matching `LICENSE` and `package.json`) and then both upstreams and their licences. Ledger fragments are `vendor/methodology.md` (Pocock) and `vendor/toolbox.md` (ECC); ECC's rules tree lands as `rules/<dir>/` with no `ecc/` level | The package is *pilot*; a friend addresses `pilot:security-reviewer`, not a vendor. Credit belongs where a reader looks for it, not in a path | `rules/ecc/`, `vendor/ecc.md`, `vendor/pocock.md` — brand names in the tree, decided by the user on 2026-09-13 |

## 5. Assumed decisions

| # | Assumption | Default taken | Tradeoff |
| --- | --- | --- | --- |
| A1 | Wake-up path | Three layers: `deck_wait(timeout)` long-polls the deck and returns whatever arrived — one tool call per wait, not per poll; a PostToolUse hook opportunistically injects replies as `additionalContext` when the pilot is doing other work, at zero tool cost; a Stop hook refuses to let the pilot go idle while a reply is unread | The hook fires only on a tool call, so a genuinely stopped pilot needs the Stop gate; three mechanisms is more surface than one, but each covers a case the others cannot |
| A2 | Who starts the deck | The first pilot session that needs it: the stdio MCP client tries the port, and spawns the daemon detached if nothing answers. A `pilot deck` command exists for starting it by hand | Detached spawn on Windows is the fiddliest part of the package. The alternative — an explicit command — is more predictable but fails closed the first time a friend forgets |
| A3 | Dependencies | Exactly one npm dependency, `@modelcontextprotocol/sdk`, for the MCP transport. HTTP, UI and store use Node built-ins only; the UI is one server-rendered page with server-sent events, no build step | Hand-rolling the MCP handshake risks silent protocol drift; a React UI buys nothing at this size and costs a `node_modules` tree a friend has to install |
| A4 | Deck port | 4321, fixed, bound to `127.0.0.1`, no authentication (the pilot changed the architect's 4317: that is the OpenTelemetry collector's default gRPC port and collides on any machine running one) | A fixed port is discoverable and lets the statusline and the README name a URL. It collides if something else holds it; the daemon reports that rather than silently moving |
| A5 | The two orchestration rules | Rewritten to second person and copied to `~/.claude/rules/` per L11; agents reference them by `${CLAUDE_PLUGIN_ROOT}/rules/...`. **Settled by slice 1**: the variable expands in agent body content (two `claude -p --agent pilot:pilot` runs, one from an unrelated cwd, both emitted the absolute path). Two riders: with a `directory`-source marketplace the root expands to the source directory, not the cache copy, so slices 10 and 11 must not assume the cache path; and a local marketplace add copies gitignored files (including `node_modules`) while a GitHub install does not, so the install prompt must run `npm install --omit=dev` in the plugin root | Docs confirm expansion in skill content only; the agent case was proven empirically, not from the docs |
| A6 | Deck data handling | The store is plain JSON on disk, unencrypted, and the deck binds `127.0.0.1` with no authentication. Threads may quote diffs and URLs; they must never quote a credential, and the deck refuses to store a value matching a key or token pattern | Anything on the machine can read `~/.claude/pilot/`. Encrypting it would need a key the deck could also read, which buys nothing against a local attacker and costs a lot of surface |
| A7 | Vendoring depth | The ten ECC agents and six ECC skills the crew names, plus eight Pocock skills. Names mentioned once in passing (`healthcare-reviewer`, `code-reviewer`, `ecc:plan`, `ecc:architect`, `orch-refine-code`) are dropped and the references rewritten | A friend hitting one of those prompts gets nothing; keeping the set small is what makes the manual re-sync survivable |
| A8 | Launch ergonomics | `claude --agent pilot:pilot`; the README documents a shell alias | Two-part name is awkward but is what the harness requires |
| A9 | `cost-report.mjs` | Ships as the `/pilot:cost` command, with the `C--Users-Hazzard-` string generalised | It exists because ECC misprices Opus; without ECC it is a standalone utility that still reads `~/.claude/metrics/costs.jsonl` |
| A10 | Context thresholds and the window table | Fractions of the acting model's window — 35% advisory, 40% hard — which is 350K and 400K on a 1M window. The window comes from a pattern-to-size table in the shape `cost-report.mjs` already uses for rates; the model id comes from the same transcript message as the token counts. A model absent from the table means the guard stays silent, and a test asserts the table covers every `model:` declared in `agents/*.md` | Fractions track a model whose window changes; absolute counts do not. The cost is a table that rots silently when a new model ships, which is what the test is for. 35% is far stricter than `vertical-execution.md`'s two-thirds: the guard implements the user's number and the rule keeps its prose, so the number lives in exactly one place |
| A11 | How the pilot learns | At 40% the hook itself POSTs a `handoff` item to the deck, as well as the agent messaging `main`. Item kinds are open strings; `handoff` renders generically and never appears in `Yours` | The agent most likely to ignore an advisory is the degraded one the guard exists for, so compliance cannot be the only path. The cost is a hook that talks to the deck over HTTP and must fail open when it is down |
| A12 | The pilot's own guard | The same module with a different source: no `agent_id` in the hook input means the main session, and the size comes from slice 9's existing snapshot rather than a transcript. The advice differs — bring the artefact's status table current, then compact or start a fresh pilot from it | One module, two sources, no third state file. The snapshot is only as fresh as the statusline's refresh interval, so the pilot's reading lags a subagent's by up to thirty seconds |
| A13 | Per-subagent display | `subagentStatusLine` ships in the plugin's own `settings.json`. It is the one status line a plugin can carry, and it reports `tokenCount` against `contextWindowSize` directly, with no transcript read | It can only render, never inject or block, so it is the display and not the guard. It needs Claude Code >= 2.1.205; below that there is no per-subagent display at all |
| A14 | Re-arming | One claim per `agent_id` and threshold; observing a size below 30% clears that agent's claims, so an agent that compacts and climbs again is warned again | Hysteresis at 30% is a guess. Too tight and a wobbling reading double-warns; too loose and a compacted agent is never warned again |

## 6. Out of scope

ECC's orchestration pipelines and hooks (L9); Pocock's twelve unregistered
`in-progress/` and `misc/` skills; a hosted or multi-user deck; deck
authentication or encryption at rest (A6); publishing to a public marketplace;
porting to harnesses other than Claude Code; `agent-browser`; automatic upstream
re-sync (the ledger reports drift, a human decides); any change to the
electrical-sales repository this design was launched from.

## 7. Slices

Every slice's gates are: `node --test` with no path argument (on Node 26 a trailing directory is parsed as a module specifier and fails), `node --check` on each changed `.js`/`.mjs`,
and — where the slice changes the plugin surface — installing the plugin from the
local path and confirming the change is live. There is no type check; the package
is plain CommonJS and ESM by design.

The DAG has one root and three lanes that run in parallel after it, with disjoint
owned files: `1 → 2 → 3 → {4 → 6, 5}`, `1 → 7`, `1 → 8`, `1 → 9`, then
`{5,6,7,8,9} → 10`, `{3,5,9} → 12`, `{10,12} → 11`. Slices 7 and 8 both vendor, so each owns its own ledger
fragment (`vendor/methodology.md`, `vendor/toolbox.md`) and slice 10 assembles `VENDOR.md`
from them; that is what keeps them parallelisable.

### Slice 1 — A pasted prompt installs the plugin, and `claude --agent pilot:pilot` posts an item a human answers in a browser

Source spec: §4 L1, L2, L3; §2 rows on `--agent` and `${CLAUDE_PLUGIN_ROOT}`.
Dependencies: none. This is the walking skeleton.
Files owned: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `agents/pilot.md` (stub), `.mcp.json`, `deck/server.mjs`, `deck/store.mjs`, `deck/ui/index.html`, `deck/test/skeleton.test.mjs`, `README.md`, `LICENSE`, `package.json`.
Expected behaviour: `/plugin marketplace add <local path>` then `/plugin install pilot@pilot` succeeds; `claude --agent pilot:pilot` starts an agent that calls `deck_post` and `deck_read`; the stub agent's body contains a `${CLAUDE_PLUGIN_ROOT}/README.md` reference and the agent reports (in its first deck item) whether it saw an expanded absolute path or the literal variable, which settles A5; the item appears at `http://127.0.0.1:4321`; a reply typed in the browser is returned by the next `deck_read`.
Verification: `node --test deck/test/`; the install and the round trip, by hand.
Evidence: the round trip seen in a real browser — post, reply, read — plus the `/plugin install` output showing the plugin resolved from the marketplace.
Prohibited: no mock MCP client standing in for Claude Code; no in-memory-only store; no second agent, skill or hook in this slice.
Completion: a reply typed in the browser reaches the agent, with the plugin installed through the marketplace rather than by copying files.

### Slice 2 — Several runs share one deck that survives the session that started it

Source spec: §4 L3; §5 A2, A4.
Dependencies: Slice 1.
Files owned: `deck/daemon.mjs`, `deck/client.mjs`, `deck/runs.mjs`, `deck/test/daemon.test.mjs`, `bin/pilot.mjs`, and `deck/server.mjs` and `deck/store.mjs` from here on (slice 1 created them; the principles review of PR #1 noted no later slice owned them).
Rider (2026-09-13, from slice 1's QA): two worktrees each started a deck and collided on 4321 in the wild; the loser printed the A4 message and served MCP only, as designed. `PILOT_DECK_DIR` isolates the store but not the port, so a test or a hand invocation cannot keep 4321 free by env alone. The daemon takes a `PILOT_DECK_PORT` override for tests and agents' hand checks; the default stays 4321 and the statusline, README and page never assume anything else.
Rider (2026-09-13, from PR #1's principles review): write-then-rename exists twice — `deck/store.mjs` and slice 9's `hooks/lib/atomic-write.js`. When the daemon becomes the sole writer, the store imports `hooks/lib/atomic-write.js` (CommonJS is importable from ESM) and drops its own copy. Also: `deck_read` serialises the whole deck into the agent's context on every call with no bound; the daemon's read takes a limit or an `open` filter before slice 4 puts several runs on it.
Expected behaviour: two Claude sessions in different repositories each register a run; both appear on one deck; closing one session leaves the deck and the other run up; `deck_wait(timeout)` blocks until a reply arrives or the timeout elapses and returns whatever arrived.
Verification: `node --test deck/test/daemon.test.mjs`; two sessions by hand.
Evidence: the deck showing two runs from two repositories; the daemon still serving after the session that spawned it exits; a `deck_wait` call that returns early on a reply and another that returns empty on timeout.
Prohibited: no polling loop inside `deck_wait`; no port scanning; no writing to the store from the stdio client — the daemon is the only writer.
Completion: two runs on one deck, the daemon outliving its parent session, and `deck_wait` demonstrated both ways.

### Slice 3 — A question is a thread the user and the pilot argue in

Source spec: §3 Thread; the user's "keep grilling's back-and-forth".
Dependencies: Slice 2.
Files owned: `deck/items.mjs`, `deck/ui/thread.html`, `deck/ui/deck.css`, `deck/test/items.test.mjs`, `deck/ui/render.mjs`.
Rider (2026-09-13, from PR #1's principles review): `deck/server.mjs` holds rendering, routing and the MCP surface in one file; this slice's first move extracts `deck/ui/render.mjs` so slices 3 and 4 own their own renderers and stop sharing `server.mjs`.
Expected behaviour: the pilot posts a question with a recommended default and options; the user picks an option or types free text; the pilot posts a push-back in the same thread; the user replies again; the pilot resolves it. Kinds are open strings: `question`, `walkthrough` and `signoff` render differently, and any other kind renders generically and never appears in `Yours` — a walkthrough shows the URL, the login and the screens, and its reply box takes dot points.
Verification: `node --test deck/test/items.test.mjs`; one full argue-and-resolve cycle by hand.
Evidence: a screenshot of a thread with at least four messages and a resolution; the free-text dot points from a walkthrough reply arriving verbatim at the agent.
Prohibited: no auto-resolving an item because the user replied; no markdown rendering of user input as HTML without escaping; no reply box that loses typed text on a server-sent-events refresh.
Completion: a four-message thread closed by the pilot, not by the user's reply.

### Slice 4 — The deck's home screen is the status table the user asked for

Source spec: §4 L4; the user's sketch, `Slice | State | Yours`.
Dependencies: Slice 3.
Files owned: `deck/status.mjs`, `deck/ui/home.html`, `deck/test/status.test.mjs`.
Expected behaviour: `deck_status` replaces a run's slice table wholesale; the home screen renders one row per slice with `State` free text from the pilot ("PR #16 at 91cbb89, draft, walkthrough on http://localhost:3260/jobs") and `Yours` derived from that slice's open item ("Verdict", "Merge it", or blank). Clicking `Yours` opens the thread. Aesthetic per pi.dev: monospace, hairline rules, auto light and dark, low density.
Verification: `node --test deck/test/status.test.mjs`; the table by hand.
Evidence: the rendered table beside the user's sketch, with a live URL in `State` and a real open item behind `Yours`.
Prohibited: no `Yours` column the pilot writes directly; no third store for slice state; no CSS framework.
Completion: the table matches the sketch and `Yours` is rendered, not typed.

### Slice 5 — A reply reaches the pilot without it asking, and it cannot go idle unread

Source spec: §5 A1; §2 on `additionalContext`.
Dependencies: Slice 3.
Files owned: `hooks/hooks.json` (extending the file slice 9 created), `hooks/post-tool.js`, `hooks/inbox-alert.js`, `hooks/stop-gate.js`, `hooks/test/inbox.test.js`.
Expected behaviour: a reply typed while the pilot is mid-work appears in its context at the next tool call, once, without a tool call of its own; a pilot that tries to end its turn with an unread reply or an unresolved answered item is blocked with a reason naming the item. `post-tool.js` is the single PostToolUse process and names its three modules up front — `inbox-alert.js` here, `context-usage-alert.js` from slice 9, `context-size-guard.js` from slice 12 — calling each in a try/catch and merging their output, so a module that is absent or throws is a no-op and the lanes stay independent.
Verification: `node --test hooks/test/inbox.test.js`; a reply delivered mid-work and a blocked stop, both by hand.
Evidence: the hook's `additionalContext` payload captured; the pilot visibly picking up a reply without calling `deck_read`; one blocked stop.
Prohibited: no hook that fails closed — when the deck is unreachable, both the PostToolUse delivery and the Stop gate must let the session carry on and say so once, never trap the pilot; no second PostToolUse entry — the usage alert and the inbox alert share one process, since this runs after every tool call; no delivering the same reply twice (reuse the exclusive-create claim idiom from `context-usage-alert.js`); no blocking a stop for an item the pilot has already resolved.
Completion: a reply lands with no tool call, exactly once, and an unread reply blocks the stop.

### Slice 6 — The six pilot agents run from the plugin and talk to the deck instead of the chat

Rider (2026-09-13, from the §2 inheritance finding): `agents/pilot.md`'s `Agent(...)` list must name the ten toolbox agents slice 8 ships alongside the five crew agents, since a subagent cannot spawn a type its parent's list omits; a test asserts the list covers every `pilot:*` agent the crew definitions name. Slice 11 makes the same fix to `~/environment`'s copy on the way out, and `rules/orchestration.md` (slice 6's file) drops the sentence that says the list restricts only the main session.

Source spec: §4 L6; §5 A5; §2 on the runtime plugin read.
Dependencies: Slice 4.
Files owned: `agents/pilot.md`, `agents/pilot-architect.md`, `agents/pilot-explorer.md`, `agents/pilot-implementer.md`, `agents/pilot-fundamentalist.md`, `agents/pilot-qa.md`, `skills/pilot/SKILL.md`, `skills/vertical-slicing/SKILL.md`, `skills/policy-review/**`, `rules/orchestration.md`, `rules/vertical-execution.md`, and `.mcp.json` from here on (slice 1 created it with the deck only; this slice adds the L7 `chrome-devtools-mcp@1.9.0` declaration the QA agent and slice 8's `browser-qa` name as `mcp__plugin_pilot_chrome-devtools__*` — assigned by the pilot on 2026-09-13, no slice had owned it).
Expected behaviour: a real feature request reaches Gate 1 — the pilot grills through the deck one item at a time, the architect writes an artefact, and no `AskUserQuestion` is used. `pilot.md`'s runtime read of `installed_plugins.json` is gone, replaced by `${CLAUDE_PLUGIN_ROOT}` paths.
Verification: `node scripts/check-references.mjs` (no `ecc:`, no `mattpocock-skills:`, no `C:\Users`, no `installed_plugins.json`, every `${CLAUDE_PLUGIN_ROOT}` path resolves); one run to Gate 1 by hand.
Evidence: a grilling round conducted entirely in the deck; the reference check green; the artefact produced by the plugin-installed architect.
Prohibited: no `AskUserQuestion` left in the pilot's tools; no dangling reference to a skill this package does not ship; no rewriting the agents' judgement content while renaming — namespace and transport only.
Completion: a feature reaches Gate 1 with the deck as the sole inbox.

### Slice 7 — Pocock's mechanics, in this project's shapes

Source spec: §5 A7; §2 on the mattpocock-skills inventory.
Dependencies: Slice 1.
Files owned: `skills/grilling/**`, `skills/domain-modeling/**`, `skills/codebase-design/**`, `skills/wizard/**`, `skills/diagnosing-bugs/**`, `skills/resolving-merge-conflicts/**`, `skills/tdd/**`, `skills/code-review/**`, `vendor/methodology.md`, `scripts/check-provenance.mjs` (created here and reused unchanged by slice 8; assigned by the pilot on 2026-09-13 because neither vendoring slice had owned it).
Expected behaviour: each skill invokes as `/pilot:<name>` and produces this project's output shape. `grilling`'s numbered frontier round becomes one deck item at a time. `domain-modeling`'s ADR-FORMAT and CONTEXT-FORMAT become the artefact's §3 glossary and `docs/adr/`. `wizard`'s `template.sh` emits a deck item rather than an interactive prompt.
Verification: `node scripts/check-provenance.mjs skills/` (every file has a header and a `vendor/methodology.md` row); each adapted skill invoked once by hand.
Evidence: `grilling` asking one question through the deck; `domain-modeling` writing into the artefact's §3 rather than its own format.
Prohibited: no rewriting the reasoning that makes these skills good — only the output shape and the transport; no vendoring the `in-progress/` or `misc/` trees; no dropping the MIT notice from a copied file.
Completion: eight skills invoke under `pilot:`, each adapted, each with provenance.

### Slice 8 — ECC's toolbox, without ECC

Source spec: §4 L9; §5 A7.
Dependencies: Slice 1.
Files owned: `agents/security-reviewer.md`, `agents/typescript-reviewer.md`, `agents/react-reviewer.md`, `agents/python-reviewer.md`, `agents/database-reviewer.md`, `agents/silent-failure-hunter.md`, `agents/build-error-resolver.md`, `agents/react-build-resolver.md`, `agents/code-explorer.md`, `agents/docs-lookup.md`, `skills/tdd-workflow/**`, `skills/verification-loop/**`, `skills/iterative-retrieval/**`, `skills/browser-qa/**`, `skills/context-budget/**`, `skills/architecture-decision-records/**`, `rules/**` except `rules/orchestration.md` and `rules/vertical-execution.md` (slice 6's), `vendor/toolbox.md`.
Expected behaviour: the implementer spawns `pilot:security-reviewer` and it returns findings in the shape the implementer's report table expects. `tdd-workflow` is cut from 583 lines to the red-green-refactor mechanics the implementer needs, with its own 80% coverage reporting replaced by the slice's phase gate. `browser-qa` names the Chrome DevTools MCP tools under `mcp__plugin_pilot_chrome-devtools__*`. ECC's 22-language rules tree lands verbatim under `rules/` (its `common/` and per-language directories directly, no `ecc/` level, per L13) — it is reference content, not crew machinery, and is not adapted.
Verification: `node scripts/check-provenance.mjs agents/ skills/ rules/`; one reviewer spawned against a real diff by hand.
Evidence: a review returned by `pilot:security-reviewer`; the trimmed `tdd-workflow` under 200 lines with the cut recorded in `vendor/toolbox.md`.
Prohibited: no ECC hook, command or orchestration skill copied; no `node_modules` from the ECC cache; no reviewer whose output format contradicts the implementer's report table; no editing the rules tree while copying it.
Completion: ten agents, six skills and the rules tree run under `pilot:` with no ECC installed.

### Slice 9 — The statusline and the session-limit warning work on a machine that never had them

Source spec: §2 on statusLine being settings-only; §5 A9.
Dependencies: Slice 1.
Files owned: `hooks/context-usage-statusline.js`, `hooks/context-usage-alert.js`, `hooks/lib/atomic-write.js`, `hooks/test/context-usage.test.js`, `commands/cost.md`, `scripts/cost-report.mjs`, `scripts/install-settings.mjs` (statusline only), `hooks/hooks.json` (created here with the alert's PostToolUse entry, so `${CLAUDE_PLUGIN_ROOT}` expands and uninstall removes it; the implementer's finding, taken by the pilot on 2026-09-13; slice 5 extends the file).
Expected behaviour: the statusline shows model, directory, context, session and weekly percentages, plus the deck's open-item count; the alert fires once at 90% and once at 95%; `/pilot:cost` prints the corrected per-model table. No absolute home path anywhere.
Verification: `node --test hooks/test/context-usage.test.js`; the statusline rendering and one synthetic 90% crossing by hand.
Evidence: the statusline visible under the CLI input on a machine where it was installed by `install-settings.mjs`; the alert's `systemMessage` captured once.
Prohibited: no rewrite of the tested usage logic while making it path-independent; no overwriting an existing `statusLine` setting without saying so; no second state file — the deck count comes from the deck's snapshot.
Completion: both work after a settings merge, and the 19 existing tests still pass.

### Slice 10 — A friend pastes one prompt and ends up with a working pilot

Source spec: §4 L2, L7, L8; §5 A6.
Dependencies: Slices 5, 6, 7, 8, 9.
Files owned: `docs/INSTALL.md`, `README.md`, `THIRD-PARTY-NOTICES.md`, `VENDOR.md`, `CLAUDE.excerpt.md`, `scripts/check-upstream.mjs`, `scripts/build-vendor-ledger.mjs`.
Rider (2026-09-13, from slice 8's live security review): `pilot:docs-lookup` fetches untrusted web pages with `WebFetch` and no domain allowlist; a plugin's own `settings.json` cannot carry `permissions`, so the install step's settings merge offers a `WebFetch(domain:…)` allowlist for the documentation hosts the friend names, reported like the statusline merge and never forced. Its `model: haiku` on untrusted input is an upstream choice left as is.
Expected behaviour: a friend pastes the README's install prompt into Claude Code and Claude adds the marketplace, installs the plugin, merges the statusline setting, copies `rules/` into `~/.claude/rules/` without overwriting anything already there and says exactly which files it wrote and which it skipped, offers the `CLAUDE.md` excerpt for consent, registers Chrome DevTools MCP pinned at 1.9.0, and verifies by starting the deck and posting a test item. Re-running the prompt changes nothing. `VENDOR.md` is assembled from `vendor/methodology.md` and `vendor/toolbox.md`; `check-upstream.mjs` reports which vendored files and which rules files have drifted from upstream.
Verification: `node scripts/check-upstream.mjs`; `node scripts/build-vendor-ledger.mjs --check`; `node --test scripts/test/install.test.mjs`; the whole install on a clean Windows profile by hand, then a second time.
Evidence: a clean-profile install driven only by the pasted prompt, ending with a deck item answered; the second run reporting every rules file as already present and changing nothing; the drift report naming at least one file and its upstream commit.
Prohibited: no install step the friend types by hand; no `git pull` of the upstream plugins at install time; no credential written into any tracked file; no consent-free append to a friend's `CLAUDE.md`; no overwrite of an existing `~/.claude/rules/` file or `statusLine` setting without saying so first.
Completion: a clean Windows profile goes from nothing to an answered deck item with one pasted prompt, a second run is a no-op, and the drift report runs.

### Slice 12 — An agent filling its context stashes and hands off instead of getting dumb

Source spec: §5 A10-A14; `rules/vertical-execution.md` on a slice that cannot reach green inside its context being mis-cut; §2 on `additionalContext`.
Dependencies: Slices 3, 5, 9.
Files owned: `hooks/context-size-guard.js`, `hooks/lib/transcript-tail.js`, `hooks/lib/model-windows.js`, `hooks/test/context-size.test.js`, `settings.json` (the plugin’s own, for `subagentStatusLine`).
Expected behaviour: after every tool call the shared PostToolUse process reads the acting agent’s context size and compares it to that model’s window. For a subagent that means seeking the tail of its own transcript at `transcript_path` and summing the last assistant message’s `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`; for the main session, which has no `agent_id` in the hook input, it means reading the `ctx` figure slice 9’s statusline already writes to `~/.claude/context-usage-state.json`. At 35% it injects an advisory: finish the step in hand, start nothing new. At 40% it injects a hard recommendation to stash and hand off — commit work in progress to the slice branch with a `wip:` subject and the trailer, staging only files the agent changed; write a handoff a fresh agent could be briefed from; message `main`; then stop — and the hook itself POSTs a `handoff` item to the deck so the pilot learns of it even if the agent ignores the advice. The pilot’s own 40% text differs: bring the artefact’s status table current, then compact or start a fresh pilot from it. `subagentStatusLine` shows `tokenCount` against `contextWindowSize` throughout. If the injection proves to land in the parent’s transcript rather than the subagent’s, the injection is dropped and the deck item plus the display carry the whole guard.
Verification: `node --test` with no path argument; one real subagent driven past 35% and then 40% by hand.
Evidence: the 35% and 40% payloads captured from inside a real subagent’s own tool loop, with proof of which transcript the injected text landed in; a `wip:` commit and a `handoff` item on the deck from an agent that actually stopped; the guard staying silent on an unreadable transcript and on a model absent from the table.
Prohibited: no whole-file read of a transcript — seek the tail, because these run to hundreds of megabytes and this fires after every tool call; no blocking, since 40% is a recommendation and never a Stop-hook refusal; no edit to `hooks/hooks.json`, `hooks/post-tool.js` or `hooks/context-usage-alert.js`, which slices 5 and 9 own; no second PostToolUse entry; no firing twice for one agent and threshold (claim files keyed on `agent_id` plus threshold); no guessing a window for a model not in the table; no `git add -A` in the stash step and no credential in the commit or the deck item.
Completion: a real subagent crosses 35% and then 40%, is told once at each, stashes and hands off, and the pilot learns of it from the deck without the agent having said anything.

### Slice 11 — This machine runs the package instead of its own copies

Source spec: §4 L12.
Dependencies: Slices 10 and 12.
Files owned: in `~/environment` (a different repository, its own branch and PR): `claude/agents/**`, `claude/skills/**`, `claude/rules/**`, `claude/hooks/**`, `claude/cost-report.mjs` (all deleted), `bootstrap.ps1`, `README.md`, `MACHINE-SETUP.md`.
Expected behaviour: this machine installs `pilot@pilot` by the same pasted prompt a friend uses; once the plugin is installed and a run has been driven through the deck on it, `~/environment/claude` deletes every file the plugin now provides, keeping `CLAUDE.md`, `settings.json` and the machine docs. `bootstrap.ps1` stops copying agents, skills, rules and hooks and instead points at the install prompt.
Verification: `claude --agent pilot:pilot` starting from the plugin with `~/environment/claude/agents/` gone; `node --test` in the pilot repo still green; one full slice loop driven on this machine afterwards.
Evidence: the deletion PR in `~/environment` beside a screenshot of a pilot run using the plugin-provided agents; `bootstrap.ps1` on a dry run reporting that it copies only `CLAUDE.md` and `settings.json`.
Prohibited: no deletion before the plugin is installed and verified working on this machine — `~/environment` is the user's live configuration and the machine must keep working between slices; no deleting `CLAUDE.md` or `settings.json`; no deleting anything the plugin does not actually provide; no force-push to `~/environment`'s `main`.
Completion: the pilot runs on this machine from the plugin alone, with `~/environment/claude` holding only personal configuration, and a slice loop completed after the deletion.

## 8. Acceptance evidence

On the preview the user will watch a friend's machine — or a clean Windows
profile — go from nothing to a working pilot by pasting one prompt, then watch a
real feature run where every question, walkthrough and sign-off appears as a
thread on one deck at `http://127.0.0.1:4321`, the home screen shows the
`Slice | State | Yours` table filling in as slices land, a reply typed in the
browser reaches the pilot without the pilot polling, and the whole thing runs with
neither ECC nor mattpocock-skills installed. They will also watch a subagent cross 35% and then 40% of its context window, be told once at each, and stash and hand off rather than carry on degraded. Then the same install is run on this
machine and `~/environment/claude` is emptied of everything the plugin provides,
with a slice loop completed afterwards to prove the machine still works.

## 9. Status table

| Slice | State | Branch | PR | Worktree |
| --- | --- | --- | --- | --- |
| 1 Walking skeleton | Gate 2 pending: draft PR #1 at `d7ecbac`, 62 tests, all review findings fixed and mutant-checked, `.gitattributes` added, lockfile corrected; real-Chrome round trip driven by the QA agent (screenshots in `%LOCALAPPDATA%\Temp\claude\shots\`), A5 reconfirmed and shown to expand to the worktree; walkthrough handed to the user 2026-09-13 | `slice/1-walking-skeleton` | #1 | `~/Projects/pilot-s1` |
| 2 Deck daemon, many runs | planned | — | — | — |
| 3 Threads | planned | — | — | — |
| 4 Status table home screen | planned | — | — | — |
| 5 Wake-up path | planned | — | — | — |
| 6 Pilot agents on the plugin | planned | — | — | — |
| 7 Methodology skills vendored | in QA (Sonnet, one child): draft PR #3 at `fc6a1a3`, 60 tests, 14 files vendored with provenance, 103 adapted lines of 861; all eight invoked live via `claude --plugin-dir`; pilot verified header placement, preserved reasoning, LF endings and naming. Accepted departure: `wizard/template.sh` and `hitl-loop.template.sh` not vendored (a shell script cannot post over MCP; a literal port would be a second inbox against ADR 0004). Lesson for slice 8: upstream is CRLF, so frontmatter detection must strip `
` or the header lands above the YAML and nothing loads. Principles review (Sonnet) live | `slice/7-methodology-skills` | #3 | `~/Projects/pilot-s7` |
| 8 Toolbox vendored | in QA (Sonnet, one child): draft PR #4 at `1a8d803`, 59 tests, 137 files vendored with provenance (121 rules files byte-identical modulo header, pilot-verified on three), `tdd-workflow` 583 → 142, all ten agents and six skills load live via `--plugin-dir`; `pilot:security-reviewer` run live found a real CRITICAL in the slice's own adaptation (`docs-lookup` holding `Read`/`Grep` beside `WebFetch`), fixed by dropping the filesystem tools — accepted. Principles review: 1 blocking (`docs-lookup` still declared the Context7 tools as primary although the package declares no such server — the pilot's earlier keep-the-names decision reversed; `WebFetch` is the stated primary, Context7 names removed), 2 nits; `tdd-workflow` cut and the six reviewers' report shape confirmed against the implementer's table | `slice/8-toolbox` | #4 | `~/Projects/pilot-s8` |
| 9 Statusline, alert, cost | Gate 2 pending: draft PR #2 at `3940e0a`, 120 tests; the three review fixes landed (CRLF-safe test, pure `buildReport`, `computePercentage` tests); `/pilot:cost` proven addressable and the PostToolUse hook registered from a `--plugin-dir` load; the settings merge run once against the real `settings.json` declined correctly (hash unchanged, no backup written — pilot verified); walkthrough handed to the user 2026-09-13 behind slice 1's. Open for the user: whether to add a `claude-fable-5-1` rate | `slice/9-statusline-alert-cost` | #2 | `~/Projects/pilot-s9` |
| 10 Install prompt and provenance | planned | — | — | — |
| 12 Context-size guard and handoff | planned | — | — | — |
| 11 Dogfood in `~/environment` | planned | — | — | — |
