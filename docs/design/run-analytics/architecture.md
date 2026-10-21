# Run analytics: tokens, tool calls and cost per agent and per slice in the closing report

Slug `run-analytics` · integration branch `feat/run-analytics` · base `origin/main` at 88059a2
(thread ownership, #152, already merged) · no migrations, no database.

## 1. Problem

A piloted run ends with a closing report that says what was built and what cost agents time
(the friction rows), but not what the run cost. The user cannot see which agent or which slice
used the tokens. So they cannot tell an expensive slice from a cheap one, or judge whether a
model choice was worth it. The data already exists: every assistant message in the run's
transcripts under `~/.claude/projects` carries a `usage` field. The user's words: "analytics — a
section of the closing report with tokens and tool calls per agent and per slice, cost per
slice, beside the friction rows, from the ~/.claude/projects transcripts".

## 2. Spec

Agreed by the user on `itm_953b532c2a8d`, 2026-09-27: lines 1–9 as below, with A2, A3 and A5 standing as assumed.

| # | Behaviour | Evidence | Note |
|---|---|---|---|
| 1 | `pilot analytics <slug>`, run in the `feat/<slug>` worktree, prints one Markdown section. The pilot puts it in the closing report, just before the friction rows. | The `report` item on the deck shows the section. | *assumed* (the command is the pilot's) |
| 2 | One row per agent: role, spawn description, model, input, cache-write, cache-read and output tokens, tool calls and active duration. The pilot's own sessions make one `pilot` row. | Sum one agent's transcript by hand, counting each `message.id` once. The total matches that agent's row. | draft, sharpened |
| 3 | One row per slice (`S1`…`Sn` from `run.json`), plus `design`, `feature`, `pilot` and `unattributed` rows. Each sums the agents attributed to it. | The slice rows add up to the same totals as the agent rows. On thread-ownership, every implementer and its reviewer land on their own slice. | draft, sharpened |
| 4 | A cost column for each agent and slice, from a price table the user edits. The table is per model, in dollars per million tokens: input, output, cache write (5 minutes), cache write (1 hour) and cache read. | Edit one model's price and rerun. Only that model's cells change. | draft; location locked (L6) |
| 5 | A model the table has no price for shows `no price` in its cells, and the footer names it. It is never costed at zero. | A fixture uses a model the table does not list. | implied |
| 6 | The run covers every session that called `deck_status` with this slug, including across `/clear` hand-offs. An agent resumed in the next session stays one agent. | On thread-ownership, sessions 85506263 and 13d2896f give one row for agent `a0824c72…`, not two. | implied |
| 7 | Only numbers, ids, model names and the pilot's own spawn descriptions reach the output. No prompt or tool text does. | A fixture's prompt holds a planted token that never appears in the output. The posted report passes the deck's credential scan. | implied |
| 8 | A transcript line that does not parse is skipped and counted. It is never fatal. | A fixture ends with half a JSON line. The footer reads `skipped 1 line`. | implied |
| 9 | One transcript reader module, `deck/transcripts.mjs`, owned by this run. Usage telemetry imports it later. | One module with one importer (`deck/analytics.mjs`) in this run, and two once telemetry lands. | draft (L2) |
| 10 | Usage Claude Code counted for the run's sessions and no transcript holds is shown as `not in transcripts` rows, one per model, so the table reconciles to Claude Code's own total. It belongs to no agent and no slice. | On thread-ownership the table total is within 1% of `cost-state`'s $109.43 at the default prices, where without the rows it was $85.29. | added after S3 (L7) |

Cannot mean here: "the account's model prices". On a subscription there is no per-token price.
So the cost column is what the run would cost at the list prices in the table: an
API-equivalent figure, and the footer says so (A2).

## 3. Findings

**Where a run's transcripts are** (read on this machine, 2026-09-27; shapes only):

- The pilot's session is at `~/.claude/projects/<cwd with every non-alphanumeric as '-'>/<session>.jsonl`.
  Both `C--Users-Hazzard-projects-pilot…` and `…-Projects-pilot…` exist, so the directory is
  matched case-insensitively. Worktree directories (`…-Projects-pilot-s1`) exist only for sessions
  *started* in a worktree.
- Subagents are at `<session>/subagents/agent-<id>.jsonl`, next to a `agent-<id>.meta.json` file that
  holds `{agentType, description, toolUseId, parentAgentId?, spawnDepth, model}`. An agent that works in a
  worktree is still stored under the pilot's session, and its entries' `cwd`/`gitBranch` still read
  the repository and `main`. Those two fields cannot place an agent in a slice.
- **Streaming duplicates.** An assistant message is written as one entry per content block. One
  sample had 170 entries for 82 `message.id`s. `input_tokens` and the cache fields repeat, and
  `output_tokens` grows until the last entry. Adding up every entry roughly doubles the input.
  The rule: group by `message.id`, and keep the entry with the largest `output_tokens`.
- `usage` carries `input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`,
  `output_tokens`, and `cache_creation.{ephemeral_5m_input_tokens, ephemeral_1h_input_tokens}`. It
  also carries `server_tool_use`, `iterations`, `service_tier` and `speed`, which this design ignores.
- **Hand-off.** After `/clear`, a resumed agent keeps its `agentId`. It writes a *new* file under the
  new session. That file's meta is reduced to `general-purpose` with no description, and none of its
  message ids appear in the first file. An agent is keyed by `agentId` across sessions, and its role
  comes from the earliest meta that carries a description.
- **Run membership.** The pilot's main transcripts contain `mcp__plugin_pilot_deck__deck_status` tool
  uses with `input.slug`. On thread-ownership they pick out exactly its two sessions.
- **A cross-check already exists.** Each main transcript ends with a `cost-state` entry. It holds
  `totalCostUSD` and `modelUsage[model].{inputTokens, outputTokens, cacheReadInputTokens,
  cacheCreationInputTokens, costUSD}` for the whole session, subagents included. That is Claude
  Code's own pricing, per session and never per slice.
- **Slice attribution works on a real run** (prototype over thread-ownership's 31 agent files). Each
  agent's first user message is the pilot's brief. For every implementer and its reviewer, the brief
  names the slice's `worktree` or `branch` from `docs/design/thread-ownership/run.json`, and so do the
  architect (`design/<slug>`) and QA and the fundamentalist (`feat/<slug>`). A slice brief also names
  the feature branch, so the most specific match wins. A reviewer with no match inherits its match
  through `parentAgentId`. Two explorers were genuinely unattributable.

**What the design leans on:**

- `hooks/lib/transcript-tail.js` is the only transcript reader today. It is CommonJS, reads only the tail
  and has no dedupe, because it serves a hook that must stay a bare `node <path>`. It is not the shared
  reader and is left as it is.
- `deck/usage.mjs` reads the status line's file, not transcripts. Its "every field checked, nothing
  throws, missing is `null`" stance is the pattern the reader follows.
- `bin/pilot.mjs` dispatches subcommands to one module each (`pilot integrate` → `scripts/integrate.mjs`,
  `pilot audit` → `deck/audit.mjs`). `pilot analytics` follows the same pattern.
- The record is the `run.json` mirror in the `feat/<slug>` worktree (ADR 0028), which `pilot integrate`
  commits at every integration. Rows carry `slice`, `branch` and `worktree`.
- The closing report is the pilot's prose in a `report` item (`skills/pilot/SKILL.md` §"Ending a run").
  `scripts/test/pilot-agents.test.mjs:990` pins that it names the friction rows.
- `deck/store.mjs:126` runs the credential scan on every item string. The posted report passes through it.
- Thread ownership (`88059a2`) moved item ownership and hooks, and nothing this design reads. Your local
  `main` is stale at `4481167`, so branch from `origin/main`.

## 4. Ubiquitous language

- **Transcript**: one JSONL file under `~/.claude/projects`, either a session's or `subagents/agent-<id>`.
- **Message**: one `message.id`, however many entries it was streamed across. Tokens are counted once per message.
- **Agent usage**: one `agentId`'s messages across every session of the run, with its role, model, tool calls and duration.
- **Bucket**: where an agent's usage is counted: a slice (`S<n>`), `design`, `feature`, `pilot` or `unattributed`.
- **Needle**: a string from `run.json` (a slice's branch or worktree) that is looked for in an agent's brief to choose its bucket.
- **Price table**: dollars per million tokens by model and token kind. It gives an API-equivalent cost, never a bill.

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
|---|---|---|---|
| L1 | Grilling depth: **forks**. Only decisions whose paths lead to materially different deliverables are asked. The rest are assumed and listed at Gate 1. | Answered by the user on `itm_1082ce7104b1`, 2026-09-27. | *every*, *none* |
| L2 | **This run owns the shared transcript reader.** It is `deck/transcripts.mjs` (ESM). Usage telemetry imports it later. | The brief says so: the agreed order is thread ownership, then analytics, then usage telemetry. | Growing `hooks/lib/transcript-tail.js`, which must stay dependency-free CommonJS for a hook on every tool call. |
| L3 | **Count each message once**, by `message.id`, keeping the entry with the largest `output_tokens`. | §3 streaming duplicates: summing every entry doubles the input and cache tokens. | Counting by `requestId` (identical here, but `message.id` is the field that holds `usage`). Counting only entries with `stop_reason`, which is not always present on split entries. |
| L4 | **An agent is its `agentId`** across sessions. Its role is the earliest meta that has a description. | §3 hand-off: a resumed agent writes a second file with reduced meta. | Treating one file as one agent, which splits a resumed QA into two rows with the second marked `general-purpose`. |
| L5 | **The reader never returns prompt or tool text.** Attribution passes *needles* in and gets back the needles that matched. | Transcripts contain secrets. With this, spec 7 holds by construction and not by care. | Returning the brief text for the caller to search. |
| L6 | **The price table is a per-user file with shipped defaults** (A1 as written). `~/.claude/pilot/prices.json` overrides, per model, the defaults in `deck/prices.json`. | Answered by the user on `itm_3d47eb1a01f8`, 2026-09-27. One edit applies to every repository and survives a plugin update. The file is outside any repository, so tracking it in `~/environment` is the user's to do. | A tracked file per repository (a price change once per repository). Plugin only (a release per price change). |
| L7 | **The table reconciles to Claude Code's own count** with `not in transcripts` rows, per model: `cost-state`'s count minus the transcripts', signed, priced at the table's prices. | Answered by the user on `itm_7d63e585a19e`, 2026-09-27. S3 found a 22% gap on thread-ownership ($85.29 against $109.43). It is tokens, not prices: the pilot's model matches to the cent, and the subagents' models are short by usage no transcript file holds. What produced that usage is not known. A2's "within a few percent" did not hold. | Footer only (slice costs silently sum to less than the run). Holding the feature to investigate (may not be answerable from local files). |
| L8 | **The machinery lands without the report.** The closing report gets no analytics section; usage analytics is the housekeeping audit's. Spec 1 is now the command alone, and S4's sentence in `skills/pilot/SKILL.md` with its test is reverted (the version stays 0.8.0, a command was added). Wiring the reader and the command into the audit is handed to the usage telemetry ticket, `itm_c580ed079f41`. A3 is withdrawn. | Answered by the user on `itm_c51158cc22b4` and `itm_197e592989b4`, 2026-09-27, after QA found that Claude Code writes `cost-state` only when a session ends, so the session that writes the closing report can never be reconciled (spec 10 holds on finished sessions only). The user's words: "we can leave usage analytics to the house-keeping "audit" agent. whatever machinery you built for the usage analytics can be thrown into one of the existing tickets so that it can be integrated." | Parking the branch unmerged. Keeping the report section with an "unknown" footer. Reconciling session by session. |
| L9 | **No version bump in this PR.** The version stays 0.7.3, as on main; A8 is withdrawn. | Answered by the user on itm_b9b308c1d5a7, 2026-09-27: "i want you to not bump the version before we merge - stays at what it was before the pr." | 0.8.0 for the added command (A8). |

Gate 2: the user on itm_b9b308c1d5a7, 2026-09-27, "okay feel free to merge when you are done." They looked at the output and did not run the procedure's steps.

## 6. Assumed decisions

A1 was the one fork and is now locked as L6. The others are recorded here and decided, under L1.

| # | Default taken | Tradeoff |
|---|---|---|
| A1 | **Locked as L6.** The price table has tracked defaults in `deck/prices.json`. `<store>/prices.json` (`~/.claude/pilot/prices.json`, or `PILOT_DECK_DIR`) overrides per model when it exists, and the footer names the file each price came from. | The plugin runs from a versioned cache copy (`~/.claude/plugins/cache/pilot/pilot/0.7.2`), so a file tracked only in the plugin cannot be edited without a release. The override is a second place to look. The alternative, tracked only, means "edit a price" needs a version bump. |
| A2 | Cost is **API-equivalent at the table's prices**. The footer says so and prints Claude Code's own `cost-state` total for the same sessions beside it. | On a subscription there is no per-token price. The figure compares slices and models against each other. It is not a bill. |
| A3 | The pilot runs `pilot analytics <slug>` in `feat/<slug>` and pastes the output into the report body just before the friction section. | Nothing automatic writes into the report. That matches how the report is already the pilot's prose. |
| A4 | A run's sessions are the main transcripts that hold a `deck_status` call with `input.slug === <slug>`. | A session that spawned agents before its first `deck_status` with that slug is missed. On thread-ownership it was not. |
| A5 | **Bucket rule.** An agent's bucket comes from its earliest brief. A slice needle beats `design/<slug>`, which beats `feat/<slug>` and the feature worktree. An agent with no match takes its parent's bucket. Otherwise it goes to `unattributed`. The pilot's own sessions go to `pilot`. | An explorer spawned about a slice without naming its worktree lands in `unattributed`. The row is shown, not hidden. |
| A6 | **Duration** is the sum, over the agent's files, of the last timestamp minus the first. A slice's duration is the sum of its agents' durations (agent-time). The pilot row's figure includes idle time waiting on the user, and is labelled "wall span". | Wall-clock time per slice would double-count parallel agents. |
| A7 | A **tool call** is one unique `tool_use` id in the agent's assistant content. | Tool uses on duplicate stream entries are not counted twice. |
| A8 | The version goes **0.7.3 → 0.8.0** (a new subcommand), in `package.json`, `package-lock.json`, `.claude-plugin/plugin.json` and `deck/client.mjs:406`, carried by S4. | Minor rather than patch, because a command is added. |
| A9 | The record source is the `run.json` mirror in the cwd. The repository whose transcripts are read is the main checkout, from `git rev-parse --git-common-dir`. | The mirror can lag the store by one move. It is committed at every integration and at hand-off. |
| A10 | **No database and no migrations.** QA runs none. | Nothing here is stored; the command reads files and prints. |

## 7. Out of scope

- Charts, a deck tab, alerts (the user's word).
- Live or in-run figures. The command reads finished transcripts when asked.
- Changing `hooks/lib/transcript-tail.js` or the status line.
- Usage telemetry itself. It is the next run and only imports L2's reader.
- Per-slice figures for the pilot's own tokens. The pilot row is one bucket.
- Split runs (`<slug>#<n>`) beyond what `run.json` for that slug already gives.

## 8. Slices

Every slice runs its own tests and then `npm test` at its gate. The first three share
`deck/analytics.mjs`, so they run in order. S4 owns only prose and version files. It can run
beside S2 and S3 once S1 is integrated.

| Slice | Title | Spec | Files owned | After | File |
|---|---|---|---|---|---|
| S1 | Walking skeleton: `pilot analytics <slug>` prints one row per agent, counted once | 1 (command), 2, 6, 7, 8, 9 | `deck/transcripts.mjs` (new), `deck/analytics.mjs` (new), `bin/pilot.mjs`, `deck/test/transcripts.test.mjs` (new), `deck/test/analytics.test.mjs` (new), `deck/test/fixtures/transcripts/` (new) | – | [S1](slices/S1.md) |
| S2 | Each agent lands in its slice, and the slice rows add up | 3 | `deck/analytics.mjs`, `deck/test/analytics-buckets.test.mjs` (new), `deck/test/fixtures/transcripts/` | S1 | [S2](slices/S2.md) |
| S3 | Cost per agent and per slice from an editable price table | 4, 5 | `deck/prices.json` (new), `deck/analytics.mjs`, `deck/test/analytics-cost.test.mjs` (new) | S2 | [S3](slices/S3.md) |
| S4 | *Withdrawn (L8, L9).* The pilot puts the section in its closing report, version 0.8.0 | 1 (report), 7 (scan) | `skills/pilot/SKILL.md`, `scripts/test/pilot-agents.test.mjs`, `package.json`, `package-lock.json`, `.claude-plugin/plugin.json`, `deck/client.mjs` | S1 | [S4](slices/S4.md) |
| S5 | Usage Claude Code counted and no transcript holds gets its own row | 10 | `deck/analytics.mjs`, `deck/transcripts.mjs`, `deck/test/analytics-unrecorded.test.mjs` (new), `deck/test/fixtures/transcripts/` | S3 | [S5](slices/S5.md) |

S1 is the largest, at about 350 changed lines with fixtures, because the reader cannot be tested
without a caller that shows its rows. S2 and S3 each stay under about 200 lines, and S4 under 60.

## 9. Acceptance evidence, in the order the user meets it

1. The closing report item on the deck has an "Analytics" section just before "make agents cheaper
   here". (spec 1)
2. Its agent table has one row per crew agent and one `pilot` row. A resumed QA agent is one row.
   (spec 2, 6)
3. Its slice table has S1…Sn, `design`, `feature`, `pilot` and `unattributed`. The totals row
   equals the agent table's. (spec 3)
4. Each slice has a cost. The footer names the price file and gives Claude Code's own
   `cost-state` total beside the table's total. (spec 4, A2)
5. Edit one price in `~/.claude/pilot/prices.json` and rerun: only that model's cells move. (spec 4)
6. The footer lists any unpriced model and any skipped lines. No brief text appears anywhere.
   (spec 5, 7, 8)
7. By hand, running `pilot analytics thread-ownership` in the repository matches a hand sum over one
   implementer's transcript, deduped by `message.id`. (spec 2)

## 10. Status

| Slice | State | Branch | PR | Worktree | Blocker | Spec |
|---|---|---|---|---|---|---|
| S1 | integrated | `slice/run-analytics-s1` | #160 | | – | 1, 2, 6, 7, 8, 9 |
| S2 | integrated | `slice/run-analytics-s2` | #162 | | S1 | 3 |
| S3 | integrated | `slice/run-analytics-s3` | #163 | | S2 | 4, 5 |
| S4 | integrated, then withdrawn (#161) | `slice/run-analytics-s4` | #161 | | S1 | 1, 7 |
| S5 | integrated, added after S3 ([S5](slices/S5.md)) | `slice/run-analytics-s5` | #164 | | S3 | 10 |

Withdrawn at L8: spec 1's report half (the section in the closing report) and §9's evidence 1. Spec 7's
credential-scan evidence stands on the fixture test alone.
| feature | ready, PR #159 | `feat/run-analytics` | #159 | | S1–S5 | 1–10 |
