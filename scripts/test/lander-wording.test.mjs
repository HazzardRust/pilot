// lander S1 (spec 1; L2, L3, L4): lint on the lander's own definition. It never runs `pilot land`
// or pushes, and is granted deck_post and deck_status. The wording of what it does is not pinned.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const lander = () => fs.readFileSync(path.join(ROOT, 'agents', 'pilot-lander.md'), 'utf8');

test('the lander never pushes pilot', () => {
  const text = lander();
  // lint: the lander runs no `pilot land` command line and holds no git push grant
  assert.doesNotMatch(text, /^\s*(?:[$>]\s*)?(?:node\s+\S+\s+)?pilot land\b/m, 'the lander runs no `pilot land` command line');
  assert.doesNotMatch(text, /Bash\(git push/, 'no git push grant');
});

test('the lander keeps its Clean tail heading', () => {
  // lint: ## Clean tail exists
  assert.match(lander(), /\n## Clean tail\n/, 'agents/pilot-lander.md lost its ## Clean tail heading');
});

test('the lander is granted deck_post and deck_status', () => {
  // lint: the tools line grants the two deck tools the clean tail needs
  assert.match(lander(), /^tools:.*deck__deck_post\b.*deck__deck_status\b/m, 'the lander is not granted deck_post and deck_status');
});
