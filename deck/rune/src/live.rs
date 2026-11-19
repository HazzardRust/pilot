//! The window following the deck (spec 4, 6a, 10): one thread reads the daemon's `GET /events`
//! and, on every `changed` and every (re)connect, refetches the one whole `View`, so every region
//! moves together from one `seq`. A stream that ends or never opens is said as `Feed::Down` and
//! tried again after `BACKOFF`; nothing polls the view on a timer.

use std::io::BufRead;
use std::sync::{Arc, Mutex, PoisonError, Weak};
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

/// Starts the reader on its own thread. It ends once the window has dropped its `Inbox`; a
/// thread that cannot start leaves the window on the view it opened with, and says so.
pub fn start(client: Client, query: Query, wake: Waker) -> Inbox {
    let inbox = Inbox::default();
    let slot = Arc::downgrade(&inbox.0);
    let spawned = std::thread::Builder::new()
        .name("pilot-deck-live".into())
        .spawn(move || follow(&client, &query, &slot, &*wake));
    if let Err(err) = spawned {
        eprintln!("pilot-deck: the live reader did not start: {err}");
    }
    inbox
}

type Slot = Weak<Mutex<Option<Feed>>>;

/// Leaves `feed` for the window and wakes it; `None` once the window has gone.
fn put(slot: &Slot, feed: Feed, wake: &(dyn Fn() + Send + Sync)) -> Option<()> {
    *slot
        .upgrade()?
        .lock()
        .unwrap_or_else(PoisonError::into_inner) = Some(feed);
    wake();
    Some(())
}

/// One whole view, or `Down` when it cannot be read; `Some(true)` when the view came.
fn refetch(
    client: &Client,
    query: &Query,
    slot: &Slot,
    wake: &(dyn Fn() + Send + Sync),
) -> Option<bool> {
    match client.view(query) {
        Ok(view) => put(slot, Feed::View(view), wake).map(|()| true),
        Err(err) => {
            eprintln!("pilot-deck: {err}");
            put(slot, Feed::Down, wake).map(|()| false)
        }
    }
}

fn follow(
    client: &Client,
    query: &Query,
    slot: &Slot,
    wake: &(dyn Fn() + Send + Sync),
) -> Option<()> {
    let mut failures = 0;
    loop {
        if let Ok(events) = client.events() {
            // Connected: what changed while the stream was away is read now, then once per change.
            if refetch(client, query, slot, wake)? {
                failures = 0;
            }
            for line in events.lines() {
                match line {
                    Ok(line) if line.trim_end() == "event: changed" => {
                        if refetch(client, query, slot, wake)? {
                            failures = 0;
                        }
                    }
                    Ok(_) => {}
                    Err(_) => break,
                }
            }
        }
        // The stream ended or never opened: the daemon is gone until a reconnect says otherwise.
        put(slot, Feed::Down, wake)?;
        std::thread::sleep(BACKOFF[failures]);
        failures = (failures + 1).min(BACKOFF.len() - 1);
    }
}
