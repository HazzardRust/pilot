//! rune-deck-ui S16: the header. The usage figures band as the page's do, a tab press asks the deck
//! for that tab's view, and a refused add deck says why and keeps the typed path. The presses run
//! against a scratch daemon, never 4321.

mod support;

use pilot_deck::act::Acted;
use pilot_deck::app::{self, State};
use pilot_deck::client::View;
use pilot_deck::regions::tabs;
use pilot_deck::regions::usage::{self, Band};
use rune::{Env, Runtime, TextEdit};
use serde_json::{Value, json};

fn view_with(regions: &[(&str, Value)]) -> View {
    View {
        screen: "home".into(),
        seq: 99,
        regions: regions
            .iter()
            .map(|(name, region)| (name.to_string(), region.clone()))
            .collect(),
    }
}

fn frame(state: State) -> Runtime<State> {
    let mut rt = Runtime::new(state, app::view, (1280.0, 800.0), Env::new(true, 1.0));
    rt.frame(0.0);
    rt
}

fn texts(rt: &Runtime<State>) -> Vec<String> {
    rt.elements()
        .into_iter()
        .filter(|element| !element.exiting)
        .filter_map(|element| element.text)
        .collect()
}

fn press(rt: &mut Runtime<State>, key: &str) {
    let (x, y) = rt.find(key).unwrap_or_else(|| panic!("{key} is drawn"));
    rt.pointer_move(x, y);
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
    rt.frame(0.0);
}

#[test]
fn the_bands_are_the_pages() {
    assert_eq!(usage::band(0.0), Band::Fine);
    assert_eq!(usage::band(79.0), Band::Fine);
    assert_eq!(usage::band(80.0), Band::Warm);
    assert_eq!(usage::band(89.0), Band::Warm);
    assert_eq!(usage::band(90.0), Band::High);
    assert_eq!(usage::band(95.0), Band::Critical);
    assert_eq!(usage::band(100.0), Band::Critical);
}

#[test]
fn the_figures_are_the_views_and_a_missing_one_is_unknown() {
    let rt = frame(State {
        view: view_with(&[(
            "usage",
            json!({ "ctx": 19, "weekly": 91, "resets": "in 2 hrs" }),
        )]),
        ..State::default()
    });

    let shown = texts(&rt);
    for want in [
        "ctx",
        "19%",
        "session",
        "unknown",
        "resets in 2 hrs",
        "weekly",
        "91%",
    ] {
        assert!(shown.iter().any(|t| t == want), "no {want:?} in {shown:?}");
    }
}

fn two_decks(repo: &str) -> Value {
    json!({ "tabs": [
        { "code": "Overview", "name": "Overview", "count": 0, "selected": true },
        { "code": "D1", "name": "one", "repo": "C:/elsewhere/one", "count": 1 },
        { "code": "D2", "name": "two", "repo": repo, "count": 2, "ended": true },
    ] })
}

#[test]
fn a_tab_press_selects_its_deck() {
    let deck = support::Scratch::start();
    let repo = deck.dir.join("two").to_string_lossy().into_owned();
    let mut rt = support::live_window(&deck);
    rt.update(|s, _| s.view = view_with(&[("tabs", two_decks(&repo))]));
    rt.frame(0.0);

    press(&mut rt, "tab-2");

    assert_eq!(
        rt.state.query.run.as_deref(),
        Some(repo.as_str()),
        "the press set the query"
    );
    support::frame_until(&mut rt, "the live read for the deck", |rt| {
        rt.state.view.seq != 99
    });
    rt.frame(0.0);
    let shown = texts(&rt);
    assert!(
        !shown.iter().any(|t| t == "D1"),
        "the recorded tabs are gone, the scratch deck's view is drawn: {shown:?}"
    );
}

#[test]
fn the_overview_press_names_an_empty_run_so_the_deck_does_not_land_on_a_tab() {
    let mut rt = frame(State {
        view: view_with(&[("tabs", two_decks("C:/elsewhere/two"))]),
        query: pilot_deck::client::Query {
            run: Some("C:/elsewhere/one".into()),
            ..Default::default()
        },
        ..State::default()
    });

    press(&mut rt, "tab-0");

    // `?screen=home` alone lands on the one live deck; the page's `/?run=` is the overview.
    assert_eq!(rt.state.query.run.as_deref(), Some(""));
}

#[test]
fn a_refused_add_deck_says_why_and_keeps_the_path() {
    let mut local = tabs::Local {
        adding: Some(TextEdit::new("C:/no/such/dir")),
        ..tabs::Local::default()
    };

    local.acted(Acted::Refused {
        reason: "no directory at C:/no/such/dir".into(),
    });

    assert_eq!(
        local.refused.as_deref(),
        Some("no directory at C:/no/such/dir")
    );
    let typed = local.adding.as_ref().map(|edit| edit.text.as_str());
    assert_eq!(typed, Some("C:/no/such/dir"), "the typed path stays");
}

#[test]
fn the_daemons_refusal_of_a_typed_path_reaches_the_box() {
    let deck = support::Scratch::start();
    let missing = deck.dir.join("no such dir").to_string_lossy().into_owned();
    let client = support::client_for(&deck);
    let mut state = State::default();
    state.regions.tabs.adding = Some(TextEdit::new(format!("  {missing}  ")));

    tabs::add(&mut state, |action| client.act(action));

    let local = &state.regions.tabs;
    let reason = local.refused.as_deref().expect("the deck's reason is kept");
    assert!(
        !reason.is_empty() && !reason.contains("refused="),
        "{reason:?}"
    );
    let typed = local.adding.as_ref().map(|edit| edit.text.trim());
    assert_eq!(typed, Some(missing.as_str()), "the typed path stays");
    assert_eq!(state.query.run, None, "no deck is selected");
}
