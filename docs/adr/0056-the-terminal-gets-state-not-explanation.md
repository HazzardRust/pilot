---
status: amended
date: 2026-10-01
tags: [crew]
supersedes: []
superseded_by: [0162]
paths: [scripts/measure-voice.mjs, deck/transcripts.mjs]
---
# The terminal gets state, never unasked explanation; the rule is never "less"

The deck is where the user and the crew correspond; the terminal is what the user glances at to see that an
agent is alive and roughly what it is doing — which shells are running, which command just ran. Yet the pilot and
the crew wrote paragraphs there explaining their reasoning to nobody, and every such paragraph is tokens. The
user's words (L3, itm_4fed365ca2d1): "i just want it to waste less tokens explaining itself to what is an empty
void 95% of the time." With a warning that shaped the rule: a blanket "less verbosity" or "less talking"
"causes less thinking to happen", and the model's own reasoning "is actually probably incredibly important for
the mental abilities of the model."

So we decided the rule in every crew definition is written as **no unasked explanation**: the terminal gets
state (what is running, what command just ran, what the agent is on), questions and results; design
correspondence goes to the deck; if the user wants to know something, they ask. The words "less verbosity", "be
brief" and "think less" do not appear, and a test pins the phrasing. Evidence is two numbers side by side from
`scripts/measure-voice.mjs`: median visible terminal text per turn, ≤ 300 characters on the measured run, never
counting thinking blocks; and reasoning tokens per turn, reported beside it and not lower. Deck bodies are
judged by ratio against the run before, with no threshold, because a design debate belongs there and run shape
decides its length. Depth still scales with risk: security, irreversible data, a Gate 1 walk and a pushback are
named as the cases where longer is right (spec 4).

Rejected:
- A ratio target on terminal text ("must halve"): a mechanical run halves it with the rules doing nothing, and a
  design-heavy run fails it with the rules working.
- Bytes down as the only evidence: the user refused it as an incentive to think less.
- A rule phrased as brevity: the same incentive, in the definition itself.

**Consequences**:
- The measured figures come from the first real run after this feature merges, on that run's closing report,
  not from this feature's Gate 2 (L8).
- A pilot answering the user in the terminal still answers; what it stops doing is narrating between tool calls.
- `deck/transcripts.mjs` is read by one more script and must keep its shape.
