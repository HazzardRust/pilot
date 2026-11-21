//! The client's write half (L3): every write is an existing form route, posted urlencoded with the
//! deck secret and the deck's own `Origin`, so the daemon takes it as a press on its own page. No
//! redirect is followed (the client's agent allows none): the 303's `Location` is the answer.

use std::collections::BTreeSet;
use std::sync::Arc;
use std::sync::mpsc::{self, Receiver, Sender};

use rune::Waker;

use crate::client::{Client, Error, Result};

/// A post the deck has answered: the key its control sent it under, and what the deck made of it.
pub type Answer = (String, Result<Acted>);

/// The window's one table of posts in flight (spec 5): `send` marks a key sent in the frame of the
/// press, the post runs on a thread of its own, and `settle` hands `app::poll` what has been answered.
pub struct Pending {
    /// The deck every post goes to; the window's own address, read per post, when unset.
    pub deck: Option<Arc<Client>>,
    /// Wakes the window when an answer is left; `app::setup` sets it.
    pub wake: Option<Waker>,
    sent: BTreeSet<String>,
    answers: (Sender<Answer>, Receiver<Answer>),
}

impl Default for Pending {
    fn default() -> Pending {
        Pending {
            deck: None,
            wake: None,
            sent: BTreeSet::new(),
            answers: mpsc::channel(),
        }
    }
}

impl std::fmt::Debug for Pending {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Pending")
            .field("sent", &self.sent)
            .finish_non_exhaustive()
    }
}

impl Pending {
    /// The posts answered since the last call, each key no longer in flight. `app::poll` takes them.
    pub fn settle(&mut self) -> Vec<Answer> {
        let answered: Vec<Answer> = self.answers.1.try_iter().collect();
        for (key, _) in &answered {
            self.sent.remove(key);
        }
        answered
    }

    /// Whether a post under `key` is in flight: its control is drawn disabled until it is answered.
    pub fn is_sent(&self, key: &str) -> bool {
        self.sent.contains(key)
    }
}

/// What a control shows of its answered post: the deck's refusal or the failure in its own words,
/// none when the deck took it.
pub fn refusal(acted: &Result<Acted>) -> Option<String> {
    match acted {
        Ok(Acted::Taken { .. }) => None,
        Ok(Acted::Refused { reason }) => Some(reason.clone()),
        Err(err) => Some(err.to_string()),
    }
}

/// Posts `action` under `key` on a thread of its own and leaves the deck's answer for `settle`,
/// waking the window; the UI thread never waits on the deck. A key already in flight sends nothing
/// and returns false.
pub fn send<A: Form + Send + 'static>(sender: &mut Pending, key: &str, action: A) -> bool {
    if !sender.sent.insert(key.to_string()) {
        return false;
    }
    let (deck, wake, answers, sent) = (
        sender.deck.clone(),
        sender.wake.clone(),
        sender.answers.0.clone(),
        key.to_string(),
    );
    let post = move || {
        let acted = match deck {
            Some(deck) => deck.act(&action),
            None => Client::from_env().and_then(|deck| deck.act(&action)),
        };
        // A closed window has no one to tell: its receiver is gone with it.
        let _ = answers.send((sent, acted));
        if let Some(wake) = wake {
            wake();
        }
    };
    if let Err(err) = std::thread::Builder::new()
        .name("pilot-deck-post".into())
        .spawn(post)
    {
        let failed = Err(Error::Http(format!("the post did not start: {err}")));
        let _ = sender.answers.0.send((key.to_string(), failed));
        if let Some(wake) = &sender.wake {
            wake();
        }
    }
    true
}

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
