# Vendoring ledger: the methodology skills

The skills in `skills/` that came from **mattpocock-skills 1.2.3**
(<https://github.com/mattpocock/skills>), MIT, Copyright (c) 2026 Matt Pocock.

ADR 0003 says we copy rather than depend, so staying current is a manual re-sync and
this file is the map for doing it: every row names what was taken, from where, and what
this project changed. `scripts/check-provenance.mjs` enforces it in both directions, so
neither a header nor a row can be quietly dropped. The MIT notice travels in
`THIRD-PARTY-NOTICES.md`; ADR 0011 keeps the upstream's name out of every path, which is
why the header below is the only in-tree trace of where a file came from.

`vendor/toolbox.md` is the same ledger for the ECC toolbox and uses the format defined
here unchanged.

## The provenance header

Every vendored file carries this block. **The header goes after any leading frontmatter,
and first only in a file that has none:** in a `SKILL.md` that means immediately after the
YAML frontmatter, because Claude Code requires the frontmatter to open the file; a file
with no frontmatter takes the header first. Every vendored file in this package is
markdown, so the block is an HTML comment: invisible when rendered, present when read.

```md
<!-- provenance
upstream: mattpocock-skills 1.2.3 - skills/productivity/grilling/SKILL.md
copyright: Copyright (c) 2026 Matt Pocock
licence: MIT - see THIRD-PARTY-NOTICES.md
adapted: the numbered frontier round becomes an item per question on the deck (ADR 0004)
ledger: vendor/methodology.md
-->
```

| Field | What it holds |
| --- | --- |
| `upstream` | the upstream project, its version, ` - `, and the file's path inside that project |
| `copyright` | the upstream copyright line, copied from its `LICENSE` |
| `licence` | the licence and where its full text lives in this repository |
| `adapted` | `verbatim`, or one line saying what changed and why |
| `ledger` | the ledger fragment carrying this file's row |

All five are required; a missing one fails `check-provenance.mjs`. The separator between
the version and the path is ` - `, because the checker compares only the path part of
`upstream` against the ledger row.

## The ledger row

One markdown table per ledger, under a `## Vendored files` heading, with these four
columns in this order. `File` is the path in this repository, `Upstream` is the path
inside the upstream project (the two must agree with the header), and `Adapted` is
`verbatim` or `yes`. Only rows under that heading are read, so everything above it —
including the tables in this section — is documentation and nothing else.

## Vendored files

Fourteen copied files: 861 lines in the upstream originals, 807 after adaptation, of which
103 differ from upstream. The reasoning in every one of them is upstream's and is left
alone; what changed is the output shape and the transport.

The fifteenth row is not a copy. `skills/teaching-a-decision/SKILL.md` carries no upstream
text at all; it is listed because it uses five of `/teach`'s principles by name, and a
credit no checker reads is a credit that rots. Re-syncing it means re-reading those five
principles, not diffing the file.

| File | Upstream | Adapted | What changed and why |
| --- | --- | --- | --- |
| `skills/grilling/SKILL.md` | `skills/productivity/grilling/SKILL.md` | yes | The frontier is still computed whole and goes to the deck sharpest first, an item per question — independent questions together, one at a time only where one answer would change another question. The numbered round and its `❓ Q1 / ➡️` format block are gone: the deck is a queue of threads (ADR 0004), and several open threads are several conversations where a numbered list inside one item is a form. The thread is worked with the deck's whole vocabulary: `deck_wait` to park once on an answer instead of polling `deck_read`, `deck_reply` to push back on one, `deck_resolve` to close it saying what it settled. A question asks for one decision and a bundle is split into items; the body is short by default, longer only where the decision cannot be put fairly without its context; grilling probes harder; and pushback is its own paragraph — why in a line, the risk, the question once more, then the user decides and the objection is recorded as `overridden:` (crew-voice-rules spec 5 to 8). A default resting on practice outside the repository, a library's current API, a security, privacy, data or licensing rule, a standard the user named or the user's asking is researched before its question goes up, the body carrying one `Research:` line, and an overturned default is said in one reply (research-first spec 1, 2, 7). |
| `skills/domain-modeling/SKILL.md` | `skills/engineering/domain-modeling/SKILL.md` | yes | The `CONTEXT.md` / `CONTEXT-MAP.md` file-structure section is replaced by one paragraph naming the run's artefact section 3 as the glossary and `docs/adr/` as the decision record, and saying how a locked decision differs from an ADR. "Update CONTEXT.md inline" becomes "Update the glossary inline". |
| `skills/domain-modeling/GLOSSARY-FORMAT.md` | `skills/engineering/domain-modeling/CONTEXT-FORMAT.md` | yes | Renamed, because the file it described no longer exists here. The structure example is now an artefact section 3 entry — bold term, em dash, definition, then what it is not — and the single-vs-multi-context section is dropped: a run is one context by construction. |
| `skills/domain-modeling/ADR-FORMAT.md` | `skills/engineering/domain-modeling/ADR-FORMAT.md` | yes | The template is the shape of the ten ADRs already in `docs/adr/`: title as a sentence, one paragraph that includes the rejected alternative, an optional `**Consequences**` line. The template opens with a six-key front matter block (status, date, tags, supersedes, superseded_by, paths) for navigation, and a repository's own rule naming another schema wins; the separate Considered Options section is dropped. Under a piloted run the number is the placeholder `NNNN` until the landing allocates the next free one, so parallel runs never collide. The three tests for whether a decision earns an ADR are untouched. |
| `skills/codebase-design/SKILL.md` | `skills/engineering/codebase-design/SKILL.md` | verbatim | Nothing. It is vocabulary, and the vocabulary is the point. |
| `skills/codebase-design/DEEPENING.md` | `skills/engineering/codebase-design/DEEPENING.md` | verbatim | Nothing. |
| `skills/codebase-design/DESIGN-IT-TWICE.md` | `skills/engineering/codebase-design/DESIGN-IT-TWICE.md` | yes | The problem-space explanation is posted to the deck instead of shown in chat; "3+ sub-agents" becomes three or four, which is the architect's whole child budget; the sub-agent brief takes its domain vocabulary from the artefact's section 3. |
| `skills/wizard/SKILL.md` | `skills/engineering/wizard/SKILL.md` | yes | A stage is a `walkthrough` item on the deck, not a prompt in a terminal: posted one at a time, with the URL, the numbered clicks and exactly what to reply. A new section says a secret never travels through the deck — the human runs `gh secret set` themselves and the agent verifies the effect, never the value. A stage is parked on with `deck_wait`, corrected with `deck_reply` when a reply cannot be right, and closed with `deck_resolve` before the next is posted. |
| `skills/diagnosing-bugs/SKILL.md` | `skills/engineering/diagnosing-bugs/SKILL.md` | yes | Five lines. The loop-construction list's tenth entry and the "agent-runnable" checkbox point at a deck `walkthrough` item rather than a terminal script; the ranked hypotheses and the cannot-build-a-loop escalation are posted to the deck; the codebase-exploration line reads the artefact instead of a `CONTEXT.md`; the walkthrough is parked on with `deck_wait` rather than re-read in a loop. Phases 1 to 6 are otherwise untouched. |
| `skills/resolving-merge-conflicts/SKILL.md` | `skills/engineering/resolving-merge-conflicts/SKILL.md` | yes | Four lines. Step 2 names the slice file as a primary source of intent; step 3 regenerates a generated file by its generator rather than merging it by hand, naming `node scripts/adr-index.mjs` for this package's ADR index; step 4 is the slice's phase gate rather than "typecheck, then tests, then format", because this package has no type check; step 5 stages by name rather than staging everything. |
| `skills/tdd/SKILL.md` | `skills/engineering/tdd/SKILL.md` | yes | Five lines. The glossary is the artefact's section 3; the seams under test are confirmed as a deck `question` item; the two sibling skills are named `pilot:codebase-design` and `pilot:code-review`. |
| `skills/tdd/tests.md` | `skills/engineering/tdd/tests.md` | verbatim | Nothing. |
| `skills/tdd/mocking.md` | `skills/engineering/tdd/mocking.md` | verbatim | Nothing. |
| `skills/teaching-a-decision/SKILL.md` | `skills/productivity/teach/SKILL.md` | yes | Not a copy: no upstream text is here, and the row exists for the credit rather than for a diff. Five of `/teach`'s principles are used by name — why this matters before what it is, teach inside what the learner already knows, one tangible win, small enough to hold in working memory, cite the source rather than memory. Everything else is dropped: `/teach` is a multi-session workspace with a mission file, a learning record, one lesson file per session and a retention schedule, and this is one decision taught in a deck thread now: a diagnostic question, one step per reply, an explain-back held to a criterion, and a worked step on "just tell me" — six rules the body cites from the tutoring literature, not from `/teach` (D24, ADR 0020; L14, ADR 0032). |
| `skills/code-review/SKILL.md` | `skills/engineering/code-review/SKILL.md` | yes | The two axes go to one fresh-context reviewer as two separately-answered questions instead of two parallel sub-agents, because fanning out over a single diff is what the child budget exists to prevent; the separation that matters is in the report, and step 5 keeps it. The spec source is the slice file, and the issue-tracker lookup — which pointed at a setup command that is not vendored — is replaced by the PR and `gh`. Fowler's smell baseline is untouched. |

## What was deliberately not taken

| Not taken | Why |
| --- | --- |
| `agents/openai.yaml` beside every skill | Interface metadata for a different harness. Porting beyond Claude Code is out of scope for this design. |
| `skills/engineering/wizard/template.sh` (204 lines) | It no longer earns its place. Its value was the terminal UX — stage progress, confirmation gates, hidden secret entry — and every part of that is now the deck item and its reply, except the one part the deck must not do: take a secret. A bash script also cannot post a deck item, since the deck's HTTP surface is `GET /` and `POST /reply` only and posting is MCP. Shipping it would ship a second inbox, which is what ADR 0004 exists to prevent. The secret path it did cover is kept as instructions: the human runs the command, the agent verifies the effect. |
| `skills/engineering/diagnosing-bugs/scripts/hitl-loop.template.sh` (44 lines) | Same reason, more sharply: it reads from the terminal's stdin, and an agent driving the loop has no interactive terminal to read from. A human in the loop is a deck `walkthrough` item. |
| The `in-progress/` and `misc/` trees (12 skills) | Unregistered upstream, and excluded by the design's scope section. |
| `ask-matt`, `grill-with-docs`, `grill-me`, `implement`, `improve-codebase-architecture`, `prototype`, `research`, `setup-matt-pocock-skills`, `teach`, `to-spec`, `to-tickets`, `to-questionnaire`, `triage`, `wait-what`, `wayfinder`, `handoff`, `writing-for-agents` | Not named by the crew (A7). Keeping the vendored set small is what makes a manual re-sync survivable. `teach` is the one the crew came back for, and it is still not taken: its principles are borrowed by `skills/teaching-a-decision/SKILL.md`, its text and its workspace are not. |

## Re-syncing

Upstream is `mattpocock-skills`, installed at
`~/.claude/plugins/cache/claude-plugins-official/mattpocock-skills/<version>`. To re-sync,
diff each row's upstream file against the version recorded in its header, and re-apply
only the changes to the reasoning: the shape changes in the fourth column above are this
project's and are meant to survive. Bump the version in every header you touch, and in
the row.
