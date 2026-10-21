# Install puts pilot on the PATH

Ticket itm_26df84bdd527 · slug `install-pilot-path` · base `pilot` e7c389e4 · ADR to write: 0128

## 1. Problem

On a fresh machine, step 4 of `docs/INSTALL.md` linked `pilot` into npm's global command
directory, found that directory was not on the PATH, and only said so: the step tells the
installing Claude "do not edit their PATH". `pilot run` then worked only through a
temporary environment variable in that one terminal. The user wants the install to put the
directory on the PATH for good, so every terminal opened afterwards finds `pilot`.

## 2. Spec

Agreed with the user on itm_b178d823c4e6, including lines 5 and 6 and the out-of-scope line below.

| # | Behaviour | Evidence |
| --- | --- | --- |
| 1 | Windows: when npm's global command directory is on neither the user nor the machine PATH **as stored in the registry**, the install appends it to `HKCU\Environment\Path` and tells running programs the environment changed, so a terminal opened afterwards runs `pilot help`. | `reg query HKCU\Environment /v Path` lists the directory; a new Windows Terminal tab runs `pilot help` and prints the usage. |
| 1b | macOS/Linux: when the directory is not on the PATH, the install appends the pilot block to the profile of the user's `$SHELL` (zsh `~/.zshrc`, bash `~/.bashrc`, fish `~/.config/fish/conf.d/pilot.fish`). | The block in the file; `$SHELL -l -i -c 'pilot help'` prints the usage (fixture home in tests). |
| 2 | A second run, with the directory already on the persistent PATH, writes nothing and says it is already there and where. | Registry value and profile bytes identical before and after; the note `<dir> is already on your PATH (<where>).` |
| 3 | The report names exactly what it wrote and where, and says to open a new terminal; `docs/INSTALL.md` step 4 and its "What this changes" table say the install edits the PATH. | The note `Added <dir> to <where>. Open a new terminal for pilot to be found.`; the INSTALL.md diff. |
| 4 | When the PATH cannot be written (the registry write refused, `$SHELL` unset or unknown, the profile unwritable) the command is still installed, `ok` stays true, and the report names the directory to add by hand, as today. | A test with a refusing registry adapter and one with `SHELL=/bin/tcsh` both show `ok: true` and the hand-add note. |
| 5 | `--dry-run` reports `would add <dir> to <where>` and writes nothing. *(implied)* | The registry adapter records no write; the profile is absent after a dry run. |
| 6 | When the install refuses (another package's `pilot`), it writes no PATH either. *(implied)* | Refused-install test: the adapter records no write. |

Not meant here: removing the entry (there is no uninstall script; the marker is what a
later one would find); the machine-wide PATH (needs elevation).

## 3. Findings

- `scripts/install-command.mjs:178` `onPath(prefix, env)` judges presence from the
  **process** environment. In the user's own case (a temporary variable in the installing
  terminal) that reports the directory present when nothing persistent holds it. Presence
  must be judged from what a new terminal will inherit.
- `scripts/install-command.mjs:189` `describe` builds the notes; its last branch is the
  only PATH line today. `installCommand(options)` already takes `env`, `prefix`, `dir`,
  `dryRun`, `verify`: an injection style the new seam follows.
- `binDir(prefix)` (l.70): `prefix` on Windows, `prefix/bin` elsewhere.
- This machine: `npm prefix -g` is the winget Node directory; it is in the user PATH now
  (value kind `REG_SZ`, 585 characters), added by hand. So the existing kind must be kept,
  not forced to `REG_EXPAND_SZ`.
- `setx` truncates at 1024 characters; `[Environment]::SetEnvironmentVariable(...,'User')`
  rewrites the value as `REG_SZ` and so turns `%VAR%` entries literal. Neither is used.
- No script spawns PowerShell or `reg.exe` today.
- `scripts/test/install-command.test.mjs` calls `installCommand` in-process with real npm
  against a scratch prefix (l.81–161). Once the PATH write exists, each such call would
  write the developer's real registry unless the test injects an adapter. Its two CLI
  runs (l.189 dry run, l.192 refused) write no PATH by spec 5 and 6.
- `scripts/test/install.test.mjs:998` pins `doesNotMatch(INSTALL(), /shell profile|shell function/i)`
  (commit cbda9274, a stale question the launcher left behind). This run amends it: the
  install still asks nothing, but step 4 now names the profile file it edits.
- `scripts/test/scripts.test.mjs:192` lists the runtime scripts held to "no absolute home
  path"; the new script joins it.
- No ADR records the never-touch-PATH rule; it lives only in INSTALL.md step 4 and the
  "What this changes" table. ADR 0128 records the change.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `persistPath` (`scripts/install-path.mjs`, new) | `persistPath(dir, { platform, env, home, registry, dryRun }) → PathResult` | `onPath` (the process-env check) and the PATH line of `describe`; the per-platform presence check and write | Windows: true external, injected adapter; POSIX: local-substitutable (temp home) |
| `Registry` adapter | `{ read() → { user, userKind, machine }, write(value, kind), broadcast() }`; `powershellRegistry()` and the tests' in-memory one | the PowerShell spawn, the raw (unexpanded) read, the kind-keeping write, `WM_SETTINGCHANGE` | true external, two adapters |
| `installCommand` (existing) | gains `options.path` (passed to `persistPath`; on Windows its `registry` is required) and `report.path: PathResult` | none | in-process orchestration |

Deletion test: delete `onPath` and its complexity reappears inside `persistPath` (as the
persistent check), so it goes; `describe` survives, it is the report. The fold is not its
own slice: it changes behaviour (process env to persistent store), so it is the feature,
and S1's first red step.

## 4. Ubiquitous language

- **command directory**: `binDir(prefix)`, where npm writes the `pilot` shim.
- **persistent PATH**: what a terminal opened later inherits: the registry user and machine
  `Path` on Windows; the profile on POSIX.
- **profile**: the one startup file chosen for `$SHELL` (1b).
- **pilot block**: the lines between `# >>> pilot >>>` and `# <<< pilot <<<`.
- **PathResult**: `{ action: 'added' | 'present' | 'would-add' | 'failed', where, why? }`.

## 5. Locked decisions

| Decision | Rationale | Rejected |
| --- | --- | --- |
| Windows writes the user value in `HKCU\Environment` through PowerShell's registry API, read with `DoNotExpandEnvironmentNames`, its kind kept (`REG_EXPAND_SZ` when the value is new). | No truncation, `%VAR%` entries survive, one process spawn. | `setx` (1024-character truncation); `[Environment]::SetEnvironmentVariable` (forces `REG_SZ`); the machine PATH (needs admin). |
| Broadcast `WM_SETTINGCHANGE "Environment"` after a write, by `SendMessageTimeout` in a second PowerShell call after the write, so a failed broadcast is told apart (reported `added` with a sign-out hint). | Explorer and Start-menu launches re-read the environment only on that message; spec 1 is a *new* terminal. | No broadcast (works only after sign-out); a dummy `setx` for its side effect (writes a variable). |
| Presence on Windows = the directory (after `%VAR%` expansion, case-insensitive, trailing separator dropped) is in the user or machine registry value; the process PATH is ignored. | The user's own failure: a temporary variable made it look present. | Process env (today's `onPath`). |
| The directory reaches PowerShell through an environment variable, never interpolated into the script. | A process start; npm's prefix can hold spaces or quotes. | A string-built `-Command`. |
| A PATH failure is a note, not a failure: `ok` is decided as today. | Spec 4: the command is installed; the PATH is the user's to finish. | Exit 1. |
| No PATH write on `refused` or `--dry-run`; a dry run reports `would-add`. | The dry-run contract writes nothing; a refused install put nothing there to find. | Writing anyway. |
| Grilling depth is forks: only an assumed decision whose answer changes the deliverable goes to the user; the rest stay assumed here. | The user's choice, itm_94bc8a2d0df5. | Every assumed decision posted. |
| The POSIX profile is chosen by `$SHELL`: zsh `~/.zshrc`, bash `~/.bashrc`, fish `~/.config/fish/conf.d/pilot.fish`; any other shell gets the hand-add note. | Agreed in the spec (1b); these reach the interactive terminals people open. | `~/.profile` for all (zsh never reads it). |
| Tests inject `registry` and `home`; the existing in-process `installCommand` tests pass an in-memory registry. | The developer's real PATH is never touched. | An env-var kill switch (a test hook in shipped code). |
| The PATH code lives in a new `scripts/install-path.mjs` (`persistPath` + the PowerShell registry adapter); `install-command.mjs` only calls it. Locked by the user, itm_de9d55358e63 (was A3). | Two platforms and a registry adapter are their own concern and test file; S2 runs beside S3. | Growing `install-command.mjs` (298 lines) to ~450: one file, but S1 and S2 share it with every future link change. |
| No new CLI flag. | Putting it on the PATH is what step 4 is for; spec 4 is the way out. | `--no-path`. |

## 6. Assumed decisions (awaiting the user)

| # | Decision | Default taken | Tradeoff | Fork |
| --- | --- | --- | --- | --- |
| A1 | Presence on POSIX | On the process PATH, or the pilot block already in the profile, counts as present | Nothing persistent can be read reliably (nvm, Homebrew, `/etc/profile.d`); the user's temp-variable case would be missed on POSIX. | no: same files and tests, one condition |
| A2 | QA environment | This Windows machine with a scratch `--prefix` (so the user's real entry is untouched); the user opens a new tab and checks `%PATH%` and the scratch shim; QA removes the scratch entry afterwards. POSIX through fixture homes only (no WSL here). | The live POSIX case (1b's fresh login shell) is not watched on a real machine. | no: changes QA, not the deliverable |
| A4 | Untrusted directory text | The directory comes from `npm prefix -g` output. The pilot block single-quotes it and refuses (`failed`, hand-add note) a directory containing `'`, a newline or `$`; the registry write passes it to PowerShell as data (an environment variable), never interpolated into the script. Both have a test in the slice that owns the writer (S1 test 6, S2 test 5). | Refusing rather than escaping leaves a rare odd prefix to be added by hand; escaping `'` would accept it but is easier to get wrong in shell code every terminal runs. | no: a security default, same files |

## 7. Out of scope

Uninstall and removing the entry; the machine-wide PATH; `~/.bash_profile` and shells other
than zsh, bash and fish beyond the hand-add note; how `pilot` is linked; the `pilot help`
verification.

## 8. Slices

Width 2; longest stem 2

| Slice | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- |
| S1 Windows install adds the command directory to the user PATH (walking skeleton) | 1, 2, 3 (report), 4, 5, 6 | `scripts/install-path.mjs` (new), `scripts/test/install-path.test.mjs` (new), `scripts/install-command.mjs`, `scripts/test/install-command.test.mjs`, `scripts/test/scripts.test.mjs` | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 POSIX install appends the pilot block to the shell's profile | 1b, 2, 4, 5 | `scripts/install-path.mjs`, `scripts/test/install-path.test.mjs` | S1 (`persistPath`, `scripts/install-path.mjs`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S2](slices/S2.md) |
| S3 INSTALL.md and ADR 0128 say the install edits the PATH | 3 | `docs/INSTALL.md`, `scripts/test/install.test.mjs`, `docs/adr/0128-the-install-puts-the-command-on-the-path.md` (new), `docs/adr/README.md` | S1 (the report notes step 4 quotes) | `pilot:typescript-reviewer` | [S3](slices/S3.md) |

S2 and S3 share no file and run side by side once S1 is in.

## 9. Acceptance evidence

1. On Windows, `node scripts/install-command.mjs --prefix <scratch>` prints `Added <scratch> to your user PATH (HKCU\Environment\Path). Open a new terminal for pilot to be found.`
2. `reg query HKCU\Environment /v Path` lists `<scratch>`, and the value's kind is unchanged.
3. A new Windows Terminal tab: `echo %PATH%` contains `<scratch>`, and `"<scratch>\pilot.cmd" help` prints the usage.
4. The same command again prints `<scratch> is already on your PATH (HKCU\Environment\Path).`; the value is byte-identical.
5. With `--dry-run` it prints `would add`, and the value is unchanged.
6. `node --test scripts/test/install-path.test.mjs` shows the refusing-adapter and unknown-shell cases with `ok: true` and the hand-add note, and one pilot block in the zsh, bash and fish fixture profiles after two runs.
7. INSTALL.md step 4 says the install edits the PATH; ADR 0128 is in the index.

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 1, 2, 3, 4, 5, 6 |
| S2 | planned | | | | S1 | 1b, 2, 4, 5 |
| S3 | planned | | | | S1 | 3 |
| install-pilot-path | planned | | | | S1, S2, S3 | 1–6, 1b |
