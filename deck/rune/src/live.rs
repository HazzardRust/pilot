//! The window following the deck (spec 4, 6a, 10): one thread reads the daemon's `GET /events`
//! and, on every `changed` and every (re)connect, refetches the one whole `View`, so every region
//! moves together from one `seq`. A stream that ends or never opens is said as `Feed::Down` and
//! tried again after `BACKOFF`; nothing polls the view on a timer.

use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;

use rune::Waker;

use crate::client::{Client, Query, View};

/// The wait before each reconnect, 250 ms doubling to 2 s, which it then stays at.
pub const BACKOFF: [Duration; 4] = [
    Duration::from_millis(250),
    Duration::from_millis(500),
    Duration::from_millis(1000),
    Duration::from_millis(2000),
];

/// What the reader last learned: a fresh view, or that the daemon cannot be read.
#[derive(Debug)]
pub enum Feed {
    View(View),
    Down,
}

/// The newest `Feed` the reader left for the window; an older one it replaces is never drawn.
#[derive(Debug, Clone, Default)]
pub struct Inbox(Arc<Mutex<Option<Feed>>>);

impl Inbox {
    pub fn take(&self) -> Option<Feed> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner).take()
    }
}

pub fn start(_client: Client, _query: Query, _wake: Waker) -> Inbox {
    Inbox::default()
}
