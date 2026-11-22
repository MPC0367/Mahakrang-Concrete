// Mahakrang website texts: the shared rules (22 November 2026, for SPINE's Website system).
//
// One file, used by the marker (cms/extract.mjs), the publication build on GitHub (cms/build.mjs) and the tests, so a
// text is read from a page and written back by exactly the same rules.
//
// A "text" is an element whose content is words only: text, line breaks, and the phrase spans the site uses to keep
// Thai and English phrases on one line (cc-ph, nw, pg-nobr). Icons and other wordless elements may sit before or after
// the words and are kept as they are. Each text carries data-cms="<key>" (a photograph's description: data-cms-alt).
// In SPINE a text is plain words; a line break is a new line. When a text is published unchanged, its HTML is left
// exactly as it is; when it changes, the words are written back escaped, and the phrase spans are rebuilt: phrases
// that were already there keep their span, new words get one each (Thai split by the browser's own Thai dictionary).
import { attr, classes, decode, escAttr, escText, parse, walk } from './html.mjs';

export const SCHEMA = 'mahakrang.content/1';
export const CHUNK = new Set(['cc-ph', 'cc-ph--flow', 'nw', 'pg-nobr', 'cc-nw']);
const SKIP = new Set(['script', 'style', 'svg', 'noscript', 'template', 'head', 'select', 'option', 'iframe', 'video', 'audio', 'canvas', 'textarea', 'title']);
// kept by the studio or the site, never edited here: O2's credit and the "sample data" labels
const LOCKED_CLASS = new Set(['o2-credit', 'ftr__credit', 'demotag']);
const LETTER = /\p{L}/u;

const isChunk = (n) => n.name === 'span' && classes(n).length > 0 && classes(n).every((c) => CHUNK.has(c)) && n.children.every((c) => c.text != null);
const textOf = (n) => [...walk(n)].filter((x) => x.text != null && !x.raw).map((x) => decode(x.text)).join('');
const isAtom = (n) => n.name && n.name !== 'br' && n.name !== 'wbr' && !isChunk(n) && !textOf(n).trim();
const isTextish = (n) => n.text != null || n.name === 'br' || n.name === 'wbr' || isChunk(n);
const blank = (n) => n.text != null && !decode(n.text).trim();
export const locked = (el) => SKIP.has(el.name) || classes(el).some((c) => LOCKED_CLASS.has(c)) || attr(el, 'data-cms-skip') !== null;

/** Whether an element holds words only (with wordless elements at its ends): its span of children, or null. */
export function wordsSpan(el) {
  if (!el.name || isAtom(el) || isChunk(el)) return null;
  const k = el.children;
  let first = -1, last = -1;
  for (let i = 0; i < k.length; i++) if (isTextish(k[i]) && !blank(k[i]) && k[i].name !== 'br' && k[i].name !== 'wbr') { if (first < 0) first = i; last = i; }
  if (first < 0) return null;
  for (let i = 0; i < k.length; i++) {
    if (i >= first && i <= last) { if (!isTextish(k[i])) return null; }
    else if (!(isAtom(k[i]) || blank(k[i]))) return null;
  }
  return { first, last };
}

/** The words of a text, as SPINE shows them: whitespace collapsed, line breaks as new lines. */
export function wordsOf(el, span = wordsSpan(el)) {
  let s = '';
  for (let i = span.first; i <= span.last; i++) {
    const c = el.children[i];
    if (c.name === 'br') s += '\x01';
    else if (c.name === 'wbr') continue;
    else s += c.text != null ? decode(c.text) : textOf(c);
  }
  return s.replace(/[ \t\r\n\f]+/g, ' ').replace(/ *\x01 */g, '\n').trim();
}

/** How a text was written, so new words can be written the same way. */
export function styleOf(el, span = wordsSpan(el)) {
  const counts = new Map(), chunks = new Set();
  let loose = false;
  for (let i = span.first; i <= span.last; i++) {
    const c = el.children[i];
    if (isChunk(c)) {
      const cls = classes(c).filter((x) => x !== 'cc-ph--flow').join(' ');
      counts.set(cls, (counts.get(cls) ?? 0) + 1);
      const t = decode(textOf(c)).replace(/[ \t\r\n\f]+/g, ' ').trim();
      if (t) chunks.add(t);
    } else if (c.text != null && decode(c.text).trim()) loose = true;
  }
  const chunkClass = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  return { chunkClass, chunks: [...chunks].sort((a, b) => b.length - a.length), loose };
}

const segmenters = {};
function segments(line, lang) {
  const seg = segmenters[lang] ??= new Intl.Segmenter(lang === 'th' ? 'th' : 'en', { granularity: 'word' });
  return [...seg.segment(line)].map((s) => s.segment);
}

/** The HTML for new words, written the way the text was written. */
export function render(words, style, lang) {
  return String(words).split('\n').map((line) => {
    if (!style.chunkClass) return escText(line);
    const out = [];
    let pos = 0, plain = '';
    const flush = () => { if (plain) out.push(escText(plain)); plain = ''; };
    const segs = segments(line, lang);
    const bounds = [];
    for (let i = 0, p = 0; i < segs.length; i++) { bounds.push([p, segs[i]]); p += segs[i].length; }
    let si = 0;
    while (pos < line.length) {
      while (si < bounds.length && bounds[si][0] + bounds[si][1].length <= pos) si++;
      const known = style.chunks.find((c) => line.startsWith(c, pos));
      if (known) { flush(); out.push(`<span class="${style.chunkClass}">${escText(known)}</span>`); pos += known.length; continue; }
      const seg = si < bounds.length ? line.slice(pos, bounds[si][0] + bounds[si][1].length) : line.slice(pos);
      if (!seg.trim() || style.loose) plain += seg;
      else { flush(); out.push(`<span class="${style.chunkClass}">${escText(seg)}</span>`); }
      pos += seg.length;
    }
    flush();
    return out.join('');
  }).join('<br>');
}

const SIG_DROP = (c) => CHUNK.has(c) || /latin|^is-|^js-|current|active|open/.test(c);
const sigPart = (el) => el.name + classes(el).filter((c) => !SIG_DROP(c)).sort().map((c) => '.' + c).join('');
function signature(el) {
  const parts = [];
  for (let n = el; n && n.name !== 'body' && n.name !== '#root'; n = n.parent) parts.unshift(sigPart(n));
  return parts.join('>');
}
const CHROME = [['header', 'Header'], ['footer', 'Footer'], ['dialog', 'Menu']];
function chromeOf(el) {
  for (let n = el; n && n.name !== 'body'; n = n.parent) {
    if (n.name === 'dialog') return classes(n).includes('searchdlg') ? 'Search' : 'Menu';
    const c = CHROME.find(([t]) => t === n.name);
    if (c) return c[1];
    if (n.name === 'main') return null;
  }
  return 'Page frame';
}
const anchorOf = (el) => { for (let n = el; n && n.name !== 'body'; n = n.parent) { const id = attr(n, 'id'); if (id && /^[A-Za-z][A-Za-z0-9_-]*$/.test(id)) return id; } return null; };

/** Every text, photograph description and search text of a page, in document order. */
export function unitsOf(html) {
  const tree = parse(html);
  const all = [...walk(tree)];
  const htmlEl = all.find((n) => n.name === 'html');
  const lang = attr(htmlEl ?? {}, 'lang') === 'en' ? 'en' : 'th';
  const body = all.find((n) => n.name === 'body');
  const units = [];
  let section = 'Page';
  const visit = (el) => {
    if (el.text != null || locked(el)) return;
    if (/^h[1-3]$/.test(el.name) && !chromeOf(el)) { const t = textOf(el).replace(/\s+/g, ' ').trim(); if (t) section = t.slice(0, 80); }
    if (el.name === 'img') {
      const alt = attr(el, 'alt');
      if (alt && LETTER.test(alt)) units.push({ kind: 'alt', el, words: decode(alt).replace(/\s+/g, ' ').trim(), sig: signature(el) + '@alt', chrome: chromeOf(el), section: chromeOf(el) ?? section, anchor: anchorOf(el), key: attr(el, 'data-cms-alt') });
      return;
    }
    if (el !== body) {
      const span = wordsSpan(el);
      if (span) {
        const words = wordsOf(el, span);
        if (LETTER.test(words)) units.push({ kind: 'text', el, span, words, sig: signature(el), chrome: chromeOf(el), section: chromeOf(el) ?? section, anchor: anchorOf(el), key: attr(el, 'data-cms') });
        return;
      }
    }
    for (const c of el.children) visit(c);
  };
  if (body) visit(body);
  const head = all.filter((n) => n.name && !body?.children.includes(n));
  const title = all.find((n) => n.name === 'title');
  const meta = (k, v) => all.find((n) => n.name === 'meta' && attr(n, k) === v);
  const seo = {
    title: title ? decode(title.children.map((c) => c.text ?? '').join('')).replace(/\s+/g, ' ').trim() : null,
    description: meta('name', 'description') ? decode(attr(meta('name', 'description'), 'content')).trim() : null,
  };
  void head;
  return { lang, units, seo, tree, all };
}

/** Longest common subsequence of two lists of signatures: the pairs [i, j] that line up. */
export function pairUp(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  for (let i = 0, j = 0; i < n && j < m;) {
    if (a[i] === b[j]) { out.push([i, j]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return out;
}

/** Rewrite a page: for every text whose key has new words in this page's language, the new HTML; nothing else moves.
 *  next(key, kind) returns the new words, or undefined to leave the text as it is. Search texts by kind 'title' and
 *  'description' (key seo.<page>.title / .description), given as seoKeys. */
export function applyTo(html, next, seoKeys = null) {
  const { lang, units, all } = unitsOf(html);
  const edits = [];
  for (const u of units) {
    if (!u.key) continue;
    const w = next(u.key, lang);
    if (w == null || w === u.words) continue;
    if (u.kind === 'alt') {
      const a = attrRange(html, u.el, 'alt');
      if (a) edits.push([a[0], a[1], escAttr(w)]);
    } else {
      const first = u.el.children[u.span.first], last = u.el.children[u.span.last];
      const lead = first.text != null ? /^[ \t\r\n\f]*/.exec(first.text)[0] : '';
      const trail = last.text != null ? /[ \t\r\n\f]*$/.exec(last.text)[0] : '';
      edits.push([first.start, last.end, lead + render(w, styleOf(u.el, u.span), lang) + trail]);
    }
  }
  if (seoKeys) {
    const title = all.find((n) => n.name === 'title');
    const t = next(seoKeys.title, lang);
    const oldTitle = title ? decode(title.children.map((c) => c.text ?? '').join('')).replace(/\s+/g, ' ').trim() : null;
    if (title && t != null && t !== oldTitle) {
      edits.push([title.openEnd, title.closeStart, escText(t)]);
      for (const n of all) if (n.name === 'meta' && ['og:title', 'twitter:title'].includes(attr(n, 'property') ?? attr(n, 'name') ?? '') && decode(attr(n, 'content') ?? '').trim() === oldTitle) { const a = attrRange(html, n, 'content'); if (a) edits.push([a[0], a[1], escAttr(t)]); }
    }
    const desc = all.find((n) => n.name === 'meta' && attr(n, 'name') === 'description');
    const d = next(seoKeys.description, lang);
    const oldDesc = desc ? decode(attr(desc, 'content') ?? '').trim() : null;
    if (desc && d != null && d !== oldDesc) {
      for (const n of all) if (n.name === 'meta' && (n === desc || (['og:description', 'twitter:description'].includes(attr(n, 'property') ?? attr(n, 'name') ?? '') && decode(attr(n, 'content') ?? '').trim() === oldDesc))) { const a = attrRange(html, n, 'content'); if (a) edits.push([a[0], a[1], escAttr(d)]); }
    }
  }
  edits.sort((x, y) => y[0] - x[0]);
  let out = html;
  for (const [a, b, s] of edits) out = out.slice(0, a) + s + out.slice(b);
  return { html: out, changed: edits.length };
}

/** Where an attribute's value sits in the page (inside its quotes). */
export function attrRange(html, el, name) {
  const open = html.slice(el.start, el.openEnd);
  const re = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i');
  const m = re.exec(open);
  if (!m) return null;
  const at = el.start + m.index + m[0].indexOf(m[1]) + 1;
  return [at, at + (m[2] ?? m[3]).length];
}

/** The page's address from its file: index.html is /, about/index.html is /about/. */
export const pathOf = (file) => '/' + file.replace(/\\/g, '/').replace(/(^|\/)index\.html$/, '$1');
