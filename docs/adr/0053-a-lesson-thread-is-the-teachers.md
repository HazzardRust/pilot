---
status: accepted
date: 2026-10-01
tags: [threads, crew]
supersedes: [0041, 0051]
superseded_by: []
paths: []
---
# A lesson thread is the teacher's

This amends ADR 0041 (owners are `pilot` and `qa`; QA's own post is QA's, anyone else's the pilot's) and ADR 0051 (`POSTABLE_KINDS` is `KINDS` plus the handoffs). A `Teach me` press used to put the teaching in the decision's own thread, which the pilot owned, so every typed reply went through the pilot, which resumed the teacher with it. The user asked for the teaching to be a thread of its own, owned and concluded by the teacher, where a question's options can be tried and given feedback on before the decision is made on the real thread (small ticket itm_9aaece4a409c). So we decided the teacher is an owner kind and posts a `lesson`.

- **`lesson` is a thread type.** `POSTABLE_KINDS` gains `lesson`, which takes `options` (and `recommended`) as a question does, draws them with no `Teach me` of its own, and stays out of `KINDS`, so full auto never closes one. The thread it teaches is named in its body; there is no new field.
- **The teacher is an owner kind.** `OWNER_KINDS = ['pilot', 'qa', 'teacher']`. The rule of A1 is unchanged: an owner kind's own post is its own, so the teacher's lesson is the teacher's; the daemon hands a reply on it to the teacher's `deck_wait` alone, and only the teacher resolves it.
- **Passes stay between the pilot and QA.** `PASS_KINDS = ['pilot', 'qa']` is the `to` enum of `deck_reply`: a teacher owns only the lessons it posts, never a question handed to it, so the decision cannot drift onto a thread the pilot does not close.
- **The pilot's own hearing is `owner === pilot`.** `pilot wait` and the Stop gate read "the pilot's thread" as owned by the pilot, where they read "not QA's"; a teacher's lesson holds neither.
- **A trial is not a decision.** A press on a lesson's option is a reply on the lesson; nothing on the question it mirrors changes.

Rejected:
- A `source` field on the lesson: the body already names it, and nothing reads it but the user.
- Letting the pilot pass a question to the teacher: the teacher could then close the decision.
- Keeping the teaching in the question's thread with the teacher as a waiter there: one thread with two owners is what ADR 0041 exists to prevent.

**Consequences**:
- The teacher holds `deck_post`, `deck_wait` and `deck_resolve`, and still no `deck_read`.
- Two live teachers in one session share the `teacher` cursor, as two QAs would share `qa` (A10); a reply handed to the wrong one is sent to `main`.
- An older daemon refuses `lesson`; the teacher then teaches in the original thread as a helper and the pilot resumes it, as before.
- A lesson left with the teacher gone falls back to the pilot after the owner timers of ADR 0041, as a QA thread does.
