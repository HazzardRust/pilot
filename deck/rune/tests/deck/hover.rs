//! rune-deck-ui S26: every control says clickable. On the overview, an open thread and the items
//! page, every pressable shows a hover tint and the pointer cursor, and plain text reacts to
//! nothing. Drawn from a view a real scratch deck served (L7).

use crate::support;

use std::sync::Arc;

use pilot_deck::app::{self, State};
use pilot_deck::client::Query;
use rune::runtime::ElementInfo;
use rune::{Cursor, Env, Key, KeyEvent, Mods, Runtime};
use serde_json::json;
use support::{Scratch, client_for, frame_until, id_in, live_window, secret, tool};

const REPO: &str = "C:/work/alpha";

fn drawn(deck: &Scratch, query: &Query) -> Runtime<State> {
    let client = client_for(deck);
    let view = client.view(query).expect("the scratch deck's view");
    let mut state = State {
        view,
        ..State::default()
    };
    state.pending.deck = Some(Arc::new(client));
    let mut rt = Runtime::new(state, app::view, (1280.0, 800.0), Env::new(true, 1.0));
    rt.frame(0.0);
    rt
}

fn seeded() -> (Scratch, String) {
    let deck = Scratch::start();
    let id = id_in(&tool(
        &deck,
        "deck_post",
        json!({ "kind": "question", "title": "Which?", "body": "A or B", "repo": REPO, "author": "", "options": ["A", "B"] }),
    ));
    ureq::post(format!("{}/api/runs", deck.url))
        .header("Authorization", format!("Bearer {}", secret(&deck)))
        .send_json(json!({ "repo": REPO, "pid": deck.pid }))
        .expect("a run registers");
    (deck, id)
}

fn screens(id: &str) -> Vec<(&'static str, Query)> {
    let query = |screen: &str, id: Option<&str>| Query {
        screen: screen.into(),
        id: id.map(str::to_string),
        ..Query::default()
    };
    vec![
        ("overview", Query::default()),
        ("thread", query("thread", Some(id))),
        ("items", query("items", None)),
    ]
}

/// A pressable: the button, link and switch roles every press handler here carries.
fn is_control(e: &ElementInfo) -> bool {
    !e.exiting && (e.role == "button" || e.role == "link" || e.role == "switch")
}

fn centre(e: &ElementInfo) -> Option<(f32, f32)> {
    let [x, y, w, h] = e.visible;
    (w > 1.0 && h > 1.0).then_some((x + w / 2.0, y + h / 2.0))
}

fn at_path(rt: &Runtime<State>, path: &str) -> Option<ElementInfo> {
    rt.elements().into_iter().find(|e| e.path == path)
}

/// Moves over `e`, lets the tint ease in, and answers what the window then shows there.
fn hovered(rt: &mut Runtime<State>, e: &ElementInfo) -> (f32, Cursor) {
    let (x, y) = centre(e).expect("a visible element");
    rt.pointer_move(x, y);
    for _ in 0..30 {
        rt.frame(1.0 / 60.0);
    }
    let seen = at_path(rt, &e.path).map_or(0.0, |e| e.hover);
    (seen, rt.cursor())
}

#[test]
fn every_control_hovers() {
    let (deck, id) = seeded();
    let mut tried = 0;
    let mut bad = vec![];
    for (name, query) in screens(&id) {
        let mut rt = drawn(&deck, &query);
        let controls: Vec<ElementInfo> = rt
            .elements()
            .into_iter()
            .filter(|e| is_control(e) && centre(e).is_some())
            .collect();
        assert!(!controls.is_empty(), "{name} draws no control");
        for e in controls {
            let (tint, cursor) = hovered(&mut rt, &e);
            tried += 1;
            if tint <= 0.0 || cursor != Cursor::Pointer {
                bad.push(format!(
                    "{name}: {:?} {:?} tint {tint} {cursor:?}",
                    e.key, e.label
                ));
            }
        }
    }
    assert!(tried > 5, "only {tried} controls found");
    assert!(
        bad.is_empty(),
        "{} do not say clickable:\n{}",
        bad.len(),
        bad.join("\n")
    );
}

#[test]
fn plain_text_is_still() {
    let (deck, id) = seeded();
    let mut seen = 0;
    for (name, query) in screens(&id) {
        let mut rt = drawn(&deck, &query);
        let all = rt.elements();
        let plain: Vec<ElementInfo> = all
            .iter()
            .enumerate()
            .filter(|(_, e)| e.text.is_some() && centre(e).is_some())
            .filter(|(i, _)| {
                let mut at = Some(*i);
                while let Some(n) = at {
                    if is_control(&all[n]) {
                        return false;
                    }
                    at = all[n].parent;
                }
                true
            })
            .map(|(_, e)| e.clone())
            .collect();
        for e in plain {
            let (tint, cursor) = hovered(&mut rt, &e);
            seen += 1;
            assert!(
                tint == 0.0 && cursor != Cursor::Pointer,
                "{name}: text {:?} reacts: tint {tint} {cursor:?}",
                e.text
            );
        }
    }
    assert!(seen > 2, "only {seen} plain texts found");
}

fn focused_key(rt: &Runtime<State>) -> Option<String> {
    rt.elements()
        .into_iter()
        .find(|e| e.focused)
        .and_then(|e| e.key)
}

fn tab(rt: &mut Runtime<State>, shift: bool) {
    let mods = Mods {
        shift,
        ..Mods::default()
    };
    rt.key(KeyEvent {
        key: Key::Tab,
        mods,
    });
    rt.frame(1.0 / 60.0);
}

/// From the reply box, Tab walks on to the reply buttons and Shift+Tab walks back to the box.
#[test]
fn tab_order_reaches_the_reply_buttons_and_returns() {
    let (deck, id) = seeded();
    let mut rt = live_window(&deck);
    let title = format!("card-{id}-title");
    frame_until(&mut rt, "the card", |rt| {
        rt.elements()
            .iter()
            .any(|e| e.key.as_deref() == Some(title.as_str()))
    });
    let card = rt
        .elements()
        .into_iter()
        .find(|e| e.key.as_deref() == Some(title.as_str()))
        .expect("the card");
    let (x, y) = centre(&card).expect("a visible card");
    rt.pointer_move(x, y);
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
    frame_until(&mut rt, "the reply box", |rt| {
        rt.elements()
            .iter()
            .any(|e| e.key.as_deref() == Some("reply-text"))
    });
    let field = rt
        .elements()
        .into_iter()
        .find(|e| e.key.as_deref() == Some("reply-text"))
        .expect("the reply box");
    let (x, y) = centre(&field).expect("a visible box");
    rt.pointer_move(x, y);
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
    rt.frame(1.0 / 60.0);
    assert_eq!(focused_key(&rt).as_deref(), Some("reply-text"));

    let mut forward = vec![];
    for _ in 0..8 {
        tab(&mut rt, false);
        forward.extend(focused_key(&rt));
    }
    assert!(
        forward.iter().any(|k| k == "send"),
        "Tab from the box reaches Reply; it visited {forward:?}"
    );

    let mut back = vec![];
    for _ in 0..16 {
        tab(&mut rt, true);
        back.extend(focused_key(&rt));
    }
    assert!(
        back.iter().any(|k| k == "reply-text"),
        "Shift+Tab comes back to the box; it visited {back:?}"
    );
}

/// The hairline is 1 px thick in the rule colour, either way round, light and dark.
#[test]
fn a_separator_is_one_pixel_in_the_rule_colour() {
    for dark in [false, true] {
        fn view(_: &State, cx: &mut rune::Cx<State>) -> rune::El {
            let dark = cx.system_dark();
            rune::col()
                .w(200.0)
                .h(100.0)
                .child(pilot_deck::theme::separator(dark).key("across"))
                .child(pilot_deck::theme::separator_vertical(dark).key("down"))
        }
        let mut rt = Runtime::new(State::default(), view, (200.0, 100.0), Env::new(dark, 1.0));
        rt.frame(0.0);
        let rule = pilot_deck::theme::tokens(dark).rule;
        let seen = |key: &str| {
            rt.elements()
                .into_iter()
                .find(|e| e.key.as_deref() == Some(key))
                .unwrap_or_else(|| panic!("no {key}"))
        };
        let (across, down) = (seen("across"), seen("down"));
        assert_eq!(
            across.rect[3], 1.0,
            "dark={dark}: a horizontal rule is 1 px tall"
        );
        assert_eq!(
            down.rect[2], 1.0,
            "dark={dark}: a vertical rule is 1 px wide"
        );
        assert!(
            across.rect[2] > 1.0 && down.rect[3] > 1.0,
            "they span their parent"
        );
        assert_eq!(across.fill, rule);
        assert_eq!(down.fill, rule);
    }
}
