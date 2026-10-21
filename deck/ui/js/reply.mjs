/*
 * An option is a reply sent in place, not a page thrown away (spec 18). A
 * verdict's confirm is `confirm.mjs`'s (handoff-failed-confirm L1). Moved out of
 * `legacy.mjs` (S6 of deferred-ledger, ADR 0030, L12); `install(env, settle)`
 * reads the page's globals off `env` and nothing else (L11). `settle` is
 * `live.mjs`'s: a reply the deck took lets go of the focus and takes whatever
 * the swap skipped. It hands back `resent`, which `live.mjs` runs on every
 * page it fetches so that an answer already sent stays marked.
 */

import { forEach } from './dom.mjs';

export function install(env, settle) {
  var document = env.document;
  var fetch = env.fetch;
  var URLSearchParams = env.URLSearchParams;

  /**
   * The reply form a card and a thread page both answer through. Built when it
   * is asked for rather than held in a constant: `REPLY` is declared further
   * down with the press it belongs to, so a constant here would be assembled
   * before it had a value.
   */
  var answerForm = function () {
    return 'form[action="' + REPLY + '"], form[action="' + DISMISS_ITEM + '"]';
  };

  /**
   * What this browser has answered: the option that went out, under the id of
   * the item it went out on. An answer is not a thing the server can render —
   * every option stays pressable there, for the browser running no script at
   * all (A3) — so which one was taken is the client's to remember, the way a
   * fold and a dropped line are.
   *
   * Without a prototype, because the key is an id read off the page: an item
   * called `__proto__` would otherwise reach the legacy accessor instead of
   * making a key, and the answer would go quietly missing.
   */
  var answered = Object.create(null);

  /** The option that went out on `id`, or nothing if this browser sent none. */
  var answerOn = function (id) {
    return Object.prototype.hasOwnProperty.call(answered, id) ? answered[id] : null;
  };

  /**
   * A row saying one of its answers has gone: that one marked, and none of them
   * pressable, which is the same fact said in the way a row of buttons says it.
   * Written here and nowhere else, so the mark a press leaves and the mark a
   * swap puts back cannot come to mean different things.
   */
  var markTaken = function (row, value) {
    forEach(row.querySelectorAll('button'), function (button) {
      if (button.value === value) button.classList.add('sent');
      button.disabled = true;
    });
  };

  /**
   * An answer already sent, put back on each fetched page before the two are
   * compared — the third of these after `refold` and `redrop`, and for the same
   * reason (spec 18). The change that wipes this mark is the *sending of the
   * answer itself*: the deck announces it, the page goes and reads a card whose
   * options are all pressable again, and without this the user is shown a
   * question they have already answered and can answer a second time.
   */
  var resent = function (fresh) {
    forEach(fresh.querySelectorAll(answerForm()), function (form) {
      var named = form.querySelector('input[name="id"]');
      var row = form.querySelector('.choices');
      if (!named || !row) return;
      var value = answerOn(named.value);
      if (value === null) return;
      markTaken(row, value);
    });
  };

  /** The deck's own reply route, exactly as `render.mjs` writes it on a form. */
  var REPLY = '/reply';

  /**
   * And the route a card's Dismiss posts to (spec 27, amended at Gate 2): the
   * same one the thread page's own Dismiss has always used. It is named here
   * because a card's Dismiss is answered in one click exactly as an option is —
   * sent without navigating, marked at once, and the mark put back after the
   * swap that sending it announces (spec 18). The route reads only the id, so
   * the `choice` field that carries the mark is inert to it.
   */
  var DISMISS_ITEM = '/dismiss-item';

  /**
   * The press, posted the way a browser with no script would have posted it:
   * the option as a hidden field of the form's own, because `form.submit()`
   * carries no submitter. Only ever reached when the fetch could not deliver —
   * a reply that disappears without a word is worse than a page that scrolls.
   */
  var resend = function (form, pressed) {
    var field = document.createElement('input');
    field.type = 'hidden';
    field.name = pressed.name;
    field.value = pressed.value;
    form.appendChild(field);
    form.submit();
  };

  /**
   * The press, answered before the deck has answered it (spec 18). A reply
   * sent over `fetch` leaves the page exactly as it was, which is the point of
   * sending it that way — and also means nothing on screen moves between the
   * click and the deck's change arriving, so the user is left wondering
   * whether the click landed at all. So the option that was pressed says it
   * was sent, and its row stops taking presses: the second half is the same
   * fact said in the way a row of buttons says it, and it keeps a second
   * answer from going out on top of the first while that one is in flight.
   * Keeps, not guarantees: the row is markup like any other, and a change
   * arriving after the user has clicked away — which is what lets `apply`
   * replace the region at all — redraws the card with its answers back. That
   * The mark outlives the redraw, which it did not always. The card is a live
   * region and the change the deck announces redraws it (D1) — and the change
   * announced here is the answer's own, arriving a moment after the press, so
   * "for as long as the card stands" was very nearly no time at all: the user
   * was shown a question they had just answered, and could answer it again
   * with a different option. So the answer is remembered and `resent` puts it
   * back on every page fetched from here on, beside the fold and the dropped
   * line. The mark itself is still drawn by `deck.css` and written nowhere
   * else, and a refusal posts the form for real over the top of it.
   */
  var taken = function (pressed) {
    pressed.classList.add('sent');
    var row = pressed.closest('.choices');
    if (!row) return;
    markTaken(row, pressed.value);
  };

  /**
   * A one-click answer — a question's option, "Teach me", "Walkthrough
   * complete" — sent from where it was pressed, with no navigation at all.
   *
   * The card's form has always posted and taken a 303 back to the page it was
   * pressed on (D7), and a 303 is still a page load: the browser drops the
   * scroll and puts the user back at the top of a queue they had scrolled down.
   * "whenever i press one of the preselected options for a thread from the
   * deck, it jumps me back to the top of the page" — the walkthrough of
   * 2026-09-19. The reply goes over `fetch` instead, and the change the deck
   * announces redraws the card's bar and its thread through the same path every
   * other change takes (D1). Nothing here draws anything itself.
   *
   * Only an option press. A reply typed into the box is `inplace.mjs`'s, as
   * every other `data-in-place` press is (handoff-failed-confirm L8). And a
   * browser running no script at all still posts both, unchanged: this is the
   * enhancement over a page that already worked (A3).
   */
  document.addEventListener('submit', function (event) {
    var form = event.target;
    var pressed = event.submitter;
    var action = form ? form.getAttribute('action') : null;
    // A trigger's first press is `confirm.mjs`'s, which has already called it off (L4).
    if (event.defaultPrevented || (action !== REPLY && action !== DISMISS_ITEM)) return;
    if (!pressed || pressed.name !== 'choice') return;
    event.preventDefault();
    taken(pressed);
    // Remembered under the item's own id, so the swap this send is about to
    // announce puts the mark back rather than the question (spec 18).
    var named = form.querySelector('input[name="id"]');
    if (named) answered[named.value] = pressed.value;

    // Every field the form would have sent, and the button that was pressed.
    // A user who picked an option *and* typed something meant both, and the
    // deck joins the two (`replyFrom` in `server.mjs`).
    var body = new URLSearchParams();
    forEach(form.querySelectorAll('input[name], textarea[name]'), function (field) {
      body.append(field.name, field.value);
    });
    body.append(pressed.name, pressed.value);

    fetch(form.getAttribute('action'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      // The 303 is the deck telling a browser where to go next, and this is not
      // a browser going anywhere. Left unfollowed, it is an opaque answer with
      // no status to read — which is what a reply the deck took looks like here.
      redirect: 'manual',
    })
      .then(function (answer) {
        if (answer.type !== 'opaqueredirect' && !answer.ok) return resend(form, pressed);
        // The box has been sent, so it is emptied the way a reloaded page's
        // would have been. Unsent text is what `busy` protects, and text that
        // has been sent would go on protecting a region that is now out of date.
        forEach(form.querySelectorAll('textarea'), function (box) {
          box.value = '';
        });
        // The pressed button still holds the focus, and a region holding the
        // focus is one `apply` skips. Letting it go and then taking whatever was
        // skipped is what moves the bar without the user having to click first.
        pressed.blur();
        settle();
        // The deck has the answer now and draws its own lock from it (`chosenOf`),
        // which lifts when the thread moves on: a lesson the teacher has answered
        // takes its next trial (ADR 0053). So the remembered press is let go too.
        if (named) delete answered[named.value];
      }, function () {
        // Only a fetch that failed is resent: a throw after the deck took the
        // reply would post it twice, so it is left to surface instead.
        resend(form, pressed);
      });
  });

  return { resent: resent };
}
