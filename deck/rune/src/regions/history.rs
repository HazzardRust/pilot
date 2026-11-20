//! Settled threads by day and the items screen, as `deck/view/history.mjs` grouped them: the days and
//! their order are the view's (L2); this file folds them and draws S7's cards, one section each.

use std::collections::{BTreeMap, BTreeSet};
use std::sync::{Arc, Mutex, PoisonError};

use rune::tok::{self, type_};
use rune::{Cx, El, col, row, text};
use serde::Deserialize;

use super::queue::{self, Card};
use crate::act::{Acted, Action};
use crate::app::State;
use crate::client::Client;
use crate::theme::{self, space};

/// This window's folds (day key to open, over the view's own `open`), the runs whose dismiss is sent, and
/// the refusals their posting threads leave (run id to reason), which the next frame draws.
#[derive(Debug, Default)]
pub struct Local {
    pub folded: BTreeMap<String, bool>,
    pub dismissed: BTreeSet<String>,
    pub refused: Arc<Mutex<BTreeMap<String, String>>>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Day {
    key: String,
    heading: String,
    open: bool,
    cards: Vec<Card>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct RunRow {
    id: String,
    name: String,
    dismissable: bool,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct History {
    days: Vec<Day>,
    runs: Vec<RunRow>,
}

/// A run's dismiss sends once, on its own thread; the queue's deck and waker are the window's.
fn dismiss(s: &mut State, id: &str) {
    let (deck, wake) = (
        s.regions.queue.deck.clone(),
        s.regions.queue.inbox.wake.clone(),
    );
    let h = &mut s.regions.history;
    if !h.dismissed.insert(id.into()) {
        return;
    }
    let (refused, run) = (h.refused.clone(), id.to_string());
    let post = move || {
        let deck = deck.or_else(|| Client::from_env().ok().map(Arc::new));
        let reason = match deck.map(|deck| deck.act(&Action::DismissRun { id: run.clone() })) {
            Some(Ok(Acted::Taken { .. })) => return,
            Some(Ok(Acted::Refused { reason })) => reason,
            Some(Err(err)) => err.to_string(),
            None => "no deck to send to".into(),
        };
        refused
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .insert(run, reason);
        if let Some(wake) = wake {
            wake();
        }
    };
    if let Err(err) = std::thread::Builder::new()
        .name("pilot-deck-dismiss".into())
        .spawn(post)
    {
        h.dismissed.remove(id);
        h.refused
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .insert(id.into(), err.to_string());
    }
}

fn run_row(r: &RunRow, local: &Local, cx: &mut Cx<State>) -> El {
    let dark = cx.system_dark();
    let (t, ui) = (theme::tokens(dark), tok::theme(dark));
    let key = |part: &str| format!("run-{}-{part}", r.id);
    let mut line = row()
        .key(key("row"))
        .w_full()
        .h(space::row)
        .gap(space::between)
        .child(
            text(&r.name)
                .key(key("name"))
                .font(type_::LABEL)
                .color(ui.text)
                .grow(1.0),
        );
    if r.dismissable {
        let sent = local.dismissed.contains(&r.id);
        let id = r.id.clone();
        let mut button = row()
            .key(key("dismiss"))
            .padding(space::pad)
            .radius(tok::radius::SM)
            .border(1.0, t.rule)
            .fill(if sent { t.state.pilot } else { ui.card })
            .child(text("dismiss").font(type_::LABEL).color(ui.text))
            .disabled(sent);
        if !sent {
            button = button.on_press_tx(move |s: &mut State, tx: &mut rune::Tx| {
                tx.instant();
                dismiss(s, &id);
            });
        }
        line = line.child(button);
    }
    let reason = local
        .refused
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .get(&r.id)
        .cloned();
    let out = col().w_full().child(line);
    match reason {
        Some(reason) => out.child(
            text(reason)
                .key(key("refused"))
                .font(type_::BODY)
                .color(t.state.unacknowledged)
                .wrap(),
        ),
        None => out,
    }
}

fn day(d: &Day, local: &Local, cx: &mut Cx<State>) -> El {
    let dark = cx.system_dark();
    let (t, ui) = (theme::tokens(dark), tok::theme(dark));
    let open = local.folded.get(&d.key).copied().unwrap_or(d.open);
    let key = d.key.clone();
    let heading = row()
        .w_full()
        .gap(space::pad)
        .child(
            text(&d.heading)
                .key(format!("day-{}", d.key))
                .role("button")
                .font(type_::LABEL)
                .color(ui.text)
                .on_press(move |s: &mut State| {
                    s.regions.history.folded.insert(key.clone(), !open);
                }),
        )
        .child(
            text(d.cards.len().to_string())
                .font(type_::LABEL)
                .color(t.quiet),
        );
    let mut section = col().w_full().gap(space::pad).child(heading);
    if open {
        for c in &d.cards {
            section = section.child(queue::card(c, cx));
        }
    }
    section
}

pub fn draw(v: &serde_json::Value, local: &Local, cx: &mut Cx<State>) -> El {
    // A region the view cannot be read as draws empty rather than taking the window down.
    let history = History::deserialize(v).unwrap_or_default();
    let mut region = col().key("history").w_full().gap(space::between);
    if !history.runs.is_empty() {
        let runs = history
            .runs
            .iter()
            .fold(col().w_full(), |runs, r| runs.child(run_row(r, local, cx)));
        region = region.child(runs);
    }
    for d in &history.days {
        region = region.child(day(d, local, cx));
    }
    region
}
