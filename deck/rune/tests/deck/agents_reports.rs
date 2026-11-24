//! rune-deck-ui S14 (spec 2, 4, 6a): the Agents panel lists the view's roster with each agent's seconds
//! since its last tool call; the Reports panel lists the view's reports, one the user hid stays hidden and
//! the × hides one and keeps it across a restart (A4); and a heartbeat reaches the agents region within 1 s.

use crate::support;

use std::path::PathBuf;
use std::sync::Arc;
use std::sync::mpsc;
use std::time::{Duration, Instant};

use pilot_deck::app::State;
use pilot_deck::client::{Query, View};
use pilot_deck::live::{self, Feed};
use pilot_deck::prefs::Prefs;
use pilot_deck::regions;
use rune::{Cx, El, Env, Runtime, col};
use serde_json::{Value, json};
use support::{Scratch, secret};

fn panels(s: &State, cx: &mut Cx<State>) -> El {
    let none = Value::Null;
    let region = |name: &str| s.view.regions.get(name).unwrap_or(&none);
    col()
        .child(regions::agents::draw(
            region("agents"),
            &s.regions.agents,
            cx,
        ))
        .child(regions::reports::draw(region("reports"), &s.prefs, cx))
}

fn window(regions: Value, prefs: Prefs) -> Runtime<State> {
    let view = View {
        screen: "home".into(),
        seq: 1,
        regions: regions.as_object().expect("an object of regions").clone(),
    };
    let state = State {
        view,
        prefs,
        ..State::default()
    };
    let mut rt = Runtime::new(state, panels, (1280.0, 800.0), Env::new(true, 1.0));
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

fn reports() -> Value {
    json!({ "reports": [
        { "id": "itm_0000000000r1", "title": "First report", "href": "/thread/itm_0000000000r1", "at": null },
        { "id": "itm_0000000000r2", "title": "Second report", "href": "/thread/itm_0000000000r2", "at": null },
    ] })
}

#[test]
fn the_agents_are_the_views_roster_with_their_ages() {
    let rt = window(
        json!({ "agents": { "agents": [
            { "name": "Explore", "kind": "other", "since": "2026-11-20T12:00:00.000Z", "quietS": 5, "quiet": false },
            { "name": "pilot:pilot-qa", "kind": "qa", "since": "2026-11-20T12:00:00.000Z", "quietS": 45, "quiet": true },
        ] } }),
        Prefs::default(),
    );

    let shown = texts(&rt);

    for want in ["Explore", "5s", "pilot:pilot-qa", "45s"] {
        assert!(shown.iter().any(|t| t == want), "{want} drawn: {shown:?}");
    }
}

#[test]
fn an_empty_roster_says_so() {
    let rt = window(json!({ "agents": { "agents": [] } }), Prefs::default());

    assert!(texts(&rt).iter().any(|t| t == "no agents live"));
}

#[test]
fn a_hidden_report_stays_hidden() {
    let mut prefs = Prefs::default();
    prefs.hidden_reports.insert("itm_0000000000r1".into());

    let rt = window(json!({ "reports": reports() }), prefs);

    let shown = texts(&rt);
    assert!(!shown.iter().any(|t| t == "First report"), "{shown:?}");
    assert!(shown.iter().any(|t| t == "Second report"), "{shown:?}");
}

#[test]
fn an_open_report_is_marked_open_right_after_its_title() {
    let long = "A closing report whose title runs on far past the panel's width, ".repeat(4);
    let rt = window(
        json!({ "reports": { "reports": [
            { "id": "itm_0000000000r1", "title": "Short", "href": "/thread/itm_0000000000r1", "at": null, "open": true },
            { "id": "itm_0000000000r2", "title": long, "href": "/thread/itm_0000000000r2", "at": null, "open": true },
            { "id": "itm_0000000000r3", "title": "Closed", "href": "/thread/itm_0000000000r3", "at": null, "open": false },
        ] } }),
        Prefs::default(),
    );
    let rect = |key: &str| {
        rt.elements()
            .into_iter()
            .find(|e| e.key.as_deref() == Some(key))
            .unwrap_or_else(|| panic!("{key} is drawn"))
            .rect
    };

    for id in ["itm_0000000000r1", "itm_0000000000r2"] {
        let (open, hide) = (
            rect(&format!("report-{id}-open")),
            rect(&format!("report-{id}-hide")),
        );
        assert!(
            open[0] + open[2] <= hide[0] + 0.5,
            "{id}: open before the ×"
        );
        assert!(
            hide[0] + hide[2] <= 1280.5,
            "{id}: the × stays in the window"
        );
    }
    assert!(
        rect("report-itm_0000000000r1-open")[0] < rect("report-itm_0000000000r2-open")[0],
        "a short title's mark sits by its title, not at the row's end"
    );
    assert!(
        rt.find("report-itm_0000000000r3-open").is_none(),
        "a closed report has no mark"
    );
}

#[test]
fn every_report_hidden_says_so() {
    let mut prefs = Prefs::default();
    prefs.hidden_reports.insert("itm_0000000000r1".into());
    prefs.hidden_reports.insert("itm_0000000000r2".into());

    let rt = window(json!({ "reports": reports() }), prefs);

    assert!(texts(&rt).iter().any(|t| t == "all hidden"));
}

/// The press writes the prefs to `PILOT_DECK_DIR`, which a test of its own sets and clears.
use crate::support::ENV;

#[test]
fn the_x_hides_a_report_and_it_stays_hidden_after_a_restart() {
    let dir: PathBuf = std::env::temp_dir().join(format!("pilot-reports-x-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("a temp dir");
    let mut rt = window(json!({ "reports": reports() }), Prefs::default());
    let (x, y) = rt
        .find("report-itm_0000000000r1-hide")
        .expect("the × is drawn");

    {
        let _held = ENV.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        // SAFETY: only this test sets the environment, holding `ENV`.
        unsafe { std::env::set_var("PILOT_DECK_DIR", &dir) };
        rt.pointer_move(x, y);
        rt.frame(1.0 / 60.0);
        rt.pointer_down(x, y);
        rt.frame(1.0 / 60.0);
        rt.pointer_up(x, y);
        // Frames over a second of the window's clock, so a row leaving has left.
        for _ in 0..60 {
            rt.frame(1.0 / 60.0);
        }
        unsafe { std::env::remove_var("PILOT_DECK_DIR") };
    }

    let shown = texts(&rt);
    assert!(!shown.iter().any(|t| t == "First report"), "{shown:?}");
    assert!(shown.iter().any(|t| t == "Second report"), "{shown:?}");
    assert!(
        Prefs::load(&dir)
            .hidden_reports
            .contains("itm_0000000000r1"),
        "kept for the next window"
    );
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn a_heartbeat_puts_the_agent_in_the_agents_region_within_a_second() {
    let deck = Scratch::start();
    let repo = deck.dir.join("work");
    std::fs::create_dir_all(&repo).expect("a directory");
    let repo = repo.to_str().expect("a utf-8 path").to_string();
    ureq::post(format!("{}/api/runs", deck.url))
        .header("Authorization", format!("Bearer {}", secret(&deck)))
        .send_json(json!({ "repo": repo, "pid": deck.pid }))
        .expect("the run registers");
    let client = support::client_for(&deck);
    let (woke, wakes) = mpsc::channel();
    let inbox = live::start(
        client,
        Query {
            run: Some(repo.clone()),
            ..Query::default()
        },
        Arc::new(move || {
            let _ = woke.send(());
        }),
    );
    // The reader's first view comes once it is listening, so the heartbeat is heard.
    wakes
        .recv_timeout(Duration::from_secs(5))
        .expect("a first view");
    let _ = inbox.take();

    let sent = Instant::now();
    deck.heartbeat("agent-live-1", &repo);
    let named = loop {
        let left = Duration::from_secs(1)
            .checked_sub(sent.elapsed())
            .expect("the agent in the agents region within 1 s");
        wakes
            .recv_timeout(left)
            .expect("the agent in the agents region within 1 s");
        if let Some(Feed::View(view)) = inbox.take() {
            let agents = view.regions["agents"]["agents"].as_array().cloned();
            if let Some(one) = agents.and_then(|all| all.first().cloned()) {
                break one["name"].as_str().expect("a name").to_string();
            }
        }
    };
    eprintln!(
        "a heartbeat reaches the agents region: {:?}",
        sent.elapsed()
    );

    assert_eq!(named, "Explore");
}
