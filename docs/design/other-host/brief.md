# other-host: what every implementer shares

## Repository

C:/Users/Hazzard/Projects/pilot (GitHub: HazzardRust/pilot). Artefact: `docs/design/other-host/architecture.md`;
your slice file: `docs/design/other-host/slices/S<n>.md`.

## Base and PR target

Base `feat/other-host`, cut from `origin/pilot`. Slice PRs target `feat/other-host`; the feature PR targets `pilot`.
S9 and S10 are cut after handoff-mod (itm_97c9e8fdf1d2) lands on pilot; S11 after blocked-steps
(itm_a2aeb8349afc) if it lands first.

## Remote

Remote: origin

## Gate command

`npm test` (`node scripts/gate.mjs`); during a slice `npm run test:changed` and the slice's own `node --test` files.

## Referee

The PR's Gate workflow on GitHub Actions (ubuntu, macos, windows); no local WSL loop.
`.github/workflows/gate.yml:26` skips draft PRs into `feat/**`, so slice PRs get no CI run: the slice's gate is
the local `npm test` run and its output. The feature PR into `pilot` runs the workflow, drafts included.

## Known flaky tests

None recorded.

## Commit trailer

```
Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NXgSFodNbTKqoJ71EpWMS5
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NXgSFodNbTKqoJ71EpWMS5
```

## PR titles

- Slice: `feat(other-host): S<n> <title>`, the title lower-case first.
- Fix round: `fix(other-host): <what>`.
- Feature: `feat(other-host): the pilot runs on a host other than GitHub`.

## QA environment

This machine; a scratch deck (`pilot deck --scratch`), never the user's deck on 4321; a fixture repository with a
bare remote for `none`; a throwaway gitlab.com project for spec 4, which the user creates and signs `glab` into
(`glab auth login`): the one handoff only the user can do. No real GitHub call in any test; a live `gh` probe runs
under `eval "$(pilot gh-stub)"`.
