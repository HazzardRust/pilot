/**
 * A row's detail (archive-page spec 2, 6, 7; L3, A3): the join of an archived item, its thread, its signed plan
 * and its closing report, read off the store files as `archiveRows` reads them. It never calls `readDeck` or a
 * store writer, so opening a detail changes no stored byte and clears no notice. Every string passes `withheld`.
 */

import { archiveRows, liveDeck, withheld } from './archive.mjs';
import { localStamp } from './archive-time.mjs';
import { KIND_REPORT, messagesOf } from './items.mjs';
import { archivedItems } from './store-archive.mjs';
import { storeDir } from './store-dir.mjs';
import { titled } from './view/thread.mjs';

const who = (message) => (message?.from === 'user' ? 'you' : message?.author ?? message?.from ?? 'pilot');

/** The plan's references as named fields, each only where the plan carries it; the gate1 read as its title. */
function planFields(plan, items) {
  if (plan === null || typeof plan !== 'object') return null;
  const named = [
    ['Artefact', plan.artefact],
    ['Branch', plan.branch],
    ['Commit', plan.sha],
    ['Slices', plan.sliceCount],
    ['Gate 1', typeof plan.gate1 === 'string' ? titled(plan.gate1, items) : undefined],
  ];
  const fields = named
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([label, value]) => ({ label, value: withheld(String(value)) }));
  return fields.length > 0 ? fields : null;
}

/**
 * The archive row with this id joined to its item's replies, plan and closing report; null for an id that is no
 * archive row. The live copy of an item comes first, as the row's does, where a failed archive pass left both.
 */
export function archiveDetail(id, dir = storeDir()) {
  const row = archiveRows(dir).find((each) => each.id === id);
  if (!row) return null;
  const items = [...(liveDeck(dir).items ?? []), ...archivedItems(dir)];
  const item = items.find((each) => each?.id === id);
  const report = items.find((each) => each?.kind === KIND_REPORT && each.ticket === id);
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    fields: row.fields,
    replies: messagesOf(item).map((message) => ({
      who: withheld(String(who(message))),
      at: localStamp(message?.repliedAt),
      body: withheld(titled(message?.text, items)),
    })),
    plan: planFields(item?.plan ?? null, items),
    report: report ? { title: withheld(titled(report.title, items)), body: withheld(titled(report.body, items)) } : null,
  };
}
