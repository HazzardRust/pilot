//! The reply box (spec 3, 5, 6c): the text area, the thread's options as `deck/view/reply.mjs` lists
//! them, a verdict's confirm in place, Reopen on a closed thread, Dismiss, and the deck's refusal in
//! its own words. Its `Local` holds the half-typed draft, which a live refresh of the view never
//! touches (spec 4), and which only a reply the deck took empties (ADR 0096). The draft lives in
//! memory alone: nothing here writes it to disk.

use crate::theme::type_;
use rune::tok;
use rune::{Color, Cx, El, Key, TextEdit, Tx, col, el, row, text, text_input};
use serde::Deserialize;

use crate::act::{self, Acted, Action};
use crate::app::State;
use crate::table::Table;
use crate::theme::{self, space};

/// The `act::send` key of the box's one press that is out.
const SEND: &str = "reply-press";

/// A style's line in points: its own, or Rune's default of 1.25 × its size.
pub(crate) fn line_height(style: rune::TextStyle) -> f32 {
    if style.line_height > 0.0 {
        style.line_height
    } else {
        1.25 * style.size
    }
}

/// One option the user can press, as `replyView` lists it.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct Opt {
    pub label: String,
    pub confirm: bool,
    /// The page draws it disabled: the thread already holds a press. Drawn disabled; it posts nothing.
    /// No default: a view without it fails the parse and draws nothing, rather than unlocked.
    pub locked: bool,
    /// The pilot's recommended answer: drawn with the page's quiet "(recommended)" mark. No default either.
    pub recommended: bool,
}

/// Close beside Reply, where the page draws it (a question, a user thread).
#[derive(Debug, Deserialize)]
struct CloseOpt {
    confirm: bool,
}

/// What Close is called in the box: the label its ask and its out press carry.
const CLOSE: &str = "Close";

#[derive(Debug, Default, Deserialize)]
struct Reply {
    mode: String,
    /// The thread this box is drawn for: every press posts here, never to a thread moved to since.
    id: String,
    #[serde(default)]
    options: Vec<Opt>,
    #[serde(default)]
    dismiss: bool,
    #[serde(default)]
    close: Option<CloseOpt>,
}

#[derive(Debug, Default)]
pub struct Local {
    /// The first prose part: everything before the first table (L10).
    pub draft: TextEdit,
    /// Each grid and the prose part after it, in order (L10). Only `text()` joins them.
    pub tables: Vec<(Table, TextEdit)>,
    /// The verdict option whose confirm is showing.
    pub confirming: Option<String>,
    /// The deck's own words for the last press it refused.
    pub refused: Option<String>,
    /// The press that is out: drawn pressed until the deck answers, and no second press posts.
    pub sent: Option<String>,
    /// The thread the showing confirm was asked on: its Confirm posts there or nowhere.
    asked_on: Option<String>,
    /// The showing confirm is Close's, not an option's that happens to be called "Close".
    closing: bool,
    /// The text the press that is out carried: a taken answer empties the box only while it holds this.
    posted: Option<String>,
    /// Where an edit to a grid removed since its frame lands: in no part of the reply.
    spare: TextEdit,
}

/// What a right-click on a cell offers, acting at that cell (S5, Obsidian's way).
#[derive(Debug, Clone, Copy)]
enum Control {
    AddRow,
    RemoveRow,
    AddCol,
    RemoveCol,
    Delete,
}

/// The cell menu's items: what each does, its title and its id, in the order shown.
const MENU: [(Control, &str, &str); 5] = [
    (Control::AddRow, "Add row below", "add-row"),
    (Control::RemoveRow, "Delete row", "delete-row"),
    (Control::AddCol, "Add column right", "add-col"),
    (Control::RemoveCol, "Delete column", "delete-col"),
    (Control::Delete, "Delete table", "delete-table"),
];

/// The cell menu: the header row is never deleted, nor the last column, so those items are off.
fn cell_menu(r: usize, cols: usize) -> rune::PopupMenu {
    let mut menu = rune::PopupMenu::new();
    for (control, title, id) in MENU {
        let enabled = match control {
            Control::RemoveRow => r > 0,
            Control::RemoveCol => cols > 1,
            _ => true,
        };
        if matches!(control, Control::Delete) {
            menu = menu.separator();
        }
        menu = menu.item(rune::PopupItem::new(id, title).enabled(enabled));
    }
    menu
}

/// The key of grid `t`'s cell at row `r`, column `c` (L12).
fn cell_key(t: usize, r: usize, c: usize) -> String {
    format!("cell-{t}-{r}-{c}")
}

/// The key of prose part `p` (`Local::prose_mut`): `reply-text`, then `reply-text-<p>`.
fn prose_key(p: usize) -> String {
    match p {
        0 => "reply-text".to_string(),
        _ => format!("reply-text-{p}"),
    }
}

impl Local {
    /// What the box holds as one reply: the prose parts and each table's GFM in order, one blank line
    /// between a table and the text beside it (L10, L11). The one join of the draft: every press reads it.
    pub fn text(&self) -> String {
        let mut out = self.draft.text.clone();
        for (table, prose) in &self.tables {
            if !out.is_empty() {
                out.push_str("\n\n");
            }
            out.push_str(&table.markdown());
            if !prose.text.is_empty() {
                out.push_str("\n\n");
                out.push_str(&prose.text);
            }
        }
        out
    }

    /// Nothing typed anywhere: every prose part and every cell blank, so an empty grid is no reply.
    fn blank(&self) -> bool {
        let empty = |edit: &TextEdit| edit.text.trim().is_empty();
        empty(&self.draft)
            && self.tables.iter().all(|(table, prose)| {
                let (rows, cols) = table.size();
                empty(prose) && (0..rows).all(|r| (0..cols).all(|c| empty(table.cell(r, c))))
            })
    }

    /// The Table button: a 2 × 2 grid at the caret of the prose part holding it (the first when none
    /// does), which splits there; the text after the caret becomes the grid's prose part (S5). A line
    /// break beside the caret is the grid's own, so none is left at the cut.
    pub fn insert_table(&mut self) {
        self.insert();
    }

    /// `insert_table`, returning the new grid's index for the caret to go to.
    fn insert(&mut self) -> usize {
        // The caret in a cell of grid t: the new grid goes straight after it, an empty prose part
        // between, and grid t's prose part follows the new grid.
        if let Some(t) = (0..self.tables.len()).find(|&t| self.caret_cell(t).is_some()) {
            let tail = std::mem::take(&mut self.tables[t].1);
            self.tables.insert(t + 1, (Table::new(2, 2), tail));
            return t + 1;
        }
        let after = self
            .tables
            .iter()
            .position(|(_, prose)| prose.focused)
            .map_or(0, |i| i + 1);
        let prose = self.prose_mut(after);
        // The caret may sit off a char boundary; `text[caret..]` would panic there.
        prose.sync_invariants();
        let caret = prose.focus.min(prose.text.len());
        let (head, tail) = prose.text.split_at(caret);
        let head = head.strip_suffix('\n').unwrap_or(head).to_string();
        let tail = tail.strip_prefix('\n').unwrap_or(tail).to_string();
        prose.replace_text(head);
        self.tables
            .insert(after, (Table::new(2, 2), TextEdit::new(tail)));
        after
    }

    /// The field a drawn cell or prose part edits: `cell` `None` for grid `t`'s prose part. A grid
    /// emptied since the frame was drawn (a taken reply) edits `spare`, never another part.
    fn part(&mut self, t: usize, cell: Option<(usize, usize)>) -> &mut TextEdit {
        let Some((table, prose)) = self.tables.get_mut(t) else {
            return &mut self.spare;
        };
        match cell {
            None => prose,
            Some((r, c)) if r < table.size().0 && c < table.size().1 => table.cell_mut(r, c),
            Some(_) => &mut self.spare,
        }
    }

    /// Prose part `p`: 0 the draft, `p` the one after grid `p - 1` (L10).
    fn prose_mut(&mut self, p: usize) -> &mut TextEdit {
        match p.checked_sub(1) {
            Some(t) => &mut self.tables[t].1,
            None => &mut self.draft,
        }
    }

    /// The key of the prose part before grid `t`, its caret put at its end.
    fn prose_before(&mut self, t: usize) -> String {
        let prose = self.prose_mut(t);
        prose.set_caret(prose.text.len());
        prose_key(t)
    }

    /// Up, Down, Return or Tab in grid `t`'s cell (r, c): the key the caret goes to. Up from the
    /// header and Down from the last row leave for the prose beside the grid; Return moves down a
    /// row, adding one under the last (spec 11); Tab moves to the next cell, and in the last cell
    /// adds a row and moves into it (S5, Obsidian's way). `None` leaves the key to the field.
    fn step(&mut self, t: usize, (r, c): (usize, usize), key: &Key) -> Option<String> {
        let (rows, cols) = self.tables.get(t)?.0.size();
        if r >= rows || c >= cols {
            return None;
        }
        match key {
            Key::Tab if c + 1 < cols => Some(cell_key(t, r, c + 1)),
            Key::Tab => {
                if r + 1 >= rows {
                    self.tables[t].0.add_row(r);
                }
                Some(cell_key(t, r + 1, 0))
            }
            Key::Up if r == 0 => Some(self.prose_before(t)),
            Key::Up => Some(cell_key(t, r - 1, c)),
            Key::Down if r + 1 >= rows => {
                self.prose_mut(t + 1).set_caret(0);
                Some(prose_key(t + 1))
            }
            Key::Down => Some(cell_key(t, r + 1, c)),
            Key::Enter => {
                if r + 1 >= rows {
                    self.tables[t].0.add_row(r);
                }
                Some(cell_key(t, r + 1, c))
            }
            _ => None,
        }
    }

    /// The cell of grid `t` holding the caret.
    fn caret_cell(&self, t: usize) -> Option<(usize, usize)> {
        let table = &self.tables.get(t)?.0;
        let (rows, cols) = table.size();
        (0..rows)
            .flat_map(|r| (0..cols).map(move |c| (r, c)))
            .find(|&(r, c)| table.cell(r, c).focused)
    }

    /// A cell menu item picked on grid `t`'s cell (r, c) (S5): the key the caret
    /// goes to, a cell of the grid, or the prose before it once the grid is deleted and the prose
    /// joined. A grid or cell gone since the frame was drawn changes nothing.
    fn reshape(&mut self, t: usize, (r, c): (usize, usize), control: Control) -> Option<String> {
        let table = &mut self.tables.get_mut(t)?.0;
        let (rows, cols) = table.size();
        if r >= rows || c >= cols {
            return None;
        }
        match control {
            Control::AddRow => table.add_row(r),
            Control::AddCol => table.add_col(c),
            Control::RemoveRow => table.remove_row(r),
            Control::RemoveCol => table.remove_col(c),
            Control::Delete => {
                let (_, after) = self.tables.remove(t);
                let before = self.prose_mut(t);
                let join = before.text.len();
                let joined = match (before.text.is_empty(), after.text.is_empty()) {
                    (false, false) => format!("{}\n{}", before.text, after.text),
                    _ => format!("{}{}", before.text, after.text),
                };
                before.replace_text(joined);
                before.set_caret(join);
                return Some(prose_key(t));
            }
        }
        let (rows, cols) = table.size();
        Some(cell_key(t, r.min(rows - 1), c.min(cols - 1)))
    }

    /// The one way a press leaves the box: it is out until `acted`, and nothing else posts meanwhile.
    fn out(&mut self, label: &str, action: Action) -> Option<Action> {
        self.escape();
        self.sent = Some(label.to_string());
        self.posted = match &action {
            Action::Reply { text, .. } => Some(text.clone()),
            _ => None,
        };
        Some(action)
    }

    /// An option pressed: a locked one posts nothing; a confirming one asks first and posts on its
    /// Confirm; any other posts, with what the box holds as its text.
    pub fn press(&mut self, id: &str, option: &Opt) -> Option<Action> {
        if self.sent.is_some() || option.locked {
            return None;
        }
        let armed = !self.closing
            && self.confirming.as_deref() == Some(option.label.as_str())
            && self.asked_on.as_deref() == Some(id);
        if option.confirm && !armed {
            // A showing Close ask is taken back: this ask is the option's own.
            self.escape();
            self.confirming = Some(option.label.clone());
            self.asked_on = Some(id.to_string());
            return None;
        }
        let action = Action::Reply {
            id: id.to_string(),
            text: self.text(),
            choice: Some(option.label.clone()),
        };
        self.out(&option.label, action)
    }

    /// The showing confirm's Confirm: posts the option it asked about, once.
    pub fn confirm(&mut self, id: &str) -> Option<Action> {
        // A confirm asked on another thread is not this one's: it is taken back, and nothing posts.
        if self.asked_on.as_deref() != Some(id) {
            self.escape();
            return None;
        }
        if self.closing {
            return self.close(id, true);
        }
        let label = self.confirming.clone()?;
        self.press(
            id,
            &Opt {
                label,
                confirm: true,
                locked: false,
                recommended: false,
            },
        )
    }

    /// Escape: the confirm is taken back. False when none was showing, so the key goes on.
    pub fn escape(&mut self) -> bool {
        self.asked_on = None;
        self.closing = false;
        self.confirming.take().is_some()
    }

    /// Close pressed: with `confirm` it asks first and posts on its Confirm, as the page's does. It
    /// carries no text: the box keeps whatever it holds.
    pub fn close(&mut self, id: &str, confirm: bool) -> Option<Action> {
        if self.sent.is_some() {
            return None;
        }
        let armed = self.closing && self.asked_on.as_deref() == Some(id);
        if confirm && !armed {
            self.escape();
            self.confirming = Some(CLOSE.to_string());
            self.asked_on = Some(id.to_string());
            self.closing = true;
            return None;
        }
        self.out(CLOSE, Action::Close { id: id.to_string() })
    }

    /// Reply: the typed text alone; an empty box sends nothing, as the page's required field does.
    pub fn send(&mut self, id: &str) -> Option<Action> {
        if self.sent.is_some() || self.blank() {
            return None;
        }
        let text = self.text();
        let action = Action::Reply {
            id: id.to_string(),
            text,
            choice: None,
        };
        self.out("Reply", action)
    }

    /// A one-press write with no text of its own: Reopen, Dismiss.
    fn plain(&mut self, label: &str, action: Action) -> Option<Action> {
        if self.sent.is_some() {
            return None;
        }
        self.out(label, action)
    }

    /// The deck's answer. Taken empties the box only while it still holds the text that was posted, so
    /// words typed since, or beside a Close, stay; refused keeps every typed word beside the reason.
    pub fn acted(&mut self, acted: Acted) {
        self.settle(match acted {
            Acted::Taken { .. } => None,
            Acted::Refused { reason } => Some(reason),
        });
    }

    /// `acted` on what `act::refusal` made of the answer: none when the deck took it.
    fn settle(&mut self, refused: Option<String>) {
        self.sent = None;
        let posted = self.posted.take();
        match refused {
            None => {
                if posted.as_deref() == Some(self.text().as_str()) {
                    self.draft.replace_text("");
                    self.tables.clear();
                }
                self.refused = None;
            }
            Some(reason) => self.refused = Some(reason),
        }
    }
}

/// The press's answer, from the window's poll: an error reaching the deck reads as a refusal in its
/// own words, so the draft stays.
pub fn answered(local: &mut Local, key: &str, refused: Option<String>) {
    if key == SEND {
        local.settle(refused);
    }
}

/// Posts `action` through `act::send`, so the press draws in its own frame (spec 6c).
fn post(s: &mut State, action: Option<Action>) {
    if let Some(action) = action {
        act::send(&mut s.pending, SEND, action);
    }
}

/// A press-shaped label on `fill`.
fn button(label: &str, key: String, ink: Color, fill: Color) -> El {
    row()
        .key(key)
        .role("button")
        .label(label)
        .padding(space::pad)
        .fill(fill)
        .child(text(label).font(type_::CAPTION).color(ink))
}

/// A field of the box editing `edit` in `font`: its markdown painted over it, never written into
/// it (L2), on the rule fill at the button's corner.
fn field(edit: &TextEdit, font: rune::TextStyle, dark: bool) -> El {
    bare_field(edit, font, dark)
        .radius(theme::radius::button)
        .fill(theme::tokens(dark).rule)
}

/// A field with no box of its own: a table cell, which the grid's outline and rules hold.
fn bare_field(edit: &TextEdit, font: rune::TextStyle, dark: bool) -> El {
    text_input(edit, font)
        .decorations(crate::preview::spans(edit, dark))
        .padding(space::pad)
}

pub fn draw(v: &serde_json::Value, local: &Local, cx: &mut Cx<State>) -> El {
    // No reply slot on this screen, an archived thread, or a view it cannot read: nothing.
    let Ok(reply) = Reply::deserialize(v) else {
        return el();
    };
    let dark = cx.system_dark();
    let (t, k) = (tok::theme(dark), theme::tokens(dark));
    // The press that is out, or the option whose confirm is showing, draws pressed in the frame of
    // its press, before the deck answers (spec 6c).
    let ink = |pressed: bool| {
        if pressed {
            theme::pressed_ink(dark)
        } else {
            t.text
        }
    };
    let r = theme::roles(dark);
    // Every button but Reply, as a queue card's options are (the walkthrough of 2026-11-21): the
    // page's ink and a hairline, never a fill unless pressed in.
    let btn = |label: &str, key: String, pressed: bool| {
        let fill = if pressed {
            k.state.pilot
        } else {
            Color::TRANSPARENT
        };
        theme::control(
            button(label, key, ink(pressed), fill).border(1.0, k.rule),
            dark,
        )
    };
    let pressed = |label: &str| local.sent.as_deref() == Some(label);
    let id = reply.id;

    if reply.mode == "reopen" {
        return col().key("reply").child(
            btn("Reopen", "reopen".into(), pressed("Reopen")).on_press(move |s: &mut State| {
                let action = s
                    .regions
                    .reply
                    .plain("Reopen", Action::Reopen { id: id.clone() });
                post(s, action);
            }),
        );
    }
    if reply.mode != "reply" {
        return el();
    }

    let mut options = row().key("reply-options").gap(space::pad).items_center();
    for (i, option) in reply.options.into_iter().enumerate() {
        // An option locked since its ask (a refresh brought another surface's press) draws no Confirm.
        let asking = !local.closing
            && !option.locked
            && local.confirming.as_deref() == Some(option.label.as_str());
        let label = option.label.clone();
        // A verdict's option and its confirm are one group: the ask and its Confirm sit beside it.
        let lit = pressed(&label) || asking;
        // Its Confirm is the option pressed again while armed, so `press`'s lock guard holds there too.
        let again = option.clone();
        let (at, again_at) = (id.clone(), id.clone());
        // A locked option takes no press but is drawn as Close is, never greyed (the user's note).
        let mut face = btn(&label, format!("option-{i}"), lit);
        if option.recommended {
            face = face.gap(space::within).child(
                text("(recommended)")
                    .key(format!("option-{i}-recommended"))
                    .font(type_::BODY)
                    .color(k.quiet),
            );
        }
        face = if option.locked {
            face.disabled(true)
        } else {
            face.on_press(move |s: &mut State| {
                let action = s.regions.reply.press(&at, &option);
                post(s, action);
            })
        };
        let mut group = row().gap(space::within).items_center().child(face);
        if asking {
            group = group
                .child(theme::content(
                    text(format!("Send “{label}”?"))
                        .font(type_::BODY)
                        .color(t.text),
                    dark,
                ))
                .child(
                    btn("Confirm", "confirm".into(), false).on_press(move |s: &mut State| {
                        let action = s.regions.reply.press(&again_at, &again);
                        post(s, action);
                    }),
                );
        }
        options = options.child(group);
    }

    let at = id.clone();
    // The walkthrough of 2026-11-21: Reply, the one primary button, then Close, each in one place on
    // every thread, Reply the first stop on Tab from the box, as the page's `.send` row; every other
    // button is one group of its own at the right, so options come and go without moving either.
    let reply_button = {
        let fill = if pressed("Reply") {
            k.state.pilot
        } else {
            r.primary
        };
        theme::control(button("Reply", "send".into(), r.surface, fill), dark).on_press(
            move |s: &mut State| {
                let action = s.regions.reply.send(&at);
                post(s, action);
            },
        )
    };
    let mut fixed = row()
        .key("reply-fixed")
        .gap(space::pad)
        .items_center()
        .child(reply_button);
    if let Some(close) = &reply.close {
        let (confirm, at) = (close.confirm, id.clone());
        fixed = fixed.child(
            btn(CLOSE, "close".into(), pressed(CLOSE) || local.closing).on_press(
                move |s: &mut State| {
                    let action = s.regions.reply.close(&at, confirm);
                    post(s, action);
                },
            ),
        );
    }
    // Table, a group of its own in a row under Reply and Close (the user, 2026-11-24), out of the
    // Tab order and never taking focus, so the prose part holding the caret still holds it when the
    // press lands (A5, A6); the caret then goes to the first cell.
    let insert = row().key("reply-insert").gap(space::pad).child(
        btn("Table", "table".into(), false)
            .focusable(false)
            .preserve_focus_on_press(true)
            .on_press_tx(|s: &mut State, tx: &mut Tx| {
                let t = s.regions.reply.insert();
                tx.focus(cell_key(t, 0, 0), false);
            }),
    );
    if reply.close.is_some() {
        let confirm_at = id.clone();
        if local.closing {
            fixed = fixed
                .child(theme::content(
                    text("Close this thread?").font(type_::BODY).color(t.text),
                    dark,
                ))
                .child(btn("Confirm", "close-confirm".into(), false).on_press(
                    move |s: &mut State| {
                        let action = s.regions.reply.confirm(&confirm_at);
                        post(s, action);
                    },
                ));
        }
    }
    if reply.dismiss {
        options = options.child(
            btn("Dismiss", "dismiss".into(), pressed("Dismiss")).on_press(move |s: &mut State| {
                let action = s
                    .regions
                    .reply
                    .plain("Dismiss", Action::DismissItem { id: id.clone() });
                post(s, action);
            }),
        );
    }
    // Top-aligned, so a taller option ("(recommended)") never moves Reply or Close.
    let send = row()
        .key("reply-send")
        .items_start()
        .gap(space::between)
        .child(fixed)
        .child(el().grow(1.0).min_w(space::s0))
        .child(options);

    let mut box_ = col()
        .key("reply")
        .gap(space::within)
        .on_key(|s: &mut State, ev: &rune::KeyEvent, _: &mut Tx| {
            matches!(ev.key, Key::Escape) && s.regions.reply.escape()
        })
        // The page's hairline above the box (deck.css:225).
        .child(theme::separator(dark))
        .child(
            field(&local.draft, type_::BODY, dark)
                .key(prose_key(0))
                .label("Reply")
                .placeholder("Reply to the pilot.", k.quiet)
                .on_edit(|s: &mut State| &mut s.regions.reply.draft)
                // Plain Return makes a line, as Shift+Return does; Reply is pressed, never typed
                // (the user, 2026-11-24: "just normal enter"; rune's `text_input` doc).
                .on_submit(|s: &mut State, _: &mut Tx| s.regions.reply.draft.insert("\n"))
                // Five lines tall to start, and growing past them; a word longer than the box
                // breaks at its width (the user, 2026-11-21).
                .wrap_anywhere()
                .min_h(5.0 * line_height(type_::BODY) + 2.0 * space::pad),
        );
    // Each grid, then the prose part after it (L10): one field per cell, never pipes.
    // The header row as the thread's rendered table draws one (L5): its weight at body size, on
    // its header fill (rune-kit `MarkdownStyle::from_kit`'s `table_head_fill`).
    let head = rune::TextStyle {
        weight: type_::HEADER.weight,
        ..type_::BODY
    };
    // The whole grid as the thread draws a table (the user, 2026-11-24: "why cant we just render
    // the actual table?"): a hairline outline at a 6 pt corner, the header on its fill, a hairline
    // between rows, cells side by side with no box of their own (`from_kit`'s `table_outline`,
    // `table_head_fill`, `table_rule`). The outline takes layout room so the header's fill sits
    // inside it, and nothing clips the grid, so a cell's focus ring is drawn whole at its edges.
    const RADIUS: f32 = 6.0;
    const HAIR: f32 = 0.5;
    let kit = rune_kit::Kit::neutral(dark);
    let (head_fill, rule) = (kit.c.layer_01, kit.c.border_muted);
    let inner = RADIUS - HAIR;
    for (t, (table, prose)) in local.tables.iter().enumerate() {
        let (rows, cols) = table.size();
        let mut grid = col()
            .key(format!("table-{t}"))
            .border(HAIR, rule)
            .border_layout()
            .radius(RADIUS);
        for r in 0..rows {
            if r > 0 {
                // A hairline as tall as its own top border, so the region spaces nothing by hand.
                grid = grid.child(
                    el().key(format!("grid-{t}-rule-{r}"))
                        .w_full()
                        .border_sides([HAIR, 0.0, 0.0, 0.0], rule)
                        .border_layout()
                        .a11y_hidden(),
                );
            }
            let mut line = row().key(format!("grid-{t}-row-{r}"));
            if r == 0 {
                let low = if rows == 1 { inner } else { 0.0 };
                line = line.fill(head_fill).clip_corners([inner, inner, low, low]);
            }
            for c in 0..cols {
                let font = if r == 0 { head } else { type_::BODY };
                // Rendered once the caret leaves, as a prose line off the caret (A8).
                // Multi-line, so Shift+Return breaks a line in the cell (S5); the keys that move
                // between cells are taken here, before the editor sees them.
                let cell = bare_field(table.cell(r, c), font, dark)
                    .key(cell_key(t, r, c))
                    .label(format!("Table cell, row {}, column {}", r + 1, c + 1))
                    .on_edit(move |s: &mut State| s.regions.reply.part(t, Some((r, c))))
                    .on_input_key(move |s: &mut State, ev: &rune::KeyEvent, tx: &mut Tx| {
                        let plain = ev.mods == rune::Mods::default();
                        let shift_only = ev.mods
                            == rune::Mods {
                                shift: true,
                                ..rune::Mods::default()
                            };
                        let reply = &mut s.regions.reply;
                        // Up and Down leave the cell only from its first or last line.
                        let edge = |reply: &mut Local, up: bool| {
                            let edit = reply.part(t, Some((r, c)));
                            // The caret may sit off a char boundary; slicing there would panic.
                            edit.sync_invariants();
                            let caret = edit.focus.min(edit.text.len());
                            match up {
                                true => !edit.text[..caret].contains('\n'),
                                false => !edit.text[caret..].contains('\n'),
                            }
                        };
                        let to = match ev.key {
                            Key::Up if plain && edge(reply, true) => reply.step(t, (r, c), &ev.key),
                            Key::Down if plain && edge(reply, false) => {
                                reply.step(t, (r, c), &ev.key)
                            }
                            Key::Enter | Key::Tab if plain => reply.step(t, (r, c), &ev.key),
                            // Shift+Tab goes back a cell; from the first, Rune's own focus order.
                            Key::Tab if shift_only && c > 0 => Some(cell_key(t, r, c - 1)),
                            Key::Tab if shift_only && r > 0 => Some(cell_key(t, r - 1, cols - 1)),
                            _ => None,
                        };
                        to.map(|key| tx.focus(key, false)).is_some()
                    })
                    // Return in a cell stays in the grid: it never presses Reply.
                    .on_submit(move |s: &mut State, tx: &mut Tx| {
                        if let Some(key) = s.regions.reply.step(t, (r, c), &Key::Enter) {
                            tx.focus(key, false);
                        }
                    })
                    // Right-click: the cell menu, acting at this cell (S5).
                    .on_secondary_press(
                        move |_: &mut State, at: rune::PointerPress, tx: &mut Tx| {
                            tx.popup_menu(
                                cell_menu(r, cols),
                                at,
                                move |s: &mut State, picked: Option<&str>, tx: &mut Tx| {
                                    let control = MENU
                                        .iter()
                                        .find(|(_, _, id)| Some(*id) == picked)
                                        .map(|&(control, _, _)| control);
                                    if let Some(key) =
                                        control.and_then(|k| s.regions.reply.reshape(t, (r, c), k))
                                    {
                                        tx.focus(key, false);
                                    }
                                },
                            );
                        },
                    )
                    .grow(1.0)
                    .min_w(space::s0);
                // A hairline between columns, as between rows (the user, 2026-11-24: "they just
                // need dividers. just line like the rows do").
                if c > 0 {
                    line = line.child(
                        el().key(format!("grid-{t}-col-{r}-{c}"))
                            .self_stretch()
                            .border_sides([0.0, 0.0, 0.0, HAIR], rule)
                            .border_layout()
                            .a11y_hidden(),
                    );
                }
                line = line.child(cell);
            }
            grid = grid.child(line);
        }
        box_ = box_.child(grid).child(
            field(prose, type_::BODY, dark)
                .key(prose_key(t + 1))
                .label("Reply, after the table")
                .on_edit(move |s: &mut State| s.regions.reply.part(t, None))
                .on_submit(move |s: &mut State, _: &mut Tx| {
                    s.regions.reply.part(t, None).insert("\n")
                })
                .wrap_anywhere(),
        );
    }
    box_ = box_.child(send).child(insert);
    if let Some(reason) = &local.refused {
        box_ = box_.child(
            text(reason)
                .key("refused")
                .font(type_::BODY)
                .color(k.accent.red),
        );
    }
    box_
}
