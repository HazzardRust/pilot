# Notes app

A small notes server. `npm run dev` starts it on port 3000; `npm test` runs the
specs. Load sample notes with `npm run seed` before you try the list view.

## This is a fixture

A repository-to-be for QA of the housekeeping audit, with one planted item per
audit area, listed in `PLANTED.md`. It is committed as plain files, with no
`.git` of its own. To audit it, make a throwaway repository from a copy
outside the pilot repository, and keep `PLANTED.md` beside it rather than in it:

```bash
cp -r fixtures/audit-repo "$TMP/audit-repo" && cd "$TMP/audit-repo"
mv PLANTED.md ../audit-repo-PLANTED.md
git init -q && git add . && git commit -qm "fixture"
```

Then run `/pilot:audit` in that copy and compare the report against the planted
list: every line there should be a row.
