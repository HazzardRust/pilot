//! rune-deck-ui S15 (spec 2, 3, 6c): the Tickets panel drawn from a view a real scratch deck served (L7). A
//! ticket's arrow moves it one place however fast it is pressed twice; Continue asks Confirm before it posts
//! `Switch`, and a pending switch's Cancel posts `CancelSwitch`; an opened fold is the window's prefs and
//! opens again after a restart.

mod support;

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use pilot_deck::app::{self, State};
use pilot_deck::client::{Client, Query};
use pilot_deck::prefs::Prefs;
use rune::runtime::ElementInfo;
use rune::{Env, Runtime};
use serde_json::{Value, json};
use support::{Scratch, id_in, item, read, secret, tool};

const REPO: &str = "C:/work/alpha";

/// The client and the prefs read their place from the environment, which every test here shares.
static ENV: Mutex<()> = Mutex::new(());

/// Runs `make` with the deck's address and dir in the environment, as the window's own start reads them.
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

/// An open red ticket, the way the pilot posts one; answers its id.
fn ticket(deck: &Scratch, title: &str) -> String {
    let body = "> fix the thing\n\n1. It is done. *The test shows it.*\n\nThread itm_d2f9ed260436.";
    id_in(&tool(
        deck,
        "deck_post",
        json!({ "kind": "ticket", "title": title, "body": body, "repo": REPO, "author": "", "sliceCount": 1 }),
    ))
}

/// A live session on the repository, so a switch waits for its take rather than completing at once.
fn register_run(deck: &Scratch) {
    ureq::post(format!("{}/api/runs", deck.url))
        .header("Authorization", format!("Bearer {}", secret(deck)))
        .send_json(json!({ "repo": REPO, "pid": deck.pid }))
        .expect("the run registers");
}

fn tickets_of(deck: &Scratch) -> Vec<String> {
    read(deck, "/api/items?open=1")["items"]
        .as_array()
        .expect("items")
        .iter()
        .filter(|one| one["kind"] == "ticket" && one["repo"] == REPO)
        .map(|one| one["id"].as_str().expect("an id").to_string())
        .collect()
}

fn newest_text(deck: &Scratch, id: &str) -> Value {
    item(deck, id)["replies"]
        .as_array()
        .and_then(|replies| replies.last())
        .map_or(Value::Null, |reply| reply["text"].clone())
}

fn view_of(deck: &Scratch) -> pilot_deck::client::View {
    let query = Query {
        run: Some(REPO.into()),
        ..Query::default()
    };
    with_deck(deck, Client::from_env)
        .expect("a loopback client")
        .view(&query)
        .expect("the scratch deck's view")
}

/// The window over the repository's tab as it stands now, with `prefs` and the Tickets panel open
/// as the only pane, so the side area's height holds every row (S20, S28), drawn once.
fn drawn(deck: &Scratch, mut prefs: Prefs) -> Runtime<State> {
    prefs.open_panels.insert("tickets".into());
    let mut state = State {
        view: view_of(deck),
        prefs,
        ..State::default()
    };
    state.pending.deck = with_deck(deck, Client::from_env).ok().map(Arc::new);
    let mut rt = Runtime::new(state, app::view, (1280.0, 4000.0), Env::new(true, 1.0));
    rt.frame(0.0);
    rt
}

/// Prefs with the red fold open, as a user who opened it before.
fn red_open() -> Prefs {
    let mut prefs = Prefs::default();
    prefs
        .folds
        .entry(REPO.into())
        .or_default()
        .insert("red".into());
    prefs
}

fn find(rt: &Runtime<State>, key: &str) -> Option<ElementInfo> {
    rt.elements()
        .into_iter()
        .find(|element| element.key.as_deref() == Some(key))
}

/// The deck's view now, as the live reader would bring it, drawn until its layout has settled.
fn refresh(deck: &Scratch, rt: &mut Runtime<State>) {
    let view = view_of(deck);
    rt.update(|s, _| s.view = view);
    for _ in 0..2 {
        rt.frame(1.0);
    }
}

/// Runs the window's own poll until a post has been answered.
fn settle(rt: &mut Runtime<State>) {
    let deadline = Instant::now() + Duration::from_secs(10);
    let mut answered = false;
    while !answered {
        assert!(Instant::now() < deadline, "the post never answered");
        std::thread::sleep(Duration::from_millis(20));
        rt.update(|s, tx| answered = app::poll(s, 0.0, tx));
    }
    rt.frame(1.0 / 60.0);
}

fn press(deck: &Scratch, rt: &mut Runtime<State>, key: &str) {
    let at = find(rt, key)
        .unwrap_or_else(|| panic!("no element {key}"))
        .rect;
    let (x, y) = (at[0] + at[2] / 2.0, at[1] + at[3] / 2.0);
    with_deck(deck, || {
        rt.pointer_move(x, y);
        rt.pointer_down(x, y);
        rt.pointer_up(x, y);
        rt.frame(1.0 / 60.0);
    });
}

#[test]
fn two_quick_presses_move_once() {
    let deck = Scratch::start();
    let [first, second, third] = ["First", "Second", "Third"].map(|title| ticket(&deck, title));
    let mut rt = drawn(&deck, red_open());

    // The second press lands before any new view: the arrow is the same one, still on the old row.
    press(&deck, &mut rt, &format!("ticket-{third}-up"));
    press(&deck, &mut rt, &format!("ticket-{third}-up"));
    settle(&mut rt);

    assert_eq!(
        tickets_of(&deck),
        [first.clone(), third.clone(), second.clone()],
        "moved one place"
    );

    // A view showing the move lifts the gate: the next press moves it again.
    refresh(&deck, &mut rt);
    press(&deck, &mut rt, &format!("ticket-{third}-up"));
    settle(&mut rt);
    assert_eq!(tickets_of(&deck), [third, first, second]);
}

#[test]
fn a_switch_takes_a_confirm() {
    let deck = Scratch::start();
    ticket(&deck, "In hand");
    let to = ticket(&deck, "Next");
    register_run(&deck);
    let mut rt = drawn(&deck, red_open());
    assert!(
        find(&rt, &format!("ticket-{to}-confirm")).is_none(),
        "no Confirm before play"
    );

    press(&deck, &mut rt, &format!("ticket-{to}-play"));
    assert!(
        find(&rt, &format!("ticket-{to}-confirm")).is_some(),
        "play shows Confirm"
    );
    assert_eq!(
        newest_text(&deck, &to),
        Value::Null,
        "play alone posts nothing"
    );

    press(&deck, &mut rt, &format!("ticket-{to}-confirm"));
    settle(&mut rt);
    assert_eq!(
        newest_text(&deck, &to),
        "Continue this ticket",
        "Confirm posts Switch"
    );

    refresh(&deck, &mut rt);
    press(&deck, &mut rt, &format!("ticket-{to}-cancel"));
    settle(&mut rt);
    assert_eq!(
        newest_text(&deck, &to),
        "switch cancelled",
        "Cancel posts CancelSwitch"
    );
}

/// The user's note: a ticket dragged by its grip, like a playlist, lands where it is dropped, by the
/// arrows' own one-place moves.
#[test]
fn a_dragged_ticket_lands_where_it_is_dropped() {
    let deck = Scratch::start();
    let [first, second, third] = ["First", "Second", "Third"].map(|title| ticket(&deck, title));
    let mut rt = drawn(&deck, red_open());
    let grip = find(&rt, &format!("ticket-{third}-grip"))
        .expect("a grip on the row")
        .rect;
    let row = |id: &str| find(&rt, &format!("ticket-{id}")).expect("a row").rect[1];
    let (x, y) = (grip[0] + grip[2] / 2.0, grip[1] + grip[3] / 2.0);
    let to = y - (row(&third) - row(&first));
    with_deck(&deck, || {
        rt.pointer_move(x, y);
        rt.pointer_down(x, y);
        for step in 1..=8 {
            rt.pointer_move(x, y + (to - y) * step as f32 / 8.0);
            rt.frame(1.0 / 60.0);
        }
        rt.pointer_up(x, to);
        rt.frame(1.0 / 60.0);
    });
    settle(&mut rt);
    settle(&mut rt);
    assert_eq!(tickets_of(&deck), [third, first, second], "two places up");
}

/// The user's note: a row's state sat at another x by whether its play was there. The red queue's next
/// has no play and no up, the middle both arrows and a play, the last no down: one state column.
#[test]
fn a_rows_state_keeps_its_place_whatever_its_controls() {
    let deck = Scratch::start();
    let ids = ["Next", "Middle", "Last"].map(|title| ticket(&deck, title));
    let rt = drawn(&deck, red_open());
    let play = |id: &str| find(&rt, &format!("ticket-{id}-play")).is_some();
    assert!(!play(&ids[0]) && play(&ids[1]), "both row shapes are drawn");

    let edges: Vec<[f32; 2]> = ids
        .iter()
        .map(|id| {
            let at = find(&rt, &format!("ticket-{id}-state"))
                .unwrap_or_else(|| panic!("no state on {id}"))
                .rect;
            [at[0], at[0] + at[2]]
        })
        .collect();
    assert!(
        edges.iter().all(|edge| *edge == edges[0]),
        "one state column: {edges:?}"
    );
}

#[test]
fn folds_are_kept_per_deck() {
    let deck = Scratch::start();
    let id = ticket(&deck, "Only");
    let mut rt = drawn(&deck, Prefs::default());
    assert!(
        find(&rt, &format!("ticket-{id}")).is_none(),
        "a fold is served shut"
    );

    press(&deck, &mut rt, "tickets-fold-red");

    assert!(
        find(&rt, &format!("ticket-{id}")).is_some(),
        "the fold opens"
    );
    assert!(rt.state.prefs.folds[REPO].contains("red"));
    let restarted = drawn(&deck, Prefs::load(&deck.dir));
    assert!(
        find(&restarted, &format!("ticket-{id}")).is_some(),
        "open after a restart"
    );
    assert_eq!(
        Prefs::load(&deck.dir).folds[REPO].len(),
        1,
        "only the fold pressed is kept"
    );
}
