---
status: accepted
date: 2026-10-07
tags: [deck, hook]
supersedes: []
superseded_by: []
paths: [docs/design/deck-press-feedback/architecture.md, deck/alert-switch.mjs, hooks/context-usage-alert.js, deck/server.mjs]
---
# Weekly alerts are a per-user switch, and warn at 95% only

The usage hook warned at 90% and again at 95% on both plan windows. On the seven-day window that is days of warnings over a budget the user is already watching, and some users want none at all. So we decided that the weekly track warns at 95% only, and that a **Weekly alerts** switch, stored by the deck, turns it off. The five-hour session track keeps 90% and 95% and is never silenced by the switch.

- **A file of its own.** `deck/alert-switch.mjs` reads and writes `<storeDir>/alerts.json`, `{ "weekly": boolean }`, written whole and renamed, in the shape of `usage-switch.mjs` (ADR 0095). Absent or unreadable means on.
- **Set from the page.** The right strip's last bookmark, a plain form posting `POST /alerts` with `weekly=on|off` and `back`, own-page Origin only, then a 303 through `backPath`. Anything but `on` or `off` is a 400 and writes nothing.
- **Read by the hook from disk.** `hooks/context-usage-alert.js` finds the file by the statusline's path rule (`PILOT_DECK_DIR`, else `~/.claude/pilot`), resolved per call. Only an explicit `weekly: false` is off.

Rejected:
- A field in `deck.json`: the hook would parse the whole store on every tool call.
- The hook asking the deck over HTTP: it would fail whenever the deck is down.
- A setting per deck or per session: the plan limit is the account's, so the switch is the user's.

**Consequences**:
- The switch is per machine: two machines on one account keep two switches.
- A corrupt `alerts.json` turns weekly alerts back on, which errs toward warning.

Recorded in `docs/design/deck-press-feedback/architecture.md` (§2 spec 15, 16; L9), whose slice file numbers it 0077; the sequence had reached 0097 by the time it landed.
