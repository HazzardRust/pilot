//! The chat panel (spec 2, 3, 4): the selected deck's chat, oldest first, in a viewport stuck to
//! its bottom, and a box whose Enter posts the draft as one `Action::Reply` to the chat thread,
//! the route every reply takes (`deck/view/chat.mjs` names the thread). The post goes through
//! `act::send`, so the frame never waits on the deck; `answered`, from the window's poll, empties the
//! draft once the deck has taken it, or keeps it and the deck's reason when it has not. The draft
//! lives here only, never on disk, and a live view never touches it.

use crate::theme::type_;
use rune::tok;
use rune::{Cx, El, ScrollSpec, TextEdit, Tx, col, row, text, text_input};
use serde::Deserialize;

use super::notifications::open_thread;
use super::reply::line_height;
use crate::act::{self, Action};
use crate::app::State;
use crate::theme::{self, space};

/// The messages' viewport, in lines.
const LINES: f32 = 12.0;
/// The `act::send` key of the chat's one send.
const SEND: &str = "chat-send";

/// The chat's own view state: the half-typed draft, whether the reader is at the bottom, the text of
/// the send in flight, and the deck's word on the last refused send.
#[derive(Debug, Default)]
pub struct Local {
    pub draft: TextEdit,
    pub at_bottom: bool,
    pub refused: Option<String>,
    sending: Option<String>,
}

impl Local {
    /// A send is out and has not been answered.
    pub fn sending(&self) -> bool {
        self.sending.is_some()
    }
}

#[derive(Debug, Deserialize)]
struct Message {
    by: String,
    at: Option<String>,
    text: String,
}

/// A thread Create opened, as `deck/view/chat.mjs` lists it.
#[derive(Debug, Deserialize)]
struct Thread {
    id: String,
    title: String,
}

#[derive(Debug, Default, Deserialize)]
struct Chat {
    id: Option<String>,
    #[serde(default)]
    messages: Vec<Message>,
    #[serde(default)]
    threads: Vec<Thread>,
}

/// One link row per thread, each opening its thread as a notification's does.
fn thread_rows(threads: Vec<Thread>, dark: bool) -> impl Iterator<Item = El> {
    let t = tok::theme(dark);
    threads.into_iter().enumerate().map(move |(i, thread)| {
        let id = thread.id;
        theme::list_row(row())
            .key(format!("chat-thread-{i}"))
            .child(
                theme::control(text(thread.title), dark)
                    .font(type_::BODY)
                    .color(t.text)
                    .role("link")
                    .truncate()
                    .grow(1.0)
                    .on_press(move |s: &mut State| open_thread(s, &id)),
            )
    })
}

/// Enter in the box: the draft, trimmed, goes to thread `id` once; a blank draft or one already
/// out sends nothing.
fn send(s: &mut State, id: &str) {
    let c = &mut s.regions.chat;
    let said = c.draft.text.trim().to_string();
    if said.is_empty() || c.sending.is_some() {
        return;
    }
    c.refused = None;
    c.sending = Some(c.draft.text.clone());
    let reply = Action::Reply {
        id: id.into(),
        text: said,
        choice: None,
    };
    act::send(&mut s.pending, SEND, reply);
}

/// The send's answer: a taken one empties the draft, unless the user has typed on since; a refused
/// or failed one keeps it and says why.
pub fn answered(c: &mut Local, key: &str, refused: Option<String>) {
    if key != SEND {
        return;
    }
    let sent = c.sending.take();
    match refused {
        None if sent.as_deref() == Some(c.draft.text.as_str()) => c.draft.clear(),
        None => {}
        Some(reason) => c.refused = Some(reason),
    }
}

pub fn draw(v: &serde_json::Value, local: &Local, cx: &mut Cx<State>) -> El {
    let dark = cx.system_dark();
    // No chat open: the tab's Create threads under a sentence, or blank with none, as the HTML deck
    // (rune-panes A2); a view that cannot be read draws the same, never a dead window.
    let none = |threads: Vec<Thread>| {
        let panel = if threads.is_empty() {
            col()
        } else {
            col().child(theme::empty("No chat open.", "chat-none", dark))
        };
        thread_rows(threads, dark).fold(panel, |panel, el| panel.child(el))
    };
    let Ok(chat) = Chat::deserialize(v) else {
        return none(Vec::new());
    };
    let Some(id) = chat.id else {
        return none(chat.threads);
    };
    let (t, k) = (tok::theme(dark), theme::tokens(dark));

    let mut messages = col()
        .key("chat-messages")
        .w_full()
        .h(LINES * theme::size::row)
        .gap(space::between)
        .scroll(ScrollSpec { stick_bottom: true })
        .on_at_bottom(|s: &mut State, at| s.regions.chat.at_bottom = at);
    if chat.messages.is_empty() {
        messages = messages.child(theme::content(
            text("Nothing said here yet.")
                .font(type_::CAPTION)
                .color(k.quiet),
            dark,
        ));
    }
    for (i, message) in chat.messages.into_iter().enumerate() {
        let by = match message.at {
            Some(at) => format!("{} · {at}", message.by),
            None => message.by,
        };
        messages = messages.child(
            col()
                .key(format!("chat-{i}"))
                .gap(space::within)
                .padding(space::pad)
                .child(theme::content(
                    text(by).font(type_::CAPTION).color(k.quiet),
                    dark,
                ))
                .child(theme::markdown(message.text, dark)),
        );
    }

    // The page's `<textarea rows="3">` and its Send button: three lines tall to start, growing past
    // them as the reply box does; Enter sends too, Shift+Enter breaks the line.
    let to = id.clone();
    let draft = text_input(&local.draft, type_::BODY)
        .key("chat-draft")
        .label("Message the pilot")
        .w_full()
        .placeholder("Say anything to the pilot.", k.quiet)
        .on_edit(|s: &mut State| &mut s.regions.chat.draft)
        .on_submit(move |s: &mut State, _: &mut Tx| send(s, &id))
        .wrap_anywhere()
        .min_h(3.0 * line_height(type_::BODY) + 2.0 * space::pad)
        .padding(space::pad)
        .radius(theme::radius::button)
        .fill(k.rule);
    let send_button = theme::control(
        row()
            .key("chat-send")
            .role("button")
            .label("Send")
            .padding(space::pad)
            .border(1.0, k.rule)
            .child(text("Send").font(type_::CAPTION).color(t.text)),
        dark,
    )
    .self_start()
    .disabled(local.sending())
    .on_press(move |s: &mut State| send(s, &to));
    let mut panel = col().key("chat").gap(space::within);
    for el in thread_rows(chat.threads, dark) {
        panel = panel.child(el);
    }
    panel = panel
        .child(messages)
        .child(draft.color(t.text))
        .child(send_button);
    if let Some(reason) = &local.refused {
        panel = panel.child(theme::content(
            text(reason)
                .font(type_::CAPTION)
                .color(k.state.unacknowledged),
            dark,
        ));
    }
    panel
}
