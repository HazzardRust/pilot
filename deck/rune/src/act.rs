//! The client's write half (L3): every write is an existing form route, posted urlencoded with the
//! deck secret and the deck's own `Origin`, so the daemon takes it as a press on its own page. No
//! redirect is followed (the client's agent allows none): the 303's `Location` is the answer.

use crate::client::{Client, Error, Result};

/// One write the Rune deck makes: the form route it posts and that form's fields.
pub trait Form {
    fn route(&self) -> &'static str;
    fn fields(&self) -> Vec<(&'static str, String)>;
}

/// The thread writes, each the form the HTML deck's button posts.
#[derive(Debug, Clone, PartialEq)]
pub enum Action {
    Reply {
        id: String,
        text: String,
        choice: Option<String>,
    },
    Close {
        id: String,
    },
    Reopen {
        id: String,
    },
    DismissItem {
        id: String,
    },
    /// `id` is the run's id (`run_…`), as `/items` posts it.
    DismissRun {
        id: String,
    },
}

impl Form for Action {
    fn route(&self) -> &'static str {
        match self {
            Action::Reply { .. } => "/reply",
            Action::Close { .. } => "/close",
            Action::Reopen { .. } => "/reopen",
            Action::DismissItem { .. } => "/dismiss-item",
            Action::DismissRun { .. } => "/dismiss",
        }
    }

    fn fields(&self) -> Vec<(&'static str, String)> {
        match self {
            Action::Reply { id, text, choice } => {
                let mut fields = vec![("id", id.clone()), ("text", text.clone())];
                if let Some(choice) = choice {
                    fields.push(("choice", choice.clone()));
                }
                fields
            }
            Action::Close { id }
            | Action::Reopen { id }
            | Action::DismissItem { id }
            | Action::DismissRun { id } => vec![("id", id.clone())],
        }
    }
}

/// What the deck made of a write: taken (its 303) or refused with its own words (its 400 or 403).
#[derive(Debug, Clone, PartialEq)]
pub enum Acted {
    Taken { location: String },
    Refused { reason: String },
}

impl Client {
    pub fn act(&self, a: &impl Form) -> Result<Acted> {
        let fields = a.fields();
        let pairs: Vec<(&str, &str)> = fields
            .iter()
            .map(|(name, value)| (*name, value.as_str()))
            .collect();
        post(self, a.route(), &pairs)
    }
}

/// Posts `fields` to `path` on the deck. Any status but 303, 400 and 403 is an error naming the
/// status alone; the secret is in no error.
pub fn post(client: &Client, path: &str, fields: &[(&str, &str)]) -> Result<Acted> {
    let mut response = client
        .agent
        .post(format!("{}{path}", client.base))
        .header("Authorization", format!("Bearer {}", client.read_secret()?))
        // Origin == http://<Host>: the gate presses `fromOwnPage` guards are refused without it.
        .header("Origin", client.base.as_str())
        .send_form(fields.iter().copied())
        .map_err(|err| Error::Http(err.to_string()))?;
    match response.status().as_u16() {
        303 => response
            .headers()
            .get("location")
            .and_then(|value| value.to_str().ok())
            .map(|location| Acted::Taken {
                location: location.to_string(),
            })
            .ok_or_else(|| Error::Http("a 303 with no Location".into())),
        400 | 403 => {
            let text = response
                .body_mut()
                .read_to_string()
                .map_err(|err| Error::Http(err.to_string()))?;
            Ok(Acted::Refused {
                reason: text.trim().to_string(),
            })
        }
        code => Err(Error::Status(code)),
    }
}
