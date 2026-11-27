/**
 * The `archiveDetail` region (archive-page L11, A3): on `screen=archive` with an `id`, that row's detail from
 * `archiveDetail`, read off disk and never through the view's `readDeck` (L3); null everywhere else, so no other
 * screen reads the archive and a detail is never `screen=thread`, whose GET clears a notice.
 */
import { archiveDetail } from '../archive-detail.mjs';

export default ({ query }) => (query.screen === 'archive' && typeof query.id === 'string' && query.id ? archiveDetail(query.id) : null);
