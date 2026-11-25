//! The window's state and its one view: every region drawn from one `View` (spec 6a).

use rune::tok;
use rune::{AppSpec, Cx, El, Titlebar, Tx, Waker, col, row, text};

use crate::act;
use crate::client::{Client, Query, View};
use crate::layout;
use crate::live::{self, Feed};
use crate::prefs::{self, Prefs};
use crate::regions::{self, Locals};
use crate::theme::{self, size, space, type_};

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
    /// A panel resize in hand.
    pub layout: layout::Local,
    /// The posts in flight, settled once in `poll`.
    pub pending: act::Pending,
    /// The screens the window has left, and the ones it went back from (spec 25).
    pub history: History,
}

impl State {
    /// Down with no view read yet: the regions know nothing, so they draw nothing rather than
    /// an empty state that claims there is nothing (S32).
    pub fn blind(&self) -> bool {
        self.down && self.view.regions.is_empty()
    }
}

/// Back and forward through the queries the window has asked for.
#[derive(Debug, Default)]
pub struct History {
    back: Vec<Query>,
    forward: Vec<Query>,
}

/// The one way the window moves to another screen: the live reader is told, the step is
/// remembered, and anything ahead of it is forgotten.
pub fn go(s: &mut State, query: Query) {
    if query == s.query {
        return;
    }
    let from = s.query.clone();
    s.history.back.push(from);
    s.history.forward.clear();
    visit(s, query);
}

/// The previous screen, the one now open kept for `forward`; none when there is no previous one.
pub fn back(s: &mut State) {
    if let Some(query) = s.history.back.pop() {
        let from = s.query.clone();
        s.history.forward.push(from);
        visit(s, query);
    }
}

/// A thread's way off (escape.mjs `leave`): `back` when the screen behind is a deck page, since
/// another thread is no way off; otherwise to `deck`, the deck that owns the thread.
pub fn leave(s: &mut State, deck: Query) {
    if s.history.back.last().is_some_and(|q| q.id.is_none()) {
        back(s);
    } else {
        go(s, deck);
    }
}

/// The screen `back` left, the one now open kept for `back`.
pub fn forward(s: &mut State) {
    if let Some(query) = s.history.forward.pop() {
        let from = s.query.clone();
        s.history.back.push(from);
        visit(s, query);
    }
}

fn visit(s: &mut State, query: Query) {
    if let Some(live) = &s.live {
        live.ask(&query);
    }
    // Each thread has its own reply box, as on the page: words typed here never post on another,
    // and the last thread's box is not drawn while the next one's view is on its way.
    if query.id != s.query.id {
        s.regions.reply = Default::default();
        s.view.regions.remove("reply");
    }
    s.query = query;
}

/// The window's keys: Alt+Left and Alt+Right walk the history, the rest are the thread's. A focused
/// field or control keeps its keys.
pub fn key(s: &mut State, ev: &rune::KeyEvent, tx: &mut Tx) -> bool {
    // A text field takes Alt+arrows itself and does not pass them on; a clicked button does, so
    // the history keys still work after any click.
    if ev.mods.alt {
        match ev.key {
            rune::Key::Left => back(s),
            rune::Key::Right => forward(s),
            _ => return false,
        }
        return true;
    }
    regions::thread::key(s, ev, tx)
}

/// `root` with the mouse's side buttons wired to `back` and `forward`, wherever on it they press.
pub fn mouse_nav(root: El) -> El {
    root.pointer_buttons([rune::PointerButton::Back, rune::PointerButton::Forward])
        .on_background_press_tx(|s: &mut State, tx: &mut Tx| match tx.button() {
            rune::PointerButton::Back => back(s),
            rune::PointerButton::Forward => forward(s),
            _ => {}
        })
}

/// What the window opens on (ui-design-workflow S2, spec 7): `--open <route>`, the HTML deck's
/// query (`screen=thread&id=itm_x`). Every other argument is Rune's, its own `--theme light|dark`
/// for the mode among them.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct Start {
    pub query: Query,
}

const OPEN: &str = "--open";
/// The screens `/api/view` serves; deck/view/index.mjs `SCREENS` and deck/rune/surface.json
/// `screens` name the same four.
const SCREENS: [&str; 4] = ["home", "thread", "items", "archive"];

impl Start {
    /// `pilot-deck`'s own flag out of `args` (without the program name): `--open`, at most once,
    /// with a value. Rune's flags are left for Rune.
    pub fn from_args(args: impl IntoIterator<Item = String>) -> Result<Start, String> {
        let mut start = Start::default();
        let mut open = false;
        let mut args = args.into_iter();
        while let Some(flag) = args.next() {
            if flag != OPEN {
                continue;
            }
            if std::mem::replace(&mut open, true) {
                return Err(format!("{flag} is given twice"));
            }
            let value = args.next().ok_or_else(|| format!("{flag} needs a value"))?;
            start.query = route(&value)?;
        }
        Ok(start)
    }

    /// The arguments Rune reads: `args` without `--open` and its value.
    pub fn rune_args(&self, args: impl IntoIterator<Item = String>) -> Vec<String> {
        let mut args = args.into_iter();
        let mut rune = Vec::new();
        while let Some(arg) = args.next() {
            if arg == OPEN {
                args.next();
            } else {
                rune.push(arg);
            }
        }
        rune
    }
}

/// A route, `key=value` pairs joined by `&`, into a query: each key one of `Query`'s, at most once,
/// with a value; `screen` one `/api/view` serves, and `all` only `1`.
fn route(text: &str) -> Result<Query, String> {
    let mut query = Query::default();
    let mut seen = Vec::new();
    for pair in text.split('&') {
        let (key, value) = pair
            .split_once('=')
            .filter(|(_, v)| !v.is_empty())
            .ok_or_else(|| format!("{OPEN} {text}: {pair} is not key=value"))?;
        if seen.contains(&key) {
            return Err(format!("{OPEN} {text}: {key} is given twice"));
        }
        seen.push(key);
        match key {
            "screen" if SCREENS.contains(&value) => query.screen = value.into(),
            "screen" => {
                return Err(format!(
                    "{OPEN} {text}: no screen {value}; use {}",
                    SCREENS.join(", ")
                ));
            }
            "all" if value == "1" => query.all = true,
            "run" => query.run = Some(value.into()),
            "ticket" => query.ticket = Some(value.into()),
            "id" => query.id = Some(value.into()),
            _ => {
                return Err(format!(
                    "{OPEN} {text}: {key}={value} is not screen, run, all=1, ticket or id"
                ));
            }
        }
    }
    Ok(query)
}

impl State {
    /// The first view, read once, of the screen `start` opens on; an error leaves the window up
    /// and saying so (spec 10).
    pub fn load(start: Start) -> State {
        let query = start.query;
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
        on_key: Some(key),
        // Inter for the UI, JetBrains Mono for code, ids and times, both bundled (spec 22).
        fonts: &[
            include_bytes!("../assets/fonts/Inter-Regular.ttf"),
            include_bytes!("../assets/fonts/Inter-Medium.ttf"),
            include_bytes!("../assets/fonts/Inter-SemiBold.ttf"),
            include_bytes!("../assets/fonts/JetBrainsMono-Regular.ttf"),
            include_bytes!("../assets/fonts/JetBrainsMono-Medium.ttf"),
            include_bytes!("../assets/fonts/JetBrainsMono-Bold.ttf"),
        ],
        families: (type_::UI, type_::MONO),
        ..AppSpec::new(
            "pilot deck",
            (1280.0, 800.0),
            || State::load(Start::default()),
            view,
        )
    }
}

/// The window's app: `spec`, with Tab and Shift+Tab visiting every focusable control, as Rune
/// visits only text fields and lists by default, and the window's own title bar in place of the
/// native one (DESIGN.md §4b): Rune keeps the resize edges, snap layouts and caption buttons, and
/// `layout::strips` draws the band that drags the window.
pub fn app() -> rune::App<State> {
    rune::App::new(spec())
        .tab_visits_controls(true)
        .titlebar(Titlebar::new(size::titlebar))
        // Centred on its monitor when it opens: the OS's cascade put its close button off a
        // 1440-wide screen.
        .on_window(|window| window.center())
}

/// Starts the live reader on the window's query; a client refused here leaves `load`'s word.
pub fn setup(s: &mut State, wake: Waker) {
    s.pending.wake = Some(wake.clone());
    match Client::from_env() {
        Ok(client) => s.live = Some(live::start(client, s.query.clone(), wake)),
        Err(err) => eprintln!("pilot-deck: no live view: {err}"),
    }
}

/// Takes what the reader last left: a view replaces the whole `view` and nothing else, so a
/// draft, a scroll and the open panels stay (spec 4); `Down` keeps the last view under the banner.
pub fn poll(s: &mut State, _: f64, tx: &mut Tx) -> bool {
    // Every post through `act::send` is answered here, once, on the control that sent it.
    let answered = s.pending.settle();
    for (key, acted) in &answered {
        let reason = act::refusal(acted);
        let r = &mut s.regions;
        regions::queue::answered(&mut r.queue, key, reason.clone());
        regions::history::answered(&mut r.history, key, reason.clone());
        regions::chat::answered(&mut r.chat, key, reason.clone());
        regions::reply::answered(&mut r.reply, key, reason.clone());
        regions::tickets::answered(&mut r.tickets, key, reason.clone());
        regions::notifications::answered(&mut r.notifications, key, reason);
        regions::tabs::answered(s, key, acted);
        regions::strip::answered(s, key, acted);
    }
    regions::tickets::carry(s);
    let settled = !answered.is_empty();
    regions::usage::poll(s, tx);
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
    fed | settled
}

/// The window: the side strips around the centre column (`layout`).
pub fn view(s: &State, cx: &mut Cx<State>) -> El {
    // Text and fields given no colour draw in the page's ink, not Rune's white.
    cx.foreground(theme::tokens(cx.system_dark()).text);
    layout::strips(s, cx)
}

/// The centre column's region slots, top to bottom; the side panels are `layout`'s.
pub fn center(s: &State, cx: &mut Cx<State>) -> El {
    let dark = cx.system_dark();
    let t = tok::theme(dark);
    let none = serde_json::Value::Null;
    let region = |name: &str| s.view.regions.get(name).unwrap_or(&none);
    let r = &s.regions;
    // The page's top inset (deck.css `--top`, 2.5rem): with the content row's own `pad`, the
    // header starts 40 px under the title bar's rule, not against it.
    let mut screen = col().gap(space::between).pt(space::s7);
    if s.down {
        screen = screen.child(
            row()
                .gap(space::between)
                .child(
                    text("deck not running")
                        .font(type_::BODY)
                        .color(t.text_secondary),
                )
                .child(
                    theme::control(text("Retry"), dark)
                        .key("retry")
                        .font(type_::BODY)
                        .color(t.text)
                        .role("button")
                        .on_press(|s: &mut State| {
                            if let Some(live) = &s.live {
                                live.retry();
                            }
                        }),
                ),
        );
    }
    if s.blind() {
        return screen;
    }
    // deck.css's `header`: the tabs; the usage readout is the title bar's (`layout::strips`).
    screen = screen.child(col().key("header").child(regions::tabs::draw(
        region("tabs"),
        &r.tabs,
        &s.pending,
        cx,
    )));
    // The queue is the home page's and the thread page lists no settled threads
    // (view/queue.mjs, history.mjs): a region a screen withholds is not drawn, rather than saying
    // there is nothing in it.
    if s.query.screen == "home" {
        screen = screen.child(regions::queue::draw(region("queue"), &r.queue, cx));
    }
    screen = screen
        .child(regions::thread::draw(region("thread"), &r.thread, cx))
        .child(regions::reply::draw(region("reply"), &r.reply, cx));
    // The archive lists its own rows and withholds history's (archive-page L11); with a row's `id` it draws
    // that row's detail instead of the list (A3).
    if s.query.screen == "archive" && s.query.id.is_some() {
        let detail = regions::archive_detail::Detail::of(region("archiveDetail"));
        screen = screen.child(regions::archive_detail::draw(&detail, cx));
    } else if s.query.screen == "archive" {
        screen = screen.child(regions::archive::draw(region("archive"), &r.archive, cx));
    } else if s.query.screen != "thread" {
        screen = screen.child(regions::history::draw(region("history"), &r.history, cx));
    }
    screen
}
