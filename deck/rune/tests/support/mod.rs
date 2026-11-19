//! A scratch daemon (L7): started and stopped through `pilot deck --scratch` and `--stop`, the CLI
//! over `deck/scratch.mjs`, on its own store dir and port; never the user's deck on 4321.

// Each test binary compiles this module whole and uses only part of it.
#![allow(dead_code)]

use std::path::{Path, PathBuf};
use std::process::Command;

pub struct Scratch {
    pub url: String,
    pub port: u16,
    pub pid: u32,
    pub dir: PathBuf,
}

fn pilot(args: &[&str]) -> String {
    let cli = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../bin/pilot.mjs");
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
