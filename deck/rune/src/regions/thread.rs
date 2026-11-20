//! A thread read whole (spec 2): its kind line, its nav (‹ code › X/N), title, type note, body,
//! messages and resolution, every word as `deck/view/thread.mjs` resolved it (L2). Bodies and
//! messages are markdown drawn by rune-kit (L8). Escape or ← goes back to the deck that owns it.

use rune::tok::{self, type_};
use rune::{Color, Cx, El, Key, col, el, row, text};
use rune_kit::markdown::{Markdown, MarkdownStyle};
use serde::Deserialize;

use crate::app::State;
use crate::client::Query;
use crate::theme::{self, space};

#[derive(Debug, Default)]
pub struct Local;

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KindLine {
    accent: String,
    state: String,
    tone: String,
    kind: String,
    at: String,
    standing: Option<String>,
    owner: String,
}

#[derive(Debug, Deserialize)]
struct Step {
    id: String,
}

#[derive(Debug, Default, Deserialize)]
struct Nav {
    prev: Option<Step>,
    code: Option<String>,
    run: Option<String>,
    next: Option<Step>,
    position: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Message {
    by: String,
    at: Option<String>,
    text: String,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Thread {
    title: String,
    kind_line: KindLine,
    nav: Nav,
    type_note: Option<String>,
    body: String,
    #[serde(default)]
    messages: Vec<Message>,
    resolution: Option<String>,
}

/// The query a move to another screen asks for; the one place a thread changes what is read.
fn go(s: &mut State, query: Query) {
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

fn back(run: Option<String>) -> impl Fn(&mut State, &rune::KeyEvent, &mut rune::Tx) -> bool {
    move |s, ev, _| {
        if !matches!(ev.key, Key::Escape | Key::Left) {
            return false;
        }
        let all = s.query.all;
        go(
            s,
            Query {
                screen: "home".into(),
                run: run.clone(),
                all,
                ..Query::default()
            },
        );
        true
    }
}

fn arrow(step: Option<Step>, glyph: &str, ink: Color, quiet: Color) -> El {
    match step {
        None => text(glyph).font(type_::TITLE).color(quiet),
        Some(Step { id }) => text(glyph)
            .font(type_::TITLE)
            .color(ink)
            .role("link")
            .on_press(move |s: &mut State| {
                let query = Query {
                    id: Some(id.clone()),
                    ..s.query.clone()
                };
                go(s, query);
            }),
    }
}

pub fn draw(v: &serde_json::Value, _: &Local, cx: &mut Cx<State>) -> El {
    // No thread on this screen, or one the view cannot be read as: nothing, never a dead window.
    let Ok(th) = Thread::deserialize(v) else {
        return el();
    };
    let dark = cx.system_dark();
    let (t, k) = (tok::theme(dark), theme::tokens(dark));
    let md = MarkdownStyle::neutral(dark);
    let accent = match th.kind_line.accent.as_str() {
        "green" => k.accent.green,
        "yellow" => k.accent.yellow,
        "red" => k.accent.red,
        "blue" => k.accent.blue,
        _ => k.accent.plain,
    };
    let tone = match th.kind_line.tone.as_str() {
        "pilot" => k.state.pilot,
        "resolved" => k.state.resolved,
        "unacknowledged" => k.state.unacknowledged,
        _ => k.state.waiting,
    };
    let line = |words: &str| text(words).font(type_::LABEL).color(k.quiet);

    let mut kind = row()
        .key("kind")
        .gap(space::within)
        .child(el().size(space::s2, space::s4).fill(accent))
        .child(text(&th.kind_line.state).font(type_::LABEL).color(tone))
        .child(line(&th.kind_line.kind))
        .child(line(&th.kind_line.at));
    if let Some(standing) = &th.kind_line.standing {
        kind = kind.child(line(standing));
    }
    kind = kind.child(line(&th.kind_line.owner));

    let mut nav = row()
        .key("nav")
        .role("navigation")
        .gap(space::within)
        .child(arrow(th.nav.prev, "‹", t.text, k.quiet));
    if let Some(code) = &th.nav.code {
        nav = nav.child(text(code).font(type_::LABEL).color(t.text));
    }
    nav = nav.child(arrow(th.nav.next, "›", t.text, k.quiet));
    if let Some(position) = &th.nav.position {
        nav = nav.child(line(position));
    }

    let mut page = col()
        .key("thread")
        .focusable(true)
        .on_key(back(th.nav.run))
        .gap(space::between)
        .child(row().gap(space::between).child(kind).child(nav))
        .child(text(&th.title).font(type_::TITLE).color(t.text));
    if let Some(note) = &th.type_note {
        page = page.child(line(note));
    }
    page = page.child(Markdown::new(th.body).render(&md).key("body"));
    for (i, message) in th.messages.into_iter().enumerate() {
        let by = match message.at {
            Some(at) => format!("{} · {at}", message.by),
            None => message.by,
        };
        page = page.child(
            col()
                .key(format!("message-{i}"))
                .gap(space::within)
                .padding(space::pad)
                .child(line(&by))
                .child(Markdown::new(message.text).render(&md)),
        );
    }
    if let Some(resolution) = th.resolution {
        page = page.child(
            col()
                .key("resolution")
                .gap(space::within)
                .child(line("closed"))
                .child(Markdown::new(resolution).render(&md)),
        );
    }
    page
}
