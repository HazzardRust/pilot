/**
 * Nothing writes the user's power settings (stay-awake spec 9, L4): a structural scan of the two
 * modules that touch power for every write form spec 9 lists.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const DECK = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Spec 9's write forms, each as a line-level pattern; powercfg takes its switches with `/` or `-`. */
const WRITES = [
  ['powercfg write switch', /['"`\s][/-](change|changename|x|set\w*|s|hibernate|h|import|delete\w*|d|duplicatescheme|restoredefaultschemes|attributes|requestsoverride|device(dis|en)ablewake)\b['"`\s]/i],
  ['SetSuspendState', /SetSuspendState/],
  ['a write to logind.conf', /(writeFile|appendFile|createWriteStream|copyFile|rename|tee)[^\n]*logind\.conf/],
];

/** The write forms in `source`, one `<line>: <form>` each; a `pmset` line without `-g` is a write. */
function writeForms(source) {
  const found = [];
  source.split('\n').forEach((line, i) => {
    for (const [name, pattern] of WRITES) if (pattern.test(line)) found.push(`${i + 1}: ${name}`);
    if (/\bpmset\b/.test(line) && !/['"`\s]-g\b/.test(line)) found.push(`${i + 1}: pmset without -g`);
  });
  return found;
}

test('the scan catches each write form', () => {
  const writes = [
    "run(POWERCFG, ['/setacvalueindex', 'SCHEME_CURRENT'])",
    "run('powercfg', ['-change', 'standby-timeout-ac', '0'])",
    "run('powercfg', ['/hibernate', 'off'])",
    "run('powercfg', ['/s', 'SCHEME_MIN'])",
    "run('powercfg', ['/deletesetting', 'SUB_BUTTONS', 'LIDACTION'])",
    "run('powercfg', ['/attributes', 'SUB_BUTTONS', 'LIDACTION', '-ATTRIB_HIDE'])",
    "run('powercfg', ['/requestsoverride', 'PROCESS', 'node.exe', 'SYSTEM'])",
    "run('powercfg', ['/devicedisablewake', 'mouse'])",
    "run('pmset', ['-a', 'disablesleep', '1'])",
    '[DllImport("powrprof.dll")] static extern bool SetSuspendState(bool h, bool f, bool w);',
    "fs.writeFileSync('/etc/systemd/logind.conf', text)",
  ];
  for (const line of writes) assert.equal(writeForms(line).length, 1, line);
  assert.deepEqual(writeForms("run('pmset', ['-g', 'batt'])"), []);
  assert.deepEqual(writeForms("run(POWERCFG, ['/qh', 'SCHEME_CURRENT'])"), []);
});

for (const file of ['awake.mjs', 'power.mjs']) {
  test(`deck/${file} writes no power setting`, () => {
    assert.deepEqual(writeForms(fs.readFileSync(path.join(DECK, file), 'utf8')), []);
  });
}
