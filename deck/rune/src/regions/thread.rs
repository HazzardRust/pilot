//! A thread read whole (spec 2): its kind line, its nav (‹ code › X/N), title, type note, body,
//! messages and resolution, every word as `deck/view/thread.mjs` resolved it (L2). Bodies and
//! messages are markdown drawn by rune-kit (L8). Escape or ← goes back to the deck that owns it.

use crate::theme::type_;
use rune::tok;
use rune::{Color, Cx, El, Key, col, el, row, text};
use serde::Deserialize;

use crate::app::{State, go};
use crate::client::Query;
use crate::regions::queue::hhmm;
use crate::theme::{self, space};

/// A message's left rule and its dashes: a stroke's width, not a spacing (so off the 4 grid, like the graph's).
const RULE: f32 = 2.0;

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

/// The window's route for the same keys: nothing has focus when a thread has just opened, so the
/// thread's own handler is not asked until a Tab. A focused field or control keeps its keys.
pub fn key(s: &mut State, ev: &rune::KeyEvent, tx: &mut rune::Tx) -> bool {
    if tx.focused().is_some() {
        return false;
    }
    let Some(v) = s.view.regions.get("thread") else {
        return false;
    };
    let Ok(th) = Thread::deserialize(v) else {
        return false;
    };
    back(th.nav.run)(s, ev, tx)
}

fn arrow(step: Option<Step>, glyph: &str, ink: Color, quiet: Color, dark: bool) -> El {
    match step {
        None => text(glyph).font(type_::BODY).color(quiet),
        Some(Step { id }) => theme::control(text(glyph), dark)
            .font(type_::BODY)
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

/// A dashed 2 px rule: dashes stacked past any message's height, out of flow, so the row's clip cuts
/// them where the message ends (the border dash a ring draws overlaps itself on a box this thin).
fn dashes(text: &str, ink: Color) -> El {
    const DASH: f32 = space::s3;
    // A guess at how many wrapped lines the message runs to, with room to spare; the clip does the rest.
    const CHARS_A_LINE: usize = 30;
    const MOST: usize = 400;
    let lines = text.len() / CHARS_A_LINE + text.matches('\n').count() + 4;
    let count = ((lines as f32 * space::card_line / (2.0 * DASH)).ceil() as usize).min(MOST);
    (0..count).fold(
        col()
            .w(RULE)
            .pin(Some(space::s0), Some(space::s0), None, None),
        |stack, _| {
            stack
                .child(el().size(RULE, DASH).fill(ink))
                .child(el().size(RULE, DASH))
        },
    )
}

pub fn draw(v: &serde_json::Value, _: &Local, cx: &mut Cx<State>) -> El {
    // No thread on this screen, or one the view cannot be read as: nothing, never a dead window.
    let Ok(th) = Thread::deserialize(v) else {
        return el();
    };
    let dark = cx.system_dark();
    let (t, k) = (tok::theme(dark), theme::tokens(dark));
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
    let line = |words: &str| theme::content(text(words).font(type_::CAPTION).color(k.quiet), dark);
    // The kind line is as big as the tabs and title above it (the user, 2026-11-21).
    let said =
        |words: &str, ink: Color| theme::content(text(words).font(type_::BODY).color(ink), dark);

    // The accent bar is a text line tall at most, and the time is the short form with the whole stamp on hover.
    let at = said(&hhmm(Some(&th.kind_line.at)), k.quiet).help(th.kind_line.at.as_str());
    let (owner, owner_ink) = k.by.of(&th.kind_line.owner);
    // The page's kind line: its parts a middle dot apart (the walkthrough of 2026-11-21), the owner
    // in its crew colour as the HTML deck's byline is.
    let parts = [
        Some(said(&th.kind_line.state, tone).wrap()),
        Some(said(&th.kind_line.kind, k.quiet)),
        Some(at),
        th.kind_line.standing.as_deref().map(|s| said(s, k.quiet)),
        Some(said(owner, owner_ink)),
    ];
    // A kind line too long for its column wraps onto a second line; the row grows and the nav and
    // X/N stay centred on it.
    let kind = parts.into_iter().flatten().enumerate().fold(
        row()
            .key("kind")
            .items_center()
            .flex_wrap()
            .grow(1.0)
            .min_w(space::s0)
            .gap(space::within)
            .child(el().size(space::s2, space::s3).fill(accent)),
        |kind, (i, part)| {
            let kind = if i == 0 {
                kind
            } else {
                kind.child(text("·").font(type_::BODY).color(k.quiet))
            };
            kind.child(part)
        },
    );

    // The page's header grid (deck.css `body[data-item] header`): `‹ code ›` on the centre, between
    // two equal sides, the kind line on the left and X/N read from the right.
    let mut nav = row()
        .key("nav")
        .items_center()
        .role("navigation")
        .gap(space::within)
        .child(arrow(th.nav.prev, "‹", t.text, k.quiet, dark));
    if let Some(code) = &th.nav.code {
        nav = nav.child(text(code).font(type_::BODY.mono()).color(t.text));
    }
    nav = nav.child(arrow(th.nav.next, "›", t.text, k.quiet, dark));
    let mut right = row()
        .key("position")
        .grow(1.0)
        .min_w(space::s0)
        .justify_end();
    if let Some(position) = &th.nav.position {
        right = right.child(said(position, k.quiet));
    }

    let mut page = col()
        .key("thread")
        .focusable(true)
        .on_key(back(th.nav.run))
        .gap(space::between)
        .child(
            row()
                .w_full()
                .items_center()
                .gap(space::between)
                .child(kind)
                .child(nav)
                .child(right),
        )
        .child(theme::separator(dark))
        .child(theme::content(
            text(&th.title).font(type_::HEADER).color(t.text),
            dark,
        ));
    if let Some(note) = &th.type_note {
        page = page.child(line(note));
    }
    page = page.child(theme::markdown(th.body, dark).key("body"));
    for (i, message) in th.messages.into_iter().enumerate() {
        // deck.css's `.who`: the crew kind that wrote it in that kind's colour, `you` and the deck's
        // own line quiet; the time beside it in the same ink, the whole stamp on hover.
        let (name, ink) = match message.by.as_str() {
            "you" | "deck" => (message.by.as_str(), k.quiet),
            author => k.by.of(author),
        };
        let by = match &message.at {
            Some(at) => format!("{name} · {}", hhmm(Some(at))),
            None => name.to_string(),
        };
        let mut who = theme::content(text(&by).font(type_::CAPTION).color(ink), dark);
        if let Some(at) = &message.at {
            who = who.help(at.as_str());
        }
        // deck.css's `.reply`: a 2 px rule down the left, solid for the user, dashed for an agent.
        let mine = message.by == "you";
        let mut rule = el()
            .key(format!(
                "message-{i}-rule-{}",
                if mine { "solid" } else { "dashed" }
            ))
            .w(RULE)
            .h_full();
        rule = if mine {
            rule.fill(k.rule)
        } else {
            rule.clip_soft(space::s0)
                .child(dashes(&message.text, k.rule))
        };
        page = page.child(
            row()
                .key(format!("message-{i}"))
                .w_full()
                .gap(space::pad)
                .child(rule)
                .child(
                    col()
                        .grow(1.0)
                        .gap(space::within)
                        .padding(space::pad)
                        .child(who)
                        .child(theme::markdown(message.text, dark)),
                ),
        );
    }
    if let Some(resolution) = th.resolution {
        page = page.child(
            col()
                .key("resolution")
                .gap(space::within)
                .child(line("closed"))
                .child(theme::markdown(resolution, dark)),
        );
    }
    page
}
