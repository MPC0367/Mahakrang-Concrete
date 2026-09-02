/* ==========================================================================
   i18n — Thai is the document language. English lives on data-en* attributes
   and is swapped in place, so changing language never changes the page,
   the scroll position, the filter state or anything typed into a form.
   (Master Prompt §87–§88)
   ========================================================================== */
(function () {
  'use strict';

  var KEY = 'mhk-lang';
  /* Copy is swapped as HTML, not text: headings carry line breaks and the
     red-accent spans that are part of the typographic design, and a textContent
     round-trip would silently flatten them. Both sides of every pair are
     author-written strings in this document — nothing here comes from a user. */
  var ATTRS = [
    ['data-en', 'html'],
    ['data-en-placeholder', 'placeholder'],
    ['data-en-aria', 'aria-label'],
    ['data-en-title', 'title'],
    ['data-en-alt', 'alt'],
    ['data-en-html', 'html'],
    ['data-en-value', 'value']
  ];

  function stash(el, attr, prop) {
    var key = 'th' + attr;
    if (el.dataset[key] !== undefined) return;
    if (prop === 'html') el.dataset[key] = el.innerHTML;
    else el.dataset[key] = el.getAttribute(prop) || '';
  }

  function apply(lang) {
    var en = lang === 'en';

    ATTRS.forEach(function (pair) {
      var attr = pair[0], prop = pair[1];
      var camel = attr.replace('data-', '').replace(/-([a-z])/g, function (m, c) { return c.toUpperCase(); });
      document.querySelectorAll('[' + attr + ']').forEach(function (el) {
        stash(el, camel, prop);
        var val = en ? el.getAttribute(attr) : el.dataset['th' + camel];
        if (val === null || val === undefined) return;
        if (prop === 'html') el.innerHTML = val;
        else el.setAttribute(prop, val);
      });
    });

    document.documentElement.lang = en ? 'en' : 'th';
    document.querySelectorAll('[data-lang-btn]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.langBtn === lang));
    });
    /* Elements that only exist in one language (e.g. a Thai-only nuance line). */
    document.querySelectorAll('[data-only]').forEach(function (el) {
      el.hidden = el.dataset.only !== lang;
    });

    try { localStorage.setItem(KEY, lang); } catch (e) {}
    document.dispatchEvent(new CustomEvent('mhk:lang', { detail: { lang: lang } }));
  }

  function current() {
    var q = new URLSearchParams(location.search).get('lang');
    if (q === 'en' || q === 'th') return q;
    try { var s = localStorage.getItem(KEY); if (s) return s; } catch (e) {}
    return (navigator.language || '').toLowerCase().indexOf('th') === 0 ? 'th' : 'th';
  }

  window.MHK = window.MHK || {};
  window.MHK.lang = { get: current, set: apply };

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-lang-btn]');
    if (!b) return;
    e.preventDefault();
    apply(b.dataset.langBtn);
  });

  /* Run before paint so English users never see a Thai flash. */
  apply(current());
  document.addEventListener('DOMContentLoaded', function () { apply(current()); });
})();
