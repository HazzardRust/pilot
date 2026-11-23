//! rune-deck-ui S25: no press waits on the deck. Against a deck that takes a post and never answers,
//! a press in the Tickets panel, the strip and the tab strip is sent through `act::send` in the frame of
//! the press, and `draw` disables a control exactly while its key is in flight.

use crate::support;

use std::net::TcpListener;
use std::sync::Arc;

use pilot_deck::app::{self, State};
use pilot_deck::client::View;
use rune::{Env, Runtime, TextEdit};
use serde_json::json;
use support::{Scratch, client_on};

/// A deck that holds every post: its socket accepts and is never answered.
fn window(holding: &TcpListener, deck: &Scratch) -> Runtime<State> {
    let port = holding.local_addr().expect("an address").port();
    let regions = [
        (
            "tickets".to_string(),
            json!({ "repo": "C:/work/alpha", "groups": [] }),
        ),
        (
            "strip".to_string(),
            json!({ "all": false, "create": {}, "close": false, "alerts": { "weekly": true } }),
        ),
        (
            "tabs".to_string(),
            json!({ "tabs": [{ "code": "D1", "name": "one", "repo": "C:/work/alpha", "count": 1 }] }),
        ),
    ];
    let mut state = State {
        view: View {
            screen: "home".into(),
            seq: 99,
            regions: regions.into_iter().collect(),
        },
        ..State::default()
    };
    state.prefs.open_panels.insert("tickets".into());
    state.pending.deck = Some(Arc::new(client_on(deck, port)));
    state.regions.tabs.adding = Some(TextEdit::new("C:/work/beta"));
    let mut rt = Runtime::new(state, app::view, (1280.0, 4000.0), Env::new(true, 1.0));
    rt.frame(0.0);
    rt
}

/// Presses `key` once the layout has settled and answers whether its write is out, drawn so in the frame
/// of the press: `draw` disables a control exactly while its key is in flight.
fn out_after_pressing(rt: &mut Runtime<State>, key: &str) -> bool {
    rt.frame(1.0);
    let (x, y) = rt.find(key).unwrap_or_else(|| panic!("no {key} drawn"));
    rt.pointer_move(x, y);
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
    rt.frame(1.0 / 60.0);
    rt.state.pending.is_sent(key)
}

#[test]
fn a_press_in_tickets_strip_and_tabs_is_sent_in_its_own_frame_while_the_deck_holds_the_post() {
    let deck = Scratch::start();
    let holding = TcpListener::bind("127.0.0.1:0").expect("a socket");
    let mut rt = window(&holding, &deck);

    for key in ["tickets-add", "strip-alerts", "add-deck-add"] {
        assert!(
            out_after_pressing(&mut rt, key),
            "{key} is out, not waited on"
        );
    }
}
