---
area: context
owner: explorer
model: haiku
spec: [8, 9]
---

# Context load and tooling

Always-loaded tokens per source, and tooling that costs an agent manual,
multi-step work a server or a CLI would replace. The script measures; you
transcribe and judge.

## Measure

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/audit-context.mjs" <repo> --home <home>`, read-only, deterministic, and
   always JSON.
2. Read its rows: `source`, `scope` (`repo` or `user`), `kind`, `tokens` (an estimate, bytes / 4), and for a
   `path-rule` its `matches` and `matchCount` (`null` when `git ls-files` itself failed, not zero) and, when present,
   `skipped` for the globs it refused rather than compiled; a `kind` of `unreadable` is a settings or `.mcp.json`
   file that exists but would not parse, named as a finding rather than silently dropped; for a `hook` its `event`
   and `matcher`.
3. A plugin hook or MCP server the script cannot see - configured by an installed plugin, not this repository's own
   files or the user's `~/.claude` - is named in `unmeasured`, never guessed.
4. Never count this package's own agents or skills (A4: `measure-prompt.mjs`'s and `context-budget`'s job); never
   read the harness's private plugin registry. Print no file's contents, no env var's value and no token, only
   paths, byte counts, matchers and estimates.
5. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/audit-session-start.mjs" <repo> --home <home>`: what the newest 40
   sessions of this repository actually started with, from their transcripts. Per session `role` (`pilot`, `plain`
   or `unknown`), `firstCallTokens` (measured by the API, not estimated; `null` with `unreadable` true for a
   transcript it could not read, which goes in `unmeasured`), `byClear`, `pickup` (it was handed a
   pilot's hand-off), `sources` in tokens (bytes / 4) with `unrecorded` the measured total less every recorded
   source, which is the tool definitions and base prompt. `summary` gives `pilot` and `plain` their `sessions`,
   `min`, `median` and `max`, `pickupsWithoutPilot` the session ids, and `instructions` each loaded file with its
   tokens, from the newest session. It prints no transcript content; quote none either.

## Rows

One row per finding, in S1's Row shape, area `context` or `tooling`:

- **context**: a path-scoped rule whose `matches` are not its own language (ADR 0036's `react/` rule matching a
  repository with no React); a large always-loaded source worth trimming or splitting.
- **tooling**: a hook on a broad `matcher` (`*`, or wider than the one event it needs) or a large estimated size; a
  manual multi-step flow a missing MCP server or CLI would replace.
- **context**, from the session-start script, always one row stating the `pilot` and `plain` `median` first-call
  tokens and their range, even with nothing wrong, so each audit carries the figures; then a row per:
  - any `pickupsWithoutPilot`: a hand-off landed in a session that was not the pilot, which pays the plain start
    and loses the pilot's tools and rules; `saving` is the plain median less the pilot median, per pickup;
  - a source that is over a quarter of the pilot median, named with its tokens, and for `instructions` its
    largest files;
  - a `hookContext` over 3,000 tokens in any session, with that session's id.

`command` is the script invocation above; `output` is the row's fields. A row about a large source takes its `fix`
from Trimming below: the technique by name, the files it touches, and `saving.tokens` as the tokens of what would
stop loading, from the script's figures, never a guess.

## Trimming

What an always-loaded source can do instead of loading every session. You recommend; the user decides, because
a `CLAUDE.md` or rule is often their own words. Prefer the first technique that fits:

1. **Delete what contradicts or repeats a higher source.** A rule naming agents, commands or a workflow that the
   user's `CLAUDE.md` or this repository says is superseded, or not installed, costs tokens and misleads. Name the
   two lines that disagree. A file carrying a vendor provenance header is a copy, cheaper to drop than one the
   user wrote.
2. **A document about the rules is not a rule.** Every `.md` under a loaded `rules/` directory loads, a `README`
   included; move it out of the directory.
3. **Scope a language or tool rule to its files** with `paths:` frontmatter, so it loads only when a matching file
   is read. Name the globs; `audit-context.mjs` shows what they would match.
4. **Move a procedure into a skill.** Steps needed in some sessions only (a release, a migration, a review
   checklist) become a skill, which costs its one-line description until it is invoked.
5. **Move what one agent needs into that agent's definition**, out of the file every session loads.
6. **Keep the instruction, drop the history.** Dated quotes, incidents and rationale belong in an ADR or a doc the
   instruction links to; the line that changes behaviour stays.
7. **Follow `@` imports.** A `@path` in a `CLAUDE.md` loads that whole file every session; count it with the file
   that imports it.
8. **Turn off a plugin or MCP server this repository never uses** in its `.claude/settings.json`
   (`enabledPlugins` set to `false`; project settings override user settings, and `.claude/settings.local.json`
   keeps it to this user), which removes its skills, agents and tool names from the skill, agent and
   deferred-tool listings. Name what it ships that this repository would use before recommending it.

## Return

The rows as JSON the auditor merges (`area`, `finding`, `command`, `output`,
`exit`, `fix`, `saving: { minutes, tokens }`, `effort`, `spec` per row), plus
one line of friction, with evidence.
