/**
 * Where a wizard's or a report's command steps run (walkthrough-surface spec 9, A3): a command
 * step needs its item's `dir`, and a `shell` left out is the daemon's platform default, never the
 * client's, since the daemon runs on the user's machine; the platform is read through the seam.
 */

import path from 'node:path';

import { hostPlatform, isWindows } from '../hooks/lib/platform.js';
import { KIND_REPORT, KIND_WALKTHROUGH, stepParts } from './items.mjs';
import { DeckRefusal } from './store-core.mjs';
import { commandWord } from './walkthrough-shape.mjs';

/** PowerShell on Windows; elsewhere the login shell's name, `sh` when `SHELL` is unset. */
export function defaultShell(platform = hostPlatform(), env = process.env) {
  if (isWindows(platform)) return 'PowerShell';
  return env.SHELL ? path.posix.basename(env.SHELL) : 'sh';
}

/** Whether a step is a command, by the rule QA's refusal and the prefix line use. */
function isCommandStep(step) {
  const { instruction, result } = stepParts(step);
  return (commandWord(instruction, true) ?? commandWord(result ?? '', false)) !== null;
}

/** The gaps in where an item's command steps run, each worded as the refusal says it; [] when placed. */
export function stepShellGaps(screens, { dir } = {}) {
  if (dir) return [];
  return screens.flatMap((step, index) => (isCommandStep(step) ? [`step ${index + 1} runs a command: name its directory as dir`] : []));
}

/** A walkthrough's or a report's detail with its shell filled when it has a command step; refused on a gap. Other kinds pass through. */
export function placeSteps(kind, detail) {
  if (kind !== KIND_WALKTHROUGH && kind !== KIND_REPORT) return detail;
  const screens = detail.screens ?? [];
  const gaps = stepShellGaps(screens, detail);
  if (gaps.length > 0) throw new DeckRefusal(`a command step names where it runs; ${gaps.join('; ')}`);
  return detail.shell === undefined && screens.some(isCommandStep) ? { ...detail, shell: defaultShell() } : detail;
}
