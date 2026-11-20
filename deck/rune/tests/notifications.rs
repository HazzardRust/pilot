//! rune-deck-ui S10 (spec 2, 3): what the user hid stays hidden across a restart (A4), kept in the
//! window's own prefs file and never the store; and the panel's × and Mark all seen clear the deck's
//! notices through the page's own routes, read back through `/api/view`.

mod support;

use std::path::PathBuf;

use pilot_deck::act_deck::DeckAction;
use pilot_deck::client::{Client, Query};
use pilot_deck::prefs::Prefs;
use pilot_deck::regions::notifications;
use serde_json::json;
use support::{client_for, question, taken, tool};

/// The ids of the notices the view lists, as the panel reads them.
fn notices(client: &Client) -> Vec<String> {
    let view = client.view(&Query::default()).expect("a view");
    view.regions["notifications"]["notices"]
        .as_array()
        .expect("notices")
        .iter()
        .map(|one| one["id"].as_str().expect("an id").to_string())
        .collect()
}

/// A question an agent closed, which leaves a notice.
fn closed(deck: &support::Scratch, repo: &str) -> String {
    let id = question(deck, repo);
    tool(
        deck,
        "deck_resolve",
        json!({ "id": id, "resolution": "decided", "author": "" }),
    );
    id
}

/// A directory of this test's own under the system temp dir, empty.
fn scratch_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("pilot-deck-prefs-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("a temp dir");
    dir
}

fn some_prefs() -> Prefs {
    let mut prefs = Prefs::default();
    prefs.seen.insert("itm_0000000000b1".into(), 3);
    prefs
        .folds
        .entry("C:/work/alpha".into())
        .or_default()
        .insert("S2 the second".into());
    prefs.open_panels.insert("notifications".into());
    prefs.sizes.insert("history".into(), (320.0, 240.5));
    prefs.hidden_reports.insert("itm_0000000000r1".into());
    prefs
}

#[test]
fn prefs_survive_a_restart() {
    let dir = scratch_dir("restart");
    let prefs = some_prefs();

    prefs.save(&dir).expect("the prefs save");

    assert_eq!(Prefs::load(&dir), prefs);
    assert!(
        dir.join("rune-deck.json").is_file(),
        "the window's own file, beside the store"
    );
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn a_missing_or_corrupt_file_loads_default() {
    let dir = scratch_dir("corrupt");

    assert_eq!(Prefs::load(&dir), Prefs::default(), "no file yet");

    std::fs::write(dir.join("rune-deck.json"), "{\"seen\": [1, 2").expect("a corrupt file");
    assert_eq!(Prefs::load(&dir), Prefs::default(), "a corrupt file");

    std::fs::write(
        dir.join("rune-deck.json"),
        "{\"seen\": {\"itm_0000000000b1\": \"three\"}}",
    )
    .expect("a file of the wrong shape");
    assert_eq!(
        Prefs::load(&dir),
        Prefs::default(),
        "a file of the wrong shape"
    );
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn seen_hides_until_the_next_write() {
    let dir = scratch_dir("seen");
    let thread = "itm_0000000000b1";
    let mut prefs = Prefs::default();
    notifications::mark_seen(&mut prefs, thread, 3);
    prefs.save(&dir).expect("the prefs save");

    let after_restart = Prefs::load(&dir);

    assert!(
        !notifications::shown(&after_restart, thread, 3),
        "hidden at the write it was seen at"
    );
    assert!(
        notifications::shown(&after_restart, thread, 4),
        "back when the pilot writes again"
    );
    assert!(
        notifications::shown(&after_restart, "itm_0000000000b2", 1),
        "a thread never seen is shown"
    );
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn the_x_and_mark_all_seen_clear_the_decks_notices() {
    let deck = support::Scratch::start();
    let first = closed(&deck, "C:/work/alpha");
    let client = client_for(&deck);
    assert_eq!(
        notices(&client),
        std::slice::from_ref(&first),
        "an agent's close is listed"
    );

    taken(
        client
            .act(&DeckAction::ClearNotice { id: first })
            .expect("an answer"),
    );
    assert!(notices(&client).is_empty(), "the × clears it");

    let more = [
        closed(&deck, "C:/work/alpha"),
        closed(&deck, "C:/work/beta"),
    ];
    assert_eq!(notices(&client).len(), more.len(), "two more are listed");
    taken(client.act(&DeckAction::ClearNotices).expect("an answer"));
    assert!(notices(&client).is_empty(), "Mark all seen clears them all");
}
