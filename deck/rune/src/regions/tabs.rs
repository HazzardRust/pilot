//! The header's tab strip: Overview, then one tab per deck, each its code, name, open count and
//! ended mark as the view resolved them (`deck/view/tabs.mjs`), the chosen one in full ink. A press
//! asks the deck for that tab's view. The last tab, `+`, opens a box for a directory path whose Add
//! posts it as typed, trimmed, to `/add-deck`: the daemon alone checks it (deck-polish L4), and its
//! refusal is drawn beside the box, which keeps the path. Spacing is `theme::space`.

use rune::tok::{self, type_};
use rune::{Cx, El, TextEdit, col, row, text, text_input};
use serde::Deserialize;

use crate::act::Acted;
use crate::act_deck::DeckAction;
use crate::app::State;
use crate::client::{Client, Query, Result, View};
use crate::theme::{self, space};

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
        let reason = match acted {
            Acted::Refused { reason } => reason,
            Acted::Taken { location } => match param(&location, "refused") {
                Some(reason) => reason,
                None => {
                    self.adding = None;
                    self.refused = None;
                    return param(&location, "run");
                }
            },
        };
        self.refused = Some(reason);
        None
    }
}

/// The value of `name` in a Location's query, percent-decoded as `encodeURIComponent` wrote it.
fn param(location: &str, name: &str) -> Option<String> {
    let query = location.split_once('?')?.1.split('#').next()?;
    let value = query
        .split('&')
        .find_map(|pair| pair.strip_prefix(name)?.strip_prefix('='))?;
    let bytes = value.as_bytes();
    let (mut out, mut i) = (Vec::with_capacity(bytes.len()), 0);
    while i < bytes.len() {
        let hex = bytes
            .get(i + 1..i + 3)
            .and_then(|h| std::str::from_utf8(h).ok());
        match (bytes[i], hex.and_then(|h| u8::from_str_radix(h, 16).ok())) {
            (b'%', Some(byte)) => {
                out.push(byte);
                i += 3;
            }
            (byte, _) => {
                out.push(byte);
                i += 1;
            }
        }
    }
    Some(String::from_utf8_lossy(&out).into_owned())
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

/// Chooses a deck, `None` the overview: the window's query names it alone, the live reader is told,
/// and the view is read again for it by `fetch`. A view that cannot be read leaves the query and the
/// last view under the banner, as a chosen ticket does (`status::choose`).
pub fn select(s: &mut State, run: Option<String>, fetch: impl FnOnce(&Query) -> Result<View>) {
    let query = Query {
        run,
        all: s.query.all,
        ..Query::default()
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

/// Add: the typed path, trimmed and nothing else, posted by `act`; a blank box posts nothing, as the
/// page's required field does. A deck taken is selected, as the page lands on it.
pub fn add(s: &mut State, act: impl FnOnce(&DeckAction) -> Result<Acted>) {
    let local = &mut s.regions.tabs;
    let Some(path) = local
        .adding
        .as_ref()
        .map(|edit| edit.text.trim().to_string())
    else {
        return;
    };
    if path.is_empty() {
        return;
    }
    let landed = match act(&DeckAction::AddDeck { path }) {
        Ok(acted) => local.acted(acted),
        Err(err) => {
            local.refused = Some(err.to_string());
            None
        }
    };
    if let Some(run) = landed {
        select(s, Some(run), read_again);
    }
}

fn read_again(query: &Query) -> Result<View> {
    Client::from_env().and_then(|client| client.view(query))
}

fn act_on_deck(action: &DeckAction) -> Result<Acted> {
    Client::from_env().and_then(|client| client.act(action))
}

pub fn draw(v: &serde_json::Value, local: &Local, cx: &mut Cx<State>) -> El {
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
        let mut one = row()
            .key(format!("tab-{i}"))
            .role("button")
            .gap(space::within)
            .child(text(&tab.code).font(type_::TITLE).color(ink));
        if tab.name != tab.code {
            one = one.child(text(&tab.name).font(type_::BODY).color(ink));
        }
        if tab.ended {
            one = one.child(text("ended").font(type_::LABEL).color(t.text_secondary));
        }
        let run = tab.repo;
        strip.child(
            one.child(
                text(tab.count.to_string())
                    .font(type_::LABEL)
                    .color(t.text_secondary),
            )
            .on_press(move |s: &mut State| select(s, run.clone(), read_again)),
        )
    });
    let plus = row()
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
        .child(text("+").font(type_::TITLE).color(t.text_secondary));
    let header = col()
        .key("tabs-header")
        .gap(space::within)
        .child(strip.child(plus));
    let Some(edit) = &local.adding else {
        return header;
    };
    let path = text_input(edit, type_::BODY)
        .key("add-deck-path")
        .label("Directory path")
        .grow(1.0)
        .placeholder("Absolute path of a directory", k.quiet)
        .on_edit(|s: &mut State| s.regions.tabs.adding.get_or_insert_with(TextEdit::default))
        .on_submit(|s: &mut State, _| add(s, act_on_deck));
    let add_box = row()
        .key("add-deck")
        .gap(space::within)
        .child(path.color(t.text))
        .child(
            row()
                .key("add-deck-add")
                .role("button")
                .on_press(|s: &mut State| add(s, act_on_deck))
                .child(text("Add").font(type_::BODY).color(t.text)),
        );
    let mut header = header.child(add_box);
    if let Some(reason) = &local.refused {
        header = header.child(
            text(reason)
                .key("add-deck-refused")
                .role("alert")
                .font(type_::LABEL)
                .color(k.state.unacknowledged),
        );
    }
    header
}
