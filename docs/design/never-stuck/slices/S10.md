# S10 A plain question's default is taken at 20 minutes

Feature `never-stuck` · delivers spec 10 · source: `../architecture.md` §2, §6 A2 · after: –
Reviewers: `pilot:typescript-reviewer`
Model: opus — the deck answers for the user, and the exclusions are assumed (A2).

## Files owned

- `deck/server-wait.mjs`: `armDefaults`, one unref'd timer per due question, armed beside `armYields` (:481); an overdue one fires at start.
- `deck/store-items.mjs`: `takeDefault`, the same write as the user's `ASSUME_DEFAULT` press (:298-302), authored `deck`.
- `deck/test/default-taken.test.mjs` (new): mock timers.

## Interface

```
// deck/store-items.mjs
export const DEFAULT_MS = 20 * 60_000
export function defaultsDue(items, now): [{ id, dueAt }]
  // open question, not blocking, `recommended` set, no user message, no proposal flag, title not `Merging tickets`
export function takeDefault(id): Item
  // a from:'deck' message "<recommended>" handed to the owner like a reply, then resolved "Assumed: <recommended> (no answer 20 min)"
// deck/server-wait.mjs
export function armDefaults(): void
```

## Tests

1. `a plain question is answered with its default at 20 minutes`: `takeDefault` → resolved `Assumed:`, the owner's wait gets the text.
2. `19 minutes is not due; a user reply cancels it`: `defaultsDue` → none twice.
3. `proposals, merge questions and blocking items never are`: `defaultsDue` → none at 60 min.
4. `a restart fires an overdue default at once`: `armDefaults` → resolved on arm.

Rewrite check: a sweep on every store write instead of timers keeps the four results.
Misses: whether the owner records the A‹n› as assumed; its own prose says so.

## Done

- **Expected**: a question the user did not answer in 20 minutes goes ahead on its default, said in the thread, and the lane moves.
- **Verification**: `node --test deck/test/default-taken.test.mjs deck/test/yield.test.mjs`; `npm test`.
- **Evidence**: tests red before, green after; one question on a scratch deck closing itself (mock-free, `DEFAULT_MS` overridden by the test env only).
- **Prohibited**: no default on a gate, signoff, walkthrough, proposal or blocking item; no constant other than `DEFAULT_MS`.
- **Done when**: the four tests and the gate are green.
