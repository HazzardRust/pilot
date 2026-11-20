//! rune-deck-ui S18: the settled-by-day folds and the items page's runs, drawn from a view a real scratch
//! deck served (L7); a run's Dismiss posts once through the write seam.

mod support;

use std::sync::Arc;
use std::time::{Duration, Instant};

use pilot_deck::act::Action;
use pilot_deck::app::{self, State};
use pilot_deck::client::Query;
use rune::runtime::ElementInfo;
use rune::{Env, Runtime};
use serde_json::{Value, json};
use support::{Scratch, client_for, id_in, read, secret, taken, tool};

const REPO: &str = "C:/work/alpha";

fn drawn(deck: &Scratch, query: &Query) -> Runtime<State> {
    let client = client_for(deck);
    let view = client.view(query).expect("the scratch deck's view");
    let mut state = State {
        view,
        ..State::default()
    };
    state.regions.queue.deck = Some(Arc::new(client));
    let mut rt = Runtime::new(state, app::view, (1280.0, 800.0), Env::new(true, 1.0));
    rt.frame(0.0);
    rt
}

fn items_screen() -> Query {
    Query {
        screen: "items".into(),
        ..Query::default()
    }
}

fn find(rt: &Runtime<State>, key: &str) -> Option<ElementInfo> {
    rt.elements()
        .into_iter()
        .find(|element| element.key.as_deref() == Some(key))
}

fn click(rt: &mut Runtime<State>, key: &str) {
    let at = find(rt, key)
        .unwrap_or_else(|| panic!("no element {key}"))
        .rect;
    let (x, y) = (at[0] + at[2] / 2.0, at[1] + at[3] / 2.0);
    rt.pointer_move(x, y);
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
    // Enough frames for a leaving card's exit to finish.
    for _ in 0..60 {
        rt.frame(1.0 / 60.0);
    }
}

fn register(deck: &Scratch) -> String {
    let registered = ureq::post(format!("{}/api/runs", deck.url))
        .header("Authorization", format!("Bearer {}", secret(deck)))
        .send_json(json!({ "repo": REPO, "pid": deck.pid }))
        .expect("the run registers")
        .body_mut()
        .read_json::<Value>()
        .expect("json");
    registered["run"]["id"]
        .as_str()
        .expect("a run id")
        .to_string()
}

fn runs_left(deck: &Scratch) -> usize {
    read(deck, "/api/runs")["runs"]
        .as_array()
        .map_or(0, Vec::len)
}

#[test]
fn dismiss_run_posts_once() {
    let deck = Scratch::start();
    let run = register(&deck);
    let mut rt = drawn(&deck, &items_screen());
    let key = format!("run-{run}-dismiss");

    click(&mut rt, &key);
    click(&mut rt, &key);

    let start = Instant::now();
    while runs_left(&deck) != 0 && start.elapsed() < Duration::from_secs(3) {
        std::thread::sleep(Duration::from_millis(20));
    }
    assert_eq!(runs_left(&deck), 0, "the run is off the deck");
    assert!(
        rt.state.regions.history.dismissed.contains(&run),
        "the press is shown sent"
    );
    assert!(
        !find(&rt, &key).expect("the row stays").focusable,
        "a sent dismiss is spent"
    );
    assert_eq!(rt.state.regions.history.dismissed.len(), 1);
}

#[test]
fn a_settled_day_folds_and_today_is_open() {
    let deck = Scratch::start();
    let id = id_in(&tool(
        &deck,
        "deck_post",
        json!({ "kind": "question", "title": "Settled one", "body": "A or B", "repo": REPO, "author": "", "options": ["A"] }),
    ));
    let client = client_for(&deck);
    taken(
        client
            .act(&Action::Close { id: id.clone() })
            .expect("an answer"),
    );

    let mut rt = drawn(
        &deck,
        &Query {
            all: true,
            ..Query::default()
        },
    );
    let card = format!("card-{id}");
    assert!(find(&rt, &card).is_some(), "today's section is served open");

    let day = rt
        .elements()
        .into_iter()
        .find_map(|e| e.key.filter(|k| k.starts_with("day-")))
        .expect("a day heading");
    click(&mut rt, &day);
    assert!(
        find(&rt, &card).is_none(),
        "a pressed heading folds its day"
    );
    click(&mut rt, &day);
    assert!(find(&rt, &card).is_some(), "and opens it again");
}
