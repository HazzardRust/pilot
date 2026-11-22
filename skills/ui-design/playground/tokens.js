// Token leaves (ui-design-workflow S4, ADR NNNN, L6): the one parser of a JSON token file, read
// with each leaf's source span so an untouched export is the file byte for byte. A classic script
// that sets `globalThis.tokens`: the playground page loads it by <script src>, `pilot look apply`
// through `vm`. It reads text and returns text; it touches no file, page or network. S5 adds
// `contrast`, the ratio the page's contrast table flags under 4.5:1.
(function (g) {
  'use strict';

  /** `text` parsed to `{ root, leaves, src }`, each leaf `{ path, start, end, raw, value }`; throws on bad JSON or trailing text. */
  function leaves(src) {
    let i = 0; const found = [];
    const ws = () => { while (/\s/.test(src[i])) i++; };
    const tok = re => { re.lastIndex = i; const m = re.exec(src); if (!m) throw new Error('bad JSON at ' + i); i = re.lastIndex; return m[0]; };
    const str = /"(?:[^"\\]|\\.)*"/y;
    const expect = c => { ws(); if (src[i++] !== c) throw new Error(`expected ${c} at ${i - 1}`); };
    function value(path) {
      ws(); const start = i;
      if (src[i] === '{') {
        i++; const obj = {}; ws();
        if (src[i] === '}') { i++; return obj; }
        for (;;) {
          ws(); const key = JSON.parse(tok(str)); expect(':');
          if (Object.hasOwn(obj, key)) throw new Error(`duplicate key ${path.concat(key).join('.')}`);
          // Defined, not assigned, so a `__proto__` key is a key and never the object's prototype.
          Object.defineProperty(obj, key, { value: value(path.concat(key)), enumerable: true, writable: true, configurable: true }); ws();
          if (src[i] === '}') { i++; return obj; }
          expect(',');
        }
      }
      if (src[i] === '[') {
        let depth = 0;
        do { if (src[i] === '"') { tok(str); continue; } if (src[i] === '[') depth++; if (src[i] === ']') depth--; i++; } while (depth && i < src.length);
      }
      else tok(/"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/y);
      const raw = src.slice(start, i), leaf = { path, start, end: i, raw, value: JSON.parse(raw) };
      found.push(leaf); return leaf.value;
    }
    const root = value([]); ws(); if (i !== src.length) throw new Error('trailing text at ' + i);
    return { root, leaves: found, src };
  }

  function num(n, raw) { const s = String(n); return raw.includes('.') && !/[.e]/.test(s) ? s + '.0' : s; }
  function format(v, raw) {
    if (typeof v === 'number') return num(v, raw);
    if (Array.isArray(v)) return '[' + v.map(x => typeof x === 'number' ? num(x, raw) : JSON.stringify(x)).join(', ') + ']';
    return JSON.stringify(v);
  }

  /** `doc.src` with each leaf whose value changed re-written in place; untouched leaves keep their raw bytes. */
  function exportText(doc) {
    let out = '', at = 0;
    for (const l of [...doc.leaves].sort((a, b) => a.start - b.start)) {
      const same = JSON.stringify(l.value) === JSON.stringify(JSON.parse(l.raw));
      out += doc.src.slice(at, l.start) + (same ? l.raw : format(l.value, l.raw));
      at = l.end;
    }
    return out + doc.src.slice(at);
  }

  const isHex = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
  /** A leaf's shape: hex, string, number, boolean, null, or an array of those shapes. */
  function shape(v) {
    if (Array.isArray(v)) return '[' + v.map(shape).join(',') + ']';
    if (v === null) return 'null';
    if (isHex(v)) return 'hex';
    // `1e999` parses to Infinity, which no JSON file can hold, so it fits no leaf.
    if (typeof v === 'number' && !Number.isFinite(v)) return 'a number past JSON';
    return typeof v;
  }

  /**
   * `exported` laid onto `current`: every leaf of `current` whose exported value differs is re-written
   * in place. Refused whole, `text` equal to `current`, when `exported` is not JSON, adds or drops a
   * leaf, or gives a leaf another shape. `changed` and `refused` are dotted leaf paths or reasons.
   */
  function applyExport(current, exported) {
    const doc = leaves(current);
    // Anything the export makes throw, a stack overflow on deep nesting among them, is a refusal.
    try { return lay(current, doc, leaves(exported)); } catch (e) { return { text: current, changed: [], refused: ['export: ' + e.message] }; }
  }

  function lay(current, doc, next) {
    const key = l => JSON.stringify(l.path), name = l => l.path.join('.');
    const theirs = new Map(next.leaves.map(l => [key(l), l]));
    const refused = [], changed = [];
    for (const l of doc.leaves) {
      const t = theirs.get(key(l));
      theirs.delete(key(l));
      if (!t) refused.push(name(l) + ': missing from the export');
      else if (shape(t.value) !== shape(l.value)) refused.push(`${name(l)}: ${shape(t.value)} where ${shape(l.value)} stood`);
      else if (JSON.stringify(t.value) !== JSON.stringify(l.value)) { l.value = t.value; changed.push(name(l)); }
    }
    for (const t of theirs.values()) refused.push(name(t) + ': not a key of the token file');
    if (refused.length) return { text: current, changed: [], refused };
    return { text: exportText(doc), changed, refused };
  }

  /** WCAG 2.x relative luminance of `#rrggbb`. */
  function luminance(hex) {
    if (!isHex(hex)) throw new TypeError(`${JSON.stringify(hex)} is not a #rrggbb colour`);
    const [red, green, blue] = [1, 3, 5].map(at => {
      const c = parseInt(hex.slice(at, at + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  }

  /** The WCAG 2.x contrast ratio of two `#rrggbb` colours, either order, to 2 decimals (AA text needs 4.5). */
  function contrast(fg, bg) {
    const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
    return Math.round((hi + 0.05) / (lo + 0.05) * 100) / 100;
  }

  g.tokens = { leaves, exportText, applyExport, contrast };
})(globalThis);
