//! rune-deck-ui S30: the header and centre regions take the restyle. Corners from `theme::radius`,
//! content selects and control labels do not, the thread's kind line is one centred row with a
//! short time, and each message carries deck.css's left rule. Drawn from a view a real scratch
//! deck served (L7).

use crate::support;

use std::sync::Arc;

use pilot_deck::act::Action;
use pilot_deck::app::{self, State};
use pilot_deck::client::Query;
use pilot_deck::theme;
use rune::runtime::ElementInfo;
use rune::{Cursor, Env, Runtime};
use serde_json::json;
use support::{Scratch, client_for, id_in, secret, tool};

const REPO: &str = "C:/work/alpha";

fn drawn(deck: &Scratch, query: &Query, dark: bool) -> Runtime<State> {
    let client = client_for(deck);
    let view = client.view(query).expect("the scratch deck's view");
    let mut state = State {
        view,
        query: query.clone(),
        ..State::default()
    };
    state.pending.deck = Some(Arc::new(client));
    let mut rt = Runtime::new(state, app::view, (1280.0, 800.0), Env::new(dark, 1.0));
    rt.frame(0.0);
    rt
}

/// A question with options, a reply from the user and one from an agent.
fn seeded() -> (Scratch, String) {
    let deck = Scratch::start();
    let id = id_in(&tool(
        &deck,
        "deck_post",
        json!({ "kind": "question", "title": "Which?", "body": "Body of the card", "repo": REPO, "author": "", "options": ["A", "B"] }),
    ));
    ureq::post(format!("{}/api/runs", deck.url))
        .header("Authorization", format!("Bearer {}", secret(&deck)))
        .send_json(json!({ "repo": REPO, "pid": deck.pid }))
        .expect("a run registers");
    client_for(&deck)
        .act(&Action::Reply {
            id: id.clone(),
            text: "Words from the user".into(),
            choice: None,
        })
        .expect("the user replies");
    tool(
        &deck,
        "deck_reply",
        json!({ "id": id, "text": "Words from an agent" }),
    );
    (deck, id)
}

fn thread_query(id: &str) -> Query {
    Query {
        screen: "thread".into(),
        id: Some(id.into()),
        ..Query::default()
    }
}

fn by_key(rt: &Runtime<State>, key: &str) -> ElementInfo {
    rt.elements()
        .into_iter()
        .find(|e| e.key.as_deref() == Some(key) && !e.exiting)
        .unwrap_or_else(|| panic!("no element keyed {key}"))
}

fn with_text(rt: &Runtime<State>, said: &str) -> ElementInfo {
    rt.elements()
        .into_iter()
        .find(|e| e.text.as_deref().is_some_and(|t| t.contains(said)))
        .unwrap_or_else(|| panic!("no text containing {said:?}"))
}

/// The cursor the window shows over the middle of `e`.
fn cursor_over(rt: &mut Runtime<State>, e: &ElementInfo) -> Cursor {
    let [x, y, w, h] = e.visible;
    rt.pointer_move(x + w / 2.0, y + h / 2.0);
    rt.frame(1.0 / 60.0);
    rt.cursor()
}

fn inside(all: &[ElementInfo], mut at: Option<usize>, path: &str) -> bool {
    while let Some(n) = at {
        if all[n].path == path {
            return true;
        }
        at = all[n].parent;
    }
    false
}

#[test]
fn cards_and_tabs_take_the_radius() {
    let (deck, id) = seeded();
    let rt = drawn(&deck, &Query::default(), true);
    assert_eq!(
        by_key(&rt, &format!("card-{id}")).radius,
        theme::radius::button
    );
    assert_eq!(by_key(&rt, "tab-0").radius, theme::radius::button);
    assert_eq!(by_key(&rt, "tab-add").radius, theme::radius::button);
    assert_eq!(
        by_key(&rt, &format!("card-{id}-opt-0")).radius,
        theme::radius::button
    );
}

#[test]
fn content_selects_and_control_labels_do_not() {
    let (deck, id) = seeded();
    let mut rt = drawn(&deck, &Query::default(), true);
    let content = with_text(&rt, "Body of the card");
    assert_eq!(
        cursor_over(&mut rt, &content),
        Cursor::Text,
        "{:?} selects",
        content.text
    );
    let all = rt.elements();
    // The kind line is part of the card's way into its thread (the walkthrough of 2026-11-21).
    for control in [
        "tab-0",
        &format!("card-{id}-opt-0"),
        &format!("card-{id}-title"),
    ] {
        let path = by_key(&rt, control).path;
        let label = all
            .iter()
            .enumerate()
            .find(|(i, e)| e.text.is_some() && inside(&all, Some(*i), &path))
            .map(|(_, e)| e.clone())
            .expect("a label");
        assert_ne!(
            cursor_over(&mut rt, &label),
            Cursor::Text,
            "{:?} is a control label",
            label.text
        );
    }
    let mut rt = drawn(&deck, &thread_query(&id), true);
    for said in ["Words from the user", "Words from an agent"] {
        let message = with_text(&rt, said);
        assert_eq!(
            cursor_over(&mut rt, &message),
            Cursor::Text,
            "{said:?} selects"
        );
    }
}

#[test]
fn each_message_has_the_left_rule() {
    let (deck, id) = seeded();
    let rt = drawn(&deck, &thread_query(&id), false);
    let mut dashed = 0;
    let mut solid = 0;
    for i in 0.. {
        let Some(message) = rt
            .elements()
            .into_iter()
            .find(|e| e.key.as_deref() == Some(&format!("message-{i}")))
        else {
            break;
        };
        let (kind, bar) = ["dashed", "solid"]
            .iter()
            .find_map(|kind| {
                rt.elements()
                    .into_iter()
                    .find(|e| e.key.as_deref() == Some(&format!("message-{i}-rule-{kind}")))
                    .map(|bar| (*kind, bar))
            })
            .unwrap_or_else(|| panic!("message {i} has no left rule"));
        assert_eq!(bar.rect[2], 2.0, "the rule is 2 px wide");
        assert!(
            (bar.rect[3] - message.rect[3]).abs() <= 1.0,
            "the rule is as tall as its message"
        );
        assert!(bar.rect[0] <= message.rect[0] + 1.0, "it is on the left");
        match kind {
            "dashed" => dashed += 1,
            _ => solid += 1,
        }
    }
    assert_eq!(
        (solid, dashed),
        (1, 1),
        "the user's is solid, the agent's dashed"
    );
}

#[test]
fn the_kind_line_is_one_centred_row_with_the_pager_on_the_centre() {
    let (deck, id) = seeded();
    let rt = drawn(&deck, &thread_query(&id), true);
    let all = rt.elements();
    let kind = by_key(&rt, "kind");
    let texts: Vec<ElementInfo> = all
        .iter()
        .enumerate()
        .filter(|(i, e)| e.text.is_some() && inside(&all, Some(*i), &kind.path))
        .map(|(_, e)| e.clone())
        .collect();
    let arrows: Vec<ElementInfo> = ["‹", "›"].map(|a| with_text(&rt, a)).to_vec();
    let line = texts[0].rect[3];
    for e in texts.iter().chain(&arrows) {
        assert_eq!(e.rect[3], line, "{:?} is not the line's size", e.text);
        let centre = e.rect[1] + e.rect[3] / 2.0;
        let first = texts[0].rect[1] + texts[0].rect[3] / 2.0;
        assert!((centre - first).abs() <= 1.0, "{:?} is off centre", e.text);
    }
    let bar = all
        .iter()
        .enumerate()
        .find(|(i, e)| e.text.is_none() && e.rect[2] <= 4.0 && inside(&all, Some(*i), &kind.path))
        .map(|(_, e)| e.clone())
        .expect("the accent bar");
    assert!(bar.rect[3] <= line, "the bar is no taller than the text");
    let clock = texts
        .iter()
        .find(|e| {
            e.text.as_deref().is_some_and(|t| {
                t.len() == 5
                    && t.as_bytes()[2] == b':'
                    && t.chars().filter(char::is_ascii_digit).count() == 4
            })
        })
        .expect("the time as HH:MM");
    assert!(
        clock.help.as_deref().is_some_and(|h| h.contains('T')),
        "the full time is on its help: {:?}",
        clock.help
    );
    // The walkthrough of 2026-11-21 moved `‹ code ›` to the centre, as the page's header grid; X/N
    // reads from the right edge.
    let (nav, position) = (by_key(&rt, "nav"), by_key(&rt, "position"));
    let page = by_key(&rt, "thread");
    let middle = |r: [f32; 4]| r[0] + r[2] / 2.0;
    assert!(
        (middle(nav.rect) - middle(page.rect)).abs() <= 1.0,
        "the pager is on the centre: nav {:?} page {:?}",
        nav.rect,
        page.rect
    );
    assert!(
        (position.rect[0] + position.rect[2] - (page.rect[0] + page.rect[2])).abs() <= 1.0,
        "X/N is at the right edge: {:?} page {:?}",
        position.rect,
        page.rect
    );
}
