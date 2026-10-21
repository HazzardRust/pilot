#!/usr/bin/env node
/**
 * `pilot` — the one thing a human runs by hand.
 *
 * A2 says the first Claude session that needs the deck starts it, which is the path
 * that matters. `pilot deck` exists for the other times: starting the deck before opening
 * a session. It starts the deck detached, the way a session does (`ensureDaemon`), and
 * returns once the deck answers, so closing the terminal it was typed in leaves the deck
 * up. `pilot deck --foreground` serves it in this process instead, for watching stderr
 * while debugging and stopping it with Ctrl-C.
 *
 * `pilot run` is the second subcommand: the pilot, started inside a terminal this process
 * owns so that the `/clear` of a hand-off can be typed for the user (`deck/run.mjs`).
 * `pilot integrate` is the third, the pilot's one call to land a slice on its feature
 * branch (`scripts/integrate.mjs`); `pilot handoff` its one call to hand the run to a fresh
 * session (`scripts/handoff.mjs`). A dispatcher and nothing else — each subcommand is one module
 * under `deck/`, and the exit code it answers with is this process's.
 */

import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { main as analytics } from '../deck/analytics.mjs';
import { main as audit } from '../deck/audit.mjs';
import { main as base } from '../scripts/base.mjs';
import { main as branches } from '../scripts/branches.mjs';
import { main as ghStub } from '../scripts/gh-stub.mjs';
import { main as uninstall } from '../scripts/uninstall.mjs';
import { main as reach } from '../scripts/apply-reach.mjs';
import { budget } from '../deck/budget.mjs';
import { ready } from '../deck/schedule.mjs';
import { ensureDaemon, isDeckUp } from '../deck/client.mjs';
import { fromLeash, startScratch, stopScratch } from '../deck/scratch.mjs';
import { fromRoot } from '../deck/spawn-root.mjs';
import { openFile, rotateSecret } from '../deck/launch.mjs';
import { openDeck } from '../deck/open.mjs';
import { main as serveDeck } from '../deck/daemon.mjs';
import { storeDir } from '../deck/store.mjs';
import { readUsageSwitch, setUsageSwitch } from '../deck/usage-switch.mjs';
import { run as runPilot } from '../deck/run.mjs';
import { main as handoff } from '../scripts/handoff.mjs';
import { main as deckStatus } from '../deck/status-command.mjs';
import { main as integrate } from '../scripts/integrate.mjs';
import { main as land } from '../scripts/land.mjs';
import { main as landing } from '../deck/landing-wait.mjs';
import { main as sync } from '../scripts/sync.mjs';
import { searchPathOnly } from '../scripts/pilot-branch.mjs';
import { main as worktrees } from '../scripts/worktrees.mjs';
import { parseVerdictMessage, writeVerdicts } from '../scripts/verdicts.mjs';
import { DECK_PORT, deckPort, deckUrl } from '../deck/server.mjs';
import { PLUGIN_VERSION } from '../deck/version.mjs';
import { main as listTickets } from '../deck/tickets.mjs';
import { main as listProcesses, processTable } from '../deck/procs.mjs';
import { main as collectGarbage, deckPidNow, landSweep } from '../deck/gc.mjs';
import { main as doctor } from '../deck/doctor.mjs';
import { main as restoreStore } from '../deck/store-restore.mjs';
import { main as waitForReply } from '../deck/wait.mjs';

// Before any git runs: no git this CLI spawns in a repository is one planted there (spec 7).
searchPathOnly();

// A function, not a constant: `deckUrl()` throws on a mistyped `PILOT_DECK_PORT`, and at
// module scope that would be an uncaught throw on import rather than the one clear line
// `pilot help` exists to print.
const usage = () => `pilot — the deck for piloted runs

  pilot deck     start the deck at ${deckUrl()} in the background and return; prints the
                 open file, which a browser opens to get in
  pilot deck --rotate
                 replace the deck's secret and its open file, and open the deck through it
  pilot deck --from <dir>
                 start the deck from the checkout <dir>, the one way it serves one; refuses
                 a dir without deck/daemon.mjs or its installed dependencies, naming which,
                 and a port where a deck already answers
  pilot deck --foreground
                 serve it in this terminal until Ctrl-C, for debugging
  pilot deck --scratch [--port N] [--seed-run <run.json>]
                 start an agent's own deck on a free port (or N) with its store under the
                 temp directory, never the user's, showing that run record if named;
                 prints its url, pid, dir and open file
  pilot deck --stop <pid>
                 stop a scratch deck by the pid --scratch printed and remove its dir;
                 refuses any other pid, the user's deck included
  pilot run      start the pilot, and type the \`/clear\` of a hand-off for you
  pilot handoff [--trailer "<line>"]...
                 the pilot's hand-off, after its deck_status: commit and push run.json in
                 the feat worktree and post the handoff item; \`pilot run\` types the /clear
  pilot integrate [<slice-branch>] [--no-push] [--trailer "<line>"]...
                 in the feat/<slug> worktree: take origin/pilot, merge the slice (if
                 named), test the selection (the tests the diff touches), push, commit run.json; refuses on the default branch
  pilot integrate --trial
                 in the feat/<slug> worktree, before the gate2: push the feature and try its
                 tip on pilot, merging nothing into it; prints on pilot: clean at <sha7>, the
                 sha the gate2 names, or exit 3 a conflict prepared for the lander
  pilot base     print the ref the next run is cut from: origin's pilot branch and its
                 tip, created from the default branch's tip when origin has none
  pilot gh-stub [--dir <d>] [--powershell]
                 print the lines that put a stub gh first on PATH, answering reply.txt and logging calls.jsonl
  pilot sync
                 at a ticket's take or by hand, never inside a landing: merge origin's default
                 branch into the pilot branch in a temporary worktree, test the selection, push
                 pilot; prints pilot already has main@<sha7> and pushes nothing when the merge
                 would change no file; exit 1 red or failed, 3 a conflict
  pilot land
                 in the feat/<slug> worktree: push the feature, merge only it into pilot
                 in a temporary worktree (no sync), run the full suite (the only full run), push pilot (merged again once if it moved),
                 and keep one open PR from pilot to main, printing main gets pilot: #<n> or why not; exit 3 a conflict
  pilot landing <gate2-id>
                 run in the background after a gate2's Sign off: wait for the landing the
                 deck runs, print its line; exit 0 landed, 1 not, 2 no deck or no such gate2
                 (gives up after 40 minutes)
  pilot worktrees [prune] [--repo <dir>] [--base <ref>] [--dry-run] [--run <slug>]
                 list every worktree as main, merged-clean, merged-dirty, open or locked
                 against the fetched base (default origin/main); prune removes only the
                 merged-clean ones and their local branches, never forced; --run, only
                 run <slug>'s
  pilot branches prune --slug <slug> [--dry-run]
                 delete run <slug>'s merged branches: feat/ on origin, slice/ design/ fix/ qa/
                 on the run remote; names each one kept and why; --dry-run only lists
  pilot audit save <report.json>
                 keep an audit report in the deck store and print its three paths
  pilot audit spec <report.json> <id> [<id>...]
                 print the saved rows' spec text, unedited, as one ticket body; exit 1
                 naming an unknown id
  pilot audit pick <report.json> <reply-file>
                 print the ids a typed pick names, one per line; unknown ids on stderr
  pilot audit count <run key> | due | offered <run key>
                 count this repository's run once; whether the audit offer is due
                 (exit 0) or not (exit 1); record that run's audit offer
  pilot analytics <slug>
                 print the run's tokens, tool calls and time per agent, as Markdown
  pilot verdicts <artefact>
                 with the pilot's verdict message on stdin, one A<n> Verdict: line per
                 assumed decision: write each under its A<n> in the artefact's §6, in place;
                 exit 1 naming the bad line or the ids on one side only, file unchanged
  pilot uninstall [--yes]
                 print what would be stopped, removed and left, changing nothing; --yes
                 stops the deck, removes the pilot command, its launcher and the marked PATH
                 block, names what it left, and ends naming claude plugin uninstall pilot@pilot
  pilot reach [nothing|rules|everything]
                 how much of the pilot a plain claude session carries: print the stored
                 level and the three choices, or store one and bring ~/.claude/rules, the
                 rules root, enabledPlugins and the settings' status line to it; exit 2 an
                 unknown level
  pilot logging on|off|status
                 turn every log the deck keeps on or off without a restart, or print
                 whether it is on; off keeps what is already written (pilot usage was
                 renamed to this)
  pilot tickets [--open]
                 print this repository's red queue, the live ticket first, with bodies,
                 comments and its merge decision; marks nothing read (exit 1 if no deck);
                 --open: every open ticket in any state, and each open run's PR with its files
  pilot budget [--main N] [--yellow N]
                 in the main deck's directory: set how many agents the main session and
                 the yellow lane hold, each itself included (default main 5, yellow 8),
                 or print it; warns above 13
  pilot ready --ticket <id> --slots <n>
                 print the slices the ticket's record lets start now, one per line as
                 S<n> from <feat|branch>, at most n, or none; reads the deck, writes nothing
  pilot status   whether a deck is running at the deck's url: its pid, its version against
                 the plugin's (stale when older), uptime and live agents by repository;
                 then deck.log's last 20 lines either way. Exit 0 with a deck, 1 without
  pilot ps       list the pilot-owned node processes on this machine (deck daemons, waits,
                 \`node --test\` roots), one per line as
                 <pid> <kind> owner <pid|-> age <h:mm> <worktree|-> <orphan: why|live>
  pilot gc       stop the orphans \`pilot ps\` names, and only those, one line each as
                 stopped <pid> <kind> <worktree|-> (<why>) or could not stop <pid>: <reason>;
                 exit 0 always. \`pilot land\` runs it once it has landed
  pilot store restore
                 with the deck stopped: swap deck.json and deck.json.bak, keeping the
                 replaced store as deck.json.replaced-<date>; run it again to undo it
  pilot doctor   on Windows, whether Defender's real-time scan sits in front of the projects
                 root (the repository's parent): off, on a Dev Drive in performance mode,
                 excluded, not, or cannot tell without an administrator, and the admin step
                 if it is not; then Node against package.json's engines, the deck's
                 dependency installed, the store directory writable, and gh, git and claude
                 on PATH. One row each as <pass|fail|cannot tell>  <check>: <detail>, any
                 step indented below; changes nothing; exit 1 when a row fails, else 0
  pilot doctor defender
                 the Defender row alone, its steps the exclusion first and the Dev Drive
                 as the upgrade; exit 1 when it fails, else 0
  pilot doctor defender due
                 whether the Defender advice is owed: on Windows, not yet advised, and the
                 row fails or cannot tell with real-time scanning on. Exit 0 printing the
                 two steps, else exit 1 printing not due: <not windows|pass|advised …>
  pilot doctor defender advised <install|item id>
                 record in the store that the advice was given, once per machine, so
                 \`due\` is quiet after it; exit 2 and write nothing on any other <where>
  pilot wait [--as pilot|qa|teacher|auditor|architect] [--item <id>] [--timeout <minutes>]
                 run in the background; exit the moment a user reply this kind owns
                 (default pilot) is waiting for this repository, take it, print it,
                 and exit 0 (default timeout 110 minutes)

Any command can be given as \`pilot --dir <path> <command> …\` to run it in <path>.

The deck is normally started by the first Claude session that needs it; run it by
hand when you want to watch it. Four environment variables change how it behaves:

  PILOT_DECK_DIR       where the deck keeps its store (default ~/.claude/pilot)
  PILOT_DECK_PORT      the port it serves on (default ${DECK_PORT}; only for tests and hand checks)
  PILOT_DECK_NO_OPEN   set it to stop the deck opening a browser when a session starts
  PILOT_STOP_HOLD_MS   how long the Stop hook holds for a reply (default 570000 ms; raise it with the hook timeout in hooks/hooks.json)
`;

export async function run(argv) {
  // `--dir <path>` first: every verb runs there, so a sub-deck reaches a sibling worktree with no
  // `cd`, which its allowlist refuses (pilot-branch L25; QA's real run, F).
  if (argv[0] === '--dir') {
    const dir = argv[1];
    if (!dir) return refuse('pilot: --dir needs a directory\n');
    try {
      if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return refuse(`pilot: --dir ${dir} is not a directory\n`);
      process.chdir(dir);
    } catch (err) {
      return refuse(`pilot: --dir ${dir}: ${err.message}\n`);
    }
    return run(argv.slice(2));
  }
  const [command, flag] = argv;

  if (command === 'deck' && flag === '--foreground') return serveDeck();

  if (command === 'deck' && flag === '--scratch') {
    const opts = {};
    for (let i = 2; i < argv.length; i += 2) opts[argv[i]] = argv[i + 1];
    const { '--port': portArg, '--seed-run': seedFile, ...extra } = opts;
    const port = Number(portArg);
    const badPort = portArg !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535);
    if (argv.length % 2 || Object.keys(extra).length || badPort || seedFile === '') {
      return refuse('usage: pilot deck --scratch [--port N] [--seed-run <run.json>]\n');
    }
    try {
      const deck = await startScratch({ port: portArg === undefined ? undefined : port, seedRun: seedFile });
      console.log(`url ${deck.url}\npid ${deck.pid}\ndir ${deck.dir}\nopen ${deck.open}`);
    } catch (err) {
      return refuse(`pilot deck --scratch: ${err.message}\n`);
    }
    return undefined;
  }

  if (command === 'deck' && flag === '--stop') {
    const pid = Number(argv[2]);
    if (!Number.isInteger(pid) || pid < 1 || argv.length > 3) return refuse('usage: pilot deck --stop <pid>\n');
    try {
      await stopScratch(pid);
    } catch (err) {
      return refuse(`pilot deck --stop: ${err.message}\n`);
    }
    console.log(`stopped ${pid}`);
    return undefined;
  }

  if (command === 'deck' && flag === '--rotate') {
    if (argv.length > 2) return refuse('usage: pilot deck --rotate\n');
    try {
      console.log(`rotated; open ${rotateSecret()}`);
    } catch (err) {
      return refuse(`pilot deck --rotate: ${err.message}\n`);
    }
    openDeck();
    return undefined;
  }

  let resolve;
  if (command === 'deck' && flag === '--from') {
    // The one opt-in to a checkout (spec 6): named on the command line, never read from the environment.
    // A usage error exits 2, unlike `refuse`'s 1, which names a dir that cannot run a deck.
    if (!argv[2] || argv[2].startsWith('-') || argv.length > 3) {
      process.stderr.write('usage: pilot deck --from <dir>\n');
      process.exitCode = 2;
      return undefined;
    }
    let target;
    try {
      target = fromRoot(argv[2]);
    } catch (err) {
      return refuse(`pilot deck --from: ${err.message}\n`);
    }
    // ensureDaemon joins a deck already up, and "The deck is up" would then claim <dir> serves it.
    if (await isDeckUp()) return refuse(`pilot deck --from: a deck already answers at ${deckUrl()}, not from ${target.root}; stop it first\n`);
    resolve = () => ({ ...target, args: fromLeash(deckPort(), process.env, process.ppid, process.cwd()) });
  }

  if (command === 'deck') {
    const up = await ensureDaemon({ resolve });
    // The path, never the URL with its key (deck-token A2): opening the file signs the browser in.
    // A deck that has just come up writes it a moment after it answers; one older than it never does.
    for (let tries = 0; up && tries < 20 && !existsSync(openFile()); tries += 1) await new Promise((r) => setTimeout(r, 100));
    const open = existsSync(openFile()) ? `open ${openFile()}` : 'no open file: `pilot deck --rotate` writes one';
    console.log(up ? `The deck is up at ${deckUrl()}\n${open}` : `No deck answered at ${deckUrl()}`);
    process.exitCode = up ? 0 : 1;
    return undefined;
  }

  if (command === 'run') {
    // `--sub` is gone (ADR 0088), refused by name rather than read as a plain run.
    if (flag !== undefined) return refuse(`pilot run: unknown option ${flag}\n`);
    process.exitCode = await runPilot();
    return undefined;
  }

  if (command === 'handoff') {
    process.exitCode = await handoff(argv.slice(1));
    return undefined;
  }

  if (command === 'integrate') {
    process.exitCode = integrate(argv.slice(1));
    return undefined;
  }

  if (command === 'sync') {
    process.exitCode = sync(argv.slice(1));
    return undefined;
  }

  if (command === 'land') {
    // The deck's pid is read at the sweep, not before the landing: a deck restarted meanwhile is not an orphan.
    // `read` is the one table read clear's holder and the sweep share (landing-keeps-worktrees L4).
    process.exitCode = land(argv.slice(1), { read: processTable, gc: (read) => landSweep({ userDeckPid: deckPidNow(), read }) });
    return undefined;
  }

  if (command === 'landing') {
    process.exitCode = await landing(argv.slice(1));
    return undefined;
  }

  if (command === 'base') {
    process.exitCode = await base(argv.slice(1));
    return undefined;
  }

  if (command === 'gh-stub') {
    process.exitCode = ghStub(argv.slice(1));
    return undefined;
  }

  if (command === 'worktrees') {
    process.exitCode = worktrees(argv.slice(1));
    return undefined;
  }

  if (command === 'branches') {
    process.exitCode = branches(argv.slice(1));
    return undefined;
  }

  if (command === 'audit') {
    process.exitCode = audit(argv.slice(1));
    return undefined;
  }

  if (command === 'analytics') {
    process.exitCode = analytics(argv.slice(1));
    return undefined;
  }

  if (command === 'verdicts') {
    if (argv.length !== 2 || flag.startsWith('-')) return refuse('usage: pilot verdicts <artefact> (the verdict message on stdin)\n');
    if (process.stdin.isTTY) return refuse('pilot verdicts: pipe the verdict message on stdin\n');
    let message = '';
    for await (const chunk of process.stdin.setEncoding('utf8')) message += chunk;
    try {
      const before = readFileSync(flag, 'utf8');
      const after = writeVerdicts(before, parseVerdictMessage(message));
      if (after !== before) writeFileSync(flag, after);
    } catch (err) {
      return refuse(`pilot verdicts: ${err.message}\n`);
    }
    return undefined;
  }

  if (command === 'uninstall') {
    process.exitCode = await uninstall(argv.slice(1));
    return undefined;
  }

  if (command === 'reach') {
    process.exitCode = reach(argv.slice(1));
    return undefined;
  }

  if (command === 'usage') {
    console.error('pilot usage is now pilot logging on|off|status');
    process.exitCode = 2;
    return undefined;
  }

  if (command === 'logging') {
    const [, word, ...rest] = argv;
    if (!['on', 'off', 'status'].includes(word) || rest.length) {
      console.error('usage: pilot logging on|off|status');
      process.exitCode = 2;
      return undefined;
    }
    const { enabled } = word === 'status' ? readUsageSwitch() : setUsageSwitch(word === 'on');
    console.log(`logging ${enabled ? 'on' : 'off'}, ${storeDir()}`);
    return undefined;
  }

  if (command === 'tickets') {
    process.exitCode = await listTickets(argv.slice(1));
    return undefined;
  }

  if (command === 'budget') {
    process.exitCode = await budget(argv.slice(1));
    return undefined;
  }

  if (command === 'ready') {
    process.exitCode = await ready(argv.slice(1));
    return undefined;
  }

  if (command === 'ps') {
    process.exitCode = await listProcesses();
    return undefined;
  }

  if (command === 'store' && flag === 'restore') {
    process.exitCode = await restoreStore(argv.slice(2));
    return undefined;
  }

  if (command === 'gc') {
    process.exitCode = await collectGarbage();
    return undefined;
  }

  if (command === 'doctor') {
    process.exitCode = await doctor({ args: argv.slice(1) });
    return undefined;
  }

  if (command === 'status') {
    if (argv.length > 1) return refuse('usage: pilot status\n');
    process.exitCode = await deckStatus();
    return undefined;
  }

  if (command === 'wait') {
    process.exitCode = await waitForReply(argv.slice(1));
    return undefined;
  }

  if (command === '--version') {
    process.stdout.write(`${PLUGIN_VERSION}\n`);
    return undefined;
  }

  if (command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(usage());
    return undefined;
  }

  process.stderr.write(`${command ? `pilot: there is no "${command}" command\n\n` : ''}${usage()}`);
  process.exitCode = 1;
  return undefined;
}

function refuse(line) {
  process.stderr.write(line);
  process.exitCode = 1;
  return undefined;
}

// Real paths, not `argv[1]` as given: a global npm install starts this file through a
// link, and Node resolves `import.meta.url` to the file the link points at.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  run(process.argv.slice(2)).catch((err) => {
    console.error('pilot:', err.message);
    process.exit(1);
  });
}
