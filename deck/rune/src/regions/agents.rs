//! The Agents panel as `deck/view/agents.mjs` resolved it: the live roster, each row "<type> · started N mins ago"
//! in the view's words with the seconds since the agent's last tool call at its right, dimmed from 30 s quiet (L11,
//! rune-panes A1), and on the overview a caption heading per deck. The roster is the view's; nothing here reads it
//! from the daemon's own state (spec 11).

use crate::theme::type_;
use rune::tok;
use rune::{Color, Cx, El, col, row, text};
use serde::Deserialize;

use crate::app::State;
use crate::theme::{self, space};

#[derive(Debug, Default)]
pub struct Local;

#[derive(Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct Agent {
    name: String,
    started: String,
    quiet_s: u64,
    quiet: bool,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Group {
    tab: String,
    agents: Vec<Agent>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Agents {
    agents: Vec<Agent>,
    /// The overview's sections, one per deck with anybody live; absent on a deck's own tab.
    groups: Option<Vec<Group>>,
}

pub fn draw(v: &serde_json::Value, _: &Local, cx: &mut Cx<State>) -> El {
    // A region the view cannot be read as draws empty rather than taking the window down.
    let view = Agents::deserialize(v).unwrap_or_default();
    let dark = cx.system_dark();
    let t = tok::theme(dark);
    // The panel's header is the layout's (S20).
    let panel = col().key("agents").gap(space::within);
    if view.agents.is_empty() {
        return panel.child(theme::empty("no agents live", "agents-none", dark));
    }
    // Rows keep one running index across sections, so `agent-{i}` names the same row either way.
    let mut i = 0;
    let mut rows = |agents: &[Agent], mut into: El| {
        for agent in agents {
            // A quiet agent reads in the secondary colour: still listed, no longer fresh.
            let ink = if agent.quiet {
                t.text_secondary
            } else {
                t.text
            };
            into = into.child(agent_row(agent, i, ink, dark));
            i += 1;
        }
        into
    };
    match &view.groups {
        // The overview: the page's `run-section` per deck, its name as the caption above its own rows.
        Some(groups) => groups.iter().enumerate().fold(panel, |panel, (g, group)| {
            let heading = text(&group.tab)
                .key(format!("agents-group-{g}-heading"))
                .font(type_::CAPTION)
                .color(t.text);
            let section = col()
                .key(format!("agents-group-{g}"))
                .gap(space::within)
                .child(theme::content(heading, dark));
            panel.child(rows(&group.agents, section))
        }),
        None => rows(&view.agents, panel),
    }
}

fn agent_row(agent: &Agent, i: usize, ink: Color, dark: bool) -> El {
    // The view's words for the start, as the page's `<type> · started 3 mins ago`.
    let who = format!("{} · started {}", agent.name, agent.started);
    theme::list_row(row())
        .key(format!("agent-{i}"))
        .gap(space::within)
        .child(theme::content(
            text(who).font(type_::BODY).color(ink).grow(1.0),
            dark,
        ))
        .child(theme::content(
            text(format!("{}s", agent.quiet_s))
                .key(format!("agent-{i}-age"))
                .font(type_::CAPTION)
                .color(ink),
            dark,
        ))
}
