# Token playground

One page for tuning any surface's design tokens, with no build step and no network. The page edits the token file;
each surface brings its own preview page, which the playground frames and feeds.

## Any surface

1. `pilot look shape <surface.json>` opens `index.html` in a Chromium-family browser (or `PILOT_LOOK_BROWSER`) with the
   surface's `preview` page framed beside it, and prints the token file to import.
2. **Import** that file, or drop it on the page. The page remembers the last import per preview.
3. Move the controls. The preview redraws at once; the `dark` box switches the mode. The contrast table lists each
   text/surface pair in light and dark and flags one under 4.5:1 (WCAG AA): `text`, `muted` and `quiet` on `surface`,
   `panel` and `background`, and `on_x` on `x`, matched by leaf name. A file with no `text` colour is read as black
   text in light and white in dark. Ratios are rounded to 2 decimals before the flag, so a pair a hair under 4.5
   (4.495 and up) shows 4.50 unflagged.
4. **Download** (or **Copy**) the export, then `pilot look apply <export.json> <surface.json>` lays it onto the token
   file. Untouched values keep their bytes.

A preview is a page that listens for one message, `{ tokens, dark }`, from the window that frames it, and ignores any
other. It is named in `surface.json` as `"preview"`, relative to that file. `shape` opens it in your own browser
profile, framed with `sandbox="allow-scripts"`: it is the repository's HTML, run as opening it by hand would, network
included, so shape only a repository you trust. `pilot look snap` is the isolated mode (throwaway profile, no network).

## The Rune deck

- Surface: `deck/rune/surface.json`; tokens `deck/rune/theme.json`; preview `deck/rune/playground/mock.html`, a mock of
  the deck. A hue under `by` or `state` is drawn as Rune mixes it: the mock does it exactly as `theme.rs` `hue_over`
  does, and `cargo test --test theme playground_mix` holds the two together.
- After applying, rebuild: `cargo build --release --manifest-path deck/rune/Cargo.toml`. A native screenshot is the
  final check: `pilot look snap deck/rune/surface.json home`.

## A web page

- Surface: `fixtures/surface-web/surface.json`; tokens `fixtures/surface-web/tokens.json`; the preview is the page
  itself, which reads its token file when opened alone and takes the playground's tokens when framed.
