//! `pilot-deck`: opens the deck's window. `--open <route>` picks its first screen (`app::Start`);
//! Rune's own flags pick its mode (`--theme light|dark`) and render it headless (`--snap <png>`,
//! `--tree`).

use pilot_deck::app::{self, Start, State};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let start = Start::from_args(args.clone()).unwrap_or_else(|err| {
        eprintln!("pilot-deck: {err}");
        std::process::exit(2);
    });
    let rune = start.rune_args(args);
    app::app().args(rune).init(move || State::load(start)).run();
}
