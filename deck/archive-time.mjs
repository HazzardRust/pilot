/**
 * The archive's one time format (archive-page L6): the server writes every display string, so a row's local
 * time is decided here, for every kind and the view alike. Its own module, since a kind module imported by
 * `archive.mjs` cannot import back from it.
 */

const pad = (n) => String(n).padStart(2, '0');

/** `iso` as a local date and time, `YYYY-MM-DD HH:MM`; '' for a stamp that does not read as a date. */
export function localStamp(iso) {
  const at = new Date(iso);
  if (typeof iso !== 'string' || Number.isNaN(at.getTime())) return '';
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}
