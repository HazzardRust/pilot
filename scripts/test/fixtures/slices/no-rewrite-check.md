# S2 A reader can look a word up

Feature `glossary` · delivers spec 1 · source: `../architecture.md` §2 · after: S1 (`lookup`)
Model: sonnet — the seam and its tests leave no choice open.
## Files owned

- `src/lookup.mjs` (new): finds a word's entry.
- `src/lookup.test.mjs` (new): the seam's tests.

## Interface

```
lookup(word: string): Entry | null
S1's Entry: the shape a definition is stored in
```

## Tests

1. `a known word returns its entry`: `lookup` → the entry for "seam".
2. `an unknown word returns null`: `lookup` → `null` for "zzz".
3. `an entry carries its definition`: `S1's Entry` → a non-empty `definition`.

