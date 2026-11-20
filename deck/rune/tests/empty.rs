//! rune-deck-ui S32 (spec 21): on a deck with nothing in it every region says so in a quiet
//! sentence instead of drawing blank, read from a real empty scratch deck's own view.

mod support;

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
