//! rune-deck-ui S9: the reply box's own state, `reply::Local` (spec 3, 5, 6c). A verdict's option takes
//! two presses, a refused reply keeps its words (the ADR 0096 bug), and a taken one empties the box.

use crate::support;

use pilot_deck::act::{Acted, Action};
use pilot_deck::regions::reply::{Local, Opt};
use rune::TextEdit;

const ID: &str = "itm_000000000001";

fn sign_off() -> Opt {
    Opt {
        label: "Sign off".into(),
        confirm: true,
        locked: false,
        recommended: false,
    }
}

fn typed(words: &str) -> Local {
    let mut local = Local::default();
    local.draft = TextEdit::new(words);
    local
}

fn reply(text: &str, choice: Option<&str>) -> Action {
    Action::Reply {
        id: ID.into(),
        text: text.into(),
        choice: choice.map(str::to_string),
    }
}

#[test]
fn a_confirm_takes_two_presses() {
    let mut local = typed("all good");

    // The first press asks, and posts nothing.
    assert_eq!(local.press(ID, &sign_off()), None);
    assert_eq!(local.confirming.as_deref(), Some("Sign off"));

    // Escape takes the ask back; the next press asks again.
    assert!(local.escape());
    assert_eq!(local.confirming, None);
    assert_eq!(local.press(ID, &sign_off()), None);

    // Confirm posts, once: a second Confirm while it is out posts nothing.
    assert_eq!(local.confirm(ID), Some(reply("all good", Some("Sign off"))));
    assert_eq!(local.confirming, None);
    assert_eq!(local.sent.as_deref(), Some("Sign off"));
    assert_eq!(local.confirm(ID), None);
    assert_eq!(local.press(ID, &sign_off()), None);
    assert_eq!(local.confirming, None);
}

#[test]
fn a_confirm_asked_on_one_thread_posts_nothing_on_another() {
    let mut local = typed("");
    assert_eq!(local.press(ID, &sign_off()), None);
    // The user moves to another thread with the same option: its Confirm is not the first one's.
    let other = "itm_000000000002";
    assert_eq!(local.confirm(other), None);
    assert_eq!(local.confirming, None);
    assert_eq!(local.press(ID, &sign_off()), None);
    assert_eq!(local.press(other, &sign_off()), None);
    assert_eq!(local.sent, None);
}

#[test]
fn an_option_with_no_confirm_posts_on_one_press() {
    let mut local = typed("");
    let yes = Opt {
        label: "Yes".into(),
        confirm: false,
        locked: false,
        recommended: false,
    };
    assert_eq!(local.press(ID, &yes), Some(reply("", Some("Yes"))));
    assert_eq!(local.confirming, None);
}

#[test]
fn a_locked_option_posts_nothing_and_asks_nothing() {
    let mut local = typed("");
    let signed = Opt {
        locked: true,
        ..sign_off()
    };
    assert_eq!(local.press(ID, &signed), None);
    assert_eq!(local.confirming, None);
    assert_eq!(local.confirm(ID), None);
    assert_eq!(local.sent, None);
}

#[test]
fn close_takes_two_presses_and_posts_a_close() {
    let mut local = typed("a note that is not the close");
    assert_eq!(local.close(ID, true), None);
    assert_eq!(local.confirming.as_deref(), Some("Close"));
    assert_eq!(local.confirm(ID), Some(Action::Close { id: ID.into() }));
    assert_eq!(local.sent.as_deref(), Some("Close"));
    // A close taken is not the box's text taken: the words stay.
    local.acted(Acted::Taken {
        location: format!("/thread/{ID}"),
    });
    assert_eq!(local.draft.text, "a note that is not the close");
}

#[test]
fn an_option_asked_over_a_showing_close_asks_for_itself() {
    let mut local = typed("");
    assert_eq!(local.close(ID, true), None);
    assert_eq!(local.press(ID, &sign_off()), None);
    assert_eq!(local.confirming.as_deref(), Some("Sign off"));
    // The Confirm now posts the option, never the Close it replaced.
    assert_eq!(local.confirm(ID), Some(reply("", Some("Sign off"))));
}

#[test]
fn an_option_locked_after_its_ask_posts_nothing() {
    let mut local = typed("");
    assert_eq!(local.press(ID, &sign_off()), None);
    let signed = Opt {
        locked: true,
        ..sign_off()
    };
    assert_eq!(local.press(ID, &signed), None);
    assert_eq!(local.sent, None);
}

#[test]
fn a_taken_reply_keeps_what_was_typed_after_it() {
    let mut local = typed("done");
    assert!(local.send(ID).is_some());
    local.draft = TextEdit::new("done, and one more thing");
    local.acted(Acted::Taken {
        location: format!("/thread/{ID}"),
    });
    assert_eq!(local.draft.text, "done, and one more thing");
}

#[test]
fn an_empty_box_sends_nothing() {
    let mut local = typed("   ");
    assert_eq!(local.send(ID), None);
    assert_eq!(local.sent, None);
}

#[test]
fn a_refused_reply_keeps_its_words() {
    let mut local = typed("half a thought, typed with care");
    assert_eq!(
        local.send(ID),
        Some(reply("half a thought, typed with care", None))
    );
    local.acted(Acted::Refused {
        reason: "Sign off needs the deck's own page.".into(),
    });
    assert_eq!(local.draft.text, "half a thought, typed with care");
    assert_eq!(
        local.refused.as_deref(),
        Some("Sign off needs the deck's own page.")
    );
    // Out of flight again: the user can press once more.
    assert_eq!(local.sent, None);
}

#[test]
fn a_sent_reply_empties_the_box() {
    let mut local = typed("done");
    local.refused = Some("an earlier refusal".into());
    assert!(local.send(ID).is_some());
    local.acted(Acted::Taken {
        location: format!("/thread/{ID}"),
    });
    assert_eq!(local.draft.text, "");
    assert_eq!(local.refused, None);
    assert_eq!(local.sent, None);
}

/// reply-markdown spec 3: the preview styles by decoration only, so what is sent is the typed
/// text byte for byte, after the caret has moved and the lines have re-rendered.
#[test]
fn the_sent_text_is_the_typed_text() {
    let typed_text = "**a**\n# b";
    let mut local = typed(typed_text);
    local.draft.focused = true;
    local.draft.set_caret(typed_text.len());
    pilot_deck::preview::spans(&local.draft, false);
    local.draft.set_caret(0);
    pilot_deck::preview::spans(&local.draft, false);
    assert_eq!(local.send(ID), Some(reply(typed_text, None)));
}

/// reply-markdown spec 4: a link in the draft renders as the thread draws one, and a press on it
/// only moves the caret: no opener, no post.
#[test]
fn a_link_renders_as_a_link_and_is_never_followed() {
    // 0 `[`, 1 `t`, 2..16 `](https://e.x)`, 16 `\n`, 17 `x`.
    let draft = "[t](https://e.x)\nx";
    let mut caret_below = TextEdit::new(draft);
    caret_below.focused = true;
    caret_below.set_caret(17);
    let spans = pilot_deck::preview::spans(&caret_below, true);
    let kit = rune_kit::Kit::neutral(true);
    let (accent, underline) = (kit.c.text_accent, kit.alpha(kit.c.text_accent, 0.4));
    let quiet = pilot_deck::theme::tokens(true).quiet;
    let over = |at: std::ops::Range<u32>| {
        spans
            .iter()
            .find(|s| s.start == at.start && s.end == at.end)
    };
    assert!(
        over(1..2).is_some_and(|s| s.color == Some(accent) && s.underline == Some(underline)),
        "t in the link colour, underlined: {spans:?}"
    );
    for marker in [0..1, 2..16] {
        assert!(
            over(marker.clone()).is_some_and(|s| s.color == Some(quiet)),
            "quiet {marker:?}: {spans:?}"
        );
    }

    let mut rt = box_drawn(typed(draft));
    let field = at(&rt, "reply-text");
    let (x, y) = (
        field.rect[0] + pilot_deck::theme::space::pad + 5.0,
        field.rect[1] + pilot_deck::theme::space::pad + 6.0,
    );
    rt.pointer_move(x, y);
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
    rt.frame(1.0 / 60.0);
    rt.update(|s, _| {
        let reply = &s.regions.reply;
        assert!(
            (1..=2).contains(&reply.draft.focus),
            "the press landed on t: caret at {}",
            reply.draft.focus
        );
        assert_eq!(reply.draft.text, draft, "the draft is unchanged");
        assert!(!s.pending.is_sent("reply-press"), "nothing posted");
        assert_eq!(reply.sent, None);
        assert_eq!(reply.confirming, None);
    });
}

#[test]
fn the_recommended_option_draws_the_pages_quiet_mark() {
    use pilot_deck::app::{self, State};
    use pilot_deck::client::View;

    let option = |label: &str, recommended: bool| serde_json::json!({ "label": label, "confirm": false, "locked": false, "recommended": recommended });
    let reply = serde_json::json!({ "mode": "reply", "id": ID, "options": [option("Yes", false), option("No", true)] });
    let state = State {
        view: View {
            screen: "thread".into(),
            seq: 1,
            regions: [("reply".to_string(), reply)].into_iter().collect(),
        },
        ..State::default()
    };
    let mut rt = rune::Runtime::new(state, app::view, (1280.0, 800.0), rune::Env::new(true, 1.0));
    rt.frame(0.0);

    let marks: Vec<_> = rt
        .elements()
        .into_iter()
        .filter(|element| element.text.as_deref() == Some("(recommended)"))
        .collect();
    assert_eq!(marks.len(), 1, "one mark, on the recommended option");
    assert_eq!(marks[0].key.as_deref(), Some("option-1-recommended"));
    assert_eq!(
        marks[0].text_color,
        Some(pilot_deck::theme::tokens(true).quiet)
    );
}

/// A thread drawn with a next arrow to `next`, as `deck/view/thread.mjs` shapes the region.
fn thread_with_next(next: &str) -> serde_json::Value {
    serde_json::json!({
        "title": "Which port?",
        "kindLine": { "accent": "", "state": "", "tone": "", "kind": "question", "at": "", "owner": "" },
        "nav": { "next": { "id": next } },
        "body": "",
    })
}

#[test]
fn moving_to_another_thread_gives_it_a_box_of_its_own() {
    use pilot_deck::app::{self, State};
    use pilot_deck::client::{Query, View};

    let other = "itm_000000000002";
    let mut state = State {
        view: View {
            screen: "thread".into(),
            seq: 1,
            regions: [
                ("thread".to_string(), thread_with_next(other)),
                (
                    "reply".to_string(),
                    serde_json::json!({ "mode": "reply", "id": ID, "options": [] }),
                ),
            ]
            .into_iter()
            .collect(),
        },
        query: Query {
            id: Some(ID.into()),
            ..Query::default()
        },
        ..State::default()
    };
    // Words for this thread, an ask showing on it, a refusal and a press out.
    state.regions.reply = typed("for the first thread only");
    assert_eq!(state.regions.reply.press(ID, &sign_off()), None);
    state.regions.reply.refused = Some("an earlier refusal".into());
    state.regions.reply.sent = Some("Reply".into());
    let mut rt = rune::Runtime::new(state, app::view, (1280.0, 800.0), rune::Env::new(true, 1.0));
    rt.frame(0.0);

    let next = rt
        .elements()
        .into_iter()
        .find(|element| element.text.as_deref() == Some("›"))
        .expect("the next arrow is drawn");
    let (x, y) = (
        next.rect[0] + next.rect[2] / 2.0,
        next.rect[1] + next.rect[3] / 2.0,
    );
    rt.pointer_move(x, y);
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
    rt.frame(1.0 / 60.0);

    // Until the next thread's view arrives no box is drawn, so nothing is typed into the first's.
    assert!(
        !rt.elements()
            .iter()
            .any(|element| !element.exiting && element.key.as_deref() == Some("reply-text"))
    );
    rt.update(|s, _| {
        assert_eq!(
            s.query.id.as_deref(),
            Some(other),
            "the arrow moved the thread"
        );
        let reply = &mut s.regions.reply;
        assert_eq!(reply.draft.text, "", "the first thread's words stay behind");
        assert_eq!(reply.confirming, None);
        assert_eq!(reply.refused, None);
        assert_eq!(reply.sent, None);
        // Its Confirm, pressed now, posts nothing on the new thread.
        assert_eq!(reply.confirm(other), None);
    });
}

/// Presses the first element `matches` picks, at its centre, and draws the next frame.
fn click(
    rt: &mut rune::Runtime<pilot_deck::app::State>,
    matches: impl Fn(&rune::runtime::ElementInfo) -> bool,
) {
    let at = rt
        .elements()
        .into_iter()
        .find(|element| matches(element))
        .expect("drawn")
        .rect;
    let (x, y) = (at[0] + at[2] / 2.0, at[1] + at[3] / 2.0);
    rt.pointer_move(x, y);
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
    rt.frame(1.0 / 60.0);
}

#[test]
fn a_press_on_a_view_not_yet_refreshed_posts_to_the_thread_it_shows() {
    use pilot_deck::app::{self, State};
    use pilot_deck::client::{Query, View};

    let deck = support::Scratch::start();
    let (shown, next) = (
        support::question(&deck, "C:/work/alpha"),
        support::question(&deck, "C:/work/alpha"),
    );
    let option = serde_json::json!({ "label": "A", "confirm": false, "locked": false, "recommended": false });
    let reply = serde_json::json!({ "mode": "reply", "id": shown, "options": [option] });
    let state = State {
        view: View {
            screen: "thread".into(),
            seq: 1,
            regions: [("reply".to_string(), reply)].into_iter().collect(),
        },
        // The query has moved on to the next thread, and a view read for the first one has landed
        // after it (a refetch already under way when the arrow was pressed).
        query: Query {
            id: Some(next.clone()),
            ..Query::default()
        },
        ..State::default()
    };
    let mut rt = rune::Runtime::new(state, app::view, (1280.0, 800.0), rune::Env::new(true, 1.0));
    rt.frame(0.0);
    let held = support::ENV
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    // SAFETY: every test that touches the environment holds `support::ENV`.
    unsafe {
        std::env::set_var("PILOT_DECK_DIR", &deck.dir);
        std::env::set_var("PILOT_DECK_PORT", deck.port.to_string());
    }
    click(&mut rt, |element| {
        element.key.as_deref() == Some("option-0")
    });
    let start = std::time::Instant::now();
    let replies = |id: &str| {
        support::item(&deck, id)["replies"]
            .as_array()
            .map_or(0, Vec::len)
    };
    while replies(&shown) + replies(&next) == 0
        && start.elapsed() < std::time::Duration::from_secs(3)
    {
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
    unsafe {
        std::env::remove_var("PILOT_DECK_DIR");
        std::env::remove_var("PILOT_DECK_PORT");
    }
    drop(held);

    assert_eq!(
        (replies(&shown), replies(&next)),
        (1, 0),
        "the press posts to the thread drawn, not the one moved to"
    );
}

/// A reply box drawn with two options, Close and Dismiss, in the dark window.
fn box_drawn(local: Local) -> rune::Runtime<pilot_deck::app::State> {
    box_with(local, &["Yes", "No"], true)
}

/// A reply box with `labels` for options and Close, Dismiss on `dismiss`, in the dark window.
fn box_with(local: Local, labels: &[&str], dismiss: bool) -> rune::Runtime<pilot_deck::app::State> {
    box_of(local, labels, dismiss, false)
}

/// `box_with`, its options `locked` as an answered thread's are.
fn box_of(
    local: Local,
    labels: &[&str],
    dismiss: bool,
    locked: bool,
) -> rune::Runtime<pilot_deck::app::State> {
    use pilot_deck::app::{self, State};
    use pilot_deck::client::View;

    let option = |label: &str| serde_json::json!({ "label": label, "confirm": false, "locked": locked, "recommended": false });
    let options: Vec<_> = labels.iter().map(|label| option(label)).collect();
    let reply = serde_json::json!({
        "mode": "reply", "id": ID, "options": options,
        "close": { "confirm": true }, "dismiss": dismiss,
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

/// The walkthrough of 2026-11-21: under the input, Reply at the box's left edge and Close beside it,
/// as the page's `.send` row; the options and Dismiss one group at the right, on the same line.
#[test]
fn reply_layout() {
    let rt = box_drawn(Local::default());
    let input = at(&rt, "reply-text");
    assert_eq!(input.radius, pilot_deck::theme::radius::button);

    let (send, close, dismiss) = (at(&rt, "send"), at(&rt, "close"), at(&rt, "dismiss"));
    let options = at(&rt, "reply-options");
    for (name, e) in [("Reply", &send), ("Close", &close), ("options", &options)] {
        assert!(
            e.rect[1] > input.rect[1] + input.rect[3] - 1.0
                && e.rect[1] <= input.rect[1] + input.rect[3] + 40.0,
            "{name} is in the row under the input"
        );
    }
    assert!(
        (send.rect[0] - input.rect[0]).abs() < 0.5,
        "Reply is at the box's left edge"
    );
    assert!(
        send.rect[0] < close.rect[0] && close.rect[0] < options.rect[0],
        "Reply, then Close, then the rest"
    );
    assert!(
        (dismiss.rect[0] + dismiss.rect[2] - (input.rect[0] + input.rect[2])).abs() < 0.5,
        "the rest end at the box's right edge"
    );

    // Only Reply takes the primary role; every other button is the card's: one fill, one hairline.
    let primary = pilot_deck::theme::roles(true).primary;
    let others = ["close", "dismiss", "option-0", "option-1"].map(|key| at(&rt, key));
    assert_eq!(send.fill, primary);
    for e in &others {
        assert_eq!(
            e.fill, others[0].fill,
            "{:?} is not dressed as Close",
            e.key
        );
        assert_eq!(
            e.text_color, others[0].text_color,
            "{:?} is not inked as Close",
            e.key
        );
        assert_ne!(e.fill, primary, "{:?} is filled as Reply", e.key);
    }
}

/// The user's note: an answered thread's options are drawn as Close is, not greyed; they still take
/// no press (`a_locked_option_posts_nothing_and_asks_nothing`).
#[test]
fn a_locked_option_is_drawn_as_close() {
    let rt = box_of(Local::default(), &["Yes", "No"], true, true);
    let close = at(&rt, "close");
    for key in ["option-0", "option-1", "dismiss"] {
        let e = at(&rt, key);
        assert_eq!(e.opacity, close.opacity, "{key} is dimmed");
        assert_eq!(
            e.text_color, close.text_color,
            "{key} is not inked as Close"
        );
    }
}

/// Close and Reply stand in one place whatever the thread offers besides them.
#[test]
fn close_and_reply_do_not_move_with_the_options() {
    let none = box_with(Local::default(), &[], false);
    let many = box_with(
        Local::default(),
        &["ship", "hold", "Teach me", "later"],
        true,
    );
    for key in ["send", "close"] {
        assert_eq!(at(&none, key).rect, at(&many, key).rect, "{key} moved");
    }
}

/// Tab from the box lands on Reply first, so a typed reply goes with Tab then Enter.
#[test]
fn tab_from_the_box_reaches_reply_first() {
    let mut rt = box_drawn(Local::default());
    let field = at(&rt, "reply-text");
    let (x, y) = (field.rect[0] + 4.0, field.rect[1] + field.rect[3] / 2.0);
    rt.pointer_move(x, y);
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
    rt.frame(1.0 / 60.0);
    rt.key(rune::KeyEvent {
        key: rune::Key::Tab,
        mods: rune::Mods::default(),
    });
    rt.frame(1.0 / 60.0);
    let focused = rt
        .elements()
        .into_iter()
        .find(|e| e.focused)
        .and_then(|e| e.key);
    assert_eq!(focused.as_deref(), Some("send"));
}

#[test]
fn inline_confirm() {
    let mut local = Local::default();
    assert_eq!(local.close(ID, true), None);
    let rt = box_drawn(local);
    let (close, confirm) = (at(&rt, "close"), at(&rt, "close-confirm"));
    assert!(
        (close.rect[1] - confirm.rect[1]).abs() < 8.0
            && confirm.rect[0] >= close.rect[0] + close.rect[2],
        "the confirm sits on the Close button's row, to its right: {:?} {:?}",
        close.rect,
        confirm.rect
    );
    assert_eq!(
        confirm.parent, close.parent,
        "a sibling of Close, in no new row"
    );
}

/// The user, 2026-11-21: the reply box "start with more lines, like 5, rather than just the
/// singular line", and "when i type an extremely long word it forgets to wrap".
#[test]
fn the_box_starts_five_lines_tall_and_wraps_a_long_word() {
    use pilot_deck::theme::{space, type_};
    let line = if type_::BODY.line_height > 0.0 {
        type_::BODY.line_height
    } else {
        1.25 * type_::BODY.size
    };
    let five = 5.0 * line + 2.0 * space::pad;
    let empty = at(&box_drawn(Local::default()), "reply-text").rect;
    assert!(
        (empty[3] - five).abs() < 1.0,
        "the empty box is {} tall, not five lines ({five})",
        empty[3]
    );

    let word = "a".repeat(1200);
    let long = at(&box_drawn(typed(&word)), "reply-text").rect;
    assert!(
        long[2] <= empty[2] + 0.5,
        "the word widened the box to {}, past {}",
        long[2],
        empty[2]
    );
    assert!(
        long[3] > five + line,
        "the word did not wrap: the box is {} tall",
        long[3]
    );
}

/// The walkthrough of 2026-11-21: the thread's kind line is the page's, its parts a middle dot
/// apart, and `‹ code ›` sits on the centre of the line.
#[test]
fn the_kind_line_is_dotted_and_the_pager_centred() {
    use pilot_deck::app::{self, State};
    use pilot_deck::client::View;

    let thread = serde_json::json!({
        "title": "A thread", "body": "Words.",
        "kindLine": { "accent": "blue", "state": "not picked up yet", "tone": "waiting",
            "kind": "question", "at": "2026-11-20T11:20:00Z", "owner": "pilot" },
        "nav": { "prev": { "id": "itm_a" }, "code": "D1", "next": { "id": "itm_b" }, "position": "1/4" },
    });
    let state = State {
        view: View {
            screen: "thread".into(),
            seq: 1,
            regions: [("thread".to_string(), thread)].into_iter().collect(),
        },
        ..State::default()
    };
    let mut rt = rune::Runtime::new(state, app::view, (1280.0, 800.0), rune::Env::new(true, 1.0));
    rt.frame(1.0);

    let kind = at(&rt, "kind");
    let all = rt.elements();
    let dots = all
        .iter()
        .filter(|e| e.text.as_deref() == Some("·"))
        .filter(|e| e.parent.is_some_and(|p| all[p].path == kind.path))
        .count();
    assert_eq!(dots, 3, "state · kind · time · owner");

    let (nav, line) = (at(&rt, "nav"), at(&rt, "thread-head"));
    let middle = |r: [f32; 4]| r[0] + r[2] / 2.0;
    assert!(
        (middle(nav.rect) - middle(line.rect)).abs() < 1.0,
        "the pager at {} is not on the line's centre {}",
        middle(nav.rect),
        middle(line.rect)
    );
}
