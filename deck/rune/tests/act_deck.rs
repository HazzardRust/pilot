//! rune-deck-ui S6: every deck-wide write the page makes, the Rune deck makes through the same form
//! route, read back through the daemon's read routes only (`/api/items`, `/api/runs`, `/api/view`, `/`).
//! Every scratch daemon runs under the deck's own Start guard (`support::pilot`), so no test opens a terminal.

mod support;

use pilot_deck::act::Acted;
use pilot_deck::act_deck::DeckAction;
use pilot_deck::client::{Client, Query};
use serde_json::{Value, json};
use support::{client_for, get, id_in, item, question, read, secret, taken, tool};

/// An open red ticket, the way the pilot posts one.
fn ticket(deck: &support::Scratch, repo: &str, title: &str) -> String {
    let body = "> fix the thing\n\n1. It is done. *The test shows it.*\n\nThread itm_d2f9ed260436.";
    id_in(&tool(
        deck,
        "deck_post",
        json!({ "kind": "ticket", "title": title, "body": body, "repo": repo, "author": "", "sliceCount": 1 }),
    ))
}

fn newest_text(deck: &support::Scratch, id: &str) -> Value {
    item(deck, id)["replies"]
        .as_array()
        .and_then(|replies| replies.last())
        .map_or(Value::Null, |reply| reply["text"].clone())
}

/// The open tickets of `repo`, in deck order.
fn tickets_of(deck: &support::Scratch, repo: &str) -> Vec<String> {
    read(deck, "/api/items?open=1")["items"]
        .as_array()
        .expect("items")
        .iter()
        .filter(|one| one["kind"] == "ticket" && one["repo"] == repo)
        .map(|one| one["id"].as_str().expect("an id").to_string())
        .collect()
}

/// Each tab's href, as the Rune deck's own read draws the strip.
fn tab_hrefs(client: &Client) -> Vec<String> {
    let view = client.view(&Query::default()).expect("a view");
    view.regions["tabs"]["tabs"]
        .as_array()
        .expect("tabs")
        .iter()
        .map(|tab| tab["href"].as_str().expect("an href").to_string())
        .collect()
}

fn register_run(deck: &support::Scratch, repo: &str) {
    ureq::post(format!("{}/api/runs", deck.url))
        .header("Authorization", format!("Bearer {}", secret(deck)))
        .send_json(json!({ "repo": repo, "pid": deck.pid }))
        .expect("the run registers");
}

fn act(client: &Client, a: DeckAction) -> String {
    taken(client.act(&a).expect("an answer"))
}

/// A directory of the scratch deck's own, removed with it by `--stop`.
fn a_repo(deck: &support::Scratch, name: &str) -> String {
    let dir = deck.dir.join(name);
    std::fs::create_dir_all(&dir).expect("a directory");
    dir.to_str().expect("a utf-8 path").to_string()
}

#[test]
fn create_lands() {
    let deck = support::Scratch::start();
    // Create opens a thread on a repository the deck has numbered, as a run's registration does.
    register_run(&deck, "C:/work/alpha");
    let client = client_for(&deck);

    let location = act(
        &client,
        DeckAction::Create {
            name: "Try the strip".into(),
            repo: "C:/work/alpha".into(),
        },
    );

    let id = location
        .strip_prefix("/thread/")
        .expect("Create lands on its new thread");
    let made = item(&deck, id);
    assert_eq!(made["title"], "Try the strip");
    assert_eq!(made["repo"], "C:/work/alpha");
}

#[test]
fn move_lands() {
    let deck = support::Scratch::start();
    let repo = "C:/work/alpha";
    let first = ticket(&deck, repo, "First");
    let second = ticket(&deck, repo, "Second");
    let client = client_for(&deck);

    act(
        &client,
        DeckAction::Move {
            id: second.clone(),
            up: true,
        },
    );
    assert_eq!(tickets_of(&deck, repo), [second.clone(), first.clone()]);

    act(
        &client,
        DeckAction::Move {
            id: second.clone(),
            up: false,
        },
    );
    assert_eq!(tickets_of(&deck, repo), [first, second]);
}

#[test]
fn switch_and_cancel_land() {
    let deck = support::Scratch::start();
    let repo = "C:/work/alpha";
    ticket(&deck, repo, "In hand");
    let to = ticket(&deck, repo, "Next");
    // A live session there, so the switch waits for its take rather than completing at once.
    register_run(&deck, repo);
    let client = client_for(&deck);

    act(
        &client,
        DeckAction::Switch {
            repo: repo.into(),
            to: to.clone(),
        },
    );
    assert_eq!(newest_text(&deck, &to), "Continue this ticket");

    act(
        &client,
        DeckAction::CancelSwitch {
            repo: repo.into(),
            to: to.clone(),
        },
    );
    assert_eq!(newest_text(&deck, &to), "switch cancelled");
    // The record is gone: a second Cancel is the deck's own refusal.
    match client
        .act(&DeckAction::CancelSwitch {
            repo: repo.into(),
            to: to.clone(),
        })
        .expect("an answer")
    {
        Acted::Refused { reason } => assert!(reason.starts_with(&format!("no switch to {to}"))),
        Acted::Taken { location } => panic!("taken, to {location}"),
    }
}

#[test]
fn add_and_remove_deck_land() {
    let deck = support::Scratch::start();
    let repo = a_repo(&deck, "added");
    let client = client_for(&deck);

    let location = act(&client, DeckAction::AddDeck { path: repo.clone() });
    assert!(
        location.starts_with("/?run="),
        "lands on the new tab: {location}"
    );
    assert!(tab_hrefs(&client).contains(&location), "a tab is added");

    assert_eq!(act(&client, DeckAction::RemoveDeck { repo }), "/");
    assert!(
        !tab_hrefs(&client).contains(&location),
        "the ended tab is removed"
    );
}

#[test]
fn alerts_land() {
    let deck = support::Scratch::start();
    let client = client_for(&deck);
    let page = |deck: &support::Scratch| {
        get(deck, "/")
            .body_mut()
            .read_to_string()
            .expect("the home page")
    };
    assert!(page(&deck).contains("Weekly alerts on"));

    act(&client, DeckAction::Alerts { weekly: false });
    assert!(page(&deck).contains("Weekly alerts off"), "reads back off");

    act(&client, DeckAction::Alerts { weekly: true });
    assert!(page(&deck).contains("Weekly alerts on"), "and on again");
}

#[test]
fn clear_notice_and_clear_notices_land() {
    let deck = support::Scratch::start();
    let ids: Vec<String> = ["C:/work/alpha", "C:/work/alpha", "C:/work/beta"]
        .iter()
        .map(|repo| {
            let id = question(&deck, repo);
            tool(
                &deck,
                "deck_resolve",
                json!({ "id": id, "resolution": "decided", "author": "" }),
            );
            assert_eq!(
                item(&deck, &id)["notice"],
                true,
                "an agent's close leaves a notice"
            );
            id
        })
        .collect();
    let client = client_for(&deck);

    act(&client, DeckAction::ClearNotice { id: ids[0].clone() });
    assert!(
        item(&deck, &ids[0])["notice"].is_null(),
        "that notice is cleared"
    );
    assert_eq!(item(&deck, &ids[1])["notice"], true, "and only that one");

    act(&client, DeckAction::ClearNotices);
    for id in &ids {
        assert!(
            item(&deck, id)["notice"].is_null(),
            "{id}'s notice is cleared"
        );
    }
}

#[test]
fn start_is_refused_in_the_suite() {
    let deck = support::Scratch::start();
    let repo = a_repo(&deck, "ended");
    let client = client_for(&deck);
    act(&client, DeckAction::AddDeck { path: repo.clone() });

    match client
        .act(&DeckAction::StartSession { repo })
        .expect("an answer")
    {
        // The page's navigation: back on the tab with the guard's reason (`landRefusal`).
        Acted::Taken { location } => assert!(
            location.contains("sessionRefused=starting%20a%20session%20is%20turned%20off"),
            "the guard refused it: {location}"
        ),
        Acted::Refused { reason } => assert!(reason.contains("turned off"), "{reason}"),
    }
    assert_eq!(
        read(&deck, "/api/runs")["runs"],
        json!([]),
        "no session started"
    );
}
