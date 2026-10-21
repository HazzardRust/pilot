/**
 * Every byte of HTML the deck serves is written in this directory's `render-*.mjs` siblings; this file is the
 * facade that keeps the names every importer reads (audit-f1-f7 S18, L9). Explicit re-exports, no `export *`.
 */

export { renderTemplate } from './render-parts.mjs';
export { OVERVIEW_HREF } from './render-cards.mjs';
export { TICKET_MAKING_TITLE } from './render-rail.mjs';
export {
  renderHomePage,
  renderDeckPage,
  renderThreadPage,
  capRefusal,
  daySections,
  RECENT_DAYS,
} from './render-pages.mjs';
