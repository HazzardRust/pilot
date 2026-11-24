//! A table in the reply box (ADR reply-markdown L10-L12): a grid of cells the user types
//! into, never pipe syntax, written out as canonical GFM only when the reply is sent.

use rune::TextEdit;

/// Rows of cells, row 0 the header; every row has the same number of cells.
#[derive(Debug)]
pub struct Table {
    rows: Vec<Vec<TextEdit>>,
}

impl Table {
    /// `rows` × `cols` empty cells.
    pub fn new(rows: usize, cols: usize) -> Table {
        Table {
            rows: (0..rows)
                .map(|_| (0..cols).map(|_| TextEdit::default()).collect())
                .collect(),
        }
    }

    /// (rows, cols).
    pub fn size(&self) -> (usize, usize) {
        (self.rows.len(), self.rows.first().map_or(0, Vec::len))
    }

    pub fn cell(&self, r: usize, c: usize) -> &TextEdit {
        &self.rows[r][c]
    }

    pub fn cell_mut(&mut self, r: usize, c: usize) -> &mut TextEdit {
        &mut self.rows[r][c]
    }

    /// An empty row under row `after`.
    pub fn add_row(&mut self, after: usize) {
        let cols = self.size().1;
        let at = (after + 1).min(self.rows.len());
        self.rows
            .insert(at, (0..cols).map(|_| TextEdit::default()).collect());
    }

    /// An empty column right of column `after`, in every row.
    pub fn add_col(&mut self, after: usize) {
        for row in &mut self.rows {
            let at = (after + 1).min(row.len());
            row.insert(at, TextEdit::default());
        }
    }

    /// Row `r` out; the header (row 0) is never removed.
    pub fn remove_row(&mut self, r: usize) {
        if r > 0 && r < self.rows.len() {
            self.rows.remove(r);
        }
    }

    /// Column `c` out of every row; the last column left is never removed.
    pub fn remove_col(&mut self, c: usize) {
        if self.size().1 > 1 && c < self.size().1 {
            for row in &mut self.rows {
                row.remove(c);
            }
        }
    }

    /// Canonical GFM (L11): the header, a `| --- |` delimiter, the body; `|` in a cell is written
    /// `\|`, a line break `<br>` as Obsidian writes it (S5), and every other byte as typed, so a
    /// cell's markdown means what it means in prose.
    pub fn markdown(&self) -> String {
        let line = |cells: &[TextEdit]| {
            let mut out = String::from("|");
            for cell in cells {
                out.push(' ');
                out.push_str(&cell.text.replace('|', "\\|").replace('\n', "<br>"));
                out.push_str(" |");
            }
            out
        };
        let mut lines = Vec::with_capacity(self.rows.len() + 1);
        for (r, row) in self.rows.iter().enumerate() {
            lines.push(line(row));
            if r == 0 {
                lines.push(format!("|{}", " --- |".repeat(row.len())));
            }
        }
        lines.join("\n")
    }
}
