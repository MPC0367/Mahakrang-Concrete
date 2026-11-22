/* O2: SPINE's preview of this page (22 November 2026). Loaded only when the page is opened as ?spine-preview=1, inside
   SPINE's Website > Texts (a one-line loader in each page's head). SPINE sends the drafts and the text being typed; they
   are shown here, in this frame only, and nothing is saved or sent anywhere. The logo opening and the cookie question
   stay out of the way. Every text carries data-cms="<key>" (a photograph's description data-cms-alt), see cms/units.mjs. */
(function () {
  'use strict';
  var ORIGINS = ['https://spine.o2-designstudio.com', 'http://127.0.0.1:4400', 'http://localhost:4400', 'http://127.0.0.1:4410', 'http://localhost:4410'];
  var d = document, H = d.documentElement, lang = H.lang === 'en' ? 'en' : 'th';
  var CHUNK = /^(cc-ph|cc-ph--flow|nw|pg-nobr|cc-nw)$/;
  var st = d.createElement('style');
  st.textContent = '.mk-intro,.mk-cookie{display:none!important}html.mk-intro-on body::before{display:none!important}' +
    '[data-spine-focus]{outline:3px solid #e0262b!important;outline-offset:3px!important;border-radius:2px}';
  d.head.appendChild(st);
  var original = {}, applied = {}, from = null;

  function isChunk(n) {
    if (n.nodeType !== 1 || n.tagName !== 'SPAN' || !n.className || n.children.length) return false;
    return String(n.className).split(/\s+/).every(function (c) { return CHUNK.test(c); });
  }
  function textish(n) { return n.nodeType === 3 || n.tagName === 'BR' || n.tagName === 'WBR' || isChunk(n); }
  /* the children that hold the words (wordless ones at the ends, icons, stay) */
  function wordsRange(el) {
    var k = el.childNodes, first = -1, last = -1;
    for (var i = 0; i < k.length; i++) if (textish(k[i]) && k[i].tagName !== 'BR' && k[i].tagName !== 'WBR' && (k[i].textContent || '').trim()) { if (first < 0) first = i; last = i; }
    return first < 0 ? null : [first, last];
  }
  function setWords(el, words) {
    var r = wordsRange(el);
    if (!r) return;
    var k = el.childNodes, ref = k[r[1]].nextSibling;
    for (var i = r[1]; i >= r[0]; i--) el.removeChild(k[i]);
    var f = d.createDocumentFragment();
    String(words).split('\n').forEach(function (line, i) { if (i) f.appendChild(d.createElement('br')); f.appendChild(d.createTextNode(line)); });
    el.insertBefore(f, ref);
  }
  function each(key, fn) {
    var a = d.querySelectorAll('[data-cms="' + key + '"]'), b = d.querySelectorAll('[data-cms-alt="' + key + '"]');
    for (var i = 0; i < a.length; i++) fn(a[i], 'text');
    for (var j = 0; j < b.length; j++) fn(b[j], 'alt');
    return a.length + b.length;
  }
  function show(key, words) {
    each(key, function (el, kind) {
      if (!(key in original)) original[key] = kind === 'alt' ? el.getAttribute('alt') : el.cloneNode(true);
      if (kind === 'alt') el.setAttribute('alt', words); else setWords(el, words);
    });
    applied[key] = words;
  }
  function restore(key) {
    var o = original[key];
    each(key, function (el, kind) {
      if (kind === 'alt') el.setAttribute('alt', o);
      else if (o && o.nodeType === 1) el.parentNode.replaceChild(o.cloneNode(true), el);
    });
    delete applied[key];
  }
  function focusOn(key) {
    var old = d.querySelectorAll('[data-spine-focus]');
    for (var i = 0; i < old.length; i++) old[i].removeAttribute('data-spine-focus');
    if (!key) return;
    var el = d.querySelector('[data-cms="' + key + '"]') || d.querySelector('[data-cms-alt="' + key + '"]');
    var shown = false;
    if (el) {
      el.setAttribute('data-spine-focus', '');
      var box = el.getBoundingClientRect(), cs = getComputedStyle(el);
      shown = box.width > 2 && box.height > 2 && cs.visibility !== 'hidden' && !el.closest('[hidden],dialog:not([open])');
      if (shown) el.scrollIntoView({ block: 'center', behavior: 'instant' in d.documentElement.style ? 'instant' : 'auto' });
    }
    if (from) parent.postMessage({ type: 'spine:focus', key: key, found: !!el, shown: shown }, from);
  }
  window.addEventListener('message', function (e) {
    if (e.source !== parent || ORIGINS.indexOf(e.origin) < 0) return;
    var m = e.data || {};
    if (m.type !== 'spine:preview') return;
    from = e.origin;
    var content = m.content || {};
    for (var k in applied) if (!(k in content)) restore(k);
    for (var key in content) {
      if (!/^[A-Za-z0-9._-]{1,120}$/.test(key)) continue;
      var w = content[key] && content[key][lang];
      if (typeof w === 'string' && w !== applied[key]) show(key, w);
    }
    focusOn(typeof m.focus === 'string' ? m.focus : null);
  });
  function ready() { parent.postMessage({ type: 'spine:ready' }, '*'); }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', ready); else ready();
})();
