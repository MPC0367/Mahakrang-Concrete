// Calculator UI - drives every [data-calc] block (product pages, /concrete/calculator, the lab dialog) and wires
// every [data-open-calc] button to <dialog id="calc-dialog"> via lib.openDialog (focus containment, Escape,
// focus return, page position kept).
//
// All maths is in calc-engine.js. This file only reads the form, shows results and errors, and remembers the
// visitor's inputs for this page in sessionStorage. Nothing is sent anywhere: no request is ever made.
import { $, $$, openDialog, copyText, toast, store, reducedMotion, iconHref } from './lib.js?v=f0c471f4dc';
import * as E from './calc-engine.js?v=63e23ab488';

const fill = (t, o) => String(t ?? '').replace(/\{(\w+)\}/g, (_, k) => (o[k] ?? ''));
const timers = new Set();
const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };
const cancel = (id) => { if (id) { clearTimeout(id); timers.delete(id); } };

function svgIcon(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg');
  s.setAttribute('class', `i i-${name}`); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
  const u = document.createElementNS(ns, 'use'); u.setAttribute('href', iconHref(name));
  s.appendChild(u); return s;
}
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
// Thai text set in phrases exactly like the server's ph() (calc-engine.js phrases()): compounds, short phrases and
// clause words never break inside; a keep-group is an inline-block .cc-ph that still wraps when wider than the line.
function phNodes(pieces) {
  return pieces.map((p) => {
    if (typeof p === 'string') return document.createTextNode(p);
    const s = el('span', 'cc-ph'); s.append(...phNodes(p.keep)); return s;
  });
}
function setPh(node, text) {
  if (!node) return;
  const t = String(text ?? '').replace(/\s*\n\s*/g, ' ');
  if (node.dataset.ph === t) return;   // unchanged: keep the DOM (and any selection) as it is
  node.dataset.ph = t;
  node.replaceChildren(...phNodes(E.phrases(t)));
  E.fitPhrases(node);
}
function phEl(tag, cls, text) { const e = el(tag, cls); setPh(e, text); return e; }   // fitted once attached (see renderPrice)

function init(root) {
  if (root.__calc) return;
  root.__calc = true;
  const jsonEl = $('script[data-calc-json]', root);
  if (!jsonEl) return;
  const D = JSON.parse(jsonEl.textContent);
  const S = D.s;
  const P = D.prefix;
  const products = new Map(D.products.map((p) => [p.id, p]));
  const KEY = `calc:${location.pathname}:${P}`;
  const fmtDate = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); if (!m) return iso || '';
    return new Intl.DateTimeFormat(D.lang === 'th' ? 'th-TH-u-ca-buddhist' : 'en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  };

  // ---------------------------------------------------------------- elements
  const form = $('[data-calc-form]', root);
  const productSel = $('[data-product-select]', root);
  const intro = $('[data-intro]', root);
  const tiles = $$('[data-tile]', root);
  const radios = $$('.calc__radio', root);
  const sets = Object.fromEntries($$('[data-set]', root).map((s) => [s.dataset.set, s]));
  const figs = Object.fromEntries($$('[data-fig]', root).map((s) => [s.dataset.fig, s]));
  const secList = $('[data-sections]', root);
  const secTpl = $('[data-sec-tpl]', root);
  const secAdd = $('[data-sec-add]', root);
  const allowBox = $('[data-allow]', root);
  const allowUser = $('[data-allow-user]', root);
  const allowInput = $('[data-allow-input]', root);
  const allowPreset = $('[data-allow-preset]', root);
  const allowPresetV = $('[data-allow-preset-v]', root);
  const allowHint = $('[data-allow-hint]', root);
  const res = $('[data-result]', root);
  const out = { net: $('[data-out-net]', root), pct: $('[data-out-pct]', root), allow: $('[data-out-allow]', root), plan: $('[data-out-plan]', root), rowAllow: $('[data-row-allow]', root) };
  const statusEl = $('[data-status]', root);
  const priceEl = $('[data-price]', root);
  const live = $('[data-live]', root);
  const copyBtn = $('[data-copy-summary]', root);
  const peek = $('[data-peek]', root);
  const peekV = $('[data-peek-v]', root);
  const selView = { name: $('[data-selview-name]', root), meta: $('[data-selview-meta]', root) };
  const prod = { box: $('[data-prod]', root), img: $('[data-prod-img]', root), name: $('[data-prod-name]', root), meta: $('[data-prod-meta]', root), demo: $('[data-prod-demo]', root), link: $('[data-prod-link]', root) };

  let productId = productSel && products.has(productSel.value) ? productSel.value : (D.initial && products.has(D.initial) ? D.initial : '');
  let secUid = 1;
  let last = null;               // last computation (for copy + announcements)
  let shownNet = null;           // currently displayed number (for the count tween)
  let tween = 0, announceT = 0, saveT = 0, lastSpoken = '';

  const config = () => D.configs[products.get(productId)?.config ?? '_default'] ?? D.configs._default;
  const geometry = () => (radios.find((r) => r.checked) || radios[0]).value;
  const unitOf = (input) => $(`[data-u="${input.dataset.k}"]`, input.closest('.calc__field'));
  const fieldLabel = (input) => (input.closest('.calc__field')?.querySelector('.calc__label')?.textContent || '').trim();
  // Per-product input label (CalcConfig.labels): the server sends each configuration's overrides already resolved to
  // this language (partials/calculator.ts labelOverrides); a key without one keeps the standard label.
  const labelOf = (k, cfg = config()) => (cfg.labels && cfg.labels[k]) || S.field[k] || k;

  // ---------------------------------------------------------------- reading the form
  const entry = (input) => { const u = unitOf(input); return { raw: input.value, unit: u ? u.value : undefined }; };
  const readSet = (g) => Object.fromEntries($$('[data-k]', sets[g]).map((i) => [i.dataset.k, entry(i)]));
  const sectionEls = () => (secList ? $$('[data-sec]', secList) : []);
  const readSections = () => sectionEls().map((li) => ({ name: $('[data-name]', li).value, fields: Object.fromEntries($$('[data-k]', li).map((i) => [i.dataset.k, entry(i)])) }));
  const inputFor = (g, path) => {
    if (g !== 'composite') return $(`[data-k="${path}"]`, sets[g]);
    const m = /^sections\.(\d+)\.(\w+)$/.exec(path); if (!m) return null;
    const li = sectionEls()[Number(m[1])]; return li ? $(`[data-k="${m[2]}"]`, li) : null;
  };

  // ---------------------------------------------------------------- messages
  function errText(err) {
    if (!err) return '';
    let t = S.err[err.code] || S.err.nan;
    if (err.code === 'max') {
      const unit = err.limitUnit === 'm' ? ` ${S.unit.m}` : err.limitUnit === '%' ? '%' : '';
      t = fill(t, { max: `${err.limit.toLocaleString('en-US')}${unit}` });
    }
    if (err.code === 'decimals') t = fill(t, { n: err.limit });
    return t;
  }
  function say(text) {
    if (!live || !text) return;
    live.textContent = '';
    later(() => { live.textContent = text; }, 40);
  }
  function setError(input, err, { show }) {
    const p = document.getElementById(`${input.id}-err`);
    const visible = show && !!err;
    const text = visible ? errText(err) : '';
    const before = p ? p.textContent : '';
    input.setAttribute('aria-invalid', visible ? 'true' : 'false');
    input.closest('.calc__field')?.classList.toggle('is-invalid', visible);
    if (p && before !== text) p.textContent = text;
    return visible && text !== before ? `${fieldLabel(input)}: ${text}` : '';
  }

  // ---------------------------------------------------------------- output
  function setNumber(node, value, animate) {
    if (!node) return;
    const target = Number.isFinite(value) ? value : null;
    cancelAnimationFrame(tween);
    if (target === null) { node.textContent = '—'; shownNet = null; return; }
    const from = shownNet;
    if (!animate || reducedMotion() || from === null || from === target) { node.textContent = E.formatVolume(target); shownNet = target; return; }
    const t0 = performance.now(), dur = 240;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      node.textContent = E.formatVolume(from + (target - from) * e);
      if (k < 1) tween = requestAnimationFrame(step); else { node.textContent = E.formatVolume(target); }
    };
    shownNet = target;
    tween = requestAnimationFrame(step);
  }

  function renderPrice(cfg, vol) {
    const q = renderPriceBox(cfg, vol);
    if (priceEl) E.fitPhrases(priceEl);
    return q;
  }
  function renderPriceBox(cfg, vol) {
    if (!priceEl) return null;
    const today = E.todayBangkok();
    const usable = cfg.price && E.priceUsable(cfg.price, today);
    priceEl.replaceChildren();
    priceEl.dataset.kind = usable ? 'priced' : 'contact';
    if (!usable) {
      priceEl.append(phEl('p', 'calc__pricek', S.priceContact), phEl('p', 'calc__priceb', S.priceContactBody));
      return null;
    }
    const q = vol ? E.priceQuote(cfg.price, vol, today) : null;
    priceEl.append(phEl('p', 'calc__pricek', S.priceTitle));
    if (!q) { priceEl.append(phEl('p', 'calc__priceb', S.enterForPrice)); return null; }
    const dl = el('dl', 'calc__pricel');
    const line = (k, v, cls) => { const d = el('div', cls); d.append(phEl('dt', '', k), el('dd', '', v)); dl.append(d); };
    line(fill(S.priceRate, { rate: E.formatMoney(q.rate), vol: E.formatVolume(q.basisVolume) }), E.formatMoney(q.concrete));
    for (const f of q.fees) line(`${f.label} (${f.per === 'm3' ? S.perM3 : S.perOrder})`, E.formatMoney(f.total));
    if (q.vatMode === 'excluded') line(fill(S.vatExcluded, { pct: q.vatPct }), E.formatMoney(q.vat));
    line(S.total, `${E.formatMoney(q.total)} ${S.thb}`, 'calc__pricet');
    priceEl.append(dl);
    const meta = [q.basis === 'net' ? S.priceBasisNet : S.priceBasisAllow,
      q.vatMode === 'included' ? fill(S.vatIncluded, { pct: q.vatPct }) : q.vatMode === 'not-applicable' ? S.vatNA : '',
      fill(S.validity, { from: fmtDate(q.validFrom), to: fmtDate(q.validTo) }), q.version ? fill(S.version, { v: q.version }) : ''].filter(Boolean).join(' · ');
    priceEl.append(phEl('p', 'calc__pricem', meta));
    return q;
  }

  function dimLabel(g, key, entry) {
    const base = S.dim[key] || '';
    if (key === 'count') { const r = E.parseNumber(entry?.raw, { integer: true }); return r.ok && r.value > 0 ? `× ${r.value}` : '× 1'; }
    const r = E.parseNumber(entry?.raw);
    if (!r.ok || r.value <= 0) return base;
    return `${base} ${r.value.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${S.unit[entry.unit] || ''}`.trim();
  }
  function renderFigure(g, fields) {
    const fig = figs[g]; if (!fig || g === 'composite') return;
    $$('[data-dim]', fig).forEach((d) => { const lab = $('[data-dim-label]', d) || d; lab.textContent = dimLabel(g, d.dataset.dim, fields[d.dataset.dim]); });
  }

  // ---------------------------------------------------------------- compute + render
  function compute({ animate = true, reveal = null } = {}) {
    const g = geometry();
    const cfg = config();
    const input = g === 'composite' ? { sections: readSections() } : { fields: readSet(g) };
    const r = E.calculate(g, input);
    const a = E.resolveAllowance(cfg.allowance, allowInput ? allowInput.value : '');
    const newErrors = [];

    // field errors: show once a field has been left (blur) or already shows one ("reward early, punish late")
    const inputs = g === 'composite' ? sectionEls().flatMap((li) => $$('[data-k]', li)) : $$('[data-k]', sets[g]);
    for (const inp of inputs) {
      const path = g === 'composite' ? `sections.${sectionEls().indexOf(inp.closest('[data-sec]'))}.${inp.dataset.k}` : inp.dataset.k;
      let err = r.errors[path] || null;
      if (!err && r.missing.includes(path) && inp.dataset.dirty === '1') err = { code: 'blank' };
      const show = inp.dataset.left === '1' || inp.getAttribute('aria-invalid') === 'true' || inp === reveal;
      const msg = setError(inp, err, { show });
      if (msg) newErrors.push(msg);
    }
    if (allowInput) {
      const show = allowInput.dataset.left === '1' || allowInput.getAttribute('aria-invalid') === 'true';
      const msg = setError(allowInput, a.ok ? null : a, { show: show && cfg.allowance.mode === 'user' });
      if (msg) newErrors.push(msg);
    }

    // per-section volumes
    if (g === 'composite') sectionEls().forEach((li) => {
      const v = $('[data-sec-vol]', li);
      const one = E.calculate('slab', { fields: Object.fromEntries($$('[data-k]', li).map((i) => [i.dataset.k, entry(i)])) });
      if (v) v.textContent = one.status === 'ok' ? `≈ ${E.formatVolume(one.net)} ${S.m3}` : '';
    });
    renderFigure(g, g === 'composite' ? {} : input.fields);

    const ok = r.status === 'ok' && a.ok;
    const vol = ok ? { net: r.net, ...E.applyAllowance(r.net, a.pct) } : null;
    res.dataset.state = ok ? 'ok' : r.status === 'invalid' || !a.ok ? 'invalid' : 'waiting';
    setNumber(out.net, vol ? vol.net : null, animate);
    const pct = a.ok ? a.pct : 0;
    if (out.pct) out.pct.textContent = `${pct.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
    if (out.allow) out.allow.textContent = vol ? E.formatVolume(vol.allowance) : '—';
    if (out.plan) out.plan.textContent = vol ? E.formatVolume(vol.planning) : '—';
    if (out.rowAllow) out.rowAllow.hidden = cfg.allowance.mode === 'off';

    let status = '';
    let labels = [];
    if (!ok && (r.status === 'invalid' || !a.ok)) status = S.fix;
    else if (!ok) {
      labels = [...new Set(r.missing.map((path) => { const i = inputFor(g, path); return i ? fieldLabel(i) : ''; }).filter(Boolean))];
      if (!(labels.length && labels.length < 4)) labels = [];
      status = labels.length ? `${S.waiting} · ${fill(S.missing, { list: labels.join(', ') })}` : S.waiting;
    }
    if (statusEl.dataset.ph !== status) {
      if (labels.length) {
        // Each missing field name is kept whole ("เส้นผ่านศูนย์กลาง" must not split mid-term).
        const [pre, post = ''] = S.missing.split('{list}');
        const box = el('span');
        box.append(...phNodes(E.phrases(`${S.waiting} · ${pre.trim()}`)), ' ');
        // the comma stays with its label (a kept phrase is an atomic inline: a line may otherwise start with ",")
        labels.forEach((l, i) => { if (i) box.append(' '); box.append(...phNodes(E.phrases(i < labels.length - 1 ? `${l},` : l))); });
        if (post) box.append(...phNodes(E.phrases(post)));
        statusEl.replaceChildren(box);
      } else {
        // one inline run inside the flex row (the dot is ::before), like the server markup
        const box = el('span');
        box.append(...phNodes(E.phrases(status)));
        statusEl.replaceChildren(box);
      }
      statusEl.dataset.ph = status;
      E.fitPhrases(statusEl);
    }
    statusEl.hidden = ok;
    const quote = renderPrice(cfg, vol);
    if (copyBtn) copyBtn.disabled = !ok;
    if (peek) { peek.hidden = !ok; if (peekV) peekV.textContent = ok ? E.formatVolume(vol.net) : '—'; }
    last = ok ? { g, input, r, a, vol, quote, cfg } : null;

    if (newErrors.length) say(newErrors.join(' · '));
    cancel(announceT);
    if (ok) announceT = later(() => speak(), 900);
    cancel(saveT);
    saveT = later(save, 250);
  }

  function speak() {
    if (!last) return;
    const p = products.get(productId);
    const text = fill(S.spoken, { product: p ? `${p.name} · ` : '', shape: `${S.geom[last.g]} ·`, net: E.formatVolume(last.vol.net) })
      + (last.a.pct > 0 ? fill(S.spokenPlan, { pct: last.a.pct, plan: E.formatVolume(last.vol.planning) }) : '');
    if (text !== lastSpoken) { lastSpoken = text; say(text); }
  }

  // ---------------------------------------------------------------- summary (copied locally, never sent)
  function describeFields(fields, keys, cfg) {
    return keys.map((k) => {
      const f = fields[k]; if (!f) return '';
      if (k === 'count') return `${labelOf(k, cfg)} ${f.raw}`;
      return `${labelOf(k, cfg)} ${String(f.raw).trim()} ${S.unit[f.unit] || ''}`.trim();
    }).filter(Boolean).join(' × ');
  }
  function summary() {
    if (!last) return '';
    const p = products.get(productId);
    const L = [`${D.brand} — ${S.summaryHead}`];
    if (p) L.push(`${S.summaryProduct}: ${p.name}${p.basis ? ` (${p.basis})` : ''}`);
    if (last.g === 'composite') {
      L.push(`${S.summaryShape}: ${S.geom.composite}`);
      last.input.sections.forEach((s, i) => {
        const one = E.calculate('slab', { fields: s.fields });
        if (one.status !== 'ok') return;
        L.push(`  ${i + 1}. ${s.name.trim() || `${S.section} ${i + 1}`}: ${describeFields(s.fields, ['length', 'width', 'thickness'], last.cfg)} = ${E.formatVolume(one.net)} ${S.m3}`);
      });
    } else {
      L.push(`${S.summaryShape}: ${S.geom[last.g]} — ${describeFields(last.input.fields, Object.keys(last.input.fields), last.cfg)}`);
    }
    L.push(`${S.net}: ${E.formatVolume(last.vol.net)} ${S.m3}`);
    if (last.cfg.allowance.mode !== 'off') {
      L.push(`${S.allowance} ${last.a.pct}%: ${E.formatVolume(last.vol.allowance)} ${S.m3}`);
      L.push(`${S.planning}: ${E.formatVolume(last.vol.planning)} ${S.m3}`);
    }
    L.push(last.quote ? `${S.total}: ${E.formatMoney(last.quote.total)} ${S.thb} (${fill(S.validity, { from: fmtDate(last.quote.validFrom), to: fmtDate(last.quote.validTo) })})` : S.priceContact);
    L.push(S.estimateNote);
    if (D.phone) L.push(`${S.callPrice}: ${D.phone.display}`);
    return L.join('\n');
  }

  // ---------------------------------------------------------------- product + geometry
  function renderProduct(p) {
    if (!prod.box) return;
    if ((prod.box.dataset.shown ?? '') === (p ? p.id : '')) return;   // already rendered by the server
    prod.box.dataset.shown = p ? p.id : '';
    prod.box.toggleAttribute('data-empty', !p);
    // photo (cross-fades in; the old one stays until the new one has loaded)
    const holder = prod.img;
    const old = $('picture, img', holder);
    if (p && p.img) {
      const im = new Image();
      im.alt = p.img.alt || ''; im.decoding = 'async';
      im.sizes = '(min-width: 1100px) 160px, 120px';
      im.srcset = p.img.srcset; im.src = p.img.src;
      im.width = p.img.w; im.height = p.img.h;
      im.style.objectPosition = p.img.pos;
      if (p.img.color) im.style.backgroundColor = p.img.color;
      im.className = 'is-new';
      const olds = [...holder.querySelectorAll('picture, img')];
      const done = () => { requestAnimationFrame(() => im.classList.remove('is-new')); later(() => olds.forEach((n) => n.remove()), 320); };
      im.addEventListener('load', done, { once: true });
      im.addEventListener('error', () => { im.remove(); }, { once: true });
      holder.append(im);
    } else if (old) { holder.querySelectorAll('picture, img').forEach((n) => n.remove()); }
    setPh(prod.name, p ? p.name : S.noProductTitle);
    setPh(prod.meta, p ? (p.basis || p.tagline || '') : S.noProductBody);
    prod.demo.replaceChildren();
    if (p && p.demo) { const t = el('span', 'demotag'); t.append(svgIcon('info'), document.createTextNode(p.demoLabel)); prod.demo.append(t); }
    if (prod.link) {
      const here = p && (p.href === location.pathname || p.href === decodeURI(location.pathname));
      prod.link.hidden = !p || here;
      if (p) prod.link.href = p.href;
    }
  }

  function setGeometry(g, { focus = false } = {}) {
    radios.forEach((r) => { r.checked = r.value === g; });
    tiles.forEach((t) => t.classList.toggle('is-on', t.dataset.tile === g));
    Object.entries(sets).forEach(([k, s]) => { s.hidden = k !== g; });
    Object.entries(figs).forEach(([k, f]) => { f.toggleAttribute('hidden', k !== g); });   // SVG has no .hidden property
    if (focus) { const first = $('[data-k], [data-name]', sets[g]); first && first.focus({ preventScroll: true }); }
  }

  // The field labels follow the chosen product's configuration (or return to the standard ones). The unit select's
  // accessible name repeats the label; the "still needed" list and error announcements read the label element
  // (fieldLabel), so they follow on their own. Diagram dims are fixed abbreviations (L, W, H...), not the label.
  function applyLabels(scope, cfg = config()) {
    $$('.calc__field[data-field]', scope).forEach((f) => {
      const k = f.dataset.field;
      const text = labelOf(k, cfg);
      setPh($('.calc__label', f), text);   // no-op when unchanged (setPh compares data-ph)
      const u = $(`[data-u="${k}"]`, f);
      if (u) u.setAttribute('aria-label', `${S.unitOf}${D.lang === 'th' ? '' : ' '}${text}`);
    });
  }

  function applyConfig({ announceSwitch = false } = {}) {
    const cfg = config();
    applyLabels(form, cfg);
    tiles.forEach((t) => { t.hidden = !cfg.geometries.includes(t.dataset.tile); });
    const g = geometry();
    if (!cfg.geometries.includes(g)) {
      setGeometry(cfg.def);
      if (announceSwitch) say(fill(S.switched, { g: S.geom[cfg.def] }));
    }
    if (intro) setPh(intro, cfg.intro);
    const mode = cfg.allowance.mode;
    if (allowBox) allowBox.hidden = mode === 'off';
    if (allowUser) allowUser.hidden = mode !== 'user';
    if (allowPreset) allowPreset.hidden = mode !== 'preset';
    if (allowPresetV) allowPresetV.textContent = `${cfg.allowance.presetPct}%`;
    if (allowHint) setPh(allowHint, fill(S.allowanceHint, { max: cfg.allowance.maxPct }));
  }

  // The closed select shows the chosen mix on two lines (name, then its strength basis) instead of one ellipsized
  // line; the native <select> stays the real, focusable control underneath (calc.css .calc__selview).
  function renderSelView(p) {
    if (!selView.name) return;
    setPh(selView.name, p ? p.name : S.productNone);
    const meta = p ? (p.basis || p.tagline || '') : '';
    setPh(selView.meta, meta);
    selView.meta.hidden = !meta;
  }

  function setProduct(id, { announceSwitch = false } = {}) {
    productId = products.has(id) ? id : '';
    if (productSel && productSel.value !== productId) productSel.value = productId;
    renderSelView(products.get(productId));
    renderProduct(products.get(productId));
    applyConfig({ announceSwitch });
  }

  // ---------------------------------------------------------------- composite sections
  function renumber() {
    const list = sectionEls();
    list.forEach((li, i) => {
      const n = i + 1;
      const label = `${S.section} ${n}`;
      const nEl = $('[data-sec-n]', li); if (nEl) nEl.textContent = String(n);
      const nl = $('[data-sec-namelabel]', li); if (nl) nl.textContent = `${S.sectionName} (${label})`;
      const del = $('[data-sec-del]', li); if (del) { del.setAttribute('aria-label', `${S.removeSection} (${label})`); del.hidden = list.length < 2; }
    });
    if (secAdd) {
      const full = list.length >= D.limits.sections;
      secAdd.disabled = full;
      secAdd.title = full ? fill(S.sectionMax, { n: D.limits.sections }) : '';
    }
  }
  function addSection(values = null, { focus = true } = {}) {
    if (!secTpl || sectionEls().length >= D.limits.sections) return null;
    const uid = String(++secUid);
    const frag = secTpl.content.cloneNode(true);
    frag.querySelectorAll('[id], [for], [aria-describedby], [data-sec-id]').forEach((n) => {
      for (const a of ['id', 'for', 'aria-describedby', 'data-sec-id']) if (n.hasAttribute(a)) n.setAttribute(a, n.getAttribute(a).replaceAll('__N__', uid));
    });
    const li = frag.querySelector('[data-sec]');
    secList.appendChild(frag);
    applyLabels(li);   // the template carries the labels of the product the page was rendered with
    wireSection(li);
    if (values) fillSection(li, values);
    renumber();
    if (focus) { $('[data-name]', li).focus(); say(fill(S.sectionAdded, { n: sectionEls().length })); }
    return li;
  }
  function fillSection(li, v) {
    const name = $('[data-name]', li); if (name) name.value = v.name || '';
    $$('[data-k]', li).forEach((i) => { const f = v.fields?.[i.dataset.k]; if (!f) return; i.value = f.raw ?? ''; const u = unitOf(i); if (u && f.unit && [...u.options].some((o) => o.value === f.unit)) u.value = f.unit; });
  }
  function wireSection(li) {
    const del = $('[data-sec-del]', li);
    del && del.addEventListener('click', () => {
      const list = sectionEls();
      if (list.length < 2) return;
      const i = list.indexOf(li);
      li.remove();
      renumber();
      const next = sectionEls()[Math.min(i, sectionEls().length - 1)];
      (next ? $('[data-name]', next) : secAdd)?.focus();
      say(S.sectionRemoved);
      compute();
    });
  }

  // ---------------------------------------------------------------- persistence (this page, this tab)
  function snapshot() {
    const data = { v: 1, product: productId, geometry: geometry(), allow: allowInput ? allowInput.value : '', sets: {}, sections: readSections() };
    for (const g of Object.keys(sets)) if (g !== 'composite') data.sets[g] = readSet(g);
    return data;
  }
  function save() { store.set(KEY, snapshot()); }
  function restore() {
    const s = store.get(KEY, null);
    if (!s || s.v !== 1) return false;
    if (typeof s.product === 'string' && (s.product === '' || products.has(s.product))) productId = s.product;
    for (const [g, fields] of Object.entries(s.sets || {})) {
      if (!sets[g]) continue;
      $$('[data-k]', sets[g]).forEach((i) => {
        const f = fields[i.dataset.k]; if (!f) return;
        i.value = typeof f.raw === 'string' ? f.raw.slice(0, 40) : '';
        const u = unitOf(i); if (u && f.unit && [...u.options].some((o) => o.value === f.unit)) u.value = f.unit;
        if (i.value) i.dataset.dirty = '1';
      });
    }
    if (Array.isArray(s.sections) && secList) {
      const list = s.sections.slice(0, D.limits.sections);
      const first = sectionEls()[0];
      if (first && list[0]) fillSection(first, list[0]);
      list.slice(1).forEach((v) => addSection(v, { focus: false }));
    }
    if (allowInput && typeof s.allow === 'string') allowInput.value = s.allow.slice(0, 12);
    if (s.geometry && radios.some((r) => r.value === s.geometry)) setGeometry(s.geometry);
    return true;
  }

  // ---------------------------------------------------------------- events
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('[data-k], [data-allow-input]')) t.dataset.dirty = '1';
    if (t.matches('.calc__radio')) return;
    compute();
  });
  form.addEventListener('change', (e) => {
    const t = e.target;
    if (t === productSel) { setProduct(productSel.value, { announceSwitch: true }); compute(); return; }
    if (t.matches('.calc__radio')) { setGeometry(t.value); compute({ animate: false }); return; }
    if (t.matches('.calc__unit')) compute();
  });
  form.addEventListener('focusout', (e) => {
    const t = e.target;
    if (t.matches('[data-k], [data-allow-input]') && (t.dataset.dirty === '1' || t.value !== '')) { t.dataset.left = '1'; compute({ reveal: t }); }
    const d = t.matches('[data-k]') && figs[geometry()] && $(`[data-dim="${t.dataset.k}"]`, figs[geometry()]);
    d && d.classList.remove('is-active');
  });
  form.addEventListener('focusin', (e) => {
    const t = e.target;
    if (!t.matches('[data-k], .calc__unit')) return;
    const k = t.dataset.k || t.dataset.u;
    const fig = figs[geometry()];
    fig && $$('[data-dim]', fig).forEach((d) => d.classList.toggle('is-active', d.dataset.dim === k));
  });
  // Enter moves to the next field (mobile keyboards show "next") instead of doing nothing.
  form.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.matches('input')) return;
    e.preventDefault();
    const fields = $$('input[data-k], input[data-name], input[data-allow-input]', form).filter((i) => i.offsetParent !== null);
    const i = fields.indexOf(e.target);
    if (i >= 0 && i < fields.length - 1) fields[i + 1].focus(); else e.target.blur();
  });
  $$('[data-allow-step]', root).forEach((b) => b.addEventListener('click', () => {
    const cfg = config();
    const r = E.parseNumber(allowInput.value, { maxDecimals: 2 });
    const cur = r.ok ? r.value : 0;
    const next = Math.max(0, Math.min(cfg.allowance.maxPct, Math.round(cur) + Number(b.dataset.allowStep)));
    allowInput.value = String(next);
    allowInput.dataset.dirty = '1';
    compute();
  }));
  secAdd && secAdd.addEventListener('click', () => { addSection(); compute(); });
  // Small screens: the live volume pill jumps to the full result card (pointer convenience; the result is announced anyway).
  peek && peek.addEventListener('click', () => res.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' }));
  sectionEls().forEach(wireSection);
  copyBtn && copyBtn.addEventListener('click', async () => {
    const text = summary();
    if (!text) return;
    const ok = await copyText(text);
    toast(`<span>${ok ? S.copied : S.copyFail}</span>`);
    say(ok ? S.copied : S.copyFail);
  });

  // ---------------------------------------------------------------- start
  restore();
  setProduct(productId);
  if (!radios.some((r) => r.checked)) setGeometry(config().def);
  setGeometry(geometry());
  renumber();
  compute({ animate: false });
  root.classList.add('is-ready');

  return { save };
}

const instances = [];
function boot() { $$('[data-calc]').forEach((r) => { const i = init(r); if (i) instances.push(i); }); }
boot();
// Thai phrases too long for their column flow normally instead of as boxes (calc-engine.js fitPhrases)
const main = document.getElementById('main');
let unwatch = main ? E.watchPhrases(main) : () => {};
window.addEventListener('pageshow', (e) => { if (e.persisted && main) unwatch = E.watchPhrases(main); });

// ---------------------------------------------------------------- dialog (lab pages)
const dlg = document.getElementById('calc-dialog');
$$('[data-open-calc]').forEach((b) => b.addEventListener('click', () => {
  if (!dlg) return;
  openDialog(dlg, b);
  E.fitPhrases(dlg);   // its text was not laid out while the dialog was closed
}));
// Tab and Shift+Tab wrap inside the open sheet (a native modal lets focus leave for the browser's own UI;
// the spec asks for a contained cycle). Only one radio per group is tabbable: the checked one.
if (dlg) {
  const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const tabbables = () => $$(TABBABLE, dlg).filter((n) => n.tabIndex >= 0 && n.getClientRects().length && !n.closest('[hidden]') && (n.type !== 'radio' || n.checked));
  dlg.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || !dlg.open) return;
    const list = tabbables();
    if (!list.length) return;
    const first = list[0], last = list[list.length - 1];
    if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  });
}
if (dlg && window.visualViewport) {
  // Keep the focused field above an on-screen keyboard inside the sheet.
  dlg.addEventListener('focusin', (e) => {
    const t = e.target;
    if (!t.matches('input, select')) return;
    later(() => {
      const r = t.getBoundingClientRect();
      const vv = window.visualViewport;
      if (r.bottom > vv.height - 12 || r.top < 72) t.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
    }, 260);
  });
}

window.addEventListener('pagehide', () => {
  unwatch();
  instances.forEach((i) => i.save());
  timers.forEach((id) => clearTimeout(id));
  timers.clear();
});
