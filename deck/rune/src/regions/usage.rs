//! The header's usage readout (spec 2): the chosen deck's ctx, and the account's session and weekly
//! figures, each in the band the page draws it in (`deck/ui/js/usage.mjs`), as the view resolved
//! them (`deck/view/usage.mjs`). The figures move without a change to the store, so `poll` reads the
//! view again every 30 s, as the page polls `/api/usage`, and takes its usage region alone, so
//! every figure still comes by the view (L2).

use std::sync::mpsc;
use std::time::{Duration, Instant};

use rune::tok::{self, type_};
use rune::{Color, Cx, El, Tx, row, text};
use serde::Deserialize;

use crate::app::State;
use crate::client::{Client, Query, Result, View};
use crate::theme::{self, space};

/// The page's poll interval (`USAGE_EVERY`).
const EVERY: Duration = Duration::from_secs(30);
/// How often the poll looks again while a read is out.
const SETTLE: Duration = Duration::from_millis(250);

/// When the next read is due, and the read out now with the query it was made for.
#[derive(Debug, Default)]
pub struct Local {
    due: Option<Instant>,
    out: Option<(Query, mpsc::Receiver<Result<View>>)>,
}

/// The status line's bands, which the page's are (`hooks/context-usage-statusline.js`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Band {
    Fine,
    Warm,
    High,
    Critical,
}

/// fine below 80, warm from 80, high from 90, critical from 95.
pub fn band(pct: f32) -> Band {
    match pct {
        p if p >= 95.0 => Band::Critical,
        p if p >= 90.0 => Band::High,
        p if p >= 80.0 => Band::Warm,
        _ => Band::Fine,
    }
}

#[derive(Debug, Default, Deserialize)]
struct Usage {
    ctx: Option<f32>,
    session: Option<f32>,
    weekly: Option<f32>,
    resets: Option<String>,
}

/// From the window's poll: starts a read every 30 s and takes its usage region when it lands for
/// the query still asked. Answers whether the view changed.
pub fn poll(s: &mut State, tx: &mut Tx) -> bool {
    let now = Instant::now();
    let mut changed = false;
    if let Some((query, answer)) = &s.regions.usage.out {
        match answer.try_recv() {
            Err(mpsc::TryRecvError::Empty) => {
                tx.wake_after(SETTLE);
                return false;
            }
            Ok(Ok(mut view)) if *query == s.query => {
                if let Some(usage) = view.regions.remove("usage") {
                    s.view.regions.insert("usage".into(), usage);
                    changed = true;
                }
            }
            // A failed read keeps the last figures: the live reader owns saying the deck is down.
            Ok(Err(err)) => eprintln!("pilot-deck: usage: {err}"),
            Ok(Ok(_)) | Err(mpsc::TryRecvError::Disconnected) => {}
        }
        s.regions.usage.out = None;
    }
    let local = &mut s.regions.usage;
    // The first view was read at load: the first poll only sets the clock.
    if local.due.is_none() {
        local.due = Some(now + EVERY);
        tx.wake_after(EVERY);
    }
    if local.due.is_some_and(|due| now >= due) {
        local.due = Some(now + EVERY);
        let query = s.query.clone();
        let asked = query.clone();
        let (answer, inbox) = mpsc::channel();
        let spawned = std::thread::Builder::new()
            .name("pilot-deck-usage".into())
            .spawn(move || {
                let _ = answer.send(Client::from_env().and_then(|client| client.view(&asked)));
            });
        match spawned {
            Ok(_) => local.out = Some((query, inbox)),
            Err(err) => eprintln!("pilot-deck: the usage read did not start: {err}"),
        }
        tx.wake_after(if local.out.is_some() { SETTLE } else { EVERY });
    }
    changed
}

pub fn draw(v: &serde_json::Value, _: &Local, cx: &mut Cx<State>) -> El {
    // A region the view cannot be read as draws every figure unknown rather than taking the window down.
    let usage = Usage::deserialize(v).unwrap_or_default();
    let dark = cx.system_dark();
    let (t, k) = (tok::theme(dark), theme::tokens(dark));
    let reading = |key: &str, pct: Option<f32>| {
        let figure = match pct {
            // A reading the deck could not get is not a green one: no band at all.
            None => text("unknown").font(type_::BODY).color(t.text_secondary),
            Some(pct) => {
                let ink: Color = match band(pct) {
                    Band::Fine => k.usage.fine,
                    Band::Warm => k.usage.warm,
                    Band::High => k.usage.high,
                    Band::Critical => k.usage.critical,
                };
                let figure = text(format!("{pct:.0}%")).font(type_::BODY).color(ink);
                if band(pct) == Band::Critical {
                    row()
                        .fill(k.usage.critical_bg)
                        .padding(space::s1)
                        .child(figure)
                } else {
                    figure
                }
            }
        };
        row()
            .key(format!("usage-{key}"))
            .gap(space::within)
            .child(text(key).font(type_::LABEL).color(k.quiet))
            .child(figure)
    };
    let mut readout = row().key("usage").role("status").gap(space::between);
    // ctx is a deck's: none on the overview, and none for a deck whose session has not reported.
    if usage.ctx.is_some() {
        readout = readout.child(reading("ctx", usage.ctx));
    }
    readout = readout.child(reading("session", usage.session));
    if let Some(resets) = &usage.resets {
        readout = readout.child(
            text(format!("resets {resets}"))
                .font(type_::LABEL)
                .color(k.quiet),
        );
    }
    readout.child(reading("weekly", usage.weekly))
}
