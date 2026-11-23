//! rune-deck-ui S4: the Rune deck wears deck.css's colours and type, springs and one spacing scale.

use std::fs;
use std::hint::black_box;
use std::path::PathBuf;

use pilot_deck::theme::{self, Tokens, motion, space};
use rune::Color;

fn root() -> PathBuf {
    crate::support::manifest_dir()
}

fn deck_css() -> String {
    fs::read_to_string(root().join("../ui/deck.css")).expect("deck/ui/deck.css")
}

/// The expression on the first line holding `anchor`, from `prop:` to the closing `;`.
fn css_expr(css: &str, anchor: &str, prop: &str) -> String {
    let line = css
        .lines()
        .find(|line| line.contains(anchor))
        .unwrap_or_else(|| panic!("deck.css has no line with {anchor}"));
    let from = line
        .find(prop)
        .unwrap_or_else(|| panic!("no {prop} in {line}"))
        + prop.len();
    let rest = &line[from..];
    let end = rest.find(";").unwrap_or(rest.len());
    rest[..end].trim().to_string()
}

fn hex3(s: &str) -> [f32; 3] {
    let h = s.trim().trim_start_matches('#');
    if h.len() == 3 {
        let byte = |i: usize| f32::from(u8::from_str_radix(&h[i..=i], 16).expect("hex digit") * 17);
        return [byte(0), byte(1), byte(2)];
    }
    let byte = |i: usize| f32::from(u8::from_str_radix(&h[i..i + 2], 16).expect("hex digits"));
    [byte(0), byte(2), byte(4)]
}

/// An `#rrggbb` token inside `expr`, the last one.
fn last_hex(expr: &str) -> [f32; 3] {
    let at = expr.rfind('#').expect("a hex colour");
    hex3(&expr[at..at + 7])
}

fn rgb(c: Color) -> [f32; 3] {
    let hex = c.hex();
    hex3(&hex[..7])
}

fn close(got: Color, want: [f32; 3], what: &str) {
    let got = rgb(got);
    assert!(
        got.iter().zip(want).all(|(g, w)| (g - w).abs() <= 1.0),
        "{what}: {got:?} is not {want:?}"
    );
}

/// `color-mix(in srgb, currentColor P%, #hex)` over a page whose text is `text`.
fn mix(expr: &str, text: f32) -> [f32; 3] {
    let p: f32 = expr
        .split("currentColor ")
        .nth(1)
        .and_then(|s| s.split('%').next())
        .and_then(|s| s.trim().parse().ok())
        .unwrap_or_else(|| panic!("no currentColor percent in {expr}"));
    let hue = last_hex(expr);
    hue.map(|c| (p / 100.0 * text + (1.0 - p / 100.0) * c).round())
}

/// `light-dark(#a, #b)`: the first for a light page, the second for a dark one.
fn light_dark(expr: &str, dark: bool) -> [f32; 3] {
    let inner = expr.split("light-dark(").nth(1).expect("a light-dark pair");
    let mut pair = inner.trim_end_matches(')').split(',');
    let (light, night) = (pair.next().unwrap(), pair.next().unwrap());
    hex3(if dark { night } else { light })
}

#[test]
fn every_colour_is_deck_css() {
    let css = deck_css();
    for dark in [false, true] {
        let t: Tokens = theme::tokens(dark);
        let text = if dark { 255.0 } else { 0.0 };
        let by = |name: &str| mix(&css_expr(&css, &format!("--by-{name}:"), ":"), text);
        let st = |name: &str| mix(&css_expr(&css, &format!("--state-{name}:"), ":"), text);
        for (name, got) in [
            ("pilot", t.by.pilot),
            ("architect", t.by.architect),
            ("implementer", t.by.implementer),
            ("fundamentalist", t.by.fundamentalist),
            ("qa", t.by.qa),
            ("teacher", t.by.teacher),
            ("explorer", t.by.explorer),
            ("auditor", t.by.auditor),
        ] {
            close(got, by(name), &format!("by.{name} dark={dark}"));
        }
        close(t.state.waiting, st("waiting"), "state.waiting");
        close(t.state.pilot, st("pilot"), "state.pilot");
        close(
            t.state.unacknowledged,
            st("unacknowledged"),
            "state.unacknowledged",
        );

        // Alpha over the page: `--rule` is 18% of the text colour, `--quiet` 55% in deck.css, moved to 58% (S34) so quiet text on the rule fill passes AA.
        for (name, got, alpha) in [("rule", t.rule, 0.18), ("quiet", t.quiet, 0.58)] {
            assert!((got.a - alpha).abs() < 0.01, "{name} alpha {}", got.a);
            close(got, [text; 3], name);
        }
        // `by.other` and `state.resolved` are `--quiet`, by name in deck.css.
        assert_eq!(t.by.other, t.quiet);
        assert_eq!(t.state.resolved, t.quiet);

        let ld = |anchor: &str, prop: &str| light_dark(&css_expr(&css, anchor, prop), dark);
        close(t.usage.fine, ld(".usage-fine {", "color:"), "usage.fine");
        close(t.usage.warm, ld(".usage-warm {", "color:"), "usage.warm");
        close(t.usage.high, ld(".usage-high {", "color:"), "usage.high");
        close(
            t.usage.critical_bg,
            ld("background: light-dark(#b91c1c, #7f1d1d)", "background:"),
            "usage.critical_bg",
        );
        close(
            t.usage.critical,
            ld("color: light-dark(#fff, #fee2e2)", "color:"),
            "usage.critical",
        );
        for (name, got) in [
            ("green", t.accent.green),
            ("yellow", t.accent.yellow),
            ("red", t.accent.red),
            ("blue", t.accent.blue),
        ] {
            close(
                got,
                ld(&format!("[data-accent=\"{name}\"]"), "--accent:"),
                name,
            );
        }
        close(t.accent.plain, [text; 3], "accent.plain is the text colour");
        // The semantic roles are these same colours under a role's name (assumed A-R1).
        let r = theme::roles(dark);
        close(r.on_surface, [text; 3], "on_surface is the text colour");
        close(r.primary, rgb(t.accent.blue), "primary is the blue accent");
        close(r.error, rgb(t.accent.red), "error is the red accent");
        close(r.hover, [text; 3], "hover tints with the text colour");
        close(
            r.selection,
            rgb(t.accent.blue),
            "selection tints with the primary",
        );
    }
}

#[test]
fn the_font_is_inter_and_jetbrains_mono_on_three_scales() {
    use pilot_deck::theme::type_;
    assert_eq!((type_::UI, type_::MONO), ("Inter", "JetBrains Mono"));
    let scales = [type_::HEADER, type_::BODY, type_::CAPTION];
    assert_eq!(
        scales.map(|s| (s.size, s.weight)),
        [(13.0, 700.0), (13.0, 400.0), (11.0, 500.0)]
    );
    assert!(scales.iter().all(|s| s.family == rune::Family::Sans));
    assert_eq!(type_::BODY.mono().family, rune::Family::Mono);
}

#[test]
fn the_motion_is_springs_that_settle() {
    for (name, spring) in [
        ("panel", motion::panel),
        ("card", motion::card),
        ("press", motion::press),
    ] {
        let settles = spring.settling_duration(0.001);
        assert!(settles < 0.3, "{name} settles in {settles} s");
        assert!(settles > 0.0, "{name} never moves");
    }
}

#[test]
fn between_is_at_least_twice_within() {
    let (within, between, panels) = black_box((space::within, space::between, space::panels));
    assert!(between >= 2.0 * within);
    assert!(panels >= between);
    let steps = [
        space::s0,
        space::s2,
        space::s3,
        space::s4,
        space::s5,
        space::s6,
        space::s7,
        space::s8,
    ];
    assert_eq!(steps, [0.0, 4.0, 8.0, 12.0, 16.0, 24.0, 32.0, 48.0]);
    assert!(steps.iter().all(|s| s % 4.0 == 0.0));
    assert_eq!(
        (space::within, space::pad, space::between, space::panels),
        (8.0, 8.0, 24.0, 24.0)
    );
    assert_eq!((space::row, space::card_line), (20.0, 24.0));
    assert_eq!(
        (space::cols.state_ch, space::cols.time_ch, space::cols.gap),
        (12.0, 7.0, 16.0)
    );
}

/// The grid is 4: every number `theme.json` gives the `space` section is a multiple of 4.
#[test]
fn every_space_step_is_on_the_4_grid() {
    let json: serde_json::Value = serde_json::from_str(
        &fs::read_to_string(root().join("theme.json")).expect("deck/rune/theme.json"),
    )
    .expect("theme.json parses");
    let space = json["space"].as_object().expect("a space section");
    for (key, v) in space {
        if let Some(n) = v.as_f64() {
            assert_eq!(n % 4.0, 0.0, "space.{key} = {n} is off the 4 grid");
        }
    }
}

/// The calls on `src` that spell a spacing as a bare number: `.gap(8.0)`, `.padding(16)`.
fn spaced_by_hand(src: &str) -> Vec<String> {
    const CALLS: [&str; 7] = [
        ".gap(",
        ".padding(",
        ".margin(",
        ".height(",
        ".h(",
        ".pad(",
        ".padding_x(",
    ];
    src.lines()
        .enumerate()
        .flat_map(|(n, line)| {
            CALLS.iter().filter_map(move |call| {
                let arg = &line[line.find(call)? + call.len()..];
                arg.trim_start()
                    .starts_with(|c: char| c.is_ascii_digit())
                    .then(|| format!("line {}: {}", n + 1, line.trim()))
            })
        })
        .collect()
}

#[test]
fn the_scan_sees_a_number_spaced_by_hand() {
    let found = spaced_by_hand("col().gap(8.0).padding(space::pad).h(20.0)");
    assert_eq!(found.len(), 2, "{found:?}");
}

#[test]
fn no_region_spaces_by_hand() {
    let dir = root().join("src/regions");
    let mut seen = 0;
    for entry in fs::read_dir(&dir).expect("src/regions") {
        let path = entry.expect("entry").path();
        if path.extension().is_none_or(|e| e != "rs") {
            continue;
        }
        seen += 1;
        let found = spaced_by_hand(&fs::read_to_string(&path).expect("a region file"));
        assert!(found.is_empty(), "{}: {found:?}", path.display());
    }
    assert!(seen > 0, "no region files under {}", dir.display());
}

/// One theme.json key and the theme.rs value that must come from it.
fn json_leaf(json: &serde_json::Value, path: &str) -> serde_json::Value {
    path.split('.')
        .fold(json, |at, key| {
            at.get(key)
                .unwrap_or_else(|| panic!("theme.json has no key {path}"))
        })
        .clone()
}

fn leaves(v: &serde_json::Value, path: &str, out: &mut Vec<String>) {
    match v {
        serde_json::Value::Object(map) => map
            .iter()
            .for_each(|(k, v)| leaves(v, format!("{path}.{k}").trim_start_matches('.'), out)),
        _ => out.push(path.to_string()),
    }
}

#[test]
fn theme_json_is_read_and_is_the_only_source() {
    let json: serde_json::Value = serde_json::from_str(
        &fs::read_to_string(root().join("theme.json")).expect("deck/rune/theme.json"),
    )
    .expect("theme.json parses");

    // Every key theme.json holds, each paired with the value the API returns for it.
    let mut checked: Vec<String> = Vec::new();
    let mut is = |path: &str, got: serde_json::Value| {
        assert_eq!(json_leaf(&json, path), got, "theme.json {path}");
        checked.push(path.to_string());
    };
    // f32 1.6 widened is 1.600000023...: compare by the shortest decimal the f32 prints as.
    let n = |x: f32| serde_json::json!(x.to_string().parse::<f64>().expect("a number"));
    is("space.s0", n(space::s0));
    is("space.s2", n(space::s2));
    is("space.s3", n(space::s3));
    is("space.s4", n(space::s4));
    is("space.s5", n(space::s5));
    is("space.s6", n(space::s6));
    is("space.s7", n(space::s7));
    is("space.s8", n(space::s8));
    is("space.row", n(space::row));
    is("space.card_line", n(space::card_line));
    is("cols.slice_ch", n(space::cols.slice_ch));
    is("cols.state_ch", n(space::cols.state_ch));
    is("cols.time_ch", n(space::cols.time_ch));
    is("space.within", serde_json::json!("s3"));
    is("space.pad", serde_json::json!("s3"));
    is("space.between", serde_json::json!("s6"));
    is("space.panels", serde_json::json!("s6"));
    is("cols.gap", serde_json::json!("s5"));
    is("opacity.disabled", n(theme::opacity::disabled));
    is("opacity.picked", n(theme::opacity::picked));
    for (path, got) in [
        ("radius.button", theme::radius::button),
        ("radius.chip", theme::radius::chip),
        ("size.titlebar", theme::size::titlebar),
        ("size.icon_bar", theme::size::icon_bar),
        ("size.icon", theme::size::icon),
        ("size.pane_head", theme::size::pane_head),
        ("size.row", theme::size::row),
        ("size.side_min", theme::size::side_min),
        ("size.side_default", theme::size::side_default),
        ("size.handle", theme::size::handle),
        ("size.badge", theme::size::badge),
    ] {
        is(path, n(got));
    }
    // The roles name accents (the colours themselves are checked against the palette above).
    let (day, night) = (theme::roles(false), theme::roles(true));
    let rgb_hex = |c: Color| c.hex()[..7].to_string();
    is(
        "roles.surface.light",
        serde_json::json!(rgb_hex(day.surface)),
    );
    is(
        "roles.surface.dark",
        serde_json::json!(rgb_hex(night.surface)),
    );
    is("roles.hover_alpha", n(day.hover.a));
    is("roles.selection_alpha", n(day.selection.a));
    is("roles.primary", serde_json::json!("blue"));
    is("roles.accent", serde_json::json!("yellow"));
    is("roles.error", serde_json::json!("red"));
    is("type.ui", serde_json::json!(theme::type_::UI));
    is("type.mono", serde_json::json!(theme::type_::MONO));
    for (name, scale) in [
        ("header", theme::type_::HEADER),
        ("body", theme::type_::BODY),
        ("caption", theme::type_::CAPTION),
    ] {
        is(&format!("type.{name}.size"), n(scale.size));
        is(&format!("type.{name}.weight"), n(scale.weight));
    }
    // A colour's hue or light/dark pair is read back through the colour it makes.
    for dark in [false, true] {
        let t = theme::tokens(dark);
        let hex = |c: Color| c.hex()[..7].to_string();
        let side = if dark { "dark" } else { "light" };
        for (name, got) in [
            ("green", t.accent.green),
            ("yellow", t.accent.yellow),
            ("red", t.accent.red),
            ("blue", t.accent.blue),
        ] {
            let want = json_leaf(&json, &format!("accent.{name}.{side}"));
            assert_eq!(want, hex(got), "accent.{name}.{side}");
            checked.push(format!("accent.{name}.{side}"));
        }
        for (name, got) in [
            ("fine", t.usage.fine),
            ("warm", t.usage.warm),
            ("high", t.usage.high),
            ("critical", t.usage.critical),
            ("critical_bg", t.usage.critical_bg),
        ] {
            let want = json_leaf(&json, &format!("usage.{name}.{side}"));
            assert_eq!(want, hex(got), "usage.{name}.{side}");
            checked.push(format!("usage.{name}.{side}"));
        }
    }
    for (path, got) in [
        ("alpha.rule", theme::tokens(false).rule.a),
        ("alpha.quiet", theme::tokens(false).quiet.a),
    ] {
        assert!(
            (json_leaf(&json, path).as_f64().unwrap() - f64::from(got)).abs() < 1e-6,
            "{path}"
        );
        checked.push(path.to_string());
    }
    // Hues and the mix are covered by `every_colour_is_deck_css`; springs by their settling.
    let spring = |path: &str| json_leaf(&json, path).as_array().unwrap().len();
    for (name, s) in [
        ("panel", motion::panel),
        ("card", motion::card),
        ("press", motion::press),
    ] {
        assert_eq!(spring(&format!("motion.{name}")), 2);
        assert!(s.settling_duration(0.001) > 0.0, "{name}");
        checked.push(format!("motion.{name}"));
    }
    for hue in ["by", "state"] {
        let mut keys = Vec::new();
        leaves(&json_leaf(&json, hue), hue, &mut keys);
        checked.extend(keys);
    }
    checked.push("hue_mix".to_string());

    // No key goes unread: every leaf in the file was checked above, and none is missing from it.
    let mut all = Vec::new();
    leaves(&json, "", &mut all);
    all.sort();
    checked.sort();
    assert_eq!(
        all, checked,
        "a theme.json key nothing checks, or a check without a key"
    );
}

/// `hueOver` in `playground/index.html` on the eight author hues at 35%, pinned from the page:
/// (hue, over black text, over white text). qa's dark `#5cbb9e` is where a plain byte mix says `#5dbb9e`.
const PLAYGROUND_MIX: [(u32, &str, &str); 8] = [
    (0x2563eb, "#184099", "#719af2"),
    (0x7c3aed, "#51269a", "#aa7ff3"),
    (0xd97706, "#8d4d04", "#e6a75d"),
    (0xe11d48, "#92132f", "#ec6c88"),
    (0x059669, "#036244", "#5cbb9e"),
    (0x0891b2, "#055e74", "#5eb8cd"),
    (0x65a30d, "#426a08", "#9bc362"),
    (0xc026d3, "#7d1989", "#d672e2"),
];

#[test]
fn playground_mix() {
    for (hue, light, dark) in PLAYGROUND_MIX {
        for (text, want) in [(Color::BLACK, light), (Color::WHITE, dark)] {
            let got = theme::hue_over(text, hue, 0.35).hex();
            assert_eq!(&got[..7], want, "#{hue:06x} over {text:?}");
        }
    }
}

/// WCAG 2.x relative luminance of an sRGB colour given as 0..=255 bytes.
fn luminance(c: [f32; 3]) -> f32 {
    let lin = |v: f32| {
        let v = v / 255.0;
        if v <= 0.03928 {
            v / 12.92
        } else {
            ((v + 0.055) / 1.055).powf(2.4)
        }
    };
    0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])
}

fn ratio(a: [f32; 3], b: [f32; 3]) -> f32 {
    let (la, lb) = (luminance(a), luminance(b));
    (la.max(lb) + 0.05) / (la.min(lb) + 0.05)
}

/// `c` composited over the opaque `under`, as the screen shows it.
fn over(c: Color, under: [f32; 3]) -> [f32; 3] {
    let top = rgb(c);
    let a = c.a;
    [0, 1, 2].map(|i| (a * top[i] + (1.0 - a) * under[i]).round())
}

#[test]
fn the_ratio_is_wcag() {
    // Known values: black on white is 21:1, a colour on itself 1:1, and #777 on white is
    // the classic 4.48:1 that fails AA.
    assert!((ratio([0.0; 3], [255.0; 3]) - 21.0).abs() < 0.01);
    assert!((ratio([9.0; 3], [9.0; 3]) - 1.0).abs() < 1e-6);
    let grey = ratio([119.0; 3], [255.0; 3]);
    assert!((grey - 4.48).abs() < 0.01 && grey < 4.5, "{grey}");
}

/// Pairs are composited in sRGB byte space, as CSS and the web deck do.
#[test]
fn contrast() {
    let mut weak = Vec::new();
    for dark in [false, true] {
        let t = theme::tokens(dark);
        let r = theme::roles(dark);
        let page = rgb(r.surface);
        // Every text colour the deck sets on the page: body text needs 4.5:1.
        let on_page = [
            ("on_surface", r.on_surface),
            ("primary", r.primary),
            ("accent", r.accent),
            ("error", r.error),
            ("quiet", t.quiet),
            ("by.pilot", t.by.pilot),
            ("by.architect", t.by.architect),
            ("by.implementer", t.by.implementer),
            ("by.fundamentalist", t.by.fundamentalist),
            ("by.qa", t.by.qa),
            ("by.teacher", t.by.teacher),
            ("by.explorer", t.by.explorer),
            ("by.auditor", t.by.auditor),
            ("state.waiting", t.state.waiting),
            ("state.pilot", t.state.pilot),
            ("state.unacknowledged", t.state.unacknowledged),
            ("accent.green", t.accent.green),
            ("accent.yellow", t.accent.yellow),
            ("accent.red", t.accent.red),
            ("accent.blue", t.accent.blue),
            ("usage.fine", t.usage.fine),
            ("usage.warm", t.usage.warm),
            ("usage.high", t.usage.high),
        ];
        let mut pairs: Vec<(String, f32)> = on_page
            .iter()
            .map(|(n, c)| (format!("{n} on surface"), ratio(over(*c, page), page)))
            .collect();
        let crit_bg = over(t.usage.critical_bg, page);
        pairs.push((
            "usage.critical on critical_bg".into(),
            ratio(over(t.usage.critical, crit_bg), crit_bg),
        ));
        let picked = over(r.selection, page);
        pairs.push((
            "on_surface on selection".into(),
            ratio(over(r.on_surface, picked), picked),
        ));
        let hovered = over(r.hover, page);
        pairs.push((
            "on_surface on hover".into(),
            ratio(over(r.on_surface, hovered), hovered),
        ));
        // A pressed control's label on its state.pilot fill (a sent or locked option, Dismiss).
        let pressed = over(t.state.pilot, page);
        pairs.push((
            "pressed_ink on state.pilot fill".into(),
            ratio(over(theme::pressed_ink(dark), pressed), pressed),
        ));
        // Text on the rule colour used as a fill (an input's face) and on the picked fill.
        for (fill, fill_name) in [
            (t.rule, "rule fill"),
            (r.on_surface.alpha(theme::opacity::picked), "picked fill"),
        ] {
            let under = over(fill, page);
            for (text, text_name) in [(t.quiet, "quiet"), (r.on_surface, "on_surface")] {
                pairs.push((
                    format!("{text_name} on {fill_name}"),
                    ratio(over(text, under), under),
                ));
            }
        }
        for (name, got) in pairs {
            if got < 4.5 {
                weak.push(format!("dark={dark} {name}: {got:.2}"));
            }
        }
    }
    assert!(weak.is_empty(), "below 4.5:1: {weak:#?}");
}
