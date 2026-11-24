//! archive-page S1 (spec 1, 2, 5): the strip's Archive button opens the archive screen on a real scratch
//! deck, whose closed tickets are drawn under their day with their fields' labels.

use crate::support;

use rune::Runtime;
use serde_json::json;
use support::{Scratch, frame_until, id_in, live_window, tool};

use pilot_deck::app::State;

/// A ticket posted and then closed, the way the pilot posts and closes one; answers its id.
fn closed_ticket(deck: &Scratch, title: &str) -> String {
    let body = "> fix the thing\n\n1. It is done. *The test shows it.*\n\nThread itm_d2f9ed260436.";
    let id = id_in(&tool(
        deck,
        "deck_post",
        json!({ "kind": "ticket", "title": title, "body": body, "repo": "C:/work/alpha", "author": "", "sliceCount": 1 }),
    ));
    tool(
        deck,
        "deck_resolve",
        json!({ "id": id, "resolution": "done", "author": "" }),
    );
    id
}

fn keys(rt: &Runtime<State>) -> Vec<String> {
    rt.elements()
        .into_iter()
        .filter(|element| !element.exiting)
        .filter_map(|element| element.key)
        .collect()
}

fn texts(rt: &Runtime<State>) -> Vec<String> {
    rt.elements()
        .into_iter()
        .filter(|element| !element.exiting)
        .filter_map(|element| element.text)
        .collect()
}

#[test]
fn the_archive_button_opens_the_closed_tickets_by_day() {
    let deck = Scratch::start();
    let ids: Vec<String> = ["First", "Second", "Third"]
        .iter()
        .map(|title| closed_ticket(&deck, &format!("The {title} ticket")))
        .collect();
    let mut rt = live_window(&deck);

    rt.frame(1.0);
    let (x, y) = rt.find("strip-archive").expect("an Archive button in the strip");
    rt.pointer_move(x, y);
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
    assert_eq!(rt.state.query.screen, "archive");
    assert_eq!(rt.state.query.id, None);

    frame_until(&mut rt, "the archive's rows", |rt| {
        ids.iter()
            .all(|id| keys(rt).contains(&format!("archive-row-{id}")))
    });
    let drawn = keys(&rt);
    assert!(
        drawn.iter().any(|key| key.starts_with("archive-day-")),
        "a day section: {drawn:?}"
    );
    assert_eq!(
        drawn
            .iter()
            .filter(|key| key.starts_with("archive-row-"))
            .count(),
        3,
        "exactly the three closed tickets"
    );
    let shown = texts(&rt);
    for label in ["Repository", "State", "Closed"] {
        assert_eq!(
            shown.iter().filter(|text| *text == label).count(),
            3,
            "each row labels its {label}: {shown:?}"
        );
    }
    assert!(
        !shown.iter().any(|text| text == "No finished threads yet."),
        "history is not drawn on the archive screen"
    );
}
