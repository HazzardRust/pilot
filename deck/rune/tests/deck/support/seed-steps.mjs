/**
 * Seeds a scratch store with a green ticket and its open steps thread of `n` steps, through `postSteps`, the
 * steps thread's one writer (`deck_post` refuses the kind), and prints the thread's id. The scratch daemon reads
 * the store from disk per call, so it serves the thread at once. Never the user's store: `dir` is required.
 *
 *   node seed-steps.mjs <dir> <repo> <n>
 */

const [dir, repo, n] = process.argv.slice(2);
const count = Number(n);
if (!dir || !repo || !Number.isInteger(count)) {
  console.error('usage: node seed-steps.mjs <dir> <repo> <n>');
  process.exit(2);
}
// Before the store loads, so every read and write lands in the scratch dir.
process.env.PILOT_DECK_DIR = dir;

const { newItemId, readDeck, writeDeck } = await import('../../../../store-core.mjs');
const { postSteps } = await import('../../../../store.mjs');

const deck = readDeck();
const ticket = {
  id: newItemId(),
  kind: 'ticket',
  title: 'Seeded ticket',
  body: '> land the seeded work\n\n1. It is done. *The test shows it.*',
  repo,
  state: 'green',
  owner: 'pilot',
  postedAt: new Date().toISOString(),
  replies: [],
};
deck.items.push(ticket);
writeDeck(deck);

const steps = Array.from({ length: count }, (_, i) => ({ text: `Step ${i + 1} by hand.` }));
console.log(postSteps({ ticket: ticket.id, repo, title: 'Human steps: seeded', steps }).id);
