'use strict';

/**
 * S3 of mac-linux (spec 2, 6; L1-L3): the platform seam answers per platform, and
 * its path key folds case on win32 only. Every POSIX row passes `platform`, so it
 * rests on this fake-platform test on any host, and on the all-os CI job.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { hostPlatform, isWindows, pathKey } = require('../lib/platform.js');

/** A realpath that never touches the disk: every path exists and is its own canonical spelling. */
const identity = (p) => p;

test('the seam answers per platform', () => {
  assert.equal(isWindows('win32'), true);
  assert.equal(isWindows('darwin'), false);
  assert.equal(isWindows('linux'), false);
  assert.equal(hostPlatform(), process.platform, 'read from process.platform');
  assert.equal(isWindows(), process.platform === 'win32', 'the host by default');
});

test('a path key folds case on win32 only', () => {
  const win = (p) => pathKey(p, { platform: 'win32', realpath: identity });
  assert.equal(win('C:\\A'), win('c:\\a'), 'win32 folds case');
  for (const platform of ['darwin', 'linux']) {
    const key = (p) => pathKey(p, { platform, realpath: identity });
    assert.notEqual(key('/A'), key('/a'), `${platform} keeps case`);
  }
});

test('a missing path keys by resolve', () => {
  const missing = path.join(__dirname, 'no-such-dir-for-path-key', 'x', '..');
  const enoent = () => {
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  };
  for (const platform of ['win32', 'darwin', 'linux']) {
    const resolved = path.resolve(missing);
    const expected = platform === 'win32' ? resolved.toLowerCase() : resolved;
    assert.equal(pathKey(missing, { platform, realpath: enoent }), expected, platform);
  }
  assert.equal(pathKey(missing), isWindows() ? path.resolve(missing).toLowerCase() : path.resolve(missing), 'the real realpath');
});

test('a network path on win32 is keyed by its spelling and never opened', () => {
  const opened = [];
  const unc = '\\\\Host\\Share';
  assert.equal(pathKey(unc, { platform: 'win32', realpath: (p) => (opened.push(p), p) }), path.resolve(unc).toLowerCase());
  assert.deepEqual(opened, [], 'realpath was never called');
});

test('pathKey asks the file system once for a path it has already resolved', (t) => {
  const real = fs.mkdtempSync(path.join(os.tmpdir(), 'pathkey-memo-'));
  t.after(() => fs.rmSync(real, { recursive: true, force: true }));
  const spy = t.mock.method(fs.realpathSync, 'native');
  assert.equal(pathKey(real), pathKey(real));
  assert.equal(spy.mock.callCount(), 1);
});
