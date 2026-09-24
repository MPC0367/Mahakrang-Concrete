// MHK LAB behaviour (overview + batch detail).
// - ARIA tabs: roving tabindex, Left/Right/Home/End, automatic activation, real panel switching.
// - Overview deep links: #results #materials #latest #standards select a tab; #mat-<id> opens that material.
// - Local lab navigation (mobile) mirrors the selected tab.
// - Batch detail: measurement views highlight their summary cells; share (native, copy-link fallback);
//   "ดูทั้งหมด" opens the shared media viewer and returns focus to itself.
// Everything degrades to readable, linked content without JS (see lab.css .no-js rules).
import { $, $$, boot, copyText, toast, reducedMotion } from './lib.js?v=e54e45d75f';

const B = boot();
const cleanups = [];
function on(el, ev, fn, opts) {
  if (!el) return;
  el.addEventListener(ev, fn, opts);
  cleanups.push(() => el.removeEventListener(ev, fn, opts));
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const behavior = () => (reducedMotion() ? 'auto' : 'smooth');

// Scroll THIS window only (element.scrollIntoView would also scroll a parent document - e.g. the admin
// preview that frames this page). The target lands just under the sticky header.
function scrollToEl(el) {
  if (!el) return;
  const hdr = $('.hdr');
  const offset = (hdr && getComputedStyle(hdr).position === 'sticky' ? hdr.getBoundingClientRect().height : 0) + 12;
  // Layout position (offsetTop chain), not getBoundingClientRect: the tab strip may still carry its entrance
  // transform when an initial #hash is handled.
  let y = 0;
  for (let n = el; n; n = n.offsetParent) y += n.offsetTop;
  window.scrollTo({ top: Math.max(0, y - offset), behavior: behavior() });
}

// ---------------------------------------------------------------- generic ARIA tabs
function initTabs(list, onChange) {
  const tabs = $$('[role="tab"]', list);
  const panelOf = (t) => document.getElementById(t.getAttribute('aria-controls'));
  function select(tab, opts = {}) {
    if (!tab) return;
    tabs.forEach((t) => {
      const sel = t === tab;
      t.setAttribute('aria-selected', sel ? 'true' : 'false');
      t.tabIndex = sel ? 0 : -1;
      const p = panelOf(t);
      if (p) p.hidden = !sel;
    });
    if (opts.focus) tab.focus();
    // keep the selected tab visible inside a scrolling tablist, never scroll the page for it
    const lr = list.getBoundingClientRect(), tr = tab.getBoundingClientRect();
    if (tr.left < lr.left || tr.right > lr.right) list.scrollBy({ left: tr.left < lr.left ? tr.left - lr.left - 16 : tr.right - lr.right + 16, behavior: behavior() });
    if (onChange) onChange(tab, opts);
  }
  on(list, 'click', (e) => {
    const t = e.target.closest('[role="tab"]');
    if (t && list.contains(t)) select(t);
  });
  on(list, 'keydown', (e) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    let n = null;
    if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = tabs.length - 1;
    if (n === null) return;
    e.preventDefault();
    select(tabs[n], { focus: true });
  });
  return { select, tabs, byKey: (k) => tabs.find((t) => t.dataset.tab === k) };
}

// ---------------------------------------------------------------- tab strips that cannot fit one row become a 2 x 2 grid
// (long English labels, narrow phones, 200% text zoom) instead of hiding a tab off-screen.
function fitStrip(list) {
  const check = () => {
    list.classList.remove('lab-tabs--grid');
    if (list.scrollWidth > list.clientWidth + 1) list.classList.add('lab-tabs--grid');
  };
  check();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(check);
  if ('ResizeObserver' in window) {
    let w = list.clientWidth;
    const ro = new ResizeObserver(() => { if (list.clientWidth !== w) { w = list.clientWidth; check(); } });
    ro.observe(list);
    cleanups.push(() => ro.disconnect());
  }
}
$$('[data-lab-tabs]').forEach(fitStrip);

// ---------------------------------------------------------------- overview
const ov = $('[data-lab-ov]');
if (ov) {
  const list = $('[data-lab-tabs="overview"]', ov);
  const lnav = $('[data-lab-lnav]');
  const links = lnav ? $$('[data-tab-link]', lnav) : [];
  const T = initTabs(list, (tab, opts) => {
    const key = tab.dataset.tab;
    ov.dataset.tab = key;
    links.forEach((a) => (a.dataset.tabLink === key ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
    if (!opts.silent) {
      const url = key === 'results' ? location.pathname + location.search : `${location.pathname}${location.search}#${key}`;
      history.replaceState(history.state, '', url);
    }
  });
  const toTabs = () => scrollToEl(list);

  const matEl = (id) => $$('details[data-mat]', ov).find((d) => d.dataset.mat === id) || null;
  // Once the browser's own fragment handling is over (load), the material cards take their "mat-<id>" ids from
  // the no-JS anchors, so tools that look a record up by id (the admin preview) find the card itself.
  const handIds = () => $$('details[data-mat]', ov).forEach((d) => {
    const a = $('.lab-anchor[id]', d);
    if (a) { const id = a.id; a.removeAttribute('id'); d.id = id; }
  });
  if (document.readyState === 'complete') handIds(); else on(window, 'load', handIds, { once: true });

  function openMaterial(id, { scroll = true } = {}) {
    const d = matEl(id);
    if (!d) return false;
    T.select(T.byKey('materials'), { silent: true });
    if (d.tagName === 'DETAILS') d.open = true;
    if (scroll) scrollToEl(d);
    const s = d.querySelector('summary');
    if (s) s.focus({ preventScroll: true });
    return true;
  }

  function fromHash(scroll) {
    const h = decodeURIComponent(location.hash.slice(1));
    if (!h) return;
    if (h.startsWith('mat-')) { openMaterial(h.slice(4), { scroll }); return; }
    const t = T.byKey(h);
    if (t) { T.select(t, { silent: true }); if (scroll) toTabs(); }
  }
  // Initial hash: wait a frame so the loader/layout settle, then align under the sticky header.
  if (location.hash) requestAnimationFrame(() => fromHash(true));
  on(window, 'hashchange', () => fromHash(true));

  links.forEach((a) => on(a, 'click', (e) => {
    const t = T.byKey(a.dataset.tabLink);
    if (!t) return;
    e.preventDefault();
    T.select(t);
    toTabs();
    t.focus({ preventScroll: true });
  }));

  $$('[data-lab-mat]', ov).forEach((a) => on(a, 'click', (e) => {
    e.preventDefault();
    history.replaceState(history.state, '', `${location.pathname}${location.search}#mat-${a.dataset.labMat}`);
    openMaterial(a.dataset.labMat);
  }));

  // One material open at a time keeps the two-across grid calm.
  const mats = $$('details.lab-mat', ov);
  mats.forEach((d) => on(d, 'toggle', () => { if (d.open) mats.forEach((o) => { if (o !== d) o.open = false; }); }));
}

// ---------------------------------------------------------------- batch detail: measurement views
const mlist = $('[data-lab-tabs="measure"]');
if (mlist) {
  const cells = $$('[data-lab-cell]');
  initTabs(mlist, (tab) => {
    const hi = (tab.dataset.hi || '').split(' ').filter(Boolean);
    cells.forEach((c) => c.classList.toggle('is-hi', hi.includes(c.dataset.labCell)));
  });
}

// ---------------------------------------------------------------- Thai compound terms in contiguous editor text
// The server sends some editor text as one plain string (see keepLater() in lab.ts) with its compound-term list in
// data-lab-keep. Hold those terms together (nowrap) and keep numbers with their units, so a narrow phone never
// breaks "ไม่น้อย|กว่า" or strands "ksc".
$$('[data-lab-keep]').forEach((el) => {
  let re;
  try { re = new RegExp(`(${el.dataset.labKeep})`); } catch { return; }
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((n) => {
    const text = n.nodeValue.replace(/(\d) (ksc|MPa|วัน|ซม\.|มม\.|%)/g, '$1 $2');
    const parts = text.split(re);
    if (parts.length < 2 && text === n.nodeValue) return;
    const frag = document.createDocumentFragment();
    parts.forEach((p, i) => {
      if (!p) return;
      if (i % 2) { const s = document.createElement('span'); s.className = 'lab-kw'; s.textContent = p; frag.append(s); }
      else frag.append(p);
    });
    n.replaceWith(frag);
  });
});

// ---------------------------------------------------------------- horizontal rails (gallery, materials used) on phones
// Tabbing into a rail item that is only partly in view: Chromium's focus scrolling leaves a partially visible
// item where it is (a 20px sliver at the edge). Scroll the rail itself - never the page - so the focused
// item is whole, inside the rail's gutter.
$$('.lab-gal__rail, .lab-bmats__list').forEach((rail) => on(rail, 'focusin', (e) => {
  if (rail.scrollWidth <= rail.clientWidth + 1) return;
  const item = e.target.closest('li') || e.target;
  const rr = rail.getBoundingClientRect(), ir = item.getBoundingClientRect();
  const pad = parseFloat(getComputedStyle(rail).scrollPaddingInlineStart) || 0;
  let dx = 0;
  if (ir.left < rr.left + pad - 1) dx = ir.left - rr.left - pad;
  else if (ir.right > rr.right - pad + 1) dx = Math.min(ir.left - rr.left - pad, ir.right - rr.right + pad);
  if (dx) rail.scrollBy({ left: dx, behavior: behavior() });
}));

// ---------------------------------------------------------------- share (public URL only; the button is not rendered in preview)
const share = $('[data-lab-share]');
on(share, 'click', async () => {
  let url = share.dataset.url || location.pathname;
  if (!/^https?:\/\//.test(url)) url = location.origin + url;
  const title = share.dataset.title || document.title;
  if (navigator.share) {
    try { await navigator.share({ title, url }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const ok = await copyText(url);
  toast(`<span>${esc(ok ? (B.strings.linkCopied || 'Link copied') : url)}</span>`);
});

// ---------------------------------------------------------------- gallery "view all"
const viewAll = $('[data-lab-viewall]');
on(viewAll, 'click', (e) => {
  const first = $('[data-viewer="lab-batch"]');
  if (!first) return;
  e.preventDefault();
  first.click();
  const dlg = $('dialog.vw');
  if (dlg && dlg.open) dlg.addEventListener('close', () => viewAll.focus({ preventScroll: true }), { once: true });
});

// ---------------------------------------------------------------- phones: the bottom chrome is sized to the calculator button
// Batch detail: the call button ends where the FAB begins (one dock row). Overview: the nav's shoulder wraps the
// docked FAB and the featured stamp line reserves the same width. offsetWidth ignores the hover/fade transforms.
const fab = $('.calc-fab');
if (fab && 'ResizeObserver' in window) {
  let last = 0;
  const fit = () => { const w = Math.ceil(parseFloat(getComputedStyle(fab).width) || 0); if (w && w !== last) { last = w; document.body.style.setProperty('--lab-fab-w', `${w}px`); } };
  const ro = new ResizeObserver(fit);
  ro.observe(fab);
  cleanups.push(() => ro.disconnect());
}

// ---------------------------------------------------------------- floating calculator etiquette (>= 768px)
// Spec: the floating shortcut must not cover share controls, result values, the call CTA or report actions,
// and it should not sit beside its own twin. So on tablet/desktop it steps aside (fade, not focusable) while
//  a) an in-flow calculator button (intro, identity actions, call band) is on screen, or
//  b) a guarded value/action passes under the corner it rests in.
// Phones keep it fixed: there it is part of the local-nav / call-dock layout. No IntersectionObserver = it stays.
if (fab && 'IntersectionObserver' in window) {
  const wide = matchMedia('(min-width: 768px)');
  const outside = (el) => el !== fab && !el.closest('dialog, .lab-dock, .lab-lnav, .hdr');
  const twins = $$('[data-open-calc]').filter(outside);
  // Spec p22: the button must not cover share controls, result values, the call CTA or report actions.
  // Passing text (stamps, captions, badges) is revealed by scrolling, so it is not guarded - guarding it
  // hid the calculator at ~37% of scroll positions on desktop (customer journey, cycle 3).
  const GUARD = '.lab-bar__share, .lab-sh__a, .lab-report__a, .lab-call__act .btn, .lab-idn__act .btn, '
    + '.lab-big, .lab-val, .lab-rv, .lab-mc__b, .lab-sum__b, .lab-qc__state, .lab-table, .lab-mat__v, '
    // the footer's last rows sit in the FAB's corner at the end of every page
    + '.ftr__nav a, .ftr__social a, .ftr__top, .ftr__legal > *';
  const guarded = $$(GUARD).filter(outside);
  const twinsSeen = new Set(), under = new Set();
  let twinIO = null, cornerIO = null, t = 0;
  const apply = () => {
    const away = wide.matches && (twinsSeen.size > 0 || under.size > 0) && document.activeElement !== fab;
    fab.classList.toggle('lab-fab-away', away);
  };
  // The FAB waits unseen (lab.css) until the first reports are in, so it never flashes in and out on load.
  const ready = () => { if (!fab.classList.contains('lab-fab-ready')) requestAnimationFrame(() => fab.classList.add('lab-fab-ready')); };
  const track = (set) => (entries) => { entries.forEach((en) => (en.isIntersecting ? set.add(en.target) : set.delete(en.target))); apply(); ready(); };
  const build = () => {
    if (twinIO) twinIO.disconnect();
    if (cornerIO) cornerIO.disconnect();
    twinsSeen.clear(); under.clear();
    if (!wide.matches || (!guarded.length && !twins.length)) { apply(); ready(); return; }
    // The corner the FAB rests in, from layout values (offset sizes ignore the fade transform), plus a 10px halo.
    const cs = getComputedStyle(fab);
    const b = parseFloat(cs.bottom) || 0, r = parseFloat(cs.right) || 0, halo = 10;
    const top = innerHeight - b - fab.offsetHeight - halo;
    const left = document.documentElement.clientWidth - r - fab.offsetWidth - halo;
    cornerIO = new IntersectionObserver(track(under), { rootMargin: `${-top}px ${halo - r}px ${halo - b}px ${-left}px` });
    guarded.forEach((el) => cornerIO.observe(el));
    if (twins.length) {
      twinIO = new IntersectionObserver(track(twinsSeen), { rootMargin: '-72px 0px -24px 0px' }); // not under the sticky header
      twins.forEach((el) => twinIO.observe(el));
    }
  };
  build();
  on(window, 'resize', () => { clearTimeout(t); t = setTimeout(build, 160); });
  on(wide, 'change', build);
  on(fab, 'blur', apply);
  cleanups.push(() => { clearTimeout(t); if (twinIO) twinIO.disconnect(); if (cornerIO) cornerIO.disconnect(); });
} else if (fab) {
  fab.classList.add('lab-fab-ready');
}

window.addEventListener('pagehide', (e) => { if (!e.persisted) cleanups.splice(0).forEach((f) => f()); });
