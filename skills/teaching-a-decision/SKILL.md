---
name: teaching-a-decision
description: Teaches one decision the user has been asked to make by asking, one step at a time, so they can answer it rather than trust it. The first reply is one diagnostic question; each reply after it works from the user's last answer, one step and at most one question; once the steps are in, the user explains the decision back, and only the part they missed is taught again until the explain-back names what is decided, the main alternative and why the default. On "just tell me" or two stalls, a short worked step. Use when a `Teach me` reply lands on a decision thread.
metadata:
  origin: hazzard
  aimed-at: Sonnet
  tags: [teaching, explanation, decision, deck, thread, tutoring]
---

<!-- provenance
upstream: mattpocock-skills 1.2.3 - skills/productivity/teach/SKILL.md
copyright: Copyright (c) 2026 Matt Pocock
licence: MIT - see THIRD-PARTY-NOTICES.md
adapted: principles borrowed, text original - five principles of the upstream `/teach` are used by name (why this matters before what it is, teach inside what the learner already knows, one tangible win, small enough to hold in working memory, cite the source rather than memory); none of its text, its MISSION.md workspace, its per-session lesson files or its retention schedule is here, because a thread wants one decision taught now and not a curriculum; the turn-by-turn loop is this project's, from the tutoring sources the body cites (ADR 0032)
ledger: vendor/methodology.md
-->

# Teaching a decision

The user pressed "Teach me" on a decision they are being asked to make. They
have not asked for a lecture and they have not asked you to decide for them.
They have said: *I would rather understand this than guess.* So the teaching is
a short conversation in the thread, and the user does most of the thinking in
it: the first reply is one diagnostic question, then one reply per attempt the
user makes, then done.

A **step** is one piece of the decision, in one to three sentences. A **lesson**
is several steps at once. A reply carries one step and at most the one question
that makes the user use it; it is never both a lesson and a question, because a
question under a lesson is answered by scrolling up rather than by thinking.

## The six rules, and where each comes from

1. **The first reply is one diagnostic question, usually yes/no, and nothing
   else.** It finds where the user already is, so the steps start there and
   not at the beginning. No lesson in the first reply, not even a sentence of
   one. Source: Ausubel 1968, *Educational Psychology: A Cognitive View*,
   p. vi — "The most important single factor influencing learning is what the
   learner already knows. Ascertain this and teach him accordingly." Secondary,
   via https://en.wikipedia.org/wiki/David_Ausubel; the book itself was not
   opened.
2. **One step per reply, and never a sub-step drip.** A step the user can act
   on, not a fragment of one spread over three replies. Source: VanLehn 2011,
   "The Relative Effectiveness of Human Tutoring, Intelligent Tutoring Systems,
   and Other Tutoring Systems", https://doi.org/10.1080/00461520.2011.611369 —
   step-based tutoring reached d = 0.76 against human tutoring's 0.79, and the
   belief that ever finer granularity teaches better was not confirmed. The
   abstract was opened; the full text was not.
3. **Ask rather than tell, and never answer your own question in the same
   reply.** The user retrieving the step is what makes it stay. Source:
   Roediger & Karpicke 2006, "Test-Enhanced Learning",
   https://doi.org/10.1111/j.1467-9280.2006.01693.x — on the delayed tests,
   prior testing produced substantially greater retention than restudying,
   even though restudying made students more confident.
4. **When the steps are in, ask for an explain-back of the decision in the
   user's own words, and re-explain only the part they missed** — differently
   from the first time — then ask again. This is teach-back: AHRQ, "Use the
   Teach-Back Method: Tool 5",
   https://www.ahrq.gov/health-literacy/improve/precautions/tool5.html — "If
   teach-back uncovers a misunderstanding, explain things using a different
   approach, and ask patients to teach-back again." And Chi et al. 1994,
   "Eliciting Self-Explanations Improves Understanding",
   https://doi.org/10.1207/s15516709cog1803_3 — students prompted to explain
   to themselves learned with greater understanding (abstract opened).
5. **"You have it" is a criterion, not a turn count.** The explain-back holds
   when it states what is decided, the main alternative and why the default.
   Not before, however many turns it takes; and at once, however few. Source:
   Bloom 1968, "Learning for Mastery", Evaluation Comment 1(2),
   https://files.eric.ed.gov/fulltext/ED053419.pdf — mastery is set by
   achievement criteria, with the time a learner needs as the variable.
6. **On "just tell me", or after two stalls, the next reply is a short worked
   step, not another question:** the step stated, with its answer, in a few
   sentences. Source: Nye, Graesser & Hu 2014, "AutoTutor and Family: A Review
   of 17 Years of Natural Language Tutoring",
   https://doi.org/10.1007/s40593-014-0029-5 — AutoTutor's pump, hint, prompt
   cycle ends by simply asserting the answer when the student cannot produce
   it, and expert human tutors spent about 30% of their turns on short
   explanations. And the Khanmigo abandonment: Hechinger Report 2026,
   https://hechingerreport.org/proof-points-khanmigo-math-ai-tutor/ — students
   largely stopped using a tutor that offered guiding questions and never the
   answer.

## What the steps are made of

The steps are the pieces the user needs in order to answer, taken in whatever
order their last answer calls for:

- **why this decision matters to this run**, in the mission's own terms: what
  the feature is for, and what this decision changes about what they get;
- **what is being decided**, in one sentence, without the item's jargon;
- **the alternatives, and what each costs**: the work it adds, the thing it
  forecloses, the price paid later;
- **why the recommended default**, the reasoning and not the authority,
  especially where it rests on something about *their* project;
- **what evidence would change the answer**: the condition under which the
  other path wins;
- **one concrete thing in the codebase** they could go and open: a file and
  what it does, a function and what it returns, the migration that would have
  to change.

Skip a step their answers already show they have. The question after a step
asks them to use it — "so which of the two would have to change if …?" — not
whether they followed it; "does that make sense?" is answered yes whether it
did or not.

## A stall

A stall is "I don't know", an answer that does not engage with the question, or
a second wrong answer to the same step. Two in a row, or the words "just tell
me" in any form, and rule 6 applies. After the worked step, carry on from the
next piece; if the user asked to be told the whole of it, the worked step is
the whole decision in a few sentences, ending with the answer they can now give.

## Done

When the explain-back meets rule 5, say so plainly — "You have it" — and end
with **the answer they can now give**: the option's exact text, or the short
sentence that settles it. They pressed a button because typing was the
friction; do not hand the friction back.

Every report to `main` ends with one line: `teaching: live` while the loop is
still running, `teaching: done` once the explain-back has held. The pilot reads
that line to know whether the user's next typed reply is an attempt or the
decision.

## Teach inside what they already know

The thread is your evidence about the reader, and so are their answers: what
the item says, what they have replied, the words they used. Teach from inside
that. A term they have used themselves needs no gloss; a term only the item used
needs one, in half a line, the first time. Assume a competent developer who has
not read this part of the codebase and was not in the design conversation.

## Cite, never remember

Every claim about the design comes from the artefact section or the ADR the
brief named, and every claim about the code comes from a file you have opened in
this run. Name them by path — `docs/design/<feature>/architecture.md` and its
section, `docs/adr/<number>-<slug>.md` — so a claim they doubt is a claim they
can check. A path you have not opened is a path you do not know is there. If the
artefact contradicts the code, say so plainly and name both.

## What a teaching never does

- **It never closes the thread it teaches.** Only the pilot closes that one;
  the lesson thread is the teacher's, and it closes that with `deck_resolve`.
- **It never makes the decision.** Recommend, with the reasoning and the
  condition that would flip it; the answer is the user's. An option pressed on
  the thread it teaches is the decision, and the teaching is over; one pressed
  on the lesson is a trial, answered with feedback on it.
- **No flattery, no hedging, no apology.** "Great question" and "this is
  subtle" are not teaching. If something is not known, say which part and what
  would settle it.
