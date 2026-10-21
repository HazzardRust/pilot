# Handoff: pilot package run, 2026-09-13

For the next pilot session. Everything durable is in the files named here;
this note is only what a fresh session cannot infer from them.

## Resume with

```
claude --agent pilot
/pilot C:\Users\Hazzard\Projects\pilot-design\docs\design\pilot-package\architecture.md
```

Read `architecture.md` first (plan, decisions, slice DAG, status table §9),
then this file, then `docs/adr/`.

## Where the run stopped

The pilot and the architect hit their session usage limits (reset 16:10,
2026-09-13). The slice 1 implementer stopped cleanly on instruction. No agent
is live.

| Thing | State |
| --- | --- |
| `HazzardRust/pilot` | private, `main` = empty initial commit `fc806af` |
| `design/pilot-package` | artefact, ADRs 0001–0010, `CONTEXT.md`, this file; worktree `~/Projects/pilot-design` |
| `slice/1-walking-skeleton` | `b4a212c`, pushed, tree clean; worktree `~/Projects/pilot-s1`; no draft PR yet |
| Gate 1 | passed, including the slice 12 amendment |
| Slices 2–12 | planned |
| Plugin on this machine | `pilot@pilot 0.1.0` installed from the local marketplace at `~/Projects/pilot-s1` (scope user); deck store at `~/.claude/pilot/deck.json` |

## Slice 1: what is proven

All from the implementer's final report; the pilot has not read the diff.

| Assumption | Result |
| --- | --- |
| Marketplace from a local path | proven: `claude plugin marketplace add <dir>`, `claude plugin install pilot@pilot` |
| `claude --agent pilot:pilot` | proven from three working directories |
| `.mcp.json` via `${CLAUDE_PLUGIN_ROOT}` | proven; tools are `mcp__plugin_pilot_deck__deck_post` / `deck_read` |
| `${CLAUDE_PLUGIN_ROOT}` in agent content | proven, expands (A5 settled) |
| stdio MCP from a plugin | proven; a real agent posted an item |

Round trip: agent posted `itm_c5b9c4f6bbdd`; it rendered at
`http://127.0.0.1:4321` in real Chrome; a reply typed there landed in the
store. Screenshot: `%LOCALAPPDATA%\Temp\claude\deck-round-trip.png`. Gates:
`node --test` 35 pass; `node --check` clean; `claude plugin validate .` one
warning (marketplace lacks `description`).

## Slice 1: what remains before the draft PR

1. One `deck_read` captured from the agent quoting the reply back (the
   `claude -p` run buffers output until exit, so it was not yet seen).
2. Add `description` to `.claude-plugin/marketplace.json`.
3. Merge `origin/design/pilot-package` into the branch so the PR carries the
   artefact, ADRs and this file.
4. One fresh-context review: `ecc:typescript-reviewer`, plus
   `ecc:security-reviewer` because the slice binds a port with no auth,
   renders user input and implements the A6 credential refusal.
5. Open the draft PR: `Slice 1: walking skeleton — plugin, marketplace, deck
   round trip`, target `main`, body ending with the session attribution.

Resume the slice 1 implementer by message if it answers; otherwise brief a
fresh `pilot-implementer` (Sonnet is enough: every step is decided) from the
slice 1 section plus this list.

## Decisions the implementer took alone (assumed)

- Added `.gitignore` (`node_modules/`) and committed `package-lock.json`,
  neither in the owned list; the lockfile belongs with the pinned dependency.
- Deleted the stale `plugin:pilot:deck` key from
  `~/.claude/mcp-needs-auth-cache.json` (other keys untouched; backup at
  `%LOCALAPPDATA%\Temp\claude\mcp-needs-auth-cache.backup.json`). This is the
  user's live config; tell them.

## Riders for later slices (already in artefact A5 and §7)

Local-marketplace plugin root is the source directory, not the cache; a local
marketplace add copies gitignored `node_modules`, a GitHub install does not,
so slice 10's install prompt must run `npm install --omit=dev`; `node --test`
takes no path argument on Node 26.

## Next actions after the draft PR

- Spawn `pilot-fundamentalist` on PR 1 (Opus: it introduces the deck boundary).
- Start slices 7, 8, 9 in parallel from `slice/1-walking-skeleton` (file
  disjoint, §7). Pilot + three implementers with two children each is ten, so
  run two and queue the third, or one child each.
- Slice 2 starts from slice 1's PR head.

## Standing calibrations from this run

- Threshold-shaping questions ("absolute or fraction") go to the architect,
  not the user. Ask the user only what is genuinely theirs.
- The deck port is **4321** everywhere (the architect's 4317 was changed).
- The pilot edits the artefact itself in `~/Projects/pilot-design` once the
  architect has finished; do not resume the architect for small edits.
- `~/environment` is live configuration; only slice 11 touches it, after the
  plugin is verified on this machine.

## Human steps outstanding

None. The repo exists; the user merges each PR when ready.

## Suggested skills for the next session

`pilot` (via `/pilot`); Pocock's `grilling` only if a new decision surfaces;
`domain-modeling` for any new ADR; `vertical-slicing` if a slice is re-cut.
