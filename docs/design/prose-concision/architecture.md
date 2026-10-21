# Prose concision: what the user reads trades grammatical accuracy for conciseness

Ticket itm_fd48aa7c2506 · slug `prose-concision` · base `origin/pilot` 2a1df936

## 1. Problem

Agents answer the user in paragraphs or in technical language. The user saw a tip that an agent told to
"sacrifice grammatical accuracy for conciseness" writes a more readable voice, and wants that voice in
everything the crew writes to them (thread itm_6a1a7da44875, proposal itm_e6637dd71cbf).

## 2. Spec

| # | Behaviour | Evidence |
|---|---|---|
| 1 | The six user-facing definitions (`agents/pilot.md` "Writing to the user"; `## Voice` of `pilot-architect`, `pilot-qa`, `pilot-explorer`, `pilot-teacher`, `pilot-auditor`) each carry one sentence telling the agent to sacrifice grammatical accuracy for conciseness in deck items and chat replies. | A new test in `scripts/test/crew-voice.test.mjs` over its `USER_FACING` list, one failure message per agent, red before the sentences land. |
| 2 | The sentence governs grammar, not content: what the decision needs (ADR 0122), the general answer and the four longer-is-right cases (security, irreversible data, Gate 1, a pushback) stay in every section. | The existing `crew-voice.test.mjs` tests pass; the one rewritten is "short by default and detail on request", which becomes "detail on request" because the new sentence carries "short" (§2 table). |
| 3 | Reasoning is untouched: the sentence names deck items and chat replies, never thinking, and none of ADR 0056's banned phrases appears. | The new pin requires "deck" and "chat" in the sentence; the existing "no brevity" test passes unchanged. |
| 4 | ADR 0056's rejection of brevity-phrased rules is carved out by a new ADR 0160 with the reason; 0056 reads `status: amended`, `superseded_by: [0160]`, and the index rows follow. | `npm run adr-index` leaves `docs/adr/README.md` unchanged after the commit; the 0056 row reads `amended`. |
| 5 | Each section's existing prose rules are read against the new sentence, and those it already covers are removed rather than kept beside it, so every section ends shorter (user, itm_94ef9f2b6088, agreed). | The three budget pins (pilot, explorer, QA) fall or hold, each with a history line; `crew-voice.test.mjs` passes; the table below, sentence by sentence. |

### Line 5: keep or cut, per sentence

New sentence in all six: "In deck items and chat replies, sacrifice grammatical accuracy for conciseness." *Covered* = the new
sentence already says it; *redundant* = said elsewhere already. Chars from a scratch measure of the drafts, the
implementer measures the real number.

| Agent | Sentence (today) | Call | After |
|---|---|---|---|
| all six | "No unasked explanation ... never narrate" | keep (ADR 0056, pinned) | architect, teacher drop the tail "your steps or reasoning between tool calls" / "your reading or reasoning, to `main` or in the thread": redundant |
| architect, QA, explorer, auditor | "Print state (what is running, the command that just ran[, what you are on])" | cut the parenthetical: redundant (ADR 0056 defines state; the pilot works without it) | "Print state, questions and results" |
| pilot | "deck text is short, detail on request" | cut: covered | "on request" stays on the decision-needs sentence |
| QA | "Deck posts, comments and reports are short by default" | cut "Deck posts": covered | "Comments and reports are short by default, detail on request" (comments are durable, A2) |
| teacher | "Each reply is short by default, one step or one question, with detail on request" | cut "short by default": covered | "Each reply is one step or one question, detail on request" |
| architect, auditor, explorer | "Messages to `main` ... / Your return ... / the answer, short by default, detail on request" | keep: agent-to-agent, out of the sentence's scope (L4) | unchanged |
| all six | "What the user reads carries what the decision needs ..." | keep (ADR 0122, pinned) | architect, auditor drop the trailing "on request": redundant with the line above it |
| pilot | "An answer, in chat or on the deck, is general unless asked: the answer itself, then one line naming ..." | cut "in chat or on the deck" and "the answer itself, then": redundant | "An answer is general unless asked, its last line naming what it can be made specific on" (QA's form) |
| QA, explorer | the general-answer sentence | keep (pinned) | unchanged |
| five crew | "Longer is right for a security risk, irreversible data, <agent's Gate 1 case>, and a pushback on <agent's case>" | cut the per-agent objects: redundant, the four cases are the same | "Go longer for security, irreversible data, a Gate 1 walk, a pushback." (the pilot's form) |

| Agent | Chars before → after | Wrapped lines |
|---|---|---|
| pilot | 502 → 499 (-3) | 7 → 7 |
| pilot-architect | 598 → 497 (-101) | 8 → 7 |
| pilot-qa | 493 → 482 (-11) | 8 → 7 |
| pilot-explorer | 486 → 477 (-9) | 7 → 7 |
| pilot-teacher | 561 → 501 (-60) | 8 → 7 |
| pilot-auditor | 566 → 502 (-64) | 8 → 7 |

The draft's third line (the deck's own strings) is a scope call, taken as A1 in §6. The draft listed the
co-pilot; it writes no user text (§3), so it is not here.

## 3. Findings

- `scripts/test/crew-voice.test.mjs`: `DEFINITIONS` (8 agents and their heading), `USER_FACING` (the six above,
  from ADR 0122 L6), `voiceSection`, `hasSentence`. The ADR 0056 test bans `/less verbos/`, `/\bbe brief\b/`,
  `/think less/`, `/less thinking/` in the whole file; "sacrifice grammatical accuracy for conciseness" matches
  none.
- `scripts/test/lib/area-file.mjs:31` `sectionOf`: a section runs from `\n## <heading>\n` to the next `\n## `.
- Voice sections: `agents/pilot.md:107`, `agents/pilot-architect.md:208`, `agents/pilot-qa.md:239`,
  `agents/pilot-explorer.md:76`, `agents/pilot-teacher.md:78`, `agents/pilot-auditor.md:77`. Each already has
  a "What the user reads carries what the decision needs" sentence; the new one goes right after it.
- `agents/pilot-co-pilot.md`: no Voice section and no `deck_post` tool; it writes deck_status rows and its
  hand-back to the pilot (ADR 0122 L6 left it out for the same reason).
- Budget pins: `scripts/test/measure-prompt.test.mjs:174` pilot `<= 11496.5`, `:186` explorer `<= 2466.5`;
  `scripts/test/qa-preview.test.mjs:156` QA `<= 4844.75`. Measured today on 2a1df936 (definition + skills +
  tools): pilot 11497, explorer 2466, QA 4841 (rounded), so the line-5 cuts must pay for the sentence.
  `landing-wording.test.mjs:47` and `report-record-wording.test.mjs:40` read the pilot pin back against its
  history line, so that line must name the measured number.
- ADR convention: an amendment is a new ADR that `supersedes` the old one, the old one turned `amended` with
  `superseded_by` (0040 on 0036, 0041 on 0020). `scripts/adr-index.mjs` accepts `amended`. Highest on pilot:
  0158; 0159 is held by deck-token on design/deck-token, so this one is 0160; commit 8f0bd783 shows numbers colliding at base merges.
- Deck strings: `deck/closing-report.mjs:73` "Closing report: X", `deck/landing.mjs:163` "Mark X ready",
  `deck/chain.mjs:114` "Next run: X" are already terse; the `Research:` line is a grammar
  `deck/question-shape.mjs` parses, with its skip reasons verbatim.

### Seams

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| `crew-voice.test.mjs` voice pins | `USER_FACING`, `voiceSection(name, heading)`, `hasSentence(text, ...patterns)` | nothing: each is used by 3+ tests and passes the deletion test | in-process |
| prompt measure | `measure({ root, home })` in `scripts/measure-prompt.mjs` → rows of `definition`, `skills`, `tools` bytes | nothing | local-substitutable (temp `home`) |
| ADR index | `npm run adr-index` (`scripts/adr-index.mjs`) | nothing | in-process |

No fold: the feature adds one sentence per file and one test through seams that already exist.

## 4. Ubiquitous language

- **User-facing definition**: one of the six in `USER_FACING`; its text reaches the user.
- **The concision sentence**: the one sentence this feature adds, the same words in all six.
- **Deck item**: a question, walkthrough, report, reply or other post the user reads on the deck.
- **Chat reply**: an answer to the user in the deck chat or the terminal.
- **Own share**: definition + skills + tools bytes / 4, what a budget pin measures.

## 5. Locked decisions

- **L1 The user's words, verbatim.** The sentence says "sacrifice grammatical accuracy for conciseness", as the
  user quoted the tip; rejected: the draft's "concision", a paraphrase of the thing whose effect is the point.
- **L2 One sentence, one place.** It joins the existing Voice / "Writing to the user" section (ADR 0122 L2),
  after the "what the decision needs" sentence; rejected: a shared voice skill (every agent pays for it, ADR
  0122) and a sentence in the description frontmatter (not where the rule lives).
- **L3 A new ADR amends 0056, not an in-place edit.** Repo convention (§3). The reason recorded: 0056 rejected
  brevity rules because they read as "think less"; this one shapes the grammar of deck items and chat replies
  only, says nothing of reasoning, and leaves 0056's terminal rule and its measured evidence standing.
  Rejected: editing 0056's body (loses the date the carve-out was made).
- **L4 The co-pilot, implementer and fundamentalist are out.** They write to `main`, not the user (ADR 0122
  L6); `USER_FACING` already draws that line. Rejected: all eight `DEFINITIONS`, which would spend tokens on
  agent-to-agent text the user asked nothing about.
- **L5 One slice.** About 90 changed lines, one risk (prompt wording), and the two test files would be shared
  by any split, making a serial stem with a second 5-minute gate for nothing. Rejected: the ticket's
  2-slice estimate.

- **L6 Grilling depth: forks** (itm_f0a51b3fae23). Only the recommended forks go to the user as questions;
  every other branch takes its default here. Rejected: a full design-tree grilling for a one-slice wording change.

- **L7 QA environment: `npm test` plus the prompts as text** (itm_2f98c601dfb0). QA runs the suite in its own worktree and reads the
  seven prompts and the ADR as text; no live deck. Rejected: a scratch deck and one live pilot reply (about 10 minutes more).
  Research: none, scope call

## 6. Assumed decisions

- **A1 (itm_8dd7d2d8354c) The deck's own strings are out of scope.** Default: no change to `deck/*.mjs` strings. Tradeoff: the
  landing lines, report and gate titles stay as they are; they are code the user did not name, already terse,
  and the `Research:` line is a parsed grammar whose rewording would change what it carries. Rejected: a pass
  over every user-visible deck string (a second surface, wording tests moved, no model behaviour changed).
  Research: none, scope call
  Answered: Keep deck strings (default), itm_8dd7d2d8354c.
  Verdict: stands — the user took the default as written.
- **A2 (itm_fc447e5c03ba) Durable documents keep full grammar.** Default: the sentence names deck items and chat replies only; the
  artefact, PR bodies, ADRs, slice files and commits stay as written. Tradeoff: the Gate 1 artefact and Gate 2
  PR the user reads keep their prose; implementers and reviewers read them for precision, where a dropped
  article or subject costs a misread. Rejected: every text the user can see.
  Research: none, scope call
  Answered: Deck and chat only (default), itm_fc447e5c03ba.
  Verdict: stands — the user took the default as written.

## 7. Out of scope

- Agent-to-agent messages (`main`, hand-backs, slice reports), the terminal state rule of ADR 0056.
- A length cap or a deck refusal on fragment style; `scripts/measure-voice.mjs` is unchanged.
- The deck's own strings (A1) and durable documents (A2).

## 8. Slices

Width 1; longest stem 1

| Slice | Delivers | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|
| S1 Every user-facing voice trades grammatical accuracy for conciseness | 1, 2, 3, 4, 5 | `agents/pilot.md`, `agents/pilot-architect.md`, `agents/pilot-qa.md`, `agents/pilot-explorer.md`, `agents/pilot-teacher.md`, `agents/pilot-auditor.md`, `scripts/test/crew-voice.test.mjs`, `scripts/test/measure-prompt.test.mjs`, `scripts/test/qa-preview.test.mjs`, `docs/adr/0160-user-facing-prose-trades-grammar-for-conciseness.md` (new), `docs/adr/0056-the-terminal-gets-state-not-explanation.md`, `docs/adr/README.md` | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` (agent configuration) | [S1](slices/S1.md) |

The walking skeleton is the whole feature: one sentence in six files, its pin, its ADR.

## 9. Acceptance evidence

1. The six Voice sections in the feature PR's diff, each with the same sentence after its "decision needs" line.
2. `node --test scripts/test/crew-voice.test.mjs`: the new test red on the base, green on the branch, the old
   ones green on both.
3. ADR 0160 and 0056's frontmatter; `npm run adr-index` leaves the index unchanged.
4. The three pins falling or holding, each with a history line naming the measured number; every Voice
   section shorter than on the base.
5. On the next run after the merge, the user reads deck questions and chat replies in fragment-first prose,
   with the decision, default and cost still in them. Judged by the user, no threshold (ADR 0056's ratio,
   never a cap).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Delivers |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 1, 2, 3, 4, 5 |
| prose-concision | planned | | | | S1 | 1, 2, 3, 4, 5 |
