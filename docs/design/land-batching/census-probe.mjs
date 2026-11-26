// Probe 2: every git spawn as JSON {pid, cwd, args, site, top} to PROBE_OUT. site = innermost product frame
// outside the git helpers; top = outermost product frame (the command entry).
import fs from 'node:fs';
import dc from 'node:diagnostics_channel';
const out = process.env.PROBE_OUT;
const K = Symbol.for('probe2.spawns');
if (out && !globalThis[K]) {
  globalThis[K] = true;
  Error.stackTraceLimit = 60;
  const frames = () =>
    new Error().stack.split('\n').slice(2).map((l) => l.replaceAll('\\', '/'))
      .filter((l) => /\/(scripts|bin|deck)\/[\w.-]+\.m?js:\d+/.test(l) && !/\/test\//.test(l))
      .map((l) => l.match(/((?:scripts|bin|deck)\/[\w.-]+\.m?js):(\d+)/).slice(1, 3).join(':') + ' ' + ((l.match(/at ([\w.$<>]+) \(/) || [])[1] || '?'));
  const isHelper = (f) => /^scripts\/pilot-branch\.mjs:(36|43|76) |^scripts\/remotes\.mjs:\d+ (oncePerRunner|readRunRemote)|<anonymous>|^scripts\/integrate\.mjs:283 |^scripts\/sync\.mjs:\d+ (out) /.test(f);
  const rec = (file, args, cwd) => {
    try {
      const name = String(file).replaceAll('\\', '/').split('/').pop().replace(/\.exe$/i, '');
      if (name !== 'git') return;
      const fr = frames();
      const site = fr.find((f) => !isHelper(f)) || fr[0] || '-';
      fs.appendFileSync(out, JSON.stringify({ pid: process.pid, cwd: String(cwd || process.cwd()), args: (args || []).slice(1).map(String), site, top: fr.at(-1) || '-', n: fr.length }) + '\n');
    } catch {}
  };
  dc.subscribe('child_process', ({ process: child }) => {
    const fr = frames();
    queueMicrotask(() => {
      try {
        const name = String(child.spawnfile).replaceAll('\\', '/').split('/').pop().replace(/\.exe$/i, '');
        if (name !== 'git') return;
        fs.appendFileSync(out, JSON.stringify({ pid: process.pid, cwd: '?', args: (child.spawnargs || []).slice(1).map(String), site: fr[0] || '-', top: fr.at(-1) || '-', async: true }) + '\n');
      } catch {}
    });
  });
  const binding = process.binding('spawn_sync');
  const spawn = binding.spawn;
  binding.spawn = function (options) { rec(options.file, options.args, options.cwd); return spawn.apply(this, arguments); };
}
