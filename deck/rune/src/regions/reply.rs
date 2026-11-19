//! The reply box, drawn by S9. Its `Local` holds the half-typed draft, which a live refresh of
//! the view never touches (spec 4).

#[derive(Debug, Default)]
pub struct Local {
    pub draft: rune::TextEdit,
}

pub fn draw(_: &serde_json::Value, _: &Local, _: &mut rune::Cx<crate::app::State>) -> rune::El {
    rune::el()
}
