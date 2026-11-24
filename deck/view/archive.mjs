/**
 * The archive region (archive-page L6, L11): on `screen=archive` every archive row, in `daySections`' sections
 * (L2), with each kind's count; on every other screen `{}`, so no other screen reads the archive. The rows are
 * `archiveRows`' own, read off disk and never through the view's `readDeck` (L3).
 */
import { archiveKinds, archiveRows } from '../archive.mjs';
import { localStamp } from '../archive-time.mjs';
import { daySections } from '../ui/render-pages.mjs';

export function archiveView(query = {}, now = Date.now()) {
  if (query.screen !== 'archive') return {};
  const rows = archiveRows();
  const kinds = archiveKinds().map(({ kind, label }) => ({ kind, label, count: rows.filter((row) => row.kind === kind).length }));
  // `daySections` reads a thread's time off `lastSaidAt`, which is `postedAt` for an item with no replies.
  const days = daySections(rows.map((row) => ({ postedAt: row.at, row })), now).map(({ key, label, open, items }) => ({
    key,
    heading: label,
    open,
    rows: items.map(({ row }) => ({ ...row, when: localStamp(row.at).slice(11) })),
  }));
  return { kinds, days };
}

export default ({ query }) => archiveView(query);
