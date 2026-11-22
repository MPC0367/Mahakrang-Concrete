// Checks for the website texts (22 November 2026): node cms/test.mjs. Run by the "Website texts" workflow after it
// keys the pages, so a page the rules cannot read safely stops the commit.
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { publish } from './build.mjs';
import { extract } from './extract.mjs';
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
});
test('publishing every text unchanged changes no byte of any page', () => {
  const seo = new Map();
  for (const p of r.pages) for (const f of [p.th, p.en]) if (f) seo.set(f, { title: `seo.${p.id}.title`, description: `seo.${p.id}.description` });
  for (const f of r.files) assert.equal(applyTo(r.html[f], (k, lang) => r.content[k]?.[lang] || undefined, seo.get(f)).html, r.html[f], f);
});
test('every page loads the preview only inside SPINE', () => {
  for (const f of r.files) assert.ok(r.html[f].includes('data-spine-loader'), f);
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
