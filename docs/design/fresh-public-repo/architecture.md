# Fresh public repository: the project moves to a public repo with one commit and no history

Ticket `itm_c570093cafb5` · branch `design/fresh-public-repo` · base `pilot` fe4969ee

## 1. Problem

The repository is private at HazzardRust/pilot and has a long history: 4,768 commits on
`pilot`, every one signed with the user's personal email. The user wants the project public,
but as a fresh repository with the history removed, and wants to see what moves, what breaks
and what leaks when it does.

## 2. Spec

Agreed with the user on thread `itm_3f2acc902ec7` ("Agreed"): lines 1-8 and 4a.

| # | Behaviour | Evidence |
|---|---|---|
| 1 | `.gitignore` covers `.env`, `.env.*`, `*.local` and root scratch files (`pb.txt` sits untracked in the shared checkout today), and a gitleaks `dir` scan of the tracked tree, exported with `git archive`, finds nothing. | `git check-ignore .env .env.prod pb.txt` exits 0; the scan's report, 0 findings, on the feature PR. |
| 2 | The one public commit carries no personal email: author and committer are the GitHub noreply address (*assumed*, A1). | `git log --format='%ae%n%ce'` on the built repo prints only `…@users.noreply.github.com`. |
| 3 | The new repository holds one orphan commit whose tree equals the old repo's `main` tip, and `pilot base` creates `origin/pilot` from it. | `git rev-list --count origin/main` prints 1; `git diff --quiet <old main> <new main>` exits 0; `pilot base` prints `base pilot <sha> (created from main)`. |
| 4 | Every owner/name pin reads one name: `scripts/install-command.mjs:38`, `.claude-plugin/plugin.json:10-11`, `.claude-plugin/marketplace.json:4-5`, `package.json:13`, `README.md:24`, `docs/INSTALL.md:53` and the tests that assert it. Under the open name question's default (keep HazzardRust/pilot) none changes. | A consistency test reads each pin and finds the same `owner/name`; `npm test` green. |
| 4a | The project's public title is "Pilot Deck Claude Code" (the user's, L7): the GitHub About description, README's H1 and `package.json`'s `description` carry it; the slug stays `pilot`. | The runbook's `gh repo create --description` names it; a pin finds it in README's first `# ` heading and `package.json`'s description. |
| 5 | `docs/OPERATING.md` says PR numbers and mergeShas from before the move, in run records and briefs, point at the private archive. | A wording pin in `scripts/test/fresh-repo-runbook.test.mjs`; `check-references` exits 0. |
| 6 | The move runs only when nothing is in flight: no open PR on the old repo, and `pilot` holds nothing `main` lacks. The builder refuses otherwise. | `gh pr list --state open` prints nothing; the builder's refusal when `pilot`'s tree differs from `main`'s, tested. |
| 7 | Public CI stays closed to strangers: `claude.yml` keeps the action's default write-access check (no `allowed_non_write_users`, no `allowed_bots`) and `gate.yml` keeps `contents: read`. | A pin on both workflow files in the runbook test. |
| 8 | After the push the runbook re-adds the `CLAUDE_CODE_OAUTH_TOKEN` secret, adds the `main` ruleset (*assumed*, A3), and re-points the local checkout and the plugin marketplace clone at the new history. | The runbook's steps, pinned by heading; at the move, `gh secret list` names the secret, `gh api repos/<repo>/rulesets` lists one, `claude plugin marketplace update pilot` succeeds. |

Lines 1, 2, 4-7 are proved before the feature PR merges; line 3 and line 8's GitHub half
are proved at the move itself, which runs after the feature PR merges into `main`, because
its tree is that merge's tip (§9).

## 3. Findings

- **No secrets scanner** anywhere: no gitleaks, trufflehog or secretlint in the repo, its
  `package.json` or `.github/workflows/`. Docker and winget are on this machine; gitleaks v8's
  `gitleaks dir <path>` scans plain files, exits 1 on a finding, `-r` writes a report
  (github.com/gitleaks/gitleaks README).
- **`.gitignore`** is one line, `node_modules/`.
- **What the tracked tree exposes**: no `.env`, key or token file; no email in the tree
  (`git grep '@gmail'` empty). 162 files carry `C:/Users/Hazzard` paths, 161 of them under
  `docs/design` (run.json worktrees, briefs). 85 runs' `run.json` carry PR numbers. The deck
  store is `~/.claude/pilot` (`deck/store-dir.mjs:11`), untracked.
- **What history alone exposes**, gone with it: the personal email on 4,707 commits, a second
  contributor's email on 58, and every deleted file.
- **The one commit's identity**: `git config user.email` is the personal address, so a plain
  orphan commit re-publishes it (spec 2).
- **CI**: `gate.yml` runs ubuntu only (`mac-linux` adds the 3-OS matrix, in flight);
  `claude.yml` fires on any `@claude` comment with `contents: write` and
  `secrets.CLAUDE_CODE_OAUTH_TOKEN`. claude-code-action checks write access by default
  (`docs/security.md`: "can only be triggered by users with write access"). Public repos run
  standard hosted runners free (GitHub Actions billing docs). One Actions secret exists; it
  does not travel with a new repo.
- **Branch protection** is refused today: `gh api …/branches/main/protection` answers 403,
  "make this repository public to enable this feature".
- **Rename**: GitHub redirects a renamed repo's web and git URLs, and warns that creating a
  repo under the old name ends those redirects (docs "Renaming a repository"). Under keep-the-
  name, every clone's `origin` then reaches the new, unrelated history.
- **Marketplace**: `~/.claude/plugins/known_marketplaces.json` sources `pilot` from
  `HazzardRust/pilot`; Claude Code re-clones a git marketplace when it finds new commits and
  keeps the old checkout if the clone fails (code.claude.com host-marketplace docs). The
  plugin's fixed `version` means users take a new copy only on a version bump.
- **In flight**: 15 open PRs on the old repo (two non-draft, #774 and #754); `origin/pilot` is
  112 commits ahead of `origin/main`.
- **`pilot base`** (`scripts/base.mjs`) is git only, so the move rehearses against a local bare
  repository.
- **Wording pins** live in `scripts/test/*-wording.test.mjs` and
  `scripts/test/operating-runbook.test.mjs`, which reads `docs/OPERATING.md` by heading.

### Seams

Deepening pass: `scripts/fresh-repo.mjs` survives the deletion test (without it the user
types the orphan build and its four checks by hand at the irreversible moment). The six
owner/name pins fail it as a fold: the JSON manifests cannot import a constant, so they stay
literal and one consistency test holds them together. No fold slice.

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| `scripts/fresh-repo.mjs` | `buildOrphan(options)`, the `fresh-repo` CLI | the orphan commit, its identity, the tree-equality check and the pilot-has-nothing-extra refusal | Local-substitutable (git in a temp dir) |
| `docs/OPERATING.md` "Moving to a fresh public repository" | its headings and the commands they name | the GitHub-side sequence, archive note, re-pointing | In-process (read by the pin test) |
| `.gitignore` | the patterns `git check-ignore` answers | – | In-process |

`gh` (open PRs, secrets, rulesets) is true-external and stays in the runbook, run by the user.

## 4. Ubiquitous language

- **The move**: renaming the old repo, creating the new one, pushing the orphan and setting it up, run once by the user.
- **The archive**: the old repository, renamed, private and archived; the only home of the history.
- **The orphan**: the single parentless commit whose tree is the old `main` tip.
- **The builder**: `scripts/fresh-repo.mjs`, which makes the orphan in a local bare repo and checks it.
- **Pin**: a literal `owner/name` in a shipped file or a test.

## 5. Locked decisions

- **L1 The user runs the move; no agent pushes to the new repo.** The rename, create, push and
  settings are irreversible and GitHub-side. Rejected: a `pilot` verb that does it all, which
  hands an irreversible push to an agent.
- **L2 A builder, not only a runbook.** The orphan's identity and tree are what go wrong
  silently; a tested script checks both and prints the push command. Rejected: runbook only.
- **L3 The orphan's tree is the old `main` tip after the last feature PR merges**, and the
  builder refuses when `pilot`'s tree differs. Rejected: cutting from `pilot`, which carries
  unlanded work.
- **L4 gitleaks over a `git archive` export**, once, before the push. It scans exactly what is
  published and nothing in `node_modules` or `.git`. Rejected: secretlint (needs a rule preset
  and config), trufflehog (verification calls out to providers).
- **L5 No pin is rewritten under keep-the-name**; spec 4 is a consistency test. A different
  name adds one slice that rewrites every pin.
- **L6 History-only data is not scrubbed from the archive**; it stays private.
- **L7 The slug stays HazzardRust/pilot; the title is "Pilot Deck Claude Code"** (the user's,
  thread `itm_edf90887c28f`: "we can do /pilot for the slug, but the title should be Pilot Deck
  Claude Code, the namespace is taken by other projects"). The old repo is renamed to the
  archive first, so no pin moves. The title lands in the GitHub About description, README's H1
  (`# Pilot` today) and `package.json`'s description. Rejected: renaming the plugin `pilot`, which
  is the `pilot:` agent namespace and the install name; the plugin and marketplace descriptions
  already describe it and stay.
- **L8 The archive stays private and archived** under its new name (the user's, thread
  `itm_4faf935c1ab2`), so history-only data never goes public. Rejected: deleting it, which
  loses every pre-move PR; making it public, which publishes the history.

- **L9 Grilling depth: forks** (the user's, thread `itm_d5c5f4b813b2`). Only a decision whose paths give
  materially different deliverables reaches the user as an item of its own; no Gate 1 walk.
  overridden: the recommended depth was every, because publication and history removal are
  irreversible; by the time it was answered every decision had already reached the user as
  its own item, so the walk would have been a re-read.

## 6. Assumed decisions

- **A1 The orphan and this repo's later commits use the GitHub noreply address** (thread
  `itm_619296c5d511`). Default: noreply, plus GitHub's "block pushes that expose my email".
  Trades the personal address on commits for privacy. Rejected: the personal address.
  Verdict: stands — the user took the default.
  Answer: "Noreply address", the default as written.
- **A2 `docs/design` goes public as it is** (thread `itm_7a169b9c4b6d`). Default: publish,
  with the OPERATING note on dead PR links. Trades the username and folder layout in 161
  files. Rejected: dropping `docs/design`, which orphans every ADR's artefact link.
  Verdict: stands — nothing queued touches docs/design's publication; the ADR links are the
  deciding cost.
  Answer: "Publish as they are", the default as written.
- **A3 One ruleset on the new `main`** (thread `itm_00fd1d407a0b`). Default: block force-push
  and deletion, require a PR and the Gate check. Trades direct pushes to `main`. Rejected: no
  protection.
  Verdict: stands — the closing-report workflow already names branch protection on the default
  branch as a human step, so the ruleset is where that step lands.
  Answer: "Add the ruleset", the default as written.
- **A4 Grilling depth** (thread `itm_d5c5f4b813b2`): answered forks over the recommended every;
  now L9. It changes no slice.
  Verdict: stands — the user's word, over the pilot's pushback (L9).
- **A5 Owner/name** (thread `itm_edf90887c28f`): answered, keep HazzardRust/pilot with the old
  repo renamed first; now L7.
  Verdict: stands — the user's word; no pin moves and no other run touches the pins.
- **A6 The archive** (thread `itm_4faf935c1ab2`): answered with the default, the old repo stays
  private and archived under the archive name; now L8.
  Verdict: stands — the user took the default; every pre-move link in 85 run records keeps resolving.

## 7. Out of scope

- Moving issues, PR discussions, releases, stars or the wiki to the new repo.
- A gitleaks job in CI for later commits.
- Rewriting the local paths or PR numbers inside `docs/design`.
- Bumping the plugin version for the move.
- The in-flight runs themselves; this run waits for them (spec 6).

## 8. Slices

Width 2; longest stem 2

| Slice | Title | Spec | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|---|
| S1 | The builder makes a one-commit repo that `pilot base` accepts | 2, 3, 6 | `scripts/fresh-repo.mjs` (new), `scripts/test/fresh-repo.test.mjs` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | Scratch and env files are ignored and the tree scans clean | 1 | `.gitignore`, `scripts/test/gitignore.test.mjs` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S2](slices/S2.md) |
| S3 | The runbook walks the move, and every pin, the title and the workflows are held | 4, 4a, 5, 7, 8 | `docs/OPERATING.md`, `README.md` (H1 only), `package.json` (description only), `scripts/test/fresh-repo-runbook.test.mjs` (new) | S1 (the fresh-repo CLI) | `pilot:typescript-reviewer` | [S3](slices/S3.md) |

S1 is the walking skeleton: from the real repo it builds the orphan in a local bare repo,
and `pilot base` in a clone of it creates `origin/pilot`.

## 9. Acceptance evidence

Before Gate 2, in QA's worktree (a rehearsal against a local bare repo):

1. `git check-ignore .env .env.prod pb.txt` exits 0 (spec 1).
2. `git archive` of the tip into a scratch dir; `gitleaks dir` over it reports 0 findings (spec 1).
3. `node scripts/fresh-repo.mjs --from origin/main --pilot origin/pilot --email <noreply> --out <scratch>/new.git`
   prints the orphan's sha; a clone of it shows `git rev-list --count HEAD` = 1 and only the
   noreply address in `%ae %ce` (spec 2, 3).
4. `pilot base` in that clone prints `base pilot <sha> (created from main)` (spec 3).
5. With `pilot` ahead of `main`, the builder refuses and creates nothing (spec 6).
6. `npm test` green, including the pin consistency and workflow pins (spec 4, 7); OPERATING's
   section reads the archive note (spec 5).

At the move, after the feature PR merges, following the runbook (spec 3, 6, 8):

7. `gh pr list --state open -R HazzardRust/pilot` prints nothing.
8. The push, then on GitHub: one commit, public, About reads "Pilot Deck Claude Code"; `gh secret list` names the token; one ruleset.
9. `pilot base` in a fresh clone prints `origin/pilot`; `claude plugin marketplace update pilot` succeeds.

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | – | – | – | – | 2, 3, 6 |
| S2 | planned | – | – | – | – | 1 |
| S3 | planned | – | – | – | S1 | 4, 4a, 5, 7, 8 |
| Fresh public repository | planned | feat/fresh-public-repo | – | – | S1, S2, S3 | 1-8, 4a |
