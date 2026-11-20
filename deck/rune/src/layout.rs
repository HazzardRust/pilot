//! The screen's panel layout and sizes (spec 2, 5, 6d, 6e): the left strip's six panels one under
//! the other, each a header with its count over a body that springs open and shut and resizes from
//! its corner; the centre column; the right strip. What is open and how big is the window's prefs
//! (A4), saved on a toggle and on a drag's release, never once a frame.

use rune::tok::{self, type_};
use rune::{Align, Cursor, Cx, Drag, El, Phase, ScrollSpec, Transition, Tx, col, el, row, text};
use serde_json::Value;

use crate::app::{self, State};
use crate::prefs::Prefs;
use crate::regions::{self, notifications::keep};
use crate::theme::{self, motion, space};

/// The left strip, top to bottom, as the page's rail: each panel's name in the prefs and its label.
const PANELS: [(&str, &str); 6] = [
    ("notifications", "Notifications"),
    ("chat", "Chat"),
    ("status", "Status"),
    ("agents", "Agents"),
    ("tickets", "Tickets"),
    ("reports", "Closing reports"),
];

/// Open on a first start, before the user has opened or shut anything.
const OPEN_FIRST: [&str; 2] = ["chat", "status"];

/// In the open set once the user has toggled, so a set with every panel shut stays shut rather than
/// reading as a first start. A set saved before S20 without it (Notifications toggled on its own)
/// is read as the user left it, Chat and Status shut.
const SET: &str = "~";

/// A panel before it is dragged: deck.css's `--panel` 19rem wide, and its floor, `.panel`'s 12rem by
/// 4rem, in px at the deck's 16 px rem.
const SIZE: (f32, f32) = (304.0, 240.0);
const MIN: (f32, f32) = (192.0, 64.0);

/// A header's count, in `ch` of the deck's monospace: room for `999+`, so the label never moves.
const COUNT_CH: f32 = 4.0;
/// The advance of one monospace glyph as a share of the font size, as the status columns take it.
const ADVANCE: f32 = 0.6;

/// The drag in hand: the panel's size at the press, which each move adds the pointer's travel to.
#[derive(Debug, Default)]
pub struct Local {
    grab: Option<(f32, f32)>,
}

/// Whether `panel` is open: as the user left it, or Chat and Status on a first start.
pub fn is_open(prefs: &Prefs, panel: &str) -> bool {
    if prefs.open_panels.is_empty() {
        OPEN_FIRST.contains(&panel)
    } else {
        prefs.open_panels.contains(panel)
    }
}

/// Opens or shuts `panel` and saves the open set.
pub fn toggle(prefs: &mut Prefs, panel: &str) {
    if prefs.open_panels.is_empty() {
        prefs.open_panels.extend(OPEN_FIRST.map(String::from));
    }
    if !prefs.open_panels.remove(panel) {
        prefs.open_panels.insert(panel.to_string());
    }
    prefs.open_panels.insert(SET.to_string());
    keep(prefs);
}

/// Sets `panel`'s width and height, held to its floor and nothing else: no step and no pull toward
/// the default, which is what made the old drag snap there (6d). Saved by the drag's release.
pub fn resize(prefs: &mut Prefs, panel: &str, size: (f32, f32)) {
    let size = (size.0.max(MIN.0), size.1.max(MIN.1));
    prefs.sizes.insert(panel.to_string(), size);
}

fn size(prefs: &Prefs, panel: &str) -> (f32, f32) {
    prefs.sizes.get(panel).copied().unwrap_or(SIZE)
}

/// A header's count: a fixed cell, right-aligned and on one line, `999+` past 999 and blank at 0,
/// so a count gaining a digit moves no label and no panel (6e).
pub fn count_cell(count: usize, dark: bool) -> El {
    let shown = match count {
        0 => String::new(),
        1..=999 => count.to_string(),
        _ => "999+".to_string(),
    };
    let font = theme::tokens(dark).font;
    text(shown)
        .font(type_::LABEL)
        .color(tok::theme(dark).text)
        .align(Align::End)
        .truncate()
        .w(COUNT_CH * font.size * ADVANCE)
}

/// What a panel's header counts, as the page's rail does: the unseen notices and threads, the
/// tickets, and the closing reports not hidden.
fn count(s: &State, panel: &str) -> usize {
    let list = |region: &str, field: &str| {
        s.view
            .regions
            .get(region)
            .and_then(|r| r.get(field))
            .and_then(Value::as_array)
            .map(Vec::as_slice)
            .unwrap_or_default()
    };
    let id = |one: &Value| {
        one.get("id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string()
    };
    match panel {
        "notifications" => {
            let writes =
                |one: &Value| one.get("writes").and_then(Value::as_u64).unwrap_or(0) as u32;
            let unseen = list("notifications", "open")
                .iter()
                .filter(|one| regions::notifications::shown(&s.prefs, &id(one), writes(one)));
            list("notifications", "notices").len() + unseen.count()
        }
        "tickets" => list("tickets", "groups")
            .iter()
            .filter_map(|g| g.get("rows").and_then(Value::as_array))
            .map(Vec::len)
            .sum(),
        "reports" => list("reports", "reports")
            .iter()
            .filter(|one| regions::reports::shown(&s.prefs, &id(one)))
            .count(),
        _ => 0,
    }
}

fn content(s: &State, panel: &str, cx: &mut Cx<State>) -> El {
    let none = Value::Null;
    let region = |name: &str| s.view.regions.get(name).unwrap_or(&none);
    let r = &s.regions;
    match panel {
        "notifications" => {
            let (n, pending) = (&r.notifications, &s.pending);
            regions::notifications::draw(region("notifications"), &s.prefs, n, pending, cx)
        }
        "chat" => regions::chat::draw(region("chat"), &r.chat, cx),
        "status" => col()
            .gap(space::between)
            .child(regions::status::draw(region("status"), &r.status, cx))
            .child(regions::graph::draw(region("graph"), &r.graph, cx)),
        "agents" => regions::agents::draw(region("agents"), &r.agents, cx),
        "tickets" => regions::tickets::draw(region("tickets"), &r.tickets, &s.prefs, cx),
        _ => regions::reports::draw(region("reports"), &s.prefs, cx),
    }
}

/// The drag on a panel's corner: the edge is the pointer's on every move, landed at once, since a
/// spring here is the lag the user named (6d); the size is saved once, on the release.
fn drag(s: &mut State, panel: &str, d: &Drag, tx: &mut Tx) {
    match d.phase {
        Phase::Down => s.layout.grab = Some(size(&s.prefs, panel)),
        Phase::Move => {
            tx.instant();
            if let Some((w, h)) = s.layout.grab {
                resize(&mut s.prefs, panel, (w + d.dx, h + d.dy));
            }
        }
        Phase::Up => match s.layout.grab.take() {
            Some(start) if d.cancelled() => resize(&mut s.prefs, panel, start),
            _ => keep(&s.prefs),
        },
    }
}

fn panel(s: &State, name: &'static str, label: &str, cx: &mut Cx<State>) -> El {
    let dark = cx.system_dark();
    let t = tok::theme(dark);
    let open = is_open(&s.prefs, name);
    let (w, h) = size(&s.prefs, name);
    let head = row()
        .key(format!("panel-{name}-head"))
        .w(w)
        .gap(space::within)
        .role("button")
        .label(label)
        .on_press(move |s: &mut State| toggle(&mut s.prefs, name))
        .child(
            text(label)
                .font(type_::BODY)
                .color(if open { t.text } else { t.text_secondary })
                .truncate()
                .grow(1.0),
        )
        .child(count_cell(count(s, name), dark).key(format!("panel-{name}-count")));
    // The contents keep the panel's full size while the body springs over them, clipped, so
    // nothing inside reflows as it opens or shuts.
    let inner = col()
        .w(w)
        .h(h)
        .pin(Some(space::s0), Some(space::s0), None, None)
        .padding(space::pad)
        .scroll(ScrollSpec {
            stick_bottom: false,
        })
        .child(content(s, name, cx));
    let mut body = el()
        .key(format!("panel-{name}-body"))
        .w(w)
        .h(if open { h } else { space::s0 })
        .clip_soft(space::s0)
        .child(inner);
    if open {
        let rule = theme::tokens(dark).rule;
        body = body.border(1.0, rule).child(
            el().key(format!("panel-{name}-grip"))
                .role("separator")
                .label(format!("Resize {label}"))
                .size(space::s5, space::s5)
                .pin(None, None, Some(space::s0), Some(space::s0))
                .fill(rule)
                .cursor(Cursor::ResizeRow)
                .transition(Transition::none())
                .drag_threshold(space::s0)
                .on_drag(move |s: &mut State, d: &mut Drag, tx: &mut Tx| drag(s, name, d, tx)),
        );
    } else {
        // A shut panel's contents are still mounted under the clip: Tab and a reader skip them.
        body = body.inert().a11y_hidden();
    }
    col()
        .key(format!("panel-{name}"))
        .gap(space::within)
        .child(head)
        .child(body)
}

/// The window: the left strip's panels, the centre column, and the right strip.
pub fn strips(s: &State, cx: &mut Cx<State>) -> El {
    let t = tok::theme(cx.system_dark());
    let left = PANELS.iter().fold(
        // Open panels taller than the window scroll the strip rather than run off its foot.
        col()
            .key("strip-left")
            .h_full()
            .gap(space::panels)
            .scroll(ScrollSpec {
                stick_bottom: false,
            })
            .motion(motion::panel),
        |left, (name, label)| left.child(panel(s, name, label, cx)),
    );
    let none = Value::Null;
    let strip = s.view.regions.get("strip").unwrap_or(&none);
    row()
        .w_full()
        .h_full()
        .fill(t.bg)
        .padding(space::between)
        .gap(space::panels)
        .child(left)
        .child(app::center(s, cx).grow(1.0).min_w(space::s0))
        .child(regions::strip::draw(strip, &s.regions.strip, cx))
}
