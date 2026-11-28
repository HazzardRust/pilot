/**
 * What an imported store keeps of the old machine's work (portable-store S6; spec 8, 11; A3). A landing the source
 * left running or queued cannot be followed here, so it reads `interrupted` naming that host; a settled one is left
 * as it is. Each open run's worktree this machine lacks gets one `git worktree add` line, printed and never run.
 */

import path from 'node:path';

import { hostPlatform, pathKey } from '../hooks/lib/platform.js';

const IN_FLIGHT = new Set(['running', 'queued']);
const isMap = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
// Control characters, and the ones that reorder or break the text around them (bidi marks, line and paragraph separators).
const UNPRINTABLE = [[0x00, 0x1f], [0x7f, 0x9f], [0x200e, 0x200f], [0x2028, 0x2029], [0x202a, 0x202e], [0x2066, 0x2069]];
// A bundle's own strings reach the terminal: none of those characters do.
const printable = (text) => [...String(text)].map((char) => (UNPRINTABLE.some(([from, to]) => char.codePointAt(0) >= from && char.codePointAt(0) <= to) ? '?' : char)).join('');

/**
 * `deck` with each landing still `running` or `queued` set to `interrupted`, its pid dropped and a deck line on its
 * thread saying so; nothing else is changed, and `deck` itself is not.
 */
export function markGone(deck, sourceHost, at) {
  if (!Array.isArray(deck?.items)) return deck;
  const host = typeof sourceHost === 'string' && sourceHost !== '' ? printable(sourceHost).slice(0, 255) : 'the old machine';
  const line = `landing interrupted on ${host}: the store moved to this machine; check your pilot branch on origin`;
  const items = deck.items.map((item) => {
    if (!isMap(item) || !isMap(item.landing) || !IN_FLIGHT.has(item.landing.state)) return item;
    const { pid, ...landing } = item.landing;
    const replies = [...(Array.isArray(item.replies) ? item.replies : []), { from: 'pilot', author: 'deck', text: line, repliedAt: at }];
    return { ...item, landing: { ...landing, state: 'interrupted', at, line }, replies };
  });
  return { ...deck, items };
}

// Every character PowerShell reads as a single quote: the ASCII one and U+2018 to U+201B.
const PS_QUOTES = new RegExp(`['${String.fromCodePoint(0x2018)}-${String.fromCodePoint(0x201b)}]`, 'g');

/**
 * One argument as a shell takes it pasted: a plain token as it is, anything else single-quoted, which neither sh nor
 * PowerShell expands (`$`, a backtick, `\`, `,`, `@`); a quote inside is doubled for PowerShell on win32, every
 * character it reads as one, and written `'\''` for sh elsewhere.
 */
const shellArg = (text, platform) => {
  if (/^[\w+=:./-]+$/.test(text)) return text;
  return platform === 'win32' ? `'${text.replace(PS_QUOTES, '$&$&')}'` : `'${text.replace(/'/g, "'\\''")}'`;
};

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
      lines.push(`git -C ${[row.repo, 'worktree', 'add', worktree, branch].map((arg) => shellArg(printable(arg), hostPlatform())).join(' ')}`);
    }
  }
  return lines;
}
