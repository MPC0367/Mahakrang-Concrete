// A small HTML reader for the static pages: a tree with exact source offsets, so a page can be changed in place
// without touching anything else. No dependencies (it runs on GitHub Actions as it is).
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea', 'title']);
const TAG = /<!--[\s\S]*?-->|<!doctype[^>]*>|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>"']+))?)*)\s*(\/?)>/gi;
const ATTR = /\s+([^\s=>\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;

export function parseAttrs(src) {
  const out = [];
  let m;
  ATTR.lastIndex = 0;
  while ((m = ATTR.exec(src))) out.push([m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? null]);
  return out;
}

/** Parse a page into elements { name, attrs, start, openEnd, closeStart, end, children[], parent } and text nodes
 *  { text, start, end }. Offsets are into the original string. Unclosed elements close at their parent's end. */
export function parse(html) {
  const root = { name: '#root', attrs: [], start: 0, openEnd: 0, closeStart: html.length, end: html.length, children: [], parent: null };
  let cur = root, last = 0, m;
  const addText = (a, b) => { if (b > a) cur.children.push({ text: html.slice(a, b), start: a, end: b, parent: cur }); };
  TAG.lastIndex = 0;
  while ((m = TAG.exec(html))) {
    if (m[0].startsWith('<!')) { addText(last, m.index); last = m.index + m[0].length; continue; }
    const close = m[1] === '/', name = m[2].toLowerCase();
    addText(last, m.index);
    last = m.index + m[0].length;
    if (!close) {
      const el = { name, attrs: parseAttrs(m[3] || ''), start: m.index, openEnd: last, closeStart: last, end: last, children: [], parent: cur };
      cur.children.push(el);
      if (VOID.has(name) || m[4] === '/') continue;
      if (RAW.has(name)) {
        const endRe = new RegExp(`</${name}\\s*>`, 'ig');
        endRe.lastIndex = last;
        const e = endRe.exec(html);
        const stop = e ? e.index : html.length;
        if (stop > last) el.children.push({ text: html.slice(last, stop), start: last, end: stop, parent: el, raw: true });
        el.closeStart = stop;
        el.end = e ? e.index + e[0].length : html.length;
        last = el.end;
        TAG.lastIndex = last;
        continue;
      }
      cur = el;
    } else {
      // close the nearest open element with this name (tolerant of stray closers)
      let n = cur;
      while (n && n !== root && n.name !== name) n = n.parent;
      if (!n || n === root) continue;
      for (let x = cur; x !== n; x = x.parent) { x.closeStart = m.index; x.end = m.index; }
      n.closeStart = m.index;
      n.end = last;
      cur = n.parent;
    }
  }
  addText(last, html.length);
  for (let x = cur; x && x !== root; x = x.parent) { x.closeStart = html.length; x.end = html.length; }
  return root;
}

export const attr = (el, k) => { const a = el.attrs?.find(([n]) => n === k); return a ? a[1] ?? '' : null; };
export const classes = (el) => (attr(el, 'class') || '').split(/\s+/).filter(Boolean);
export function* walk(node) { yield node; for (const c of node.children ?? []) yield* walk(c); }
export const decode = (s) => String(s)
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&amp;/g, '&');
export const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
