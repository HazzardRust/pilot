//! archive-page S17 (spec 11): the archive's frame held to a 60 Hz frame at the real store's shape, and
//! its rows parsed once per view.

use std::time::{Duration, Instant};

use pilot_deck::app::State;
use pilot_deck::client::View;
use rune::{Runtime, TextEdit};

use crate::archive_filter::{Closed, archive_window, recorded, stamp};

/// The rows the window has built, which a windowed list keeps to the ones near its viewport.
fn mounted(rt: &Runtime<State>) -> usize {
    rt.elements()
        .into_iter()
        .filter(|e| !e.exiting)
        .filter(|e| {
            e.key
                .as_deref()
                .is_some_and(|k| k.starts_with("archive-row-"))
        })
        .count()
}

/// 10,000 rows shaped as the real store's are (S17's measurement): 1,000 closed Today, the only section
/// the view opens, and 200 a day over the 45 days before it.
fn real_scale() -> serde_json::Value {
    let titles: Vec<String> = (0..10_000).map(|i| format!("Ticket number {i}")).collect();
    let closed: Vec<Closed> = titles
        .iter()
        .enumerate()
        .map(|(i, title)| {
            // Today's between 08:00 and 12:10 UTC, so on the 20th from UTC-8 to UTC+10 (archive_filter's NOW).
            let at = if i < 1_000 {
                format!(
                    "2026-11-20T{:02}:{:02}:{:02}.000Z",
                    8 + i / 240,
                    (i / 4) % 60,
                    (i % 4) * 15
                )
            } else {
                stamp(1 + (i - 1_000) / 200, (i - 1_000) % 200)
            };
            Closed(title.as_str(), "C:/work/alpha", at)
        })
        .collect();
    recorded(&closed)
}

#[test]
fn the_archive_frame_is_as_cheap_as_homes() {
    let mut rt = archive_window(real_scale());
    rt.frame(0.0);
    rt.frame(1.0 / 60.0);
    // The bar is a release build's, as the window ships; a debug build prints its times only.
    let bar = (!cfg!(debug_assertions)).then_some(Duration::from_millis(16));
    // "number 1" is in Today's 1, 10 to 19 and 100 to 199: 111 rows.
    for (case, search, listed) in [
        ("Today open", "", 1_000),
        ("a search keystroke", "number 1", 111),
    ] {
        rt.update(|s, _| s.regions.archive.search = TextEdit::new(search));
        rt.frame(1.0 / 60.0);
        let took: Vec<Duration> = (1..=3)
            .map(|_| {
                rt.invalidate();
                let start = Instant::now();
                rt.frame(1.0 / 60.0);
                start.elapsed()
            })
            .collect();
        let on = mounted(&rt);
        println!("archive frame, {case}: {took:?}, {on} rows built");
        assert!(
            took.iter().all(|took| bar.is_none_or(|bar| *took < bar)),
            "{case}: {took:?}"
        );
        assert!(
            on > 0 && on < 100,
            "{case}: {on} rows built, only those near the viewport"
        );
        assert_eq!(
            rt.state.regions.archive.listed(),
            listed,
            "{case}: the rows the list holds"
        );
    }
}

#[test]
fn an_unchanged_view_is_not_re_parsed_per_frame() {
    let region = recorded(&[
        Closed("Alpha", "C:/work/alpha", stamp(0, 10)),
        Closed("Bravo", "C:/work/alpha", stamp(1, 10)),
    ]);
    let mut rt = archive_window(region.clone());
    rt.frame(0.0);
    let first = rt.state.regions.archive.builds();
    assert!(first >= 1, "the first frame parses the view");
    for _ in 0..2 {
        rt.invalidate();
        rt.frame(1.0 / 60.0);
    }
    assert_eq!(
        rt.state.regions.archive.builds(),
        first,
        "two more frames, same view: no parse"
    );

    // A view the live reader brings replaces the whole `View`, as `app::poll` does.
    let view = View {
        screen: "archive".into(),
        seq: 1,
        regions: [("archive".to_string(), region)].into_iter().collect(),
    };
    rt.update(move |s, _| s.view = view);
    rt.frame(1.0 / 60.0);
    assert_eq!(
        rt.state.regions.archive.builds(),
        first + 1,
        "a new view parses again"
    );
}
