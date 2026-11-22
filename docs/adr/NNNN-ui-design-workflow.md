---
status: proposed
date: 2026-11-22
tags: [ui-design, look, surface-adapter]
supersedes: []
superseded_by: []
paths: [deck/look.mjs, bin/pilot.mjs, fixtures/surface-web/, skills/ui-design/SKILL.md, docs/design/ui-design-workflow/architecture.md]
---
# A surface is shaped through its own token file and captured by start-up route

We decided that pilot's design step builds on a playground of our own over each stack's own token file, with no
third-party design tool; that a surface reaches the look commands through one `surface.json` adapter beside its
token file, naming its ruleset, its screens by start-up route, and one of two ways to open a screen; that a capture
starts one process from an argv and never sends input to a window; and that the deck's look refusals read body
lines rather than new item fields.

## Context

While the Rune deck was built the user and the crew meant different things by how a surface should look and found
out at the walkthrough. One capture drove the wrong window and sent clicks and Win+keys to the user's foreground
app, and a light capture needed the system theme changed (`docs/design/rune-deck-ui/run.json`). The step has to
serve a web page and a native Rust window alike.

## Decision

- **No third-party tool (L2).** The playground stays one file:// page with no network. Ten open-source agentic
  design tools were weighed (architecture §3.2): every one outputs web code only, none writes a token file a Rust
  app reads, and four carry analytics, metered keys or agent-run plugin code. The recommendation is to generalise
  our playground and keep each stack's own token file as the exchange format; DTCG has no light/dark pairs and
  would be a second file to drift.
- **Body lines, not fields (L3).** The gate1 and walkthrough refusals read `Fonts:`, `Colour means:`,
  `Reference:` and `Differences: itm_…` lines, as `recutGate1Gaps` does. `deck/items.mjs` sits at 799 of 800 lines
  and a schema field costs the pilot's pinned prompt.
- **Open by route, never drive a window (L5).** `pilot look snap <surface.json> <screen> --mode light|dark`
  looks the screen up in `surface.json` and starts the surface already on that route and mode.
- **Two adapter kinds, argv only (L7).** `web` starts a Chromium-family browser found on the machine (or named by
  `PILOT_LOOK_BROWSER`) headless, with a temporary profile it removes, the route a query or fragment on the page.
  `command` runs the file's argv template with only `{route}`, `{mode}` and `{out}` substituted, with no shell, in
  the `surface.json`'s directory. Every path in a `surface.json` is relative to it and must stay inside the
  repository, so a shared ruleset such as `../DESIGN.md` is taken and an absolute or escaping path is refused.
- **A ruleset per surface (spec 13).** `surface.json` names a committed `DESIGN.md` as `rules`: the rules, what each
  token means, and the known gaps. A surface without one is refused.

## Consequences

- A new stack joins by writing one `surface.json` and its `DESIGN.md`; nothing in `deck/` changes.
- The web adapter passes `--allow-file-access-from-files` so a page can read its token file from file://, and
  only to the throwaway profile.
- A browser at a path the lookup does not know needs `PILOT_LOOK_BROWSER`; QA's run on another machine shows it.
- A `surface.json` is code in effect: its `command` argv runs on `pilot look snap`. It is reviewed as such.

## Rejected

- An MCP-driven design tool (Onlook, Penpot, Open Design): telemetry, metered keys or agent-run plugin code, and
  web-only output.
- A shell string in `surface.json`: injection through a route or the file.
- Driving a window with input to reach a screen: the S27 friction.
- New `deck_post` fields for the look lines: the 800-line cap and the pinned prompt.
