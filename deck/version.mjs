/**
 * The plugin's version, read once from package.json: the one place it is read, so the
 * health route, the MCP server and `pilot status` cannot disagree (daemon-lifecycle spec 3).
 */

import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
export const PLUGIN_VERSION = pkg.version;
/** package.json's `engines.node`, read here with the version so the file is read once. */
export const ENGINES = pkg.engines?.node;

const parts = (version) => /^(\d+)\.(\d+)\.(\d+)$/.exec(version ?? '')?.slice(1).map(Number);

/** Whether `text` is a plain x.y.z version. */
export const isVersion = (text) => typeof text === 'string' && parts(text) !== undefined;

/**
 * Whether version `a` is below `b`, numerically by x.y.z. An absent version counts as
 * older, because every deck before 0.9.3 reports none; so does one that is not x.y.z,
 * since no release of this plugin ever reported such a thing.
 */
export function isOlder(a, b) {
  const left = parts(a);
  const right = parts(b);
  if (!right) throw new Error(`isOlder: ${b} is not a version`);
  if (!left) return true;
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] < right[i];
  }
  return false;
}
