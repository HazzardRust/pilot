//! The deck-wide writes (L3): create, add and remove a deck, start a session, a ticket's arrows, the
//! lane switch and its cancel, weekly alerts and the notices, each the form the HTML deck's control
//! posts, sent through `Client::act`. Every path or repository is the user's own typed field or a
//! tab's, never built here.

use crate::act::Form;

/// Where a route that reads `back` lands: the overview, which the Rune deck redraws from its view.
const BACK: &str = "/";

#[derive(Debug, Clone, PartialEq)]
pub enum DeckAction {
    Create { name: String, repo: String },
    AddDeck { path: String },
    RemoveDeck { repo: String },
    StartSession { repo: String },
    Move { id: String, up: bool },
    Switch { repo: String, to: String },
    CancelSwitch { repo: String, to: String },
    Alerts { weekly: bool },
    ClearNotice { id: String },
    ClearNotices,
}

impl Form for DeckAction {
    fn route(&self) -> &'static str {
        match self {
            DeckAction::Create { .. } => "/create",
            DeckAction::AddDeck { .. } => "/add-deck",
            DeckAction::RemoveDeck { .. } => "/remove-deck",
            DeckAction::StartSession { .. } => "/start-session",
            DeckAction::Move { .. } => "/move",
            DeckAction::Switch { .. } => "/switch",
            DeckAction::CancelSwitch { .. } => "/switch-cancel",
            DeckAction::Alerts { .. } => "/alerts",
            DeckAction::ClearNotice { .. } => "/clear-notice",
            DeckAction::ClearNotices => "/clear-notices",
        }
    }

    fn fields(&self) -> Vec<(&'static str, String)> {
        let back = ("back", BACK.to_string());
        match self {
            // `/create` and `/remove-deck` read no `back`: each has one landing of its own.
            DeckAction::Create { name, repo } => {
                vec![("name", name.clone()), ("repo", repo.clone())]
            }
            DeckAction::RemoveDeck { repo } => vec![("repo", repo.clone())],
            DeckAction::AddDeck { path } => vec![("path", path.clone()), back],
            DeckAction::StartSession { repo } => vec![("repo", repo.clone()), back],
            DeckAction::Move { id, up } => {
                let direction = if *up { "up" } else { "down" };
                vec![("id", id.clone()), ("direction", direction.into()), back]
            }
            DeckAction::Switch { repo, to } | DeckAction::CancelSwitch { repo, to } => {
                vec![("repo", repo.clone()), ("to", to.clone()), back]
            }
            DeckAction::Alerts { weekly } => {
                let weekly = if *weekly { "on" } else { "off" };
                vec![("weekly", weekly.into()), back]
            }
            DeckAction::ClearNotice { id } => vec![("id", id.clone()), back],
            DeckAction::ClearNotices => vec![back],
        }
    }
}
