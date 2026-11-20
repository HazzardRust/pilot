# Deck design rules

These rules govern both decks: the HTML page (`deck/ui/deck.css`) and the Rune window
(`deck/rune/src/theme.rs`, `deck/rune/src/regions/`). Sections 1 to 3 are the user's ruleset
(2026-11-20, adapted from Google's UI guidance). Section 4 holds this project's tokens and is
the only place a value may be defined. Section 5 lists where the current decks break the rules.

## 1. Visual and token constraints

- **No arbitrary values.** Never invent a raw hex code, a pixel margin or an ad-hoc font size.
  Use only the semantic tokens in section 4.
- **Colour roles and contrast.** Every colour maps to a semantic role (`surface`, `on-surface`,
  `primary`, `accent`, `error`). Every text and background pair meets WCAG AA: at least 4.5:1
  for body text, and 3:1 for large text and UI icons.
- **Spacing and rhythm.** Keep to a strict 4/8 px grid. Related controls sit close together
  (8 to 12 px); distinct sections sit well apart (24 to 48 px).
- **Typography hierarchy.** A view uses at most three type scales: header, body, and
  caption or label. Multi-line body copy is never centre-aligned.

## 2. Component and layout selection

- **Compose from the catalog.** Build only from the components in section 4. Never write a
  one-off wrapper where a native primitive exists.
- **Match the shape to the intent.** Prefer an interactive structure to a wall of text:
  - comparing 2 to 5 items: a comparison table or side-by-side cards;
  - a choice or configuration: form inputs, toggles or selectable chips;
  - a multi-step or destructive action: a confirmation summary that previews the change,
    with a primary and a secondary button.
- **Information density.** Keep cards scannable: one primary title, two or three key
  metadata points, and at most two actions (one primary, one secondary).

## 3. State and interaction

- **Design every state.** Every view handles more than the happy path:
  1. loading or streaming: skeletons or progressive blocks, with no layout shift;
  2. empty: a clear explanation and one primary call to action;
  3. error: the cause in plain words and a control to retry.
- **Progressive streaming.** Draw the top-level layout first, then fill it in.
- **Human in the loop.** Nothing irreversible (a deletion, an external message, a merge)
  runs because a view rendered. It runs only on an explicit click or confirmation.
- **Hover says clickable.** Every control (tab, button, icon, row, card that opens) takes a
  subtle hover: a background tint of the text colour at about 6-8%, with the cursor as a
  pointer, eased in by the same springs. Plain text never reacts. (The user's feedback 10.)
- **Content text is selectable.** Thread messages, card bodies, ids, times, reports and
  markdown take `.selectable(true)` with a selection colour (primary at about 30%). Control
  labels (tabs, buttons, icons) stay unselectable, so a click is never a selection. (The
  user's feedback 11.)
- **Accessibility by default.** Every interactive element has a visible focus ring, works
  from the keyboard, and has an accessible label.

## 4. Project tokens and catalog

These already exist and stay unless the user changes them (spec 2 of rune-deck-ui keeps
deck.css's colours).

- **Character.** Taken from the user's reference, pi.dev: monospace, hairline rules, no
  colour of its own, and light or dark taken from the system.
- **Surface and on-surface.** The system background, with text in black (light) or white
  (dark).
- **Quiet text.** Text at 55% (`--quiet`, `quiet`): secondary metadata and resolved threads.
- **Rule.** Text at 18% (`--rule`, `rule`): the only border, always a hairline.
- **Author colours.** Each is the text colour 35% mixed into a hue: pilot `#2563eb`,
  architect `#7c3aed`, implementer `#d97706`, fundamentalist `#e11d48`, qa `#059669`,
  teacher `#0891b2`, explorer `#65a30d`, auditor `#c026d3`. Any other author is quiet.
- **State colours.** Mixed the same way: waiting `#d97706`, with the pilot `#2563eb`,
  unacknowledged `#dc2626`, resolved quiet.
- **Accents.** Each pair is light, dark: green `#15803d` / `#86efac`, yellow `#a16207` /
  `#fde047`, red (error) `#b91c1c` / `#fca5a5`, blue (primary) `#1d4ed8` / `#93c5fd`.
- **Typography.** Cascadia Mono, then SF Mono, Menlo, Consolas, monospace. 13 px with a 1.6
  line height.
- **Spacing scale.** In px, from `theme::space`: 0, 2, 4, 8, 12, 16, 24, 32, 48.
- **Spacing roles.** Within a group 4, card padding 8, between groups 16, between panels 24,
  list row 20, card line 24.
- **Layout.** The panel is 19rem wide, the rail 2.4rem, the top inset 2.5rem.
- **Motion.** Springs only, never durations or easings: panel 0.12, card 0.10, press 0.07.
  Each settles in under 300 ms.
- **Catalog.** Not yet named. The default is the regions as they stand: tabs, queue card,
  thread, reply box, status table, strip, and the left panels (agents, chat, graph, history,
  notifications, reports, tickets, usage).

## 4b. The left side: copy VS Code's side bar

The user asked for this on 2026-11-20, with no snap. Values are VS Code main's (Dark Modern),
fetched on 2026-11-20 from microsoft/vscode.

- **Icon bar.** 48 px wide with 48x48 items and 24 px icons. The active icon carries a 2 px
  bar on its left edge in the primary colour. Each icon shows its label on hover (agents,
  tickets, status as a stemmed graph, ...). The badge is a pill: 9 px, weight 600, 16 px
  tall, radius 20.
- **Side area.** One width shared by every panel, so their inner edges always line up.
  Minimum 170 px, preferred about 300 px. Dragging it below the minimum hides it. The resize
  handle is 4 px, invisible until hovered, then highlighted with a 0.1 s fade.
- **Panes.** Stacked with no gap, cut by 1 px lines in the rule colour. A section header is
  22 px tall: an 11 px bold uppercase title, a chevron first, and actions on the right shown
  only on hover or focus. The header background is the side bar's own background, so the
  panes read as one surface rather than as boxes.
- **Rows.** 22 px tall, 8 px indent, 12 px right padding.
- **Border to the main body.** 1 px on the side area's inner edge, in the rule colour.
- **Corners.** Buttons radius 4, with 4x8 padding and a 12 px label. Count badges are 11 px
  pills. Small chips radius 2. The workbench text is 13 px.
- **Title bar.** A custom bar 30 to 35 px tall in the surface colour, with a 1 px rule below
  it.

## 5. Known gaps against these rules (audit at cb0866e9)

| Rule | Where it fails |
|---|---|
| 4/8 grid, 8-12 within, 24-48 between | `space::s1` is 2 px; within is 4 px; between is 16 px |
| At most 3 type scales | Rune draws one size, 13 px, so there is no hierarchy; deck.css uses 10 distinct `font-size` values |
| Semantic colour roles | Tokens are named by author, state and hue; there is no surface, primary or error role |
| Visible focus ring and keyboard | Only notifications, queue, status and thread mark anything `focusable` |
| Empty, error and retry states | Regions draw blank when empty; "deck not running" has no retry control |
| Cards: 1 title, 2-3 metadata, at most 2 actions | Not yet checked |
| Corners | No radius anywhere except the graph dots |
| Left panels | Each panel has its own width, with 24 px gaps between panels (`space::panels`); no line separates them from the body |
| Right strip buttons | `regions/strip.rs:240`: square, coloured with the state colour or the rule colour, floating on their own |
| Top inset | `layout.rs:261` pads 16 px on every side; the page's top inset is 40 px |
| Title bar | The native OS bar |
| Text selection | No text can be highlighted: Rune's text is unselectable by default (`rune` el/text.rs:483 `selectable(bool)`, rune-kit markdown's `selectable` flag) and the deck never sets it |
| Hover affordance | Only the graph dots react to hover (`regions/graph.rs:137`, `on_hover_change`); tabs, strip buttons, cards and rows give no sign they are clickable. Rune has a per-element hover style (`El::hover`, visuals.rs:324), so no state flags are needed |
| Thread kind line | `regions/thread.rs:151-181`: the `‹ ›` arrows are `type_::TITLE` while the rest is `LABEL`, so baselines differ; the rows set no cross-axis centring; the accent bar is `s2 x s4` (2x16), taller than the text; `at` is the raw ISO time with ms; gaps are 4 inside and 16 to the pager, so the pager floats. Fix: one size, a centred row, the time as `HH:MM` (full time on hover), the pager pushed to the right edge |

## 6. Decisions for the restyle (2026-11-20)

- **Rune diverges and the HTML page stays** (the user, on itm_7b1445b79825). Rune owns type,
  spacing and corner radius. The `theme` parity test narrows to colours, and spec 2 is
  amended. The colours stay deck.css's.
- **Title bar.** Assumed: Rune's built-in `Titlebar`, i.e.
  `rune::App::new(spec).titlebar(Titlebar::new(h)).run()` in main.rs, plus a `.window_drag()`
  band in layout.rs. This keeps Windows snap layouts and the resize edges.
- **No panel snap.** The left side is one area with a single width (section 4b). Spec 6d
  (the handle tracks the pointer) stands.
- **Test policy per restyle slice.**
  - Gate on `cargo build --release` and `cargo test` in deck/rune; the Node suite is skipped.
  - Tests that pin the old look are rewritten or deleted in the slice that changes it, never
    left red or ignored.
  - The behaviour tests stay: specs 3, 9, 10, 12, 14 and 15.
  - The full suite runs once, at landing.
  - The user looks at every slice.

- **Token playground** (the user, itm_2d4d885b5e13). The theme's values move into one JSON file, `deck/rune/theme.json`, read by theme.rs at build time (S36). A playground page, `deck/rune/playground/index.html` (S37), edits every token over a mock of the deck in light and dark and exports that JSON 1:1. The palette and any token values arrive as the user's export (S34). A native Rune screenshot stays the final check.

## 7. The user's feedback, verbatim (walkthrough itm_317aa44d9e6e)

1. "alright this looks poop i cant lie. I am gonna give you google's design principles for UI
   in an md form, from them. after this, i will give more and more feedback on it."
   (The ruleset follows; it is sections 1 to 3.)
2. "can you document that as a design.md, along with whatever preexisting stylistic
   generalities we have"
3. "alright the first thing is that it is blocky, sharp corners everywhere. second is that
   there is no horizontal snap to the sizing of the panels, so when i adjust them they are
   missaligned. thirdly the panel's top bar is ugly, that area with the "close window" and
   "minimize" buttons. that area on the left side with all the panels needs a lil bit of
   separation, just a little line seperating it from the main body."
4. "also missing from that left side of panels, there is an awkward amount of space between
   the panels. i want you to research and copy how vs code does it for their side bar on the
   left - i like it."
5. "and with copying vs code's sidebar, you dont need the snap anymore, and it can all live
   aligned as a single like side area, where the inner sides of the panels are always
   aligned. i like how they have symbols, and when you hover over you get told what the
   symbols are. e.g. agents, tickets, status (which can be like a stemmed graph kind of
   look."
6. "the buttons on the right look SOOOO ugly, like they just exist in like a weird space on
   their own, and the buttons themselves look ugly like square and follow a random colour
   pallete. like their alignment is weird just everything is off."
7. "hey can you try and skip a lot of the tests so we can develop at a faster pace? as long
   as you are just re-structuring the cosmetics we can skip a lot of them while we re-style
   it."
8. "also the text start awkwardly close to the top of the window"
9. "okay and the font, find a new font the current one looks ugly"
   - Open as itm_1ca41d7c120d.
   - Default: Inter for the UI and JetBrains Mono for code, ids and times. Both are bundled
     (OFL).
   - Sizes: header 13 bold, body 13, caption 11.
   - Added on the thread as option E: Inter + IBM Plex Mono, both already in Rune's assets.
10. "okay i've noticed what feels off about the tabs - make sure to include nice subtle hover
    actions over everything on the page so i can tell what is a button and what is text"
    - Taken as the section 3 rule "Hover says clickable", applied to every control in the
      restyle.
11. "okay why cant I highlight any of the text???? this cant be good"
    - A bug, not taste: the section 3 rule "Content text is selectable".
12. "this status line or like title line i forget what you call it - it sucks the alignment
    is all off" (screenshot: `posted question 2026-11-20T06:47:28.707Z pilot ‹ D1 › 1/2`)
    - The thread's kind line: section 5, row "Thread kind line".
