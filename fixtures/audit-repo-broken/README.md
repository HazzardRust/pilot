# Notes app (broken install)

A repository-to-be whose install fails: `package-lock.json` does not list the
`left-pad` dependency `package.json` declares, so `npm ci` refuses before it
fetches anything. The audit should report the failed install as a setup row,
with the command and its exit code, and carry on with what it can measure.

It is committed as plain files, with no `.git` of its own. To audit it, make a
throwaway repository from a copy outside the pilot repository:

```bash
cp -r fixtures/audit-repo-broken "$TMP/audit-repo-broken" && cd "$TMP/audit-repo-broken"
git init -q && git add . && git commit -qm "fixture"
```

Then run `/pilot:audit` in that copy.
