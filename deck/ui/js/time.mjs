/*
 * Every time on the page reads as "3 min" rather than as an ISO stamp (spec 7).
 * It is computed here and never on the server, because under D1 the page is
 * not re-rendered on a timer, so a reading rendered there would be right once
 * and then wrong for as long as the page stayed open (D11). This ticks it once
 * a minute instead, which is the smallest unit it says.
 *
 * Moved unchanged out of `legacy.mjs` (S6 of deferred-ledger, ADR 0030, L12).
 * The arithmetic of a reading is exported, because `usage.mjs`'s poll reads
 * its reset times the same way. `install(env)` reads the page's globals off
 * `env` and nothing else (L11), and hands back `stamp`, which a live update
 * runs again after every swap.
 */

import { forEach } from './dom.mjs';

var MINUTE = 60000;
var HOUR = 60 * MINUTE;
var DAY = 24 * HOUR;
var YEAR = 365 * DAY;

/** A count and its unit, pluralised the way English does it: 1 min, 6 mins. */
var many = function (count, unit) {
  return count + ' ' + unit + (count === 1 ? '' : 's');
};

/**
 * A length of time in the words the user asked for: "1 hr", "6 mins". Each
 * unit is the largest that still reads as a number of something, and each is
 * floored, so a length is never read as longer than it is.
 */
var span = function (ms) {
  if (ms < HOUR) return many(Math.floor(ms / MINUTE), 'min');
  if (ms < DAY) return many(Math.floor(ms / HOUR), 'hr');
  if (ms < YEAR) return many(Math.floor(ms / DAY), 'day');
  return many(Math.floor(ms / YEAR), 'yr');
};

/**
 * How long ago a moment was, or how long there is until it — the second being
 * spec 11's reset times, the only stamps on the page that are ahead of it.
 *
 * "ago" on the past ones, at the user's asking on walkthrough #2: a bare
 * "6 mins" beside a title is as easily read as how long something took as how
 * long ago it was. The future ones keep "in", which already says which way
 * they point.
 *
 * Under a minute either way is "now" rather than a count of seconds: the page
 * is a queue of things to answer, not a stopwatch, and a number moving every
 * second in the corner of it is movement nobody asked for. A stamp a few
 * seconds in the future — two clocks, one file — falls in that same branch.
 */
var relative = function (ms) {
  if (ms > -MINUTE && ms < MINUTE) return 'now';
  return ms < 0 ? 'in ' + span(-ms) : span(ms) + ' ago';
};

/**
 * Whether a reset clause belongs on the page at all: a stamp the deck could
 * not give, or one already behind us. A reset that has happened is the state
 * file being old rather than an allowance that resets in the past, and every
 * loop here reads a stamp as a distance from now, so left alone one of them
 * says it out loud — "session 89% resets 5 hrs ago" (the user, walkthrough
 * #2). Both loops ask this — the tick in `install` and the poll in
 * `usage.mjs` — because either can be the one still running: the poll stops
 * when the deck goes away, and the tick does not.
 */
var resetGone = function (at) {
  return isNaN(at) || at <= Date.now();
};

export { relative, resetGone };

export function install(env) {
  var document = env.document;
  var setInterval = env.setInterval;

  // --- every time on the page reads as "3 min" (spec 7, D11) ----------------

  /**
   * Every stamp on the page, read as a distance from now. The ISO text the
   * server rendered is what a page without this script shows, so a stamp this
   * browser cannot parse is left exactly as it was rather than being replaced
   * with a reading of nothing.
   */

  /** A calendar day as this browser writes one: `2026-09-22`, in local time. */
  var dayKey = function (at) {
    var month = at.getMonth() + 1;
    var day = at.getDate();
    return at.getFullYear() + '-' + (month < 10 ? '0' : '') + month + '-' + (day < 10 ? '0' : '') + day;
  };

  /**
   * A day heading on the queue (spec 35), read on this browser's clock: Today,
   * Yesterday, or the date the server already wrote.
   *
   * The comparison is between calendar-day strings and never a parsed instant,
   * because `Date.parse('2026-09-22')` is midnight UTC and reads as the day
   * before in every zone behind it. The server's own words come off the element
   * rather than off the heading's text, so the reading is worked out afresh each
   * minute: one written from the text would say `Yesterday` for ever once
   * midnight had turned yesterday into the day before.
   */
  var nameTheDay = function (time) {
    var key = time.getAttribute('datetime');
    var now = new Date();
    var yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    if (key === dayKey(now)) time.textContent = 'Today';
    else if (key === dayKey(yesterday)) time.textContent = 'Yesterday';
    else time.textContent = time.dataset.calendar;
  };

  var stamp = function () {
    var now = Date.now();
    forEach(document.querySelectorAll('time[datetime]'), function (time) {
      // A day heading is a calendar day and not a moment, so it is read as one
      // and never as a distance — left alone it would say `18 hrs`.
      if (time.dataset && time.dataset.calendar !== undefined) {
        nameTheDay(time);
        return;
      }
      var at = Date.parse(time.getAttribute('datetime'));
      if (isNaN(at)) return;
      var line = time.parentNode;
      if (line && line.dataset && typeof line.dataset.resets === 'string') {
        line.hidden = resetGone(at);
        if (line.hidden) return;
      }
      time.textContent = relative(now - at);
    });
  };

  stamp();
  setInterval(stamp, MINUTE);

  return { stamp: stamp };
}
