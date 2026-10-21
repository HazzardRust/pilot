/**
 * Whether a closing report asks the user anything (report-record spec 4, L4, A1, ADR 0148): a report is
 * the run's record, so anything that needs the user is its own thread. Pure: the body and the steps in,
 * the gaps out, so `postItem` refuses before it reads the store; `addPilotMessage` reads the same gaps
 * over the pilot's reply on a record (A3). "Reply here" is not an ask: the pilot announces its own
 * worktrees reply with "I reply here".
 */

// Code spans and quoted text are what the line shows, not what it asks: stripped before either test.
// Each opener is its own closer, so the scan stays linear; a curly pair (“ ”) would go quadratic on a
// line of unclosed openers, so it is left out.
const QUOTED = /`[^`\n]*`|"[^"\n]*"/g;
const ASK_PHRASE = /\b(say so|tell me|let me know)\b/i;

/** Whether one line asks: its last character outside code spans and quotes is `?`, or it carries an ask phrase. */
function asks(line) {
  const said = line.replace(QUOTED, ' ').trimEnd();
  return said.endsWith('?') || ASK_PHRASE.test(said);
}

/** The lines of a report that ask, each worded as the refusal names it (`the <part> asks`); [] when nothing asks. */
export function reportAskGaps(body, screens = [], part = 'body') {
  const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(asks);
  return [
    ...lines.map((line) => `the ${part} asks: ${line}`),
    ...screens.flatMap((step, index) => (asks(step) ? [`step ${index + 1} asks: ${step.trim()}`] : [])),
  ];
}
