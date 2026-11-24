//! One file per region (L5): each parses its part of the view, draws it, and owns a `Local` for
//! its own view state, so a region slice edits its own file and nothing of `app.rs`.

pub mod agents;
pub mod archive;
pub mod chat;
pub mod graph;
pub mod history;
pub mod notifications;
pub mod queue;
pub mod reply;
pub mod reports;
pub mod status;
pub mod strip;
pub mod tabs;
pub mod thread;
pub mod tickets;
pub mod usage;

/// Every region's own view state, one field each.
#[derive(Debug, Default)]
pub struct Locals {
    pub agents: agents::Local,
    pub archive: archive::Local,
    pub chat: chat::Local,
    pub graph: graph::Local,
    pub history: history::Local,
    pub notifications: notifications::Local,
    pub queue: queue::Local,
    pub reply: reply::Local,
    pub reports: reports::Local,
    pub status: status::Local,
    pub strip: strip::Local,
    pub tabs: tabs::Local,
    pub thread: thread::Local,
    pub tickets: tickets::Local,
    pub usage: usage::Local,
}
