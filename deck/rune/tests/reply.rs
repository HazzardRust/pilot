//! rune-deck-ui S9: the reply box's own state, `reply::Local` (spec 3, 5, 6c). A verdict's option takes
//! two presses, a refused reply keeps its words (the ADR 0096 bug), and a taken one empties the box.

use pilot_deck::act::{Acted, Action};
use pilot_deck::regions::reply::{Local, Opt};
use rune::TextEdit;

const ID: &str = "itm_000000000001";

fn sign_off() -> Opt {
    Opt {
        label: "Sign off".into(),
        confirm: true,
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
fn an_option_with_no_confirm_posts_on_one_press() {
    let mut local = typed("");
    let yes = Opt {
        label: "Yes".into(),
        confirm: false,
    };
    assert_eq!(local.press(ID, &yes), Some(reply("", Some("Yes"))));
    assert_eq!(local.confirming, None);
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
