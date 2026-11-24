//! rune-deck-ui S39: back and forward through the screens the window has been on, by the mouse's
//! side buttons and Alt+Left / Alt+Right (spec 25).

use pilot_deck::app::{self, State};
use pilot_deck::client::Query;
use pilot_deck::regions;
use rune::{Cx, El, Env, Key, KeyEvent, Mods, PointerButton, Runtime, col, el, text_input};

fn at(id: &str) -> Query {
    Query {
        id: Some(id.into()),
        ..Query::default()
    }
}

#[test]
fn history_goes_back_and_forward_and_a_new_visit_clears_forward() {
    let mut s = State::default();
    let (a, b, c) = (Query::default(), at("b"), at("c"));
    app::go(&mut s, b.clone());
    app::go(&mut s, c.clone());
    assert_eq!(s.query, c);

    app::back(&mut s);
    assert_eq!(s.query, b);
    app::back(&mut s);
    assert_eq!(s.query, a);
    app::back(&mut s);
    assert_eq!(s.query, a, "back at the first screen stays");

    app::forward(&mut s);
    assert_eq!(s.query, b);

    // A new visit from B drops C from the forward side.
    let d = at("d");
    app::go(&mut s, d.clone());
    app::forward(&mut s);
    assert_eq!(s.query, d, "forward with nothing ahead stays");
    app::back(&mut s);
    assert_eq!(s.query, b);
    app::back(&mut s);
    assert_eq!(s.query, a);
}

#[test]
fn going_to_the_screen_already_open_adds_no_step() {
    let mut s = State::default();
    app::go(&mut s, Query::default());
    app::go(&mut s, at("b"));
    app::back(&mut s);
    assert_eq!(s.query, Query::default());
    app::back(&mut s);
    assert_eq!(s.query, Query::default());
}

fn plain(_: &State, _: &mut Cx<State>) -> El {
    app::mouse_nav(el().w_full().h_full())
}

fn with_field(s: &State, cx: &mut Cx<State>) -> El {
    col().child(plain(s, cx)).child(
        text_input(&s.regions.reply.draft, rune::tok::type_::BODY)
            .key("field")
            .label("Reply")
            .on_edit(|s: &mut State| &mut s.regions.reply.draft),
    )
}

fn window(draw: fn(&State, &mut Cx<State>) -> El) -> Runtime<State> {
    let mut s = State::default();
    app::go(&mut s, at("b"));
    let mut rt = Runtime::new(s, draw, (400.0, 300.0), Env::new(true, 1.0));
    rt.on_key = app::spec().on_key;
    rt.frame(0.0);
    rt
}

fn alt(rt: &mut Runtime<State>, key: Key) {
    rt.key(KeyEvent {
        key,
        mods: Mods {
            alt: true,
            ..Mods::default()
        },
    });
    rt.frame(0.0);
}

#[test]
fn alt_left_and_alt_right_move_back_and_forward() {
    let mut rt = window(plain);
    alt(&mut rt, Key::Left);
    assert_eq!(rt.state.query, Query::default());
    alt(&mut rt, Key::Right);
    assert_eq!(rt.state.query, at("b"));
}

#[test]
fn alt_arrows_do_nothing_while_a_field_holds_the_key() {
    let mut rt = window(with_field);
    rt.key(KeyEvent {
        key: Key::Tab,
        mods: Mods::default(),
    });
    rt.frame(0.0);
    assert!(rt.has_focus(), "the field holds focus");
    alt(&mut rt, Key::Left);
    assert_eq!(rt.state.query, at("b"), "Alt+Left in a field goes nowhere");
}

#[test]
fn the_mouse_side_buttons_move_back_and_forward() {
    let mut rt = window(plain);
    let click = |rt: &mut Runtime<State>, b: PointerButton| {
        rt.button_down(100.0, 100.0, b);
        rt.button_up(100.0, 100.0, b);
        rt.frame(0.0);
    };
    click(&mut rt, PointerButton::Back);
    assert_eq!(rt.state.query, Query::default());
    click(&mut rt, PointerButton::Forward);
    assert_eq!(rt.state.query, at("b"));
}

#[test]
fn the_other_ways_to_change_screen_are_steps_too() {
    let mut s = State::default();
    regions::tabs::select(&mut s, Some("run".into()));
    regions::status::choose(&mut s, "tkt");
    let (deck, chosen) = (s.query.run.clone(), s.query.ticket.clone());
    assert_eq!(
        (deck.as_deref(), chosen.as_deref()),
        (Some("run"), Some("tkt"))
    );
    app::back(&mut s);
    assert_eq!(s.query.ticket, None, "back leaves the chosen ticket");
    assert_eq!(s.query.run.as_deref(), Some("run"));
    app::back(&mut s);
    assert_eq!(s.query, Query::default(), "back leaves the chosen deck");
}

fn over_children(_: &State, _: &mut Cx<State>) -> El {
    app::mouse_nav(
        col()
            .w_full()
            .h_full()
            .child(el().size(100.0, 100.0))
            .child(el().size(100.0, 100.0).on_press(|_: &mut State| {})),
    )
}

#[test]
fn a_side_button_pressed_over_a_child_still_goes_back() {
    for y in [50.0, 150.0] {
        let mut rt = window(over_children);
        rt.button_down(50.0, y, PointerButton::Back);
        rt.button_up(50.0, y, PointerButton::Back);
        rt.frame(0.0);
        assert_eq!(rt.state.query, Query::default(), "over the child at y {y}");
    }
}
