//! The window following the deck (spec 4, 6a, 10): one thread reads the daemon's `GET /events`
//! and, on every `changed` and every (re)connect, refetches the one whole `View`, so every region
//! moves together from one `seq`. A stream that ends or never opens is said as `Feed::Down` and
//! tried again after `BACKOFF`; nothing polls the view on a timer.

use std::io::BufRead;
use std::sync::{Arc, Condvar, Mutex, PoisonError, Weak};
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

/// The reader's view of what the window is asking for, so a region that changes the query (a chosen
/// ticket) is followed rather than undone by the next `changed`.
type Asked = Arc<Mutex<Query>>;

/// The newest `Feed` the reader left for the window; an older one it replaces is never drawn.
#[derive(Debug, Clone, Default)]
pub struct Inbox(Slotted, Asked, Arc<Mutex<Option<Fetcher>>>, Arc<Nudge>);

/// The Retry control's word to a reader waiting out its backoff: try now.
#[derive(Debug, Default)]
struct Nudge {
    rung: Mutex<bool>,
    wake: Condvar,
}

impl Nudge {
    fn ring(&self) {
        *self.rung.lock().unwrap_or_else(PoisonError::into_inner) = true;
        self.wake.notify_all();
    }

    /// Waits out `wait`, or less if rung; whether it was rung.
    fn wait(&self, wait: Duration) -> bool {
        let rung = self.rung.lock().unwrap_or_else(PoisonError::into_inner);
        let (mut rung, _) = self
            .wake
            .wait_timeout_while(rung, wait, |rung| !*rung)
            .unwrap_or_else(PoisonError::into_inner);
        std::mem::take(&mut *rung)
    }
}

/// A feed with the query it was read for (a `Down` is for none), so one read for a query the
/// window has since left is never drawn, however late it lands.
type Slotted = Arc<Mutex<Option<(Option<Query>, Feed)>>>;

/// What a move needs to read its view now: the reader's client and the window's waker.
struct Fetcher {
    client: Arc<Client>,
    wake: Waker,
}

impl std::fmt::Debug for Fetcher {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("Fetcher")
    }
}

impl Inbox {
    /// The query every later refetch is made for. A feed already left was read for the old one, so
    /// it is dropped: the window never draws a view that is not for what it last asked. The new
    /// query is read at once on a thread of its own (the reader is waiting on the stream), not on
    /// the deck's next change.
    pub fn ask(&self, query: &Query) {
        *self.1.lock().unwrap_or_else(PoisonError::into_inner) = query.clone();
        self.0.lock().unwrap_or_else(PoisonError::into_inner).take();
        let fetcher = self.2.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(Fetcher { client, wake }) = fetcher.as_ref() {
            let (client, wake) = (client.clone(), wake.clone());
            let (asked, slot) = (self.1.clone(), Arc::downgrade(&self.0));
            let moved = std::thread::Builder::new()
                .name("pilot-deck-move".into())
                .spawn(move || refetch(&client, &asked, &slot, &*wake));
            if let Err(err) = moved {
                eprintln!("pilot-deck: the move's read did not start: {err}");
            }
        }
    }

    /// Reconnects at once: a reader sleeping out its backoff tries now (spec 10 still holds, the
    /// backoff stays for every failure nobody pressed Retry on).
    pub fn retry(&self) {
        self.3.ring();
    }

    /// The newest feed, unless it was read for a query other than the one now asked.
    pub fn take(&self) -> Option<Feed> {
        let (read_for, feed) = self
            .0
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .take()?;
        let asked = self.1.lock().unwrap_or_else(PoisonError::into_inner);
        read_for
            .is_none_or(|read_for| read_for == *asked)
            .then_some(feed)
    }
}

/// Starts the reader on its own thread. It ends once the window has dropped its `Inbox`; a
/// thread that cannot start leaves the window on the view it opened with, and says so.
pub fn start(client: Client, query: Query, wake: Waker) -> Inbox {
    let inbox = Inbox::default();
    inbox.ask(&query);
    let client = Arc::new(client);
    *inbox.2.lock().unwrap_or_else(PoisonError::into_inner) = Some(Fetcher {
        client: client.clone(),
        wake: wake.clone(),
    });
    let asked = inbox.1.clone();
    let slot = Arc::downgrade(&inbox.0);
    let nudge = inbox.3.clone();
    let spawned = std::thread::Builder::new()
        .name("pilot-deck-live".into())
        .spawn(move || follow(&client, &asked, &slot, &nudge, &*wake));
    if let Err(err) = spawned {
        eprintln!("pilot-deck: the live reader did not start: {err}");
    }
    inbox
}

type Slot = Weak<Mutex<Option<(Option<Query>, Feed)>>>;

/// Leaves `feed` for the window and wakes it; `None` once the window has gone.
fn put(
    slot: &Slot,
    asked: &Asked,
    read_for: Option<Query>,
    feed: Feed,
    wake: &(dyn Fn() + Send + Sync),
) -> Option<()> {
    let slot = slot.upgrade()?;
    let mut held = slot.lock().unwrap_or_else(PoisonError::into_inner);
    // A read for a query since left must not replace the feed for the one asked now.
    let current = read_for
        .as_ref()
        .is_none_or(|q| *q == *asked.lock().unwrap_or_else(PoisonError::into_inner));
    if current {
        *held = Some((read_for, feed));
        drop(held);
        wake();
    }
    Some(())
}

/// One whole view, or `Down` when it cannot be read; `Some(true)` when the view came.
fn refetch(
    client: &Client,
    asked: &Asked,
    slot: &Slot,
    wake: &(dyn Fn() + Send + Sync),
) -> Option<bool> {
    let query = asked.lock().unwrap_or_else(PoisonError::into_inner).clone();
    match client.view(&query) {
        Ok(view) => put(slot, asked, Some(query), Feed::View(view), wake).map(|()| true),
        Err(err) => {
            eprintln!("pilot-deck: {err}");
            put(slot, asked, None, Feed::Down, wake).map(|()| false)
        }
    }
}

fn follow(
    client: &Client,
    asked: &Asked,
    slot: &Slot,
    nudge: &Nudge,
    wake: &(dyn Fn() + Send + Sync),
) -> Option<()> {
    let mut failures = 0;
    loop {
        if let Ok(events) = client.events() {
            // Connected: what changed while the stream was away is read now, then once per change.
            if refetch(client, asked, slot, wake)? {
                failures = 0;
            }
            for line in events.lines() {
                match line {
                    Ok(line) if line.trim_end() == "event: changed" => {
                        if refetch(client, asked, slot, wake)? {
                            failures = 0;
                        }
                    }
                    Ok(_) => {}
                    Err(_) => break,
                }
            }
        }
        // The stream ended or never opened: the daemon is gone until a reconnect says otherwise.
        put(slot, asked, None, Feed::Down, wake)?;
        if nudge.wait(BACKOFF[failures]) {
            // Retry was pressed: try again from the shortest wait.
            failures = 0;
        } else {
            failures = (failures + 1).min(BACKOFF.len() - 1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn asked(id: &str) -> Query {
        Query {
            ticket: Some(id.into()),
            ..Query::default()
        }
    }

    #[test]
    fn a_retry_ends_the_wait_it_finds_the_reader_in() {
        let nudge = Arc::new(Nudge::default());
        let ringer = nudge.clone();
        let start = std::time::Instant::now();
        let ringing = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(50));
            ringer.ring();
        });

        assert!(nudge.wait(Duration::from_secs(30)), "rung, not timed out");
        assert!(start.elapsed() < Duration::from_secs(5));
        ringing.join().unwrap();
        assert!(
            !nudge.wait(Duration::from_millis(10)),
            "a ring answers one wait"
        );
    }

    #[test]
    fn asking_drops_a_feed_read_for_the_old_query() {
        let inbox = Inbox::default();
        *inbox.0.lock().unwrap() = Some((None, Feed::Down));

        inbox.ask(&asked("itm_g"));

        assert!(inbox.take().is_none());
        assert_eq!(
            inbox.1.lock().unwrap().ticket.as_deref(),
            Some("itm_g"),
            "later refetches are for the new query"
        );
    }

    #[test]
    fn a_late_view_read_for_the_query_left_draws_nothing() {
        let inbox = Inbox::default();
        let (old, new) = (asked("itm_old"), asked("itm_new"));
        inbox.ask(&old);
        inbox.ask(&new);
        let slot = Arc::downgrade(&inbox.0);

        // The refetch that was in flight for `old` lands after the move to `new`.
        put(
            &slot,
            &inbox.1,
            Some(old),
            Feed::View(View::default()),
            &|| {},
        )
        .unwrap();
        assert!(inbox.take().is_none(), "a stale view is not drawn");

        put(
            &slot,
            &inbox.1,
            Some(new),
            Feed::View(View::default()),
            &|| {},
        )
        .unwrap();
        assert!(matches!(inbox.take(), Some(Feed::View(_))));
    }

    #[test]
    fn a_stale_read_landing_after_the_current_one_does_not_replace_it() {
        let inbox = Inbox::default();
        let (old, new) = (asked("itm_old"), asked("itm_new"));
        inbox.ask(&old);
        inbox.ask(&new);
        let slot = Arc::downgrade(&inbox.0);

        put(
            &slot,
            &inbox.1,
            Some(new),
            Feed::View(View::default()),
            &|| {},
        )
        .unwrap();
        put(
            &slot,
            &inbox.1,
            Some(old),
            Feed::View(View::default()),
            &|| {},
        )
        .unwrap();

        assert!(
            matches!(inbox.take(), Some(Feed::View(_))),
            "the current view survives"
        );
    }
}
