//! The reply box (spec 3, 5, 6c): the text area, the thread's options as `deck/view/reply.mjs` lists
//! them, a verdict's confirm in place, Reopen on a closed thread, Dismiss, and the deck's refusal in
//! its own words. Its `Local` holds the half-typed draft, which a live refresh of the view never
//! touches (spec 4), and which only a reply the deck took empties (ADR 0096). The draft lives in
//! memory alone: nothing here writes it to disk.

use std::sync::mpsc;
use std::time::Duration;

use rune::tok::{self, type_};
use rune::{Color, Cx, El, Key, TextEdit, Tx, col, el, row, text, text_input};
use serde::Deserialize;

use crate::act::{Acted, Action};
use crate::app::State;
use crate::client::{Client, Result};
use crate::theme::{self, space};

/// How often `poll` looks for the deck's answer to a press that is out.
const ANSWER_POLL: Duration = Duration::from_millis(50);

/// One option the user can press, as `replyView` lists it.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct Opt {
    pub label: String,
    pub confirm: bool,
}

#[derive(Debug, Default, Deserialize)]
struct Reply {
    mode: String,
    #[serde(default)]
    options: Vec<Opt>,
    #[serde(default)]
    dismiss: bool,
}

#[derive(Debug, Default)]
pub struct Local {
    pub draft: TextEdit,
    /// The verdict option whose confirm is showing.
    pub confirming: Option<String>,
    /// The deck's own words for the last press it refused.
    pub refused: Option<String>,
    /// The press that is out: drawn pressed until the deck answers, and no second press posts.
    pub sent: Option<String>,
    answer: Option<mpsc::Receiver<Result<Acted>>>,
}

impl Local {
    /// The one way a press leaves the box: it is out until `acted`, and nothing else posts meanwhile.
    fn out(&mut self, label: &str, action: Action) -> Option<Action> {
        self.confirming = None;
        self.sent = Some(label.to_string());
        Some(action)
    }

    /// An option pressed: a confirming one asks first and posts on its Confirm; any other posts, with
    /// what the box holds as its text.
    pub fn press(&mut self, id: &str, option: &Opt) -> Option<Action> {
        if self.sent.is_some() {
            return None;
        }
        if option.confirm && self.confirming.as_deref() != Some(option.label.as_str()) {
            self.confirming = Some(option.label.clone());
            return None;
        }
        let action = Action::Reply {
            id: id.to_string(),
            text: self.draft.text.clone(),
            choice: Some(option.label.clone()),
        };
        self.out(&option.label, action)
    }

    /// The showing confirm's Confirm: posts the option it asked about, once.
    pub fn confirm(&mut self, id: &str) -> Option<Action> {
        let label = self.confirming.clone()?;
        self.press(
            id,
            &Opt {
                label,
                confirm: true,
            },
        )
    }

    /// Escape: the confirm is taken back. False when none was showing, so the key goes on.
    pub fn escape(&mut self) -> bool {
        self.confirming.take().is_some()
    }

    /// Reply: the typed text alone; an empty box sends nothing, as the page's required field does.
    pub fn send(&mut self, id: &str) -> Option<Action> {
        if self.sent.is_some() || self.draft.text.trim().is_empty() {
            return None;
        }
        let action = Action::Reply {
            id: id.to_string(),
            text: self.draft.text.clone(),
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

    /// The deck's answer. Taken empties the box; refused keeps every typed word beside the reason.
    pub fn acted(&mut self, acted: Acted) {
        self.sent = None;
        match acted {
            Acted::Taken { .. } => {
                self.draft.replace_text("");
                self.refused = None;
            }
            Acted::Refused { reason } => self.refused = Some(reason),
        }
    }
}

/// Posts `action` off the window's thread, so the press draws in its own frame (spec 6c), and has
/// `poll` look for the answer.
fn post(s: &mut State, action: Option<Action>, tx: &mut Tx) {
    let Some(action) = action else { return };
    let (answer, inbox) = mpsc::channel();
    let spawned = std::thread::Builder::new()
        .name("pilot-deck-reply".into())
        .spawn(move || {
            let _ = answer.send(Client::from_env().and_then(|client| client.act(&action)));
        });
    match spawned {
        Ok(_) => {
            s.regions.reply.answer = Some(inbox);
            tx.wake_after(ANSWER_POLL);
        }
        Err(err) => s.regions.reply.acted(Acted::Refused {
            reason: format!("the reply could not be sent: {err}"),
        }),
    }
}

/// Takes the deck's answer to a press that is out; true when the box changed. An error reaching the
/// deck reads as a refusal in its own words, so the draft stays.
pub fn poll(local: &mut Local, tx: &mut Tx) -> bool {
    let Some(inbox) = &local.answer else {
        return false;
    };
    let acted = match inbox.try_recv() {
        Err(mpsc::TryRecvError::Empty) => {
            tx.wake_after(ANSWER_POLL);
            return false;
        }
        Ok(Ok(acted)) => acted,
        Ok(Err(err)) => Acted::Refused {
            reason: err.to_string(),
        },
        Err(mpsc::TryRecvError::Disconnected) => Acted::Refused {
            reason: "the reply was lost before the deck answered".into(),
        },
    };
    local.answer = None;
    local.acted(acted);
    true
}

fn id_of(s: &State) -> Option<String> {
    s.query.id.clone()
}

/// A press-shaped label on `fill`.
fn button(label: &str, key: String, ink: Color, fill: Color) -> El {
    row()
        .key(key)
        .role("button")
        .label(label)
        .padding(space::pad)
        .fill(fill)
        .child(text(label).font(type_::BODY).color(ink))
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
    let btn = |label: &str, key: String, pressed: bool| {
        button(
            label,
            key,
            t.text,
            if pressed { k.state.pilot } else { k.rule },
        )
    };
    let pressed = |label: &str| local.sent.as_deref() == Some(label);

    if reply.mode == "reopen" {
        return col().key("reply").child(
            btn("Reopen", "reopen".into(), pressed("Reopen")).on_press_tx(
                |s: &mut State, tx: &mut Tx| {
                    let action = id_of(s)
                        .and_then(|id| s.regions.reply.plain("Reopen", Action::Reopen { id }));
                    post(s, action, tx);
                },
            ),
        );
    }
    if reply.mode != "reply" {
        return el();
    }

    let mut options = row().key("reply-options").gap(space::pad);
    for (i, option) in reply.options.into_iter().enumerate() {
        let asking = local.confirming.as_deref() == Some(option.label.as_str());
        let label = option.label.clone();
        // A verdict's option and its confirm are one group: the ask and its Confirm sit beside it.
        let mut group = row().gap(space::within).items_center().child(
            btn(&label, format!("option-{i}"), pressed(&label) || asking).on_press_tx(
                move |s: &mut State, tx: &mut Tx| {
                    let action = id_of(s).and_then(|id| s.regions.reply.press(&id, &option));
                    post(s, action, tx);
                },
            ),
        );
        if asking {
            group = group
                .child(
                    text(format!("Send “{label}”?"))
                        .font(type_::BODY)
                        .color(t.text),
                )
                .child(btn("Confirm", "confirm".into(), false).on_press_tx(
                    |s: &mut State, tx: &mut Tx| {
                        let action = id_of(s).and_then(|id| s.regions.reply.confirm(&id));
                        post(s, action, tx);
                    },
                ));
        }
        options = options.child(group);
    }

    let mut send = row().key("reply-send").gap(space::pad).child(
        btn("Reply", "send".into(), pressed("Reply")).on_press_tx(|s: &mut State, tx: &mut Tx| {
            let action = id_of(s).and_then(|id| s.regions.reply.send(&id));
            post(s, action, tx);
        }),
    );
    if reply.dismiss {
        send = send.child(
            btn("Dismiss", "dismiss".into(), pressed("Dismiss")).on_press_tx(
                |s: &mut State, tx: &mut Tx| {
                    let action = id_of(s).and_then(|id| {
                        s.regions.reply.plain("Dismiss", Action::DismissItem { id })
                    });
                    post(s, action, tx);
                },
            ),
        );
    }

    let mut box_ = col()
        .key("reply")
        .gap(space::within)
        .on_key(|s: &mut State, ev: &rune::KeyEvent, _: &mut Tx| {
            matches!(ev.key, Key::Escape) && s.regions.reply.escape()
        })
        .child(
            text_input(&local.draft, type_::BODY)
                .key("reply-text")
                .label("Reply")
                .placeholder("Reply to the pilot.", k.quiet)
                .on_edit(|s: &mut State| &mut s.regions.reply.draft)
                .padding(space::pad)
                .fill(k.rule),
        )
        .child(options)
        .child(send);
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
