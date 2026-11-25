//! rune-panes S7 (spec 6, A2): on a deck with nothing in it each region reads as the HTML deck
//! draws it, read from a real empty scratch deck's own view. This reverses rune-deck-ui S32 (spec 21)
//! for notifications, chat and status, which the HTML deck leaves blank.

use crate::support;

use pilot_deck::app::State;
use rune::Runtime;
use serde_json::json;
use support::{Scratch, live_window};

/// Each region's sentence, by the region that draws it; `None` is drawn blank, as the HTML deck.
const SENTENCES: [(&str, Option<&str>); 8] = [
    ("queue", Some("Nothing is waiting on you.")),
    ("history", Some("No finished threads yet.")),
    ("notifications", None),
    ("chat", None),
    ("status", None),
    ("agents", Some("no agents live")),
    ("tickets", Some("no tickets")),
    ("reports", Some("no reports")),
];

/// Every panel open, so each region draws; "~" is the layout's mark that the user has chosen.
fn open_every_panel(rt: &mut Runtime<State>) {
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
}

/// The texts the window draws now, those leaving aside.
fn shown(rt: &Runtime<State>) -> Vec<String> {
    rt.elements()
        .into_iter()
        .filter(|element| !element.exiting)
        .filter_map(|element| element.text)
        .collect()
}

/// The texts drawn inside `panel`'s body: its region's own, whatever keys they carry.
fn shown_in(rt: &Runtime<State>, panel: &str) -> Vec<String> {
    let key = format!("panel-{panel}-body");
    let [x, y, w, h] = rt
        .elements()
        .into_iter()
        .find(|element| element.key.as_deref() == Some(key.as_str()))
        .unwrap_or_else(|| panic!("no {key} drawn"))
        .rect;
    rt.elements()
        .into_iter()
        .filter(|element| !element.exiting)
        .filter(|element| {
            let [ex, ey, ew, eh] = element.rect;
            ex >= x && ey >= y && ex + ew <= x + w && ey + eh <= y + h
        })
        .filter_map(|element| element.text)
        .collect()
}

#[test]
fn an_empty_deck_reads_as_the_html_deck() {
    let deck = Scratch::start();
    let mut rt = live_window(&deck);
    open_every_panel(&mut rt);

    let shown = shown(&rt);
    for (region, sentence) in SENTENCES {
        match sentence {
            Some(sentence) => assert!(
                shown.iter().any(|text| text == sentence),
                "{region} draws no {sentence:?} among {shown:?}"
            ),
            None => {
                let inside = shown_in(&rt, region);
                assert!(inside.is_empty(), "{region} draws {inside:?}, not blank");
            }
        }
    }
}

/// A deck with one red ticket: the panel shows its queues, so "no tickets" is not drawn, and an open
/// empty queue keeps its "none" (S5).
#[test]
fn a_deck_with_tickets_but_none_in_a_queue_keeps_its_queues() {
    const REPO: &str = "C:/work/alpha";
    let deck = Scratch::start();
    let body = "> fix the thing\n\n1. It is done. *The test shows it.*\n\nThread itm_d2f9ed260436.";
    support::tool(
        &deck,
        "deck_post",
        json!({ "kind": "ticket", "title": "Head", "body": body, "repo": REPO, "author": "", "sliceCount": 1 }),
    );
    let mut rt = live_window(&deck);
    rt.update(|s, _| {
        s.prefs
            .folds
            .entry(REPO.into())
            .or_default()
            .insert("yellow".into());
        pilot_deck::app::go(
            s,
            pilot_deck::client::Query {
                run: Some(REPO.into()),
                ..Default::default()
            },
        )
    });
    support::frame_until(&mut rt, "the repository's tickets", |rt| {
        rt.state.view.regions.get("tickets").is_some_and(|t| {
            t["groups"][0]["rows"]
                .as_array()
                .is_some_and(|r| r.len() == 1)
        })
    });
    open_every_panel(&mut rt);

    let none = rt
        .elements()
        .into_iter()
        .find(|element| element.key.as_deref() == Some("tickets-fold-yellow-none"))
        .expect("the open empty Yellow fold is drawn");
    assert_eq!(none.text.as_deref(), Some("none"));
    let shown = shown(&rt);
    assert!(
        !shown.iter().any(|text| text == "no tickets"),
        "a deck with a ticket says it has none: {shown:?}"
    );
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
