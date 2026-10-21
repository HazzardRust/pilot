# co-pilot-reports

Ticket `itm_ae28cb59ce35`, with `itm_db9d90dd1ba0` (push-back and PR titles) merged in on
`itm_b8c6555d170a`. Base `pilot@32c5e37`.

## 1. Problem

On the first yellow ticket a co-pilot built (`itm_eb35ade648ba`, 2026-10-07), the crew sent
its messages to the main session: an implementer's ADR renumbering, an implementer's seam
change, QA's "ready for the fix-round tip" and QA's walkthrough-posted report. The pilot
relayed four of them by hand, and the co-pilot never saw QA's report. The user: "the
messages should travel to the co-pilot, and it can send you messages if it needs."

Merged in: push-back on the user's answers is thin, and PR titles drift between formats.
The user: "just need to make sure that they stick to 1 simple format."

## 2. Spec

Lines 1 to 7 are agreed at forks depth. Line 8 was answered on `itm_716318c57252` and
line 9 on `itm_cc2280e20b79`; both took the recommended default.

| # | Behaviour | Evidence |
|---|---|---|
| 1 | An implementer, fundamentalist or QA the co-pilot spawned sends the co-pilot every message its definition would have sent `main`: progress, the PR-exists report, questions, blocked commands, seam changes, QA's findings, its tip request, its walkthrough-posted report, a context handoff. | Wording pins on the three definitions. On the live deck's next yellow ticket, every crew `SendMessage` in the transcripts has the co-pilot's id as `to` and none has `main` (L6). |
| 2 | The co-pilot makes itself addressable: right after each spawn it sends the child one message, the **hello**, naming itself as that child's co-pilot. The child sends to that message's `from`. | A pin on `pilot-co-pilot.md`. In the same live run, each child's transcript shows the hello and then sends to its `from`. |
| 3 | `main` stays the addressee for an agent the main session spawned. QA also switches to `main` once its walkthrough-posted report has gone to the co-pilot; from then on the pilot resumes it. | A pin on `pilot-qa.md`. In the live run, QA's messages after the hand-back go to `main`. |
| 4 | The co-pilot sends `main` only four things: a question for the user, a seam change that moves a spec line or a locked decision, a crew hand-off it cannot resolve, and its hand-back table. It decides everything else itself and records it as *assumed*. | A pin on `pilot-co-pilot.md`'s rewritten "What goes to main" section. The live run's main transcript shows no relayed crew message. |
| 5 | A seam change inside the rails is the co-pilot's call. It records the change in the owning slice file on `feat/<slug>`, as the pilot does today. | A pin on `pilot-co-pilot.md`. |
| 6 | Every answer on the deck that overrides the recommended default gets exactly one `deck_reply` before it is recorded. The reply names the consequence and the path the answer closes, never a preference. A second reply comes only if the first surfaced a fact the user had not seen. After that the answer is locked and never re-argued. | Pins on the **Pushback** paragraph of `pilot.md` and of `skills/grilling/SKILL.md`. The pilot prompt pin holds, paid for by L11's trim. |
| 7 | A crew agent pushes back to the agent that spawned it, never on the deck. Its report carries a "pushback on the brief" row: what it would have decided differently, and the consequence. The spawner decides whether it reaches the user; the co-pilot forwards one only under 4. | Pins on the report sections of the implementer, fundamentalist and QA definitions. |
| 8 | PR titles have one format: `feat(<slug>): S<n> <title>` for a slice (the title starts lower-case), `fix(<slug>): <what>` for a fix round, and `feat(<slug>): <feature>` for the feature PR. | A pin on `pilot.md`'s step 4 title sentence and on its `brief.md` headings. |
| 9 | `pilot integrate` refuses a slice or fix branch whose PR title breaks the format, before anything is merged. It names the title and the format; the fix is `gh pr edit` and a rerun. A matching title integrates as today. | `integrate.test.mjs`: a mismatched title is refused and HEAD is unmoved; a matching one integrates. |

## 3. Findings

- **The co-pilot cannot know its own id.** `Agent(...)` returns `agentId: <id>` to its
  caller only. In the session transcript, the co-pilot's spawn result was
  `aec43339667414b64`, but the co-pilot's own transcript never names that id outside the
  metadata. No environment variable carries it either (`env` in a subagent shows only
  `CLAUDE_CODE_SESSION_ID`, `CLAUDE_CODE_AGENT` and messaging sockets). So a brief cannot
  carry the co-pilot's address.
- **A received message carries its sender's address.** It arrives as
  `<agent-message from="<id>">`, and the harness tells the receiver to reply via
  `SendMessage` to the `from=` address. Today the S1 implementer (`a374d0a80d7aa736b`) and
  QA (`acea65c17bf563a3c`) each sent to `aec43339667414b64` once, and only after a co-pilot
  message had reached them (session `dfe6c4e3…/subagents/agent-a374….jsonl`,
  `agent-acea….jsonl`).
- **`main` from any depth reaches the top session.** That is what the SendMessage tool's
  table says ("the main conversation"), and today the S2 and S4 implementers (depth 2) and
  QA (4 sends) reached the pilot that way.
- **A finished background child's result reaches its spawner as a message.** The co-pilot
  received one from each implementer, the fundamentalist and QA. Reviewers have no
  `SendMessage` tool (their tools are Read, Grep, Glob, Bash), so they never address anyone.
- **Sending to a finished agent resumes it** (SendMessage: "a send resumes it from its
  transcript"). A crew message to a co-pilot that has handed back would wake it.
- **Where the crew definitions name `main` today:**
  - `agents/pilot-co-pilot.md:36-43`: "Your crew sends its own questions to `main`".
  - `pilot-implementer.md:90, 135, 140-146, 151, 158, 179`.
  - `pilot-qa.md:63, 114, 147, 153, 162, 177, 180, 188, 213-214, 227, 246`. Line 147
    already says "Spawned by the co-pilot, report once it is posted and stop".
  - `pilot-fundamentalist.md:216, 245, 260`.
- **How the co-pilot runs steps 4 to 8:** `pilot-co-pilot.md` "Steps 4 to 8" runs `pilot.md`
  as written, with a list of differences. `pilot.md:400-403` (step 6) holds the seam-change
  rule this design hands to the co-pilot.
- **Prompt pins** (`node scripts/measure-prompt.mjs`, own share = (definition + skills +
  tools) / 4):
  - The pilot is 10115 of 10115 (`measure-prompt.test.mjs:125`): zero headroom.
  - QA is 5669 of 5752 (`qa-preview.test.mjs:118`): 83 tokens of headroom.
  - The co-pilot, implementer and fundamentalist have no pin.
- **Push-back today:** `pilot.md:270-274` and `skills/grilling/SKILL.md:31`, pinned by
  `scripts/test/grilling-voice.test.mjs:59-68` ("once more", "one line", "user's word
  decides", `` `overridden:` ``). No crew report has a pushback row. Only the Voice
  sections mention "a pushback on the brief".
- **PR titles:** `pilot.md:358-363` puts "the PR title" in each slice brief with no format.
  `pilot.md:345-350` lists `brief.md`'s headings. `scripts/integrate.mjs:37-44` `prOf`
  already reads `number,title` through `gh`, and `:209` uses it only for the merge message,
  after the merge. `mergeMessage` (`:49`) already parses `feat(x): S3 …`. The test
  fixture's `findPr` (`integrate.test.mjs:55`) already returns `feat(x): S1 the first slice`.
- **ADRs:** `origin/pilot` holds 0001 to 0095 with 0090 absent; 0090 is reserved by
  walkthrough-taste. deck-press-feedback takes 0096 and up in flight.

## 4. Ubiquitous language

- **Spawner**: the agent whose `Agent(...)` call started you, either the co-pilot or `main`.
- **Addressee**: whoever a crew agent sends to. That is the spawner's address, except for QA
  after its hand-off report (spec 3).
- **Hello**: the one message the co-pilot sends a child right after spawning it. Its `from`
  is the co-pilot's address.
- **Rails**: the signed plan's spec lines and locked decisions. A change inside the rails
  moves neither.
- **Override**: a user's answer other than the recommended default.

## 5. Locked decisions

- **L1 The co-pilot's address travels in the hello's `from`.** Rationale: the co-pilot cannot
  read its own id, and a received message carries it (§3). Rejected: `main` sending the
  co-pilot its own id after the spawn. That races the co-pilot's first spawn, makes the
  co-pilot wait on `main`, and puts an agent id into the pilot's prose, which ADR 0089
  avoided.
- **L2 A child sends nothing to its co-pilot before the hello arrives, and never falls back
  to `main`.** The hello lands at the child's next tool round. Rejected: falling back to
  `main`, which is the bug itself.
- **L3 QA's addressee becomes `main` once its walkthrough-posted report has gone to the
  co-pilot.** After that the co-pilot hands back, and a send to it would resume it (§3).
  Rejected: always the co-pilot.
- **L4 Reviewers are out of scope.** They cannot send; their verdict returns to the spawner
  as the ticket result.
- **L5 What the co-pilot sends `main`** is the four things in spec 4. A seam change that
  breaks a later slice's files or tests is a "hand-off it cannot resolve", because only
  `main` resumes the architect.
- **L6 QA environment** (`itm_27dc5df21fb1`, the user's choice after push-back): the live
  deck's next yellow ticket. The first co-pilot spawned after this lands is observed for real,
  and its crew's messages are read in the transcripts, on top of the wording and
  prompt-budget pins. There is no fixture run.
- **L7 Depth** (`itm_394b374c6751`): forks. Gate 1 is one item on the whole artefact.
- **L8 Push-back standard:** spec 6, applied to every override, not only to answers the
  pilot judges unadvisable. The existing `grilling-voice` pins still hold. Rejected: a
  second argument by default.
- **L9 Title format and check** (spec 8 on `itm_716318c57252`, refuse on `itm_cc2280e20b79`): `integrate` checks a slice branch against
  `^feat\(<slug>\): S\d+\w* [^A-Z]` and a fix branch against `^fix\(<slug>\): \S`. The slug
  comes from the checked-out `feat/<slug>`. Rejected: a format the deck checks, because no
  deck call sees the PR.
- **L10 The title check runs before the first merge**, after `assertPushable`, through the
  existing `findPr` option. Rejected: checking at the commit, after a merge and a test run
  have already been spent.
- **L11 The pilot prompt pin is never raised, and spec 6's and 8's words are paid for by
  three trims in `agents/pilot.md`, about 56 tokens:**
  - T1 `:15-16`: ", because it was written after them and against a real run".
  - T2 `:244-245`: "because the global rule against editing the shared checkout applies
    to a docs file too", keeping "in its own worktree".
  - T3 `:433-435`: "— no slice was reviewed on principles on its own way in, so there is
    no earlier verdict on this feature to carry forward".

  Each trim drops a reason and keeps its rule. QA's pin of 5752 is never raised either.
- **L12 ADRs:** S1 writes *A crew reports to the agent that spawned it* and S4 writes *PR
  titles have one format and integrate enforces it*. They take the next free numbers,
  checked at Gate 1 (A5).

## 6. Assumed decisions awaiting the user

- **A1 No PR, or no `gh`, means `integrate` runs as today.** Tradeoff: a branch without a PR
  skips the check, but refusing would break a run with no `gh` and any base-only call. The
  check also runs only when HEAD is `feat/<slug>`.
- **A2 The pushback row goes to the implementer, the fundamentalist and QA only.** The
  explorer, teacher, auditor and architect already report a pushback on the premise in their
  own terms. The co-pilot's hand-back table gains no column: the co-pilot forwards a crew
  pushback only as a spec-4 item.
- **A3 `rules/orchestration.md` is not edited.** It says to send questions "to `main`".
  Tradeoff: the install never overwrites an installed copy, so an edit would not reach this
  machine. Instead each crew definition says "instead of `main`" in its own words, which are
  more specific than the rule.
- **A4 The hello's wording** is `co-pilot of <ticket>: send me what your definition sends
  main`, carried in `pilot-co-pilot.md`. Nothing else is in it.
- **A5 ADR numbers 0099 (S1) and 0100 (S4).** Re-checked at Gate 1: deck-press-feedback holds 0096 and 0097
  in flight (#373) and has 0098 planned for its S7; 0090 is reserved by walkthrough-taste.

## 7. Out of scope

- Who the pilot's own crew addresses (unchanged: `main`).
- How the pilot relays an answer to a live co-pilot (already `pilot.md:143-144`).
- The reviewers, the explorer, the teacher and the auditor.
- Walkthrough content (`itm_9792c6d0e6d0`) and the security reviewer (`itm_b26f9ce833c9`),
  which are not merged.
- Any deck or daemon change.
- Renaming the titles of existing PRs.

## 8. Slices

| Slice | Title | Spec | Files owned | After | File |
|---|---|---|---|---|---|
| S1 | An implementer the co-pilot spawns reports to the co-pilot (walking skeleton) | 1 (implementer), 2, 4, 5 | `agents/pilot-co-pilot.md`, `agents/pilot-implementer.md`, `scripts/test/pilot-agents.test.mjs`, `docs/adr/0099-…` (new) | – | [S1](slices/S1.md) |
| S2 | QA and the fundamentalist report to the co-pilot, and QA returns to main after the hand-back | 1 (QA, fundamentalist), 3 | `agents/pilot-qa.md`, `agents/pilot-fundamentalist.md`, `scripts/test/pilot-agents.test.mjs`, `scripts/test/qa-preview.test.mjs` (lowered only) | S1 | [S2](slices/S2.md) |
| S3 | One reply per override, a pushback row in every crew report, one PR-title format in the pilot's prose | 6, 7, 8 | `agents/pilot.md`, `skills/grilling/SKILL.md`, `agents/pilot-implementer.md`, `agents/pilot-qa.md`, `agents/pilot-fundamentalist.md` (report sections only), `scripts/test/grilling-voice.test.mjs`, `scripts/test/pilot-agents.test.mjs`, `scripts/test/measure-prompt.test.mjs` (lowered only) | S2 | [S3](slices/S3.md) |
| S4 | `pilot integrate` refuses a PR title off the format | 9 | `scripts/integrate.mjs`, `scripts/test/integrate.test.mjs`, `docs/adr/0100-…` (new) | – (beside S1 to S3) | [S4](slices/S4.md) |

- S1, S2 and S3 run in a line: they share `pilot-agents.test.mjs`, and S3 edits the report
  sections of the definitions S1 and S2 rewrite.
- S4 shares no file with them and runs beside S1.
- The format S4 enforces is L9. S3 writes the same format into prose, and neither restates
  it from the other.

## 9. Acceptance evidence

The user meets these in this order:

1. The deck's next yellow ticket runs under a co-pilot. The pilot's own transcript shows no
   crew message relayed by hand (spec 1, 4).
2. The co-pilot's transcript shows each child's report, questions and any seam change
   arriving from the child's id. Each child's transcript shows the hello and its
   `SendMessage` `to` set to the co-pilot's id (spec 1, 2, 5).
3. QA's walkthrough-posted report reaches the co-pilot, and the co-pilot's hand-back table
   cites the walkthrough. QA's later messages go to `main` (spec 3).
4. On an override during grilling, the pilot posts one reply naming the consequence, then
   locks the answer (spec 6). A crew report shows a pushback row (spec 7).
5. Every PR in that run is titled to the format (spec 8). `pilot integrate` on a fixture
   branch with a bad title refuses it, naming the title (spec 9).
6. Under all of it, `npm test` is green with the wording and prompt pins.

## 10. Status

| Slice | State | Branch | PR | Worktree | Blocker | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | slice/co-pilot-reports-s1 | – | pilot-slice-co-pilot-reports-s1 | – | 1, 2, 4, 5 |
| S2 | planned | slice/co-pilot-reports-s2 | – | pilot-slice-co-pilot-reports-s2 | S1 | 1, 3 |
| S3 | planned | slice/co-pilot-reports-s3 | – | pilot-slice-co-pilot-reports-s3 | S2 | 6, 7, 8 |
| S4 | planned | slice/co-pilot-reports-s4 | – | pilot-slice-co-pilot-reports-s4 | – | 9 |
| feature | planned | feat/co-pilot-reports | – | pilot-feat-co-pilot-reports | S1, S2, S3, S4 | 1–9 |
