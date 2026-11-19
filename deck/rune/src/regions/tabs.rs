//! The header's tab strip: Overview, then one tab per deck, each its code, name and open count as
//! the view resolved them (`deck/view/tabs.mjs`). Spacing is `theme::space`; colours are rune's
//! until a slice draws them from `theme`.

use rune::tok::{self, type_};
use rune::{Cx, El, row, text};
use serde::Deserialize;

use crate::app::State;
use crate::theme::space;

#[derive(Debug, Default)]
pub struct Local;

#[derive(Debug, Deserialize)]
struct Tab {
    code: String,
    name: String,
    count: u64,
    #[serde(default)]
    ended: bool,
    #[serde(default)]
    selected: bool,
}

#[derive(Debug, Default, Deserialize)]
struct Tabs {
    #[serde(default)]
    tabs: Vec<Tab>,
}

pub fn draw(v: &serde_json::Value, _: &Local, cx: &mut Cx<State>) -> El {
    // A region the view cannot be read as draws empty rather than taking the window down.
    let tabs = Tabs::deserialize(v).unwrap_or_default().tabs;
    let t = tok::theme(cx.system_dark());
    let strip = row().key("tabs").role("tablist").gap(space::between);
    tabs.iter().enumerate().fold(strip, |strip, (i, tab)| {
        let ink = if tab.selected {
            t.text
        } else {
            t.text_secondary
        };
        let mut one = row()
            .key(format!("tab-{i}"))
            .role("tab")
            .gap(space::within)
            .child(text(&tab.code).font(type_::TITLE).color(ink));
        if tab.name != tab.code {
            one = one.child(text(&tab.name).font(type_::BODY).color(ink));
        }
        if tab.ended {
            one = one.child(text("ended").font(type_::LABEL).color(t.text_secondary));
        }
        strip.child(
            one.child(
                text(tab.count.to_string())
                    .font(type_::LABEL)
                    .color(t.text_secondary),
            ),
        )
    })
}
