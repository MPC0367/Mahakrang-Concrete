// Home hero slideshow (spec p18). One ordered slide list for every viewport.
//
// Timing model: an image slide's viewing time is a Web Animation on its progress segment, created
// only once the image has loaded (loading never eats viewing time) and paused/resumed with the
// carousel. A video slide's progress is the video clock itself, so buffering pauses it naturally;
// it advances on `ended` or at the editor's duration, whichever comes first.
//
// Rotation is the user-level state behind the play/pause button. Temporary holds (hover, keyboard
// focus inside, hidden tab, an open dialog, hero scrolled away, page hidden) pause it without
// changing that state. An explicit pause is never undone automatically. Reduced motion or an
// editor-disabled autoplay starts with rotation off; the controls still work.
import { $, $$, announce, reducedMotion } from './lib.js?v=e54e45d75f';

const root = $('[data-hm-carousel]');
if (root) setup(root);
wireJump();

function setup(root) {
  const slides = $$('[data-hm-slide]', root);
  const n = slides.length;
  if (!n) return;

  const L = root.dataset;
  const slidesEl = $('#hm-slides', root);
  const toggleBtn = $('[data-hm-toggle]', root);
  const segs = $$('[data-hm-go]', root);
  const countEl = $('[data-hm-count]', root);
  const mqMobile = window.matchMedia('(max-width: 767px)');

  let index = Math.max(0, slides.findIndex((s) => s.classList.contains('is-active')));
  let rotating = L.autoplay !== 'false' && !reducedMotion();
  const holds = new Set();
  const st = slides.map(() => ({ hydrated: false, failed: false, videoFailed: false }));
  st[index].hydrated = true;                      // the first slide is server-rendered with real sources
  let anim = null;                                // progress animation of the active image slide
  let raf = 0;                                    // progress loop of the active video slide
  let token = 0;                                  // bumps on every activation; stale callbacks bail out
  let skipTimer = 0;
  const offs = [];
  const on = (el, ev, fn, opt) => { if (!el) return; el.addEventListener(ev, fn, opt); offs.push(() => el.removeEventListener(ev, fn, opt)); };

  const videoOf = (i) => $('video', slides[i]);
  const imgOf = (i) => $('.hm-slide__img', slides[i]);
  const fillOf = (i) => (segs[i] ? $('.hm-seg__fill', segs[i]) : null);
  const durOf = (i) => Math.max(2000, Number(slides[i].dataset.dur) || 6000);
  const plays = (i) => {
    if (slides[i].dataset.type !== 'video' || st[i].videoFailed) return false;
    const v = videoOf(i);
    return !!v && !(mqMobile.matches && v.dataset.mobile === 'image');
  };
  const running = () => rotating && holds.size === 0;

  // ------------------------------------------------------------ media loading (at most the next slide ahead)
  // A prefetch keeps the server-rendered fetchpriority=low; a slide shown before its still arrived
  // (a quick tap on "next") is the visible content, so it goes first in line.
  function hydrate(i, now = false) {
    if (st[i].hydrated) return;
    st[i].hydrated = true;
    $$('source[data-srcset]', slides[i]).forEach((el) => { el.srcset = el.dataset.srcset; el.removeAttribute('data-srcset'); });
    $$('img[data-src]', slides[i]).forEach((el) => {
      if (now) el.fetchPriority = 'high';
      const done = () => el.classList.add('is-loaded');
      el.addEventListener('load', done, { once: true });
      el.src = el.dataset.src; el.removeAttribute('data-src');
      if (el.complete && el.naturalWidth) done();
    });
  }

  function prepVideo(i, full) {
    const v = videoOf(i);
    if (!v || !plays(i)) return null;
    v.preload = full ? 'auto' : 'metadata';
    if (!v.dataset.wired) {
      v.dataset.wired = '1';
      v.muted = true; v.defaultMuted = true; v.playsInline = true; v.loop = n === 1;
      v.addEventListener('playing', () => { v.classList.add('is-playing'); if (slides[index] === slides[i]) loop(i, v, token); });
      v.addEventListener('ended', () => { if (i === index && n > 1) go(index + 1, false); });
      v.addEventListener('error', () => onVideoError(i));
      const url = mqMobile.matches && v.dataset.srcM ? v.dataset.srcM : v.dataset.src;
      if (url) v.src = url;
    }
    return v;
  }

  function onVideoError(i) {
    st[i].videoFailed = true;
    const v = videoOf(i);
    if (v) { v.classList.remove('is-playing'); v.removeAttribute('src'); v.load(); }
    if (i === index) begin(false);                // fall back to the poster as a still slide
  }

  function imageReady(i) {
    const img = imgOf(i);
    return new Promise((resolve) => {
      if (!img) return resolve(false);
      if (img.complete && img.getAttribute('src')) return resolve(img.naturalWidth > 0);
      img.addEventListener('load', () => resolve(img.naturalWidth > 0), { once: true });
      img.addEventListener('error', () => resolve(false), { once: true });
    });
  }

  function prefetchNext(i) {
    if (n < 2) return;
    const j = (i + 1) % n;
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 400));
    idle(() => hydrate(j), { timeout: 2500 });   // the next still/poster only; video data loads when its slide is shown
  }

  // ------------------------------------------------------------ progress
  function cancelProgress() {
    if (anim) { anim.onfinish = null; anim.cancel(); anim = null; }
    cancelAnimationFrame(raf); raf = 0;
    clearTimeout(skipTimer);
  }
  function setFill(i, p) { const f = fillOf(i); if (f) f.style.transform = `scaleX(${p})`; }

  function startStill(i, t) {
    cancelProgress();
    const fill = fillOf(i);
    if (fill && n > 1) {
      fill.style.transform = '';
      anim = fill.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: durOf(i), easing: 'linear', fill: 'forwards' });
      anim.onfinish = () => { if (t === token) go(index + 1, false); };
      if (!running()) anim.pause();
    }
    prefetchNext(i);
  }

  function loop(i, v, t) {
    cancelAnimationFrame(raf);
    const tick = () => {
      if (t !== token || i !== index) return;
      const vd = Number.isFinite(v.duration) && v.duration > 0 ? v.duration * 1000 : Infinity;
      const end = Math.min(durOf(i), vd);
      const p = Number.isFinite(end) ? Math.min(1, (v.currentTime * 1000) / end) : 0;
      setFill(i, p);
      if (p >= 1 && n > 1) { go(index + 1, false); return; }
      if (!v.paused) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  function playVideo(v) {
    const p = v.play();
    if (p && typeof p.catch === 'function') {
      p.catch((err) => {
        // Autoplay refused: keep the poster and show "play". Not an explicit pause, but rotation stops here.
        if (err && err.name === 'NotAllowedError') { rotating = false; sync(); }
      });
    }
  }

  // ------------------------------------------------------------ activation
  function begin(manual) {
    const i = index, t = token;
    hydrate(i, true);
    cancelProgress();
    if (plays(i)) {
      const v = prepVideo(i, true);
      setFill(i, 0);
      if (v && running()) playVideo(v);
      prefetchNext(i);
      sync();
      return;
    }
    imageReady(i).then((ok) => {
      if (t !== token) return;
      if (ok || manual) { slides[i].classList.toggle('is-failed', !ok); startStill(i, t); sync(); return; }
      // a failed image never becomes an endless spinner: move on (unless every slide failed)
      st[i].failed = true;
      slides[i].classList.add('is-failed');
      if (st.every((s) => s.failed)) return;
      if (running()) skipTimer = setTimeout(() => { if (t === token) go(index + 1, false); }, 300);
      else startStill(i, t);
    });
  }

  function go(to, manual) {
    const i = ((to % n) + n) % n;
    if (i === index) { if (manual) { token++; begin(true); } return; }
    const prev = index;
    const hadFocus = slides[prev].contains(document.activeElement);
    index = i; token++;
    cancelProgress();
    // only the active video plays: pause the previous one and rewind it once it has faded out
    const pv = videoOf(prev);
    if (pv) { pv.pause(); const t = token; setTimeout(() => { if (index !== prev || t !== token) { try { pv.currentTime = 0; } catch { /* not seekable yet */ } pv.classList.remove('is-playing'); } }, 800); }
    slides.forEach((s, k) => {
      const active = k === i;
      s.classList.toggle('is-active', active);
      s.classList.toggle('is-leaving', k === prev);
      s.inert = !active;
      if (active) s.removeAttribute('aria-hidden'); else s.setAttribute('aria-hidden', 'true');
    });
    segs.forEach((b, k) => {
      if (k === i) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
      if (k !== i) setFill(k, 0);
    });
    if (countEl) countEl.textContent = String(i + 1).padStart(2, '0');
    if (hadFocus) ($('a[href], button', slides[i]) || slidesEl).focus({ preventScroll: true });
    if (manual) announce(`${L.lSlide} ${i + 1} ${L.lOf} ${n}: ${slides[i].dataset.title || ''}`);
    begin(manual);
  }

  // apply the run state to whatever is active
  function sync() {
    const run = running();
    if (anim) { if (run) anim.play(); else anim.pause(); }
    if (plays(index)) {
      const v = videoOf(index);
      if (v && v.dataset.wired) { if (run) { if (v.paused) playVideo(v); } else if (!v.paused) v.pause(); }
    }
    root.classList.toggle('is-rotating', rotating);
    if (toggleBtn) toggleBtn.setAttribute('aria-label', rotating ? L.lPause : L.lPlay);
  }
  const hold = (k, yes) => { const had = holds.has(k); if (yes) holds.add(k); else holds.delete(k); if (had !== yes) sync(); };

  // ------------------------------------------------------------ controls
  on($('[data-hm-prev]', root), 'click', () => go(index - 1, true));
  on($('[data-hm-next]', root), 'click', () => go(index + 1, true));
  segs.forEach((b) => on(b, 'click', () => go(Number(b.dataset.hmGo), true)));
  on(toggleBtn, 'click', () => {
    rotating = !rotating;
    if (rotating) {
      // restart a finished or failed still; a paused one simply continues
      if (!plays(index) && (!anim || anim.playState === 'finished')) { if (st[index].failed && n > 1) { go(index + 1, false); return; } token++; begin(false); }
    }
    sync();
  });

  // arrows while focus is inside the carousel
  on(root, 'keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || n < 2) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1, true); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1, true); }
  });

  // horizontal swipe only; vertical scrolling stays with the browser (touch-action: pan-y)
  let sx = 0, sy = 0, pid = null, swipedAt = 0;
  on(slidesEl, 'pointerdown', (e) => { if (e.pointerType === 'mouse' || !e.isPrimary || n < 2) return; pid = e.pointerId; sx = e.clientX; sy = e.clientY; });
  on(slidesEl, 'pointerup', (e) => {
    if (e.pointerId !== pid) return;
    pid = null;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy) * 1.4) { swipedAt = performance.now(); go(index + (dx < 0 ? 1 : -1), true); }
  });
  on(slidesEl, 'pointercancel', () => { pid = null; });
  on(slidesEl, 'click', (e) => { if (performance.now() - swipedAt < 450) { e.preventDefault(); e.stopPropagation(); } }, true);

  // ------------------------------------------------------------ holds
  on(root, 'pointerenter', (e) => { if (e.pointerType === 'mouse') hold('hover', true); });
  on(root, 'pointerleave', () => hold('hover', false));
  on(root, 'focusin', (e) => { let fv = false; try { fv = e.target.matches(':focus-visible'); } catch { fv = true; } if (fv) hold('focus', true); });
  on(root, 'focusout', (e) => { if (!root.contains(e.relatedTarget)) hold('focus', false); });
  on(document, 'visibilitychange', () => hold('hidden', document.hidden));
  const mo = new MutationObserver(() => hold('dialog', document.documentElement.classList.contains('has-dialog')));
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  let io = null;
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver((entries) => { const e = entries[entries.length - 1]; hold('offscreen', !e.isIntersecting); });
    io.observe(root);
  }
  on(mqMobile, 'change', () => { if (plays(index) || slides[index].dataset.type === 'video') { token++; begin(false); } });

  // bfcache: pause on hide, resume on restore; tear everything down when the page really goes away
  on(window, 'pagehide', (e) => {
    hold('page', true);
    if (!e.persisted) { cancelProgress(); mo.disconnect(); if (io) io.disconnect(); offs.forEach((f) => f()); $$('video', root).forEach((v) => v.pause()); }
  });
  on(window, 'pageshow', (e) => { if (e.persisted) hold('page', false); });

  // ------------------------------------------------------------ start
  if (document.hidden) holds.add('hidden');
  if (document.documentElement.classList.contains('has-dialog')) holds.add('dialog');
  root.classList.add('is-live');
  sync();
  begin(false);
}

// "เลือกสิ่งที่คุณสนใจ" -> the four gateways: scroll there and move focus, never a next-slide action.
function wireJump() {
  const a = $('[data-hm-jump]');
  const target = document.getElementById('hm-gateways');
  if (!a || !target) return;
  a.addEventListener('click', (e) => {
    e.preventDefault();
    target.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    target.focus({ preventScroll: true });
  });
}
