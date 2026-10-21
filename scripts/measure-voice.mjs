#!/usr/bin/env node
/**
 * The crew's voice on one run, from its transcripts (crew-voice-rules S1, ADR 0056): per agent
 * role, the median visible text of a turn in bytes, thinking never counted, beside the median
 * output tokens of a model call, which hold the reasoning; per deck kind, the median body bytes.
 * Sizes only, never text (L11). The run is the sessions whose deck_status names the slug.
 *
 *   node scripts/measure-voice.mjs --slug <slug> [--repo <dir>] [--json]
 */

import { voiceOf } from '../deck/transcripts.mjs';

const USAGE = 'usage: node scripts/measure-voice.mjs --slug <slug> [--repo <dir>] [--json]';

function parse(argv) {
  const args = { repo: process.cwd(), json: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--json') args.json = true;
    else if ((flag === '--slug' || flag === '--repo') && argv[i + 1] && !argv[i + 1].startsWith('--')) args[flag.slice(2)] = argv[++i];
    else return null;
  }
  return args.slug ? args : null;
}

const table = (header, rows) => [header, header.map(() => '---'), ...rows].map((cells) => `| ${cells.join(' | ')} |`).join('\n');

const args = parse(process.argv.slice(2));
if (!args) {
  console.error(USAGE);
  process.exit(2);
}
const voice = voiceOf(args.repo, args.slug);
if (args.json) {
  console.log(JSON.stringify(voice, null, 2));
} else if (voice.agents.length === 0) {
  console.error(`no run named ${args.slug} in the transcripts of ${args.repo}`);
  process.exit(1);
} else {
  console.log(table(['agent', 'calls', 'turns', 'text bytes / turn (median)', 'output tokens / call (median)', 'calls counted'],
    voice.agents.map((a) => [a.agent, a.calls, a.turns, a.textBytesMedian, a.outputTokensMedian ?? '–', a.outputCounted])));
  console.log();
  console.log(table(['deck kind', 'count', 'body bytes (median)'], voice.deck.map((d) => [d.kind, d.count, d.bodyBytesMedian])));
}
