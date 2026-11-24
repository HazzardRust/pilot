//! archive-page S3 (spec 4, 9; A4, A5): the archive's rows sort by a column, filter by kind and search,
//! all in the window over the rows it holds, on a view `deck/view/archive.mjs` itself recorded.

use crate::support;

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::process::Command;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{Duration, Instant};

use pilot_deck::app::{self, State};
use pilot_deck::client::View;
use pilot_deck::regions::archive::{Column, Day, filter_rows, sort_rows};
use rune::{Env, Runtime, TextEdit};
use serde::Deserialize;
use serde_json::{Value, json};
use support::{ENV, Scratch, frame_until, id_in, manifest_dir, tool};

/// The clock every recorded view is computed at.
/// Noon UTC: every stamp below (08:00 to 13:00 UTC) falls on its own date as a clock from UTC-8 to
/// UTC+10 reads it, and 2026-11-20 is Today.
const NOW: &str = "2026-11-20T12:00:00.000Z";

static RECORDS: AtomicUsize = AtomicUsize::new(0);

/// A closed ticket for `recorded`: its title, its repository and when it closed.
struct Closed<'a>(&'a str, &'a str, String);

/// The archive region `deck/view/archive.mjs` serves at `NOW` over a store holding exactly `closed`: the
/// producer's own output, never a region typed here.
fn recorded(closed: &[Closed]) -> Value {
    let dir = std::env::temp_dir().join(format!(
        "pilot-archive-filter-{}-{}",
        std::process::id(),
        RECORDS.fetch_add(1, Ordering::Relaxed)
    ));
    std::fs::create_dir_all(&dir).expect("a scratch store");
    let items: Vec<Value> = closed
        .iter()
        .enumerate()
        .map(|(i, Closed(title, repo, at))| {
            json!({ "id": format!("itm_{i:012x}"), "kind": "ticket", "title": title, "repo": repo,
                "state": "done", "postedAt": "2026-10-01T08:00:00.000Z", "resolvedAt": at })
        })
        .collect();
    std::fs::write(dir.join("deck.json"), json!({ "items": items }).to_string())
        .expect("the scratch store's deck.json");
    let script = "const { pathToFileURL } = await import('node:url'); \
        const { archiveView } = await import(pathToFileURL(process.env.ARCHIVE_VIEW).href); \
        process.stdout.write(JSON.stringify(archiveView({ screen: 'archive' }, Date.parse(process.env.ARCHIVE_NOW))));";
    let out = Command::new("node")
        .args(["--input-type=module", "-e", script])
        .env("PILOT_DECK_DIR", &dir)
        .env("ARCHIVE_VIEW", manifest_dir().join("../view/archive.mjs"))
        .env("ARCHIVE_NOW", NOW)
        .output()
        .expect("node is on PATH");
    let _ = std::fs::remove_dir_all(&dir);
    assert!(
        out.status.success(),
        "the view: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    serde_json::from_slice(&out.stdout).expect("the view's json")
}

fn days_of(region: &Value) -> Vec<Day<'_>> {
    Vec::<Day>::deserialize(&region["days"]).expect("the region's days")
}

fn titles<'a>(days: &[Day<'a>]) -> Vec<Vec<&'a str>> {
    days.iter()
        .map(|d| d.rows.iter().map(|r| r.title).collect())
        .collect()
}

fn closed(title: &'static str, day: u32, hour: u32) -> Closed<'static> {
    Closed(
        title,
        "C:/work/alpha",
        format!("2026-11-{day:02}T{hour:02}:00:00.000Z"),
    )
}

#[test]
fn a_date_sort_gives_the_exact_order_both_ways() {
    let region = recorded(&[
        closed("Alpha", 20, 10),
        closed("Bravo", 20, 13),
        closed("Charlie", 19, 12),
        closed("Delta", 19, 9),
        closed("Echo", 18, 11),
    ]);
    let days = days_of(&region);
    assert_eq!(days.len(), 3, "three day sections");

    assert_eq!(
        titles(&sort_rows(&days, Column::Date, true)),
        [
            vec!["Echo"],
            vec!["Delta", "Charlie"],
            vec!["Alpha", "Bravo"]
        ],
    );
    assert_eq!(
        titles(&sort_rows(&days, Column::Date, false)),
        [
            vec!["Bravo", "Alpha"],
            vec!["Charlie", "Delta"],
            vec!["Echo"]
        ],
    );
    // A section a search has emptied keeps its date's place, both ways.
    let searched = filter_rows(&days, None, "Delta");
    let empty: Vec<&str> = vec![];
    assert_eq!(
        titles(&sort_rows(&searched, Column::Date, true)),
        [empty.clone(), vec!["Delta"], empty.clone()],
    );
    assert_eq!(
        titles(&sort_rows(&searched, Column::Date, false)),
        [empty.clone(), vec!["Delta"], empty],
    );
    // Any other column orders inside a section and keeps every section where it was (A4).
    assert_eq!(
        titles(&sort_rows(&days, Column::Title, true)),
        [
            vec!["Alpha", "Bravo"],
            vec!["Charlie", "Delta"],
            vec!["Echo"]
        ],
    );
}

#[test]
fn search_leaves_exactly_a_tickets_rows() {
    let region = recorded(&[
        closed("Rework the login page", 20, 10),
        closed("Bravo", 20, 13),
        closed("Charlie", 19, 12),
        Closed("Delta", "C:/work/beta", "2026-11-19T09:00:00.000Z".into()),
        closed("Rework the login page", 18, 11),
    ]);
    let days = days_of(&region);

    let found = filter_rows(&days, None, "LOGIN page");
    assert_eq!(
        titles(&found),
        [
            vec!["Rework the login page"],
            vec![],
            vec!["Rework the login page"]
        ],
        "both of its rows, every other section emptied and none dropped"
    );
    assert_eq!(
        titles(&filter_rows(&days, None, "c:/WORK/beta")),
        [vec![], vec!["Delta"], vec![]],
        "a field's value is searched too"
    );
}

#[test]
fn a_kind_filter_shows_exactly_its_count() {
    let region = recorded(&[
        closed("Alpha", 20, 10),
        closed("Bravo", 19, 12),
        closed("Charlie", 18, 11),
    ]);
    let days = days_of(&region);
    let count = region["kinds"]
        .as_array()
        .expect("the region's kinds")
        .iter()
        .find(|k| k["kind"] == "tickets")
        .and_then(|k| k["count"].as_u64())
        .expect("a tickets count");
    let rows = |days: &[Day]| days.iter().map(|d| d.rows.len() as u64).sum::<u64>();

    assert_eq!(rows(&filter_rows(&days, Some("tickets"), "")), count);
    assert_eq!(rows(&filter_rows(&days, Some("logs"), "")), 0);
}

fn keys(rt: &Runtime<State>) -> Vec<String> {
    rt.elements()
        .into_iter()
        .filter(|element| !element.exiting)
        .filter_map(|element| element.key)
        .collect()
}

/// A loopback relay in front of `deck`, counting every HTTP request a client sends through it.
fn counting_relay(deck: &Scratch) -> (u16, Arc<AtomicUsize>) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("a socket");
    let port = listener.local_addr().expect("an address").port();
    let (upstream, count) = (deck.port, Arc::new(AtomicUsize::new(0)));
    let counted = count.clone();
    std::thread::spawn(move || {
        for client in listener.incoming().flatten() {
            let Ok(server) = TcpStream::connect(("127.0.0.1", upstream)) else {
                continue;
            };
            let (mut up_in, mut up_out) = (
                client.try_clone().expect("a clone"),
                server.try_clone().expect("a clone"),
            );
            let (mut down_in, mut down_out) = (server, client);
            let counted = counted.clone();
            // The daemon answers only a Host naming the port it listens on (`isOwnHost`).
            let (ours, theirs) = (format!("127.0.0.1:{port}"), format!("127.0.0.1:{upstream}"));
            std::thread::spawn(move || {
                let mut buf = [0u8; 16384];
                while let Ok(n) = up_in.read(&mut buf) {
                    // A request's text, as ureq writes it; its head arrives in one read.
                    let chunk = String::from_utf8_lossy(&buf[..n]).replace(&ours, &theirs);
                    if n == 0 || up_out.write_all(chunk.as_bytes()).is_err() {
                        break;
                    }
                    let lines = buf[..n]
                        .windows(11)
                        .filter(|w| w == b" HTTP/1.1\r\n")
                        .count();
                    counted.fetch_add(lines, Ordering::SeqCst);
                }
            });
            std::thread::spawn(move || {
                let _ = std::io::copy(&mut down_in, &mut down_out);
            });
        }
    });
    (port, count)
}

#[test]
fn typing_filters_with_no_request() {
    let deck = Scratch::start();
    let body = "> fix the thing\n\n1. It is done. *The test shows it.*\n\nThread itm_d2f9ed260436.";
    let ids: Vec<String> = ["Alpha search target", "Bravo other"]
        .iter()
        .map(|title| {
            let id = id_in(&tool(
                &deck,
                "deck_post",
                json!({ "kind": "ticket", "title": title, "body": body, "repo": "C:/work/alpha", "author": "", "sliceCount": 1 }),
            ));
            tool(&deck, "deck_resolve", json!({ "id": id, "resolution": "done", "author": "" }));
            id
        })
        .collect();
    let (port, requests) = counting_relay(&deck);
    let mut rt = {
        let _held = ENV.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let port = port.to_string();
        let vars = [
            ("PILOT_DECK_DIR", deck.dir.to_str().expect("a utf-8 dir")),
            ("PILOT_DECK_PORT", port.as_str()),
        ];
        // SAFETY: every test that touches the environment does it holding `ENV`.
        unsafe {
            vars.iter()
                .for_each(|(name, value)| std::env::set_var(name, value))
        };
        let made = app::app().headless_runtime((1280.0, 800.0), Env::new(true, 1.0));
        unsafe { vars.iter().for_each(|(name, _)| std::env::remove_var(name)) };
        made
    };
    rt.frame(0.0);
    frame_until(&mut rt, "the first view", |rt| {
        !rt.state.view.regions.is_empty()
    });
    rt.frame(1.0);
    let (x, y) = rt
        .find("strip-archive")
        .expect("an Archive button in the strip");
    rt.pointer_move(x, y);
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
    rt.frame(0.0);
    let row = |id: &str| format!("archive-row-{id}");
    frame_until(&mut rt, "the archive's rows", |rt| {
        ids.iter().all(|id| keys(rt).contains(&row(id)))
    });
    let settle = |rt: &mut Runtime<State>| {
        let start = Instant::now();
        while start.elapsed() < Duration::from_millis(500) {
            rt.frame(1.0 / 60.0);
            std::thread::sleep(Duration::from_millis(5));
        }
    };
    settle(&mut rt);
    let before = requests.load(Ordering::SeqCst);
    assert!(before > 0, "the window reads the deck through the relay");

    let (x, y) = rt.find("archive-search").expect("a search box");
    rt.pointer_move(x, y);
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
    rt.frame(0.0);
    rt.paste("SEARCH target");
    rt.frame(0.0);
    settle(&mut rt);

    let drawn = keys(&rt);
    assert!(drawn.contains(&row(&ids[0])), "the match stays: {drawn:?}");
    assert!(
        !drawn.contains(&row(&ids[1])),
        "the other row goes: {drawn:?}"
    );
    assert_eq!(
        requests.load(Ordering::SeqCst),
        before,
        "typing asked the deck nothing"
    );
}

/// The window on a recorded archive view, with no deck behind it.
fn archive_window(region: Value) -> Runtime<State> {
    let mut state = State {
        view: View {
            screen: "archive".into(),
            seq: 1,
            regions: [("archive".to_string(), region)].into_iter().collect(),
        },
        ..State::default()
    };
    state.query.screen = "archive".into();
    Runtime::new(state, app::view, (1280.0, 800.0), Env::new(true, 1.0))
}

#[test]
fn a_frame_stays_under_50_ms_at_real_scale() {
    // 10,000 rows over 50 days, 200 a day, Today's open and every other folded (A5).
    let titles: Vec<String> = (0..10_000).map(|i| format!("Ticket number {i}")).collect();
    let region = recorded(
        &titles
            .iter()
            .enumerate()
            .map(|(i, title)| Closed(title.as_str(), "C:/work/alpha", stamp(i / 200, i % 200)))
            .collect::<Vec<_>>(),
    );
    assert_eq!(
        region["days"].as_array().map(|d| d
            .iter()
            .map(|d| d["rows"].as_array().map_or(0, Vec::len))
            .sum::<usize>()),
        Some(10_000)
    );
    let mut rt = archive_window(region);
    rt.frame(0.0);
    // The bar is a release build's, as the window ships (`cargo build --release`): the gate's debug build
    // draws every row and prints its times, and `cargo test --release` holds them to 50 ms: a debug Rune,
    // its dependencies at opt-level 0, frames this view several times slower than the window that ships.
    let (build, bar) = if cfg!(debug_assertions) {
        ("debug", None)
    } else {
        ("release", Some(Duration::from_millis(50)))
    };
    // Today holds tickets 0 to 199; "number 1" is in 1, 10 to 19 and 100 to 199.
    for (case, search, drawn) in [
        ("view order", "", 200),
        ("searched and sorted", "NUMBER 1", 111),
    ] {
        rt.update(|s, _| {
            s.regions.archive.search = TextEdit::new(search);
            s.regions.archive.sort = (!search.is_empty()).then_some((Column::Title, true));
        });
        rt.frame(1.0 / 60.0);
        let rows = keys(&rt)
            .iter()
            .filter(|key| key.starts_with("archive-row-"))
            .count();
        assert_eq!(rows, drawn, "{case}: Today's rows drawn");
        for run in 1..=3 {
            // Each timed frame re-runs the whole view, as a keystroke's does.
            rt.invalidate();
            let start = Instant::now();
            rt.frame(1.0 / 60.0);
            let took = start.elapsed();
            println!("archive frame, {case}, run {run}: {took:?} ({build} build)");
            assert!(
                bar.is_none_or(|bar| took < bar),
                "{case}, run {run}: {took:?} ({build} build)"
            );
        }
    }
}

/// `NOW`'s day less `day` days (under 50, so November or October), at 08:00 UTC plus `minute` minutes.
fn stamp(day: usize, minute: usize) -> String {
    let (month, date) = if day < 20 {
        (11, 20 - day)
    } else {
        (10, 31 - (day - 20))
    };
    format!(
        "2026-{month:02}-{date:02}T{:02}:{:02}:00.000Z",
        8 + minute / 60,
        minute % 60
    )
}

#[test]
fn a_region_with_no_days_yet_draws_nothing() {
    // Every other screen's archive region is `{}` (deck/view/archive.mjs): until the archive's own view lands,
    // the first press must not claim the archive is empty.
    let mut rt = archive_window(json!({}));
    rt.frame(0.0);
    let drawn = keys(&rt);
    let mine: Vec<&String> = drawn.iter().filter(|k| k.starts_with("archive")).collect();
    assert_eq!(mine, ["archive"], "the region, empty: {drawn:?}");
}
