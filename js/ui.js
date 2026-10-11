// ProfiTaxi – общи UI компоненти: листове, цифрова клавиатура, тостове, графики

import { h, icon, cx, money, fmtNum, clear } from './util.js';

// ---------- Разгъване: екранът сам слиза до отвореното ----------
// Когато нещо се разгъне (падащо поле, „Покажи повече“, панел), показваме съдържанието му,
// без да скриваме заглавието му отгоре. Долното меню и лентата „Запази“ се вземат предвид.
export function reveal(el, { pad = 14 } = {}) {
  if (!el) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const r = el.getBoundingClientRect();
    const bars = [...document.querySelectorAll('.nav, .save-bar, .arr-bar')].filter((b) => b.offsetParent && getComputedStyle(b).position === 'fixed');
    const bottom = Math.min(innerHeight, ...bars.map((b) => b.getBoundingClientRect().top)) - pad;
    if (r.bottom <= bottom) return;
    const dy = Math.min(r.bottom - bottom, Math.max(0, r.top - 72));
    if (dy > 4) window.scrollBy({ top: dy, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }));
}
// Всеки <details>, отворен с пръст, слиза сам до съдържанието си
let summaryTap = 0;
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => { if (e.target.closest?.('summary')) summaryTap = Date.now(); }, true);
  document.addEventListener('toggle', (e) => {
    const d = e.target;
    if (d.tagName === 'DETAILS' && d.open && Date.now() - summaryTap < 800) reveal(d);
  }, true);
}

// ---------- Тема ----------
// Теми: auto (като телефона), light, dark, sun (светла с висок контраст за деня),
// schedule (тъмна вечер от 19 до 7 ч, светла през деня)
export const THEMES = { auto: 'Като телефона', light: 'Светла', dark: 'Тъмна' };
// Старите „За слънце“ и „Тъмна вечер“ вече ги няма: стават светла и като телефона
const OLD = { sun: 'light', schedule: 'auto' };
const effective = (p) => OLD[p] || p;
export function applyTheme(pref) {
  const p = pref || localStorage.getItem('profitaxi.theme') || 'auto';
  const e = effective(p);
  const root = document.documentElement;
  if (e === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', e);
  const dark = e === 'dark' || (e === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#141313' : '#FDF8F8');
  applyTextSize();
}
export function setTheme(p) { localStorage.setItem('profitaxi.theme', p); applyTheme(p); }
export const getTheme = () => { const t = localStorage.getItem('profitaxi.theme') || 'auto'; return OLD[t] || t; };
export const isDark = () => { const e = effective(getTheme()); return e === 'dark' || (e === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches); };
// по график: проверяваме на всеки 5 минути дали е време за смяна на темата
setInterval(() => { if (getTheme() === 'schedule') applyTheme(); }, 5 * 60000);
// Размер на текста: всичко е в rem, затова растат и бутоните
export const TEXT_SIZES = { normal: 'Нормален', large: 'Голям', xl: 'Много голям' };
const SIZE_PCT = { normal: '100%', large: '112.5%', xl: '125%' };
export const getTextSize = () => { try { return localStorage.getItem('profitaxi.textSize') || 'normal'; } catch { return 'normal'; } };
export function setTextSize(k) { try { localStorage.setItem('profitaxi.textSize', k); } catch { /* */ } applyTextSize(); }
function applyTextSize() { document.documentElement.style.fontSize = SIZE_PCT[getTextSize()] || '100%'; }
// Видим бутон за светла/тъмна тема (запомня избора; без избор – по телефона)
export function themeToggle(onChange) {
  const btn = h('button', { class: 'icon-btn theme-toggle', type: 'button' });
  const paint = () => { const d = isDark(); btn.replaceChildren(icon(d ? 'sun' : 'moon', 20)); btn.setAttribute('aria-label', d ? 'Светла тема' : 'Тъмна тема'); btn.title = d ? 'Светла тема' : 'Тъмна тема'; };
  btn.addEventListener('click', () => { setTheme(isDark() ? 'light' : 'dark'); paint(); onChange?.(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', paint);
  paint();
  return btn;
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme());

// ---------- Тост ----------
let toastTimer;
export function toast(msg, kind = 'ok') {
  let el = document.getElementById('toast');
  if (!el) { el = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(el); }
  clear(el).appendChild(h('div', { class: cx('toast', kind) }, h('span', { class: 'toast-ic' }, icon(kind === 'err' ? 'alert' : 'check', 18)), h('span', null, msg)));
  try { navigator.vibrate?.(kind === 'err' ? [30, 40, 30] : 15); } catch { /* */ }
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

// ---------- Долен лист (bottom sheet) ----------
export function openSheet(build, { onClose, tall } = {}) {
  const root = document.getElementById('sheet-root') || document.body.appendChild(h('div', { id: 'sheet-root' }));
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    wrap.classList.remove('open');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => { wrap.remove(); onClose && onClose(); window.dispatchEvent(new Event('profitaxi:sheetclosed')); }, 220);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const panel = h('div', { class: cx('sheet', tall && 'tall'), role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'sheet-grip' }));
  const wrap = h('div', { class: 'sheet-wrap' }, h('div', { class: 'sheet-backdrop', onclick: close }), panel);
  const content = build(close);
  panel.appendChild(content);
  root.appendChild(wrap);
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
  return close;
}

export function sheetHead(title, close, sub) {
  return h('div', { class: 'sheet-head' },
    h('div', null, h('h2', null, title), sub && h('p', { class: 'muted small' }, sub)),
    h('button', { class: 'icon-btn', 'aria-label': 'Затвори', onclick: close }, icon('x')));
}

// ---------- Цифрова клавиатура ----------
// fields: [{ key, label, value, unit, decimals=2, max }]
// actions: [{ label, primary, run(values) }]  (run връща false, за да не се затвори)
export function openNumpad({ title, sub, fields, actions, top, focus = 0 }) {
  const vals = fields.map((f) => (f.value ? String(f.value).replace('.', ',') : ''));
  let active = focus, fresh = true, onKey;
  return openSheet((close) => {
    const displays = fields.map((f, i) => {
      const valEl = h('span', { class: 'np-val' });
      const btn = h('button', { class: 'np-field', onclick: () => { active = i; fresh = true; render(); } },
        h('span', { class: 'np-label' }, f.label), h('span', { class: 'np-display' }, valEl, h('span', { class: 'np-unit' }, f.unit || '€')));
      return { btn, valEl };
    });
    const render = () => displays.forEach((d, i) => {
      d.btn.classList.toggle('active', i === active);
      // поле с „auto“: ако е празно, показва и записва сметнатата стойност (напр. литри по последната цена)
      const auto = !vals[i] && fields[i].auto ? fields[i].auto(rawValues()) : 0;
      d.valEl.textContent = vals[i] || (auto ? '≈ ' + String(Math.round(auto * 10) / 10).replace('.', ',') : '0');
      d.valEl.classList.toggle('placeholder', !vals[i]);
    });
    const press = (k) => {
      const f = fields[active]; let v = fresh ? '' : vals[active]; fresh = false;
      if (k === 'back') v = v.slice(0, -1);
      else if (k === ',') { if ((f.decimals ?? 2) === 0 || v.includes(',')) return; v = (v || '0') + ','; }
      else {
        const dec = v.split(',')[1];
        if (dec != null && dec.length >= (f.decimals ?? 2)) return;
        if (v.replace(',', '').length >= 9) return;
        v = v === '0' ? k : v + k;
      }
      vals[active] = v; render();
      navigator.vibrate?.(8);
    };
    const rawValues = () => Object.fromEntries(fields.map((f, i) => [f.key, parseFloat((vals[i] || '0').replace(',', '.')) || 0]));
    const values = () => { const v = rawValues(); fields.forEach((f, i) => { if (!vals[i] && f.auto) v[f.key] = Math.round((f.auto(v) || 0) * 100) / 100; }); return v; };
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'back'].map((k) =>
      h('button', { class: cx('np-key', k === 'back' && 'np-back'), onclick: () => press(k), 'aria-label': k === 'back' ? 'Изтрий' : k },
        k === 'back' ? icon('left', 26) : k));
    onKey = (e) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === ',' || e.key === '.') press(',');
      else if (e.key === 'Backspace') press('back');
      else if (e.key === 'Enter') { const a = actions.find((x) => x.primary) || actions[0]; if (a.run(values()) !== false) close(); }
    };
    document.addEventListener('keydown', onKey);
    render();
    return h('div', { class: 'numpad' },
      sheetHead(title, close, sub),
      top && top(),
      h('div', { class: cx('np-fields', fields.length > 1 && 'multi') }, displays.map((d) => d.btn)),
      h('div', { class: 'np-keys' }, keys),
      h('div', { class: 'np-actions' }, actions.map((a) =>
        h('button', { class: cx('btn', a.primary ? 'btn-primary' : 'btn-ghost', 'btn-lg'), onclick: () => { if (a.run(values()) !== false) close(); } }, a.label))));
  }, { onClose: () => document.removeEventListener('keydown', onKey) });
}

// ---------- Потвърждение ----------
export function confirmSheet({ title, text, okLabel = 'Да', danger, onOk }) {
  openSheet((close) => h('div', null,
    sheetHead(title, close),
    text && h('p', { class: 'muted', style: { margin: '0 0 20px' } }, text),
    h('div', { class: 'row gap' },
      h('button', { class: 'btn btn-ghost btn-lg grow', onclick: close }, 'Отказ'),
      h('button', { class: cx('btn btn-lg grow', danger ? 'btn-danger' : 'btn-primary'), onclick: (e) => { if (e.currentTarget.dataset.done) return; e.currentTarget.dataset.done = '1'; close(); onOk(); } }, okLabel))));
}

// ---------- Сегментиран избор ----------
export function segmented(options, value, onChange, { small, wrap, page, outline = wrap } = {}) {
  return h('div', { class: cx('seg', small && 'seg-sm', wrap && 'seg-wrap', page && 'on-page', outline && 'seg-outline'), role: 'tablist' },
    Object.entries(options).map(([k, label]) =>
      h('button', { class: cx('seg-btn', k === value && 'on'), role: 'tab', 'aria-selected': String(k === value), onclick: () => onChange(k) }, label)));
}

// ---------- Пътят към целта (progress) ----------
export function roadProgress(pct) {
  const p = Math.max(0, Math.min(1, pct || 0));
  return h('div', { class: 'road', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(p * 100)) },
    h('div', { class: 'road-fill', style: { width: `${p * 100}%` } }),
    h('div', { class: 'road-lane' }),
    h('div', { class: 'road-car', style: { left: `calc(17px + (100% - 34px) * ${p})` } }, icon('car', 18)),
    h('div', { class: 'road-flag' }, icon('target', 16)));
}

// ---------- Стълбовидна графика (SVG + HTML надписи) ----------
export function barChart(points, { height = 160, valueKey = 'net', highlight, cls, fmt = money } = {}) {
  const n = points.length || 1;
  const W = 1000, H = height;
  const vals = points.map((p) => p[valueKey]);
  const max = Math.max(0, ...vals), min = Math.min(0, ...vals);
  const range = max - min || 1;
  const y = (v) => ((max - v) / range) * H;
  const zero = y(0);
  const step = W / n, bw = step * 0.62;
  const labelEvery = n > 20 ? Math.ceil(n / 8) : n > 12 ? 2 : 1;
  const svg = h('svg', { viewBox: `0 -6 ${W} ${H + 12}`, class: cx('bars', cls), preserveAspectRatio: 'none', role: 'img', 'aria-label': 'Графика на печалбата', style: { height: H + 'px' } },
    h('line', { x1: 0, x2: W, y1: zero, y2: zero, class: 'bars-zero', 'vector-effect': 'non-scaling-stroke' }),
    points.map((p, i) => {
      const v = p[valueKey];
      const hgt = Math.max(v === 0 ? 0 : 2, Math.abs(y(v) - zero));
      return h('rect', { x: i * step + (step - bw) / 2, y: v >= 0 ? zero - hgt : zero, width: bw, height: hgt, class: cx('bar', v < 0 ? 'neg' : 'pos', p.future && 'future', highlight === p.key && 'hl') },
        h('title', null, `${p.label}: ${fmt(v)}`));
    }));
  // Натискане върху колона показва сумата ѝ (на телефон няма „задържане с мишката“)
  const tip = h('div', { class: 'chart-tip', 'aria-live': 'polite' }, h('span', { class: 'muted' }, 'Натисни колона, за да видиш сумата' + (min < 0 ? ` · най-ниско ${fmt(min)}` : '')));
  const hit = h('div', { class: 'bars-hit', style: { gridTemplateColumns: `repeat(${n}, 1fr)` } }, points.map((p, i) => h('button', { type: 'button', 'aria-label': `${p.label}: ${fmt(p[valueKey])}`, onclick: (e) => {
    svg.querySelectorAll('rect.bar').forEach((r, j) => r.classList.toggle('sel', j === i));
    hit.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget));
    tip.replaceChildren(h('b', null, p.tip || p.label), h('span', { class: p[valueKey] < 0 ? 'neg' : '' }, fmt(p[valueKey])));
  } })));
  return h('div', { class: 'chart' },
    h('div', { class: 'chart-scale' }, h('span', null, `най-много ${fmt(max)}`)),
    h('div', { class: 'bars-wrap' }, svg, hit),
    tip,
    h('div', { class: 'bars-labels', style: { gridTemplateColumns: `repeat(${n}, 1fr)` } },
      points.map((p, i) => h('span', null, i % labelEvery === 0 ? p.label : ''))));
}

// ---------- Хоризонтални ленти с дял ----------
export function shareRows(items, total, { cls } = {}) {
  const sorted = items.filter((x) => x.value > 0.004).sort((a, b) => b.value - a.value);
  if (!sorted.length) return h('p', { class: 'muted small' }, 'Няма данни за периода');
  return h('div', { class: 'share-rows' }, sorted.map((x) =>
    h('div', { class: 'share-row', style: x.color ? { '--rc': x.color } : null },
      h('div', { class: 'share-top' },
        h('span', { class: 'share-name' }, x.icon && icon(x.icon, 16), x.label),
        h('span', { class: 'share-val' }, money(x.value), h('span', { class: 'muted' }, ` ${total ? Math.round((x.value / total) * 100) : 0}%`))),
      h('div', { class: 'share-track' }, h('div', { class: cx('share-fill', cls), style: { width: `${total ? (x.value / total) * 100 : 0}%` } })))));
}

// ---------- Малки помощници ----------
export const stat = (label, value, opts = {}) => h('div', { class: cx('stat', opts.cls), style: opts.color ? { '--sc': opts.color } : null },
  h('span', { class: 'stat-label' }, opts.icon && icon(opts.icon, 15), label),
  h('span', { class: cx('stat-value', opts.tone) }, value),
  opts.sub && h('span', { class: 'stat-sub' }, opts.sub));
export const tone = (v) => (v > 0.004 ? 'pos' : v < -0.004 ? 'neg' : '');
export const empty = (ic, title, text, action) => h('div', { class: 'empty' },
  h('div', { class: 'empty-ic' }, icon(ic, 28)), h('h3', null, title), text && h('p', { class: 'muted' }, text), action);
export const field = (label, input, hint, req) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, label, req && h('span', { class: 'req' }, ' *')), input, hint && h('span', { class: 'field-hint' }, hint));
// Заглавие на карта с цветна икона
export const cardTitle = (ic, title, right) => h('div', { class: 'card-title' }, h('h3', null, h('span', { class: 't-ic' }, icon(ic, 17)), title), right);
// Цветна шапка на страница
// Горната част на подстраница: заглавието (.hero-top) е лента над картата, бутоните за избор (.hero-ctl)
// са под нея, а в тъмната карта остават само числата. Ако няма числа – няма и карта.
export const hero = (...kids) => {
  const flat = kids.flat(Infinity).filter((k) => k != null && k !== false && k !== '');
  const top = flat.find((k) => k.classList?.contains('hero-top'));
  const ctl = flat.filter((k) => k.classList?.contains('hero-ctl'));
  const rest = flat.filter((k) => k !== top && !ctl.includes(k));
  return h('div', { class: 'hero-wrap' }, top && h('div', { class: 'hero-head' }, top), ...ctl, rest.length ? h('section', { class: 'hero' }, ...rest) : null);
};
export const numCompact = (n) => fmtNum(n);

// ---------- Числата се смаляват сами, за да се съберат ----------
// Вместо да се режат с „…“, големите числа намаляват шрифта си до 55%.
const FIT = '.kpi-value, .stat-value, .hero-num, .meter-value, .big-net, .tile-val, .meter-cell b, .donut-center b, .np-val, .save-bar .sum b, .cost-amt b, .shift-amt b, .rec-title b, .win b, .card-title .num, .kpi-big, .mini-kpi b';
export function autoFit(root = document) {
  root.querySelectorAll(FIT).forEach((el) => {
    el.style.fontSize = '';
    if (!el.clientWidth || el.scrollWidth <= el.clientWidth + 1) return;
    const base = parseFloat(getComputedStyle(el).fontSize);
    let size = base * (el.clientWidth / el.scrollWidth) * 0.98;
    size = Math.max(size, base * 0.55);
    el.style.fontSize = size + 'px';
  });
}
let fitQueued = false;
const queueFit = () => { if (fitQueued) return; fitQueued = true; requestAnimationFrame(() => { fitQueued = false; autoFit(); }); };
new MutationObserver(queueFit).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('resize', queueFit);
document.fonts?.ready?.then(queueFit);

// Разгъваем блок „Покажи подробности“ – допълнителните числа стоят скрити, докато не се отворят
// label може да е [затворено, отворено] – тогава надписът се сменя при отваряне
export function more(label, ...children) {
  const [closed, open] = Array.isArray(label) ? label : [label, null];
  return h('details', { class: 'more' },
    h('summary', null, h('span', { class: open ? 'more-closed' : null }, closed), open && h('span', { class: 'more-open' }, open), icon('down', 18)),
    h('div', { class: 'more-body' }, ...children));
}

// Конфети за награда (черно, зелено, сиво). Само ако човекът не е избрал „намалено движение“.
export function celebrate(n = 40) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div'); box.className = 'confetti'; box.setAttribute('aria-hidden', 'true');
  const colors = ['#231F20', '#2F6B39', '#BFF0BE', '#CEC6C7', '#FFFFFF'];
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = colors[i % colors.length];
    p.style.setProperty('--x', `${(Math.random() - .5) * 160}px`);
    p.style.setProperty('--r', `${(Math.random() - .5) * 1440}deg`);
    p.style.setProperty('--d', `${Math.random() * .35}s`);
    p.style.setProperty('--t', `${1.3 + Math.random() * .9}s`);
    if (i % 3 === 0) { p.style.width = '7px'; p.style.height = '7px'; p.style.borderRadius = '50%'; }
    box.append(p);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 2600);
}
