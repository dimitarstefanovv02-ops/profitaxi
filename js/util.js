// ProfiTaxi – общи помощни функции: дати, формати, DOM, икони

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
export const fmtNum = (n) => nf0.format(Math.round(n || 0));
export const fmtNum1 = (n) => nf1.format(n || 0);
// Пари. Суми над 100 000 € се съкращават („350,8 хил. €“, „1,2 млн. €“);
// пълната сума дава moneyFull().
export function money(n, dec = 0) {
  const v = Number(n) || 0;
  const a = Math.abs(v);
  const sign = v < 0 && Math.round(a * (dec ? 100 : 1)) !== 0 ? '−' : '';
  if (a >= 1e6) return `${sign}${nf1.format(a / 1e6)} млн. €`;
  if (a >= 1e5) return `${sign}${nf1.format(a / 1e3)} хил. €`;
  const s = dec ? nf2.format(a) : nf0.format(Math.round(a));
  return `${sign}${s} €`;
}
export function moneyFull(n) {
  const v = Number(n) || 0;
  return `${v < 0 && Math.round(Math.abs(v)) ? '−' : ''}${nf0.format(Math.round(Math.abs(v)))} €`;
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
const P = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  wallet: 'M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2zM16 14.5h.01',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  fuel: 'M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16M3 21h13M4 10h11M15 8l3.5 3v6.5a1.5 1.5 0 0 0 3 0V8l-3-3',
  wash: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  parking: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9.5 17V7h3.5a3 3 0 0 1 0 6H9.5',
  wrench: 'M14.7 6.3a4 4 0 0 0 5.3 5.3L21 13l-8 8-3-3 6.7-6.7M14.7 6.3 13 3 9.5 6.5l3.3 1.7M4 20l6-6',
  food: 'M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M17 21V3c-2.5 1.5-4 4-4 8h4',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  left: 'M15 18l-6-6 6-6',
  right: 'M9 18l6-6-6-6',
  down: 'M6 9l6 6 6-6',
  x: 'M18 6 6 18M6 6l12 12',
  check: 'M20 6 9 17l-5-5',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10.3 21a1.9 1.9 0 0 0 3.4 0',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  auto: 'M12 21a9 9 0 1 0 0-18v18z M12 3a9 9 0 0 1 0 18',
  logout: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3',
  download: 'M12 3v12M7 10l5 5 5-5M4 21h16',
  print: 'M6 9V3h12v6M6 18H4v-7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7h-2M6 14h12v7H6z',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.1a4 4 0 0 1 0 7.8M22 21a7 7 0 0 0-4-6.3',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5',
  play: 'M7 4v16l13-8z',
  stop: 'M6 6h12v12H6z',
  car: 'M5 17h14M3 17v-4l2.5-5.5A2 2 0 0 1 7.3 6h9.4a2 2 0 0 1 1.8 1.5L21 13v4M3 13h18M6.5 17v2.5M17.5 17v2.5M7 14.5h.01M17 14.5h.01',
  gauge: 'M12 14l4-4M3.3 17a10 10 0 1 1 17.4 0',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  road: 'M5 21 9 3M19 21 15 3M12 4v2M12 10v3M12 17v3',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3',
  flame: 'M12 22a7 7 0 0 0 7-7c0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-2 2-5 4.5-5 8a7 7 0 0 0 7 7z',
  receipt: 'M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM9 8h6M9 12h6',
  shield: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  coins: 'M9 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM15.5 9.5A6 6 0 1 1 9.5 16',
  card: 'M2 6h20v12H2zM2 10h20M6 15h4',
  phone: 'M7 2h10v20H7zM11 18h2',
  heart: 'M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  calendar: 'M4 5h16v16H4zM4 10h16M8 3v4M16 3v4',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  doc: 'M6 2h9l5 5v15H6zM14 2v6h6',
  key: 'M14.5 9.5a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0zM13.5 12.5 21 20M18 17l2-2',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
};
export function icon(name, size = 22, extra = '') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.9');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'ic ' + extra);
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', P[name] || P.more);
  svg.appendChild(path);
  return svg;
}
