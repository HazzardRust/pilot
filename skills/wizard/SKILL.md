---
name: wizard
description: Walk a human through steps only they can perform, one deck item at a time. Use when provisioning infrastructure, setting up credentials or CI secrets, walking an unfamiliar third-party dashboard, or running a one-off migration or cutover. Don't invoke this for steps the agent can perform itself.
---
<!-- provenance
upstream: mattpocock-skills 1.2.3 - skills/engineering/wizard/SKILL.md
copyright: Copyright (c) 2026 Matt Pocock
licence: MIT - see THIRD-PARTY-NOTICES.md
adapted: a stage is a deck walkthrough item instead of a terminal prompt, waited on and resolved on the deck's own tools; the interactive bash template is dropped
ledger: vendor/methodology.md
-->

# Wizard

A **wizard** walks a human, step by step, through a manual procedure that's tedious to do by hand and tedious to re-explain to an AI every time. It gives them each URL, says exactly what to click and copy, takes back the values, writes them where they belong, confirms at every stage, and says how many stages are left. It might configure third-party services, run a one-off migration, or move the project from one state to another.

Each stage is one **deck item**, not a prompt in a terminal. The human's inbox is the deck (ADR 0004): they are already in a browser, which is where the dashboard you are sending them to lives, and a stage they can come back to an hour later beats a script that blocks a terminal until they do. **Your job is to scope the procedure, author its stages, and run them one at a time.**

A wizard is ephemeral: it exists as the run of deck items, and when the last one is resolved it is done. If the procedure should be repeatable, write it up as a document in `docs/` and link it from the README, so the next person follows the document instead of asking an AI.

## Secrets never go through the deck

The deck refuses to store anything shaped like a key or a token (A6), and that refusal is right: the store is plain JSON on disk. So a wizard never asks a human to paste a secret into a deck item. For a secret value, the stage instead tells them the exact command to run themselves — `gh secret set STRIPE_SECRET_KEY`, or the line to add to an ignored `.env.local` — and asks them to reply only with confirmation that they did it. You then verify the *effect* without ever seeing the value: `gh secret list` shows the name and its updated timestamp, and `git check-ignore .env.local` proves the file cannot be committed.

Public values — a project ID, a publishable key, an account slug, a region — come back in the reply as normal, and you write them where they belong yourself.

## Process

### 1. Scope the procedure

Work out every manual step the human must take and every value that gets captured along the way. Read the repo first, don't ask cold:

- For setup: `.env`, `.env.example`, `.env.*`, `README`, `docker-compose*`, framework config, and `.github/workflows/*` (every `secrets.*` / `vars.*` reference is a value the wizard must produce).
- For a migration or transition: the current state, the target state, and the irreversible actions between them.

Then post the ordered list of stages and the values each produces as one `question` item on the deck, and wait for the reply: they may add, drop, or reorder. This is the one stage worth blocking on, because reordering after the human has already done stage 3 costs them the work.

**Done when:** every stage is named in order, and for each captured value you know (a) where the human gets it, (b) where it's written (`.env.local`, a GitHub secret, both, or nowhere; some stages are pure actions), and (c) whether it's secret — in which case the human writes it and you never see it — or public.

### 2. Map each stage's journey

For each stage, write the precise path a human follows: which URL to open, what to do there, where a value is shown, which variable it fills: e.g. "Dashboard → Developers → API keys → Reveal test key → copy". Where you don't actually know the current UI or the exact command, say so and ask the user or check the docs: never invent steps that may not exist.

**Done when:** every stage traces to concrete instructions a stranger could follow.

### 3. Run the stages, one item at a time

Post stage *n* with `mcp__plugin_pilot_deck__deck_post`, then wait for the human: the pilot and the crew keep a background `pilot wait --as <kind> --item <id>` (the crew's wait names its own thread); any other agent parks once on `mcp__plugin_pilot_deck__deck_wait` with the time it is willing to wait rather than polling — a stage is the one thing you have nothing to get on with behind; `mcp__plugin_pilot_deck__deck_read` is for coming back to the thread after being away. Act on the reply, close the stage with `mcp__plugin_pilot_deck__deck_resolve` saying what it produced, and only then post stage *n + 1*. Posting them all at once turns an ordered procedure into a pile.

When a reply cannot be right — a value of the wrong shape, a step they say they cannot find — say so with `mcp__plugin_pilot_deck__deck_reply` in the same thread rather than reposting the stage, so the human keeps one place to look for one stage.

Each item:

- `kind`: `walkthrough`
- `title`: `Stage n/N - <what this stage achieves>`, so the count the terminal used to show is in the title
- `url`: the stage's locator (a URL, a file path, a host), rather than in the body
- `dir`: the working directory, whenever the stage's step is a command
- `body`: the numbered clicks, then exactly what to reply with — the value, or `done` for a pure action

Hold the bar the terminal version held. Give the URL before asking for the value that lives behind it. Say what a secret stage's command is rather than asking for the secret. Say plainly, in the body, when a stage is irreversible, and make that stage's reply a confirmation on its own — do not bundle an irreversible action with a value to copy, because the human will skim to the paste box. Keep a stage to one focused ticket.

Between stages, do the writing yourself: upsert public values into the ignored env file, run `gh variable set` for CI variables, and re-read what you wrote.

### 4. Verify and hand off

- After each reply, verify the effect rather than trusting the confirmation: the value is in the file you wrote, `gh secret list` names the secret the human set, `git check-ignore` agrees the env file is ignored.
- Every value scoped in step 1 has landed where step 1 said, and every secret name matches a `secrets.*` reference in CI exactly.
- Close with a `signoff` item summarising what was set, what the human set themselves, and anything left undone. If the procedure should be repeatable, write it up in `docs/` and link it from the README.
