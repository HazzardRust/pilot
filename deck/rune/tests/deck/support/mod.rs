//! A scratch daemon (L7): started and stopped through `pilot deck --scratch` and `--stop`, the CLI
//! over `deck/scratch.mjs`, on its own store dir and port; never the user's deck on 4321.

// Each test binary compiles this module whole and uses only part of it.
#![allow(dead_code)]

use std::cell::Cell;
use std::marker::PhantomData;
use std::path::PathBuf;
use std::process::Command;
use std::sync::{Condvar, Mutex};

use pilot_deck::act::Acted;
use pilot_deck::app::{self, State};
use pilot_deck::client::Client;
use rune::{Env, Runtime};
use serde_json::{Value, json};

pub struct Scratch {
    pub url: String,
    pub port: u16,
    pub pid: u32,
    pub dir: PathBuf,
    // Dropped after `drop` has stopped the daemon, so the next test's deck starts only then.
    _slot: Slot,
}

/// Tests holding a scratch deck at once. As 25 binaries, at most one file's tests ran together, and
/// the busiest file held 8 decks; one binary on 16 threads held 17 and ran a loaded machine out of
/// memory, so the decks get the old ceiling back while the tests without one keep every thread.
const DECKS: usize = 8;

static HELD: (Mutex<usize>, Condvar) = (Mutex::new(0), Condvar::new());

thread_local! {
    /// This test's live decks: its second deck rides its first slot, so a test holding two never
    /// waits on itself.
    static MINE: Cell<usize> = const { Cell::new(0) };
}

/// One test's claim on the deck ceiling, taken before its first deck starts. Not `Send`: `MINE` counts
/// per thread, so a deck must be dropped on the thread that started it.
struct Slot(PhantomData<*const ()>);

impl Slot {
    fn take() -> Slot {
        if MINE.get() == 0 {
            let (held, freed) = &HELD;
            let mut n = held.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
            while *n >= DECKS {
                n = freed
                    .wait(n)
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
            }
            *n += 1;
        }
        MINE.set(MINE.get() + 1);
        Slot(PhantomData)
    }
}

impl Drop for Slot {
    fn drop(&mut self) {
        MINE.set(MINE.get() - 1);
        if MINE.get() == 0 {
            let (held, freed) = &HELD;
            *held.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) -= 1;
            freed.notify_one();
        }
    }
}

/// `deck/rune` in the worktree running this test, read when it runs, never baked in with `env!`: the gate's
/// shared `CARGO_TARGET_DIR` (cheap-suite S3, L5) hands a test binary one worktree built to another, and
/// `cargo test` sets `CARGO_MANIFEST_DIR` for the binary it runs.
pub fn manifest_dir() -> PathBuf {
    std::env::var_os("CARGO_MANIFEST_DIR")
        .map(PathBuf::from)
        .expect("CARGO_MANIFEST_DIR is unset: run the deck's tests through cargo test")
}

fn pilot(args: &[&str]) -> String {
    let cli = manifest_dir().join("../../bin/pilot.mjs");
    let out = Command::new("node")
        .arg(cli)
        .args(args)
        // The deck's own test guard (`deck/session.mjs`): a scratch daemon refuses Start before any spawn.
        .env("PILOT_DECK_NO_START", "1")
        .output()
        .expect("node is on PATH");
    assert!(
        out.status.success(),
        "pilot {args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8(out.stdout).expect("utf-8 output")
}

impl Scratch {
    pub fn start() -> Scratch {
        Scratch::start_on(None)
    }

    /// A scratch deck on `port` when given, as a restarted daemon comes back where it was.
    pub fn start_on(port: Option<u16>) -> Scratch {
        let port = port.map(|p| p.to_string());
        let mut args = vec!["deck", "--scratch"];
        if let Some(port) = &port {
            args.extend(["--port", port]);
        }
        let slot = Slot::take();
        let out = pilot(&args);
        let field = |name: &str| {
            out.lines()
                .find_map(|line| line.strip_prefix(name)?.strip_prefix(' '))
                .map(str::to_string)
                .unwrap_or_else(|| panic!("no {name} line in {out:?}"))
        };
        let url = field("url");
        let port = url
            .rsplit(':')
            .next()
            .and_then(|p| p.parse().ok())
            .expect("a port in the url");
        Scratch {
            port,
            pid: field("pid").parse().expect("a pid"),
            dir: PathBuf::from(field("dir")),
            url,
            _slot: slot,
        }
    }

    /// Posts a question on `repo` through `deck_post`, as a session's tool call does.
    pub fn post(&self, title: &str, repo: &str) {
        let secret = std::fs::read_to_string(self.dir.join("deck.secret"))
            .expect("the scratch deck's secret");
        let args = serde_json::json!({ "kind": "question", "title": title, "body": "A or B", "repo": repo, "author": "" });
        let response = ureq::post(format!("{}/api/tool", self.url))
            .header("Authorization", format!("Bearer {}", secret.trim()))
            .send_json(serde_json::json!({ "name": "deck_post", "arguments": args }))
            .expect("the scratch deck takes the post");
        assert_eq!(response.status(), 200);
    }

    /// An agent's first heartbeat from `cwd`, as `hooks/agent-roster.js` sends it.
    pub fn heartbeat(&self, agent_id: &str, cwd: &str) {
        let secret = std::fs::read_to_string(self.dir.join("deck.secret"))
            .expect("the scratch deck's secret");
        let response = ureq::post(format!("{}/api/agents", self.url))
            .header("Authorization", format!("Bearer {}", secret.trim()))
            .send_json(
                serde_json::json!({ "agentId": agent_id, "agentType": "Explore", "cwd": cwd }),
            )
            .expect("the scratch deck takes the heartbeat");
        assert_eq!(response.status(), 200);
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        pilot(&["deck", "--stop", &self.pid.to_string()]);
    }
}

/// The client reads its address from the environment, which every test in the one test binary shares.
pub static ENV: Mutex<()> = Mutex::new(());

/// A Rune client on `deck`, read from the environment as the window reads it.
pub fn client_for(deck: &Scratch) -> Client {
    client_on(deck, deck.port)
}

/// A Rune client with `deck`'s secret, dialling `port`: a deck that is not `deck`'s daemon.
pub fn client_on(deck: &Scratch, port: u16) -> Client {
    let _held = ENV.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let port = port.to_string();
    let vars = [
        ("PILOT_DECK_DIR", deck.dir.to_str().expect("a utf-8 dir")),
        ("PILOT_DECK_PORT", port.as_str()),
    ];
    // SAFETY: every test that touches the environment does it here, holding `ENV`.
    unsafe {
        vars.iter()
            .for_each(|(name, value)| std::env::set_var(name, value))
    };
    let made = Client::from_env();
    unsafe { vars.iter().for_each(|(name, _)| std::env::remove_var(name)) };
    made.expect("a loopback client")
}

/// The window as `main` opens it on `deck`, headless, with its live reader running, framed until the
/// reader's first view has landed.
pub fn live_window(deck: &Scratch) -> Runtime<State> {
    let mut rt = {
        let _held = ENV.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let port = deck.port.to_string();
        let vars = [
            ("PILOT_DECK_DIR", deck.dir.to_str().expect("a utf-8 dir")),
            ("PILOT_DECK_PORT", port.as_str()),
        ];
        // SAFETY: every test that touches the environment does it here, holding `ENV`.
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
    // The window loaded a view of its own and the reader's first lands right behind it: let it, so
    // a test that sets a recorded view is not undone by it.
    let settle = std::time::Instant::now();
    while settle.elapsed() < std::time::Duration::from_millis(500) {
        rt.frame(1.0 / 60.0);
        std::thread::yield_now();
    }
    rt
}

/// Frames `rt` until `done` holds, or fails naming `what` after five seconds.
pub fn frame_until(rt: &mut Runtime<State>, what: &str, done: impl Fn(&Runtime<State>) -> bool) {
    let start = std::time::Instant::now();
    while !done(rt) {
        rt.frame(1.0 / 60.0);
        assert!(start.elapsed().as_secs() < 5, "{what} not within 5 s");
        std::thread::yield_now();
    }
}

pub fn secret(deck: &Scratch) -> String {
    std::fs::read_to_string(deck.dir.join("deck.secret"))
        .expect("the scratch deck's secret")
        .trim()
        .to_string()
}

/// A session's tool call, as an agent makes it; answers the tool's text.
pub fn tool(deck: &Scratch, name: &str, arguments: Value) -> String {
    let mut response = ureq::post(format!("{}/api/tool", deck.url))
        .header("Authorization", format!("Bearer {}", secret(deck)))
        .send_json(json!({ "name": name, "arguments": arguments }))
        .expect("the scratch deck takes the tool call");
    let body: Value = response.body_mut().read_json().expect("json");
    body["content"][0]["text"]
        .as_str()
        .unwrap_or_else(|| panic!("{name} was refused: {body}"))
        .to_string()
}

pub fn id_in(text: &str) -> String {
    let at = text.find("itm_").expect("an item id in the tool's answer");
    let hex: String = text[at + 4..]
        .chars()
        .take_while(char::is_ascii_hexdigit)
        .collect();
    format!("itm_{hex}")
}

/// An open question with two options on `repo`; answers its id.
pub fn question(deck: &Scratch, repo: &str) -> String {
    id_in(&tool(
        deck,
        "deck_post",
        json!({ "kind": "question", "title": "Which?", "body": "A or B", "repo": repo, "author": "", "options": ["A", "B"] }),
    ))
}

/// A green ticket titled `Seeded ticket` on `repo` and its open steps thread of `n` steps, written to the
/// scratch store by `seed-steps.mjs` (`deck_post` refuses the kind); answers the thread's id.
pub fn seed_steps(deck: &Scratch, repo: &str, n: usize) -> String {
    let out = Command::new("node")
        .arg(manifest_dir().join("tests/deck/support/seed-steps.mjs"))
        .arg(&deck.dir)
        .arg(repo)
        .arg(n.to_string())
        .output()
        .expect("node is on PATH");
    assert!(
        out.status.success(),
        "seed-steps: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    id_in(&String::from_utf8_lossy(&out.stdout))
}

/// A read route's answer, behind the secret.
pub fn get(deck: &Scratch, path: &str) -> ureq::http::Response<ureq::Body> {
    ureq::get(format!("{}{path}", deck.url))
        .header("Authorization", format!("Bearer {}", secret(deck)))
        .call()
        .expect("the read route answers")
}

pub fn read(deck: &Scratch, path: &str) -> Value {
    get(deck, path).body_mut().read_json().expect("json")
}

/// The item as `/api/items?id=` serves it.
pub fn item(deck: &Scratch, id: &str) -> Value {
    read(deck, &format!("/api/items?id={id}"))["items"][0].clone()
}

/// A write's 303 Location; a refusal fails the test with the deck's own words.
pub fn taken(acted: Acted) -> String {
    match acted {
        Acted::Taken { location } => location,
        Acted::Refused { reason } => panic!("refused: {reason}"),
    }
}
