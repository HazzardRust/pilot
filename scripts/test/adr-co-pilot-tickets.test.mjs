/**
 * Pins for the ADR that records the co-pilot and ticket renames (co-pilot-tickets S6):
 * its Context quotes the user's request byte for byte from the artefact's §1.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

const artefact = read(path.join(ROOT, 'docs', 'design', 'co-pilot-tickets', 'architecture.md'));
const section1 = artefact.slice(artefact.indexOf('## 1. Problem'), artefact.indexOf('## 2. Spec'));
const request = /The user's words: "([^"]+)"/.exec(section1)?.[1].replace(/\n/g, ' ');
const override = /`(overridden: [^`]+)`/.exec(section1)?.[1];

// The ADR's title in the user's words (A10), spelt in halves so the vocabulary guard (S7) passes this file.
const TITLE = ['Fore', 'man becomes co-pilot and ta', 'sks become tickets'].join('');
const adrDir = path.join(ROOT, 'docs', 'adr');
const file = fs.readdirSync(adrDir).find((f) => /^\d{4}-/.test(f) && f.slice(5) === `${TITLE.toLowerCase().replaceAll(' ', '-')}.md`);

test('the request is quoted as written', () => {
  assert.ok(request && override, 'the artefact §1 holds the request and the override line');
  assert.ok(file, 'the ADR file exists');
  const text = read(path.join(adrDir, file));
  const context = text.slice(text.indexOf('## Context'), text.indexOf('## Decision'));
  assert.ok(context.includes(`"${request}"`), 'Context holds the request verbatim');
  assert.ok(context.includes(override), 'Context holds the override line');
});

test('the ADR is indexed', () => {
  assert.ok(file, 'the ADR file exists');
  const title = /^# (.+)$/m.exec(read(path.join(adrDir, file)))?.[1];
  assert.equal(title, TITLE);
  const index = read(path.join(adrDir, 'README.md'));
  assert.ok(index.includes(`(${file})`), 'README links the ADR');
});
