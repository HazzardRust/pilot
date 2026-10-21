/*
 * A hovered slice of the graph names itself in a small box on a layer over the
 * page (the user at Gate 2, 2026-10-09: "their own mini boxes that overlay"),
 * so the graph keeps the panel's whole width for its lanes. The name is the
 * row's own label (`renderDot`), read on hover; the handler sits on the
 * document because a live update replaces the panel's content.
 */
export function install(env) {
  var document = env.document;
  var box = null;
  var hide = () => box && (box.hidden = true);

  var dotOf = (event) => (event.target && event.target.closest ? event.target.closest('svg.graph g.dot') : null);

  document.addEventListener('mouseover', function (event) {
    var dot = dotOf(event);
    if (!dot) return hide();
    var label = dot.querySelector('text');
    var at = label.getBoundingClientRect();
    if (!box) {
      box = document.createElement('div');
      box.className = 'graph-name';
      document.body.appendChild(box);
    }
    box.textContent = label.textContent;
    box.style.left = at.right + 'px';
    box.style.top = at.top + at.height / 2 + 'px';
    box.hidden = false;
  });
  document.addEventListener('mouseout', function (event) {
    var dot = dotOf(event);
    if (dot && !dot.contains(event.relatedTarget)) hide();
  });
  // A scrolled panel moves the row from under a box placed by viewport position.
  document.addEventListener('scroll', hide, true);
}
