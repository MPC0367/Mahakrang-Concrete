/* ==========================================================================
   app — header, drawer, filters, accordions, lightbox, volume calculator,
   multi-step enquiry form.
   ========================================================================== */
(function () {
  'use strict';

  function all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function one(s, r) { return (r || document).querySelector(s); }
  function on(el, ev, fn, o) { if (el) el.addEventListener(ev, fn, o); }
  function isEN() { return document.documentElement.lang === 'en'; }
  function t(th, en) { return isEN() ? en : th; }


  /* ------------------------------------------------------------ curtain ---- */
  /* Covers the two moments where the whole page changes underneath the reader:
     moving between pages, and switching language. Deliberately short — a
     transition, not a loading screen, and it never blocks the arrival of the
     page it is covering. Under reduced motion it is skipped entirely.

     On the multi-page site the outgoing page raises the curtain, sets a flag,
     and navigates; the incoming page reads the flag and lowers it. In the
     single-file artifact the same functions wrap the router's swap. */

  var CURTAIN_KEY = 'mhk-curtain';
  var curtainEl = null;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function curtain() {
    if (curtainEl === null) curtainEl = one('[data-curtain]') || false;
    return curtainEl;
  }

  /* Raise, then run `after` once the page is covered. */
  function curtainRaise(after, holdMs) {
    var c = curtain();
    if (!c || reduceMotion.matches) { if (after) after(); return; }
    c.classList.add('is-on');
    setTimeout(function () { if (after) after(); }, holdMs === undefined ? 300 : holdMs);
  }

  function curtainDrop(delay) {
    var c = curtain();
    if (!c) return;
    setTimeout(function () { c.classList.remove('is-on'); }, delay === undefined ? 260 : delay);
  }

  window.MHK = window.MHK || {};
  window.MHK.curtain = { raise: curtainRaise, drop: curtainDrop };

  function initCurtain() {
    var c = curtain();
    if (!c) return;

    /* arriving from an internal navigation: lower it */
    var flagged = false;
    try { flagged = sessionStorage.getItem(CURTAIN_KEY) === '1'; } catch (e) {}
    if (flagged && !reduceMotion.matches) {
      try { sessionStorage.removeItem(CURTAIN_KEY); } catch (e) {}
      c.classList.add('is-on');
      /* wait for the fonts and the hero image before revealing, but never hang */
      var done = false;
      var lower = function () { if (done) return; done = true; curtainDrop(120); };
      if (document.readyState === 'complete') setTimeout(lower, 220);
      else window.addEventListener('load', function () { setTimeout(lower, 180); });
      setTimeout(lower, 1600);
    } else {
      try { sessionStorage.removeItem(CURTAIN_KEY); } catch (e) {}
    }

    /* leaving by an internal link: raise it, then navigate */
    if (window.__mhkArtifact) return;      /* the artifact routes instead */
    on(document, 'click', function (e) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      var a = e.target.closest('a[href]');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      var href = a.getAttribute('href');
      if (!href || /^(https?:|mailto:|tel:|#)/.test(href)) return;
      var here = location.pathname.split('/').pop() || 'index.html';
      if (href.split('#')[0].split('?')[0] === here) return;   /* same page */
      if (reduceMotion.matches) return;
      e.preventDefault();
      try { sessionStorage.setItem(CURTAIN_KEY, '1'); } catch (err) {}
      curtainRaise(function () { location.href = href; }, 280);
    });
  }

  /* ------------------------------------------------------------ header ---- */

  function initHeader() {
    var h = one('[data-header]');
    if (!h) return;
    var last = 0;
    function upd() {
      var y = window.scrollY;
      h.classList.toggle('is-stuck', y > 8);
      var drawerOpen = document.body.classList.contains('nav-open');
      h.classList.toggle('is-hidden', !drawerOpen && y > 420 && y > last + 4);
      last = y;
    }
    window.addEventListener('scroll', upd, { passive: true });
    upd();

    /* The sticky bar arrives after the hero, so it never covers the first view. */
    var bar = one('[data-mobar]');
    if (bar) {
      var barUp = function () { bar.classList.toggle('is-up', window.scrollY > 380); };
      window.addEventListener('scroll', barUp, { passive: true });
      barUp();
    }

    var burger = one('[data-burger]'), drawer = one('[data-drawer]');
    if (!burger || !drawer) return;
    function setOpen(open) {
      burger.setAttribute('aria-expanded', String(open));
      drawer.classList.toggle('is-open', open);
      drawer.setAttribute('aria-hidden', String(!open));
      document.body.classList.toggle('nav-open', open);
      if (open) { h.classList.remove('is-hidden'); }
    }
    on(burger, 'click', function () { setOpen(burger.getAttribute('aria-expanded') !== 'true'); });
    all('a', drawer).forEach(function (a) { on(a, 'click', function () { setOpen(false); }); });
    on(document, 'keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
    window.addEventListener('resize', function () { if (window.innerWidth >= 1080) setOpen(false); });
  }

  /* ----------------------------------------------------------- filters ---- */
  /* Filtering never reloads and never jumps: rows toggle in place, the count
     updates, and an empty state appears rather than a blank column. (§21, §125) */

  function initFilters() {
    all('[data-filter-root]').forEach(function (root) {
      var chips = all('[data-filter]', root);
      var items = all('[data-tags]', root);
      var count = one('[data-filter-count]', root);
      var empty = one('[data-filter-empty]', root);
      if (!chips.length) return;

      function apply(key, push) {
        var n = 0;
        items.forEach(function (it) {
          var tags = (it.dataset.tags || '').split(/\s+/);
          var show = key === 'all' || tags.indexOf(key) > -1;
          it.classList.toggle('is-hidden', !show);
          if (show) n++;
        });
        chips.forEach(function (c) { c.setAttribute('aria-pressed', String(c.dataset.filter === key)); });
        if (count) { count.textContent = String(n); }
        if (empty) empty.hidden = n > 0;
        root.dataset.filterActive = key;
        /* The single-file artifact routes on the hash, so writing a query
           string there would break the next reload. */
        if (push && !window.__mhkArtifact) {
          var u = new URL(location.href);
          if (key === 'all') u.searchParams.delete('f'); else u.searchParams.set('f', key);
          history.replaceState(null, '', u);
        }
        /* Collapse any open panel that just got filtered away. */
        all('[data-acc-btn][aria-expanded="true"]', root).forEach(function (b) {
          if (b.closest('[data-tags]') && b.closest('[data-tags]').classList.contains('is-hidden')) toggleAcc(b, false);
        });
      }

      chips.forEach(function (c) { on(c, 'click', function () { apply(c.dataset.filter, true); }); });

      /* per-chip counts */
      chips.forEach(function (c) {
        var k = c.dataset.filter;
        var n = k === 'all' ? items.length : items.filter(function (it) {
          return (it.dataset.tags || '').split(/\s+/).indexOf(k) > -1;
        }).length;
        var slot = one('[data-chip-n]', c);
        if (slot) slot.textContent = n;
        if (n === 0 && k !== 'all') c.hidden = true;
      });

      var initial = new URLSearchParams(window.__mhkQuery || location.search).get('f');
      apply(initial && chips.some(function (c) { return c.dataset.filter === initial; }) ? initial : 'all', false);
    });
  }

  /* --------------------------------------------------------- accordion ---- */

  /* Animating height on a panel that also toggles `hidden` has three traps:
       1. WebKit stalls a transition started in the same style pass the element
          stops being display:none — so commit the start height with a forced
          reflow first;
       2. `transitionend` can arrive early from a descendant, or never — so the
          resting state is set by a timer, not by the event;
       3. requestAnimationFrame does not fire in a background tab — so the state
          change must never be scheduled inside one, or the panel silently
          refuses to open for anyone whose tab was not focused.
     Everything here is therefore synchronous; the transition is decoration. */
  var ACC_MS = 300;

  function toggleAcc(btn, force) {
    var openNow = btn.getAttribute('aria-expanded') === 'true';
    var open = force === undefined ? !openNow : force;
    var panel = document.getElementById(btn.getAttribute('aria-controls'));
    btn.setAttribute('aria-expanded', String(open));
    if (!panel) return;
    var inner = panel.firstElementChild;
    if (!inner) return;
    clearTimeout(panel._accT);

    if (open) {
      panel.hidden = false;
      panel.style.height = '0px';
      void panel.offsetHeight;                       /* commit the closed state */
      panel.style.height = inner.getBoundingClientRect().height + 'px';
      panel._accT = setTimeout(function () { panel.style.height = 'auto'; }, ACC_MS);
    } else {
      panel.style.height = inner.getBoundingClientRect().height + 'px';
      void panel.offsetHeight;
      panel.style.height = '0px';
      panel._accT = setTimeout(function () { panel.hidden = true; }, ACC_MS);
    }
  }

  function initAccordions() {
    all('[data-acc-btn]').forEach(function (btn) {
      var panel = document.getElementById(btn.getAttribute('aria-controls'));
      if (panel) { panel.hidden = true; panel.style.height = '0px'; }
      on(btn, 'click', function () {
        var group = btn.closest('[data-acc-exclusive]');
        if (group && btn.getAttribute('aria-expanded') !== 'true') {
          all('[data-acc-btn][aria-expanded="true"]', group).forEach(function (o) { toggleAcc(o, false); });
        }
        toggleAcc(btn);
      });
    });
    /* Panels resize when the language changes length. */
    document.addEventListener('mhk:lang', function () {
      all('[data-acc-btn][aria-expanded="true"]').forEach(function (b) {
        var p = document.getElementById(b.getAttribute('aria-controls'));
        if (p) p.style.height = 'auto';
      });
    });
  }

  /* ---------------------------------------------------------- lightbox ---- */

  function initLightbox() {
    var lb = one('[data-lb-root]');
    if (!lb) return;
    /* Triggers live inside <main> and change with the page, so they are found
       at open time and handled by delegation rather than bound one by one. */
    var items = [];
    function collect() { items = all('[data-lb]'); return items; }
    var img = one('[data-lb-img]', lb), cap = one('[data-lb-caption]', lb),
        cnt = one('[data-lb-counter]', lb),
        prev = one('[data-lb-prev]', lb), next = one('[data-lb-next]', lb),
        close = one('[data-lb-close]', lb);
    var i = 0, opener = null;

    function visible() { return collect().filter(function (x) { return !x.classList.contains('is-hidden') && x.offsetParent !== null; }); }
    var list = [];

    function show(k) {
      list = visible().length ? visible() : items;
      i = (k + list.length) % list.length;
      var src = list[i];
      var im = src.querySelector('img');
      img.src = im.getAttribute('src');
      img.alt = im.getAttribute('alt') || '';
      var thc = src.dataset.lbCap || '', enc = src.dataset.lbCapEn || thc;
      cap.textContent = isEN() ? enc : thc;
      cap.dataset.thText = thc;
      cnt.textContent = (i + 1) + ' / ' + list.length;
    }
    function open(k, from) {
      opener = from; show(k);
      lb.classList.add('is-open'); lb.setAttribute('aria-hidden', 'false');
      document.body.classList.add('nav-open');
      close.focus();
    }
    function shut() {
      lb.classList.remove('is-open'); lb.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('nav-open');
      if (opener) opener.focus();
    }

    on(document, 'click', function (e) {
      var el = e.target.closest('[data-lb]');
      if (!el) return;
      e.preventDefault();
      var vis = visible();
      var idx = vis.indexOf(el);
      open(idx < 0 ? 0 : idx, el);
    });
    on(prev, 'click', function () { show(i - 1); });
    on(next, 'click', function () { show(i + 1); });
    on(close, 'click', shut);
    on(lb, 'click', function (e) { if (e.target === lb || e.target.classList.contains('lb__fig')) shut(); });
    on(document, 'keydown', function (e) {
      if (!lb.classList.contains('is-open')) return;
      if (e.key === 'Escape') shut();
      if (e.key === 'ArrowLeft') show(i - 1);
      if (e.key === 'ArrowRight') show(i + 1);
      if (e.key === 'Tab') {
        var f = all('button', lb);
        var first = f[0], lastEl = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
      }
    });
    /* swipe */
    var sx = 0;
    on(lb, 'touchstart', function (e) { sx = e.changedTouches[0].clientX; }, { passive: true });
    on(lb, 'touchend', function (e) {
      var d = e.changedTouches[0].clientX - sx;
      if (Math.abs(d) > 48) show(d < 0 ? i + 1 : i - 1);
    }, { passive: true });
    document.addEventListener('mhk:lang', function () { if (lb.classList.contains('is-open')) show(i); });
  }

  /* -------------------------------------------------------- calculator ---- */
  /* Pure geometry. No prices, no strength recommendations, no invented truck
     capacities — the load size is the customer's own input, and the result is
     handed to the plant to confirm. (SOURCES.md §B) */

  function initCalculator() {
    var root = one('[data-calc]');
    if (!root) return;

    var f = { shape: all('[name="shape"]', root) };
    var out = {
      vol: one('[data-calc-vol]', root),
      net: one('[data-calc-net]', root),
      waste: one('[data-calc-wastev]', root),
      loads: one('[data-calc-loads]', root),
      trucks: one('[data-calc-trucks]', root),
      note: one('[data-calc-note]', root),
      hand: one('[data-calc-handoff]', root)
    };
    var wrapSlab = one('[data-calc-group="slab"]', root),
        wrapCol = one('[data-calc-group="col"]', root),
        wrapCyl = one('[data-calc-group="cyl"]', root);

    /* Each shape reads its own fields, so switching shape can never pick up a
       dimension left behind by another one. */
    function num(key, fallback) {
      var el = one('[data-calc="' + key + '"]', root);
      if (!el) return fallback;
      var v = parseFloat(el.value);
      return isFinite(v) && v >= 0 ? v : fallback;
    }
    function shape() {
      var s = f.shape.filter(function (r) { return r.checked; })[0];
      return s ? s.value : 'slab';
    }

    function calc() {
      var s = shape();
      if (wrapSlab) wrapSlab.hidden = s !== 'slab';
      if (wrapCol) wrapCol.hidden = s !== 'col';
      if (wrapCyl) wrapCyl.hidden = s !== 'cyl';

      var n = Math.max(1, Math.round(num('n', 1)));
      var net = 0;
      if (s === 'slab') {
        /* m × m × cm→m */
        net = num('slab-l', 0) * num('slab-w', 0) * (num('slab-t', 0) / 100) * n;
      } else if (s === 'col') {
        /* cm→m × cm→m × m */
        net = (num('col-a', 0) / 100) * (num('col-b', 0) / 100) * num('col-h', 0) * n;
      } else {
        /* π r² × m, radius from a diameter in cm */
        var r = (num('cyl-d', 0) / 100) / 2;
        net = Math.PI * r * r * num('cyl-h', 0) * n;
      }
      var wpc = num('waste', 5);
      var wv = net * (wpc / 100);
      var total = net + wv;
      var cap = Math.max(0.5, num('truck', 6));
      var loads = total > 0 ? total / cap : 0;

      out.net.textContent = net.toFixed(2);
      out.waste.textContent = wv.toFixed(2);
      out.vol.textContent = total.toFixed(2);
      out.loads.textContent = total > 0 ? (Math.ceil(loads - 1e-9) || 1) : 0;

      if (out.trucks) {
        out.trucks.innerHTML = '';
        var full = Math.floor(loads + 1e-9);
        var rem = loads - full;
        var draw = Math.min(full, 24);
        for (var k = 0; k < draw; k++) {
          var d = document.createElement('span'); d.className = 'calc__truck is-full'; out.trucks.appendChild(d);
        }
        if (rem > 0.01 && full < 24) {
          var p = document.createElement('span'); p.className = 'calc__truck is-part';
          p.style.setProperty('--fill', (rem * 100).toFixed(0) + '%');
          out.trucks.appendChild(p);
        }
        if (full > 24) {
          var more = document.createElement('span');
          more.className = 'mono'; more.style.marginInlineStart = '6px';
          more.textContent = '+' + (full - 24);
          out.trucks.appendChild(more);
        }
      }

      if (out.hand) {
        out.hand.dataset.vol = total.toFixed(2);
        var href = 'contact.html?vol=' + encodeURIComponent(total.toFixed(2));
        out.hand.setAttribute('href', href);
      }
    }

    all('input, select', root).forEach(function (el) {
      on(el, 'input', calc); on(el, 'change', calc);
    });
    all('[data-step]', root).forEach(function (b) {
      on(b, 'click', function () {
        var target = one(b.dataset.stepTarget, root);
        if (!target) return;
        var stepv = parseFloat(target.step || '1') || 1;
        var v = (parseFloat(target.value) || 0) + parseFloat(b.dataset.step) * stepv;
        var min = parseFloat(target.min); if (isFinite(min)) v = Math.max(min, v);
        target.value = Math.round(v * 1000) / 1000;
        calc();
      });
    });
    calc();
    document.addEventListener('mhk:lang', calc);
  }

  /* -------------------------------------------------- multi-step form ---- */

  function initEnquiry() {
    var form = one('[data-enq]');
    if (!form) return;
    var panels = all('[data-enq-step]', form);
    var dots = all('[data-enq-dot]', form);
    var back = one('[data-enq-back]', form);
    var next = one('[data-enq-next]', form);
    var submit = one('[data-enq-submit]', form);
    var live = one('[data-enq-live]', form);
    var okBox = one('[data-enq-ok]');
    var step = 0;

    /* Prefill from the calculator hand-off. */
    var qv = new URLSearchParams(window.__mhkQuery || location.search).get('vol');
    if (qv) {
      var volField = one('[name="volume"]', form);
      if (volField && !volField.value) volField.value = qv;
    }

    function render() {
      panels.forEach(function (p, i) { p.hidden = i !== step; });
      dots.forEach(function (d, i) {
        d.classList.toggle('is-on', i === step);
        d.classList.toggle('is-done', i < step);
      });
      back.hidden = step === 0;
      next.hidden = step === panels.length - 1;
      submit.hidden = step !== panels.length - 1;
      if (live) live.textContent = t('ขั้นตอนที่ ', 'Step ') + (step + 1) + t(' จาก ', ' of ') + panels.length;
      var firstField = panels[step].querySelector('input, select, textarea');
      if (firstField) firstField.focus({ preventScroll: true });
      form.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    /* Required-ness and format are separate checks. An optional email is still
       worth checking once it has been typed into — a mistyped address the plant
       cannot reply to is exactly the failure the form exists to prevent. */
    function validate(scope) {
      var ok = true;
      all('[required], input[type="email"], input[type="tel"]', scope).forEach(function (el) {
        var err = one('#' + el.id + '-err');
        var val = (el.value || '').trim();
        var bad = false, msg = '';
        if (el.hasAttribute('required') && !val) {
          bad = true; msg = t('กรุณากรอกข้อมูลนี้', 'This field is required');
        } else if (val && el.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val)) {
          bad = true; msg = t('อีเมลไม่ถูกต้อง', 'Enter a valid email');
        } else if (val && el.type === 'tel' && val.replace(/[^0-9]/g, '').length < 9) {
          bad = true; msg = t('เบอร์โทรไม่ถูกต้อง', 'Enter a valid phone number');
        }
        el.setAttribute('aria-invalid', String(bad));
        if (err) err.textContent = bad ? msg : '';
        if (bad && ok) { el.focus(); ok = false; }
      });
      return ok;
    }

    on(next, 'click', function () {
      if (!validate(panels[step])) return;
      step = Math.min(panels.length - 1, step + 1); render();
    });
    on(back, 'click', function () { step = Math.max(0, step - 1); render(); });
    all('[required]', form).forEach(function (el) {
      on(el, 'blur', function () { if (el.value.trim()) { el.setAttribute('aria-invalid', 'false'); var e2 = one('#' + el.id + '-err'); if (e2) e2.textContent = ''; } });
    });

    on(form, 'submit', function (e) {
      e.preventDefault();
      /* Check step by step: a field that fails two steps back has to be brought
         on screen before it can be focused, or the error is invisible. */
      for (var s = 0; s < panels.length; s++) {
        if (!validate(panels[s])) {
          if (s !== step) { step = s; render(); }
          return;
        }
      }
      /* No backend is wired up. Rather than fake a success state (§128), the
         form composes the enquiry and hands it to a real channel the plant
         actually answers. */
      var d = new FormData(form);
      var lines = [];
      all('[name]', form).forEach(function (el) {
        if (el.type === 'radio' && !el.checked) return;
        if (!el.value || !el.value.trim()) return;
        var lab = el.dataset.label || el.name;
        lines.push(lab + ': ' + el.value.trim());
      });
      var body = lines.join('\n');
      var subject = t('ขอใบเสนอราคาคอนกรีตผสมเสร็จ', 'Ready-mix concrete enquiry');
      okBox.hidden = false;
      one('[data-enq-body]').textContent = body;
      one('[data-enq-mail]').setAttribute('href',
        'mailto:mahakrang.concrete@gmail.com?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body));
      okBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      okBox.querySelector('[data-enq-copy]').focus();
    });

    var copyBtn = one('[data-enq-copy]');
    on(copyBtn, 'click', function () {
      var txt = one('[data-enq-body]').textContent;
      var done = function () {
        var l = copyBtn.querySelector('[data-copy-label]');
        var prev = l.textContent;
        l.textContent = t('คัดลอกแล้ว', 'Copied');
        setTimeout(function () { l.textContent = prev; }, 1800);
      };
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, done);
      else {
        var ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta);
        ta.select(); try { document.execCommand('copy'); } catch (err) {} document.body.removeChild(ta); done();
      }
    });

    /* file list — files are listed locally and named in the message; nothing is
       uploaded, because there is no server to receive them (§75). */
    var fileIn = one('[data-enq-file]', form);
    var drop = one('[data-enq-drop]', form);
    var list = one('[data-enq-files]', form);
    var files = [];
    function renderFiles() {
      list.innerHTML = '';
      files.forEach(function (fl, i) {
        var li = document.createElement('li');
        var kb = fl.size > 1048576 ? (fl.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(fl.size / 1024)) + ' KB';
        li.innerHTML = '<span>' + fl.name.replace(/[<>&]/g, '') + '</span><span class="mono">' + kb + '</span>';
        var b = document.createElement('button');
        b.type = 'button'; b.innerHTML = '&times;';
        b.setAttribute('aria-label', t('เอาไฟล์ออก', 'Remove file') + ' ' + fl.name);
        b.onclick = function () { files.splice(i, 1); renderFiles(); };
        li.appendChild(b); list.appendChild(li);
      });
      var nameField = one('[name="attachments"]', form);
      if (nameField) nameField.value = files.map(function (x) { return x.name; }).join(', ');
    }
    on(fileIn, 'change', function () {
      Array.prototype.forEach.call(fileIn.files, function (fl) { if (files.length < 6) files.push(fl); });
      fileIn.value = ''; renderFiles();
    });
    if (drop) {
      ['dragenter', 'dragover'].forEach(function (ev) { on(drop, ev, function (e) { e.preventDefault(); drop.classList.add('is-over'); }); });
      ['dragleave', 'drop'].forEach(function (ev) { on(drop, ev, function (e) { e.preventDefault(); drop.classList.remove('is-over'); }); });
      on(drop, 'drop', function (e) {
        Array.prototype.forEach.call(e.dataTransfer.files, function (fl) { if (files.length < 6) files.push(fl); });
        renderFiles();
      });
    }

    render();
    document.addEventListener('mhk:lang', function () { if (live) render(); });
  }

  /* ------------------------------------------------- current nav marker ---- */

  function initCurrentNav() {
    var here = location.pathname.split('/').pop() || 'index.html';
    all('[data-nav]').forEach(function (a) {
      if (a.getAttribute('href') === here) a.setAttribute('aria-current', 'page');
    });
  }

  /* ------------------------------------------------------------- boot ---- */
  /* Chrome (header, drawer, lightbox shell) is bound once; everything that
     lives inside <main> is bound per page, so the single-file artifact can
     swap pages and re-run exactly the same initialisers the site uses. */

  function bootPage() {
    initFilters(); initAccordions(); initCalculator(); initEnquiry(); initCurrentNav();
  }

  /* The language toggle repaints every string on the page, so it gets the same
     cover as a page change. i18n does the swap; this only decides when. */
  function initLangCurtain() {
    on(document, 'click', function (e) {
      var b = e.target.closest('[data-lang-btn]');
      if (!b || reduceMotion.matches) return;
      if (b.getAttribute('aria-pressed') === 'true') return;   /* already there */
      if (!curtain()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      var lang = b.dataset.langBtn;
      curtainRaise(function () {
        window.MHK.lang.set(lang);
        curtainDrop(200);
      }, 280);
    }, true);
  }

  window.MHK = window.MHK || {};
  window.MHK.bootApp = bootPage;
  window.MHK.boot = function () {
    if (window.MHK.bootMotion) window.MHK.bootMotion();
    bootPage();
  };

  initCurtain();
  initLangCurtain();
  initHeader();
  initLightbox();
  bootPage();
})();
