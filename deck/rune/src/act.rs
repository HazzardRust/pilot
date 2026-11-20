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

impl Acted {
    /// The value of `name` in a taken write's `Location` query, as `encodeURIComponent` and a form
    /// wrote it: the `#` fragment dropped, `+` a space, `%XX` decoded. None when refused or absent.
    pub fn param(&self, name: &str) -> Option<String> {
        let Acted::Taken { location } = self else {
            return None;
        };
        let query = location.split_once('?')?.1.split('#').next()?;
        let value = query
            .split('&')
            .find_map(|pair| pair.strip_prefix(name)?.strip_prefix('='))?;
        let bytes = value.as_bytes();
        let (mut out, mut i) = (Vec::with_capacity(bytes.len()), 0);
        while i < bytes.len() {
            let hex = bytes
                .get(i + 1..i + 3)
                .filter(|h| h.iter().all(u8::is_ascii_hexdigit))
                .and_then(|h| std::str::from_utf8(h).ok())
                .and_then(|h| u8::from_str_radix(h, 16).ok());
            match (bytes[i], hex) {
                (b'%', Some(byte)) => {
                    out.push(byte);
                    i += 3;
                }
                (b'+', _) => {
                    out.push(b' ');
                    i += 1;
                }
                (byte, _) => {
                    out.push(byte);
                    i += 1;
                }
            }
        }
        Some(String::from_utf8_lossy(&out).into_owned())
    }
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

#[cfg(test)]
mod tests {
    use super::Acted;

    fn taken(location: &str) -> Acted {
        Acted::Taken {
            location: location.into(),
        }
    }

    #[test]
    fn param_decodes_plus_percent_and_drops_the_fragment() {
        let acted = taken("/?run=%2Ftmp%2Fa+b&sessionRefused=no%20go+here%21#frag?x=1");
        assert_eq!(acted.param("run").as_deref(), Some("/tmp/a b"));
        assert_eq!(
            acted.param("sessionRefused").as_deref(),
            Some("no go here!")
        );
        assert_eq!(acted.param("missing"), None);
        assert_eq!(taken("/?refused=a#b=c").param("b"), None);
        assert_eq!(taken("/no-query").param("run"), None);
        let refused = Acted::Refused { reason: "x".into() };
        assert_eq!(refused.param("run"), None);
    }
}
