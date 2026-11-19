//! The deck client's read half (Deck client seam): the daemon's view over loopback, behind the deck
//! secret (spec 9). The secret is read from its file on every request, as every client the package
//! ships does, and appears in no error, log or panic: an error names the file only.

use std::fmt;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::time::Duration;

use serde::Deserialize;

/// The deck's own port when `PILOT_DECK_PORT` names none (`deck/tools.mjs` `DECK_PORT`).
pub const DECK_PORT: u16 = 4321;
/// The only hosts the client talks to: the deck's loopback names (`deck/server-wait.mjs` `LOOPBACK_NAMES`).
pub const LOOPBACK: [&str; 3] = ["127.0.0.1", "localhost", "[::1]"];

#[derive(Debug)]
pub enum Error {
    NotLoopback(String),
    BadPort(String),
    NoHome,
    Secret(PathBuf, &'static str),
    Http(String),
    Status(u16),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::NotLoopback(host) => {
                write!(f, "the deck client talks to loopback only, not {host}")
            }
            Error::BadPort(port) => write!(f, "PILOT_DECK_PORT is {port:?}, which is not a port"),
            Error::NoHome => write!(
                f,
                "no home directory to find the deck store in; set PILOT_DECK_DIR"
            ),
            Error::Secret(file, why) => write!(f, "the deck secret at {} {why}", file.display()),
            Error::Http(why) => write!(f, "the deck did not answer: {why}"),
            Error::Status(code) => write!(f, "the deck answered {code}"),
        }
    }
}

impl std::error::Error for Error {}

pub type Result<T> = std::result::Result<T, Error>;

/// What `GET /api/view` answers: one object per region, all of one `seq`.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct View {
    pub screen: String,
    pub seq: u64,
    pub regions: serde_json::Map<String, serde_json::Value>,
}

/// Which view to ask for: `/api/view`'s query, each field as the HTML deck's URL carries it.
#[derive(Debug, Clone, PartialEq)]
pub struct Query {
    pub screen: String,
    pub run: Option<String>,
    pub all: bool,
    pub ticket: Option<String>,
    pub id: Option<String>,
}

impl Default for Query {
    fn default() -> Self {
        Query {
            screen: "home".into(),
            run: None,
            all: false,
            ticket: None,
            id: None,
        }
    }
}

pub struct Client {
    base: String,
    secret: PathBuf,
    agent: ureq::Agent,
}

impl Client {
    /// Host `PILOT_DECK_HOST` (127.0.0.1 unset), port `PILOT_DECK_PORT` (4321 unset or blank), store
    /// `PILOT_DECK_DIR` (`~/.claude/pilot` unset). A host that is not loopback is refused here, before
    /// any client exists to make a request.
    pub fn from_env() -> Result<Client> {
        let var = |name| {
            std::env::var(name)
                .ok()
                .filter(|v: &String| !v.trim().is_empty())
        };
        let host = var("PILOT_DECK_HOST").unwrap_or_else(|| LOOPBACK[0].to_string());
        if !LOOPBACK.contains(&host.as_str()) {
            return Err(Error::NotLoopback(host));
        }
        let port = match var("PILOT_DECK_PORT") {
            None => DECK_PORT,
            Some(text) => text
                .trim()
                .parse::<u16>()
                .ok()
                .filter(|p| *p > 0)
                .ok_or(Error::BadPort(text))?,
        };
        let dir = match var("PILOT_DECK_DIR") {
            Some(dir) => PathBuf::from(dir),
            None => std::env::home_dir()
                .ok_or(Error::NoHome)?
                .join(".claude")
                .join("pilot"),
        };
        // No proxy and no redirect: either could carry the secret off loopback.
        let agent = ureq::Agent::config_builder()
            .proxy(None)
            .max_redirects(0)
            .http_status_as_error(false)
            .timeout_global(Some(Duration::from_secs(5)))
            .build()
            .new_agent();
        // `localhost` is dialled as 127.0.0.1, so no resolver can send the secret off loopback.
        let host = if host == "localhost" {
            LOOPBACK[0]
        } else {
            host.as_str()
        };
        Ok(Client {
            base: format!("http://{host}:{port}"),
            secret: dir.join("deck.secret"),
            agent,
        })
    }

    pub fn view(&self, q: &Query) -> Result<View> {
        let mut request = self
            .agent
            .get(format!("{}/api/view", self.base))
            .query("screen", &q.screen);
        for (key, value) in [("run", &q.run), ("ticket", &q.ticket), ("id", &q.id)] {
            if let Some(value) = value {
                request = request.query(key, value);
            }
        }
        if q.all {
            request = request.query("all", "1");
        }
        let mut response = request
            .header("Authorization", format!("Bearer {}", self.read_secret()?))
            .call()
            .map_err(|err| Error::Http(err.to_string()))?;
        if response.status() != 200 {
            return Err(Error::Status(response.status().as_u16()));
        }
        response
            .body_mut()
            .read_json::<View>()
            .map_err(|err| Error::Http(err.to_string()))
    }

    /// `GET /events`, the daemon's change stream, line by line. It is quiet until something
    /// changes, so only the connect is timed; the stream ends when the daemon does.
    pub fn events(&self) -> Result<impl BufRead + Send + 'static> {
        let response = self
            .agent
            .get(format!("{}/events", self.base))
            .header("Authorization", format!("Bearer {}", self.read_secret()?))
            .config()
            .timeout_global(None)
            .timeout_connect(Some(Duration::from_secs(5)))
            .build()
            .call()
            .map_err(|err| Error::Http(err.to_string()))?;
        if response.status() != 200 {
            return Err(Error::Status(response.status().as_u16()));
        }
        Ok(BufReader::new(response.into_body().into_reader()))
    }

    /// The store's secret, 64 hex characters, read now so a replaced file is taken at once.
    fn read_secret(&self) -> Result<String> {
        let text = std::fs::read_to_string(&self.secret)
            .map_err(|_| Error::Secret(self.secret.clone(), "could not be read"))?;
        let secret = text.trim();
        if secret.len() != 64
            || !secret
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        {
            return Err(Error::Secret(
                self.secret.clone(),
                "does not hold a deck secret",
            ));
        }
        Ok(secret.to_string())
    }
}
