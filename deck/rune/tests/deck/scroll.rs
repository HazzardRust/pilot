//! rune-panes S1: the centre column scrolls (spec 8, 8a). A thread opens at its last message and
//! the wheel, the page keys and Home and End reach both of its ends; a key the reply box holds
//! never scrolls it; home opens at the top; a live refetch leaves a reader scrolled up in place.
//! Every view here is a real scratch deck's, seeded through its own tools.

use crate::support::{Scratch, client_for, id_in, secret, tool};

use pilot_deck::app::{self, State};
use pilot_deck::client::{Client, Query, View};
use rune::{Env, Key, KeyEvent, Mods, Runtime};
use serde_json::json;
use std::sync::Arc;

const REPO: &str = "C:/work/alpha";
const HEIGHT: f32 = 900.0;
const MESSAGES: usize = 60;

/// A question with `MESSAGES` replies from an agent, numbered from 1, on a registered deck.
fn long_thread() -> (Scratch, String) {
    let deck = Scratch::start();
    register(&deck);
    let id = id_in(&tool(
        &deck,
        "deck_post",
        json!({ "kind": "question", "title": "Which port?", "body": "A or B", "repo": REPO, "author": "" }),
    ));
    for n in 1..=MESSAGES {
        say(&deck, &id, n);
    }
    (deck, id)
}

fn register(deck: &Scratch) {
    ureq::post(format!("{}/api/runs", deck.url))
        .header("Authorization", format!("Bearer {}", secret(deck)))
        .send_json(json!({ "repo": REPO, "pid": deck.pid }))
        .expect("a run registers");
}

fn say(deck: &Scratch, id: &str, n: usize) {
    tool(
        deck,
        "deck_reply",
        json!({ "id": id, "text": format!("Message number {n}") }),
    );
}

fn thread_query(id: &str) -> Query {
    Query {
        screen: "thread".into(),
        id: Some(id.into()),
        ..Query::default()
    }
}

fn view_of(client: &Client, query: &Query) -> View {
    client.view(query).expect("the scratch deck's view")
}

/// The whole window on `query`, 900 px tall, with the window's own key route.
fn window(deck: &Scratch, query: &Query) -> Runtime<State> {
    let client = client_for(deck);
    let mut state = State {
        view: view_of(&client, query),
        query: query.clone(),
        ..State::default()
    };
    state.pending.deck = Some(Arc::new(client));
    let mut rt = Runtime::new(state, app::view, (1280.0, HEIGHT), Env::new(true, 1.0));
    rt.on_key = app::spec().on_key;
    rt.frame(0.0);
    rt
}

fn settle(rt: &mut Runtime<State>) {
    for _ in 0..60 {
        rt.frame(1.0 / 60.0);
    }
}

/// The drawn rect of the element in the centre column whose text is `words`; a side pane may
/// say the same words.
fn rect_with(rt: &Runtime<State>, words: &str) -> [f32; 4] {
    let ([left, _, width, _], _) = rt.presented("centre").expect("the centre is drawn");
    rt.elements()
        .into_iter()
        .filter(|e| e.rect[0] >= left && e.rect[0] < left + width)
        .find(|e| e.text.as_deref().map(str::trim) == Some(words))
        .map(|e| e.rect)
        .unwrap_or_else(|| panic!("{words:?} is drawn"))
}

fn focused(rt: &Runtime<State>) -> Option<String> {
    rt.elements()
        .into_iter()
        .find(|e| e.focused)
        .and_then(|e| e.key)
}

/// Whether `r` shows between the fixed tabs header and the window's bottom edge: an element
/// scrolled under the header is not in view.
fn in_window(rt: &Runtime<State>, r: [f32; 4]) -> bool {
    let ([_, top, _, height], _) = rt.presented("header").expect("the header is drawn");
    r[1] >= top + height && r[1] + r[3] <= HEIGHT
}

fn last(rt: &Runtime<State>) -> [f32; 4] {
    rect_with(rt, &format!("Message number {MESSAGES}"))
}

fn press(rt: &mut Runtime<State>, key: Key) {
    rt.key(KeyEvent {
        key,
        mods: Mods::default(),
    });
    settle(rt);
}

fn wheel(rt: &mut Runtime<State>, dy: f32, times: usize) {
    for _ in 0..times {
        rt.wheel(640.0, HEIGHT / 2.0, dy);
        rt.frame(0.0);
    }
    settle(rt);
}

#[test]
fn a_thread_opens_at_its_last_message() {
    let (deck, id) = long_thread();
    let rt = window(&deck, &thread_query(&id));
    let r = last(&rt);
    assert!(
        in_window(&rt, r),
        "the last message is in the window: {r:?}"
    );
}

#[test]
fn the_wheel_reaches_the_top_and_the_bottom() {
    let (deck, id) = long_thread();
    let mut rt = window(&deck, &thread_query(&id));
    wheel(&mut rt, 2000.0, 20);
    let title = rect_with(&rt, "Which port?");
    assert!(
        in_window(&rt, title),
        "the wheel up shows the title: {title:?}"
    );
    assert!(!in_window(&rt, last(&rt)), "and the last message has left");
    wheel(&mut rt, -2000.0, 20);
    let r = last(&rt);
    assert!(
        in_window(&rt, r),
        "the wheel down shows the last message: {r:?}"
    );
}

#[test]
fn keys_scroll_the_centre() {
    let (deck, id) = long_thread();
    let mut rt = window(&deck, &thread_query(&id));
    assert!(!rt.has_focus(), "a thread just opened holds no focus");
    press(&mut rt, Key::PageUp);
    assert!(
        !in_window(&rt, last(&rt)),
        "PageUp moves the last message out"
    );
    press(&mut rt, Key::End);
    assert!(in_window(&rt, last(&rt)), "End brings it back");
    press(&mut rt, Key::Home);
    let title = rect_with(&rt, "Which port?");
    assert!(in_window(&rt, title), "Home shows the title: {title:?}");
    let before = last(&rt)[1];
    press(&mut rt, Key::Down);
    let moved = before - last(&rt)[1];
    assert!(
        (moved - 40.0).abs() <= 1.0,
        "Down moves the centre 40 px: {moved}"
    );
    press(&mut rt, Key::Up);
    assert!((last(&rt)[1] - before).abs() <= 1.0, "Up moves it back");
}

#[test]
fn a_key_in_the_reply_box_is_not_a_scroll() {
    let (deck, id) = long_thread();
    let mut rt = window(&deck, &thread_query(&id));
    let ([x, y, w, h], _) = rt.presented("reply-text").expect("the reply box is drawn");
    let (x, y) = (x + w / 2.0, y + h / 2.0);
    rt.pointer_move(x, y);
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
    settle(&mut rt);
    assert_eq!(
        focused(&rt).as_deref(),
        Some("reply-text"),
        "the box holds focus"
    );
    // At the bottom, where the box shows: Home, Up and PageUp would move the centre were they a
    // scroll. Scrolled up, the box is off screen and a key's caret reveal moves the centre.
    for key in [
        Key::Home,
        Key::End,
        Key::Up,
        Key::Down,
        Key::PageUp,
        Key::PageDown,
    ] {
        let before = last(&rt);
        press(&mut rt, key.clone());
        assert_eq!(
            last(&rt)[1],
            before[1],
            "{key:?} in the reply box moves 0 px"
        );
    }
}

#[test]
fn home_opens_at_the_top_and_the_wheel_reaches_the_last_card() {
    let deck = Scratch::start();
    register(&deck);
    for n in 1..=40 {
        deck.post(&format!("Card number {n}"), REPO);
    }
    let query = Query {
        run: Some(REPO.into()),
        ..Query::default()
    };
    let mut rt = window(&deck, &query);
    settle(&mut rt);
    // The cards' titles, top to bottom as drawn.
    let titles = |rt: &Runtime<State>| {
        let mut all: Vec<[f32; 4]> = (1..=40)
            .map(|n| rect_with(rt, &format!("Card number {n}")))
            .collect();
        all.sort_by(|a, b| a[1].total_cmp(&b[1]));
        all
    };
    let cards = titles(&rt);
    assert!(
        in_window(&rt, cards[0]),
        "the first card is in the window: {:?}",
        cards[0]
    );
    assert!(!in_window(&rt, cards[39]), "the last card is below it");
    wheel(&mut rt, -2000.0, 40);
    let r = titles(&rt)[39];
    assert!(in_window(&rt, r), "the wheel reaches the last card: {r:?}");
}

#[test]
fn a_live_refetch_keeps_a_scrolled_up_thread_in_place() {
    let (deck, id) = long_thread();
    let query = thread_query(&id);
    let mut rt = window(&deck, &query);
    press(&mut rt, Key::PageUp);
    let visible = (1..=MESSAGES)
        .map(|n| format!("Message number {n}"))
        .find(|words| in_window(&rt, rect_with(&rt, words)))
        .expect("a message in the window");
    let before = rect_with(&rt, &visible)[1];
    assert!(!in_window(&rt, last(&rt)), "scrolled up off the bottom");
    assert!(
        !in_window(&rt, rect_with(&rt, "Which port?")),
        "and not to the top: the thread opened at its bottom"
    );

    say(&deck, &id, MESSAGES + 1);
    rt.state.view = view_of(&client_for(&deck), &query);
    settle(&mut rt);
    let after = rect_with(&rt, &visible)[1];
    assert!(
        (after - before).abs() <= 1.0,
        "the first visible message stays put: {before} then {after}"
    );
}
