//! `pilot-deck`: opens the deck's window. `--open <route>` and `--mode light|dark` pick its first
//! screen and mode (`app::Start`); Rune's own flags (`--snap <png>`, `--tree`) render it headless.

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
