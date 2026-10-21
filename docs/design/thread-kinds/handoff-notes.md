# Hand-off notes: thread-kinds (2026-10-01, after S12)

State: `feat/thread-kinds` at 98ab338; S1–S5, S7, S12 integrated (PRs #246, #247, #249, #248, #250, #245, #251); feature PR #244 draft; 2111 tests green. No agent live at hand-off.

## Next moves, in order

1. Spawn S6 (Opus; `slices/S6.md`; worktree `pilot-thread-kinds-s6`, branch `slice/thread-kinds-s6`, from 98ab338).
2. S8 after S6. Then S9 and S11 in parallel after S8 (S9 also needs S3, S4 — in). Then S10 after S7, S9.
3. Per slice: check the PR diff's files against the slice file; `deck_status` row `integrated`; then in this worktree
   `pilot integrate <branch> --trailer "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" --trailer "Claude-Session: https://claude.ai/code/session_01Gnsv4HNp2A1imhTaEyfwcW"`.
4. After S10: spawn `pilot-fundamentalist` (Opus) on PR #244 and `pilot-qa` (Opus; scratch deck on a free port, never 4321) together; QA is read-only until the fix round's tip. Gate 2 is a `signoff` item on this deck (its schema has no `gate2` kind until a release installs).

## Facts later slices need

- Pilot prompt pin is 10326 (S12 lowered it from 10400; measured 10314.25) with ~12 tokens headroom for S6/S8/S11 `pilot.md` edits; pilot-qa pin 5717. `scripts/measure-prompt.mjs` imports the real `deck/tools.mjs`.
- Known flakes: `usage.test.mjs` reset-time, `daemon.test.mjs` progress-token. `node --test <dir>` fails on Windows; use the glob.
- Decided by the pilot during Phase B: A8 concision 55% (S7 measured); a small ticket started while yellow holds the phase (S3); re-measure ends at `gate2.postedAt` (S5); a small ticket's Gate 2 stays QA's walkthrough carrying `ticket` (deferred, outside spec).

## Banked for the closing report

Friction: brief carried a wrong measure-prompt fact and stale pin figures (two slices each lost a run); scratch-deck port races between parallel implementers (4417, 4398) — a per-slice port convention or `pilot deck` picking a free port; heredoc backslash mangling in Git Bash (S1); deck markdown restarted every `<ol>` at 1 (S7 fixed, +3 lines); `node --test <dir>` opaque failure on Windows (S5); slice file named `RUN_KINDS` which did not exist and asked for an ADR paragraph already present (S12); positional-argument lists in `tabsOf` (6) and `renderHomePage` (12) made a design fork expensive (architect); the page inlines its stylesheet so regexes on `data-phase`/`Dismiss` match CSS first (S2, S4).

Deferred findings: S7 reviewer nits (`cut()` can split a `**`/backtick span; backtick inside a command breaks the Evidence code span, pre-existing; unmeasured items cut to 50 chars on the deck only).

Human steps at the end: merge #244; restart the deck daemon (pid 24092 today) once the release installs; queued tickets itm_faee47e34990 (+Add button, +weekly usage toggle) and itm_fa23429a3888 (+walkthroughs optional) carry jobs merged this session.

Teardown at the end: worktrees `pilot-design-thread-kinds`, `pilot-thread-kinds-s1`, `-s2`, `-s3`, `-s4`, `-s5`, `-s7`, `-s12` (branches integrated); the scratch decks were stopped by their owners.
