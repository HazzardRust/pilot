//! The window's state and its one view: every region drawn from one `View` (spec 6a).

use rune::tok::{self, type_};
use rune::{AppSpec, Cx, El, col, text};

use crate::client::{Client, Query, View};
use crate::regions::{self, Locals};

#[derive(Debug, Default)]
pub struct State {
    pub view: View,
    pub query: Query,
    pub regions: Locals,
    /// No view could be read: the daemon is down, or the client refused its address.
    pub down: bool,
}

impl State {
    /// The first view, read once; an error leaves the window up and saying so (spec 10).
    pub fn load() -> State {
        let query = Query::default();
        match Client::from_env().and_then(|client| client.view(&query)) {
            Ok(view) => State {
                view,
                query,
                ..State::default()
            },
            Err(err) => {
                eprintln!("pilot-deck: {err}");
                State {
                    query,
                    down: true,
                    ..State::default()
                }
            }
        }
    }
}

/// The window as `main` runs it.
pub fn spec() -> AppSpec<State> {
    AppSpec::new("pilot deck", (1280.0, 800.0), State::load, view)
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
            &r.notifications,
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
