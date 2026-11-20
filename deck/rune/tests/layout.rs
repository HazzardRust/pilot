//! rune-deck-ui S20 and S28: the left side as VS Code's side bar. Chat and Status open on a first
//! start; a pane opens on a spring; the panes share one width, so their inner edges line up; each
//! icon names its pane and toggles it; the side area's drag tracks the pointer with no snap and
//! hides below its minimum; the open set and the width come back after a restart; and a
//! three-digit count moves nothing (spec 2, 5, 6d, 6e, 19).

use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};

use pilot_deck::app::{self, State};
use pilot_deck::client::View;
use pilot_deck::prefs::Prefs;
use pilot_deck::theme::{size, space};
use rune::{Env, Key, KeyEvent, Mods, Runtime, TitlebarAction};
use serde_json::{Value, json};

/// Every press here may write the prefs, and where they go is the environment, which the tests
/// of this binary share: each test holds this and points it at a scratch dir of its own.
static ENV: Mutex<()> = Mutex::new(());

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
    assert!(prefs.hidden_reports.contains("itm_000000000001"), "{prefs:?}");
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
    let mut prefs = Prefs::default();
    prefs.side_width = Some(size::side_default - 40.0);
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
    assert!(rects(&rt, "side").0[2] >= size::side_min, "came back too narrow");
}

/// S28 behaviour 2, from the hidden side: the handle drags the area back out from where it shows
/// (no jump to the width it last had), and Escape puts back exactly what the drag moved.
#[test]
fn a_hidden_side_drags_back_out_and_escape_puts_it_back() {
    let (_held, _dir) = prefs_dir("hidden");
    let mut prefs = Prefs::default();
    prefs.side_width = Some(size::side_default);
    prefs.side_hidden = true;
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

fn panel_bounds(rt: &Runtime<State>) -> Vec<[f32; 4]> {
    PANELS
        .iter()
        .flat_map(|p| {
            [
                format!("icon-{p}"),
                format!("panel-{p}-head"),
                format!("panel-{p}-body"),
            ]
        })
        .map(|key| rects(rt, &key).1)
        .collect()
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
