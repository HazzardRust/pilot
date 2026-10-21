/*
 * The page's one script tag: `<script type="module" src="/ui/deck.mjs">`, in
 * every page the deck renders (ADR 0030, L10). A module script is deferred, so
 * this runs once the page is parsed, which is where the end-of-body inline
 * script ran.
 *
 * It is the only module that touches `window`: it hands it to `page.mjs`,
 * which installs every region, and then starts the usage readout, whose poll
 * a test of anything else would only have to wait out.
 */

import { install } from './page.mjs';
import { install as installUsage } from './usage.mjs';

install(window);
installUsage(window);

/*
 * A deck serving from a checkout says so on every page (deck-spawn-root spec 8, L7); an
 * installed one shows nothing. The banner sits in the body, outside `<header>` and
 * `<main>`, so a move in place (`live.mjs` swapKind) keeps it. The root goes in as text,
 * never as markup.
 */
window
  .fetch('/api/health')
  .then((response) => response.json())
  .then((health) => {
    if (health.checkout !== true || typeof health.root !== 'string') return;
    var banner = window.document.createElement('p');
    banner.className = 'checkout-banner';
    banner.setAttribute('role', 'status');
    banner.textContent = 'This deck serves from a checkout: ' + health.root;
    window.document.body.insertBefore(banner, window.document.querySelector('header'));
  })
  // No health, no verdict: the page stays as drawn, and `pilot status` is where a dead deck shows.
  .catch(() => {});
