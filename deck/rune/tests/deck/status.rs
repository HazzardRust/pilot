//! rune-deck-ui S12: the Status region draws a recorded view's rows, and choosing a ticket sets the
//! query and takes the next view's rows. The press runs against a scratch daemon, never 4321.

use crate::support;

use pilot_deck::app::{self, State};
use pilot_deck::client::View;
use pilot_deck::regions::status;
use rune::{Env, Runtime};
use serde_json::{Value, json};

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
        .filter(|element| !element.exiting)
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
        "SLICE",
        "STATE",
        "YOURS",
    ] {
        assert!(shown.iter().any(|t| t == want), "no {want:?} in {shown:?}");
    }
    assert!(!shown.iter().any(|t| t.contains("green slice")));
    // The page's table has no branch or PR cell (the user: "copy what the html did").
    assert!(
        !shown.iter().any(|t| t == "slice/s1" || t == "#7"),
        "{shown:?}"
    );
}

#[test]
fn the_table_is_headed_by_its_name_and_the_hour_it_started() {
    let mut status = two_lanes("yellow");
    status["heading"] = json!("kettle");
    status["started"] = json!("09:05");
    let rt = frame(State {
        view: view_with(status),
        ..State::default()
    });

    let shown = texts(&rt);
    for want in ["kettle", " · started 09:05"] {
        assert!(shown.iter().any(|t| t == want), "no {want:?} in {shown:?}");
    }
    let y = |key: &str| rt.find(key).unwrap_or_else(|| panic!("{key} is drawn")).1;
    assert!(
        y("status-ticket-0") < y("status-heading-name")
            && y("status-heading-name") < y("status-row-0-slice"),
        "selector, heading, then the table, as the page orders them"
    );
    assert!(
        frame(State {
            view: view_with(two_lanes("yellow")),
            ..State::default()
        })
        .find("status-heading-name")
        .is_none(),
        "no heading in the view, none drawn"
    );
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
fn a_long_state_stays_in_its_column_and_the_cells_never_overlap() {
    let rt = frame(State {
        view: view_with(json!({
            "tickets": [],
            "rows": [
                { "slice": "S1 a slice with a rather long name indeed", "state": "waiting on the co-pilot's review of the diff", "branch": "slice/s1", "pr": 7, "href": "/thread/itm_y", "after": [] },
                { "slice": "S2 short", "state": "merged", "after": [] },
            ],
        })),
        ..State::default()
    });

    let rect = |key: &str| {
        rt.elements()
            .into_iter()
            .find(|e| e.key.as_deref() == Some(key))
            .unwrap_or_else(|| panic!("{key} is drawn"))
            .rect
    };
    for i in 0..2 {
        let (slice, state) = (
            rect(&format!("status-row-{i}-slice")),
            rect(&format!("status-row-{i}-state")),
        );
        assert!(
            slice[0] + slice[2] <= state[0] + 0.5,
            "row {i}: the state starts after the slice ends: {slice:?} {state:?}"
        );
    }
    let (state, yours) = (rect("status-row-0-state"), rect("status-row-0-yours"));
    assert!(state[0] + state[2] <= yours[0] + 0.5, "{state:?} {yours:?}");
    let state = rect("status-row-0-state");
    assert!(
        state[2] <= rect("status-row-1-state")[2] + 0.5,
        "the state is one width"
    );
}

#[test]
fn the_state_column_starts_at_one_x_whatever_the_other_cells_hold() {
    let rt = frame(State {
        view: view_with(json!({
            "tickets": [],
            "rows": [
                { "slice": "S1", "state": "integrated at 8c4cc3a", "branch": "slice/rune-deck-ui-s1b", "after": [] },
                { "slice": "S10", "state": "integrated at c79b105", "branch": "slice/rune-deck-ui-s10", "pr": 7, "href": "/thread/itm_y", "after": [] },
                { "slice": "S2", "state": "merged", "after": [] },
            ],
        })),
        ..State::default()
    });
    let x = |key: String| {
        rt.elements()
            .into_iter()
            .find(|e| e.key.as_deref() == Some(key.as_str()))
            .unwrap_or_else(|| panic!("{key} is drawn"))
            .rect[0]
    };
    let first = x("status-row-0-state".into());
    for i in 1..3 {
        let at = x(format!("status-row-{i}-state"));
        assert!(
            (at - first).abs() < 0.5,
            "row {i}'s state at {at}, row 0's at {first}"
        );
    }
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
fn pressing_yours_opens_the_thread_it_links() {
    let rows = json!({ "rows": [{ "slice": "S1 the slice", "state": "review", "href": "/thread/itm_00000000y1", "yours": "Which port?", "kind": "question", "after": [] }] });
    let mut rt = frame(State {
        view: view_with(rows),
        ..State::default()
    });
    rt.frame(1.0);
    assert!(
        texts(&rt).iter().any(|t| t == "Which port?"),
        "Yours reads the thread's title"
    );

    let (x, y) = rt
        .find("status-row-0-yours")
        .expect("the yours link is drawn");
    rt.pointer_move(x, y);
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
    rt.frame(0.0);

    assert_eq!(rt.state.query.screen, "thread");
    assert_eq!(rt.state.query.id.as_deref(), Some("itm_00000000y1"));
}

#[test]
fn a_yours_link_not_to_a_thread_opens_nothing() {
    for href in ["/thread/", "/items"] {
        let rows = json!({ "rows": [{ "slice": "S1 the slice", "state": "review", "href": href, "after": [] }] });
        let mut rt = frame(State {
            view: view_with(rows),
            ..State::default()
        });
        rt.frame(1.0);

        let (x, y) = rt
            .find("status-row-0-yours")
            .expect("the yours mark is drawn");
        rt.pointer_move(x, y);
        rt.pointer_down(x, y);
        rt.pointer_up(x, y);
        rt.frame(0.0);

        assert_eq!(rt.state.query.screen, "home", "{href} opens nothing");
    }
}

#[test]
fn choosing_a_ticket_sets_the_query_without_reading_on_the_ui_thread() {
    let mut state = State {
        view: view_with(two_lanes("yellow")),
        ..State::default()
    };

    status::choose(&mut state, "itm_g");

    assert_eq!(state.query.ticket.as_deref(), Some("itm_g"));
    // The view stays the last one read until the live reader's next lands.
    assert_eq!(state.view.seq, 99);
}

#[test]
fn pressing_a_ticket_in_the_window_draws_the_scratch_decks_view_for_it() {
    let deck = support::Scratch::start();
    let mut rt = support::live_window(&deck);
    rt.update(|s, _| s.view = view_with(two_lanes("yellow")));
    rt.frame(0.0);
    assert!(texts(&rt).iter().any(|t| t == "S1 the yellow slice"));

    let (x, y) = rt
        .find("status-ticket-1")
        .expect("the concluding ticket is drawn");
    rt.pointer_move(x, y);
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
    rt.frame(0.0);

    assert_eq!(rt.state.query.ticket.as_deref(), Some("itm_g"));
    support::frame_until(&mut rt, "the live read for the ticket", |rt| {
        rt.state.view.seq != 99
    });
    rt.frame(0.0);
    let shown = texts(&rt);
    assert!(
        !shown.iter().any(|t| t == "S1 the yellow slice"),
        "the recorded rows are gone, the scratch deck's view is drawn: {shown:?}"
    );
}
