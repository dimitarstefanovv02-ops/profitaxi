// Общи блокове за настройка на колата, горивото, ефира и целта.
// Работят върху чернова (draft) и викат onChange след всяка промяна.

import { h, icon, cx, money } from '../util.js';
import { CAR_TYPES, FUELS, DISPATCH_MODES, PERIODS } from '../constants.js';
import { openNumpad, segmented } from '../ui.js';

const amountTile = (label, value, onTap, sub) => h('button', { class: 'tile', type: 'button', onclick: onTap },
  h('span', { class: 'tile-top' }, label),
  h('span', { class: cx('tile-val', !value && 'zero') }, money(value)),
  sub && h('span', { class: 'stat-sub' }, sub));

export function carBlock(d, onChange) {
  const set = (patch) => { Object.assign(d, patch); onChange(); };
  return h('div', { class: 'stack' },
    h('div', { class: 'option-grid' }, Object.entries(CAR_TYPES).map(([k, v]) =>
      h('button', { type: 'button', class: cx('option', d.carType === k && 'on'), onclick: () => set({ carType: k }) },
        icon(k === 'rent' ? 'key' : 'car', 24), v.label, h('small', null, v.hint)))),
    d.carType === 'rent' && h('div', { class: 'stack' },
      segmented({ day: 'На ден', week: 'На седмица', month: 'На месец' }, d.rent.period, (p) => set({ rent: { ...d.rent, period: p } }), { small: true }),
      amountTile(`Наем ${PERIODS[d.rent.period].label}`, d.rent.amount, () => openNumpad({
        title: 'Наем на колата', sub: PERIODS[d.rent.period].label, fields: [{ key: 'v', label: 'Сума', value: d.rent.amount }],
        actions: [{ label: 'Готово', primary: true, run: ({ v }) => set({ rent: { ...d.rent, amount: v } }) }],
      }))));
}

export function fuelBlock(d, onChange) {
  return h('div', { class: 'option-grid' }, Object.entries(FUELS).map(([k, v]) =>
    h('button', { type: 'button', class: cx('option', d.fuel === k && 'on'), onclick: () => { d.fuel = k; onChange(); } },
      icon(k === 'electric' ? 'bolt' : 'fuel', 22), v.label)));
}

export function dispatchBlock(d, onChange) {
  const set = (patch) => { d.dispatch = { ...d.dispatch, ...patch }; onChange(); };
  const label = { daily: 'на ден', weekly: 'на седмица', monthly: 'на месец' }[d.dispatch.mode];
  return h('div', { class: 'stack' },
    segmented(DISPATCH_MODES, d.dispatch.mode, (m) => set({ mode: m }), { small: true }),
    d.dispatch.mode !== 'none' && amountTile(`Такса ${label}`, d.dispatch.amount, () => openNumpad({
      title: 'Такса за ефир', sub: label, fields: [{ key: 'v', label: 'Сума', value: d.dispatch.amount }],
      actions: [{ label: 'Готово', primary: true, run: ({ v }) => set({ amount: v }) }],
    }), d.dispatch.mode === 'daily' ? 'Начислява се само в дните, в които работиш' : 'Разпределя се по дни автоматично'),
    d.dispatch.mode === 'none' && h('p', { class: 'muted small' }, 'Ако плащаш ефир или диспечер, избери как плащаш. Таксата се смята сама.'));
}

export function shareBlock(d, onChange) {
  const on = d.sharePct < 100;
  return h('div', null,
    h('div', { class: 'setting' },
      h('div', { class: 'grow' },
        h('div', { class: 'setting-title' }, 'Деля колата с друг шофьор'),
        h('div', { class: 'setting-sub' }, 'Разходите за колата се делят в процент')),
      h('button', { type: 'button', class: cx('toggle', on && 'on'), role: 'switch', 'aria-checked': String(on), 'aria-label': 'Деля колата',
        onclick: () => { d.sharePct = on ? 100 : 50; onChange(); } })),
    on && h('div', { style: { paddingTop: '10px' } },
      h('div', { class: 'field-label', style: { marginBottom: '8px' } }, `Моят дял: ${d.sharePct}%`),
      segmented({ 30: '30%', 40: '40%', 50: '50%', 60: '60%', 70: '70%' }, String(d.sharePct), (v) => { d.sharePct = Number(v); onChange(); }, { small: true })));
}

export function goalBlock(d, onChange) {
  return amountTile('Цел за месеца (чиста печалба)', d.monthlyGoal, () => openNumpad({
    title: 'Месечна цел', sub: 'Колко искаш да изкараш чисто', fields: [{ key: 'v', label: 'Цел', value: d.monthlyGoal, decimals: 0 }],
    actions: [{ label: 'Готово', primary: true, run: ({ v }) => { d.monthlyGoal = v; onChange(); } }],
  }));
}
