# defaults

What the UI library or toolkit draws when nobody chose. Each is a decision left to the library; override it with a
token so the surface looks chosen, not inherited. Probe on the running surface in both modes, never in its source.

| Check | How to probe | Pass |
| --- | --- | --- |
| Focus ring | Move focus onto each kind of control with the keyboard; capture it in light and dark. | The ring is the surface's own token colour and width, visible on every background, and never removed without a replacement. |
| Selection colour | Select text in a field and in body copy, in both modes. | The highlight is a token, and selected text stays readable against it. |
| Scrollbars | Fill a scrolling region past its height; capture it in both modes. | The scrollbar follows the mode and the surface's tokens, or is the platform's native one on purpose; never a light bar on a dark surface. |
| Title bar and window frame | Open the surface in each mode with the platform's mode emulated as the other, never changed. | The frame, title bar or browser chrome colour follows the surface's mode, or the gap is written in `DESIGN.md`. |
| Fonts | Read the computed or rendered font of headings, body, monospace and controls. | Each is the token's family with a named fallback; no control falls back to the library's or the platform's default face. |
| Control styling | Capture an untouched button, field, checkbox, select and tooltip. | Each uses the surface's tokens for colour, radius and spacing; none is the library's stock look. |
| Empty, loading and error states | Open a screen with no data, slow data and a failed load. | Each state is designed with the surface's tokens; none is the library's placeholder text or spinner. |
