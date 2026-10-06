// Подреждане на админ панела по твой вкус.
// Всяка „зона“ (data-zone) е група от карти, числа или бутони с ключове (data-k).
// В режим „Подреди“: влачиш с мишката или задържаш с пръст и влачиш; натискане избира
// елемента и долната лента дава ↑ ↓ и „Скрий“. Редът и скритите се пазят на устройството.

import { h, icon } from './util.js';

const KEY = 'profitaxi.layout';
let L = {};
try { L = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { L = {}; }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(L)); } catch { /* */ } };

export const arranging = () => document.body.classList.contains('arranging');

// zone('overview', { class: 'stack' }, [['map', node], ['nums', node, { hide: true }], ...]) – празните (null) се пропускат.
// { hide: true } = скрито по подразбиране (докато не го покажеш от „Подреди“)
const DEF_HID = {};
const hidOf = (key) => new Set(L[key]?.h ?? DEF_HID[key] ?? []);
export function zone(key, attrs, items, tag = 'div') {
  const list = items.filter((x) => x && x[1]);
  DEF_HID[key] = list.filter((x) => x[2]?.hide).map((x) => x[0]);
  const st = L[key] || {};
  const order = st.o || [];
  const pos = (k, i) => { const j = order.indexOf(k); return j >= 0 ? j : order.length + i; };
  const sorted = list.map((x, i) => ({ k: x[0], el: x[1], p: pos(x[0], i) })).sort((a, b) => a.p - b.p);
  const hidden = hidOf(key);
  sorted.forEach(({ k, el }) => { el.dataset.k = k; el.classList.toggle('arr-hid', hidden.has(k)); });
  const el = h(tag, { ...attrs, 'data-zone': key }, sorted.map((x) => x.el));
  return el;
}

function storeZone(z) {
  const key = z.dataset.zone;
  const keys = [...z.children].filter((c) => c.dataset.k).map((c) => c.dataset.k);
  // ключовете, които сега не се виждат (напр. условни карти), пазим в края
  const old = (L[key]?.o || []).filter((k) => !keys.includes(k));
  L[key] = { ...(L[key] || {}), o: [...keys, ...old] };
  save();
}
function toggleHidden(item) {
  const z = item.parentElement; const key = z.dataset.zone, k = item.dataset.k;
  const set = hidOf(key);
  if (set.has(k)) set.delete(k); else set.add(k);
  L[key] = { ...(L[key] || {}), h: [...set] }; save();
  item.classList.toggle('arr-hid', set.has(k));
}
export function resetZones(keys) { keys.forEach((k) => delete L[k]); save(); }
export function resetAll() { L = {}; save(); }
export const hasLayout = () => Object.keys(L).length > 0;
export const zonesOnPage = () => [...document.querySelectorAll('[data-zone]')].map((z) => z.dataset.zone);

// ---------- режимът и лентата ----------
let opts = { onDone: () => {}, onReset: () => {} };
let selected = null;
export function setArranging(on) {
  document.body.classList.toggle('arranging', on);
  select(null);
  drawBar();
}
function select(item) {
  if (selected) selected.classList.remove('arr-sel');
  selected = item;
  if (item) item.classList.add('arr-sel');
  drawBar();
}
function move(dir) {
  if (!selected) return;
  const z = selected.parentElement;
  const sib = dir < 0 ? selected.previousElementSibling : selected.nextElementSibling;
  if (!sib) return;
  if (dir < 0) z.insertBefore(selected, sib); else z.insertBefore(sib, selected);
  storeZone(z);
  selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function drawBar() {
  let bar = document.querySelector('.arr-bar');
  if (!arranging()) { bar?.remove(); return; }
  if (!bar) { bar = h('div', { class: 'arr-bar', role: 'toolbar', 'aria-label': 'Подреждане' }); document.body.append(bar); }
  const sel = selected;
  const hid = sel?.classList.contains('arr-hid');
  bar.replaceChildren(
    h('div', { class: 'arr-tip' }, icon('grid', 18), h('span', null, sel ? 'Избрано. Мести го или го скрий.' : 'Влачи картите, числата и бутоните. С пръст: задръж и влачи. Или натисни и ползвай стрелките.')),
    h('div', { class: 'arr-btns' },
      h('button', { class: 'btn btn-ghost btn-sm', disabled: !sel, 'aria-label': 'Нагоре', onclick: () => move(-1) }, icon('up', 18)),
      h('button', { class: 'btn btn-ghost btn-sm', disabled: !sel, 'aria-label': 'Надолу', onclick: () => move(1) }, icon('down', 18)),
      h('button', { class: 'btn btn-ghost btn-sm', disabled: !sel, onclick: () => { toggleHidden(sel); drawBar(); } }, icon(hid ? 'eye' : 'eyeoff', 18), hid ? 'Покажи' : 'Скрий'),
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => opts.onReset() }, 'Както беше'),
      h('button', { class: 'btn btn-page btn-sm', onclick: () => { setArranging(false); opts.onDone(); } }, icon('check', 18), 'Готово')));
}

// ---------- влачене ----------
let drag = null;
const itemOf = (t) => { const it = t.closest?.('[data-k]'); return it && it.parentElement?.dataset.zone ? it : null; };
function begin() {
  drag.started = true;
  drag.item.classList.add('arr-drag');
  select(drag.item);
  try { navigator.vibrate?.(12); } catch { /* */ }
}
function over(x, y) {
  const { item } = drag; const z = item.parentElement;
  item.style.pointerEvents = 'none';
  const under = document.elementFromPoint(x, y);
  item.style.pointerEvents = '';
  let t = under?.closest('[data-k]');
  while (t && t.parentElement !== z) t = t.parentElement?.closest('[data-k]');
  if (!t || t === item) return;
  const r = t.getBoundingClientRect();
  const wide = r.width > z.getBoundingClientRect().width * 0.8;
  const after = wide ? y > r.top + r.height / 2 : x > r.left + r.width / 2;
  z.insertBefore(item, after ? t.nextSibling : t);
}
function end() {
  if (!drag) return;
  clearTimeout(drag.timer);
  if (drag.started) { drag.item.classList.remove('arr-drag'); storeZone(drag.item.parentElement); drag.justDragged = true; }
  const d = drag; drag = null;
  return d;
}

export function initArrange(o) {
  opts = { ...opts, ...o };
  document.addEventListener('pointerdown', (e) => {
    if (!arranging() || e.button > 0 || e.target.closest('.arr-bar')) return;
    const item = itemOf(e.target); if (!item) return;
    if (e.pointerType === 'mouse') e.preventDefault();
    drag = { item, x: e.clientX, y: e.clientY, type: e.pointerType, started: false, moved: false };
    if (e.pointerType !== 'mouse') drag.timer = setTimeout(() => { if (drag && !drag.moved) begin(); }, 280);
  }, true);
  document.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dist = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
    if (!drag.started) {
      if (drag.type === 'mouse' && dist > 5) begin();
      else if (drag.type !== 'mouse' && dist > 10) { drag.moved = true; clearTimeout(drag.timer); drag = null; return; }
      else return;
    }
    over(e.clientX, e.clientY);
  }, true);
  // задържане с пръст: щом влаченето е започнало, страницата не се превърта
  document.addEventListener('touchmove', (e) => { if (drag?.started) e.preventDefault(); }, { passive: false });
  document.addEventListener('pointerup', (e) => {
    const d = end(); if (!d) return;
    if (!d.started && !d.moved) {
      const tapThrough = d.item.parentElement?.hasAttribute('data-tap');
      if (!tapThrough) select(selected === d.item ? null : d.item);
    }
  }, true);
  document.addEventListener('pointercancel', () => end(), true);
  // в режим „Подреди“ натисканията не отварят нищо (освен менюто и табовете)
  document.addEventListener('click', (e) => {
    if (!arranging() || e.target.closest('.arr-bar, .arr-toggle, .nav, .sub-back')) return;
    const item = itemOf(e.target);
    if (item && item.parentElement.hasAttribute('data-tap') && !document.querySelector('.arr-drag')) return;
    e.preventDefault(); e.stopPropagation();
  }, true);
  document.addEventListener('keydown', (e) => { if (arranging() && e.key === 'Escape') { setArranging(false); opts.onDone(); } });
}

// Ключовете в реда, който си избрал, без скритите (напр. кой таб е първи)
export function ordered(key, keys) {
  const st = L[key] || {}; const o = st.o || []; const hid = hidOf(key);
  return keys.filter((k) => !hid.has(k)).map((k, i) => ({ k, p: o.indexOf(k) >= 0 ? o.indexOf(k) : o.length + i })).sort((a, b) => a.p - b.p).map((x) => x.k);
}
// след всяко пречертаване: избраният елемент вече не е на страницата
export function onRender() { if (selected && !selected.isConnected) select(null); else drawBar(); }
