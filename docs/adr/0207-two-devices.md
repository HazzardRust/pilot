---
status: proposed
date: 2026-11-21
tags: [deck, git, operating]
supersedes: []
superseded_by: []
paths: [docs/OPERATING.md, agents/pilot.md, deck/slug-clash.mjs, deck/doctor.mjs, docs/design/two-devices/architecture.md]
---
# Two devices share one repository through git alone, and the pilot checks a slug before cutting it

We decided that a second device carries on work on a repository by git only: each device runs its own deck, one device owns the queue and the landings on `pilot` by convention, the other hands work over as a pushed branch and a PR, and `pilot doctor slug <slug>` reads the remotes live so two decks do not cut the same slug.

## Context

The user works on this repository from two devices that both have pilot and the same accounts signed in. The deck's store holds tickets, threads and run records on one device (ADR 0028, ADR 0044), and nothing warned before a second deck cut a slug whose `feat/` or `design/` branch, or open PR, already existed on the remote. `pilot land` already fetches, re-merges once onto a moved `pilot` and pushes without force (`scripts/land.mjs:243`), so two decks landing is git-safe; what two decks can collide on is the queue.

## Decision

- **The rule** (spec 1): `docs/OPERATING.md` `## Two devices, one repo` states four rules: git is the shared state; each device runs its own deck; one device owns the queue and the landings on `pilot`; the other hands work over by a pushed branch and a PR. `agents/pilot.md` links it.
- **No store sync** (L2, spec 4): nothing syncs the store; `pilot store export` and `pilot store import` move it by hand (ADR 0230).
- **Owner by convention** (A1): no setting names the owner device; a Sign off on device 2 lands safely.
- **The slug check** (L3, L4, L8): one module, `deck/slug-clash.mjs`, read by `pilot doctor slug <slug>`, bare `pilot doctor`'s `slugs` row and `pilot start`. It reads `origin` and the run remote live, never tracking refs; an unreachable remote reads `cannot tell`, never free. The slug is held to kebab-case before any process starts and passed as one argv element.
- **Warn, not refuse** (A2, A4): `pilot doctor slug` exits 1 on a clash and the pilot picks another slug at step 1; `pilot start` and bare `pilot doctor` only print.
- **Device-2 setup** (spec 3, A5): `### Setting up a second device` lists the steps, each with its command; both devices set the same `pilot.remote`, never `none`, since local run branches are invisible to the other device.

## Rejected

- *Sharing the store through git* (L2): the store is per device by ADR 0028 and ADR 0044.
- *`git config pilot.owner false` making `pilot land` refuse on device 2* (A1): a refusal path in land for a landing git already makes safe.
- *`pilot start` refusing on a clash* (A2): a stale or offline check would block starting.
- *A phrase pin on the four rules* (A3): ADR 0180 bans it; a structural lint counts the rules and setup steps and checks every verb.
