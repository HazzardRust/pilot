# The web surface fixture: design ruleset

The ruleset `surface.json` names as `rules` (spec 13). It holds for `index.html` in this folder, a static page that
stands in for a web product surface (A4). `tokens.json` is the only place a value is defined; the page reads every
colour, space, radius and font from it as a CSS variable.

## Rules

1. No literal colour or spacing in the page's CSS: each comes from a token. The one exception is the load-error box,
   which must stay legible when the tokens did not load.
2. Every colour is a `{ "light", "dark" }` pair. The mode is the browser's `prefers-color-scheme`; the page has no
   toggle of its own.
3. Body text on `surface` or `panel` meets WCAG AA, 4.5:1, in both modes.
4. `accent` marks the one thing a screen asks the user to do, and the current place in `nav`. Nothing else is accent.
5. Spacing steps are `xs` 4, `s` 8, `m` 16, `l` 24 px. A gap between two regions is `m`; a page edge is `l`.
6. A screen is reached by its fragment (`#home`, `#settings`), so `pilot look snap` opens it by route.

## What each token means

| Token | Means |
| --- | --- |
| `color.surface` | the page background |
| `color.panel` | a raised region: the header, a section card |
| `color.text` | headings and body text |
| `color.muted` | secondary text and inactive navigation |
| `color.border` | the 1 px line between regions |
| `color.accent` | the primary action and the current navigation item |
| `color.on_accent` | text on an accent fill |
| `space.*` | the spacing scale, in px |
| `radius` | the corner radius of cards, buttons and the current nav item, in px |
| `font.family`, `font.size` | the one text face and its body size, in px |

## Known gaps

- No hover, focus or pressed state is styled; the button and nav links take the browser's own focus ring.
- No reference is named for any region, so a difference list has nothing to compare against yet.
- The error colour of the load-error box is not a token.
- Only two screens; nothing here exercises a list, a form error or an empty state.
