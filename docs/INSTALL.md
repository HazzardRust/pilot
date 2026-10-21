# Installing pilot

You are Claude, and someone has pasted the install prompt from the README. These are the
instructions it sent you to. Follow them in order, run the commands yourself, and tell
the person at the keyboard what changed when you are done. They should not have to type
anything except the answers to the four questions below.

You are writing into someone else's Claude Code configuration. Three rules hold over
everything here: **nothing already on this machine is overwritten**, **nothing goes into
their `CLAUDE.md` without them saying yes**, and **anything you skip is named out loud**
rather than counted. A silent skip is how a friend loses a file they wrote.

## What this changes, and what it never touches

| Path | What happens to it |
| --- | --- |
| `~/.claude/settings.json` | The status line and the subagent status line are merged in, the `WebFetch` hosts they name and, unless they say no, `mcp__plugin_pilot_deck__*` are added to `permissions.allow`, the pilot's own `Bash(pilot sync *)`, `Bash(pilot integrate *)`, `Bash(pilot land *)`, `Bash(pilot landing *)`, `Bash(pilot ps)`, `Bash(pilot gc)` and `Bash(pilot deck --stop *)` are added to `permissions.allow`, and eight ask rules for a push or merge to `main` or `master` are added to `permissions.ask`. One backup, taken before the one write. Either status line that is already set is reported and left alone. Then step 6 writes `enabledPlugins["pilot@pilot"]`, `true` only at the `everything` reach, and below it takes the pilot's own status lines back out. |
| `~/.claude/rules/` | The package's rules are copied in as far as the reach says (step 6): all of them at `everything`, the language rules at `rules`, none at `nothing`. A session on this machine then loads the ones matching the language it is working in. A copy an earlier version shipped is replaced with the current one; a file they edited or wrote is never overwritten, and is named in the report instead. The copy is kept current from then on: the first session after an upgrade runs the same copy (`install-rules.mjs --repair`, ADR 0079), says what it changed, and names an edited rule once. |
| `~/.claude/CLAUDE.md` | Nothing, unless they say yes to the excerpt. |
| `~/.claude/pilot/` | `reach.json`, the reach chosen at step 6, and `rules-root/`, the rules `pilot run` hands its own session with `--add-dir`. The deck's own state, created the first time the deck runs. It includes `usage.jsonl`, one line every half hour with the tokens Claude Code spent in it, by model and by repository, read from the session transcripts on this machine and never sent anywhere; `pilot logging off` stops every log the deck keeps, and `pilot logging on` resumes them. |
| The plugin directory | `npm install --omit=dev`, for the deck's one dependency. |
| `~/.gateguard/` | Only if an older version left it: the `state-*.json` files in it are deleted, then the directory if that empties it. Anything else in it is kept and named. |
| `~/.claude/pilot/defender-advised.json` (Windows) | Written once the Defender steps of step 4a are shown, so they are given once per machine. Defender itself is never changed. |
| `~/.claude/pilot/command/` | The launcher the `pilot` command runs: two files, `launcher.mjs` and its `package.json`. |
| npm's global directory | A `pilot` command linked to that launcher, so `pilot run` works from any terminal and follows plugin updates. A `pilot` that belongs to another package is left alone. |
| `HKCU\Environment\Path` (Windows) | npm's global directory is appended to the user PATH, with the value's kind kept, only when it is not already there (ADR 0128). |
| The shell profile file (macOS, Linux) | One block that puts npm's global directory on the PATH is appended to the profile of the user's `$SHELL` (`~/.zshrc`, `~/.bashrc` or `~/.config/fish/conf.d/pilot.fish`; for bash on macOS, the first of `~/.bash_profile`, `~/.bash_login` or `~/.profile` that exists, else a new `~/.bash_profile`), only when the directory is not already on the PATH (ADR 0128). |
| Anything else | Nothing. |

Run branches go to `origin` unless the person sets `pilot.remote`; see "Where run branches live" in [`OPERATING.md`](OPERATING.md), which is for the person: run nothing in it. Install writes no such setting.

## The four questions to ask

Ask these one at a time, in your own words, and wait for the answer before acting on it:

1. **Which documentation hosts should the docs agent be allowed to fetch?** The package's
   `pilot:docs-lookup` agent reads library documentation with `WebFetch`, which is an
   untrusted web page going into a model. A `WebFetch(domain:…)` allowlist narrows that to
   hosts they trust — `docs.python.org`, `nodejs.org`, `react.dev`. "None" is a fine
   answer and no `WebFetch` rule is written in that case.
2. **May the deck tools run without asking?** The pilot and its crew talk to the deck
   through its MCP tools, often from a background agent nobody is watching. Without an
   allow rule each deck call waits on a terminal prompt, and the auto-mode classifier
   may refuse it outright, so a run stalls. The rule is
   `mcp__plugin_pilot_deck__*`: the deck server's tools and nothing wider. Yes is the
   default; on a no, pass `--no-deck-tools` at step 5 and nothing is written for it. A
   deny they already have for the deck is left alone and reported.
3. **May the pilot excerpt be added to their `CLAUDE.md`?** Ask this at step 7, with the
   text in front of them, not before, and only if their answer to question 4 is `everything`.
4. **How much should a plain `claude` session carry?** A plain session is any `claude` they
   start themselves rather than through `pilot run`, which carries the whole pilot whatever
   they answer. `nothing` is the default: a plain session loads no pilot agents, skills,
   deck tools, hooks, rules or status line. `rules` gives plain sessions the language rules
   only, which cost nothing until a file in that language is open. `everything` gives every
   session the whole pilot. The answer is the level step 6 runs; `pilot reach <level>`
   changes it later. On a run over an earlier install, `pilot reach` with no level prints
   the level in force: offer that as the default unless it says *not chosen*, and never
   run step 6 without their answer, since a lower level removes what the higher one placed.

## 1. Install the plugin

```bash
claude plugin marketplace add HazzardRust/pilot
claude plugin install pilot@pilot
```

The repository is its own marketplace, so those two lines are the whole of it. If the
first fails with a not-found error, the repository is private and this machine's `gh`
login does not have access to it — say so and stop; there is nothing to work around. If
the second fails for any reason, stop there too and say what it printed: every step below
writes into their configuration on behalf of a plugin that would not be installed.

Installing from a local clone instead is the same, with the path in place of the name:
`claude plugin marketplace add /path/to/pilot`.

## 2. Find the plugin root

```bash
claude plugin list --json
```

Find the entry whose `id` is `pilot@pilot` and take its `installPath`. Call that `<root>`
below. Do not guess it, and do not read the harness's own plugin registry: with a
marketplace added from a local directory the package can run from the clone rather than
from the cache, and a guessed path is a path to files that are not there.

If the marketplace was added from a local clone, treat both the clone and `installPath`
as `<root>` for step 3 only — whichever the harness runs, the dependency has to be beside it.

## 3. Install the deck's one dependency

```bash
npm install --omit=dev
```

Run it in `<root>`. The deck speaks MCP over `@modelcontextprotocol/sdk` and that is the
only npm dependency in the package; everything else is Node built-ins. An install from
GitHub does not bring `node_modules` with it, so without this the deck cannot start. It
is safe to run when the dependency is already there — it does nothing.

## 4. Put the `pilot` command on the PATH

```bash
node "<root>/scripts/install-command.mjs"
```

An agent that needs a deck of its own runs `pilot deck --scratch`, then `pilot deck --stop`; neither touches the user's.

Once `pilot help` answers, run `pilot gc` once to reap what an older version left running, and keep its lines for the step-10 report.

This is what makes `pilot run` and `pilot deck` work from any terminal. `pilot run` is
how they start the pilot from now on, and below the `everything` reach the only way: it
turns the plugin on for its own process, which a plain `claude` session does not load, and
it types the hand-off's `/clear` for them. The script copies a small launcher into
`~/.claude/pilot/command/` and links npm's global `pilot` to it, then runs `pilot help`
through that link to prove it answers. The launcher asks `claude plugin list --json`
where the plugin is each time it starts, so the command follows every
`claude plugin update` and this step never has to run again. Read what it prints; four
outcomes need you to say something rather than move on:

- **a `pilot` command from some other package is already there** — it has left that
  alone and installed nothing. Tell them what it named; removing it is their call;
- **`pilot help` did not answer** — say so, with what it printed. The command is on
  their machine but will not work;
- **the install added npm's global directory to their PATH** — on Windows the user
  `Path` in the registry, on macOS and Linux their shell's profile file. Tell them where
  it wrote and to open a new terminal, because a terminal already open does not see the
  change. It asks no question first and writes nothing when the directory is already there;
- **it could not write the PATH** — the command is installed but no terminal will find it.
  Tell them the directory it named so they can add it by hand.

On macOS it also prints a note to pass on as it stands: macOS asks before a terminal reads `~/Desktop`,
`~/Documents`, `~/Downloads` or iCloud Drive, so keep repositories elsewhere, or give the terminal Full Disk Access
in System Settings > Privacy & Security.

An install from before the launcher linked `pilot` to one version's directory. This step
re-points that link to the launcher and says so.

## 4a. On Windows, check Defender

On Windows only; skip this step anywhere else and say so.

```bash
pilot doctor defender
```

It prints one row: whether Defender's real-time scan sits in front of the folder their
repositories live in, which slows every gate and install. On `pass`, say so and move on.
On `fail` or `cannot tell`, show them the two steps indented under the row as printed: the
exclusion first, then the Dev Drive in performance mode as the upgrade. Both are for them to
run as administrator if they choose; never run them yourself. Once you have shown them, record
that you did, so no later session repeats the advice on this machine:

```bash
pilot doctor defender advised install
```

## 5. Merge the settings

If they named documentation hosts:

```bash
node "<root>/scripts/install-settings.mjs" --allow-web-fetch docs.python.org,react.dev
```

If they named none, leave the flag off entirely. If they said no to the deck tools, add
`--no-deck-tools` to whichever command you run:

```bash
node "<root>/scripts/install-settings.mjs"
```

One run merges all five — the allowlist, the deck-tools rule, the default-branch ask rules, the status line,
and the subagent status line that shows a subagent's own context use — into
`~/.claude/settings.json`, taking one
timestamped backup of the file as they had it before the single write. Read what it
prints and keep it for your report. Two outcomes need you to say something rather than
move on:

- **it reports a status line that is already set** — it has left theirs exactly as it was
  and printed the setting it would have written. Show them both and let them choose. Do
  not edit the file yourself;
- **it refuses because the file is not readable JSON, or because their `permissions`
  block is not the shape Claude Code reads** — it has written nothing, not even the
  status line. Tell them which file and what it said. Do not try to repair their
  settings: a block this script will not round-trip is one it could destroy.

The ask rules make every session on the machine ask before `git push origin main`,
`git push origin main …`, `git push origin <ref>:main`, the same three for `master`, and
any `gh pr merge`. A rule their deny list already covers is reported and left out. Beside
them, four allow rules let the pilot run its own `pilot sync`, `pilot integrate`,
`pilot land` and `pilot landing` (ADR 0110), and four more let an agent run `pilot ps`, `pilot gc`,
`pilot deck --stop *` and `pilot deck --scratch *` to list, reap, stop and start scratch decks (process-gc, yellow-lane).
Auto mode's classifier reads only the command text, so without them it refuses a landing the
user has already signed off. They are allow rules where the
main-branch rules are ask rules because those commands push only the pilot's own branches:
`pilot sync`, `pilot integrate` and `pilot land` refuse the default branch in code,
whatever a rule says. They do run the repository's test command (`npm test`, or
`git config pilot.test`) unprompted, so the rules trust whatever that test script is.
One their deny or ask list covers is named and not added, since theirs wins anyway.
No deny rule is written. They cannot catch every
push: Bash rules match the command as written, so a push with an upstream set (`git push`
alone), `git -C . push`, `HEAD:refs/heads/main`, a variable or `sh -c` goes through
without a prompt. Recommend they turn on branch protection for the default branch on
GitHub; that, and the pilot's own guard on every push it makes, are the real controls.

The session-limit alert needs no merge: the plugin registers its own hooks.

## 6. Choose the reach

```bash
pilot reach <level>
```

`<level>` is their answer to question 4: `nothing`, `rules` or `everything`. Before you run
it, tell them what it means, because the rules are the largest thing the install adds to
their machine: over a hundred markdown files — `node "<root>/scripts/install-rules.mjs" --dry-run`
prints the exact count and writes nothing — that a session loads as standing instruction
text when they match the language it is working in. That is how the crew's conventions
reach the work, so `pilot run` always has them; whether every session on this machine
carries them too is theirs to decide:

| Reach | A plain `claude` session carries | `~/.claude/rules/` holds |
| --- | --- | --- |
| `nothing` (default) | no pilot at all | no rule of this package |
| `rules` | the language rules only | the rules that name a language |
| `everything` | the whole pilot: agents, skills, deck tools, hooks, status lines | every rule |

If they would rather not choose, or would rather not carry the rules in every session,
`nothing` is the answer. The command stores the level in `~/.claude/pilot/reach.json`,
puts the rules a plain session does not get in `~/.claude/pilot/rules-root/` for
`pilot run`, writes `enabledPlugins["pilot@pilot"]` (`true` only at `everything`), and
keeps the pilot's status lines only at `everything`; a status line of their own is never
touched. `pilot run` turns the plugin on for its own process at every level. Running it
again with another level moves the machine there, and moving down removes only the copies
this package shipped and its own status lines. Read what it prints: a line per rules
place with what it added, updated and removed, then each file it left. Exit 1 means a
write failed, and the lines say which.

A plugin can carry rules files but cannot register them as loaded context, which is why
this is a copy into `~/.claude/rules/` (ADR 0008). What it may change in either rules
place is decided by a ledger of every version of every file this package ever shipped
(ADR 0055):

- A file byte-identical to a version an earlier release shipped is replaced with the
  current one and named as *updated*. This is how an update reaches a machine that
  installed before.
- A file this package no longer ships, byte-identical to a version it did, is deleted and
  named; a directory that leaves empty goes with it. This is how the old `common/` layer
  leaves.
- Anything else is never overwritten and never deleted: a file they edited by even a byte,
  a file they wrote, a file from another plugin. Each is named in the output. Repeat that
  list to them verbatim — an edited one is a rule of this package they are *not* getting,
  and it is their call whether to merge it by hand.

A file it could not write or delete at all is named the same way; the copy carries on
past it rather than stopping. Tell them what was updated and what was removed.

## 6a. Remove what an older version left behind

```bash
node "<root>/scripts/install-leftovers.mjs"
```

Versions before this one shipped a fact-forcing hook, the gateguard, which kept its state in
`~/.gateguard/` (ADR 0078). This deletes only the `state-*.json` files directly in that directory,
then the directory if nothing else is left in it, and prints each path it removed. Anything
else there is kept and named, and a link is never followed; repeat the kept lines to them.
On a machine that never had it, it prints that there is nothing to remove.

## 7. Offer the `CLAUDE.excerpt.md` excerpt

Offer it only if the reach is `everything`. Below it, skip this step and say so in the
report: a `CLAUDE.md` section is read by every session, which is what a lower reach keeps
the pilot out of.

Read `<root>/CLAUDE.excerpt.md` and show them the whole of it. It is a short section about
how the pilot is used — the crew, the deck, the two gates, the worktree rule — that reads
well in a personal `CLAUDE.md`, and nothing in the package needs it to be there.

Then ask whether to append it to `~/.claude/CLAUDE.md`. **Do not append anything until
they say yes.** If they say yes: append it at the end, after one blank line, leaving every
other byte of the file untouched, and create the file if it does not exist. If they say no
or say nothing, tell them the path it is at so they can paste it themselves later, and
move on.

## 8. Check the browser dependency rather than registering it

The package declares Chrome DevTools MCP itself, pinned to `chrome-devtools-mcp@1.9.0`, so
there is nothing to register. Confirm it: in the `claude plugin list --json` entry from
step 2, `mcpServers` holds both `deck` and `chrome-devtools`, and the `chrome-devtools`
arguments name that exact version.

The `chrome-devtools` and Supabase MCP servers are optional per project: a feature with no web
surface and no database never calls them, and nothing here needs them registered for it.

Do not add an MCP server by hand, and do not change the pin to `@latest`: it is pinned so
that a browser-driving dependency cannot change between runs under the implementer and
the QA agent, which drive it when a feature has a web surface.

## 9. Verify with a real deck item

The plugin's MCP servers are loaded when a session starts, so the session you are in now
does not have them. Verify in a new process:

```bash
claude --settings '{"enabledPlugins":{"pilot@pilot":true}}' --agent pilot:pilot -p "Post one deck item asking me to reply OK, then wait for my reply."
```

The `--settings` turns the plugin on for this one process, as `pilot run` does, so the
check works at every reach; below `everything` a plain session has no deck tools. The JSON
is quoted for a POSIX shell such as Git Bash; from PowerShell, write it to a new file in
the system temp directory (never under `~/.claude`), pass that path to `--settings`, and
delete the file afterwards.

Then tell them to open <http://127.0.0.1:4321> and reply to the item. When the reply
reaches the run, the whole path is proven at once: the deck daemon started, the MCP client
reached it, the page rendered, and a reply typed in a browser came back to an agent.

The deck holds its state in `~/.claude/pilot/`, binds `127.0.0.1` only, has no
authentication, and refuses to store anything matching a key or a token — say that while
they are looking at it, because it is the reason a secret never goes in a deck item.

If the deck reports the port is held, something else on the machine has 4321.
`PILOT_DECK_PORT` moves it for a check, but the status line and the documentation both
assume 4321, so the real fix is freeing the port.

## 10. Report what happened

Finish with a short table, not a paragraph: every step, what changed, and what was left
alone. Name every file the rules copy skipped and every setting that was already theirs, and include the lines `pilot gc` printed in step 4.
If anything failed, say which step and what the command printed.

End by telling them how to start a run from now on: `pilot run` in the repository they
want to work on, if step 4 installed it and it answered.

Then point them at [`OPERATING.md`](OPERATING.md) for what comes after the install: starting a
run by hand, where run branches live and slow gates on Windows. It is written for them, not
for you: run nothing in it, and do not offer to.

## Running this again

All of it is safe to run twice, and a second run should change nothing:

| Step | What a second run does |
| --- | --- |
| Plugin install | Reports it is already installed. |
| `npm install --omit=dev` | Nothing; the dependency is there. |
| `pilot` command | Reports it already points at the launcher. Writes nothing, installs nothing. |
| Defender check | Prints the row again; on `fail` or `cannot tell`, show the steps again and rewrite `defender-advised.json`. |
| Settings merge | Reports both status lines as already set, adds no ask rule and no merge allow rule, and reports any `WebFetch` host already allowed or already covered by a deny rule. Writes nothing, backs up nothing. |
| Reach | At the same level, reports every rule as already there and names again the files it left alone. Writes nothing but `reach.json`, deletes nothing. |
| Leftovers | Reports there is nothing to remove, or names again what it kept. |
| Excerpt | Ask again; append only on a fresh yes, and check it is not already in the file. |

If a second run reports files as *written* rather than *already present*, something has
removed them since — say so rather than treating it as normal.

## Uninstalling

When they ask to remove pilot, have them run `pilot uninstall` first. It prints what it would
stop, remove and leave, and changes nothing. Then `pilot uninstall --yes`, which:

- stops their deck, if one is answering;
- removes the `pilot` command and its launcher directory `~/.claude/pilot/command`, but a
  `pilot` from another package is left alone and named;
- removes the marked `# >>> pilot >>>` block from their shell profile, and nothing around it;
- backs up `~/.claude/settings.json`, then removes pilot's status lines and the allow rules
  starting `mcp__plugin_pilot_deck__` or `Bash(pilot `; the default-branch ask rules and the
  WebFetch hosts stay and are named;
- removes each rules file under `~/.claude/rules` that is byte-identical to a copy pilot
  shipped; an edited one stays and is named, and a file of their own is not touched;
- leaves, and names, the store `~/.claude/pilot` and the audits in it, the Windows PATH entry
  (pilot cannot tell it from their own) and the `CLAUDE.md` excerpt (added with no marker);
- ends with `last: claude plugin uninstall pilot@pilot`, the one command left for them.

Leave the plugin uninstall to them, and have them run it straight after: while the plugin
stays enabled, its session hook puts the rules and settings back.

## What you must never do here

- Never overwrite a `statusLine`, a rules file they edited or wrote, or anything else that
  was already on this machine and is not a copy this package shipped. Report it and let
  them decide.
- Never append to their `CLAUDE.md` without an explicit yes.
- Never write a credential into any file, and never put a token in a deck item — the deck
  refuses them on purpose.
- Never hand-edit `settings.json`. The script backs it up and merges; you would not.
- Never `git pull`, update, or re-sync an upstream project as part of an install. The
  package is self-contained: nothing here needs another plugin to be installed, and the
  vendored copies are updated deliberately by a human, with `scripts/check-upstream.mjs`
  to say what has moved.
- Never leave a step half-done and silent. If something fails, the report says so.
