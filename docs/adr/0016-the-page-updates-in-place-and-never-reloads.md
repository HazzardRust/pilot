---
status: accepted
date: 2026-09-18
tags: [deck-ui]
supersedes: []
superseded_by: []
paths: []
---
# The deck page updates in place on a change, and never reloads

Every deck page reloaded itself on the daemon's `changed` event, and the thread page had grown a second and a third mechanism on top — a reload deferred while the reply box was focused, and the draft parked in `sessionStorage` — because the reload wiped the user's half-typed reply, their caret, their scroll and every open panel, which is what they were complaining about. We decided that on `changed` the page fetches its own URL and replaces only the inner HTML of regions marked `data-live`, skipping any region that holds the focused element or a non-empty textarea and taking it when it goes clean, in one script inlined through a `<!--JS-->` slot the way the stylesheet already is. Rejected: keep `location.reload()` and also save and restore the caret, which is a smaller diff but leaves the flash, the scroll jump and the lost focus in place; a client framework or a build step, which the deck's plainness does not need; and a `/deck.js` route, which is a route, a caching decision and a second request for sixty lines. The swap never replaces a `<details>`, a `<form>` or the tab strip itself, only what is inside them, because open panels, widths and focus are DOM state and the cheapest way to keep state is not to destroy it.

**Consequences**: three refresh behaviours become one; resizable panels, the selected run tab and live usage figures survive a change for free because nothing resets them; and every renderer's output must be wrapped so that the regions a change can touch are exactly the `data-live` ones. Amended by handoff-failed-confirm (L7): no press reloads either, and there is no exception list. A form posted in place carries `data-in-place` and is fetched by `deck/ui/js/inplace.mjs` (a typed reply and an option by `reply.mjs`); the change its route announces redraws the region, a refusal or a dropped fetch posts the form for real so its reason is read, and a press that changes which page is shown moves the address with `pushState` and redraws in place. With no script every form still posts and lands as it always did.
