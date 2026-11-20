//! rune-deck-ui S12: the Status region draws a recorded view's rows, and choosing a ticket sets the
//! query and takes the next view's rows. The press runs against a scratch daemon, never 4321.

mod support;

use std::sync::Mutex;

use pilot_deck::app::{self, State};
use pilot_deck::client::{Error, Query, View};
use pilot_deck::regions::status;
use rune::{Env, Runtime};
use serde_json::{Value, json};

/// The press reads its address from the environment, which every test in this binary shares.
static ENV: Mutex<()> = Mutex::new(());

fn view_with(status: Value) -> View {
    View {
        screen: "home".into(),
        seq: 99,
        regions: [("status".to_string(), status)].into_iter().collect(),
    }
}

/// What the daemon's view carries for a record with two held lanes, `chosen` marking one.
fn two_lanes(chosen: &str) -> Value {
    let rows = if chosen == "yellow" {
        json!([{ "slice": "S1 the yellow slice", "state": "implementing", "branch": "slice/s1", "pr": 7, "after": [] }])
    } else {
        json!([{ "slice": "S1 the green slice", "state": "merged", "after": [] }])
    };
    json!({
        "tickets": [
            { "id": "itm_y", "name": "Build the kettle", "lane": "implementing", "chosen": chosen == "yellow" },
            { "id": "itm_g", "name": "Ship the kettle", "lane": "concluding", "chosen": chosen == "green" },
        ],
        "rows": rows,
    })
}

fn frame(state: State) -> Runtime<State> {
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

#[test]
fn the_table_and_selector_are_the_views() {
    let rt = frame(State {
        view: view_with(two_lanes("yellow")),
        ..State::default()
    });

    let shown = texts(&rt);
    for want in [
        "implementing Build the kettle",
        "concluding Ship the kettle",
        "S1 the yellow slice",
        "implementing",
        "slice/s1",
        "#7",
    ] {
        assert!(shown.iter().any(|t| t == want), "no {want:?} in {shown:?}");
    }
    assert!(!shown.iter().any(|t| t.contains("green slice")));
}

#[test]
fn each_table_is_drawn_under_its_tabs_name() {
    // The overview's view (S22): no single table, one group per tab.
    let rt = frame(State {
        view: view_with(json!({
            "tickets": [],
            "rows": [],
            "groups": [
                { "tab": "alpha deck", "tickets": [], "rows": [
                    { "slice": "S1 the yellow slice", "state": "implementing", "branch": "slice/s1", "pr": 7, "after": [] },
                ] },
                { "tab": "bravo deck", "tickets": [], "rows": [
                    { "slice": "S1 brew", "state": "merged", "after": [] },
                    { "slice": "S2 pour", "state": "doing", "after": ["S1 brew"] },
                ] },
            ],
        })),
        ..State::default()
    });

    let shown = texts(&rt);
    for want in [
        "alpha deck",
        "S1 the yellow slice",
        "slice/s1",
        "bravo deck",
        "S1 brew",
        "S2 pour",
        "merged",
        "doing",
    ] {
        assert!(shown.iter().any(|t| t == want), "no {want:?} in {shown:?}");
    }
    let at = |want: &str| shown.iter().position(|t| t == want).unwrap();
    assert!(
        at("alpha deck") < at("S1 the yellow slice")
            && at("S1 the yellow slice") < at("bravo deck")
            && at("bravo deck") < at("S1 brew"),
        "each tab's name heads its own rows: {shown:?}"
    );
}

#[test]
fn a_view_with_no_status_draws_nothing_of_it() {
    let rt = frame(State {
        view: view_with(Value::Null),
        ..State::default()
    });

    assert!(texts(&rt).iter().all(|t| !t.contains("slice")));
}

#[test]
fn choosing_a_ticket_sets_the_query_and_takes_the_next_views_rows() {
    let mut state = State {
        view: view_with(two_lanes("yellow")),
        ..State::default()
    };

    status::choose(&mut state, "itm_g", |query: &Query| {
        assert_eq!(
            query.ticket.as_deref(),
            Some("itm_g"),
            "the fetch is for the chosen ticket"
        );
        Ok(view_with(two_lanes("green")))
    });

    assert_eq!(state.query.ticket.as_deref(), Some("itm_g"));
    let shown = texts(&frame(state));
    assert!(shown.iter().any(|t| t == "S1 the green slice"), "{shown:?}");
    assert!(
        !shown.iter().any(|t| t == "S1 the yellow slice"),
        "{shown:?}"
    );
}

#[test]
fn a_choice_that_cannot_be_read_leaves_the_query_and_the_view() {
    let mut state = State {
        view: view_with(two_lanes("yellow")),
        ..State::default()
    };

    status::choose(&mut state, "itm_g", |_| Err(Error::Status(500)));

    assert_eq!(state.query.ticket, None);
    assert!(state.down);
    assert!(
        texts(&frame(state))
            .iter()
            .any(|t| t == "S1 the yellow slice")
    );
}

#[test]
fn pressing_a_ticket_in_the_window_reads_the_scratch_decks_view_for_it() {
    let deck = support::Scratch::start();
    let _held = ENV.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    // SAFETY: every test in this binary that touches the environment holds `ENV`.
    unsafe {
        std::env::set_var("PILOT_DECK_DIR", &deck.dir);
        std::env::set_var("PILOT_DECK_PORT", deck.port.to_string());
    }
    let mut rt = frame(State {
        view: view_with(two_lanes("yellow")),
        ..State::default()
    });

    let (x, y) = rt
        .find("status-ticket-1")
        .expect("the concluding ticket is drawn");
    rt.pointer_move(x, y);
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
    rt.frame(0.0);
    unsafe {
        std::env::remove_var("PILOT_DECK_DIR");
        std::env::remove_var("PILOT_DECK_PORT");
    }

    let (mut query, mut seq) = (None, 0);
    rt.update(|s, _| {
        query = s.query.ticket.clone();
        seq = s.view.seq;
    });
    assert_eq!(query.as_deref(), Some("itm_g"), "the press set the query");
    assert_ne!(
        seq, 99,
        "the view is the scratch deck's, not the recorded one"
    );
}
