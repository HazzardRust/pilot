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

Rewrite check: replacing `lookup`'s linear scan with an index keeps every result above.
padding line 1
padding line 2
padding line 3
padding line 4
padding line 5
padding line 6
padding line 7
padding line 8
padding line 9
padding line 10
padding line 11
padding line 12
padding line 13
padding line 14
padding line 15
padding line 16
padding line 17
padding line 18
padding line 19
padding line 20
padding line 21
padding line 22
padding line 23
padding line 24
padding line 25
padding line 26
padding line 27
padding line 28
padding line 29
padding line 30
padding line 31
padding line 32
padding line 33
padding line 34
padding line 35
padding line 36
padding line 37
padding line 38
