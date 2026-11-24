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

#[test]
fn a_table_goes_after_the_line_of_the_prose_part_holding_the_caret() {
    let mut local = typed_at("é one\né two", 4);
    local.insert_table();
    assert_eq!(local.draft.text, "é one");
    local.tables[0].1 = TextEdit::new("x\ny");
    local.tables[0].1.set_caret(0);
    local.tables[0].1.focused = true;
    local.insert_table();
    assert_eq!(local.draft.text, "é one");
    let prose: Vec<_> = local.tables.iter().map(|(_, p)| p.text.as_str()).collect();
    assert_eq!(prose, ["x", "y"]);
}

/// Table pressed with the caret in a cell of grid 0: the new grid goes after it, never above it.
#[test]
fn a_table_inserted_from_a_cell_goes_after_its_grid() {
    let mut local = typed_at("a", 1);
    local.insert_table();
    fill(&mut local, 0, &[&["h", "k"], &["1", "2"]]);
    local.tables[0].1.replace_text("after");
    local.tables[0].0.cell_mut(0, 0).focused = true;
    local.insert_table();
    assert_eq!(local.tables.len(), 2);
    assert_eq!(
        local.tables[0].0.markdown(),
        "| h | k |\n| --- | --- |\n| 1 | 2 |"
    );
    assert_eq!(
        local.tables[1].0.markdown(),
        "|  |  |\n| --- | --- |\n|  |  |"
    );
    assert_eq!(
        local.text(),
        "a\n\n| h | k |\n| --- | --- |\n| 1 | 2 |\n\n|  |  |\n| --- | --- |\n|  |  |\n\nafter"
    );
}

#[test]
fn a_blank_grid_sends_nothing() {
    let mut local = typed_at("  ", 0);
    local.insert_table();
    assert_eq!(local.send(ID), None);
    local.tables[0].0.cell_mut(1, 1).replace_text("x");
    assert!(local.send(ID).is_some());
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
    // A frame while the button is held, as a hand's press has: a blur on the down shows here.
    rt.frame(1.0 / 60.0);
    rt.pointer_up(x, y);
    rt.frame(1.0 / 60.0);
}

#[test]
fn a_grid_shows_boxes_not_pipes_and_typing_fills_a_cell() {
    let mut rt = box_drawn(Local::default());
    click(&mut rt, "table");
    assert_eq!(
        rt.state.regions.reply.tables.len(),
        1,
        "Table inserts a grid"
    );
    rt.frame(1.0 / 60.0);
    let focused = rt
        .elements()
        .into_iter()
        .find(|e| e.focused)
        .and_then(|e| e.key);
    assert_eq!(
        focused.as_deref(),
        Some("cell-0-0-0"),
        "the caret goes to the first cell"
    );
    rt.paste("Name");
    rt.frame(1.0 / 60.0);

    assert!(
        rt.state.regions.reply.text().contains("| Name |"),
        "{:?}",
        rt.state.regions.reply.text()
    );
    let elements = rt.elements();
    let cell = elements
        .iter()
        .find(|e| e.key.as_deref() == Some("cell-0-0-0"))
        .expect("cell-0-0-0 drawn");
    assert_eq!(
        cell.text.as_deref(),
        Some("Name"),
        "the cell shows what was typed"
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
    assert_eq!(table.markdown(), "| h |  |\n| --- | --- |\n|  | a\\|b |");
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

/// The box with `table_local`'s grid, the caret put in `cell` by a click.
fn grid_with_caret_in(cell: &str) -> rune::Runtime<pilot_deck::app::State> {
    let mut rt = box_drawn(table_local());
    click(&mut rt, cell);
    rt
}

fn press(rt: &mut rune::Runtime<pilot_deck::app::State>, key: rune::Key, shift: bool) {
    rt.key(rune::KeyEvent {
        key,
        mods: rune::Mods {
            shift,
            ..rune::Mods::default()
        },
    });
    rt.frame(1.0 / 60.0);
}

fn focused(rt: &rune::Runtime<pilot_deck::app::State>) -> Option<String> {
    rt.elements()
        .into_iter()
        .find(|e| e.focused)
        .and_then(|e| e.key)
}

/// The walkthrough of 2026-11-24, the user: "i dont want it to be shift enter, just normal enter".
/// Plain Return in the draft and in the text after a grid makes a line and sends nothing; Shift+Return
/// still makes one.
#[test]
fn return_in_the_text_makes_a_line_and_sends_nothing() {
    use rune::Key;
    for shift in [false, true] {
        for (key, part) in [("reply-text", None), ("reply-text-1", Some(0))] {
            let mut rt = box_drawn(table_local());
            click(&mut rt, key);
            press(&mut rt, Key::Enter, shift);
            let reply = &rt.state.regions.reply;
            let text = match part {
                None => &reply.draft.text,
                Some(t) => &reply.tables[t].1.text,
            };
            assert_eq!(
                text.matches('\n').count(),
                1,
                "{key}, shift {shift}: {text:?}"
            );
            assert!(
                !rt.state.pending.is_sent("reply-press"),
                "{key}, shift {shift}: Return sent the reply"
            );
        }
    }
}

/// The walkthrough of 2026-11-24, the user: Table "doesnt match the group the other buttons being
/// reply and close - make it a separate group below". Its own row, under Reply and Close.
#[test]
fn table_is_a_group_of_its_own_under_reply_and_close() {
    let rt = box_drawn(Local::default());
    let (send, close, table) = (at(&rt, "send"), at(&rt, "close"), at(&rt, "table"));
    for (name, e) in [("Reply", &send), ("Close", &close)] {
        assert!(
            table.rect[1] >= e.rect[1] + e.rect[3],
            "Table at y {} is not under {name} (bottom {})",
            table.rect[1],
            e.rect[1] + e.rect[3]
        );
    }
    assert!(
        (table.rect[0] - send.rect[0]).abs() < 0.5,
        "Table starts its row at Reply's left edge"
    );
}

#[test]
fn tab_shift_tab_and_return_move_between_cells() {
    use rune::Key;
    let mut rt = grid_with_caret_in("cell-0-0-0");
    press(&mut rt, Key::Tab, false);
    assert_eq!(focused(&rt).as_deref(), Some("cell-0-0-1"), "Tab");
    press(&mut rt, Key::Tab, true);
    assert_eq!(focused(&rt).as_deref(), Some("cell-0-0-0"), "Shift+Tab");

    let mut rt = grid_with_caret_in("cell-0-1-1");
    press(&mut rt, Key::Enter, false);
    assert_eq!(rt.state.regions.reply.tables[0].0.size(), (3, 2));
    assert_eq!(focused(&rt).as_deref(), Some("cell-0-2-1"), "Return");
    assert!(
        !rt.state.pending.is_sent("reply-press"),
        "Return posts nothing"
    );
}

#[test]
fn up_from_the_header_and_down_from_the_last_row_leave_the_grid() {
    use rune::Key;
    let mut rt = grid_with_caret_in("cell-0-0-1");
    press(&mut rt, Key::Up, false);
    assert_eq!(focused(&rt).as_deref(), Some("reply-text"), "Up");

    let mut rt = grid_with_caret_in("cell-0-1-0");
    press(&mut rt, Key::Down, false);
    assert_eq!(focused(&rt).as_deref(), Some("reply-text-1"), "Down");
}

#[test]
fn the_controls_change_the_grid_and_keep_the_caret_in_it() {
    let mut rt = grid_with_caret_in("cell-0-1-1");
    for (control, size) in [
        ("table-0-add-row", (3, 2)),
        ("table-0-add-col", (3, 3)),
        ("table-0-remove-row", (2, 3)),
        ("table-0-remove-col", (2, 2)),
    ] {
        click(&mut rt, control);
        rt.frame(1.0 / 60.0);
        assert_eq!(rt.state.regions.reply.tables[0].0.size(), size, "{control}");
        let at = focused(&rt);
        assert!(
            at.as_deref().is_some_and(|k| k.starts_with("cell-0-")),
            "{control} left the caret at {at:?}"
        );
    }
    click(&mut rt, "table-0-delete");
    assert!(rt.state.regions.reply.tables.is_empty());
    assert_eq!(rt.state.regions.reply.draft.text, "before\nafter");
}

/// Deleting a second grid whose prose part is empty: the prose before it stays as it was and takes
/// the caret.
#[test]
fn deleting_a_second_grid_with_no_prose_after_it_keeps_the_prose_before() {
    let mut local = typed_at("before", 6);
    local.insert_table();
    local.tables[0].1 = TextEdit::new("mid");
    local.tables.push((Table::new(2, 2), TextEdit::new("")));
    let mut rt = box_drawn(local);
    click(&mut rt, "cell-1-0-0");
    click(&mut rt, "table-1-delete");
    let reply = &rt.state.regions.reply;
    assert_eq!(reply.tables.len(), 1);
    assert_eq!(reply.tables[0].1.text, "mid");
    assert_eq!(
        reply.text(),
        "before\n\n|  |  |\n| --- | --- |\n|  |  |\n\nmid"
    );
    assert_eq!(focused(&rt).as_deref(), Some("reply-text-1"));
}

#[test]
fn the_header_row_and_the_last_column_are_never_removed() {
    let mut table = Table::new(2, 1);
    table.remove_row(0);
    table.remove_col(0);
    assert_eq!(table.size(), (2, 1));
    table.add_row(1);
    table.add_col(0);
    table.remove_row(2);
    assert_eq!(table.size(), (2, 2));
}

#[test]
fn a_cell_without_the_caret_renders_its_markdown() {
    use pilot_deck::preview;
    let mut table = Table::new(2, 2);
    let cell = table.cell_mut(1, 0);
    cell.replace_text("**b** _i_ `c`");
    let spans = preview::spans(cell, true);
    assert!(spans.iter().any(|s| s.weight.is_some()), "bold: {spans:?}");
    assert!(spans.iter().any(|s| s.italic), "italic: {spans:?}");
    assert!(spans.iter().any(|s| s.mono), "mono: {spans:?}");

    cell.focused = true;
    cell.set_caret(0);
    assert!(
        preview::spans(cell, true).is_empty(),
        "the caret's cell is raw"
    );
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
