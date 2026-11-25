//! archive-page S2 (spec 2, 6, 7; A3): pressing an archive row opens its detail on the archive screen, with
//! its closing report's title, and Back draws the list again, on a real scratch deck.

use crate::support;

use rune::{Env, Runtime};
use serde_json::json;
use support::{Scratch, frame_until, id_in, live_window, tool};

use pilot_deck::app::{self, State};
use pilot_deck::client::View;

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

fn press(rt: &mut Runtime<State>, key: &str) {
    let (x, y) = rt.find(key).unwrap_or_else(|| panic!("{key} is drawn"));
    rt.pointer_move(x, y);
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
    rt.frame(0.0);
}

/// Spec 6: a field the view flags `markdown` is drawn as Markdown, its markup gone; an unflagged one as text.
#[test]
fn a_markdown_field_draws_as_markdown() {
    let detail = json!({
        "id": "itm_0123456789ab", "title": "A report", "kind": "report", "replies": [], "plan": null, "report": null,
        "fields": [
            { "label": "Body", "value": "## Landed\n\n- **S1** merged", "markdown": true },
            { "label": "Ticket", "value": "**itm_raw**" },
        ],
    });
    let mut state = State {
        view: View {
            screen: "archive".into(),
            seq: 1,
            regions: [("archiveDetail".to_string(), detail)]
                .into_iter()
                .collect(),
        },
        ..State::default()
    };
    state.query.screen = "archive".into();
    state.query.id = Some("itm_0123456789ab".into());
    let mut rt = Runtime::new(state, app::view, (1280.0, 800.0), Env::new(true, 1.0));
    rt.frame(0.0);

    let drawn = texts(&rt);
    assert!(
        drawn.iter().any(|t| t == "Landed"),
        "the heading drawn without its ##: {drawn:?}"
    );
    assert!(
        !drawn
            .iter()
            .any(|t| t.contains("## Landed") || t.contains("**S1**")),
        "no raw markup: {drawn:?}"
    );
    assert!(
        drawn.iter().any(|t| t == "**itm_raw**"),
        "an unflagged field stays text: {drawn:?}"
    );
}

#[test]
fn a_press_opens_the_detail_and_back_returns() {
    let deck = Scratch::start();
    let body = "> fix the thing\n\n1. It is done. *The test shows it.*\n\nThread itm_d2f9ed260436.";
    let id = id_in(&tool(
        &deck,
        "deck_post",
        json!({ "kind": "ticket", "title": "The detailed ticket", "body": body, "repo": "C:/work/alpha", "author": "", "sliceCount": 1 }),
    ));
    tool(
        &deck,
        "deck_resolve",
        json!({ "id": id, "resolution": "done", "author": "" }),
    );
    // `deck_post` takes a report only for a green ticket, which needs a signed plan and a landing; the report
    // is stored beside the closed ticket instead, as the lander's would be, with the daemon idle.
    let store = deck.dir.join("deck.json");
    let mut stored: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&store).expect("the store")).expect("json");
    stored["items"].as_array_mut().expect("items").push(json!({
        "id": "itm_0123456789ab", "kind": "report", "owner": "pilot", "title": "The detailed ticket landed",
        "body": "## Landed\n\n- **S1** merged", "ticket": id, "repo": "C:/work/alpha",
        "postedAt": "2026-11-20T10:00:00.000Z", "resolvedAt": "2026-11-20T10:00:00.000Z", "replies": [],
    }));
    std::fs::write(&store, stored.to_string()).expect("the store written");
    let mut rt = live_window(&deck);
    rt.frame(1.0);
    press(&mut rt, "icon-archive");
    let row = format!("archive-row-{id}");
    frame_until(&mut rt, "the archive's row", |rt| keys(rt).contains(&row));

    press(&mut rt, &row);
    assert_eq!(rt.state.query.screen, "archive");
    assert_eq!(rt.state.query.id.as_deref(), Some(id.as_str()));
    frame_until(&mut rt, "the detail's report", |rt| {
        texts(rt)
            .iter()
            .any(|text| text == "The detailed ticket landed")
    });
    let drawn = keys(&rt);
    assert!(drawn.contains(&"archive-detail".into()), "{drawn:?}");
    assert!(!drawn.contains(&row), "the detail replaces the list");

    press(&mut rt, "archive-back");
    assert_eq!(rt.state.query.screen, "archive");
    assert_eq!(rt.state.query.id, None);
    frame_until(&mut rt, "the list again", |rt| keys(rt).contains(&row));
    assert!(!keys(&rt).contains(&"archive-detail".into()));
}
