#!/usr/bin/env node
/**
 * What the shipped rules tree costs a session (crew-voice-rules S8, spec 10, L6). A rules
 * file with no `paths:` frontmatter loads into every session and every spawn: that is the
 * always-loaded footprint. One with `paths:` loads when a file its globs match is read:
 * the trigger footprint is, per sample file of each extension, every rules file that
 * reading it would load, grouped by directory.
 *
 *   node scripts/measure-rules.mjs [--rules <dir>] [--json]
 *
 * Tokens are bytes / 4, rounded, as in measure-prompt.mjs, whose `split` reads the
 * frontmatter.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { globToRegExp } from './audit-context.mjs';
import { BYTES_PER_TOKEN, listOf, split } from './measure-prompt.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const USAGE = 'usage: node scripts/measure-rules.mjs [--rules <dir>] [--json]';

/** The file each trigger stands for: a source file one directory down in a project. */
const SAMPLES = { '.ts': 'src/sample.ts', '.tsx': 'src/sample.tsx', '.js': 'src/sample.js', '.py': 'src/sample.py' };

const tokens = (bytes) => Math.round(bytes / BYTES_PER_TOKEN);

export function measureRules(dir = path.join(REPO, 'rules')) {
  const files = fs.readdirSync(dir, { recursive: true })
    .filter((rel) => rel.endsWith('.md'))
    .map((rel) => {
      const text = fs.readFileSync(path.join(dir, rel), 'utf8');
      const globs = listOf(split(text).front, 'paths').map((glob) => glob.replace(/^["']|["']$/g, ''));
      return { rel: rel.split(path.sep).join('/'), bytes: Buffer.byteLength(text, 'utf8'), globs: globs.map(globToRegExp) };
    })
    .sort((a, b) => a.rel.localeCompare(b.rel));

  const always = files.filter((file) => file.globs.length === 0);
  const trigger = {};
  for (const [ext, sample] of Object.entries(SAMPLES)) {
    const loaded = files.filter((file) => file.globs.some((glob) => glob.test(sample)));
    trigger[ext] = {
      dirs: [...new Set(loaded.map((file) => file.rel.split('/')[0]))].sort(),
      tokens: tokens(loaded.reduce((sum, file) => sum + file.bytes, 0)),
    };
  }
  return {
    always: { files: always.map((file) => file.rel), tokens: tokens(always.reduce((sum, file) => sum + file.bytes, 0)) },
    trigger,
  };
}

function parse(argv) {
  const args = { rules: path.join(REPO, 'rules'), json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') args.json = true;
    else if (argv[i] === '--rules' && argv[i + 1] && !argv[i + 1].startsWith('--')) args.rules = path.resolve(argv[++i]);
    else return null;
  }
  return args;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parse(process.argv.slice(2));
  if (!args) {
    console.error(USAGE);
    process.exit(2);
  }
  if (!fs.existsSync(args.rules)) {
    console.error(`no rules directory at ${args.rules}`);
    process.exit(1);
  }
  const measured = measureRules(args.rules);
  if (args.json) console.log(JSON.stringify(measured, null, 2));
  else {
    console.log(`tokens = bytes / ${BYTES_PER_TOKEN}\n`);
    console.log(`| Loaded | Tokens | Files or directories |\n|---|---|---|`);
    console.log(`| always | ${measured.always.tokens} | ${measured.always.files.join(', ')} |`);
    for (const [ext, { dirs, tokens: n }] of Object.entries(measured.trigger)) {
      console.log(`| reading a ${ext} | ${n} | ${dirs.join(', ')} |`);
    }
  }
}
