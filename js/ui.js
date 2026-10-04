// ProfiTaxi – общи UI компоненти: листове, цифрова клавиатура, тостове, графики

import { h, icon, cx, money, fmtNum, clear } from './util.js';

// ---------- Тема ----------
export function applyTheme(pref) {
  const p = pref || localStorage.getItem('profitaxi.theme') || 'auto';
  const root = document.documentElement;
  if (p === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', p);
  const dark = p === 'dark' || (p === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#161B22' : '#EEF1F5');
}
export function setTheme(p) { localStorage.setItem('profitaxi.theme', p); applyTheme(p); }
export const getTheme = () => localStorage.getItem('profitaxi.theme') || 'auto';
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme());

// ---------- Тост ----------
let toastTimer;
export function toast(msg, kind = 'ok') {
  let el = document.getElementById('toast');
  if (!el) { el = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(el); }
  clear(el).appendChild(h('div', { class: cx('toast', kind) }, icon(kind === 'err' ? 'alert' : 'check', 18), h('span', null, msg)));
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
      d.valEl.textContent = vals[i] || '0';
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
    const values = () => Object.fromEntries(fields.map((f, i) => [f.key, parseFloat((vals[i] || '0').replace(',', '.')) || 0]));
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
      h('button', { class: cx('btn btn-lg grow', danger ? 'btn-danger' : 'btn-primary'), onclick: () => { close(); onOk(); } }, okLabel))));
}

// ---------- Сегментиран избор ----------
export function segmented(options, value, onChange, { small, wrap, page } = {}) {
  return h('div', { class: cx('seg', small && 'seg-sm', wrap && 'seg-wrap', page && 'on-page'), role: 'tablist' },
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
  return h('div', { class: 'chart' },
    h('div', { class: 'chart-scale' }, h('span', null, fmt(max)), min < 0 && h('span', null, fmt(min))),
    svg,
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
export const hero = (...kids) => h('section', { class: 'hero' }, ...kids);
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
