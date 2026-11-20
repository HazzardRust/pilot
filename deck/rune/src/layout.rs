//! The screen's layout (spec 2, 5, 6d, 6e, 19): the left side as VS Code's side bar (DESIGN.md §4b),
//! an icon bar with one icon per panel beside one side area, where the open panels stack as panes
//! of one width; then the centre column and the right strip. Which panes are open, the side area's
//! width and whether it is hidden are the window's prefs (A4), saved on a press and on a drag's
//! release, never once a frame.

use rune::tok;
use rune::{
    Align, Cursor, Cx, Drag, El, Icon, Phase, ScrollSpec, Transition, Tx, col, el, icon, row, text,
};
use rune_kit::glyphs;
use serde_json::Value;

use crate::app::{self, State};
use crate::prefs::Prefs;
use crate::regions::{self, notifications::keep};
use crate::theme::{self, motion, size, space, type_};

/// An icon drawn in the deck's own line, 24 units square, in the colour `icon` tints it.
macro_rules! line_icon {
    ($name:literal, $body:literal) => {
        Icon {
            name: $name,
            view: 24.0,
            body: concat!(
                r#"<g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">"#,
                $body,
                "</g>"
            ),
        }
    };
}

static BELL: Icon = line_icon!(
    "deck-notifications",
    r#"<path d="M6 17v-6a6 6 0 0 1 12 0v6l1.5 2h-15z"/><path d="M10 21.5h4"/>"#
);
static BUBBLE: Icon = line_icon!("deck-chat", r#"<path d="M4 5h16v11H9.5L5 20v-4H4z"/>"#);
/// Status as a stemmed graph: two commits on a stem and a branch joining it (the user's feedback 5).
static GRAPH: Icon = line_icon!(
    "deck-status",
    r#"<circle cx="7" cy="5.5" r="2"/><circle cx="7" cy="18.5" r="2"/><circle cx="17" cy="8" r="2"/><path d="M7 7.5v9M17 10c0 4-10 2.5-10 6.5"/>"#
);
static PERSON: Icon = line_icon!(
    "deck-agents",
    r#"<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-4 3-6.5 7-6.5s7 2.5 7 6.5"/>"#
);
static TICKET: Icon = line_icon!(
    "deck-tickets",
    r#"<path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z"/><path d="M15 8v2M15 11.5v1M15 14v2"/>"#
);
static REPORT: Icon = line_icon!(
    "deck-reports",
    r#"<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>"#
);

/// The icon bar, top to bottom, as the page's rail: each panel's name in the prefs, its label and
/// its icon. The side area stacks the open ones in the same order.
static PANELS: [(&str, &str, &Icon); 6] = [
    ("notifications", "Notifications", &BELL),
    ("chat", "Chat", &BUBBLE),
    ("status", "Status", &GRAPH),
    ("agents", "Agents", &PERSON),
    ("tickets", "Tickets", &TICKET),
    ("reports", "Closing reports", &REPORT),
];

/// Open on a first start, before the user has opened or shut anything.
const OPEN_FIRST: [&str; 2] = ["chat", "status"];

/// In the open set once the user has toggled, so a set with every panel shut stays shut rather than
/// reading as a first start. A set saved before S20 without it (Notifications toggled on its own)
/// is read as the user left it, Chat and Status shut.
const SET: &str = "~";

/// A count, in `ch` of the deck's monospace: room for `999+`, so a count gaining a digit moves
/// nothing.
const COUNT_CH: f32 = 4.0;
/// The advance of one monospace glyph as a share of the font size, as the status columns take it.
const ADVANCE: f32 = 0.6;

/// The drag in hand: the side area's width as drawn at the press, which each move adds the
/// pointer's travel to, and the prefs' width and hidden flag then, which a cancel puts back.
#[derive(Debug, Default)]
pub struct Local {
    grab: Option<(f32, Option<f32>, bool)>,
}

/// Whether `panel` is open: as the user left it, or Chat and Status on a first start.
pub fn is_open(prefs: &Prefs, panel: &str) -> bool {
    if prefs.open_panels.is_empty() {
        OPEN_FIRST.contains(&panel)
    } else {
        prefs.open_panels.contains(panel)
    }
}

/// An icon's press: shows `panel`'s pane, or shuts it if it shows, and saves the open set. On a
/// hidden side area it brings the area back with the pane in it, never shuts it unseen.
pub fn toggle(prefs: &mut Prefs, panel: &str) {
    if prefs.open_panels.is_empty() {
        prefs.open_panels.extend(OPEN_FIRST.map(String::from));
    }
    // Hidden: unhide and open, never remove. Shown: remove, or insert if it was not there.
    if std::mem::take(&mut prefs.side_hidden) || !prefs.open_panels.remove(panel) {
        prefs.open_panels.insert(panel.to_string());
    }
    prefs.open_panels.insert(SET.to_string());
    keep(prefs);
}

/// The side area's width while it shows: as the user left it, or the default.
pub fn side_width(prefs: &Prefs) -> f32 {
    prefs.side_width.unwrap_or(size::side_default)
}

/// Whether the side area shows: not dragged into hiding, and some pane open in it.
fn shown(prefs: &Prefs) -> bool {
    !prefs.side_hidden && PANELS.iter().any(|p| is_open(prefs, p.0))
}

/// Sets the side area's width to `width`, the pointer's, with no step and no pull toward the
/// default, which is what made the old drag snap (6d). Below the minimum the area hides and keeps
/// the width it last had. Saved by the drag's release.
pub fn resize(prefs: &mut Prefs, width: f32) {
    prefs.side_hidden = width < size::side_min;
    if !prefs.side_hidden {
        prefs.side_width = Some(width);
    }
}

/// A count as a pill: a fixed cell on one line, `999+` past 999 and blank at 0, so a count gaining
/// a digit moves no label, no pane and no icon (6e). Neutral, never a hue: a count is not a state.
pub fn count_cell(count: usize, dark: bool) -> El {
    let shown = match count {
        0 => String::new(),
        1..=999 => count.to_string(),
        _ => "999+".to_string(),
    };
    let pill = el()
        .w(COUNT_CH * type_::CAPTION.size * ADVANCE + 2.0 * space::within)
        .h(size::badge)
        .center()
        .radius(theme::radius::pill(size::badge));
    let pill = if count == 0 {
        pill
    } else {
        pill.fill(theme::tokens(dark).rule)
    };
    pill.child(
        text(shown)
            .font(type_::CAPTION.mono())
            .color(theme::roles(dark).on_surface)
            .align(Align::Center)
            .truncate(),
    )
}

/// What a panel counts, as the page's rail does: the unseen notices and threads, the tickets, and
/// the closing reports not hidden.
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
    if s.blind() {
        return el();
    }
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
        "tickets" => {
            regions::tickets::draw(region("tickets"), &r.tickets, &s.prefs, &s.pending, cx)
        }
        _ => regions::reports::draw(region("reports"), &s.prefs, cx),
    }
}

/// The drag on the side area's handle: the edge is the pointer's on every move, landed at once,
/// since a spring here is the lag the user named (6d); the width is saved once, on the release.
fn drag(s: &mut State, d: &Drag, tx: &mut Tx) {
    match d.phase {
        Phase::Down => {
            let drawn = if shown(&s.prefs) {
                side_width(&s.prefs)
            } else {
                space::s0
            };
            s.layout.grab = Some((drawn, s.prefs.side_width, s.prefs.side_hidden));
        }
        Phase::Move => {
            tx.instant();
            if let Some((drawn, _, _)) = s.layout.grab {
                resize(&mut s.prefs, drawn + d.dx);
            }
        }
        Phase::Up => match s.layout.grab.take() {
            Some((_, width, hidden)) if d.cancelled() => {
                (s.prefs.side_width, s.prefs.side_hidden) = (width, hidden);
            }
            _ => keep(&s.prefs),
        },
    }
}

/// One icon of the icon bar: its label on hover and to a reader, the 4 px primary bar on its left
/// while its pane shows, and its count as a pill on its corner, out of the flow.
fn icon_item(
    s: &State,
    (name, label, glyph): (&'static str, &str, &'static Icon),
    dark: bool,
) -> El {
    let t = tok::theme(dark);
    let active = !s.prefs.side_hidden && is_open(&s.prefs, name);
    let mut item = theme::control(el(), dark)
        .key(format!("icon-{name}"))
        .size(size::icon_bar, size::icon_bar)
        .center()
        .role("button")
        .label(label)
        .help(label)
        .expanded(active)
        .on_press(move |s: &mut State| toggle(&mut s.prefs, name))
        .child(icon(glyph, size::icon).color(if active { t.text } else { t.text_secondary }));
    if active {
        item = item.child(
            el().w(space::s2)
                .h_full()
                .pin(Some(space::s0), Some(space::s0), None, Some(space::s0))
                .fill(theme::roles(dark).primary),
        );
    }
    let count = count(s, name);
    if count > 0 {
        item = item.child(
            count_cell(count, dark)
                .key(format!("icon-{name}-count"))
                .pin(None, None, Some(space::s0), Some(space::within)),
        );
    }
    item
}

/// One pane: a 22 px header (chevron, title, count) over its contents, which scroll. A shut pane
/// stays mounted at no height, so it springs open and shut; Tab and a reader skip it.
fn pane(s: &State, name: &'static str, label: &str, after: bool, cx: &mut Cx<State>) -> El {
    let dark = cx.system_dark();
    let t = tok::theme(dark);
    let open = is_open(&s.prefs, name);
    let head = theme::control(row(), dark)
        .key(format!("panel-{name}-head"))
        .w_full()
        .h(size::pane_head)
        .px(space::within)
        .gap(space::within)
        .center_y()
        .role("button")
        .label(label)
        .expanded(open)
        .on_press(move |s: &mut State| toggle(&mut s.prefs, name))
        .child(icon(&glyphs::CHEVRON_DOWN, space::s5).color(t.text))
        .child(
            text(label.to_uppercase())
                .font(type_::HEADER)
                .color(t.text)
                .truncate()
                .grow(1.0),
        )
        .child(count_cell(count(s, name), dark).key(format!("panel-{name}-count")));
    let body = col()
        .key(format!("panel-{name}-body"))
        .w_full()
        .grow(1.0)
        .min_h(space::s0)
        .scroll(ScrollSpec {
            stick_bottom: false,
        })
        // The padding inside the scroll, so a shut pane's body closes to nothing.
        .child(
            col()
                .w_full()
                .padding(space::pad)
                .child(content(s, name, cx)),
        );
    let mut pane = col()
        .key(format!("panel-{name}"))
        .w_full()
        .h(space::s0)
        .min_h(space::s0)
        .grow(if open { 1.0 } else { 0.0 })
        .clip_soft(space::s0);
    // A rule between panes, none above the first (deck.css's list rules, none after the last).
    if after {
        pane = pane.child(theme::separator(dark));
    }
    pane = pane.child(head).child(body);
    if open {
        pane
    } else {
        pane.inert().a11y_hidden()
    }
}

/// The left side: the icon bar, then the side area of one width with the open panes stacked in
/// it, then the 1 px rule to the body. The handle on the area's inner edge shows only on hover and
/// stays when the area hides, so the area can be dragged back out.
fn left_side(s: &State, cx: &mut Cx<State>) -> El {
    let dark = cx.system_dark();
    let shown = shown(&s.prefs);
    let width = if shown {
        side_width(&s.prefs)
    } else {
        space::s0
    };
    let bar = PANELS.iter().fold(
        col().key("icon-bar").w(size::icon_bar).h_full(),
        |bar, &panel| bar.child(icon_item(s, panel, dark)),
    );
    let mut any_open = false;
    let mut side = col()
        .key("side")
        .w(width)
        .h_full()
        .clip_soft(space::s0)
        .motion(motion::panel);
    for (name, label, _) in &PANELS {
        side = side.child(pane(s, name, label, any_open, cx));
        any_open |= is_open(&s.prefs, name);
    }
    if !shown {
        side = side.inert().a11y_hidden();
    }
    let handle = el()
        .key("side-handle")
        .role("separator")
        .label("Resize the side area")
        .w(size::handle)
        .h_full()
        .pin(
            Some(size::icon_bar + width - size::handle / 2.0),
            Some(space::s0),
            None,
            Some(space::s0),
        )
        .hover(theme::tokens(dark).rule)
        .cursor(Cursor::ResizeColumn)
        .transition(Transition::none())
        .drag_threshold(space::s0)
        .on_drag(|s: &mut State, d: &mut Drag, tx: &mut Tx| drag(s, d, tx));
    row()
        .key("strip-left")
        .h_full()
        .child(bar)
        .child(side)
        .child(theme::separator_vertical(dark))
        .child(handle)
}

/// The window: the title bar, then under it the left side, the centre column, and the right strip.
pub fn strips(s: &State, cx: &mut Cx<State>) -> El {
    let dark = cx.system_dark();
    let t = tok::theme(dark);
    let surface = theme::roles(dark);
    // The caption buttons Rune draws over the band's trailing edge take the text colour.
    cx.caption_color(surface.on_surface);
    let left = left_side(s, cx);
    let none = Value::Null;
    let strip = s.view.regions.get("strip").unwrap_or(&none);
    // The title bar (`app::app`): a press anywhere on it but the caption buttons moves the window,
    // a double press maximises it, and a right press opens the window menu.
    let titlebar = el()
        .key("titlebar")
        .w_full()
        .h(size::titlebar)
        .fill(surface.surface)
        .window_drag();
    let content = row()
        .key("content")
        .w_full()
        .grow(1.0)
        .min_h(space::s0)
        .padding(space::between)
        .pt(space::pad)
        .gap(space::panels)
        .child(left)
        .child(app::center(s, cx).key("centre").grow(1.0).min_w(space::s0))
        .child(regions::strip::draw(
            strip,
            &s.regions.strip,
            &s.pending,
            cx,
        ));
    app::mouse_nav(col().w_full().h_full())
        .fill(t.bg)
        .child(titlebar)
        .child(theme::separator(dark))
        .child(content)
}
