//! rune-deck-ui S32 (spec 21): on a deck with nothing in it every region says so in a quiet
//! sentence instead of drawing blank, read from a real empty scratch deck's own view.

use crate::support;

use support::{Scratch, live_window};

/// Each region's sentence, by the region that draws it.
const SENTENCES: [(&str, &str); 8] = [
    ("queue", "Nothing is waiting on you."),
    ("history", "No finished threads yet."),
    ("notifications", "No notifications."),
    ("chat", "No chat open."),
    ("status", "No tickets to show."),
    ("agents", "no agents live"),
    ("tickets", "No tickets yet."),
    ("reports", "no reports"),
];

#[test]
fn every_region_of_an_empty_deck_says_so() {
    let deck = Scratch::start();
    let mut rt = live_window(&deck);
    // Every panel open, so each region draws; "~" is the layout's mark that the user has chosen.
    rt.update(|s, _| {
        s.prefs.open_panels = [
            "notifications",
            "chat",
            "status",
            "agents",
            "tickets",
            "reports",
            "~",
        ]
        .map(String::from)
        .into();
    });
    rt.frame(1.0 / 60.0);

    let shown: Vec<String> = rt
        .elements()
        .into_iter()
        .filter(|element| !element.exiting)
        .filter_map(|element| element.text)
        .collect();
    for (region, sentence) in SENTENCES {
        assert!(
            shown.iter().any(|text| text == sentence),
            "{region} draws blank: no {sentence:?} among {shown:?}"
        );
    }
}

/// The thread page lists no queue and no settled threads by design (view/queue.mjs, history.mjs),
/// so neither region may say there are none while another question waits.
#[test]
fn a_thread_page_claims_nothing_of_the_queue_or_history() {
    let deck = Scratch::start();
    let open = support::question(&deck, "C:/work/alpha");
    support::question(&deck, "C:/work/alpha");
    let mut rt = live_window(&deck);
    rt.update(|s, _| {
        pilot_deck::app::go(
            s,
            pilot_deck::client::Query {
                screen: "thread".into(),
                id: Some(open.clone()),
                ..Default::default()
            },
        )
    });
    support::frame_until(&mut rt, "the thread page", |rt| {
        rt.state
            .view
            .regions
            .get("thread")
            .is_some_and(|t| !t.is_null())
    });
    rt.frame(1.0 / 60.0);

    let shown: Vec<String> = rt
        .elements()
        .into_iter()
        .filter(|element| !element.exiting)
        .filter_map(|element| element.text)
        .collect();
    for claim in ["Nothing is waiting on you.", "No finished threads yet."] {
        assert!(
            !shown.iter().any(|text| text == claim),
            "a thread page says {claim:?}"
        );
    }

    // The items page lists every item, the open ones first, and no queue of its own.
    rt.update(|s, _| {
        pilot_deck::app::go(
            s,
            pilot_deck::client::Query {
                screen: "items".into(),
                ..Default::default()
            },
        )
    });
    support::frame_until(&mut rt, "the items page", |rt| {
        rt.state
            .view
            .regions
            .get("thread")
            .is_none_or(|t| t.is_null())
    });
    rt.frame(1.0 / 60.0);
    let shown: Vec<String> = rt
        .elements()
        .into_iter()
        .filter(|element| !element.exiting)
        .filter_map(|element| element.text)
        .collect();
    assert!(
        !shown
            .iter()
            .any(|text| text == "Nothing is waiting on you."),
        "the items page says nothing waits, listing {shown:?}"
    );
}
