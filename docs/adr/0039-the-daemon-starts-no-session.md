---
status: amended
date: 2026-09-26
tags: [deck, runs]
supersedes: [0033, 0035]
superseded_by: [0050, 0086]
paths: [docs/design/run-chaining/architecture.md, deck/run.mjs]
---
# The daemon starts no session

This supersedes ADR 0035, and the half of ADR 0033 that bound a session to a created thread. ADR 0035 let the daemon start a headless `claude` from Create and from `deck_launch`, so a thread could be answered with nobody at a terminal. The user has since ruled out headless sessions anywhere: "if I press Create, it starts a thread with the current agent", and headless only "later, if the CLI becomes redundant" (L10 of `docs/design/run-chaining/architecture.md`). So we decided the daemon starts no session. A run is started by a person, in a terminal, or by a cleared `pilot run` session chaining to the next ticket (spec 3); the daemon only records and routes.

- **Create opens a thread and nothing else.** `POST /create` calls `createThread({ name, repo })` and answers 303. The thread is a chat that waits, shown as waiting, until the pilot live on that repository first replies; with none live it keeps waiting.
- **No binding.** With no daemon-started session there is nothing to bind: `PILOT_THREAD`, a run's `thread`, an item's `thread`, the thread's `pid` and `threadFilter` all go, and every run on a repository hears every thread of it.
- **Gone with it:** `deck/launch.mjs` and its tests, the `deck_launch` tool (now an unknown tool the deck refuses by name), the Stop button and route, the startup sweep, the pty's exit notice and the deck's own line in a thread, and `PILOT_DECK_NO_LAUNCH`, which guarded a launcher that no longer exists.

Rejected:
- Leaving the launcher behind a flag: a path that can start a session nobody watches is exactly what was ruled out, and a flag keeps it one setting away.
- Editing ADR 0035 in place: the record should say why both of its paths left, not read as if they never existed.
- Removing `node-pty` with the launcher: `pilot run` (`deck/run.mjs`) types `/clear` through it, and the chain rests on that (L11).

**Consequences**:
- A created thread with no pilot live waits indefinitely; the user answers it by starting one.
- `deck.json` rows written under ADR 0035 may still carry `pid` on a thread, `thread` on a run or item, or a message `from: 'deck'`. Nothing reads the first three any more; the last now renders under the pilot's byline, the default for a message that is not the user's. `STORE_VERSION` is unchanged.
- `node-pty` stays in `package.json`, as `pilot run`'s optional dependency only.
