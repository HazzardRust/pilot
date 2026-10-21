/*
 * Create's own confirm step (independence spec 1, A1 of handoff-failed-confirm):
 * a first step, then a confirm step `render.mjs` already
 * draws, then one POST. Nothing leaves the page before the confirm step's own
 * button. A press is a submit, so with no script one press posts, as every
 * confirm on the deck degrades; with the script, that first press shows the
 * confirm step in place instead. Cancel resets the form, hides the confirm
 * step and puts the form away — clearing a typed name or a ticked box alike,
 * so a reopened confirm starts from the safe default (A3) rather than what
 * was left standing. No `prompt()` or `confirm()`: every step is markup this
 * file only shows and hides.
 *
 * Create has something to validate and carry across the step: a `name` field,
 * copied into `.named` once it is valid. That typed name is why it keeps this
 * step rather than the confirm in place below, which a stray click reverts (A1).
 *
 * A confirm in place (handoff-failed-confirm L1) has no Cancel and no form of
 * its own: a submit button marked `data-confirm` is the trigger, its first
 * press blanks its `[data-confirm-row]` to that row's `.step.sure`, and the
 * Confirm there posts what the trigger would have. Any press but Confirm, or
 * Escape, puts the row back, with nothing reset, so a reply typed beside a
 * trigger survives. Continue, Handoff failed, the sign-offs, Close, dismissing a
 * run, Remove, Start and End all stand on it. Its submit
 * listener is a capturing one, so the first press is prevented before
 * `reply.mjs` sees it, whichever was installed first (L4).
 *
 * `install(env)` reads the page's globals off `env` and nothing else (L11).
 */

export function install(env) {
  var document = env.document;

  // The trigger whose confirm row is confirming, if any: exactly one at a time.
  var taken = null;

  var rowOf = function (trigger) {
    return trigger.closest('[data-confirm-row]');
  };

  var confirming = function (row, on) {
    row.querySelector('.step.sure').hidden = !on;
    row.toggleAttribute('data-confirming', on);
  };

  var revert = function () {
    var trigger = taken;
    taken = null;
    // The deck may have redrawn the row under it, which puts the row back on its own.
    if (!trigger.isConnected) return;
    confirming(rowOf(trigger), false);
    trigger.focus();
  };

  var show = function (form, on) {
    form.querySelector('.step.name').hidden = on;
    form.querySelector('.step.sure').hidden = !on;
  };

  var next = function (form) {
    var name = form.elements && form.elements.name;
    if (name) {
      if (!name.reportValidity()) return;
      var named = form.querySelector('.named');
      if (named) named.textContent = name.value.trim();
    }
    show(form, true);
    form.querySelector('.step.sure [type="submit"]').focus();
  };

  document.addEventListener('click', function (event) {
    if (!event.target || !event.target.closest) return;
    if (taken && (!taken.isConnected || event.target.closest('.step.sure [type="submit"]') !== rowOf(taken).querySelector('.step.sure [type="submit"]'))) {
      revert();
    }
    var form = event.target.closest('form.confirm');
    if (!form || !event.target.closest('.cancel')) return;
    form.reset();
    show(form, false);
    form.closest('details').open = false;
  });

  // Capturing and prevented, so a thread page's Esc (`escape.mjs`) puts the row back without leaving the thread.
  document.addEventListener('keydown', function (event) {
    if (!taken || event.key !== 'Escape') return;
    event.preventDefault();
    revert();
  }, true);

  document.addEventListener('submit', function (event) {
    var trigger = event.submitter;
    var row = trigger && trigger.matches && trigger.matches('[data-confirm]') ? rowOf(trigger) : null;
    if (!row) return;
    event.preventDefault();
    taken = trigger;
    confirming(row, true);
    row.querySelector('.step.sure [type="submit"]').focus();
  }, true);

  // Capturing too, so Create's Next is called off before `inplace.mjs` would fetch it (handoff-failed-confirm S6).
  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form || !form.matches || !form.matches('form.confirm')) return;
    var sure = form.querySelector('.step.sure');
    if (!sure || !sure.hidden) return;
    event.preventDefault();
    next(form);
  }, true);
}
