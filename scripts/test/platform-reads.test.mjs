/**
 * The platform seam's pin (mac-linux S9, spec 2): `hooks/lib/platform.js` is the one
 * non-test file that reads `process.platform`, so a new platform branch anywhere else
 * turns the gate red and is named. There is no allow-list beyond the seam.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** `process.platform`, `process['platform']`, `os.platform(`, `require('os').platform(`, or `{ platform } = process`. */
const READ = /\bprocess\s*(?:\.\s*platform|\[\s*['"`]platform['"`]\s*\])|\bos\s*\.\s*platform\s*\(|\brequire\(\s*['"`](?:node:)?os['"`]\s*\)\s*\.\s*platform\s*\(|\{[^}]*\bplatform\b[^}]*\}\s*=\s*process\b/;
const SOURCE = /\.(?:c|m)?js$/;
const TEST_FILE = /\.test\.(?:c|m)?js$/;

/** The non-test source files under `root` that read `process.platform`, repo-relative with `/`. */
export function platformReads(root) {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'test') walk(full);
      } else if (SOURCE.test(entry.name) && !TEST_FILE.test(entry.name) && READ.test(fs.readFileSync(full, 'utf8'))) {
        found.push(path.relative(root, full).split(path.sep).join('/'));
      }
    }
  };
  walk(root);
  return found.sort();
}

test('only the seam reads process.platform', () => {
  assert.deepEqual(platformReads(ROOT), ['hooks/lib/platform.js']);
});
