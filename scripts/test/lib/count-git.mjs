/**
 * `countGit(fn)`: the git processes this process starts while `fn` runs (land-batching S1), as
 * `{ value, git }`; an async `fn` answers a promise of the same, counted until it settles. Sync spawns
 * (execFileSync, spawnSync) are seen at the native `spawn_sync` binding they all pass through, async
 * ones on the `child_process` diagnostics channel, the two paths `scripts/count-spawns.mjs` counts.
 * Test-only: a git a child process starts (a test command, a hook) is not this process's.
 */

import dc from 'node:diagnostics_channel';
import path from 'node:path';

const isGit = (file) => path.win32.basename(String(file ?? '')).toLowerCase().replace(/\.exe$/, '') === 'git';

/** The open counts: each holds a `sync` tally and the async children started while it is open. */
const open = new Set();

const INSTALLED = Symbol.for('pilot.countGit');
if (!globalThis[INSTALLED]) {
  globalThis[INSTALLED] = true;
  // The channel fires before `spawnfile` is set, so each child is kept and named when the count closes.
  dc.subscribe('child_process', ({ process: child }) => {
    for (const count of open) count.children.push(child);
  });
  // DEP0111 is documentation-only; this binding is the one sync spawns go through.
  const binding = process.binding('spawn_sync');
  const spawn = binding.spawn;
  binding.spawn = function countedGit(options) {
    if (isGit(options?.file)) for (const count of open) count.sync++;
    return spawn.apply(this, arguments);
  };
}

export function countGit(fn) {
  const count = { sync: 0, children: [] };
  const close = (value) => {
    open.delete(count);
    return { value, git: count.sync + count.children.filter((child) => isGit(child.spawnfile)).length };
  };
  open.add(count);
  let value;
  try {
    value = fn();
  } catch (err) {
    open.delete(count);
    throw err;
  }
  if (typeof value?.then !== 'function') return close(value);
  return value.then(close, (err) => {
    open.delete(count);
    throw err;
  });
}
