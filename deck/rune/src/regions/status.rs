//! The Status panel: a selector over the held lanes' tickets (when there are two or more) and the
//! chosen ticket's slice table, each as the view resolved it (`deck/view/status.mjs`). The run
//! record is the daemon's: this reads the view and nothing of the store (L1).

use rune::tok::{self, type_};
use rune::{Cx, El, col, row, text};
use serde::Deserialize;

use crate::app::State;
use crate::client::{Client, Query, Result, View};
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

/// Chooses a held ticket: the window's query takes its id, the live reader is told, and the view
/// is read again for it, `fetch` being how. A view that cannot be read leaves the query and the
/// last view as they were, under the banner, rather than naming a ticket whose rows never came.
pub fn choose(s: &mut State, ticket: &str, fetch: impl FnOnce(&Query) -> Result<View>) {
    let query = Query {
        ticket: Some(ticket.to_string()),
        ..s.query.clone()
    };
    match fetch(&query) {
        Ok(view) => {
            if let Some(live) = &s.live {
                live.ask(&query);
            }
            s.view = view;
            s.query = query;
            s.down = false;
        }
        Err(err) => {
            eprintln!("pilot-deck: {err}");
            s.down = true;
        }
    }
}

fn read_again(query: &Query) -> Result<View> {
    Client::from_env().and_then(|client| client.view(query))
}

pub fn draw(v: &serde_json::Value, _: &Local, cx: &mut Cx<State>) -> El {
    // A region the view cannot be read as draws empty rather than taking the window down.
    let status = Status::deserialize(v).unwrap_or_default();
    let t = tok::theme(cx.system_dark());
    let font = theme::tokens(cx.system_dark()).font;
    let cols = space::cols;

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
                row()
                    .key(format!("status-ticket-{i}"))
                    .on_press(move |s: &mut State| choose(s, &id, read_again))
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
                let mut line = row()
                    .key(format!("{row_key}{i}"))
                    .gap(cols.gap)
                    .child(
                        text(&slice.state)
                            .font(type_::BODY)
                            .color(t.text_secondary)
                            .w(cols.state_ch * font.size * ADVANCE),
                    )
                    .child(
                        text(&slice.slice)
                            .font(type_::BODY)
                            .color(t.text)
                            .truncate()
                            .grow(1.0),
                    );
                if let Some(branch) = &slice.branch {
                    line = line.child(text(branch).font(type_::LABEL).color(t.text_secondary));
                }
                if let Some(pr) = slice.pr {
                    line = line.child(
                        text(format!("#{pr}"))
                            .font(type_::LABEL)
                            .color(t.text_secondary),
                    );
                }
                if slice.href.is_some() {
                    line = line.child(text("yours").font(type_::LABEL).color(t.text));
                }
                table.child(line)
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
                    .child(text(&group.tab).font(type_::LABEL).color(t.text))
                    .child(table_of(
                        format!("status-table-{g}"),
                        &format!("status-row-{g}-"),
                        &group.rows,
                    )),
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
