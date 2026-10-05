// Отчет за смяна: приходи, разходи, километри, време. Всичко с големи плочки
// и вградена цифрова клавиатура.

import { h, fill, icon, cx, money, uid, toLocalInput, fromLocalInput, fmtDateLong, isoToDateStr, round2, fmtDuration } from '../util.js';
import * as store from '../store.js';
import { INCOME_TYPES, EXPENSE_CATS, FUELS, FUEL_TYPES, expenseCat, shiftCats } from '../constants.js';
import { openCategories } from './categories.js';
import { showShiftResult } from './shiftResult.js';
import { shiftIncome, shiftExpenses, shiftKm, shiftHours, fixedForDay, shiftDate } from '../calc.js';
import { openNumpad, openSheet, sheetHead, confirmSheet, toast, cardTitle } from '../ui.js';

let draft = null;      // чернова на отворената смяна
let draftKey = null;

export function shiftEditorView(ctx) {
  const { go, route, data } = ctx;
  const id = route.param;
  const key = route.raw;
  if (draftKey !== key || !draft) {
    draftKey = key;
    if (id === 'new') {
      const now = new Date(); now.setMinutes(0, 0, 0);
      const start = new Date(now.getTime() - 10 * 3600000);
      draft = { id: null, start: start.toISOString(), end: now.toISOString(), kmStart: store.lastKm() || 0, kmEnd: 0, income: { cash: 0, card: 0, app: 0, tips: 0 }, expenses: [], note: '' };
    } else {
      const s = store.getShift(id);
      if (!s) { setTimeout(() => go('/shifts', true)); return h('div'); }
      draft = s;
      if (route.query.get('end') === '1' && !draft.end) draft.end = new Date().toISOString();
    }
  }
  const root = h('div', { class: 'screen no-nav', 'data-page': 'shift', style: { paddingBottom: '120px' } });
  const profile = data.profile;
  const fuelTypes = FUELS[profile.fuel]?.types || ['petrol'];
  const isNew = !draft.id;
  const wasActive = !isNew && !store.getShift(draft.id)?.end;

  function draw() {
    const inc = shiftIncome(draft), exp = shiftExpenses(draft);
    const day = isoToDateStr(draft.start);
    const sameDay = data.shifts.filter((s) => s.end && s.id !== draft.id && shiftDate(s) === day).length + 1;
    const fixedShare = fixedForDay(data.costs, profile, day, true) / sameDay;
    const net = inc - exp - fixedShare;

    fill(root, 
      h('div', { class: 'top' },
        h('button', { class: 'back', onclick: () => leave() }, icon('left', 20), 'Назад'),
        !isNew && h('button', { class: 'icon-btn', 'aria-label': 'Изтрий смяната', onclick: del }, icon('trash', 20))),
      h('h1', null, isNew ? 'Нова смяна' : wasActive ? (draft.end ? 'Приключваш смяната' : 'Текуща смяна') : 'Смяна'),
      h('p', { class: 'muted', style: { margin: '4px 0 16px' } }, fmtDateLong(day)),

      // Приходи
      h('section', { class: 'card' },
        cardTitle('coins', 'Приходи', h('b', { class: 'num pos' }, money(inc))),
        h('div', { class: 'tiles' }, Object.entries(INCOME_TYPES).map(([k, t]) =>
          h('button', { class: 'tile', style: { '--tc': t.color }, onclick: () => editIncome(k) },
            h('span', { class: 'tile-top' }, h('span', { class: 'ic-chip' }, icon(t.icon, 16)), t.label),
            h('span', { class: cx('tile-val', !draft.income[k] && 'zero') }, money(draft.income[k], draft.income[k] % 1 ? 2 : 0)))))),

      // Разходи
      h('section', { class: 'card' },
        cardTitle('fuel', 'Разходи', h('b', { class: 'num' }, money(exp, exp % 1 ? 2 : 0))),
        h('div', { class: 'quick' }, shiftCats(profile).map((c) =>
          h('button', { style: { '--qc': c.color }, onclick: () => (c.key === 'fuel' ? editFuel() : editExpense({ category: c.key })) }, h('span', { class: 'q-ic' }, icon(c.icon, 21)), c.label)),
          h('button', { class: 'quick-edit', onclick: () => openCategories() }, h('span', { class: 'q-ic' }, icon('tag', 21)), 'Категории')),
        draft.expenses.length > 0 && h('div', { class: 'exp-list' }, draft.expenses.map((e) =>
          h('div', { class: 'exp-item', style: { '--qc': expenseCat(e.category).color } },
            h('span', { class: 'e-ic' }, icon(expenseCat(e.category).icon, 17)),
            h('button', { class: 'grow', style: { textAlign: 'left' }, onclick: () => (e.category === 'fuel' ? editFuel(e) : editExpense(e)) },
              h('div', { class: 'name' }, expName(e)),
              e.category === 'fuel' && e.qty > 0 && h('div', { class: 'det' }, `${String(e.qty).replace('.', ',')} ${FUEL_TYPES[e.fuelType]?.unit || 'л'}, ${money(e.amount / e.qty, 2)}/${FUEL_TYPES[e.fuelType]?.unit || 'л'}`)),
            h('span', { class: 'amt' }, money(e.amount, e.amount % 1 ? 2 : 0)),
            h('button', { class: 'icon-btn', 'aria-label': 'Премахни', onclick: () => { draft.expenses = draft.expenses.filter((x) => x !== e); draw(); } }, icon('x', 18))))),
        h('button', { class: 'btn btn-outline btn-block', style: { marginTop: '12px' }, onclick: copyLast }, icon('copy', 18), 'Разходите от предишната смяна'),
        fixedShare > 0 && h('p', { class: 'auto-note' }, icon('wallet', 15), `Постоянни разходи за деня: ${money(fixedShare, 2)} (смятат се сами)`)),

      // Километри
      h('section', { class: 'card' },
        cardTitle('gauge', 'Километри', h('b', { class: 'num' }, `${shiftKm(draft)} км`)),
        h('div', { class: 'km-row' },
          kmTile('Начало', draft.kmStart, () => editKm('kmStart')),
          kmTile('Край', draft.kmEnd, () => editKm('kmEnd'))),
        draft.kmEnd > 0 && draft.kmEnd < draft.kmStart && h('p', { class: 'err', style: { marginTop: '8px' } }, 'Крайният километраж е по-малък от началния')),

      // Време
      h('section', { class: 'card' },
        cardTitle('clock', 'Време', h('b', { class: 'num' }, fmtDuration(shiftHours(draft)))),
        h('div', { class: 'time-row' },
          h('label', { class: 'time-in' }, h('span', null, 'Начало'),
            h('input', { type: 'datetime-local', value: toLocalInput(draft.start), onchange: (e) => { if (e.target.value) { draft.start = fromLocalInput(e.target.value); draw(); } } })),
          h('label', { class: 'time-in' }, h('span', null, 'Край'),
            draft.end
              ? h('input', { type: 'datetime-local', value: toLocalInput(draft.end), onchange: (e) => { if (e.target.value) { draft.end = fromLocalInput(e.target.value); draw(); } } })
              : h('button', { style: { textAlign: 'left', fontWeight: 600, padding: '2px 0' }, onclick: () => { draft.end = new Date().toISOString(); draw(); } }, 'Карам още. Приключи сега'))),
        draft.end && new Date(draft.end) <= new Date(draft.start) && h('p', { class: 'err', style: { marginTop: '8px' } }, 'Краят трябва да е след началото')),

      // Бележка
      h('section', { class: 'card' },
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Бележка'),
          h('input', { class: 'input', placeholder: 'По желание', value: draft.note || '', oninput: (e) => { draft.note = e.target.value; } }))),

      // Лента за запис
      h('div', { class: 'save-bar' },
        h('div', { class: 'sum' }, h('span', null, 'Чисто за смяната'), h('b', { class: net >= 0 ? 'pos' : 'neg' }, money(net))),
        h('button', { class: 'btn btn-primary btn-lg', onclick: save }, icon('check', 20), !draft.end ? 'Запази' : wasActive ? 'Приключи' : 'Запази')));
  }

  const kmTile = (label, v, onTap) => h('button', { class: 'tile', style: { '--tc': 'var(--c-teal)' }, onclick: onTap },
    h('span', { class: 'tile-top' }, h('span', { class: 'ic-chip' }, icon('gauge', 16)), label),
    h('span', { class: cx('tile-val', !v && 'zero') }, v ? v.toLocaleString('bg-BG') : '—'));

  function editIncome(k) {
    const cur = draft.income[k];
    const actions = cur > 0
      ? [{ label: `+ Добави`, run: ({ v }) => { draft.income[k] = round2(cur + v); draw(); } }, { label: 'Замени', primary: true, run: ({ v }) => { draft.income[k] = v; draw(); } }]
      : [{ label: 'Запиши', primary: true, run: ({ v }) => { draft.income[k] = v; draw(); } }];
    openNumpad({ title: INCOME_TYPES[k].label, sub: cur > 0 ? `Сега: ${money(cur, 2)}` : 'Сума за смяната', fields: [{ key: 'v', label: 'Сума', value: '' }], actions });
  }
  function editKm(field) {
    openNumpad({ title: field === 'kmStart' ? 'Начален километраж' : 'Краен километраж', fields: [{ key: 'v', label: 'Километраж', value: draft[field] || '', unit: 'км', decimals: 0 }],
      actions: [{ label: 'Запиши', primary: true, run: ({ v }) => { draft[field] = Math.round(v); draw(); } }] });
  }
  function editExpense(e) {
    const isNewE = !e.id;
    let label = e.label || '';
    openNumpad({
      title: expenseCat(e.category).label,
      top: ['other', 'service', 'repair', 'tires', 'fine'].includes(e.category) ? () => h('input', { class: 'input', style: { marginBottom: '12px' }, placeholder: 'Описание (по желание)', value: label, oninput: (ev) => { label = ev.target.value; } }) : null,
      fields: [{ key: 'v', label: 'Сума', value: e.amount || '' }],
      actions: [{ label: isNewE ? 'Добави' : 'Запиши', primary: true, run: ({ v }) => {
        if (!v) return;
        if (isNewE) draft.expenses.push({ id: uid(), category: e.category, amount: v, label });
        else Object.assign(draft.expenses.find((x) => x.id === e.id), { amount: v, label });
        draw();
      } }],
    });
  }
  function editFuel(e = {}) {
    let type = e.fuelType || fuelTypes[0];
    const isNewE = !e.id;
    const unit = () => FUEL_TYPES[type].unit;
    let chipsEl;
    const chips = () => {
      chipsEl = h('div', { class: 'chips' }, fuelTypes.length > 1 && fuelTypes.map((t) =>
        h('button', { class: cx('chip-btn', t === type && 'on'), onclick: () => { type = t; chipsEl.replaceWith(chips()); document.querySelectorAll('.np-unit')[1] && (document.querySelectorAll('.np-unit')[1].textContent = unit()); } }, FUEL_TYPES[t].label)));
      return chipsEl;
    };
    openNumpad({
      title: 'Гориво', sub: 'Количеството е по желание, но дава разход на 100 км',
      top: chips,
      fields: [{ key: 'amount', label: 'Сума', value: e.amount || '' }, { key: 'qty', label: 'Количество', value: e.qty || '', unit: unit() }],
      actions: [{ label: isNewE ? 'Добави' : 'Запиши', primary: true, run: ({ amount, qty }) => {
        if (!amount) return;
        if (isNewE) draft.expenses.push({ id: uid(), category: 'fuel', fuelType: type, amount, qty });
        else Object.assign(draft.expenses.find((x) => x.id === e.id), { fuelType: type, amount, qty });
        draw();
      } }],
    });
  }
  function copyLast() {
    const prev = data.shifts.find((s) => s.end && s.id !== draft.id && s.expenses.length);
    if (!prev) { toast('Няма предишна смяна с разходи', 'err'); return; }
    const copied = prev.expenses.map((e) => ({ ...e, id: uid() }));
    draft.expenses = [...draft.expenses, ...copied];
    draw();
    toast(`Добавени ${copied.length} разхода. Смени сумите, ако трябва.`);
  }
  function save() {
    if (draft.end && new Date(draft.end) <= new Date(draft.start)) { toast('Краят трябва да е след началото', 'err'); return; }
    if (draft.kmEnd > 0 && draft.kmEnd < draft.kmStart) { toast('Провери километража', 'err'); return; }
    if (draft.end && new Date(draft.end) - new Date() > 10 * 60000) { toast('Краят на смяната е в бъдещето. Провери датата.', 'err'); return; }
    if (draft.end && (new Date(draft.end) - new Date(draft.start)) / 3600000 > 24) { toast('Смяната е над 24 часа. Провери началото и края.', 'err'); return; }
    const saved = store.saveShift(draft);
    const ended = wasActive && saved.end;
    draft = null; draftKey = null;
    go(ended || isNew || wasActive ? '/home' : '/shifts', true);
    // приключена смяна → карта с резултата; иначе кратко съобщение
    if (saved.end && (ended || isNew)) setTimeout(() => showShiftResult(store.myData(), saved.id), 250);
    else toast('Запазено');
  }
  function del() {
    confirmSheet({ title: 'Изтриване на смяната?', text: 'Приходите и разходите от тази смяна ще бъдат изтрити.', okLabel: 'Изтрий', danger: true,
      onOk: () => { store.deleteShift(draft.id); draft = null; draftKey = null; toast('Смяната е изтрита'); go('/shifts', true); } });
  }
  function leave() { draft = null; draftKey = null; history.length > 1 ? history.back() : go('/home'); }

  draw();
  return root;
}

function expName(e) {
  if (e.category === 'fuel') return FUEL_TYPES[e.fuelType]?.label || 'Гориво';
  return e.label || expenseCat(e.category).label;
}
export { openSheet, sheetHead };
