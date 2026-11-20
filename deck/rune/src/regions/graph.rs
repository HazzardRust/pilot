//! The Status panel's git graph: the run's slices as dots on lanes, the edges between them and the
//! unlabelled end point, as the view laid them out (`deck/view/graph.mjs`, from `graphOf`). This
//! turns a lane and a row into points and computes no layout of its own. Each dot's row is the
//! hover target, as on the page (`renderDot`), and hovering it shows the slice's whole name.

use crate::theme::type_;
use rune::tok;
use rune::{Cx, El, LineCap, Path, Shape, canvas, el, row, text};
use serde::Deserialize;

use crate::app::State;
use crate::theme::{self, space};

/// The row hovered, whose slice's whole name is shown beside the graph.
#[derive(Debug, Default)]
pub struct Local {
    hovered: Option<usize>,
}

#[derive(Debug, Deserialize)]
struct Dot {
    slice: String,
    lane: usize,
    row: usize,
    #[serde(default)]
    state: String,
}

#[derive(Debug, Deserialize)]
struct Edge {
    from: usize,
    to: usize,
    lane: usize,
}

#[derive(Debug, Default, Deserialize)]
struct Graph {
    #[serde(default)]
    dots: Vec<Dot>,
    #[serde(default)]
    edges: Vec<Edge>,
    #[serde(default)]
    lanes: usize,
}

/// One lane's width and one row's height.
const LANE: f32 = space::s4;
const ROW: f32 = theme::size::row;
/// A dot's radius, and a doing dot's core and the end point's.
const DOT: f32 = space::s2;
const CORE: f32 = 2.0;
/// The page's stroke weight (`deck.css`, `.graph`): a line's width, not a space.
const STROKE: f32 = 1.5;

fn x(lane: usize) -> f32 {
    space::pad + lane as f32 * LANE
}

fn y(row: usize) -> f32 {
    ROW / 2.0 + row as f32 * ROW
}

/// A vertical S-bend from the path's last point to `to`, the half row a fork or convergence takes.
fn bend(path: Path, [x1, y1]: [f32; 2], [x2, y2]: [f32; 2]) -> Path {
    let mid = (y1 + y2) / 2.0;
    path.cubic_to([x1, mid], [x2, mid], [x2, y2])
}

/// One edge: out of its dot onto the lane it runs down, down that lane, and into its target, as
/// `renderEdge` (`deck/ui/render-strip.mjs`) draws it. A `to` past the last dot is the end point.
fn edge(graph: &Graph, edge: &Edge) -> Path {
    let lane_at = |row: usize| graph.dots.get(row).map_or(0, |dot| dot.lane);
    let (x1, y1) = (x(lane_at(edge.from)), y(edge.from));
    let (x2, y2) = (x(lane_at(edge.to)), y(edge.to));
    let along = x(edge.lane);
    let (out, into) = (y1 + ROW / 2.0, y2 - ROW / 2.0);
    let mut path = Path::new().move_to([x1, y1]);
    path = if along == x1 {
        path.line_to([along, out])
    } else {
        bend(path, [x1, y1], [along, out])
    };
    path = path.line_to([along, into]);
    if along == x2 {
        path.line_to([x2, y2])
    } else {
        bend(path, [along, into], [x2, y2])
    }
}

pub fn draw(v: &serde_json::Value, local: &Local, cx: &mut Cx<State>) -> El {
    // A region the view cannot be read as draws empty rather than taking the window down.
    let graph = Graph::deserialize(v).unwrap_or_default();
    if graph.dots.is_empty() {
        return el();
    }
    let dark = cx.system_dark();
    let t = tok::theme(dark);
    let tokens = theme::tokens(dark);
    let end = graph.dots.len();
    let text_x = x(graph.lanes.saturating_sub(1)) + LANE;
    let (width, height) = (text_x + space::s8, y(end) + ROW / 2.0);

    let lines = graph.edges.iter().fold(Shape::new(), |shape, each| {
        shape.stroke_path(&edge(&graph, each), STROKE, LineCap::Round, tokens.quiet)
    });
    let end_point = el()
        .key("graph-end")
        .size(2.0 * CORE, 2.0 * CORE)
        .radius(CORE)
        .fill(tokens.quiet)
        .absolute(x(0) - CORE, y(end) - CORE);

    let rows = graph.dots.iter().enumerate().map(|(i, dot)| {
        let (ink, fill) = match dot.state.as_str() {
            "done" => (t.text, t.text),
            "" => (tokens.quiet, t.bg),
            _ => (t.text, t.bg),
        };
        let mut circle = el()
            .key(format!("graph-dot-{i}"))
            .size(2.0 * DOT, 2.0 * DOT)
            .radius(DOT)
            .fill(fill)
            .border(STROKE, ink)
            .absolute(x(dot.lane) - DOT, ROW / 2.0 - DOT)
            .items_center()
            .justify_center();
        if dot.state == "doing" {
            circle = circle.child(el().size(2.0 * CORE, 2.0 * CORE).radius(CORE).fill(ink));
        }
        // A dot is drawn only for a row whose name leads with its identifier (`identifierOf`).
        let id = dot.slice.split_whitespace().next().unwrap_or_default();
        row()
            .key(format!("graph-row-{i}"))
            .size(width, ROW)
            .absolute(0.0, dot.row as f32 * ROW)
            .items_center()
            .cursor(rune::Cursor::Pointer)
            .on_hover_change(move |s: &mut State, inside, _| {
                let hovered = &mut s.regions.graph.hovered;
                if inside {
                    *hovered = Some(i);
                } else if *hovered == Some(i) {
                    *hovered = None;
                }
            })
            .child(circle)
            .child(el().w(text_x))
            .child(theme::content(
                text(id).font(type_::CAPTION.mono()).color(t.text),
                dark,
            ))
    });

    let mut region = el()
        .key("graph")
        .size(width, height)
        .child(canvas(lines).size(width, height).absolute(0.0, 0.0))
        .child(end_point)
        .children(rows);
    if let Some(dot) = local.hovered.and_then(|i| graph.dots.get(i)) {
        region = region.child(
            text(&dot.slice)
                .key("graph-name")
                .font(type_::CAPTION)
                .color(t.text)
                .fill(t.bg)
                .border(STROKE, tokens.rule)
                .padding(space::s2)
                .absolute(width, dot.row as f32 * ROW),
        );
    }
    region
}
