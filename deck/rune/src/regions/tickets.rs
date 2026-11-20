//! The Tickets panel as `deck/view/tickets.mjs` resolved it (spec 2, 3): Add, then the red, yellow and green
//! queues, each a fold served shut whose open set is the window's prefs per deck (A4). A row's arrows move it
//! one place, gated on the move in flight until a newer view lands (6c: two quick presses moved it twice);
//! its play asks Confirm before it posts `Switch`, and a pending switch's Cancel posts `CancelSwitch`.

use rune::tok::{self, type_};
use rune::{Cx, El, col, row, text};
use serde::Deserialize;

use super::notifications::{keep, open_thread};
use crate::act::Acted;
use crate::act_deck::DeckAction;
use crate::app::State;
use crate::client::Client;
use crate::prefs::Prefs;
use crate::theme::space;

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

/// Sends a write; a refusal or a down deck says so, and the live reader brings the view that follows.
fn send(s: &mut State, action: &DeckAction) {
    if let Err(err) = Client::from_env().and_then(|client| client.act(action)) {
        eprintln!("pilot-deck: {err}");
        s.down = true;
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
    match Client::from_env().and_then(|client| client.act(&action)) {
        Ok(Acted::Taken { .. }) => {}
        Ok(Acted::Refused { reason }) => {
            eprintln!("pilot-deck: move refused: {reason}");
            s.regions.tickets.moving = None;
        }
        Err(err) => {
            eprintln!("pilot-deck: {err}");
            s.regions.tickets.moving = None;
            s.down = true;
        }
    }
}

/// Opens or shuts one queue's fold on this deck, and keeps it.
fn toggle(s: &mut State, repo: &str, colour: &str) {
    let open = s.prefs.folds.entry(repo.to_string()).or_default();
    if !open.remove(colour) {
        open.insert(colour.to_string());
    }
    keep(&s.prefs);
}

fn button(key: String, label: &str, t: &tok::Theme) -> El {
    text(label)
        .key(key)
        .font(type_::LABEL)
        .color(t.text)
        .role("button")
}

/// The row's Continue as its `switch` names it: play then Confirm, the lit pending with Cancel, or locked.
fn continue_of(r: &Row, repo: &str, local: &Local, t: &tok::Theme) -> Option<El> {
    let key = |part: &str| format!("ticket-{}-{part}", r.id);
    let (repo, to) = (repo.to_string(), r.id.clone());
    match r.switch.as_deref()? {
        "pending" => Some(
            row()
                .gap(space::within)
                .child(
                    text("switching…")
                        .font(type_::LABEL)
                        .color(t.text_secondary),
                )
                .child(
                    button(key("cancel"), "Cancel", t).on_press(move |s: &mut State| {
                        send(
                            s,
                            &DeckAction::CancelSwitch {
                                repo: repo.clone(),
                                to: to.clone(),
                            },
                        );
                    }),
                ),
        ),
        "locked" => Some(
            button(key("play"), "▶", t)
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
                .child(
                    button(key("confirm"), "Confirm", t).on_press(move |s: &mut State| {
                        s.regions.tickets.confirming = None;
                        send(
                            s,
                            &DeckAction::Switch {
                                repo: repo.clone(),
                                to: to.clone(),
                            },
                        );
                    }),
                )
                .modal(true, |s: &mut State| s.regions.tickets.confirming = None),
        ),
        _ => Some(button(key("play"), "▶", t).on_press(move |s: &mut State| {
            s.regions.tickets.confirming = Some(to.clone());
        })),
    }
}

fn ticket_row(r: &Row, repo: &str, local: &Local, t: &tok::Theme) -> El {
    let to = r.id.clone();
    let mut line = row()
        .key(format!("ticket-{}", r.id))
        .h(space::row)
        .gap(space::within)
        .child(
            text(&r.name)
                .font(type_::BODY)
                .color(t.text)
                .role("link")
                .truncate()
                .grow(1.0)
                .on_press(move |s: &mut State| open_thread(s, &to)),
        )
        .child(text(&r.state).font(type_::LABEL).color(t.text_secondary));
    if let Some(play) = continue_of(r, repo, local, t) {
        line = line.child(play);
    }
    for (up, can, glyph) in [(true, r.can_move.up, "↑"), (false, r.can_move.down, "↓")] {
        if can {
            let id = r.id.clone();
            let part = if up { "up" } else { "down" };
            line = line.child(
                button(format!("ticket-{}-{part}", r.id), glyph, t)
                    .on_press(move |s: &mut State| move_ticket(s, &id, up)),
            );
        }
    }
    line
}

pub fn draw(v: &serde_json::Value, local: &Local, prefs: &Prefs, cx: &mut Cx<State>) -> El {
    // A region the view cannot be read as draws empty rather than taking the window down.
    let view = Tickets::deserialize(v).unwrap_or_default();
    let t = tok::theme(cx.system_dark());
    let Some(repo) = view.repo else {
        return col().key("tickets");
    };
    let add = repo.clone();
    let mut panel = col().key("tickets").gap(space::between).child(
        button("tickets-add".into(), ADD, &t).on_press(move |s: &mut State| {
            send(
                s,
                &DeckAction::Create {
                    name: ADD.into(),
                    repo: add.clone(),
                },
            );
        }),
    );
    let open = prefs.folds.get(&repo);
    for g in &view.groups {
        let (fold_repo, colour) = (repo.clone(), g.colour.clone());
        let header = row()
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
            fold = g
                .rows
                .iter()
                .fold(fold, |fold, r| fold.child(ticket_row(r, &repo, local, &t)));
        }
        panel = panel.child(fold);
    }
    panel
}
