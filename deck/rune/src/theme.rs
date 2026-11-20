//! The deck.css palette, font, springs and spacing scale (spec 2, L10).
//!
//! Colours are deck.css's: `color-mix(in srgb, currentColor 35%, <hue>)` is mixed here in sRGB the
//! way the browser mixes it, over the page's text colour (black on light, white on dark), and
//! `light-dark(a, b)` picks one by mode. `tests/theme.rs` reads deck.css and compares every value.

use rune::Color;
use rune::color::{srgb_decode, srgb_encode};

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

/// `color-mix(in srgb, <text> 35%, <hue>)`: sRGB channels mixed, as CSS does.
fn hue_over(text: Color, hue: u32) -> Color {
    let encode = |c: Color| [c.r, c.g, c.b].map(srgb_encode);
    let (t, h) = (encode(text), encode(hex(hue)));
    let mix = |i: usize| srgb_decode(0.35 * t[i] + 0.65 * h[i]);
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

pub fn tokens(dark: bool) -> Tokens {
    let text = if dark { Color::WHITE } else { Color::BLACK };
    let pick = |light: u32, night: u32| hex(if dark { night } else { light });
    let quiet = text.alpha(0.55);
    Tokens {
        by: By {
            pilot: hue_over(text, 0x2563eb),
            architect: hue_over(text, 0x7c3aed),
            implementer: hue_over(text, 0xd97706),
            fundamentalist: hue_over(text, 0xe11d48),
            qa: hue_over(text, 0x059669),
            teacher: hue_over(text, 0x0891b2),
            explorer: hue_over(text, 0x65a30d),
            auditor: hue_over(text, 0xc026d3),
            other: quiet,
        },
        state: States {
            waiting: hue_over(text, 0xd97706),
            pilot: hue_over(text, 0x2563eb),
            resolved: quiet,
            unacknowledged: hue_over(text, 0xdc2626),
        },
        accent: Accents {
            green: pick(0x15803d, 0x86efac),
            yellow: pick(0xa16207, 0xfde047),
            red: pick(0xb91c1c, 0xfca5a5),
            blue: pick(0x1d4ed8, 0x93c5fd),
            plain: text,
        },
        usage: Usage {
            fine: pick(0x15803d, 0x86efac),
            warm: pick(0xa16207, 0xfde047),
            high: pick(0xb91c1c, 0xfca5a5),
            critical: pick(0xffffff, 0xfee2e2),
            critical_bg: pick(0xb91c1c, 0x7f1d1d),
        },
        rule: text.alpha(0.18),
        quiet,
        font: Mono {
            family: &["Cascadia Mono", "SF Mono", "Menlo", "Consolas", "monospace"],
            size: 13.0,
            line: 1.6,
        },
    }
}

/// Springs, never durations and easings: each settles in well under 300 ms (L10).
#[allow(non_upper_case_globals)]
pub mod motion {
    use rune::Spring;

    pub const panel: Spring = Spring::new(0.12, 0.0);
    pub const card: Spring = Spring::new(0.10, 0.0);
    pub const press: Spring = Spring::new(0.07, 0.0);
}

/// One scale, in px (L10): between groups is at least twice within one, and a region names a step
/// rather than a number.
#[allow(non_upper_case_globals)]
pub mod space {
    pub const s0: f32 = 0.0;
    pub const s1: f32 = 2.0;
    pub const s2: f32 = 4.0;
    pub const s3: f32 = 8.0;
    pub const s4: f32 = 12.0;
    pub const s5: f32 = 16.0;
    pub const s6: f32 = 24.0;
    pub const s7: f32 = 32.0;
    pub const s8: f32 = 48.0;

    /// Inside a group.
    pub const within: f32 = s2;
    /// A card's padding.
    pub const pad: f32 = s3;
    /// Between groups.
    pub const between: f32 = s5;
    /// Between panels.
    pub const panels: f32 = s6;
    /// A list row's height.
    pub const row: f32 = 20.0;
    /// A card line's height.
    pub const card_line: f32 = 24.0;

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

    pub const cols: StatusCols = StatusCols {
        slice_ch: 5.0,
        state_ch: 12.0,
        time_ch: 7.0,
        gap: s5,
    };
}
