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
use crate::theme::{self, space};

/// The `act::send` key of the box's one press that is out.
const SEND: &str = "reply-press";

/// One option the user can press, as `replyView` lists it.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct Opt {
    pub label: String,
    pub confirm: bool,
    /// The page draws it disabled: the thread already holds a press. Drawn pressed; it posts nothing.
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
    pub draft: TextEdit,
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
}

impl Local {
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
            text: self.draft.text.clone(),
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
                if posted.as_deref() == Some(self.draft.text.as_str()) {
                    self.draft.replace_text("");
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
    let ink = |pressed: bool| {
        if pressed {
            theme::pressed_ink(dark)
        } else {
            t.text
        }
    };
    let btn = |label: &str, key: String, pressed: bool| {
        let fill = if pressed { k.state.pilot } else { k.rule };
        theme::control(button(label, key, ink(pressed), fill), dark)
    };
    let r = theme::roles(dark);
    // A quiet button: the page's ink and a hairline, never a fill unless pressed in.
    let quiet_btn = |label: &str, key: String, pressed: bool| {
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

    let mut options = row().key("reply-options").gap(space::pad);
    for (i, option) in reply.options.into_iter().enumerate() {
        // An option locked since its ask (a refresh brought another surface's press) draws no Confirm.
        let asking = !local.closing
            && !option.locked
            && local.confirming.as_deref() == Some(option.label.as_str());
        let label = option.label.clone();
        // A verdict's option and its confirm are one group: the ask and its Confirm sit beside it.
        let lit = pressed(&label) || asking || option.locked;
        // Its Confirm is the option pressed again while armed, so `press`'s lock guard holds there too.
        let again = option.clone();
        let (at, again_at) = (id.clone(), id.clone());
        let mut face = btn(&label, format!("option-{i}"), lit);
        if option.recommended {
            face = face.gap(space::within).child(
                text("(recommended)")
                    .key(format!("option-{i}-recommended"))
                    .font(type_::BODY)
                    .color(k.quiet),
            );
        }
        let mut group =
            row()
                .gap(space::within)
                .items_center()
                .child(face.on_press(move |s: &mut State| {
                    let action = s.regions.reply.press(&at, &option);
                    post(s, action);
                }));
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
    // Reply, the one primary button, at the bottom right; Close and Dismiss are quiet, on the left,
    // each with its confirm beside it.
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
    let mut quiet = row().key("reply-quiet").gap(space::pad).items_center();
    if let Some(close) = reply.close {
        let (confirm, at, confirm_at) = (close.confirm, id.clone(), id.clone());
        quiet = quiet.child(
            quiet_btn(CLOSE, "close".into(), pressed(CLOSE) || local.closing).on_press(
                move |s: &mut State| {
                    let action = s.regions.reply.close(&at, confirm);
                    post(s, action);
                },
            ),
        );
        if local.closing {
            quiet = quiet
                .child(theme::content(
                    text("Close this thread?").font(type_::BODY).color(t.text),
                    dark,
                ))
                .child(
                    quiet_btn("Confirm", "close-confirm".into(), false).on_press(
                        move |s: &mut State| {
                            let action = s.regions.reply.confirm(&confirm_at);
                            post(s, action);
                        },
                    ),
                );
        }
    }
    if reply.dismiss {
        quiet = quiet.child(
            quiet_btn("Dismiss", "dismiss".into(), pressed("Dismiss")).on_press(
                move |s: &mut State| {
                    let action = s
                        .regions
                        .reply
                        .plain("Dismiss", Action::DismissItem { id: id.clone() });
                    post(s, action);
                },
            ),
        );
    }
    let send = row()
        .key("reply-send")
        .items_center()
        .child(quiet)
        .child(el().grow(1.0))
        .child(reply_button);

    let mut box_ = col()
        .key("reply")
        .gap(space::within)
        .on_key(|s: &mut State, ev: &rune::KeyEvent, _: &mut Tx| {
            matches!(ev.key, Key::Escape) && s.regions.reply.escape()
        })
        // The page's hairline above the box (deck.css:225).
        .child(theme::separator(dark))
        .child(options)
        .child(
            text_input(&local.draft, type_::BODY)
                .key("reply-text")
                .label("Reply")
                .placeholder("Reply to the pilot.", k.quiet)
                .on_edit(|s: &mut State| &mut s.regions.reply.draft)
                .padding(space::pad)
                .radius(theme::radius::button)
                .fill(k.rule),
        )
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
