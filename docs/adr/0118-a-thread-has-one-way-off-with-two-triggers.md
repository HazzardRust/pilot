---
status: accepted
date: 2026-10-10
tags: [deck, ui, navigation]
supersedes: []
superseded_by: []
paths: [deck/ui/js/escape.mjs, deck/ui/thread.html, deck/ui/render-pages.mjs, docs/design/back-arrow/architecture.md]
---
# A thread has one way off, with two triggers

We decided the thread page's ← and its Escape key call one function, `leave()` in `deck/ui/js/escape.mjs`: back to the deck page the thread was reached from when the referrer is a deck page (the overview or a tab, not a thread) and the tab has history (decision itm_498a61106fc8), with the All toggle on a thread replacing its history entry, else to the owning deck's tab, which is the arrow's real href.

## Context

The arrow was a literal `href="/"` in `deck/ui/thread.html`. `/` goes through `landingFor`, which picks the overview unless exactly one tab is live, so with two live decks the arrow sent the user to the overview instead of the deck the thread belongs to (ticket itm_ede5c093eaf4). Escape already had the better behaviour: the browser's Back when it could, the arrow's href otherwise. The recommended default pointed the arrow at the owning deck and left Escape alone; the user overrode it on itm_0dedc5e1787e: "i want them to have the same functionality. if the thread was reached from the overview, it takes back to the overview".

## Decision

**One function (L3).** `escape.mjs` owns a private `leave()`; Escape's keydown and a plain left click on `a.back` both call it, the click with `preventDefault`. A modified or middle click is left to the browser, so the arrow stays a real link.

**The href is the owner (L1, L2).** `thread.html` carries a `<!--BACK-->` slot that `renderThreadPage` fills with `escapeHtml(hrefFor(tab, all))`: `/?run=<repo>`, with `&all=1` kept, for the resolved tab; `/?run=`, the overview, when no tab owns the thread (A2). The owner is the resolved tab, never `item.repo`, because `/?run=<repo>` with no tab renders the overview anyway.

## Rejected

- *The arrow always to the owner, Escape unchanged*: the recommended default; the two ways off a thread would disagree when the thread was reached from the overview or another deck.
- *Escape always following the href*: loses the browser's restored scroll and bookmarks on both triggers.
- *Resolving the owner client-side from `data-item`*: a second resolution of what the page already holds.
