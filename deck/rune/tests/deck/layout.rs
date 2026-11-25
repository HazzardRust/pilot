//! rune-deck-ui S20 and S28: the left side as VS Code's side bar. Chat and Status open on a first
//! start; a pane opens on a spring; the panes share one width, so their inner edges line up; each
//! icon names its pane and toggles it; the side area's drag tracks the pointer with no snap and
//! hides below its minimum; the open set and the width come back after a restart; and a
//! three-digit count moves nothing (spec 2, 5, 6d, 6e, 19).

use std::path::PathBuf;
use std::sync::MutexGuard;

use pilot_deck::app::{self, State};
use pilot_deck::client::View;
use pilot_deck::prefs::Prefs;
use pilot_deck::theme::{size, space};
use rune::{Env, Key, KeyEvent, Mods, Runtime, TitlebarAction};
use serde_json::{Value, json};

/// Every press here may write the prefs, and where they go is the environment, which the tests
/// of this binary share: each test holds this and points it at a scratch dir of its own.
use crate::support::ENV;

const FRAME: f64 = 1.0 / 60.0;

fn prefs_dir(name: &str) -> (MutexGuard<'static, ()>, PathBuf) {
    let held = ENV.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let dir = std::env::temp_dir().join(format!("pilot-deck-layout-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    // SAFETY: every test in this binary sets the environment here, holding `ENV`.
    unsafe { std::env::set_var("PILOT_DECK_DIR", &dir) };
    (held, dir)
}

fn window(regions: Value, prefs: Prefs) -> Runtime<State> {
    let view = View {
        screen: "home".into(),
        seq: 1,
        regions: regions.as_object().expect("an object of regions").clone(),
    };
    let state = State {
        view,
        prefs,
        ..State::default()
    };
    let mut rt = Runtime::new(state, app::view, (1280.0, 800.0), Env::new(true, 1.0));
    rt.frame(0.0);
    rt.frame(1.0);
    rt
}

/// `(drawn, target)` rects of the element keyed `key`, each `[x, y, w, h]`.
fn rects(rt: &Runtime<State>, key: &str) -> ([f32; 4], [f32; 4]) {
    rt.elements()
        .into_iter()
        .find(|element| element.key.as_deref() == Some(key) && !element.exiting)
        .map(|element| (element.rect, element.target))
        .unwrap_or_else(|| panic!("no {key} drawn"))
}

fn body(rt: &Runtime<State>, panel: &str) -> [f32; 4] {
    rects(rt, &format!("panel-{panel}-body")).0
}

fn press(rt: &mut Runtime<State>, key: &str) {
    let (x, y) = rt.find(key).unwrap_or_else(|| panic!("no {key} drawn"));
    rt.pointer_move(x, y);
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
}

#[test]
fn chat_and_status_open_by_default() {
    let rt = window(json!({}), Prefs::default());

    for panel in ["chat", "status"] {
        assert!(body(&rt, panel)[3] > 0.0, "{panel} is shut");
    }
    for panel in ["notifications", "agents", "tickets", "reports"] {
        assert_eq!(body(&rt, panel)[3], 0.0, "{panel} is open");
    }
}

/// The user's note: the selected icon's coloured bar sits on the window's left edge, no gap.
#[test]
fn the_selected_marker_is_flush_with_the_window_edge() {
    let rt = window(json!({}), Prefs::default());

    assert_eq!(rects(&rt, "icon-chat-marker").0[0], 0.0);
}

#[test]
fn a_panel_opens_with_a_spring() {
    let (_held, _dir) = prefs_dir("spring");
    let mut rt = window(json!({}), Prefs::default());

    press(&mut rt, "icon-agents");
    let mut heights = Vec::new();
    for _ in 0..30 {
        rt.frame(FRAME);
        heights.push(body(&rt, "agents")[3]);
    }

    let open = *heights.last().expect("frames");
    assert!(open > 0.0, "agents never opened: {heights:?}");
    let between = heights
        .iter()
        .filter(|h| **h > 0.5 && **h < open - 0.5)
        .count();
    assert!(
        between >= 3,
        "no spring, only {between} frames between shut and open: {heights:?}"
    );

    // And it shuts on the same spring, never at once.
    rt.frame(1.0);
    press(&mut rt, "icon-agents");
    let mut closing = Vec::new();
    for _ in 0..30 {
        rt.frame(FRAME);
        closing.push(body(&rt, "agents")[3]);
    }
    assert_eq!(
        *closing.last().expect("frames"),
        0.0,
        "agents never shut: {closing:?}"
    );
    let between = closing
        .iter()
        .filter(|h| **h > 0.5 && **h < open - 0.5)
        .count();
    assert!(between >= 3, "shut at once: {closing:?}");
}

const PANELS: [&str; 6] = [
    "notifications",
    "chat",
    "status",
    "agents",
    "tickets",
    "reports",
];

/// Prefs with every pane open and the side area `width` wide.
fn all_open(width: f32) -> Prefs {
    let mut prefs = Prefs::default();
    prefs
        .open_panels
        .extend(PANELS.iter().map(|p| p.to_string()));
    prefs.side_width = Some(width);
    prefs
}

/// S28 behaviour 1: the panes share one side area, so their inner edges line up at any width.
#[test]
fn aligned() {
    for width in [size::side_min, size::side_default, 450.0] {
        let rt = window(json!({}), all_open(width));
        let edges: Vec<f32> = PANELS
            .iter()
            .flat_map(|p| [format!("panel-{p}-head"), format!("panel-{p}-body")])
            .map(|key| {
                let r = rects(&rt, &key).1;
                r[0] + r[2]
            })
            .collect();
        let side = rects(&rt, "side").1;
        assert_eq!(side[2], width, "the side area is not {width} wide");
        for edge in &edges {
            assert!(
                (edge - (side[0] + side[2])).abs() <= 0.5,
                "at {width}: inner edges {edges:?}, side {side:?}"
            );
        }
    }
}

/// S28 behaviour 4: each icon names its panel, and pressing it shows or shuts that pane.
#[test]
fn each_icon_names_its_pane_and_toggles_it() {
    let (_held, _dir) = prefs_dir("icons");
    let mut rt = window(json!({}), Prefs::default());

    let labels = [
        ("notifications", "Notifications"),
        ("chat", "Chat"),
        ("status", "Status"),
        ("agents", "Agents"),
        ("tickets", "Tickets"),
        ("reports", "Closing reports"),
    ];
    let elements = rt.elements();
    for (name, label) in labels {
        let icon = elements
            .iter()
            .find(|e| e.key.as_deref() == Some(&format!("icon-{name}")))
            .unwrap_or_else(|| panic!("no icon for {name}"));
        assert_eq!(icon.help.as_deref(), Some(label), "{name}'s tooltip");
        assert_eq!(icon.label.as_deref(), Some(label), "{name}'s label");
        assert_eq!(icon.role, "button", "{name}'s role");
    }

    press(&mut rt, "icon-agents");
    rt.frame(1.0);
    assert!(body(&rt, "agents")[3] > 0.0, "agents did not show");
    press(&mut rt, "icon-agents");
    rt.frame(1.0);
    assert_eq!(body(&rt, "agents")[3], 0.0, "agents did not shut");
}

#[test]
fn an_old_prefs_file_still_loads() {
    let (_held, dir) = prefs_dir("old");
    std::fs::create_dir_all(&dir).expect("a scratch dir");
    let old = json!({
        "open_panels": ["~", "agents"],
        "sizes": { "agents": [304.0, 240.0] },
        "hidden_reports": ["itm_000000000001"]
    });
    std::fs::write(dir.join("rune-deck.json"), old.to_string()).expect("an old file");

    let prefs = Prefs::load(&dir);
    assert!(prefs.open_panels.contains("agents"), "{prefs:?}");
    assert!(
        prefs.hidden_reports.contains("itm_000000000001"),
        "{prefs:?}"
    );
}

#[test]
fn the_open_panes_and_side_width_survive_a_restart() {
    let (_held, dir) = prefs_dir("restart");
    let mut rt = window(json!({}), Prefs::default());

    let (x, y) = rt.find("side-handle").expect("a handle on the side area");
    rt.pointer_move(x, y);
    rt.pointer_down(x, y);
    for step in 1..=10 {
        rt.pointer_move(x + 3.0 * step as f32, y);
        rt.frame(FRAME);
    }
    assert_eq!(
        Prefs::load(&dir).side_width,
        None,
        "a width was saved before the release"
    );
    rt.pointer_up(x + 30.0, y);
    rt.frame(1.0);
    let dragged = rects(&rt, "side").0;

    let restarted = Prefs::load(&dir);
    let again = window(json!({}), restarted);
    assert_eq!(
        rects(&again, "side").0[2],
        dragged[2],
        "the width came back different"
    );
    assert!(body(&again, "chat")[3] > 0.0, "chat shut after the restart");

    // The open set is kept as left, all of it shut included.
    let mut rt = again;
    for panel in ["chat", "status"] {
        press(&mut rt, &format!("icon-{panel}"));
        rt.frame(1.0);
    }
    let shut = window(json!({}), Prefs::load(&dir));
    for panel in ["notifications", "chat", "status"] {
        assert_eq!(
            body(&shut, panel)[3],
            0.0,
            "{panel} reopened after a restart"
        );
    }
}

/// S28 behaviour 2 (6d): the side area's edge is the pointer's on every frame, with no snap at the
/// default; and dragged below its minimum, the area hides.
#[test]
fn a_drag_tracks_the_pointer_with_no_snap_at_the_default() {
    let (_held, _dir) = prefs_dir("drag");
    // Start 40 px short of the default, so the drag crosses it.
    let prefs = Prefs {
        side_width: Some(size::side_default - 40.0),
        ..Prefs::default()
    };
    let mut rt = window(json!({}), prefs);

    let (x, y) = rt.find("side-handle").expect("a handle");
    let side = rects(&rt, "side").0;
    let grab = x - (side[0] + side[2]);
    rt.pointer_move(x, y);
    rt.pointer_down(x, y);
    let mut last = f32::MIN;
    for step in 1..=40 {
        let px = x + 2.0 * step as f32;
        rt.pointer_move(px, y);
        rt.frame(FRAME);
        let s = rects(&rt, "side").0;
        let edge = s[0] + s[2];
        assert!(
            (edge - (px - grab)).abs() <= 1.0,
            "step {step}: edge {edge}, pointer {px}"
        );
        assert!(s[2] >= last, "step {step}: {} after {last}", s[2]);
        last = s[2];
    }
    rt.pointer_up(x + 80.0, y);
    assert!(
        last > size::side_default + 30.0,
        "the drag stopped at {last}, default {}",
        size::side_default
    );

    // Dragged below the minimum, the area hides; an icon brings it back.
    rt.frame(1.0);
    let (x, y) = rt.find("side-handle").expect("a handle");
    rt.pointer_move(x, y);
    rt.pointer_down(x, y);
    let under = last - size::side_min + 20.0;
    for step in 1..=10 {
        rt.pointer_move(x - under * step as f32 / 10.0, y);
        rt.frame(FRAME);
    }
    rt.pointer_up(x - under, y);
    rt.frame(1.0);
    assert!(rt.state.prefs.side_hidden, "the side area did not hide");
    assert_eq!(rects(&rt, "side").0[2], 0.0, "the side area still shows");
    press(&mut rt, "icon-chat");
    rt.frame(1.0);
    assert!(body(&rt, "chat")[3] > 0.0, "chat did not come back");
    assert!(
        rects(&rt, "side").0[2] >= size::side_min,
        "came back too narrow"
    );
}

/// S28 behaviour 2, from the hidden side: the handle drags the area back out from where it shows
/// (no jump to the width it last had), and Escape puts back exactly what the drag moved.
#[test]
fn a_hidden_side_drags_back_out_and_escape_puts_it_back() {
    let (_held, _dir) = prefs_dir("hidden");
    let prefs = Prefs {
        side_width: Some(size::side_default),
        side_hidden: true,
        ..Prefs::default()
    };
    let mut rt = window(json!({}), prefs);

    let (x, y) = rt.find("side-handle").expect("a handle on a hidden side");
    assert_eq!(rects(&rt, "side").0[2], 0.0, "the hidden side shows");
    rt.pointer_move(x, y);
    rt.pointer_down(x, y);
    let out = size::side_min + 30.0;
    rt.pointer_move(x + out, y);
    rt.frame(FRAME);
    let s = rects(&rt, "side").0;
    assert!(
        (s[2] - out).abs() <= 1.0,
        "dragged {out} out of hiding, the side is {} wide",
        s[2]
    );

    rt.key(KeyEvent {
        key: Key::Escape,
        mods: Mods::default(),
    });
    rt.frame(1.0);
    assert!(rt.state.prefs.side_hidden, "Escape left the side showing");
    assert_eq!(rt.state.prefs.side_width, Some(size::side_default));
}

/// The notifications view with `n` notices, none of them seen.
fn notices(n: usize) -> Value {
    let notices: Vec<Value> = (0..n)
        .map(|i| json!({ "id": format!("itm_{i:012}"), "title": format!("notice {i}") }))
        .collect();
    json!({ "notifications": { "notices": notices, "open": [] } })
}

/// Every icon, the first heading, and each heading's and body's x and width. A pane is as tall as
/// what it holds (QA e), so a hundredth notice lengthens Notifications and moves the panes under
/// it; the count's digit moves none of these.
fn panel_bounds(rt: &Runtime<State>) -> Vec<[f32; 4]> {
    let icons = PANELS.iter().map(|p| rects(rt, &format!("icon-{p}")).1);
    let columns = PANELS
        .iter()
        .flat_map(|p| [format!("panel-{p}-head"), format!("panel-{p}-body")])
        .map(|key| {
            let r = rects(rt, &key).1;
            [r[0], 0.0, r[2], 0.0]
        });
    icons
        .chain([rects(rt, "panel-notifications-head").1])
        .chain(columns)
        .collect()
}

/// QA e: an open pane is as tall as what it holds, the next one starts where it ends with no
/// gap, and the room left over stays below the last.
#[test]
fn open_panes_touch_and_take_only_their_contents_height() {
    let rt = window(notices(2), all_open(size::side_default));
    let panes: Vec<[f32; 4]> = PANELS
        .iter()
        .map(|p| rects(&rt, &format!("panel-{p}")).1)
        .collect();
    for pair in panes.windows(2) {
        let (above, below) = (pair[0], pair[1]);
        assert!(
            (above[1] + above[3] - below[1]).abs() <= 0.5,
            "a gap between panes: {above:?} then {below:?}"
        );
    }
    let side = rects(&rt, "side").1;
    let last = panes[panes.len() - 1];
    assert!(
        last[1] + last[3] < side[1] + side[3] - size::row,
        "the panes fill the side area: last {last:?}, side {side:?}"
    );
    let agents = rects(&rt, "panel-agents").1[3];
    let notifications = rects(&rt, "panel-notifications").1[3];
    assert!(
        agents < notifications,
        "an empty pane ({agents}) as tall as two notices ({notifications})"
    );
}

/// QA j: the border between two open panes drags up and down, one pane taking what the other
/// gives, on the pointer; the two heights are saved on the release and come back on a restart.
#[test]
fn a_dragged_border_resizes_both_panes_and_persists() {
    let (_held, dir) = prefs_dir("border");
    let mut rt = window(notices(5), all_open(size::side_default));
    let height = |rt: &Runtime<State>, p: &str| rects(rt, &format!("panel-{p}")).1[3];
    let (above, below) = (height(&rt, "notifications"), height(&rt, "chat"));

    let border = rects(&rt, "panel-chat-border").0;
    let (x, y) = (border[0] + border[2] / 2.0, border[1] + border[3] / 2.0);
    rt.pointer_move(x, y);
    rt.pointer_down(x, y);
    for step in 1..=10 {
        rt.pointer_move(x, y - 3.0 * step as f32);
        rt.frame(FRAME);
    }
    assert!(
        Prefs::load(&dir).pane_heights.is_empty(),
        "heights saved before the release"
    );
    rt.pointer_up(x, y - 30.0);
    rt.frame(1.0);
    assert_eq!(height(&rt, "notifications"), above - 30.0, "the pane above");
    assert_eq!(height(&rt, "chat"), below + 30.0, "the pane below");

    let again = window(notices(5), Prefs::load(&dir));
    assert_eq!(
        height(&again, "notifications"),
        above - 30.0,
        "after a restart"
    );
    assert_eq!(height(&again, "chat"), below + 30.0, "after a restart");
}

/// QA h: a heading's press folds its pane to the heading row and the next unfolds it; the pane
/// stays open, and the fold is kept apart from the open set.
#[test]
fn a_heading_folds_its_pane_and_keeps_it_open() {
    let (_held, dir) = prefs_dir("fold");
    let mut rt = window(notices(3), all_open(size::side_default));
    let open = body(&rt, "notifications")[3];

    press(&mut rt, "panel-notifications-head");
    rt.frame(1.0);
    assert_eq!(
        body(&rt, "notifications")[3],
        0.0,
        "folded, the body still shows"
    );
    assert_eq!(
        rects(&rt, "panel-notifications-head").0[3],
        size::pane_head,
        "folded, the heading is not one row"
    );
    let kept = Prefs::load(&dir);
    assert!(kept.folded_panels.contains("notifications"), "{kept:?}");
    assert!(kept.open_panels.contains("notifications"), "{kept:?}");

    press(&mut rt, "panel-notifications-head");
    rt.frame(1.0);
    assert_eq!(body(&rt, "notifications")[3], open, "it did not unfold");
    assert!(!Prefs::load(&dir).folded_panels.contains("notifications"));
}

/// QA e: the first pane's heading and the first icon start where the centre's header does, 40 px
/// under the title bar's rule (deck.css `--top`).
#[test]
fn the_first_heading_and_icon_start_at_the_top_inset() {
    let rt = window(json!({}), all_open(size::side_default));
    let top = rects(&rt, "header").1[1];
    assert_eq!(top, size::titlebar + 1.0 + space::pad + space::s7);
    assert_eq!(rects(&rt, "panel-notifications-head").1[1], top, "heading");
    assert_eq!(rects(&rt, "icon-notifications-glyph").1[1], top, "icon");
}

/// QA g (the user, 2026-11-20): three line levels in the side area. A pane's line, the first
/// pane's included, spans the content column; a line between groups (Red / Yellow) is shorter
/// and centred; a line between items narrower still and centred.
#[test]
fn side_rules_come_in_three_levels_each_centred() {
    let repo = "C:/work/alpha";
    let row = |id: &str| json!({ "id": id, "name": id, "state": "queued", "canMove": { "up": false, "down": false } });
    let regions = json!({
        "notifications": { "notices": [{ "id": "itm_n1", "title": "a notice" }], "open": [] },
        "tickets": { "repo": repo, "groups": [
            { "colour": "red", "label": "Red", "rows": [row("itm_t1"), row("itm_t2")] },
            { "colour": "yellow", "label": "Yellow", "rows": [row("itm_t3")] },
        ] },
    });
    let mut prefs = all_open(size::side_default);
    let folds = prefs.folds.entry(repo.into()).or_default();
    folds.insert("red".into());
    folds.insert("yellow".into());
    let rt = window(regions, prefs);
    let body = body(&rt, "tickets");
    let centre = body[0] + body[2] / 2.0;
    let line = |key: &str| rects(&rt, key).1;

    let first = line("panel-notifications-rule");
    let head = line("panel-notifications-head");
    assert_eq!(first[1] + 1.0 + space::s3, head[1], "first pane's line");
    let parent = line("panel-tickets-rule");
    assert_eq!(
        parent[2],
        body[2] - 2.0 * space::pad,
        "a pane's line spans the content"
    );
    let group = line("tickets-group-yellow-rule");
    let item = line("ticket-itm_t1-rule");
    assert!(
        group[2] < parent[2] - 2.0 * space::s5,
        "group {group:?}, pane {parent:?}"
    );
    assert!(
        item[2] < group[2] - 2.0 * space::s5,
        "item {item:?}, group {group:?}"
    );
    for (name, r) in [("pane", parent), ("group", group), ("item", item)] {
        assert_eq!(r[3], 1.0, "{name} line is a hairline");
        assert!(
            (r[0] + r[2] / 2.0 - centre).abs() <= 0.5,
            "{name} off centre: {r:?}"
        );
    }
}

/// S28 behaviour 3 (6e): a count gaining a digit moves no pane and no icon, and stays on one line.
#[test]
fn a_three_digit_count_moves_nothing() {
    let draw = |n: usize| window(notices(n), all_open(size::side_default));
    let (at_1, at_99, at_100) = (draw(1), draw(99), draw(100));

    assert_eq!(panel_bounds(&at_99), panel_bounds(&at_100));
    let shown = |rt: &Runtime<State>| rects(rt, "panel-notifications-count").1;
    assert_eq!(shown(&at_100)[3], shown(&at_1)[3], "the count wrapped");
    assert_eq!(shown(&at_100)[3], shown(&at_99)[3], "the count wrapped");
    let head = rects(&at_100, "panel-notifications-head").1;
    assert_eq!(head[3], size::pane_head, "the header is not one line");

    let at_1000 = draw(1000);
    let texts: Vec<String> = at_1000
        .elements()
        .into_iter()
        .filter_map(|e| e.text)
        .collect();
    assert!(texts.iter().any(|t| t == "999+"), "no 999+ in {texts:?}");
    assert_eq!(panel_bounds(&at_1000), panel_bounds(&at_99));
}

/// QA: an icon's count is a badge on its top-right corner, inside the icon bar, clear of the
/// glyph's lower half and, for one digit, its left half; not a wide pill over the glyph.
#[test]
fn an_icon_count_sits_on_its_corner_clear_of_the_glyph() {
    for n in [6, 100, 1000] {
        let rt = window(notices(n), all_open(size::side_default));
        let item = rects(&rt, "icon-notifications").1;
        let badge = rects(&rt, "icon-notifications-count").1;
        let (cx, cy) = (item[0] + item[2] / 2.0, item[1] + item[3] / 2.0);

        assert!(badge[0] >= item[0], "{n}: badge left of the bar {badge:?}");
        assert!(
            badge[0] + badge[2] <= item[0] + item[2],
            "{n}: badge past the bar {badge:?} in {item:?}"
        );
        assert!(badge[1] >= item[1], "{n}: badge above its icon {badge:?}");
        assert!(
            badge[1] + badge[3] <= cy,
            "{n}: badge over the glyph's lower half {badge:?}"
        );
        if n < 10 {
            assert!(
                badge[0] >= cx,
                "{n}: badge over the glyph's left half {badge:?}"
            );
        }
    }
}

/// S27: the window draws its own title bar, a band across the top that drags the window, and the
/// content starts below it at the top inset.
#[test]
fn the_frame_is_a_drag_band_with_the_content_below_it() {
    let (_held, _dir) = prefs_dir("frame");
    let mut rt = app::app().headless_runtime((1280.0, 800.0), Env::new(true, 1.0));
    rt.frame(0.0);
    rt.frame(1.0);

    if cfg!(any(target_os = "windows", target_os = "macos")) {
        assert_eq!(
            rt.chrome_insets().height,
            size::titlebar,
            "no custom title bar"
        );
    }
    let band = rects(&rt, "titlebar").0;
    assert_eq!(band, [0.0, 0.0, 1280.0, size::titlebar], "the band");
    let (x, y) = (band[2] / 2.0, band[3] / 2.0);
    rt.pointer_move(x, y);
    rt.pointer_down(x, y);
    assert_eq!(
        rt.take_titlebar_action(),
        Some(TitlebarAction::Drag),
        "the band drags nothing"
    );
    rt.pointer_up(x, y);
    // The readout and the wordmark moved into the band (the user, 2026-11-21) do not take its press.
    rt.update(|s, _| {
        s.view.regions.insert(
            "usage".into(),
            serde_json::json!({ "ctx": 40, "session": 2, "weekly": 93 }),
        );
    });
    rt.frame(1.5);
    for key in ["brand", "usage-weekly"] {
        let r = rects(&rt, key).0;
        let (x, y) = (r[0] + r[2] / 2.0, r[1] + r[3] / 2.0);
        rt.pointer_move(x, y);
        rt.pointer_down(x, y);
        assert_eq!(
            rt.take_titlebar_action(),
            Some(TitlebarAction::Drag),
            "a press on {key} drags nothing"
        );
        rt.pointer_up(x, y);
        rt.frame(2.0);
    }

    let top = size::titlebar + space::pad;
    for key in ["strip-left", "centre"] {
        let content = rects(&rt, key).0;
        assert!(
            content[1] >= top,
            "{key} starts at {}, above {top}",
            content[1]
        );
    }
}

fn archive_window(screen: &str) -> Runtime<State> {
    let mut state = State::default();
    state.query.screen = screen.into();
    let mut rt = Runtime::new(state, app::view, (1280.0, 800.0), Env::new(true, 1.0));
    rt.frame(0.0);
    rt.frame(1.0);
    rt
}

/// archive-page S16 (spec 10): the Archive is the bar's last entry, below Tickets and Closing reports.
#[test]
fn the_archive_entry_is_the_last_icon_of_the_bar() {
    let rt = archive_window("home");
    let order = [
        "icon-notifications",
        "icon-chat",
        "icon-status",
        "icon-agents",
        "icon-tickets",
        "icon-reports",
        "icon-archive",
    ];
    let tops: Vec<f32> = order.iter().map(|key| rects(&rt, key).0[1]).collect();
    assert!(
        tops.windows(2).all(|w| w[0] < w[1]),
        "{order:?} at {tops:?}"
    );
    assert_eq!(
        rects(&rt, "icon-archive").0[0],
        rects(&rt, "icon-reports").0[0]
    );
}

/// Spec 10: a press goes to the archive screen and moves no pane; the icon is marked there, and a
/// second press goes back.
#[test]
fn the_archive_entry_opens_the_archive_screen_and_is_marked_there() {
    let mut rt = archive_window("home");
    let marked = |rt: &Runtime<State>| rt.find("icon-archive-marker").is_some();
    assert!(!marked(&rt), "marked on home");
    let open_before = rt.state.prefs.open_panels.clone();

    press(&mut rt, "icon-archive");
    rt.frame(1.0);
    assert_eq!(rt.state.query.screen, "archive");
    assert_eq!(rt.state.prefs.open_panels, open_before, "a pane moved");
    assert!(marked(&rt), "not marked on the archive screen");

    press(&mut rt, "icon-archive");
    rt.frame(1.0);
    assert_eq!(rt.state.query.screen, "home");
    assert!(!marked(&rt), "still marked after Back");
}
