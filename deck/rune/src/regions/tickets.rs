//! The Tickets panel as `deck/view/tickets.mjs` resolved it (spec 2, 3): Add, then the red, yellow and green
//! queues, each a fold served shut whose open set is the window's prefs per deck (A4). A row's arrows move it
//! one place, gated on the move in flight until a newer view lands (6c: two quick presses moved it twice);
//! its play asks Confirm before it posts `Switch`, and a pending switch's Cancel posts `CancelSwitch`.

use rune::tok::{self, type_};
use rune::{Cx, El, col, row, text};
use serde::Deserialize;

use super::notifications::{keep, open_thread};
use crate::act::{self, Pending};
use crate::act_deck::DeckAction;
use crate::app::State;
use crate::prefs::Prefs;
use crate::theme::{self, space};

/// The panel's window state: the ticket whose move is in flight and its place in its queue when pressed,
/// and the row whose play is asking Confirm.
#[derive(Debug, Default)]
pub struct Local {
    pub moving: Option<String>,
    pub moved_at: u64,
    pub confirming: Option<String>,
}

/// What the page names a ticket-making thread (`TICKET_MAKING_TITLE`).
const ADD: &str = "Add";

#[derive(Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct CanMove {
    up: bool,
    down: bool,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct Row {
    id: String,
    name: String,
    state: String,
    can_move: CanMove,
    switch: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Group {
    colour: String,
    label: String,
    rows: Vec<Row>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Tickets {
    repo: Option<String>,
    groups: Vec<Group>,
}

/// Sends a write under `key`, shown sent until the deck answers; the live reader brings the view
/// that follows, and `answered` says what the deck made of it.
fn send(s: &mut State, key: &str, action: DeckAction) {
    act::send(&mut s.pending, key, action);
}

/// The deck's answer to a write sent from here (`key` names the control): a refusal or a failure is
/// said, and a move that was not taken lifts its gate at once.
pub fn answered(local: &mut Local, key: &str, refused: Option<String>) {
    if !key.starts_with("ticket") {
        return;
    }
    if let Some(reason) = refused {
        eprintln!("pilot-deck: {reason}");
        if key.ends_with("-move") {
            local.moving = None;
        }
    }
}

/// `button` pressing `then` unless its write is out, when it is drawn disabled.
fn pressing(button: El, sent: bool, then: impl Fn(&mut State) + 'static) -> El {
    if sent {
        button.disabled(true)
    } else {
        button.on_press(then)
    }
}

/// A ticket's place in its queue in the view the window holds now.
fn place_of(s: &State, id: &str) -> Option<u64> {
    let view = Tickets::deserialize(s.view.regions.get("tickets")?).ok()?;
    view.groups
        .iter()
        .find_map(|g| g.rows.iter().position(|r| r.id == id))
        .map(|at| at as u64)
}

/// An arrow: posts nothing while a move is in flight, that is until the view shows the ticket moved off
/// the place it was pressed at. The deck's `seq` counts replies, not moves, so it cannot say so. A move
/// the deck did not take lifts the gate at once.
fn move_ticket(s: &mut State, id: &str, up: bool) {
    let local = &s.regions.tickets;
    if let Some(moving) = &local.moving
        && place_of(s, moving) == Some(local.moved_at)
    {
        return;
    }
    let Some(at) = place_of(s, id) else { return };
    s.regions.tickets.moving = Some(id.to_string());
    s.regions.tickets.moved_at = at;
    let action = DeckAction::Move {
        id: id.to_string(),
        up,
    };
    send(s, &format!("ticket-{id}-move"), action);
}

/// Opens or shuts one queue's fold on this deck, and keeps it.
fn toggle(s: &mut State, repo: &str, colour: &str) {
    let open = s.prefs.folds.entry(repo.to_string()).or_default();
    if !open.remove(colour) {
        open.insert(colour.to_string());
    }
    keep(&s.prefs);
}

/// A glyph button that cannot be pressed, so it carries no hover.
fn inert(key: String, label: &str, t: &tok::Theme) -> El {
    text(label)
        .key(key)
        .font(type_::LABEL)
        .color(t.text)
        .role("button")
}

fn button(key: String, label: &str, t: &tok::Theme, dark: bool) -> El {
    theme::control(inert(key, label, t), dark)
}

/// The row's Continue as its `switch` names it: play then Confirm, the lit pending with Cancel, or locked.
fn continue_of(
    r: &Row,
    repo: &str,
    local: &Local,
    pending: &Pending,
    t: &tok::Theme,
    dark: bool,
) -> Option<El> {
    let key = |part: &str| format!("ticket-{}-{part}", r.id);
    let (repo, to) = (repo.to_string(), r.id.clone());
    let (cancel, confirm) = (key("cancel"), key("confirm"));
    match r.switch.as_deref()? {
        "pending" => Some(
            row()
                .gap(space::within)
                .child(
                    text("switching…")
                        .font(type_::LABEL)
                        .color(t.text_secondary),
                )
                .child(pressing(
                    button(cancel.clone(), "Cancel", t, dark),
                    pending.is_sent(&cancel),
                    move |s: &mut State| {
                        let (repo, to) = (repo.clone(), to.clone());
                        send(s, &cancel, DeckAction::CancelSwitch { repo, to });
                    },
                )),
        ),
        "locked" => Some(
            inert(key("play"), "▶", t)
                .color(t.text_secondary)
                .disabled(true),
        ),
        _ if local.confirming.as_deref() == Some(r.id.as_str()) => Some(
            row()
                .key(key("sure"))
                .gap(space::within)
                .child(
                    text(format!("Switch to {}?", r.name))
                        .font(type_::LABEL)
                        .color(t.text),
                )
                .child(pressing(
                    button(confirm.clone(), "Confirm", t, dark),
                    pending.is_sent(&confirm),
                    move |s: &mut State| {
                        s.regions.tickets.confirming = None;
                        let (repo, to) = (repo.clone(), to.clone());
                        send(s, &confirm, DeckAction::Switch { repo, to });
                    },
                ))
                .modal(true, |s: &mut State| s.regions.tickets.confirming = None),
        ),
        _ => Some(
            button(key("play"), "▶", t, dark).on_press(move |s: &mut State| {
                s.regions.tickets.confirming = Some(to.clone());
            }),
        ),
    }
}

fn ticket_row(
    r: &Row,
    repo: &str,
    local: &Local,
    pending: &Pending,
    t: &tok::Theme,
    dark: bool,
) -> El {
    let to = r.id.clone();
    let mut line = theme::list_row(row())
        .key(format!("ticket-{}", r.id))
        .gap(space::within)
        .child(
            theme::control(text(&r.name), dark)
                .font(type_::BODY)
                .color(t.text)
                .role("link")
                .truncate()
                .grow(1.0)
                .on_press(move |s: &mut State| open_thread(s, &to)),
        )
        .child(theme::content(
            text(&r.state).font(type_::LABEL).color(t.text_secondary),
            dark,
        ));
    if let Some(play) = continue_of(r, repo, local, pending, t, dark) {
        line = line.child(play);
    }
    for (up, can, glyph) in [(true, r.can_move.up, "↑"), (false, r.can_move.down, "↓")] {
        if can {
            let id = r.id.clone();
            let part = if up { "up" } else { "down" };
            let sent = pending.is_sent(&format!("ticket-{id}-move"));
            line = line.child(pressing(
                button(format!("ticket-{}-{part}", r.id), glyph, t, dark),
                sent,
                move |s: &mut State| move_ticket(s, &id, up),
            ));
        }
    }
    line
}

pub fn draw(
    v: &serde_json::Value,
    local: &Local,
    prefs: &Prefs,
    pending: &Pending,
    cx: &mut Cx<State>,
) -> El {
    // A region the view cannot be read as draws empty rather than taking the window down.
    let view = Tickets::deserialize(v).unwrap_or_default();
    let dark = cx.system_dark();
    let t = tok::theme(dark);
    const NONE: &str = "No tickets yet.";
    let Some(repo) = view.repo else {
        return col()
            .key("tickets")
            .child(theme::empty(NONE, "tickets-none", dark));
    };
    let add = repo.clone();
    let mut panel = col().key("tickets").gap(space::between).child(pressing(
        button("tickets-add".into(), ADD, &t, dark),
        pending.is_sent("tickets-add"),
        move |s: &mut State| {
            let (name, repo) = (ADD.to_string(), add.clone());
            send(s, "tickets-add", DeckAction::Create { name, repo });
        },
    ));
    let open = prefs.folds.get(&repo);
    for g in &view.groups {
        let (fold_repo, colour) = (repo.clone(), g.colour.clone());
        let header = theme::control(row(), dark)
            .key(format!("tickets-fold-{}", g.colour))
            .gap(space::within)
            .role("button")
            .on_press(move |s: &mut State| toggle(s, &fold_repo, &colour))
            .child(text(&g.label).font(type_::BODY).color(t.text))
            .child(
                text(g.rows.len().to_string())
                    .font(type_::LABEL)
                    .color(t.text_secondary),
            );
        let mut fold = col().gap(space::within).child(header);
        if open.is_some_and(|set| set.contains(&g.colour)) {
            // deck.css `.tickets-list li`: a hairline between items, none after the last.
            let last = g.rows.len().saturating_sub(1);
            for (i, r) in g.rows.iter().enumerate() {
                fold = fold.child(ticket_row(r, &repo, local, pending, &t, dark));
                if i != last {
                    fold = fold.child(theme::separator(dark).key(format!("ticket-{}-rule", r.id)));
                }
            }
        }
        panel = panel.child(fold);
    }
    if view.groups.is_empty() {
        panel = panel.child(theme::empty(NONE, "tickets-none", dark));
    }
    panel
}
