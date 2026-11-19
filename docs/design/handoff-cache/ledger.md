# Ledger: what the hand-off-cache run built and what it ruled out

Spec line 6. One row per measured line 1-7a of `architecture.md` §2, each with its number and the committed file it
came from. Claude Code 2.1.328; the numbers are copied from the files named, not re-measured here.

| line | built or ruled out | number | source file |
| --- | --- | --- | --- |
| 1 | built | 38 transcripts on disk, 0 unreadable, 29 after-handoff and 7 cold first turns; the median after-handoff turn reads 24,419 cached and writes 15,865 (1h), cached share 0.61, 5,085 ms after the session before it ended, against a cold turn's 0 read, 36,363 written, share 0 | `measurements.md` |
| 2 | built, accounting short of its bar | 29 sections in both starts, the same 29 names; 8 carry a size and hash (7 identical, `memory` differs by per-session paths), 21 are named only, so the bar of 0 unaccounted is not met | `probes/sections.md` |
| 3 | ruled out | the reordered frame would share 752 bytes (about 190 tokens) between hand-offs, under the 1,000 bar; the prompt cache matches whole blocks, so the live gain is likely 0; reverted at step 7 | `measurements.md`; commit 962af8c5 |
| 4 | ruled out | `/clear` stays: kept head +1,578 / -1,683 / +1,579 against 5,506 (pickup 3 of 3); compact refused headless; branch absent | `probes/restart.md` |
| 5 | ruled out | trimming all 8 sized sections moves the first turn +1 / 0 / +10 / +5 tokens (one unrepeated -1,375) against the 1,000 bar; `deck_status` 0 of 3 trimmed and 0 of 3 untrimmed | `probes/sections.md` |
| 6 | built | this ledger: 8 rows, 0 without a number | `ledger.md` |
| 7 | built | the crew survived and received the message in 15 of 15 runs, before, during and after the clear, 5 runs at each point | `probes/crew.md` |
| 7a | ruled out | no loss in 15 runs, and QA's run, 3 of 3 received when the send lands between the clear and the submit; not covered: an interactive TTY, an agent life past 70 s | `probes/crew.md` (incl. the section `QA: a send between the clear and the submit`) |

Misses: whether the numbers are enough is the user's to read at Gate 2.
