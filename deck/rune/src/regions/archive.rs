//! The archive screen's list (archive-page L6, L11): `deck/view/archive.mjs` computes every row, its
//! display strings and its day section; this file only draws them. Each day folds as history's do, the
//! open one by the view's word; a row shows its kind, local time, title and `label: value` fields, and a
//! press asks for that row's detail on the same screen (`&id=`), which never opens a thread.

use std::borrow::Cow;
use std::cell::RefCell;
use std::collections::{BTreeMap, HashMap, HashSet};

use rune::tok;
use rune::{Cx, El, GrowthSpec, TextEdit, col, row, text, text_input};
use serde::Deserialize;
use serde_json::Value;

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
    /// What the list shows, kept between frames (S17); `draw` brings it up to date.
    list: RefCell<List>,
}

impl Local {
    /// The rows of the list's open sections, built or not.
    pub fn listed(&self) -> usize {
        let list = self.list.borrow();
        list.items
            .iter()
            .filter(|item| matches!(item, Item::Row { .. }))
            .count()
    }

    /// How many times the view's rows have been parsed: once per view, kind, search and sort.
    pub fn builds(&self) -> usize {
        self.list.borrow().builds
    }

    /// The view was replaced: the next frame builds the list again.
    pub fn new_view(&mut self) {
        self.list.get_mut().from = None;
    }
}

/// The list as places in the view (S17): rebuilt only when the view, the kind, the search or the sort
/// changes, so a frame over the same view parses none of its rows, and its items laid out again only
/// when a fold changes. The rows themselves stay in the view; a row is read from it when it is built.
#[derive(Debug, Default)]
struct List {
    from: Option<From>,
    /// Each section shown, in order: its place in the view's `days`, and its kept rows' places in that
    /// day's `rows`, in the order shown.
    sections: Vec<(usize, Vec<usize>)>,
    builds: usize,
    /// The folds `items` was laid out with, and the build it was laid out over.
    folds: Option<(usize, BTreeMap<String, bool>)>,
    items: Vec<Item>,
    /// Each item's key, unique; `layouts` changes whenever they do.
    keys: Vec<String>,
    layouts: usize,
}

/// What the list was built from. The view is the archive region's address, which a view put in place of
/// the drawn one never shares; `app::poll` also calls [`Local::new_view`], since several views can land
/// with no draw between them (a hidden window) and a later one take a freed address.
#[derive(Debug, PartialEq)]
struct From {
    view: usize,
    kind: Option<String>,
    search: String,
    sort: Option<(Column, bool)>,
}

/// One item of the list: a section's heading (spaced from the section above unless `first`, from its
/// rows while it shows some), or one of an open section's rows (spaced from the next unless `last`).
#[derive(Debug, Clone, Copy)]
enum Item {
    Day {
        section: usize,
        first: bool,
        open: bool,
        rows: bool,
    },
    Row {
        section: usize,
        row: usize,
        last: bool,
    },
}

impl List {
    /// Brings the list up to `v` and `local`'s filter, sort and folds; `Err` when `v` cannot be read.
    fn update(&mut self, v: &Value, local: &Local) -> Result<(), serde_json::Error> {
        let from = From {
            view: v as *const Value as usize,
            kind: local.kind.clone(),
            search: local.search.text.clone(),
            sort: local.sort,
        };
        if self.from.as_ref() != Some(&from) {
            self.from = None;
            self.sections = sections(v, &from)?;
            self.builds += 1;
            self.from = Some(from);
        }
        if self
            .folds
            .as_ref()
            .is_none_or(|(built, folds)| *built != self.builds || *folds != local.folded)
        {
            self.lay_out(v, &local.folded);
            self.folds = Some((self.builds, local.folded.clone()));
        }
        Ok(())
    }

    fn lay_out(&mut self, v: &Value, folded: &BTreeMap<String, bool>) {
        let days = &v["days"];
        let (mut items, mut keys, mut taken) = (vec![], vec![], HashSet::new());
        let mut key = |words: String| {
            // A key repeated in the view would take the list down; a repeat is told apart instead.
            let mut unique = words.clone();
            let mut n = 1;
            while !taken.insert(unique.clone()) {
                n += 1;
                unique = format!("{words}~{n}");
            }
            keys.push(unique);
        };
        for (section, (d, rows)) in self.sections.iter().enumerate() {
            let day = &days[*d];
            let day_key = day["key"].as_str().unwrap_or_default();
            let open = folded
                .get(day_key)
                .copied()
                .unwrap_or_else(|| day["open"].as_bool().unwrap_or(false));
            let shown = if open { rows.len() } else { 0 };
            items.push(Item::Day {
                section,
                first: section == 0,
                open,
                rows: shown > 0,
            });
            key(format!("archive-section-{day_key}"));
            for (row, r) in rows.iter().take(shown).enumerate() {
                items.push(Item::Row {
                    section,
                    row,
                    last: row + 1 == shown,
                });
                let id = day["rows"][*r]["id"].as_str().unwrap_or_default();
                key(format!("archive-item-{id}"));
            }
        }
        self.items = items;
        self.keys = keys;
        self.layouts += 1;
    }
}

/// The sections `from`'s filter and sort leave of `v`, as places in it, found again by day key and row id,
/// which the view writes unique (`deck/view/archive.mjs`; the rows were already keyed by id).
fn sections(v: &Value, from: &From) -> Result<Vec<(usize, Vec<usize>)>, serde_json::Error> {
    let days = Vec::<Day>::deserialize(&v["days"])?;
    let search = from.search.as_str();
    if from.kind.is_none() && search.trim().is_empty() && from.sort.is_none() {
        return Ok(days
            .iter()
            .enumerate()
            .map(|(d, day)| (d, (0..day.rows.len()).collect()))
            .collect());
    }
    let mut kept = filter_rows(&days, from.kind.as_deref(), search);
    if let Some((by, asc)) = from.sort {
        kept = sort_rows(&kept, by, asc);
    }
    let place: HashMap<&str, usize> = days
        .iter()
        .enumerate()
        .map(|(d, day)| (day.key, d))
        .collect();
    Ok(kept
        .iter()
        .filter_map(|k| {
            let d = *place.get(k.key)?;
            let at: HashMap<&str, usize> = days[d]
                .rows
                .iter()
                .enumerate()
                .map(|(r, row)| (row.id, r))
                .collect();
            Some((
                d,
                k.rows
                    .iter()
                    .filter_map(|r| at.get(r.id).copied())
                    .collect(),
            ))
        })
        .collect())
}

/// A column the list sorts by, pressed as `archive-sort-<column>`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Column {
    Date,
    Kind,
    Title,
}

// Every string borrows the view's own (A5): a frame reads 10,000 rows without copying one, which an
// owned `String` per string cost a release build about 20 ms of the 50 ms bar.

/// One `label: value` of a row, as the view wrote it.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct Field<'a> {
    pub label: &'a str,
    pub value: &'a str,
}

/// One archive row: its kind, id, ISO stamp `at`, local time `when`, title and fields.
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

/// One day (or month) section: its date key, heading, whether the view opens it, and its rows.
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

/// `days` with each section's rows ordered by `by` (A4): a section is never dropped or merged, and only
/// `Date` also orders the sections, by their date.
pub fn sort_rows<'a>(days: &[Day<'a>], by: Column, asc: bool) -> Vec<Day<'a>> {
    let mut out = days.to_vec();
    for d in &mut out {
        match by {
            Column::Date => d.rows.sort_by(|a, b| a.at.cmp(&b.at)),
            Column::Kind => d.rows.sort_by(|a, b| a.kind.cmp(b.kind)),
            Column::Title => d.rows.sort_by_cached_key(|r| r.title.to_lowercase()),
        }
        if !asc {
            d.rows.reverse();
        }
    }
    if by == Column::Date {
        // A section's place is its own date key (`2026-11-20`, `2026-10`), so one a filter emptied
        // keeps it; `undated` sorts as the oldest.
        out.sort_by_key(|d| (d.key != "undated", d.key));
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

fn archive_row(r: &Row, dark: bool) -> El {
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

/// A section's heading over `count` kept rows: its words fold or open it.
fn heading(day: &Value, count: usize, open: bool, dark: bool) -> El {
    let (t, ui) = (theme::tokens(dark), tok::theme(dark));
    let day_key = day["key"].as_str().unwrap_or_default();
    let key = day_key.to_string();
    row()
        .w_full()
        .gap(space::pad)
        .child(
            theme::control(text(day["heading"].as_str().unwrap_or_default()), dark)
                .key(format!("archive-day-{day_key}"))
                .role("button")
                .font(type_::CAPTION)
                .color(ui.text)
                .on_press(move |s: &mut State| {
                    s.regions.archive.folded.insert(key.clone(), !open);
                }),
        )
        .child(theme::content(
            text(count.to_string()).font(type_::CAPTION).color(t.quiet),
            dark,
        ))
}

/// The list's item `i`, read from the view as it is built: only the items near the viewport are
/// (`El::virtual_rows`). The spacing is the sections' as they were drawn whole: `pad` inside a
/// section, `between` from one section to the next.
fn item(s: &State, i: usize, dark: bool) -> El {
    let list = s.regions.archive.list.borrow();
    let none = Value::Null;
    let days = s.view.regions.get("archive").map_or(&none, |v| &v["days"]);
    match list.items.get(i).copied() {
        Some(Item::Day {
            section,
            first,
            open,
            rows,
        }) => {
            let (d, kept) = &list.sections[section];
            heading(&days[*d], kept.len(), open, dark)
                .pt(if first { 0.0 } else { space::between })
                .pb(if rows { space::pad } else { 0.0 })
        }
        Some(Item::Row { section, row, last }) => {
            let (d, kept) = &list.sections[section];
            match Row::deserialize(&days[*d]["rows"][kept[row]]) {
                Ok(r) => col()
                    .w_full()
                    .gap(space::pad)
                    .pb(if last { 0.0 } else { space::pad })
                    .child(archive_row(&r, dark))
                    .child(theme::separator(dark)),
                Err(_) => col(),
            }
        }
        None => col(),
    }
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

/// The search box and a toggle per column on one line, a toggle per kind on the lines below. A column pressed again flips its order;
/// Date starts ascending, since the view already runs newest first.
fn bar(kinds: &[Kind], local: &Local, cx: &mut Cx<State>) -> El {
    let dark = cx.system_dark();
    let search = text_input(&local.search, type_::BODY)
        .key("archive-search")
        .label("Search the archive")
        .grow(1.0)
        .placeholder("Search titles and fields", theme::tokens(dark).quiet)
        .on_edit(|s: &mut State| &mut s.regions.archive.search);
    let mut bar = row().w_full().flex_wrap().gap(space::between).child(search);
    // Both lines wrap, so every control stays inside the window's width at any size (QA2).
    let mut kind_row = row().w_full().flex_wrap().gap(space::between);
    for k in kinds {
        let on = local.kind.as_deref() == Some(k.kind);
        let kind = k.kind.to_string();
        kind_row = kind_row.child(
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
    col().w_full().gap(space::pad).child(bar).child(kind_row)
}

pub fn draw(v: &serde_json::Value, local: &Local, cx: &mut Cx<State>) -> El {
    // A region the view cannot be read as, or not yet loaded (every other screen's `{}`, with no `days`),
    // draws nothing rather than taking the window down or claiming the archive is empty.
    let kinds = v.get("kinds").map_or(Ok(vec![]), Vec::<Kind>::deserialize);
    // Every filter and sort runs here, over the rows the window holds (L6): a keystroke asks the deck
    // nothing, and a frame that changed none of them reads no row (S17).
    let (Some(days), Ok(kinds), Ok(())) = (
        v.get("days").and_then(Value::as_array),
        kinds,
        local.list.borrow_mut().update(v, local),
    ) else {
        return col().key("archive");
    };
    let dark = cx.system_dark();
    let region = col()
        .key("archive")
        .w_full()
        .grow(1.0)
        .min_h(space::s0)
        .gap(space::between);
    if days.is_empty() {
        return region.child(theme::empty("Nothing archived yet.", "archive-none", dark));
    }
    let region = region.child(bar(&kinds, local, cx));
    let (count, layouts) = {
        let list = local.list.borrow();
        (list.items.len(), list.layouts)
    };
    // Only the items near the centre's viewport are built and laid out, however many the list holds:
    // every row stays in the view (A5), and scrolling reaches each.
    let list = col()
        .key("archive-list")
        .w_full()
        .growth(GrowthSpec::default())
        .virtual_rows(
            count,
            ROW_ESTIMATE,
            |s: &State, i| {
                let list = s.regions.archive.list.borrow();
                Cow::Owned(
                    list.keys
                        .get(i)
                        .cloned()
                        .unwrap_or_else(|| format!("archive-gone-{i}")),
                )
            },
            move |s: &State, i| item(s, i, dark),
        )
        .virtual_rows_version(layouts);
    region.child(list)
}

/// An unbuilt item's height until it is measured: a row's two lines, its separator and their spacing.
const ROW_ESTIMATE: f32 = 64.0;
