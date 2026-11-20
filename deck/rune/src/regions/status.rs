//! The Status panel: a selector over the held lanes' tickets (when there are two or more) and the
//! chosen ticket's slice table, each as the view resolved it (`deck/view/status.mjs`). The run
//! record is the daemon's: this reads the view and nothing of the store (L1).

use rune::tok::{self, type_};
use rune::{Cx, El, col, row, text};
use serde::Deserialize;

use crate::app::State;
use crate::client::Query;
use crate::regions::notifications::open_thread;
use crate::theme::{self, space};

#[derive(Debug, Default)]
pub struct Local;

#[derive(Debug, Deserialize)]
struct Ticket {
    id: String,
    name: String,
    lane: String,
    #[serde(default)]
    chosen: bool,
}

#[derive(Debug, Deserialize)]
struct Slice {
    slice: String,
    state: String,
    #[serde(default)]
    branch: Option<String>,
    #[serde(default)]
    pr: Option<u64>,
    #[serde(default)]
    href: Option<String>,
}

/// One tab's table on the overview, under the tab's name, as the page's sections are.
#[derive(Debug, Deserialize)]
struct Group {
    tab: String,
    #[serde(default)]
    rows: Vec<Slice>,
}

#[derive(Debug, Default, Deserialize)]
struct Status {
    #[serde(default)]
    tickets: Vec<Ticket>,
    #[serde(default)]
    rows: Vec<Slice>,
    /// The overview's tables, one per tab; empty on a deck's tab, which has the one above.
    #[serde(default)]
    groups: Vec<Group>,
}

/// The advance of one monospace glyph as a share of the font size: what turns the status line's
/// `ch` columns (L10) into a width.
const ADVANCE: f32 = 0.6;

/// Chooses a held ticket: the window's query takes its id and the live reader is asked for its
/// view off the UI thread, as an opened thread is (`notifications::open_thread`).
pub fn choose(s: &mut State, ticket: &str) {
    let query = Query {
        ticket: Some(ticket.to_string()),
        ..s.query.clone()
    };
    if let Some(live) = &s.live {
        live.ask(&query);
    }
    s.query = query;
}

pub fn draw(v: &serde_json::Value, _: &Local, cx: &mut Cx<State>) -> El {
    // A region the view cannot be read as draws empty rather than taking the window down.
    let status = Status::deserialize(v).unwrap_or_default();
    let dark = cx.system_dark();
    let t = tok::theme(dark);
    let font = theme::tokens(dark).font;
    let cols = space::cols;
    let state_w = cols.state_ch * font.size * ADVANCE;
    let slice_w = cols.slice_ch * font.size * ADVANCE;

    let selector = status.tickets.iter().enumerate().fold(
        row().key("status-select").gap(space::between),
        |selector, (i, ticket)| {
            let ink = if ticket.chosen {
                t.text
            } else {
                t.text_secondary
            };
            let id = ticket.id.clone();
            selector.child(
                theme::control(row(), dark)
                    .key(format!("status-ticket-{i}"))
                    .role("button")
                    .on_press(move |s: &mut State| choose(s, &id))
                    .child(
                        text(format!("{} {}", ticket.lane, ticket.name))
                            .font(type_::BODY)
                            .color(ink),
                    ),
            )
        },
    );

    // A table's rows, keyed `{row_key}{i}` so two tables on the overview never share a key.
    let table_of = |key: String, row_key: &str, rows: &[Slice]| {
        rows.iter()
            .enumerate()
            .fold(col().key(key).gap(space::within), |table, (i, slice)| {
                // The page's columns, Slice then State then Yours; each cell one clipped line.
                let mut line = theme::list_row(row())
                    .key(format!("{row_key}{i}"))
                    .gap(cols.gap)
                    .child(theme::content(
                        text(&slice.slice)
                            .key(format!("{row_key}{i}-slice"))
                            .font(type_::BODY)
                            .color(t.text)
                            .truncate()
                            .w(slice_w)
                            .min_w(slice_w),
                        dark,
                    ))
                    .child(theme::content(
                        // The state takes what the row leaves, so it starts at one x on every row;
                        // branch, PR and yours trail it at the right, as the page has no such columns.
                        text(&slice.state)
                            .key(format!("{row_key}{i}-state"))
                            .font(type_::BODY)
                            .color(t.text_secondary)
                            .truncate()
                            .min_w(state_w)
                            .grow(1.0),
                        dark,
                    ));
                if let Some(branch) = &slice.branch {
                    line = line.child(theme::content(
                        text(branch)
                            .key(format!("{row_key}{i}-branch"))
                            .font(type_::LABEL)
                            .color(t.text_secondary)
                            .truncate(),
                        dark,
                    ));
                }
                if let Some(pr) = slice.pr {
                    line = line.child(theme::content(
                        text(format!("#{pr}"))
                            .font(type_::LABEL)
                            .color(t.text_secondary),
                        dark,
                    ));
                }
                if let Some(href) = &slice.href {
                    let mut yours = text("yours")
                        .key(format!("{row_key}{i}-yours"))
                        .font(type_::LABEL)
                        .color(t.text);
                    // The page's link goes to the thread; a link the view shaped otherwise opens nothing.
                    if let Some(id) = href.strip_prefix("/thread/").filter(|id| !id.is_empty()) {
                        let id = id.to_string();
                        yours = theme::control(yours, dark)
                            .role("link")
                            .on_press(move |s: &mut State| open_thread(s, &id));
                    }
                    line = line.child(yours);
                }
                // deck.css `.slices td`: a hairline under every row.
                table
                    .child(line)
                    .child(theme::separator(dark).key(format!("{row_key}{i}-rule")))
            })
    };

    let table = table_of("status-table".into(), "status-row-", &status.rows);
    let groups = status.groups.iter().enumerate().fold(
        col().key("status-groups").gap(space::between),
        |groups, (g, group)| {
            groups.child(
                col()
                    .key(format!("status-group-{g}"))
                    .gap(space::within)
                    .child(theme::content(
                        text(&group.tab).font(type_::LABEL).color(t.text),
                        dark,
                    ))
                    .child(table_of(
                        format!("status-table-{g}"),
                        &format!("status-row-{g}-"),
                        &group.rows,
                    ))
                    // deck.css `.run-status`: a hairline under each tab's table.
                    .child(theme::separator(dark).key(format!("status-group-{g}-rule"))),
            )
        },
    );

    col()
        .key("status")
        .gap(space::between)
        .child(selector)
        .child(table)
        .child(groups)
}
