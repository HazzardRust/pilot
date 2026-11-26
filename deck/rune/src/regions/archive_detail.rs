//! A row's detail on the archive screen (archive-page spec 2, 6; A3): `deck/view/archive-detail.mjs` joins
//! the ticket, its thread, its plan and its closing report; this file only draws them, as named fields and
//! `rune-kit`'s `Markdown` (Rune L8), never raw JSON. Back asks for the same screen without the `id`, so the
//! list draws again; nothing here opens a thread, whose GET would clear a notice.

use rune::tok;
use rune::{Cx, El, ScrollSpec, col, row, text};
use serde::Deserialize;

use crate::app::{State, go};
use crate::client::Query;
use crate::theme::{self, space, type_};

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct Field {
    pub label: String,
    pub value: String,
    /// The view's flag for a field whose value is Markdown (spec 6), drawn through `theme::markdown`.
    pub markdown: bool,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct Reply {
    pub who: String,
    pub at: String,
    pub body: String,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct Report {
    pub title: String,
    pub body: String,
}

/// The view's `archiveDetail` region.
#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct Detail {
    pub id: String,
    pub title: String,
    pub kind: String,
    pub fields: Vec<Field>,
    pub replies: Vec<Reply>,
    pub plan: Option<Vec<Field>>,
    pub report: Option<Report>,
}

impl Detail {
    /// The region as the view served it; None for null, not yet loaded, or a shape it cannot be read as.
    pub fn of(v: &serde_json::Value) -> Option<Detail> {
        v.is_object().then(|| Detail::deserialize(v).ok()).flatten()
    }
}

/// Back: the same screen without the row's id, which draws the list.
fn to_list(s: &mut State) {
    let query = Query {
        screen: "archive".into(),
        id: None,
        ..s.query.clone()
    };
    go(s, query);
}

/// A list's `label value` lines, every label in one column `label_w` wide, so every value starts at one x
/// (S19); each value keyed `archive-detail-<name>-<i>`.
fn fields(list: &[Field], name: &str, label_w: f32, cx: &mut Cx<State>) -> El {
    let dark = cx.system_dark();
    let (t, ui) = (theme::tokens(dark), tok::theme(dark));
    list.iter()
        .enumerate()
        .fold(col().gap(space::within), |out, (i, f)| {
            // Beside its label a value takes the row's rest and wraps there, never its own full width.
            let value = if f.markdown {
                theme::markdown(f.value.clone(), dark)
            } else {
                theme::content(text(&f.value).font(type_::BODY).color(ui.text).wrap(), dark)
            };
            out.child(
                row()
                    .gap(space::between)
                    .child(
                        text(&f.label)
                            .font(type_::CAPTION)
                            .color(t.quiet)
                            .w(label_w),
                    )
                    .child(
                        value
                            .key(format!("archive-detail-{name}-{i}"))
                            .grow(1.0)
                            .min_w(space::s0),
                    ),
            )
        })
}

/// The label column's width: the longest label of the detail's fields and its plan's, in caption `ch`.
fn label_width(d: &Detail) -> f32 {
    let longest = d
        .fields
        .iter()
        .chain(d.plan.iter().flatten())
        .map(|f| f.label.chars().count())
        .max()
        .unwrap_or(0);
    longest as f32 * crate::regions::archive::ch()
}

fn heading(words: &str, cx: &mut Cx<State>) -> El {
    let dark = cx.system_dark();
    text(words)
        .font(type_::CAPTION)
        .color(theme::tokens(dark).quiet)
}

pub fn draw(detail: &Option<Detail>, cx: &mut Cx<State>) -> El {
    let dark = cx.system_dark();
    let ui = tok::theme(dark);
    let back_button = theme::control(text("Back"), dark)
        .key("archive-back")
        .role("button")
        .font(type_::BODY)
        .color(ui.text)
        .on_press(to_list);
    let mut region = col()
        .key("archive-detail")
        .w_full()
        .grow(1.0)
        .min_h(space::s0)
        .gap(space::between)
        .scroll(ScrollSpec {
            stick_bottom: false,
        })
        .child(back_button);
    // Not yet loaded, or an id that is no archive row: Back alone, rather than claiming the record is empty.
    let Some(d) = detail else {
        return region;
    };
    region = region
        .child(theme::content(
            text(&d.title).font(type_::BODY).color(ui.text).wrap(),
            dark,
        ))
        .child(fields(&d.fields, "field", label_width(d), cx));
    if let Some(plan) = &d.plan {
        region = region
            .child(heading("Plan", cx))
            .child(fields(plan, "plan", label_width(d), cx));
    }
    if !d.replies.is_empty() {
        region = region.child(heading("Thread", cx));
        for r in &d.replies {
            region = region.child(
                col()
                    .gap(space::within)
                    .child(heading(&format!("{} · {}", r.who, r.at), cx))
                    .child(theme::markdown(r.body.clone(), dark)),
            );
        }
    }
    if let Some(report) = &d.report {
        region = region
            .child(heading("Closing report", cx))
            .child(theme::content(
                text(&report.title).font(type_::BODY).color(ui.text).wrap(),
                dark,
            ))
            .child(theme::markdown(report.body.clone(), dark));
    }
    region
}
