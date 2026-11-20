//! The window's state and its one view: every region drawn from one `View` (spec 6a).

use rune::tok::{self, type_};
use rune::{AppSpec, Cx, El, Tx, Waker, col, text};

use crate::client::{Client, Query, View};
use crate::live::{self, Feed};
use crate::prefs::{self, Prefs};
use crate::regions::{self, Locals};

#[derive(Debug, Default)]
pub struct State {
    pub view: View,
    pub query: Query,
    pub regions: Locals,
    /// The window's own view state, loaded once and written back by the region that changes it (A4).
    pub prefs: Prefs,
    /// No view could be read: the daemon is down, or the client refused its address.
    pub down: bool,
    /// What the live reader leaves for `poll`; none until `setup` starts it.
    pub live: Option<live::Inbox>,
}

impl State {
    /// The first view, read once; an error leaves the window up and saying so (spec 10).
    pub fn load() -> State {
        let query = Query::default();
        let prefs = prefs::dir()
            .map(|dir| Prefs::load(&dir))
            .unwrap_or_default();
        match Client::from_env().and_then(|client| client.view(&query)) {
            Ok(view) => State {
                view,
                query,
                prefs,
                ..State::default()
            },
            Err(err) => {
                eprintln!("pilot-deck: {err}");
                State {
                    query,
                    prefs,
                    down: true,
                    ..State::default()
                }
            }
        }
    }
}

/// The window as `main` runs it: the first view, then the live reader feeding `poll`.
pub fn spec() -> AppSpec<State> {
    AppSpec {
        setup: Some(setup),
        poll: Some(poll),
        ..AppSpec::new("pilot deck", (1280.0, 800.0), State::load, view)
    }
}

/// Starts the live reader on the window's query; a client refused here leaves `load`'s word.
pub fn setup(s: &mut State, wake: Waker) {
    s.regions.queue.inbox.wake = Some(wake.clone());
    match Client::from_env() {
        Ok(client) => s.live = Some(live::start(client, s.query.clone(), wake)),
        Err(err) => eprintln!("pilot-deck: no live view: {err}"),
    }
}

/// Takes what the reader last left: a view replaces the whole `view` and nothing else, so a
/// draft, a scroll and the open panels stay (spec 4); `Down` keeps the last view under the banner.
pub fn poll(s: &mut State, _: f64, tx: &mut Tx) -> bool {
    // A send answered off the UI thread is taken here, as the live view is.
    let sent = regions::chat::settle(s, tx);
    let settled = regions::queue::settle(s);
    // A press's answer is the reply box's (S9), taken beside the view and never instead of it.
    let replied = regions::reply::poll(&mut s.regions.reply, tx);
    let fed = match s.live.as_ref().and_then(live::Inbox::take) {
        Some(Feed::View(view)) => {
            // Data the server brought lands instantly unless asked: a card arriving live springs in (spec 5).
            tx.animated();
            s.view = view;
            s.down = false;
            true
        }
        Some(Feed::Down) => !std::mem::replace(&mut s.down, true),
        None => false,
    };
    fed | settled | sent | replied
}

/// The screen's region slots, top to bottom; a stub region draws nothing until its slice.
pub fn view(s: &State, cx: &mut Cx<State>) -> El {
    let t = tok::theme(cx.system_dark());
    let none = serde_json::Value::Null;
    let region = |name: &str| s.view.regions.get(name).unwrap_or(&none);
    let r = &s.regions;
    let mut screen = col().w_full().h_full().fill(t.bg).padding(16.0).gap(16.0);
    if s.down {
        screen = screen.child(
            text("deck not running")
                .font(type_::BODY)
                .color(t.text_secondary),
        );
    }
    screen
        .child(regions::usage::draw(region("usage"), &r.usage, cx))
        .child(regions::tabs::draw(region("tabs"), &r.tabs, cx))
        .child(regions::notifications::draw(
            region("notifications"),
            &s.prefs,
            cx,
        ))
        .child(regions::queue::draw(region("queue"), &r.queue, cx))
        .child(regions::thread::draw(region("thread"), &r.thread, cx))
        .child(regions::reply::draw(region("reply"), &r.reply, cx))
        .child(regions::history::draw(region("history"), &r.history, cx))
        .child(regions::chat::draw(region("chat"), &r.chat, cx))
        .child(regions::status::draw(region("status"), &r.status, cx))
        .child(regions::graph::draw(region("graph"), &r.graph, cx))
        .child(regions::agents::draw(region("agents"), &r.agents, cx))
        .child(regions::tickets::draw(region("tickets"), &r.tickets, cx))
        .child(regions::reports::draw(region("reports"), &r.reports, cx))
        .child(regions::strip::draw(region("strip"), &r.strip, cx))
}
