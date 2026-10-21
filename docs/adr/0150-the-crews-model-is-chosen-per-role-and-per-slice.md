---
status: proposed
date: 2026-10-14
tags: [crew, models, cost]
supersedes: []
superseded_by: []
paths: [agents/pilot.md, agents/pilot-co-pilot.md, rules/orchestration.md, agents/pilot-implementer.md, agents/pilot-fundamentalist.md, agents/pilot-fact-sheet.md, agents/pilot-evidence-runner.md]
---
# The crew's model is chosen per role and per slice

We decided that each crew role has a default model with a stated reason in the pilot's Models table, that an implementer runs Sonnet 5.5 on a slice whose header says `Model: sonnet` and Opus otherwise, and that the two mechanical helpers run Haiku 5.5.

## Context

Anthropic released Sonnet 5.5 (2026-09-28) and Haiku 5.5 (2026-10-07). The crew ran Opus on every implementer whatever the slice, and the fundamentalist ran its own six evidence tools and its first-read sweep in an Opus context. The pilot could already override an implementer to Sonnet "when the slice is mechanical against a precise brief", but that judgement was re-made per brief, where nobody saw it at Gate 1.

Anthropic's pages, re-read on 2026-10-14 and quoted as fetched:

- platform.claude.com/docs/en/about-claude/models/overview, the Compare models table:
  - Pricing: Fable 5.1 "$10 / input MTok, $50 / output MTok"; Opus 5.5 "$4 / input MTok, $20 / output MTok"; Sonnet 5.5 "$2 / input MTok, $10 / output MTok"; Haiku 5.5 "From $0.10 / input MTok, From $0.50 / output MTok".
  - Claude API ID: `claude-fable-5-1`, `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`.
  - Description: Opus 5.5 "For long-running agentic coding and knowledge work"; Sonnet 5.5 "The best combination of speed and intelligence"; Haiku 5.5 "For high-volume, latency-sensitive tickets such as classification, extraction, and routing".
- code.claude.com/docs/en/model-config:
  - "The `opus`, `sonnet`, and `haiku` aliases resolve to the newest version on the Anthropic API and to an earlier version on some other providers". Its table gives Anthropic API "Opus 5.5 | Sonnet 5.5 | Haiku 5.5"; Amazon Bedrock and Google Cloud's Agent Platform "Opus 5.5 | Sonnet 4.5 | Haiku 4.5"; Microsoft Foundry "Opus 4.6 | Sonnet 4.5 | Haiku 4.5".
  - "To keep a custom subagent on a smaller model, set `model` in its definition."

## Decision

- **The slice file carries the model** (cheaper-crew L2): the architect writes `Model: sonnet|opus — <why>` under each slice header and `check-slices` refuses a slice without it. A slice is precise when its Interface, Tests and Files owned leave no choice open, its estimated diff is within the small-diff limit, none of its spec lines is assumed, and it does not hit the security trigger (A2); only a precise slice says `sonnet`.
- **Both orchestrators copy the line**: the pilot's and the co-pilot's implementer brief carries the slice's `Model:` line and its reason, and the spawn runs that model.
- **The Models table says why**: pilot Fable; architect, co-pilot, fundamentalist and QA Opus, each with one line of reason; the implementer "Opus; Sonnet on a precise slice"; `pilot-fact-sheet` and `pilot-evidence-runner` Haiku. `rules/orchestration.md` "Pick the model per ticket" says the same.

## Rejected

- *The pilot or co-pilot judging each brief*: the choice would be re-derived per brief and never seen at Gate 1.
- *Precision alone decides, security-trigger slices included*: a weaker model would author the diffs the second reviewer exists for.
- *Haiku for reviewers*: a reviewer's judgement is the product; the helpers' work is mechanical and re-read by an Opus parent.

**Consequences**: a precise slice costs Sonnet's rate, half Opus 5.5's per the table above; on Bedrock, Google Cloud and Foundry the `sonnet` and `haiku` aliases resolve to 4.x models, so a run there gets older helpers unless the user pins the model.
