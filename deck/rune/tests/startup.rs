//! ui-design-workflow S2: the window starts on any screen in either mode, by start-up route
//! (spec 7), so `pilot look snap` captures it without driving the mouse.

use pilot_deck::app::Start;
use pilot_deck::client::Query;

fn args(line: &[&str]) -> Vec<String> {
    line.iter().map(|a| a.to_string()).collect()
}

#[test]
fn a_route_and_a_mode_parse_into_the_start_query() {
    let start = Start::from_args(args(&[
        "--open",
        "screen=thread&id=itm_1",
        "--mode",
        "dark",
    ]))
    .unwrap();
    assert_eq!(
        start.query,
        Query {
            screen: "thread".into(),
            id: Some("itm_1".into()),
            ..Query::default()
        }
    );
    assert_eq!(start.dark, Some(true));
    let light = Start::from_args(args(&["--mode", "light"])).unwrap();
    assert_eq!(light.dark, Some(false));
    assert_eq!(light.query, Query::default());
}

#[test]
fn no_flags_start_on_home_in_the_system_mode() {
    let start = Start::from_args(Vec::new()).unwrap();
    assert_eq!(start.query, Query::default());
    assert_eq!(start.dark, None);
}

#[test]
fn every_query_field_rides_the_route() {
    let start =
        Start::from_args(args(&["--open", "screen=items&run=r1&all=1&ticket=itm_t"])).unwrap();
    assert_eq!(
        start.query,
        Query {
            screen: "items".into(),
            run: Some("r1".into()),
            all: true,
            ticket: Some("itm_t".into()),
            id: None,
        }
    );
}

#[test]
fn an_unknown_flag_value_is_refused() {
    let err = Start::from_args(args(&["--mode", "sepia"])).unwrap_err();
    assert!(err.contains("light") && err.contains("dark"), "{err}");
}

#[test]
fn rune_flags_pass_untouched() {
    let start = Start::from_args(args(&[
        "--snap", "out.png", "--mode", "light", "--tree", "t.json",
    ]))
    .unwrap();
    assert_eq!(start.dark, Some(false));
    assert_eq!(start.query, Query::default());
}

#[test]
fn rune_reads_its_own_flags_and_the_mode_as_its_theme() {
    let line = args(&[
        "--open",
        "screen=items",
        "--snap",
        "out.png",
        "--mode",
        "light",
        "--tree",
        "t.json",
    ]);
    let start = Start::from_args(line.clone()).unwrap();
    assert_eq!(
        start.rune_args(line),
        args(&["--snap", "out.png", "--tree", "t.json", "--theme", "light"])
    );
    let system = Start::from_args(args(&["--snap", "out.png"])).unwrap();
    assert_eq!(
        system.rune_args(args(&["--snap", "out.png"])),
        args(&["--snap", "out.png"])
    );
}

#[test]
fn a_bad_route_is_refused() {
    for bad in [
        &["--open"][..],
        &["--mode"],
        &["--open", "screen=nowhere"],
        &["--open", "screen=thread&colour=red"],
        &["--open", "screen=thread&id=a&id=b"],
        &["--open", "id"],
        &["--open", "screen=thread&id="],
        &["--open", "screen=home&all=maybe"],
        &["--open", "screen=home", "--open", "screen=items"],
    ] {
        assert!(Start::from_args(args(bad)).is_err(), "{bad:?} was accepted");
    }
}
