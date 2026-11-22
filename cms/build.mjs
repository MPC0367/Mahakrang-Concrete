// Publishes the changes SPINE sends (22 November 2026). Runs on GitHub Actions when SPINE pushes a publication to the
// cms-inbox branch (inbox/queue/<nonce>.json; .github/workflows/cms-publish.yml on that branch), and by hand the same way:
//   node cms/build.mjs --queue <queue folder> --results <results folder>    every waiting publication, oldest first
//   node cms/build.mjs <publish.json> [result.json]                          one publication
//
// A change is taken only if its key is a text of the website, every language the text has is given, the words pass the
// checks SPINE makes too (no < or >, not empty, not too long), and the text on the website is still the one the change
// was typed on ("expect"); otherwise that change is refused with the reason and the words now on the website. The pages
// are then rewritten (only the changed texts), read back to prove each text now reads exactly as sent, and a new revision
// is written. Nothing is kept unless every accepted change reads back: a failed build leaves the website as it was.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extract, writeAll } from './extract.mjs';
import { applyTo } from './units.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const norm = (s) => String(s ?? '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/[ \t\f\v]+/g, ' ').trim()).join('\n').trim();

export function checkWords(field, lang, raw) {
  const v = norm(raw);
  const en = lang === 'en';
  if (!v) return en ? 'the English is empty' : 'the Thai is empty';
  if (/[<>]/.test(v)) return en ? 'the English has < or >' : 'the Thai has < or >';
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0009\u000b-\u001f\u007f]/.test(v)) return 'there is a control character';
  if (field.maxLen && [...v].length > field.maxLen) return `longer than ${field.maxLen} characters`;
  if (field.type !== 'text' && v.includes('\n')) return 'a line break where the page has one line';
  return null;
}

export function publish(root, inbox) {
  const result = { schema: 'mahakrang.publish-result/1', at: new Date().toISOString(), nonce: inbox?.nonce ?? null, status: 'rejected', revision: null, published: [], refused: [], problems: [] };
  if (inbox?.schema !== 'mahakrang.publish/1') result.problems.push('not a publication from SPINE');
  if (!/^[0-9a-f]{32}$/.test(String(inbox?.nonce ?? ''))) result.problems.push('no nonce');
  if (!Array.isArray(inbox?.changes) || !inbox.changes.length) result.problems.push('no changes');
  else if (inbox.changes.length > 300) result.problems.push('more than 300 changes');
  if (result.problems.length) return result;

  const man = (() => { try { return JSON.parse(readFileSync(path.join(root, 'content', 'manifest.json'), 'utf8')); } catch { return { recent: [] }; } })();
  const seen = (man.recent ?? []).find((x) => x.nonce === inbox.nonce);
  if (seen) return { ...result, status: 'duplicate', revision: seen.revision, published: seen.keys ?? [] };

  const now = extract(root);
  const fields = new Map(now.fields.map((f) => [f.key, f]));
  const accepted = {};
  for (const c of inbox.changes) {
    const f = fields.get(c?.key);
    if (!f) { result.refused.push({ key: String(c?.key ?? ''), reason: 'not_found' }); continue; }
    if (accepted[f.key]) { result.refused.push({ key: f.key, reason: 'twice' }); continue; }
    const live = now.content[f.key];
    const problems = [];
    const words = {};
    for (const lang of f.langs) {
      const p = checkWords(f, lang, c[lang]);
      if (p) problems.push(p); else words[lang] = norm(c[lang]);
    }
    if (problems.length) { result.refused.push({ key: f.key, reason: 'invalid', problems }); continue; }
    const moved = f.langs.some((lang) => c.expect && c.expect[lang] != null && norm(c.expect[lang]) !== live[lang]);
    if (moved) { result.refused.push({ key: f.key, reason: 'changed', now: Object.fromEntries(f.langs.map((l) => [l, live[l]])) }); continue; }
    if (f.langs.every((lang) => words[lang] === live[lang])) { result.refused.push({ key: f.key, reason: 'same' }); continue; }
    accepted[f.key] = words;
  }
  const keys = Object.keys(accepted);
  if (!keys.length) { result.problems.push('none of the changes could be published'); return result; }

  // rewrite the pages; search texts by the page's own keys
  const seoFor = new Map();
  for (const p of now.pages) for (const f of [p.th, p.en]) if (f) seoFor.set(f, { title: `seo.${p.id}.title`, description: `seo.${p.id}.description` });
  const before = {};
  for (const f of now.files) {
    const src = now.html[f];
    const out = applyTo(src, (k, lang) => accepted[k]?.[lang], seoFor.get(f));
    if (out.html !== src) { before[f] = src; writeFileSync(path.join(root, f), out.html); }
  }
  // read every page back: each accepted text must now read exactly as sent, and nothing else may have moved
  const after = extract(root);
  const wrong = [];
  for (const [k, w] of Object.entries(accepted)) for (const [lang, v] of Object.entries(w)) if (after.content[k]?.[lang] !== v) wrong.push(`${k} (${lang})`);
  for (const [k, c] of Object.entries(now.content)) if (!accepted[k] && (after.content[k]?.th !== c.th || after.content[k]?.en !== c.en)) wrong.push(`${k} moved`);
  if (wrong.length) {
    for (const [f, src] of Object.entries(before)) writeFileSync(path.join(root, f), src);
    result.status = 'failed';
    result.problems.push('the pages did not read back as sent: ' + wrong.slice(0, 5).join(', '));
    return result;
  }
  const w = writeAll(root, after, { publication: { nonce: inbox.nonce, keys, by: String(inbox.by ?? '').slice(0, 80) } });
  return { ...result, status: 'built', revision: w.revision, published: keys, pages: Object.keys(before) };
}

/** Every publication waiting in the queue, oldest first; each answer goes to results/<nonce>.json. */
export function publishQueue(root, queueDir, resultsDir) {
  const list = existsSync(queueDir) ? readdirSync(queueDir).filter((f) => /^[0-9a-f]{32}\.json$/.test(f)) : [];
  const items = list.map((f) => {
    try {
      const text = readFileSync(path.join(queueDir, f), 'utf8');
      if (text.length > 2 * 1024 * 1024) throw new Error('larger than 2 MB');
      const j = JSON.parse(text);
      if (j.nonce !== f.slice(0, 32)) throw new Error('its file name is not its nonce');
      return { f, j };
    } catch (e) { return { f, error: String(e.message ?? e) }; }
  }).sort((a, b) => String(a.j?.at ?? '').localeCompare(String(b.j?.at ?? '')) || a.f.localeCompare(b.f));
  mkdirSync(resultsDir, { recursive: true });
  const done = [];
  for (const it of items) {
    const r = it.error ? { schema: 'mahakrang.publish-result/1', at: new Date().toISOString(), nonce: it.f.slice(0, 32), status: 'rejected', problems: ['could not read the publication: ' + it.error] } : publish(root, it.j);
    writeFileSync(path.join(resultsDir, it.f), JSON.stringify(r, null, 1) + '\n');
    done.push({ file: it.f, status: r.status, revision: r.revision ?? null, published: r.published?.length ?? 0 });
  }
  return done;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  if (a[0] === '--queue') {
    const done = publishQueue(ROOT, path.resolve(a[1]), path.resolve(a[3] ?? path.join(a[1], '..', 'results')));
    console.log(JSON.stringify(done, null, 1));
    const built = done.filter((d) => d.status === 'built');
    if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `changed=${built.length > 0}\nrevision=${built.at(-1)?.revision ?? ''}\n`, { flag: 'a' });
    process.exit(0);
  }
  const [inboxPath, resultPath] = a;
  let inbox = null;
  try {
    const text = readFileSync(inboxPath, 'utf8');
    if (text.length > 2 * 1024 * 1024) throw new Error('larger than 2 MB');
    inbox = JSON.parse(text);
  } catch (e) { inbox = { _error: String(e.message ?? e) }; }
  const r = inbox?._error ? { schema: 'mahakrang.publish-result/1', at: new Date().toISOString(), status: 'rejected', problems: ['could not read the publication: ' + inbox._error] } : publish(ROOT, inbox);
  if (resultPath) writeFileSync(resultPath, JSON.stringify(r, null, 1) + '\n');
  console.log(JSON.stringify({ ...r, published: r.published?.length ?? 0 }, null, 1));
  process.exit(r.status === 'built' || r.status === 'duplicate' ? 0 : 1);
}
