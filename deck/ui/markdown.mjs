/**
 * Text into HTML, safely. This module holds the deck's escaping, the two URL
 * schemes a link may ever have, and the whitelisted markdown renderer that
 * turns a body or a message into the headings, emphasis, code, lists and
 * paragraphs the pilot typed (D8).
 *
 * The escaping used to live in `ui/render.mjs`, and it moved here because
 * `safeHref` is the one gate a link may pass through and this module now needs
 * it too. Duplicating it would have been two answers to "which schemes does the
 * deck navigate to", which is exactly the sort of question that must have one.
 *
 * **Escape first, then transform the escaped text.** That is the whole security
 * design, and it is one sentence rather than a list of the tags a sanitiser
 * would strip, because a list is only ever as good as its author's imagination.
 * By the time any rule below looks at the text there is no `<` left in it: a
 * `<script>` the pilot posted is already `&lt;script&gt;`, so there is nothing
 * for a rule to be tricked into keeping. Every `<` in this module's output was
 * written as a literal in this file, and `deck/test/markdown.test.mjs` asserts
 * exactly that against a battery of hostile inputs — a shape allowlist over the
 * output rather than a blocklist over the input.
 *
 * The three consequences, which are the rules to keep when editing:
 *
 * 1. Nothing is ever appended to the output that is neither a literal here nor
 *    a substring of the already-escaped input.
 * 2. A URL is the one value that has to come back out of its escaped form to be
 *    parsed, so `unescapeHtml` inverts exactly the five entities `escapeHtml`
 *    writes and nothing else, and what goes into the `href` is `safeHref`'s
 *    answer escaped again. A scheme spelled `&#x6a;avascript:` is not a scheme
 *    this module ever produced, so it is never decoded and `new URL` refuses it.
 * 3. The inline rules are read left to right, one position at a time, so the
 *    first rule that matches where the walk has got to wins and its own content
 *    is handed back to the rules that may nest inside it. A `*` inside a code
 *    span is a star, because the code rule consumed it before the emphasis rule
 *    was ever offered the position.
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Everything a human types and everything the pilot posts goes through this. */
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ESCAPES[character]);
}

const UNESCAPES = Object.fromEntries(Object.entries(ESCAPES).map(([character, entity]) => [entity, character]));

/**
 * The exact inverse of `escapeHtml`, for the one value that needs to be read as
 * a URL after the text it sits in has been escaped. One pass over an
 * alternation of the five sequences, so `&amp;lt;` — which is what a literal
 * `&lt;` in the pilot's text becomes — comes back as `&lt;` and not as `<`.
 * Nothing else is decoded: `&#x6a;`, `&colon;` and the rest were never written
 * by `escapeHtml`, so reading them here would be inventing characters the pilot
 * did not type, which is the whole trick a scheme filter is beaten by.
 */
const ENTITY = new RegExp(Object.values(ESCAPES).join('|'), 'g');

const unescapeHtml = (escaped) => escaped.replace(ENTITY, (entity) => UNESCAPES[entity]);

/** An `href` the browser will only ever navigate to, or null. */
function safeHref(url) {
  try {
    const parsed = new URL(String(url));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

/** The one shape of `<a>` this module writes, from an href it has already checked. */
const anchor = (href, inner) =>
  `<a href="${escapeHtml(href)}" rel="noreferrer noopener">${inner}</a>`;

/** A URL as a link where that is safe, and as the text the pilot posted where it is not. */
export function renderUrl(url) {
  const href = safeHref(url);
  return href === null ? escapeHtml(url) : anchor(href, escapeHtml(url));
}

// --- the inline rules ------------------------------------------------------

/**
 * A rule is a sticky pattern and what its match becomes. Sticky (`y`) is what
 * makes the left-to-right walk true: a pattern only ever matches at the exact
 * position the walk has reached, never further along, so precedence between the
 * rules is decided per position rather than per document.
 *
 * Emphasis is flanked: the delimiter must be followed by a non-space and the
 * closing one preceded by a non-space, which is what makes `2 * 3 * 4`
 * multiplication instead of an italic ` 3 `. The content of one is at least one
 * character, so `**` and `****` close nothing and stay the stars they are.
 * Underscores additionally refuse a word character on either outside edge, so
 * `some_var_name` is a name rather than two words with an italic between them.
 *
 * No rule's content may cross a newline. A paragraph keeps the line breaks the
 * pilot typed (see `renderParagraph`), and emphasis that spanned one would be a
 * `*` at the end of a line reaching for the next — far more often a typo than
 * an intention.
 *
 * The two rules whose content can run past the delimiter it is looking for are
 * bounded — a link's label and a `**` span — because without a bound each `[`
 * on a line scans to the end of it, and a body may be 64 KiB (`MAX_TEXT_BYTES`)
 * of one line. 64 KiB of `[` took a second of the daemon's single event loop,
 * which is every parked `deck_wait` waiting on a page nobody asked for. The
 * bounds make the walk linear and they cost nothing real: a link label of more
 * than 512 characters is not a label, and 512 characters of bold is not
 * emphasis. Code needs no bound — its content cannot cross a backtick, so the
 * scan from one always stops at the next — and neither does single-delimiter
 * emphasis, for the same reason.
 */
const MAX_INLINE_CHARS = 512;

const INLINE_RULES = [
  // Code first, and its content is not looked at again: that is what makes a
  // code span the way to show markdown, a `*`, or a `<script>` as itself.
  { pattern: /`([^`\n]+)`/y, render: (match) => `<code>${match[1]}</code>` },
  {
    pattern: new RegExp(
      `\\[([^\\]\\n]{0,${MAX_INLINE_CHARS}})\\]\\(([^()\\s]*)\\)`,
      'y',
    ),
    render: renderLink,
  },
  {
    pattern: new RegExp(`(\\*\\*|__)(?=\\S)([^\\n]{1,${MAX_INLINE_CHARS}}?)(?<=\\S)\\1`, 'y'),
    render: (match) => `<strong>${renderInline(match[2])}</strong>`,
  },
  { pattern: /\*(?=\S)([^*\n]+?)(?<=\S)\*/y, render: (match) => `<em>${renderInline(match[1])}</em>` },
  { pattern: /(?<!\w)_(?=\S)([^_\n]+?)(?<=\S)_(?!\w)/y, render: (match) => `<em>${renderInline(match[1])}</em>` },
];

/**
 * A link, or the text of one. The URL is the only thing here that comes out of
 * its escaped form, and it goes straight into `safeHref` and back out escaped
 * again. A URL `safeHref` refuses renders as the whole `[text](url)` the pilot
 * wrote — already escaped, so safe, and honest: they see what they typed rather
 * than a link that silently went missing.
 */
function renderLink(match) {
  const href = safeHref(unescapeHtml(match[2]));
  return href === null ? match[0] : anchor(href, renderInline(match[1]));
}

/**
 * Escaped text, with the inline rules applied. One position at a time, so a
 * character no rule claims is copied across as itself — which is how a lone
 * `*`, an unclosed `[`, or a backtick with no partner survives as the character
 * the pilot typed instead of becoming markup or disappearing.
 */
function renderInline(escaped) {
  let html = '';
  let index = 0;
  while (index < escaped.length) {
    let matched = false;
    for (const rule of INLINE_RULES) {
      rule.pattern.lastIndex = index;
      const match = rule.pattern.exec(escaped);
      if (!match) continue;
      // Read before rendering: `render` recurses into this walk and moves the
      // very `lastIndex` the end of this match would otherwise be read from.
      const end = rule.pattern.lastIndex;
      html += rule.render(match);
      index = end;
      matched = true;
      break;
    }
    if (!matched) {
      html += escaped[index];
      index += 1;
    }
  }
  return html;
}

// --- the blocks ------------------------------------------------------------

/**
 * A fence is three or more backticks on their own line, with an info string
 * allowed on the opening one and not on the closing one. The info string is
 * dropped rather than turned into a class: nothing on these pages highlights
 * code, and a `language-` class would be markup carrying the pilot's text.
 */
const FENCE = /^ {0,3}(`{3,})([^\n`]*)$/;
const HEADING = /^ {0,3}(#{1,6}) +(.*)$/;
const BULLET = /^ {0,3}[-*+] +(.*)$/;
const ORDERED = /^ {0,3}\d{1,9}[.)] +(.*)$/;

/** One cell of a delimiter row: `-`, `:-`, `-:` or `:-:`, one or more dashes. */
const DELIMITER_CELL = /^:?-{1,}:?$/;

/**
 * A pipe row split into its cells. A leading and trailing pipe are both
 * optional (the spec line), so they are stripped first if present and every
 * remaining `|` is a cell boundary — the grammar this module supports has no
 * escaped pipe and no cell that spans more than one line.
 */
function splitRow(line) {
  const trimmed = line.trim();
  const body = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  return body.split('|').map((cell) => cell.trim());
}

/**
 * A pipe row immediately followed by a delimiter row of the same width: the
 * shape of a table's head, and the one lookahead a single-line check like
 * `startsABlock` cannot make, so it takes the lines and the index rather than
 * one line.
 *
 * Shape only. Whether a table *starts* here is `startsATable` below, which also
 * wants a row; this is separate from it because the two questions are asked at
 * different depths and answering the narrower one must stay O(1) — see there.
 */
function looksLikeTableHead(lines, index) {
  if (!lines[index].includes('|') || index + 1 >= lines.length) return false;
  const header = splitRow(lines[index]);
  const delimiter = splitRow(lines[index + 1]);
  return delimiter.length === header.length && delimiter.every((cell) => DELIMITER_CELL.test(cell));
}

/**
 * A line that is one of a table's own rows: it has a pipe, it does not begin
 * some other block, and it is not the head of the *next* table. One rule, asked
 * in two places — `readTable` collects exactly the lines it admits, and
 * `startsATable` requires one of them to exist — so a table's extent and the
 * question of whether there is a table at all cannot come to disagree.
 */
function isBodyRow(lines, index) {
  return (
    index < lines.length &&
    lines[index].includes('|') &&
    !startsABlock(lines[index]) &&
    !looksLikeTableHead(lines, index)
  );
}

/**
 * A table starts where a table's head is followed by at least one row of its
 * own. The row is required because a table is its rows: a card's preview cuts
 * the *source* at six lines (`render.mjs`'s `renderPreview`), so a body that
 * opens with a table puts that cut between the delimiter row and the first row
 * of data, and read as a table the remainder is `<tbody></tbody>` — a header
 * with nothing under it, which tells the reader the table is empty when the
 * truth is that there is more of it to read. Without a row this is text,
 * exactly as a delimiter row of the wrong width already is.
 *
 * Every question here is O(1) and none of them recurses, which is the whole
 * reason `looksLikeTableHead` is a function of its own. Asking instead whether
 * a *table* starts at `index + 2` reads the same and costs quadratically: each
 * check would walk forward to the end of the input, and a body of alternating
 * header and delimiter rows — 8000 lines of it, well inside what an item body
 * or a typed reply may hold — took ten seconds to render and blew the stack at
 * four times that. The deck is one process serving one user, so that is their
 * whole deck hung. Measured at QA, 2026-09-22.
 */
function startsATable(lines, index) {
  return looksLikeTableHead(lines, index) && isBodyRow(lines, index + 2);
}

/**
 * A table, to the first line that is blank, starts another block, starts
 * another table, or has no pipe in it. Column alignment from the delimiter
 * row is read and then dropped — the spec allows either, and dropping costs
 * nothing an evidence line asks for. Each cell goes through `renderInline`,
 * the same pass a paragraph's text takes, so a hostile cell escapes exactly
 * as a hostile paragraph does (the module's rule 1).
 */
function readTable(lines, start) {
  const heading = splitRow(lines[start]).map((cell) => `<th>${renderInline(cell)}</th>`).join('');
  let index = start + 2;
  const rows = [];
  while (isBodyRow(lines, index)) {
    const cells = splitRow(lines[index]).map((cell) => `<td>${renderInline(cell)}</td>`).join('');
    rows.push(`<tr>${cells}</tr>`);
    index += 1;
  }
  return {
    html: `<table><thead><tr>${heading}</tr></thead><tbody>${rows.join('')}</tbody></table>`,
    next: index,
  };
}

/**
 * Which heading tag a level becomes. A body is rendered *inside* a page whose
 * `<h1>` is "Pilot deck" and whose `<h2>` is the item's title, so the pilot's
 * own `#` is the third level of that document and not the first. Everything
 * deeper than `####` is `<h6>`, because that is where HTML stops.
 */
const HEADING_TAGS = ['h3', 'h4', 'h5', 'h6', 'h6', 'h6'];

const startsABlock = (line) => FENCE.test(line) || HEADING.test(line) || BULLET.test(line) || ORDERED.test(line);

/**
 * A fenced block, to its closing fence or to the end of the text. An unclosed
 * fence is deliberately the rest of the document rather than an error or a
 * literal: the pilot meant the lines under it as code, and a renderer that gave
 * up would show them as prose with a stray ``` above them.
 */
function readFence(lines, start) {
  const marker = FENCE.exec(lines[start])[1];
  const body = [];
  let index = start + 1;
  while (index < lines.length) {
    const closing = FENCE.exec(lines[index]);
    if (closing && closing[1].length >= marker.length && closing[2].trim() === '') {
      index += 1;
      break;
    }
    body.push(lines[index]);
    index += 1;
  }
  // The trailing newline is the convention for `<pre>` content and the reason a
  // one-line block does not read as if the code ran into the closing tag.
  const code = body.map((line) => `${line}\n`).join('');
  return { html: `<pre><code>${code}</code></pre>`, next: index };
}

/**
 * A run of list items of one kind. Flat, deliberately: an indented item is a
 * sibling rather than a child, because a nested list is a shape the deck's terse
 * bodies and dot-point replies have never needed and every level of it is
 * another way for the block reader to be wrong. An indented line that starts no
 * block continues the item above it on a line of its own, as an audit finding's
 * Evidence and Fix do (thread-kinds QA 4).
 */
function readList(lines, start) {
  const ordered = !BULLET.test(lines[start]);
  const pattern = ordered ? ORDERED : BULLET;
  const items = [];
  let index = start;
  while (index < lines.length) {
    const match = pattern.exec(lines[index]);
    if (!match) break;
    const said = [match[1]];
    index += 1;
    while (index < lines.length && /^ +\S/.test(lines[index]) && !startsABlock(lines[index]) && !startsATable(lines, index)) {
      said.push(lines[index].trim());
      index += 1;
    }
    items.push(`<li>${renderInline(said.join('\n')).split('\n').join('<br />')}</li>`);
  }
  const tag = ordered ? 'ol' : 'ul';
  // A list that opens past 1 keeps its number, as one a paragraph has broken off does.
  const first = ordered ? Number(/\d+/.exec(lines[start])[0]) : 1;
  const opens = first === 1 ? tag : `${tag} start="${first}"`;
  return { html: `<${opens}>${items.join('')}</${tag}>`, next: index };
}

/**
 * A paragraph: every line up to a blank one or the start of another block, with
 * the pilot's own line breaks kept as `<br />`. Markdown proper would reflow
 * them into one line; the deck does not, because an agent writing a body types
 * one thought per line and means it, and a reply typed into the box is dot
 * points whose shape is the answer.
 */
function readParagraph(lines, start) {
  const collected = [lines[start]];
  let index = start + 1;
  while (
    index < lines.length &&
    lines[index].trim() !== '' &&
    !startsABlock(lines[index]) &&
    !startsATable(lines, index)
  ) {
    collected.push(lines[index]);
    index += 1;
  }
  return {
    html: `<p>${renderInline(collected.join('\n')).split('\n').join('<br />')}</p>`,
    next: index,
  };
}

/**
 * A body or a message as HTML: escaped first, then read as blocks, then each
 * block's text read for inline markup. Empty text is an empty string and never
 * an empty paragraph, so a page's markup says nothing where the pilot said
 * nothing.
 */
export function renderMarkdown(text) {
  const lines = escapeHtml(String(text ?? '').replace(/\r\n?/g, '\n')).split('\n');
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === '') {
      index += 1;
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      const tag = HEADING_TAGS[heading[1].length - 1];
      blocks.push(`<${tag}>${renderInline(heading[2].trim())}</${tag}>`);
      index += 1;
      continue;
    }
    const block = FENCE.test(line)
      ? readFence(lines, index)
      : BULLET.test(line) || ORDERED.test(line)
        ? readList(lines, index)
        : startsATable(lines, index)
          ? readTable(lines, index)
          : readParagraph(lines, index);
    blocks.push(block.html);
    index = block.next;
  }
  return blocks.join('');
}

/**
 * One line of markdown with no block around it — a walkthrough step, or
 * anything else the page is putting inside markup of its own. The inline rules
 * only, so there is no `<p>` to close and no list to open where the caller has
 * already decided the shape.
 *
 * A line, so every line break in it becomes a space: the caller has said this
 * is one line and a break the browser would collapse to a space anyway should
 * not be the thing that stops an inline rule from matching across it.
 */
export function renderMarkdownLine(text) {
  return renderInline(escapeHtml(String(text ?? '').replace(/[\r\n]+/g, ' ')));
}
