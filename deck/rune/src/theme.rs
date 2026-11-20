//! The deck.css palette, font, springs and spacing scale (spec 2, L10), valued in `theme.json`.
//!
//! Colours are deck.css's: `color-mix(in srgb, currentColor 35%, <hue>)` is mixed here in sRGB the
//! way the browser mixes it, over the page's text colour (black on light, white on dark), and
//! `light-dark(a, b)` picks one by mode. `tests/theme.rs` reads deck.css and compares every value.

use std::sync::LazyLock;

use rune::color::{srgb_decode, srgb_encode};
use rune::{Color, Cursor, El, el};
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
/// `tests/theme.rs`, which holds `playground/index.html`'s copy of it to this one.
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

/// deck.css's `font: 13px/1.6 ui-monospace, "Cascadia Mono", ...`, led by Cascadia Mono here: a
/// native window has no `ui-monospace`.
#[derive(Debug, Clone, Copy)]
pub struct Mono {
    pub family: &'static [&'static str],
    pub size: f32,
    pub line: f32,
}

#[derive(Debug, Clone, Copy)]
pub struct Tokens {
    pub by: By,
    pub state: States,
    pub accent: Accents,
    pub usage: Usage,
    pub rule: Color,
    pub quiet: Color,
    pub font: Mono,
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
    font: RawFont,
    roles: RawRoles,
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

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawFont {
    family: Vec<String>,
    size: f32,
    line: f32,
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

/// The font stack, leaked once so `Mono` stays `Copy`.
static FAMILY: LazyLock<&'static [&'static str]> = LazyLock::new(|| {
    let names: Vec<&'static str> = RAW
        .font
        .family
        .iter()
        .map(|n| &*Box::leak(n.clone().into_boxed_str()))
        .collect();
    Box::leak(names.into_boxed_slice())
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
        font: Mono {
            family: *FAMILY,
            size: raw.font.size,
            line: raw.font.line,
        },
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

/// Fixed sizes of the side-bar layout (DESIGN.md §4b), in px.
#[allow(non_upper_case_globals)]
pub mod size {
    include!(concat!(env!("OUT_DIR"), "/size.rs"));
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

/// A vertical hairline: 1 px, in the rule colour, as tall as its parent.
pub fn separator_vertical(dark: bool) -> El {
    el().w(1.0).h_full().fill(tokens(dark).rule)
}

/// Content text is selectable, highlighted in the selection colour.
pub fn content(el: El, dark: bool) -> El {
    el.selectable(true).selection_color(roles(dark).selection)
}

/// Markdown content: selectable, highlighted in the selection colour.
pub fn markdown(source: impl Into<String>, dark: bool) -> El {
    let style = MarkdownStyle::neutral(dark).selection(roles(dark).selection);
    Markdown::new(source).selectable(true).render(&style)
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
    /// the time fixed and right, `gap` apart (no `·`). The Status table's rows instead fix the
    /// slice (`slice_ch`) and let the state grow from `state_ch`, its trailing cells after it.
    #[derive(Debug, Clone, Copy)]
    pub struct StatusCols {
        /// The status table's Slice column, fixed so every row's State starts at one x.
        pub slice_ch: f32,
        pub state_ch: f32,
        pub time_ch: f32,
        pub gap: f32,
    }
}
