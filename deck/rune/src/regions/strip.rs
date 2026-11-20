//! The right strip, as the page's (`renderEverything`, `deck/ui/render-strip.mjs`): the Open/All
//! toggle, Create (a name, then a confirm that names the deck), Start or Resume and Close on an ended
//! tab, each confirmed in place, and Weekly alerts. Every press posts the form the page's control
//! posts (`DeckAction`); the repository is the view's, never built here, and no process is started
//! from Rust: Start asks the daemon, which owns the start and its guard.

use rune::tok::type_;
use rune::{Cx, El, Key, TextEdit, col, row, text, text_input};
use serde::Deserialize;

use crate::act::{self, Acted, Pending};
use crate::act_deck::DeckAction;
use crate::app::State;
use crate::client::{Query, Result};
use crate::regions::notifications::open_thread;
use crate::theme::{self, space};

/// The confirm-in-place a Start or a Close press is showing.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Ask {
    Start,
    Close,
}

#[derive(Debug, Default)]
pub struct Local {
    /// Create's name, while Create is open.
    pub naming: Option<TextEdit>,
    /// Create's second step: the name is checked and the confirm is showing.
    pub sure: bool,
    /// On the overview, which of the numbered decks the confirm has chosen.
    pub repo: usize,
    pub asking: Option<Ask>,
    /// The deck's own words for the last press it refused.
    pub refused: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Tab {
    repo: String,
    code: String,
}

#[derive(Debug, Deserialize)]
struct Choice {
    repo: String,
    label: String,
}

#[derive(Debug, Default, Deserialize)]
struct Create {
    #[serde(default)]
    repos: Option<Vec<Choice>>,
}

#[derive(Debug, Deserialize)]
struct Alerts {
    weekly: bool,
}

/// The way to the items page, with the open queue's count; `here` on that page, where it leads back.
#[derive(Debug, Deserialize)]
struct Items {
    count: usize,
    here: bool,
}

#[derive(Debug, Deserialize)]
struct Strip {
    all: bool,
    #[serde(default)]
    items: Option<Items>,
    #[serde(default)]
    tab: Option<Tab>,
    #[serde(default)]
    create: Create,
    #[serde(default)]
    start: Option<String>,
    close: bool,
    alerts: Alerts,
    #[serde(rename = "sessionRefused", default)]
    session_refused: Option<String>,
}

/// The name as the daemon takes it (`THREAD_NAME`, `deck/store-runs.mjs`): trimmed, then 1 to 60
/// letters, digits, spaces, `_` or `-`. Never looser: what passes here the daemon takes.
pub fn checked(name: &str) -> Option<&str> {
    let name = name.trim();
    let plain = |c: char| c.is_ascii_alphanumeric() || matches!(c, ' ' | '_' | '-');
    (!name.is_empty() && name.len() <= 60 && name.chars().all(plain)).then_some(name)
}

impl Local {
    fn name(&self) -> Option<&str> {
        self.naming.as_ref().and_then(|edit| checked(&edit.text))
    }

    pub fn can_next(&self) -> bool {
        self.name().is_some()
    }

    /// Next: the confirm shows only for a name the daemon would take.
    pub fn next(&mut self) {
        self.sure = self.can_next();
    }

    /// The confirm's Create: the `Create` the page's form posts, once the name has passed Next.
    pub fn confirm(&self, repo: &str) -> Option<DeckAction> {
        let name = self.name().filter(|_| self.sure)?;
        Some(DeckAction::Create {
            name: name.to_string(),
            repo: repo.to_string(),
        })
    }

    /// Cancel, or Escape: Create closes and any ask is taken back.
    pub fn cancel(&mut self) {
        *self = Local::default();
    }
}

/// Moves the window to `query` and tells the live reader.
fn go(s: &mut State, query: Query) {
    if let Some(live) = &s.live {
        live.ask(&query);
    }
    s.query = query;
}

/// Open/All: the page's toggle link, the same screen with `all` flipped.
pub fn toggle(s: &mut State) {
    let query = Query {
        all: !s.query.all,
        ..s.query.clone()
    };
    go(s, query);
}

/// Items: the items page, or from it the home screen of the scope it was left from.
pub fn items_page(s: &mut State) {
    let screen = if s.query.screen == "items" {
        "home"
    } else {
        "items"
    };
    let query = Query {
        screen: screen.into(),
        id: None,
        ..s.query.clone()
    };
    go(s, query);
}

/// The `act::send` keys of the strip's writes, each its control's own key.
const CREATE: &str = "strip-confirm";
const ALERTS: &str = "strip-alerts";

/// The key a Start or Close post goes under.
fn session_key(ask: Ask) -> &'static str {
    match ask {
        Ask::Start => "strip-start",
        Ask::Close => "strip-close",
    }
}

/// Create's confirm: posts through `act::send`; the answer comes back through `answered`.
pub fn create(s: &mut State, repo: &str) {
    if let Some(action) = s.regions.strip.confirm(repo) {
        act::send(&mut s.pending, CREATE, action);
    }
}

/// Start or Close pressed on `repo`: the first press asks, the Confirm posts. A Start the daemon
/// refuses lands with its reason in the Location (`landRefusal`), said in `answered` in its words;
/// a Close taken lands on the overview, as the page's does.
pub fn session(s: &mut State, ask: Ask, repo: &str) {
    let local = &mut s.regions.strip;
    if local.asking != Some(ask) {
        local.asking = Some(ask);
        local.refused = None;
        return;
    }
    local.asking = None;
    let action = match ask {
        Ask::Start => DeckAction::StartSession { repo: repo.into() },
        Ask::Close => DeckAction::RemoveDeck { repo: repo.into() },
    };
    act::send(&mut s.pending, session_key(ask), action);
}

/// The deck's answer to a write sent from here. Create taken: the new thread is the next screen;
/// refused, the name stays beside the deck's words. A Close taken goes to the overview.
pub fn answered(s: &mut State, key: &str, acted: &Result<Acted>) {
    let ask = [Ask::Start, Ask::Close]
        .into_iter()
        .find(|ask| session_key(*ask) == key);
    match (key, ask, acted) {
        (CREATE, _, Ok(Acted::Taken { location })) => {
            s.regions.strip.cancel();
            // An item id is `itm_` and hex; anything else in the Location opens nothing.
            let id = location.strip_prefix("/thread/").filter(|id| {
                !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
            });
            if let Some(id) = id {
                open_thread(s, id);
            }
        }
        (_, Some(ask), Ok(taken @ Acted::Taken { .. })) => {
            s.regions.strip.refused = taken.param("sessionRefused");
            if ask == Ask::Close && s.regions.strip.refused.is_none() {
                go(s, Query::default());
            }
        }
        (CREATE, ..) | (_, Some(_), _) | (ALERTS, ..) => {
            s.regions.strip.refused = act::refusal(acted);
        }
        _ => {}
    }
}

/// The strip's one column: every button and box is this wide, on the 4/8 grid.
const WIDTH: f32 = space::s8 * 3.0;

/// How a button is dressed (DESIGN.md §1): colour marks a state that needs attention, never a setting.
#[derive(Clone, Copy, PartialEq)]
enum Look {
    /// A hairline and the page's own ink.
    Quiet,
    /// The one action that goes ahead: the primary role.
    Primary,
    /// The choice made, in a neutral tint of the text colour: a tint, never a hue.
    Picked,
}

/// A press-shaped label, one column wide, with a 12 px label and 4x8 padding. Only an enabled button
/// says clickable: a disabled one takes no hover tint and no pointer cursor.
fn button(label: &str, key: &str, look: Look, off: bool, dark: bool) -> El {
    let (r, k) = (theme::roles(dark), theme::tokens(dark));
    let ink = if look == Look::Primary {
        r.surface
    } else {
        r.on_surface
    };
    let face = row()
        .key(key)
        .role("button")
        .label(label)
        .px(space::s3)
        .py(space::s2)
        .items_center()
        .justify_center()
        .child(text(label).font(type_::LABEL).color(ink));
    let face = match look {
        Look::Quiet => face.border(1.0, k.rule),
        Look::Primary => face.fill(r.primary),
        Look::Picked => face.fill(r.on_surface.alpha(theme::opacity::picked)).border(1.0, k.rule),
    };
    if off {
        face.radius(theme::radius::button)
            .opacity(theme::opacity::disabled)
            .disabled(true)
    } else {
        theme::control(face, dark)
    }
}

/// A boxed group, the page's popout (`form.confirm`, deck.css:841): a hairline round it, 8 px in.
fn boxed(dark: bool) -> El {
    col()
        .items_stretch()
        .gap(space::s3)
        .padding(space::s3)
        .border(1.0, theme::tokens(dark).rule)
        .radius(theme::radius::button)
}

pub fn draw(v: &serde_json::Value, local: &Local, pending: &Pending, cx: &mut Cx<State>) -> El {
    // No strip on this screen, or a view it cannot read: nothing, rather than taking the window down.
    let Ok(strip) = Strip::deserialize(v) else {
        return rune::el();
    };
    let dark = cx.system_dark();
    let (r, k) = (theme::roles(dark), theme::tokens(dark));
    let btn = |label: &str, key: &str, look: Look| button(label, key, look, false, dark);
    // A control whose write is out is drawn disabled until the deck answers.
    let sent_btn = |label: &str, key: &str, post: &str, look: Look| {
        button(label, key, look, pending.is_sent(post), dark)
    };
    let say = |words: String| text(words).font(type_::LABEL).color(r.on_surface).w_full();

    let mut out = col()
        .key("strip")
        .items_stretch()
        // One column: every control the same width, on the grid, a stack with no floating gaps.
        .w(WIDTH)
        .gap(space::s3)
        .on_key(|s: &mut State, ev: &rune::KeyEvent, _: &mut rune::Tx| {
            let local = &mut s.regions.strip;
            let open = local.naming.is_some() || local.asking.is_some();
            if matches!(ev.key, Key::Escape) && open {
                local.cancel();
            }
            matches!(ev.key, Key::Escape) && open
        })
        .child(
            btn(
                if strip.all { "All" } else { "Open" },
                "strip-toggle",
                Look::Quiet,
            )
            .on_press(toggle),
        );
    if let Some(items) = &strip.items {
        let label = if items.here {
            "Back".to_string()
        } else {
            format!("Items {}", items.count)
        };
        out = out.child(btn(&label, "strip-items", Look::Quiet).on_press(items_page));
    }

    // Create: the tab's repository, or on the overview the deck the confirm has chosen.
    let repos = strip.create.repos.unwrap_or_default();
    let target = match &strip.tab {
        Some(tab) => Some(tab.repo.clone()),
        None => repos.get(local.repo).map(|choice| choice.repo.clone()),
    };
    let mut making = col().key("strip-create-group").items_stretch();
    match &local.naming {
        None => {
            making = making.child(btn("Create", "strip-create", Look::Quiet).on_press(
                |s: &mut State| {
                    s.regions.strip.cancel();
                    s.regions.strip.naming = Some(TextEdit::default());
                },
            ));
        }
        Some(edit) if !local.sure => {
            let mut next = button("Next", "strip-next", Look::Primary, !local.can_next(), dark);
            if local.can_next() {
                next = next.on_press(|s: &mut State| s.regions.strip.next());
            }
            making = boxed(dark)
                .key("strip-create-group")
                .child(
                    text_input(edit, type_::BODY)
                        .key("strip-name")
                        .label("Thread name")
                        .placeholder("Name the thread", k.quiet)
                        .on_edit(|s: &mut State| {
                            s.regions.strip.naming.get_or_insert_with(TextEdit::default)
                        })
                        .padding(space::pad)
                        .fill(k.rule),
                )
                .child(next)
                .child(
                    btn("Cancel", "strip-cancel", Look::Quiet)
                        .on_press(|s: &mut State| s.regions.strip.cancel()),
                );
        }
        Some(_) => {
            let name = local.name().unwrap_or_default();
            let on = match &strip.tab {
                Some(tab) => format!("on {}?", tab.code),
                None => "on which deck?".into(),
            };
            making = boxed(dark)
                .key("strip-create-group")
                .child(say(format!("Open “{name}” {on}")));
            for (i, choice) in repos.iter().enumerate() {
                let look = if i == local.repo {
                    Look::Picked
                } else {
                    Look::Quiet
                };
                making = making.child(
                    btn(&choice.label, &format!("strip-repo-{i}"), look)
                        .on_press(move |s: &mut State| s.regions.strip.repo = i),
                );
            }
            let mut confirm = sent_btn("Create", CREATE, CREATE, Look::Primary);
            if let Some(repo) = target.filter(|_| !pending.is_sent(CREATE)) {
                confirm = confirm.on_press(move |s: &mut State| create(s, &repo));
            }
            making = making.child(confirm).child(
                btn("Cancel", "strip-cancel", Look::Quiet)
                    .on_press(|s: &mut State| s.regions.strip.cancel()),
            );
        }
    }
    out = out.child(making);

    // Start or Resume, then Close: an ended tab's, each asking first, as the page's confirm rows do.
    if let Some(tab) = &strip.tab {
        let verb = match strip.start.as_deref() {
            Some("resume") => Some("Resume"),
            Some("start") => Some("Start"),
            _ => None,
        };
        let controls = verb
            .map(|verb| (Ask::Start, verb, "strip-start", "A terminal window opens running the pilot."))
            .into_iter()
            .chain(strip.close.then_some((
                Ask::Close,
                "Close",
                "strip-close",
                "Its open items are archived and its tab leaves the strip; nothing is deleted, and they still list under Everything.",
            )));
        for (ask, verb, key, what) in controls {
            let asking = local.asking == Some(ask);
            let (repo, again) = (tab.repo.clone(), tab.repo.clone());
            let busy = pending.is_sent(key);
            let look = if asking { Look::Picked } else { Look::Quiet };
            let mut face = sent_btn(verb, key, key, look);
            if !busy {
                face = face.on_press(move |s: &mut State| session(s, ask, &repo));
            }
            let mut group = col().gap(space::s3).items_stretch().child(face);
            if asking {
                group = group.child(
                    boxed(dark)
                        .child(say(format!("{verb} {}? {what}", tab.code)))
                        .child(
                            sent_btn("Confirm", &format!("{key}-confirm"), key, Look::Primary)
                                .on_press(move |s: &mut State| session(s, ask, &again)),
                        ),
                );
            }
            out = out.child(group);
        }
    }
    if let Some(reason) = local.refused.as_ref().or(strip.session_refused.as_ref()) {
        out = out.child(
            text(reason)
                .key("strip-refused")
                .role("alert")
                .font(type_::LABEL)
                .color(r.error)
                .w_full(),
        );
    }

    // A binary setting: a switch, said in its words and its checked state, never in a colour.
    let on = strip.alerts.weekly;
    let mut alerts = sent_btn(
        &format!("Weekly alerts {}", if on { "on" } else { "off" }),
        ALERTS,
        ALERTS,
        Look::Quiet,
    )
    .role("switch")
    .checked(on)
    .label("Warn agents at 95% of the weekly limit");
    if !pending.is_sent(ALERTS) {
        // Taken, the live reader brings the flipped switch; refused, `answered` says the deck's words.
        alerts = alerts.on_press(move |s: &mut State| {
            act::send(&mut s.pending, ALERTS, DeckAction::Alerts { weekly: !on });
        });
    }
    out.child(alerts)
}
