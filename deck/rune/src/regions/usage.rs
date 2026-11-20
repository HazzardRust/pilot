//! The header's usage readout (spec 2): the chosen deck's ctx, and the account's session and weekly
//! figures, each in the band the page draws it in (`deck/ui/js/usage.mjs`), as the view resolved
//! them (`deck/view/usage.mjs`). The figures move without a change to the store, so `poll` reads the
//! whole view again every 30 s, as the page polls `/api/usage`, so every figure still comes by the
//! view (L2) and on the same `seq` as every other region.

use std::time::{Duration, Instant};

use rune::tok::{self, type_};
use rune::{Color, Cx, El, Tx, row, text};
use serde::Deserialize;

use crate::app::State;
use crate::theme::{self, space};

/// The page's poll interval (`USAGE_EVERY`).
const EVERY: Duration = Duration::from_secs(30);

/// When the next read is due.
#[derive(Debug, Default)]
pub struct Local {
    due: Option<Instant>,
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

/// From the window's poll: every 30 s asks the live reader for the whole view again, so the figures
/// land with every other region on one `seq` (spec 6a, L2), and sets the next wake.
pub fn poll(s: &mut State, tx: &mut Tx) {
    let now = Instant::now();
    // The first view was read at load: the first poll only sets the clock.
    let due = *s.regions.usage.due.get_or_insert(now + EVERY);
    if now >= due {
        s.regions.usage.due = Some(now + EVERY);
        if let Some(live) = &s.live {
            live.ask(&s.query);
        }
    }
    // A one-shot wake, asked again on every poll, so an idle window still reads every 30 s.
    let due = s.regions.usage.due.unwrap_or(now + EVERY);
    tx.wake_after(due.saturating_duration_since(now));
}

pub fn draw(v: &serde_json::Value, _: &Local, cx: &mut Cx<State>) -> El {
    // A region the view cannot be read as draws every figure unknown rather than taking the window down.
    let usage = Usage::deserialize(v).unwrap_or_default();
    let dark = cx.system_dark();
    let (t, k) = (tok::theme(dark), theme::tokens(dark));
    let reading = |key: &str, pct: Option<f32>| {
        let figure = match pct {
            // A reading the deck could not get is not a green one: no band at all.
            None => theme::content(
                text("unknown").font(type_::BODY).color(t.text_secondary),
                dark,
            ),
            Some(pct) => {
                let ink: Color = match band(pct) {
                    // A reading that needs no attention takes no colour.
                    Band::Fine => t.text,
                    Band::Warm => k.usage.warm,
                    Band::High => k.usage.high,
                    Band::Critical => k.usage.critical,
                };
                let figure = theme::content(
                    text(format!("{pct:.0}%")).font(type_::BODY).color(ink),
                    dark,
                );
                if band(pct) == Band::Critical {
                    row()
                        .fill(k.usage.critical_bg)
                        .padding(space::s2)
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
        readout = readout.child(theme::content(
            text(format!("resets {resets}"))
                .font(type_::LABEL)
                .color(k.quiet),
            dark,
        ));
    }
    readout.child(reading("weekly", usage.weekly))
}
