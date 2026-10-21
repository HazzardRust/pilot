---
status: amended
date: 2026-09-26
tags: [deck, threads]
supersedes: [0031]
superseded_by: [0039]
paths: [docs/design/independence/architecture.md, deck/client.mjs, deck/store.mjs]
---
# One repository chat, plus created threads, each heard by its own session

ADR 0031 gave each repository one chat, heard by that repository's pilot. Create (independence spec 3) adds named threads, and a thread with no unbound pilot live gets a headless session of its own (ADR 0035), so one repository can now have several sessions on the deck at once. Spec 3c asks that each hears its own thread and nothing else. We amended 0031's "one chat per repoKey" to "one repository chat, plus created threads", and routed them with one field (L3, L16 of `docs/design/independence/architecture.md`).

- **A reply's thread.** A created thread is its own thread. An item a bound session posts carries `thread`, stamped by its session (`deck/client.mjs`, from the run registration accepted), never chosen by the agent; a value naming no created thread is dropped, as at registration. Every other item has no thread.
- **One filter.** `deck_wait` takes `thread`, stamped the same way, and `threadFilter` in `deck/store.mjs` is the whole rule: a bound session hears its thread only; any other wait on a repository hears everything but the threads with a headless session on them (a `pid`). The inbox hook passes `PILOT_THREAD`, so a bound session's between-turn notices follow the same rule.
- **Handing work on.** The pilot's `deck_launch {name, body}` opens a created thread whose body is the spec and starts a session on it through Create's launch path. Only the pilot holds it. Whether the user agreed cannot be read by a tool, so "never unasked" stays in `skills/pilot/SKILL.md`.
- **Questions on a created thread** go to a `pilot-explorer`, which answers there with `deck_reply`, the one deck write it holds.

Rejected:
- A new item kind for created threads: the chat already is one, and `created` marks it.
- A general per-item filter on `deck_wait` (D23): `thread` is the only one needed.
- The daemon classifying a message as a question or new work: that is the pilot's judgement.
- The pilot answering questions in its own context: it pays for every one.

**Consequences**:
- When a headless session ends, its `pid` goes and its thread returns to the repository's own pilot.
- `deck_read` is unfiltered by thread, so a bound session reading its repository sees other threads' items; only waits are routed.
- `deck.json` gains one optional item field, `thread`, and stays `STORE_VERSION 1`.
