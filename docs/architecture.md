# Architecture

Pilot is a Claude Code plugin. A main session (the pilot) directs a crew of agents through a feature slice by slice, and a local deck holds the questions, gates and runs.

This page says which directory holds what and how they connect. It does not say why.

- The words (pilot, crew, run, slice, gate) are defined in [`CONTEXT.md`](../CONTEXT.md).
- The decisions and their reasons are the ADRs; [`docs/adr/README.md`](adr/README.md) is the index and the first read.
- How a feature was built lives in `docs/design/`, not here.

## How the parts connect

The user talks to the pilot, defined in `agents/pilot.md`. The pilot spawns crew agents, which load skills and follow rules. Agents reach the deck through its MCP server; hooks fire on Claude Code events and talk to the same deck; `bin/` starts it.

## `bin/`

`pilot.mjs` is the `pilot` command, a dispatcher: each subcommand (deck, run, integrate, handoff, budget and others) is one module under `deck/` or `scripts/`. `launcher.mjs` is the small global `pilot` entry the install copies out; it hands over to the current version's `pilot.mjs`.

## `deck/`

The deck: MCP tools (`tools.mjs`), HTTP server (`server.mjs`), JSON store (`store.mjs`), the page (`ui/`), and one module each for items, tickets, runs, usage and budget. Its tests are in `deck/test/`.

## `hooks/`

Claude Code hooks, wired by `hooks.json`: the stop gate, permission refusal, inbox and context alerts, session handoff. Shared helpers are in `hooks/lib/`, tests in `hooks/test/`.

## `agents/`

One Markdown definition per agent: the pilot and its crew (explorer, architect, implementer, co-pilot, fundamentalist, QA, teacher, auditor), and the reviewers and helpers they call.

## `skills/`

The methodology the crew loads, one directory per skill with a `SKILL.md`: slicing, test-first, grilling, review, design.

## `rules/`

Coding rules by language, and the two orchestration rules (`orchestration.md`, `vertical-execution.md`). The install copies them to `~/.claude/rules/`.

## `scripts/`

The install's own steps (`install-*.mjs`), the worktree and integration helpers (`land.mjs`, `integrate.mjs`, `sync.mjs`), the prompt-size measures, and the checks that keep the repository honest (`check-references.mjs`, `check-provenance.mjs`, `adr-index.mjs`). Tests are in `scripts/test/`.

## `vendor/`, `VENDOR.md`

Ledgers of what was copied from upstream projects, with `THIRD-PARTY-NOTICES.md`.

## `fixtures/`

Repositories with planted friction that QA copies out and audits. Never collected by `npm test`.

## `docs/`

`adr/` the decision records, `design/` the artefact of each feature, `INSTALL.md` what Claude follows to install.
