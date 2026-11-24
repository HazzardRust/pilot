//! The deck.css palette, font, springs and spacing scale (spec 2, L10), valued in `theme.json`.
//!
//! Colours are deck.css's: `color-mix(in srgb, currentColor 35%, <hue>)` is mixed here in sRGB the
//! way the browser mixes it, over the page's text colour (black on light, white on dark), and
//! `light-dark(a, b)` picks one by mode. `tests/theme.rs` reads deck.css and compares every value.

use std::sync::LazyLock;

use rune::color::{srgb_decode, srgb_encode};
use rune::{Color, Cursor, El, TextStyle, el};
use rune_kit::markdown::{Markdown, MarkdownStyle};
use serde::Deserialize;
use serde::de::IgnoredAny;

/// `#rrggbb` as the colour Rune draws (linear, from sRGB bytes).
fn hex(rgb: u32) -> Color {
    let byte = |shift: u32| srgb_decode(((rgb >> shift) & 0xff) as f32 / 255.0);
    Color {
        r: byte(16),
        g: byte(8),
        b: byte(0),
        a: 1.0,
    }
}

/// `color-mix(in srgb, <text> mix%, <hue>)`: sRGB channels mixed, as CSS does. Public for
/// `tests/theme.rs`, which holds `playground/mock.html`'s copy of it to this one.
pub fn hue_over(text: Color, hue: u32, mix: f32) -> Color {
    let encode = |c: Color| [c.r, c.g, c.b].map(srgb_encode);
    let (t, h) = (encode(text), encode(hex(hue)));
    let mix = |i: usize| srgb_decode(mix * t[i] + (1.0 - mix) * h[i]);
    Color {
        r: mix(0),
        g: mix(1),
        b: mix(2),
        a: 1.0,
    }
}

#[derive(Debug, Clone, Copy)]
pub struct By {
    pub pilot: Color,
    pub architect: Color,
    pub implementer: Color,
    pub fundamentalist: Color,
    pub qa: Color,
    pub teacher: Color,
    pub explorer: Color,
    pub auditor: Color,
    pub other: Color,
}

impl By {
    /// deck.css's `.who.by-<kind>`: an author read as its crew kind the way `items.mjs`
    /// `authorKind` reads it (`pilot:` and `pilot-` dropped), and that kind's colour; a name
    /// outside the crew is `other`, drawn quiet.
    pub fn of(&self, author: &str) -> (&'static str, Color) {
        let name = author.strip_prefix("pilot:").unwrap_or(author);
        let name = name.strip_prefix("pilot-").unwrap_or(name);
        match name {
            "" | "pilot" => ("pilot", self.pilot),
            "architect" => ("architect", self.architect),
            "implementer" => ("implementer", self.implementer),
            "fundamentalist" => ("fundamentalist", self.fundamentalist),
            "qa" => ("qa", self.qa),
            "teacher" => ("teacher", self.teacher),
            "explorer" => ("explorer", self.explorer),
            "auditor" => ("auditor", self.auditor),
            "lander" => ("lander", self.other),
            _ => ("other", self.other),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct States {
    pub waiting: Color,
    pub pilot: Color,
    pub resolved: Color,
    pub unacknowledged: Color,
}

#[derive(Debug, Clone, Copy)]
pub struct Accents {
    pub green: Color,
    pub yellow: Color,
    pub red: Color,
    pub blue: Color,
    /// No accent: the text colour.
    pub plain: Color,
}

#[derive(Debug, Clone, Copy)]
pub struct Usage {
    pub fine: Color,
    pub warm: Color,
    pub high: Color,
    pub critical: Color,
    pub critical_bg: Color,
}

#[derive(Debug, Clone, Copy)]
pub struct Tokens {
    pub by: By,
    pub state: States,
    pub accent: Accents,
    pub usage: Usage,
    pub rule: Color,
    pub quiet: Color,
    /// The page's text colour: black on light, white on dark.
    pub text: Color,
}

/// `theme.json`, read at build time and parsed once. A key renamed or malformed panics on the
/// first read, which `tests/theme.rs` makes before any window opens.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Raw {
    hue_mix: f32,
    by: ByHue,
    state: StateHue,
    accent: AccentHex,
    usage: UsageHex,
    alpha: Alpha,
    roles: RawRoles,
    /// Read by `build.rs`: the type scales of `type_`.
    #[serde(rename = "type")]
    #[allow(dead_code)]
    type_scales: IgnoredAny,
    /// Read by `build.rs`, which turns them into the consts below.
    #[allow(dead_code)]
    motion: IgnoredAny,
    #[allow(dead_code)]
    space: IgnoredAny,
    #[allow(dead_code)]
    cols: IgnoredAny,
    #[allow(dead_code)]
    opacity: IgnoredAny,
    #[allow(dead_code)]
    radius: IgnoredAny,
    #[allow(dead_code)]
    size: IgnoredAny,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ByHue {
    pilot: Hex,
    architect: Hex,
    implementer: Hex,
    fundamentalist: Hex,
    qa: Hex,
    teacher: Hex,
    explorer: Hex,
    auditor: Hex,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct StateHue {
    waiting: Hex,
    pilot: Hex,
    unacknowledged: Hex,
}

/// A colour that differs by mode.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Pair {
    light: Hex,
    dark: Hex,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AccentHex {
    green: Pair,
    yellow: Pair,
    red: Pair,
    blue: Pair,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct UsageHex {
    fine: Pair,
    warm: Pair,
    high: Pair,
    critical: Pair,
    critical_bg: Pair,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Alpha {
    rule: f32,
    quiet: f32,
}

/// Which accents the roles reuse, by name, and the two tints.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawRoles {
    surface: Pair,
    primary: String,
    accent: String,
    error: String,
    hover_alpha: f32,
    selection_alpha: f32,
}

/// `"#rrggbb"`.
struct Hex(u32);

impl<'de> Deserialize<'de> for Hex {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let s = String::deserialize(d)?;
        let digits = s.strip_prefix('#').filter(|h| h.len() == 6);
        digits
            .and_then(|h| u32::from_str_radix(h, 16).ok())
            .map(Hex)
            .ok_or_else(|| serde::de::Error::custom(format!("{s} is not #rrggbb")))
    }
}

impl Pair {
    fn pick(&self, dark: bool) -> Color {
        hex(if dark { self.dark.0 } else { self.light.0 })
    }
}

static RAW: LazyLock<Raw> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../theme.json"))
        .unwrap_or_else(|e| panic!("theme.json: {e}"))
});

pub fn tokens(dark: bool) -> Tokens {
    let raw = &*RAW;
    let text = if dark { Color::WHITE } else { Color::BLACK };
    let over = |h: &Hex| hue_over(text, h.0, raw.hue_mix);
    let quiet = text.alpha(raw.alpha.quiet);
    Tokens {
        by: By {
            pilot: over(&raw.by.pilot),
            architect: over(&raw.by.architect),
            implementer: over(&raw.by.implementer),
            fundamentalist: over(&raw.by.fundamentalist),
            qa: over(&raw.by.qa),
            teacher: over(&raw.by.teacher),
            explorer: over(&raw.by.explorer),
            auditor: over(&raw.by.auditor),
            other: quiet,
        },
        state: States {
            waiting: over(&raw.state.waiting),
            pilot: over(&raw.state.pilot),
            resolved: quiet,
            unacknowledged: over(&raw.state.unacknowledged),
        },
        accent: Accents {
            green: raw.accent.green.pick(dark),
            yellow: raw.accent.yellow.pick(dark),
            red: raw.accent.red.pick(dark),
            blue: raw.accent.blue.pick(dark),
            plain: text,
        },
        usage: Usage {
            fine: raw.usage.fine.pick(dark),
            warm: raw.usage.warm.pick(dark),
            high: raw.usage.high.pick(dark),
            critical: raw.usage.critical.pick(dark),
            critical_bg: raw.usage.critical_bg.pick(dark),
        },
        rule: text.alpha(raw.alpha.rule),
        quiet,
        text,
    }
}

/// The semantic colour roles of deck/DESIGN.md §4, each one of the colours above under a role's
/// name (assumed A-R1: the palette is deck.css's until the user answers). Every role lives here so
/// a design-tool export can drive them.
#[derive(Debug, Clone, Copy)]
pub struct Roles {
    /// The system background.
    pub surface: Color,
    /// Text on it.
    pub on_surface: Color,
    pub primary: Color,
    pub accent: Color,
    pub error: Color,
    /// A control's hover tint: the text colour at `roles.hover_alpha`.
    pub hover: Color,
    /// Selected text's highlight: the primary at `roles.selection_alpha`.
    pub selection: Color,
}

pub fn roles(dark: bool) -> Roles {
    let t = tokens(dark);
    let r = &RAW.roles;
    let named = |name: &str| match name {
        "green" => t.accent.green,
        "yellow" => t.accent.yellow,
        "red" => t.accent.red,
        "blue" => t.accent.blue,
        other => panic!("theme.json roles: {other} is not an accent name"),
    };
    let on_surface = t.accent.plain;
    let primary = named(&r.primary);
    Roles {
        surface: r.surface.pick(dark),
        on_surface,
        primary,
        accent: named(&r.accent),
        error: named(&r.error),
        hover: on_surface.alpha(r.hover_alpha),
        selection: primary.alpha(r.selection_alpha),
    }
}

/// Corner radii, in px.
#[allow(non_upper_case_globals)]
pub mod radius {
    include!(concat!(env!("OUT_DIR"), "/radius.rs"));

    /// A pill is half its height.
    pub fn pill(height: f32) -> f32 {
        height / 2.0
    }
}

/// Opacities.
#[allow(non_upper_case_globals)]
pub mod opacity {
    include!(concat!(env!("OUT_DIR"), "/opacity.rs"));
}

/// The deck's three type scales and no others (spec 22): `HEADER` 13 bold, `BODY` 13 and `CAPTION` 11,
/// in Inter (`UI`); ids and times take `.mono()`, JetBrains Mono (`MONO`). Both families are bundled
/// (`app::spec`). Rune's own `type_::LABEL` and `TITLE` are the caption and the header here.
///
/// The one exception is a markdown body (the thread's and the reply box's preview), where a heading
/// takes its real size by level (reply-markdown S6): `H1` 17 and `H2` 15 bold, `HEADER` for 3 and
/// deeper; `heading` picks one. Nothing else in the deck uses `H1` or `H2`.
pub mod type_ {
    use rune::TextStyle;

    include!(concat!(env!("OUT_DIR"), "/type.rs"));

    /// A markdown heading of `level` (1 to 6): `H1`, `H2`, then `HEADER` for 3 and deeper.
    pub fn heading(level: u8) -> TextStyle {
        match level {
            1 => H1,
            2 => H2,
            _ => HEADER,
        }
    }
}

/// Fixed sizes of the side-bar layout (DESIGN.md §4b), in px.
#[allow(non_upper_case_globals)]
pub mod size {
    include!(concat!(env!("OUT_DIR"), "/size.rs"));
}

/// The label's ink on a control drawn pressed, whose fill is `state.pilot`: the page colour, since
/// the text colour on that fill is under 3:1 in both themes.
pub fn pressed_ink(dark: bool) -> Color {
    roles(dark).surface
}

/// A control says it is clickable (DESIGN.md §3): a text-colour tint on hover, the pointer cursor,
/// the button's corner, a Tab stop and a visible keyboard focus ring. Rune eases the tint itself.
pub fn control(el: El, dark: bool) -> El {
    let r = roles(dark);
    el.hover(r.hover)
        .focusable(true)
        .cursor(Cursor::Pointer)
        .radius(radius::button)
        .focus_ring(2.0, 1.0, r.primary)
}

/// A hairline: 1 px, in the rule colour, as wide as its parent.
pub fn separator(dark: bool) -> El {
    el().w_full().h(1.0).fill(tokens(dark).rule)
}

/// The side area's three line levels (the user, 2026-11-20): a pane's line spans the content
/// column, one between groups (Red / Yellow / Green) is shorter, one between items shorter still.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Rule {
    /// Over a pane (Tickets, Closing reports…), across the content: 8 px in from each edge.
    Pane,
    /// Between groups in a pane (Red / Yellow / Green): 24 px in from the content's edges.
    Group,
    /// Between items (tickets, reports, notices): 48 px in.
    Item,
}

/// A hairline of `level`, centred in the column it is a child of. A pane's line sits in the pane,
/// outside its padded body, so it comes in by the body's padding to span the same content.
pub fn rule(level: Rule, dark: bool) -> El {
    let inset = match level {
        Rule::Pane => space::pad,
        Rule::Group => space::s6,
        Rule::Item => space::s8,
    };
    el().self_stretch().mx(inset).h(1.0).fill(tokens(dark).rule)
}

/// A vertical hairline: 1 px, in the rule colour, as tall as its parent.
pub fn separator_vertical(dark: bool) -> El {
    el().w(1.0).h_full().fill(tokens(dark).rule)
}

/// A list row as VS Code's side bar draws one: `size::row` tall, its text centred, indented by
/// `space::s3` and padded `space::s4` on the right.
pub fn list_row(row: El) -> El {
    row.w_full()
        .h(size::row)
        .pl(space::s3)
        .pr(space::s4)
        .items_center()
}

/// Content text is selectable, highlighted in the selection colour.
pub fn content(el: El, dark: bool) -> El {
    el.selectable(true).selection_color(roles(dark).selection)
}

/// A region with nothing in it: one quiet sentence under `key`, never a blank (DESIGN.md §5).
pub fn empty(sentence: &str, key: &str, dark: bool) -> El {
    content(
        rune::text(sentence)
            .key(key)
            .font(type_::CAPTION)
            .color(rune::tok::theme(dark).text_secondary),
        dark,
    )
}

/// Markdown content: selectable, highlighted in the selection colour.
pub fn markdown(source: impl Into<String>, dark: bool) -> El {
    Markdown::new(source)
        .selectable(true)
        .render(&markdown_style(dark))
}

/// Rune's neutral markdown style on the deck's scales: headings by level (`type_::heading`; the reply
/// box's preview draws the same), the body and inline code the body (code at scale 1.0), a code block
/// the body in the mono family. A heading larger than the body takes the 24 px line Rune's own 17 and
/// 15 take; the rest take 20.
pub fn markdown_style(dark: bool) -> MarkdownStyle {
    let on = |scale: TextStyle| TextStyle {
        line_height: if scale.size > type_::BODY.size {
            24.0
        } else {
            20.0
        },
        ..scale
    };
    MarkdownStyle::neutral(dark)
        .selection(roles(dark).selection)
        .body_font(on(type_::BODY))
        .heading_font(1, on(type_::heading(1)))
        .heading_font(2, on(type_::heading(2)))
        .heading_font(3, on(type_::heading(3)))
        .code_block_font(on(type_::BODY.mono()))
        .inline_code_font(1.0, type_::BODY.weight)
}

/// Springs, never durations and easings: each settles in well under 300 ms (L10).
#[allow(non_upper_case_globals)]
pub mod motion {
    use rune::Spring;

    include!(concat!(env!("OUT_DIR"), "/motion.rs"));
}

/// One scale, in px (L10): between groups is at least twice within one, and a region names a step
/// rather than a number.
#[allow(non_upper_case_globals)]
pub mod space {
    include!(concat!(env!("OUT_DIR"), "/space.rs"));

    /// A status line's three columns: the state fixed and left, the name flexible and clipped,
    /// the time fixed and right, `gap` apart (no `·`). The Status table's cells are `gap` apart.
    #[derive(Debug, Clone, Copy)]
    pub struct StatusCols {
        /// No longer read: the Status table's columns are shares (`regions::status`); kept for
        /// theme.json's and the playground's shape.
        pub slice_ch: f32,
        pub state_ch: f32,
        pub time_ch: f32,
        pub gap: f32,
    }
}
