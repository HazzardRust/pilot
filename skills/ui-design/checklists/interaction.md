# interaction

Each state probed live on the running surface: hover it, select it, Tab to it, press it. A capture of the resting
screen shows none of these, and a passing test is not a probe.

| Check | How to probe | Pass |
| --- | --- | --- |
| Hover | Point at each interactive control and each row or card that reacts. | Every control that acts shows a hover state from the tokens; nothing that does not act looks as if it does. |
| Select | Select a row, a tab, an item in a list, and a range of text. | The selected item is distinct from the hovered one and from the rest, in both modes. |
| Tab order | From the start of the screen press Tab through to the end, then Shift+Tab back. | Focus visits every control once, in reading order, is always visible, and is never trapped outside a modal. |
| Press | Press each control with the pointer and with Enter or Space. | Each shows a pressed state and does the same thing from either input; a disabled control does nothing and says why. |
| Icon-only controls | Read each icon-only control's accessible name with the platform's accessibility inspector or a screen reader. | Every icon-only control names itself, and a tooltip on hover or focus says the same name. |
| Keyboard shortcuts | Trigger each shortcut the surface documents, and Escape in each overlay. | Each does what its label says; Escape closes the topmost overlay and returns focus to what opened it. |
| Feedback | Do each action that takes time or can fail. | The surface shows progress within a moment, and success or a failure that says what to do next. |
