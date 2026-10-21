# Foreman becomes co-pilot and tasks become tickets, everywhere

Task `itm_8b75a1e6b83d` · feature `co-pilot-tickets` · base `pilot` a5f260c2 · ADR 0152 (the next free number when S6 lands; 0151 is three-lanes) · two runs, Live then History (L3)

## 1. Problem

The user's words: "i want to make 2 refactors to the entire codebase including docs: 'foreman' -> 'co-pilot',
'tasks' -> 'tickets'; re-write the history as well." The pilot's default of leaving ADRs and past runs as written
was overridden: `overridden: records stop matching the PRs and closing reports that cite them word for word`.

## 2. Spec

Agreed by the user (itm_0bfbd5e0d0fc), as sharpened against the code.

| # | Behaviour a user can watch | Evidence |
| --- | --- | --- |
| 1 | Every "foreman" in code, prose, identifiers and file names reads "co-pilot". The spellings are `co-pilot` (prose, kebab, file names), `Co-pilot`, `coPilot`/`CoPilot` (camelCase) and `CO_PILOT`. The agent is `agents/pilot-co-pilot.md` at `pilot:pilot-co-pilot`, and `deck_task foreman` becomes `deck_ticket co-pilot`. | `git grep -i foreman` finds only §7's exceptions (*assumed* A10: the user's quoted words); suite, `check-references` and `check-provenance` pass; a scratch run spawns `pilot:pilot-co-pilot` |
| 2 | Every "task" naming the deck's concept reads "ticket" (L8: plain English is reworded too). That covers `deck_ticket`, `pilot tickets`, `KIND_TICKET`/`kind: "ticket"`, the `ticket` field, the Tickets tab, `/api/tickets`, the `ticket-making` skill, `untasked` → `unticketed`, and the test helpers (`aTicket`). Compound identifiers count too. | `git grep -i task` (not `-w`: it misses ~1,100 compounds such as `deck_task`, `KIND_TASK`, `aTask`) finds only the §7 exceptions; `hooks/test/join.test.js` stays green |
| 3 | An existing store migrates one-way on first read (the next store version, v3 at a5f260c2), after a dated backup (L10). Item fields: `kind: "task"` → `"ticket"` and `task` → `ticket`. Store keys: `foremen{}` → `coPilots{}` with its inner `task`, `switches[*].foreman` → `coPilot`, `records[*].record.task` → `ticket`. Every open ticket reads back with its id, state and queue order unchanged. Item bodies and raw `author` strings stay as written (*assumed* A5). | a migration test over a copied store; a copy of the live store's 1,131 items listed before and after with equal ids, states and order; the backup beside it |
| 4 | Run records in other repositories (`docs/design/*/run.json`, key `task`) still read: the reader takes `ticket`, else the legacy `task`. | runs/analytics test over a legacy record |
| 5 | History is rewritten: ADR bodies, file names and the index, past `docs/design/<slug>/` artefacts and their directory names, briefs, slice files and run records, with links following the renamed files (L2: the records, not git). | the greps over `docs/`; `check-references`; the `adr-index` test; the whole-repository guard (S15) |
| 6 | ADR 0152 records both renames in the user's words. The prompt pins (pilot 11063.75, QA 4638.75, explorer 2466.5 at a5f260c2, all ceilings) move by exactly what the wording costs. | ADR indexed; the pin diff in each slice that moves one |
| 7 | Claude Code's `TaskCreate`, `TaskUpdate`, `TaskList`, `TaskGet`, `TaskOutput`, `TaskStop`, "Task tool" and `task-notification` stay. | names unchanged in every agent's tool list; the guard's exception test |
| 8 | *(added at Gate 1, the user's words: "dont forget a small version bump")* The plugin version bumps once, by a patch, in the slice that flips the stored spellings (S5), since that is the release at which the old names stop (L12). | `npm run bump` output in S5's PR; `package.json` and `.claude-plugin/plugin.json` agree |

## 3. Findings

- **Size at a5f260c2**: 259 files hold "foreman" (1,814 lines) and 583 files hold whole-word "task" (5,668 lines),
  ~8,400 lines either word. Live scope (all but `docs/adr`, `docs/design`): deck 147 files, scripts 41, hooks 23,
  agents 20, skills 10, rules 10, `bin/pilot.mjs`, `CONTEXT.md`, `CLAUDE.excerpt.md`, `docs/architecture.md`.
  History: `docs/adr` 304 lines; `docs/design` ~3,660 lines over 60 directories.
- **Renamed files**: `agents/pilot-foreman.md`, `skills/task-making/`, `deck/{store-tasks,task-shape,tasks}.mjs`,
  18 `deck/test` files (`foreman-*`, `task-*`, `tasks-*`, `make-tasks`, `next-task`, `overview-one-task`), 4
  `scripts/test` files; ADRs 0047, 0060, 0062, 0065, 0089, 0105, 0107, 0108; design dirs `clear-waits-foreman`,
  `foreman-reports`, `foreman-successor`, `overview-one-task`, `task-making`, `task-state-accents`, `task-states`,
  `tasks-add-button`.
- **`pilot-foreman` literal**: 18 live files: `agents/pilot{,-foreman}.md`, `CONTEXT.md`,
  `hooks/{context-size-guard,session-handoff}.js` (`FOREMAN_TYPE` at `context-size-guard.js:142`) and 13 tests.
- **Store**: `~/.claude/pilot/deck.json` (`deck/store-dir.mjs:10-17`), written atomically and only by the daemon.
  `STORE_VERSION = 2` (`store-core.mjs:46`); `readDeck` refuses any other version (:171-176), which makes the
  migration one-way; precedent `upgradeStore` v1→v2 (:196-202). `deck.foremen[repoKey]` is `{ task, live, at }`
  (:655-665). Queue order is `deck.items` array order (`store-tasks.mjs:57-72`). `KIND_TASK = 'task'`
  (`items.mjs:70`), `TASK_ID_FIELD` (:219). The run reader writes `fields.task` (`runs.mjs:400`).
- **Hooks mirrors**: `hooks/lib/deck.js:309` STANDING_KINDS is pinned against `items.mjs:129` (`join.test.js:95-106`).
  Unpinned: `stop-gate.js:106-136` (`'task'`, `item.task`), `lib/blocked.js:95`, `context-size-guard.js:649`
  (`found.foreman.task`, from the lanes API).
- **Agents**: the address is the frontmatter name; neither manifest lists agents. `install.test.mjs:1050` pins a
  count (unchanged). `CREW` at `pilot-agents.test.mjs:30-60`; `yellow-foreman.test.mjs:29-31` pins the address.
  `authorKind('pilot:pilot-co-pilot')` gives `other`, never `pilot` (`items.mjs:367`).
- **Tools**: `deck_task` at `tools.mjs:350`, actions at :356 (`foreman` among them). `install-settings.mjs:824`
  allows `mcp__plugin_pilot_deck__*`, so no allow-rule change. `check-references` binds `mcp__…deck_*` and
  `` `pilot <cmd>` `` in agents, skills and rules to `tools.mjs` and `bin/pilot.mjs`; it does not scan docs/.
- **Rules ledger**: `scripts/shipped-rules.json` holds each shipped rule's hashes; `rules/orchestration.md` and
  `rules/vertical-execution.md` change, so the ledger is rebuilt (`scripts/build-rules-ledger.mjs`).
- **ADR index**: `scripts/adr-index.mjs` generates `docs/adr/README.md` from file names; its test fails if stale.
- **Provenance**: `check-provenance` hashes nothing; `check-upstream` reports `verbatim` drift but never fails.
- **Live links into history**: one, a fixture string at `deck/test/estimate.test.mjs:20` that is never opened, so the
  Live run leaves no dangling link while History is pending.
- **Tests**: `npm test` is `scripts/gate.mjs`, which discovers every `test/` file, so a new test joins the gate.
- **Ordering**: this run goes yellow after three-lanes, readme-flow, git-light-tests, gate-script and
  unimported-exports; each rename slice re-runs its codemod after rebasing, which is cheap because the codemod is
  the slice. The store version and the ADR number are read when the slice lands, not fixed here.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `scripts/vocabulary.mjs` (new, S1; guard S7; rename half deleted S15) | `renameText(text, path, { stored })`, `renamePath(path)`, `retiredHits(text, path)`, `EXCEPTIONS`; CLI `rename [--stored] <paths>`, `check <paths>` | the spelling map, its order (compounds before bare words), the stored spellings and §7's exceptions, instead of ~20 private seds | In-process |
| `hooks/lib/deck.js` (fold, S2) | `STORED` `{ kind, field, coPilots, coPilot }` beside `STANDING_KINDS` | the four unpinned literal sites in `stop-gate.js`, `lib/blocked.js`, `context-size-guard.js` | In-process |
| `deck/store-core.mjs` | `upgradeStore(deck)` v2→v3, `readDeck()` | the one-way rename of kinds and keys, and the backup | Local-substitutable (`PILOT_DECK_DIR`) |
| `deck/runs.mjs` record reader | `recordTicket(record)` → `record.ticket ?? record.task` | legacy run records in other repositories | In-process |

Deletion test: delete `vocabulary.mjs` and the spelling map reappears in every slice's command (kept). Delete the
hooks' literal sites into `STORED` and four sites stop drifting from the deck (fold kept). A `migrate.mjs` beside
`upgradeStore` would have one caller, so the step lives in `upgradeStore` (not created).

## 4. Ubiquitous language

- **Ticket**: the deck's unit of work (was task). **Co-pilot**: the agent that directs a yellow ticket (was foreman).
- **Retired word**: foreman, or task in any spelling outside §7; the guard fails on one.
- **Stored spelling**: a literal the store, the wire or the hooks share (kind value, item field, store key, query
  parameter, `deck_post` field); flipped only by S5.
- **Codemod output**: lines `vocabulary.mjs rename` writes, reproducible from the command a PR names (L7).
- **Hand-fix**: a line changed by hand after the codemod; at most 200 per slice (L7).

## 5. Locked decisions

| # | Decision | Rationale and source | Rejected |
| --- | --- | --- | --- |
| L1 | Depth *every*: code, prose, identifiers, file names, history. Spec 1–7 as above. | The user (itm_2abb7dbe9cac, itm_0bfbd5e0d0fc). | Live code only. |
| L2 | "History" is the records on disk: ADR bodies and file names, past design artefacts, briefs, slice files, run records. Past commits, PR titles and closing reports stay. | The user, itm_d60598dddd5a: "The records". | `git filter-repo` and a force-push of main and pilot. |
| L3 | Two runs in sequence on this deck: Live (S1–S7), then History (S8–S15), each cut from the pilot the previous one landed on. After Gate 1 the pilot posts one ticket for run 2. | The user, itm_6f7bdca8bb5f: "In sequence on this deck". The migration cannot ship apart from the code that reads the new spelling, so two runs, not three. | One ~8,400-line run; parallel decks. |
| L4 | QA on this machine: every slice and QA on `pilot deck --scratch` with a planted store; S5 rehearsed on a copy of the live store, items listed before and after; the live store migrates only when the user restarts the deck after Live lands, from the dated backup the walkthrough names. | The user, itm_1b4718ca49fa: "Scratch decks, then a rehearsal on a copy". | The live store at QA. |
| L5 | One shared codemod, `scripts/vocabulary.mjs`, plus a permanent vocabulary guard `npm test` runs over each run's scope once its last slice lands; the rename half is deleted when History ends (S15). | The user, itm_8176c9c4a636: "Shared codemod plus guard". | Each implementer its own sed. |
| L6 | The stored-spelling flip (kind values, keys, query, `deck_post` field, the hooks' mirrors) and the v3 `upgradeStore` step are one slice of their own (S5), after the identifier slices. | The user, itm_473e98e64d0b: "Own slice". The integration branch holds `KIND_TICKET === 'task'` between S4 and S5; it never ships. | One slice doing both. |
| L7 | At most 200 hand-written changed lines per slice; codemod output uncapped when the PR names the exact command and the reviewer's re-run on the base reproduces it apart from the listed hand-fixes. | The user, itm_54edc730dde5: "200 hand-written, codemod uncapped if reproducible". | A flat 300. |
| L8 | Plain-English "task" is renamed to "ticket" or reworded by hand ("job", "work"), never exempted; the exception list is closed (§7). | The guard can check a closed list, not a judgement per sentence. Locked by the user at the Gate 1 walk (itm_fdc78532f5b6). | An open list of plain-English exceptions. |
| L9 | The codemod runs in two modes: the default renames identifiers, file names, tools, CLI words and prose and leaves every stored spelling as written; `--stored` flips the stored spellings (S5 only). | L6 needs a codemod that cannot flip the store early. Locked by the user at the Gate 1 walk (itm_3803709518e6). | One mode, with stored spellings hand-restored. |
| L10 | Before the v3 write the daemon copies the store to `deck.v2-<YYYY-MM-DD>.json` beside it, once. | L4 names a dated backup; every other install migrates too, with no walkthrough. Was A8. Locked by the user at the Gate 1 walk (itm_f6d79a6d6d7e). | A manual copy in the walkthrough only. |
| L11 | The hooks' stored spellings live in one `STORED` object in `hooks/lib/deck.js`, pinned to `items.mjs` by `join.test.js` (fold, S2). | Four unpinned literal sites would each have to be found by S5. Locked by the user at the Gate 1 walk (itm_7acd28a97ab5). | Pinning each site separately. |
| L12 | No alias for the old tool, action, CLI or route names: `deck_task`, `foreman`, `pilot tasks`, `/api/tasks` stop at the release. | The daemon and its MCP client ship in one plugin version; an alias is a retired word kept forever. Locked by the user at the Gate 1 walk (itm_49b39124c3ff). | A one-release alias. |
| L13 | The migration step and the legacy run-record reader spell the old words; they are §7 exceptions by path. | A one-way migration must read the v2 spelling. Locked by the user at the Gate 1 walk (itm_b115e8a2a7e3). | Spelling them as `'t' + 'ask'`. |
| L14 | History is owned by directory range (S9–S14, by the old name), so a design run landing before History falls in exactly one range. | Disjoint lanes without re-listing directories. Locked by the user at the Gate 1 walk (itm_676f2126702f). | A list of directories per slice. |

## 6. Assumed decisions

Sent to `main`; each default is taken and the run proceeds on it. All three were kept by the user at the Gate 1 walk: A5 itm_39651bfdab64, A7 itm_fb242dca4020, A10 itm_f1616857cc42.

- **A5 Store bodies, raw `author` strings and stored paths stay as written**; only kinds and keys migrate.
  Tradeoff: old item bodies on the deck still say foreman/task and old run records name `docs/design/task-states/`.
  Rejected: rewriting 1,131 bodies, which changes what the user wrote and cannot be undone.
  Verdict: stands — L2 names records on disk; the store's bodies are the user's typed words and the closing reports L2 keeps, and the rewrite is irreversible.
- **A7 Vendored upstream generic English stays** (§7 list); the pilot's own adapted lines follow the rename
  (`grilling:35`, `tdd-workflow:51,117`, `wizard:60`). Tradeoff: the guard carries those paths. Rejected:
  editing upstream text, which `check-upstream` then reports as drift on every sync.
  Verdict: stands — The upstream sync is a standing cost in every run; drift there would be paid on each.
- **A10 The user's own words stay**: ADR 0152 quotes the request verbatim, and `docs/design/co-pilot-tickets/` (the
  one record of the rename, whose old→new map would read "co-pilot → co-pilot") is not rewritten. Tradeoff: spec 1's
  "`git grep -i foreman` is empty" becomes "finds only those two and §7". Rejected: paraphrasing the request.
  Verdict: stands — Spec 6 asks for the user's words and the user overrode the pilot's default so records would match what cites them; paraphrasing would break that. Posted to the user, since it edits spec 1's evidence.
  Widened by the pilot in run 2 (2026-10-17, a seam change on the co-pilot's question): `docs/design/co-pilot-tickets-history/` too, the second record of the same rename, which the deck rewrites from its store and whose friction rows quote the retired words; and ADR 0152 as a whole file with its index row, since its title, not only its quotation, is the user's request and would read "co-pilot becomes co-pilot".

## 7. Out of scope and the exceptions

**Exceptions** (closed; `EXCEPTIONS` in `vocabulary.mjs`): Claude Code's `Task*` tools, "Task tool" and
`task-notification`; `taskkill`, `tasklist`, `queueMicrotask`, `microtask`; .NET/F#/Swift `Task`, `task { }`,
`TaskGroup`, `System.Threading.Tasks` under `rules/csharp`, `rules/fsharp`, `rules/swift`; vendored upstream text
("unless required by the task" at line 20 of the 13 toolbox agents, `security-reviewer.md:87`,
`skills/iterative-retrieval`, `skills/context-budget`'s "Task tool") (A7); the v3 step in `deck/store-core.mjs`,
the legacy key in `deck/runs.mjs` and their fixtures (L13); ADR 0152 whole (its title and file name are the request in the user's words, spec 7's `Task*` line beside the quotation) with its `docs/adr/README.md` row, and
`docs/design/co-pilot-tickets/` and `docs/design/co-pilot-tickets-history/` (A10, widened in run 2).

**Out of scope**: rewriting git history, PR titles or closing reports (L2); item bodies and author strings in the
store (A5); an alias for any old name (L12); the user's own `~/.claude/rules` copies, which the installer updates.

## 8. Slices

Width 7 (S8–S14); longest stem 6 (S1 → S2 → S3 → S4 → S5 → S7). Live alone: width 2 (S6 beside the chain),
stem 6. History alone: width 7, stem 2. Every rename slice's PR names its `node scripts/vocabulary.mjs rename …`
command (History with `--stored`, since the store already spells ticket), and its reviewer re-runs it on the base (L7).

| # | Title | Spec | Files owned | After | Reviewers | Model | File |
|---|---|---|---|---|---|---|---|
| S1 | Skeleton: the codemod renames, and a scratch run spawns `pilot:pilot-co-pilot` | 1, 7 | `scripts/vocabulary.mjs` (new), `scripts/test/vocabulary.test.mjs` (new), `agents/pilot-foreman.md` → `agents/pilot-co-pilot.md`, the 17 other `pilot-foreman` files (§3) | – | ts, security | opus | [S1](slices/S1.md) |
| S2 | Fold: the hooks read the stored spellings from one pinned module | 3 | `hooks/lib/deck.js`, `hooks/stop-gate.js`, `hooks/lib/blocked.js`, `hooks/context-size-guard.js`, `hooks/test/join.test.js` | S1 (context-size-guard.js) | ts, security | opus | [S2](slices/S2.md) |
| S3 | Foreman reads co-pilot across the live scope | 1, 6 | every live-scope file holding foreman (`deck/**`, `hooks/**`, `scripts/**`, `bin/pilot.mjs`, `agents/**`, `skills/**`, `rules/**`, `CONTEXT.md`, `docs/architecture.md`), the renamed foreman tests, `scripts/shipped-rules.json`, the prompt pins | S16 (vocabulary.mjs), S2 (hooks/**) | ts, security | opus | [S3](slices/S3.md) |
| S4 | Task reads ticket across the live scope: `deck_ticket`, `pilot tickets`, the Tickets tab | 2, 6, 7 | every live-scope file holding task, `skills/task-making/` → `skills/ticket-making/`, the 3 deck modules and 18 tests renamed, `scripts/shipped-rules.json`, the prompt pins | S3 (every live file), S17 (vocabulary.mjs) | ts, security | opus | [S4](slices/S4.md) |
| S5 | The stored spelling flips and an old store migrates one-way | 3, 4, 8 | `deck/store-core.mjs`, `deck/runs.mjs`, `deck/items.mjs`, `hooks/lib/deck.js`, the `--stored` output over `deck/**`, `hooks/**`, `bin/pilot.mjs`, `deck/test/store-v3.test.mjs` (new), `deck/test/run-record-legacy.test.mjs` (new) | S18 (deck/**), S4 (hooks/**), S2 (STORED) | ts, security, database | opus | [S5](slices/S5.md) |
| S6 | ADR 0152 records both renames in the user's words | 6 | `docs/adr/0152-foreman-becomes-co-pilot-and-tasks-become-tickets.md` (new), `docs/adr/README.md` | – | ts | sonnet | [S6](slices/S6.md) |
| S7 | `npm test` refuses a retired word in the live scope | 1, 2, 7 | `scripts/vocabulary.mjs` (guard half), `scripts/test/vocabulary-guard.test.mjs` (new) | S5 (stored spellings), S1 (EXCEPTIONS) | ts | opus | [S7](slices/S7.md) |
| S8 | The ADRs read co-pilot and ticket, file names and index too | 5 | `docs/adr/**` but 0152 | – | ts | sonnet | [S8](slices/S8.md) |
| S9 | Design history a–e reads the new words | 5 | `docs/design/<dir>/**` for `dir < "f"`, but `co-pilot-tickets` | – | ts | sonnet | [S9](slices/S9.md) |
| S10 | Design history f–l reads the new words | 5 | `docs/design/<dir>/**` for `"f" ≤ dir < "m"` | – | ts | sonnet | [S10](slices/S10.md) |
| S11 | Design history m–r reads the new words | 5 | `docs/design/<dir>/**` for `"m" ≤ dir < "s"` | – | ts | sonnet | [S11](slices/S11.md) |
| S12 | Design history s to task-making reads the new words | 5 | `docs/design/<dir>/**` for `"s" ≤ dir < "task-s"` | – | ts | sonnet | [S12](slices/S12.md) |
| S13 | task-state-accents and task-states read the new words | 5 | `docs/design/<dir>/**` for `"task-s" ≤ dir < "tasks"` | – | ts | sonnet | [S13](slices/S13.md) |
| S14 | Design history tasks-add-button to z reads the new words | 5 | `docs/design/<dir>/**` for `dir ≥ "tasks"` | – | ts | sonnet | [S14](slices/S14.md) |
| S15 | The guard covers the whole repository and the codemod is gone | 1, 2, 5 | `scripts/vocabulary.mjs` (rename half deleted), `scripts/test/vocabulary.test.mjs`, `scripts/test/vocabulary-guard.test.mjs` | S8–S14 (the whole-repository scope) | ts | sonnet | [S15](slices/S15.md) |
| S16 | *Added*: the codemod refuses what it would break (S1's TS review) | 1 | `scripts/vocabulary.mjs`, `scripts/test/vocabulary.test.mjs` | S1 | ts, security | opus | [S16](slices/S16.md) |
| S17 | *Added*: the codemod keeps every stored spelling and every binding whole (S3's report) | 2, 3 | `scripts/vocabulary.mjs`, `scripts/test/vocabulary.test.mjs` | S16 | ts | opus | [S17](slices/S17.md) |
| S18 | *Added*: the page's Tickets region carries the id `tickets` (S4 split) | 2 | `deck/ui/{strips.html,live.mjs,deck.css}`, the deck tests naming the id | S4 | ts | sonnet | [S18](slices/S18.md) |
| S19 | *Added*: the readme-flow graph reads co-pilot and tickets (base drift) | 1, 2 | `README.md`, `scripts/test/readme-flow.test.mjs` | S4 | ts | sonnet | [S19](slices/S19.md) |
| S20 | *Added*: the store is backed up before v3, never silently incomplete (S5 split) | 3 | `deck/store-core.mjs`, the store tests | S5 | ts, database | opus | [S20](slices/S20.md) |
| S21 | *Added*: harness terms the codemod made deck words read as the harness again (found issue) | 5 | `docs/adr/0061-a-wait-takes-what-it-prints.md`, `docs/design/crew-waits/architecture.md`, `docs/design/slice-estimates/run.json` | S8–S14 | ts | sonnet | [S21](slices/S21.md) |

Reviewers: ts = `pilot:typescript-reviewer`, security = `pilot:security-reviewer` (agents/, hooks/, skills/, an
MCP tool or CLI argument), database = `pilot:database-reviewer` (the store migration). Opus where the slice hits
the security trigger (S1–S5) or holds the exception judgement (S7); Sonnet where the command and the range decide
everything (S6, S8–S15).

### Runs

| Run | Slices | Spec lines | After | Estimate |
| --- | --- | --- | --- | --- |
| Live | S1–S7 | 1, 2, 3, 4, 6, 7 | – | 7 slices |
| History | S8–S15 | 5, and 1, 2 over `docs/` | Live (it uses Live's codemod and is cut from the pilot Live landed on) | 8 slices |

## 9. Acceptance evidence

In the order the user meets it (Live, then History):

1. On a scratch deck the page shows a **Tickets** tab; `pilot tickets` prints the live ticket; a yellow ticket
   shows its co-pilot (2).
2. A scratch session spawns `pilot:pilot-co-pilot` for a yellow ticket, and `deck_ticket co-pilot` answers (1).
3. The rehearsal: a copy of the live store, its 1,131 items listed before and after the scratch daemon's first read,
   ids, states and order equal, and `deck.v2-<date>.json` beside it (3).
4. A legacy `run.json` with `task` shows in the run analytics (4).
5. Every agent's tool list still names `TaskCreate`, `TaskUpdate`, `TaskList`, `TaskGet` (7); each pin diff moves
   only by the wording (6).
6. `npm test` green with the live-scope guard; `git grep -i foreman` and `git grep -i task` outside `docs/` find
   only §7 (1, 2); ADR 0152 in the index (6).
7. After History: the same greps over the whole repository find only §7; the ADR index and `check-references`
   pass; a renamed design directory opens with its links working (5).
8. After the user restarts the deck: the live deck reads the migrated store, and the backup the walkthrough names
   is on disk (3).

## 10. Status

| Slice | State | Branch | PR | Worktree | Blockers | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | integrated at 9da51db9 | | 716 | | – | 1, 7 |
| S2 | integrated at 299de90c | | 718 | | S1 | 3 |
| S3 | integrated at 116fa292 | | 719 | | S16, S2 | 1, 6 |
| S4 | integrated at 2adb4631 (via PR 723) | | 721 | | S3, S17 | 2, 6, 7 |
| S5 | integrated at 5ac85fa2 | | 725 | | S18, S2 | 3, 4, 8 |
| S6 | integrated at 41a8b23f | | 715 | | – | 6 |
| S7 | planned | | | | S5, S1 | 1, 2, 7 |
| S8 | planned | | | | – (run History, after Live) | 5 |
| S9 | planned | | | | – (run History, after Live) | 5 |
| S10 | planned | | | | – (run History, after Live) | 5 |
| S11 | planned | | | | – (run History, after Live) | 5 |
| S12 | planned | | | | – (run History, after Live) | 5 |
| S13 | planned | | | | – (run History, after Live) | 5 |
| S14 | planned | | | | – (run History, after Live) | 5 |
| S15 | planned | | | | S8, S9, S10, S11, S12, S13, S14 | 1, 2, 5 |
| S16 | integrated at 11abee99 (added) | | 717 | | S1 | 1 |
| S17 | integrated at 23086b8b (added) | | 720 | | S16 | 2, 3 |
| S18 | integrated at db7b4d9e (added) | | 724 | | S19 | 2 |
| S19 | integrated at 2adb4631 (added, as S19b PR 723) | | 722 | | S4 | 1, 2 |
| S20 | planned (added) | | | | S5 | 3 |
| S21 | planned (added) | | | | S8, S9, S10, S11, S12, S13, S14 | 5 |
| co-pilot-tickets | planned | `design/co-pilot-tickets` | | `C:/Users/Hazzard/Projects/pilot-design-co-pilot-tickets` | – | 1–8 |
