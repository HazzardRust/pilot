//! rune-deck-ui S13: the graph region draws one element per dot of the view's graph, laid out by
//! the view, and hovering a dot's row shows its slice's whole name.

use pilot_deck::app::{self, State};
use pilot_deck::client::View;
use rune::{Env, Runtime};
use serde_json::{Value, json};

fn view_with(graph: Value) -> View {
    View {
        screen: "home".into(),
        seq: 1,
        regions: [("graph".to_string(), graph)].into_iter().collect(),
    }
}

/// `graphView`'s output for a fork and a convergence (`deck/test/view-graph.test.mjs`).
fn fork_and_join() -> Value {
    json!({
        "lanes": 2,
        "dots": [
            { "slice": "S1 the base", "lane": 0, "row": 0, "state": "done" },
            { "slice": "S2 the left", "lane": 0, "row": 1, "state": "doing" },
            { "slice": "S3 the right", "lane": 1, "row": 2, "state": "planned" },
            { "slice": "S4 the join", "lane": 0, "row": 3, "state": "" },
        ],
        "edges": [
            { "from": 0, "to": 1, "lane": 0 },
            { "from": 0, "to": 2, "lane": 1 },
            { "from": 1, "to": 3, "lane": 0 },
            { "from": 2, "to": 3, "lane": 1 },
            { "from": 3, "to": 4, "lane": 0 },
        ],
    })
}

fn frame(graph: Value) -> Runtime<State> {
    let state = State {
        view: view_with(graph),
        ..State::default()
    };
    let mut rt = Runtime::new(state, app::view, (1280.0, 800.0), Env::new(true, 1.0));
    rt.frame(0.0);
    rt
}

fn texts(rt: &Runtime<State>) -> Vec<String> {
    rt.elements()
        .into_iter()
        .filter_map(|element| element.text)
        .collect()
}

#[test]
fn each_dot_is_drawn_with_its_identifier() {
    let rt = frame(fork_and_join());

    for i in 0..4 {
        assert!(rt.find(&format!("graph-dot-{i}")).is_some(), "no dot {i}");
    }
    assert!(rt.find("graph-dot-4").is_none(), "the end point is no dot");
    let shown = texts(&rt);
    for want in ["S1", "S2", "S3", "S4"] {
        assert!(shown.iter().any(|t| t == want), "no {want:?} in {shown:?}");
    }
    assert!(!shown.iter().any(|t| t.contains("the right")), "{shown:?}");
}

#[test]
fn the_lanes_and_rows_are_the_views() {
    let rt = frame(fork_and_join());
    let at = |i: usize| rt.find(&format!("graph-dot-{i}")).expect("drawn");

    let ([x0, y0], [x1, y1], [x2, y2]) = (at(0).into(), at(1).into(), at(2).into());
    assert!(
        x0 == x1 && x2 > x0,
        "lane 1 is right of lane 0: {x0} {x1} {x2}"
    );
    assert!(y0 < y1 && y1 < y2, "rows run down: {y0} {y1} {y2}");
}

#[test]
fn hovering_a_dot_shows_its_slice_name() {
    let mut rt = frame(fork_and_join());

    let (x, y) = rt.find("graph-dot-2").expect("drawn");
    rt.pointer_move(x, y);
    rt.frame(0.0);

    let shown = texts(&rt);
    assert!(shown.iter().any(|t| t == "S3 the right"), "{shown:?}");
    let name = rt
        .elements()
        .into_iter()
        .find(|element| element.text.as_deref() == Some("S3 the right"))
        .expect("the name is drawn");
    let [_, _, w, h] = name.visible;
    assert!(
        w > 0.0 && h > 0.0,
        "no clip hides the name: {:?}",
        name.visible
    );
    assert!(!shown.iter().any(|t| t == "S1 the base"), "{shown:?}");
}

#[test]
fn the_graph_is_labelled_with_the_views_name_above_its_dots() {
    let mut graph = fork_and_join();
    graph["name"] = json!("kettle");
    let rt = frame(graph);

    let (_, label_y) = rt.find("graph-label").expect("the label is drawn");
    let (_, dot_y) = rt.find("graph-dot-0").expect("drawn");
    assert!(
        label_y < dot_y,
        "the label heads the graph: {label_y} {dot_y}"
    );
    assert!(texts(&rt).iter().any(|t| t == "kettle"));
    assert!(
        frame(fork_and_join()).find("graph-label").is_none(),
        "no name, no label"
    );
    // The page draws the label over a table whose rows make no dot.
    let bare = json!({ "dots": [], "edges": [], "lanes": 0, "name": "kettle" });
    assert!(frame(bare).find("graph-label").is_some());
}

#[test]
fn a_view_with_no_graph_draws_no_dot() {
    for graph in [Value::Null, json!({ "dots": [], "edges": [], "lanes": 0 })] {
        assert!(frame(graph).find("graph-dot-0").is_none());
    }
}
