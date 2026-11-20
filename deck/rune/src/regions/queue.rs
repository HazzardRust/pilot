//! The queue's cards and state lines as `deck/view/queue.mjs` resolved them: every word drawn is the view's,
//! never a kind matched here (L2, spec 11).

use std::collections::BTreeMap;

use crate::theme::type_;
use rune::tok;
use rune::{Color, Cx, El, SpringPair, Transition, col, row, text};
use serde::Deserialize;

use crate::act::{self, Action};
use crate::app::State;
use crate::regions::notifications::open_thread;
use crate::theme::{self, Tokens, motion, space};

/// A monospace glyph's advance as a share of the font size: how wide one `ch` of a status column is.
const MONO_ADVANCE: f32 = 0.6;

/// The `act::send` key a card's reply goes under, before the card's id.
const SENT: &str = "reply-card-";

/// The queue's window state; `confirming` is (card id, label).
#[derive(Debug, Default)]
pub struct Local {
    pub sent: BTreeMap<String, String>,
    pub refused: BTreeMap<String, String>,
    pub confirming: Option<(String, String)>,
}

/// A card's answered reply: a refusal puts its words on the card and its options back.
pub fn answered(q: &mut Local, key: &str, refused: Option<String>) {
    if let (Some(id), Some(reason)) = (key.strip_prefix(SENT), refused) {
        q.sent.remove(id);
        q.refused.insert(id.into(), reason);
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct TabRef {
    pub code: String,
    pub href: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct Opt {
    pub label: String,
    pub confirm: bool,
    pub ask: String,
    pub yes: String,
}

/// One card as the view sends it; `sent`, `refused` and `confirming` are this window's, set from `Local`.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct Card {
    pub id: String,
    pub title: String,
    pub accent: String,
    pub state: String,
    pub tone: String,
    pub kind: String,
    pub at: Option<String>,
    pub excerpt: String,
    pub tab: Option<TabRef>,
    pub options: Vec<Opt>,
    #[serde(skip)]
    pub sent: Option<String>,
    #[serde(skip)]
    pub refused: Option<String>,
    #[serde(skip)]
    pub confirming: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
struct Line {
    state: String,
    name: Option<String>,
    ticket: Option<String>,
    since: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct Queue {
    ended: Option<String>,
    cards: Vec<Card>,
    state_lines: Vec<Line>,
}

fn accent(t: &Tokens, name: &str) -> Color {
    match name {
        "green" => t.accent.green,
        "yellow" => t.accent.yellow,
        "red" => t.accent.red,
        "blue" => t.accent.blue,
        _ => t.accent.plain,
    }
}

fn tone(t: &Tokens, name: &str) -> Color {
    match name {
        "pilot" => t.state.pilot,
        "resolved" => t.state.resolved,
        "unacknowledged" => t.state.unacknowledged,
        _ => t.state.waiting,
    }
}

/// The `HH:MM` (UTC) of an ISO stamp the deck writes (`2026-11-19T22:48:02.883Z`), empty when there is none.
pub fn hhmm(iso: Option<&str>) -> String {
    iso.and_then(|s| s.get(11..16))
        .unwrap_or_default()
        .to_string()
}

/// A card sends once, shown sent at once; its answer comes back through `answered`.
fn press(s: &mut State, id: &str, label: &str) {
    let q = &mut s.regions.queue;
    q.confirming = None;
    if q.sent.contains_key(id) {
        return;
    }
    q.refused.remove(id);
    q.sent.insert(id.into(), label.into());
    let reply = Action::Reply {
        id: id.into(),
        text: String::new(),
        choice: Some(label.into()),
    };
    act::send(&mut s.pending, &format!("{SENT}{id}"), reply);
}

/// One card, reused by the history region (S18).
pub fn card(c: &Card, cx: &mut Cx<State>) -> El {
    let dark = cx.system_dark();
    let (t, ui) = (theme::tokens(dark), tok::theme(dark));
    let key = |part: &str| format!("card-{}-{part}", c.id);
    // The kind line is part of the way into the thread below, a label, so it is not selectable.
    let said = |words: String, ink: Color| text(words).font(type_::CAPTION).color(ink);
    let mut line = row()
        .gap(space::within)
        .child(said(c.state.clone(), tone(&t, &c.tone)).key(key("state")));
    if let Some(tab) = &c.tab {
        line = line.child(said(tab.code.clone(), t.quiet));
    }
    let mut when = said(hhmm(c.at.as_deref()), t.quiet);
    if let Some(at) = &c.at {
        when = when.help(at.as_str());
    }
    line = line.child(said(c.kind.clone(), t.quiet)).child(when);
    // The way into the thread: the title and the kind line above it, one target under one hover
    // (the walkthrough of 2026-11-21; the page's link is the title alone).
    let to = c.id.clone();
    let open = theme::control(col(), dark)
        .key(key("title"))
        .label(c.title.as_str())
        .role("link")
        .gap(space::within)
        .child(line)
        .child(text(&c.title).font(type_::HEADER).color(ui.text))
        .on_press(move |s: &mut State| open_thread(s, &to));
    let mut body = col().grow(1.0).gap(space::within).child(open);
    if !c.excerpt.is_empty() {
        // The view has cut the preview; it is drawn as the page renders it, markdown (L8).
        body = body.child(theme::markdown(c.excerpt.as_str(), dark).key(key("excerpt")));
    }
    let button = |part: String, label: &str, sent: bool| {
        let (fill, ink) = if sent {
            (t.state.pilot, theme::pressed_ink(dark))
        } else {
            (ui.card, ui.text)
        };
        theme::control(row(), dark)
            .key(key(&part))
            .padding(space::pad)
            .border(1.0, t.rule)
            .fill(fill)
            .child(text(label).font(type_::CAPTION).color(ink))
    };
    let spent = c.sent.is_some();
    let asking = c
        .options
        .iter()
        .find(|opt| !spent && opt.confirm && c.confirming.as_deref() == Some(opt.label.as_str()));
    if let Some(opt) = asking {
        // The page's confirm in place (`confirm.mjs`): a press elsewhere, or Escape, backs out.
        let (id, label) = (c.id.clone(), opt.label.clone());
        let yes = button("yes".into(), &opt.yes, false)
            .autofocus()
            .on_press_tx(move |s: &mut State, tx: &mut rune::Tx| {
                tx.instant();
                press(s, &id, &label);
            });
        body = body.child(
            row()
                .key(key("confirm"))
                .gap(space::within)
                .child(
                    text(&opt.ask)
                        .key(key("sure"))
                        .font(type_::CAPTION)
                        .color(ui.text),
                )
                .child(yes)
                .modal_tx(true, |s: &mut State, tx: &mut rune::Tx| {
                    tx.instant();
                    s.regions.queue.confirming = None;
                }),
        );
    } else if !c.options.is_empty() {
        let options =
            c.options
                .iter()
                .enumerate()
                .fold(row().gap(space::within), |options, (i, opt)| {
                    let sent = c.sent.as_deref() == Some(opt.label.as_str());
                    let mut button = button(format!("opt-{i}"), &opt.label, sent).disabled(spent);
                    if !spent {
                        let (id, label, confirm) = (c.id.clone(), opt.label.clone(), opt.confirm);
                        // Instant: the press is shown in the frame it lands in, not eased toward (spec 5).
                        button = button.on_press_tx(move |s: &mut State, tx: &mut rune::Tx| {
                            tx.instant();
                            if confirm {
                                s.regions.queue.confirming = Some((id.clone(), label.clone()));
                            } else {
                                press(s, &id, &label);
                            }
                        });
                    }
                    options.child(button)
                });
        body = body.child(options);
    }
    if let Some(reason) = &c.refused {
        body = body.child(theme::content(
            text(reason)
                .key(key("refused"))
                .font(type_::BODY)
                .color(t.state.unacknowledged)
                .wrap(),
            dark,
        ));
    }
    let arrive = Transition::offset(0.0, space::s3)
        .combined(Transition::opacity())
        .springs(SpringPair::new(motion::card, motion::card));
    row()
        .key(format!("card-{}", c.id))
        .role("article")
        .w_full()
        .gap(space::pad)
        .padding(space::pad)
        .radius(theme::radius::button)
        .fill(ui.card)
        .transition(arrive)
        .child(col().w(space::s2).h_full().fill(accent(&t, &c.accent)))
        .child(body)
}

/// One status line in three columns (L10): the state fixed and left, the name flexible and clipped, the
/// time fixed and right, `cols.gap` apart.
fn state_line(i: usize, l: &Line, t: &Tokens, ink: Color, dark: bool) -> El {
    let ch = type_::BODY.size * MONO_ADVANCE;
    let key = |part: &str| format!("line-{i}-{part}");
    let name = match (&l.name, &l.ticket) {
        (Some(name), Some(ticket)) => format!("{name}  {ticket}"),
        (Some(name), None) => name.clone(),
        (None, Some(ticket)) => ticket.clone(),
        (None, None) => String::new(),
    };
    row()
        .key(key("row"))
        .w_full()
        .h(space::row)
        .gap(space::cols.gap)
        .child(theme::content(
            text(&l.state)
                .key(key("state"))
                .font(type_::CAPTION)
                .color(ink)
                .truncate()
                .w(space::cols.state_ch * ch),
            dark,
        ))
        .child(theme::content(
            text(name)
                .key(key("name"))
                .font(type_::CAPTION.mono())
                .color(ink)
                .truncate()
                .grow(1.0),
            dark,
        ))
        .child(theme::content(
            text(hhmm(l.since.as_deref()))
                .key(key("time"))
                .font(type_::CAPTION.mono())
                .color(t.quiet)
                .w(space::cols.time_ch * ch),
            dark,
        ))
}

pub fn draw(v: &serde_json::Value, local: &Local, cx: &mut Cx<State>) -> El {
    // A region the view cannot be read as draws empty rather than taking the window down.
    let queue = Queue::deserialize(v).unwrap_or_default();
    let dark = cx.system_dark();
    let (t, ui) = (theme::tokens(dark), tok::theme(dark));
    let mut region = col().key("queue").w_full().gap(space::between);
    if let Some(ended) = &queue.ended {
        region = region.child(theme::content(
            text(ended).font(type_::BODY).color(t.quiet).wrap(),
            dark,
        ));
    }
    let mut cards = col().w_full().gap(space::pad);
    for c in &queue.cards {
        let mut c = c.clone();
        c.sent = local.sent.get(&c.id).cloned();
        c.refused = local.refused.get(&c.id).cloned();
        c.confirming = local
            .confirming
            .as_ref()
            .filter(|(id, _)| *id == c.id)
            .map(|(_, label)| label.clone());
        // deck.css's `article`: a hairline under each.
        cards = cards.child(card(&c, cx)).child(theme::separator(dark));
    }
    let lines = queue
        .state_lines
        .iter()
        .enumerate()
        .fold(col().w_full(), |lines, (i, l)| {
            lines.child(state_line(i, l, &t, ui.text_secondary, dark))
        });
    if queue.cards.is_empty() && queue.ended.is_none() {
        region = region.child(theme::empty(
            "Nothing is waiting on you.",
            "queue-none",
            dark,
        ));
    }
    region.child(cards).child(lines)
}
