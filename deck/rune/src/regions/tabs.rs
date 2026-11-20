//! The header's tab strip: Overview, then one tab per deck, each its code, name, open count and
//! ended mark as the view resolved them (`deck/view/tabs.mjs`), the chosen one in full ink. A press
//! asks the deck for that tab's view. The last tab, `+`, opens a box for a directory path whose Add
//! posts it as typed, trimmed, to `/add-deck`: the daemon alone checks it (deck-polish L4), and its
//! refusal is drawn beside the box, which keeps the path. Spacing is `theme::space`.

use crate::theme::type_;
use rune::tok;
use rune::{Cx, El, TextEdit, col, row, text, text_input};
use serde::Deserialize;

use crate::act::{self, Acted, Pending};
use crate::act_deck::DeckAction;
use crate::app::{State, go};
use crate::client::{Query, Result};
use crate::theme::{self, space};

/// The `act::send` key of the add-deck box's Add, which is also its button's.
const ADD: &str = "add-deck-add";

/// The add-deck box: the path being typed while it is open, and the deck's word on the last refusal.
#[derive(Debug, Default)]
pub struct Local {
    pub adding: Option<TextEdit>,
    pub refused: Option<String>,
}

impl Local {
    /// The deck's answer to an add. `/add-deck` answers a refusal as a 303 carrying `refused`, as a
    /// navigation lands; either way the box keeps the path beside the reason. Taken closes the box
    /// and answers the deck it landed on.
    pub fn acted(&mut self, acted: Acted) -> Option<String> {
        let reason = match &acted {
            Acted::Refused { reason } => reason.clone(),
            Acted::Taken { .. } => match acted.param("refused") {
                Some(reason) => reason,
                None => {
                    self.adding = None;
                    self.refused = None;
                    return acted.param("run");
                }
            },
        };
        // A refusal with no words is still a refusal, never a blank line.
        self.refused = Some(if reason.trim().is_empty() {
            "the deck refused that path".into()
        } else {
            reason
        });
        None
    }
}

#[derive(Debug, Deserialize)]
struct Tab {
    code: String,
    name: String,
    /// The deck a press asks for; none on the overview.
    #[serde(default)]
    repo: Option<String>,
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

/// Chooses a deck, `None` the overview: the window's query names it alone and the live reader is
/// asked for its view off the UI thread, as an opened thread is (`notifications::open_thread`).
/// The overview is an empty `run`, as the page's `/?run=` is: with no `run` the deck lands on its
/// one live tab.
pub fn select(s: &mut State, run: Option<String>) {
    let query = Query {
        run: Some(run.unwrap_or_default()),
        all: s.query.all,
        ..Query::default()
    };
    go(s, query);
}

/// Add: the typed path, trimmed and nothing else, posted through `act::send`; a blank box posts
/// nothing, as the page's required field does. The answer comes back through `answered`.
pub fn add(s: &mut State) {
    let path = s
        .regions
        .tabs
        .adding
        .as_ref()
        .map(|edit| edit.text.trim().to_string())
        .filter(|path| !path.is_empty());
    if let Some(path) = path {
        act::send(&mut s.pending, ADD, DeckAction::AddDeck { path });
    }
}

/// The deck's answer to an add: a deck taken is selected, as the page lands on it.
pub fn answered(s: &mut State, key: &str, acted: &Result<Acted>) {
    if key != ADD {
        return;
    }
    let local = &mut s.regions.tabs;
    let landed = match acted {
        Ok(acted) => local.acted(acted.clone()),
        Err(err) => {
            local.refused = Some(err.to_string());
            None
        }
    };
    if let Some(run) = landed {
        select(s, Some(run));
    }
}

pub fn draw(v: &serde_json::Value, local: &Local, pending: &Pending, cx: &mut Cx<State>) -> El {
    // A region the view cannot be read as draws empty rather than taking the window down.
    let tabs = Tabs::deserialize(v).unwrap_or_default().tabs;
    let dark = cx.system_dark();
    let (t, k) = (tok::theme(dark), theme::tokens(dark));
    // The page's `<nav>` of links, and buttons in it: rune's `tab` role takes no pointer press.
    let strip = row().key("tabs").role("navigation").gap(space::between);
    let strip = tabs.into_iter().enumerate().fold(strip, |strip, (i, tab)| {
        let ink = if tab.selected {
            t.text
        } else {
            t.text_secondary
        };
        let mut one = theme::control(row(), dark)
            .key(format!("tab-{i}"))
            .role("button")
            .gap(space::within)
            .child(text(&tab.code).font(type_::HEADER.mono()).color(ink));
        if tab.name != tab.code {
            one = one.child(text(&tab.name).font(type_::BODY).color(ink));
        }
        if tab.ended {
            one = one.child(text("ended").font(type_::CAPTION).color(t.text_secondary));
        }
        if tab.selected {
            // deck.css's `.runs-strip a[aria-current]`: the chosen tab is underlined, not only inked.
            one = one.border_sides([0.0, 0.0, 1.0, 0.0], ink);
        }
        let run = tab.repo;
        strip.child(
            one.child(
                text(tab.count.to_string())
                    .font(type_::CAPTION)
                    .color(t.text_secondary),
            )
            .on_press(move |s: &mut State| select(s, run.clone())),
        )
    });
    let plus = theme::control(row(), dark)
        .key("tab-add")
        .role("button")
        .label("Add a deck by path")
        .on_press(|s: &mut State| {
            let local = &mut s.regions.tabs;
            local.adding = match local.adding.take() {
                Some(_) => None,
                None => Some(TextEdit::default()),
            };
            local.refused = None;
        })
        .child(text("+").font(type_::HEADER).color(t.text_secondary));
    // deck.css's `header`: a hairline under the tabs.
    let header = col()
        .key("tabs-header")
        .gap(space::within)
        .child(strip.child(plus));
    let Some(edit) = &local.adding else {
        return header.child(theme::separator(dark));
    };
    let path = text_input(edit, type_::BODY)
        .key("add-deck-path")
        .label("Directory path")
        .grow(1.0)
        .placeholder("Absolute path of a directory", k.quiet)
        .on_edit(|s: &mut State| s.regions.tabs.adding.get_or_insert_with(TextEdit::default))
        .on_submit(|s: &mut State, _| add(s));
    let mut add_button = theme::control(row(), dark)
        .key(ADD)
        .role("button")
        .child(text("Add").font(type_::BODY).color(t.text));
    add_button = if pending.is_sent(ADD) {
        add_button.disabled(true)
    } else {
        add_button.on_press(add)
    };
    let add_box = row()
        .key("add-deck")
        .gap(space::within)
        .child(path.color(t.text))
        .child(add_button);
    let mut header = header.child(add_box);
    if let Some(reason) = &local.refused {
        header = header.child(theme::content(
            text(reason)
                .key("add-deck-refused")
                .role("alert")
                .font(type_::CAPTION)
                .color(k.state.unacknowledged),
            dark,
        ));
    }
    header.child(theme::separator(dark))
}
