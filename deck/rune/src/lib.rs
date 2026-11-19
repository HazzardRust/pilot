//! The Rune deck (ADR NNNN): a native window over the daemon's `GET /api/view`, an HTTP client of
//! loopback and never a reader of the store (L1).

pub mod act;
pub mod act_deck;
pub mod app;
pub mod client;
pub mod layout;
pub mod prefs;
pub mod regions;
pub mod theme;
