// Accessible media viewer shared by lab galleries and project/story galleries.
//
// Markup (rendered by components.ts > viewerLink):
//   <a data-viewer="group" href="LARGE_URL" data-kind="image|video" data-video="MP4_URL" data-poster="POSTER"
//      data-caption="..." data-stamp="อัปโหลดภาพ: ..." data-alt="...">thumbnail</a>
// Without JS the link simply opens the large image. With JS a modal <dialog> shows the item with
// its caption and ITS OWN upload time, arrows/keyboard/swipe navigation, and focus returns on close.
import { $$, boot, reducedMotion, iconHref } from './lib.js?v=f0c471f4dc';

const B = boot();
const T = B.lang === 'en'
  ? { prev: 'Previous', next: 'Next', close: 'Close', of: 'of', viewer: 'Media viewer' }
  : { prev: 'ก่อนหน้า', next: 'ถัดไป', close: 'ปิด', of: 'จาก', viewer: 'ดูภาพ' };

let dlg, stage, cap, stampEl, count, items = [], index = 0, opener = null;

function icon(name) { return `<svg class="i i-${name}" aria-hidden="true"><use href="${iconHref(name)}"></use></svg>`; }

function build() {
  dlg = document.createElement('dialog');
  dlg.className = 'vw';
  dlg.setAttribute('aria-label', T.viewer);
  dlg.innerHTML = `
    <div class="vw__bar">
      <p class="vw__count" aria-live="polite"></p>
      <button class="vw__btn vw__close" type="button" aria-label="${T.close}">${icon('close')}</button>
    </div>
    <div class="vw__stage"></div>
    <div class="vw__foot">
      <button class="vw__btn vw__prev" type="button" aria-label="${T.prev}">${icon('arrow-left')}</button>
      <div class="vw__text"><p class="vw__cap"></p><p class="vw__stamp stamp stamp--on-dark">${icon('clock')}<span></span></p></div>
      <button class="vw__btn vw__next" type="button" aria-label="${T.next}">${icon('arrow-right')}</button>
    </div>`;
  document.body.appendChild(dlg);
  stage = dlg.querySelector('.vw__stage');
  cap = dlg.querySelector('.vw__cap');
  stampEl = dlg.querySelector('.vw__stamp span');
  count = dlg.querySelector('.vw__count');
  dlg.querySelector('.vw__close').addEventListener('click', () => dlg.close());
  dlg.querySelector('.vw__prev').addEventListener('click', () => go(-1));
  dlg.querySelector('.vw__next').addEventListener('click', () => go(1));
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
  });
  dlg.addEventListener('close', () => {
    stage.querySelectorAll('video').forEach((v) => v.pause());
    stage.replaceChildren();
    document.documentElement.classList.remove('has-dialog');
    if (opener) opener.focus({ preventScroll: true });
  });
  // Horizontal swipe; vertical movement is left to the page.
  let x0 = null, y0 = null;
  stage.addEventListener('pointerdown', (e) => { x0 = e.clientX; y0 = e.clientY; });
  stage.addEventListener('pointerup', (e) => {
    if (x0 === null) return;
    const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) go(dx < 0 ? 1 : -1);
  });
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target === stage) dlg.close(); });
}

function render() {
  const a = items[index];
  const d = a.dataset;
  stage.replaceChildren();
  let el;
  if (d.kind === 'video' && d.video) {
    el = document.createElement('video');
    el.src = d.video; el.controls = true; el.playsInline = true; el.preload = 'metadata';
    if (d.poster) el.poster = d.poster;
    el.setAttribute('aria-label', d.alt || d.caption || '');
  } else {
    el = document.createElement('img');
    el.src = a.getAttribute('href'); el.alt = d.alt || '';
    el.decoding = 'async';
  }
  el.className = 'vw__media';
  if (!reducedMotion()) { el.style.opacity = '0'; el.addEventListener(d.kind === 'video' ? 'loadeddata' : 'load', () => { el.style.opacity = '1'; }, { once: true }); }
  stage.appendChild(el);
  // Thai has no word spaces: keep space-separated phrases whole so a loanword never splits mid-word.
  cap.replaceChildren(...(d.caption || '').split(/(\s+)/).map((part) => { if (/^\s+$/.test(part)) return document.createTextNode(' '); const s = document.createElement('span'); s.className = 'vw__ph'; s.textContent = part; return s; }));
  cap.hidden = !d.caption;
  // The upload line wraps between its parts, never inside one: "05:10" must not part from "น." on a phone.
  stampEl.replaceChildren(...stampParts(d.stamp || '').flatMap((part, i) => { const s = document.createElement('span'); s.className = 'vw__ph'; s.textContent = part; return i ? [document.createTextNode(' '), s] : [s]; }));
  stampEl.parentElement.hidden = !d.stamp;
  count.textContent = items.length > 1 ? `${index + 1} ${T.of} ${items.length}` : '';
  dlg.querySelector('.vw__prev').hidden = items.length < 2;
  dlg.querySelector('.vw__next').hidden = items.length < 2;
  // Preload neighbours (images only).
  [index - 1, index + 1].forEach((i) => { const n = items[(i + items.length) % items.length]; if (n && n.dataset.kind !== 'video') { const im = new Image(); im.src = n.getAttribute('href'); } });
}

/** "อัปโหลดภาพ: 24 ก.ย. 2569 เวลา 05:10 น. (เวลาไทย)" / "Image uploaded: 24 Sept 2026, 05:10 (Bangkok time)"
 *  -> [label, date, time, zone]. Anything unexpected stays one piece. */
function stampParts(s) {
  const m = /^(.*?:)\s+(.+?,?)\s+((?:เวลา\s+)?\d{1,2}[:.]\d{2}(?:\s*น\.)?)\s*(\(.*\))?$/.exec(s.trim());
  return m ? [m[1], m[2], m[3], m[4]].filter(Boolean) : (s ? [s] : []);
}

function go(step) { if (items.length < 2) return; index = (index + step + items.length) % items.length; render(); }

export function openViewer(link) {
  if (!dlg) build();
  const group = link.dataset.viewer;
  items = $$(`[data-viewer="${CSS.escape(group)}"]`);
  index = Math.max(0, items.indexOf(link));
  opener = link;
  render();
  document.documentElement.classList.add('has-dialog');
  dlg.showModal();
  dlg.querySelector('.vw__close').focus({ preventScroll: true });
}

export function initViewer(root = document) {
  $$('[data-viewer]', root).forEach((a) => {
    if (a.__vw) return; a.__vw = true;
    a.addEventListener('click', (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); openViewer(a); });
  });
}

initViewer();
