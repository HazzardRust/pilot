/**
 * A `node --test` reporter for `npm run test:quiet`: one `✖ <name>` line (and the error
 * beneath it) per failing test as it fails, nothing per pass, then one closing line,
 * `tests <n> · pass <p> · fail <f>`, plus `· cancelled <c>` when a test timed out. Counts are
 * of tests, not suites, as the spec reporter's summary counts them.
 */
export default async function* quietReporter(source) {
  let tests = 0;
  let pass = 0;
  let fail = 0;
  let cancelled = 0;
  for await (const { type, data } of source) {
    if (type !== 'test:pass' && type !== 'test:fail') continue;
    if (data.details?.type === 'suite') continue;
    tests++;
    if (type === 'test:fail') {
      // Node's summary counts a timed-out test and its cancelled children as cancelled, not failed.
      const kind = data.details?.error?.failureType;
      if (kind === 'cancelledByParent') {
        cancelled++;
        continue;
      }
      if (kind === 'testTimeoutFailure') cancelled++;
      else fail++;
      // A parent that fails only because a subtest did is counted, not named twice.
      if (data.details?.error?.failureType === 'subtestsFailed') continue;
      const message = String(data.details?.error?.message ?? '').trim().split('\n').slice(0, 12);
      yield `✖ ${data.name}\n${message.map((line) => `    ${line}`).join('\n')}\n`;
    } else if (!data.skip && data.todo === undefined) {
      pass++;
    }
  }
  yield `tests ${tests} · pass ${pass} · fail ${fail}${cancelled ? ` · cancelled ${cancelled}` : ''}\n`;
}
