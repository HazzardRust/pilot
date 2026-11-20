//! `pilot-deck`: opens the deck's window. Rune's own flags (`--snap <png>`, `--tree`) render it headless.

fn main() {
    pilot_deck::app::app().run();
}
