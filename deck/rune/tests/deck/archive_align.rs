//! archive-page S19 (spec 14): the archive's rows are fixed columns, its bar named groups, its day headings and
//! its detail's labels on the rows' lines, and the bar stays put above the list as the centre scrolls. Every
//! region is the one `deck/view/archive.mjs` and `deck/archive-detail.mjs` serve over a seeded scratch store.

use crate::archive_bar::ScratchPrefs;
use crate::support::manifest_dir;

use std::process::Command;
use std::sync::atomic::{AtomicUsize, Ordering};

use pilot_deck::app::{self, State};
use pilot_deck::client::View;
use pilot_deck::theme::{self, space};
use rune::{Env, Runtime};
use serde_json::Value;

/// The clock both regions are computed at; every stamp seeded is on its own date from UTC-8 to UTC+10.
const NOW: &str = "2026-11-20T12:00:00.000Z";

/// The ticket seeded closed, whose detail behaviour 5 opens.
const TICKET: &str = "itm_00000000000a";

/// The archive and the ticket's detail as the views serve them over a store holding rows of three kinds whose
/// names differ in length (`ticket`, `handoff`, `classifier`), seeded through the store's own writers where it
/// has one (`appendRefusal`), with `extra` closed tickets more, one a minute before 10:00.
fn served(extra: usize) -> (Value, Value) {
    // One store per call: the tests run in parallel, and each appends its own refusal.
    static CALLS: AtomicUsize = AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!(
        "pilot-archive-align-{}-{}",
        std::process::id(),
        CALLS.fetch_add(1, Ordering::Relaxed)
    ));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("a scratch store");
    let script = "const { pathToFileURL } = await import('node:url'); \
        const deck = (f) => import(pathToFileURL(process.env.DECK + '/' + f).href); \
        const fs = await import('node:fs'); const path = await import('node:path'); \
        const dir = process.env.PILOT_DECK_DIR; const extra = Number(process.env.EXTRA); \
        const closed = (id, kind, title, at) => ({ id, kind, title, repo: 'C:/work/alpha', state: 'done', \
          postedAt: '2026-11-20T08:00:00.000Z', resolvedAt: at, body: 'Over to you.' }); \
        const items = [closed(process.env.TICKET, 'ticket', 'Alpha', '2026-11-20T10:00:00.000Z'), \
          closed('itm_00000000000b', 'handoff', 'Hand over the archive page', '2026-11-20T11:00:00.000Z')]; \
        for (let i = 0; i < extra; i++) items.push(closed('itm_1' + String(i).padStart(11, '0'), 'ticket', \
          'Ticket number ' + i, new Date(Date.parse('2026-11-20T10:00:00.000Z') - (i + 1) * 60000).toISOString())); \
        fs.writeFileSync(path.join(dir, 'deck.json'), JSON.stringify({ items })); \
        const { appendRefusal } = await deck('classifier-log.mjs'); \
        appendRefusal({ repo: 'C:/work/alpha', tool: 'Bash', command: 'rm -rf build', reason: 'destructive', \
          agent: 'implementer' }, { dir, now: () => new Date('2026-11-20T09:00:00.000Z') }); \
        const { archiveView } = await deck('view/archive.mjs'); \
        const { archiveDetail } = await deck('archive-detail.mjs'); \
        process.stdout.write(JSON.stringify([archiveView({ screen: 'archive' }, Date.parse(process.env.NOW)), \
          archiveDetail(process.env.TICKET, dir)]));";
    let out = Command::new("node")
        .args(["--input-type=module", "-e", script])
        .env("PILOT_DECK_DIR", &dir)
        .env("DECK", manifest_dir().join(".."))
        .env("NOW", NOW)
        .env("TICKET", TICKET)
        .env("EXTRA", extra.to_string())
        .output()
        .expect("node is on PATH");
    let _ = std::fs::remove_dir_all(&dir);
    assert!(
        out.status.success(),
        "the views: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    let [list, detail]: [Value; 2] = serde_json::from_slice(&out.stdout).expect("the views' json");
    (list, detail)
}

/// The window `width` wide on the archive screen, its view holding `region` as `name`, settled; with `id`, on
/// that row's detail.
fn window(name: &str, region: Value, id: Option<&str>, width: f32) -> Runtime<State> {
    let mut state = State {
        view: View {
            screen: "archive".into(),
            seq: 1,
            regions: [(name.to_string(), region)].into_iter().collect(),
        },
        ..State::default()
    };
    state.query.screen = "archive".into();
    state.query.id = id.map(str::to_string);
    let mut rt = Runtime::new(state, app::view, (width, 800.0), Env::new(true, 1.0));
    settle(&mut rt);
    rt
}

fn settle(rt: &mut Runtime<State>) {
    rt.frame(0.0);
    for _ in 0..30 {
        rt.frame(1.0 / 60.0);
    }
}

fn element(rt: &Runtime<State>, key: &str) -> rune::runtime::ElementInfo {
    rt.elements()
        .into_iter()
        .find(|e| e.key.as_deref() == Some(key) && !e.exiting)
        .unwrap_or_else(|| panic!("no {key} drawn"))
}

fn rect(rt: &Runtime<State>, key: &str) -> [f32; 4] {
    element(rt, key).rect
}

/// The drawn rects of every element whose key starts with `prefix` and ends with `suffix`, by key.
fn rects(rt: &Runtime<State>, prefix: &str, suffix: &str) -> Vec<(String, [f32; 4])> {
    let mut found: Vec<(String, [f32; 4])> = rt
        .elements()
        .into_iter()
        .filter(|e| !e.exiting)
        .filter_map(|e| {
            let key = e.key?;
            (key.starts_with(prefix) && key.ends_with(suffix)).then_some((key, e.rect))
        })
        .collect();
    found.sort_by(|a, b| a.0.cmp(&b.0));
    found
}

/// The rows drawn, by id.
fn row_ids(rt: &Runtime<State>) -> Vec<String> {
    rects(rt, "archive-row-", "")
        .into_iter()
        .filter_map(|(key, _)| Some(key.strip_prefix("archive-row-")?.to_string()))
        .collect()
}

/// The key of row `id`'s `part` column.
fn cell(part: &str, id: &str) -> String {
    format!("archive-col-{part}-{id}")
}

fn same(values: &[f32]) -> bool {
    values.windows(2).all(|w| (w[0] - w[1]).abs() < 0.5)
}

#[test]
fn row_columns_line_up() {
    let (list, _) = served(0);
    for width in [1280.0, 900.0] {
        let rt = window("archive", list.clone(), None, width);
        let ids = row_ids(&rt);
        assert_eq!(ids.len(), 3, "{width}: a row of each kind: {ids:?}");
        let kinds: Vec<String> = ids
            .iter()
            .map(|id| element(&rt, &cell("kind", id)).text.unwrap_or_default())
            .collect();
        assert!(
            kinds
                .iter()
                .map(String::len)
                .collect::<std::collections::HashSet<_>>()
                .len()
                >= 2,
            "{width}: kinds of different lengths: {kinds:?}"
        );
        for part in ["kind", "time", "title"] {
            let cells: Vec<[f32; 4]> = ids.iter().map(|id| rect(&rt, &cell(part, id))).collect();
            let xs: Vec<f32> = cells.iter().map(|r| r[0]).collect();
            assert!(
                same(&xs),
                "{width}: every row's {part} starts at one x: {xs:?}"
            );
            if part != "title" {
                let ws: Vec<f32> = cells.iter().map(|r| r[2]).collect();
                assert!(same(&ws), "{width}: the {part} column is one width: {ws:?}");
            }
        }
        // The kind column holds the longest kind name the view lists, in caption `ch`.
        let longest = list["kinds"]
            .as_array()
            .expect("the kinds")
            .iter()
            .filter_map(|k| k["kind"].as_str())
            .map(str::len)
            .max()
            .expect("a kind");
        let kind_w = rect(&rt, &cell("kind", &ids[0]))[2];
        let ch = theme::type_::CAPTION.size * 0.6;
        assert!(
            (kind_w - longest as f32 * ch).abs() < 0.5,
            "{width}: the kind column is {longest} ch: {kind_w}"
        );
    }
}

#[test]
fn fields_sit_under_the_title() {
    let (list, _) = served(0);
    for width in [1280.0, 900.0] {
        let rt = window("archive", list.clone(), None, width);
        for id in row_ids(&rt) {
            let (title, fields, row) = (
                rect(&rt, &cell("title", &id)),
                rect(&rt, &cell("fields", &id)),
                rect(&rt, &format!("archive-row-{id}")),
            );
            assert!(
                (fields[0] - title[0]).abs() < 0.5,
                "{width}: {id}'s fields start at its title's x: {fields:?} {title:?}"
            );
            assert!(
                fields[1] >= title[1] + title[3] - 0.5,
                "{width}: {id}'s fields sit under its title"
            );
            assert!(
                fields[0] + fields[2] <= row[0] + row[2] + 0.5,
                "{width}: {id}'s fields wrap inside the row: {fields:?} {row:?}"
            );
        }
    }
}

#[test]
fn the_bar_is_grouped() {
    let (list, _) = served(0);
    let _scratch = ScratchPrefs::new("archive-align");
    let mut rt = window("archive", list, None, 1280.0);
    let (bar, search, sort, kinds) = (
        rect(&rt, "archive-bar"),
        rect(&rt, "archive-search"),
        element(&rt, "archive-group-sort"),
        element(&rt, "archive-group-kinds"),
    );
    assert_eq!(sort.text.as_deref(), Some("Sort"));
    assert_eq!(kinds.text.as_deref(), Some("Kinds"));
    assert!(
        (search[2] - bar[2]).abs() < 0.5,
        "the search takes the bar's width: {search:?} {bar:?}"
    );
    assert!(
        search[1] + search[3] <= sort.rect[1] && sort.rect[1] + sort.rect[3] <= kinds.rect[1],
        "search, then Sort, then Kinds: {search:?} {:?} {:?}",
        sort.rect,
        kinds.rect
    );
    let date = rect(&rt, "archive-sort-date");
    let first_kind = rects(&rt, "archive-kind-", "")
        .into_iter()
        .map(|(_, r)| r)
        .min_by(|a, b| (a[1], a[0]).partial_cmp(&(b[1], b[0])).expect("numbers"))
        .expect("a kind toggle");
    assert!(
        (date[0] - first_kind[0]).abs() < 0.5,
        "both groups' controls start at one x: {date:?} {first_kind:?}"
    );

    let controls = |rt: &Runtime<State>| {
        let mut all = rects(rt, "archive-sort-", "");
        all.extend(rects(rt, "archive-kind-", ""));
        all
    };
    let before = controls(&rt);
    for key in ["archive-sort-title", "archive-kind-classifier"] {
        let (x, y) = rt.find(key).unwrap_or_else(|| panic!("no {key} drawn"));
        rt.pointer_move(x, y);
        rt.pointer_down(x, y);
        rt.pointer_up(x, y);
        settle(&mut rt);
    }
    assert_eq!(
        rt.state.regions.archive.kind.as_deref(),
        Some("classifier"),
        "the press turned the toggle on"
    );
    assert_eq!(
        controls(&rt),
        before,
        "no control moved as toggles turned on"
    );
}

#[test]
fn day_headings_align_with_the_rows() {
    let (list, _) = served(0);
    let rt = window("archive", list.clone(), None, 1280.0);
    let today = list["days"][0]["key"]
        .as_str()
        .expect("a day key")
        .to_string();
    let heading = rect(&rt, &format!("archive-day-{today}"));
    let count = element(&rt, &format!("archive-count-{today}"));
    let kind_x = rect(&rt, &cell("kind", &row_ids(&rt)[0]))[0];
    assert!(
        (heading[0] - kind_x).abs() < 0.5,
        "the heading starts at the kind column: {heading:?} {kind_x}"
    );
    let after = count.rect[0] - (heading[0] + heading[2]);
    assert!(
        (0.0..=space::within + 0.5).contains(&after),
        "the count sits right after the heading: {after} px"
    );
    assert_eq!(count.text.as_deref(), Some("3"));
    assert_eq!(
        count.text_color,
        Some(theme::tokens(true).quiet),
        "the count is quiet"
    );
}

#[test]
fn detail_labels_line_up() {
    let (_, detail) = served(0);
    assert!(
        detail["fields"].as_array().is_some_and(|f| f.len() >= 3),
        "the ticket's fields: {detail}"
    );
    for width in [1280.0, 900.0] {
        let rt = window("archiveDetail", detail.clone(), Some(TICKET), width);
        let values = rects(&rt, "archive-detail-field-", "");
        assert_eq!(
            values.len(),
            detail["fields"].as_array().map_or(0, Vec::len),
            "{width}: a value per field"
        );
        let xs: Vec<f32> = values.iter().map(|(_, r)| r[0]).collect();
        assert!(same(&xs), "{width}: every value starts at one x: {xs:?}");
    }
}

#[test]
fn the_bar_stays_put_while_the_list_scrolls() {
    let (list, _) = served(60);
    let mut rt = window("archive", list, None, 1280.0);
    let first_row = |rt: &Runtime<State>| {
        rt.elements()
            .into_iter()
            .filter(|e| !e.exiting)
            .filter_map(|e| {
                let key = e.key?;
                let id = key.strip_prefix("archive-row-")?;
                (!id.contains('-')).then_some((e.rect[1], id.to_string()))
            })
            .min_by(|a, b| a.0.total_cmp(&b.0))
            .expect("a row drawn")
    };
    let (bar, rule, row) = (
        rect(&rt, "archive-bar"),
        rect(&rt, "archive-bar-rule"),
        first_row(&rt),
    );
    // The centre a page down, as PageDown pages it with nothing focused.
    rt.update(|_, tx| tx.scroll_page(format!("{}-archive-", app::CENTRE), 1));
    settle(&mut rt);
    let moved = first_row(&rt);
    println!(
        "a page down: centre_y {} px, first row {row:?} -> {moved:?}",
        rt.state.centre_y.get()
    );
    assert!(rt.state.centre_y.get() > 0.0, "the centre scrolled");
    assert_eq!(rect(&rt, "archive-bar")[1], bar[1], "the bar stays");
    assert_eq!(rect(&rt, "archive-bar-rule")[1], rule[1], "its rule stays");
    assert_ne!(moved, row, "the list scrolled under it");
}
