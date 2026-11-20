//! rune-deck-ui S7: the queue's cards and lane lines, drawn from a view a real scratch deck served (L7), and
//! an option press posted once through the write seam.

mod support;

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use pilot_deck::app::{self, State};
use pilot_deck::client::{Client, Query};
use pilot_deck::theme;
use rune::runtime::ElementInfo;
use rune::{App, Env, Runtime};
use serde_json::{Value, json};
use support::Scratch;

/// Spec 4's bar: a post shows within 1 s.
const BUDGET: Duration = Duration::from_millis(1000);

/// The client reads its address from the environment, which every test in this binary shares.
static ENV: Mutex<()> = Mutex::new(());

/// Runs `make` with the deck's address in the environment, as the window's own start reads it.
fn with_deck<T>(deck: &Scratch, make: impl FnOnce() -> T) -> T {
    let _held = ENV.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let port = deck.port.to_string();
    let vars = [
        ("PILOT_DECK_DIR", deck.dir.to_str().expect("a utf-8 dir")),
        ("PILOT_DECK_PORT", port.as_str()),
    ];
    // SAFETY: every test in this binary that touches the environment holds `ENV`.
    unsafe {
        vars.iter()
            .for_each(|(name, value)| std::env::set_var(name, value))
    };
    let made = make();
    unsafe { vars.iter().for_each(|(name, _)| std::env::remove_var(name)) };
    made
}

fn client_for(deck: &Scratch) -> Client {
    with_deck(deck, Client::from_env).expect("a loopback client")
}

fn secret(deck: &Scratch) -> String {
    std::fs::read_to_string(deck.dir.join("deck.secret"))
        .expect("the scratch deck's secret")
        .trim()
        .to_string()
}

/// A question with options on `repo`, posted by a session's tool call; answers its id.
fn question(deck: &Scratch, title: &str, repo: &str) -> String {
    post(
        deck,
        json!({
        "kind": "question", "title": title, "body": "Port 4321 or 4322?", "repo": repo, "author": "",
        "options": ["4321", "4322"] }),
    )
}

/// One `deck_post` by a session's tool call; answers the new item's id.
fn post(deck: &Scratch, arguments: Value) -> String {
    let mut response = ureq::post(format!("{}/api/tool", deck.url))
        .header("Authorization", format!("Bearer {}", secret(deck)))
        .send_json(json!({ "name": "deck_post", "arguments": arguments }))
        .expect("the scratch deck takes the post");
    let body: Value = response.body_mut().read_json().expect("json");
    let text = body["content"][0]["text"].as_str().expect("posted");
    let at = text.find("itm_").expect("an item id");
    let hex: String = text[at + 4..]
        .chars()
        .take_while(char::is_ascii_hexdigit)
        .collect();
    format!("itm_{hex}")
}

fn replies(deck: &Scratch, id: &str) -> Vec<Value> {
    let read: Value = ureq::get(format!("{}/api/items?id={id}", deck.url))
        .header("Authorization", format!("Bearer {}", secret(deck)))
        .call()
        .expect("the read route answers")
        .body_mut()
        .read_json()
        .expect("json");
    read["items"][0]["replies"]
        .as_array()
        .cloned()
        .unwrap_or_default()
}

/// The replies once the press's post has landed: it runs on its own thread, so the frame does not wait on it.
fn replied(deck: &Scratch, id: &str) -> Vec<Value> {
    let start = Instant::now();
    loop {
        let said = replies(deck, id);
        if !said.is_empty() || start.elapsed() > BUDGET * 3 {
            return said;
        }
        std::thread::sleep(Duration::from_millis(20));
    }
}

/// The window over the deck's overview as it stands now, drawn once.
fn drawn(deck: &Scratch) -> Runtime<State> {
    let client = client_for(deck);
    let view = client
        .view(&Query::default())
        .expect("the scratch deck's view");
    let mut state = State {
        view,
        ..State::default()
    };
    state.pending.deck = Some(Arc::new(client));
    let mut rt = Runtime::new(state, app::view, (1280.0, 800.0), Env::new(true, 1.0));
    rt.frame(0.0);
    rt
}

fn texts(rt: &Runtime<State>) -> Vec<String> {
    rt.elements()
        .into_iter()
        .filter_map(|element| element.text)
        .collect()
}

fn find(rt: &Runtime<State>, key: &str) -> ElementInfo {
    rt.elements()
        .into_iter()
        .find(|element| element.key.as_deref() == Some(key))
        .unwrap_or_else(|| panic!("no element {key}"))
}

#[test]
fn a_card_draws_its_parts() {
    let deck = Scratch::start();
    question(&deck, "Which port?", "C:/work/alpha");

    let shown = texts(&drawn(&deck));

    for part in [
        "Which port?",
        "posted",
        "Port 4321 or 4322?",
        "4321",
        "4322",
        "Teach me",
    ] {
        assert!(
            shown.iter().any(|text| text == part),
            "no {part:?} among {shown:?}"
        );
    }
}

#[test]
fn an_option_press_is_sent_once() {
    let deck = Scratch::start();
    let id = question(&deck, "Which port?", "C:/work/alpha");
    let mut rt = drawn(&deck);
    let option = find(&rt, &format!("card-{id}-opt-0"));
    let (x, y) = (
        option.rect[0] + option.rect[2] / 2.0,
        option.rect[1] + option.rect[3] / 2.0,
    );

    rt.pointer_move(x, y);
    for _ in 0..2 {
        rt.pointer_down(x, y);
        rt.pointer_up(x, y);
    }
    rt.frame(1.0 / 60.0);

    let said = replied(&deck, &id);
    assert_eq!(said.len(), 1, "one reply posted: {said:?}");
    assert_eq!(said[0]["text"], "4321", "the option is the reply: {said:?}");
    let sent = find(&rt, &format!("card-{id}-opt-0"));
    assert_eq!(
        sent.fill,
        theme::tokens(true).state.pilot,
        "the pressed option shows sent"
    );
    assert!(
        !find(&rt, &format!("card-{id}-opt-1")).focusable,
        "the row is spent once one option is sent"
    );
}

fn click(rt: &mut Runtime<State>, key: &str) {
    let at = find(rt, key).rect;
    let (x, y) = (at[0] + at[2] / 2.0, at[1] + at[3] / 2.0);
    rt.pointer_move(x, y);
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
    rt.frame(1.0 / 60.0);
}

fn shown(rt: &Runtime<State>, key: &str) -> bool {
    rt.elements()
        .iter()
        .any(|element| element.key.as_deref() == Some(key))
}

#[test]
fn a_confirmed_option_asks_in_place_before_it_posts() {
    let deck = Scratch::start();
    let id = post(
        &deck,
        json!({ "kind": "signoff", "title": "Ship it?", "body": "Ready?", "repo": "C:/work/alpha", "author": "" }),
    );
    let mut rt = drawn(&deck);
    let (trigger, sure, yes) = (
        format!("card-{id}-opt-0"),
        format!("card-{id}-sure"),
        format!("card-{id}-yes"),
    );

    click(&mut rt, &trigger);
    assert!(
        rt.state.regions.queue.sent.is_empty(),
        "the first press sends nothing"
    );
    assert_eq!(
        find(&rt, &sure).text.as_deref(),
        Some("Send “Sign off”?"),
        "the page's confirm step, in place"
    );
    assert!(
        !shown(&rt, &trigger),
        "the step stands where the options were"
    );

    // A press anywhere but Confirm puts the options back, with nothing sent.
    let (x, y) = (2.0, 798.0);
    rt.pointer_move(x, y);
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
    rt.frame(1.0 / 60.0);
    assert!(!shown(&rt, &sure), "a press elsewhere backs out");
    assert!(
        rt.state.regions.queue.sent.is_empty(),
        "backing out sends nothing"
    );

    click(&mut rt, &trigger);
    click(&mut rt, &yes);
    let said = replied(&deck, &id);
    assert_eq!(said.len(), 1, "the confirm press posts once: {said:?}");
    assert_eq!(
        said[0]["text"], "Sign off",
        "the option is the reply: {said:?}"
    );
}

#[test]
fn a_failed_post_comes_back_through_settle() {
    let deck = Scratch::start();
    let id = question(&deck, "Which port?", "C:/work/alpha");
    let mut rt = drawn(&deck);
    let gone = Scratch::start();
    rt.state.pending.deck = Some(Arc::new(client_for(&gone)));
    drop(gone);
    let option = format!("card-{id}-opt-0");

    click(&mut rt, &option);
    assert_eq!(
        find(&rt, &option).fill,
        theme::tokens(true).state.pilot,
        "shown sent in the frame of the press"
    );
    let start = Instant::now();
    let mut settled = false;
    while !settled {
        assert!(
            start.elapsed() < BUDGET * 5,
            "the failed post never came back"
        );
        std::thread::sleep(Duration::from_millis(20));
        rt.update(|s, tx| settled = app::poll(s, 0.0, tx));
    }
    rt.frame(1.0 / 60.0);

    assert!(
        shown(&rt, &format!("card-{id}-refused")),
        "the failure is shown on the card"
    );
    assert_ne!(
        find(&rt, &option).fill,
        theme::tokens(true).state.pilot,
        "the option is no longer sent, so it can be pressed again"
    );
}

/// The window over a recorded queue region, drawn once.
fn recorded(queue: Value) -> Runtime<State> {
    let state = State {
        view: pilot_deck::client::View {
            screen: "home".into(),
            seq: 1,
            regions: [("queue".to_string(), queue)].into_iter().collect(),
        },
        ..State::default()
    };
    let mut rt = Runtime::new(state, app::view, (1280.0, 800.0), Env::new(true, 1.0));
    rt.frame(0.0);
    rt
}

#[test]
fn pressing_a_card_title_opens_its_thread() {
    let id = "itm_00000000c1";
    let mut rt =
        recorded(json!({ "cards": [{ "id": id, "title": "Which port?", "excerpt": "" }] }));

    click(&mut rt, &format!("card-{id}-title"));

    assert_eq!(rt.state.query.screen, "thread");
    assert_eq!(rt.state.query.id.as_deref(), Some(id));
}

/// The walkthrough of 2026-11-21: the way into a thread is the title and the kind line above it, one
/// target, so a press on the kind line opens the thread too.
#[test]
fn pressing_a_cards_kind_line_opens_its_thread() {
    let id = "itm_00000000c3";
    let mut rt = recorded(json!({ "cards": [{
        "id": id, "title": "Which port?", "excerpt": "", "state": "posted", "kind": "question" }] }));

    click(&mut rt, &format!("card-{id}-state"));

    assert_eq!(rt.state.query.screen, "thread");
    assert_eq!(rt.state.query.id.as_deref(), Some(id));
}

#[test]
fn a_card_excerpt_is_drawn_as_markdown() {
    let id = "itm_00000000c2";
    let rt = recorded(json!({ "cards": [{
        "id": id, "title": "Read me", "excerpt": "**Bold** words and `code`\n\n- one\n- [a link](https://example.com)" }] }));

    let shown = texts(&rt);
    assert!(
        shown
            .iter()
            .all(|t| !t.contains("**") && !t.contains('`') && !t.contains("](")),
        "no markdown syntax drawn raw: {shown:?}"
    );
    assert!(
        shown.iter().any(|t| t.contains("Bold")),
        "the excerpt's words are drawn: {shown:?}"
    );
    find(&rt, &format!("card-{id}-excerpt"));
}

#[test]
fn the_thread_screen_draws_the_thread_alone_inside_the_window() {
    let deck = Scratch::start();
    let first = question(&deck, "First?", "C:/work/alpha");
    for title in ["Second?", "Third?"] {
        question(&deck, title, "C:/work/alpha");
    }
    let client = client_for(&deck);
    let query = Query {
        screen: "thread".into(),
        id: Some(first.clone()),
        ..Query::default()
    };
    let view = client.view(&query).expect("the thread's view");
    let state = State {
        view,
        query,
        ..State::default()
    };
    let (w, h) = (1440.0, 900.0);
    let mut rt = Runtime::new(state, app::view, (w, h), Env::new(true, 1.0));
    rt.frame(0.0);
    rt.frame(1.0);

    let cards: Vec<String> = rt
        .elements()
        .into_iter()
        .filter_map(|element| element.key)
        .filter(|key| key.starts_with("card-"))
        .collect();
    assert!(
        cards.is_empty(),
        "no queue card on the thread screen: {cards:?}"
    );
    let reply = find(&rt, "reply").rect;
    assert!(
        reply[1] + reply[3] <= h,
        "the reply box ends inside the window: {reply:?}"
    );
}

#[test]
fn the_lane_lines_are_columns() {
    let deck = Scratch::start();
    for repo in ["C:/work/alpha", "C:/work/beta", "C:/work/gamma"] {
        question(&deck, "Which port?", repo);
    }

    let rt = drawn(&deck);

    for column in ["state", "name", "time"] {
        let xs: Vec<f32> = (0..3)
            .map(|i| find(&rt, &format!("line-{i}-{column}")).rect[0])
            .collect();
        assert!(
            xs.iter().all(|x| (x - xs[0]).abs() < 0.5),
            "the {column} column starts at {xs:?}"
        );
    }
}

#[test]
fn a_post_shows_its_card_within_a_second() {
    let deck = Scratch::start();
    let mut rt = with_deck(&deck, || {
        App::new(app::spec()).headless_runtime((1280.0, 800.0), Env::new(true, 1.0))
    });
    rt.frame(0.0);
    // The reader's first view comes once it is listening, so the post is heard.
    let start = Instant::now();
    while rt.state.view.regions.is_empty() {
        rt.frame(1.0 / 60.0);
        assert!(start.elapsed() < BUDGET * 3, "no first view");
        std::thread::yield_now();
    }

    let start = Instant::now();
    question(&deck, "Posted while open?", "C:/work/beta");
    loop {
        rt.frame(1.0 / 60.0);
        if texts(&rt).iter().any(|text| text == "Posted while open?") {
            break;
        }
        assert!(
            start.elapsed() < BUDGET,
            "the card's text not within {BUDGET:?}"
        );
        std::thread::yield_now();
    }
    eprintln!("a post shows its card: {:?}", start.elapsed());
}
