# parity

The surface against the reference its `DESIGN.md` names: an app, a screen or a design file the user picked. Walk it
region by region, the reference beside the capture, at the same size and in the same mode. With no named reference,
ask for one before judging.

| Check | How to probe | Pass |
| --- | --- | --- |
| Reference named | Read `DESIGN.md` for the reference and the screens it maps to. | A reference is named for each screen the slice changes. |
| Layout regions | List the reference's regions (header, navigation, content, side panel, footer), then find each in the capture. | Each region is present, in the same place and proportion, or the difference is written in `DESIGN.md`. |
| Spacing and alignment | Compare the gaps and edges inside each region. | Spacing comes from the token scale and edges line up as in the reference; no region is cramped or loose beside it. |
| Type scale | Compare each text role (title, heading, body, label, caption) region by region. | Sizes, weights and line heights follow the reference's hierarchy through the tokens. |
| Colour and contrast | Compare each region in light and in dark. | Roles match the reference's (surface, accent, muted, danger), and text keeps a readable contrast in both modes. |
| Density | Count what each region shows at the reference's size. | The surface shows about as much as the reference; nothing the reference shows is hidden behind an extra step. |
| Gaps written down | List every difference the walk found. | Each is fixed, or written in `DESIGN.md`'s known gaps with why. |
