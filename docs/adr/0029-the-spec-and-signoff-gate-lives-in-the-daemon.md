---
status: amended
date: 2026-09-23
tags: [deck, gates]
supersedes: []
superseded_by: [0057, 0060]
paths: [docs/design/run-record/architecture.md, deck/items.mjs, deck/store.mjs]
---
# The spec and the sign-off wait for open questions, and the daemon enforces it

The pilot of the run-record run posted its spec while three questions were still open, and the user asked for that to be made impossible rather than remembered (spec 11 of `docs/design/run-record/architecture.md`, itm_4073564252ff). A spec or a verdict agreed over an unanswered question is agreed to less than it says. We decided that `spec` is a fourth known kind in `deck/items.mjs` (`KIND_SPEC`), shaped and rendered exactly as a `question` and a `signoff` are — the pilot's options (`agree`, `agree with edits`) and the deck's own Teach me, through the same `renderChoices` (L21) — and that the gate is in the daemon, in `postItem` in `deck/store.mjs`: a `spec` or `signoff` whose directory (`sameRepo`) has any open `question` is a `DeckRefusal` naming every open question's id, and once those are resolved the same post succeeds (L22). Only an open `question` holds one back; a `walkthrough`, a `handoff`, another `spec` and any unknown kind neither hold nor are held. Rejected: a `question` with a `spec:` title prefix (nothing could tell it from a question); a PreToolUse hook on `deck_post` (it holds only for the session it is installed in); a check in the stdio client (a hand `curl` or another writer walks past it); and a rule in the SKILL alone, which is what failed on the run that asked for this.

**Consequences**: the gate holds for every writer — a session without the plugin's hooks, a subagent, the HTTP route and a hand `curl` alike — and fails closed with the ids to answer first; `deck_wait`, the stop gate and `Yours` treat a `spec` as they treat a question, because they already read every known kind the same way; an item posted without a `repo` belongs to no directory, so it neither holds nor is held; the check reads the deck the post is about to be written to, in the same synchronous read and write of the one daemon (ADR 0005), so no question posted in between can slip past it; and nothing about the store's shape changes, so `deck.json` stays `STORE_VERSION 1`.
