/**
 * `pilot uninstall` (daemon-lifecycle specs 12 and 13, L10, A4). Plans first: with no flag it
 * prints what it would stop, remove and leave, and changes nothing. With `--yes` it stops the
 * user's deck, removes the `pilot` command and its launcher directory, the marked shell-profile
 * PATH block, pilot's settings and the unedited shipped rules, names what it left, and ends
 * naming `claude plugin uninstall pilot@pilot`, which only the user runs.
 *
 * Only what is provably pilot's goes, and each rule for "ours" lives beside the install code
 * that wrote it: `removeCommand` in install-command.mjs, `removeProfileBlock` in
 * install-path.mjs, `removeOwnSettings` in install-settings.mjs, `removeShippedRules` in
 * install-rules.mjs. A plan is a list of steps built by the planners below in order; a
 * removal step carries its own `run`, so a later remover is one more planner.
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

import { globalPrefix, removeCommand } from './install-command.mjs';
import { BASH_LOGIN, profileFor, removeProfileBlock } from './install-path.mjs';
import { defaultSettingsPath, removeOwnSettings } from './install-settings.mjs';
import { defaultRulesTarget, removeShippedRules } from './install-rules.mjs';
import { rootRules } from './reach.mjs';
import { probeDeck } from '../deck/probe.mjs';
import { isDeckDaemon, processTable } from '../deck/procs.mjs';
import { deckUrl } from '../deck/tools.mjs';
import { hostPlatform } from '../hooks/lib/platform.js';

const LAST = 'last: claude plugin uninstall pilot@pilot';
const USAGE = 'usage: pilot uninstall [--yes]';

/** The pid of the deck answering at the deck's url, or null when none answers as a deck. */
async function answeringDeck() {
  const probe = await probeDeck(deckUrl());
  return probe.state === 'deck' ? probe.pid : null;
}

/** Stop `pid` only once the process table shows it as node running a pilot checkout's `deck/daemon.mjs` (L4). */
function stopDeckProcess(pid) {
  const row = processTable().find((p) => p.pid === pid);
  if (!row || !isDeckDaemon(row)) {
    throw new Error(`pid ${pid} is not running deck/daemon.mjs; it has been left alone`);
  }
  process.kill(pid);
}

// Each planner returns the steps for one thing install wrote: stop, remove or leave.
const PLANNERS = [
  async ({ deckPid }) => {
    const pid = await deckPid();
    return pid ? [{ what: 'the deck', path: deckUrl(), action: 'stop', why: `pid ${pid}`, pid }] : [];
  },
  ({ home, prefix }) => {
    const { removed, left } = removeCommand({ home, prefix, dryRun: true });
    return [
      ...(removed.length ? [{
        what: 'the pilot command and its launcher',
        path: removed.join(', '),
        action: 'remove',
        run: (deps) => {
          // Only a planned path still standing is a failure; a foreign pilot is already a leave step of its own.
          const done = deps.removeCommand({ home, prefix });
          const missed = removed.filter((p) => !done.removed.includes(p));
          return missed.length ? `could not remove ${missed.join(', ')}: ${done.left || 'it is still there'}` : `removed ${done.removed.join(', ')}`;
        },
      }] : []),
      ...(left ? [{ what: 'a pilot command', path: prefix, action: 'leave', why: left }] : []),
    ];
  },
  // On a Mac the block may be in .bashrc (an install before L5) or any login file (one created since shadows it).
  ({ home, platform }) =>
    [
      ...['bash', 'zsh', 'fish'].map((shell) => profileFor(shell, home, 'linux')),
      ...(platform === 'darwin' ? BASH_LOGIN.map((name) => path.join(home, name)) : []),
    ].flatMap((file) => {
      try {
        if (!removeProfileBlock(file, { dryRun: true })) return [];
        const what = 'the pilot PATH block';
        return [{
          what,
          path: file,
          action: 'remove',
          run: (deps) => (deps.removeProfileBlock(file) ? `removed ${what} from ${file}` : `could not remove ${what}: it is no longer in ${file}`),
        }];
      } catch (err) {
        return [{ what: 'a shell profile', path: file, action: 'leave', why: `it could not be read (${err.code || err.message}); look for a pilot block yourself` }];
      }
    }),
  ({ home }) => {
    const file = defaultSettingsPath(home);
    try {
      const { removed, left } = removeOwnSettings({ home, dryRun: true });
      return [
        ...(removed.length ? [{
          what: "pilot's settings",
          path: file,
          action: 'remove',
          why: removed.join(', '),
          run: (deps) => `removed ${deps.removeOwnSettings({ home }).removed.join(', ') || 'nothing (it had already gone)'} from ${file}`,
        }] : []),
        ...(left.length ? [{ what: 'the default-branch ask and WebFetch rules', path: file, action: 'leave', why: `they guard your sessions whatever wrote them; remove them yourself if you no longer want them: ${left.join(', ')}` }] : []),
      ];
    } catch (err) {
      return [{ what: 'settings.json', path: file, action: 'leave', why: `nothing was planned for it: ${err.message}` }];
    }
  },
  ({ home }) => {
    const target = defaultRulesTarget(home);
    try {
      // The rules root is the reach's below `everything`: emptied, it goes up to rules-root itself.
      const root = rootRules({ home });
      const climb = () => {
        for (const dir of [root, path.dirname(root), path.dirname(path.dirname(root))]) {
          try {
            fs.rmdirSync(dir); // refuses a non-empty one
          } catch {
            return;
          }
        }
      };
      const place = (dir, name, after = () => {}) => {
        const { removed, kept } = removeShippedRules({ target: dir, home, dryRun: true });
        return [
          ...(removed.length ? [{
            what: `pilot's unedited rules${name}`,
            path: dir,
            action: 'remove',
            why: `${removed.length} file(s) as pilot shipped them`,
            run: (deps) => {
              const done = deps.removeShippedRules({ target: dir, home });
              after();
              return `removed ${done.removed.length} unedited rule file(s) from ${dir}`;
            },
          }] : []),
          ...(kept.length ? [{ what: `your edited rules${name}`, path: dir, action: 'leave', why: `they differ from every copy pilot shipped: ${kept.join(', ')}` }] : []),
        ];
      };
      return [...place(target, ''), ...place(root, ' in its rules root', climb)];
    } catch (err) {
      return [{ what: 'the rules directory', path: target, action: 'leave', why: `nothing was planned for it: ${err.code || err.message}` }];
    }
  },
  ({ home, platform, prefix, store }) => {
    const excerpt = path.join(home, '.claude', 'CLAUDE.md');
    return [
      fs.existsSync(store) && { what: 'the store', path: store, why: 'your runs and items; delete it by hand when you no longer want them' },
      fs.existsSync(path.join(store, 'audits')) && { what: 'the audits', path: path.join(store, 'audits'), why: 'saved audit reports, inside the store' },
      platform === 'win32' && {
        what: 'the Windows PATH entry',
        path: prefix,
        why: "pilot cannot tell its entry from yours; remove it from your user PATH if nothing else of npm's needs it",
      },
      fs.existsSync(excerpt) && { what: 'the CLAUDE.md excerpt', path: excerpt, why: 'added by hand with no marker; delete its section yourself if you added it' },
    ]
      .filter(Boolean)
      .map((step) => ({ ...step, action: 'leave' }));
  },
];

/** What `pilot uninstall --yes` would do for `home`, in order: stops, then removals, then what stays. */
export async function planUninstall(home, deps = {}) {
  const context = {
    home,
    prefix: deps.prefix || globalPrefix(),
    platform: deps.platform || hostPlatform(),
    deckPid: deps.deckPid || answeringDeck,
    // The store the deck uses, as `storeDir()` reads it: PILOT_DECK_DIR when set, else the one under `home`.
    store: deps.storeDir || (process.env.PILOT_DECK_DIR ? path.resolve(process.env.PILOT_DECK_DIR) : path.join(home, '.claude', 'pilot')),
  };
  const steps = [];
  for (const planner of PLANNERS) steps.push(...(await planner(context)));
  const order = { stop: 0, remove: 1, leave: 2 };
  return steps.sort((a, b) => order[a.action] - order[b.action]);
}

/** Carry out `steps`, one line per step; a step that fails is a `could not` line, never a throw. */
export function applyPlan(steps, deps = {}) {
  const using = { stopDeck: stopDeckProcess, removeCommand, removeProfileBlock, removeOwnSettings, removeShippedRules, ...deps };
  return steps.map((step) => {
    if (step.action === 'leave') return `left ${step.what} ${step.path}: ${step.why}`;
    try {
      if (step.action === 'stop') {
        using.stopDeck(step.pid);
        return `stopped ${step.what} at ${step.path} (${step.why})`;
      }
      return step.run(using);
    } catch (err) {
      return `could not ${step.action} ${step.what}: ${err.message}`;
    }
  });
}

const planLine = (step) => `  ${step.action.padEnd(6)} ${step.what}  ${step.path}${step.why ? `  (${step.why})` : ''}`;

/** `pilot uninstall [--yes]`: exit 0 with the plan or a clean run, 1 on usage or a step that could not be done. */
export async function main(argv, deps = {}) {
  const { log = console.log, error = console.error, home = os.homedir(), ...planDeps } = deps;
  if (argv.length > 1 || (argv.length === 1 && argv[0] !== '--yes')) {
    error(USAGE);
    return 1;
  }
  let steps;
  try {
    steps = await planUninstall(home, planDeps);
  } catch (err) {
    error(`pilot uninstall: ${err.message}`);
    return 1;
  }
  if (!argv.length) {
    log('pilot uninstall --yes would:');
    for (const step of steps) log(planLine(step));
    log('Nothing has been changed. Run pilot uninstall --yes to do it.');
    log(LAST);
    return 0;
  }
  const lines = applyPlan(steps, planDeps);
  for (const line of lines) log(line);
  log(LAST);
  return lines.some((line) => line.startsWith('could not')) ? 1 : 0;
}
