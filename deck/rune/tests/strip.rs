//! rune-deck-ui S17: the right strip. Its controls are the view's, Create checks the name as the
//! daemon does before Next, the toggle sets the query, and a create opens the new thread. Every press
//! that posts runs against a scratch daemon, never 4321, and that daemon refuses Start before a spawn.

mod support;

use std::sync::Arc;
use std::time::{Duration, Instant};

use pilot_deck::act::Acted;
use pilot_deck::act_deck::DeckAction;
use pilot_deck::app::{self, State};
use pilot_deck::client::{Error, View};
use pilot_deck::regions::strip::{self, Local};
use rune::{Env, Runtime, TextEdit};
use serde_json::{Value, json};

fn view_with(strip: Value) -> View {
    View {
        screen: "home".into(),
        seq: 99,
        regions: [("strip".to_string(), strip)].into_iter().collect(),
    }
}

/// What `stripView` answers for an ended tab, D2, that holds no ticket.
fn ended_tab() -> Value {
    json!({
        "all": false,
        "tab": { "repo": "C:/work/ended", "code": "D2" },
        "create": {},
        "start": "start",
        "close": true,
        "alerts": { "weekly": true },
    })
}

fn frame(state: State) -> Runtime<State> {
    let mut rt = Runtime::new(state, app::view, (1280.0, 800.0), Env::new(true, 1.0));
    rt.frame(0.0);
    rt
}

fn texts(rt: &Runtime<State>) -> Vec<String> {
    rt.elements()
        .into_iter()
        .filter_map(|element| element.text)
        .collect()
}

/// Presses `key` once the layout has settled, so a control still springing into place is where it lands.
fn press(rt: &mut Runtime<State>, key: &str) {
    rt.frame(1.0);
    let (x, y) = rt.find(key).unwrap_or_else(|| panic!("no {key} drawn"));
    rt.pointer_move(x, y);
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
    rt.frame(0.0);
}

fn naming(words: &str) -> Local {
    Local {
        naming: Some(TextEdit::new(words)),
        ..Local::default()
    }
}

#[test]
fn the_strip_draws_the_views_controls() {
    let shown = texts(&frame(State {
        view: view_with(ended_tab()),
        ..State::default()
    }));

    for want in ["Open", "Create", "Start", "Close", "Weekly alerts on"] {
        assert!(shown.iter().any(|t| t == want), "no {want:?} in {shown:?}");
    }
    let live = json!({ "all": true, "tab": { "repo": "C:/work/live", "code": "D1" }, "create": {}, "close": false, "alerts": { "weekly": false } });
    let shown = texts(&frame(State {
        view: view_with(live),
        ..State::default()
    }));
    assert!(shown.iter().any(|t| t == "All"), "{shown:?}");
    assert!(shown.iter().any(|t| t == "Weekly alerts off"), "{shown:?}");
    assert!(
        !shown.iter().any(|t| t == "Start" || t == "Close"),
        "a live tab has neither: {shown:?}"
    );
}

#[test]
fn create_checks_the_name_before_next() {
    let too_long = "a".repeat(61);
    for bad in [
        "",
        "   ",
        "rm -rf /",
        "a;b",
        "naïve",
        "tab\there",
        too_long.as_str(),
    ] {
        let mut local = naming(bad);
        assert!(!local.can_next(), "{bad:?} lets Next through");
        local.next();
        assert!(!local.sure, "{bad:?} reached the confirm");
        assert_eq!(local.confirm("C:/work/ended"), None);
    }
    let sixty = "b".repeat(60);
    for good in ["Fix the kettle", "a", "x_y-z 9", " padded ", sixty.as_str()] {
        let mut local = naming(good);
        assert!(local.can_next(), "{good:?} is a name the daemon takes");
        local.next();
        assert!(local.sure);
    }
}

#[test]
fn next_pressed_on_a_bad_name_stays_on_the_name() {
    let mut rt = frame(State {
        view: view_with(ended_tab()),
        ..State::default()
    });
    press(&mut rt, "strip-create");
    rt.update(|s, _| {
        s.regions.strip.naming = Some(TextEdit::new("no/slashes"));
    });
    rt.frame(0.0);

    press(&mut rt, "strip-next");

    let mut sure = true;
    rt.update(|s, _| sure = s.regions.strip.sure);
    assert!(!sure, "Next is disabled on a name the daemon refuses");
}

#[test]
fn the_toggle_flips_the_scope() {
    let mut rt = frame(State {
        view: view_with(ended_tab()),
        ..State::default()
    });

    press(&mut rt, "strip-toggle");

    let mut all = false;
    rt.update(|s, _| all = s.query.all);
    assert!(all, "Open pressed lists everything");
    press(&mut rt, "strip-toggle");
    rt.update(|s, _| all = s.query.all);
    assert!(!all, "and pressed again, the queue alone");
}

#[test]
fn a_create_posts_what_the_name_checked_and_opens_the_new_thread_once_taken() {
    let mut state = State {
        view: view_with(ended_tab()),
        ..State::default()
    };
    state.regions.strip = naming("  Fix the kettle ");
    state.regions.strip.next();

    assert_eq!(
        state.regions.strip.confirm("C:/work/ended"),
        Some(DeckAction::Create {
            name: "Fix the kettle".into(),
            repo: "C:/work/ended".into()
        })
    );
    strip::create(&mut state, "C:/work/ended");
    assert!(state.pending.is_sent("strip-confirm"), "Create is out");

    let taken = Ok(Acted::Taken {
        location: "/thread/itm_0000000000ab".into(),
    });
    strip::answered(&mut state, "strip-confirm", &taken);

    assert_eq!(state.query.screen, "thread");
    assert_eq!(state.query.id.as_deref(), Some("itm_0000000000ab"));
    assert!(
        state.regions.strip.naming.is_none(),
        "Create closes once taken"
    );
}

#[test]
fn a_refused_create_keeps_the_name_beside_the_reason() {
    let mut state = State::default();
    state.regions.strip = naming("Fix the kettle");
    state.regions.strip.next();

    let refused = Ok(Acted::Refused {
        reason: "Create opens a thread on a repository the deck knows".into(),
    });
    strip::answered(&mut state, "strip-confirm", &refused);

    assert_eq!(state.query.screen, "home");
    let local = &state.regions.strip;
    assert_eq!(
        local.naming.as_ref().map(|edit| edit.text.as_str()),
        Some("Fix the kettle")
    );
    assert!(
        local
            .refused
            .as_deref()
            .is_some_and(|r| r.contains("deck knows"))
    );

    strip::answered(&mut state, "strip-confirm", &Err(Error::Status(500)));
    assert!(
        state.regions.strip.refused.is_some(),
        "an unreachable deck is said too"
    );
}

#[test]
fn start_asks_first_and_a_refusal_is_said_in_the_decks_words() {
    let mut state = State::default();

    strip::session(&mut state, strip::Ask::Start, "C:/work/ended");
    assert_eq!(state.regions.strip.asking, Some(strip::Ask::Start));
    assert!(
        !state.pending.is_sent("strip-start"),
        "the first press asks"
    );
    strip::session(&mut state, strip::Ask::Start, "C:/work/ended");
    assert!(state.pending.is_sent("strip-start"), "the Confirm posts");

    let taken = Ok(Acted::Taken {
        location:
            "/?run=C%3A%2Fwork%2Fended&sessionRefused=starting%20a%20session%20is%20turned%20off"
                .into(),
    });
    strip::answered(&mut state, "strip-start", &taken);
    assert_eq!(
        state.regions.strip.refused.as_deref(),
        Some("starting a session is turned off")
    );
}

#[test]
fn creating_in_the_window_opens_the_scratch_decks_new_thread() {
    let deck = support::Scratch::start();
    ureq::post(format!("{}/api/runs", deck.url))
        .header(
            "Authorization",
            format!("Bearer {}", support::secret(&deck)),
        )
        .send_json(json!({ "repo": "C:/work/alpha", "pid": deck.pid }))
        .expect("the run registers");
    let tab = json!({ "all": false, "tab": { "repo": "C:/work/alpha", "code": "D1" }, "create": {}, "close": false, "alerts": { "weekly": true } });
    let mut state = State {
        view: view_with(tab),
        ..State::default()
    };
    state.pending.deck = Some(Arc::new(support::client_for(&deck)));
    let mut rt = frame(state);

    press(&mut rt, "strip-create");
    rt.update(|s, _| s.regions.strip.naming = Some(TextEdit::new("Try the strip")));
    rt.frame(0.0);
    press(&mut rt, "strip-next");
    press(&mut rt, "strip-confirm");
    let deadline = Instant::now() + Duration::from_secs(10);
    while rt.state.query.screen != "thread" {
        assert!(Instant::now() < deadline, "the create never answered");
        std::thread::sleep(Duration::from_millis(20));
        rt.update(|s, tx| {
            app::poll(s, 0.0, tx);
        });
    }

    let (mut screen, mut id) = (String::new(), None);
    rt.update(|s, _| {
        screen = s.query.screen.clone();
        id = s.query.id.clone();
    });
    assert_eq!(screen, "thread");
    let id = id.expect("the new thread's id");
    let made = support::item(&deck, &id);
    assert_eq!(made["title"], "Try the strip");
    assert_eq!(made["repo"], "C:/work/alpha");
}
