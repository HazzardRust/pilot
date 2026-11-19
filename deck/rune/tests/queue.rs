//! rune-deck-ui S7: the queue's cards and lane lines, drawn from a view a real scratch deck served (L7), and
//! an option press posted once through the write seam.

mod support;

use std::sync::Mutex;
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
    let mut response = ureq::post(format!("{}/api/tool", deck.url))
        .header("Authorization", format!("Bearer {}", secret(deck)))
        .send_json(json!({ "name": "deck_post", "arguments": {
            "kind": "question", "title": title, "body": "Port 4321 or 4322?", "repo": repo, "author": "",
            "options": ["4321", "4322"] } }))
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
    state.regions.queue.deck = Some(client);
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

    let said = replies(&deck, &id);
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
