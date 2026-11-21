//! The Reports panel as `deck/view/reports.mjs` resolved it: the repository's closing reports, each with a ×
//! that hides it. What was hidden is the window's own prefs (A4), kept by id so it stays hidden across a restart.

use crate::theme::type_;
use rune::tok;
use rune::{Cx, El, col, el, row, text};
use serde::Deserialize;

use super::notifications::{keep, open_thread};
use crate::app::State;
use crate::prefs::Prefs;
use crate::theme::{self, space};

#[derive(Debug, Default)]
pub struct Local;

#[derive(Debug, Deserialize)]
struct Report {
    id: String,
    title: String,
    /// Not yet closed by the pilot: the page's "open" mark, in the waiting colour.
    #[serde(default)]
    open: bool,
}

#[derive(Debug, Default, Deserialize)]
struct Reports {
    #[serde(default)]
    reports: Vec<Report>,
}

/// Whether a report is listed: one the user has not hidden.
pub fn shown(prefs: &Prefs, id: &str) -> bool {
    !prefs.hidden_reports.contains(id)
}

/// Hides a report from the panel; the report itself stays open on the deck.
pub fn hide(prefs: &mut Prefs, id: &str) {
    prefs.hidden_reports.insert(id.to_string());
}

/// Drawn from the window's prefs: the hidden ids outlive the window, so every × writes them back to disk.
pub fn draw(v: &serde_json::Value, prefs: &Prefs, cx: &mut Cx<State>) -> El {
    let view = Reports::deserialize(v).unwrap_or_default();
    let dark = cx.system_dark();
    let t = tok::theme(dark);
    let listed: Vec<&Report> = view
        .reports
        .iter()
        .filter(|one| shown(prefs, &one.id))
        .collect();
    // The panel's header is the layout's (S20).
    let mut panel = col().key("reports").gap(space::within);
    if listed.is_empty() {
        let none = if view.reports.is_empty() {
            "no reports"
        } else {
            "all hidden"
        };
        return panel.child(theme::empty(none, "reports-none", dark));
    }
    let last = listed.len() - 1;
    for (i, one) in listed.into_iter().enumerate() {
        let (open, hidden) = (one.id.clone(), one.id.clone());
        let mut line = theme::list_row(row())
            .key(format!("report-{}", one.id))
            .gap(space::within)
            .child(
                theme::control(text(&one.title), dark)
                    .font(type_::BODY)
                    .color(t.text)
                    .role("link")
                    .truncate()
                    .on_press(move |s: &mut State| open_thread(s, &open)),
            );
        // deck.css `.reports-list .open`: the word just after the title, in the waiting colour.
        if one.open {
            line = line.child(
                text("open")
                    .key(format!("report-{}-open", one.id))
                    .font(type_::BODY)
                    .color(theme::tokens(dark).state.waiting),
            );
        }
        // The rest of the row, so the × stays at its end whatever the title's width.
        panel = panel.child(
            line.child(el().grow(1.0)).child(
                theme::control(text("×"), dark)
                    .key(format!("report-{}-hide", one.id))
                    .font(type_::BODY)
                    .color(t.text_secondary)
                    .role("button")
                    .on_press(move |s: &mut State| {
                        hide(&mut s.prefs, &hidden);
                        keep(&s.prefs);
                    }),
            ),
        );
        // deck.css `.reports-list li`: a hairline between items, none after the last.
        if i != last {
            let key = format!("report-{}-rule", one.id);
            panel = panel.child(theme::rule(theme::Rule::Item, dark).key(key));
        }
    }
    panel
}
