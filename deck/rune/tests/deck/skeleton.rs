//! rune-deck-ui S1: the client's loopback rule and the window drawing a real daemon's tabs.

use crate::support;

use pilot_deck::app::{self, State};
use pilot_deck::client::{Client, Error, Query};
use rune::{Env, Runtime};

/// The client reads its address from the environment, which every test in this binary shares.
use crate::support::ENV;

fn client_with(vars: &[(&str, &str)]) -> Result<Client, Error> {
    let _held = ENV.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    // SAFETY: every test in this binary that touches the environment holds `ENV`.
    unsafe {
        vars.iter()
            .for_each(|(name, value)| std::env::set_var(name, value))
    };
    let made = Client::from_env();
    unsafe { vars.iter().for_each(|(name, _)| std::env::remove_var(name)) };
    made
}

#[test]
fn the_client_refuses_a_non_loopback_base() {
    // An Err here means no client exists, so no request can be made.
    match client_with(&[("PILOT_DECK_HOST", "example.com")]) {
        Err(Error::NotLoopback(host)) => assert_eq!(host, "example.com"),
        Err(other) => panic!("refused for the wrong reason: {other}"),
        Ok(_) => panic!("a client was made for example.com"),
    }
    assert!(client_with(&[("PILOT_DECK_HOST", "localhost")]).is_ok());
}

#[test]
fn the_client_refuses_a_port_that_is_not_one() {
    for port in ["abc", "0", "70000"] {
        assert!(
            matches!(client_with(&[("PILOT_DECK_PORT", port)]), Err(Error::BadPort(given)) if given == port),
            "{port} was taken"
        );
    }
}

#[test]
fn the_window_shows_the_scratch_decks_tabs() {
    let deck = support::Scratch::start();
    deck.post("Which port?", "C:/work/alpha");
    let port = deck.port.to_string();
    let client = client_with(&[
        ("PILOT_DECK_DIR", deck.dir.to_str().unwrap()),
        ("PILOT_DECK_PORT", &port),
    ])
    .expect("a loopback client");

    let view = client
        .view(&Query::default())
        .expect("the scratch deck's view");
    let mut rt = Runtime::new(
        State {
            view,
            ..State::default()
        },
        app::view,
        (1280.0, 800.0),
        Env::new(true, 1.0),
    );
    rt.frame(0.0);

    let texts: Vec<String> = rt
        .elements()
        .into_iter()
        .filter_map(|element| element.text)
        .collect();
    // The strip says its words in capitals, as the page's `.runs-strip a` does.
    for code in ["OVERVIEW", "ALPHA"] {
        assert!(
            texts.iter().any(|text| text == code),
            "no {code} tab among {texts:?}"
        );
    }
}
