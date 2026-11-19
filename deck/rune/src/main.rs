//! `pilot-deck`: opens the deck's window. Rune's own flags (`--snap <png>`, `--tree`) render it headless.

use pilot_deck::app::{self, State};

fn main() {
    rune::run(rune::AppSpec::new(
        "pilot deck",
        (1280.0, 800.0),
        State::load,
        app::view,
    ));
}
