//! rune-deck-ui S33: the deck draws in three type scales and no other (header 13, body 13, caption 11).

use crate::support;

use std::fs;
use std::path::{Path, PathBuf};

use pilot_deck::app::{self, State};
use pilot_deck::client::Query;
use rune::{Env, Runtime};

/// The line heights of the three scales (Rune's default is 1.25 x the size) and the markdown's 20.
const LINES: [f32; 3] = [16.25, 13.75, 20.0];

fn on_a_scale(height: f32) -> bool {
    LINES.iter().any(|line| {
        let n = height / line;
        n >= 0.99 && (n - n.round()).abs() * line < 0.06
    })
}

fn stray_texts(rt: &Runtime<State>) -> Vec<String> {
    rt.elements()
        .into_iter()
        .filter(|e| !e.exiting)
        .filter(|e| e.text.as_deref().is_some_and(|t| !t.trim().is_empty()))
        .filter(|e| !on_a_scale(e.rect[3]))
        .map(|e| format!("{:?} is {} tall", e.text.unwrap_or_default(), e.rect[3]))
        .collect()
}

fn window(deck: &support::Scratch, query: &Query) -> Runtime<State> {
    let view = support::client_for(deck).view(query).expect("a view");
    let mut rt = Runtime::new(
        State {
            view,
            query: query.clone(),
            ..State::default()
        },
        app::view,
        (1280.0, 800.0),
        Env::new(true, 1.0),
    );
    rt.frame(0.0);
    rt
}

#[test]
fn every_text_in_the_overview_and_a_thread_is_on_a_scale() {
    let deck = support::Scratch::start();
    deck.post("Which port?", "C:/work/alpha");
    let id = support::question(&deck, "C:/work/alpha");
    for query in [
        Query::default(),
        Query {
            screen: "thread".into(),
            id: Some(id),
            ..Query::default()
        },
    ] {
        let rt = window(&deck, &query);
        let stray = stray_texts(&rt);
        assert!(stray.is_empty(), "{}: {stray:?}", query.screen);
    }
}

const SOURCE: &str =
    "# One\n\n## Two\n\n### Three\n\nBody with `inline code` in it.\n\n```\nlet block = 1;\n```\n";

#[test]
fn markdown_headings_code_and_blocks_are_on_a_scale() {
    for dark in [false, true] {
        let mut rt = Runtime::new(
            State::default(),
            |_: &State, cx: &mut rune::Cx<State>| {
                pilot_deck::theme::markdown(SOURCE, cx.system_dark())
            },
            (600.0, 400.0),
            Env::new(dark, 1.0),
        );
        rt.frame(0.0);
        let seen = rt
            .elements()
            .into_iter()
            .filter(|e| e.text.is_some())
            .count();
        assert!(seen >= 4, "drew {seen} texts");
        let stray = stray_texts(&rt);
        assert!(stray.is_empty(), "{stray:?}");
    }
}

fn sources(dir: &Path, into: &mut Vec<PathBuf>) {
    for entry in fs::read_dir(dir).expect("a source dir") {
        let path = entry.expect("an entry").path();
        if path.is_dir() {
            sources(&path, into);
        } else if path.extension().is_some_and(|e| e == "rs") {
            into.push(path);
        }
    }
}

#[test]
fn no_text_size_is_set_outside_the_scales() {
    let src = support::manifest_dir().join("src");
    let mut files = Vec::new();
    sources(&src, &mut files);
    let mut stray = Vec::new();
    for file in files {
        for (n, line) in fs::read_to_string(&file)
            .expect("source")
            .lines()
            .enumerate()
        {
            let own = line.contains("TextStyle::new(")
                || line.contains("tok::type_")
                || line.contains("tok::{self, type_}");
            if own {
                stray.push(format!("{}:{}: {}", file.display(), n + 1, line.trim()));
            }
        }
    }
    assert!(
        stray.is_empty(),
        "text sized outside theme::type_: {stray:#?}"
    );
}
