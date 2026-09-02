/* ==========================================================================
   motion — reveals, count-ups, sticky sequences, THE CUBE, cursor.
   No animation library: ~6KB of IntersectionObserver + rAF beats 70KB of GSAP
   for what this site actually does, and it degrades cleanly on slow devices.
   Reduced motion is honoured by *keeping all content*, only removing movement.
   ========================================================================== */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  var raf = window.requestAnimationFrame.bind(window);

  function on(el, ev, fn, o) { el.addEventListener(ev, fn, o); }
  function all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* innerHeight is 0 in a hidden tab and in a frame that has not been sized
     yet — including, potentially, the frame an Artifact is viewed in. Anything
     that gates visibility on the viewport has to cope with not knowing it. */
  function viewportH() {
    return window.innerHeight || document.documentElement.clientHeight ||
           (window.visualViewport && window.visualViewport.height) || 0;
  }
  var revealSafety = null;

  /* ------------------------------------------------------------ reveal ---- */

  function reveals() {
    var els = all('[data-reveal]');
    if (!els.length) return;
    if (reduce.matches || !('IntersectionObserver' in window)) {
      els.forEach(function (e) { e.classList.add('is-in'); });
      return;
    }

    /* Anything already on screen is revealed synchronously. Waiting for the
       observer's first callback for above-the-fold content is a real failure
       mode — it is deferred in a background tab and during prerender, which
       leaves someone looking at a blank page — and it delays first paint of
       the text that matters most. The observer only handles what is below. */
    var vh = viewportH();
    if (!vh || document.hidden) document.documentElement.classList.add('reveal-instant');
    if (!vh) {                     /* cannot measure: never hide what we can't place */
      els.forEach(function (e) { e.classList.add('is-in'); });
      return;
    }

    var below = [];
    els.forEach(function (el) {
      if (el.classList.contains('is-in')) return;
      if (el.getBoundingClientRect().top < vh * 0.92) el.classList.add('is-in');
      else below.push(el);
    });
    if (!below.length) return;

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });

    below.forEach(function (el) {
      var g = el.closest('[data-reveal-group]');
      if (g && !el.style.getPropertyValue('--reveal-delay')) {
        var sibs = all('[data-reveal]', g);
        el.style.setProperty('--reveal-delay', (sibs.indexOf(el) * 55) + 'ms');
      }
      io.observe(el);
    });

    /* Last line of defence. If the observer has still not reported after a
       second and a half — throttled, zero-sized frame, prerender — show
       everything rather than leave any of it unreadable. Content is never
       allowed to depend on an animation succeeding. */
    clearTimeout(revealSafety);
    revealSafety = setTimeout(function () {
      if (!viewportH()) { below.forEach(function (e) { e.classList.add('is-in'); }); return; }
      below.forEach(function (e) {
        if (e.getBoundingClientRect().top < viewportH()) e.classList.add('is-in');
      });
    }, 1500);
  }

  /* ----------------------------------------------------------- count-up ---- */

  function counters() {
    var els = all('[data-count]');
    if (!els.length) return;
    var run = function (el) {
      var to = parseFloat(el.dataset.count);
      var dp = parseInt(el.dataset.countDp || '0', 10);
      if (reduce.matches) { el.textContent = to.toFixed(dp); return; }
      var t0 = null, dur = 1100;
      var step = function (t) {
        if (t0 === null) t0 = t;
        var p = Math.min(1, (t - t0) / dur);
        var e = 1 - Math.pow(1 - p, 3);
        el.textContent = (to * e).toFixed(dp);
        if (p < 1) raf(step);
      };
      raf(step);
    };
    if (!('IntersectionObserver' in window)) { els.forEach(run); return; }
    /* Same reasoning as reveals(): a number already on screen counts up now
       rather than waiting for an observer callback that may be deferred. */
    var vh = viewportH();
    if (!vh) { els.forEach(function (e) { e.dataset.counted = '1'; run(e); }); return; }
    var below = [];
    els.forEach(function (e) {
      if (e.dataset.counted) return;
      var r = e.getBoundingClientRect();
      if (r.top < vh && r.bottom > 0) { e.dataset.counted = '1'; run(e); }
      else below.push(e);
    });
    if (!below.length) return;
    var io = new IntersectionObserver(function (en) {
      en.forEach(function (x) {
        if (!x.isIntersecting || x.target.dataset.counted) return;
        x.target.dataset.counted = '1'; run(x.target); io.unobserve(x.target);
      });
    }, { threshold: 0.5 });
    below.forEach(function (e) { io.observe(e); });
  }

  /* ------------------------------------------------- scroll progress util ---- */

  var tracks = [];
  function track(el, cb) { tracks.push({ el: el, cb: cb }); }

  var ticking = false;
  function measure() {
    var vh = window.innerHeight;
    tracks.forEach(function (t) {
      var r = t.el.getBoundingClientRect();
      var total = r.height - vh;
      var p = total > 0 ? (-r.top) / total : (r.top < vh * 0.4 ? 1 : 0);
      t.cb(Math.max(0, Math.min(1, p)));
    });
    ticking = false;
  }
  function onScroll() { if (!ticking) { ticking = true; raf(measure); } }

  /* ------------------------------------------------------ THE CUBE (§46) ---- */
  /* One cubic metre, from stockpile to break test. Seven stages tied to scroll.
     Deliberately resolves to "BATCH RECORDED", not a strength figure — the
     company publishes none and the site will not invent one. */

  function cube() {
    var root = document.querySelector('[data-cube]');
    if (!root) return;
    var items = all('[data-cube-stage]', root);
    var layers = all('[data-cube-layer]', root);
    var solid = root.querySelector('[data-cube-solid]');
    var mould = root.querySelector('[data-cube-mould]');
    var platen = root.querySelector('[data-cube-platen]');
    var crack = root.querySelector('[data-cube-crack]');
    var spin = root.querySelector('[data-cube-spin]');
    var days = root.querySelector('[data-cube-days]');
    var done = root.querySelector('[data-cube-done]');
    var n = items.length;
    var last = -1;

    function setStage(i, sub) {
      if (i !== last) {
        items.forEach(function (it, k) { it.classList.toggle('is-on', k === i); });
        last = i;
      }
      /* 0 aggregate · 1 cement · 2 water · 3 mix · 4 cast · 5 cure · 6 break
         Layers stack bottom-up through stages 0–2, then dissolve into one
         mixed specimen from stage 3 on. */
      var mixed = i >= 3;
      layers.forEach(function (L, k) {
        var shown = !mixed && k <= i;
        L.style.opacity = shown ? '1' : '0';
        L.style.transform = shown ? 'none' : 'translateY(26px)';
      });
      if (solid) solid.style.opacity = mixed ? '1' : '0';
      if (spin) {
        /* The specimen is handled while it is cast and cured, then set square
           in the machine — a platen that arrives at an angle reads as wrong. */
        var rot = i === 3 ? -6 : (i === 4 ? -13 : (i === 5 ? -5 : 0));
        spin.style.transform = 'rotate(' + rot + 'deg)';
      }
      if (mould) {
        mould.style.opacity = i >= 5 ? '0' : (i >= 4 ? '1' : '0.45');
        mould.style.transform = i >= 5 ? 'translateY(14px)' : 'none';
      }
      if (days) {
        var d = i < 5 ? 0 : (i === 5 ? Math.round(sub * 28) : 28);
        days.textContent = d ? d + ' / 28' : '—';
      }
      if (platen) {
        var drop = i === 6 ? 8 + sub * 16 : 0;
        platen.style.transform = 'translateY(' + drop + 'px)';
        platen.style.opacity = i >= 6 ? '1' : '0';
      }
      if (crack) crack.style.opacity = (i === 6 && sub > 0.62) ? '1' : '0';
      if (done) done.classList.toggle('is-on', i === 6 && sub > 0.72);
    }

    var trackEl = root.querySelector('[data-cube-track]');
    var desktop = window.matchMedia('(min-width: 900px)');

    function bindScroll() {
      if (reduce.matches || !desktop.matches) {
        root.classList.add('no-motion');
        items.forEach(function (it) { it.classList.add('is-on'); });
        setStage(6, 1);
        if (days) days.textContent = '28 / 28';
        return;
      }
      root.classList.remove('no-motion');
      track(trackEl, function (p) {
        var f = p * n;
        var i = Math.min(n - 1, Math.floor(f));
        setStage(i, f - i);
      });
    }
    bindScroll();

    /* stage markers are buttons: clicking scrolls to that stage's slice */
    items.forEach(function (it, k) {
      on(it, 'click', function () {
        if (reduce.matches || !desktop.matches) return;
        var r = trackEl.getBoundingClientRect();
        var total = r.height - window.innerHeight;
        var y = window.scrollY + r.top + total * ((k + 0.45) / n);
        window.scrollTo({ top: y, behavior: 'smooth' });
      });
    });
  }

  /* ------------------------------------------- sticky process sequence ---- */

  function sequences() {
    all('[data-seq]').forEach(function (root) {
      var items = all('[data-seq-i]', root);
      var frames = all('[data-seq-img]', root);
      var prog = root.querySelector('[data-seq-prog]');
      var tag = root.querySelector('[data-seq-tag]');
      if (!items.length) return;

      function show(i) {
        items.forEach(function (it, k) { it.classList.toggle('is-on', k === i); });
        frames.forEach(function (f, k) { f.classList.toggle('is-on', k === i); });
        if (tag) {
          var t = items[i].dataset.seqTag || '';
          var te = items[i].dataset.seqTagEn || t;
          tag.textContent = document.documentElement.lang === 'en' ? te : t;
          tag.dataset.seqTag = t; tag.dataset.seqTagEn = te;
        }
        if (prog) prog.style.setProperty('--seq-progress', (((i + 1) / items.length) * 100) + '%');
      }

      if (reduce.matches || !('IntersectionObserver' in window)) {
        /* All stages stay legible; only the scroll-driven emphasis is dropped. */
        items.forEach(function (it) { it.classList.add('is-on'); });
        if (prog) prog.style.setProperty('--seq-progress', '100%');
        frames.forEach(function (f, k) { f.classList.toggle('is-on', k === 0); });
      } else {
        var io = new IntersectionObserver(function (en) {
          en.forEach(function (x) {
            if (x.isIntersecting) show(items.indexOf(x.target));
          });
        }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
        items.forEach(function (it) { io.observe(it); });
        show(0);
      }

      items.forEach(function (it, k) { on(it, 'mouseenter', function () { if (fine.matches) show(k); }); });
      document.addEventListener('mhk:lang', function () {
        if (!items[0] || !items[0].isConnected) return;   /* stale after a page swap */
        var on_ = items.findIndex(function (x) { return x.classList.contains('is-on'); });
        show(on_ < 0 ? 0 : on_);
      });
    });
  }

  /* --------------------------------------------- index hover preview ---- */

  function previews() {
    all('[data-preview-root]').forEach(function (root) {
      var imgs = all('[data-preview-img]', root);
      var rows = all('[data-preview]', root);
      if (!imgs.length) return;
      function show(key) {
        imgs.forEach(function (im) { im.classList.toggle('is-on', im.dataset.previewImg === key); });
      }
      show(rows.length ? rows[0].dataset.preview : '');
      rows.forEach(function (r) {
        on(r, 'mouseenter', function () { if (fine.matches) show(r.dataset.preview); });
        on(r, 'focus', function () { show(r.dataset.preview); });
      });
    });
  }

  /* ------------------------------------------------------ hero parallax ---- */
  /* Very low amplitude. Enough to feel alive, not enough to notice. (§18) */

  function hero() {
    var img = document.querySelector('[data-hero-img]');
    if (!img || reduce.matches) return;
    var wrapEl = img.parentElement;
    track(wrapEl, function (p) { img.style.transform = 'scale(1.06) translate3d(0,' + (p * 26) + 'px,0)'; });

    if (!fine.matches) return;
    var tx = 0, ty = 0, cx = 0, cy = 0, running = false;
    on(window, 'pointermove', function (e) {
      tx = (e.clientX / window.innerWidth - 0.5) * 14;
      ty = (e.clientY / window.innerHeight - 0.5) * 10;
      if (!running) { running = true; raf(loop); }
    }, { passive: true });
    function loop() {
      cx += (tx - cx) * 0.06; cy += (ty - cy) * 0.06;
      img.style.setProperty('--px', cx.toFixed(2) + 'px');
      img.style.setProperty('--py', cy.toFixed(2) + 'px');
      img.style.transformOrigin = 'calc(50% + ' + cx.toFixed(2) + 'px) calc(50% + ' + cy.toFixed(2) + 'px)';
      if (Math.abs(tx - cx) > 0.05 || Math.abs(ty - cy) > 0.05) raf(loop); else running = false;
    }
  }

  /* ------------------------------------------------------- auto strip ---- */

  function strips() {
    all('[data-strip]').forEach(function (strip) {
      var trackEl = strip.querySelector('.strip__track');
      if (!trackEl || reduce.matches) return;
      /* duplicate for a seamless loop */
      trackEl.innerHTML += trackEl.innerHTML;
      var w = trackEl.scrollWidth / 2;
      var speed = parseFloat(strip.dataset.strip) || 34;
      var css = document.createElement('style');
      var name = 'strip' + Math.floor(w);
      css.textContent = '@keyframes ' + name + '{from{transform:translate3d(0,0,0)}to{transform:translate3d(-' + w + 'px,0,0)}}';
      document.head.appendChild(css);
      trackEl.style.animation = name + ' ' + (w / speed) + 's linear infinite';

      var pause = strip.querySelector('[data-strip-pause]');
      if (pause) on(pause, 'click', function () {
        var p = strip.classList.toggle('is-paused');
        pause.setAttribute('aria-pressed', String(p));
        var l = pause.querySelector('[data-strip-label]');
        if (l) { l.dataset.thText = l.dataset.thText || l.textContent; }
      });
    });
  }

  /* ---------------------------------------------------------- cursor ---- */

  function cursor() {
    if (!fine.matches || reduce.matches) return;
    var el = document.createElement('div');
    el.className = 'cursor';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    var x = 0, y = 0, cx = 0, cy = 0, live = false;
    on(window, 'pointermove', function (e) {
      x = e.clientX; y = e.clientY;
      if (!live) { live = true; cx = x; cy = y; raf(loop); }
      var t = e.target.closest('[data-cursor]');
      if (t) {
        var lab = document.documentElement.lang === 'en' ? (t.dataset.cursorEn || t.dataset.cursor) : t.dataset.cursor;
        el.textContent = lab;
        el.classList.add('is-on');
      } else {
        el.classList.remove('is-on');
      }
    }, { passive: true });
    on(document, 'mouseleave', function () { el.classList.remove('is-on'); });
    function loop() {
      cx += (x - cx) * 0.18; cy += (y - cy) * 0.18;
      el.style.transform = 'translate3d(' + cx + 'px,' + cy + 'px,0)' + (el.classList.contains('is-on') ? ' scale(1)' : ' scale(.3)');
      raf(loop);
    }
  }

  /* -------------------------------------------------------------- go ---- */

  /* Everything that reads the DOM inside <main> re-runs on a page swap; the
     cursor and the scroll plumbing are global and bind once. `tracks` is reset
     each time so scroll callbacks never point at detached nodes. */
  function bootMotion() {
    tracks.length = 0;
    reveals(); counters(); cube(); sequences(); previews(); hero(); strips();
    measure();
  }

  function init() {
    document.documentElement.classList.remove('no-js');
    cursor();
    on(window, 'scroll', onScroll, { passive: true });
    on(window, 'resize', onScroll, { passive: true });
    bootMotion();
    /* If the page started life hidden or unsized, redo the pass once it is
       actually on screen so the reveal budget is spent where it can be seen. */
    on(document, 'visibilitychange', function () {
      if (document.hidden) return;
      bootMotion();
      /* animations are worth having again now that frames will actually run */
      setTimeout(function () { document.documentElement.classList.remove('reveal-instant'); }, 60);
    });
    on(window, 'pageshow', function () { bootMotion(); });
  }

  window.MHK = window.MHK || {};
  window.MHK.bootMotion = bootMotion;

  if (document.readyState === 'loading') on(document, 'DOMContentLoaded', init);
  else init();
})();
