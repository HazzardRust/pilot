/**
 * `pilot reach <level>` (plain-session S4, L1 L4 L5): store the reach a machine was told to
 * keep, and bring both rules targets and the user's settings to L4's row for it, so one
 * command moves a machine between the three levels and back with no hand edit.
 *
 * Nothing here decides what is ours. The rules ledger decides which rule copies may be
 * replaced or pruned (`installRules`), and the settings merge decides which status line is
 * the pilot's (`installSettings`); an edited rule or a user's own status line is left and named.
 */

import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import atomicWrite from '../hooks/lib/atomic-write.js';
import { defaultRulesTarget, installRules } from './install-rules.mjs';
import { defaultSettingsPath, installSettings, resolvePluginRoot } from './install-settings.mjs';
import { readReach, rootRules, rulesPlan } from './reach.mjs';

const { atomicWriteFileSync, privateDir } = atomicWrite;

const LEVELS = ['nothing', 'rules', 'everything'];
const USAGE = `usage: pilot reach [${LEVELS.join('|')}]`;

/** L5: `{ level, at }`, written whole to a temporary file and then renamed over the old one. */
function storeReach(home, level, at) {
  const file = path.join(home, '.claude', 'pilot', 'reach.json');
  privateDir(path.dirname(file));
  atomicWriteFileSync(file, `${JSON.stringify({ level, at })}\n`);
}

/**
 * Store `level` and apply L4's row for it: `rulesPlan(level).home` into `<home>/.claude/rules`,
 * `.root` into the rules root, and `enabledPlugins` and the pilot's status lines set only at
 * `everything`. Below it the pilot's own status lines are removed and a user's is kept.
 *
 * The level is stored last: an apply that throws part way (a settings file that is not JSON)
 * leaves the old level stored, and the repair hooks bring the rules back to it (L3).
 */
export function applyReach(level, { home = os.homedir(), pluginRoot, now = () => new Date() } = {}) {
  const plan = rulesPlan(level); // an unknown level throws before anything is written
  const rules = {
    home: installRules({ target: defaultRulesTarget(home), only: plan.home }),
    root: installRules({ target: rootRules({ home }), only: plan.root }),
  };
  const settings = installSettings({
    settingsPath: defaultSettingsPath(home),
    pluginRoot,
    enablePlugin: plan.user,
    statusLine: plan.user,
  });
  storeReach(home, level, now().toISOString());
  return { level, rules, settings };
}

/** One line per rules target, then each edited copy left in place, by name. */
function describeRules({ home, root }) {
  return [
    ['~/.claude/rules', home],
    ['rules root', root],
  ].flatMap(([label, report]) => [
    `${label}: ${report.written.length} added, ${report.updated.length} updated, ${report.pruned.length} removed, ` +
      `${report.identical.length} already there.`,
    ...report.differing.filter((item) => item.reason !== 'own').map((item) => `  left, edited: ${item.file}`),
    ...report.failed.map((item) => `  could not change ${item.file}: ${item.error}`),
  ]);
}

/** `pilot reach [level]`. Returns the exit code: 0 done, 1 a write failed, 2 a usage error. */
export function main(argv, { home = os.homedir(), pluginRoot = resolvePluginRoot() } = {}) {
  if (argv.length > 1 || (argv.length === 1 && !LEVELS.includes(argv[0]))) {
    process.stderr.write(`${argv.length === 1 ? `pilot reach: unknown level "${argv[0]}"\n` : ''}${USAGE}\n`);
    return 2;
  }
  if (argv.length === 0) {
    const { level, chosen } = readReach({ home });
    process.stdout.write(
      `reach ${level}${chosen ? '' : ' (not chosen: an install that never chose keeps everything)'}\n` +
        'choices:\n' +
        '  nothing     a plain claude session carries no pilot; pilot run carries all of it\n' +
        '  rules       plain sessions get the language rules only\n' +
        '  everything  every session carries the whole pilot\n',
    );
    return 0;
  }
  let report;
  try {
    report = applyReach(argv[0], { home, pluginRoot });
  } catch (err) {
    process.stderr.write(`pilot reach: ${err.message}\n`);
    return 1;
  }
  const failed = report.rules.home.failed.length + report.rules.root.failed.length;
  process.stdout.write(
    [`reach ${report.level}`, ...describeRules(report.rules), ...report.settings.notes].join('\n') + '\n',
  );
  return failed ? 1 : 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = main(process.argv.slice(2));
}
