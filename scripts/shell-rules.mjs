/**
 * The two rules every crew agent with a shell carries, word for word (crew-refusals S2, spec 3, 4;
 * L4): one wording, so a grep and one test prove every definition holds it.
 *
 *   SHELL_RULES             the two sentences
 *   shellAgents(dir)        the definitions in `dir` whose `tools:` line grants Bash or PowerShell
 *   missingShellRules(dir)  one { agent, rule } row for each rule a shell agent lacks
 *
 * A rule counts when it appears with any run of whitespace standing for each space, so a
 * definition may wrap it across lines; any other change to its words leaves it missing.
 */

import fs from 'node:fs';
import path from 'node:path';

import { split, listOf } from './measure-prompt.mjs';

export const SHELL_RULES = Object.freeze([
  'Never write, check out, stash, reset or restore a tracked file in a worktree you did not create; a red-then-green proof runs in a detached throwaway worktree you create and remove.',
  'Stop only a process you started, by its id (`TaskStop` on a background run, or its PID), in a call of its own; never by name or pattern (`pkill -f`, `taskkill /IM`).',
]);

const SHELLS = new Set(['Bash', 'PowerShell']);
const flat = (text) => text.replace(/\s+/g, ' ');

function definitions(dir) {
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.md'))
    .sort()
    .map((file) => ({ agent: file.slice(0, -3), text: fs.readFileSync(path.join(dir, file), 'utf8') }));
}

const hasShell = ({ text }) => listOf(split(text).front, 'tools').some((tool) => SHELLS.has(tool));

export function shellAgents(dir) {
  return definitions(dir).filter(hasShell).map(({ agent }) => agent);
}

export function missingShellRules(dir) {
  const rows = [];
  for (const def of definitions(dir).filter(hasShell)) {
    const body = flat(split(def.text).body);
    for (const rule of SHELL_RULES) if (!body.includes(rule)) rows.push({ agent: def.agent, rule });
  }
  return rows;
}
