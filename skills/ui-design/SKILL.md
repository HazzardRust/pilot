---
name: ui-design
description: The look step for any feature with a surface someone looks at, on any stack. Use when a plan is surface true, when shaping or checking how a screen looks, or when capturing a screen in light or dark mode without touching a window.
---

# UI design: the look step

One step for every stack (ADR NNNN). What a stack contributes is a **surface adapter**: a `surface.json` beside
its token file. The commands below read that file and nothing stack-specific.

## The surface adapter

```json
{
  "name": "surface-web",
  "tokens": "tokens.json",
  "rules": "DESIGN.md",
  "screens": { "home": "#home", "settings": "#settings" },
  "open": { "kind": "web", "page": "index.html" }
}
```

- Every path is relative to the `surface.json`, and stays inside the repository; `../DESIGN.md` is fine.
- `tokens`: the stack's own token file, the only place a value is defined. Colours are `{ "light", "dark" }` pairs.
- `rules`: the surface's committed ruleset, its rules, what each token means and its known gaps. Required.
- `screens`: each screen's start-up route. For `web` a route is a query (`?…`) or a fragment (`#…`) on the page.
- `open` is one of two kinds, and neither takes a shell line:
  - `{ "kind": "web", "page": "index.html" }`: a headless Chromium-family browser found on the machine, with a
    throwaway profile. Set `PILOT_LOOK_BROWSER` to its absolute path when the lookup does not find it.
  - `{ "kind": "command", "argv": ["app", "--open", "{route}", "--mode", "{mode}", "--snap", "{out}"] }`: run in
    the `surface.json`'s directory with only `{route}`, `{mode}` and `{out}` replaced, each inside its own element.

The worked web example is `fixtures/surface-web/`.

## The look step

1. Before a surface is built, it has a `surface.json`, a token file and a `DESIGN.md`.
2. Capture each screen the slice changes in both modes, and look at both PNGs:

   ```
   pilot look snap <surface.json> <screen> --mode light --out <screen>-light.png
   pilot look snap <surface.json> <screen> --mode dark  --out <screen>-dark.png
   ```

   The capture starts one process with the screen already open; it never moves the mouse, sends a key or takes a
   picture of the user's screen. Exit 0 prints the PNG's path; 1 names what failed; 2 is a usage error.
3. A colour or spacing change is a token change in the token file, never a literal in the surface's code.
4. Before the user looks, walk the four checklists below on the running surface, in both modes.

## Checklists

Each is a table of what to check, how to probe it on the running surface, and what passes, on any stack.

- [defaults](checklists/defaults.md): library defaults to override, such as focus rings, selection colour,
  scrollbars, the title bar and fonts.
- [interaction](checklists/interaction.md): hover, select, Tab and press, each probed live; every icon-only
  control names itself.
- [parity](checklists/parity.md): region by region against the reference `DESIGN.md` names.
- [platform](checklists/platform.md): what the reference platform gives free, such as resize, snap, keyboard
  and copy.

## Commands

| Command | Does |
| --- | --- |
| `pilot look snap <surface.json> <screen> [--mode light\|dark] [--out <png>]` | one PNG of a screen in a mode (default light, `<screen>-<mode>.png`) |
