//! The Notifications panel, as the page's (`renderNotifications`, `deck/ui/js/notifications.mjs`): a
//! header with the badge, the count of what the user has not seen; the closed threads' notices, each
//! with a × that clears it on the deck; then every open thread the user has not seen since the pilot
//! last wrote on it, each with a × that marks it seen. Mark all seen does both. What was seen is the
//! window's prefs (A4), kept against the pilot's write count so a new word shows the thread again.

use rune::tok::{self, type_};
use rune::{Cx, El, col, row, text};
use serde::Deserialize;

use crate::act_deck::DeckAction;
use crate::app::State;
use crate::client::{Client, Query};
use crate::prefs::{self, Prefs};
use crate::theme::space;

#[derive(Debug, Default)]
pub struct Local;

/// The panel's name in `Prefs::open_panels`.
const PANEL: &str = "notifications";

#[derive(Debug, Deserialize)]
struct Notice {
    id: String,
    title: String,
}

#[derive(Debug, Deserialize)]
struct Open {
    id: String,
    title: String,
    writes: u32,
}

#[derive(Debug, Default, Deserialize)]
struct Notifications {
    #[serde(default)]
    notices: Vec<Notice>,
    #[serde(default)]
    open: Vec<Open>,
}

/// Whether an open thread is listed: never seen, or the pilot has written on it since.
pub fn shown(prefs: &Prefs, id: &str, writes: u32) -> bool {
    prefs.seen.get(id).is_none_or(|&seen| seen < writes)
}

/// Marks a thread seen at the pilot's write count it has now.
pub fn mark_seen(prefs: &mut Prefs, id: &str, writes: u32) {
    prefs.seen.insert(id.to_string(), writes);
}

/// Keeps the prefs on disk; a write that fails says so and leaves the window's copy, which is still
/// right for this session.
fn keep(prefs: &Prefs) {
    let saved = prefs::dir()
        .ok_or_else(|| std::io::Error::other("no home directory"))
        .and_then(|dir| prefs.save(&dir));
    if let Err(err) = saved {
        eprintln!("pilot-deck: prefs not saved: {err}");
    }
}

/// Sends a notice write; the live reader brings the view without the notice back.
fn clear(s: &mut State, action: &DeckAction) {
    if let Err(err) = Client::from_env().and_then(|client| client.act(action)) {
        eprintln!("pilot-deck: {err}");
        s.down = true;
    }
}

/// Opens a listed thread, as its link on the page does.
fn open_thread(s: &mut State, id: &str) {
    let query = Query {
        screen: "thread".into(),
        id: Some(id.to_string()),
        ..s.query.clone()
    };
    if let Some(live) = &s.live {
        live.ask(&query);
    }
    s.query = query;
}

/// One row: the title, which opens the thread, and its ×, which runs `drop`.
fn line(
    key: String,
    title: &str,
    id: &str,
    t: &tok::Theme,
    drop: impl Fn(&mut State) + 'static,
) -> El {
    let to = id.to_string();
    row()
        .key(key)
        .gap(space::within)
        .child(
            text(title)
                .font(type_::BODY)
                .color(t.text)
                .role("link")
                .truncate()
                .grow(1.0)
                .on_press(move |s: &mut State| open_thread(s, &to)),
        )
        .child(
            text("×")
                .font(type_::BODY)
                .color(t.text_secondary)
                .role("button")
                .on_press(drop),
        )
}

/// Drawn from the window's prefs and not a `Local`: what was seen and whether the panel is open
/// outlive the window, so they are `State::prefs`, which every press here writes back to disk.
pub fn draw(v: &serde_json::Value, prefs: &Prefs, cx: &mut Cx<State>) -> El {
    // A region the view cannot be read as draws empty rather than taking the window down.
    let view = Notifications::deserialize(v).unwrap_or_default();
    let t = tok::theme(cx.system_dark());
    let unseen: Vec<&Open> = view
        .open
        .iter()
        .filter(|one| shown(prefs, &one.id, one.writes))
        .collect();
    let count = view.notices.len() + unseen.len();
    let is_open = prefs.open_panels.contains(PANEL);

    let mut header = row()
        .key("notifications-header")
        .gap(space::within)
        .role("button")
        .on_press(|s: &mut State| {
            if !s.prefs.open_panels.remove(PANEL) {
                s.prefs.open_panels.insert(PANEL.to_string());
            }
            keep(&s.prefs);
        })
        .child(text("Notifications").font(type_::BODY).color(t.text));
    if count > 0 {
        header = header.child(
            text(count.to_string())
                .key("notifications-badge")
                .font(type_::LABEL)
                .color(t.text),
        );
    }
    let mut panel = col().key("notifications").gap(space::within).child(header);
    if !is_open || count == 0 {
        return panel;
    }

    let listed: Vec<(String, u32)> = unseen
        .iter()
        .map(|one| (one.id.clone(), one.writes))
        .collect();
    panel = panel.child(
        text("Mark all seen")
            .key("notifications-mark-all")
            .font(type_::LABEL)
            .color(t.text_secondary)
            .role("button")
            .on_press(move |s: &mut State| {
                listed
                    .iter()
                    .for_each(|(id, writes)| mark_seen(&mut s.prefs, id, *writes));
                keep(&s.prefs);
                clear(s, &DeckAction::ClearNotices);
            }),
    );
    for (i, notice) in view.notices.iter().enumerate() {
        let id = notice.id.clone();
        panel = panel.child(line(
            format!("notice-{i}"),
            &notice.title,
            &notice.id,
            &t,
            move |s| clear(s, &DeckAction::ClearNotice { id: id.clone() }),
        ));
    }
    for (i, one) in unseen.iter().enumerate() {
        let (id, writes) = (one.id.clone(), one.writes);
        panel = panel.child(line(
            format!("open-{i}"),
            &one.title,
            &one.id,
            &t,
            move |s| {
                mark_seen(&mut s.prefs, &id, writes);
                keep(&s.prefs);
            },
        ));
    }
    panel
}
