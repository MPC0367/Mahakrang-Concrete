// Search results for the hosted static build (GitHub Pages), where no server answers /search?q=.
// The export ships every published entry (both languages, for the same matching as the server) together with
// its result row pre-rendered by the server template, plus the page fragments that change once a query exists
// (kicker, heading, "no results" block, call panel). This module applies the server's rules in the browser:
// substring terms, title hits score 3 and text hits 1, every term must match, kind chips only when the results
// span more than one kind. Loaded only on the static /search page.
import { $, $$ } from './lib.js?v=e54e45d75f';

const node = $('script[data-search-static]');
if (node) run(JSON.parse(node.textContent));

function run(D) {
  const Q = D.sentinel;
  const params = new URLSearchParams(location.search);
  const q = (params.get('q') ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const input = $('#pg-q');
  // the language switch keeps the query (q and kind), as on the server
  $$('[data-lang-link]').forEach((a) => { const u = new URL(a.href, location.href); u.search = location.search; a.href = u.href; });
  if (!q) { if (input) input.focus({ preventScroll: true }); return; }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const norm = (s) => s.toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();
  const terms = norm(q).split(' ').filter(Boolean);

  // ---- match + rank exactly like server/content/search.ts
  const found = [];
  D.entries.forEach((e, i) => {
    const title = norm(`${e.title.th} ${e.title.en}`);
    const text = norm(`${e.text.th} ${e.text.en}`);
    let score = 0;
    for (const t of terms) {
      if (title.includes(t)) score += 3; else if (text.includes(t)) score += 1; else { score = 0; break; }
    }
    if (score > 0) found.push({ e, score, i });
  });
  found.sort((a, b) => b.score - a.score || a.i - b.i);
  const kinds = [...new Set(found.map((f) => f.e.kind))];
  const kq = params.get('kind') ?? '';
  const kind = kinds.length > 1 && kinds.includes(kq) ? kq : null;
  const results = kind ? found.filter((f) => f.e.kind === kind) : found;

  // ---- head of the page: title, kicker, heading, prefilled field
  document.title = D.title.split(Q).join(q);
  const wrap = $('.pg-search');
  const h1 = wrap && $('h1', wrap);
  if (h1) {
    while (h1.previousElementSibling) h1.previousElementSibling.remove();
    h1.insertAdjacentHTML('beforebegin', D.kicker);
    h1.outerHTML = D.h1.split(Q).join(esc(q));
  }
  if (input) input.value = q;

  // ---- status, kind chips, results
  const count = $('.pg-search__count', wrap);
  const L = D.labels;
  const href = (k) => `${D.searchPath}?q=${encodeURIComponent(q)}${k ? `&kind=${k}` : ''}`;
  let status = '';
  if (found.length) {
    status = `<p class="pg-search__count" role="status">${esc(L.found)} <b>${found.length}</b> ${esc(found.length === 1 ? L.resultsOne : L.results)} ${esc(L.forQ)} “<b>${esc(q)}</b>”</p>`;
    if (kinds.length > 1) {
      status += `<nav class="pg-search__kinds" aria-label="${esc(L.filter)}"><ul class="chips chips--scroll">`
        + `<li><a class="chip" href="${esc(href(null))}"${!kind ? ' aria-current="true"' : ''}>${esc(L.all)} <span class="chip__unit">${found.length}</span></a></li>`
        + kinds.map((k) => `<li><a class="chip" href="${esc(href(k))}"${kind === k ? ' aria-current="true"' : ''}>${esc(L.kind[k])} <span class="chip__unit">${found.filter((f) => f.e.kind === k).length}</span></a></li>`).join('')
        + '</ul></nav>';
    }
  } else {
    status = D.none.split(Q).join(esc(q));
  }
  if (count) count.outerHTML = status + (results.length ? `<ol class="pg-results">${results.map((f) => f.e.html).join('')}</ol>` : '');
  if (results.length) {
    const more = $('.pg-search__more', wrap); if (more) more.remove();
    $$('.pg-result__t, .pg-result__x').forEach((el) => mark(el, terms));
  } else {
    const hero = wrap && wrap.closest('section');
    if (hero && D.call) hero.insertAdjacentHTML('afterend', D.call);
  }
}

/**
 * Wrap every occurrence of the terms in <mark>. Matching runs on the element's whole text, like the server's
 * marked(); a hit that crosses the no-break word spans (pg-nobr) is marked piece by piece inside each span,
 * which is how the server nests its marks too.
 */
function mark(root, terms) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let full = '';
  for (let n = walker.nextNode(); n; n = walker.nextNode()) { nodes.push({ n, start: full.length }); full += n.nodeValue; }
  const lower = full.toLowerCase();
  const hits = [];
  for (const t of terms) { if (!t) continue; let i = lower.indexOf(t); while (i >= 0) { hits.push([i, i + t.length]); i = lower.indexOf(t, i + t.length); } }
  if (!hits.length) return;
  hits.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const h of hits) { const last = merged[merged.length - 1]; if (last && h[0] <= last[1]) last[1] = Math.max(last[1], h[1]); else merged.push([...h]); }
  for (const { n, start } of nodes) {
    const text = n.nodeValue; const end = start + text.length;
    const local = merged.filter(([s, e]) => s < end && e > start).map(([s, e]) => [Math.max(s, start) - start, Math.min(e, end) - start]);
    if (!local.length) continue;
    const frag = document.createDocumentFragment();
    let at = 0;
    for (const [s, e] of local) {
      if (s > at) frag.append(text.slice(at, s));
      const m = document.createElement('mark'); m.textContent = text.slice(s, e); frag.append(m);
      at = e;
    }
    if (at < text.length) frag.append(text.slice(at));
    n.replaceWith(frag);
  }
}
