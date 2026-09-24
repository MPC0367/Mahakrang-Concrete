// Global behaviour on every page: dialogs (menu, search), header state, copy-number,
// back-to-top and live content updates (SSE with a polling fallback).
import { $, $$, boot, openDialog, copyText, toast, reducedMotion } from './lib.js?v=e54e45d75f';

const B = boot();

// ---------------------------------------------------------------- dialogs
$$('[data-open]').forEach((btn) => {
  btn.addEventListener('click', () => openDialog(document.getElementById(btn.dataset.open), btn));
});
// Menu links that point at the current page still close the drawer.
$$('#drawer a').forEach((a) => a.addEventListener('click', () => { const d = $('#drawer'); if (d && d.open) d.close(); }));
// "/" opens search (common site convention) unless typing somewhere.
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '') && !document.querySelector('dialog[open]')) {
    e.preventDefault(); openDialog($('#search'), document.activeElement);
  }
});

// ---------------------------------------------------------------- header shadow once scrolled
const hdr = $('[data-hdr]');
if (hdr) {
  const onScroll = () => hdr.classList.toggle('is-scrolled', window.scrollY > 4);
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
}

// ---------------------------------------------------------------- back to top
$$('[data-top]').forEach((a) => a.addEventListener('click', (e) => {
  e.preventDefault();
  window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
  const main = $('#main'); if (main) main.focus({ preventScroll: true });
}));

// ---------------------------------------------------------------- copy phone number (desktop fallback)
$$('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
  const ok = await copyText(b.dataset.copy);
  toast(`<span>${ok ? (B.strings.copied || 'Copied') : b.dataset.copy}</span>`);
}));

// ---------------------------------------------------------------- live updates
// The page declares which documents it was rendered from (data-deps). When a publish touches
// one of them we offer a refresh - we never swap content under a reader or a half-typed form.
const deps = new Set(B.deps || []);
const concerns = (ch) => deps.has(`${ch.type}:${ch.id}`) || deps.has(`${ch.type}:*`) || ch.action === 'media';
let epoch = B.epoch || 0;
let offered = false;
function offerRefresh() {
  if (offered || B.preview) return;
  offered = true;
  const t = toast(`<span>${B.strings.updated}</span><button type="button" data-refresh>${B.strings.refresh}</button>`, { timeout: 0 });
  t && t.querySelector('[data-refresh]').addEventListener('click', () => location.reload());
}
function handle(ch) {
  if (typeof ch.epoch === 'number' && ch.epoch <= epoch) return;
  if (typeof ch.epoch === 'number') epoch = ch.epoch;
  if (concerns(ch)) offerRefresh();
}
let pollTimer = null;
function poll() {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(async () => {
    if (document.visibilityState === 'visible') {
      try {
        const r = await fetch(`/api/public/epoch?since=${epoch}`, { cache: 'no-store' });
        const j = await r.json();
        (j.changes || []).forEach(handle);
        if (j.epoch > epoch && !(j.changes || []).length) { epoch = j.epoch; }
      } catch { /* offline - try again later */ }
    }
    poll();
  }, B.poll || 15000);
}
if (B.static) { /* static review export: no live channel */ } else if (!B.preview && 'EventSource' in window) {
  let es;
  const connect = () => {
    es = new EventSource('/api/public/events');
    es.addEventListener('change', (e) => { try { handle(JSON.parse(e.data)); } catch { /* ignore */ } });
    es.addEventListener('hello', (e) => { try { const j = JSON.parse(e.data); if (j.epoch > epoch) { fetch(`/api/public/epoch?since=${epoch}`).then((r) => r.json()).then((x) => (x.changes || []).forEach(handle)).catch(() => {}); } } catch { /* ignore */ } });
    es.onerror = () => { es.close(); poll(); };
  };
  connect();
  window.addEventListener('pagehide', () => es && es.close());
} else if (!B.preview) { poll(); }

// ---------------------------------------------------------------- YouTube facades: a real player on demand
$$('[data-yt]').forEach((el) => el.addEventListener('click', (e) => {
  e.preventDefault();
  const id = el.dataset.yt;
  const f = document.createElement('iframe');
  f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&playsinline=1&rel=0`;
  f.title = el.getAttribute('aria-label') || 'YouTube';
  f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  f.allowFullscreen = true;
  el.replaceChildren(f);
  el.removeAttribute('href'); el.removeAttribute('role');
}));

// ---------------------------------------------------------------- search suggestions (live site: API; static exports: local index)
const sForm = $('.searchdlg__form');
const sOut = $('[data-search-results]');
if (sForm && sOut) {
  const input = sForm.querySelector('input[name="q"]');
  const KIND = B.lang === 'en'
    ? { page: 'Page', product: 'Product', batch: 'Lab batch', project: 'Project', story: 'Story', lifestyle: 'Lifestyle' }
    : { page: 'หน้า', product: 'สินค้า', batch: 'ผลทดสอบ', project: 'ผลงาน', story: 'เรื่องราว', lifestyle: 'ไลฟ์สไตล์' };
  const none = B.lang === 'en' ? 'No results' : 'ไม่พบผลลัพธ์';
  let staticIndex = null, timer, seq = 0;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  async function query(q) {
    if (!B.static) {
      const r = await fetch(`/api/public/search?lang=${B.lang}&q=${encodeURIComponent(q)}`, { cache: 'no-store' });
      return (await r.json()).results || [];
    }
    if (!staticIndex) { try { staticIndex = (window.parent && window.parent.__MHK_SEARCH__ && window.parent.__MHK_SEARCH__[B.lang]) || null; } catch { staticIndex = null; } }
    // A failed download is not cached (the next keystroke tries again) and shows nothing, like a failed API call.
    if (!staticIndex) {
      const r = await fetch(B.searchIndex || 'search-index.json');
      if (!r.ok) throw new Error(`search index ${r.status}`);
      staticIndex = await r.json();
    }
    // Same rules as server/content/search.ts: every term must match; title hits score 3, text hits 1; ties keep index order.
    const norm = (s) => s.toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();
    const terms = norm(q).split(' ').filter(Boolean);
    const hits = [];
    staticIndex.forEach((e, i) => {
      const title = e.st ?? norm(e.t), text = e.sx ?? norm(e.x);
      let score = 0;
      for (const t of terms) { if (title.includes(t)) score += 3; else if (text.includes(t)) score += 1; else { score = 0; break; } }
      if (score > 0) hits.push({ e, score, i });
    });
    hits.sort((a, b) => b.score - a.score || a.i - b.i);
    return hits.slice(0, 8).map(({ e }) => ({ kind: e.k, title: e.t, excerpt: e.x, href: e.h }));
  }
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) { sOut.innerHTML = ''; return; }
    timer = setTimeout(async () => {
      const my = ++seq;
      let res = [];
      try { res = await query(q); } catch { return; }
      if (my !== seq) return;
      sOut.innerHTML = res.length
        ? `<ul>${res.slice(0, 8).map((r) => `<li><a href="${esc(r.href)}"><span class="searchdlg__k">${esc(KIND[r.kind] || '')}</span><b>${esc(r.title)}</b>${r.excerpt ? `<span>${esc(r.excerpt)}</span>` : ''}</a></li>`).join('')}</ul>`
        : `<p class="searchdlg__none">${none}</p>`;
    }, 160);
  });
  // The artifact has no search page, so Enter opens the first suggestion; the hosted static build (B.base) has one.
  if (B.static && !B.base) sForm.addEventListener('submit', (e) => { e.preventDefault(); const a = sOut.querySelector('a'); if (a) a.click(); });
}

// ---------------------------------------------------------------- language toggle keeps the reader's place (#tab / #section)
$$('[data-lang-link]').forEach((a) => a.addEventListener('click', () => {
  if (location.hash && !a.href.includes('#')) a.href = a.href + location.hash;
}));
