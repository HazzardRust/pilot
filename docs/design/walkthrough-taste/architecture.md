# The walkthrough is a short look for taste, not a test script

Ticket itm_9792c6d0e6d0 · thread itm_6b2c364cb976 · design branch `design/walkthrough-taste` cut from `origin/pilot` at c79346d2 (rebased 2026-10-07 from 9b9c284f, earlier from dbf20492) · merge step itm_9ab0b21405f3 (merged none)

## 1. Problem

The user, on the pilot-branch walkthrough of 2026-10-05: "what i dont want it to be is tonnes of hard to read text with many commands and stuff. It should just be a simple step by step to catch bad taste at this point only humans are good at picking up, specifically UI. all the other commands and scripts and stuff is stuff thoroughly tested in the workflow." That walkthrough (itm_6b2c364cb976) ran to 18 steps, and 14 of them were `node …`, `cd …; pilot budget …`, env lines or curl. A second request was merged in on the same day, on the same thread. It came out of a Pause that passed QA on a fresh fixture but failed live in a used directory, while the tab read "Pausing": QA's live pass has to be harder to fool and harder to skip.

## 2. Spec

Lines 1–4 were agreed with the user. Lines 5–8 were agreed and merged in on itm_d71166961f0b. Lines 9–10 are implied here and are *assumed* until the pilot puts them to the user.

| # | Behaviour | Evidence |
|---|---|---|
| 1 | QA's walkthrough holds only what a human judges by eye. Each step is one line, `where → what good looks like`, UI first. | A wording pin on `agents/pilot-qa.md` § The procedure; this run's own QA walkthrough, posted under it. |
| 2 | No QA step asks the user to run a command, a script or an env line. QA stands the environment up, leaves it running, and hands over `url` already in the state to look at. The deck refuses a QA walkthrough step that carries a command and names the step. | `deck/test/walkthrough-shape.test.mjs`: steps [1] and [16] of itm_6b2c364cb976 are refused; all 7 steps of itm_f4e7427b21b6 pass, "a pilot:pilot terminal window opens" included. |
| 3 | What QA checked by machine goes, as a rule, in one short "checked for you" table (spec line, result, evidence) that is the walkthrough's body, and the thread page draws it **under** the steps. This is advice to the QA running it, not a ruling: the user on itm_e45c7b76f48d, 2026-10-08, "line 3 shouldnt be some deterministic ruling over everything, features is such a broad topic." A feature with nothing to look at gets QA's call: the table and Sign off alone, or one step pointing at the closest observable thing (A2, decided the same way). | A render test showing the body follows `<ol class="steps">`; a wording pin that § The procedure gives this as advice with both no-surface shapes; the real walkthrough shows the table under its steps. |
| 4 | decided by the user (itm_ced7e305b38f, 2026-10-08): a QA walkthrough is a few generalised pushes on where to look and what to click through, never a script and never exhaustive; the user clicks through everything and judges feel. No step count is refused: `MAX_SCREENS` (40) stays the only bound. | A wording pin on `agents/pilot-qa.md` § The procedure; `deck/test/items.test.mjs`'s 40-step walkthrough test unchanged. |
| 5 | A control whose behaviour depends on session state (Pause, Resume, Start, End) is proven live a second time in an environment an earlier run already used. | A wording pin; a QA report table with a first-run row and a used-environment row for one such control. |
| 6 | QA asserts a control's outcome in the run record or the store, never by the label the page draws. | A wording pin; a QA report row naming the record field it read. |
| 7 | No step tells the user to press a control QA has not itself pressed live at the tip the walkthrough names. | A wording pin; the table of one real walkthrough lists each pressed control with its tip. |
| 8 | QA's definition says where a session's background-agent output lives (`%TEMP%\claude\<project>\<session>\`) and says to read it beside the transcript. | A wording pin on `agents/pilot-qa.md`. |
| 9 | *assumed* (locked as L3): the pilot's wizard stages and the closing `report` are untouched. They keep 40 steps, and a wizard step may name a command. | `deck/test/items.test.mjs`'s 40-step walkthrough test (posted with no QA author) stays green, unchanged. |
| 10 | decided by the user (itm_5c6c19ec8912, 2026-10-08, the recommended option): deployment notes (env vars, flags, apply order, migrations to eyeball) leave the walkthrough body. They stay in QA's PR comment, which already carries them (sign-off step 3). | A wording pin that § The procedure no longer lists them. |

The deck cannot check that a step is judged by eye, or that the table is complete; that is wording only. The live daemon on 4321 enforces none of this until it restarts on the merged code.

## 3. Findings

| What | Where | The design leans on it because |
|---|---|---|
| A post's one writer | `deck/store.mjs:571` `postItem` | Every refusal lives here: the ticket-shape refusal at :595 runs before the store is read, and the credential check (`refuseCredentials`) at :600. |
| The pure-shape precedent | `deck/ticket-shape.mjs` `ticketShapeGaps(body) → string[]` | The new `walkthroughShapeGaps` copies it: a pure body-in, gaps-out function. |
| Who posted it | `deck/items.mjs:490` `authorKind`; `hooks/deck-author.js` stamps `author` | `pilot:pilot-qa` → `qa`. The refusals key on it, so the wizard's and the pilot's walkthroughs are exempt. |
| The step cap | `deck/items.mjs:146` `MAX_SCREENS = 40`, shared by `walkthrough` and `report` (`SCREENS_FIELD`, :267) | 40 stays and is the only bound (spec 4, as the user decided on itm_ced7e305b38f); there is no narrower QA cap. |
| Steps render | `deck/ui/render.mjs:198` `renderSteps`, :211 `renderWalkthroughDetail`, :367 its renderer entry, :2129–2131 (body **above** detail) | Spec 3 needs the walkthrough's body drawn after its detail. |
| Tables in bodies | `renderMarkdown` already draws pipe tables (gate1's `slices`, render.mjs:233) | So the table needs no new field and no new renderer. |
| URL and login | `deck/ui/markdown.mjs:61` `safeHref` links only http/https, anything else is escaped text; login is escaped (render.mjs:215); credentials are checked over every field (store.mjs:600) | Kept as they are. See L5. |
| Prompt budget | `scripts/test/measure-prompt.test.mjs:124` pins the pilot at 10115.5 (measured 10115.5 on c79346d2); `scripts/test/qa-preview.test.mjs:118` pins QA at 5752 (measured 5668.5) | The pilot has no headroom and QA has 83.5. `deck/tools.mjs` is not touched, because every deck_post byte is charged to five agents. |
| Existing QA pin | `scripts/test/pilot-agents.test.mjs:836` (`do this → correct result`, `one line`, `no numbering or label`, the never-verify sentence), :370 | S3 rewrites the :836 test to the new wording; :370 holds. |
| The wizard | `skills/wizard/SKILL.md:54`: its stages are `walkthrough` items whose steps are the user's own actions | This is why L3 exempts non-QA walkthroughs. |
| Who posts it | `agents/pilot-qa.md:150`: QA is spawned by the yellow co-pilot (ADR 0088), reports once the walkthrough is posted, and stops | The author stays `pilot:pilot-qa` whoever spawns it, so L3's key holds under the co-pilot. |
| The sibling run landed | clear-waits-co-pilot is on `pilot` (58c9ba8c): it took ADR 0089 and lowered the pilot pin to 10115.5 | S3 measures against c79346d2 and nothing else is in flight on these pins; 0090 is free. |
| Past walkthroughs | `~/.claude/pilot/deck.json`, 62 walkthroughs, median 9 steps, max 40. The last three are 7/0, 18/14 and 4/1 (steps/command steps); the 4/1 is a pilot-posted one-edit item | These are the test fixtures for spec 2, taken verbatim. |

## 4. Ubiquitous language

- **Walkthrough**: QA's one `walkthrough` item for the feature, which is the Gate 2 look. Not the wizard's stages, and not the closing report.
- **Step**: one entry of `screens`, written `where → what good looks like`.
- **Checked for you**: the walkthrough's body, a pipe table of spec line | result | evidence, holding the machine checks as a rule (spec 3).
- **Command step**: a step the deck refuses because it asks the user to run something (L4).
- **Used environment**: a directory or deck an earlier run already started a session in.

## 5. Locked decisions

- **L1 The table is the body, drawn under the steps.** I rejected a new `checked` field. It would add schema bytes to deck_post that every agent granted the tool pays on every turn, and the pilot's pin has no headroom. The cost is that the walkthrough's card preview opens on the table.
- **L2 The refusal is a pure module, `deck/walkthrough-shape.mjs`, called from `postItem`,** following `ticket-shape.mjs`. I rejected inlining it in `store.mjs`, because it is not testable without a store.
- **L3 Only a QA-authored walkthrough is checked** (`authorKind(author) === 'qa'`). The wizard exists to have the user run what only they can, so refusing commands there would break it. I rejected refusing every walkthrough.
- **L4 A step is a command step when either half has** an inline code span whose first word is a command (`npm npx node pilot git gh curl cd set export bash sh pwsh powershell python pip`), or a code span starting with `$`, `./` or `.\`; or an env assignment (`[A-Z][A-Z0-9_]*=\S`, `$env:`); or an instruction that starts with one of those words followed by a space; or `&&`. `pilot:` (a colon) is not `pilot ` (a space), and a `;` is prose: itm_f4e7427b21b6 [5] reads "it reads PAUSING; the window closes", so it stays legal. I rejected flagging every code span, because `Press **Sign off**` and `` `S1` `` are UI names.
- **L5 The refusal names the step number and the matched word, never the step text, and runs after `refuseCredentials`,** so `TOKEN=…` is refused as a credential before it could be echoed. `url` and `login` keep today's handling: no new refusal (a non-http `url` is already drawn as inert text).
- **L6 No step cap; `MAX_SCREENS` stays 40.** The user rejected the architect's `MAX_WALKTHROUGH_STEPS = 8` on itm_ced7e305b38f, 2026-10-08: "i dont want a hard cap really. For UI QA walkthroughs, i want it to be generalised pushes in the right direction on where to look. what i do is click through all the buttons i can and see if it feels good." The walkthrough's length is QA's judgement, pinned by wording (spec 4), and nothing in code carries a QA-only count.
- **L7 Budget is paid per slice from the same file.** S3 removes the procedure's deployment paragraph, its "up to forty steps" sentence and the GUI-then-pictures list. S4 spends that saving and lowers QA's pin to the measured value. pilot.md step 8's sentence gets shorter, not longer, and the pilot's pin is lowered to the measured value.
- **L8 An ADR**, `docs/adr/0090-the-walkthrough-is-a-look-for-taste.md`, records L1, L3 and L4 (owned by S1). 0089 is taken by clear-waits-co-pilot (landed on `pilot`).
- **L10 Grilling depth is forks** (itm_3d082818c353, 2026-10-08): only the decisions whose paths change the deliverable reach the user as items; the rest are read in this artefact at Gate 1, which is the only gate item.
- **L9 QA runs on a scratch deck in a scratch repository** (`PILOT_DECK_DIR`, `PILOT_DECK_PORT`), left running; the user's last look is on the real deck after merge and a daemon restart (itm_e4c98a382758, 2026-10-06).

## 6. Assumed decisions awaiting the user

| Id | Decision | Default taken | Thread |
|---|---|---|---|
| A1 | Grilling depth | forks: decided by the user on itm_3d082818c353, 2026-10-08 (L10) | closed |
| A2 | What a feature with no surface gets | QA's judgement, both shapes allowed: the table and Sign off alone, or one step at the closest observable thing; spec 3 is advice, not a ruling. Decided by the user on itm_e45c7b76f48d, 2026-10-08 | closed |
| A3 | The step cap | none: decided by the user on itm_ced7e305b38f, 2026-10-08 (L6) | closed |
| A5 | Spec 9 (wizard and report untouched) | As written in §2 | to main; spec 10 (deployment notes only in the PR comment) decided by the user on itm_5c6c19ec8912, 2026-10-08 |

## 7. Out of scope

- A per-step length or step-count refusal. Spec 1 and 4 are pinned by wording, because a false refusal mid-QA costs a repost.
- `rules/vertical-execution.md` and `rules/orchestration.md` still describe the procedure as "a GUI first, then pictures…". Those are the user's installed law, so changing them is their call (follow-up).
- Requiring a body table or a `url` by refusal. Existing walkthrough fixtures (28 test files) post neither, and a picture or plot has no http URL.
- Enforcing anything on the live daemon before it restarts on merged code.

## 8. Slices

| Slice | Delivers | Files owned | After | File |
|---|---|---|---|---|
| S1 The deck refuses a QA walkthrough step that runs a command | 2, 9 | `deck/walkthrough-shape.mjs` (new), `deck/store.mjs`, `deck/test/walkthrough-shape.test.mjs` (new), `docs/adr/0090-the-walkthrough-is-a-look-for-taste.md` (new) | – | [S1](slices/S1.md) |
| S2 A walkthrough's page draws its checked-for-you table under the steps | 3 | `deck/ui/render.mjs`, `deck/test/walkthrough-render.test.mjs` (new) | – | [S2](slices/S2.md) |
| S3 QA writes the walkthrough as a look for taste | 1, 2, 3, 4, 10 (wording) | `agents/pilot-qa.md`, `agents/pilot.md`, `CONTEXT.md`, `scripts/test/pilot-agents.test.mjs`, `scripts/test/measure-prompt.test.mjs` | – | [S3](slices/S3.md) |
| S4 QA proves state controls live, twice, from the record | 5, 6, 7, 8 | `agents/pilot-qa.md`, `scripts/test/qa-taste.test.mjs` (new), `scripts/test/qa-preview.test.mjs` | S3 | [S4](slices/S4.md) |

S1 is the walking skeleton: the deck holds the new shape end to end. S1 and S2 own disjoint files and can run in parallel. S3 shares no file with S1 or S2 and can run beside them. S4 comes after S3 because both own `agents/pilot-qa.md`. Every slice's diff is under 400 changed lines (S1 ≈ 200, the others ≈ 80).

## 9. Acceptance evidence

What the user meets, in order. QA stands up a scratch deck (L9) and leaves it running, seeded with one short QA walkthrough and its table:
1. The scratch deck's URL opens on that walkthrough: steps on top, each `where → what good looks like`, with the "checked for you" table under them (spec 1, 3, 4).
2. The table holds the machine checks: the refusal of a command step (spec 2), the 40-step bound untouched for QA, the wizard and the report (4, 9), the pins (1, 5–8, 10), and each pressed control with its tip (7). Each row's evidence is a test name or a record field (6).
3. This run's own walkthrough has no command among its steps (spec 2).
4. After merge and a daemon restart, the user takes the last look on the real deck.

## 10. Status

| Slice | State | Branch | PR | Worktree | Blocker | Delivers |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 2, 9 |
| S2 | planned | | | | – | 3 |
| S3 | planned | | | | – | 1, 2, 3, 4, 10 |
| S4 | planned | | | | S3 | 5, 6, 7, 8 |
| walkthrough-taste | planned | feat/walkthrough-taste | | | S1–S4 | 1–10 |

## 11. Principles verdicts

| id | verdict | reason |
| --- | --- | --- |
| F0 delete the deck-side refusal | dropped by the user | itm_6ed016897c42, 2026-10-08: keep the refusal as signed (L2-L4), add the missing L4 tests and nothing more, no word-list change |
| F1 | kept | one table test over every COMMANDS word and the L4 edges; tests only, no change to the COMMANDS list or the module |
| F2 | kept | the QA pins read through `scripts/test/lib/area-file.mjs`, not a local extractor |
| F3 | kept | at least 33 tokens of redundant QA prose cut; QA's pin lowered to the new measure |
| N1 | kept | the one-element wizard loop in `pilot-rules.test.mjs` dropped |
| N2 | kept | the duplicate `/a GUI first/` pin deleted; `general-purpose.test.mjs` keeps it |
| N3 | kept | `forty` dropped from the deployment-notes regex |
| Q1 | kept | only a QA walkthrough draws its detail first; a wizard's keeps the body first (spec 9, L3) |
| Q2 | kept | the card preview's table cells no longer wrap mid-word |
| Q3 | kept | a gap between the byline and the table, and between the table and the reply slot |
| Q4 | kept | QA's walkthrough is always posted, as S3's no-surface shapes say (spec 3) |
| Q2b preview excerpt cuts the evidence cell | dropped | the excerpt limit L1 accepts |
