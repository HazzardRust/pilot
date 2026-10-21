/**
 * A home directory of this process's own, installed by importing this module first.
 *
 * On Windows `os.homedir()` reads `USERPROFILE` and ignores `HOME`, so a run that
 * redirects only `HOME` — the habit everyone brings from POSIX, and what the mutation
 * and coverage tooling does — still resolves to the real profile.
 *
 * On 2026-09-15 that cost a real one. A mutation run over `scripts/install-settings.mjs`
 * and `scripts/install-rules.mjs` flipped `options.settingsPath || defaultSettingsPath()`
 * to the default, and this suite's own fixtures — `nodejs.org`, `react.dev`,
 * `internal.example.com`, a `subagentStatusLine` pointing at `\opt\pilot` — were merged
 * into a person's actual `~/.claude/settings.json`, five backups in six seconds, and the
 * whole rules tree was written into their actual `~/.claude/rules/`.
 *
 * No test was wrong. Every one of them passes an explicit path. What was wrong is that
 * passing the path was the *only* thing between this suite and someone's configuration,
 * and dropping an argument is precisely what a mutant does on purpose — so the one
 * defence was the one thing guaranteed to be removed. This moves the home directory
 * itself, which no mutant in the code under test can reach: a test that forgets its
 * path, or a mutant that drops it, writes into a temporary directory that goes away
 * when the process ends.
 *
 * `hooks/test/context-usage.test.js` and `deck/test/daemon.test.mjs` already do this for
 * their own directories, the second after a mutation run cost them the same way on
 * 2026-09-14. This is that guard for the two files that did not have it.
 *
 * Import it before anything else, and never conditionally:
 *
 *     import { REAL_HOME, FAKE_HOME } from './lib/fake-home.mjs';
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Where the home directory really is, read before anything moves it. */
export const REAL_HOME = os.homedir();

/** The home this process gets instead, for as long as it runs. */
export const FAKE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-fake-home-'));

// Both, because `os.homedir()` consults a different one on each platform, and a
// spawned child inherits `process.env` — so a subprocess test is covered without
// having to remember to pass anything.
process.env.HOME = FAKE_HOME;
process.env.USERPROFILE = FAKE_HOME;

process.on('exit', () => {
  try {
    fs.rmSync(FAKE_HOME, { recursive: true, force: true });
  } catch {
    // A home we cannot delete is a temporary directory left behind, which is
    // untidy; throwing here would fail a suite that has already passed.
  }
});
