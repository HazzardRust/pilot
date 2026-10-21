#!/usr/bin/env node
/**
 * Writes one version into the three files that carry it: `package.json`,
 * `package-lock.json` (the top and `packages[""]`) and `.claude-plugin/plugin.json`;
 * the deck reads package.json's through `deck/version.mjs`. Each is edited as text so
 * nothing else in the file moves; every edit is computed before any file is
 * written, so a refusal leaves the tree untouched.
 *
 *   npm run bump <x.y.z>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SEMVER = /^\d+\.\d+\.\d+$/;
const JSON_VERSION = /^(\s*"version": ")[^"]*(")/m;
const ROOT_PACKAGE = /("packages": \{\s*"": \{\s*"name": "[^"]*",\s*"version": ")[^"]*(")/;

const EDITS = [
  ['package.json', JSON_VERSION],
  ['package-lock.json', JSON_VERSION, ROOT_PACKAGE],
  ['.claude-plugin/plugin.json', JSON_VERSION],
];

export function bump(version, { root }) {
  if (!SEMVER.test(version)) {
    throw new Error(`version must be x.y.z, got ${JSON.stringify(version)}`);
  }
  const planned = EDITS.map(([file, ...patterns]) => {
    const full = path.join(root, file);
    let text = fs.readFileSync(full, 'utf8');
    for (const pattern of patterns) {
      if (!pattern.test(text)) throw new Error(`no version to replace in ${file}`);
      text = text.replace(pattern, (_, pre, post) => `${pre}${version}${post}`);
    }
    return [full, text];
  });
  for (const [full, text] of planned) fs.writeFileSync(full, text);
  return planned.map(([full]) => full);
}

/** `p` resolved through links, or as spelled when it cannot be (a missing argv[1] must not fail the import). */
function realOrSelf(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}

// The loader resolves links (macOS's /var is /private/var), so argv[1] is resolved too.
if (process.argv[1] && import.meta.url === pathToFileURL(realOrSelf(process.argv[1])).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  try {
    for (const file of bump(process.argv[2], { root })) console.log(path.relative(root, file));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
