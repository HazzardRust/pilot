/**
 * The one answer to "who holds this url" (daemon-lifecycle §3 Seams): a deck, by pid and
 * version; nothing at all; or something that is not a deck. `pilot status` asks it now;
 * the held-port check, doctor and the client's join ask it in later slices.
 */

const isText = (value) => typeof value === 'string' && value !== '';

export async function probeDeck(url, { timeoutMs = 1000 } = {}) {
  let response;
  try {
    response = await fetch(`${url}/api/health`, { redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    // `localhost` can resolve to two addresses, and then the refusal arrives as an AggregateError.
    const refused = (error) => error?.code === 'ECONNREFUSED' || error?.errors?.some(refused);
    if (refused(err?.cause)) return { state: 'none' };
    if (err?.name === 'TimeoutError') return { state: 'foreign', why: `no answer within ${timeoutMs} ms` };
    return { state: 'foreign', why: err?.cause?.code ?? err?.message ?? String(err) };
  }
  let health;
  try {
    health = await response.json();
  } catch {
    return { state: 'foreign', why: `answered ${response.status} with no deck health` };
  }
  if (!response.ok || health?.ok !== true || !Number.isInteger(health.pid)) {
    return { state: 'foreign', why: `answered ${response.status} with no deck health` };
  }
  return {
    state: 'deck',
    pid: health.pid,
    ...(isText(health.version) && { version: health.version }),
    ...(isText(health.startedAt) && { startedAt: health.startedAt }),
    ...(isText(health.root) && { root: health.root }),
    ...(typeof health.checkout === 'boolean' && { checkout: health.checkout }),
  };
}
