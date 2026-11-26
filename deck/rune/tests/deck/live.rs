//! rune-deck-ui S2: the window follows a scratch deck's `/events`, says when the daemon is gone,
//! and comes back when it returns, refetching one whole view each time.

use crate::support;

use std::path::PathBuf;
use std::sync::Arc;
use std::sync::mpsc;
use std::time::{Duration, Instant};

use pilot_deck::app::{self, State};
use pilot_deck::client::{Client, Query};
use pilot_deck::live::{self, Feed};
use rune::{App, Env, Runtime, TextEdit};
use support::Scratch;

/// ADR 0121: one budget for the file, from the reader's own limit (its longest backoff, the most a
/// returning daemon waits for the next try) plus a fixed margin for a request on a loaded machine.
const BUDGET: Duration = Duration::from_millis(2000 + 1000);

/// The client reads its address from the environment, which every test in this binary shares.
use crate::support::ENV;

/// Runs `make` with the deck's address in the environment, as the window's own start reads it.
fn with_deck<T>(dir: &str, port: u16, make: impl FnOnce() -> T) -> T {
    let _held = ENV.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let port = port.to_string();
    let vars = [("PILOT_DECK_DIR", dir), ("PILOT_DECK_PORT", port.as_str())];
    // SAFETY: every test in this binary that touches the environment holds `ENV`.
    unsafe {
        vars.iter()
            .for_each(|(name, value)| std::env::set_var(name, value))
    };
    let made = make();
    unsafe { vars.iter().for_each(|(name, _)| std::env::remove_var(name)) };
    made
}

/// The window as `main` opens it, headless: `State::load`, then `setup` starting the reader.
fn window(dir: &str, port: u16) -> Runtime<State> {
    let mut rt = with_deck(dir, port, || {
        App::new(app::spec()).headless_runtime((1280.0, 800.0), Env::new(true, 1.0))
    });
    rt.frame(0.0);
    rt
}

/// Frames the window until `done` holds, or fails naming `what` once the budget is spent.
fn frame_until(
    rt: &mut Runtime<State>,
    what: &str,
    done: impl Fn(&Runtime<State>) -> bool,
) -> Duration {
    let start = Instant::now();
    loop {
        rt.frame(1.0 / 60.0);
        if done(rt) {
            return start.elapsed();
        }
        assert!(
            start.elapsed() < BUDGET,
            "{what} not within {BUDGET:?}; down {}, seq {}",
            rt.state.down,
            rt.state.view.seq
        );
        std::thread::yield_now();
    }
}

/// What the window shows: an element animating out (the banner leaving) is no longer shown.
fn texts(rt: &Runtime<State>) -> Vec<String> {
    rt.elements()
        .into_iter()
        .filter(|element| !element.exiting)
        .filter_map(|element| element.text)
        .collect()
}

/// A store dir the test owns, holding only the secret a deck answers to, as a restarted daemon's
/// store keeps the secret it had.
struct Keys(PathBuf);

impl Keys {
    fn new(name: &str) -> Keys {
        let dir = std::env::temp_dir().join(format!("pilot-live-{name}-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("a temp dir");
        Keys(dir)
    }

    fn take(&self, deck: &Scratch) {
        std::fs::copy(deck.dir.join("deck.secret"), self.0.join("deck.secret"))
            .expect("the scratch deck's secret");
    }

    fn dir(&self) -> &str {
        self.0.to_str().expect("a utf-8 temp path")
    }
}

impl Drop for Keys {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

#[test]
fn a_post_shows_without_input() {
    let deck = Scratch::start();
    let mut rt = window(deck.dir.to_str().unwrap(), deck.port);
    assert!(!texts(&rt).iter().any(|text| text == "beta"));

    // A post bumps no `seq` (only a reply does), so the new tab is what shows it arrived.
    deck.post("Which port?", "C:/work/beta");

    let took = frame_until(&mut rt, "the post's tab", |rt| {
        texts(rt).iter().any(|text| text == "beta")
    });
    eprintln!("a post shows without input: {took:?}");
}

#[test]
fn a_refresh_keeps_the_users_place() {
    let deck = Scratch::start();
    let mut rt = window(deck.dir.to_str().unwrap(), deck.port);
    rt.update(|s, _| s.regions.reply.draft = TextEdit::new("half a repl"));

    deck.post("Which port?", "C:/work/beta");
    frame_until(&mut rt, "the refresh", |rt| {
        texts(rt).iter().any(|text| text == "beta")
    });

    assert_eq!(rt.state.regions.reply.draft, TextEdit::new("half a repl"));
}

#[test]
fn a_stopped_daemon_is_said_and_a_restarted_one_comes_back() {
    let keys = Keys::new("restart");
    let deck = Scratch::start();
    keys.take(&deck);
    let port = deck.port;
    let mut rt = window(keys.dir(), port);
    assert!(!rt.state.down, "the deck was up when the window opened");

    drop(deck);
    let took = frame_until(&mut rt, "deck not running", |rt| {
        rt.state.down && texts(rt).iter().any(|text| text == "deck not running")
    });
    eprintln!("a stopped daemon is said: {took:?}");

    let back = Scratch::start_on(Some(port));
    keys.take(&back);
    back.post("Back again?", "C:/work/gamma");
    let took = frame_until(&mut rt, "the view back", |rt| {
        !rt.state.down && texts(rt).iter().any(|text| text == "gamma")
    });
    eprintln!("a restarted daemon comes back: {took:?}");
    assert!(!texts(&rt).iter().any(|text| text == "deck not running"));
}

#[test]
fn a_heartbeat_refreshes_every_region_from_one_view() {
    let deck = Scratch::start();
    let client = with_deck(deck.dir.to_str().unwrap(), deck.port, Client::from_env)
        .expect("a loopback client");
    let (woke, wakes) = mpsc::channel();
    let inbox = live::start(
        client,
        Query::default(),
        Arc::new(move || {
            let _ = woke.send(());
        }),
    );
    let next_view = || {
        let start = Instant::now();
        loop {
            let left = BUDGET
                .checked_sub(start.elapsed())
                .expect("a view within the budget");
            wakes.recv_timeout(left).expect("a view within the budget");
            match inbox.take() {
                Some(Feed::View(view)) => return (view, start.elapsed()),
                Some(Feed::Down) => panic!("the scratch deck read as down"),
                None => {}
            }
        }
    };
    // The reader's first view comes once it is listening, so the heartbeat is heard.
    let (first, _) = next_view();

    deck.heartbeat("agent-live-1", "C:/work/alpha");
    let (view, took) = next_view();
    eprintln!("a heartbeat refreshes: {took:?}");

    // A heartbeat writes no store, so the same seq comes back, every region in the one view.
    assert_eq!(view.seq, first.seq);
    let mut regions: Vec<&str> = view.regions.keys().map(String::as_str).collect();
    regions.sort_unstable();
    assert_eq!(
        regions,
        [
            "agents",
            "archive",
            "archiveDetail",
            "chat",
            "graph",
            "history",
            "notifications",
            "queue",
            "reply",
            "reports",
            "status",
            "strip",
            "tabs",
            "thread",
            "tickets",
            "usage"
        ]
    );
}

/// Presses the control keyed `key`, as a pointer does.
fn press(rt: &mut Runtime<State>, key: &str) {
    let at = rt
        .elements()
        .into_iter()
        .find(|element| element.key.as_deref() == Some(key))
        .unwrap_or_else(|| panic!("no element {key}"))
        .rect;
    let (x, y) = (at[0] + at[2] / 2.0, at[1] + at[3] / 2.0);
    rt.pointer_move(x, y);
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
    rt.frame(1.0 / 60.0);
}

#[test]
fn retry_reconnects_without_waiting_out_the_backoff() {
    let keys = Keys::new("retry");
    let deck = Scratch::start();
    keys.take(&deck);
    let port = deck.port;
    let mut rt = window(keys.dir(), port);

    drop(deck);
    frame_until(&mut rt, "deck not running", |rt| rt.state.down);
    // Let the reader settle into its longest wait: 250 + 500 + 1000 ms of failures, then 2 s sleeps.
    let settle = Instant::now();
    while settle.elapsed() < Duration::from_millis(2000) {
        rt.frame(1.0 / 60.0);
        std::thread::sleep(Duration::from_millis(5));
    }

    let back = Scratch::start_on(Some(port));
    keys.take(&back);
    // The deck is back but the reader sleeps; the window offers Retry and pressing it reconnects now.
    press(&mut rt, "retry");
    let took = frame_until(&mut rt, "the view back after Retry", |rt| !rt.state.down);
    eprintln!("retry reconnects: {took:?}");
    assert!(
        took < Duration::from_millis(1000),
        "Retry waited {took:?}, the backoff's length"
    );
}

#[test]
fn a_deck_down_at_first_load_claims_no_empty_regions() {
    let keys = Keys::new("blind");
    std::fs::write(keys.0.join("deck.secret"), "qa").expect("a secret");
    // A port nothing listens on: bound, then let go.
    let port = std::net::TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .expect("a free port")
        .port();
    let mut rt = window(keys.dir(), port);
    frame_until(&mut rt, "deck not running", |rt| {
        rt.state.down && texts(rt).iter().any(|text| text == "deck not running")
    });

    let shown = texts(&rt);
    for claim in [
        "Nothing is waiting on you.",
        "No finished threads yet.",
        "no tickets",
        "No chat open.",
    ] {
        assert!(
            !shown.iter().any(|text| text == claim),
            "down at first load, yet: {claim}"
        );
    }
}
