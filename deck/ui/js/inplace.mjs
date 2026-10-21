/*
 * A press posted in place (handoff-failed-confirm S4, spec 8, L2, ADR 0016). A
 * form opts in with `data-in-place` and nothing else: its submit is fetched with
 * its fields instead of navigating, and the change the deck announces redraws
 * the region through `live.mjs`. Nothing here draws the result. Generalised from
 * `reply.mjs`'s option press, which keeps its own path.
 *
 * With no script the form posts as it always has (A3), so every route this
 * reaches already answers a navigation; a 303 is read as taken, unfollowed.
 *
 * A press that changes which page this is (S6: Create, Make tickets, Add deck,
 * Remove) opts in with `data-in-place="move"`: its 303 is followed, the address
 * moves to where it landed and `refresh` (`live.mjs`'s) reads that page in, as
 * `navigate.mjs` does for a tab. Any other press the deck took runs `settle`.
 */

import { forEach } from './dom.mjs';

export function install(env, refresh, settle) {
  var document = env.document;
  var history = env.history;
  var fetch = env.fetch;
  var URLSearchParams = env.URLSearchParams;

  /**
   * The form posted for real, the submitter carried as a hidden field because
   * `form.submit()` sends none: `reply.mjs`'s `resend` rule. Only reached when
   * the fetch could not deliver, so the user reads the deck's reason on its own page.
   */
  var resend = function (form, pressed) {
    if (pressed && pressed.name) {
      var field = document.createElement('input');
      field.type = 'hidden';
      field.name = pressed.name;
      field.value = pressed.value;
      form.appendChild(field);
    }
    form.submit();
  };

  /**
   * Whether a native post would send `field`: never a disabled one or a button
   * (only the submitter goes, appended apart), a box or a radio only ticked.
   */
  var sent = function (field) {
    var type = (field.getAttribute('type') || '').toLowerCase();
    if (field.disabled || !field.name || /^(submit|button|reset|image|file)$/.test(type)) return false;
    return (type !== 'checkbox' && type !== 'radio') || field.checked === true;
  };

  // The forms whose press is on its way. A second submit from one is dropped, not
  // posted: a double press must not ask the deck twice (Start opens two windows).
  var flying = [];
  var land = function (form) {
    var at = flying.indexOf(form);
    if (at !== -1) flying.splice(at, 1);
  };

  document.addEventListener('submit', function (event) {
    var form = event.target;
    // A trigger's first press is `confirm.mjs`'s, which has already called it off (L4).
    if (event.defaultPrevented || !form || form.getAttribute('data-in-place') === null) return;
    event.preventDefault();
    if (flying.indexOf(form) !== -1) return;
    flying.push(form);
    var pressed = event.submitter;

    var body = new URLSearchParams();
    forEach(form.querySelectorAll('input[name], textarea[name], select[name]'), function (field) {
      if (sent(field)) body.append(field.name, field.value);
    });
    if (pressed && pressed.name) body.append(pressed.name, pressed.value);

    // The pressed button holds the focus, and a region holding the focus is one
    // `live.mjs` skips: let go first, so the change this press announces redraws it.
    if (pressed) pressed.blur();
    var move = form.getAttribute('data-in-place') === 'move';

    fetch(form.getAttribute('action'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      // The 303 is where a navigating browser would go next; unfollowed it is an
      // opaque answer with no status, which is what a press the deck took looks like.
      // A move follows it instead, to read where the deck landed it.
      redirect: move ? 'follow' : 'manual',
    }).then(
      function (answer) {
        land(form);
        // A followed redirect is the deck's own word that it took the POST, whatever the page after it answered.
        if (answer.type !== 'opaqueredirect' && !answer.redirected && !answer.ok) return resend(form, pressed);
        if (!move) {
          // A typed reply is sent, so its box empties as a reloaded page's would; `settle` (`live.mjs`'s)
          // takes the redraw the focus held back, drawing the reply above it (handoff-failed-confirm L8).
          forEach(form.querySelectorAll('textarea'), function (box) {
            box.value = '';
          });
          return settle();
        }
        if (answer.redirected) history.pushState(null, '', answer.url);
        refresh();
      },
      // A fetch that never arrived is posted again; a throw after the answer is not. A move's
      // landing dropped after the deck took the POST looks the same here and is posted again
      // too: rarer than a dropped POST, whose loss would say nothing at all.
      function () {
        land(form);
        resend(form, pressed);
      },
    );
  });
}
