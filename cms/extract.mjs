// Marks every text of the website for SPINE and writes what SPINE reads (22 November 2026).
//
//   node cms/extract.mjs            what it would do (nothing written)
//   node cms/extract.mjs --write    gives every new text its key (data-cms / data-cms-alt) and writes
//                                   cms/registry.json, content/r<N>.json and content/manifest.json
//
// Safe to run again at any time (the "Website texts" workflow does after every push to main): a text that has a key
// keeps it, a new text gets the next free key of its page, and a new revision is written only when a word changed.
// The words always come from the pages themselves, so a change made by hand to a page is what SPINE shows next.
// Thai and English pages are paired by their structure: a text found on both carries one key with both languages; a
// text found in one language only (the Latin labels over Thai words, say) carries that language alone.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA, pairUp, pathOf, unitsOf } from './units.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const WRITE = process.argv.includes('--write');
const NOT_PAGES = new Set(['.git', '.github', 'node_modules', 'media', 'img', 'fonts', 'cms', 'content', 'assets', 'js']);

export function pageFiles(root = ROOT) {
  const out = [];
  (function rec(dir) {
    for (const f of readdirSync(dir).sort()) {
      const p = path.join(dir, f);
      if (statSync(p).isDirectory()) { if (!NOT_PAGES.has(f)) rec(p); }
      else if (f.endsWith('.html') && !/http-equiv="refresh"/i.test(readFileSync(p, 'utf8').slice(0, 2000))) out.push(path.relative(root, p).replace(/\\/g, '/'));
    }
  })(root);
  return out;
}

const pageId = (thFile) => (pathOf(thFile).replace(/^\/|\/$/g, '').replace(/\.html$/, '').replace(/\//g, '-') || 'home').replace(/[^A-Za-z0-9-]/g, '-');
// SPINE's tabs, in the order of the site's own menu
const TABS = [
  ['Home', (p) => p === '/' || p === '/home/'],
  ['Concrete', (p) => /^\/(concrete|calculator|spec|products)\b/.test(p) && !p.startsWith('/concrete/lab')],
  ['Lab', (p) => /^\/(lab|concrete\/lab)\b/.test(p)],
  ['Construction', (p) => p.startsWith('/construction')],
  ['Stories', (p) => /^\/(stories|news|videos)\b/.test(p)],
  ['Lifestyle', (p) => /^\/(lifestyle|shop|khonkrang|community|rankings)\b/.test(p)],
  ['Company', (p) => /^\/(about|company|plant|quality|process|projects|work)\b/.test(p)],
  ['Contact & orders', (p) => /^\/(contact|order|orders|track|tracking|checkout)\b/.test(p)],
  ['Members', (p) => /^\/(login|member|members|portal|register)\b/.test(p)],
];
const tabOf = (p) => TABS.find(([, t]) => t(p))?.[0] ?? 'Other pages';
const limit = (...w) => Math.min(4000, Math.max(80, Math.ceil(Math.max(...w.map((x) => [...(x ?? '')].length)) * 2.5) + 40));

export function extract(root = ROOT) {
  const files = pageFiles(root);
  const th = files.filter((f) => !f.startsWith('en/'));
  const pages = th.map((f) => ({ id: pageId(f), th: f, en: files.includes('en/' + f) ? 'en/' + f : null }));
  for (const f of files.filter((x) => x.startsWith('en/') && !files.includes(x.slice(3)))) pages.push({ id: pageId(f.slice(3)) + '-en', th: null, en: f });
  const html = Object.fromEntries(files.map((f) => [f, readFileSync(path.join(root, f), 'utf8')]));
  const parsed = Object.fromEntries(files.map((f) => [f, unitsOf(html[f])]));

  const fields = new Map(), content = {};
  const marks = Object.fromEntries(files.map((f) => [f, []]));      // [element, attribute name, key]
  const used = new Set();
  for (const f of files) for (const u of parsed[f].units) if (u.key) used.add(u.key);
  const counters = {};
  const nextKey = (prefix) => { let n = counters[prefix] ?? 0, k; do { k = `${prefix}.${String(++n).padStart(3, '0')}`; } while (used.has(k)); counters[prefix] = n; used.add(k); return k; };
  const put = (key, lang, words, meta) => {
    const f = fields.get(key) ?? { key, kind: 'text', langs: [], ...meta };
    if (!f.langs.includes(lang)) f.langs.push(lang);
    fields.set(key, f);
    const c = (content[key] ??= { en: '', th: '' });
    if (!c[lang]) c[lang] = words;
  };
  const mark = (file, u, key) => { if (!u.key) { marks[file].push([u.el, u.kind === 'alt' ? 'data-cms-alt' : 'data-cms', key]); u.key = key; } };

  // 1. the header, menu, search and footer, shared by every page: keyed once, from the home pages
  const homeTh = parsed['index.html'], homeEn = parsed['en/index.html'];
  const sharedOf = { th: new Map(), en: new Map() };
  const id = (u) => u.sig + '\u0000' + u.words;
  if (homeTh && homeEn) {
    const a = homeTh.units.filter((u) => u.chrome), b = homeEn.units.filter((u) => u.chrome);
    const pairs = pairUp(a.map((u) => u.sig), b.map((u) => u.sig));
    const pa = new Map(pairs.map(([i, j]) => [i, j])), pb = new Set(pairs.map(([, j]) => j));
    a.forEach((u, i) => {
      const v = pa.has(i) ? b[pa.get(i)] : null;
      const key = u.key ?? v?.key ?? nextKey('s');
      sharedOf.th.set(id(u), key); if (v) sharedOf.en.set(id(v), key);
    });
    b.forEach((v, j) => { if (!pb.has(j)) sharedOf.en.set(id(v), v.key ?? nextKey('s')); });
  }

  // 2. every page pair
  for (const p of pages) {
    const path_ = pathOf(p.th ?? p.en.slice(3));
    const tab = tabOf(path_);
    const where = path_;
    const meta = (u, shared) => shared
      ? { tab: 'Shared', section: u.section, type: u.kind === 'alt' ? 'alt' : 'text', where: 'Every page', link: '/' }
      : { tab, section: u.section, type: u.kind === 'alt' ? 'alt' : 'text', where, link: path_ + (u.anchor ? '#' + u.anchor : '') };
    const sides = [['th', p.th], ['en', p.en]].filter(([, f]) => f);
    const own = {};
    for (const [lang, f] of sides) {
      own[lang] = [];
      for (const u of parsed[f].units) {
        const s = u.chrome ? sharedOf[lang].get(id(u)) : null;
        if (s && (!u.key || u.key === s)) { mark(f, u, s); put(s, lang, u.words, meta(u, true)); }
        else own[lang].push(u);
      }
    }
    const a = own.th ?? [], b = own.en ?? [];
    // texts that already carry keys keep them; the rest are paired by structure
    const fa = a.filter((u) => !u.key), fb = b.filter((u) => !u.key);
    const pairs = pairUp(fa.map((u) => u.sig), fb.map((u) => u.sig));
    const pa = new Map(pairs.map(([i, j]) => [i, j]));
    fa.forEach((u, i) => { const k = nextKey(p.id); mark(p.th, u, k); if (pa.has(i)) mark(p.en, fb[pa.get(i)], k); });
    fb.forEach((u) => { if (!u.key) mark(p.en, u, nextKey(p.id)); });
    for (const [lang, list] of [['th', a], ['en', b]]) for (const u of list) put(u.key, lang, u.words, meta(u, false));
    // search texts of the page
    for (const t of ['title', 'description']) {
      const key = `seo.${p.id}.${t}`;
      for (const [lang, f] of sides) {
        const w = parsed[f].seo[t];
        if (w) put(key, lang, w, { kind: 'seo', tab: 'SEO', section: path_, type: t, where, link: path_, label: t === 'title' ? 'Title in search results' : 'Description in search results' });
      }
    }
  }
  for (const f of fields.values()) {
    const c = content[f.key];
    f.langs.sort();
    f.maxLen = f.type === 'title' ? 140 : f.type === 'description' ? 320 : limit(c.th, c.en);
    f.required = true;
  }
  return { files, pages, html, marks, fields: [...fields.values()], content };
}

// SPINE's preview (js/spine-preview.js) loads only when the page is opened as ?spine-preview=1 inside SPINE
export const LOADER = `<script data-spine-loader>if(/[?&]spine-preview=1(&|$)/.test(location.search))document.write('<script src="/js/spine-preview.js"><\\/script>')</script>`;
function withLoader(src) {
  if (src.includes('data-spine-loader')) return src;
  const m = /<meta charset="utf-8">\n?/i.exec(src) ?? /<head[^>]*>\n?/i.exec(src);
  return m ? src.slice(0, m.index + m[0].length) + LOADER + '\n' + src.slice(m.index + m[0].length) : src;
}

function insertMarks(src, list) {
  let out = src;
  for (const [el, name, key] of [...list].sort((x, y) => y[0].start - x[0].start)) {
    const at = el.start + 1 + el.name.length;
    out = out.slice(0, at) + ` ${name}="${key}"` + out.slice(at);
  }
  return out;
}

const canonical = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((y) => [y, x[y]])) : x));
export const sha = (s) => createHash('sha256').update(s).digest('hex');

/** Write the marks and, when a word or a field changed, a new revision. Returns what was done. */
export function writeAll(root, r, { publication = null } = {}) {
  let marked = 0;
  for (const f of r.files) {
    const out = withLoader(insertMarks(r.html[f], r.marks[f]));
    if (out !== r.html[f]) { writeFileSync(path.join(root, f), out); marked += r.marks[f].length; }
  }
  mkdirSync(path.join(root, 'content'), { recursive: true });
  const registry = { schema: SCHEMA, pages: r.pages, fields: r.fields };
  const regText = JSON.stringify(registry) + '\n';
  const regPath = path.join(root, 'cms', 'registry.json');
  const regChanged = !existsSync(regPath) || readFileSync(regPath, 'utf8') !== regText;
  if (regChanged) writeFileSync(regPath, regText);
  const manPath = path.join(root, 'content', 'manifest.json');
  const man = existsSync(manPath) ? JSON.parse(readFileSync(manPath, 'utf8')) : { revision: 0, recent: [] };
  const prev = man.url ? JSON.parse(readFileSync(path.join(root, man.url), 'utf8')) : null;
  const hash = sha(canonical(r.content));
  if (prev && prev.contentHash === hash && !publication) return { marked, regChanged, revision: man.revision, newRevision: false };
  const revision = (man.revision || 0) + 1, at = new Date().toISOString();
  const snap = { schema: SCHEMA, revision, publishedAt: at, contentHash: hash, publication, content: r.content, facts: {} };
  writeFileSync(path.join(root, 'content', `r${revision}.json`), JSON.stringify(snap) + '\n');
  const recent = [...(man.recent ?? []), ...(publication ? [{ revision, nonce: publication.nonce, at, keys: publication.keys }] : [])].slice(-30);
  writeFileSync(manPath, JSON.stringify({ schema: SCHEMA, revision, url: `content/r${revision}.json`, publishedAt: at, contentHash: hash, recent }, null, 1) + '\n');
  return { marked, regChanged, revision, newRevision: true };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = extract();
  const n = Object.values(r.marks).reduce((x, l) => x + l.length, 0);
  const both = r.fields.filter((f) => f.langs.length === 2).length;
  console.log(`${r.pages.length} pages, ${r.fields.length} texts (${both} in Thai and English, ${r.fields.length - both} in one language), ${n} new keys`);
  if (WRITE) console.log(writeAll(ROOT, r));
}
