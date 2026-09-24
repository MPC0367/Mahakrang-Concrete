// Concrete hub behaviour (/concrete): the application rail and the Mix Design catalogue filter.
//
// Rail: scroll-snap lives in CSS; this adds page indicators that reflect the ACTUAL pages of the rail at the
// current width (not one dot per card), prev/next buttons for keyboard and mouse users, and keeps both in sync
// with swipes. No autoplay - a product rail is not the hero.
//
// Catalogue: chips genuinely filter the rows (aria-pressed), "ดูทั้งหมด" toggles featured <-> all, a clear
// button resets, and an empty state appears when nothing matches. Strength chips and specialty-family chips are
// different data: a strength chip matches graded mixes by value (ksc), a family chip matches specialty mixes by key.
// Without JS every row is listed (the server renders them all; `.js .is-extra` only hides extras when JS runs).
import { $, $$, boot, reducedMotion, store } from './lib.js?v=e54e45d75f';
import { watchPhrases } from './calc-engine.js?v=63e23ab488';

const B = boot();
const S = (B.page && B.page.s) || {};
const tpl = (t, o) => String(t || '').replace(/\{(\w+)\}/g, (_, k) => (o[k] ?? ''));
const cleanups = [];

// ------------------------------------------------------------------ rail

function initRail(root) {
  const list = $('[data-rail]', root);
  if (!list) return;
  const dotsEl = $('[data-rail-dots]', root);
  const nav = $('[data-rail-nav]', root);
  const prev = $('[data-rail-prev]', root);
  const next = $('[data-rail-next]', root);
  let pages = [0];
  let current = 0;
  let raf = 0;

  function measure() {
    const items = $$('[data-rail-item]', list);
    const max = Math.max(0, list.scrollWidth - list.clientWidth);
    if (!items.length || max < 4) { pages = [0]; return; }
    const step = items.length > 1 ? items[1].offsetLeft - items[0].offsetLeft : items[0].offsetWidth;
    const padL = parseFloat(getComputedStyle(list).scrollPaddingLeft) || 0;
    // How many whole cards fit in the viewport of the rail -> one page.
    const perView = Math.max(1, Math.floor((list.clientWidth - padL + 2) / step));
    const out = [0];
    while (out[out.length - 1] < max - 2) out.push(Math.min(out[out.length - 1] + perView * step, max));
    pages = out;
  }

  function currentPage() {
    const x = list.scrollLeft;
    let best = 0;
    pages.forEach((p, i) => { if (Math.abs(p - x) < Math.abs(pages[best] - x)) best = i; });
    return best;
  }

  function renderDots() {
    const many = pages.length > 1;
    if (dotsEl) {
      dotsEl.hidden = !many;
      if (many && dotsEl.children.length !== pages.length) {
        // The current page is known BEFORE the buttons exist, so a rebuilt set never animates into its state.
        const now = currentPage();
        dotsEl.replaceChildren(...pages.map((_, i) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'cc-rail__dot';
          b.setAttribute('aria-current', i === now ? 'true' : 'false');
          b.setAttribute('aria-label', tpl(S.page || '{n} / {t}', { n: i + 1, t: pages.length }));
          b.setAttribute('aria-controls', list.id);
          b.addEventListener('click', () => go(i));
          return b;
        }));
      }
    }
    if (nav) nav.hidden = !many;
    sync();
    // Transitions start only after the first state is painted (no fade-in of the current page on load).
    if (dotsEl && many && !dotsEl.hasAttribute('data-ready')) requestAnimationFrame(() => requestAnimationFrame(() => dotsEl.setAttribute('data-ready', '')));
  }

  function sync() {
    current = currentPage();
    if (dotsEl) [...dotsEl.children].forEach((b, i) => b.setAttribute('aria-current', i === current ? 'true' : 'false'));
    if (prev) prev.disabled = current <= 0 && list.scrollLeft < 4;
    if (next) next.disabled = current >= pages.length - 1;
  }

  function go(i) {
    const n = Math.max(0, Math.min(pages.length - 1, i));
    list.scrollTo({ left: pages[n], behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; sync(); }); };
  const onPrev = () => go(current - 1);
  const onNext = () => go(current + 1);
  list.addEventListener('scroll', onScroll, { passive: true });
  prev && prev.addEventListener('click', onPrev);
  next && next.addEventListener('click', onNext);
  const ro = new ResizeObserver(() => { measure(); renderDots(); });
  ro.observe(list);
  measure(); renderDots();

  cleanups.push(() => {
    ro.disconnect();
    cancelAnimationFrame(raf);
    list.removeEventListener('scroll', onScroll);
    prev && prev.removeEventListener('click', onPrev);
    next && next.removeEventListener('click', onNext);
    if (dotsEl) dotsEl.replaceChildren();
  });
}

// ------------------------------------------------------------------ catalogue filter

function initCatalogue(root) {
  const list = $('[data-list]', root);
  if (!list) return;
  const rows = $$('[data-row]', list);
  const chips = $$('[data-chip]', root);
  const allBtn = $('.cc-cat__all', root);
  const bar = $('[data-cat-bar]', root);
  const status = $('[data-cat-status]', root);
  const clearBtn = $('[data-clear]', root);
  const title = $('[data-cat-title]', root);
  const emptyEl = $('[data-empty]', root);
  const hasFeatured = rows.some((r) => r.dataset.featured !== '');
  const featured = rows.filter((r) => r.dataset.featured !== '').sort((a, b) => a.dataset.featured - b.dataset.featured);
  const catalogueOrder = [...rows].sort((a, b) => a.dataset.sort - b.dataset.sort);
  const KEY = 'cc:catalogue:' + location.pathname;

  const saved = store.get(KEY, null);
  let mode = saved && (saved.mode === 'all' || saved.mode === 'featured') ? saved.mode : (hasFeatured ? 'featured' : 'all');
  if (!hasFeatured) mode = 'all';
  let filter = saved && saved.filter && chips.some((c) => c.dataset.chip === saved.filter.kind && c.dataset.value === String(saved.filter.value)) ? saved.filter : null;

  const matches = (r) => {
    if (!filter) return true;
    if (filter.kind === 'strength') return r.dataset.kind === 'strength' && r.dataset.unit === 'ksc' && Number(r.dataset.strength) === Number(filter.value);
    return r.dataset.kind === 'specialty' && r.dataset.family === String(filter.value);
  };

  function apply({ animate = true } = {}) {
    const m = filter ? 'filter' : mode;
    const order = m === 'featured' ? [...featured, ...catalogueOrder.filter((r) => !featured.includes(r))] : catalogueOrder;
    order.forEach((r) => list.appendChild(r));
    let n = 0;
    const motion = animate && !reducedMotion();
    for (const r of order) {
      const show = m === 'featured' ? r.dataset.featured !== '' : matches(r);
      r.classList.remove('is-extra');
      if (show) {
        if (motion && (r.hidden || r.dataset.shown !== '1')) {
          r.style.setProperty('--i', String(n));
          r.classList.remove('is-in'); void r.offsetWidth; r.classList.add('is-in');
        }
        r.hidden = false; r.dataset.shown = '1'; n++;
      } else { r.hidden = true; r.dataset.shown = ''; }
    }
    list.dataset.mode = m;
    chips.forEach((c) => c.setAttribute('aria-pressed', String(!!filter && c.dataset.chip === filter.kind && c.dataset.value === String(filter.value))));
    if (title) title.textContent = m === 'featured' ? title.dataset.tFeatured : m === 'all' ? title.dataset.tAll : title.dataset.tFiltered;
    if (allBtn) {
      allBtn.hidden = !hasFeatured || !!filter;
      allBtn.setAttribute('aria-expanded', String(mode === 'all'));
      const lbl = $('[data-lbl]', allBtn);
      if (lbl) lbl.textContent = mode === 'all' ? allBtn.dataset.tLess : allBtn.dataset.tMore;
    }
    if (bar) bar.hidden = m === 'featured';
    const one = n === 1;   // English singular ("1 item"); the Thai strings are identical
    if (status) status.textContent = m === 'filter' ? tpl((one && S.filtered1) || S.filtered, { label: filter.label, n }) : m === 'all' ? tpl((one && S.count1) || S.count, { n }) : '';
    if (clearBtn) clearBtn.hidden = !filter;
    if (emptyEl) emptyEl.hidden = n > 0;
    list.hidden = n === 0;
    store.set(KEY, { mode, filter });
  }

  const onChip = (e) => {
    const c = e.currentTarget;
    const same = filter && filter.kind === c.dataset.chip && String(filter.value) === c.dataset.value;
    filter = same ? null : { kind: c.dataset.chip, value: c.dataset.value, label: c.dataset.label || c.textContent.trim() };
    apply();
  };
  const onAll = () => { filter = null; mode = mode === 'all' ? 'featured' : 'all'; apply(); };
  const onClear = () => {
    const was = filter && chips.find((c) => c.dataset.chip === filter.kind && c.dataset.value === String(filter.value));
    filter = null; apply();
    (was || title)?.focus?.({ preventScroll: true });
  };
  // Hero "ดูสินค้าทั้งหมด" jumps to the catalogue AND shows everything.
  const showAllLinks = $$('a[data-show-all]');
  const onShowAll = () => { filter = null; mode = 'all'; apply(); };

  chips.forEach((c) => c.addEventListener('click', onChip));
  allBtn && allBtn.addEventListener('click', onAll);
  clearBtn && clearBtn.addEventListener('click', onClear);
  showAllLinks.forEach((a) => a.addEventListener('click', onShowAll));
  apply({ animate: false });

  cleanups.push(() => {
    chips.forEach((c) => c.removeEventListener('click', onChip));
    allBtn && allBtn.removeEventListener('click', onAll);
    clearBtn && clearBtn.removeEventListener('click', onClear);
    showAllLinks.forEach((a) => a.removeEventListener('click', onShowAll));
  });
}

function init() {
  $$('[data-rail-root]').forEach(initRail);
  $$('[data-catalogue]').forEach(initCatalogue);
  // Thai phrases too long for their column flow normally instead of as boxes (calc-engine.js fitPhrases)
  const main = document.getElementById('main');
  if (main) cleanups.push(watchPhrases(main));
}
init();

// Listeners are released when the page is hidden; a page restored from the back/forward cache re-initialises.
window.addEventListener('pagehide', () => { while (cleanups.length) cleanups.pop()(); });
window.addEventListener('pageshow', (e) => { if (e.persisted) init(); });
