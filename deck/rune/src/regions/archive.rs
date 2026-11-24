//! The archive screen's list (archive-page L6, L11): `deck/view/archive.mjs` computes every row, its
//! display strings and its day section; this file only draws them. Each day folds as history's do, the
//! open one by the view's word; a row shows its kind, local time, title and `label: value` fields, and a
//! press asks for that row's detail on the same screen (`&id=`), which never opens a thread.

use std::collections::BTreeMap;

use rune::tok;
use rune::{Cx, El, ScrollSpec, TextEdit, col, row, text, text_input};
use serde::Deserialize;

use crate::app::{State, go};
use crate::client::Query;
use crate::theme::{self, space, type_};

/// This window's folds (day key to open, over the view's own `open`), and its search, kind filter and
/// column sort (L6): all three act on the rows the window holds, so none of them asks the deck anything.
#[derive(Debug, Default)]
pub struct Local {
    pub folded: BTreeMap<String, bool>,
    pub search: TextEdit,
    pub kind: Option<String>,
    /// The pressed column and whether it runs ascending; `None` keeps the view's own order.
    pub sort: Option<(Column, bool)>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Column {
    Date,
    Kind,
    Title,
}

// Every string borrows the view's own (A5): a frame reads 10,000 rows without copying one, which an
// owned `String` per string cost a release build about 20 ms of the 50 ms bar.

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct Field<'a> {
    pub label: &'a str,
    pub value: &'a str,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct Row<'a> {
    pub kind: &'a str,
    pub id: &'a str,
    #[serde(borrow)]
    pub at: Option<&'a str>,
    pub when: &'a str,
    pub title: &'a str,
    #[serde(borrow)]
    pub fields: Vec<Field<'a>>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct Day<'a> {
    pub key: &'a str,
    pub heading: &'a str,
    pub open: bool,
    #[serde(borrow)]
    pub rows: Vec<Row<'a>>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Kind<'a> {
    kind: &'a str,
    label: &'a str,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Archive<'a> {
    #[serde(borrow)]
    kinds: Vec<Kind<'a>>,
    #[serde(borrow)]
    days: Vec<Day<'a>>,
}

/// `days` with each section's rows ordered by `by` (A4): a section is never dropped or merged, and only
/// `Date` also orders the sections, by their newest row.
pub fn sort_rows<'a>(days: &[Day<'a>], by: Column, asc: bool) -> Vec<Day<'a>> {
    let mut out = days.to_vec();
    for d in &mut out {
        match by {
            Column::Date => d.rows.sort_by(|a, b| a.at.cmp(&b.at)),
            Column::Kind => d.rows.sort_by(|a, b| a.kind.cmp(&b.kind)),
            Column::Title => d.rows.sort_by_cached_key(|r| r.title.to_lowercase()),
        }
        if !asc {
            d.rows.reverse();
        }
    }
    if by == Column::Date {
        // A section's place is its newest row's; an undated section sorts as the oldest.
        out.sort_by_cached_key(|d| d.rows.iter().filter_map(|r| r.at).max());
        if !asc {
            out.reverse();
        }
    }
    out
}

/// `days` keeping only the rows of `kind` (every kind when `None`) whose title or a field's value holds
/// `search`, case-insensitively; every section stays, emptied where nothing in it matches.
pub fn filter_rows<'a>(days: &[Day<'a>], kind: Option<&str>, search: &str) -> Vec<Day<'a>> {
    let needle = search.trim().to_lowercase();
    let holds = |words: &str| words.to_lowercase().contains(&needle);
    let kept = |r: &Row| {
        kind.is_none_or(|k| r.kind == k)
            && (needle.is_empty() || holds(r.title) || r.fields.iter().any(|f| holds(f.value)))
    };
    days.iter()
        .map(|d| Day {
            key: d.key,
            heading: d.heading,
            open: d.open,
            rows: d.rows.iter().filter(|r| kept(r)).cloned().collect(),
        })
        .collect()
}

/// A row's press: the same screen, asking for its detail.
fn ask(s: &mut State, id: &str) {
    let query = Query {
        screen: "archive".into(),
        id: Some(id.into()),
        ..s.query.clone()
    };
    go(s, query);
}

fn archive_row(r: &Row, cx: &mut Cx<State>) -> El {
    let dark = cx.system_dark();
    let (t, ui) = (theme::tokens(dark), tok::theme(dark));
    let caption = |words: &str| text(words).font(type_::CAPTION).color(t.quiet);
    let line = row()
        .w_full()
        .gap(space::between)
        .child(caption(r.kind))
        .child(caption(r.when))
        .child(theme::content(
            text(r.title)
                .font(type_::BODY)
                .color(ui.text)
                .grow(1.0)
                .wrap(),
            dark,
        ));
    let fields = r.fields.iter().fold(row().gap(space::between), |out, f| {
        out.child(
            row()
                .gap(space::within)
                .child(caption(f.label))
                .child(theme::content(
                    text(f.value).font(type_::CAPTION).color(ui.text),
                    dark,
                )),
        )
    });
    let id = r.id.to_string();
    theme::control(col(), dark)
        .key(format!("archive-row-{}", r.id))
        .role("button")
        .w_full()
        .gap(space::within)
        .child(line)
        .child(fields)
        .on_press(move |s: &mut State| ask(s, &id))
}

fn day(d: &Day, local: &Local, cx: &mut Cx<State>) -> El {
    let dark = cx.system_dark();
    let (t, ui) = (theme::tokens(dark), tok::theme(dark));
    let open = local.folded.get(d.key).copied().unwrap_or(d.open);
    let key = d.key.to_string();
    let heading = row()
        .w_full()
        .gap(space::pad)
        .child(
            theme::control(text(d.heading), dark)
                .key(format!("archive-day-{}", d.key))
                .role("button")
                .font(type_::CAPTION)
                .color(ui.text)
                .on_press(move |s: &mut State| {
                    s.regions.archive.folded.insert(key.clone(), !open);
                }),
        )
        .child(theme::content(
            text(d.rows.len().to_string())
                .font(type_::CAPTION)
                .color(t.quiet),
            dark,
        ));
    let mut section = col().w_full().gap(space::pad).child(heading);
    if open {
        for r in &d.rows {
            section = section
                .child(archive_row(r, cx))
                .child(theme::separator(dark));
        }
    }
    section
}

/// One toggle of the bar above the list, drawn in the text colour while `on`.
fn toggle(words: String, key: String, on: bool, cx: &mut Cx<State>) -> El {
    let dark = cx.system_dark();
    let ink = if on {
        tok::theme(dark).text
    } else {
        theme::tokens(dark).quiet
    };
    theme::control(text(words), dark)
        .key(key)
        .role("button")
        .font(type_::CAPTION)
        .color(ink)
}

/// The search box, a toggle per kind and a toggle per column. A column pressed again flips its order;
/// Date starts ascending, since the view already runs newest first.
fn bar(kinds: &[Kind], local: &Local, cx: &mut Cx<State>) -> El {
    let dark = cx.system_dark();
    let search = text_input(&local.search, type_::BODY)
        .key("archive-search")
        .label("Search the archive")
        .grow(1.0)
        .placeholder("Search titles and fields", theme::tokens(dark).quiet)
        .on_edit(|s: &mut State| &mut s.regions.archive.search);
    let mut bar = row().w_full().gap(space::between).child(search);
    for k in kinds {
        let on = local.kind.as_deref() == Some(k.kind);
        let kind = k.kind.to_string();
        bar = bar.child(
            toggle(
                k.label.to_string(),
                format!("archive-kind-{}", k.kind),
                on,
                cx,
            )
            .on_press(move |s: &mut State| {
                let picked = &mut s.regions.archive.kind;
                *picked = (picked.as_deref() != Some(kind.as_str())).then(|| kind.clone());
            }),
        );
    }
    for (column, name, label) in [
        (Column::Date, "date", "Date"),
        (Column::Kind, "kind", "Kind"),
        (Column::Title, "title", "Title"),
    ] {
        let now = local.sort.filter(|(by, _)| *by == column);
        let arrow = match now {
            Some((_, true)) => " ↑",
            Some((_, false)) => " ↓",
            None => "",
        };
        bar = bar.child(
            toggle(
                format!("{label}{arrow}"),
                format!("archive-sort-{name}"),
                now.is_some(),
                cx,
            )
            .on_press(move |s: &mut State| {
                s.regions.archive.sort = Some((column, now.is_none_or(|(_, asc)| !asc)));
            }),
        );
    }
    bar
}

pub fn draw(v: &serde_json::Value, local: &Local, cx: &mut Cx<State>) -> El {
    // A region the view cannot be read as, or not yet loaded (every other screen's `{}`, with no `days`),
    // draws nothing rather than taking the window down or claiming the archive is empty.
    let Some(archive) = v
        .get("days")
        .is_some()
        .then(|| Archive::deserialize(v).ok())
        .flatten()
    else {
        return col().key("archive");
    };
    let region = col()
        .key("archive")
        .w_full()
        .grow(1.0)
        .min_h(space::s0)
        .gap(space::between);
    if archive.days.is_empty() {
        return region.child(theme::empty(
            "Nothing archived yet.",
            "archive-none",
            cx.system_dark(),
        ));
    }
    let region = region.child(bar(&archive.kinds, local, cx));
    // Every filter and sort runs here, over the rows the window holds (L6): a keystroke asks the deck nothing.
    let (kind, search) = (local.kind.as_deref(), local.search.text.as_str());
    let mut days = if kind.is_none() && search.trim().is_empty() {
        archive.days
    } else {
        filter_rows(&archive.days, kind, search)
    };
    if let Some((by, asc)) = local.sort {
        days = sort_rows(&days, by, asc);
    }
    let mut list = col()
        .key("archive-list")
        .w_full()
        .grow(1.0)
        .min_h(space::s0)
        .gap(space::between)
        .scroll(ScrollSpec {
            stick_bottom: false,
        });
    for d in &days {
        list = list.child(day(d, local, cx));
    }
    region.child(list)
}
