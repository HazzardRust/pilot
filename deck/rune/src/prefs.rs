//! The Rune deck's local view state, never the store's (A4): what the user hid, folded, opened and
//! sized, kept in `rune-deck.json` beside the store (`~/.claude/pilot`) so it survives a restart. Ids,
//! names and numbers only: no secret and no message text is ever written here.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

const FILE: &str = "rune-deck.json";

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Prefs {
    /// Each open thread the user marked seen, at the pilot's write count it had then.
    pub seen: BTreeMap<String, u32>,
    /// Each repository's folded rows.
    pub folds: BTreeMap<String, BTreeSet<String>>,
    pub open_panels: BTreeSet<String>,
    /// Each resizable panel's width and height.
    pub sizes: BTreeMap<String, (f32, f32)>,
    pub hidden_reports: BTreeSet<String>,
}

impl Prefs {
    /// The prefs in `dir`; a missing, unreadable or malformed file is the default, never an error,
    /// since a lost fold is cheaper than a window that will not open.
    pub fn load(dir: &Path) -> Prefs {
        std::fs::read_to_string(dir.join(FILE))
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default()
    }

    /// Writes the prefs beside a temporary copy and renames it over the file, so a crash mid-write
    /// leaves the last whole file rather than half of one.
    pub fn save(&self, dir: &Path) -> std::io::Result<()> {
        std::fs::create_dir_all(dir)?;
        let temp = dir.join(format!("{FILE}.tmp"));
        std::fs::write(&temp, serde_json::to_vec_pretty(self)?)?;
        std::fs::rename(&temp, dir.join(FILE))
    }
}

/// Where the prefs live: the store's dir as the client reads it, `PILOT_DECK_DIR` or `~/.claude/pilot`,
/// so a scratch deck's window keeps its prefs with the scratch store and never touches the user's.
pub fn dir() -> Option<PathBuf> {
    match std::env::var("PILOT_DECK_DIR") {
        Ok(dir) if !dir.trim().is_empty() => Some(PathBuf::from(dir)),
        _ => std::env::home_dir().map(|home| home.join(".claude").join("pilot")),
    }
}
