//! The Notifications panel, as the page's (`renderNotifications`, `deck/ui/js/notifications.mjs`):
//! under the layout's header and count of what the user has not seen, the closed threads' notices, each
//! with a × that clears it on the deck; then every open thread the user has not seen since the pilot
//! last wrote on it, each with a × that marks it seen. Mark all seen does both. What was seen is the
//! window's prefs (A4), kept against the pilot's write count so a new word shows the thread again.

use std::collections::BTreeMap;

use rune::tok::{self, type_};
use rune::{Color, Cx, El, col, row, text};
use serde::Deserialize;

use crate::act::{self, Pending};
use crate::act_deck::DeckAction;
use crate::app::State;
use crate::client::Query;
use crate::prefs::{self, Prefs};
use crate::theme::{self, space};

/// The `act::send` key of a notice's ×, before its id; Mark all seen's is `CLEAR_ALL`.
const CLEAR: &str = "clear-notice-";
const CLEAR_ALL: &str = "clear-notices";

/// The deck's refusals of this panel's writes, by the key each was sent under.
#[derive(Debug, Default)]
pub struct Local {
    pub refused: BTreeMap<String, String>,
}

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
pub(crate) fn keep(prefs: &Prefs) {
    let saved = prefs::dir()
        .ok_or_else(|| std::io::Error::other("no home directory"))
        .and_then(|dir| prefs.save(&dir));
    if let Err(err) = saved {
        eprintln!("pilot-deck: prefs not saved: {err}");
    }
}

/// Sends a notice write under `key`; the live reader brings the view without the notice back, and a
/// refusal comes back through `answered`.
fn clear(s: &mut State, key: &str, action: DeckAction) {
    s.regions.notifications.refused.remove(key);
    act::send(&mut s.pending, key, action);
}

/// A notice write answered: a refusal's words go under the control that sent it.
pub fn answered(n: &mut Local, key: &str, refused: Option<String>) {
    let ours = key == CLEAR_ALL || key.starts_with(CLEAR);
    if let (true, Some(reason)) = (ours, refused) {
        n.refused.insert(key.into(), reason);
    }
}

/// A refusal under a control, when it has one.
fn refusal(panel: El, local: &Local, sent: &str, key: String, ink: Color) -> El {
    match local.refused.get(sent) {
        Some(reason) => panel.child(text(reason).key(key).font(type_::BODY).color(ink).wrap()),
        None => panel,
    }
}

/// Opens a listed thread, as its link on the page does.
pub(crate) fn open_thread(s: &mut State, id: &str) {
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

/// One row: the title, which opens the thread, and its ×, which runs `drop` and is drawn disabled
/// while `sent`.
fn line(
    key: String,
    title: &str,
    id: &str,
    t: &tok::Theme,
    dark: bool,
    sent: bool,
    drop: impl Fn(&mut State) + 'static,
) -> El {
    let to = id.to_string();
    let clear = format!("{key}-clear");
    row()
        .key(key)
        .gap(space::within)
        .child(
            theme::control(text(title), dark)
                .font(type_::BODY)
                .color(t.text)
                .role("link")
                .truncate()
                .grow(1.0)
                .on_press(move |s: &mut State| open_thread(s, &to)),
        )
        .child(
            theme::control(text("×"), dark)
                .key(clear)
                .font(type_::BODY)
                .color(t.text_secondary)
                .role("button")
                .focusable(true)
                .disabled(sent)
                .on_press(drop),
        )
}

/// What was seen is drawn from the window's prefs, not `local`: it outlives the window, so it is
/// `State::prefs`, which every press here writes back to disk; `local` holds only the deck's
/// refusals. The header, its count and whether the panel is open are the layout's (S20).
pub fn draw(
    v: &serde_json::Value,
    prefs: &Prefs,
    local: &Local,
    pending: &Pending,
    cx: &mut Cx<State>,
) -> El {
    // A region the view cannot be read as draws empty rather than taking the window down.
    let view = Notifications::deserialize(v).unwrap_or_default();
    let dark = cx.system_dark();
    let (t, ink) = (tok::theme(dark), theme::tokens(dark).state.unacknowledged);
    let unseen: Vec<&Open> = view
        .open
        .iter()
        .filter(|one| shown(prefs, &one.id, one.writes))
        .collect();
    let mut panel = col().key("notifications").gap(space::within);
    if view.notices.is_empty() && unseen.is_empty() {
        return panel;
    }

    let listed: Vec<(String, u32)> = unseen
        .iter()
        .map(|one| (one.id.clone(), one.writes))
        .collect();
    panel = panel.child(
        theme::control(text("Mark all seen"), dark)
            .key("notifications-mark-all")
            .font(type_::LABEL)
            .color(t.text_secondary)
            .role("button")
            .disabled(pending.is_sent(CLEAR_ALL))
            .on_press(move |s: &mut State| {
                listed
                    .iter()
                    .for_each(|(id, writes)| mark_seen(&mut s.prefs, id, *writes));
                keep(&s.prefs);
                clear(s, CLEAR_ALL, DeckAction::ClearNotices);
            }),
    );
    // Mark all seen's own refusal; its prefs half is the window's and has already happened.
    let all = "notifications-mark-all-refused".into();
    panel = refusal(panel, local, CLEAR_ALL, all, ink);
    for (i, notice) in view.notices.iter().enumerate() {
        let (id, sent) = (notice.id.clone(), format!("{CLEAR}{}", notice.id));
        let key = sent.clone();
        panel = panel.child(line(
            format!("notice-{i}"),
            &notice.title,
            &notice.id,
            &t,
            dark,
            pending.is_sent(&sent),
            move |s| clear(s, &key, DeckAction::ClearNotice { id: id.clone() }),
        ));
        panel = refusal(panel, local, &sent, format!("notice-{i}-refused"), ink);
    }
    for (i, one) in unseen.iter().enumerate() {
        let (id, writes) = (one.id.clone(), one.writes);
        panel = panel.child(line(
            format!("open-{i}"),
            &one.title,
            &one.id,
            &t,
            dark,
            false,
            move |s| {
                mark_seen(&mut s.prefs, &id, writes);
                keep(&s.prefs);
            },
        ));
    }
    panel
}
