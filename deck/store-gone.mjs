/**
 * What an imported store keeps of the old machine's work (portable-store S6; spec 8, 11; A3). A landing the source
 * left running or queued cannot be followed here, so it reads `interrupted` naming that host; a settled one is left
 * as it is. Each open run's worktree this machine lacks gets one `git worktree add` line, printed and never run.
 */

import path from 'node:path';

import { hostPlatform, pathKey } from '../hooks/lib/platform.js';

export const IN_FLIGHT = new Set(['running', 'queued']);
const isMap = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
// Control characters, the ones that reorder or break the text around them (bidi marks, line and paragraph separators),
// and the invisible ones (soft hyphen, Arabic letter mark, zero-width space and joiners, word joiner, BOM).
const UNPRINTABLE = [[0x00, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x61c, 0x61c], [0x200b, 0x200f], [0x2028, 0x2029], [0x202a, 0x202e], [0x2060, 0x2060], [0x2066, 0x2069], [0xfeff, 0xfeff]];
// A bundle's own strings reach the terminal: none of those characters do.
export const printable = (text) => [...String(text)].map((char) => (UNPRINTABLE.some(([from, to]) => char.codePointAt(0) >= from && char.codePointAt(0) <= to) ? '?' : char)).join('');

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

// On win32 a `"` splits the argv PowerShell 5.1 hands git, and cmd.exe ignores `'`, so these chain or redirect there.
const CMD_SPECIAL = /["&|<>^%]/;

/** Each worktree a row names with the branch it was on: the feature's (`feat/<slug>` when none is recorded), QA's, each slice's. */
const worktreesOf = (row) => [
  { worktree: row.worktree, branch: row.branch ?? (typeof row.slug === 'string' ? `feat/${row.slug}` : undefined) },
  ...(isMap(row.qa) ? [row.qa] : []),
  ...(Array.isArray(row.slices) ? row.slices.filter(isMap) : []),
];

/**
 * Every absolute worktree an open run names (spec 9, 11): a run row's own, and its repository's newest unfinished
 * record's, never a record no run is open on (an abandoned run's), as `{ repo, worktree, branch }` in deck order,
 * not deduplicated: the feature's, QA's and each slice's.
 */
export function openWorktrees(deck) {
  const runs = (Array.isArray(deck?.runs) ? deck.runs : []).filter((run) => isMap(run) && typeof run.repo === 'string' && run.finished === undefined);
  const records = (Array.isArray(deck?.records) ? deck.records : []).filter((entry) => typeof entry?.repo === 'string' && isMap(entry.record) && entry.record.finished === undefined);
  const newest = [...new Set(runs.map((run) => pathKey(run.repo)))]
    .map((key) => records.findLast((entry) => pathKey(entry.repo) === key))
    .filter(Boolean)
    .map((entry) => ({ ...entry.record, repo: entry.repo }));
  const rows = [...runs, ...newest];
  return rows
    .filter((row) => isMap(row) && row.finished === undefined)
    .flatMap((row) => worktreesOf(row).map(({ worktree, branch }) => ({ repo: row.repo, worktree, branch })))
    .filter(({ worktree }) => typeof worktree === 'string' && path.isAbsolute(worktree));
}

/**
 * One `git -C <repo> worktree add <worktree> <branch>` per open worktree that `exists` says is missing here, once
 * each; one with no repository or branch to name, an argument git would read as an option, or on win32 one
 * CMD_SPECIAL matches, gets none.
 */
export function rebuildLines(deck, exists) {
  const win32 = hostPlatform() === 'win32';
  const seen = new Set();
  const lines = [];
  for (const { repo, worktree, branch } of openWorktrees(deck)) {
    if (typeof repo !== 'string' || repo === '' || typeof branch !== 'string' || branch === '') continue;
    if ([repo, worktree, branch].some((arg) => arg.startsWith('-') || (win32 && CMD_SPECIAL.test(arg))) || seen.has(pathKey(worktree)) || exists(worktree)) continue;
    seen.add(pathKey(worktree));
    lines.push(`git -C ${[repo, 'worktree', 'add', worktree, branch].map((arg) => shellArg(printable(arg), hostPlatform())).join(' ')}`);
  }
  return lines;
}
