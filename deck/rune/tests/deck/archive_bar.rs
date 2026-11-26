//! archive-page S18 (spec 12, 13): the archive's bar reads as its own band under a rule, flush under the
//! tabs as home's first region is; the list opens newest first and keeps the user's sort across restarts.

use crate::archive_filter::{Closed, recorded};
use crate::support::ENV;

use pilot_deck::app::{self, State};
use pilot_deck::client::View;
use pilot_deck::prefs::{ArchiveSort, Column, Prefs};
use rune::{Env, Runtime};
use serde_json::{Value, json};

/// The drawn element keyed `key`.
fn element(rt: &Runtime<State>, key: &str) -> rune::runtime::ElementInfo {
    rt.elements()
        .into_iter()
        .find(|element| element.key.as_deref() == Some(key) && !element.exiting)
        .unwrap_or_else(|| panic!("no {key} drawn"))
}

/// The drawn rect `[x, y, w, h]` of the element keyed `key`.
fn rect(rt: &Runtime<State>, key: &str) -> [f32; 4] {
    element(rt, key).rect
}

/// The words the element keyed `key` draws.
fn words(rt: &Runtime<State>, key: &str) -> String {
    element(rt, key).text.unwrap_or_default()
}

/// The ids of the rows drawn, top to bottom.
fn rows(rt: &Runtime<State>) -> Vec<String> {
    let mut drawn: Vec<(f32, String)> = rt
        .elements()
        .into_iter()
        .filter(|element| !element.exiting)
        .filter_map(|element| {
            let id = element.key?.strip_prefix("archive-row-")?.to_string();
            Some((element.rect[1], id))
        })
        .collect();
    drawn.sort_by(|a, b| a.0.total_cmp(&b.0));
    drawn.into_iter().map(|(_, id)| id).collect()
}

/// The window on `screen`, its view holding `regions` and its prefs `prefs`, settled.
fn window(screen: &str, regions: Value, prefs: Prefs) -> Runtime<State> {
    let mut state = State {
        view: View {
            screen: screen.into(),
            seq: 1,
            regions: regions.as_object().expect("an object of regions").clone(),
        },
        prefs,
        ..State::default()
    };
    state.query.screen = screen.into();
    let mut rt = Runtime::new(state, app::view, (1280.0, 800.0), Env::new(true, 1.0));
    rt.frame(0.0);
    rt.frame(1.0);
    rt
}

fn closed(title: &'static str, day: u32, hour: u32) -> Closed<'static> {
    Closed(
        title,
        "C:/work/alpha",
        format!("2026-11-{day:02}T{hour:02}:00:00.000Z"),
    )
}

/// The id `recorded` gives its `i`th ticket.
fn id(i: usize) -> String {
    format!("itm_{i:012x}")
}

fn archive(closed: &[Closed], prefs: Prefs) -> Runtime<State> {
    window("archive", json!({ "archive": recorded(closed) }), prefs)
}

fn two() -> Vec<Closed<'static>> {
    vec![closed("Alpha", 20, 10), closed("Bravo", 19, 12)]
}

fn press(rt: &mut Runtime<State>, key: &str) {
    let (x, y) = rt.find(key).unwrap_or_else(|| panic!("no {key} drawn"));
    rt.pointer_move(x, y);
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
    rt.frame(1.0 / 60.0);
    rt.frame(1.0);
}

#[test]
fn a_rule_sets_the_bar_apart() {
    let rt = archive(&two(), Prefs::default());
    let (bar, rule, list, region) = (
        rect(&rt, "archive-bar"),
        rect(&rt, "archive-bar-rule"),
        rect(&rt, "archive-list"),
        rect(&rt, "archive"),
    );
    assert_eq!(rule[2], region[2], "the rule runs the region's full width");
    assert!(rule[3] > 0.0 && rule[3] <= 2.0, "a hairline: {rule:?}");
    assert!(
        bar[1] + bar[3] <= rule[1] && rule[1] + rule[3] <= list[1],
        "the rule lies between the bar {bar:?} and the list {list:?}: {rule:?}"
    );
}

#[test]
fn the_bar_sits_under_the_tabs_as_homes_first_region_does() {
    let home = window("home", json!({}), Prefs::default());
    let header = rect(&home, "header");
    let home_gap = rect(&home, "queue")[1] - (header[1] + header[3]);

    let rt = archive(&two(), Prefs::default());
    let header = rect(&rt, "header");
    let archive_gap = rect(&rt, "archive-bar")[1] - (header[1] + header[3]);
    assert!(
        (archive_gap - home_gap).abs() <= 1.0,
        "the bar starts {archive_gap} px under the tabs, home's first region {home_gap} px"
    );
}

#[test]
fn date_newest_first_is_the_default() {
    // Today's three, posted out of order: the newest closed at 13:00.
    let rt = archive(
        &[
            closed("Alpha", 20, 10),
            closed("Bravo", 20, 13),
            closed("Charlie", 20, 8),
            closed("Delta", 19, 12),
        ],
        Prefs::default(),
    );
    assert_eq!(
        words(&rt, "archive-sort-date"),
        "Date ↓",
        "Date is on, newest first"
    );
    assert_eq!(
        words(&rt, "archive-sort-title"),
        "Title",
        "no other column is on"
    );
    assert_eq!(
        rows(&rt),
        [id(1), id(0), id(2)],
        "Today's rows, newest first"
    );
}

/// `PILOT_DECK_DIR` pointed at a fresh scratch dir while held, so a press saves the prefs there and
/// never in the user's store; dropped, even by a failed assertion, it unsets the var and removes the dir.
pub(crate) struct ScratchPrefs {
    pub dir: std::path::PathBuf,
    _held: std::sync::MutexGuard<'static, ()>,
}

impl ScratchPrefs {
    pub fn new(name: &str) -> ScratchPrefs {
        let held = ENV.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let dir = std::env::temp_dir().join(format!("pilot-deck-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        // SAFETY: every test that touches the environment does it holding `ENV`.
        unsafe { std::env::set_var("PILOT_DECK_DIR", &dir) };
        ScratchPrefs { dir, _held: held }
    }
}

impl Drop for ScratchPrefs {
    fn drop(&mut self) {
        // SAFETY: `ENV` is still held; it is released after this, as the field drops.
        unsafe { std::env::remove_var("PILOT_DECK_DIR") };
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}

#[test]
fn a_saved_sort_it_cannot_read_loses_no_other_pref() {
    let scratch = ScratchPrefs::new("archive-bad-sort");
    std::fs::create_dir_all(&scratch.dir).expect("a scratch dir");
    let file = json!({
        "open_panels": ["agents"],
        "archive_sort": { "column": "size", "ascending": true }
    });
    std::fs::write(scratch.dir.join("rune-deck.json"), file.to_string()).expect("a prefs file");

    let prefs = Prefs::load(&scratch.dir);
    assert!(prefs.open_panels.contains("agents"), "{prefs:?}");
    assert_eq!(
        prefs.archive_sort,
        ArchiveSort::default(),
        "Date, newest first"
    );
}

#[test]
fn the_sort_is_saved() {
    let scratch = ScratchPrefs::new("archive-bar");
    let dir = scratch.dir.clone();
    let today = [
        closed("Bravo", 20, 10),
        closed("Charlie", 20, 13),
        closed("Alpha", 20, 8),
    ];

    let mut rt = archive(&today, Prefs::default());
    press(&mut rt, "archive-sort-title");
    press(&mut rt, "archive-sort-title");
    let saved = Prefs::load(&dir).archive_sort;
    let file: Value =
        serde_json::from_slice(&std::fs::read(dir.join("rune-deck.json")).expect("the prefs file"))
            .expect("the prefs file's json");

    let restarted = archive(&today, Prefs::load(&dir));
    drop(scratch);

    assert_eq!(
        saved,
        ArchiveSort {
            column: Column::Title,
            ascending: false
        }
    );
    assert_eq!(
        file["archive_sort"],
        json!({ "column": "title", "ascending": false }),
        "the column and the direction, in the prefs file: {file}"
    );
    assert_eq!(words(&restarted, "archive-sort-title"), "Title ↓");
    assert_eq!(words(&restarted, "archive-sort-date"), "Date");
    assert_eq!(
        rows(&restarted),
        [id(1), id(0), id(2)],
        "Charlie, Bravo, Alpha"
    );
}
