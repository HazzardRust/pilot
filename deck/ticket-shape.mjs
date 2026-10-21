/**
 * Whether a ticket's body is in ticket-making's shape (crew-voice-rules spec 14, L12): the
 * user's words quoted, numbered spec lines each with its evidence in italics, and the
 * thread id. Pure: one body in, the gaps out, so `postItem` refuses before it reads the store.
 */

const ARTEFACT = /docs\/design\/[^\s/]+\/architecture\.md/;
const AUDIT_REPORT = /[\\/]audits[\\/][\w-]+[\\/]\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z\.json/;
const QUOTE = /^ {0,3}>\s*\S/m;
const SPEC_LINE = /^ {0,3}(\d{1,3})[.)]\s+(.*)$/;
const ITALIC = /(?<![*\w])\*(?![\s*])[^*\n]+?(?<!\s)\*(?!\*)/;
const THREAD_ID = /\bitm_[0-9a-f]{12}\b/;

/**
 * The gaps in `body`, each named as the refusal says it; `[]` when it is shaped. A body
 * naming an approved `docs/design/<slug>/architecture.md` is a run-split ticket and passes
 * whole (A8): its artefact carries the spec. So does an audit pick naming the saved report its
 * spec came from, which `pilot audit spec` appends.
 */
export function ticketShapeGaps(body) {
  if (ARTEFACT.test(body) || AUDIT_REPORT.test(body)) return [];
  const gaps = [];
  if (!QUOTE.test(body)) gaps.push("the user's words quoted (a > line)");
  const specLines = body
    .split(/\r?\n/)
    .map((line) => SPEC_LINE.exec(line))
    .filter(Boolean);
  if (specLines.length === 0) gaps.push('numbered spec lines');
  for (const [, number, text] of specLines) {
    if (!ITALIC.test(text)) gaps.push(`evidence in italics on line ${number}`);
  }
  if (!THREAD_ID.test(body)) gaps.push('the thread id (itm_…)');
  return gaps;
}
