/**
 * Where a wizard's or a report's command steps run (walkthrough-surface spec 9, A3): a command
 * step needs its item's `dir`, and a `shell` left out is the daemon's platform default, never the
 * client's, since the daemon runs on the user's machine; the platform is read through the seam.
 */

import path from 'node:path';

import { hostPlatform, isWindows } from '../hooks/lib/platform.js';
import { KIND_REPORT, KIND_WALKTHROUGH } from './items.mjs';
import { DeckRefusal } from './store-core.mjs';
import { stepCommandWord } from './walkthrough-shape.mjs';

/** PowerShell on Windows; elsewhere the login shell's name, `sh` when `SHELL` is unset. */
export function defaultShell(platform = hostPlatform(), env = process.env) {
  if (isWindows(platform)) return 'PowerShell';
  return env.SHELL ? path.posix.basename(env.SHELL) : 'sh';
}

const isCommandStep = (step) => stepCommandWord(step) !== null;

const POWERSHELL_FAMILY = /^(powershell|pwsh|cmd)$/i;
const UNIX_FAMILY = /^(git bash|wsl|bash|zsh|sh)$/i;
const CODE_SPAN = /`([^`\n]+)`/g;
// `&&` is left alone: PowerShell 7 takes it.
const FOREIGN_TO_POWERSHELL = [[/\bgrep\s+-\w*o/, 'grep -o'], [/(?:^|\s)~\//, '~/'], [/(?:^|;\s*|&&\s*)export\s/, 'export']];
const FOREIGN_TO_UNIX = [[/\$env:/, '$env:']];

/** The first token in a step's code spans that is another shell's syntax, or null; other shells are not checked. */
function foreignToken(step, shell) {
  const table = POWERSHELL_FAMILY.test(shell) ? FOREIGN_TO_POWERSHELL : UNIX_FAMILY.test(shell) ? FOREIGN_TO_UNIX : [];
  for (const [, span] of step.matchAll(CODE_SPAN)) {
    for (const [pattern, token] of table) if (pattern.test(span.trim())) return token;
  }
  return null;
}

/** The gaps in where an item's command steps run and in their syntax, each worded as the refusal says it; [] when placed. */
export function stepShellGaps(screens, { shell = defaultShell(), dir } = {}) {
  return screens.flatMap((step, index) => {
    const n = index + 1;
    const gaps = isCommandStep(step) && !dir ? [`step ${n} runs a command: name its directory as dir`] : [];
    const token = foreignToken(step, shell);
    return token === null ? gaps : [...gaps, `step ${n} is not ${shell} syntax: \`${token}\``];
  });
}

/** A walkthrough's or a report's detail with its shell filled when it has a command step; refused on a gap. Other kinds pass through. */
export function placeSteps(kind, detail) {
  if (kind !== KIND_WALKTHROUGH && kind !== KIND_REPORT) return detail;
  const screens = detail.screens ?? [];
  const gaps = stepShellGaps(screens, detail);
  if (gaps.length > 0) throw new DeckRefusal(`a command step names where it runs; ${gaps.join('; ')}`);
  return detail.shell === undefined && screens.some(isCommandStep) ? { ...detail, shell: defaultShell() } : detail;
}
