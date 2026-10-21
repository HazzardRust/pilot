/**
 * Text from a peer or a caller, made safe to print: control and C1 characters and runs of
 * whitespace become one space, so it cannot add a log line or move a terminal's cursor.
 * `max` caps the length when a line must stay short.
 */
// eslint-disable-next-line no-control-regex
export const oneLine = (text, max = Infinity) => String(text).replace(/[\s\x00-\x1f\x7f-\x9f]+/g, ' ').trim().slice(0, max);
