//! A drawn markdown table, as a thread shows it (reply-markdown S7): a cell's `<br>` draws as a
//! line break, and copying a selection that crosses table cells gives a GFM table of those cells,
//! written from the source, so a cell copies whole with its markdown and its `<br>`.
//!
//! rune-kit drops inline HTML (`markdown/parser.rs`), and a GFM row cannot hold a newline, so a
//! cell's `<br>` reaches it as U+2028, a line separator the text engine breaks the line at. Each
//! cell is its own selectable text, under `th/c{j}` (the header) or `r{i}/c{j}` (a body row) in
//! its table (rune-kit `markdown/table.rs`); that is how a selected text is known for a cell.

use std::collections::BTreeSet;

use pulldown_cmark::{Event, Options, Parser, Tag, TagEnd};
use rune::TextSelection;

/// What a cell's `<br>` is drawn as.
const LINE_BREAK: char = '\u{2028}';

fn parse(source: &str) -> impl Iterator<Item = (Event<'_>, std::ops::Range<usize>)> {
    Parser::new_ext(source, Options::ENABLE_TABLES).into_offset_iter()
}

fn is_br(html: &str) -> bool {
    let tag: String = html
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect::<String>()
        .to_ascii_lowercase();
    matches!(tag.as_str(), "<br>" | "<br/>")
}

/// `source` with each `<br>` inside a table cell turned into a line separator; the rest as written.
pub fn draws_breaks(source: &str) -> String {
    // Drawn every view build: a body without `<br` pays one scan, no parse and no lowered copy.
    if !source
        .as_bytes()
        .windows(3)
        .any(|w| w.eq_ignore_ascii_case(b"<br"))
    {
        return source.to_string();
    }
    let mut out = String::with_capacity(source.len());
    let mut from = 0;
    let mut in_cell = false;
    for (event, range) in parse(source) {
        match event {
            Event::Start(Tag::TableCell) => in_cell = true,
            Event::End(TagEnd::TableCell) => in_cell = false,
            Event::InlineHtml(html) if in_cell && is_br(&html) => {
                out.push_str(&source[from..range.start]);
                out.push(LINE_BREAK);
                from = range.end;
            }
            _ => {}
        }
    }
    out.push_str(&source[from..]);
    out
}

/// Every table in `source`, in document order: its rows (the header first), each cell its
/// markdown as written, trimmed.
fn tables(source: &str) -> Vec<Vec<Vec<String>>> {
    let mut out: Vec<Vec<Vec<String>>> = Vec::new();
    for (event, range) in parse(source) {
        match event {
            Event::Start(Tag::Table(_)) => out.push(Vec::new()),
            Event::Start(Tag::TableHead | Tag::TableRow) => {
                if let Some(table) = out.last_mut() {
                    table.push(Vec::new());
                }
            }
            Event::Start(Tag::TableCell) => {
                if let Some(row) = out.last_mut().and_then(|t| t.last_mut()) {
                    row.push(source[range].trim().to_string());
                }
            }
            _ => {}
        }
    }
    out
}

/// Where a selected text sits, from its path: in a table (the path up to its row, naming the
/// table) at `(row, column)`, the header row 0; or outside any table.
fn cell_of(path: &str) -> Option<(&str, usize, usize)> {
    let segments: Vec<&str> = path.split('/').collect();
    segments.windows(2).enumerate().find_map(|(k, pair)| {
        let row = match pair[0] {
            "th" => 0,
            r => r.strip_prefix('r')?.parse::<usize>().ok()? + 1,
        };
        let col = pair[1].strip_prefix('c')?.parse().ok()?;
        let end = segments[..k].iter().map(|s| s.len() + 1).sum::<usize>();
        Some((&path[..end.saturating_sub(1)], row, col))
    })
}

/// The cells `picked` of `table`, as a GFM table spanning their rows and columns, a cell not
/// picked left empty; its first row is the header.
fn gfm(table: &[Vec<String>], picked: &BTreeSet<(usize, usize)>) -> String {
    let rows = picked.iter().map(|c| c.0);
    let cols = picked.iter().map(|c| c.1);
    let (top, bottom) = (rows.clone().min().unwrap_or(0), rows.max().unwrap_or(0));
    let (left, right) = (cols.clone().min().unwrap_or(0), cols.max().unwrap_or(0));
    let line = |cells: Vec<&str>| format!("| {} |", cells.join(" | "));
    let mut out = Vec::new();
    for row in top..=bottom {
        let cells = (left..=right)
            .map(|col| match picked.contains(&(row, col)) {
                true => table
                    .get(row)
                    .and_then(|r| r.get(col))
                    .map_or("", String::as_str),
                false => "",
            })
            .collect();
        out.push(line(cells));
        if row == top {
            out.push(line(vec!["---"; right - left + 1]));
        }
    }
    out.join("\n")
}

enum Piece<'a> {
    Text {
        block: &'a str,
        text: String,
    },
    Cells {
        table: &'a str,
        picked: BTreeSet<(usize, usize)>,
        text: String,
    },
}

/// What copying `sel` puts on the clipboard for a markdown drawn from `source`, or `None` for
/// the text as drawn: a selection that touches no table cell, or touches cells of a table the
/// source does not hold (rune-kit and this parser disagreeing), copies as rune-kit copies it.
/// Cells of one table copy as a GFM table of them, one cell alone as its text; the rest of the
/// selection as drawn, a blank line between blocks.
pub fn copy(source: &str, sel: &TextSelection) -> Option<String> {
    let mut order: Vec<&str> = Vec::new();
    for t in sel.texts() {
        if let Some((table, ..)) = cell_of(t.path())
            && !order.contains(&table)
        {
            order.push(table);
        }
    }
    let mut pieces: Vec<Piece> = Vec::new();
    for t in sel.texts().iter().filter(|t| t.is_selected()) {
        let Some((table, row, col)) = cell_of(t.path()) else {
            let block = t.path().split('/').next().unwrap_or("");
            pieces.push(Piece::Text {
                block,
                text: t.text().to_string(),
            });
            continue;
        };
        match pieces.last_mut() {
            Some(Piece::Cells {
                table: last,
                picked,
                ..
            }) if *last == table => {
                picked.insert((row, col));
            }
            _ => pieces.push(Piece::Cells {
                table,
                picked: BTreeSet::from([(row, col)]),
                text: t.text().replace(LINE_BREAK, "\n"),
            }),
        }
    }
    if !pieces.iter().any(|p| matches!(p, Piece::Cells { .. })) {
        return None;
    }
    let tables = tables(source);
    let mut out = String::new();
    let mut last_block: Option<&str> = None;
    for piece in &pieces {
        let (block, text) = match piece {
            Piece::Text { block, text } => (*block, text.clone()),
            Piece::Cells {
                table,
                picked,
                text,
            } => {
                let at = order.iter().position(|t| t == table)?;
                let rows = tables.get(at)?;
                let fits = picked
                    .iter()
                    .all(|&(r, c)| rows.get(r).is_some_and(|r| c < r.len()));
                if !fits {
                    return None;
                }
                (
                    *table,
                    if picked.len() == 1 {
                        text.clone()
                    } else {
                        gfm(rows, picked)
                    },
                )
            }
        };
        if let Some(last) = last_block {
            out.push_str(if last == block { "\n" } else { "\n\n" });
        }
        out.push_str(&text);
        last_block = Some(block);
    }
    Some(out)
}
