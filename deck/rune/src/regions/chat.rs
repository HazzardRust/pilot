//! The chat panel (spec 2, 3, 4): the selected deck's chat, oldest first, in a viewport stuck to
//! its bottom, and a box whose Enter posts the draft as one `Action::Reply` to the chat thread,
//! the route every reply takes (`deck/view/chat.mjs` names the thread). The post runs on a thread
//! of its own, so the frame never waits on the deck; `settle`, from the window's poll, empties the
//! draft once the deck has taken it, or keeps it and the deck's reason when it has not. The draft
//! lives here only, never on disk, and a live view never touches it.

use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;

use rune::tok::{self, type_};
use rune::{Cx, El, ScrollSpec, TextEdit, Tx, col, el, text, text_input};
use rune_kit::markdown::{Markdown, MarkdownStyle};
use serde::Deserialize;

use crate::act::{Acted, Action};
use crate::app::State;
use crate::client::Client;
use crate::theme::{self, space};

/// How often the poll looks again while a send is out.
const SETTLE: Duration = Duration::from_millis(50);
/// The messages' viewport, in lines.
const LINES: f32 = 12.0;

/// What a send came back with: the deck's answer, or the error that stopped it.
type Answer = Option<Result<Acted, String>>;

/// A send out to the deck: the text it posts and where its thread leaves the answer.
#[derive(Debug)]
struct Sending {
    text: String,
    answer: Arc<Mutex<Answer>>,
}

/// The chat's own view state: the half-typed draft, whether the reader is at the bottom, the send
/// in flight, the deck's word on the last refused send, and the client sends post through (the
/// window's own address when unset).
#[derive(Default)]
pub struct Local {
    pub draft: TextEdit,
    pub at_bottom: bool,
    pub refused: Option<String>,
    pub deck: Option<Arc<Client>>,
    sending: Option<Sending>,
}

/// The client is left out: it holds the deck's address and agent, nothing a reader needs.
impl std::fmt::Debug for Local {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Local")
            .field("draft", &self.draft)
            .field("at_bottom", &self.at_bottom)
            .field("refused", &self.refused)
            .field("sending", &self.sending)
            .finish_non_exhaustive()
    }
}

impl Local {
    /// A send is out and has not been settled.
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
fn send(s: &mut State, id: &str, tx: &mut Tx) {
    let c = &mut s.regions.chat;
    let said = c.draft.text.trim().to_string();
    if said.is_empty() || c.sending.is_some() {
        return;
    }
    if c.deck.is_none() {
        match Client::from_env() {
            Ok(client) => c.deck = Some(Arc::new(client)),
            Err(err) => {
                c.refused = Some(err.to_string());
                return;
            }
        }
    }
    let Some(deck) = c.deck.clone() else { return };
    c.refused = None;
    let answer = Arc::new(Mutex::new(None));
    let slot = Arc::clone(&answer);
    let reply = Action::Reply {
        id: id.into(),
        text: said.clone(),
        choice: None,
    };
    let spawned = std::thread::Builder::new()
        .name("pilot-deck-chat-send".into())
        .spawn(move || {
            let got = deck.act(&reply).map_err(|err| err.to_string());
            *slot.lock().unwrap_or_else(PoisonError::into_inner) = Some(got);
        });
    if let Err(err) = spawned {
        c.refused = Some(format!("the send did not start: {err}"));
        return;
    }
    c.sending = Some(Sending {
        text: c.draft.text.clone(),
        answer,
    });
    tx.wake_after(SETTLE);
}

/// From the window's poll: takes a finished send's answer. Taken empties the draft, unless the
/// user has typed on since; anything else keeps it and says why. A send still out asks to be
/// looked at again. Answers whether the view changed.
pub fn settle(s: &mut State, tx: &mut Tx) -> bool {
    let c = &mut s.regions.chat;
    let Some(sending) = &c.sending else {
        return false;
    };
    let Some(answer) = sending
        .answer
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .take()
    else {
        tx.wake_after(SETTLE);
        return false;
    };
    let sent = c.sending.take().map(|sending| sending.text);
    match answer {
        Ok(Acted::Taken { .. }) => {
            if sent.as_deref() == Some(c.draft.text.as_str()) {
                c.draft.clear();
            }
        }
        Ok(Acted::Refused { reason }) => c.refused = Some(reason),
        Err(err) => c.refused = Some(err),
    }
    true
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
        .on_submit(move |s: &mut State, tx: &mut Tx| send(s, &id, tx));
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
