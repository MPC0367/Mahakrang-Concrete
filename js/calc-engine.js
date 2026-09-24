// Concrete volume engine - ONE engine for every calculator on the site (hub, product pages, lab dialog).
// Pure ES module: no DOM, no globals, no I/O. The server imports it too (field specs) so the rendered
// form and the browser maths can never drift apart. It also holds the Thai phrase tokenizer both sides render
// with; only fitPhrases()/watchPhrases() at the end touch the DOM, and only when a browser script calls them.
//
// Rules (spec section 11):
//   - Geometry decides the volume. A different mix grade never changes the volume of the same shape.
//   - Units are converted ONCE to metres; intermediate values are never rounded; display is 2 decimals.
//   - Blank is not zero. Negatives, non-finite values, text, excessive sizes and non-integer counts are rejected.
//   - A price is only quoted from an approved configuration that is valid today (Asia/Bangkok). Otherwise null.

export const GEOMETRIES = /** @type {const} */ (['slab', 'beam', 'footing', 'round', 'composite']);

/** Divisors that turn an entered value into metres (division keeps 10 cm -> 0.1 exact). */
export const UNIT_DIV = { m: 1, cm: 100, mm: 1000 };

export const LIMITS = { count: 1000, sections: 12, decimals: 4, pctDecimals: 2 };

/**
 * Field specifications per geometry.
 *  - dimension fields: `units` offered (first = default unless `unit` given), `maxM` = largest sensible value in metres
 *  - count fields: integers 1..LIMITS.count
 */
const DIM = (key, units, unit, maxM) => ({ key, kind: 'dim', units, unit, maxM });
const COUNT = { key: 'count', kind: 'count', max: LIMITS.count };

export const FIELDS = {
  slab: [DIM('length', ['m', 'cm'], 'm', 1000), DIM('width', ['m', 'cm'], 'm', 1000), DIM('thickness', ['cm', 'mm', 'm'], 'cm', 5)],
  beam: [DIM('width', ['m', 'cm', 'mm'], 'm', 20), DIM('depth', ['m', 'cm', 'mm'], 'm', 20), DIM('length', ['m', 'cm'], 'm', 1000), COUNT],
  footing: [DIM('length', ['m', 'cm'], 'm', 100), DIM('width', ['m', 'cm'], 'm', 100), DIM('depth', ['m', 'cm'], 'm', 20), COUNT],
  round: [DIM('diameter', ['cm', 'm', 'mm'], 'cm', 20), DIM('height', ['m', 'cm'], 'm', 1000), COUNT],
  composite: [],
};
/** A composite section is a named rectangular slab: length x width x thickness. */
export const SECTION_FIELDS = FIELDS.slab;

// ------------------------------------------------------------------ parsing

const THAI_DIGIT = /[๐-๙]/g;

/**
 * Parse a user-typed number. Accepts "2.5", ".5", "1,200.5", Thai digits and surrounding spaces.
 * Returns { ok:true, value } or { ok:false, code } with code in:
 *   blank | nan | negative | integer | decimals
 * Zero is returned as a value; callers decide whether zero is allowed.
 */
export function parseNumber(raw, { integer = false, maxDecimals = LIMITS.decimals } = {}) {
  if (raw === null || raw === undefined) return { ok: false, code: 'blank' };
  if (typeof raw === 'number') raw = Number.isFinite(raw) ? String(raw) : 'x';
  let s = String(raw).replace(THAI_DIGIT, (d) => String(d.charCodeAt(0) - 0x0E50)).replace(/[\s ​]+/g, '').replace(/[−–]/g, '-');
  if (s === '') return { ok: false, code: 'blank' };
  if (/^[+-]?\d{1,3}(,\d{3})+(\.\d*)?$/.test(s)) s = s.replace(/,/g, '');
  const NUM = /^(\d+\.?\d*|\.\d+)$/;
  if (s[0] === '-') {
    const rest = s.slice(1);
    if (NUM.test(rest)) return Number(rest) === 0 ? { ok: true, value: 0 } : { ok: false, code: 'negative' };
    return { ok: false, code: 'nan' };
  }
  if (s[0] === '+') s = s.slice(1);
  if (!NUM.test(s)) return { ok: false, code: 'nan' };
  const value = Number(s);
  if (!Number.isFinite(value)) return { ok: false, code: 'nan' };
  const dec = (s.split('.')[1] ?? '').replace(/0+$/, '').length;
  if (integer && !Number.isInteger(value)) return { ok: false, code: 'integer' };
  if (!integer && dec > maxDecimals) return { ok: false, code: 'decimals', limit: maxDecimals };
  return { ok: true, value };
}

/** Convert an entered value to metres. Unknown units return NaN (and are rejected by readField). */
export function toMetres(value, unit) {
  const d = UNIT_DIV[unit];
  return d ? value / d : NaN;
}

/**
 * Validate one field entry { raw, unit } against its spec.
 * -> { ok:true, value }  (metres for dimensions, integer for counts)
 * -> { ok:false, code, limit?, limitUnit? }  code: blank | nan | negative | integer | decimals | zero | max | unit
 */
export function readField(spec, entry) {
  const p = parseNumber(entry?.raw, { integer: spec.kind === 'count' });
  if (!p.ok) return p;
  if (p.value === 0) return { ok: false, code: 'zero' };
  if (spec.kind === 'count') {
    if (p.value > spec.max) return { ok: false, code: 'max', limit: spec.max, limitUnit: '' };
    return { ok: true, value: p.value };
  }
  const unit = entry?.unit ?? spec.unit;
  if (!spec.units.includes(unit)) return { ok: false, code: 'unit' };
  const m = toMetres(p.value, unit);
  if (!Number.isFinite(m)) return { ok: false, code: 'nan' };
  if (m > spec.maxM) return { ok: false, code: 'max', limit: spec.maxM, limitUnit: 'm' };
  return { ok: true, value: m };
}

// ------------------------------------------------------------------ geometry

/** Volume in m3 from dimensions already in metres. No rounding. */
export function volumeOf(geometry, d) {
  switch (geometry) {
    case 'slab': return d.length * d.width * d.thickness;
    case 'beam': return d.width * d.depth * d.length * d.count;
    case 'footing': return d.length * d.width * d.depth * d.count;
    case 'round': return Math.PI * (d.diameter / 2) ** 2 * d.height * d.count;
    default: return NaN;
  }
}

function readSet(fields, values, prefix, errors, missing) {
  const dims = {};
  let ok = true;
  for (const f of fields) {
    const r = readField(f, values?.[f.key]);
    if (r.ok) { dims[f.key] = r.value; continue; }
    ok = false;
    if (r.code === 'blank') missing.push(prefix + f.key);
    else errors[prefix + f.key] = r;
  }
  return ok ? dims : null;
}

const isBlankEntry = (e) => e === undefined || e === null || String(e.raw ?? '').trim() === '';

/**
 * Calculate the net geometric volume.
 *   input = { fields: { key: { raw, unit } } }                         for slab | beam | footing | round
 *   input = { sections: [{ name, fields: { length, width, thickness } }] }  for composite
 * -> { status: 'ok' | 'incomplete' | 'invalid', net: number | null, parts: number[], errors: { path: err }, missing: path[] }
 * `net` is only a number when status is 'ok' - never NaN, never a stand-in zero.
 */
export function calculate(geometry, input = {}) {
  const errors = {};
  const missing = [];
  let parts = [];
  if (!GEOMETRIES.includes(geometry)) return { status: 'invalid', net: null, parts, errors: { geometry: { ok: false, code: 'geometry' } }, missing };

  if (geometry === 'composite') {
    const all = Array.isArray(input.sections) ? input.sections.slice(0, LIMITS.sections) : [];
    // A section left completely empty is ignored, as long as another section has content.
    const used = all.map((s, i) => ({ s, i })).filter(({ s }) => SECTION_FIELDS.some((f) => !isBlankEntry(s?.fields?.[f.key])));
    const list = used.length ? used : all.slice(0, 1).map((s) => ({ s, i: 0 }));
    if (!list.length) missing.push('sections.0.length', 'sections.0.width', 'sections.0.thickness');
    for (const { s, i } of list) {
      const dims = readSet(SECTION_FIELDS, s?.fields, `sections.${i}.`, errors, missing);
      parts.push(dims ? volumeOf('slab', dims) : NaN);
    }
  } else {
    const dims = readSet(FIELDS[geometry], input.fields, '', errors, missing);
    parts = [dims ? volumeOf(geometry, dims) : NaN];
  }

  const status = Object.keys(errors).length ? 'invalid' : missing.length ? 'incomplete' : 'ok';
  if (status !== 'ok') return { status, net: null, parts: parts.map((p) => (Number.isFinite(p) ? p : null)), errors, missing };
  const net = parts.reduce((a, b) => a + b, 0);
  if (!Number.isFinite(net)) return { status: 'invalid', net: null, parts: [], errors: { total: { ok: false, code: 'nan' } }, missing };
  return { status, net, parts, errors, missing };
}

// ------------------------------------------------------------------ allowance

/**
 * Resolve the allowance percentage from the product's policy.
 *   mode 'user'   - the visitor may enter a %, default 0 (blank = the default 0, the field is optional)
 *   mode 'preset' - a business-approved preset, not editable
 *   mode 'off'    - no allowance
 */
export function resolveAllowance(policy, raw) {
  const mode = policy?.mode ?? 'user';
  if (mode === 'off') return { ok: true, pct: 0, mode };
  if (mode === 'preset') {
    const pct = Number(policy?.presetPct);
    return Number.isFinite(pct) && pct >= 0 && pct <= 50 ? { ok: true, pct, mode } : { ok: true, pct: 0, mode };
  }
  if (raw === undefined || raw === null || String(raw).trim() === '') return { ok: true, pct: 0, mode };
  const p = parseNumber(raw, { maxDecimals: LIMITS.pctDecimals });
  if (!p.ok) return { ...p, mode };
  const max = Number.isFinite(Number(policy?.maxPct)) ? Number(policy.maxPct) : 20;
  if (p.value > max) return { ok: false, code: 'max', limit: max, limitUnit: '%', mode };
  return { ok: true, pct: p.value, mode };
}

/** Allowance is shown separately from net volume; planning = net + allowance. */
export function applyAllowance(net, pct) {
  const allowance = (net * pct) / 100;
  return { allowance, planning: net + allowance };
}

// ------------------------------------------------------------------ price (approved, dated configurations only)

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's calendar date in Asia/Bangkok (UTC+7, no daylight saving) as YYYY-MM-DD. */
export function todayBangkok(date = new Date()) {
  return new Date(date.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Is a price configuration usable on `today`? Anything missing or unapproved means no. */
export function priceUsable(price, today) {
  if (!price || price.approved !== true) return false;
  const rate = Number(price.ratePerM3);
  if (!Number.isFinite(rate) || rate <= 0) return false;
  if ((price.currency ?? 'THB') !== 'THB') return false;
  if (!ISO_DATE.test(price.validFrom ?? '') || !ISO_DATE.test(price.validTo ?? '') || !ISO_DATE.test(today ?? '')) return false;
  if (today < price.validFrom || today > price.validTo) return false;
  if (!['included', 'excluded', 'not-applicable'].includes(price.vat)) return false;
  if (price.vat !== 'not-applicable' && !(Number.isFinite(Number(price.vatPct)) && Number(price.vatPct) >= 0)) return false;
  if (!['net', 'with-allowance'].includes(price.basis ?? 'with-allowance')) return false;
  for (const f of price.fees ?? []) {
    if (!Number.isFinite(Number(f?.amount)) || Number(f.amount) < 0 || !['order', 'm3'].includes(f?.per)) return false;
  }
  return true;
}

/**
 * Estimate from an approved, currently valid price. Returns null when no numeric quote may be shown.
 *   vol = { net, planning }
 */
export function priceQuote(price, vol, today) {
  if (!priceUsable(price, today)) return null;
  if (!vol || !Number.isFinite(vol.net) || !Number.isFinite(vol.planning)) return null;
  const basis = price.basis ?? 'with-allowance';
  const basisVolume = basis === 'net' ? vol.net : vol.planning;
  const rate = Number(price.ratePerM3);
  const concrete = rate * basisVolume;
  const fees = (price.fees ?? []).map((f) => ({ label: f.label, per: f.per, amount: Number(f.amount), total: f.per === 'm3' ? Number(f.amount) * basisVolume : Number(f.amount) }));
  const subtotal = concrete + fees.reduce((a, f) => a + f.total, 0);
  const vatPct = price.vat === 'not-applicable' ? 0 : Number(price.vatPct);
  const vat = price.vat === 'excluded' ? (subtotal * vatPct) / 100 : 0;
  const total = subtotal + vat;
  if (![concrete, subtotal, vat, total].every(Number.isFinite)) return null;
  return { currency: 'THB', rate, basis, basisVolume, concrete, fees, subtotal, vatMode: price.vat, vatPct, vat, total, validFrom: price.validFrom, validTo: price.validTo, version: price.version ?? '' };
}

// ------------------------------------------------------------------ display

/** Round for display only (half away from zero at 2 decimals). */
export function round2(x) {
  if (!Number.isFinite(x)) return NaN;
  const s = Math.sign(x) || 1;
  return (s * Math.round(Math.abs(x) * 100 + 1e-9)) / 100;
}

/** "2.40", "1,234.57". Non-finite -> "—" (never "NaN"). */
export function format2(x) {
  if (!Number.isFinite(x)) return '—';
  return round2(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Volume for display: a positive volume that rounds to 0.00 reads "< 0.01" rather than a misleading zero. */
export function formatVolume(x) {
  if (!Number.isFinite(x)) return '—';
  if (x > 0 && round2(x) === 0) return '< 0.01';
  return format2(x);
}

/** Money for display, 2 decimals with thousands separators. */
export function formatMoney(x) { return format2(x); }

// ------------------------------------------------------------------ Thai phrase wrapping (text layout, shared)
// Browsers break Thai with ICU's dictionary: every dictionary boundary is a break, and that dictionary splits the
// compounds this site lives on ("ทาง|เดิน", "กำลัง|อัด", "เสา|เข็ม", "หน้า|งาน", "มหา|แกร่ง"), even mis-reads a few
// ("ดูรา|คา"), and leaves clause words hanging at a line end ("สูตรที่ | วิศวกร"). Thai typesetting breaks at
// spaces first, keeps a compound whole and never ends a line on a word that introduces the next.
// phrases(line) returns pieces for a renderer: a string (breaks wherever ICU allows) or { keep: pieces[] }, drawn as
// an inline-block span. A short space-separated phrase therefore moves to the next line whole; inside a longer one a
// compound, and a clause word with the word it introduces, stay together. An inline-block still wraps inside itself
// when it is wider than the whole line, so nothing can overflow. Latin text passes through untouched. Node and the
// browser share ICU's segmentation, and the server partial (server/render/partials/calculator.ts) and calc-ui.js
// render the SAME pieces, so live updates wrap exactly like the first paint.

const TH_CHAR = /[\u0E00-\u0E7F]/;
const TH_MARK = /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g;
/** Words that open what follows: a line never ends on them. */
const LEAD = new Set(['และ', 'หรือ', 'แต่', 'ของ', 'ที่', 'ซึ่ง', 'จาก', 'ใน', 'โดย', 'กับ', 'เพื่อ', 'ให้', 'คือ', 'ถึง', 'ด้วย', 'สำหรับ', 'เป็น', 'จึง', 'ว่า', 'ตาม',
  'แทน', 'ถ้า', 'หาก', 'อาจ', 'ความ', 'การ', 'โทร', 'ยัง', 'ไม่', 'ทุก', 'แล้ว', 'ต้อง', 'จะ', 'เมื่อ', 'ระหว่าง', 'ทน', 'รอ', 'ต่อ', 'ผล', 'ค่า', 'ชื่อ', 'ด้าน']);
/** Words that close what precedes: a line never starts with them. */
const TRAIL = new Set(['นี้', 'นั้น', 'แล้ว', 'ได้', 'อยู่', 'เท่านั้น', 'ครั้ง', 'กัน', 'เสมอ', 'ไว้', 'จริง', 'เร็ว']);
/** Compounds ICU splits (or mis-reads) that must never break inside: construction vocabulary plus this UI's words. */
const COMPOUND = new Set(['ทางเดิน', 'ทางเข้า', 'เสาเหลี่ยม', 'เสาเข็ม', 'เสากลม', 'กำลังอัด', 'เผยแพร่', 'ทีมงาน', 'รายละเอียด', 'ห้องปฏิบัติการ', 'ปฏิบัติการ',
  'ทรงกระบอก', 'แข็งตัว', 'รับน้ำหนัก', 'น้ำหนัก', 'เริ่มต้น', 'ค่าเผื่อ', 'คัดลอก', 'รูปแบบ', 'รูปทรง', 'ตัวกรอง', 'มหาแกร่ง', 'ไหลตัวดี', 'ไหลตัว', 'เทง่าย', 'เทปั๊ม',
  'ปั๊มลื่น', 'ทนเค็ม', 'ผลทดสอบ', 'ข้อมูลจำเพาะ', 'หน้าตัด', 'หน้างาน', 'เส้นผ่านศูนย์กลาง', 'ภาษีมูลค่าเพิ่ม', 'มูลค่าเพิ่ม', 'ตรวจสอบ', 'แบบหล่อ', 'ลานจอดรถ',
  'จอดรถ', 'ลานบ้าน', 'สภาพแวดล้อม', 'เหล็กเสริม', 'ใช้งาน', 'ยุบตัว', 'วางแผน', 'ประมาณการ', 'ตัวเลือก', 'จำนวนเต็ม', 'ออกแบบ', 'ดูราคา', 'อายุทดสอบ',
  'ชนิดตัวอย่าง', 'เก็บตัวอย่าง', 'ข้นเหลว', 'คอนกรีตสด', 'เฉพาะงาน', 'เปิดใช้', 'ขนาดเล็ก', 'เท่ากัน', 'จัดเตรียม', 'หมวกนิรภัย', 'ใช้ได้', 'ติดลบ',
  'สอบถาม', 'บังคับ', 'เหมาะสม', 'ส่งไป', 'แนะนำ', 'ทั่วไป', 'ปูนซีเมนต์', 'ไม่มี', 'ไม่ใช่', 'ลูกบาศก์เมตร', 'ผสมเสร็จ', 'รถโม่', 'ได้รับ']);
const CPFX = new Set();
for (const w of COMPOUND) for (let i = 1; i <= w.length; i++) CPFX.add(w.slice(0, i));
/** Stand-alone marks that belong to the word before (a slash, a dash) or after (an operator). */
const PUNCT_PREV = new Set(['/', '—', '–', '·', ':', '|']);
const PUNCT_NEXT = new Set(['×', '+', '=', '≈']);
/** A phrase up to this many spacing characters is kept whole (~ the narrowest text column it can sit in). */
export const PHRASE_KEEP = 18;
const NBSP = '\u00a0';
let SEG = null;
try { SEG = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('th', { granularity: 'word' }) : null; } catch { SEG = null; }

const spacingLength = (s) => s.replace(TH_MARK, '').length;

/** One space-free Thai chunk -> pieces: compounds merged, lead/trail words glued to their neighbours. */
function glueChunk(chunk) {
  const segs = [...SEG.segment(chunk)].map((s) => ({ t: s.segment, w: !!s.isWordLike }));
  // 1. the longest listed compound over up to four ICU segments becomes one word
  const words = [];
  for (let i = 0; i < segs.length;) {
    let j = i, best = i, acc = segs[i].t;
    while (j + 1 < segs.length && j - i < 3 && CPFX.has(acc)) { j++; acc += segs[j].t; if (COMPOUND.has(acc)) best = j; }
    words.push({ t: segs.slice(i, best + 1).map((s) => s.t).join(''), w: segs[i].w || best > i, multi: best > i });
    i = best + 1;
  }
  // 2. a lead word takes the next word, a trail word joins the previous one, marks join their word
  const units = [];
  let joinNext = false;
  for (const x of words) {
    const open = !x.w && /^[([{“‘"]+$/.test(x.t);
    const attach = units.length > 0 && (joinNext || (x.w && TRAIL.has(x.t)) || (!x.w && !open));
    if (attach) { const u = units[units.length - 1]; u.t += x.t; u.n += 1; } else units.push({ t: x.t, n: x.multi ? 2 : 1 });
    joinNext = open || (x.w && LEAD.has(x.t)) || x.t === NBSP;
  }
  return units.map((u) => (u.n > 1 ? { keep: [u.t] } : u.t));
}

/** Pieces for one line of text (no newlines). See the block comment above. */
export function phrases(line) {
  const text = String(line ?? '');
  if (!text) return [];
  // glue stand-alone marks to their word with a no-break space: "พื้น /" + "ทางเดิน", "กว้าง" + "× ลึก", "column /" + "pile"
  const words = text.split(/ +/);
  const toks = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (PUNCT_PREV.has(w) && toks.length) toks[toks.length - 1] += NBSP + w;
    else if (PUNCT_NEXT.has(w) && i < words.length - 1) { words[i + 1] = w + NBSP + words[i + 1]; }
    else toks.push(w);
  }
  if (!SEG || !TH_CHAR.test(text)) return [toks.join(' ')];
  const out = [];
  toks.forEach((tok, i) => {
    if (i) out.push(' ');
    if (!tok) return;
    if (!TH_CHAR.test(tok)) { out.push(tok); return; }
    const inner = glueChunk(tok);
    if (spacingLength(tok) <= PHRASE_KEEP && (inner.length > 1 || typeof inner[0] !== 'string')) out.push({ keep: inner.length === 1 ? inner[0].keep : inner });
    else out.push(...inner);
  });
  // neighbouring plain strings merge
  return out.reduce((acc, p) => { if (typeof p === 'string' && typeof acc[acc.length - 1] === 'string') acc[acc.length - 1] += p; else acc.push(p); return acc; }, []);
}

// Browser only (never called on the server). A kept phrase is an inline-block so it moves to the next line whole.
// One that is wider than its whole line must wrap inside itself anyway, and as a box it would then fill that line
// and push the next words down; such a unit goes back to plain inline flow (.cc-ph--flow) and ICU wraps it with
// its neighbours. Outer units settle before the units nested in them. Hidden units are judged when shown.
export function fitPhrases(root) {
  if (typeof document === 'undefined' || !root || !root.querySelectorAll) return;
  const all = [...root.querySelectorAll('.cc-ph')];
  if (!all.length) return;
  for (const s of all) s.classList.remove('cc-ph--flow');
  const levels = [];
  for (const s of all) {
    let d = 0;
    for (let p = s.parentElement; p && p !== root; p = p.parentElement) if (p.classList.contains('cc-ph')) d++;
    (levels[d] ??= []).push(s);
  }
  for (const list of levels) {
    if (!list) continue;
    const wrapped = list.filter((s) => {   // all reads first, then all writes: one layout per nesting level
      if (!s.getClientRects().length) return false;
      const cs = getComputedStyle(s);
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5;
      return s.getBoundingClientRect().height > lh * 1.5;
    });
    for (const s of wrapped) s.classList.add('cc-ph--flow');
  }
}

/** Fit now, once the web fonts are in, and whenever the viewport width changes. Returns a cleanup function. */
export function watchPhrases(root = typeof document !== 'undefined' ? document.body : null) {
  if (!root || typeof window === 'undefined') return () => {};
  let w = window.innerWidth, raf = 0;
  const run = () => { raf = 0; fitPhrases(root); };
  const onResize = () => { if (window.innerWidth === w) return; w = window.innerWidth; if (!raf) raf = requestAnimationFrame(run); };
  run();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!raf) raf = requestAnimationFrame(run); });
  window.addEventListener('resize', onResize, { passive: true });
  return () => { window.removeEventListener('resize', onResize); cancelAnimationFrame(raf); };
}
