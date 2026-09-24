// Shared browser helpers for page modules. No dependencies.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const boot = () => window.__MHK__ || { lang: 'th', strings: {} };
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Polite announcement for screen readers (one shared live region). */
let live;
export function announce(msg) {
  if (!live) {
    live = document.createElement('div');
    live.className = 'vh'; live.setAttribute('aria-live', 'polite'); live.setAttribute('role', 'status');
    document.body.appendChild(live);
  }
  live.textContent = '';
  setTimeout(() => { live.textContent = msg; }, 30);
}

/**
 * Open a native <dialog> modally, remember the opener, restore focus on close, keep page scroll position.
 * Native showModal() gives focus containment, Escape and background inertness.
 */
export function openDialog(dlg, opener) {
  if (!dlg || dlg.open) return;
  const y = window.scrollY;
  dlg.__opener = opener || document.activeElement;
  document.documentElement.classList.add('has-dialog');
  dlg.showModal();
  window.scrollTo({ top: y, behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' });
  if (!dlg.__wired) {
    dlg.__wired = true;
    // Tab / Shift+Tab wrap inside the dialog instead of escaping to the browser UI.
    dlg.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const t = tabbables(dlg);
      if (!t.length) return;
      const first = t[0], last = t[t.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    dlg.addEventListener('close', () => {
      document.documentElement.classList.remove('has-dialog');
      const o = dlg.__opener;
      if (o && typeof o.focus === 'function') o.focus({ preventScroll: true });
      if (o && o.hasAttribute && o.hasAttribute('aria-expanded')) o.setAttribute('aria-expanded', 'false');
      dlg.dispatchEvent(new CustomEvent('mhk:closed'));
    });
    // click on the backdrop (outside the panel) closes
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));
  }
  if (opener && opener.hasAttribute && opener.hasAttribute('aria-expanded')) opener.setAttribute('aria-expanded', 'true');
  const first = dlg.querySelector('[autofocus], input, select, textarea, button:not([data-close]), a[href]') || dlg.querySelector('[data-close]');
  if (first) first.focus({ preventScroll: true });
}

/** Visible, enabled, focusable elements in DOM order (only the checked radio of a group). */
export function tabbables(root) {
  const sel = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, video[controls], [tabindex]:not([tabindex="-1"])';
  return Array.from(root.querySelectorAll(sel)).filter((el) => {
    if (el.closest('[hidden], [inert]')) return false;
    if (el.type === 'radio' && !el.checked && root.querySelector(`input[type=radio][name="${el.name}"]:checked`)) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  });
}

/**
 * Sprite reference for an icon built in the browser. It copies the prefix of an icon the server already rendered on
 * this page (<svg class="i i-name"><use href="…#name">), so it keeps whatever that page uses: the sprite's version
 * key, the static build's base path, or the artifact's inline "#i-" ids.
 */
let spritePrefix = null;
export function iconHref(name) {
  if (spritePrefix == null) {
    spritePrefix = '/Mahakrang-Concrete/img/icons.svg#';
    for (const u of document.querySelectorAll('svg.i > use')) {
      const own = [...u.parentNode.classList].find((c) => c.startsWith('i-'));
      const href = u.getAttribute('href') || '';
      const nm = own ? own.slice(2) : '';
      // "…icons.svg?v=x#menu" -> "…icons.svg?v=x#";  "#i-menu" -> "#i-"
      if (nm && href.endsWith(nm) && /#(i-)?$/.test(href.slice(0, -nm.length))) { spritePrefix = href.slice(0, -nm.length); break; }
    }
  }
  return spritePrefix + name;
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove(); return ok;
  }
}

let toastTimer;
export function toast(html, { timeout = 3200 } = {}) {
  const t = document.querySelector('[data-toast]');
  if (!t) return;
  t.innerHTML = html;
  t.classList.add('is-on');
  clearTimeout(toastTimer);
  if (timeout) toastTimer = setTimeout(() => t.classList.remove('is-on'), timeout);
  return t;
}

/** Local form persistence (per page) - convenience only, never authoritative. */
export const store = {
  get(k, d = null) { try { const v = sessionStorage.getItem('mhk:' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { sessionStorage.setItem('mhk:' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

export const fmt = {
  num(n, d = 2) { return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); },
};
