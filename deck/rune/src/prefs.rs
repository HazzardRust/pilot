//! The Rune deck's local view state, never the store's (A4): what the user hid, folded, opened and
//! widened, kept in `rune-deck.json` beside the store (`~/.claude/pilot`) so it survives a restart. Ids,
//! names and numbers only: no secret and no message text is ever written here.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::regions::archive::Column;

const FILE: &str = "rune-deck.json";

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Prefs {
    /// Each open thread the user marked seen, at the pilot's write count it had then.
    pub seen: BTreeMap<String, u32>,
    /// Each repository's folded rows.
    pub folds: BTreeMap<String, BTreeSet<String>>,
    pub open_panels: BTreeSet<String>,
    /// The side area's one width, every pane's; none until the user drags it. A file from before
    /// S28 carries per-panel `sizes` instead, which loading skips.
    pub side_width: Option<f32>,
    /// The side area was dragged below its minimum, so only the icon bar shows.
    pub side_hidden: bool,
    /// Each pane's height the user dragged its border to; a pane not here is as tall as its
    /// contents.
    pub pane_heights: BTreeMap<String, f32>,
    /// The open panes folded to their heading row; a pane shut and opened again keeps its fold.
    pub folded_panels: BTreeSet<String>,
    pub hidden_reports: BTreeSet<String>,
    /// The archive list's sort as the user last pressed it; a file from before archive-page S18 has
    /// none, which is Date, newest first.
    pub archive_sort: ArchiveSort,
}

/// The archive list's sort: a column and whether it runs ascending.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArchiveSort {
    pub column: Column,
    pub ascending: bool,
}

impl Default for ArchiveSort {
    fn default() -> ArchiveSort {
        ArchiveSort {
            column: Column::Date,
            ascending: false,
        }
    }
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
    crate::client::deck_dir().ok()
}
