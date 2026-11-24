//! The archive screen's list (archive-page L6, L11): `deck/view/archive.mjs` computes every row, its
//! display strings and its day section; this file only draws them. Each day folds as history's do, the
//! open one by the view's word; a row shows its kind, local time, title and `label: value` fields, and a
//! press asks for that row's detail on the same screen (`&id=`), which never opens a thread.

use std::collections::BTreeMap;

use rune::tok;
use rune::{Cx, El, ScrollSpec, col, row, text};
use serde::Deserialize;

use crate::app::{State, go};
use crate::client::Query;
use crate::theme::{self, space, type_};

/// This window's folds: day key to open, over the view's own `open`.
#[derive(Debug, Default)]
pub struct Local {
    pub folded: BTreeMap<String, bool>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Field {
    label: String,
    value: String,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Row {
    kind: String,
    id: String,
    when: String,
    title: String,
    fields: Vec<Field>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Day {
    key: String,
    heading: String,
    open: bool,
    rows: Vec<Row>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Archive {
    days: Vec<Day>,
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
        .child(caption(&r.kind))
        .child(caption(&r.when))
        .child(theme::content(
            text(&r.title)
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
                .child(caption(&f.label))
                .child(theme::content(
                    text(&f.value).font(type_::CAPTION).color(ui.text),
                    dark,
                )),
        )
    });
    let id = r.id.clone();
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
    let open = local.folded.get(&d.key).copied().unwrap_or(d.open);
    let key = d.key.clone();
    let heading = row()
        .w_full()
        .gap(space::pad)
        .child(
            theme::control(text(&d.heading), dark)
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

pub fn draw(v: &serde_json::Value, local: &Local, cx: &mut Cx<State>) -> El {
    // A region the view cannot be read as (or not yet loaded) draws nothing rather than taking the window
    // down or claiming the archive is empty.
    let Some(archive) = v
        .is_object()
        .then(|| Archive::deserialize(v).ok())
        .flatten()
    else {
        return col().key("archive");
    };
    let mut region = col()
        .key("archive")
        .w_full()
        .grow(1.0)
        .min_h(space::s0)
        .gap(space::between)
        .scroll(ScrollSpec {
            stick_bottom: false,
        });
    if archive.days.is_empty() {
        return region.child(theme::empty(
            "Nothing archived yet.",
            "archive-none",
            cx.system_dark(),
        ));
    }
    for d in &archive.days {
        region = region.child(day(d, local, cx));
    }
    region
}
