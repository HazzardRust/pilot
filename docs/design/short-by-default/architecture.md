# Short by default: what the user reads carries what the decision needs

Ticket itm_f679fbab1ae9 · slug `short-by-default` · base `pilot` 5714fa17 · branch `design/short-by-default`

## 1. Problem

When an agent (QA especially) answers the user on the deck or in the terminal, the text
is too long and too detailed: the user sorts through a paragraph to find the one thing
a decision needs. They want only what the decision needs, a general answer they can ask
to have made specific, and detail only when they ask for it. Specs, ticket bodies, briefs,
slice files and artefacts are read by agents and are exempt.

## 2. Spec

| # | Behaviour | Evidence |
|---|---|---|
| 1 | Text the user reads (question, walkthrough, report, reply, chat answer, terminal line) from the pilot, QA, the architect, the teacher, the auditor and the explorer carries what the decision needs: the decision, the recommended default and its cost in a line, and what happens next. Evidence, check tables, file paths and counts go to the PR comment, the run record or `Teach me`, and come up only when asked. Agent-read documents are exempt. | A wording pin on each of the six `## Voice` / "Writing to the user" sections (`scripts/test/crew-voice.test.mjs`). |
| 2 | An answer to the user's question is general unless they asked for a specific one, and a general answer ends with one line naming what it can be made specific on. The explorer's on-thread answer follows the same rule, without its evidence. | A wording pin on `agents/pilot.md`, `agents/pilot-qa.md`, `agents/pilot-explorer.md`; on a scratch deck, a reply to a user question leads with the answer and ends with that line, 6 lines as the target. |
| 3 | A QA walkthrough's body is at most 10 non-blank lines: what was built, the tip, one line on anything left as is, and the link to the PR's QA comment. The checks table (spec line, result, evidence) is in that comment, posted before the walkthrough. The deck refuses a QA walkthrough whose body is longer. A QA walkthrough posted with `longer` (one line saying why it needs more room) is stored at any length. | A deck test refuses an 11-line QA body and stores a 10-line one; a scratch run shows a walkthrough body of 10 lines or fewer and a PR comment carrying the table. |
| 4 | The prompt-budget pins of the pilot, QA and the explorer move by exactly what the rewording measures, history comment each; a rewording that pays for itself leaves its pin where it is. *Locked (L9).* | The pin diff in the PR. |

It cannot mean the co-pilot (it writes no user text; `main` posts its questions), the
implementer or the fundamentalist (they report to `main`, which relays under the pilot's
rule). It cannot mean a hard length cap on a question beyond the 1200 characters it already has,
or on a reply, which stay prompt rules: a refusal there would bounce the security and
irreversible-data cases that the voice rule lets run longer.

## 3. Findings

- **The rule already exists and is pinned.** crew-voice-rules (ADR 0056) put
  "short by default, detail on request" in one section per definition (L10):
  `agents/pilot.md:106` "Writing to the user" and `## Voice` in the architect (182), QA
  (222), explorer (75), teacher (78), auditor (76), implementer (160) and fundamentalist
  (267). `scripts/test/crew-voice.test.mjs` pins it with `DEFINITIONS` and forbids
  brevity wording ("be brief", "less verbose", "think less") because a brevity rule
  reads as an incentive to think less (crew-voice L3). The gap is that the rule says *short* but not *what
  goes in*: this feature names the content and where the rest goes. Wording it as
  content ("what the decision needs") keeps L3.
- **QA's procedure requires the long part.** `agents/pilot-qa.md:146-151` puts the
  machine checks "as a rule, in the body as one "checked for you" table (spec line |
  result | evidence)", pinned at `scripts/test/pilot-agents.test.mjs:898`
  (walkthrough-taste spec 3, A2). Spec 3 reverses that pin on the user's new word.
  The QA comment today is posted only after Sign off (`pilot-qa.md:204`, step 3), so
  the table needs a comment that exists before the walkthrough.
- **The pilot's question body asks for evidence.** `agents/pilot.md:259-261` "Its body is short: …
  the default and what it trades away, the evidence"; this contradicts spec 1. The grilling
  skill's own line (`skills/grilling/SKILL.md:25`) names no evidence.
- **The explorer answers user threads with evidence.** `agents/pilot-explorer.md:23-25`
  "(the answer and its evidence)": the explorer writes on the user's thread directly.
- **The deck refuses by kind and author in one place.** `deck/store-items.mjs:81` refuses a
  question body over `MAX_QUESTION_CHARS` (1200, `deck/tools.mjs:121`); line 96 calls
  `walkthroughShapeGaps(screens)` (`deck/walkthrough-shape.mjs:35`) only for a QA-authored
  walkthrough, so the pilot's setup wizard is never checked. The body cap joins that
  check. gate-stays-signed (yellow) edits `deck/items.mjs` and `deck/store.mjs`; this
  feature touches neither.
- **The renderer draws a QA walkthrough's body under its steps**
  (`deck/test/walkthrough-render.test.mjs`, walkthrough-taste L1), built for the table.
- **Budget headroom** (`node -e measure(...)` at 5714fa17): pilot 10119 of 10123, QA
  4414 of 4414, explorer 2409 of 2409; architect, auditor, teacher are unpinned.
  The research-first precedent (L5) raised pins by measured cost and prohibited
  trimming other prose to dodge one.

### Seams

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| QA walkthrough shape | `walkthroughShapeGaps(screens, body)`, `MAX_WALKTHROUGH_BODY_LINES` in `deck/walkthrough-shape.mjs`; refusal text via `postItem` | the body-line cap, beside the command check, rather than a second inline check in `store-items.mjs` | in-process |
| Voice rule | one section per definition, read by `voiceSection(name, heading)` and a new `USER_FACING` list in `scripts/test/crew-voice.test.mjs` | nothing new; the content sentence joins the existing section | in-process |
| Prompt budget | `measure({ root, home })` in `scripts/measure-prompt.mjs` | – | in-process |
| QA comment | `gh pr comment <pr>` then `gh pr comment <pr> --edit-last` | the checks table and the sign-off items in one comment | true external (GitHub) |

Deletion test: `walkthroughShapeGaps` keeps its place (pure, one caller, its own test
file); `postItem` stays deep. No module is shallow enough to fold, so no fold slice.

## 4. Ubiquitous language

- **What the decision needs**: the decision, the recommended default and its cost in a line, what happens next.
- **The rest**: evidence, check tables, file paths, counts; lives in the PR comment, the run record or `Teach me`.
- **General answer**: answers the question asked at the level asked, ending with one line on what it can be made specific on.
- **QA comment**: the one PR comment QA owns; the checks table first, the sign-off items added to it.
- **User-facing text**: anything the user reads on the deck or in the terminal; artefacts, specs, briefs, slice files and ticket bodies are not.

## 5. Locked decisions

- **L1 The rule is content, not length.** Each section names what goes in and where the rest goes. Rejected: a line or word cap in prose, which crew-voice L3 forbids as brevity wording.
- **L2 The rule stays one section per definition** (crew-voice L10). Rejected: a shared preloaded skill, which every agent would pay for on every turn.
- **L3 Only the walkthrough gets a deck refusal**, at 10 non-blank lines, QA-authored only, beside the command check. Rejected: caps on replies and reports. They would refuse the security and irreversible-data cases where longer is allowed, and those are rare enough to stay prompt rules. overridden: the user on itm_03d153719048 — outliers need more than 10 lines; the refusal stays, with the longer backdoor.
- **L4 One QA comment, posted before the walkthrough with the table, edited at sign-off** (`--edit-last`) with migrations, fixes, seed data and prerequisites. Rejected: a second comment at sign-off, which would split the record into two places.
  Mechanism amended: edit by recorded id; --edit-last would overwrite the user's own comment.
- **L5 The renderer is not changed**: the short body sits under the steps as today. Rejected: moving the body first, which is a render change spec 3 does not need.
- **L6 The explorer is in scope**: it writes on the user's thread directly. **The co-pilot, implementer and fundamentalist are out**: none of them writes to the user. Locked by the user on itm_4e826f6bdace.
- **L7 ADR 0122 records L1 to L4.**
- **L8 QA runs the feature on a scratch deck** (`pilot deck --scratch`, a scratch repository, `claude --plugin-dir <worktree>`), the user's answer on itm_f679589a8d75. Rejected: the live deck, which would mix scratch items into the user's inbox.
- **L9 Pins move by measured cost**: the pilot, QA and explorer pins rise by exactly what the rewording measures, with a history comment each, the user's answer on itm_b498806b0350. Rejected: trimming other `agents/pilot.md` prose to pay, which collides with itm_7397c7bb01d2.
- **L10 Grilling depth: forks**, the user's answer on itm_9a3cdd6f9083; no walk before the gate1.

## 6. Assumed decisions

- **A2 The pilot's §3 question-body clause loses "the evidence".** That is the one edit outside "Writing to the user", because it contradicts spec 1. Tradeoff: a small rebase conflict with itm_7397c7bb01d2's question-path edit.

On the deck: A1 was locked as L9 on itm_b498806b0350, the agent list (L6) on itm_4e826f6bdace, and A3 as L8 on itm_f679589a8d75.

## 7. Out of scope

Caps on replies, reports and gates; the renderer; the co-pilot, implementer and
fundamentalist; agent-read documents; ticket bodies (ticket-making's shape stays).

## 8. Slices

Width 2; longest stem 2

| Slice | Delivers | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|
| S1 The deck refuses a QA walkthrough body over 10 lines | 3 | `deck/walkthrough-shape.mjs`, `deck/store-items.mjs`, `deck/test/walkthrough-shape.test.mjs` | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 The crew's user-facing text carries what the decision needs, and answers stay general | 1, 2, 4 | `agents/pilot.md`, `agents/pilot-architect.md`, `agents/pilot-teacher.md`, `agents/pilot-auditor.md`, `agents/pilot-explorer.md`, `scripts/test/crew-voice.test.mjs`, `scripts/test/measure-prompt.test.mjs`, `docs/adr/0122-what-the-user-reads-carries-what-the-decision-needs.md` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S2](slices/S2.md) |
| S3 QA's walkthrough is a summary and the checks live in its PR comment | 1, 2, 3, 4 | `agents/pilot-qa.md`, `scripts/test/pilot-agents.test.mjs`, `scripts/test/qa-preview.test.mjs` | S1 (`MAX_WALKTHROUGH_BODY_LINES`), S2 (`crew-voice.test.mjs`'s `USER_FACING`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S3](slices/S3.md) |

S1 is the walking skeleton: the deck holds the new walkthrough shape end to end. S1
and S2 share no file and no seam. S3 reads S1's cap and adds QA to S2's list.
Security review is on every slice: S1 is a deck_post input boundary, and S2 and S3 are agent configuration.

## 9. Acceptance evidence

1. On a scratch deck, ask the pilot a question in chat: the answer leads with the answer and ends with what it can be made specific on, 6 lines as the target (spec 2).
2. Ask the explorer through a thread: the same shape, with no evidence on the thread (spec 2).
3. A QA run on a scratch feature posts a walkthrough whose body is 10 lines or fewer and names the QA comment. The PR carries the checks table (spec 3).
4. Posting an 11-line QA walkthrough is refused with the cap and where the table goes (spec 3).
5. `npm test` green with the pins at their new or unmoved numbers (spec 1, 4).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Delivers |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 3 |
| S2 | planned | | | | – | 1, 2, 4 |
| S3 | planned | | | | S1, S2 | 1, 2, 3, 4 |
| short-by-default | planned | | | | | 1-4 |
