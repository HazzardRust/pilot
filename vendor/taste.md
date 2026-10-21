# Vendoring ledger: the taste pass

The QA agent's taste checklist, adapted from **claude-code-workflows** at commit `6a65344`
(<https://github.com/OneRedOak/claude-code-workflows>), MIT, Copyright (c) 2025 Patrick Ellis.
The upstream has no release tags, so the commit stands in for the version.

The header and row formats are the ones `vendor/methodology.md` defines. This is its own
fragment rather than a row in `vendor/toolbox.md` because `scripts/build-vendor-ledger.mjs`
refuses a fragment that mixes upstreams. The MIT notice travels in `THIRD-PARTY-NOTICES.md`.

## Re-sync

This upstream is not a Claude Code plugin, so `scripts/check-upstream.mjs` cannot find
it and reports it as missing (exit 1) until you clone it and pass
`--root claude-code-workflows=<clone>`.

## Vetting (independence L12)

| Checked | Found |
| --- | --- |
| Licence | `LICENSE` at the root: MIT, Copyright (c) 2025 Patrick Ellis |
| What `design-review/` ships | five markdown files: an agent, a slash command, a `CLAUDE.md` snippet, a principles example and a README |
| Hooks, `.mcp.json`, credentials, telemetry | none. The only executable config in the repository is two GitHub workflow files under `code-review/` and one under `security-review/`, none of which was taken |
| Rejected alternatives | `vercel-labs/agent-skills` `web-design-guidelines` (no licence, fetches its rules on every use); `ui-ux-pro-max` (a generation database with a CLI); `anthropics/skills` `frontend-design` (for building UI, not reviewing it) |

## What was not taken

| Left behind | Why |
| --- | --- |
| The agent's `tools:` line and its Playwright MCP tool names | L12: prompt content only. This package declares one browser MCP (L7) |
| Phase 2's three-breakpoint sweep, Phase 4's accessibility list, Phase 6 code health | L11: one desktop width; accessibility stays in `browser-qa`; code is the language reviewer's |
| The "elite specialist" persona and the Stripe/Airbnb/Linear framing | tokens a skill pays each time QA loads it for a GUI, for no change in what gets checked |
| `design-principles-example.md`, the slash command, the `CLAUDE.md` snippet | written for a project to adopt as its own style guide, not for a reviewer to preload |

## Vendored files

| File | Upstream | Adapted | What changed and why |
| --- | --- | --- | --- |
| `skills/design-review/SKILL.md` | `design-review/design-review-agent.md` | yes | An agent became a skill QA loads only for a GUI. Seven phases are cut to the three questions the user asked of taste: what information is unnecessary, whether every action gives feedback, and polish. Its live-first stance, "problems over prescriptions", the positive opening, the Blocker/High/Medium/Nit triage and a screenshot per finding are kept. The report is one table (independence L11, L12) |
