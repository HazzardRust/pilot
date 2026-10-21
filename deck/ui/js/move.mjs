/*
 * A ticket's arrows move it in place (ticket-making spec 7, amended at Gate 2):
 * "every time i rearrange one of the tickets, the page reloads. i want it to feel
 * smoother." The arrow's form still posts `/move` and takes a 303 when there is
 * no script; here the same fields go over `fetch`, and the change the deck
 * announces redraws the tickets panel the way every other change does (D1).
 * `settle` is `live.mjs`'s, as it is for a reply.
 */

import { forEach } from './dom.mjs';

export function install(env, settle) {
  var document = env.document;
  var fetch = env.fetch;
  var URLSearchParams = env.URLSearchParams;

  /** The press posted as a browser with no script would have posted it. */
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

  document.addEventListener('submit', function (event) {
    var form = event.target;
    var pressed = event.submitter;
    var action = form && form.getAttribute('action');
    if (action !== '/move' || !pressed || pressed.name !== 'direction') return;
    event.preventDefault();

    // Every field the form would have sent, `back` included, and the button pressed.
    var body = new URLSearchParams();
    forEach(form.querySelectorAll('input[name], textarea[name]'), function (field) {
      body.append(field.name, field.value);
    });
    if (pressed && pressed.name) body.append(pressed.name, pressed.value);

    fetch(action, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      redirect: 'manual',
    })
      .then(function (answer) {
        if (answer.type !== 'opaqueredirect' && !answer.ok) return resend(form, pressed);
        // Nothing focused holds the panel's redraw back.
        pressed.blur();
        settle();
      })
      .catch(function () {
        resend(form, pressed);
      });
  });
}
