/**
 * ui-design S6: the four checklists under skills/ui-design/checklists/ are linked from the skill, each
 * carries the agreed heading and table, and the implementer and QA both name the skill they load. S9: the pilot and
 * QA carry a Look notes heading, the pilot and the architect a Design notes one naming the notes file. Structural
 * lints only (ADR 0180): a link, a heading, a field; no sentence of a checklist or an agent is pinned.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILL_DIR = path.join(ROOT, 'skills', 'ui-design');
const CHECKLISTS = path.join(SKILL_DIR, 'checklists');

const read = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

// The body of a `## <name>` section: from its heading to the next `## ` heading or the end.
const section = (source, name) => {
  const start = source.search(new RegExp(`^## ${name}\\s*$`, 'm'));
  if (start < 0) return null;
  const rest = source.slice(start).split('\n').slice(1).join('\n');
  const end = rest.search(/^## /m);
  return end < 0 ? rest : rest.slice(0, end);
};

// The markdown link targets in a text, without any `#fragment`.
const linkTargets = (text) => [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1].split('#')[0]);

const checklistFiles = () =>
  fs.existsSync(CHECKLISTS) ? fs.readdirSync(CHECKLISTS).filter((name) => name.endsWith('.md')).sort() : [];

test('each checklist is linked and exists', () => {
  const files = checklistFiles();
  assert.ok(files.length > 0, 'skills/ui-design/checklists/ holds no checklist');
  const body = section(read(path.join(SKILL_DIR, 'SKILL.md')), 'Checklists');
  // lint: SKILL.md has a `## Checklists` heading
  assert.ok(body !== null, 'skills/ui-design/SKILL.md has no "## Checklists" heading');
  const targets = linkTargets(body);
  // lint: link exists, each link under `## Checklists` resolves to a file
  for (const target of targets) {
    assert.ok(fs.existsSync(path.join(SKILL_DIR, target)), `SKILL.md links ${target}, which does not exist`);
  }
  // lint: link exists, every checklist file is linked from `## Checklists`
  const linked = new Set(targets.map((target) => path.posix.normalize(target)));
  for (const file of files) {
    assert.ok(linked.has(`checklists/${file}`), `checklists/${file} is not linked from SKILL.md's "## Checklists"`);
  }
});

test('each checklist carries its name as its heading and the agreed table', () => {
  for (const file of checklistFiles()) {
    const source = read(path.join(CHECKLISTS, file));
    const name = file.replace(/\.md$/, '');
    // lint: heading exists, `# <name>`
    assert.match(source, new RegExp(`^# ${name}\\s*$`, 'm'), `checklists/${file} has no "# ${name}" heading`);
    // lint: field exists, the | Check | How to probe | Pass | table header
    assert.match(source, /^\| Check \| How to probe \| Pass \|\s*$/m, `checklists/${file} has no | Check | How to probe | Pass | table`);
  }
});

// An agent definition's body, past its frontmatter.
const agentBody = (agent) => read(path.join(ROOT, 'agents', `${agent}.md`)).split('\n---\n').slice(1).join('\n---\n');

// A `**<name>**` paragraph heading: bold at the start of a line, so a mention mid-sentence does not count.
const paragraphHeading = (name) => new RegExp(`^\\*\\*${name}\\*\\*`, 'm');

test('the pilot and QA carry a Look notes heading', () => {
  for (const agent of ['pilot', 'pilot-qa']) {
    // lint: heading exists, a `**Look notes**` paragraph heading (ui-design-workflow spec 9)
    assert.ok(paragraphHeading('Look notes').test(agentBody(agent)), `agents/${agent}.md has no **Look notes** paragraph`);
  }
});

test('the pilot and the architect carry a Design notes heading naming the run\'s notes file', () => {
  for (const agent of ['pilot', 'pilot-architect']) {
    const body = agentBody(agent);
    // lint: heading exists, a `**Design notes**` paragraph heading (ui-design-workflow spec 14)
    const at = body.search(paragraphHeading('Design notes'));
    assert.ok(at >= 0, `agents/${agent}.md has no **Design notes** paragraph`);
    const paragraph = body.slice(at).split(/\n\s*\n/)[0];
    // lint: field exists, the paragraph names the committed `docs/design/<slug>/notes.md`
    assert.ok(paragraph.includes('docs/design/<slug>/notes.md'), `agents/${agent}.md's **Design notes** names no docs/design/<slug>/notes.md`);
  }
});

test('both agents load the skill', () => {
  assert.ok(fs.existsSync(path.join(SKILL_DIR, 'SKILL.md')), 'skills/ui-design/SKILL.md does not exist');
  for (const agent of ['pilot-implementer', 'pilot-qa']) {
    const body = read(path.join(ROOT, 'agents', `${agent}.md`)).split('\n---\n').slice(1).join('\n---\n');
    // lint: field exists, `pilot:ui-design` is named among the skills the agent loads
    assert.match(body, /`pilot:ui-design`/, `agents/${agent}.md never names pilot:ui-design`);
  }
});
