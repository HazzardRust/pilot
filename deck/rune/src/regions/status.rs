//! The Status panel: a selector over the held lanes' tickets (when there are two or more) and the
//! chosen ticket's slice table, each as the view resolved it (`deck/view/status.mjs`). The run
//! record is the daemon's: this reads the view and nothing of the store (L1).

use crate::theme::type_;
use rune::tok;
use rune::{Cx, El, col, row, text};
use serde::Deserialize;

use crate::app::{State, go};
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
    href: Option<String>,
    /// The Yours thread's title and kind, as the page's link and its hover.
    #[serde(default)]
    yours: Option<String>,
    #[serde(default)]
    kind: Option<String>,
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

/// The table's Slice, State and Yours columns as shares of its width; every cell wraps in its own.
/// A table with no Yours link draws that column only as wide as its heading, as the page's does.
fn shares(rows: &[Slice]) -> [f32; 3] {
    let yours = if rows.iter().any(|row| row.href.is_some()) {
        1.5
    } else {
        0.0
    };
    [2.0, 3.0, yours]
}

/// Chooses a held ticket: the window's query takes its id and the live reader is asked for its
/// view off the UI thread, as an opened thread is (`notifications::open_thread`).
pub fn choose(s: &mut State, ticket: &str) {
    let query = Query {
        ticket: Some(ticket.to_string()),
        ..s.query.clone()
    };
    go(s, query);
}

pub fn draw(v: &serde_json::Value, _: &Local, cx: &mut Cx<State>) -> El {
    // A region the view cannot be read as draws empty rather than taking the window down.
    let status = Status::deserialize(v).unwrap_or_default();
    let dark = cx.system_dark();
    let t = tok::theme(dark);
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

    // A table as the page's `.slices`: a quiet SLICE / STATE / YOURS head, then a row per slice, the
    // slice bold and the state in the text's ink, each cell wrapping in its column (deck.css).
    let tk = theme::tokens(dark);
    let cell = |el: El, share: f32| {
        // An empty Yours column is one fixed width in the head and every row, so the columns align.
        if share > 0.0 {
            el.grow(share).min_w(0.0)
        } else {
            el.w(space::s8)
        }
    };
    let head = |key: String, shares: [f32; 3]| {
        ["Slice", "State", "Yours"].iter().zip(shares).fold(
            theme::list_row(row()).key(key).gap(cols.gap),
            |head, (name, share)| {
                let name = text(name.to_uppercase())
                    .font(type_::CAPTION)
                    .color(tk.quiet);
                head.child(cell(name, share))
            },
        )
    };
    let table_of = |key: String, row_key: &str, rows: &[Slice]| {
        if rows.is_empty() {
            return col().key(key);
        }
        let head = col()
            .key(key)
            .gap(space::within)
            .child(head(format!("{row_key}head"), shares(rows)))
            .child(theme::rule(theme::Rule::Item, dark).key(format!("{row_key}head-rule")));
        rows.iter().enumerate().fold(head, |table, (i, slice)| {
            let [slice_share, state_share, yours_share] = shares(rows);
            let mut line = row()
                .key(format!("{row_key}{i}"))
                .w_full()
                .pl(space::s3)
                .pr(space::s4)
                .gap(cols.gap)
                .items_start()
                .child(cell(
                    theme::content(
                        text(&slice.slice)
                            .key(format!("{row_key}{i}-slice"))
                            .font(type_::HEADER)
                            .color(t.text)
                            .wrap(),
                        dark,
                    ),
                    slice_share,
                ))
                .child(cell(
                    theme::content(
                        text(&slice.state)
                            .key(format!("{row_key}{i}-state"))
                            .font(type_::BODY)
                            .color(t.text)
                            .wrap(),
                        dark,
                    ),
                    state_share,
                ));
            let mut yours = row();
            if let Some(href) = &slice.href {
                let words = slice
                    .yours
                    .as_deref()
                    .filter(|title| !title.is_empty())
                    .unwrap_or("yours");
                let mut link = text(words)
                    .key(format!("{row_key}{i}-yours"))
                    .font(type_::BODY)
                    .color(t.text)
                    .wrap();
                if let Some(kind) = &slice.kind {
                    link = link.help(kind.as_str());
                }
                // The page's link goes to the thread; a link the view shaped otherwise opens nothing.
                if let Some(id) = href.strip_prefix("/thread/").filter(|id| !id.is_empty()) {
                    let id = id.to_string();
                    link = theme::control(link, dark)
                        .role("link")
                        .on_press(move |s: &mut State| open_thread(s, &id));
                }
                yours = yours.child(link);
            }
            line = line.child(cell(yours, yours_share));
            // An item's line between rows, none after the last, where a group's line may follow.
            let table = table.child(line);
            if i + 1 == rows.len() {
                return table;
            }
            table.child(theme::rule(theme::Rule::Item, dark).key(format!("{row_key}{i}-rule")))
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
                        text(&group.tab).font(type_::CAPTION).color(t.text),
                        dark,
                    ))
                    .child(table_of(
                        format!("status-table-{g}"),
                        &format!("status-row-{g}-"),
                        &group.rows,
                    ))
                    // deck.css `.run-status`: a hairline under each tab's table.
                    .child(
                        theme::rule(theme::Rule::Group, dark).key(format!("status-group-{g}-rule")),
                    ),
            )
        },
    );

    if status.tickets.is_empty() && status.rows.is_empty() && status.groups.is_empty() {
        return col()
            .key("status")
            .child(theme::empty("No tickets to show.", "status-none", dark));
    }
    col()
        .key("status")
        .gap(space::between)
        .child(selector)
        .child(table)
        .child(groups)
}
