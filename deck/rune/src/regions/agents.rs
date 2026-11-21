//! The Agents panel as `deck/view/agents.mjs` resolved it: the live roster, each row with whole seconds since the
//! agent's last tool call, dimmed from 30 s quiet (L11). The roster is the view's; nothing here reads it from the
//! daemon's own state (spec 11).

use crate::theme::type_;
use rune::tok;
use rune::{Cx, El, col, row, text};
use serde::Deserialize;

use crate::app::State;
use crate::theme::{self, space};

#[derive(Debug, Default)]
pub struct Local;

#[derive(Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct Agent {
    name: String,
    quiet_s: u64,
    quiet: bool,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Agents {
    agents: Vec<Agent>,
}

pub fn draw(v: &serde_json::Value, _: &Local, cx: &mut Cx<State>) -> El {
    // A region the view cannot be read as draws empty rather than taking the window down.
    let view = Agents::deserialize(v).unwrap_or_default();
    let dark = cx.system_dark();
    let t = tok::theme(dark);
    // The panel's header is the layout's (S20).
    let mut panel = col().key("agents").gap(space::within);
    if view.agents.is_empty() {
        return panel.child(theme::empty("no agents live", "agents-none", dark));
    }
    for (i, agent) in view.agents.iter().enumerate() {
        // A quiet agent reads in the secondary colour: still listed, no longer fresh.
        let ink = if agent.quiet {
            t.text_secondary
        } else {
            t.text
        };
        panel = panel.child(
            theme::list_row(row())
                .key(format!("agent-{i}"))
                .gap(space::within)
                .child(theme::content(
                    text(&agent.name).font(type_::BODY).color(ink).grow(1.0),
                    dark,
                ))
                .child(theme::content(
                    text(format!("{}s", agent.quiet_s))
                        .key(format!("agent-{i}-age"))
                        .font(type_::CAPTION)
                        .color(ink),
                    dark,
                )),
        );
    }
    panel
}
