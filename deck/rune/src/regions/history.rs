//! Settled threads by day and the items screen, as `deck/view/history.mjs` grouped them: the days and
//! their order are the view's (L2); this file folds them and draws S7's cards, one section each.

use std::collections::{BTreeMap, BTreeSet};

use rune::tok::{self, type_};
use rune::{Cx, El, col, row, text};
use serde::Deserialize;

use super::queue::{self, Card};
use crate::act::{self, Action};
use crate::app::State;
use crate::theme::{self, space};

/// The `act::send` key a run's dismiss goes under, before the run's id.
const DISMISS: &str = "dismiss-run-";

/// This window's folds (day key to open, over the view's own `open`), the runs whose dismiss is sent, and
/// the deck's refusals of them (run id to reason), which the next frame draws.
#[derive(Debug, Default)]
pub struct Local {
    pub folded: BTreeMap<String, bool>,
    pub dismissed: BTreeSet<String>,
    pub refused: BTreeMap<String, String>,
}

/// A run's answered dismiss: a refusal puts its words under the row and the dismiss back.
pub fn answered(h: &mut Local, key: &str, refused: Option<String>) {
    if let (Some(id), Some(reason)) = (key.strip_prefix(DISMISS), refused) {
        h.dismissed.remove(id);
        h.refused.insert(id.into(), reason);
    }
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

/// A run's dismiss sends once, shown sent at once; its answer comes back through `answered`.
fn dismiss(s: &mut State, id: &str) {
    let h = &mut s.regions.history;
    if !h.dismissed.insert(id.into()) {
        return;
    }
    h.refused.remove(id);
    let run = Action::DismissRun { id: id.into() };
    act::send(&mut s.pending, &format!("{DISMISS}{id}"), run);
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
        let mut button = theme::control(row(), dark)
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
    let out = col().w_full().child(line);
    match local.refused.get(&r.id) {
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
            theme::control(text(&d.heading), dark)
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
