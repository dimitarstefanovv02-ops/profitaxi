// Чисто – общи помощни функции: дати, формати, DOM, икони

// ---------- Дати (локални низове YYYY-MM-DD) ----------
export const pad = (n) => String(n).padStart(2, '0');
export const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => dateStr(new Date());
export const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return dateStr(d); };
export const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate(); // m: 0-11
export const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
export const startOfWeek = (s) => { const d = parseDate(s); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return dateStr(d); };
export const startOfMonth = (s) => s.slice(0, 8) + '01';
export const endOfMonth = (s) => { const d = parseDate(s); return dateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };
export const minStr = (a, b) => (a < b ? a : b);
export const maxStr = (a, b) => (a > b ? a : b);
export function eachDay(from, to) { const out = []; let c = from; while (c <= to) { out.push(c); c = addDays(c, 1); } return out; }
export const isoToDateStr = (iso) => dateStr(new Date(iso));
export const toLocalInput = (iso) => { const d = new Date(iso); return `${dateStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const fromLocalInput = (v) => new Date(v).toISOString();

export const MONTHS = ['януари', 'февруари', 'март', 'април', 'май', 'юни', 'юли', 'август', 'септември', 'октомври', 'ноември', 'декември'];
export const MONTHS_SHORT = ['яну', 'фев', 'мар', 'апр', 'май', 'юни', 'юли', 'авг', 'сеп', 'окт', 'ное', 'дек'];
export const WEEKDAYS = ['Понеделник', 'Вторник', 'Сряда', 'Четвъртък', 'Петък', 'Събота', 'Неделя'];
export const WD_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
export const weekdayIdx = (s) => (parseDate(s).getDay() + 6) % 7;

export function fmtDate(s, opts = {}) {
  const d = parseDate(s);
  const base = `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  return opts.year ? `${base} ${d.getFullYear()}` : base;
}
export function fmtDateLong(s) {
  const d = parseDate(s);
  return `${WEEKDAYS[weekdayIdx(s)]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
export const fmtTime = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export function fmtDuration(hours) {
  const total = Math.max(0, Math.round(hours * 60));
  return `${Math.floor(total / 60)}ч ${pad(total % 60)}м`;
}
export function fmtTimer(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

// ---------- Числа и пари ----------
const nf0 = new Intl.NumberFormat('bg-BG', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat('bg-BG', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
// Групи от по три цифри и при четирицифрени числа: 1 575, а не 1575 (bg-BG по подразбиране не ги групира)
const grp = (s) => { const [i, f] = s.split(','); return i.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + (f != null ? ',' + f : ''); };
export const fmtNum = (n) => (n < 0 && Math.round(n) ? '−' : '') + grp(nf0.format(Math.abs(Math.round(n || 0))));
// минус само ако след закръгляне до 0,1 числото не е нула (−0,04 → „0,0“, не „−0,0“)
export const fmtNum1 = (n) => (n < 0 && Math.round(Math.abs(n) * 10) ? '−' : '') + grp(nf1.format(Math.abs(n || 0)));
// Пари. Суми над 100 000 € се съкращават („350,8 хил. €“, „1,2 млн. €“);
// пълната сума дава moneyFull().
export function money(n, dec = 0) {
  const v = Number(n) || 0;
  const a = Math.abs(v);
  const sign = v < 0 && Math.round(a * (dec ? 100 : 1)) !== 0 ? '−' : '';
  // от 999 950 нагоре „хил.“ би се закръглило до „1000,0 хил. €“ – показваме „1,0 млн. €“
  if (a >= 999950) return `${sign}${nf1.format(a / 1e6)} млн. €`;
  if (a >= 1e5) return `${sign}${nf1.format(a / 1e3)} хил. €`;
  const s = grp(dec ? nf2.format(a) : nf0.format(Math.round(a)));
  return `${sign}${s} €`;
}
export function moneyFull(n) {
  const v = Number(n) || 0;
  return `${v < 0 && Math.round(Math.abs(v)) ? '−' : ''}${grp(nf0.format(Math.round(Math.abs(v))))} €`;
}
export const money2 = (n) => money(n, 2);
export const parseNum = (v) => { const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };

// ---------- Случайни числа (детерминистични, за демо данни) ----------
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// ---------- DOM ----------
const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'g', 'text', 'defs', 'linearGradient', 'stop', 'pattern', 'title']);
export function h(tag, attrs, ...kids) {
  const isSvg = SVG_TAGS.has(tag);
  const el = isSvg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'class') el.setAttribute('class', v);
      else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sv == null) continue; if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'value' && !isSvg) el.value = v;
      else if (k === 'checked' && !isSvg) el.checked = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  const add = (c) => {
    if (c == null || c === false || c === true) return;
    if (Array.isArray(c)) return c.forEach(add);
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  kids.forEach(add);
  return el;
}
// Заменя съдържанието на елемент (пропуска false/null, разгъва масиви)
export function fill(el, ...kids) {
  clear(el);
  const add = (c) => { if (c == null || c === false || c === true) return; if (Array.isArray(c)) return c.forEach(add); el.appendChild(c instanceof Node ? c : document.createTextNode(String(c))); };
  kids.forEach(add);
  return el;
}
export const cx = (...a) => a.filter(Boolean).join(' ');
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

// ---------- Икони (линейни, 24×24) ----------
// Икони в два слоя (duotone): мек цветен фон + ясен контур. [фон, контур]
const D = {
  pointer: ['M9 11.5V5.2a1.7 1.7 0 0 1 3.4 0v5.3l4.3.9c1.3.3 2.1 1.5 1.9 2.8l-.6 4.2a3 3 0 0 1-3 2.6h-3.6a3 3 0 0 1-2.4-1.2l-3.3-4.4a1.6 1.6 0 0 1 2.4-2.1z', 'M9 13.2V5.2a1.7 1.7 0 0 1 3.4 0v5.3l4.3.9c1.3.3 2.1 1.5 1.9 2.8l-.6 4.2a3 3 0 0 1-3 2.6h-3.6a3 3 0 0 1-2.4-1.2l-3.3-4.4a1.6 1.6 0 0 1 2.4-2.1L9 13.2zM5.5 4.5l1.3 1.3M4 8.5h1.8M14.6 5.8l1.3-1.3'],
  home: ['M4 10.4 12 4l8 6.4V19a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 19z', 'M3 10.8 12 3.6l9 7.2M5.5 9v10.4c0 .7.5 1.2 1.2 1.2h10.6c.7 0 1.2-.5 1.2-1.2V9M9.8 20.6v-5.2c0-.6.5-1 1-1h2.4c.6 0 1 .4 1 1v5.2'],
  list: ['M4 4h16v16H4z', 'M9 7.5h10M9 12h10M9 16.5h10M5 7.5h.01M5 12h.01M5 16.5h.01'],
  chart: ['M5 13h3.5v7H5zM10.25 8h3.5v12h-3.5zM15.5 4h3.5v16h-3.5z', 'M5 20v-6.2c0-.4.3-.8.8-.8h1.9c.4 0 .8.4.8.8V20M10.25 20V8.8c0-.4.4-.8.8-.8h1.9c.4 0 .8.4.8.8V20M15.5 20V4.8c0-.4.4-.8.8-.8h1.9c.4 0 .8.4.8.8V20M3 20.5h18'],
  wallet: ['M3.5 8.5h15a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z', 'M3.5 8.5V18a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-7.5a2 2 0 0 0-2-2h-15zM3.5 8.5 15.2 4.3a1.5 1.5 0 0 1 2 1.4v2.8M20.5 12.5h-3.2a1.8 1.8 0 0 0 0 3.6h3.2'],
  user: ['M12 12.5a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4zM4.5 20.5c.6-4 3.7-6.3 7.5-6.3s6.9 2.3 7.5 6.3z', 'M12 12.5a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4zM4.5 20.5c.6-4 3.7-6.3 7.5-6.3s6.9 2.3 7.5 6.3'],
  users: ['M9 11.5a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6zM2.5 20c.5-3.6 3.3-5.7 6.5-5.7s6 2.1 6.5 5.7z', 'M9 11.5a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6zM2.5 20c.5-3.6 3.3-5.7 6.5-5.7s6 2.1 6.5 5.7M16 4.2a3.6 3.6 0 0 1 0 7M18 14.6c2 .7 3.2 2.6 3.5 5.4'],
  fuel: ['M5 5.5A2 2 0 0 1 7 3.5h5.5a2 2 0 0 1 2 2V20H5z', 'M5 20V5.5a2 2 0 0 1 2-2h5.5a2 2 0 0 1 2 2V20M3.5 20h12.5M7.5 7.5h4.5M14.5 10h1.3c.9 0 1.7.8 1.7 1.7v4.6a1.4 1.4 0 0 0 2.8 0V8.6l-2.6-2.6'],
  wash: ['M12 3.5s5.5 6 5.5 10.2a5.5 5.5 0 0 1-11 0C6.5 9.5 12 3.5 12 3.5z', 'M12 3.5s5.5 6 5.5 10.2a5.5 5.5 0 0 1-11 0C6.5 9.5 12 3.5 12 3.5zM9.5 14.5a2.6 2.6 0 0 0 2.5 2.4'],
  parking: ['M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z', 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM10 16.5v-9h3a2.8 2.8 0 0 1 0 5.6h-3'],
  wrench: ['M14.6 3.6a5 5 0 0 0-4.8 6.6l-6 6a2 2 0 0 0 2.8 2.8l6-6a5 5 0 0 0 6.6-4.8l-2.6 2.6-3-.6-.6-3z', 'M14.6 3.6a5 5 0 0 0-4.8 6.6l-6 6a2 2 0 0 0 2.8 2.8l6-6a5 5 0 0 0 6.6-4.8l-2.6 2.6-3-.6-.6-3z'],
  tool: ['M3.5 14.5 9.5 8.5l6 6-6 6z', 'M13.5 4.5l6 6M16.5 7.5 9 15M3.5 14.5 9.5 8.5l6 6-6 6zM15 3l6 6'],
  tire: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM12 3v5.5M12 15.5V21M3 12h5.5M15.5 12H21'],
  radio: ['M4 9h16v11H4z', 'M4.5 9h15a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM7 9l10-5M8.5 16.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM14 13h3.5M14 16h3.5'],
  bank: ['M3.5 9 12 4l8.5 5z', 'M3.5 9 12 4l8.5 5zM5.5 9.5v7.5M10 9.5v7.5M14 9.5v7.5M18.5 9.5v7.5M3 20h18M4 17h16'],
  tag: ['M3.5 4.5v6.3l9 9 7.3-7.3-9-9H4.5a1 1 0 0 0-1 1z', 'M3.5 4.5v6.3l9 9 7.3-7.3-9-9H4.5a1 1 0 0 0-1 1zM8 8.5h.01'],
  food: ['M7 3v8M4 3v5a3 3 0 0 0 6 0V3', 'M7 11v10M17 21V3c-2.5 1.5-4 4-4 8h4'],
  plus: [null, 'M12 5v14M5 12h14'],
  minus: [null, 'M5 12h14'],
  left: [null, 'M15 18l-6-6 6-6'],
  right: [null, 'M9 18l6-6-6-6'],
  down: [null, 'M6 9l6 6 6-6'],
  up: [null, 'M6 15l6-6 6 6'],
  flag: [null, 'M5 21V4M5 4.5h11l-2 4 2 4H5'],
  arrowLeft: [null, 'M19 12H5M11 6l-6 6 6 6'],
  info: [null, 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 7.6h.01'],
  arrowUp: [null, 'M12 19V5M6 11l6-6 6 6'],
  arrowDown: [null, 'M12 5v14M6 13l6 6 6-6'],
  trend: [null, 'M3 17l6-6 4 4 8-8M15 7h6v6'],
  grid: [null, 'M8 5.5h.01M8 12h.01M8 18.5h.01M16 5.5h.01M16 12h.01M16 18.5h.01M7 5.5a1 1 0 1 0 2 0 1 1 0 0 0-2 0M7 12a1 1 0 1 0 2 0 1 1 0 0 0-2 0M7 18.5a1 1 0 1 0 2 0 1 1 0 0 0-2 0M15 5.5a1 1 0 1 0 2 0 1 1 0 0 0-2 0M15 12a1 1 0 1 0 2 0 1 1 0 0 0-2 0M15 18.5a1 1 0 1 0 2 0 1 1 0 0 0-2 0'],
  eyeoff: [null, 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.8M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.9 0 3.5-.6 4.9-1.4M9.9 9.9a3 3 0 0 0 4.2 4.2'],
  inbox: ['M3.5 13.5h5l1.5 2.5h4l1.5-2.5h5V19a1.5 1.5 0 0 1-1.5 1.5h-14A1.5 1.5 0 0 1 3.5 19z', 'M3.5 13.5 6 5.5a1.5 1.5 0 0 1 1.4-1h9.2a1.5 1.5 0 0 1 1.4 1l2.5 8M3.5 13.5V19a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5v-5.5M3.5 13.5h5l1.5 2.5h4l1.5-2.5h5'],
  upload: [null, 'M12 15.5V4M7.5 8.5 12 4l4.5 4.5M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15'],
  archive: ['M4 8.5h16V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z', 'M3 4.5h18v4H3zM4 8.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19V8.5M10 12.5h4'],
  x: [null, 'M18 6 6 18M6 6l12 12'],
  check: [null, 'M20 6 9 17l-5-5'],
  copy: ['M9 9h10.5a1.5 1.5 0 0 1 1.5 1.5V20a1.5 1.5 0 0 1-1.5 1.5H10.5A1.5 1.5 0 0 1 9 20z', 'M9 9h10.5a1.5 1.5 0 0 1 1.5 1.5V20a1.5 1.5 0 0 1-1.5 1.5H10.5A1.5 1.5 0 0 1 9 20zM15 9V4.5A1.5 1.5 0 0 0 13.5 3H4.5A1.5 1.5 0 0 0 3 4.5v9A1.5 1.5 0 0 0 4.5 15H9'],
  bell: ['M6 9.5a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15.5 6 9.5z', 'M6 9.5a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15.5 6 9.5zM10 20.5a2.3 2.3 0 0 0 4 0'],
  trash: ['M5.5 6.5h13l-1 13.2a1.5 1.5 0 0 1-1.5 1.3H8a1.5 1.5 0 0 1-1.5-1.3z', 'M3.5 6.5h17M9 6.5V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M5.5 6.5l1 13.2a1.5 1.5 0 0 0 1.5 1.3h8a1.5 1.5 0 0 0 1.5-1.3l1-13.2M10 11v6M14 11v6'],
  edit: ['M4 20v-3.8L15.5 4.7a1.8 1.8 0 0 1 2.6 0l1.2 1.2a1.8 1.8 0 0 1 0 2.6L7.8 20z', 'M4 20v-3.8L15.5 4.7a1.8 1.8 0 0 1 2.6 0l1.2 1.2a1.8 1.8 0 0 1 0 2.6L7.8 20zM13.5 6.7l3.8 3.8'],
  sun: ['M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z', 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'],
  moon: ['M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a6.6 6.6 0 0 0 9.7 9.7z', 'M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a6.6 6.6 0 0 0 9.7 9.7z'],
  auto: ['M12 3a9 9 0 0 1 0 18z', 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 3v18'],
  logout: ['M4 4.5A1.5 1.5 0 0 1 5.5 3H14v18H5.5A1.5 1.5 0 0 1 4 19.5z', 'M14 3H5.5A1.5 1.5 0 0 0 4 4.5v15A1.5 1.5 0 0 0 5.5 21H14M17 16.5l4.5-4.5L17 7.5M21.5 12H10'],
  download: ['M4 15h16v4.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5z', 'M12 3.5v11.5M7.5 10.5 12 15l4.5-4.5M4 15v4.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V15'],
  print: ['M4 9.5h16v7H4z', 'M6.5 9.5V3.5h11v6M6.5 16.5H5A1.5 1.5 0 0 1 3.5 15v-4A1.5 1.5 0 0 1 5 9.5h14a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-1.5M6.5 14h11v7h-11z'],
  alert: ['M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z', 'M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4.5M12 17h.01'],
  mic: ['M9 6a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0z', 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7'],
  faceid: [null, 'M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M9 9v1.5M15 9v1.5M12 9v4.5h-1M9.5 16a3.5 3.5 0 0 0 5 0'],
  search: [null, 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20.5 20.5 16 16'],
  play: ['M7 4.5v15l12-7.5z', 'M7 4.5v15l12-7.5z'],
  stop: ['M6 6h12v12H6z', 'M7.5 6h9A1.5 1.5 0 0 1 18 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 16.5v-9A1.5 1.5 0 0 1 7.5 6z'],
  car: ['M4 12.5 6 7.3A2 2 0 0 1 7.9 6h8.2a2 2 0 0 1 1.9 1.3l2 5.2V17H4z', 'M3.5 17v-4.2c0-.3 0-.5.2-.8L6 7.3A2 2 0 0 1 7.9 6h8.2a2 2 0 0 1 1.9 1.3l2.3 4.7c.1.3.2.5.2.8V17a1 1 0 0 1-1 1h-1.5M3.5 17a1 1 0 0 0 1 1H6M4 12.5h16M6 18v1.5M18 18v1.5M7.5 15h1.5M15 15h1.5M9 6V4.5h6V6'],
  gauge: ['M3.5 16.5a8.5 8.5 0 1 1 17 0z', 'M3.5 16.5a8.5 8.5 0 1 1 17 0M12 16.5l4-5M3.5 16.5h17M7 12.5l.9.6M12 8v1M17 12.5l-.9.6'],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.2 2'],
  road: ['M8.5 3h7l4 18h-15z', 'M8.5 3 4.5 21M15.5 3l4 18M12 4v2.5M12 10.5v3M12 17.5v3'],
  target: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 12.5h.01'],
  trophy: ['M7 4h10v5.5a5 5 0 0 1-10 0z', 'M7 4h10v5.5a5 5 0 0 1-10 0zM7 6H4.5v1.5A3.5 3.5 0 0 0 7.5 11M17 6h2.5v1.5A3.5 3.5 0 0 1 16.5 11M12 14.5V18M8.5 21h7M9.5 18h5'],
  flame: ['M12 21.5a7 7 0 0 0 7-7c0-4.4-3.2-6.6-4.3-10.5-2.2 2-3 4-3 6-1-.8-2-2.2-2.2-4C7 8.2 5 10.7 5 14.5a7 7 0 0 0 7 7z', 'M12 21.5a7 7 0 0 0 7-7c0-4.4-3.2-6.6-4.3-10.5-2.2 2-3 4-3 6-1-.8-2-2.2-2.2-4C7 8.2 5 10.7 5 14.5a7 7 0 0 0 7 7zM12 21.5a3 3 0 0 1-3-3c0-2 1.6-3 3-5 1.4 2 3 3 3 5a3 3 0 0 1-3 3z'],
  receipt: ['M5 3h14v18l-2.5-1.6L14 21l-2-1.6L10 21l-2.5-1.6L5 21z', 'M5 3h14v18l-2.5-1.6L14 21l-2-1.6L10 21l-2.5-1.6L5 21zM8.5 8h7M8.5 12h7M8.5 16h4'],
  shield: ['M12 3 4.5 6v6c0 4.8 3.3 7.7 7.5 9 4.2-1.3 7.5-4.2 7.5-9V6z', 'M12 3 4.5 6v6c0 4.8 3.3 7.7 7.5 9 4.2-1.3 7.5-4.2 7.5-9V6zM9 12l2.2 2.2L15.5 10'],
  lock: ['M5 11h14v10H5z', 'M6.5 11h11A1.5 1.5 0 0 1 19 12.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5v-7A1.5 1.5 0 0 1 6.5 11zM8 11V7.5a4 4 0 0 1 8 0V11M12 15v2.5'],
  coins: ['M9 14.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11z', 'M9 14.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM15.3 9.2a5.5 5.5 0 1 1-6.1 9.1M9 6.5v5M7.3 8h2.6a1 1 0 0 1 0 2H8.1a1 1 0 0 0 0 2h2.6'],
  card: ['M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z', 'M4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-11A1.5 1.5 0 0 1 4.5 5zM3 9.5h18M6.5 15h4'],
  phone: ['M7 4a1.5 1.5 0 0 1 1.5-1.5h7A1.5 1.5 0 0 1 17 4v16a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 20z', 'M8.5 2.5h7A1.5 1.5 0 0 1 17 4v16a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 20V4a1.5 1.5 0 0 1 1.5-1.5zM11 18.5h2'],
  call: ['M5 4h3.5l1.8 4.3-2.3 1.5a11 11 0 0 0 6.2 6.2l1.5-2.3L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4z', 'M5 4h3.5l1.8 4.3-2.3 1.5a11 11 0 0 0 6.2 6.2l1.5-2.3L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4z'],
  heart: ['M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z', 'M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z'],
  more: [null, 'M5 12h.01M12 12h.01M19 12h.01'],
  calendar: ['M4 9.5h16v10a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5z', 'M5.5 5h13A1.5 1.5 0 0 1 20 6.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5v-13A1.5 1.5 0 0 1 5.5 5zM4 9.5h16M8 3v4M16 3v4M8 13.5h.01M12 13.5h.01M16 13.5h.01M8 17h.01M12 17h.01'],
  bolt: ['M13 2 4 14h7l-1 8 9-12h-7z', 'M13 2 4 14h7l-1 8 9-12h-7z'],
  doc: ['M6 3.5A1.5 1.5 0 0 1 7.5 2H14l5 5v13.5a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 6 20.5z', 'M7.5 2H14l5 5v13.5a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 6 20.5v-17A1.5 1.5 0 0 1 7.5 2zM14 2v5h5M9 12.5h6M9 16.5h4'],
  key: ['M9.5 14.5a5 5 0 1 0 0-10 5 5 0 0 0 0 10z', 'M9.5 14.5a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM13 13l8 8M17.5 17.5l2-2M15.5 15.5l1.5-1.5M8 9.5h.01'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  pin: ['M12 21.5s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z', 'M12 21.5s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
  route: ['M6 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z', 'M6 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM8.5 18.5h7a3.5 3.5 0 0 0 0-7h-7a3.5 3.5 0 0 1 0-7h7'],
  share: ['M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4'],
  gift: ['M4 11h16v9.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z', 'M3.5 7.5h17v3.5h-17zM5 11v9.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V11M12 7.5v14M12 7.5S10.5 3 8 3a2.2 2.2 0 0 0 0 4.5M12 7.5S13.5 3 16 3a2.2 2.2 0 0 1 0 4.5'],
  camera: ['M3 8.5A1.5 1.5 0 0 1 4.5 7h3L9 4.5h6L16.5 7h3A1.5 1.5 0 0 1 21 8.5v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z', 'M4.5 7h3L9 4.5h6L16.5 7h3A1.5 1.5 0 0 1 21 8.5v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5v-10A1.5 1.5 0 0 1 4.5 7zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z'],
  plane: ['M10.5 13.5 3 11l1.5-1.5 7.5 1 4.5-4.5a2 2 0 0 1 2.8 2.8L14.8 13l1 7.5L14.3 22l-2.5-7.5z', 'M10.5 13.5 3 11l1.5-1.5 7.5 1 4.5-4.5a2 2 0 0 1 2.8 2.8L14.8 13l1 7.5L14.3 22l-2.5-7.5zM6.5 17.5 4 20'],
  star: ['M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z', 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z'],
  sparkle: ['M12 3c.6 4.2 2.3 6.4 6.5 7-4.2.6-5.9 2.8-6.5 7-.6-4.2-2.3-6.4-6.5-7 4.2-.6 5.9-2.8 6.5-7z', 'M12 3c.6 4.2 2.3 6.4 6.5 7-4.2.6-5.9 2.8-6.5 7-.6-4.2-2.3-6.4-6.5-7 4.2-.6 5.9-2.8 6.5-7zM19 16v4M17 18h4'],
};
export const hasIcon = (n) => !!D[n];
export function icon(name, size = 22, extra = '') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'ic ' + extra);
  const [f, st] = D[name] || D.more;
  if (f) { const a = document.createElementNS(SVG_NS, 'path'); a.setAttribute('d', f); a.setAttribute('fill', 'currentColor'); a.setAttribute('class', 'ic-fill'); svg.appendChild(a); }
  const b = document.createElementNS(SVG_NS, 'path');
  b.setAttribute('d', st);
  b.setAttribute('stroke', 'currentColor'); b.setAttribute('stroke-width', '1.8'); b.setAttribute('stroke-linecap', 'round'); b.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(b);
  return svg;
}
