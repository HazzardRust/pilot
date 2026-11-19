//! The queue's cards and state lines as `deck/view/queue.mjs` resolved them: every word drawn is the view's,
//! never a kind matched here (L2, spec 11).

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex, PoisonError};

use rune::tok::{self, type_};
use rune::{Color, Cx, El, SpringPair, Transition, Waker, col, row, text};
use serde::Deserialize;

use crate::act::{Acted, Action};
use crate::app::State;
use crate::client::Client;
use crate::theme::{self, Tokens, motion, space};

/// A monospace glyph's advance as a share of the font size: how wide one `ch` of a status column is.
const MONO_ADVANCE: f32 = 0.6;

/// The queue's window state; `confirming` is (card id, label), `deck` the window's own address when unset.
#[derive(Debug, Default)]
pub struct Local {
    pub sent: BTreeMap<String, String>,
    pub refused: BTreeMap<String, String>,
    pub confirming: Option<(String, String)>,
    pub deck: Option<Arc<Client>>,
    pub inbox: Inbox,
}

/// Refusals (card id, reason) the posting threads leave, and the waker `app::setup` sets.
#[derive(Default)]
pub struct Inbox {
    pub refusals: Arc<Mutex<Vec<(String, String)>>>,
    pub wake: Option<Waker>,
}

impl std::fmt::Debug for Inbox {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Inbox")
            .field("refusals", &self.refusals)
            .finish_non_exhaustive()
    }
}

/// Takes the posting threads' refusals into `refused` for `app::poll`; true when there were any.
pub fn settle(s: &mut State) -> bool {
    let q = &mut s.regions.queue;
    let mut left = q
        .inbox
        .refusals
        .lock()
        .unwrap_or_else(PoisonError::into_inner);
    let changed = !left.is_empty();
    for (id, reason) in left.drain(..) {
        q.sent.remove(&id);
        q.refused.insert(id, reason);
    }
    changed
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
fn hhmm(iso: Option<&str>) -> String {
    iso.and_then(|s| s.get(11..16))
        .unwrap_or_default()
        .to_string()
}

/// A card sends once, shown sent at once; the post runs on its own thread and a refusal returns via `settle`.
fn press(s: &mut State, id: &str, label: &str) {
    let q = &mut s.regions.queue;
    q.confirming = None;
    if q.sent.contains_key(id) {
        return;
    }
    q.refused.remove(id);
    q.sent.insert(id.into(), label.into());
    if q.deck.is_none() {
        q.deck = Client::from_env().ok().map(Arc::new);
    }
    let reply = Action::Reply {
        id: id.into(),
        text: String::new(),
        choice: Some(label.into()),
    };
    let (deck, refusals, wake, card) = (
        q.deck.clone(),
        q.inbox.refusals.clone(),
        q.inbox.wake.clone(),
        id.to_string(),
    );
    let post = move || {
        let refused = match deck.map(|deck| deck.act(&reply)) {
            Some(Ok(Acted::Taken { .. })) => return,
            Some(Ok(Acted::Refused { reason })) => reason,
            Some(Err(err)) => err.to_string(),
            None => "no deck to send to".into(),
        };
        refusals
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push((card, refused));
        if let Some(wake) = wake {
            wake();
        }
    };
    if let Err(err) = std::thread::Builder::new()
        .name("pilot-deck-reply".into())
        .spawn(post)
    {
        q.sent.remove(id);
        q.refused.insert(id.into(), err.to_string());
    }
}

/// One card, reused by the history region (S18).
pub fn card(c: &Card, cx: &mut Cx<State>) -> El {
    let dark = cx.system_dark();
    let (t, ui) = (theme::tokens(dark), tok::theme(dark));
    let key = |part: &str| format!("card-{}-{part}", c.id);
    let mut line = row().gap(space::within).child(
        text(&c.state)
            .key(key("state"))
            .font(type_::LABEL)
            .color(tone(&t, &c.tone)),
    );
    if let Some(tab) = &c.tab {
        line = line.child(text(&tab.code).font(type_::LABEL).color(t.quiet));
    }
    line = line
        .child(text(&c.kind).font(type_::LABEL).color(t.quiet))
        .child(
            text(hhmm(c.at.as_deref()))
                .font(type_::LABEL)
                .color(t.quiet),
        );
    let mut body = col().grow(1.0).gap(space::within).child(line).child(
        text(&c.title)
            .key(key("title"))
            .font(type_::TITLE)
            .color(ui.text),
    );
    if !c.excerpt.is_empty() {
        body = body.child(
            text(&c.excerpt)
                .key(key("excerpt"))
                .font(type_::BODY)
                .color(ui.text_secondary)
                .wrap()
                .max_lines(6),
        );
    }
    let button = |part: String, label: &str, fill: Color| {
        row()
            .key(key(&part))
            .padding(space::pad)
            .radius(tok::radius::SM)
            .border(1.0, t.rule)
            .fill(fill)
            .child(text(label).font(type_::LABEL).color(ui.text))
    };
    let spent = c.sent.is_some();
    let asking = c
        .options
        .iter()
        .find(|opt| !spent && opt.confirm && c.confirming.as_deref() == Some(opt.label.as_str()));
    if let Some(opt) = asking {
        // The page's confirm in place (`confirm.mjs`): a press elsewhere, or Escape, backs out.
        let (id, label) = (c.id.clone(), opt.label.clone());
        let yes = button("yes".into(), &opt.yes, ui.card)
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
                        .font(type_::LABEL)
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
                    let fill = if sent { t.state.pilot } else { ui.card };
                    let mut button = button(format!("opt-{i}"), &opt.label, fill).disabled(spent);
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
        body = body.child(
            text(reason)
                .key(key("refused"))
                .font(type_::BODY)
                .color(t.state.unacknowledged)
                .wrap(),
        );
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
        .radius(tok::radius::SM)
        .fill(ui.card)
        .transition(arrive)
        .child(col().w(space::s1).h_full().fill(accent(&t, &c.accent)))
        .child(body)
}

/// One status line in three columns (L10): the state fixed and left, the name flexible and clipped, the
/// time fixed and right, `cols.gap` apart.
fn state_line(i: usize, l: &Line, t: &Tokens, ink: Color) -> El {
    let ch = t.font.size * MONO_ADVANCE;
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
        .child(
            text(&l.state)
                .key(key("state"))
                .font(type_::LABEL)
                .color(ink)
                .truncate()
                .w(space::cols.state_ch * ch),
        )
        .child(
            text(name)
                .key(key("name"))
                .font(type_::LABEL)
                .color(ink)
                .truncate()
                .grow(1.0),
        )
        .child(
            text(hhmm(l.since.as_deref()))
                .key(key("time"))
                .font(type_::LABEL)
                .color(t.quiet)
                .w(space::cols.time_ch * ch),
        )
}

pub fn draw(v: &serde_json::Value, local: &Local, cx: &mut Cx<State>) -> El {
    // A region the view cannot be read as draws empty rather than taking the window down.
    let queue = Queue::deserialize(v).unwrap_or_default();
    let dark = cx.system_dark();
    let (t, ui) = (theme::tokens(dark), tok::theme(dark));
    let mut region = col().key("queue").w_full().gap(space::between);
    if let Some(ended) = &queue.ended {
        region = region.child(text(ended).font(type_::BODY).color(t.quiet).wrap());
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
        cards = cards.child(card(&c, cx));
    }
    let lines = queue
        .state_lines
        .iter()
        .enumerate()
        .fold(col().w_full(), |lines, (i, l)| {
            lines.child(state_line(i, l, &t, ui.text_secondary))
        });
    region.child(cards).child(lines)
}
