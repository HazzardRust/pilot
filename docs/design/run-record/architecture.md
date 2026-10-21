# Run record — architecture artefact

Feature: **run record** · slug `run-record` · integration branch `feat/run-record` ·
base `main` at `79ce2eb` · architect branch `design/run-record`.

## 1. Problem

The deck and the plugin grew a feature at a time, and four things grate in daily
use (the user's `to-do now.md`): a thread does not say which agent wrote a
message; a run's state is scattered across a prose artefact, a free-text slice
table and a prose hand-off file the pilot has to remember to write; the README
never says what the human's part in this system is; and on a long walkthrough
the reply box is a page away from the step being answered. The last run also left
a close button the user asked for twice, two spellings to fold into one, and a
security note the user has since dropped (L14).

## 2. Spec

Each line is one behaviour a user can watch, with the evidence that shows it.
Line 6 (a deck token) was dropped by the user's scope answer (itm_8b3b3bee2d67, 2026-09-23); the numbering is kept so nothing that cites a line moves.

| # | Behaviour | Evidence |
| --- | --- | --- |
| 1 | Every crew message on a thread (the item's own post and every reply) carries a byline naming the kind that wrote it: pilot, architect, implementer, fundamentalist, qa, teacher, explorer, or other. Each kind has its own colour. The user's own messages still read "you". | A QA reply reads `qa` in QA's colour, a teacher's reply reads `teacher`, and the pilot's reads `pilot`, all seen in a real browser. |
| 2 | The kind comes from the tool call's hook payload and never from anything the agent wrote. | The pilot posts a `deck_reply` whose body says "from QA", and it reads `pilot`. A call that names an author of its own is overwritten. There is a test for each. |
| 3 | After `/clear`, a fresh pilot session in the same directory is handed the run's record and nothing written by hand. The record holds the feature, slug, integration branch, artefact path, each slice's state, branch, worktree and PR, the kept and dropped findings, the next move, and the open thread ids. | A fresh session's first message states the run's position. No prose hand-off file exists. The injected block is shown in the session. |
| 4 | README names the three human steps in order, and where each is enforced: spec design (Gate 1 sign-off), quality assurance (Gate 2 walkthrough), and code review (mostly AI; the plugin stops before merge, and the user may ask for an autonomous merge). | The section exists, and a test in `scripts/test/install.test.mjs` pins it. |
| 5 | On a thread page the reply box sticks to the bottom of the viewport while the thread runs past it, and sits in flow at the end. | On a long walkthrough scrolled to a middle step, the reply box is visible. At the page bottom it covers nothing, which is measured in a browser. |
| 6 | *Dropped by the user.* A deck token on `/api/*`. See L14. | — |
| 7 | An open `question` thread has a Close button. Pressing it closes the thread and hands the pilot a user message `Closed.` through `deck_read`/`deck_wait`, like any reply. | Press Close. The thread reads closed, and a parked `deck_wait` returns `Closed.` on that item. |
| 8 | "The same directory" has one definition per side of the L35 line, and so does "a closed thread". | No behaviour change. Callers use `repoKey`/`samePath` and `isOpen`/`isClosed`, and one test proves both sides agree on a set of paths. |
| 9 | A subagent's context notice never triggers `pilot run`'s `/clear` and never reaches the SessionStart lane. Only the pilot's own hand-off does either. | A crew agent crossing its hard mark posts an item that `pilot run` ignores and the next SessionStart does not inject. Tests red then green in `deck/test/run.test.mjs` and `hooks/test/session-handoff.test.js`. |
| 10 | The run record is mirrored into the repository as `docs/design/<slug>/run.json` on `feat/<slug>`, at each slice integration and at hand-off. The deck store is canonical, and the mirror is a snapshot. | After S1 is integrated, the file on `feat/run-record` is byte-identical to the record `deck_status` returned, and `git log` shows it committed at that integration. |
| 11 | The daemon refuses a `spec` or `signoff` item for a run while that run (same directory) has any open `question`, and the refusal names the open ids. `spec` is a new kind for the numbered spec, rendered as the list with the agree / agree with edits / Teach me options a question has. | A test in `deck/test` posts a `spec` with a question open and is refused with the question's id, then succeeds once it is resolved. The pilot SKILL's steps 1 and 3 name the kind. Asked by the user on itm_4073564252ff, 2026-09-23. |
| 12 | `install-settings.mjs --repair` refuses to point the user's status lines at a `CLAUDE_PLUGIN_ROOT` that is not inside the plugin cache (`~/.claude/plugins/cache/`, resolved with the same one-spelling `repoKey` idea: compare resolved, case-folded on win32, paths); it exits 0 with one line on stderr saying why, and changes nothing. A root inside the cache repairs as before. Added by the user at Gate-1-approved scope's edge after this run exposed the flaw (itm_5f894bfa98dd, 2026-09-23). | A test in `scripts/test/install.test.mjs` fails before the guard and passes after, for both the outside-cache refusal and the inside-cache repair; the two existing `--repair` behaviours are unchanged. |

## 3. Findings

| Area | What exists | Anchor |
| --- | --- | --- |
| Message author | `from` is `'user'` or `'pilot'`, hard-coded. `WHO` maps `pilot` to "the pilot". | `deck/store.mjs:459,475,524`, `deck/ui/render.mjs:98-108` |
| Tool input | `deck_post`/`deck_reply` schemas are `additionalProperties: false` and carry no identity. The stdio client adds `repo`/`run` on the way out. One stdio client serves the main session *and* its subagents, so the client cannot tell them apart. | `deck/tools.mjs:105-223`, `deck/client.mjs:168-192` |
| Hook payload | Subagent calls carry `agent_id` and `agent_type`. A main session started with `--agent` carries `agent_type` (`pilot:pilot`) and **no `agent_id`**. The docs say so, and the roster header (`hooks/agent-roster.js:17-18`) is wrong for `--agent` sessions. | code.claude.com/docs/en/hooks, "agent_type … Present when the session uses --agent" |
| updatedInput | The installed CLI (2.1.280) has `hookSpecificOutput.updatedInput`, "Modified tool input (PreToolUse only)". It replaces the input, falls back to the original when empty, and is **validated against the tool's schema** ("updatedInput … failed schema validation"). Whether it is honoured without `permissionDecision` is unconfirmed. | strings in `~/.local/bin/claude.exe` |
| Hooks today | One PreToolUse (gateguard, Edit/Write) and one PostToolUse dispatcher (`post-tool.js`, lanes). | `hooks/hooks.json` |
| Run state | A run row is `id, repo, name, pid, startedAt, lastSeenAt, feature, slices[], dismissedAt`, keyed to the session. Dead runs leave the file. Slice rows are `slice, state, after, delivers` only (`ROW_FIELDS`), and `setSlices` replaces the whole table. | `deck/runs.mjs:129-213`, `deck/status.mjs:65`, `deck/store.mjs:776-827` |
| Hand-off | At the hard mark the pilot refreshes its table, writes a prose file, and posts a `handoff` item whose body indexes the file and the thread ids. `session-handoff.js` injects that body once on any SessionStart (it does not read `source`). `pilot run` types `/clear` when the item appears. | `skills/pilot/SKILL.md:470-497`, `hooks/session-handoff.js:21-25,112-158`, `deck/run.mjs:254-291` |
| Browser threats | Already closed: `isOwnHost` on every route (DNS rebinding), an Origin check on every write, and a content-type check. | `deck/server.mjs:9-10,212,257-280` |
| Daemon callers | The stdio client (`/api/health`, `/api/runs`, `/api/tool`), hooks via `hooks/lib/deck.js:143-169` (`/api/health`, `/api/agents`, `/api/runs`, `/api/tool`), `pilot run` (`deck/run.mjs:218,304,315`), and the page (form POSTs, `/events`). | sweep |
| Close | `reopenItem` (the user) pushes a `seq`'d user message. `dismissItem` closes unknown kinds only, with no `seq`. `markDelivered` skips closed items. | `deck/store.mjs:516-576,633-660` |
| Sticky idiom | The thread header is already `position: sticky` with a Canvas background. | `deck/ui/deck.css:97-104` |
| Crew hand-off | When a **subagent** crosses 35%, `announce()` posts `kind: 'handoff'`. `pilot run` types `/clear` on any open `handoff` in the cwd, and `session-handoff.js` injects any open `handoff`. So a child's notice clears the pilot. This happened on this run, when the architect's Explore child crossed 35%. | `hooks/context-size-guard.js:485-506`, `deck/run.mjs:72,257`, `hooks/session-handoff.js:46,115` |
| Spellings | "Same directory" has four spellings: `samePath` in `deck/run.mjs:121` and in `hooks/lib/deck.js:185`, `repoKey`/`sameRepo` in `deck/runs.mjs:109-125`, and `joinKey` in `deck/status.mjs:105-107`, which lower-cases on every OS. "Closed" is `isOpen` (`deck/items.mjs:270`) plus raw `.resolvedAt` in `deck/run.mjs:259`, `hooks/context-usage-statusline.js:65`, `hooks/session-handoff.js:117` and `hooks/stop-gate.js:112,124`. | grep |
| README | Sections Install, Use, Layout, Built on, Licence. Pinned by `scripts/test/install.test.mjs:684-730`. Merge is already out of scope in `skills/pilot/SKILL.md:369-374`. | |
| Storage | No database. **The migrations question is N/A.** `deck.json` is `STORE_VERSION 1`, and new fields are read as absent. | `deck/store.mjs:59-60` |

## 4. Ubiquitous language

- **Author**: the kind of agent that made a tool call, derived by the plugin from the hook payload. It is one of `pilot, architect, implementer, fundamentalist, qa, teacher, explorer, other`. It is never what a message says about itself.
- **Run record**: the durable, structured state of one feature in one directory, keyed by `repoKey(repo)` + slug. It outlives any session. It is distinct from a **run**, which is one session's registration.
- **Mirror**: `docs/design/<slug>/run.json`, the record as `deck_status` last returned it, committed by the pilot on `feat/<slug>`. The deck store wins when they disagree.
- **Next move**: the one line in the record saying what the pilot was in the middle of. It replaces the prose hand-off file.
- **Spec item**: an item of kind `spec` whose body is the numbered spec of §2, the one item Gate 1's grilling starts from. It cannot go up while a question is open, and neither can a `signoff`.
- **Close** (user): the user ends a question thread from the page. **Resolve** is the pilot's, and **Dismiss** is for a kind the deck does not know.

## 5. Locked decisions

| L | Decision | Rationale | Rejected |
| --- | --- | --- | --- |
| L1 | The author is stamped by a **PreToolUse hook** matched on `mcp__plugin_pilot_deck__deck_(post\|reply\|resolve)`. It returns `updatedInput` = the tool input plus `author: <raw agent_type or "">`. | This is the user's asked-for route. It is the only point where the call and its caller are both known, and the stdio client serves every agent of the session. | A PostToolUse lane keyed by item id: two writes per message, and a window where the message reads unattributed. It is the fallback only if S1 proves updatedInput is dropped for MCP tools. The agent declaring itself: the user's last resort. |
| L2 | `author` is a declared optional property in the schema ("set by the plugin; any value you give is replaced"), because updatedInput is schema-validated. The hook **always** writes it, including `""` for a call with no `agent_type`. | A model-supplied value never survives the hook. | Keeping it off the schema, which fails validation and drops the call. |
| L3 | The daemon maps the raw type to a kind in one function, `authorKind(type)` in `deck/items.mjs`. It strips `pilot:`, then `pilot-`. `""` and `pilot` both map to `pilot`, a known crew name maps to itself, and anything else maps to `other`. The kind is stored on each message as `author`. | One owner of the kind set, on the daemon's side. The hook stays dumb and CommonJS (L35 of deck-workspace). | Mapping in the hook, which would be a second copy of the set across the L35 line. |
| L4 | Messages stored before this run have no `author` and render as `pilot`, which is what they render as today. The user's own messages keep `from: 'user'` and "you". | This needs no migration, and nothing already stored changes its reading. | A backfill pass over `deck.json`. |
| L5 | `deck_status` is the only write of the run record. It gains top-level `slug`, `branch`, `artefact`, `findings` (≤ 40 lines of `kept: …`/`dropped: …`) and `next` (≤ 400 chars), and each row gains `branch`, `worktree` and `pr` (a positive integer). All are optional, and every cell passes `refuseCredentials`. | The pilot already sends "every row every time". A second tool is a second thing to forget. | A separate `deck_record` tool. |
| L6 | Open thread ids are **derived** at read time from open items whose repo matches. They are not stored. | A stored copy goes stale the moment a thread closes. | Storing them in the record. |
| L7 | The record is handed over by `session-handoff.js` in the same injection as the `handoff` item it already picks up (once, claimed, fenced as saved state). The hook fetches it from a new `GET /api/record?repo=` and reads open items **without** `repo`, filtering by `samePath`, so it marks no reply delivered (deck-workspace deferred item 6). | This reuses the proven SessionStart path and its once-only claim, and `pilot run`'s auto-`/clear` keeps working unchanged. | Injecting the record on every SessionStart, which would push it into every non-pilot session in that directory. |
| L8 | The hand-off shrinks to four steps: `deck_status` with `next`, write and commit the mirror from its result (L20), post the `handoff` item (a title and one line), and tell the user to `/clear`. The prose file step and the body's index are removed from `skills/pilot/SKILL.md`, `agents/pilot.md` and the guard's advice. | Spec 3's evidence is "no prose hand-off". | Keeping the file as belt and braces, which leaves two sources of truth. |
| L9 | The artefact keeps its status table as the plan. The record is the live state, and the SKILL says so. | Writing the artefact on every move means a commit in a worktree for each move. | The artefact as live state, as today. |
| L10 | The reply box's sticking is CSS only: `body[data-item] [data-live="reply"] { position: sticky; bottom: 0; background: Canvas; }` plus a top border. **`deck/ui/deck.js` is not touched.** | It uses the idiom the header already uses, and a live-region swap cannot undo it because the slot itself sticks, not its content. | A scroll listener in `deck.js`, which is 1,481 lines in an IIFE. |
| L11 | Close is drawn on open `question` threads only. **A `signoff` or `walkthrough` never gets Close**, because a gate is passed by the user's explicit word and never by a button that also means "go away". Unknown kinds keep Dismiss. | The gates stay unambiguous. | Close on every thread. |
| L12 | Close is `closeItem(id)` in `deck/store.mjs`: the resolution `Closed by you.`, plus a user message `Closed.` with a `seq`, in one write, so `deck_wait` and the stop gate see it as the user's answer. | It mirrors `reopenItem`, and one write means no half state. | Leaving out the `seq`, which the pilot would never hear. |
| L13 | Spec 8 keeps **one spelling per side of L35** (the ESM daemon side in `deck/runs.mjs` and `deck/items.mjs`, and the CJS side in `hooks/lib/deck.js`), plus a join test proving they agree. `deck/run.mjs` imports from `runs.mjs`/`items.mjs`, which are daemon-side pure modules and not a hook. `status.mjs` `joinKey` uses `repoKey`. | This is what deck-workspace S1 was dropped for (overturning L35). One spelling per side is the reachable minimum. | One spelling across both sides. |
| L14 | **Token dropped.** No deck token, machine-wide or per-run. Deferred item 1 of deck-workspace is closed as not needed. Decided by the user on itm_8b3b3bee2d67, 2026-09-23. | The browser threats are already closed: `isOwnHost` on every route, the Origin check on every write and the content-type check (`deck/server.mjs:9-10,212,257-280`). A token file the user can read cannot stop a process running as the same user, which is the only threat left; it stops only another OS user's process on a shared machine. It would cost about 100 lines across five callers and a stale-token failure after every daemon restart. | A machine-wide token in `~/.claude/pilot/deck.token` sent as `x-deck-token`. A per-run token with `repo` derived from it, which needs a token file per directory for the hooks. |
| L16 | **Fact:** a main session started with `claude --agent pilot:pilot` carries `agent_type` (`pilot:pilot`) and no `agent_id`. A subagent carries both. A main session started with `/pilot:pilot` carries neither. So "no `agent_id`" identifies the pilot, and `authorKind` maps both `""` and `pilot:pilot` to `pilot`. The roster header (`hooks/agent-roster.js:17-18`) is corrected in S1, and its behaviour is right already, because it requires `agent_id`. | Source: code.claude.com/docs/en/hooks, `agent_type`: "Present when the session uses `--agent` or the hook fires inside a subagent. For subagents, the subagent's type takes precedence over the session's `--agent` value." `agent_id`: "Present only when the hook fires inside a subagent call." | Reading "no `agent_type`" as the pilot, which mislabels every `pilot run` session's messages as `other`. |
| L17 | A crew agent's notice is posted as `kind: 'crew-handoff'`, not `handoff`. It is an unknown kind, so it renders plainly and gets Dismiss, as the hand-off does today. `pilot run` and `session-handoff.js` keep matching `handoff` only, and do not change. | This is a one-word cut in the one writer. Both readers are already correct for the pilot's item. | A field the pickup checks (`author`): hook posts go over HTTP and bypass S1's PreToolUse stamp, so they would read as `pilot` under L4. |
| L15 | Structural decisions get ADRs: 0027 (author from the hook, amending the ADR 0024 note on `--agent`), and 0028 (the run record lives in the deck store, mirrored into the repository by the pilot), each written in the slice that lands it. | This is the standing rule. | |
| L18 | **Grilling depth: forks.** Only decisions whose paths produce materially different deliverables reach the deck as items; the rest are recorded here as assumed and read at the Gate 1 signoff, which is the only Gate 1 item. Answered by the user on itm_16a4c99e53f7, 2026-09-23. | The SKILL asks this once per run because no other rule sets the bar. This is a personal project and most of the nine lines are single-path. | *every*: one item per locked decision before the signoff. |
| L19 | **The run record lives in the deck store, and is mirrored into the repository.** Canonical: `deck.json`, a `records` list keyed by `repoKey` + slug, written only by the daemon through `deck_status` (L5). Mirror: `docs/design/<slug>/run.json` on `feat/<slug>`, committed by the pilot at each slice integration (step 5, where it already commits a merge) and at hand-off (L8). The store wins when they disagree. The user answered "both" on itm_17d7935968f4, 2026-09-23; the pilot locked the shape, because ADR 0014 leaves one path: the daemon never writes into the repository, so the pilot writes the mirror. | The store survives `/clear`, restarts and session death (ADR 0006). The mirror survives losing the machine and is readable in the PR. Together they cover both losses. | The store alone: nothing survives the machine. A git-tracked file alone: a commit in some worktree on every move. A per-run file under `~/.claude/pilot/runs/`: a second writer beside the one atomic store. |
| L20 | `deck_status` returns the stored record in its result, as `record`, beside the `deckNumber` and `slices` it returns today. The mirror is exactly `JSON.stringify(record, null, 2)` plus a newline, written with `Write` in the pilot's `feat/<slug>` worktree and committed as `chore(<slug>): run record`. The record carries no thread ids (L6), so the mirror carries none. | The pilot already holds the result of the one call that writes the record, so no new tool, CLI or route is needed, and the mirror is the daemon's normalised record rather than what the pilot sent, which is what makes "matches the deck's record" checkable byte for byte. The cost is a few hundred tokens of JSON in the pilot's context on each `deck_status` call. | A `pilot record` CLI or a `deck_record` tool: a second surface for one read. The pilot writing the mirror from its own input: a snapshot of the request, not of the store. |
| L21 | `spec` is a fourth known kind in `deck/items.mjs` (`KIND_SPEC`), rendered by the same `renderChoices` a `question` and a `signoff` use, so it gets the options the pilot sends plus the deck's own Teach me (D22). The pilot sends `agree` and `agree with edits` as its options. `deck_wait` and the stop gate treat it as they treat a question. | One renderer, one reply path, one new constant. | A `question` with a `spec:` title prefix, which the guard could not tell apart from a question. |
| L22 | **The gate is in the daemon**, in `postItem`: a `spec` or `signoff` whose repository has any open `question` is a `DeckRefusal` naming those ids. It is not a hook. | It holds for every writer, including a session without the plugin's hooks, a subagent and a hand `curl`, and it fails closed with the names of what to answer first. A hook holds only for the session it is installed in. | A PreToolUse hook on `deck_post`. A rule in the SKILL alone, which is what failed on this run. |
| L23 | Close on a question means "go with your recommended default", and the pilot records that default as the answer. Answered by the user on itm_b2f08ccdbcd3, 2026-09-23, as the default proposed. | The thread ends and the decision is made in one click. | "Drop this question", which leaves the decision open for the pilot to ask again or assume. |

## 6. Assumed decisions awaiting the user

| A | Question | Default taken | Tradeoff |
| --- | --- | --- | --- |
| A4 | Colours per kind. | The same hue family in light and dark, from `color-mix` with `currentColor`, like `--quiet`. `other` uses `--quiet`. | The user may want specific colours. That is a one-line change per kind. |

## 7. Out of scope

A global chat. Splitting `deck.js` (it is not touched at all, L10). A per-item
filter on `deck_read`/`deck_wait` (ADR 0020). A record for a pilot that crashed
without posting a hand-off: the record is stored and the tab still shows it, but
nothing is injected automatically. Rendering the record's new fields (branch, PR
and worktree) on the deck's tab. Close on signoff or walkthrough threads (L11).
The roster (`agent-roster.js`) beyond correcting its header comment. The daemon
writing the mirror itself (ADR 0014; the pilot writes it, L19). A deck
token on `/api/*`: dropped by the user, because the host, Origin and
content-type checks already close the browser threats and a token cannot stop a
same-user process (L14).

## 8. Slices

DAG: **S1** → {S2, S4, S5, S9, S10}; {S2, S9} → S3; S2 → S6; {S3, S6} → S7.
S4, S5, S9 and S10 can run beside S2. S9 is small and urgent, because it restarts pilots, so take it first after S1. S10 is a leaf beside it. S7 is last.

Spec 10 (the mirror) has no slice of its own. Its daemon half, `deck_status` returning the record, is about ten lines and lands in S2, which already owns `setSlices` and the tool's schema. Its pilot half is prose in the SKILL and the pilot's definition, which S3 already rewrites, so a slice of its own would own the same sections as S3.

### S1 — A message says who wrote it (walking skeleton)

| Field | |
| --- | --- |
| Source spec | §2 lines 1–2; L1–L4, L15 (ADR 0027) |
| Dependencies | none |
| Files owned | `hooks/deck-author.js` (new), `hooks/hooks.json`, `hooks/agent-roster.js` (header comment only), `hooks/test/deck-author.test.js` (new), `deck/tools.mjs`, `deck/items.mjs`, `deck/store.mjs` (`postItem`, `addPilotMessage`, `resolveItem` take `author`), `deck/server.mjs` (passes `author` through), `deck/ui/render.mjs` (byline), `deck/ui/deck.css` (one custom property per kind), `deck/test/author.test.mjs` (new), `docs/adr/0027-*.md` |
| Expected behaviour | A reply from a QA agent reads `qa` in its colour, the pilot's reads `pilot`, and a message stored before this run reads `pilot`. A body claiming "from QA" does not change the label. |
| Verification | `npm test`. Then, **first and before anything else is built**, a live probe on a local deck: a pilot session with a crew subagent posts and replies, and the stored `author` is read off `deck.json`. That settles whether updatedInput is honoured for MCP tools, with and without `permissionDecision`. |
| Evidence | The probe's stored JSON for both calls. `authorKind` tests red then green for every kind, `""`, and `Explore`. A red-then-green test that a model-supplied `author` is overwritten. A browser screenshot of three bylines. |
| Prohibited | No parsing the body for identity. No `permissionDecision: "allow"` unless the probe shows it is needed, and then name the prompt it bypasses to `main` first. No author inferred in the stdio client. If the probe fails, stop and tell `main` before switching to the PostToolUse lane. |
| Completion | The probe shows the hook's author stored for a subagent call and a main-session call, `npm test` is green, and three bylines are seen in a real browser. |

### S2 — A fresh session is handed the run record

| Field | |
| --- | --- |
| Source spec | §2 lines 3 and 10 (the daemon's half); L5–L7, L15 (ADR 0028), L19, L20 |
| Dependencies | S1 (`store.mjs`, `server.mjs`, `tools.mjs`) |
| Files owned | `deck/status.mjs` (row fields), `deck/runs.mjs` (record shape and validation), `deck/store.mjs` (`records`, `setSlices` upsert, `recordFor`), `deck/server.mjs` (`GET /api/record`), `deck/tools.mjs` (`deck_status` schema), `hooks/lib/deck.js` (`record()`), `hooks/session-handoff.js`, `deck/test/record.test.mjs` (new), `hooks/test/session-handoff.test.js`, `docs/adr/0028-*.md` |
| Expected behaviour | `deck_status` returns the stored record as `record` in its result. A `deck_status` with the new fields followed by a `handoff` item: the next SessionStart in that directory injects the record (feature, slug, branch, artefact, slice rows with branch/worktree/PR, findings, next, open thread ids), once. The record outlives the run that wrote it. |
| Verification | `npm test`. Then `/clear` in a real session on a local deck after a hand-seeded `deck_status` and `handoff`, and read the injected block. |
| Evidence | Tests red then green: `deck_status`'s result carries the record exactly as `GET /api/record` serves it, the record survives the run being swept, the injection carries every field, the thread ids exclude closed ones, and the hook's read marks nothing delivered. The injected block, copied from the fresh session. |
| Prohibited | No stored thread ids (L6). No `deck_read` with `repo` from the hook. No second write tool. No weakening of the fence or the once-only claim. |
| Completion | A fresh session after `/clear` shows the record for its directory, and `npm test` is green. |

### S9 — A crew agent's notice cannot clear the pilot

| Field | |
| --- | --- |
| Source spec | §2 line 9; L17 |
| Dependencies | S1 (DAG root only; there is no file overlap) |
| Files owned | `hooks/context-size-guard.js` (`announce()` kind and its comment), `hooks/test/context-size-guard.test.js`, `deck/test/run.test.mjs`, `hooks/test/session-handoff.test.js` |
| Expected behaviour | A subagent crossing its hard mark posts a `crew-handoff` item that shows on the deck with Dismiss. `pilot run` types nothing, and the next SessionStart injects nothing from it. |
| Verification | `npm test`. |
| Evidence | Tests red then green: the guard posts `crew-handoff`, `pickup` in `deck/run.mjs` skips it, and `pickup` in `session-handoff.js` skips it. |
| Prohibited | No change to `deck/run.mjs` or `session-handoff.js` source. No removal of the notice itself. |
| Completion | The kind is `crew-handoff`, the three tests pass, and `npm test` is green. |

### S10 — The spec and the sign-off wait for open questions

| Field | |
| --- | --- |
| Source spec | §2 line 11; L21, L22 |
| Dependencies | S1 (`deck/items.mjs`, `deck/store.mjs`, `deck/ui/render.mjs`) |
| Files owned | `deck/items.mjs` (`KIND_SPEC`, `KINDS`), `deck/store.mjs` (`postItem` guard), `deck/ui/render.mjs` (renderer map entry), `deck/tools.mjs` (the kinds list in the description is derived; check it reads right), `skills/pilot/SKILL.md` (steps 1 and 3 only), `agents/pilot.md` (the `deck_post` row), `deck/test/spec-gate.test.mjs` (new), `scripts/test/pilot-rules.test.mjs` |
| Expected behaviour | A `deck_post` of kind `spec` or `signoff` while the same directory has an open `question` is refused, and the refusal names every open question's id. Once those are resolved the post succeeds. A `spec` renders as its numbered body with the pilot's options and Teach me. A question in another directory does not block. |
| Verification | `npm test`. Then, on a local deck, post a question, post a spec and read the refusal, resolve the question, post again. |
| Evidence | Tests red then green: the refusal with one and with two open questions, its text naming each id, the success after resolution, the other-directory case, and a `signoff` behaving the same. The SKILL pins for steps 1 and 3. A browser screenshot of a spec item. |
| Prohibited | No hook. No check in the stdio client. No blocking on `walkthrough`, `handoff` or unknown kinds. No change to S3's sections of the SKILL. |
| Completion | The refusal and the success are seen live, and `npm test` is green. |

### S3 — The pilot hands off without prose

| Field | |
| --- | --- |
| Source spec | §2 lines 3 and 10 (the pilot's half); L8, L9, L19, L20 |
| Dependencies | S2, S9 (`context-size-guard.js`) |
| Files owned | `skills/pilot/SKILL.md` (§ "The artefact is the state", § "When your own context fills"), `agents/pilot.md` (hand-off lines), `hooks/context-size-guard.js` (`advice()` text only), `hooks/test/context-size-guard.test.js`, `scripts/test/pilot-rules.test.mjs` |
| Expected behaviour | Step 5 tells the pilot to write `docs/design/<slug>/run.json` from `deck_status`'s result and commit it with the merge. At the hard mark the pilot is told four steps (deck_status with `next`, write and commit the mirror, post the handoff, `/clear`), and nothing about a prompt file. |
| Verification | `npm test`, including new pins that no "prompt file" instruction survives, that the `deck_status` fields are named, and that `run.json` is named at step 5 and in the hand-off. |
| Evidence | The pins red then green. The guard's advice text quoted. |
| Prohibited | No change to the guard's thresholds or its lanes. No step left that points at a file. |
| Completion | No hand-off instruction anywhere names a prose file, step 5 and the hand-off both name the mirror, and `npm test` is green. |

### S4 — README names the human's three steps

| Field | |
| --- | --- |
| Source spec | §2 line 4 |
| Dependencies | S1 (DAG root only; there is no file overlap) |
| Files owned | `README.md`, `scripts/test/install.test.mjs` |
| Expected behaviour | A section "Your part", after Use, lists spec design (Gate 1), QA (Gate 2 walkthrough) and code review (the plugin stops before merge, and an autonomous merge is a standing rule in your `CLAUDE.md`), each naming where it is enforced. |
| Verification | `npm test`. |
| Evidence | The new test red then green. |
| Prohibited | No claim that the plugin merges. No restating of `SKILL.md` beyond one line per step. |
| Completion | The section exists, is pinned, and `npm test` is green. |

### S5 — The reply box stays in reach

| Field | |
| --- | --- |
| Source spec | §2 line 5; L10 |
| Dependencies | S1 (`deck.css`) |
| Files owned | `deck/ui/deck.css`, `deck/test/reply.test.mjs` |
| Expected behaviour | On a long walkthrough the reply box is visible at the bottom while scrolled mid-thread, and at the page end it sits after the last step. |
| Verification | `npm test`. Then, in a browser at 1280×800 on a 15-step walkthrough, measure the reply slot's rect mid-scroll and at the end. |
| Evidence | The declaration test red then green. Two screenshots and the measured rects: the last step's bottom is at or above the slot's top at the end. |
| Prohibited | No edit to `deck/ui/deck.js`. No `position: fixed`. No comment containing "closed" (`deck/test/daemon.test.mjs:498`). |
| Completion | Both states are measured in a real browser, and `npm test` is green. |

### S6 — The user can close a question

| Field | |
| --- | --- |
| Source spec | §2 line 7; L11, L12, L23 |
| Dependencies | S2 (`store.mjs`, `server.mjs`) |
| Files owned | `deck/store.mjs` (`closeItem`), `deck/items.mjs` (`CLOSED_BY_USER`, `CLOSED`), `deck/server.mjs` (`POST /close`), `deck/ui/render.mjs` (the button in the reply slot for open questions), `skills/pilot/SKILL.md` (one line on reading `Closed.`), `deck/test/close.test.mjs` (new) |
| Expected behaviour | An open question shows Close. Pressing it closes the thread, a parked `deck_wait` returns `Closed.`, and Reopen still undoes it. A signoff or walkthrough shows no Close. |
| Verification | `npm test`. Then press Close in a browser while a session waits. |
| Evidence | Tests red then green: the `seq`'d message, the refusal for signoff/walkthrough, and the Origin guard on `/close`. The waiting session's return. |
| Prohibited | No Close on signoff or walkthrough. No confirm dialog. No closing without the `seq`'d message. |
| Completion | Close ends a question and wakes the pilot in a real browser, and `npm test` is green. |

### S7 — One spelling of "same directory" and "closed"

| Field | |
| --- | --- |
| Source spec | §2 line 8; L13 |
| Dependencies | S3, S6 |
| Files owned | `deck/run.mjs`, `deck/runs.mjs`, `deck/status.mjs` (`joinKey`), `deck/items.mjs` (`isClosed` if needed), `hooks/lib/deck.js` (`isClosed`), `hooks/context-usage-statusline.js`, `hooks/session-handoff.js`, `hooks/stop-gate.js`, `hooks/test/join.test.js` (new or extended) |
| Expected behaviour | No visible change. `deck/run.mjs` has no `samePath` of its own, and no hook reads `.resolvedAt` directly. |
| Verification | `npm test`, and `grep -rn "resolvedAt" hooks deck/run.mjs` shows only the definitions. |
| Evidence | The join test (both sides agree on case, trailing slash and drive letter) red then green. The grep output. |
| Prohibited | No import of a hook module into `deck/` or of `deck/` into a hook (L35). No behaviour change beyond `joinKey` becoming case-sensitive on non-Windows. |
| Completion | One spelling per side, the grep is clean, and `npm test` is green. |

### S11 — The repair hook trusts only the plugin cache

| Field | |
| --- | --- |
| Source spec | §2 line 12 |
| Dependencies | none — added at Gate-1-approved scope's edge and lands directly on `feat/run-record` |
| Files owned | `scripts/install-settings.mjs`, `scripts/test/install.test.mjs` |
| Expected behaviour | `--repair` with a `pluginRoot` outside `~/.claude/plugins/cache/` changes nothing and prints one line on stderr; exit code stays 0. A `pluginRoot` inside the cache repairs exactly as it did before this slice. |
| Verification | `npm test` and `node scripts/check-provenance.mjs hooks deck docs agents skills rules lib bin`. |
| Evidence | A RED/GREEN pair in `scripts/test/install.test.mjs` for the outside-cache refusal and the inside-cache repair, plus the pre-existing repair tests still green. |
| Prohibited | No change to the non-repair install path — a deliberate `install`/`installSettings` call is the user's own act and is never guarded. |
| Completion | The guard sits where `repairSettings` decides to write, `npm test` is green, and the provenance gate passes. |

## 9. Acceptance evidence, in the order the user meets it

1. README: a "Your part" section names the three steps and where each is enforced.
2. With a question still open, the pilot's spec item is refused and the refusal names the question. Once it is answered, the spec goes up as a numbered list with agree, agree with edits and Teach me.
3. On a live run, the architect's, QA's and teacher's messages read their kind in their colour, and the pilot's reads `pilot`.
4. The pilot writes "from QA" in a reply, and it still reads `pilot`.
5. On QA's walkthrough, scrolled to step 7 of 15, the reply box is at the bottom of the screen. At the end it sits after the last step.
6. On an open question, press Close. The thread closes, and the pilot's next message acknowledges `Closed.` as your answer.
7. A crew agent crosses its mark: a `crew-handoff` card appears, and the pilot's session is not cleared.
8. After S1 is integrated, `docs/design/run-record/run.json` on `feat/run-record` is byte-identical to the `record` in `deck_status`'s result, and the commit that added it is the integration's.
9. At the pilot's hard mark, type `/clear`. The fresh session states the feature, branch, slices with PRs, findings, next move and open threads, and no prompt file was written.

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Delivers |
| --- | --- | --- | --- | --- | --- | --- |
| S1 author byline | integrated at 733afa1 | `slice/1-author-byline` (deleted) | removed | #75 | — | 1, 2 |
| S2 record handed over | integrated at 3f1a5ca | `slice/2-record-handed-over` (deleted) | removed | #77 | S1 | 3, 10 |
| S3 hand-off without prose | integrated at f8b3e10 | `slice/3-handoff-without-prose` (deleted) | removed | #82 | S2, S9 | 3, 10 |
| S9 crew notice kind | integrated at 77c3fd1 | `slice/9-crew-notice-kind` (deleted) | removed | #79 | S1 | 9 |
| S10 spec gate | integrated at cbf1501 | `slice/10-spec-gate` (deleted) | removed | #80 | S1 | 11 |
| S4 README human steps | integrated at a5b57a7 | `slice/4-readme-human-steps` (deleted) | removed | #76 | S1 | 4 |
| S5 sticky reply box | integrated at 342958e | `slice/5-sticky-reply-box` (deleted) | removed | #78 | S1 | 5 |
| S6 user close | integrated at 0ebb1cc | `slice/6-user-close` (deleted) | removed | #81 | S2 | 7 |
| S7 one spelling | integrated at 709b9f3 | `slice/7-one-spelling` (deleted) | removed | #83 | S3, S6 | 8 |
| S11 repair guard | integrated at 4b02406 | `slice/11-repair-guard` (deleted) | removed | #84 | — | 12 |
| run record (feature) | ready — PR #74 at a8eba23, fix round #85 merged; Gate 2 passed 2026-09-23; merge deferred by the user | feat/run-record | pilot-feat-run-record | #74 | — | 1–5, 7–12 |

## 11. Principles review verdicts

One review, on Opus, over `feat/run-record` at 709b9f3 against `main`: 656 changed lines, 99% diff coverage (5 lines missed), 312 mutants (65 survived, read individually), no import cycles, no clones on changed lines. QA's read-only pass on the same tip passed every spec line but 4.

| Finding | Verdict | Reason |
| --- | --- | --- |
| F1 duplicate seam test in `deck/test/run.test.mjs` | kept (−26) | pure removal; `hooks/test/join.test.js` covers the pairs |
| F2 credential scan in `setSlices` lists cells by hand | kept (≈−15) | a field added later escapes the scan unnoticed — unknown unknowns on a security check |
| F3 user's Close, then Reopen, renders "Closed with:" under a `pilot` byline | kept (+1) | violates spec 1 |
| F4 drop `resolve` from the author hook matcher; `resolvedBy` has one reader | dropped | undoes L1, approved at Gate 1, for cognitive load alone; revisit if a resolution's author is never shown |
| F5 dead re-export in `deck/runs.mjs` | kept (−1) | |
| M1–M4 missing assertions (slug shape, record cell bounds, record fetch failure, Close form id) | kept (+28) | the slug names a directory the pilot writes into; the fetch-failure path is what keeps a hand-off alive |
| nits: stale `session-handoff.js` header, guard short banner, unreachable catch in `deck-author.js` | kept (−3) | zero-cost, text S3 left behind |
| nits: inline `--by-*` colour variables | dropped | A4's variables are the user's override point |
| nits: move `recordFields` beside `requireRow`; deduplicate the three copies of the hand-off steps; cap `records` | dropped | a move is not a fix; the copies are pinned by `pilot-rules.test`; one small record per feature and items are already kept forever (deck-workspace L14) |
| QA: README "ask it to merge autonomously and it will" | kept | spec 4's prohibited claim; the SKILL says the rule is the user's own `CLAUDE.md` |
| QA J2: `safeAgentType` rejects `:` so every crew notice reads "an agent" | kept | pre-dates the feature but is the face of spec 9 |
| QA J1 architect never appears in bylines (no deck tool); J3 reply slot is a third of an 800px viewport | no change | J1 is by design; J3 meets spec 5, the user may ask for smaller |

The fix round lands as one PR on `feat/run-record` (`fix/run-record-principles`), verified by the pilot against the diff before Gate 2.
