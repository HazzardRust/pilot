//! rune-deck-ui S8: a thread drawn whole from a real scratch deck's view, and Escape or ← going
//! back to the deck that owns it (L7: the view is the daemon's, recorded by a real read).

mod support;

use pilot_deck::app::State;
use pilot_deck::client::{Client, Query};
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

    a_back_press_survives_the_next_live_refetch(&deck, query);
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
