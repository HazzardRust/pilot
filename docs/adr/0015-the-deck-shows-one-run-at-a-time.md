---
status: accepted
date: 2026-09-17
tags: [deck-ui, runs]
supersedes: []
superseded_by: []
paths: [deck/runs.mjs]
---
# The deck shows one run at a time, selected by the URL, with a repository as the tab

The deck stacked every live run's items, status table and tree on one page regardless of which run the user cared about, which is what they were complaining about. We decided selection lives entirely in the URL, `GET /?run=<repo path>`, server-rendered with no script, because `location.reload()` on every change already carries the query string, so the selected tab survives the deck's self-reload for free — rejected `:target` and a radio-button hack, both of which leave every other run's HTML sitting in the page so spec 1's evidence would only be true of CSS and not the markup, and a no-target default needs a `:has()` trick this codebase's plainness does not need. A tab is a **repository**, matched with `sameRepo`, so two sessions on one repository are one tab, because items carry `repo` and never a run id and a repository is the only key under which an ended run's items can still be found — rejected keying on the run record, which draws two identical tabs for the same queue. An ended run's record is kept while its repository still has an open item, and `registerRun` prunes only records that are neither live nor wanted, because any other session registering anywhere would otherwise wipe the record and silently revert the ended tab back to the directory name, the exact regression spec 4 exists to fix. The overview carries no status table and no tree: the strip of names and counts is itself the overview of runs, so the stacked tables the user complained about do not survive on the very page the deck opens on. And with no `run` in the URL, the page lands on the sole live run when exactly one is live and the overview otherwise, because the common single-run case keeps its table and tree on screen on arrival while Overview stays one click away — rejected always landing on the overview, which put the common case's table behind an extra click on every visit.

**Consequences**: the landing page's shape now depends on how many runs are live at the moment of the request, and a run's identity for every purpose but the run record itself is its repository path, not the ephemeral id `deck/runs.mjs` mints on each registration.
