# Token playground

One page for tuning the Rune deck's design tokens, with no build step and no network.

1. Open `index.html` in a browser (a `file://` open is enough). **Import** `deck/rune/theme.json`, or drop it on the page.
   The page remembers the last import.
2. Move the controls. The mock redraws at once; the `dark` box switches the mode. A hue under `by` or `state` shows the
   colour Rune draws in light and in dark: the page mixes it exactly as `theme.rs` `hue_over` does.
3. **Download** (or **Copy**) the export and replace `deck/rune/theme.json` with it. Untouched values keep their bytes.
4. Rebuild: `cargo build --release --manifest-path deck/rune/Cargo.toml`. A native screenshot is the final check:
   `deck/rune/target/release/pilot-deck --snap out.png`.

`cargo test --test theme playground_mix` holds the page's colour mix to Rune's.
