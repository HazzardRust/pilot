/**
 * The doctor's auto mode defaults row (classifier-env spec 8), out of `doctor.mjs` so that file stays under the
 * deck's line bar; `checkAll` there calls it with the user settings it already read.
 */
import { defaultSettingsPath } from '../scripts/install-settings.mjs';

/** The autoMode lists whose setting replaces the classifier's defaults unless it keeps `"$defaults"`. */
const AUTO_MODE_LISTS = ['environment', 'allow', 'soft_deny', 'hard_deny'];

/**
 * Fail when the user settings' autoMode sets environment, allow, soft_deny or hard_deny without "$defaults"
 * (classifier-env spec 8). `settings` is the user settings object or null; read-only, and it never runs the reset.
 */
export function autoModeRow({ settings }) {
  const name = 'auto mode defaults';
  if (!settings) return { name, verdict: 'cannot tell', detail: 'the user settings file could not be read as JSON' };
  const block = settings.autoMode ?? {};
  const dropped = AUTO_MODE_LISTS.filter((list) => Array.isArray(block[list]) && !block[list].includes('$defaults'));
  if (!dropped.length) return { name, verdict: 'pass', detail: 'no user autoMode list drops "$defaults"' };
  return {
    name,
    verdict: 'fail',
    detail: `your user autoMode ${dropped.join(', ')} ${dropped.length > 1 ? 'drop' : 'drops'} "$defaults", so the classifier loses its default rules there`,
    steps: [
      `add "$defaults" to each list named in ${defaultSettingsPath()}`,
      'or: claude auto-mode reset (removes your whole autoMode block, custom rules included)',
    ],
  };
}
