/**
 * Slice S9: a walkthrough reads as steps, and a body reads as markdown.
 *
 * Every other test file here asks whether the deck says the right thing. This
 * one asks whether it can be made to say something nobody typed, because S9 is
 * the first slice that puts markup on a page which was not written out
 * character by character by `ui/render.mjs`. The deck renders text two
 * strangers wrote — the pilot's, and the user's own typing — and from this
 * slice on there is a transformation between the two.
 *
 * So the battery below is the point of the file, and it is written as an
 * invariant rather than as a list of the attacks somebody thought of: every
 * `<…>` in the output must be one of the fourteen shapes `markdown.mjs` is
 * allowed to emit, and every `href` must be `http` or `https`. Escaping happens
 * *first* (D8), so the only `<` that can survive into the output is one this
 * module wrote — which is exactly what `everyElementIn` checks, one hostile
 * input at a time. A renderer that passed "harmless" tags through, or that
 * transformed before it escaped, fails it on the first case.
 *
 * Pure: no store, no port, no server, except for the tests that prove what
 * "Sign off" lands as, which is a claim about a POST and so runs against a real
 * server on an ephemeral port.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { deckOnAPort, postsTheChoice } from '../testUtils.mjs';
import { SIGN_OFF, stepParts } from '../items.mjs';
import { escapeHtml, renderMarkdown, renderMarkdownLine } from '../ui/markdown.mjs';
import { renderHomePage, renderThreadPage } from '../ui/render.mjs';

const { listItems, postItem } = await import('../store.mjs');

// --- the invariant the whole slice rests on --------------------------------

/**
 * Every tag `markdown.mjs` may write, spelled exactly as it writes it. Not a
 * list of names: a list of *shapes*, so an attribute nobody asked for is a
 * failure even on a tag that is allowed. `<a>` is the only one that carries
 * any, and it carries those two and no others.
 */
const ALLOWED = [
  /^<\/?(?:p|br|code|pre|strong|em|h3|h4|h5|h6|ul|ol|li|table|thead|tbody|tr|th|td)\s?\/?>$/,
  /^<a href="[^"<>]*" rel="noreferrer noopener">$/,
  /^<\/a>$/,
];

/** Every `<…>` in a string. Escaping first means each one is this module's own. */
const everyElementIn = (html) => html.match(/<[^>]*>?/g) ?? [];

function assertOnlyWhitelistedMarkup(html, what) {
  for (const element of everyElementIn(html)) {
    assert.ok(
      ALLOWED.some((shape) => shape.test(element)),
      `${what}: ${JSON.stringify(element)} is not markup this module is allowed to write`,
    );
  }
  for (const href of html.match(/href="[^"]*"/g) ?? []) {
    assert.match(href, /^href="https?:\/\//, `${what}: ${href} is a scheme a browser might run`);
  }
}

/**
 * The battery. Each line is a way of getting markup onto the page that the
 * renderer must refuse, and each one is named by the mutant it kills — the
 * change to `markdown.mjs` that would make the deck render it.
 */
const HOSTILE = [
  // escape before transform, not after (D8)
  '<script>alert("x")</script>',
  // no raw HTML passthrough, ever, including tags that look harmless
  '<img src=x onerror=alert(1)>',
  '<b>bold</b> and <i>italic</i>',
  '<svg/onload=alert(1)>',
  '<!-- a comment that closes early --> and <div onclick="x">y</div>',
  '<iframe src="data:text/html,<script>alert(1)</script>"></iframe>',
  // Links only through safeHref. Paren-free payloads as well as the obvious
  // ones: a URL containing `(` never matches the link rule in the first place,
  // so an attack written `javascript:alert(1)` would pass for the wrong reason
  // and tell us nothing about the scheme check.
  '[click me](javascript:alert(1))',
  '[click me](javascript:alert%281%29)',
  '[click me](JaVaScRiPt:void0)',
  '[click me](  javascript:void0)',
  '[click me](vbscript:msgbox)',
  '[click me](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
  '[click me](file:///C:/Windows/win.ini)',
  '[click me](javascript&colon;void0)',
  '[click me](&#x6a;avascript:void0)',
  // an href that tries to close its own attribute and add another
  '[x](https://a.test/" onmouseover="alert(1))',
  "[x](https://a.test/' onmouseover='alert(1))",
  '[x](https://a.test/><script>alert(1)</script>)',
  // an unclosed fence, and a fence holding markup
  '```\n<script>alert(1)</script>',
  '```html\n<img onerror=alert(1)>\n```',
  '`<script>alert(1)</script>`',
  // an ambiguous `*`, and delimiters that never close
  '2 * 3 * 4 and *this never closes',
  '**',
  '****',
  '___',
  '`',
  '[unclosed](',
  // the escaping itself, fed back in
  '&lt;script&gt;alert(1)&lt;/script&gt;',
  '&amp;lt;script&amp;gt;',
  '&#39;&quot;&amp;',
  // a table cell carrying a script tag, and one carrying a javascript: link
  '| <script>alert(1)</script> | ok |\n| --- | --- |\n| a | [x](javascript:alert(1)) |',
];

test('nothing but this module\'s own markup reaches the page, for any input at all', () => {
  for (const hostile of HOSTILE) {
    assertOnlyWhitelistedMarkup(renderMarkdown(hostile), `renderMarkdown(${JSON.stringify(hostile)})`);
    assertOnlyWhitelistedMarkup(
      renderMarkdownLine(hostile),
      `renderMarkdownLine(${JSON.stringify(hostile)})`,
    );
  }
});

test('a raw <script> is the text the pilot posted and never a script', () => {
  const html = renderMarkdown('<script>alert("x")</script>');

  assert.ok(!html.includes('<script'), 'the tag never opens');
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/, 'and is read as text');
});

test('an <img onerror> is text, not an element with a handler on it', () => {
  const html = renderMarkdown('<img src=x onerror=alert(1)>');

  assert.ok(!html.includes('<img'), 'no element is opened');
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('a scheme safeHref refuses is the text of the link the pilot wrote, with no href at all', () => {
  // Paren-free, deliberately. A URL with a `(` in it never matches the link rule
  // at all, so `javascript:alert(1)` would be refused by the character class
  // rather than by the scheme check and would prove nothing about `safeHref`.
  for (const url of ['javascript:alert%281%29', 'vbscript:msgbox', 'file:///C:/Windows/win.ini']) {
    const html = renderMarkdown(`[click me](${url})`);

    assert.ok(!/href=/.test(html), `${url} became an href`);
    assert.ok(html.includes(`[click me](${url})`), 'and the pilot still sees what it wrote');
  }

  // The one with the parens is refused too, just one step earlier.
  const parens = renderMarkdown('[click me](javascript:alert(1))');
  assert.ok(!/href=/.test(parens));
  assert.match(parens, /\[click me\]\(javascript:alert\(1\)\)/);
});

test('an http and an https link are links, and an & in the query survives exactly once', () => {
  const html = renderMarkdown('[jobs](http://localhost:3260/jobs?status=Done&page=2) and [docs](https://a.test/x)');

  assert.match(html, /<a href="http:\/\/localhost:3260\/jobs\?status=Done&amp;page=2" rel="noreferrer noopener">jobs<\/a>/);
  assert.match(html, /<a href="https:\/\/a\.test\/x" rel="noreferrer noopener">docs<\/a>/);
  assert.ok(!html.includes('&amp;amp;'), 'escaped once, not twice — the link must still work');
});

test('a URL is unescaped by all five entities, not just &amp;, before it is checked', () => {
  const html = renderMarkdown('[x](https://a.test/?q=<>"\')');

  assert.ok(html.includes('href="https://a.test/?q=%3C%3E%22%27"'));
});

test('a URL that tries to close the href and add an attribute cannot', () => {
  const html = renderMarkdown('[x](https://a.test/" onmouseover="alert(1))');

  assert.ok(!/onmouseover="/.test(html), 'no second attribute is ever opened');
  assertOnlyWhitelistedMarkup(html, 'an href with a quote in it');
});

test('an unclosed fence is a code block to the end of the text, well formed', () => {
  const html = renderMarkdown('before\n\n```\n<script>alert(1)</script>\nstill code');

  assert.match(html, /<pre><code>&lt;script&gt;alert\(1\)&lt;\/script&gt;\nstill code\n<\/code><\/pre>/);
  assert.ok(!html.includes('```'), 'the fence itself is markup, not content');
  assert.equal((html.match(/<pre>/g) ?? []).length, 1, 'one block, opened once');
  assert.equal((html.match(/<\/code><\/pre>/g) ?? []).length, 1, 'and closed once');
});

test('an ambiguous * is multiplication, not emphasis', () => {
  const html = renderMarkdown('2 * 3 * 4 and *this never closes');

  assert.ok(!html.includes('<em>'), 'a * with a space after it opens nothing');
  assert.match(html, /2 \* 3 \* 4 and \*this never closes/);
});

// --- the markdown a body actually uses (D8) --------------------------------

test('headings, emphasis, code, lists and paragraphs render', () => {
  const html = renderMarkdown(
    [
      '# The procedure',
      '',
      'Open the deck and **read** the *bar*. Type `npm test`.',
      '',
      '## Steps',
      '',
      '- open /jobs',
      '- reload',
      '',
      '1. first',
      '2. second',
      '',
      '```js',
      'npm test',
      '```',
    ].join('\n'),
  );

  assert.match(html, /<h3>The procedure<\/h3>/, 'a body sits under the page heading, so # is h3');
  assert.match(html, /<h4>Steps<\/h4>/);
  assert.match(html, /<strong>read<\/strong>/);
  assert.match(html, /<em>bar<\/em>/);
  assert.match(html, /<code>npm test<\/code>/);
  assert.match(html, /<ul><li>open \/jobs<\/li><li>reload<\/li><\/ul>/);
  assert.match(html, /<ol><li>first<\/li><li>second<\/li><\/ol>/);
  assert.match(html, /<pre><code>npm test\n<\/code><\/pre>/);
  assert.match(html, /<p>Open the deck/, 'and prose is a paragraph');
  assert.equal((html.match(/<pre>/g) ?? []).length, 1, 'one block, opened once');
  assert.ok(!html.includes('<p>npm test</p>'), 'the fence is not swallowed into the paragraph above it');
});

test('a line that starts a new block ends the paragraph above it, blank line or not', () => {
  assert.equal(renderMarkdown('Do this:\n- one\n- two'), '<p>Do this:</p><ul><li>one</li><li>two</li></ul>');
  assert.equal(renderMarkdown('text\n# h'), '<p>text</p><h3>h</h3>');
  assert.equal(renderMarkdown('text\n```\ncode\n```'), '<p>text</p><pre><code>code\n</code></pre>');
});

// --- tables (S11) -----------------------------------------------------------

test('a three-column pipe table with a header row renders as <table><thead>…<tbody>', () => {
  const html = renderMarkdown(
    ['| A | B | C |', '| --- | --- | --- |', '| 1 | 2 | 3 |', '| 4 | 5 | 6 |'].join('\n'),
  );

  assert.equal(
    html,
    '<table><thead><tr><th>A</th><th>B</th><th>C</th></tr></thead>' +
      '<tbody><tr><td>1</td><td>2</td><td>3</td></tr><tr><td>4</td><td>5</td><td>6</td></tr></tbody></table>',
    'two body rows sit back to back, with nothing between the two <tr>',
  );
});

test('a table works without leading or trailing pipes', () => {
  const html = renderMarkdown(['A | B', '--- | ---', '1 | 2'].join('\n'));

  assert.equal(
    html,
    '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>',
  );
});

test('a paragraph with a lone pipe is untouched', () => {
  assert.equal(renderMarkdown('a | b'), '<p>a | b</p>');
  assert.equal(renderMarkdown('a | b\nstill one paragraph'), '<p>a | b<br />still one paragraph</p>');
});

test('emphasis, code and a link inside a table cell render through the same inline rules as a paragraph', () => {
  const html = renderMarkdown(
    ['| A | B | C |', '| --- | --- | --- |', '| **bold** | `code` | [x](https://a.test/) |'].join('\n'),
  );

  assert.match(html, /<td><strong>bold<\/strong><\/td>/);
  assert.match(html, /<td><code>code<\/code><\/td>/);
  assert.match(html, /<td><a href="https:\/\/a\.test\/" rel="noreferrer noopener">x<\/a><\/td>/);
});

test('a table ends where the rows stop, and text after it is its own paragraph', () => {
  const html = renderMarkdown(['| A | B |', '| --- | --- |', '| 1 | 2 |', '', 'after'].join('\n'));

  assert.match(html, /<\/table><p>after<\/p>$/);
});

test('a table with no blank line before the next one is two tables, not one with a stray row', () => {
  const html = renderMarkdown(
    ['| A | B |', '| --- | --- |', '| 1 | 2 |', '| C | D |', '| --- | --- |', '| 3 | 4 |'].join('\n'),
  );

  assert.equal(
    html,
    '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>' +
      '<table><thead><tr><th>C</th><th>D</th></tr></thead><tbody><tr><td>3</td><td>4</td></tr></tbody></table>',
    'the second header and delimiter row are never read as a body row of the first table',
  );
});

test('a delimiter row of the wrong width, or with a non-dash cell, is not a table', () => {
  assert.equal(renderMarkdown(['| A | B |', '| --- |'].join('\n')), '<p>| A | B |<br />| --- |</p>');
  assert.equal(
    renderMarkdown(['| A | B |', '| --- | notdash |'].join('\n')),
    '<p>| A | B |<br />| --- | notdash |</p>',
  );
});

test('one cell that is not dashes is enough, even with a body row under it', () => {
  // The case above never reaches either rule: a head with nothing under it is
  // not a table whatever its delimiter says (`startsATable` wants a body row).
  // With that row present the delimiter is what decides, and it decides on
  // *every* cell — and on the whole of each cell, because a delimiter cell is
  // dashes and nothing else, not dashes sitting inside a word.
  for (const delimiter of ['| --- | notdash |', '| --- | x--x |']) {
    assert.equal(
      renderMarkdown(['| A | B |', delimiter, '| 1 | 2 |'].join('\n')),
      `<p>| A | B |<br />${delimiter}<br />| 1 | 2 |</p>`,
      `\`${delimiter}\` is no delimiter row, so these three lines are a paragraph`,
    );
  }
});

test('a header and delimiter with no body row is not a table (QA, 2026-09-22)', () => {
  // A card's preview cuts the *source* at six lines (`render.mjs`'s
  // `renderPreview`), so a body that introduces a table in its opening lines puts
  // the cut squarely between the delimiter row and the first row of data. Read as
  // a table, that is `<tbody></tbody>`: a header with nothing under it, which says
  // the table is empty when what is true is that there is more to read. A table is
  // its rows, so with none of them this is text — exactly as a delimiter row of
  // the wrong width already is.
  assert.equal(
    renderMarkdown(['| A | B |', '| --- | --- |'].join('\n')),
    '<p>| A | B |<br />| --- | --- |</p>',
  );
  assert.equal(
    renderMarkdown(['intro', '', '| A | B |', '| --- | --- |'].join('\n')),
    '<p>intro</p><p>| A | B |<br />| --- | --- |</p>',
    'a cut landing after a delimiter row leaves text, never an empty table',
  );
});

test('a bodyless head before a real table is text, and the table after it still reads', () => {
  assert.equal(
    renderMarkdown(['| A | B |', '| --- | --- |', '| C | D |', '| --- | --- |', '| 1 | 2 |'].join('\n')),
    '<p>| A | B |<br />| --- | --- |</p>' +
      '<table><thead><tr><th>C</th><th>D</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>',
    'the first head owns no rows, so it is text; the second owns one, so it is a table',
  );
});

test('a run of heads with no rows anywhere is one paragraph, and is read in linear time', () => {
  // Both halves of this matter, and the second is why `startsATable` asks
  // `looksLikeTableHead` rather than asking itself about `index + 2`. The
  // recursive phrasing reads identically and walks to the end of the input on
  // every check: this shape took ten seconds at 8000 lines and exceeded the call
  // stack at 32000, which on a one-process daemon is the user's whole deck hung.
  const pairs = 4000;
  const body = Array(pairs).fill(['| a | b |', '| --- | --- |']).flat().join('\n');

  const began = performance.now();
  const html = renderMarkdown(body);
  const took = performance.now() - began;

  assert.equal((html.match(/<table>/g) ?? []).length, 0, 'no head owns a row, so no table is drawn');
  assert.match(html, /^<p>\| a \| b \|<br \/>/, 'they are one paragraph of text');
  // Two orders of magnitude of headroom over the linear cost, and two under the
  // quadratic one: a threshold that fails on the regression without failing on a
  // slow machine.
  assert.ok(took < 5000, `rendering ${pairs * 2} pipe lines took ${took.toFixed(0)}ms`);
});

test('a table still renders on the strength of a single body row', () => {
  assert.equal(
    renderMarkdown(['| A | B |', '| --- | --- |', '| 1 | 2 |'].join('\n')),
    '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>',
    'one row is a table; the rule above is about none, not about few',
  );
});

test('a row with whitespace outside the pipes still splits into cells cleanly', () => {
  const html = renderMarkdown(['| A | B |', '| --- | --- |', '  | 1 | 2 |  '].join('\n'));

  assert.equal(
    html,
    '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>',
  );
});

test('a line with no pipe never starts a table, however much it looks like a delimiter row', () => {
  const html = renderMarkdown(['Notes', '---', 'more text'].join('\n'));

  assert.equal(html, '<p>Notes<br />---<br />more text</p>');
});

test('table rows followed, with no blank line, by a line with no pipe: the table closes there', () => {
  const html = renderMarkdown(['| A | B |', '| --- | --- |', '| 1 | 2 |', 'no pipe here'].join('\n'));

  assert.equal(
    html,
    '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>' +
      '<p>no pipe here</p>',
  );
});

test('a * inside a code span is a star, and a backtick inside emphasis is a backtick', () => {
  assert.equal(renderMarkdownLine('`a *b* c`'), '<code>a *b* c</code>');
  assert.equal(renderMarkdownLine('*a `b` c*'), '<em>a <code>b</code> c</em>');
});

test('an underscore inside a word is an underscore, and one around a word is emphasis', () => {
  assert.equal(renderMarkdownLine('some_var_name'), 'some_var_name');
  assert.equal(renderMarkdownLine('_quiet_'), '<em>quiet</em>');
});

test('the line breaks the pilot typed inside a paragraph are the line breaks on the page', () => {
  const html = renderMarkdown('one\r\ntwo\n\nthree');

  assert.match(html, /<p>one<br \/>two<\/p>/, 'a single newline is a break, CRLF included');
  assert.match(html, /<p>three<\/p>/, 'and a blank line is a new paragraph');
  assert.ok(!html.includes('\r'), 'no carriage return reaches the page');
});

test('nothing is nothing, not an empty paragraph', () => {
  assert.equal(renderMarkdown(''), '');
  assert.equal(renderMarkdown(undefined), '');
  assert.equal(renderMarkdown('\n\n  \n'), '');
});

test('a link label and a bold span are bounded, so the largest legal body cannot stall the deck', () => {
  // Without the bound, every `[` on a line scans to the end of it looking for
  // `](`, and a body may be 64 KiB of one line: 64 KiB of `[` took 1050 ms of
  // the daemon's single event loop, which is every parked `deck_wait` waiting.
  // With it, 42 ms. The bound is pinned here rather than by a stopwatch, because
  // a test that measures a machine is a test that fails on a busy one.
  assert.match(
    renderMarkdownLine(`[${'x'.repeat(512)}](https://a.test/)`),
    /^<a href="https:\/\/a\.test\/" rel="noreferrer noopener">x{512}<\/a>$/,
    '512 characters of label is still a label',
  );
  assert.ok(
    !renderMarkdownLine(`[${'x'.repeat(513)}](https://a.test/)`).includes('<a '),
    'and 513 is text — which is what stops the scan',
  );
  assert.match(renderMarkdownLine(`**${'y'.repeat(512)}**`), /^<strong>y{512}<\/strong>$/);
  assert.ok(
    !renderMarkdownLine(`**${'y'.repeat(513)}**`).includes('<strong>'),
    '513 characters of bold is not emphasis',
  );
});

test('escapeHtml is still the one exported escape, and still escapes all five', () => {
  assert.equal(escapeHtml(`<&>"'`), '&lt;&amp;&gt;&quot;&#39;');
});

test('the heading, emphasis, list and line-break rules at their edges', () => {
  assert.match(renderMarkdown('# a'), /<h3>a<\/h3>/, 'one # is the shallowest heading, h3');
  assert.match(renderMarkdown('###### a'), /<h6>a<\/h6>/, 'six #s is the deepest, h6');
  assert.equal(renderMarkdownLine('_quiet_ x'), '<em>quiet</em> x', 'a space after the closing _ still closes it');
  assert.match(renderMarkdown('10. item'), /<ol start="10"><li>item<\/li><\/ol>/, '10. is an ordered marker, and keeps its number');
  assert.equal(renderMarkdownLine('a # b'), 'a # b', 'a mid-line # is prose, not a heading');
  assert.equal(renderMarkdownLine('a ``` b'), 'a ``` b', 'a mid-line ``` is prose, not a fence');
  assert.equal(renderMarkdownLine('a\r\nb'), 'a b', 'a line break in one line collapses to a space');
});

// --- a step is a pair (D9) -------------------------------------------------

test('a step splits at the first arrow into what to do and what should happen', () => {
  assert.deepEqual(stepParts('open /jobs → the table lists three jobs'), {
    instruction: 'open /jobs',
    result: 'the table lists three jobs',
  });
  assert.deepEqual(stepParts('open /jobs -> the table lists three jobs'), {
    instruction: 'open /jobs',
    result: 'the table lists three jobs',
  });
});

test('the first arrow is the split, and any later one is part of what should happen', () => {
  assert.deepEqual(stepParts('set A -> B -> the row moves to B'), {
    instruction: 'set A',
    result: 'B -> the row moves to B',
  });
  assert.deepEqual(stepParts('set A → B → the row moves'), {
    instruction: 'set A',
    result: 'B → the row moves',
  });
  assert.deepEqual(
    stepParts('reload -> the filter survives → and the sort does too'),
    { instruction: 'reload', result: 'the filter survives → and the sort does too' },
    'whichever arrow comes first, not whichever is written first in the pattern',
  );
});

test('a step with no arrow is one instruction, and a trailing arrow is not a pair', () => {
  assert.deepEqual(stepParts('reload the page'), { instruction: 'reload the page', result: null });
  assert.deepEqual(stepParts('reload the page ->  '), {
    instruction: 'reload the page',
    result: null,
  });
  assert.deepEqual(stepParts(''), { instruction: '', result: null });
});

// --- what a page does with all of that -------------------------------------

const aWalkthrough = (over = {}) => ({
  id: 'i-1',
  kind: 'walkthrough',
  title: 'Does the jobs page filter?',
  body: 'Read the **bar**, then <script>alert(1)</script>, then [jobs](javascript:alert(1)).',
  postedAt: '2026-09-19 09:00',
  url: 'http://localhost:3260/jobs',
  login: 'the seeded operator',
  screens: ['open /jobs → the table lists three jobs', 'reload'],
  repo: 'D:\\work\\pilot',
  ...over,
});

test('a walkthrough body renders markdown on its thread, and its steps read as pairs', () => {
  const page = renderThreadPage(aWalkthrough());

  assert.match(page, /<strong>bar<\/strong>/, 'the body is markdown now');
  assert.match(page, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/, 'and the body still escapes first');
  assert.equal(
    (page.match(/<script/g) ?? []).length,
    1,
    'the only script on the page is the deck\'s own inlined one',
  );
  assert.ok(!/href="javascript:/i.test(page), 'and a scheme a browser would run is never an href');
  assert.match(page, /class="step do"/, 'a step says what to do');
  assert.match(page, /class="step result"/, 'and what should happen');
  assert.match(page, /open \/jobs<\/span>/);
  assert.match(page, /the table lists three jobs<\/span>/);
  assert.ok(!page.includes('→ the table'), 'the arrow is the split, not text on the page');
  assert.match(page, /<li><span class="step do">reload<\/span><\/li>/, 'no arrow is one instruction');
});

test('a message renders markdown, and so does the card preview beside it', () => {
  const item = aWalkthrough({
    body: '## Which port?\nRead the **bar**, then pick one.',
    replies: [{ from: 'user', text: '- **done**\n- the filter worked', repliedAt: '2026-09-19 09:05' }],
  });

  const thread = renderThreadPage(item);
  assert.match(thread, /<strong>done<\/strong>/, 'a reply is markdown on the thread');
  assert.match(thread, /<h4>Which port\?<\/h4>/, 'and so is a heading in the body');

  // The walkthrough of 2026-09-19: "i thought that part of the spec was to
  // render the mark-down syntax, such as **bold** and ## Title". D6 kept the
  // card plain against exactly this, and the user overruled it on the page.
  const card = renderHomePage([item]);
  assert.match(card, /<h4>Which port\?<\/h4>/, 'the excerpt renders the heading too');
  assert.match(card, /<strong>bar<\/strong>/, 'and the emphasis inside it');
  assert.ok(!card.includes('**bar**'), 'no marker the pilot typed is left on the page as text');
});

/** Every tag `markdown.mjs` writes that has to be closed again. */
const BLOCKS = ['p', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'pre', 'code', 'strong', 'em'];

/**
 * The excerpt on the first card, and nothing else on the page: the stylesheet
 * every page inlines writes tag names inside its own comments, and counting
 * those would be counting prose.
 */
const excerptOf = (page) => /<div class="preview md">([\s\S]*?)<\/div>/.exec(page)?.[1] ?? null;

const unbalanced = (html) =>
  BLOCKS.filter(
    (tag) =>
      (html.match(new RegExp(`<${tag}(?=[ >])`, 'g')) ?? []).length !==
      (html.match(new RegExp(`</${tag}>`, 'g')) ?? []).length,
  );

test('an excerpt cut at the six-line bound still closes every element it opens', () => {
  // The cut is made in the pilot's text and the excerpt is then rendered, never
  // the other way round: `renderMarkdown` closes every block it opens whatever
  // it is given, so no cut of the source can leave a tag hanging, where a cut of
  // the rendered HTML would sooner or later land inside one.
  const bodies = [
    '```\none\ntwo\nthree\nfour\nfive\nsix\nseven\n```',
    '- one\n- two\n- three\n- four\n- five\n- six\n- seven',
    '## A heading\nand **emphasis** that runs on\nand on\nand on\nand on\nand on\nseven',
    `${'y'.repeat(399)}**seven`,
  ];

  for (const body of bodies) {
    const excerpt = excerptOf(renderHomePage([aWalkthrough({ body })]));
    assert.deepEqual(
      unbalanced(excerpt),
      [],
      `the excerpt of ${JSON.stringify(body)} is whole markup`,
    );
    assert.ok(!excerpt.includes('seven'), 'and it is still an excerpt');
    assert.ok(excerpt.endsWith('<p class="more">…</p>'), 'marked as having more behind it');
  }
});

test('a walkthrough carries a one-click "Sign off" and never a resolve', () => {
  const page = renderThreadPage(aWalkthrough());

  assert.match(
    page,
    new RegExp(`<button type="submit" name="choice" value="${SIGN_OFF}" formnovalidate>`),
    'the same choices mechanism a question uses (D10)',
  );
  assert.match(page, /action="\/reply"/, 'it replies');
  assert.ok(!page.includes('/resolve'), 'only the pilot closes a thread');
  assert.match(
    renderHomePage([aWalkthrough()]),
    /name="choice" value="Sign off"/,
    'and it is on the card too, the way a question\'s options are',
  );
});

test('a resolved walkthrough offers no button, because there is nothing left to say', () => {
  const page = renderThreadPage(aWalkthrough({ resolvedAt: '2026-09-19 10:00', resolution: 'thanks' }));

  assert.ok(!page.includes('Sign off'), 'a closed thread takes no reply');
});

test('a walkthrough with no screens draws no step list at all', () => {
  const page = renderThreadPage(aWalkthrough({ screens: undefined }));

  assert.ok(!page.includes('class="steps"'), 'an empty list is worse than none');
  assert.match(page, /Sign off/, 'the button is not the steps\' doing');
});

// --- and the button really is a reply, over HTTP ----------------------------

const aProcedure = () => ({
  kind: 'walkthrough',
  title: 'Does the jobs page filter?',
  body: 'Three steps.',
  screens: ['open /jobs → three jobs'],
  repo: path.join('D:', 'work', 'pilot'),
});

test('clicking "Sign off" with nothing typed posts it as the reply', async (t) => {
  const stored = await postsTheChoice(t, aProcedure(), SIGN_OFF);

  assert.deepEqual(
    stored.replies.map((reply) => reply.text),
    [SIGN_OFF],
    'the reply is the button\'s own words and nothing else',
  );
  assert.ok(!stored.resolvedAt, 'and the thread is still open — only the pilot closes one');
});

/**
 * The walkthrough of 2026-09-19 asked for the button to *be* the sign-off, so
 * what it means has to be exact: pressing it with a finding typed beside it is
 * the finding, not a signature under work the user has just said is wrong.
 */
test('"Sign off" with something typed sends the finding, and signs nothing off', async (t) => {
  const origin = await deckOnAPort(t);
  const posted = postItem(aProcedure());

  const answer = await fetch(`${origin}/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin },
    redirect: 'manual',
    body: new URLSearchParams({
      id: posted.id,
      choice: SIGN_OFF,
      text: 'the third step opens the wrong tab',
    }),
  });
  assert.equal(answer.status, 303);

  const stored = listItems().find((candidate) => candidate.id === posted.id);
  assert.deepEqual(
    stored.replies.map((reply) => reply.text),
    ['the third step opens the wrong tab'],
    'what they typed, and not a sign-off they did not give',
  );
  assert.ok(!stored.resolvedAt, 'and still open, as every reply leaves it');
});

test('a question whose option is spelled "Sign off" keeps it, because it is not one', async (t) => {
  const origin = await deckOnAPort(t);
  // A sign-off's own Sign off is the deck's button (thread-types-phase A6), and a
  // question's options may spell it too. The rule is the walkthrough's button,
  // not the words, or this press would vanish out of a
  // reply the user typed beside it with nothing said about it.
  const posted = postItem({
    kind: 'signoff',
    title: 'Is the cache design settled?',
    body: 'Merge it?',
    repo: path.join('D:', 'work', 'pilot'),
  });

  await fetch(`${origin}/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin },
    redirect: 'manual',
    body: new URLSearchParams({ id: posted.id, choice: SIGN_OFF, text: 'but bump the TTL first' }),
  });

  assert.deepEqual(
    listItems()
      .find((candidate) => candidate.id === posted.id)
      .replies.map((reply) => reply.text),
    ['Sign off\n\nbut bump the TTL first'],
    'both halves, because only a walkthrough has the button the rule is about',
  );
});

test('a question\'s option still carries what was typed with it', async (t) => {
  const origin = await deckOnAPort(t);
  const posted = postItem({
    kind: 'question',
    title: 'Which port?',
    body: 'One fixed port.',
    options: ['4321'],
    repo: path.join('D:', 'work', 'pilot'),
  });

  await fetch(`${origin}/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin },
    redirect: 'manual',
    body: new URLSearchParams({ id: posted.id, choice: '4321', text: 'but check 4317 is free' }),
  });

  assert.deepEqual(
    listItems()
      .find((candidate) => candidate.id === posted.id)
      .replies.map((reply) => reply.text),
    ['4321\n\nbut check 4317 is free'],
    'picking an answer and saying why is both halves, and only the sign-off is otherwise',
  );
});

test('an indented line under a list item continues it; an unindented one ends the list', () => {
  assert.equal(renderMarkdown('1. one\n   more\n2. two\nafter'), '<ol><li>one<br />more</li><li>two</li></ol><p>after</p>');
  assert.equal(renderMarkdown('- one\n  - two'), '<ul><li>one</li><li>two</li></ul>', 'an indented item is still a sibling');
});
