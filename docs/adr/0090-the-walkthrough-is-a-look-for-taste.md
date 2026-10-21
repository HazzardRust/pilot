---
status: accepted
date: 2026-10-08
tags: [deck, qa]
supersedes: []
superseded_by: []
paths: [deck/store.mjs, deck/walkthrough-shape.mjs]
---
# The walkthrough is a look for taste

QA's walkthrough of 2026-10-05 (itm_6b2c364cb976) was eighteen steps of shell lines, env assignments and scripts, and the user said what it should be instead: "It should just be a simple step by step to catch bad taste at this point only humans are good at picking". The look posted the same day (itm_f4e7427b21b6), seven steps of where to click and what good looks like, is what they wanted. So we decided the deck refuses a QA walkthrough whose steps ask the user to run a command, and that what QA checked by machine goes in its body as one "checked for you" table drawn under the steps.

- **The table is the body, drawn under the steps (L1).** No new `checked` field: it would add schema bytes to `deck_post` that every agent granted the tool pays on every turn.
- **Only a QA-authored walkthrough is checked (L3).** `postItem` runs `walkthroughShapeGaps` from `deck/walkthrough-shape.mjs` when `authorKind(author)` is `qa`. The pilot's wizard exists to have the user run what only they can, so its steps may name commands, and it keeps its forty steps.
- **A step is a command step when either half has one (L4):** an inline code span whose first word is `npm npx node pilot git gh curl cd set export bash sh pwsh powershell python pip`, or one starting with `$`, `./` or `.\`; an env assignment (`NAME=value`, `$env:`); an instruction that starts with one of those words and a space; or `&&`. The refusal names the step number and the matched word, never the step text, and runs after the credential check, so a `TOKEN=…` step is refused as a credential before a gap could name it.

Rejected:
- Refusing every walkthrough: it breaks the wizard.
- Flagging every code span: `` `Sign off` `` and `` `S1` `` are UI names.
- Treating `;` as a command separator: "it reads PAUSING; the window closes" is prose, and `pilot:` (a colon) is a name, not `pilot ` (a space).
- A QA-only step cap (`MAX_WALKTHROUGH_STEPS = 8`): the user rejected it on itm_ced7e305b38f; `MAX_SCREENS` (40) stays the only bound.

**Consequences**:
- A command the word list does not name (`cp`, `rm`) passes; the list is a net for the common shapes, and the wording in `agents/pilot-qa.md` carries the rest.
- The daemon enforces this only once it restarts on the merged code.

Recorded in `docs/design/walkthrough-taste/architecture.md` (§2 spec 2, 9; §5 L1, L3, L4, L5, L6).
