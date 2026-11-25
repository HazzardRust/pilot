//! The Status panel: a selector over the held lanes' tickets (when there are two or more) and the
//! chosen ticket's slice table, each as the view resolved it (`deck/view/status.mjs`). The run
//! record is the daemon's: this reads the view and nothing of the store (L1).

use crate::theme::type_;
use rune::tok;
use rune::{Cx, El, Link, Span, Tx, col, el, rich, row, text};
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
    #[serde(default)]
    heading: String,
    #[serde(default)]
    started: String,
    #[serde(default)]
    held: bool,
}

/// What the page says for a held ticket with no record yet (`renderStrips`, `p.empty`).
const NO_TABLE: &str = "no slice table yet";

#[derive(Debug, Default, Deserialize)]
struct Status {
    #[serde(default)]
    tickets: Vec<Ticket>,
    #[serde(default)]
    rows: Vec<Slice>,
    /// The table's heading, as the page's `.run-status` opens: the feature or tab's name, and the
    /// hour and minute the run started. Empty with no table.
    #[serde(default)]
    heading: String,
    #[serde(default)]
    started: String,
    /// The overview's tables, one per tab; empty on a deck's tab, which has the one above.
    #[serde(default)]
    groups: Vec<Group>,
    /// The chosen held ticket has no record: the view's `held` (`deck/view/status.mjs`).
    #[serde(default)]
    held: bool,
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

/// The chosen ticket's bar, as wide as the page's `inset 2px` shadow.
const BAR: f32 = 2.0;

/// A piece of a State cell: text as posted, or an http(s) URL drawn as a link.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Part {
    Text(String),
    Url(String),
}

/// What the page's `URL_IN_TEXT` (`deck/ui/render-strip.mjs`) leaves off a URL's end.
const TRAILING: &[char] = &['.', ',', ';', ':', '!', '?', ')', ']', '}', '\'', '"'];

/// A State cell split as the page's `renderState` splits it: each `http://` or `https://` run up to
/// whitespace or `<`, its trailing punctuation left as text, is a URL; every other scheme is text.
/// The parts joined are `state` unchanged.
pub fn links(state: &str) -> Vec<Part> {
    let mut parts = Vec::new();
    let (mut text_from, mut at) = (0, 0);
    while let Some(next) = state[at..].chars().next() {
        let rest = &state[at..];
        let scheme = ["https://", "http://"]
            .iter()
            .find(|s| {
                rest.as_bytes()
                    .get(..s.len())
                    .is_some_and(|b| b.eq_ignore_ascii_case(s.as_bytes()))
            })
            .map(|s| s.len());
        if let Some(scheme) = scheme {
            let run = rest
                .find(|c: char| c.is_whitespace() || c == '<')
                .unwrap_or(rest.len());
            let url = rest[..run].trim_end_matches(TRAILING);
            if url.len() > scheme {
                if at > text_from {
                    parts.push(Part::Text(state[text_from..at].to_string()));
                }
                parts.push(Part::Url(url.to_string()));
                at += url.len();
                text_from = at;
                continue;
            }
        }
        at += next.len_utf8();
    }
    if text_from < state.len() {
        parts.push(Part::Text(state[text_from..].to_string()));
    }
    parts
}

/// A State cell as the page's: the text as posted, each URL in it an underlined link that opens in
/// the browser through `Tx::open_url`, which refuses every scheme past http, https and mailto.
fn state_cell(state: &str, key: String, ink: rune::Color) -> El {
    let mut at = 0;
    let mut urls = Vec::new();
    for part in links(state) {
        let (Part::Text(words) | Part::Url(words)) = &part;
        if let Part::Url(url) = &part {
            urls.push((at..at + url.len(), url.clone()));
        }
        at += words.len();
    }
    let spans = urls
        .iter()
        .map(|(range, _)| Span::new(range.start, range.end).underline(ink))
        .collect();
    let mut cell = rich(state, spans)
        .key(key)
        .font(type_::BODY)
        .color(ink)
        .wrap();
    if urls.is_empty() {
        return cell;
    }
    for (range, url) in urls {
        cell = cell.link(Link::new(range, url));
    }
    cell.on_link(|_: &mut State, url: &str, tx: &mut Tx| {
        // A link the runtime refuses (no host, a space) opens nothing; the cell still reads as posted.
        let _ = tx.open_url(url);
    })
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

    // The page's `.status-select`: one "<lane> · <title>" per line, the chosen one in the text's ink
    // behind a 2 px bar and indented 0.5rem (deck.css `box-shadow: inset 2px 0`), the rest quiet.
    let selector = status.tickets.iter().enumerate().fold(
        col().key("status-select"),
        |selector, (i, ticket)| {
            let ink = if ticket.chosen {
                t.text
            } else {
                t.text_secondary
            };
            let id = ticket.id.clone();
            let mut line = theme::control(row(), dark)
                .key(format!("status-ticket-{i}"))
                .role("button")
                .on_press(move |s: &mut State| choose(s, &id));
            let mut label = text(format!("{} · {}", ticket.lane, ticket.name))
                .font(type_::BODY)
                .color(ink);
            if ticket.chosen {
                line = line.child(
                    el().key(format!("status-ticket-{i}-bar"))
                        .w(BAR)
                        .h_full()
                        .fill(ink),
                );
                label = label.pl(space::s3);
            }
            selector.child(line.child(label))
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
                        state_cell(&slice.state, format!("{row_key}{i}-state"), t.text),
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

    // The page's `<span class="run">name</span> · started <time>`: the name bold, then the hour.
    let heading = |key: String, name: &str, started: &str| {
        // In by the rows' own indent, so the name starts over the Slice column as on the page.
        let mut line = row().key(key.clone()).pl(space::s3).child(theme::content(
            text(name)
                .key(format!("{key}-name"))
                .font(type_::HEADER)
                .color(t.text),
            dark,
        ));
        if !started.is_empty() {
            line = line.child(theme::content(
                text(format!(" · started {started}"))
                    .key(format!("{key}-started"))
                    .font(type_::BODY)
                    .color(t.text),
                dark,
            ));
        }
        line
    };
    let titled = |key: String, name: &str, started: &str, table: El| {
        if name.is_empty() {
            return table;
        }
        col()
            .gap(space::within)
            .child(heading(key, name, started))
            .child(table)
    };

    let table = titled(
        "status-heading".into(),
        &status.heading,
        &status.started,
        table_of("status-table".into(), "status-row-", &status.rows),
    );
    let groups = status.groups.iter().enumerate().fold(
        col().key("status-groups").gap(space::between),
        |groups, (g, group)| {
            let mut named = col()
                .key(format!("status-group-{g}"))
                .gap(space::within)
                .child(theme::content(
                    text(&group.tab).font(type_::CAPTION).color(t.text),
                    dark,
                ));
            if group.held {
                named = named.child(theme::empty(
                    NO_TABLE,
                    &format!("status-group-{g}-held"),
                    dark,
                ));
            }
            groups.child(
                named
                    .child(titled(
                        format!("status-heading-{g}"),
                        &group.heading,
                        &group.started,
                        table_of(
                            format!("status-table-{g}"),
                            &format!("status-row-{g}-"),
                            &group.rows,
                        ),
                    ))
                    // deck.css `.run-status`: a hairline under each tab's table.
                    .child(
                        theme::rule(theme::Rule::Group, dark).key(format!("status-group-{g}-rule")),
                    ),
            )
        },
    );

    if !status.held
        && status.tickets.is_empty()
        && status.rows.is_empty()
        && status.groups.is_empty()
    {
        // Blank, as the HTML deck (rune-panes A2).
        return col().key("status");
    }
    // The page's order: the selector, the held sentence, then the table.
    let mut pane = col().key("status").gap(space::between).child(selector);
    if status.held {
        pane = pane.child(theme::empty(NO_TABLE, "status-held", dark));
    }
    pane.child(table).child(groups)
}
