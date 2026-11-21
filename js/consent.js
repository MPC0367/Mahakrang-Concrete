/* O2: Google Analytics on mahakrangconcrete.com, only after a visitor's yes (22 Nov 2026; the owner: "do google analytics
   for mahakrang too cookie tracking"). Ported from O2's own site (o2-designstudio.com, src/js/cookies.js, live since
   16 Nov 2026), whose wording and behaviour the owner approved. The property is "Mahakrang Concrete website" in O2's
   Google Analytics account (the owner's choice), Measurement ID below; analytics only, nothing for advertising.

   The order of things, on every page with this file:
     1. anywhere but the live site (this machine, a preview) the page neither asks nor loads anything, so no test visit
        reaches the real reports; only the footer's link to the cookie policy shows;
     2. a browser that sends Global Privacy Control or Do Not Track is never asked and never measured, and any Google
        Analytics cookie left on this site is deleted;
     3. a choice already made (this version, not expired) is followed; otherwise the question is shown once the logo
        opening has lifted, with Accept and Decline side by side and alike. The page is never blocked, and ignoring the
        question is a no;
     4. only after Accept is anything loaded from Google, with Consent Mode v2: every kind of storage denied first,
        analytics storage alone granted, the advertising signals never. Google is told the page's address with nothing
        after it (no search words), and of a referrer only its site.
   "ตั้งค่าคุกกี้ / Cookie settings" in the footer (and on the cookie policy page) reopens the choice; Decline there stops
   Google Analytics at once and deletes its cookies. What the cookie policy (/cookies/, /en/cookies/) says must match
   the numbers here: CONSENT_DAYS, the cookie names, and the property's 2-month retention. */
const ID = 'G-CJ6WM47SN9';
const HOSTS = ['mahakrangconcrete.com', 'www.mahakrangconcrete.com'];
const KEY = 'mk.cookies.v1', VERSION = 1, CONSENT_DAYS = 180, LAYER = 'mkgtag';

const H = document.documentElement;
const EN = (H.getAttribute('lang') || 'th').slice(0, 2) === 'en';
/* a local browser test may set window.__mkGaTest before the page loads, and blocks Google's hosts itself */
const HERE = HOSTS.indexOf(location.hostname) >= 0 || window.__mkGaTest === true;
const T = (th, en) => (EN ? en : th);
const W = {
  askH: T('อนุญาตให้ใช้คุกกี้ของ Google Analytics หรือไม่', 'Cookies for Google Analytics?'),
  askP: T('ถ้าคุณอนุญาต Google Analytics จะตั้งคุกกี้เพื่อให้เรานับจำนวนการเข้าชมและดูว่าหน้าไหนมีคนอ่าน ไม่ใช้เพื่อการโฆษณา และไม่ส่งสิ่งที่คุณพิมพ์',
    'With your yes, Google Analytics sets cookies so we can count visits and see which pages are read. Never for advertising, and nothing you type is sent.'),
  more: T('อ่านนโยบายคุกกี้', 'Read the cookie policy'),
  accept: T('ยอมรับ', 'Accept'), decline: T('ปฏิเสธ', 'Decline'), close: T('ปิด', 'Close'),
  settingsH: T('ตั้งค่าคุกกี้', 'Cookie settings'),
  isOn: T('ตอนนี้ Google Analytics เปิดอยู่ในเบราว์เซอร์นี้', 'Google Analytics is on in this browser.'),
  isOff: T('ตอนนี้ Google Analytics ปิดอยู่ในเบราว์เซอร์นี้', 'Google Analytics is off in this browser.'),
  savedOn: T('บันทึกแล้ว Google Analytics เปิดอยู่', 'Saved. Google Analytics is on.'),
  savedOff: T('บันทึกแล้ว Google Analytics ปิดอยู่ และลบคุกกี้ของ Google Analytics บนเว็บไซต์นี้แล้ว', 'Saved. Google Analytics is off, and its cookies on this site have been deleted.'),
  signal: T('เบราว์เซอร์ของคุณขอให้เว็บไซต์ไม่ติดตามการใช้งาน (Global Privacy Control หรือ Do Not Track) Google Analytics จึงปิดอยู่ และไม่มีการโหลดสิ่งใดจาก Google',
    'Your browser asks sites not to track you (Global Privacy Control or Do Not Track), so Google Analytics stays off here and nothing is loaded from Google.'),
};
const POLICY = EN ? '/en/cookies/' : '/cookies/';

const signal = () => navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1';

/* the choice, kept in this browser only: version, answer, when it was given and until when it holds */
function readChoice(now = Date.now()) {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (c && c.version === VERSION && typeof c.analytics === 'boolean' && Date.parse(c.expires) > now) return c;
  } catch (e) { /* storage refused: asked again on the next page, never assumed */ }
  return null;
}
function writeChoice(analytics) {
  const now = new Date();
  const c = { version: VERSION, analytics, at: now.toISOString(), expires: new Date(+now + CONSENT_DAYS * 86400000).toISOString() };
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { /* the choice holds for this page */ }
  return c;
}

/* what Google is told about the page: its address with nothing after it, and of a referrer only its site */
function pageFacts() {
  let referrer = '';
  try {
    if (document.referrer) {
      const r = new URL(document.referrer);
      if (r.origin === location.origin) referrer = r.origin + r.pathname;
      else if (/^https?:$/.test(r.protocol)) referrer = r.origin + '/';
    }
  } catch (e) { /* an unreadable referrer is left out */ }
  return { location: location.origin + location.pathname, referrer };
}

/* ---- Google Analytics ---- */
let started = false, gtag = null;
function startGA(facts) {
  window['ga-disable-' + ID] = false;
  if (started) { gtag('consent', 'update', { analytics_storage: 'granted' }); return; }
  started = true;
  const layer = (window[LAYER] = window[LAYER] || []);
  gtag = function () { layer.push(arguments); };
  gtag('consent', 'default', {
    ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied',
    functionality_storage: 'denied', personalization_storage: 'denied', security_storage: 'denied',
  });
  gtag('consent', 'update', { analytics_storage: 'granted' });
  gtag('set', 'ads_data_redaction', true);
  /* the cookies' lifetime for the whole tag, set before config: given in the config call alone, Google's tag kept its
     own two-year default on O2's site (found live, 16 Nov 2026) */
  gtag('set', { cookie_expires: CONSENT_DAYS * 86400, cookie_flags: 'SameSite=Lax;Secure', cookie_update: true });
  gtag('js', new Date());
  const cfg = { page_location: facts.location, allow_google_signals: false, allow_ad_personalization_signals: false,
    cookie_expires: CONSENT_DAYS * 86400, cookie_flags: 'SameSite=Lax;Secure' };
  if (facts.referrer) cfg.page_referrer = facts.referrer;
  gtag('config', ID, cfg);
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(ID) + '&l=' + LAYER;
  document.head.append(s);
}
function stopGA() {
  window['ga-disable-' + ID] = true;
  if (gtag) gtag('consent', 'update', { analytics_storage: 'denied' });
  deleteCookies();
}
/* _ga, _ga_<stream> and the older _gid/_gat, set on the widest domain the browser allows: cleared on every one */
function deleteCookies() {
  const names = document.cookie.split(';').map((c) => c.trim().split('=')[0]).filter((n) => /^_g(a|id|at)(_|$)/.test(n));
  if (!names.length) return;
  const parts = location.hostname.split('.'), domains = [''];
  for (let i = 0; i < parts.length - 1; i++) { const d = parts.slice(i).join('.'); domains.push(d, '.' + d); }
  for (const n of names) for (const d of domains) document.cookie = n + '=; Max-Age=0; Path=/' + (d ? '; Domain=' + d : '') + '; SameSite=Lax';
}

/* ---- the question ---- */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
let card = null, opener = null;
function show(mode, facts) {
  hide(false);
  const settings = mode === 'settings', blocked = signal(), c = readChoice();
  const t = document.createElement('template');
  t.innerHTML = `<section class="mk-cookie" role="region" aria-labelledby="mk-cookie-h" tabindex="-1" data-mode="${mode}">
  <h2 class="mk-cookie__h" id="mk-cookie-h">${esc(settings ? W.settingsH : W.askH)}</h2>
  ${blocked ? `<p class="mk-cookie__p">${esc(W.signal)} <a href="${POLICY}">${esc(W.more)}</a></p>` : `
  <p class="mk-cookie__p">${esc(W.askP)} <a href="${POLICY}">${esc(W.more)}</a></p>
  ${settings ? `<p class="mk-cookie__status" role="status" aria-live="polite">${esc(c && c.analytics ? W.isOn : W.isOff)}</p>` : ''}
  <div class="mk-cookie__acts">
    <button type="button" class="btn btn--ghost" data-cookie="accept">${esc(W.accept)}</button>
    <button type="button" class="btn btn--ghost" data-cookie="decline">${esc(W.decline)}</button>
  </div>`}
  ${settings ? `<button type="button" class="mk-cookie__x" data-cookie="close" aria-label="${esc(W.close)}"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>` : ''}
</section>`;
  card = t.content.firstElementChild;
  card.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cookie]');
    if (!b) return;
    const what = b.dataset.cookie;
    if (what === 'close') { hide(true); return; }
    const yes = what === 'accept';
    writeChoice(yes);
    if (yes) startGA(facts); else stopGA();
    if (settings) { const say = card.querySelector('.mk-cookie__status'); if (say) say.textContent = yes ? W.savedOn : W.savedOff; }
    else hide(true);
  });
  if (settings) card.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); hide(true); } });
  /* early in the reading and Tab order, straight after the skip link, though it is drawn at the foot of the screen */
  const skip = document.querySelector('body > .skip');
  if (skip) skip.after(card); else document.body.prepend(card);
  if (settings) card.focus({ preventScroll: true });
}
function hide(returnFocus) {
  if (!card) return;
  const had = card.contains(document.activeElement);
  card.remove(); card = null;
  if (returnFocus && had) {
    if (opener && opener.isConnected) opener.focus();
    else { const m = document.getElementById('main'); if (m) m.focus({ preventScroll: true }); }
  }
  opener = null;
}

/* the question waits for the logo opening (mk-intro-on until mk-intro-out) to lift */
function afterOpening(fn) {
  const lifted = () => !H.classList.contains('mk-intro-on') || H.classList.contains('mk-intro-out');
  if (lifted()) return fn();
  let done = false;
  const go = () => { if (!done) { done = true; mo.disconnect(); fn(); } };
  const mo = new MutationObserver(() => { if (lifted()) go(); });
  mo.observe(H, { attributes: true, attributeFilter: ['class'] });
  setTimeout(go, 4000);
}

(() => {
  if (!HERE) return;
  const facts = pageFacts();
  document.querySelectorAll('[data-cookie-settings]').forEach((b) => {
    const wrap = b.closest('[data-cookie-wrap]') || b;
    wrap.hidden = false;
    b.addEventListener('click', () => { show('settings', facts); opener = b; });
  });
  if (signal()) { deleteCookies(); return; }
  const c = readChoice();
  if (c && !c.analytics) { deleteCookies(); return; }
  if (c && c.analytics) startGA(facts);
  else afterOpening(() => { if (!readChoice()) show('ask', facts); });
})();
