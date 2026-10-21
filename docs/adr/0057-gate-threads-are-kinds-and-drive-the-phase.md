---
status: accepted
date: 2026-10-01
tags: [gates, threads]
supersedes: [0029, 0051, 0052]
superseded_by: []
paths: [docs/design/thread-kinds/architecture.md]
---
# Gate 1 and Gate 2 are thread kinds of their own, and they alone move the phase

This supersedes ADR 0051's rejection of `gate-1` / `gate-2` kinds (its L5, "a gate is a field, not a kind"), and amends ADR 0052 (the phase is derived from `gate`-tagged items) and ADR 0029 (the spec waits for open questions). Gate 1 and Gate 2 were an undifferentiated `signoff` carrying a `gate` tag that the pilot's own tool schema could not send, so the tab's phase never moved, and the gate's evidence was prose in the body. The user asked for the gates to be threads of their own with their own evidence (thread-kinds spec 10-15). So we decided the gate is the kind.

- **`gate1` and `gate2` are kinds (L5).** Both join `KINDS`, `POSTABLE_KINDS`, `GATED_KINDS` and `RUN_KINDS`, so full auto still resolves them and the open-question refusal of ADR 0029 still holds them back. Each draws Sign off and Not yet and its evidence as a field block through `detailOf` and the walkthrough's `<dl>` renderer. A `gate1` needs `artefact`, `sha`, `locked` (a count) and `slices`; a `gate2` needs `pr` and `sha`. A missing required field is refused by name.
- **`signoff` stays for non-gate sign-offs.** The wizard's closing sign-off is unchanged. A `signoff` carrying `gate` is refused, naming the kind to use.
- **The `gate` tag is retired (L6).** `GATES`, `GATE_FIELD` and `GATE_2_FIELD` are deleted and there is no read-time alias: an in-flight tab shows green until its next gate thread.
- **The phase reads kinds only, from items alone (L4, L17).** `runPhaseOf` stays pure and derived (ADR 0052): a signed `gate1` moves green *planning* to yellow *implementing*, a signed `gate2` yellow to red, and nothing else moves it forward. The closing report no longer clears it; the tab stays red until a new ticket starts. The cycle start resets it to green: a hand-off posted while red, a `question` or a `gate1` posted while red, or a small ticket's `startedAt` (spec 16, 17); a hand-off posted while yellow holds (L13).
- **The red phase is named *concluding* (L18)**, in `runPhaseOf`'s value, the `data-phase` CSS rule, the tests and `pilot.md`. "Closing report" keeps its name.
- **Gate 2 is the pilot's thread alone (L19).** The walkthrough loses its tag; the pilot posts `gate2` citing it once signed, and only `gate2` moves the phase. A walkthrough is any step-by-step ticket only the user can do (a cloud config, a GitHub config) and is not mandatory, so `gate2`'s `walkthrough` field is optional.
- **The `spec` kind is retired (L15, spec 25).** The pilot agrees the spec through grilling and the artefact's §2, and the user reads it at Gate 1 in the artefact the `gate1` thread names, so a separate confirmation was redundant. `spec` leaves `KINDS`, `POSTABLE_KINDS`, `GATED_KINDS`, `RUN_KINDS`, `SPECS`, `PROMPTS` and `KIND_RENDERERS`; a post of it is refused by a named check saying it is retired. ADR 0029's refusal stays for `signoff`, `gate1` and `gate2`. A stored `spec` item draws as an unknown kind, with Dismiss (ADR 0051 L3). With no `spec`, the new-run trigger is the first `question` posted while red, with `gate1` while red as the backstop for a run with nothing to ask.

Rejected:
- Parsing body sections for the evidence, or keeping `signoff` with a required `gate`: the field machinery and renderer already exist, and the tag was the thing the schema could not send.
- A stored per-repo cursor, or a record `startedAt` passed into `tabsOf`: `tabsOf` and `renderHomePage` already thread too many inputs, and anything but an item is another one (F9).
- A legacy reader for gate-tagged items kept for ever: one wrong colour once, at upgrade, is cheaper.
- QA posting its walkthrough as kind `gate2`: one press, but the gate's evidence buried under forty steps and the walkthrough id meaning nothing.
- A silent `spec` resolved at post (the user's first wording, withdrawn a minute later), and a `ticket` posted while red as the cycle trigger, because tickets are queued while concluding.
- Renaming *closing* on the page only, leaving the value beneath it.

**Consequences**:
- Nothing here reaches a live run until a release holding it is installed in the plugin cache (F14).
- A stored `spec` item or a stored gate-tagged `signoff` is still readable and dismissable; neither moves the phase.
- About twenty deck tests that hard-code `signoff` or `gate` change with it.

Recorded in `docs/design/thread-kinds/architecture.md` (§5 L4, L5, L6, L13, L15, L17, L18, L19); deck threads itm_561602da0fc1, itm_6f790feeb38a, itm_6fc36533cc72, itm_497c0390c3ae, itm_fa23429a3888.
