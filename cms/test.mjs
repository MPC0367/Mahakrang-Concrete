// Checks for the website texts (22 November 2026): node cms/test.mjs. Run by the "Website texts" workflow after it
// keys the pages, so a page the rules cannot read safely stops the commit.
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { publish } from './build.mjs';
import { extract } from './extract.mjs';
import { fileOf, originalFiles, rewritePictures, scanPictures, sizesOf, valuesNamed, withPicMarks } from './pictures.mjs';
import { applyTo, render, unitsOf, wordsOf, wordsSpan } from './units.mjs';
import { parse, walk } from './html.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
let n = 0;
const test = (name, fn) => { try { fn(); n++; } catch (e) { console.error(`FAILED: ${name}\n`, e); process.exitCode = 1; } };

const r = extract(ROOT);
const reg = JSON.parse(readFileSync(path.join(ROOT, 'cms', 'registry.json'), 'utf8'));
const man = JSON.parse(readFileSync(path.join(ROOT, 'content', 'manifest.json'), 'utf8'));
const snap = JSON.parse(readFileSync(path.join(ROOT, man.url), 'utf8'));

test('every text has a key, and keying again adds none', () => {
  for (const f of r.files) for (const u of unitsOf(r.html[f]).units) assert.ok(u.key, `${f}: "${u.words.slice(0, 40)}" has no key`);
  assert.equal(Object.values(r.marks).flat().length, 0);
});
test('a key is used once per page, except the texts shared by every page', () => {
  for (const f of r.files) {
    const seen = new Set();
    for (const u of unitsOf(r.html[f]).units) { if (!u.key.startsWith('s.')) assert.ok(!seen.has(u.key), `${f}: ${u.key} twice`); seen.add(u.key); }
  }
});
test('the registry and the newest revision are the words on the pages', () => {
  assert.deepEqual(reg.fields.map((f) => f.key).sort(), r.fields.map((f) => f.key).sort());
  assert.deepEqual(snap.content, r.content);
  assert.deepEqual(snap.facts ?? {}, r.facts);
});
test('every photograph is a picture with its sizes, and every <img> and <source> showing one is marked', () => {
  const pics = r.fields.filter((f) => f.type === 'picture');
  assert.ok(pics.length > 30, `${pics.length} photographs`);
  for (const f of pics) {
    assert.match(f.key, /^pic\.[a-z0-9-]{1,100}$/);
    assert.ok(f.variants.length, `${f.key}: no sizes`);
    // a photograph offered for a new picture has every size measured (a new one not measured yet is the studio's)
    if (f.editable) assert.ok(f.variants.every((v) => v.w > 0 && v.h > 0), `${f.key}: sizes`);
    assert.ok(f.editable || f.protectReason, `${f.key}: locked without a reason`);
  }
  for (const f of r.files) assert.equal(withPicMarks(r.html[f]), r.html[f], `${f}: a photograph not marked`);
});
test('every photograph replaced and put back gives every page back exactly, in its scripts and styles too', () => {
  const fields = new Map(r.fields.map((f) => [f.key, f]));
  let tried = 0;
  for (const f of r.fields.filter((x) => x.type === 'picture' && x.editable && r.facts[x.key] === x.value)) {
    const up = `content/media/${f.key.slice(4)}.${'d'.repeat(16)}`;
    for (const file of r.files) {
      const h = r.html[file];
      if (!valuesNamed(f, h).size) continue;
      const mid = rewritePictures(h, new Map([[f.key, up]]), fields);
      assert.deepEqual([...valuesNamed(f, mid)], [up], `${f.key} on ${file}: an old file still named`);
      const again = rewritePictures(mid, new Map([[f.key, up.replace(/d{16}$/, 'e'.repeat(16))]]), fields);
      assert.equal(rewritePictures(again, new Map([[f.key, f.value]]), fields), h, `${f.key} on ${file} is not as it was`);
      tried++;
    }
  }
  assert.ok(tried > 100, `${tried} pages tried`);
});
test('a photograph’s name is never part of a longer one; two photographs of one name, or pages that disagree, are the studio’s', () => {
  const meta = () => ({ tab: 'Home', where: '/', link: '/', paths: { th: '/' } });
  const sized = (key, value, s = 'w640') => ({ key, value, variants: [{ s, ext: 'jpg', w: 640, h: 427 }, { s, ext: 'webp', w: 640, h: 427 }] });
  const scan = (html, prev = new Map()) => scanPictures(os.tmpdir(), ['index.html'], { 'index.html': html }, meta, prev).fields;
  // a longer file name, and a sentence's full stop
  const page = '<img src="/media/test/photo-w640.jpg"><a href="/media/test/photo-w640.jpg.backup">x</a><p>media/test/photo-w640.webp.</p>';
  const f = sized('pic.test-photo', 'media/test/photo');
  const out = rewritePictures(page, new Map([['pic.test-photo', 'content/media/test-photo.' + 'a'.repeat(16)]]), new Map([[f.key, f]]));
  assert.ok(out.includes('href="/media/test/photo-w640.jpg.backup"'), out);
  assert.ok(out.includes('<p>content/media/test-photo.' + 'a'.repeat(16) + '-w640.jpg?f=webp.</p>'), out);
  assert.equal(rewritePictures(out, new Map([[f.key, f.value]]), new Map([[f.key, f]])), page);
  // a folder that starts with m_ is a folder, not a photograph's own one
  const mw = sized('pic.m-work-photo', 'media/m_work/photo');
  const mo = rewritePictures('<img src="/media/m_work/photo-w640.jpg">', new Map([[mw.key, 'content/media/m-work-photo.' + 'b'.repeat(16)]]), new Map([[mw.key, mw]]));
  assert.equal(mo, '<img src="/content/media/m-work-photo.' + 'b'.repeat(16) + '-w640.jpg">');
  // two photographs of one name; pages that show the original on one and a picture on another; sizes never measured
  const prev = (k, v) => new Map([[k, { ...sized(k, v), tab: 'Home', where: '/', link: '/', paths: {} }]]);
  assert.match(scan('<img src="/media/a-b/c-w640.jpg"><img src="/media/a/b-c-w640.jpg">', prev('pic.a-b-c', 'media/a-b/c'))[0].protectReason, /same name/);
  assert.match(scan('<img src="/media/test/photo-w640.jpg"><img src="/content/media/test-photo.' + 'a'.repeat(16) + '-w640.jpg">', prev('pic.test-photo', 'media/test/photo'))[0].protectReason, /not all show the same picture/);
  assert.match(scan('<img src="/media/new/photo-w640.jpg">')[0].protectReason, /not known yet/);
});
test('a photograph: replaced by a picture whose files are there, refused otherwise, and back to the original byte for byte', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'mhk-pic-'));
  try {
    for (const f of [...r.files, 'cms', 'content', 'js']) cpSync(path.join(ROOT, f), path.join(dir, f), { recursive: true });
    // a photograph the pages show as the studio's original, in many places, with WebP files (and a <source> for them)
    const pic = r.fields.find((f) => f.type === 'picture' && f.editable && r.facts[f.key] === f.value && f.variants.some((v) => v.ext === 'webp') && f.places > 4
      && r.files.some((x) => [...r.html[x].matchAll(/<source\b[^>]*>/g)].some((m) => originalFiles(f).test(m[0]))));
    const value = `content/media/${pic.key.slice(4)}.${'c'.repeat(16)}`;
    const pub = (n, v, expect) => ({ schema: 'mahakrang.publish/1', nonce: n.repeat(32), by: 'Test', changes: [{ key: pic.key, value: v, expect: { value: expect } }] });
    let out = publish(dir, pub('c', value, pic.value));
    assert.equal(out.status, 'rejected');
    assert.equal(out.refused[0].reason, 'invalid', 'its files are not there yet');
    mkdirSync(path.join(dir, 'content', 'media'), { recursive: true });
    for (const x of sizesOf(pic)) writeFileSync(path.join(dir, fileOf(value, x.s, 'jpg')), 'jpeg');
    out = publish(dir, pub('d', value, pic.value));
    assert.equal(out.status, 'built', JSON.stringify(out));
    assert.deepEqual(out.published, [pic.key]);
    const mid = extract(dir);
    assert.equal(mid.facts[pic.key], value);
    assert.ok(!mid.files.some((f) => originalFiles(pic).test(mid.html[f])), 'an old file still named');
    assert.ok(mid.files.some((f) => [...mid.html[f].matchAll(/<source\b[^>]*>/g)].some((m) => m[0].includes(value) && /data-pic-type="image\/webp"/.test(m[0]) && /\stype="image\/jpeg"/.test(m[0]))), 'a WebP <source> says image/jpeg now');
    assert.deepEqual(mid.content, r.content, 'the texts moved');
    for (const [k, v] of Object.entries(r.facts)) if (k !== pic.key) assert.equal(mid.facts[k], v, `${k} moved`);
    // the photograph stays offered while it shows the picture: every size known from the registry before
    assert.ok(mid.fields.find((f) => f.key === pic.key).editable, 'a replaced photograph is locked');
    assert.equal(publish(dir, pub('e', pic.value, pic.value)).refused[0].reason, 'changed');
    out = publish(dir, pub('f', pic.value, value));
    assert.equal(out.status, 'built');
    const back = extract(dir);
    for (const f of r.files) assert.equal(back.html[f], r.html[f], `${f} is not as it was`);
    const poster = r.fields.find((f) => f.type === 'picture' && !f.editable);
    assert.equal(publish(dir, { ...pub('9', value, null), changes: [{ key: poster.key, value: poster.value }] }).refused[0].reason, 'locked');
    assert.equal(publish(dir, { ...pub('8', value, null), changes: [{ key: pic.key, value: 'content/media/other.' + 'c'.repeat(16) }] }).refused[0].reason, 'invalid');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('publishing every text unchanged changes no byte of any page', () => {
  const seo = new Map();
  for (const p of r.pages) for (const f of [p.th, p.en]) if (f) seo.set(f, { title: `seo.${p.id}.title`, description: `seo.${p.id}.description` });
  for (const f of r.files) assert.equal(applyTo(r.html[f], (k, lang) => r.content[k]?.[lang] || undefined, seo.get(f)).html, r.html[f], f);
});
test('every page loads the preview only inside SPINE, and Cloudflare\u2019s counter only on the real domain', () => {
  for (const f of r.files) {
    assert.ok(r.html[f].includes('data-spine-loader'), f);
    assert.ok(r.html[f].includes('data-cf-loader') && r.html[f].includes("location.hostname==='mahakrangconcrete.com'"), f);
    const csp = /http-equiv="Content-Security-Policy" content="([^"]*)"/i.exec(r.html[f])?.[1];
    if (csp) assert.ok(/script-src[^;]*https:\/\/static\.cloudflareinsights\.com/.test(csp) && /connect-src[^;]*https:\/\/cloudflareinsights\.com/.test(csp), `${f}: CSP`);
  }
});
test('words that live beside a fact, or that the site\u2019s scripts write, are not offered', () => {
  for (const f of r.files) for (const u of unitsOf(r.html[f]).units) {
    for (let n = u.el; n && n.name !== 'body'; n = n.parent) {
      assert.ok(!n.attrs?.some(([k]) => k === 'data-calc'), `${f}: ${u.key} is inside the calculator`);
      assert.ok(n.name !== 'time', `${f}: ${u.key} is a dated <time>`);
      assert.ok(!(n.name === 'a' && /^(mailto|tel):/i.test(n.attrs.find(([k]) => k === 'href')?.[1] ?? '')), `${f}: ${u.key} is an e-mail or phone link`);
    }
    assert.ok(!/[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(u.words), `${f}: ${u.key} shows an e-mail address`);
  }
});
test('a new photo description reaches the viewer\u2019s copy of it too', () => {
  const html = '<!doctype html><html lang="en"><body><main><a href="#" data-alt="Old words" aria-label="Image 1: Old words"><img data-cms-alt="x.001" alt="Old words" src="a.jpg"></a></main></body></html>';
  const out = applyTo(html, (k) => (k === 'x.001' ? 'New & words' : undefined)).html;
  assert.equal((out.match(/New &amp; words/g) ?? []).length, 3);
  assert.ok(out.includes('aria-label="Image 1: New &amp; words"'));
});
test('new Thai words in a text that mixes plain words and phrase spans get a span', () => {
  const html = render('ที่ตั้งโรงงานใหม่', { chunkClass: 'cc-ph', chunks: ['ที่ตั้ง'], loose: true }, 'th');
  assert.match(html, /^<span class="cc-ph">ที่ตั้ง<\/span><span class="cc-ph">/);
});
test('new words read back exactly, phrase spans kept and made for new words', () => {
  const style = { chunkClass: 'cc-ph', chunks: ['คอนกรีต', 'ที่มากกว่า'], loose: false };
  for (const [words, lang] of [['คอนกรีตที่มากกว่าแค่โครงสร้าง', 'th'], ['บรรทัดหนึ่ง\nบรรทัดสอง', 'th'], ['Concrete & more <b>', 'en']]) {
    const html = `<h2>${render(words, style, lang)}</h2>`;
    const el = [...walk(parse(html))].find((x) => x.name === 'h2');
    assert.equal(wordsOf(el, wordsSpan(el)), words);
  }
  assert.match(render('คอนกรีตที่มากกว่าแค่โครงสร้าง', style, 'th'), /^<span class="cc-ph">คอนกรีต<\/span><span class="cc-ph">ที่มากกว่า<\/span><span class="cc-ph">/);
  assert.equal(render('a <b> & c', { chunkClass: null, chunks: [], loose: true }, 'en'), 'a &lt;b&gt; &amp; c');
});
test('a publication: taken when the words are still those it was typed on, refused otherwise, never twice', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'mhk-cms-'));
  try {
    for (const f of [...r.files, 'cms', 'content', 'js']) cpSync(path.join(ROOT, f), path.join(dir, f), { recursive: true });
    const shared = r.fields.find((f) => f.key.startsWith('s.') && f.langs.length === 2 && r.content[f.key].th.length > 3);
    const own = r.fields.find((f) => f.tab === 'Contact & orders' && f.langs.length === 2 && f.type === 'text');
    const c = (f, th, en, expect = r.content[f.key]) => ({ key: f.key, th, en, expect: { th: expect.th, en: expect.en } });
    const pub = { schema: 'mahakrang.publish/1', nonce: 'a'.repeat(32), by: 'Test', changes: [
      c(shared, shared.key + ' ทดสอบ', 'Test ' + shared.key),
      c(own, 'ใหม่', 'New', { th: 'ไม่ใช่', en: 'Not it' }),
      { key: 'nope.001', th: 'x', en: 'y' },
    ] };
    const out = publish(dir, pub);
    assert.equal(out.status, 'built');
    assert.deepEqual(out.published, [shared.key]);
    assert.deepEqual(out.refused.map((x) => x.reason).sort(), ['changed', 'not_found']);
    const again = extract(dir);
    assert.equal(again.content[shared.key].th, shared.key + ' ทดสอบ');
    const everywhere = again.files.filter((f) => again.html[f].includes('Test ' + shared.key));
    assert.equal(everywhere.length, r.files.filter((f) => f.startsWith('en/')).length);
    assert.equal(publish(dir, pub).status, 'duplicate');
    // the same change typed on the old words is refused now that the words moved
    assert.equal(publish(dir, { ...pub, nonce: 'b'.repeat(32), changes: [c(shared, 'อีกครั้ง', 'Again')] }).refused[0].reason, 'changed');
    writeFileSync(path.join(dir, 'x.json'), '');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
console.log(`${n} checks passed${process.exitCode ? ', some FAILED' : ''}`);
