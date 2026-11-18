# S2 A reader can look a word up

Feature `glossary` · delivers spec 1 · source: `../architecture.md` §2 · after: S1 (`lookup`)
Model: sonnet — the seam and its behaviours leave no choice open.
## Files owned

- `src/lookup.mjs` (new): finds a word's entry, and prints it from the command line.
- `src/lookup.test.mjs` (new): the seam's tests.

## Interface

```
lookup(word: string): Entry | null
```

## Behaviours

1. `a known word returns its entry` (test): the entry for "seam" comes back.
2. `the command prints the entry` (run): `node src/lookup.mjs seam` prints its definition.

Rewrite check: replacing `lookup`'s linear scan with an index keeps every result above.
Misses: whether a definition reads well; the reviewer reads that.
