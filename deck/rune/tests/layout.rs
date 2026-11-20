//! rune-deck-ui S20: the side panels. Chat and Status open on a first start; a panel opens on a
//! spring; a drag tracks the pointer with no snap at the default size; the open set and the sizes
//! come back after a restart; and a three-digit count moves no panel (spec 2, 5, 6d, 6e).

use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};

use pilot_deck::app::{self, State};
use pilot_deck::client::View;
use pilot_deck::layout;
use pilot_deck::prefs::Prefs;
use rune::{Env, Runtime};
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

    press(&mut rt, "panel-agents-head");
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
}

#[test]
fn open_panels_and_sizes_survive_a_restart() {
    let (_held, dir) = prefs_dir("restart");
    let mut rt = window(json!({}), Prefs::default());

    // The top panel, so its grip is in the window whatever stands open under it.
    press(&mut rt, "panel-notifications-head");
    rt.frame(1.0);
    let (x, y) = rt
        .find("panel-notifications-grip")
        .expect("a grip on an open panel");
    rt.pointer_move(x, y);
    rt.pointer_down(x, y);
    for step in 1..=10 {
        rt.pointer_move(x + 3.0 * step as f32, y + 5.0 * step as f32);
        rt.frame(FRAME);
    }
    assert!(
        !Prefs::load(&dir).sizes.contains_key("notifications"),
        "a size was saved before the release"
    );
    rt.pointer_up(x + 30.0, y + 50.0);
    rt.frame(1.0);
    let dragged = body(&rt, "notifications");

    let restarted = Prefs::load(&dir);
    assert!(
        restarted.sizes.contains_key("notifications"),
        "no size saved: {restarted:?}"
    );
    let again = window(json!({}), restarted);
    assert_eq!(
        body(&again, "notifications")[2..],
        dragged[2..],
        "the size came back different"
    );
    assert!(body(&again, "chat")[3] > 0.0, "chat shut after the restart");

    // The open set is kept as left, all of it shut included.
    let mut rt = again;
    for panel in ["notifications", "chat", "status"] {
        press(&mut rt, &format!("panel-{panel}-head"));
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

#[test]
fn a_drag_tracks_the_pointer_with_no_snap_at_the_default() {
    let (_held, _dir) = prefs_dir("drag");
    let open = window(json!({}), Prefs::default());
    let default = body(&open, "chat");
    // Start 40 px short of the default, so the drag crosses it on the way down.
    let mut prefs = Prefs::default();
    layout::resize(&mut prefs, "chat", (default[2], default[3] - 40.0));
    let mut rt = window(json!({}), prefs);

    let (x, y) = rt.find("panel-chat-grip").expect("a grip");
    let grab = y - (body(&rt, "chat")[1] + body(&rt, "chat")[3]);
    rt.pointer_move(x, y);
    rt.pointer_down(x, y);
    let mut last = f32::MIN;
    for step in 1..=40 {
        let py = y + 2.0 * step as f32;
        rt.pointer_move(x, py);
        rt.frame(FRAME);
        let b = body(&rt, "chat");
        let bottom = b[1] + b[3];
        assert!(
            (bottom - (py - grab)).abs() <= 1.0,
            "step {step}: edge {bottom}, pointer {py}"
        );
        assert!(b[3] >= last, "step {step}: {} after {last}", b[3]);
        last = b[3];
    }
    rt.pointer_up(x, y + 80.0);
    assert!(
        last > default[3] + 30.0,
        "the drag stopped at {last}, default {}",
        default[3]
    );
}

/// The notifications view with `n` notices, none of them seen.
fn notices(n: usize) -> Value {
    let notices: Vec<Value> = (0..n)
        .map(|i| json!({ "id": format!("itm_{i:012}"), "title": format!("notice {i}") }))
        .collect();
    json!({ "notifications": { "notices": notices, "open": [] } })
}

fn panel_bounds(rt: &Runtime<State>) -> Vec<[f32; 4]> {
    [
        "notifications",
        "chat",
        "status",
        "agents",
        "tickets",
        "reports",
    ]
    .iter()
    .flat_map(|p| [format!("panel-{p}-head"), format!("panel-{p}-body")])
    .map(|key| rects(rt, &key).1)
    .collect()
}

#[test]
fn a_three_digit_count_moves_nothing() {
    let at_99 = window(notices(99), Prefs::default());
    let at_100 = window(notices(100), Prefs::default());

    assert_eq!(panel_bounds(&at_99), panel_bounds(&at_100));
    let shown = |rt: &Runtime<State>| rects(rt, "panel-notifications-count").1;
    assert_eq!(shown(&at_100)[3], shown(&at_99)[3], "the count wrapped");
    let head = rects(&at_100, "panel-notifications-head").1;
    let chat = rects(&at_100, "panel-chat-head").1;
    assert_eq!(head[3], chat[3], "the header is not one line");

    let at_1000 = window(notices(1000), Prefs::default());
    let texts: Vec<String> = at_1000
        .elements()
        .into_iter()
        .filter_map(|e| e.text)
        .collect();
    assert!(texts.iter().any(|t| t == "999+"), "no 999+ in {texts:?}");
    assert_eq!(panel_bounds(&at_1000), panel_bounds(&at_99));
}
