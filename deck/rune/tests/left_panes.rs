//! rune-deck-ui S31 (spec 17): the left panes' rows sit on the side-bar grid (`size::row` tall, an
//! 8 px indent, 12 px right padding), their content text selects while link and button labels do
//! not, and deck.css's list hairlines are copied (none after the last item).

use pilot_deck::app::State;
use pilot_deck::client::View;
use pilot_deck::prefs::Prefs;
use pilot_deck::regions;
use pilot_deck::theme::{self, space};
use rune::runtime::ElementInfo;
use rune::{Cursor, Cx, El, Env, Runtime, col};
use serde_json::{Value, json};

const REPO: &str = "C:/work/alpha";

fn panels(s: &State, cx: &mut Cx<State>) -> El {
    let none = Value::Null;
    let region = |name: &str| s.view.regions.get(name).unwrap_or(&none);
    col()
        .child(regions::notifications::draw(
            region("notifications"),
            &s.prefs,
            &s.regions.notifications,
            &s.pending,
            cx,
        ))
        .child(regions::agents::draw(
            region("agents"),
            &s.regions.agents,
            cx,
        ))
        .child(regions::reports::draw(region("reports"), &s.prefs, cx))
        .child(regions::tickets::draw(
            region("tickets"),
            &s.regions.tickets,
            &s.prefs,
            &s.pending,
            cx,
        ))
        .child(regions::status::draw(
            region("status"),
            &s.regions.status,
            cx,
        ))
        .child(regions::graph::draw(region("graph"), &s.regions.graph, cx))
        .child(regions::chat::draw(region("chat"), &s.regions.chat, cx))
}

fn window() -> Runtime<State> {
    let regions = json!({
        "notifications": { "notices": [
            { "id": "itm_n1", "title": "First notice" },
            { "id": "itm_n2", "title": "Second notice" },
        ], "open": [] },
        "agents": { "agents": [
            { "name": "Explore", "quietS": 5, "quiet": false },
        ] },
        "reports": { "reports": [
            { "id": "itm_r1", "title": "First report" },
            { "id": "itm_r2", "title": "Second report" },
        ] },
        "tickets": { "repo": REPO, "groups": [
            { "colour": "red", "label": "Red", "rows": [
                { "id": "itm_t1", "name": "First ticket", "state": "queued", "canMove": { "up": false, "down": true } },
                { "id": "itm_t2", "name": "Second ticket", "state": "queued", "canMove": { "up": true, "down": false } },
            ] },
        ] },
        "status": { "tickets": [], "rows": [
            { "slice": "S1", "state": "implementing", "branch": "slice/s1", "pr": 7, "after": [] },
            { "slice": "S2", "state": "merged", "after": [] },
        ], "groups": [] },
        "graph": { "lanes": 1, "dots": [
            { "slice": "S1 the base", "lane": 0, "row": 0, "state": "done" },
            { "slice": "S2 the next", "lane": 0, "row": 1, "state": "doing" },
        ], "edges": [{ "from": 0, "to": 1, "lane": 0 }] },
        "chat": { "id": "itm_chat", "messages": [
            { "by": "pilot", "at": "12:00", "text": "Words from the pilot" },
        ] },
    });
    let mut prefs = Prefs::default();
    prefs
        .folds
        .entry(REPO.into())
        .or_default()
        .insert("red".into());
    let state = State {
        view: View {
            screen: "home".into(),
            seq: 1,
            regions: regions.as_object().expect("regions").clone(),
        },
        prefs,
        ..State::default()
    };
    let mut rt = Runtime::new(state, panels, (1280.0, 1400.0), Env::new(true, 1.0));
    rt.frame(0.0);
    rt
}

fn by_key(all: &[ElementInfo], key: &str) -> Option<usize> {
    all.iter()
        .position(|e| e.key.as_deref() == Some(key) && !e.exiting)
}

fn with_text(rt: &Runtime<State>, said: &str) -> ElementInfo {
    rt.elements()
        .into_iter()
        .find(|e| e.text.as_deref().is_some_and(|t| t.contains(said)))
        .unwrap_or_else(|| panic!("no text containing {said:?}"))
}

fn cursor_over(rt: &mut Runtime<State>, e: &ElementInfo) -> Cursor {
    let [x, y, w, h] = e.visible;
    rt.pointer_move(x + w / 2.0, y + h / 2.0);
    rt.frame(1.0 / 60.0);
    rt.cursor()
}

#[test]
fn rows_sit_on_the_grid() {
    let rt = window();
    let all = rt.elements();
    for key in [
        "notice-0",
        "agent-0",
        "report-itm_r1",
        "ticket-itm_t1",
        "status-row-0",
        "graph-row-0",
    ] {
        let at = by_key(&all, key).unwrap_or_else(|| panic!("no row {key}"));
        let [x, _, w, h] = all[at].rect;
        assert_eq!(h, theme::size::row, "{key} is size::row tall");
        if key == "graph-row-0" {
            continue;
        }
        let kids: Vec<&ElementInfo> = all.iter().filter(|e| e.parent == Some(at)).collect();
        let left = kids.iter().map(|e| e.rect[0]).fold(f32::MAX, f32::min);
        let right = kids
            .iter()
            .map(|e| e.rect[0] + e.rect[2])
            .fold(0.0, f32::max);
        assert_eq!(left - x, space::s3, "{key} is indented");
        assert_eq!(x + w - right, space::s4, "{key} is padded on the right");
    }
}

#[test]
fn content_selects_and_labels_do_not() {
    let mut rt = window();
    for said in [
        "Words from the pilot",
        "pilot · 12:00",
        "Explore",
        "implementing",
    ] {
        let content = with_text(&rt, said);
        assert_eq!(
            cursor_over(&mut rt, &content),
            Cursor::Text,
            "{said:?} selects"
        );
    }
    for said in ["First notice", "First report", "First ticket", "Red"] {
        let label = with_text(&rt, said);
        assert_ne!(
            cursor_over(&mut rt, &label),
            Cursor::Text,
            "{said:?} is a label"
        );
    }
}

#[test]
fn lists_carry_deck_css_hairlines_but_none_after_the_last() {
    let rt = window();
    let all = rt.elements();
    let has = |key: &str| by_key(&all, key).is_some();
    // .notice and .mark-all-form rule every item; li:last-child drops it; a status table's rows are
    // ruled between, since a group's line may follow the last (the user's line levels, 2026-11-20).
    for ruled in [
        "notifications-mark-all-rule",
        "notice-0-rule",
        "notice-1-rule",
        "report-itm_r1-rule",
        "ticket-itm_t1-rule",
        "status-row-0-rule",
    ] {
        assert!(has(ruled), "{ruled} is drawn");
    }
    for last in [
        "report-itm_r2-rule",
        "ticket-itm_t2-rule",
        "status-row-1-rule",
    ] {
        assert!(!has(last), "{last} is not drawn");
    }
}
