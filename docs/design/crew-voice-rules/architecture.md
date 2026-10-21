# Crew voice and shipped rules

Feature `crew-voice-rules` · base `main` at a7c92e7 · one run, 12 slices

## 1. Problem

The crew talks too much and grills too little. The fundamentalist confirms designs
instead of attacking them. The pilot and the agents narrate their steps in a terminal
that is no longer the primary interface. Deck messages are long by default, when the
user would rather ask for more. Grilling questions bundle several decisions, and there
are too few of them, especially on security. The pilot accepts unadvisable directions
without pushing back.

On the rules side, the shipped rules cost context, and some defer to a CLAUDE.md that a
fresh install does not have. The install also never updates a file it already copied.

Separately, a ticket appended to the deck's queue skipped the ticket-making skill, so the
deck must refuse a ticket body that is not in its shape.

## 2. Spec

Numbers are stable. *Assumed* marks a line the user has not confirmed.

| # | Behaviour | Evidence |
|---|---|---|
| 1 | The fundamentalist argues against the design. Its report opens with **The case against**: the strongest argument that the design is wrong, the design it would have built instead, and what the feature could do without. A `clean` verdict names what it tried to break and why it held. | *A sentence test pins all three in `agents/pilot-fundamentalist.md`.* |
| 2 | The pilot and the crew do not explain themselves to the terminal unasked. They print state (what is running, what command just ran, what they are on), questions and results; design correspondence lives in threads; the user asks for anything more. The rule is written as "no unasked explanation", never as "less verbosity" or "less thinking". | *The definitions say so in those words. `scripts/measure-voice.mjs`: median visible terminal text per turn ≤ 300 chars on the measured run, never counting thinking blocks; reasoning tokens per turn reported beside it and not lower (L3).* |
| 3 | Deck messages and reports are short by default, and detail comes on request. | *Same script: median `deck_reply`/`deck_post` body bytes per kind, before and after; lower, as a ratio judged at Gate 2, no threshold (L10).* |
| 4 | Depth scales with risk. | *Each crew definition names when longer is right: security, irreversible data, the Gate 1 walk, a pushback.* |
| 5 | A grilling question asks for one decision and is short by default. It runs longer only when the decision cannot be put fairly without the context. | *Grilling instructions say so. On the measured run the median `question` body is ≤ 600 chars.* |
| 6 | A question that bundles decisions is split. | *Grilling skill and pilot.md §3 say so; a test pins it.* |
| 7 | Grilling probes harder. Security (auth, secrets, user input, data exposure, permissions) is the densest frontier, with one question per risk. | *On a run touching security, each distinct risk has its own `question` item.* |
| 8 | The pilot pushes back on an unadvisable answer: why in one line, the risk, and the question asked once more. Then the user's word decides, and the overridden objection is recorded. Pushback is a section of its own in pilot.md and the grilling skill, not a clause (itm_5d3985b83d01: "make that characteristic thicker in the prompting, it is very necessary"). | *pilot.md says so; an override shows as an `overridden:` line under the decision in the artefact.* |
| 9 | Every shipped rules file has a verdict: keep, update, prune or remove. | *The §5 L16 table, one row per directory where its files share a verdict and per file where they differ (form assumed, A6).* |
| 10 | The rules' context footprint is measured before and after, and is smaller: always-loaded, and per trigger (a .ts/.tsx/.js/.py read). | *`node scripts/measure-rules.mjs` before and after, against the §3 baseline.* |
| 11 | No shipped rules file depends on a CLAUDE.md. | *`rules/orchestration.md` (was :38) and `rules/vertical-execution.md` (was :142) read complete without one; `grep -rn CLAUDE.md rules/` is empty.* |
| 12 | `scripts/check-references.mjs` fails when a shipped rules file points at what the package does not ship: a CLAUDE.md, a relative link, or a `skill:` name. | *A planted reference of each kind goes red; the real tree is green.* |
| 13 | A machine that installed earlier ends up with the current rules. A copy whose bytes match any version this package shipped is replaced, and a shipped file since removed is deleted. A file the user edited stays and is named. | *Install over a fixture of the 7df34ba tree leaves the target equal to `rules/`, plus one hand-edited file reported (L19).* |
| 14 | The deck refuses a `ticket` post whose body is not in the ticket-making shape, and the refusal names what is missing. | *An unshaped body is refused with the gap named; a shaped body is stored (assumed, A8).* |
| 15 | `skills/ticket-making/SKILL.md` says a job **merges**: into a queued ticket first (as a comment, then re-estimated), into a new ticket only when none fits, and as a small ticket last. "Folded" is not used. | *The section carries the order; `grep -ri fold skills/ticket-making` is empty.* |
| 16 | pilot.md's ticket rule points at ticket-making for every append, not only `Make tickets` threads. | *The deck-inbox paragraph names the skill; a test pins it.* |

## 3. Findings

- **Always-loaded rules are 3 files, not 114.** The 111 language files carry `paths:`
  frontmatter and load only when a matching file is read. Three load in every session:
  `orchestration.md` (2,712 tok), `vertical-execution.md` (1,972) and `README.md` (577,
  documentation loaded as a rule). Together that is 5,261 tok (bytes/4).
- **Glob misfire.** `arkts/` (`**/*.ts`, 5,909 tok) and `react-native/` (`**/*.ts`,
  `**/*.tsx`, 4,955) fire on every TypeScript file. Per trigger: .ts loads 12.8k, .tsx 19.4k
  (typescript 1,952 + react 8,174 + react-native + web 4,361), .js 2.0k, .py 1.5k.
- **Dead references.** 108 of 111 language files open with
  `extends ../common/X.md`, retired in 0.7.0, and 42 name an unshipped `skill:`.
  `check-references.mjs` passes all 114 files today, because it checks namespaces and
  home paths only.
- **Stale install here.** `~/.claude/rules/{orchestration,vertical-execution}.md` hash to
  the 7df34ba versions. `scripts/install-rules.mjs` never overwrites; its `RETIRED_RULES`
  hash table (common/ only) is the pattern S7 generalises.
- **Directory tokens:** angular 5250, arkts 5909, cpp 1578, csharp 2008, dart 6065,
  fsharp 2965, golang 972, java 4062, kotlin 3469, nuxt 3043, perl 1622, php 1699,
  python 1499, react-native 4955, react 8174, ruby 2562, rust 4474, swift 1602,
  typescript 1952, vue 2909, web 4361. Total 76.4k.
- **Definition lines** (a7c92e7): pilot 607, qa 234, fundamentalist 246, implementer 183,
  architect 143, auditor 93, explorer 73, teacher 70.
- **Deck post seam.** `deck/store.mjs` `postItem` already refuses by kind (a question
  body over `MAX_QUESTION_CHARS` 1200, `deck/tools.mjs:121`) with `DeckRefusal`. Eleven
  deck tests post `ticket` items with free-form bodies.
- **Transcripts.** `deck/transcripts.mjs` `readRun(repo, slug)` picks a run's sessions
  and, by its L5, returns no prompt text. Byte counts honour that.
- **Voice baseline** (S1, `node scripts/measure-voice.mjs --slug start-end-session`, 2026-10-01).
  Text is visible bytes per turn, thinking never counted; output tokens per call hold the
  redacted thinking, over the calls recorded with a stop_reason (subagent transcripts record
  most calls only as they began). Deck bodies are bytes; a reply's is its `text`.

  | Agent | Turns | Text B/turn | Out tok/call (n) |
  |---|---|---|---|
  | pilot | 34 | 542 | 343 (143) |
  | pilot-implementer | 73 | 77 | 236 (26) |
  | pilot-qa | 27 | 94 | 143 (19) |
  | pilot-architect | 1 | 4429 | 871 (2) |
  | pilot-fundamentalist | 2 | 1196 | 826 (1) |
  | typescript-reviewer | 9 | 1271 | 435 (10) |
  | security-reviewer | 7 | 1002 | 361 (9) |

  | Deck kind | question | reply | report | signoff | spec | walkthrough |
  |---|---|---|---|---|---|---|
  | count | 5 | 9 | 1 | 1 | 1 | 1 |
  | body B (median) | 958 | 657 | 5157 | 1911 | 2573 | 2520 |
- **Prose pins.** `scripts/test/pilot-rules.test.mjs` pins agent prose with
  `sentences()`. `ticket-making.test.mjs` pins the skill's headings.
- **Vendored files.** `skills/grilling/SKILL.md` is Pocock's, with an `adapted:` header
  and a `vendor/methodology.md` row. Rules rows sit in `vendor/toolbox.md`, and
  `check-upstream.mjs` already reports `adapted` rules rows.
- **Run-split tickets.** pilot.md §3 posts `ticket` bodies of the form
  `Run <n> of <feature>: artefact <path> …`, which is not the ticket-making shape.

## 4. Ubiquitous language

- **Case against**: the fundamentalist's opening argument that the design is wrong, and what it would build instead.
- **Narration**: terminal text that reports a step taken or about to be taken, rather than a state, a question or a result.
- **Trigger footprint**: the rules tokens that load when one file of a given extension is read.
- **Shipped copy**: a target file whose sha256 is in the rules ledger for its path.
- **Ticket shape**: the user's quoted words, numbered spec lines each with italic evidence, the thread id, and `## Answered before posting` on a small ticket.
- **Merge** (of a job): adding it to a queued ticket as a comment, the first choice before a new ticket.

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
|---|---|---|---|
| L0 | **Grilling depth: forks** (itm_b108448e9fd0). The user was shown two options: *every* (each locked decision as its own item, plus a Gate 1 walk) or *forks* (only decisions whose paths give materially different deliverables; the signoff is the only Gate 1 item). They chose forks. | The user's answer. The run touches no schema, auth, money or public API. | *every* |
| L1 | **No upstream sync** (itm_6088dedf59b8): "i dont care about the ecc verbatim or syncing with ecc anymore. neither with matt pococks rules or skills." So rules text and vendored Pocock skills may be pruned, globs narrowed, and dead lines deleted. The verbatim guarantee is retired; the MIT headers and `THIRD-PARTY-NOTICES.md` stay for the licence. | The user's answer. | Keeping files verbatim for a straight re-sync. |
| L2 | Spec 1: the report opens with the case against and the alternative design it would have built (itm_165aca5f8833). | The user's answer. | A report that confirms the design unless something fails. |
| L3 | Spec 2–3 as the table reads: visible terminal text median ≤ 300 chars per turn; reasoning tokens reported and not lower; deck bodies judged by before/after ratio (itm_4fed365ca2d1). | The user's answer: brevity in the terminal, never less thinking. | A flat ≥ 30% cut on everything. |
| L4 | Spec 5: median question body ≤ 600 chars (itm_1569e1e63580). | The user's answer. | No target. |
| L5 | Spec 7: the security check runs on every run, one question per risk in each area touched (itm_175b660716e7). | The user's answer. | Only on runs that visibly touch security. |
| L6 | Spec 10: both measures, always-loaded and per trigger (itm_6088dedf59b8). | The user's answer. | Always-loaded only. |
| L7 | arkts/ and react-native/ globs are narrowed to their marker files, not removed (itm_6df63fd12968). | Same tokens saved, guidance kept for real HarmonyOS/RN marker files. | Removing both directories. |
| L8 | QA environment: a scratch deck for the deck refusal and the scripts; the next real run for the measured figures (spec 2, 3, 5, 7) (itm_8e43d7d2327c). | The voice figures only exist on a real run. | A synthetic run. |
| L9 | S12 joins this run: typescript/, react/ and web/ are pruned and deduped so a .tsx read is ≤ 10k tok (itm_32e151993af9). | The user's answer. | A follow-up ticket. |
| L10 | Voice rules are a short **Voice** paragraph in each crew definition, plus pilot.md's "Writing to the user". | Standing rules live in definitions (orchestration.md, Agent briefs). | A shared skill: preloading it costs every agent, and no cross-agent prose skill exists. |
| L11 | Voice is measured from transcripts in bytes, and never returns text. | Honours transcripts L5; there is one reader (ADR 0042). | Counting by hand, which nobody can repeat. |
| L12 | The ticket-shape check is a pure function in a new `deck/ticket-shape.mjs`, called from `postItem`. | A deep module (one body in, the gaps out) that can be tested without the store. | Inline in the 1,546-line store; a hook (the brief chose the deck). |
| L13 | The rules ledger is generated from git history into `scripts/shipped-rules.json`, and a test fails when a current file's hash is missing from it. | The plugin cache has no git, and a forgotten regeneration goes red. | Hashes written by hand, which rot. |
| L14 | check-references grows its existing passes to cover rules: CLAUDE.md, relative `.md` links, `skill:` names. | One checker for the instruction surface. | A new script. |
| L15 | Spec 7's security frontier sits in pilot.md §3, beside the standing QA-environment question. | That is where standing grilling questions already live. | A separate security skill. |
| L16 | **Verdicts.** `orchestration.md`, `vertical-execution.md`: **update** (drop the CLAUDE.md deferrals and trim what pilot.md restates). `README.md`: **remove** from `rules/`, moved to `docs/rules.md`. `arkts/` ×5, `react-native/` ×8: **update** (narrow `paths:` to their own marker files, S9) and **prune**. All 21 directories: **prune** the dead `common/` line (108 files) and any unshipped `See skill:` line (42); `python/fastapi.md`, `react-native/accessibility.md` and `react-native/production-readiness.md` carry neither and are **keep**. `typescript/`, `react/`, `web/`: also **prune** duplicated and generic text (S12, L9). | Findings; L1 frees the text. | Removing arkts/ and react-native/ (same tokens saved, guidance lost); judging the content file by file. |
| L17 | An override is recorded as an `overridden:` line under its decision in the artefact. | The artefact is the plan and the record. | A run-record field, a schema change for one line. |
| L18 | orchestration.md and vertical-execution.md stay always-loaded, trimmed of what pilot.md and the agent definitions say and of CLAUDE.md deferrals; README leaves `rules/` for docs/rules.md; target ≤ 3,500 tok (itm_4c721dfacc02). | The user's answer; a plain session doing multi-agent work keeps the ceiling and routing rules. | Pilot-only via ${CLAUDE_PLUGIN_ROOT}, saving ~4.7k per other session. |
| L19 | The install deletes a file only when its path is in the shipped-then-removed ledger and its bytes match a shipped version; anything else under ~/.claude/rules/ is never touched, only named (itm_5d3985b83d01; the user pressed mirror first, withdrew it on pushback). | A user's own rules there must survive every install. | Mirror the package tree, deleting anything not shipped. |

## 6. Assumed decisions

| # | Default taken | Tradeoff |
|---|---|---|
| A6 | Spec 9's table is grouped by directory. | It is not literally one row per file. |
| A8 | A ticket body naming an approved `docs/design/<slug>/architecture.md` passes as shaped (run-split tickets). | That form goes unchecked for quotes. |
| A8a | Widened during S5: a body naming a saved audit report (`audits/<dir>/<stamp>.json`) also passes, and `pilot audit spec` appends `Audit report: <path>` so an audit pick is shaped without editing its spec. | An audit pick goes unchecked for quotes; the pick itself is the user's act. |
| A9 | During S9: `rules/vue/hooks.md` narrows to `**/*.vue` and `**/composables/**/*.ts`, outside S9's listed files, because its `**/*.ts` glob is the same misfire L7 names; L16's prune of vue content is unchanged. | A Vue repo's `.ts` outside `composables/` no longer loads it. |

## 7. Out of scope

Rewriting ECC's guidance; new language directories; the deck UI; a hook enforcing
ticket-making; the 1200-char question cap; the voice of non-crew agents; retiring `check-upstream.mjs`
(it is a report, not a gate, and L1 leaves it reporting drift nobody acts on).

## 8. Slices

One run: 12 slices × ~30 min = 6 h, inside the band (`skills/ticket-making/SKILL.md`,
Size), on two surfaces. Chains S2–S6 and S7–S12 share no file and can run in parallel.

| Slice | Title | Spec | Files owned | After | File |
|---|---|---|---|---|---|
| S1 | Voice is measurable from a run's transcripts | 2, 3, 5 (measure) | `scripts/measure-voice.mjs` (new), `deck/transcripts.mjs`, `scripts/test/measure-voice.test.mjs` (new) | – | [S1](slices/S1.md) |
| S2 | The crew writes short and does not narrate | 2, 3, 4 | `agents/pilot.md`, `agents/pilot-{architect,implementer,qa,explorer,teacher,auditor}.md`, `scripts/test/crew-voice.test.mjs` (new) | S1 | [S2](slices/S2.md) |
| S3 | The fundamentalist argues the case against | 1 | `agents/pilot-fundamentalist.md`, `scripts/test/fundamentalist-case.test.mjs` (new) | S1 | [S3](slices/S3.md) |
| S4 | One decision a question, security densest, pushback | 5, 6, 7, 8 | `skills/grilling/SKILL.md`, `agents/pilot.md`, `vendor/methodology.md`, `scripts/test/grilling-voice.test.mjs` (new) | S2 | [S4](slices/S4.md) |
| S5 | The deck refuses an unshaped ticket | 14 | `deck/ticket-shape.mjs` (new), `deck/store.mjs`, `deck/tools.mjs`, `deck/testUtils.mjs`, `deck/test/ticket-shape.test.mjs` (new), the 11 deck tests that post tickets | S1 | [S5](slices/S5.md) |
| S6 | A job merges into a queued ticket first | 15, 16 | `skills/ticket-making/SKILL.md`, `agents/pilot.md`, `scripts/test/ticket-making.test.mjs` | S4, S5 | [S6](slices/S6.md) |
| S7 | Install brings an earlier machine to the current rules | 13 | `scripts/install-rules.mjs`, `scripts/build-rules-ledger.mjs` (new), `scripts/shipped-rules.json` (new), `scripts/test/install.test.mjs`, `docs/INSTALL.md` | – | [S7](slices/S7.md) |
| S8 | Always-loaded rules shrink and stand alone | 10, 11 | `rules/orchestration.md`, `rules/vertical-execution.md`, `rules/README.md`→`docs/rules.md`, `scripts/measure-rules.mjs` (new), `vendor/toolbox.md`, `scripts/shipped-rules.json`, `scripts/test/pilot-rules.test.mjs` | S7 | [S8](slices/S8.md) |
| S9 | TypeScript files stop loading arkts and RN rules | 9, 10 | `paths:` of `rules/arkts/*`, `rules/react-native/*`, `vendor/toolbox.md`, `scripts/shipped-rules.json` | S8 | [S9](slices/S9.md) |
| S10 | Language rules point only at what ships | 9 | the 108 pruned files under `rules/*/`, `vendor/toolbox.md`, `scripts/shipped-rules.json` | S9 | [S10](slices/S10.md) |
| S11 | check-references fails on a dead rules reference | 11, 12 | `scripts/check-references.mjs`, `scripts/test/pilot-agents.test.mjs` | S10 | [S11](slices/S11.md) |
| S12 | A .tsx read loads at most 10k rules tokens | 9, 10 | `rules/typescript/*`, `rules/react/*`, `rules/web/*`, `vendor/toolbox.md`, `scripts/shipped-rules.json` | S11 | [S12](slices/S12.md) |

Walking skeleton: S1, the voice measure with the baseline taken. S7 is the skeleton of
the rules chain.

## 9. Acceptance evidence

1. `node scripts/measure-voice.mjs --slug start-end-session` prints the baseline (2, 3, 5).
2. The deck refuses an unshaped `ticket` and names the gap, and it stores a shaped one (14).
3. `node scripts/install-rules.mjs` on this machine replaces the two stale files and the narrowed and pruned language files (13).
4. `node scripts/measure-rules.mjs` shows always-loaded ≤ 3,500 tok, .ts ≤ 2,000 tok and .tsx ≤ 10,000 tok (10).
5. `node scripts/check-references.mjs` is green, and red on a planted `skill: nope` (11, 12).
6. On the next run on the deck: one decision per question, one security question per risk, and pushback as a line plus the risk (5–8). The fundamentalist's report opens with The case against (1).
7. `measure-voice.mjs` on that run against the baseline (2, 3, 5).

## 10. Status

| Slice | State | Branch | PR | Worktree | Blocker | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 2, 3, 5 |
| S2 | planned | | | | S1 | 2, 3, 4 |
| S3 | planned | | | | S1 | 1 |
| S4 | planned | | | | S2 | 5, 6, 7, 8 |
| S5 | planned | | | | S1 | 14 |
| S6 | planned | | | | S4, S5 | 15, 16 |
| S7 | planned | | | | – | 13 |
| S8 | planned | | | | S7 | 10, 11 |
| S9 | planned | | | | S8 | 9, 10 |
| S10 | planned | | | | S9 | 9 |
| S11 | planned | | | | S10 | 11, 12 |
| S12 | planned | | | | S11 | 9, 10 |
| feature | planned | feat/crew-voice-rules | | | S1–S12 | 1–16 |

## 11. Friction so far (for the closing report)

| Agent | What | Evidence |
|---|---|---|
| architect | Heredocs with backtick-quoted quotes fail in Git Bash; Python text-mode edits turn LF to CRLF | artefact needed the Write tool; one amend for CRLF |
| architect | Nothing reports whether a rules file loads always or by path; audit-context.mjs measures one repo, not the shipped tree per trigger | awk loops by hand; S8 adds measure-rules.mjs |
| architect | Eleven deck tests post ticket items with free-form bodies, no shared fixture | found by grep; S5 adds shapedTicketBody() |
| implementer (lesson) | pilot.md token pin headroom was 12.75, not ~144: the pin counts deck tool schemas | brief said 144; first gate failed on the QA pin |
| implementer (S1) | One model call spans several JSONL entries; subagent transcripts record most calls at start only, so readRun output per subagent is undercounted | agent-a18ff659: 219 null vs 20 final stop_reason |
| implementer (S2) | QA and explorer pins had 0 and 2 tokens of headroom; brief named only the pilot pin | first gate run failed 2 tests |
| implementer (S7) | brief said 2021 tests; base had 2010 — time spent ruling out lost tests; measure-rules.mjs named in the live gate did not exist yet | gate summary |
| qa (lesson) | Bash heredocs turned \b into byte 0x08 in source; deck_wait HTTP cap of 120000 ms is undocumented; the session scratchpad is shared across agents so a "fresh" deck store held another agents items | od -c on render.mjs:294; driver first waits failed |
| pilot | deck store rename hit EPERM three times on a tool call, each succeeding on retry | deck_resolve 03:0x, deck_reply 04:0x, deck_post 04:12 |
| pilot | git worktree remove is refused by the permission classifier, so teardown is the users | two denials this session |

## 12. Principles verdicts (step 7, fundamentalist at 8b89b94; fix round PR #243, merged bc94f40)

| Finding | Verdict | Where it landed |
| --- | --- | --- |
| P1 second glob compiler in measure-rules.mjs | kept | imports `globToRegExp` from audit-context; 122 shipped globs compile identically |
| P2 rules-references.test re-implements SKILL_NAMES | kept | test deleted; `common/` pin and header-ledger checks stay |
| P3 measure-rules.test CLAUDE.md pin duplicates check-references | kept | deleted; exact `.py` tokens assert and a CLI spawn test added |
| P4 S10 allowlist, suffix strip and 109 count | kept | deleted; toolbox.test still holds headers to S10's phrasings |
| P5 trigger token total unasserted | kept | exact assert |
| P6 ticket-shape `^` anchors untested; `_…_` italics | kept | three asserts; `_…_` form removed |
| P7 check-references survivors; placeholder skip | kept in part | three asserts; the placeholder skip stays (S11's allowance) |
| P8 / QA F2 fundamentalist has no Voice paragraph | kept | added in the explorer's form; in crew-voice DEFINITIONS |
| P9 three tests copy area-file helpers | kept | imported |
| QA F1 bare `skill: x` and `skills:` lists pass check-references | kept | widened with tests |
| Nits 3, 4, 7, 8; nit 5 | kept | RULES_LEDGER import, one `filesUnder`, security-reviewer is an agent (.ts +7 tokens, 1596), tools.mjs list wording; CLI spawn test |
| Nits 1, 2 (transcripts.mjs roleOf/voiceOf) | dropped | older code; complexity alone, no consequence named |
| Nit 6 (1837 pin vs 2000 acceptance) | dropped | the pin is a deliberate regression guard under the acceptance |

Measured after the fix round: always 3376, .ts 1596, .tsx 9747, .js 1596, .py 845.
