//! The chat panel (spec 2, 3, 4): the selected deck's chat, oldest first, in a viewport stuck to
//! its bottom, and a box whose Enter posts the draft as one `Action::Reply` to the chat thread,
//! the route every reply takes (`deck/view/chat.mjs` names the thread). The post goes through
//! `act::send`, so the frame never waits on the deck; `answered`, from the window's poll, empties the
//! draft once the deck has taken it, or keeps it and the deck's reason when it has not. The draft
//! lives here only, never on disk, and a live view never touches it.

use rune::tok::{self, type_};
use rune::{Cx, El, ScrollSpec, TextEdit, Tx, col, el, text, text_input};
use rune_kit::markdown::{Markdown, MarkdownStyle};
use serde::Deserialize;

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

#[derive(Debug, Default, Deserialize)]
struct Chat {
    id: Option<String>,
    #[serde(default)]
    messages: Vec<Message>,
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
    // No deck on this page, or a view that cannot be read: nothing, never a dead window.
    let Ok(chat) = Chat::deserialize(v) else {
        return el();
    };
    let Some(id) = chat.id else {
        return el();
    };
    let dark = cx.system_dark();
    let (t, k) = (tok::theme(dark), theme::tokens(dark));
    let md = MarkdownStyle::neutral(dark);

    let mut messages = col()
        .key("chat-messages")
        .w_full()
        .h(LINES * space::row)
        .gap(space::between)
        .scroll(ScrollSpec { stick_bottom: true })
        .on_at_bottom(|s: &mut State, at| s.regions.chat.at_bottom = at);
    if chat.messages.is_empty() {
        messages = messages.child(
            text("Nothing said here yet.")
                .font(type_::LABEL)
                .color(k.quiet),
        );
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
                .child(text(by).font(type_::LABEL).color(k.quiet))
                .child(Markdown::new(message.text).render(&md)),
        );
    }

    let draft = text_input(&local.draft, type_::BODY)
        .key("chat-draft")
        .label("Message the pilot")
        .w_full()
        .placeholder("Say anything to the pilot.", k.quiet)
        .on_edit(|s: &mut State| &mut s.regions.chat.draft)
        .on_submit(move |s: &mut State, _: &mut Tx| send(s, &id));
    let mut panel = col()
        .key("chat")
        .gap(space::within)
        .child(messages)
        .child(draft.color(t.text));
    if let Some(reason) = &local.refused {
        panel = panel.child(
            text(reason)
                .font(type_::LABEL)
                .color(k.state.unacknowledged),
        );
    }
    panel
}
