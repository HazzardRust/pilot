/**
 * A few lines of DOM for a sandbox test of a confirm in place (handoff-failed-confirm L1, L4): `confirm.mjs`,
 * `reply.mjs`, `inplace.mjs` and `escape.mjs` installed in `page.mjs`'s order over the markup `render.mjs` really draws, read
 * into an element tree just big enough for the three scripts to read and write. One copy, shared by every
 * slice's sandbox test of the seam.
 */

import { install as installConfirm } from '../ui/js/confirm.mjs';
import { install as installEscape } from '../ui/js/escape.mjs';
import { install as installInPlace } from '../ui/js/inplace.mjs';
import { install as installReply } from '../ui/js/reply.mjs';
import { aSandbox, freePort } from '../testUtils.mjs';

// A port of this file's own, never one a scratch deck might hold.
const PORT = await freePort();

/** The reply form an item's card or page draws, as markup. */
export const formIn = (html) => html.match(/<form method="post" action="\/reply"[^>]*>.*?<\/form>/s)?.[0] ?? '';

// --- a few lines of DOM: enough of an element tree for the three scripts to read and write -----------------

const VOID = new Set(['input', 'br', 'img', 'hr']);

/** One compound selector (`form.confirm`, `[data-confirm]`, `.step.sure`) against one element. */
const matchesOne = (el, compound) => {
  const [, tag, rest] = compound.match(/^([a-z]*)(.*)$/);
  if (tag && el.tag !== tag) return false;
  for (const [, cls, attr, value] of rest.matchAll(/\.([\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]/g)) {
    if (cls && !el.classList.contains(cls)) return false;
    if (attr && (attr === 'hidden' ? !el.hidden : !el.hasAttribute(attr))) return false;
    if (attr && value !== undefined && el.getAttribute(attr) !== value) return false;
  }
  return true;
};

/** A selector of compounds joined by spaces, matched right to left through the ancestors. */
const matchesChain = (el, parts) => {
  if (!matchesOne(el, parts.at(-1))) return false;
  if (parts.length === 1) return true;
  for (let up = el.parent; up; up = up.parent) if (matchesChain(up, parts.slice(0, -1))) return true;
  return false;
};

class Element {
  constructor(tag, attrs, document) {
    this.tag = tag;
    this.attrs = attrs;
    this.document = document;
    this.children = [];
    this.parent = null;
    this.hidden = 'hidden' in attrs;
    this.disabled = 'disabled' in attrs;
    this.value = attrs.value ?? '';
    const own = this;
    this.classList = {
      contains: (name) => (own.attrs.class ?? '').split(/\s+/).includes(name),
      add: (name) => { if (!own.classList.contains(name)) own.attrs.class = `${own.attrs.class ?? ''} ${name}`.trim(); },
      remove: (name) => { own.attrs.class = (own.attrs.class ?? '').split(/\s+/).filter((one) => one !== name).join(' '); },
    };
  }
  get name() { return this.attrs.name ?? ''; }
  get tagName() { return this.tag.toUpperCase(); }
  get href() { return this.attrs.href ?? ''; }
  get isConnected() { let top = this; while (top.parent) top = top.parent; return top === this.document.root; }
  getAttribute(name) { return Object.hasOwn(this.attrs, name) ? this.attrs[name] : null; }
  hasAttribute(name) { return Object.hasOwn(this.attrs, name); }
  toggleAttribute(name, on) { if (on) this.attrs[name] = ''; else delete this.attrs[name]; return on; }
  matches(selector) { return selector.split(',').some((one) => matchesChain(this, one.trim().split(/\s+/))); }
  closest(selector) { for (let el = this; el; el = el.parent) if (el.matches && el.matches(selector)) return el; return null; }
  descendants() { return this.children.flatMap((child) => [child, ...child.descendants()]); }
  querySelectorAll(selector) {
    if (selector === ':scope > button') return this.children.filter((child) => child.tag === 'button');
    return this.descendants().filter((el) => el.matches(selector));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  appendChild(child) { child.parent = this; this.children.push(child); }
  focus() { this.document.activeElement = this; }
  blur() { if (this.document.activeElement === this) this.document.activeElement = null; }
  submit() { this.document.navigations.push(this.getAttribute('action')); }
}

/** A document holding `html`, with listeners run capture first and then bubbling, as a browser's are. */
export function aDocument(html) {
  const document = { listeners: [], navigations: [], activeElement: null };
  document.root = new Element('#root', {}, document);
  let at = document.root;
  for (const [, close, tag, attrs] of html.matchAll(/<(\/?)([a-z0-9]+)([^>]*)>/g)) {
    if (close) { at = at.parent; continue; }
    const el = new Element(tag, Object.fromEntries([...attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(([, name, value]) => [name, value ?? ''])), document);
    at.appendChild(el);
    if (!VOID.has(tag) && !attrs.endsWith('/')) at = el;
  }
  document.addEventListener = (type, run, capture = false) => document.listeners.push({ type, run, capture: Boolean(capture) });
  document.createElement = (tag) => new Element(tag, {}, document);
  document.dispatch = (event) => {
    event.defaultPrevented = false;
    event.preventDefault = () => { event.defaultPrevented = true; };
    for (const phase of [true, false]) {
      for (const { type, run, capture } of document.listeners) if (type === event.type && capture === phase) run(event);
    }
    return event;
  };
  /** A press on a submit button: its click, then its form's submit, posted for real unless something prevented it. */
  document.press = (button) => {
    document.dispatch({ type: 'click', target: button });
    // A button's `form` attribute names the form it posts, as Close's do (`renderCloseConfirm`).
    const owner = button.getAttribute('form');
    const form = owner ? document.root.descendants().find((el) => el.getAttribute('id') === owner) : button.closest('form');
    const submit = document.dispatch({ type: 'submit', target: form, submitter: button });
    if (!submit.defaultPrevented) form.submit();
  };
  document.click = (target) => document.dispatch({ type: 'click', target });
  document.key = (key) => document.dispatch({ type: 'keydown', key });
  document.referrer = '';
  document.querySelectorAll = (selector) => document.root.querySelectorAll(selector);
  return document;
}

/**
 * The scripts installed over `html` in `page.mjs`'s order: `reply.mjs`, `inplace.mjs`, `escape.mjs`, then
 * `confirm.mjs`. `fetch` answers the presses (by default never); `settle` stands in for `live.mjs`'s, which
 * both are handed, and records each call in `settled`.
 */
export function aPage(html, fetch = () => new Promise(() => {}), settle = null) {
  const document = aDocument(html);
  const fetched = [];
  const settled = [];
  settle ??= () => settled.push(true);
  const env = aSandbox({
    document,
    location: { href: `http://127.0.0.1:${PORT}/`, origin: `http://127.0.0.1:${PORT}`, assign: (to) => document.navigations.push(to) },
    history: { length: 1, back: () => document.navigations.push('back'), pushState() {} },
    fetch: (target, options) => {
      fetched.push({ target, body: Object.fromEntries(new URLSearchParams(options.body)) });
      return fetch(target, options);
    },
  });
  installReply(env, settle);
  installInPlace(env, () => {}, settle);
  installEscape(env);
  installConfirm(env);
  const trigger = document.root.querySelector('[data-confirm]');
  const row = trigger?.closest('[data-confirm-row]');
  return { document, fetched, settled, trigger, row, sure: row?.querySelector('.step.sure'), confirm: row?.querySelector('.step.sure [type="submit"]') };
}
