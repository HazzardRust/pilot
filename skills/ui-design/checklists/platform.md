# platform

What the reference platform gives an app for free, which a custom surface has to give back by hand. Probe each on
the running surface on the platform it ships to; a check the platform does not have is marked not applicable.

| Check | How to probe | Pass |
| --- | --- | --- |
| Resize | Resize the window or viewport from its smallest supported size to full screen. | Content reflows without clipping, overlap or a lost control; the minimum size is enforced, not overrun. |
| Snap and maximise | Snap the window to each half and to a corner, maximise it and restore it, with the platform's own gestures and keys. | The surface lays out for each size and restores where it was. |
| Keyboard | Use the platform's standard keys: copy, paste, cut, undo, select all, find, close, and the menu or command key. | Each does what the platform's own apps do, in every field and list. |
| Copy | Select and copy text, a value and a row, then paste them into another app. | What lands is the visible text or value, in plain form, with nothing the user did not select. |
| Context menu | Open the context menu on text, a field, a link and a list item. | The platform's menu, or the surface's own with the same core entries. |
| Text input | Type, use the input method editor, autocorrect and spell check where the platform offers them, and drag to select. | Fields behave like the platform's; none blocks a standard editing feature. |
| System settings | Change the platform's mode, accent, text size and reduced motion while the surface runs. | The surface follows each, or `DESIGN.md` says why not. |
