/**
 * Which plugin root a client spawns the deck daemon from, and that root's version
 * (deck-spawn-root spec 1-5; L2-L4, ADR 0165). The one place the rule is decided.
 *
 * The deck on DECK_PORT is the machine's one shared deck, so it runs the installed
 * plugin, never a working copy: a client whose own root is a checkout (it holds `.git`,
 * a directory in a clone and a file in a worktree) asks `lookup` where the installed
 * plugin is. An installed copy has no `.git` and spawns its own root without asking
 * `claude`. Any other port is a test's or a scratch deck's, and keeps its own checkout.
 *
 * Fail closed (L3): a checkout on DECK_PORT whose lookup fails throws, and never answers
 * its own root, because that fallback is the incident this module exists to prevent.
 *
 * `fromRoot` (`pilot deck --from <dir>`) is the one opt-in to another root, on any port: it
 * answers that dir, resolved absolute, once it holds the daemon and its dependency.
 */

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { pluginRoot } from '../bin/launcher.mjs';
import { DECK_PORT } from './tools.mjs';
import { isVersion } from './version.mjs';

/** Whether `root` is a working copy rather than an installed plugin. */
export const isCheckout = (root) => fs.existsSync(path.join(root, '.git'));

/** `root`'s package.json version, which must be x.y.z, since `isOlder` compares it. */
function versionOf(root) {
  const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (!isVersion(version)) throw new Error(`${root}/package.json names no x.y.z version`);
  return version;
}

/** The dependency the daemon cannot start without; resolved from `root` as the daemon would resolve it. */
const DECK_DEP = '@modelcontextprotocol/sdk';

/** `pilot deck --from <dir>` (spec 6, L5): `from` made absolute, refused up front naming what it lacks. */
export function fromRoot(from) {
  const root = path.resolve(from);
  if (!fs.existsSync(path.join(root, 'deck', 'daemon.mjs'))) throw new Error(`${root} has no deck/daemon.mjs`);
  try {
    createRequire(path.join(root, 'package.json')).resolve(`${DECK_DEP}/server/index.js`);
  } catch {
    throw new Error(`${DECK_DEP} does not resolve from ${root}: run npm ci there`);
  }
  return { root, version: versionOf(root) };
}

/** The root to spawn `deck/daemon.mjs` from and its package.json version; throws naming why. */
export function spawnRoot({ ownRoot, port, lookup = pluginRoot }) {
  if (port !== DECK_PORT || !isCheckout(ownRoot)) return { root: ownRoot, version: versionOf(ownRoot) };
  try {
    // Resolved once, so the version read here and the daemon spawned from the home directory are one root.
    const root = path.resolve(lookup());
    return { root, version: versionOf(root) };
  } catch (err) {
    throw new Error(
      `no deck from the checkout ${ownRoot}: port ${DECK_PORT} runs only the installed plugin, or start one with ` +
        `pilot deck --from <dir>. The installed plugin could not be found: ${err?.message ?? err}`,
    );
  }
}
