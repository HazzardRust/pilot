//! A scratch daemon (L7): started and stopped through `pilot deck --scratch` and `--stop`, the CLI
//! over `deck/scratch.mjs`, on its own store dir and port; never the user's deck on 4321.

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
        let out = pilot(&["deck", "--scratch"]);
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
}

impl Drop for Scratch {
    fn drop(&mut self) {
        pilot(&["deck", "--stop", &self.pid.to_string()]);
    }
}
