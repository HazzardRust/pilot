/*
 * The usage readout in the header: how full the context window is and how much
 * of the five-hour and weekly limits is gone (spec 11), polled from
 * `/api/usage` and patched in rather than pushed — reasoned in full in
 * `deck/usage.mjs`, the daemon's half (D16).
 *
 * The first region to leave the page's old inline script for a module of its own (S4 of
 * deferred-ledger, ADR 0030), moved unchanged (L12). `install(env)` reads the
 * page's globals off `env` and nothing else (L11): the window in the browser,
 * `aSandbox(...)` in `deck/test/usage.test.mjs`, which imports this file.
 * The arithmetic of a reading is `time.mjs`'s.
 */

import { forEach } from './dom.mjs';
import { relative, resetGone } from './time.mjs';

export function install(env) {
  var document = env.document;
  var fetch = env.fetch;
  var setInterval = env.setInterval;

  var USAGE_EVERY = 30000;

  /**
   * The one reading that belongs to a deck rather than to the account: how full
   * the context window of the session working in *this* deck's directory is
   * (spec 31). The other two are one allowance every session on the machine
   * spends, so they are the same figure on every page.
   */
  var PER_DECK = 'ctx';

  /**
   * Which deck this page is of, as the server worked it out. It is on the
   * readout and not in the address because a thread page has no `?run=` of its
   * own and is still a page of exactly one deck (L32) — and because the server
   * has already resolved which tab the page belongs to, so asking again here
   * would be a second place for that answer to live. A page of no deck, which
   * is the overview, carries no token and has no `ctx` span to fill.
   */
  // The readout is looked up on each poll, never held: a move in place (handoff-failed-confirm S6)
  // can put another page's header, and its readout, on the page.
  var usageUrl = function () {
    var block = document.querySelectorAll('.usage[data-run]')[0];
    return block ? '/api/usage?run=' + encodeURIComponent(block.dataset.run) : '/api/usage';
  };

  /**
   * Which band a reading is in, drawn by `deck.css`. The thresholds and the
   * order are the status line's own — `hooks/context-usage-statusline.js:144`,
   * green below 80, yellow from 80, bold red from 90 and red-backed from 95 —
   * because the user reads both and asked for them to agree: "the same way it
   * turns to red in my console if it reaches past 95%".
   *
   * The four numbers are written out again here rather than imported. A hook is
   * a separate process started by the harness, and this file is a module the
   * page loads from `/ui/`, which serves nothing outside `deck/ui/js/`; there is
   * no module boundary between them to import across, and
   * D16 already re-declares the path it reads for the same reason. This comment
   * is the join: change one and change the other.
   *
   * S11 decided the page would not band these at all, on the grounds that a
   * terminal line has no room to say the number and the page does. The user
   * overruled it at the walkthrough of 2026-09-19.
   */
  var BANDS = [
    [95, 'usage-critical'],
    [90, 'usage-high'],
    [80, 'usage-warm'],
    [0, 'usage-fine'],
  ];

  var bandFor = function (pct) {
    for (var index = 0; index < BANDS.length; index += 1) {
      if (pct >= BANDS[index][0]) return BANDS[index][1];
    }
    return '';
  };

  /**
   * The three numbers, and the two reset lines under them. Only the text of
   * those five things is touched: the readout is rendered once by the server
   * (`render.mjs`) and lives in the header, outside every region a change
   * replaces, so this patches numbers into a page it never rebuilds (D1).
   *
   * A reading the deck could not get reads "unknown" — which is also what it
   * said before the first answer arrived — and its reset line goes away with
   * it, because "resets" with nothing after it reads as a time that was lost
   * rather than one that was never there.
   *
   * The stamp goes on the `<time>` as well as its reading, so the once-a-minute
   * tick in `time.mjs` keeps it moving between polls exactly as it keeps every other
   * time on the page moving (D11).
   */
  var fill = function (usage) {
    forEach(document.querySelectorAll('[data-usage]'), function (figure) {
      var reading = usage[figure.dataset.usage];
      var pct = reading ? reading.pct : null;
      // A deck whose session has not reported has no context window to show, and
      // "unknown" there would read as a figure the deck lost rather than one
      // that was never its to have — so the whole reading goes (spec 31). The
      // account-wide two go on saying "unknown", which is a different thing: the
      // allowance exists and the deck has not been told it.
      if (figure.dataset.usage === PER_DECK) figure.parentNode.hidden = pct === null;
      figure.textContent = pct === null ? 'unknown' : pct + '%';
      // A reading the deck could not get is not a green one: no band at all.
      figure.className = pct === null ? '' : bandFor(pct);
    });
    forEach(document.querySelectorAll('[data-resets]'), function (line) {
      var reading = usage[line.dataset.resets];
      var at = reading && reading.resetsAt ? Date.parse(reading.resetsAt) : NaN;
      // The clause goes when there is no stamp for it, and when the stamp is
      // behind us: `resetGone` in `time.mjs` says why, and the tick asks it too.
      line.hidden = resetGone(at);
      if (line.hidden) return;
      var time = line.querySelector('time');
      time.setAttribute('datetime', reading.resetsAt);
      time.textContent = relative(Date.now() - at);
    });
  };

  /**
   * One ask. A failure leaves the numbers where they are rather than blanking
   * them: the deck going away for a moment, or answering something this cannot
   * read, is not news that the user's allowance is unknown — the last reading
   * is still the last thing the status line said, and the next poll corrects it.
   */
  var askUsage = function () {
    fetch(usageUrl())
      .then(function (answer) {
        return answer.json();
      })
      .then(fill)
      .catch(function () {
        // Kept, not blanked. See above.
      });
  };

  // A page with no readout asks for nothing and sets no timer. Nothing the deck
  // serves is such a page, but a refusal and the daemon's error page are, and
  // neither should start a poll that has nowhere to put its answer.
  if (document.querySelectorAll('[data-usage]').length) {
    askUsage();
    setInterval(askUsage, USAGE_EVERY);
  }
}
