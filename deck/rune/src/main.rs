//! `pilot-deck`: opens the deck's window. Rune's own flags (`--snap <png>`, `--tree`) render it headless.

fn main() {
    rune::run(pilot_deck::app::spec());
}
