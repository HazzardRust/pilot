/**
 * The pilot is a tool for any programming — cloud configuration, low-level code,
 * research code — with web development one instance of it, not the frame. The
 * user, 2026-09-28: "i want to ensure that it is generalised enough that it can be
 * used for essentially anything programming … not asking to remove any existing
 * features, just ensure they are backseat to generalisation". And of Gate 2: "it
 * should still take you through a walkthrough of whatever it is. do not modify that
 * functionality. but it had strong emphasis on testing specifically ui. i just want
 * to generalise that part."
 *
 * So Gate 2's procedure and the live-verification gate keep their function, and
 * their wording names what is being walked through or run as whatever the feature
 * is, a GUI leading and a browser one instance; and the standing QA question asks
 * about the environment, with the database only one case of it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const flat = (text) => text.replace(/\s+/g, ' ');

/** The text of one markdown section, from its heading to the next of the same depth or shallower. */
function section(source, heading, depth = 2) {
  const hashes = '#'.repeat(depth);
  const at = source.indexOf(`\n${hashes} ${heading}`);
  assert.ok(at >= 0, `no "${hashes} ${heading}" section`);
  const rest = source.slice(at + 1);
  const next = rest.slice(1).search(new RegExp(`\\n#{1,${depth}} `));
  return flat(next < 0 ? rest : rest.slice(0, next + 1));
}

/** Kinds of thing a feature can be, beyond a page in a browser. */
const BEYOND_A_PAGE = [/\bGUI\b/, /pictures?/i, /video/i, /audio/i, /plots?/i, /games?/i, /\bCLI\b/, /cluster/i, /binary/i, /notebook/i];

function assertBeyondABrowser(text, where) {
  const named = BEYOND_A_PAGE.filter((re) => re.test(text)).length;
  assert.ok(named >= 5, `${where} names ${named} kinds of thing a feature can be; a browser page alone is the web case`);
}

test("Gate 2's procedure in the pilot's workflow walks the user through whatever the feature is", () => {
  const skill = read('agents/pilot.md');
  assertBeyondABrowser(section(skill, '8. Feature QA', 3), 'agents/pilot.md step 8');
});

test("the QA agent's procedure walks the user through whatever the feature is, a GUI leading", () => {
  const procedure = section(read('agents/pilot-qa.md'), 'The procedure');
  assertBeyondABrowser(procedure, 'agents/pilot-qa.md "The procedure"');
  assert.match(procedure, /a GUI first/, 'a GUI stays the leading example');
});

test('the live-verification gate runs the feature where it is meant to run, a browser one instance', () => {
  const places = [
    ['agents/pilot-implementer.md', section(read('agents/pilot-implementer.md'), 'The loop')],
    ['rules/vertical-execution.md §3', section(read('rules/vertical-execution.md'), '3. The phase gate')],
    ['rules/vertical-execution.md human gates', section(read('rules/vertical-execution.md'), 'The two human gates')],
    ['rules/orchestration.md', section(read('rules/orchestration.md'), 'Agent briefs')],
  ];
  for (const [where, text] of places) assertBeyondABrowser(text, where);
  assert.match(places[1][1], /the project's own checks/, "the phase gate is the project's own checks, with one stack's command an instance");
});

test('the standing QA question asks about the environment, and the database only when there is one', () => {
  const skill = read('agents/pilot.md');
  assert.match(skill, /\*\*what environment does QA run against\?\*\*/, 'the standing question is about the environment');
  assert.doesNotMatch(skill, /which database do\s+migrations run against/, 'the standing question still presumes a database');
});
