/**
 * What an imported store keeps of the old machine's work (portable-store S6; spec 8, 11; A3). A landing the source
 * left running or queued cannot be followed here, so it reads `interrupted` naming that host; a settled one is left
 * as it is. Each open run's worktree this machine lacks gets one `git worktree add` line, printed and never run.
 */

import path from 'node:path';

import { pathKey } from '../hooks/lib/platform.js';

const IN_FLIGHT = new Set(['running', 'queued']);
const isMap = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
// A bundle's own strings reach the terminal: none of their control characters do.
const printable = (text) => String(text).replace(/[\x00-\x1f\x7f-\x9f]/g, '?');

/**
 * `deck` with each landing still `running` or `queued` set to `interrupted`, its pid dropped and a deck line on its
 * thread saying so; nothing else is changed, and `deck` itself is not.
 */
export function markGone(deck, sourceHost, at) {
  if (!Array.isArray(deck?.items)) return deck;
  const line = `landing interrupted on ${printable(sourceHost)}: the store moved to this machine; check your pilot branch on origin`;
  const items = deck.items.map((item) => {
    if (!isMap(item) || !isMap(item.landing) || !IN_FLIGHT.has(item.landing.state)) return item;
    const { pid, ...landing } = item.landing;
    const replies = [...(Array.isArray(item.replies) ? item.replies : []), { from: 'pilot', author: 'deck', text: line, repliedAt: at }];
    return { ...item, landing: { ...landing, state: 'interrupted', at, line }, replies };
  });
  return { ...deck, items };
}

const shellArg = (text) => (/^[\w@%+=:,./\\-]+$/.test(text) ? text : `"${text.replace(/["\\$`]/g, '\\$&')}"`);

/** Each worktree a row names with the branch it was on: the feature's (`feat/<slug>` when none is recorded), QA's, each slice's. */
const worktreesOf = (row) => [
  { worktree: row.worktree, branch: row.branch ?? (typeof row.slug === 'string' ? `feat/${row.slug}` : undefined) },
  ...(isMap(row.qa) ? [row.qa] : []),
  ...(Array.isArray(row.slices) ? row.slices.filter(isMap) : []),
];

/**
 * One `git -C <repo> worktree add <worktree> <branch>` per worktree an open run (a run row, or an unfinished record)
 * names that `exists` says is missing here, once each; one with no repository or branch to name, or an argument git
 * would read as an option, gets none.
 */
export function rebuildLines(deck, exists) {
  const rows = [...(Array.isArray(deck?.runs) ? deck.runs : []), ...(Array.isArray(deck?.records) ? deck.records.map((entry) => isMap(entry?.record) && { ...entry.record, repo: entry.repo }) : [])];
  const seen = new Set();
  const lines = [];
  for (const row of rows) {
    if (!isMap(row) || row.finished !== undefined || typeof row.repo !== 'string') continue;
    for (const { worktree, branch } of worktreesOf(row)) {
      if (typeof worktree !== 'string' || !path.isAbsolute(worktree) || typeof branch !== 'string' || branch === '') continue;
      if ([row.repo, worktree, branch].some((arg) => arg.startsWith('-')) || seen.has(pathKey(worktree)) || exists(worktree)) continue;
      seen.add(pathKey(worktree));
      lines.push(`git -C ${[row.repo, 'worktree', 'add', worktree, branch].map((arg) => shellArg(printable(arg))).join(' ')}`);
    }
  }
  return lines;
}
