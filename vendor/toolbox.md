# Vendoring ledger: the toolbox

The agents in `agents/`, the six skills in `skills/` and the language directories of `rules/` that came
from **ECC 2.2.0** (<https://github.com/affaan-m/ECC>), MIT,
Copyright (c) 2026 Affaan Mustafa.

ADR 0003 says we copy rather than depend, so staying current is a manual re-sync and this
file is the map for doing it. The header format and the row format are defined in
`vendor/methodology.md` and used here unchanged; `scripts/check-provenance.mjs` enforces
both directions, so neither a header nor a row can be quietly dropped. The MIT notice
travels in `THIRD-PARTY-NOTICES.md`; ADR 0011 keeps the upstream's name out of every path,
which is why the header inside each file is the only in-tree trace of where it came from.

## Where the header sits

`vendor/methodology.md` puts the header after the YAML frontmatter in a `SKILL.md` and
first in the file everywhere else, because Claude Code needs the frontmatter to open the
file. The real rule is the reason rather than the file type: **the header goes after any
leading frontmatter, and first only in a file that has none.** All thirteen agents have
frontmatter, and so do all 111 rules files — every per-language file carries a
`paths:` block. A header written
above a `---` fence is the failure this is guarding against: the harness then sees no
frontmatter at all and loads none of the file.

## What was not taken

| Left behind | Why |
| --- | --- |
| `hooks/` | L9 and ADR 0007: `*` matchers on four events, and session telemetry whose network behaviour we did not trace. The fact-forcing gate S10 vendored from here (ADR 0025) was removed again (ADR 0078) |
| `orch-*`, `multi-*`, `plan-*`, `loop-*`, `plan-canvas` | L9: this package *is* the orchestration; those are the pipelines it replaces |
| `agents/code-reviewer.md`, `agents/healthcare-reviewer.md`, the other 53 agents | A7: the crew names thirteen, and a small set is what makes a manual re-sync survivable |
| `rules/README.md` | It documents the upstream's own install into a rules namespace this package does not use, which contradicts ADR 0008. This project's own account of the tree is `docs/rules.md`, which carries no provenance header and sits outside `rules/` so that it does not load as a rule |
| `rules/common/` | Shipped up to 0.6.x and retired in 0.7.0: its `agents.md` sends agents to a planner, a tdd-guide and a code-reviewer this setup does not have, and the ten files cost about 4.9k tokens on every spawn. `scripts/install-rules.mjs` deletes a friend's copy only where it is byte-identical to the one that shipped |
| `node_modules/`, `scripts/setup-package-manager.js` | Nothing executable was copied; the toolbox is prompt text and reference content only |

The tables above are documentation. Only the table under `## Vendored files` is read as
the ledger.

## The cut in `skills/tdd-workflow/SKILL.md`

The one file that is a trim rather than a copy, so it is recorded here in full. Upstream
it is 583 lines; here it is under 200, because the implementer preloads it on every slice
and a skill that costs more context than the slice does is a skill that makes the agent
worse at the work.

| Kept | Dropped, and where the job went instead |
| --- | --- |
| The RED gate: runtime RED, compile-time RED, and what does not count as either | The Jest, Vitest, Bun, Playwright, Supabase, Redis and OpenAI code samples — ~250 lines of framework-specific patterns that a reviewer or the language's own rules under `rules/` cover better |
| Red → green → refactor and the minimal implementation | The `src/` test-layout tree and the pre-commit and GitHub Actions snippets — repository conventions, not a method |
| The checkpoint-commit discipline, reachable from the current branch | The `scripts/setup-package-manager.js` detector call: that script is not vendored, so the runner table now says how to read `package.json` and the test files directly |
| Plan files treated as untrusted data, condensed from 20 lines to 8 | The TDD evidence report (Step 8) and the coverage threshold and report (Step 7): both are the slice's **phase gate**, which `skills/verification-loop/SKILL.md` is the checklist for, and the pull request body is where the RED/GREEN summary lands |
| Four ways it goes wrong, trimmed from the eight-example "common mistakes" section | The success-metrics and best-practices lists, which restated the steps above them |

The frontmatter `description` changed with it: the upstream's triggers on a coverage
percentage this skill no longer owns, so it now triggers on the loop it does own.

## Vendored files

| File | Upstream | Adapted | What changed and why |
| --- | --- | --- | --- |
| `agents/build-error-resolver.md` | `agents/build-error-resolver.md` | yes | the four agents under `## When NOT to Use` that this package does not ship dropped (A7); the one it does ship addressed `pilot:` |
| `agents/code-explorer.md` | `agents/code-explorer.md` | verbatim | nothing - reference content, copied as it stands |
| `agents/cpp-reviewer.md` | `agents/cpp-reviewer.md` | verbatim | nothing - reference content, copied as it stands; on the crew for Go, Rust and C++ slices (deck-press-feedback S11, spec 21) |
| `agents/database-reviewer.md` | `agents/database-reviewer.md` | yes | the `postgres-patterns` and `database-migrations` skill references dropped (neither is vendored, A7); findings return as the report table the implementer tabulates; the report format tightened to the table and the verdict line only after a 2026-09-13 QA finding (a heading, a scope paragraph and closing prose slipped past “nothing above it” and the parent session summarised the report as prose instead of copying it) |
| `agents/docs-lookup.md` | `agents/docs-lookup.md` | yes | this package declares no Context7 server (L7: only `deck` and `chrome-devtools`), so `WebFetch` against the library's own docs is the stated primary path and the `mcp__context7__*` tool names are removed; `Read` and `Grep` stay dropped, because an agent that both reads this machine and fetches a URL can be talked into carrying one to the other |
| `agents/go-reviewer.md` | `agents/go-reviewer.md` | verbatim | nothing - reference content, copied as it stands; on the crew for Go, Rust and C++ slices (deck-press-feedback S11, spec 21) |
| `agents/python-reviewer.md` | `agents/python-reviewer.md` | yes | the `python-patterns` skill reference dropped (not vendored, A7); output format replaced by the report table the implementer tabulates; the report format tightened to the table and the verdict line only after a 2026-09-13 QA finding (a heading, a scope paragraph and closing prose slipped past “nothing above it” and the parent session summarised the report as prose instead of copying it) |
| `agents/react-build-resolver.md` | `agents/react-build-resolver.md` | yes | the reference to a build resolver this package does not ship dropped (A7); sibling agent addressed `pilot:`; the skills and slash commands under `## Related` dropped |
| `agents/react-reviewer.md` | `agents/react-reviewer.md` | yes | sibling agents addressed `pilot:`; the skills and slash commands under `## Related` dropped (not vendored, A7); output format replaced by the report table the implementer tabulates; the report format tightened to the table and the verdict line only after a 2026-09-13 QA finding (a heading, a scope paragraph and closing prose slipped past “nothing above it” and the parent session summarised the report as prose instead of copying it) |
| `agents/rust-reviewer.md` | `agents/rust-reviewer.md` | verbatim | nothing - reference content, copied as it stands; on the crew for Go, Rust and C++ slices (deck-press-feedback S11, spec 21) |
| `agents/security-reviewer.md` | `agents/security-reviewer.md` | yes | the `security-review` skill reference dropped (not vendored, A7); findings return as the report table the implementer tabulates; the report format tightened to the table and the verdict line only after a 2026-09-13 QA finding (a heading, a scope paragraph and closing prose slipped past “nothing above it” and the parent session summarised the report as prose instead of copying it); the eslint security-plugin run dropped (it downloads eslint and a plugin on a repo that has neither) and `npm audit` runs only when the diff touches a package manifest or lockfile; an agent-configuration checklist added (hook commands, allow-lists, MCP servers, secrets, skills that run commands), one report row per item; the description names a process start and agent configuration among its triggers |
| `agents/silent-failure-hunter.md` | `agents/silent-failure-hunter.md` | yes | output format replaced by the report table the implementer tabulates; the report format tightened to the table and the verdict line only after a 2026-09-13 QA finding (a heading, a scope paragraph and closing prose slipped past “nothing above it” and the parent session summarised the report as prose instead of copying it) |
| `agents/typescript-reviewer.md` | `agents/typescript-reviewer.md` | yes | the patterns-skill references and the `/react-review` command dropped (none is vendored or registered, A7); sibling agent addressed `pilot:`; findings return as the report table the implementer tabulates; the report format tightened to the table and the verdict line only after a 2026-09-13 QA finding (a heading, a scope paragraph and closing prose slipped past “nothing above it” and the parent session summarised the report as prose instead of copying it) |
| `skills/architecture-decision-records/SKILL.md` | `skills/architecture-decision-records/SKILL.md` | yes | the two agents under `## Integration with Other Skills` replaced by the crew that actually writes ADRs here (A7) |
| `skills/browser-qa/SKILL.md` | `skills/browser-qa/SKILL.md` | yes | the three candidate browser MCPs replaced by the one this package declares, `chrome-devtools-mcp@1.9.0` under `mcp__plugin_pilot_chrome-devtools__*` (L7); the `/canary-watch` command dropped; Web Vitals, dark mode and the breakpoint sweep only when the spec names them, and the QA Report format kept, with `design-review`'s table as its findings section (independence L11) |
| `skills/context-budget/SKILL.md` | `skills/context-budget/SKILL.md` | yes | upstream `metadata.origin` dropped; the provenance header records the origin instead |
| `skills/iterative-retrieval/SKILL.md` | `skills/iterative-retrieval/SKILL.md` | yes | the upstream `## Related` links dropped: a promotional thread, a skill and an install path this package does not ship (A7); `When to Activate`, the loop diagram, `Integration with Agents` and `Best Practices` dropped as restatements of the description and the four phases (independence L8) |
| `skills/tdd-workflow/SKILL.md` | `skills/tdd-workflow/SKILL.md` | yes | cut from 583 lines to the red-green-refactor mechanics an implementer preloads; the framework test patterns, mocking recipes, file-layout tree, CI snippets, the package-manager detector script and the coverage report are dropped, and the wider checks are the slice's phase gate instead (see vendor/toolbox.md); `When to activate` and `What this skill does not cover` dropped as restatements of the description and the opening (independence L8) |
| `skills/verification-loop/SKILL.md` | `skills/verification-loop/SKILL.md` | yes | the `/verify` command and the ECC-hooks section dropped (neither ships, L9); the phase-gate order named so the checklist matches the loop it backs; `When to Use` and `Output Format` dropped as restatements of the description and of the implementer's gate table, and `Continuous Mode` for contradicting that gate's one run on the final state (independence L8) |
| `rules/angular/coding-style.md` | `rules/angular/coding-style.md` | yes | dead common/ link removed |
| `rules/angular/hooks.md` | `rules/angular/hooks.md` | yes | dead common/ link removed |
| `rules/angular/patterns.md` | `rules/angular/patterns.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/angular/security.md` | `rules/angular/security.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/angular/testing.md` | `rules/angular/testing.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/arkts/coding-style.md` | `rules/arkts/coding-style.md` | yes | `paths:` narrowed to the HarmonyOS markers, `**/*.ts` dropped so a plain TypeScript file does not load it (L7); dead common/ link removed |
| `rules/arkts/hooks.md` | `rules/arkts/hooks.md` | yes | `paths:` narrowed to the HarmonyOS markers, `**/*.ts` dropped so a plain TypeScript file does not load it (L7); dead common/ link removed |
| `rules/arkts/patterns.md` | `rules/arkts/patterns.md` | yes | `paths:` narrowed to the HarmonyOS markers, `**/*.ts` dropped so a plain TypeScript file does not load it (L7); dead common/ link removed |
| `rules/arkts/security.md` | `rules/arkts/security.md` | yes | `paths:` narrowed to the HarmonyOS markers, `**/*.ts` dropped so a plain TypeScript file does not load it (L7); dead common/ link removed |
| `rules/arkts/testing.md` | `rules/arkts/testing.md` | yes | `paths:` narrowed to the HarmonyOS markers, `**/*.ts` dropped so a plain TypeScript file does not load it (L7); dead common/ link removed |
| `rules/cpp/coding-style.md` | `rules/cpp/coding-style.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/cpp/hooks.md` | `rules/cpp/hooks.md` | yes | dead common/ link removed |
| `rules/cpp/patterns.md` | `rules/cpp/patterns.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/cpp/security.md` | `rules/cpp/security.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/cpp/testing.md` | `rules/cpp/testing.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/csharp/coding-style.md` | `rules/csharp/coding-style.md` | yes | dead common/ link removed |
| `rules/csharp/hooks.md` | `rules/csharp/hooks.md` | yes | dead common/ link removed |
| `rules/csharp/patterns.md` | `rules/csharp/patterns.md` | yes | dead common/ link removed |
| `rules/csharp/security.md` | `rules/csharp/security.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/csharp/testing.md` | `rules/csharp/testing.md` | yes | dead common/ link removed |
| `rules/dart/coding-style.md` | `rules/dart/coding-style.md` | yes | dead common/ link removed |
| `rules/dart/hooks.md` | `rules/dart/hooks.md` | yes | dead common/ link removed |
| `rules/dart/patterns.md` | `rules/dart/patterns.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/dart/security.md` | `rules/dart/security.md` | yes | dead common/ link removed |
| `rules/dart/testing.md` | `rules/dart/testing.md` | yes | dead common/ link removed |
| `rules/fsharp/coding-style.md` | `rules/fsharp/coding-style.md` | yes | dead common/ link removed |
| `rules/fsharp/hooks.md` | `rules/fsharp/hooks.md` | yes | dead common/ link removed |
| `rules/fsharp/patterns.md` | `rules/fsharp/patterns.md` | yes | dead common/ link removed |
| `rules/fsharp/security.md` | `rules/fsharp/security.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/fsharp/testing.md` | `rules/fsharp/testing.md` | yes | dead common/ link removed |
| `rules/golang/coding-style.md` | `rules/golang/coding-style.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/golang/hooks.md` | `rules/golang/hooks.md` | yes | dead common/ link removed |
| `rules/golang/patterns.md` | `rules/golang/patterns.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/golang/security.md` | `rules/golang/security.md` | yes | dead common/ link removed |
| `rules/golang/testing.md` | `rules/golang/testing.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/java/coding-style.md` | `rules/java/coding-style.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/java/hooks.md` | `rules/java/hooks.md` | yes | dead common/ link removed |
| `rules/java/patterns.md` | `rules/java/patterns.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/java/security.md` | `rules/java/security.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/java/testing.md` | `rules/java/testing.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/kotlin/coding-style.md` | `rules/kotlin/coding-style.md` | yes | dead common/ link removed |
| `rules/kotlin/hooks.md` | `rules/kotlin/hooks.md` | yes | dead common/ link removed |
| `rules/kotlin/patterns.md` | `rules/kotlin/patterns.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/kotlin/security.md` | `rules/kotlin/security.md` | yes | dead common/ link removed |
| `rules/kotlin/testing.md` | `rules/kotlin/testing.md` | yes | dead common/ link removed |
| `rules/nuxt/coding-style.md` | `rules/nuxt/coding-style.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/nuxt/hooks.md` | `rules/nuxt/hooks.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/nuxt/patterns.md` | `rules/nuxt/patterns.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/nuxt/security.md` | `rules/nuxt/security.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/nuxt/testing.md` | `rules/nuxt/testing.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/perl/coding-style.md` | `rules/perl/coding-style.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/perl/hooks.md` | `rules/perl/hooks.md` | yes | dead common/ link removed |
| `rules/perl/patterns.md` | `rules/perl/patterns.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/perl/security.md` | `rules/perl/security.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/perl/testing.md` | `rules/perl/testing.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/php/coding-style.md` | `rules/php/coding-style.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/php/hooks.md` | `rules/php/hooks.md` | yes | dead common/ link removed |
| `rules/php/patterns.md` | `rules/php/patterns.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/php/security.md` | `rules/php/security.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/php/testing.md` | `rules/php/testing.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/python/coding-style.md` | `rules/python/coding-style.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/python/fastapi.md` | `rules/python/fastapi.md` | yes | unshipped skill pointers removed |
| `rules/python/hooks.md` | `rules/python/hooks.md` | yes | dead common/ link removed |
| `rules/python/patterns.md` | `rules/python/patterns.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/python/security.md` | `rules/python/security.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/python/testing.md` | `rules/python/testing.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/react-native/accessibility.md` | `rules/react-native/accessibility.md` | verbatim | `paths:` narrowed to the React Native markers (`*.native`, `*.ios`, `*.android` .ts/.tsx, `metro.config.*`, `react-native.config.*`, `app.json`), so a plain TypeScript file does not load it (L7); body as it stands |
| `rules/react-native/coding-style.md` | `rules/react-native/coding-style.md` | yes | `paths:` narrowed to the React Native markers (`*.native`, `*.ios`, `*.android` .ts/.tsx, `metro.config.*`, `react-native.config.*`, `app.json`), so a plain TypeScript file does not load it (L7); dead common/ link removed |
| `rules/react-native/hooks.md` | `rules/react-native/hooks.md` | yes | `paths:` narrowed to the React Native markers (`*.native`, `*.ios`, `*.android` .ts/.tsx, `metro.config.*`, `react-native.config.*`, `app.json`), so a plain TypeScript file does not load it (L7); dead common/ link removed |
| `rules/react-native/patterns.md` | `rules/react-native/patterns.md` | yes | `paths:` narrowed to the React Native markers (`*.native`, `*.ios`, `*.android` .ts/.tsx, `metro.config.*`, `react-native.config.*`, `app.json`), so a plain TypeScript file does not load it (L7); dead common/ link removed |
| `rules/react-native/performance.md` | `rules/react-native/performance.md` | yes | `paths:` narrowed to the React Native markers (`*.native`, `*.ios`, `*.android` .ts/.tsx, `metro.config.*`, `react-native.config.*`, `app.json`), so a plain TypeScript file does not load it (L7); dead common/ link removed |
| `rules/react-native/production-readiness.md` | `rules/react-native/production-readiness.md` | verbatim | `paths:` narrowed to the React Native markers (`*.native`, `*.ios`, `*.android` .ts/.tsx, `metro.config.*`, `react-native.config.*`, `app.json`), so a plain TypeScript file does not load it (L7); body as it stands |
| `rules/react-native/security.md` | `rules/react-native/security.md` | yes | `paths:` narrowed to the React Native markers (`*.native`, `*.ios`, `*.android` .ts/.tsx, `metro.config.*`, `react-native.config.*`, `app.json`), so a plain TypeScript file does not load it (L7); dead common/ link removed |
| `rules/react-native/testing.md` | `rules/react-native/testing.md` | yes | `paths:` narrowed to the React Native markers (`*.native`, `*.ios`, `*.android` .ts/.tsx, `metro.config.*`, `react-native.config.*`, `app.json`), so a plain TypeScript file does not load it (L7); dead common/ link removed |
| `rules/react/coding-style.md` | `rules/react/coding-style.md` | yes | dead common/ link removed; deduped against typescript/react/web; generic advice removed; the **/hooks/** path globs dropped (they matched this repository's Claude Code hooks/ scripts, audit F9) |
| `rules/react/hooks.md` | `rules/react/hooks.md` | yes | dead common/ link removed; deduped against typescript/react/web; generic advice removed; the **/hooks/** path globs dropped (they matched this repository's Claude Code hooks/ scripts, audit F9) |
| `rules/react/patterns.md` | `rules/react/patterns.md` | yes | dead common/ link and unshipped skill pointers removed; deduped against typescript/react/web; generic advice removed |
| `rules/react/security.md` | `rules/react/security.md` | yes | dead common/ link removed; deduped against typescript/react/web; generic advice removed |
| `rules/react/testing.md` | `rules/react/testing.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/ruby/coding-style.md` | `rules/ruby/coding-style.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/ruby/hooks.md` | `rules/ruby/hooks.md` | yes | dead common/ link removed |
| `rules/ruby/patterns.md` | `rules/ruby/patterns.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/ruby/security.md` | `rules/ruby/security.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/ruby/testing.md` | `rules/ruby/testing.md` | yes | dead common/ link removed |
| `rules/rust/coding-style.md` | `rules/rust/coding-style.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/rust/hooks.md` | `rules/rust/hooks.md` | yes | dead common/ link removed |
| `rules/rust/patterns.md` | `rules/rust/patterns.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/rust/security.md` | `rules/rust/security.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/rust/testing.md` | `rules/rust/testing.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/swift/coding-style.md` | `rules/swift/coding-style.md` | yes | dead common/ link removed |
| `rules/swift/hooks.md` | `rules/swift/hooks.md` | yes | dead common/ link removed |
| `rules/swift/patterns.md` | `rules/swift/patterns.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/swift/security.md` | `rules/swift/security.md` | yes | dead common/ link removed |
| `rules/swift/testing.md` | `rules/swift/testing.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/typescript/coding-style.md` | `rules/typescript/coding-style.md` | yes | dead common/ link removed; deduped against typescript/react/web; generic advice removed |
| `rules/typescript/hooks.md` | `rules/typescript/hooks.md` | yes | dead common/ link removed; deduped against typescript/react/web; generic advice removed |
| `rules/typescript/patterns.md` | `rules/typescript/patterns.md` | yes | dead common/ link removed; deduped against typescript/react/web; generic advice removed |
| `rules/typescript/security.md` | `rules/typescript/security.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/typescript/testing.md` | `rules/typescript/testing.md` | yes | dead common/ link removed |
| `rules/vue/coding-style.md` | `rules/vue/coding-style.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/vue/hooks.md` | `rules/vue/hooks.md` | yes | `paths:` narrowed from every .ts/.tsx to `*.vue` and `composables/**/*.ts`, so a plain TypeScript file does not load it (L7); dead common/ link and unshipped skill pointers removed |
| `rules/vue/patterns.md` | `rules/vue/patterns.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/vue/security.md` | `rules/vue/security.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/vue/testing.md` | `rules/vue/testing.md` | yes | dead common/ link and unshipped skill pointers removed |
| `rules/web/coding-style.md` | `rules/web/coding-style.md` | yes | dead common/ link removed; deduped against typescript/react/web; generic advice removed |
| `rules/web/design-quality.md` | `rules/web/design-quality.md` | yes | dead common/ link removed; deduped against typescript/react/web; generic advice removed |
| `rules/web/hooks.md` | `rules/web/hooks.md` | yes | dead common/ link removed; deduped against typescript/react/web; generic advice removed |
| `rules/web/patterns.md` | `rules/web/patterns.md` | yes | dead common/ link removed; deduped against typescript/react/web; generic advice removed |
| `rules/web/performance.md` | `rules/web/performance.md` | yes | dead common/ link removed; deduped against typescript/react/web; generic advice removed |
| `rules/web/security.md` | `rules/web/security.md` | yes | dead common/ link removed; deduped against typescript/react/web; generic advice removed |
| `rules/web/testing.md` | `rules/web/testing.md` | yes | dead common/ link removed; deduped against typescript/react/web; generic advice removed |
