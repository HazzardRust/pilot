---
status: proposed
date: 2026-10-20
tags: [install, plugin, rules, settings, adr]
supersedes: []
superseded_by: []
paths: [scripts/reach.mjs, scripts/apply-reach.mjs, scripts/install-rules.mjs, scripts/install-settings.mjs, deck/run.mjs, deck/doctor.mjs, .claude-plugin/marketplace.json, docs/INSTALL.md, docs/design/plain-session/architecture.md]
---
# A plain session carries only the reach the install chose

We decided that the install asks one question, the **reach** (`nothing`, the default, `rules` or `everything`), that `pilot reach <level>` applies it, and that below `everything` a `claude` not started by `pilot run` carries no pilot agents, skills, deck tools, hooks, always-on rules or status line, while `pilot run` carries the whole pilot at every level.

## Context

A plain `claude` session carried about 9k tokens of pilot: the deck's tool schemas, every agent and skill, the two always-on rules, a hook running after every tool call, and a SessionStart hook that copied the rules home and rewrote `statusLine`. The user asked that "their regular claude sessions remain untouched", that the deck work only through `pilot run`, and that the install wizard let them choose how much it touches a regular session.

## Decision

- **L1 One plugin, enabled per process.** The marketplace entry carries `defaultEnabled: false`. `pilot reach` writes `enabledPlugins["pilot@pilot"]`, `true` only at `everything`, and `pilot run`'s `--settings` sets it `true` for its own process.
- **L2 No hook gate.** A disabled plugin loads no hooks, so no hook checks who started it; a gate would break plain pickup and hand-off at `everything` and do nothing below it.
- **L3 The repair hooks follow the reach.** The rules repair applies the reach's plan to both rules places, and the settings repair writes the pilot's status line only at `everything`.
- **L4 What each level holds:**

  | reach | `~/.claude/rules` | rules root | `enabledPlugins` | user `statusLine` | `pilot run` adds |
  | --- | --- | --- | --- | --- | --- |
  | nothing | no shipped copy | every rule | false | none | enable, statusLine, `--add-dir` |
  | rules | the scoped rules | the 2 always-on | false | none | enable, statusLine, `--add-dir` |
  | everything | every rule | empty | true | set | enable |

  The rules root is `~/.claude/pilot/rules-root`; the level is stored in `~/.claude/pilot/reach.json`. Moving down removes only shipped copies and the pilot's own status line; an edited rule is left and named, as the ledger already does (ADR 0055).
- The question is the fourth in `docs/INSTALL.md`, and its step runs `pilot reach <level>`; the `CLAUDE.md` excerpt is offered only at `everything`, and the install's verify run turns the plugin on with `--settings`. An install that never chose reads as `everything` until `pilot reach` is run.

## Rejected

- *A second plugin for the crew* (L1): two manifests and two installs for no gain.
- *`--plugin-dir` for `pilot run`* (L1): it loads as `pilot@inline` and double-loads at `everything`.
- *A per-hook exit on `PILOT_RUN_PID`* (L2).
- *A hook entry per level* (L3).
- *A stdin installer* for the question: the install is a prompt (ADR 0002).

## Consequences

- Amends ADR 0008: the rules are copied into `~/.claude/rules` only as far as the reach says, and the rest go to the rules root for `pilot run`.
- `claude --agent pilot:pilot` started by hand is not a supported start below `everything`; the docs start the pilot only through `pilot run`.
- An upgraded machine keeps everything until `pilot reach` is run once, and `pilot doctor` names a reach that was never chosen.
- That the rules reach `pilot run`'s crew through `--add-dir` is the design's assumption A3, still to be proven live with a login.
