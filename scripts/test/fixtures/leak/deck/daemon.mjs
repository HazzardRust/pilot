// Not a deck: a sleeper named like one, so the census reads it as a daemon (artefact §8). It sleeps
// only under `PILOT_LEAK_FIXTURE`, since the main suite runs this file as a test, and for at most
// five minutes, so a leak the census misses still ends.
if (process.env.PILOT_LEAK_FIXTURE) setTimeout(() => {}, 300_000);
