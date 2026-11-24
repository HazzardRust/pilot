//! reply-markdown S3: the Table button's grid (spec 3, 8, 9, 10). A grid is cells, never pipes the user
//! types; `Local::text()` joins the prose parts and each table's GFM, and is what every press sends.

use pilot_deck::act::{Acted, Action};
use pilot_deck::regions::reply::{Local, Opt};
use pilot_deck::table::Table;
use pulldown_cmark::{Event, Options, Parser, Tag, TagEnd};
use rune::TextEdit;

const ID: &str = "itm_000000000001";

/// A box holding `text` with the caret at byte `caret`.
fn typed_at(text: &str, caret: usize) -> Local {
    let mut local = Local::default();
    local.draft = TextEdit::new(text);
    local.draft.set_caret(caret);
    local
}

/// Types `cells` into the grid `t`, row by row.
fn fill(local: &mut Local, t: usize, cells: &[&[&str]]) {
    for (r, row) in cells.iter().enumerate() {
        for (c, cell) in row.iter().enumerate() {
            local.tables[t].0.cell_mut(r, c).replace_text(*cell);
        }
    }
}

/// Every table pulldown-cmark finds in `md`, as rows of cell text.
fn tables_in(md: &str) -> Vec<Vec<Vec<String>>> {
    let (mut tables, mut cell) = (Vec::new(), None::<String>);
    for event in Parser::new_ext(md, Options::ENABLE_TABLES) {
        match event {
            Event::Start(Tag::Table(_)) => tables.push(Vec::new()),
            Event::Start(Tag::TableHead | Tag::TableRow) => {
                tables.last_mut().unwrap().push(Vec::new())
            }
            Event::Start(Tag::TableCell) => cell = Some(String::new()),
            Event::Text(s) | Event::Code(s) => {
                if let Some(cell) = &mut cell {
                    cell.push_str(&s);
                }
            }
            Event::End(TagEnd::TableCell) => {
                let done = cell.take().unwrap();
                tables.last_mut().unwrap().last_mut().unwrap().push(done);
            }
            _ => {}
        }
    }
    tables
}

#[test]
fn the_table_button_inserts_a_2_x_2_grid_after_the_carets_line() {
    let mut local = typed_at("a\nb", 0);
    local.insert_table();
    assert_eq!(local.draft.text, "a");
    assert_eq!(local.tables.len(), 1);
    assert_eq!(local.tables[0].0.size(), (2, 2));
    assert_eq!(local.tables[0].1.text, "b");
}

#[test]
fn a_table_inserted_on_the_last_line_leaves_the_prose_whole() {
    let mut local = typed_at("a\nb", 3);
    local.insert_table();
    assert_eq!(local.draft.text, "a\nb");
    assert_eq!(local.tables[0].1.text, "");
}

/// The deck's thread screen with this reply box, dark, as `tests/deck/reply.rs` draws it.
fn box_drawn(local: Local) -> rune::Runtime<pilot_deck::app::State> {
    use pilot_deck::app::{self, State};
    use pilot_deck::client::View;

    let reply = serde_json::json!({
        "mode": "reply", "id": ID, "options": [],
        "close": { "confirm": true }, "dismiss": false,
    });
    let mut state = State {
        view: View {
            screen: "thread".into(),
            seq: 1,
            regions: [("reply".to_string(), reply)].into_iter().collect(),
        },
        ..State::default()
    };
    state.regions.reply = local;
    let mut rt = rune::Runtime::new(state, app::view, (1280.0, 800.0), rune::Env::new(true, 1.0));
    rt.frame(1.0);
    rt
}

fn at(rt: &rune::Runtime<pilot_deck::app::State>, key: &str) -> rune::runtime::ElementInfo {
    rt.elements()
        .into_iter()
        .find(|e| e.key.as_deref() == Some(key))
        .unwrap_or_else(|| panic!("no {key} drawn"))
}

fn click(rt: &mut rune::Runtime<pilot_deck::app::State>, key: &str) {
    let e = at(rt, key);
    let (x, y) = (e.rect[0] + e.rect[2] / 2.0, e.rect[1] + e.rect[3] / 2.0);
    rt.pointer_move(x, y);
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
    rt.frame(1.0 / 60.0);
}

#[test]
fn a_grid_shows_boxes_not_pipes_and_typing_fills_a_cell() {
    let mut rt = box_drawn(Local::default());
    click(&mut rt, "table");
    assert_eq!(rt.state.regions.reply.tables.len(), 1, "Table inserts a grid");
    click(&mut rt, "cell-0-0-0");
    rt.paste("Name");
    rt.frame(1.0 / 60.0);

    assert!(
        rt.state.regions.reply.text().contains("| Name |"),
        "{:?}",
        rt.state.regions.reply.text()
    );
    let elements = rt.elements();
    assert!(
        elements
            .iter()
            .any(|e| e.key.as_deref() == Some("cell-0-0-0"))
    );
    let piped: Vec<_> = elements
        .iter()
        .filter(|e| e.text.as_deref().is_some_and(|t| t.contains('|')))
        .map(|e| (e.key.clone(), e.text.clone()))
        .collect();
    assert!(piped.is_empty(), "pipes drawn: {piped:?}");
}

#[test]
fn the_sent_table_reads_back_as_the_same_cells() {
    let mut local = typed_at("Before", 0);
    local.insert_table();
    fill(&mut local, 0, &[&["a | b", "*x*"], &["1", ""]]);

    assert_eq!(
        tables_in(&local.text()),
        vec![vec![
            vec!["a | b".to_string(), "x".to_string()],
            vec!["1".to_string(), String::new()],
        ]]
    );
}

#[test]
fn a_table_alone_is_its_markdown() {
    let mut table = Table::new(2, 2);
    table.cell_mut(0, 0).replace_text("h");
    table.cell_mut(1, 1).replace_text("a|b");
    assert_eq!(
        table.markdown(),
        "| h |  |\n| --- | --- |\n|  | a\\|b |"
    );
}

fn table_local() -> Local {
    let mut local = typed_at("before\nafter", 0);
    local.insert_table();
    fill(&mut local, 0, &[&["h", "k"], &["1", "2"]]);
    local
}

const SENT: &str = "before\n\n| h | k |\n| --- | --- |\n| 1 | 2 |\n\nafter";

#[test]
fn send_and_the_option_presses_carry_the_table() {
    let mut local = table_local();
    assert_eq!(local.text(), SENT);
    let Some(Action::Reply { text, .. }) = local.send(ID) else {
        panic!("send posts a reply");
    };
    assert_eq!(text, SENT);

    let mut local = table_local();
    let option = Opt {
        label: "Yes".into(),
        confirm: false,
        locked: false,
        recommended: false,
    };
    let Some(Action::Reply { text, .. }) = local.press(ID, &option) else {
        panic!("the option posts a reply");
    };
    assert_eq!(text, SENT);
}

#[test]
fn a_taken_reply_empties_the_box_table_and_all() {
    let mut local = table_local();
    local.send(ID).unwrap();
    local.acted(Acted::Taken {
        location: "/".into(),
    });
    assert_eq!(local.draft.text, "");
    assert!(local.tables.is_empty());
}
