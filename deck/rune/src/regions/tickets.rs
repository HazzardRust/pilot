//! The Tickets panel as `deck/view/tickets.mjs` resolved it (spec 2, 3): Add, then the red, yellow and green
//! queues, each a fold served shut whose open set is the window's prefs per deck (A4). A row's arrows move it
//! one place, gated on the move in flight until a newer view lands (6c: two quick presses moved it twice);
//! its play asks Confirm before it posts `Switch`, and a pending switch's Cancel posts `CancelSwitch`.

use std::collections::HashSet;
use std::rc::Rc;

use crate::theme::type_;
use rune::tok;
use rune::{Cursor, Cx, Drag, El, Phase, Tx, col, row, text};
use serde::Deserialize;

use super::notifications::{keep, open_thread};
use crate::act::{self, Pending};
use crate::act_deck::DeckAction;
use crate::app::State;
use crate::prefs::Prefs;
use crate::theme::{self, space};

/// The panel's window state: the ticket whose move is in flight and its place in its queue when pressed,
/// and the row whose play is asking Confirm.
///
/// A row dragged by its grip follows the pointer by `dragging`'s (id, offset); on the drop it owes
/// `owed`'s (id, up, moves left) one-place moves, each sent once the deck has answered the one before.
#[derive(Debug, Default)]
pub struct Local {
    pub moving: Option<String>,
    pub moved_at: u64,
    pub confirming: Option<String>,
    pub dragging: Option<(String, f32)>,
    pub owed: Option<(String, bool, u32)>,
    /// The `threads` and `spec` folds open under a row, as `<id>-threads` / `<id>-spec`.
    pub shown: HashSet<String>,
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
#[serde(default)]
struct Questions {
    count: u32,
    blocking: u32,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Artefact {
    name: String,
    gate1: String,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Thread {
    id: String,
    kind: String,
    title: String,
}

/// A row as the page's `renderTicketRow` draws it: its title, state and arrows, and the further lines.
#[derive(Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct Row {
    id: String,
    name: String,
    state: String,
    can_move: CanMove,
    switch: Option<String>,
    /// `main` or `co-pilot`: the lane that takes it next.
    next: Option<String>,
    live: bool,
    recut: Option<String>,
    questions: Questions,
    slices: Option<u32>,
    artefact: Option<Artefact>,
    short_path: bool,
    threads: Vec<Thread>,
    spec: String,
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
            local.owed = None;
        }
    }
}

/// Sends the next move a drop owes, once the one before has been answered.
pub fn carry(s: &mut State) {
    let Some((id, up, left)) = s.regions.tickets.owed.clone() else {
        return;
    };
    let key = format!("ticket-{id}-move");
    if s.pending.is_sent(&key) {
        return;
    }
    s.regions.tickets.owed = (left > 1).then(|| (id.clone(), up, left - 1));
    send(s, &key, DeckAction::Move { id, up });
}

/// Each row of one queue and its middle's y as last laid out, in queue order: rows differ in height,
/// so a drop is placed by where the rows are, not by a pitch.
type Mids = Rc<Vec<(String, f32)>>;

/// The grip: the row follows the pointer, and the drop owes one move per row whose middle it passed,
/// kept in its queue.
fn drag(s: &mut State, id: &str, mids: &Mids, d: &mut Drag, tx: &mut Tx) {
    let at = mids.iter().position(|(row, _)| row == id);
    match d.phase {
        // A row whose drop would be refused does not follow the pointer either.
        Phase::Down if in_flight(s) || s.regions.tickets.owed.is_some() => {}
        Phase::Down => {
            // The row's middle before it moves: the drop is that plus the pointer's travel.
            d.data = at.map_or(0.0, |at| mids[at].1);
            s.regions.tickets.dragging = Some((id.to_string(), 0.0));
        }
        Phase::Move if s.regions.tickets.dragging.is_none() => {}
        Phase::Move => {
            tx.instant();
            s.regions.tickets.dragging = Some((id.to_string(), d.dy));
        }
        Phase::Up => {
            tx.instant();
            s.regions.tickets.dragging = None;
            if d.cancelled() || in_flight(s) || s.regions.tickets.owed.is_some() {
                return;
            }
            let (Some(at), Some(was)) = (at, place_of(s, id)) else {
                return;
            };
            let y = d.data + d.dy;
            let to = mids
                .iter()
                .enumerate()
                .filter(|(j, (_, mid))| *j != at && *mid < y)
                .count();
            let Ok(left) = u32::try_from(to.abs_diff(at)) else {
                return;
            };
            if left == 0 {
                return;
            }
            // The arrows' gate holds until the view shows the ticket off the place it was dropped from.
            let local = &mut s.regions.tickets;
            (local.moving, local.moved_at) = (Some(id.to_string()), was);
            local.owed = Some((id.to_string(), to < at, left));
            carry(s);
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

/// A ticket's place in its queue and that queue's length, in the view the window holds now.
fn queue_of(s: &State, id: &str) -> Option<(u64, usize)> {
    let view = Tickets::deserialize(s.view.regions.get("tickets")?).ok()?;
    view.groups.iter().find_map(|g| {
        let at = g.rows.iter().position(|r| r.id == id)?;
        Some((at as u64, g.rows.len()))
    })
}

/// A ticket's place in its queue in the view the window holds now.
fn place_of(s: &State, id: &str) -> Option<u64> {
    queue_of(s, id).map(|(at, _)| at)
}

/// A move is in flight until the view shows its ticket off the place it was pressed or dropped at.
fn in_flight(s: &State) -> bool {
    let local = &s.regions.tickets;
    local
        .moving
        .as_deref()
        .is_some_and(|moving| place_of(s, moving) == Some(local.moved_at))
}

/// An arrow: posts nothing while a move is in flight, that is until the view shows the ticket moved off
/// the place it was pressed at. The deck's `seq` counts replies, not moves, so it cannot say so. A move
/// the deck did not take lifts the gate at once.
fn move_ticket(s: &mut State, id: &str, up: bool) {
    if in_flight(s) || s.regions.tickets.owed.is_some() {
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
        .font(type_::CAPTION)
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
                        .font(type_::CAPTION)
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
                        .font(type_::CAPTION)
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

/// At least a row-high square, holding one control, or nothing, centred.
fn slot(control: Option<El>) -> El {
    let square = row()
        .min_w(theme::size::row)
        .h(theme::size::row)
        .justify_center()
        .items_center();
    match control {
        Some(control) => square.child(control),
        None => square,
    }
}

/// One line of a row's text, in `ink`.
fn said(words: impl Into<String>, ink: rune::Color) -> El {
    text(words.into()).font(type_::BODY).color(ink).wrap()
}

/// A fold under a row (`threads`, `spec`), shut until pressed, kept in the window's state only.
fn fold_of(id: &str, part: &str, local: &Local, t: &tok::Theme, dark: bool) -> (El, bool) {
    let key = format!("{id}-{part}");
    let open = local.shown.contains(&key);
    let glyph = if open { "▾" } else { "▸" };
    let summary = theme::control(said(format!("{glyph} {part}"), t.text_secondary), dark)
        .key(format!("ticket-{key}"))
        .role("button")
        .self_start()
        .on_press(move |s: &mut State| {
            let shown = &mut s.regions.tickets.shown;
            if !shown.remove(&key) {
                shown.insert(key.clone());
            }
        });
    (summary, open)
}

/// A link line: `words` opening thread `id`.
fn link(words: impl Into<String>, id: &str, ink: rune::Color, dark: bool) -> El {
    let id = id.to_string();
    theme::control(said(words, ink), dark)
        .role("link")
        .self_start()
        .on_press(move |s: &mut State| open_thread(s, &id))
}

/// The row's text column, as `renderTicketRow` lays it out: `next`, the title, then live, the state,
/// re-cut and the questions on one line, the size, the artefact, short path, and the two folds.
fn lines(r: &Row, local: &Local, t: &tok::Theme, dark: bool) -> El {
    let tk = theme::tokens(dark);
    let mut body = col().grow(1.0).min_w(0.0).gap(space::s2);
    if let Some(lane) = &r.next {
        let ink = if lane == "co-pilot" {
            tk.state.pilot
        } else {
            tk.state.waiting
        };
        body = body.child(said("next", ink).key(format!("ticket-{}-next", r.id)));
    }
    let title = theme::control(text(&r.name), dark)
        .font(type_::HEADER)
        .color(t.text)
        .wrap()
        .role("link")
        .self_start()
        .key(format!("ticket-{}-title", r.id));
    let to = r.id.clone();
    body = body.child(title.on_press(move |s: &mut State| open_thread(s, &to)));
    let mut state = row().gap(space::s2).flex_wrap();
    if r.live {
        state = state.child(said("live", tk.state.waiting));
    }
    state = state.child(theme::content(
        said(&r.state, t.text_secondary).key(format!("ticket-{}-state", r.id)),
        dark,
    ));
    if let Some(why) = &r.recut {
        state = state.child(said("re-cut", t.text_secondary).help(why.as_str()));
    }
    let q = &r.questions;
    if q.count > 0 {
        let plural = if q.count == 1 { "" } else { "s" };
        let blocking = if q.blocking > 0 {
            format!(" ({} blocking)", q.blocking)
        } else {
            String::new()
        };
        state = state.child(said(
            format!("{} question{plural}{blocking}", q.count),
            t.text,
        ));
    }
    body = body.child(state);
    if let Some(n) = r.slices {
        let plural = if n == 1 { "" } else { "s" };
        body = body.child(said(format!("{n} slice{plural}"), t.text_secondary));
    }
    match &r.artefact {
        Some(a) if a.gate1.is_empty() => body = body.child(said(&a.name, t.text)),
        Some(a) => body = body.child(link(&a.name, &a.gate1, t.text, dark)),
        None => {}
    }
    if r.short_path {
        body = body.child(said("short path", t.text_secondary));
    }
    if !r.threads.is_empty() {
        let (summary, open) = fold_of(&r.id, "threads", local, t, dark);
        body = body.child(summary);
        if open {
            for one in &r.threads {
                let words = format!("{} {}", one.kind, one.title);
                let key = format!("ticket-{}-thread-{}", r.id, one.id);
                body = body.child(link(words, &one.id, t.text, dark).key(key));
            }
        }
    }
    let (summary, open) = fold_of(&r.id, "spec", local, t, dark);
    body = body.child(summary);
    if open {
        body = body.child(theme::markdown(r.spec.as_str(), dark));
    }
    body
}

fn ticket_row(
    r: &Row,
    repo: &str,
    mids: &Mids,
    local: &Local,
    pending: &Pending,
    t: &tok::Theme,
    dark: bool,
) -> El {
    let key = format!("ticket-{}", r.id);
    let play = continue_of(r, repo, local, pending, t, dark);
    // A play asking Confirm takes the whole row, as the page blanks the row around its confirm step.
    if local.confirming.as_deref() == Some(r.id.as_str()) {
        let sure = row()
            .key(key)
            .w_full()
            .pl(space::s3)
            .pr(space::s4)
            .justify_center();
        return sure.children(play);
    }
    // The page's controls column: up at the top, play in the middle, down at the bottom.
    let arrow = |up: bool, can: bool, glyph: &str| {
        can.then(|| {
            let id = r.id.clone();
            let part = if up { "up" } else { "down" };
            let sent = pending.is_sent(&format!("ticket-{id}-move"));
            pressing(
                button(format!("ticket-{}-{part}", r.id), glyph, t, dark),
                sent,
                move |s: &mut State| move_ticket(s, &id, up),
            )
        })
    };
    let controls = col()
        .self_stretch()
        .justify_between()
        .child(slot(arrow(true, r.can_move.up, "↑")))
        .child(slot(play))
        .child(slot(arrow(false, r.can_move.down, "↓")));
    // A row the arrows cannot move (alone in its queue, or its lane locked) has no grip either.
    let grip = (r.can_move.up || r.can_move.down).then(|| {
        let (id, mids) = (r.id.clone(), mids.clone());
        text("⠿")
            .key(format!("ticket-{}-grip", r.id))
            .font(type_::BODY)
            .color(t.text_secondary)
            .role("button")
            .label("Drag to move")
            .help("Drag to move")
            .cursor(Cursor::Grab)
            .on_drag(move |s: &mut State, d: &mut Drag, tx: &mut Tx| drag(s, &id, &mids, d, tx))
    });
    let line = row()
        .key(key)
        .w_full()
        .pl(space::s3)
        .pr(space::s4)
        .gap(space::within)
        .child(lines(r, local, t, dark))
        .child(controls)
        .child(slot(grip).self_center());
    match &local.dragging {
        Some((id, dy)) if *id == r.id => line.offset(0.0, *dy),
        _ => line,
    }
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
    // Add as a plain + centred above Red (the user, 2026-11-20); its name is its label and hover.
    let plus = button("tickets-add".into(), "+", &t, dark)
        .font(type_::HEADER)
        .px(space::s3)
        .label(ADD)
        .help(ADD);
    let mut panel = col().key("tickets").gap(space::between).child(
        pressing(
            plus,
            pending.is_sent("tickets-add"),
            move |s: &mut State| {
                let (name, repo) = (ADD.to_string(), add.clone());
                send(s, "tickets-add", DeckAction::Create { name, repo });
            },
        )
        .self_center(),
    );
    let open = prefs.folds.get(&repo);
    for (n, g) in view.groups.iter().enumerate() {
        // A group's line between Red, Yellow and Green, none above the first.
        if n > 0 {
            let key = format!("tickets-group-{}-rule", g.colour);
            panel = panel.child(theme::rule(theme::Rule::Group, dark).key(key));
        }
        let (fold_repo, colour) = (repo.clone(), g.colour.clone());
        let header = theme::control(row(), dark)
            .key(format!("tickets-fold-{}", g.colour))
            .gap(space::within)
            .role("button")
            .on_press(move |s: &mut State| toggle(s, &fold_repo, &colour))
            .child(text(&g.label).font(type_::BODY).color(t.text))
            .child(
                text(g.rows.len().to_string())
                    .font(type_::CAPTION)
                    .color(t.text_secondary),
            );
        let mut fold = col().gap(space::within).child(header);
        if open.is_some_and(|set| set.contains(&g.colour)) {
            // deck.css `.tickets-list li`: a hairline between items, none after the last.
            let last = g.rows.len().saturating_sub(1);
            let mut mids: Vec<(String, f32)> = g
                .rows
                .iter()
                .filter_map(|r| {
                    let at = cx.layout(&format!("ticket-{}", r.id))?;
                    Some((r.id.clone(), at[1] + at[3] / 2.0))
                })
                .collect();
            // A row not laid out yet would place a drop among too few rows: no drop until all are.
            if mids.len() != g.rows.len() {
                mids.clear();
            }
            let mids: Mids = Rc::new(mids);
            for (i, r) in g.rows.iter().enumerate() {
                fold = fold.child(ticket_row(r, &repo, &mids, local, pending, &t, dark));
                if i != last {
                    let key = format!("ticket-{}-rule", r.id);
                    fold = fold.child(theme::rule(theme::Rule::Item, dark).key(key));
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
