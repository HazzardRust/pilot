//! reply-markdown S7: a thread's table copies as a GFM table of the cells a drag crossed, and a
//! cell's `<br>` draws as a line break; prose selects and copies as rune-kit's own `Markdown` does.

use pilot_deck::theme;
use pulldown_cmark::{Event, Options, Parser, Tag, TagEnd};
use rune::runtime::ElementInfo;
use rune::{El, Env, Key, KeyEvent, Mods, Runtime};
use rune_kit::markdown::Markdown;

const DARK: bool = true;

/// Prose, a table whose first body cell holds a `<br>`, and prose again.
const SOURCE: &str = "Before the table.\n\n| head | tail |\n| --- | --- |\n| one<br>two | three |\n| **four** | five |\n\nAfter the table.\n";

/// What the window draws: `source` through the deck's `theme::markdown`, or, with `kit`, through
/// rune-kit's `Markdown` on the deck's style without the deck's wrapper (what a thread drew before S7).
struct State {
    source: &'static str,
    kit: bool,
}

fn view(s: &State, cx: &mut rune::Cx<State>) -> El {
    let dark = cx.system_dark();
    if s.kit {
        Markdown::new(s.source)
            .selectable(true)
            .render(&theme::markdown_style(dark))
    } else {
        theme::markdown(s.source, dark)
    }
}

fn deck(source: &'static str) -> Runtime<State> {
    window(State { source, kit: false })
}

fn kit(source: &'static str) -> Runtime<State> {
    window(State { source, kit: true })
}

fn window(state: State) -> Runtime<State> {
    let mut rt = Runtime::new(state, view, (600.0, 600.0), Env::new(DARK, 1.0));
    rt.frame(0.0);
    rt
}

fn tick(rt: &mut Runtime<State>) {
    rt.frame(1.0 / 60.0);
}

fn find(rt: &Runtime<State>, path_end: &str) -> ElementInfo {
    let all = rt.elements();
    all.iter()
        .find(|e| e.path.contains(path_end) && e.text.is_some())
        .cloned()
        .unwrap_or_else(|| {
            let paths: Vec<_> = all
                .iter()
                .filter(|e| e.text.is_some())
                .map(|e| &e.path)
                .collect();
            panic!("no text at {path_end}: {paths:?}")
        })
}

/// Centres of the glyphs drawn inside the text whose path ends `path_end`, top to bottom, left to right.
fn glyphs(rt: &Runtime<State>, path_end: &str) -> Vec<(f32, f32)> {
    let e = find(rt, path_end);
    let mut out: Vec<(f32, f32)> = rt
        .instances
        .iter()
        .filter(|i| i.params[1] == rune::render::KIND_GLYPH)
        .map(|i| (i.rect[0] + i.rect[2] / 2.0, i.rect[1] + i.rect[3] / 2.0))
        .filter(|&(x, y)| {
            x >= e.rect[0]
                && x <= e.rect[0] + e.rect[2]
                && y >= e.rect[1]
                && y <= e.rect[1] + e.rect[3]
        })
        .collect();
    out.sort_by(|a, b| {
        ((a.1 / 5.0).round(), a.0)
            .partial_cmp(&((b.1 / 5.0).round(), b.0))
            .expect("finite")
    });
    assert!(!out.is_empty(), "no glyphs drawn at {path_end}");
    out
}

fn drag(rt: &mut Runtime<State>, (x0, y0): (f32, f32), (x1, y1): (f32, f32)) {
    rt.pointer_move(x0, y0);
    rt.pointer_down(x0, y0);
    tick(rt);
    for k in 1..=6 {
        let f = k as f32 / 6.0;
        rt.pointer_move(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f);
        tick(rt);
    }
    rt.pointer_up(x1, y1);
    tick(rt);
}

/// Drags from `from` to `to` and returns what Cmd+C put on the clipboard.
fn copy(rt: &mut Runtime<State>, from: (f32, f32), to: (f32, f32)) -> String {
    let clipboard = rune::clipboard::memory();
    rt.use_clipboard(&clipboard);
    drag(rt, from, to);
    rt.key(KeyEvent {
        key: Key::Command('c'),
        mods: Mods {
            cmd: true,
            ..Mods::default()
        },
    });
    tick(rt);
    clipboard
        .text()
        .map(|t| t.to_string())
        .expect("a copy on the clipboard")
}

fn after(g: (f32, f32)) -> (f32, f32) {
    (g.0 + 2.0, g.1)
}

fn before(g: (f32, f32)) -> (f32, f32) {
    (g.0 - 2.0, g.1)
}

/// The tables in `md`, as GFM parses them: rows of cells, each cell its text with inline HTML
/// kept as written (`one<br>two`) and emphasis markers dropped.
fn tables(md: &str) -> Vec<Vec<Vec<String>>> {
    let mut out: Vec<Vec<Vec<String>>> = Vec::new();
    let mut in_cell = false;
    for event in Parser::new_ext(md, Options::ENABLE_TABLES) {
        match event {
            Event::Start(Tag::Table(_)) => out.push(Vec::new()),
            Event::Start(Tag::TableHead | Tag::TableRow) => {
                out.last_mut().expect("a table").push(Vec::new())
            }
            Event::Start(Tag::TableCell) => {
                in_cell = true;
                out.last_mut()
                    .and_then(|t| t.last_mut())
                    .expect("a row")
                    .push(String::new())
            }
            Event::End(TagEnd::TableCell) => in_cell = false,
            Event::Text(t) | Event::Code(t) | Event::InlineHtml(t) if in_cell => {
                let cell = out
                    .last_mut()
                    .and_then(|t| t.last_mut())
                    .and_then(|r| r.last_mut());
                cell.expect("a cell").push_str(&t);
            }
            _ => {}
        }
    }
    out
}

#[test]
fn a_drag_over_a_table_selects_whole_cells_in_row_order() {
    let mut rt = deck(SOURCE);
    let tail = glyphs(&rt, "th/c1");
    let one = glyphs(&rt, "r0/c0");
    drag(&mut rt, tail[1], one[1]);
    let selection = rt.selection().expect("a selection");
    let cells: Vec<_> = selection
        .texts()
        .iter()
        .filter(|t| t.is_selected())
        .map(|t| (t.path().to_string(), t.is_whole()))
        .collect();
    assert_eq!(cells.len(), 2, "{cells:?}");
    assert!(
        cells[0].0.contains("th/c1") && cells[1].0.contains("r0/c0"),
        "{cells:?}"
    );
    assert!(
        cells.iter().all(|(_, whole)| *whole),
        "a cell partly selected: {cells:?}"
    );
}

#[test]
fn copying_a_drag_across_cells_gives_a_gfm_table_of_those_cells() {
    let mut rt = deck(SOURCE);
    let tail = glyphs(&rt, "th/c1");
    let one = glyphs(&rt, "r0/c0");
    let copied = copy(&mut rt, tail[1], one[1]);
    assert_eq!(
        tables(&copied),
        vec![vec![
            vec![String::new(), "tail".to_string()],
            vec!["one<br>two".to_string(), String::new()],
        ]],
        "copied {copied:?}"
    );
}

#[test]
fn copying_a_drag_over_the_whole_table_gives_the_table() {
    let mut rt = deck(SOURCE);
    let head = glyphs(&rt, "th/c0");
    let five = glyphs(&rt, "r1/c1");
    let copied = copy(&mut rt, before(head[0]), after(*five.last().expect("five")));
    assert_eq!(tables(&copied), tables(SOURCE), "copied {copied:?}");
    // The cells as written, their markdown kept: `tables` above reads past emphasis.
    assert!(
        copied.contains("| **four** |") && copied.contains("| one<br>two |"),
        "copied {copied:?}"
    );
}

/// Two tables with prose between: each cell two letters, so a drag can start inside one.
const TWO: &str = "| aa | bb |\n| --- | --- |\n| cc | dd |\n\nBetween.\n\n| ee | ff |\n| --- | --- |\n| gg | hh |\n";

#[test]
fn a_drag_inside_the_second_table_copies_its_cells() {
    let mut rt = deck(TWO);
    let ff = glyphs(&rt, "b2/th/c1");
    let gg = glyphs(&rt, "b2/r0/c0");
    // From the middle of the first `f`, so the second is selected and the first is not.
    let copied = copy(&mut rt, ff[0], gg[1]);
    assert_eq!(copied, "|  | ff |\n| --- | --- |\n| gg |  |");
}

#[test]
fn a_drag_from_one_table_into_the_next_copies_two_tables_and_the_prose() {
    let mut rt = deck(TWO);
    let cc = glyphs(&rt, "b0/r0/c0");
    let ff = glyphs(&rt, "b2/th/c1");
    let copied = copy(&mut rt, before(cc[0]), after(ff[1]));
    assert_eq!(
        copied,
        "| cc | dd |\n| --- | --- |\n\nBetween.\n\n| ee | ff |\n| --- | --- |"
    );
}

#[test]
fn a_drag_inside_one_cell_copies_its_text_with_the_break_as_a_newline() {
    let mut rt = deck(SOURCE);
    let one = glyphs(&rt, "r0/c0");
    // Glyphs o n e t w o: the line separator draws none, so [4] is the `w`.
    let copied = copy(&mut rt, before(one[0]), after(one[4]));
    assert_eq!(copied, "one\ntw");
}

#[test]
fn a_drag_over_prose_only_copies_as_rune_kit_does() {
    let src = "First **bold** line.\n\nSecond line, after it.\n";
    let mut copies = Vec::new();
    for mut rt in [deck(src), kit(src)] {
        let first = glyphs(&rt, "b0");
        let second = glyphs(&rt, "b1");
        copies.push(copy(&mut rt, first[2], second[4]));
    }
    assert_eq!(copies[0], copies[1]);
    assert!(copies[0].contains("bold"), "{copies:?}");
}

#[test]
fn a_cells_br_draws_as_a_line_break() {
    let rt = deck("| h | i |\n| --- | --- |\n| a<br>b | c |\n");
    let cell = glyphs(&rt, "r0/c0");
    assert_eq!(cell.len(), 2, "a and b: {cell:?}");
    assert!(
        cell[1].1 - cell[0].1 > 5.0,
        "b sits on the line under a, not beside it: {cell:?}"
    );
}

#[test]
fn a_br_outside_a_table_draws_as_rune_kit_draws_it() {
    let src = "one<br>two\n";
    let text = |rt: &Runtime<State>| find(rt, "b0").text;
    assert_eq!(text(&deck(src)), text(&kit(src)));
}
