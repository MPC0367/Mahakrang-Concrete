// Mahakrang website photographs for SPINE's Website > Pictures (23 November 2026).
//
// One file, used by the marker (cms/extract.mjs), the publication build (cms/build.mjs) and the tests, so a photograph is
// read from the pages and written back by exactly the same rules.
//
// A photograph is a family of files, one per width the pages use:
//   media/m_<16 hex>/w<width>.<jpg|webp>        (a folder per photograph)
//   media/<folder>/<name>-w<width>.<jpg|webp>   (several photographs in one folder, as media/micropile/)
// Its key is pic.<id> (m-<hex>, or <folder>-<name>) and its value says where its files are: the original family
// (media/m_<hex>, media/<folder>/<name>) or a picture uploaded in SPINE, content/media/<id>.<16 hex>, whose files are
// content/media/<id>.<16 hex>-w<width>.jpg (one JPEG for each width). A photograph shows wherever the pages name it: an
// <img>, a <picture>'s <source>, a preload <link>, the link a viewer opens, a background in a style, a script's data. A
// replaced photograph's every mention points at the new files, and keeps the format it named: a mention of w960.webp
// becomes <picture>-w960.jpg?f=webp (GitHub Pages serves the file whatever follows the ?), so going back to the original
// gives every mention back exactly. A <source> or <link> that said image/webp says image/jpeg, and keeps the type it had
// in data-pic-type. A film's poster stays as it is, and so does a photograph the pages do not show one way everywhere.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const EXT = 'jpe?g|webp|png|avif';
// a file name ends here: not followed by more of a name (a dot only ends it when no extension follows, as in a sentence)
const END = '(?![A-Za-z0-9_-]|\\.[A-Za-z0-9])';
// a family file as the pages name it; the character before it is not part of a longer name
const FAMILY = new RegExp(`(?<![A-Za-z0-9_.-])(\\/?)media\\/(?:(m_[0-9a-f]{16})\\/|([a-z0-9][a-z0-9_-]{0,60})\\/([a-z0-9][a-z0-9-]{0,80}?)-)(w\\d{2,5})\\.(${EXT})${END}`, 'g');
// an uploaded picture's file, with the format the mention had before (?f=webp; none: a JPEG)
const FMT = '(?:\\?f=(jpeg|webp|png|avif))?';
const UPLOADED = new RegExp(`(?<![A-Za-z0-9_.-])(\\/?)content\\/media\\/([a-z0-9][a-z0-9-]{0,100})\\.([a-f0-9]{16})-(w\\d{2,5})\\.jpg${FMT}${END}`, 'g');
const TAG = /<([a-zA-Z][a-zA-Z0-9-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/g;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');

const idOf = (hexFolder, folder, name) => (hexFolder ? 'm-' + hexFolder.slice(2) : folder.replace(/_/g, '-') + '-' + name);
const originalOf = (hexFolder, folder, name) => (hexFolder ? 'media/' + hexFolder : 'media/' + folder + '/' + name);
/** The file of one width of a value (an original family or an uploaded picture). */
export function fileOf(value, s, ext) {
  if (/^media\/m_[0-9a-f]{16}$/.test(value)) return `${value}/${s}.${ext}`;
  if (/^content\/media\//.test(value)) return `${value}-${s}.jpg`;
  return `${value}-${s}.${ext}`;
}
/** Whether a value may be this photograph's: its own original, or a picture uploaded for it. */
export function pictureOk(field, v) {
  const id = field.key.slice(4);
  return v === field.value || new RegExp(`^content/media/${esc(id)}\\.[a-f0-9]{16}$`).test(v);
}
/** The widths a new picture must have (one JPEG each), with their pixel sizes. */
export function sizesOf(field) {
  const m = new Map();
  for (const v of field.variants ?? []) if (!m.has(v.s) || v.ext === 'jpg') m.set(v.s, { s: v.s, w: v.w, h: v.h });
  return [...m.values()];
}

/** Width and height from the head of a JPEG, PNG or WebP file, or null. */
export function imageSize(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    for (let i = 2; i + 9 < buf.length;) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7) || m === 0xff) { i += m === 0xff ? 1 : 2; continue; }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
      i += 2 + buf.readUInt16BE(i + 2);
    }
    return null;
  }
  if (buf.toString('ascii', 1, 4) === 'PNG') return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const c = buf.toString('ascii', 12, 16);
    if (c === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
    if (c === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (c === 'VP8L') { const b = buf.readUInt32LE(21); return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 }; }
  }
  return null;
}
/** Width and height of one of the website's files: from the disk, else from git (a checkout without the photographs). */
function dimsOf(root, file) {
  try {
    const at = path.join(root, file);
    if (existsSync(at)) return imageSize(readFileSync(at));
    return imageSize(execFileSync('git', ['-C', root, 'show', `HEAD:${file}`], { maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch { return null; }
}
const attrOf = (tag, name) => { const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag); return m ? (m[2] ?? m[3]) : null; };
const decode = (s) => String(s).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Every photograph the pages name, in page order. meta(file) gives the page's tab, where, link and paths. prev: the
 *  last registry's photographs (they keep a photograph's sizes when its files are not checked out, and its original once
 *  every page shows an uploaded picture). Returns the registry's picture fields and each one's value now. */
export function scanPictures(root, files, html, meta, prev = new Map()) {
  const fams = new Map();
  const fam = (id, init) => { let f = fams.get(id); if (!f) { f = { id, original: null, originals: new Set(), sizes: new Map(), uploaded: new Map(), tags: 0, poster: false, file: null, alt: { en: null, th: null } }; fams.set(id, f); } if (init) Object.assign(f, init); return f; };
  for (const file of files) {
    const h = html[file], lang = file.startsWith('en/') ? 'en' : 'th';
    for (const m of h.matchAll(FAMILY)) {
      const f = fam(idOf(m[2], m[3], m[4]));
      f.original ??= originalOf(m[2], m[3], m[4]);
      f.originals.add(originalOf(m[2], m[3], m[4]));
      if (!f.sizes.has(m[5])) f.sizes.set(m[5], new Set());
      f.sizes.get(m[5]).add(m[6].toLowerCase() === 'jpeg' ? 'jpg' : m[6].toLowerCase());
      if (!f.file || (lang === 'th' && f.file.startsWith('en/'))) f.file = file;    // its first page, Thai first
    }
    for (const m of h.matchAll(UPLOADED)) {
      const f = fam(m[2]);
      const v = `content/media/${m[2]}.${m[3]}`;
      f.uploaded.set(v, (f.uploaded.get(v) ?? 0) + 1);
      if (!f.file || (lang === 'th' && f.file.startsWith('en/'))) f.file = file;
    }
    for (const t of h.matchAll(TAG)) {
      const tag = t[0], name = t[1].toLowerCase();
      const ids = new Set([...tag.matchAll(FAMILY)].map((m) => idOf(m[2], m[3], m[4])).concat([...tag.matchAll(UPLOADED)].map((m) => m[2])));
      for (const id of ids) {
        const f = fam(id);
        f.tags++;
        if (name === 'video') f.poster = true;
        if (name === 'img' && !f.alt[lang]) { const a = attrOf(tag, 'alt'); if (a && a.trim()) f.alt[lang] = decode(a).trim(); }
      }
    }
  }
  const fields = [], facts = {};
  for (const f of fams.values()) {
    const key = 'pic.' + f.id, before = prev.get(key);
    const original = f.original ?? before?.value;
    if (!original) continue;                                              // an uploaded picture of no known photograph
    let variants;
    if (f.sizes.size) {
      variants = [];
      for (const [s, exts] of f.sizes) for (const ext of [...exts].sort()) {
        const file = fileOf(original, s, ext), at = path.join(root, file);
        const was = before?.variants?.find((x) => x.s === s && x.ext === ext);
        // a checkout without the photographs (the workflow's) keeps the sizes measured before; a new one is read from git
        const dims = existsSync(at) || !(was?.w && was?.h) ? dimsOf(root, file) : null;
        variants.push({ s, ext, w: dims?.w ?? was?.w ?? 0, h: dims?.h ?? was?.h ?? 0, file });
      }
      variants.sort((a, b) => +a.s.slice(1) - +b.s.slice(1) || a.ext.localeCompare(b.ext));
    } else variants = before?.variants ?? [];
    // one width, one size: the JPEG and the WebP of a width must agree
    const bySize = new Map();
    let even = variants.length > 0;
    const known = variants.every((v) => v.w > 0 && v.h > 0);
    for (const v of variants) { const was = bySize.get(v.s); if (was && (was.w !== v.w || was.h !== v.h)) even = false; bySize.set(v.s, v); }
    const page = f.file ? meta(f.file) : before ? { tab: before.tab, where: before.where, link: before.link, paths: before.paths } : null;
    if (!page) continue;
    const words = f.alt.en || f.alt.th;
    // the pages name it one way everywhere: its original, or one uploaded picture (never both, never two)
    const mixed = f.uploaded.size > 1 || (f.uploaded.size > 0 && f.sizes.size > 0);
    const protect = f.poster ? 'A film’s first frame: it changes together with the film, so O2 changes it'
      : f.originals.size > 1 ? 'Two photographs have the same name here, so O2 changes them'
      : mixed ? 'The pages do not all show the same picture for it, so O2 changes it'
      : !known ? 'Its sizes are not known yet, so O2 changes it'
      : !even ? 'Its files are not all the same shape, so O2 changes it' : '';
    fields.push({
      key, kind: 'fact', type: 'picture', langs: [], tab: page.tab, section: 'Photographs', group: page.tab,
      label: words ? 'Photo: ' + words : before?.label ?? 'Photo on ' + page.where, where: page.where, link: page.link, paths: page.paths,
      value: original, variants, editable: !protect, protectReason: protect, places: f.tags || before?.places || 0, required: true,
    });
    // what the pages show now: the uploaded picture most of them name, else the original
    facts[key] = [...f.uploaded].sort((a, b) => b[1] - a[1])[0]?.[0] ?? original;
  }
  return { fields, facts };
}

/** Each <img> and <source> that shows a photograph carries data-pic="pic.<id>" (SPINE's preview finds it by that). */
export function withPicMarks(html) {
  return html.replace(TAG, (tag, nm) => {
    const name = nm.toLowerCase();
    if (name !== 'img' && name !== 'source') return tag;
    const m = new RegExp(FAMILY.source).exec(tag) ?? null, u = m ? null : new RegExp(UPLOADED.source).exec(tag);
    const id = m ? idOf(m[2], m[3], m[4]) : u ? u[2] : null;
    const had = attrOf(tag, 'data-pic');
    if (!id) return tag;
    if (had === 'pic.' + id) return tag;
    const clean = had != null ? tag.replace(/\sdata-pic\s*=\s*("[^"]*"|'[^']*')/i, '') : tag;
    return clean.replace(new RegExp(`^<${nm}`), `<${nm} data-pic="pic.${id}"`);
  });
}

/** This photograph's original files, as the pages name them (one width each match: slash, width, format). */
export function originalFiles(field) {
  return /^media\/m_[0-9a-f]{16}$/.test(field.value)
    ? new RegExp(`(?<![A-Za-z0-9_.-])(\\/?)${esc(field.value)}\\/(w\\d{2,5})\\.(${EXT})${END}`, 'g')
    : new RegExp(`(?<![A-Za-z0-9_.-])(\\/?)${esc(field.value)}-(w\\d{2,5})\\.(${EXT})${END}`, 'g');
}
/** The files of the pictures uploaded for this photograph, as the pages name them (slash, picture id, width, format). */
export function uploadedFiles(field) {
  return new RegExp(`(?<![A-Za-z0-9_.-])(\\/?)content\\/media\\/${esc(field.key.slice(4))}\\.([a-f0-9]{16})-(w\\d{2,5})\\.jpg${FMT}${END}`, 'g');
}
/** Every value of this photograph a page names (its original, uploaded pictures). */
export function valuesNamed(field, html) {
  const out = new Set();
  if (originalFiles(field).test(html)) out.add(field.value);
  for (const m of html.matchAll(uploadedFiles(field))) out.add(`content/media/${field.key.slice(4)}.${m[2]}`);
  return out;
}
/** The pages with these photographs (key -> new value) pointing at their new files. fields: the picture fields by key. */
export function rewritePictures(html, changes, fields) {
  let out = html;
  for (const [key, value] of changes) {
    const f = fields.get(key);
    const fam = originalFiles(f), up = uploadedFiles(f);
    const mine = (t) => { fam.lastIndex = 0; up.lastIndex = 0; const hit = fam.test(t) || up.test(t); fam.lastIndex = 0; up.lastIndex = 0; return hit; };
    // a mention's format, kept with the uploaded picture's JPEG (?f=webp) so that going back gives exactly it again
    const keep = (ext) => { const e = ext.toLowerCase(); return e === 'jpg' ? '' : `?f=${e}`; };
    if (value !== f.value) {
      // to the uploaded picture: every width becomes its JPEG; a <source> or <link> that declared another type says
      // image/jpeg, and keeps the type it had (data-pic-type)
      const toFrom = (m, slash, s, ext) => `${slash}${value}-${s}.jpg${keep(ext)}`;
      const toUp = (m, slash, hex, s, fmt) => `${slash}${value}-${s}.jpg${fmt ? `?f=${fmt}` : ''}`;
      out = out.replace(TAG, (tag, nm) => {
        if (!mine(tag)) return tag;
        let t = tag.replace(fam, toFrom).replace(up, toUp);
        const type = attrOf(t, 'type');
        if (/^(source|link)$/i.test(nm) && type && /^image\/(webp|avif|png)$/i.test(type)) {
          t = t.replace(/\stype\s*=\s*("[^"]*"|'[^']*')/i, ' type="image/jpeg"');
          if (attrOf(t, 'data-pic-type') == null) t = t.replace(new RegExp(`^<${nm}`), `<${nm} data-pic-type="${type}"`);
        }
        return t;
      });
      out = out.replace(fam, toFrom).replace(up, toUp);                // in a <style>, a script's data, JSON-LD
    } else {
      // back to the original: every mention in the format it had, and every type it declared
      const toOriginal = (m, slash, hex, s, fmt) => `${slash}${fileOf(f.value, s, fmt || 'jpg')}`;
      out = out.replace(TAG, (tag) => {
        if (!mine(tag)) return tag;
        const type = attrOf(tag, 'data-pic-type');
        let t = tag.replace(up, toOriginal);
        if (type != null) t = t.replace(/\sdata-pic-type\s*=\s*("[^"]*"|'[^']*')/i, '').replace(/\stype\s*=\s*("[^"]*"|'[^']*')/i, ` type="${type}"`);
        return t;
      });
      out = out.replace(up, toOriginal);
    }
  }
  return out;
}
