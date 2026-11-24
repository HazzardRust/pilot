/**
 * Classifier refusals as archive rows (archive-page spec 3, 6, 8; S6): one row per logged refusal, read only through
 * `readRefusals`, so a torn line is skipped and no log is no rows. Credentials are withheld by the archive seam
 * (`archive.mjs`), never here: this adapter keeps no filter of its own.
 */

import { readRefusals } from '../classifier-log.mjs';

const text = (value) => (value === undefined || value === null ? '' : String(value));

function rowsOf({ dir }) {
  return readRefusals({ dir }).map((refusal, index) => ({
    kind: 'classifier',
    id: `classifier:${index + 1}`,
    at: refusal.when,
    title: `${refusal.verdict}: ${refusal.tool}`,
    fields: [
      { label: 'Verdict', value: refusal.verdict },
      { label: 'Repo', value: refusal.repo },
      { label: 'Ticket', value: text(refusal.ticket) },
      { label: 'Agent', value: refusal.agent },
      { label: 'Tool', value: refusal.tool },
      { label: 'Command', value: refusal.command },
      { label: 'Reason', value: refusal.reason },
    ],
  }));
}

export default { kind: 'classifier', label: 'Classifier refusals', files: ['classifier.log'], rowsOf };
