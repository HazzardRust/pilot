/**
 * `pilot host [<name>] [--local]` (other-host spec 1, L2, L3): no name prints the host in force; a name on
 * `HOST_NAMES` is written as `pilot.host` to the global git config, or with `--local` to the repository's. Any
 * other name is refused, naming the key, before git is called, and the value git is given is the list's own
 * string, never the argument, so nothing off `HOST_NAMES` reaches git's argv (L2). git runs as argv, never a shell.
 */

import { HOST_KEY, HOST_NAMES, hostOf } from '../deck/host.mjs';
import { firstLine, git as gitAt } from './pilot-branch.mjs';

const USAGE = `usage: pilot host [${HOST_NAMES.join('|')}] [--local]`;

/** `pilot host`: exit 0 printed or written, 1 a refused name, an unreadable setting or a failed write, 2 usage. */
export function main(argv, { git = (args) => gitAt(process.cwd(), ...args), log = console.log, error = console.error } = {}) {
  const local = argv.includes('--local');
  const names = argv.filter((arg) => arg !== '--local');
  if (names.length > 1 || names.some((arg) => arg.startsWith('-')) || argv.filter((arg) => arg === '--local').length > 1) {
    error(USAGE);
    return 2;
  }
  try {
    if (!names.length) {
      log(hostOf(git));
      return 0;
    }
    const value = HOST_NAMES.find((name) => name === names[0]);
    if (!value) {
      error(`pilot host: ${HOST_KEY} cannot be ${JSON.stringify(names[0])}: one of ${HOST_NAMES.join(', ')}`);
      return 1;
    }
    git(['config', local ? '--local' : '--global', HOST_KEY, value]);
    log(`${HOST_KEY} ${value} (${local ? 'this repository' : 'global'})`);
    return 0;
  } catch (err) {
    error(`pilot host: ${firstLine(err)}`);
    return 1;
  }
}
