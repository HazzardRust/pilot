//! rune-deck-ui S8: a thread drawn whole from a real scratch deck's view, and Escape or ← going
//! back to the deck that owns it (L7: the view is the daemon's, recorded by a real read).

mod support;

use pilot_deck::app::State;
use pilot_deck::client::{Client, Query, View};
use pilot_deck::live::{self, Feed};
use pilot_deck::regions;
use std::sync::{Arc, mpsc};
use std::time::Duration;

use rune::{Cx, El, Env, Key, KeyEvent, Mods, Runtime};

fn thread_only(s: &State, cx: &mut Cx<State>) -> El {
    let none = serde_json::Value::Null;
    let v = s.view.regions.get("thread").unwrap_or(&none);
    regions::thread::draw(v, &s.regions.thread, cx)
}

fn press(rt: &mut Runtime<State>, key: Key) {
    rt.key(KeyEvent {
        key,
        mods: Mods::default(),
    });
    rt.frame(0.0);
}

#[test]
fn a_thread_reads_whole_and_escape_or_left_goes_back_to_its_deck() {
    let deck = support::Scratch::start();
    deck.post("Which port?", "C:/work/alpha");
    let secret = std::fs::read_to_string(deck.dir.join("deck.secret")).expect("the secret");
    let listed: serde_json::Value = ureq::get(format!("{}/api/items", deck.url))
        .header("Authorization", format!("Bearer {}", secret.trim()))
        .call()
        .expect("the scratch deck's items")
        .body_mut()
        .read_json()
        .expect("json");
    let id = listed["items"][0]["id"]
        .as_str()
        .expect("an id")
        .to_string();

    // SAFETY: this binary's only test sets the client's address, before any thread reads it.
    unsafe {
        std::env::set_var("PILOT_DECK_DIR", &deck.dir);
        std::env::set_var("PILOT_DECK_PORT", deck.port.to_string());
    }
    let query = Query {
        screen: "thread".into(),
        id: Some(id),
        ..Query::default()
    };
    let view = Client::from_env()
        .and_then(|client| client.view(&query))
        .expect("the thread's view");
    let owner = view.regions["thread"]["nav"]["run"]
        .as_str()
        .expect("the owning deck")
        .to_string();

    for key in [Key::Escape, Key::Left] {
        let mut rt = Runtime::new(
            State {
                view: view.clone(),
                query: query.clone(),
                ..State::default()
            },
            thread_only,
            (1280.0, 800.0),
            Env::new(true, 1.0),
        );
        rt.frame(0.0);
        let texts: Vec<String> = rt
            .elements()
            .into_iter()
            .filter_map(|element| element.text)
            .collect();
        for said in ["Which port?", "A or B", "question", "posted"] {
            assert!(
                texts.iter().any(|text| text.contains(said)),
                "no {said:?} among {texts:?}"
            );
        }

        press(&mut rt, Key::Tab);
        press(&mut rt, key.clone());
        assert_eq!(
            rt.state.query,
            Query {
                screen: "home".into(),
                run: Some(owner.clone()),
                ..Query::default()
            },
            "{key:?} goes back to the deck that owns the thread"
        );
    }

    escape_and_left_go_back_with_nothing_focused(&view, &query, &owner);
    a_key_typed_into_a_field_is_not_stolen(&view, &query);
    a_back_press_survives_the_next_live_refetch(&deck, query);
    a_move_reads_the_next_thread_at_once(&deck);
}

fn thread_ids(deck: &support::Scratch) -> Vec<String> {
    let secret = std::fs::read_to_string(deck.dir.join("deck.secret")).expect("the secret");
    let listed: serde_json::Value = ureq::get(format!("{}/api/items", deck.url))
        .header("Authorization", format!("Bearer {}", secret.trim()))
        .call()
        .expect("items")
        .body_mut()
        .read_json()
        .expect("json");
    listed["items"]
        .as_array()
        .expect("items")
        .iter()
        .map(|item| item["id"].as_str().expect("an id").to_string())
        .collect()
}

/// Spec 14: the arrow draws the next thread with no write to the deck between; and a view read
/// for the thread just left is not drawn on the next one.
fn a_move_reads_the_next_thread_at_once(deck: &support::Scratch) {
    deck.post("Second thread?", "C:/work/alpha");
    let ids = thread_ids(deck);
    assert!(ids.len() >= 2, "two threads: {ids:?}");
    let client = Client::from_env().expect("a loopback client");
    let at = |id: &str| Query {
        screen: "thread".into(),
        id: Some(id.to_string()),
        ..Query::default()
    };
    let first_query = at(&ids[0]);
    let first = client.view(&first_query).expect("the first thread");
    let (woke, wakes) = mpsc::channel();
    let inbox = live::start(
        client,
        first_query.clone(),
        Arc::new(move || {
            let _ = woke.send(());
        }),
    );
    let mut rt = Runtime::new(
        State {
            view: first.clone(),
            query: first_query,
            live: Some(inbox.clone()),
            ..State::default()
        },
        thread_only,
        (1280.0, 800.0),
        Env::new(true, 1.0),
    );
    rt.frame(0.0);
    // The connect's own refetch is for the thread being left; let it land, then move.
    wakes.recv_timeout(Duration::from_secs(3)).expect("connect");
    let arrow = rt
        .elements()
        .into_iter()
        .find(|element| element.role == "link")
        .expect("the thread's arrow is drawn");
    let (x, y) = (
        arrow.rect[0] + arrow.rect[2] / 2.0,
        arrow.rect[1] + arrow.rect[3] / 2.0,
    );
    rt.pointer_move(x, y);
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
    rt.frame(0.0);
    let nav = &first.regions["thread"]["nav"];
    let next = rt.state.query.id.clone().expect("a thread id");
    assert!(
        [&nav["prev"]["id"], &nav["next"]["id"]]
            .iter()
            .any(|neighbour| neighbour.as_str() == Some(next.as_str())),
        "the arrow went to a neighbour: {next} of {nav}"
    );
    // No write to the deck from here: only the move can bring the next thread's view.
    let moved = loop {
        wakes
            .recv_timeout(Duration::from_secs(3))
            .expect("the move's own view");
        if let Some(Feed::View(view)) = inbox.take() {
            break view;
        }
    };
    let second_title = Client::from_env()
        .and_then(|client| client.view(&at(&next)))
        .expect("the second")
        .regions["thread"]["title"]
        .as_str()
        .expect("a title")
        .to_string();
    assert_eq!(
        moved.regions["thread"]["title"].as_str(),
        Some(second_title.as_str())
    );
}

fn window(view: &View, query: &Query, draw: fn(&State, &mut Cx<State>) -> El) -> Runtime<State> {
    let mut rt = Runtime::new(
        State {
            view: view.clone(),
            query: query.clone(),
            ..State::default()
        },
        draw,
        (1280.0, 800.0),
        Env::new(true, 1.0),
    );
    // The window's own key route, as `app::spec` wires it.
    rt.on_key = pilot_deck::app::spec().on_key;
    rt.frame(0.0);
    rt
}

/// A thread just opened has no focus, so its own handler hears nothing until a Tab; the window's
/// route must take the back keys then.
fn escape_and_left_go_back_with_nothing_focused(view: &View, query: &Query, owner: &str) {
    for key in [Key::Escape, Key::Left] {
        let mut rt = window(view, query, thread_only);
        assert!(!rt.has_focus(), "a thread just opened holds no focus");
        press(&mut rt, key.clone());
        assert_eq!(
            rt.state.query,
            Query {
                screen: "home".into(),
                run: Some(owner.to_string()),
                ..Query::default()
            },
            "{key:?} with no Tab goes back to the deck that owns the thread"
        );
    }
}

fn thread_and_field(s: &State, cx: &mut Cx<State>) -> El {
    rune::col().child(thread_only(s, cx)).child(
        rune::text_input(&s.regions.reply.draft, rune::tok::type_::BODY)
            .key("field")
            .label("Reply")
            .on_edit(|s: &mut State| &mut s.regions.reply.draft),
    )
}

fn a_key_typed_into_a_field_is_not_stolen(view: &View, query: &Query) {
    let mut rt = window(view, query, thread_and_field);
    // The thread is the first stop, the field the second.
    press(&mut rt, Key::Tab);
    press(&mut rt, Key::Tab);
    assert!(rt.has_focus(), "focus is on a stop");
    press(&mut rt, Key::Left);
    assert_eq!(
        &rt.state.query, query,
        "← in a field moves the caret and does not go back"
    );
}

/// The live reader refetches for what the window last asked, so a nav press must tell it, or the
/// next `changed` would draw the thread's view over the deck the press went back to. Run from the
/// test above, which alone sets the client's address.
fn a_back_press_survives_the_next_live_refetch(deck: &support::Scratch, query: Query) {
    let client = Client::from_env().expect("a loopback client");
    let (woke, wakes) = mpsc::channel();
    let inbox = live::start(
        client,
        query.clone(),
        Arc::new(move || {
            let _ = woke.send(());
        }),
    );
    let next = || loop {
        wakes
            .recv_timeout(Duration::from_secs(3))
            .expect("a feed within the budget");
        match inbox.take() {
            Some(Feed::View(view)) => return view,
            Some(Feed::Down) => panic!("the scratch deck read as down"),
            None => {}
        }
    };
    let first = next();
    let mut rt = Runtime::new(
        State {
            view: first,
            query,
            live: Some(inbox.clone()),
            ..State::default()
        },
        thread_only,
        (1280.0, 800.0),
        Env::new(true, 1.0),
    );
    rt.frame(0.0);

    press(&mut rt, Key::Tab);
    press(&mut rt, Key::Escape);
    assert_eq!(rt.state.query.screen, "home");
    deck.heartbeat("agent-live-1", "C:/work/alpha");
    let after = next();

    assert!(
        after.regions.get("thread").is_none_or(|t| t.is_null()),
        "the refetch was for the thread again: {:?}",
        after.regions.get("thread")
    );
}
