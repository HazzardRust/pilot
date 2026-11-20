//! rune-deck-ui S9: the reply box's own state, `reply::Local` (spec 3, 5, 6c). A verdict's option takes
//! two presses, a refused reply keeps its words (the ADR 0096 bug), and a taken one empties the box.

mod support;

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
            regions: [("thread".to_string(), thread_with_next(other))]
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
            regions: [
                ("thread".to_string(), thread_with_next(&next)),
                ("reply".to_string(), reply),
            ]
            .into_iter()
            .collect(),
        },
        query: Query {
            id: Some(shown.clone()),
            ..Query::default()
        },
        ..State::default()
    };
    let mut rt = rune::Runtime::new(state, app::view, (1280.0, 800.0), rune::Env::new(true, 1.0));
    rt.frame(0.0);
    // The arrow moves the query on; the window still shows the first thread until its view arrives.
    click(&mut rt, |element| element.text.as_deref() == Some("›"));
    // SAFETY: no other test in this binary touches the environment.
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

    assert_eq!(
        (replies(&shown), replies(&next)),
        (1, 0),
        "the press posts to the thread drawn, not the one moved to"
    );
}
