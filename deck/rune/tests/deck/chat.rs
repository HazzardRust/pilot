//! rune-deck-ui S11: the chat panel drawn from a real scratch deck's view (L7). Enter posts one
//! `Action::Reply` to the deck's chat thread off the UI thread and the draft empties once the deck
//! has taken it; a new message follows the reader only while they are at the bottom.

use crate::support;

use std::sync::Arc;
use std::time::{Duration, Instant};

use pilot_deck::act::Action;
use pilot_deck::app::State;
use pilot_deck::client::{Client, Query, View};
use pilot_deck::regions;
use rune::{Cx, El, Env, Key, KeyEvent, Mods, Runtime, TextEdit};
use serde_json::{Value, json};
use support::{client_for, item, secret, taken};

fn chat_only(s: &State, cx: &mut Cx<State>) -> El {
    let none = Value::Null;
    let v = s.view.regions.get("chat").unwrap_or(&none);
    regions::chat::draw(v, &s.regions.chat, cx)
}

fn press(rt: &mut Runtime<State>, key: Key) {
    rt.key(KeyEvent {
        key,
        mods: Mods::default(),
    });
    rt.frame(0.0);
}

/// A deck with one registered run, so the deck has made its chat; answers the run's repo.
fn a_deck_with_a_chat(deck: &support::Scratch) -> String {
    let dir = deck.dir.join("work");
    std::fs::create_dir_all(&dir).expect("a directory");
    let repo = dir.to_str().expect("a utf-8 path").to_string();
    ureq::post(format!("{}/api/runs", deck.url))
        .header("Authorization", format!("Bearer {}", secret(deck)))
        .send_json(json!({ "repo": repo, "pid": deck.pid }))
        .expect("the run registers");
    repo
}

fn view_of(client: &Client, repo: &str) -> View {
    client
        .view(&Query {
            run: Some(repo.into()),
            ..Query::default()
        })
        .expect("the deck's view")
}

fn chat_id(view: &View) -> String {
    view.regions["chat"]["id"]
        .as_str()
        .expect("the deck's chat thread")
        .to_string()
}

fn window(view: View, client: Client) -> Runtime<State> {
    let mut state = State {
        view,
        ..State::default()
    };
    state.pending.deck = Some(Arc::new(client));
    let mut rt = Runtime::new(state, chat_only, (1280.0, 800.0), Env::new(true, 1.0));
    rt.frame(0.0);
    rt
}

/// Runs the window's own poll until the chat's send has an answer.
fn settle(rt: &mut Runtime<State>) {
    let deadline = Instant::now() + Duration::from_secs(5);
    while rt.state.regions.chat.sending() {
        assert!(Instant::now() < deadline, "the send never answered");
        std::thread::sleep(Duration::from_millis(20));
        rt.update(|s, tx| {
            pilot_deck::app::poll(s, 0.0, tx);
        });
        rt.frame(0.0);
    }
}

fn replies(deck: &support::Scratch, id: &str) -> Vec<Value> {
    item(deck, id)["replies"]
        .as_array()
        .cloned()
        .unwrap_or_default()
}

#[test]
fn enter_posts_one_reply_to_the_chat_and_the_draft_empties_once_taken() {
    let deck = support::Scratch::start();
    let repo = a_deck_with_a_chat(&deck);
    let client = client_for(&deck);
    let view = view_of(&client, &repo);
    let id = chat_id(&view);
    let mut rt = window(view, client);

    rt.state.regions.chat.draft = TextEdit::new("Is the build green?");
    rt.frame(0.0);
    press(&mut rt, Key::Tab);
    press(&mut rt, Key::Enter);
    // In flight: the draft is the user's until the deck takes it, and a second Enter sends nothing more.
    assert_eq!(rt.state.regions.chat.draft.text, "Is the build green?");
    press(&mut rt, Key::Enter);
    settle(&mut rt);

    assert_eq!(rt.state.regions.chat.draft.text, "");
    let said = replies(&deck, &id);
    assert_eq!(said.len(), 1, "one reply posted: {said:?}");
    assert_eq!(said[0]["text"], "Is the build green?");
    assert_eq!(said[0]["from"], "user");

    // A blank draft is no message.
    rt.state.regions.chat.draft = TextEdit::new("   ");
    rt.frame(0.0);
    press(&mut rt, Key::Enter);
    assert!(!rt.state.regions.chat.sending());
    assert_eq!(replies(&deck, &id).len(), 1);
}

#[test]
fn the_box_is_three_lines_tall_and_send_posts_the_draft() {
    let deck = support::Scratch::start();
    let repo = a_deck_with_a_chat(&deck);
    let client = client_for(&deck);
    let view = view_of(&client, &repo);
    let id = chat_id(&view);
    let mut rt = window(view, client);

    let tall = |rt: &Runtime<State>, key: &str| {
        rt.elements()
            .into_iter()
            .find(|e| e.key.as_deref() == Some(key))
            .unwrap_or_else(|| panic!("{key} is drawn"))
            .rect[3]
    };
    let line = 1.25 * pilot_deck::theme::type_::BODY.size;
    assert!(
        tall(&rt, "chat-draft") >= 3.0 * line,
        "the page's rows=\"3\": {} against a line of {line}",
        tall(&rt, "chat-draft")
    );

    rt.state.regions.chat.draft = TextEdit::new("Send by the button");
    rt.frame(0.0);
    let (x, y) = rt.find("chat-send").expect("the Send button is drawn");
    rt.pointer_move(x, y);
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
    rt.frame(0.0);
    settle(&mut rt);

    assert_eq!(rt.state.regions.chat.draft.text, "");
    let said = replies(&deck, &id);
    assert_eq!(said.len(), 1, "one reply posted: {said:?}");
    assert_eq!(said[0]["text"], "Send by the button");
}

#[test]
fn a_send_the_deck_does_not_take_keeps_the_draft_and_says_why() {
    let deck = support::Scratch::start();
    let repo = a_deck_with_a_chat(&deck);
    let client = client_for(&deck);
    let mut view = view_of(&client, &repo);
    let id = chat_id(&view);
    // A thread the deck does not hold: the route refuses it.
    view.regions["chat"]["id"] = json!("itm_000000000000");
    let mut rt = window(view, client);

    rt.state.regions.chat.draft = TextEdit::new("hello?");
    rt.frame(0.0);
    press(&mut rt, Key::Tab);
    press(&mut rt, Key::Enter);
    settle(&mut rt);

    assert_eq!(rt.state.regions.chat.draft.text, "hello?");
    let refused = rt
        .state
        .regions
        .chat
        .refused
        .clone()
        .expect("the refusal is kept");
    assert!(!refused.is_empty());
    let texts: Vec<String> = rt.elements().into_iter().filter_map(|e| e.text).collect();
    assert!(
        texts.iter().any(|t| t.contains(&refused)),
        "the refusal is drawn: {texts:?}"
    );
    assert!(replies(&deck, &id).is_empty());
}

/// A window on a seeded chat view: no deck, no scratch daemon.
fn seeded(chat: Value) -> Runtime<State> {
    let mut state = State::default();
    state.view.regions.insert("chat".into(), chat);
    let mut rt = Runtime::new(state, chat_only, (1280.0, 800.0), Env::new(true, 1.0));
    rt.frame(0.0);
    rt
}

fn two_threads() -> Value {
    json!([
        { "id": "itm_0000000000c1", "title": "Add a dark mode", "href": "/thread/itm_0000000000c1" },
        { "id": "itm_0000000000c2", "title": "Fix the header", "href": "/thread/itm_0000000000c2" },
    ])
}

fn top_of(rt: &Runtime<State>, key: &str) -> f32 {
    let ([_, y, _, _], _) = rt
        .presented(key)
        .unwrap_or_else(|| panic!("no {key} drawn"));
    y
}

#[test]
fn the_create_threads_sit_above_the_messages() {
    let rt = seeded(json!({
        "id": "itm_0000000000a1",
        "messages": [{ "by": "you", "at": null, "text": "hello" }],
        "threads": two_threads(),
    }));

    let first_message = top_of(&rt, "chat-0");
    for key in ["chat-thread-0", "chat-thread-1"] {
        assert!(
            top_of(&rt, key) < first_message,
            "{key} is above the first message"
        );
    }
    assert!(top_of(&rt, "chat-thread-0") < top_of(&rt, "chat-thread-1"));
}

#[test]
fn a_thread_row_opens_its_thread() {
    let mut rt = seeded(json!({
        "id": "itm_0000000000a1",
        "messages": [],
        "threads": two_threads(),
    }));

    let (x, y) = rt.find("chat-thread-1").expect("the second row is drawn");
    rt.pointer_move(x, y);
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
    rt.frame(0.0);

    assert_eq!(rt.state.query.screen, "thread");
    assert_eq!(rt.state.query.id.as_deref(), Some("itm_0000000000c2"));
}

#[test]
fn the_threads_show_with_no_chat_open() {
    let rt = seeded(json!({ "messages": [], "threads": two_threads() }));

    let texts: Vec<String> = rt.elements().into_iter().filter_map(|e| e.text).collect();
    for title in ["Add a dark mode", "Fix the header"] {
        assert!(
            texts.iter().any(|t| t == title),
            "{title} is drawn: {texts:?}"
        );
    }
    // The HTML deck draws the rows alone (render-rail.mjs `if (!chat) return threads;`).
    assert!(
        !texts.iter().any(|t| t.contains("No chat open")),
        "no sentence above the rows: {texts:?}"
    );
}

/// The top and bottom of `key`'s box as the window shows it.
fn span(rt: &Runtime<State>, key: &str) -> (f32, f32) {
    let ([_, y, _, h], _) = rt
        .presented(key)
        .unwrap_or_else(|| panic!("no {key} drawn"));
    (y, y + h)
}

fn shown(rt: &Runtime<State>, key: &str) -> bool {
    let (top, bottom) = span(rt, "chat-messages");
    let (y, end) = span(rt, key);
    y >= top - 1.0 && end <= bottom + 1.0
}

/// Says `text` in the chat through the deck and draws the view it then serves.
fn say_and_redraw(rt: &mut Runtime<State>, client: &Client, repo: &str, id: &str, text: &str) {
    taken(
        client
            .act(&Action::Reply {
                id: id.into(),
                text: text.into(),
                choice: None,
            })
            .expect("an answer"),
    );
    let view = view_of(client, repo);
    rt.update(move |s, _| s.view = view);
    run_for(rt, 1.0);
}

/// Draws frames over `secs` of the window's clock, so every spring lands as it would on screen.
fn run_for(rt: &mut Runtime<State>, secs: f64) {
    for _ in 0..(secs * 60.0) as usize {
        rt.frame(1.0 / 60.0);
    }
}

#[test]
fn a_new_message_follows_the_reader_at_the_bottom_and_leaves_one_scrolled_up_in_place() {
    let deck = support::Scratch::start();
    let repo = a_deck_with_a_chat(&deck);
    let client = client_for(&deck);
    let id = chat_id(&view_of(&client, &repo));
    for n in 0..30 {
        taken(
            client
                .act(&Action::Reply {
                    id: id.clone(),
                    text: format!("line {n}"),
                    choice: None,
                })
                .expect("an answer"),
        );
    }
    let mut rt = window(view_of(&client, &repo), client_for(&deck));
    run_for(&mut rt, 1.0);

    // It opens at the newest message.
    assert!(rt.state.regions.chat.at_bottom, "opens at the bottom");
    assert!(shown(&rt, "chat-29"), "the newest message is in view");
    assert!(!shown(&rt, "chat-0"), "the oldest is scrolled off");

    say_and_redraw(&mut rt, &client, &repo, &id, "line 30");
    assert!(
        shown(&rt, "chat-30"),
        "at the bottom, a new message scrolls into view"
    );
    assert!(rt.state.regions.chat.at_bottom);

    let (top, bottom) = span(&rt, "chat-messages");
    for _ in 0..5 {
        // A positive delta moves the content down: the reader scrolls back up.
        rt.wheel(640.0, (top + bottom) / 2.0, 200.0);
        rt.frame(0.0);
    }
    run_for(&mut rt, 1.0);
    assert!(!rt.state.regions.chat.at_bottom, "scrolled up");
    let marker = (0..=30)
        .map(|n| format!("chat-{n}"))
        .find(|key| shown(&rt, key))
        .expect("a message in view");
    let before = span(&rt, &marker);

    say_and_redraw(&mut rt, &client, &repo, &id, "line 31");
    assert_eq!(span(&rt, &marker), before, "scrolled up, the offset stays");
    assert!(!shown(&rt, "chat-31"));
    assert!(!rt.state.regions.chat.at_bottom);
}
