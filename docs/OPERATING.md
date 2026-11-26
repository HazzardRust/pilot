# Operating the pilot

What a person needs once the plugin is installed. It is written for you, not for an installing
session: nothing here is an install step, and some of it runs as administrator.

## Starting a run by hand

`pilot start` (or the deck's Start) opens a pilot session in a new window. The hand-off mod
types the `/clear` of a context hand-off for you, and the fresh session's first prompt after it,
so the run resumes with nobody at the keyboard. A `claude` you start yourself carries only what
your reach says (`pilot reach` prints it, and `pilot reach <level>` changes it); below
`everything` it has no pilot in it at all. `pilot deck` starts the deck in
the background and returns, so closing that terminal leaves it running;
`pilot deck --foreground` serves it in the terminal instead, for watching it.

## Commands under the hood

A run needs only `pilot start`; the rest is what the agents call under it. Who runs each, and when:

| Command | Who runs it | When |
| --- | --- | --- |
| `pilot start` | you | once, to start a run |
| `pilot wait` | every agent that owns a thread | in the background, to hear your reply |
| `pilot tickets` | the architect | at a run's start, to read the red queue |
| `pilot ready` | the co-pilot | to name the slices that can start |
| `pilot integrate` | the co-pilot (and QA, or the pilot) | to merge each slice into `feat/<slug>` |
| `pilot integrate --trial` | QA | before its gate2, to try the feature's tip on your pilot branch; merges nothing into it |
| `pilot pr --ticket <itm_id>` | the deck | after a gate1, each `deck_status` of its ticket, and QA's walkthrough or gate2 comment, to open or update the feature PR and QA's one comment on it |
| `pilot land` | the deck | after your Gate 2 Sign off, to merge only the feature into your pilot branch (no sync) and name its own PR to main: `feature PR: #<n> into <base>`; a legacy run (based on your pilot branch, or on the legacy `pilot`) still keeps one open PR from your pilot branch to main: `main gets pilot: #<n>` |
| `pilot sync` | the pilot | at a ticket's take (or by hand), never inside a landing, to take the default branch into your pilot branch |
| `pilot restack` | the pilot, and you | at a ticket's take after `pilot sync`, and by hand after you merge a feature PR, to retarget each open feature PR to its base and merge that base forward; after a squash, a leased rebase of a landed feature. Exit 3 names a conflict for the lander |
| `pilot handoff` | the pilot | when its context is full |
| `pilot landing <gate2-id>` | whoever wants to watch it, in the background | after your Gate 2 Sign off; waits for the deck's landing and prints how it went |

Each feature is its own PR to main (ADR 0200): you merge them, bottom of the stack first, whenever you like, and your pilot branch stays the private line Gate 2 lands on. A merge commit is the default; if you squash, run `git config pilot.merge squash` once, so the human step says so. Under squash the stack's upper PR shows the lower feature's commits until `pilot restack` rebases it.

For looking under a run: `pilot budget` sets how many agents each lane holds, `pilot analytics <slug>`
prints a run's tokens, tool calls and time per agent, `pilot ps` and `pilot gc` list and stop
orphaned processes, and `pilot worktrees prune` removes merged-clean worktrees. `pilot help` lists the rest.

## Who writes GitHub

The deck does, by `pilot pr`, and the crew never does (ADR 0182). On a gate1 post, every `deck_status`, and a walkthrough or gate2 post with a comment, for a ticket with a gate1, the deck opens or rewrites the draft feature PR `feat/<slug>` (its body and its base) and posts QA's one comment on it. A failed write puts one line, `feature PR not updated: <line>`, on the ticket's thread and is retried on the next trigger. Agents push their own branches, and the implementer opens its own draft slice PR; nothing else they run writes to GitHub.

## Which tests run when

The full suite (`npm test`, every test file) runs once per feature, at `pilot land`. Every step before it tests only the selection: the test files the diff touches, the tests that import a changed module (directly or through others), the tests that name a changed file, and the whole-tree tests. `npm run test:changed -- --since=<ref>` runs that selection and prints `selected <n> of <m> test files since <sha7>`; where the diff touches `package.json`, the lockfile, the gate, the selector, or a script no test reaches, it runs the full suite and prints `full suite: <reason>`. Only a full run takes a gate slot.

A ticket whose signed plan has 2 slices or fewer takes the **short path**: the pilot builds it itself, with no co-pilot, fundamentalist, evidence runner or QA, so that landing run is its only full suite, and the pilot's gate2 (one `Verdict:` line per slice, a `Gate:` line, and a walkthrough when the plan has `surface: true`) is your one press. On a full run, QA posts a walkthrough unless the signed plan has `surface: false`; on `surface: false` its checks table rides in the gate2, again your one press. A walkthrough or report step that is a command shows its shell and directory above it: commands run in PowerShell on Windows, your login shell elsewhere, unless a step names another.

| Step | Runs |
| --- | --- |
| a slice's phase gate, the fix round, QA, the lander's resolution | the selection (`npm run test:changed`) |
| `pilot integrate` (the slice, the base, a resumed merge) | the selection since the start of the merge |
| `pilot sync` | the selection |
| `pilot land`'s merge of the feature into your pilot branch | the full suite, once |

A repository with no `test:changed` script, or one tested by `git config pilot.test`, runs its own full test command at every step. The Linux referee and CI run `node scripts/gate.mjs`, full, unchanged (ADR 0166).

## Your pilot branch

Gate 2 lands on your pilot branch, `<login>-pilot`, never on a branch shared with another user, so two people on
one remote each land on their own line and `pilot restack` retargets only your own PRs.

- **Derivation.** The first `pilot base`, `pilot sync`, `pilot land`, `pilot restack` or `pilot doctor` in a
  repository reads your login from the host CLI (`gh api user`, or `glab api user` under `gitlab`), lower-cases it
  and appends `-pilot`: `HazzardRust` becomes `hazzardrust-pilot`. A login git would not take as a branch name as it
  stands is refused, never cleaned into one.
- **`pilot.branch`.** The name is stored once, in the repository's local git config, and every later command reads
  it there with no login read: `git config pilot.branch` prints it. The environment variable `PILOT_BRANCH`
  overrides it for one process. Either is accepted only as `<name>-pilot` in lower-case letters, digits, `.`, `_`
  and `-`, starting with a letter or digit, or as the legacy `pilot`. With no host (`pilot host none`), or signed out with nothing stored, a command stops with one line naming
  `gh auth login` (or `glab auth login`) and `git config pilot.branch <name>`; set it by hand once with
  `git config pilot.branch <name>-pilot`. `pilot doctor` shows the name and where it came from, and warns, never
  switches, when the signed-in account's `<login>-pilot` is not the stored name.
- **The move.** In a repository that has the legacy branch `pilot` and no `*-pilot` branch on `origin`, the first
  `pilot base` creates your pilot branch at `pilot`'s tip. `pilot restack` then retargets your open feature PRs
  whose base is `pilot` to it. Run records with that base, and landings made before the move, read as yours. A second
  user joining after the move starts from the default branch's tip, never from the stale `pilot`.
- **Deleting `pilot`.** Nothing writes, moves or deletes `pilot`: it is left for you to delete, on the host and in
  each clone, once your open PRs show their new base. Until then it is read only.

## Where run branches live

A run's branches (your pilot branch, `design/`, `slice/`, `fix/` and `qa/`) go to `origin` by default, and all but the pilot branch are deleted from the remote they live on once they are merged, never before. `feat/<slug>`, the head of the feature PR, is always on `origin`, and is deleted there by `pilot branches prune` once its PR merges. The git setting `pilot.remote` moves the rest: `git config pilot.remote none` keeps run branches local, and `git config pilot.remote <name>` sends them to that remote instead (it must be a name `git remote` lists). `pilot branches prune --slug <slug>` deletes that run's merged ones that are still around; add `--dry-run` to see them first (ADR 0134).

## Two devices, one repo

You can carry on work on one repository from a second device that has pilot and the same accounts signed in. Git is
what the two devices share, and nothing else (ADR 0207):

1. Git is the shared state: work moves between the devices only as pushed branches, your pilot branch and the PRs on the remote. Both devices sign in to
   the same account, so both derive the same `<login>-pilot` with nothing shared but git.
2. Each device runs its own deck. Its tickets, threads and run records stay on that device; nothing syncs, exports or
   commits them.
3. One device, the owner, holds the queue and lands on your pilot branch. Which one is your convention; no setting enforces it.
4. The other device hands its work over as a pushed branch and a PR, never as deck data.

Two decks landing is already safe in git: `pilot land` fetches, re-merges once onto a pilot branch that moved, pushes
without force, and on a second move stops and asks you to run it again. So the owner rule is about the queue: two decks
must not cut the same slug. `pilot doctor slug <slug>` says whether a slug is taken on either remote, never free when
it cannot tell (`pilot help` has its output); the pilot runs it before it names a slug, and bare `pilot doctor` and
`pilot start` check the slugs this deck has queued.

### Setting up a second device

On device 2, in PowerShell on Windows or your login shell elsewhere:

1. Install pilot as the README's install prompt says (`claude plugin marketplace add HazzardRust/pilot`, then
   `claude plugin install pilot@pilot` and its `docs/INSTALL.md`), or `claude plugin update pilot@pilot` where it is
   already installed; `pilot help` then lists `pilot host` among its commands.
2. Clone the repository, from the URL `git remote get-url origin` prints on device 1: `git clone <url>`, then `cd` into it.
3. Set the same host as device 1, whose `pilot host` prints it: `pilot host <github|gitlab|none>`.
4. Set the same run remote as device 1, whose `git config pilot.remote` prints it (nothing printed is `origin`):
   `git config pilot.remote <name>`, after `git remote add <name> <url>` when it is not `origin`, since a fresh clone
   has only `origin`. Never `none` on either device: local run branches are invisible to the other, so
   `pilot doctor slug` cannot see the other device's `design/` branches.
5. Sign in the CLIs on PATH: `gh auth status` (or `glab auth status` under `gitlab`) names your account, and `claude`
   starts signed in to the same account as device 1.
6. Check the device: `pilot doctor` in the clone shows no `fail` row. A `fail` row prints its fix below it; run that,
   then `pilot doctor` again.
7. Start: `pilot start`. Leave the queue and the landings to the owner, and hand this device's work over as rule 4 says.

## Moving to a fresh public repository

The move replaces the private HazzardRust/pilot, and its history, with a public repository of one
commit whose tree is `main`'s tip. It is yours to run, once, after the last feature PR has merged into
`main`: no agent runs a step under "On GitHub" (ADR 0172). `<scratch>` is an empty folder outside any
repository, `<archive>` the old repository's new name (for example `pilot-archive`), and `<noreply>`
your GitHub noreply address, `<id>+HazzardRust@users.noreply.github.com` (Settings > Emails).

### Before the move

In the old checkout, with `git fetch origin` run first:

1. Nothing is in flight: `gh pr list --state open -R HazzardRust/pilot` prints nothing.
2. The published tree scans clean: `git archive -o <scratch>/tree.tar origin/main`, then from `<scratch>`
   `mkdir tree` and `tar -xf tree.tar -C tree` (a pipe corrupts the archive in Windows PowerShell 5.1), then `gitleaks dir <scratch>/tree --redact -r <scratch>/gitleaks.json` exits 0 and
   the report is `[]`. Without gitleaks installed, `docker run --rm -v <scratch>:/s zricethezav/gitleaks:latest dir /s/tree --redact -r /s/gitleaks.json`
   runs the same scan.
3. The builder makes the one commit: `node scripts/fresh-repo.mjs --from origin/main --pilot origin/<login>-pilot --email <noreply> --out <scratch>/new.git`
   prints the commit's sha and the push command, and pushes nothing. It refuses, building nothing,
   when your pilot branch holds changes `main` lacks or the address is not a noreply one.
4. Check what it built: `git -C <scratch>/new.git rev-list --count main` prints `1`, and
   `git -C <scratch>/new.git log --format='%ae %ce' main` prints only `<noreply>`.

### On GitHub

Irreversible, and in this order: the rename frees the name, and creating the new repository under it
ends GitHub's redirects from the old one.

1. `gh repo rename <archive> -R HazzardRust/pilot` makes the old repository the archive.
2. `gh repo create HazzardRust/pilot --public --description "Pilot Deck Claude Code"` creates the
   new one, empty.
3. `git -C <scratch>/new.git push https://github.com/HazzardRust/pilot.git main` pushes the one
   commit; the Gate workflow runs on it.
4. `gh secret set CLAUDE_CODE_OAUTH_TOKEN -R HazzardRust/pilot` asks for the token and reads it from
   the prompt; never type the value into the command. `gh secret list -R HazzardRust/pilot` then names it.
5. The `main` ruleset: Settings > Rules > Rulesets > New branch ruleset, targeting the default branch,
   with "Restrict deletions", "Block force pushes", "Require a pull request before merging" and
   "Require status checks to pass" naming the Gate check from step 3's run.
   `gh api repos/HazzardRust/pilot/rulesets` then lists one.
6. `gh repo archive HazzardRust/<archive> --yes` archives the old repository; it stays private.
7. On your account, Settings > Emails: tick "Keep my email addresses private" and "Block command line
   pushes that expose my email", so a later commit made with the personal address is refused.

### After the move

1. A fresh clone: `git clone https://github.com/HazzardRust/pilot.git`, then in it
   `git config user.email <noreply>` and `pilot base`, which prints
   `base pilot <sha> (created from main)`.
2. The old checkout, whose `origin` now reaches the new, unrelated history:
   `git -C <old checkout> remote set-url origin https://github.com/HazzardRust/<archive>.git`.
3. The plugin's marketplace clone: `claude plugin marketplace update pilot`. If it fails, remove and
   re-add it: `claude plugin marketplace remove pilot`, then `claude plugin marketplace add HazzardRust/pilot`,
   and `claude plugin install pilot@pilot` if the plugin went with it.

### Links from before the move

PR numbers and mergeShas written before the move, in run records (`docs/design/*/run.json`) and
briefs, point at the archive, `HazzardRust/<archive>`, which stays private and archived. The same
number on the new repository is a different PR, and a pre-move sha is in none of its history. Nothing
rewrites them.

## Releasing the Rune deck

A plugin install fetches the Rune deck CI built for its version, checked against the pin it ships in
`deck/rune/release.json`. To release: run `npm run bump <x.y.z>` on a branch and push it; then
`gh workflow run rune-release.yml --ref <branch>` (Actions, Rune release, Run workflow); then merge the
branch once the run is green. The run builds the three binaries, publishes release `v<x.y.z>` holding
them, and commits the pin to that branch, so a version without its pin commit has no prebuilt deck and
opens the page. Merge only after that commit lands: if the push of the pin failed because the branch
moved, take `release.json` from the run's artifacts and commit it as `deck/rune/release.json` by hand.

## Slow gates on Windows

Windows Defender's real-time protection scans every file before it opens, and a gate opens
thousands, so on Windows the scanner can take more CPU than the tests. `pilot doctor` says
whether real-time scanning is on, and whether your projects root (the folder your repositories
sit in) is on a Dev Drive in performance mode or excluded; without an administrator it says it
cannot tell. `pilot doctor defender` prints that row alone. It reads and advises only, and never
changes Defender. Its first step, done once by you as administrator, is the folder exclusion:
one cmdlet, the largest cut, undone with `Remove-MpPreference`, though files under the root are
then never scanned, postinstall scripts included. The Dev Drive in performance mode is the
upgrade: it keeps the scan but moves it after the open, at the cost of a new volume and moving
your worktrees onto it:

```text
one-time, as administrator: Add-MpPreference -ExclusionPath '<projects root>' (reversible with Remove-MpPreference)
upgrade, as administrator: create a Dev Drive in performance mode and move <projects root> onto it (Settings > System > Storage > Advanced > Disks & volumes > Create Dev Drive)
```

## When the deck misbehaves

The deck is one background process on port 4321. These are the places to look, in the order a
problem usually needs them.

### Where the deck writes

The deck keeps its store in `~/.claude/pilot`, or in the directory `PILOT_DECK_DIR` names, and its
log is `deck.log` there. Everything the deck prints to stderr is also written to it: the
`[deck] serving` line with its pid at start, each request it refuses, and a `[deck] crashed:` line
with the stack if it dies. At 1 MB the file is emptied the next time a deck starts, so it holds
the current deck's story and not much before it.

### Is it running

`pilot status` asks the deck's url who answers. It prints the deck's pid, its version against the
plugin's (marked stale when older), how long it has been up and the live agents by repository, and
then the last 20 lines of `deck.log` whether or not a deck answered. It exits 0 with a deck and 1
without one, so a script can use it.

### A stuck deck

`pilot ps` lists the processes the pilot started on this machine (deck daemons, waits, test
runs), one per line, each marked `live` or `orphan` with the reason. `pilot gc` stops the orphans
`pilot ps` names, and only those. It never stops a live deck. Read the reasons `pilot ps` gives first:
a `wait` marked `no claude ancestor` can belong to a live session whose process chain is broken, and
`pilot gc` stops it. If the deck itself will not answer, the pid in the `[deck] serving` line of
`deck.log` is the deck's, and ending that process lets the next session start a fresh one.

### Port 4321 is held

`pilot doctor` has a `port <n>` row (4321 by default). `pass` with `free` means nothing holds it (a refused connection reads as free), and `pass` with
`our deck, pid N` means the deck is up. `fail` with `held by another program` means something that
answers on the port is not a deck, because it did not return a deck's health reply, and the reason
beside it (no answer within 1000 ms, an HTTP status with no deck health, or a network error code) says what it did instead. The deck
does not take a port from a program that holds it. Stop that program, or run the deck elsewhere
with `PILOT_DECK_PORT`, which every `pilot` command then follows. Its `deck version` row says when
the running deck is older than the plugin.

## The deck's secret

The deck wants a secret on every request except `GET /open`, the page's own styles and scripts, and
`GET /api/health` (ADR 0164). An API request without it gets a 401 that names the file to read it
from, never its value.

### Where it lives

The secret is `deck.secret` in the store dir, beside `deck.pid` (`~/.claude/pilot`, or the directory
`PILOT_DECK_DIR` names): 32 random bytes as hex, made the first time a deck starts, 0600 on Linux and
macOS, and reused on every start after. A scratch deck has its own in its own dir. Every client this
package ships reads the file on each request and sends it as `Authorization: Bearer`; the agents and
hooks need nothing set.

The browser gets in through the open file, `deck-open.html` beside it, also 0600, which is the only
other file in the store dir that holds the secret; a signed-in browser also keeps it in its cookie,
and may keep the `/open?key=` address in its history. `pilot deck` prints the open file's path, never the secret, and opening
that file signs the browser in: it goes to `GET /open?key=`, which sets a cookie named for the port
(`pilot_deck_4321`) and answers 200 with a forward to `/` from the deck's own address. A tab without
the cookie, such as a bookmark from before the secret, shows a page saying to open the deck with
`pilot deck`.

### What it stops, and what it does not

It stops other users on this machine, and programs that can reach 127.0.0.1 but cannot read your
files: sandboxed Mac apps, and containers that reach the host's loopback, as Docker Desktop's
`host.docker.internal` does. It does not stop any process running as you. Such a process can read
`deck.secret`, the agents' own shell included, and nothing on loopback can tell your processes apart
(ADR 0164, L8).

Two limits follow from where it lives. Clients send the secret to whatever answers on the deck's
port, so another user who binds that port before the deck starts could collect it. And 0600 does
not apply on Windows: there the file is protected only by your user profile's permissions.

### Rotating it

`pilot deck --rotate` deletes `deck.secret`, makes a new one, rewrites the open file and opens the
deck through it, unless `PILOT_DECK_NO_OPEN` is set or the deck is a scratch copy. A running deck
refuses the old secret from its next request, and no client needs a restart; any other browser is
refused until it opens the open file again. Deleting `deck.secret` by hand also replaces it, but leaves the open file holding the old one
until the deck next starts.

The secret is never printed or posted: `pilot deck`, `--scratch` and `--rotate` print the open file's
path and never the secret, and it is in no `deck.log` line, no `/api/health` or 401 body and no item.
Never paste it into a thread or a commit.
