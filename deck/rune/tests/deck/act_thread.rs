//! rune-deck-ui S5: every thread write the page makes, the Rune deck makes through the same form route,
//! read back through the daemon's read routes only (`/api/items`, `/api/runs`), never the store.

use crate::support;

use pilot_deck::act::{Acted, Action};
use serde_json::{Value, json};
use support::{client_for, id_in, item, question, read, secret, taken, tool};

/// A gate1 on a live ticket, the way the pilot posts one.
fn gate1(deck: &support::Scratch, repo: &str) -> String {
    let body = "> fix the thing\n\n1. It is done. *The test shows it.*\n\nThread itm_d2f9ed260436.";
    let ticket = id_in(&tool(
        deck,
        "deck_post",
        json!({ "kind": "ticket", "title": "The ticket", "body": body, "repo": repo, "author": "", "sliceCount": 1 }),
    ));
    tool(
        deck,
        "deck_ticket",
        json!({ "action": "take", "id": ticket, "repo": repo, "author": "" }),
    );
    id_in(&tool(
        deck,
        "deck_post",
        json!({ "kind": "gate1", "title": "Gate 1", "body": "the plan", "repo": repo, "author": "",
                "artefact": "docs/design/x/architecture.md", "sha": "0305827", "locked": 1, "slices": "| S1 |",
                "sliceCount": 1, "surface": false, "branch": "feat/x", "ticket": ticket }),
    ))
}

fn newest(deck: &support::Scratch, id: &str) -> Value {
    item(deck, id)["replies"]
        .as_array()
        .and_then(|replies| replies.last().cloned())
        .unwrap_or(Value::Null)
}

fn reply(id: &str, text: &str, choice: Option<&str>) -> Action {
    Action::Reply {
        id: id.into(),
        text: text.into(),
        choice: choice.map(str::to_string),
    }
}

#[test]
fn a_reply_lands() {
    let deck = support::Scratch::start();
    let id = question(&deck, "C:/work/alpha");
    let client = client_for(&deck);

    let location = taken(
        client
            .act(&reply(&id, "Neither, C", None))
            .expect("an answer"),
    );

    // The 303's own Location, not a followed redirect.
    assert_eq!(location, format!("/thread/{id}#reply"));
    let said = newest(&deck, &id);
    assert_eq!(said["from"], "user");
    assert_eq!(said["text"], "Neither, C");
}

#[test]
fn an_option_press_lands_as_the_choice() {
    let deck = support::Scratch::start();
    let asked = question(&deck, "C:/work/alpha");
    let gate = gate1(&deck, "C:/work/beta");
    let client = client_for(&deck);

    taken(
        client
            .act(&reply(&asked, "", Some("B")))
            .expect("an answer"),
    );
    assert_eq!(newest(&deck, &asked)["text"], "B");

    // A gate's Sign off is the page's own press: refused (403) without `Origin: http://<Host>`.
    taken(
        client
            .act(&reply(&gate, "", Some("Sign off")))
            .expect("an answer"),
    );
    let signed = newest(&deck, &gate);
    assert_eq!(signed["from"], "user");
    assert_eq!(signed["text"], "Sign off");
}

#[test]
fn close_reopen_dismiss_and_dismiss_run_land() {
    let deck = support::Scratch::start();
    let asked = question(&deck, "C:/work/alpha");
    let gate = gate1(&deck, "C:/work/beta");
    let client = client_for(&deck);

    taken(
        client
            .act(&Action::Close { id: asked.clone() })
            .expect("an answer"),
    );
    assert!(item(&deck, &asked)["resolution"].is_string(), "closed");

    taken(
        client
            .act(&Action::Reopen { id: asked.clone() })
            .expect("an answer"),
    );
    assert!(item(&deck, &asked)["resolution"].is_null(), "open again");

    taken(
        client
            .act(&Action::DismissItem { id: gate.clone() })
            .expect("an answer"),
    );
    assert!(item(&deck, &gate)["resolution"].is_string(), "dismissed");

    let registered = ureq::post(format!("{}/api/runs", deck.url))
        .header("Authorization", format!("Bearer {}", secret(&deck)))
        .send_json(json!({ "repo": "C:/work/gamma", "pid": deck.pid }))
        .expect("the run registers")
        .body_mut()
        .read_json::<Value>()
        .expect("json");
    let run = registered["run"]["id"]
        .as_str()
        .expect("a run id")
        .to_string();
    assert_eq!(read(&deck, "/api/runs")["runs"][0]["id"], run.as_str());

    let location = taken(
        client
            .act(&Action::DismissRun { id: run })
            .expect("an answer"),
    );
    assert_eq!(location, "/");
    assert_eq!(read(&deck, "/api/runs")["runs"], json!([]));
}

#[test]
fn a_refusal_comes_back_with_its_reason() {
    let deck = support::Scratch::start();
    let asked = question(&deck, "C:/work/alpha");
    let client = client_for(&deck);
    taken(
        client
            .act(&Action::Close { id: asked.clone() })
            .expect("an answer"),
    );

    // A reply reopens a closed thread (store-items `addReply`); a second Close is what a closed item refuses.
    match client
        .act(&Action::Close { id: asked.clone() })
        .expect("an answer")
    {
        Acted::Refused { reason } => {
            assert!(
                reason.starts_with(&format!("item {asked} is closed")),
                "the deck's own text, not {reason:?}"
            );
            assert!(!reason.contains(&secret(&deck)), "no secret in a refusal");
        }
        Acted::Taken { location } => panic!("taken, to {location}"),
    }
}
