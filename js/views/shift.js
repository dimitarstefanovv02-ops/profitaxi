// Отчет за смяна: три полета едно под друго – Данни, Приходи, Разходи.
// Всеки ред се попълва с „+ Въведи“ през цифровата клавиатура.

import { h, fill, icon, cx, money, uid, toLocalInput, fromLocalInput, fmtDateLong, isoToDateStr, round2, fmtDuration } from '../util.js';
import * as store from '../store.js';
import { INCOME_TYPES, EXPENSE_CATS, FUELS, FUEL_TYPES, expenseCat, shiftCats } from '../constants.js';
import { openCategories } from './categories.js';
import { showShiftResult } from './shiftResult.js';
import { shiftIncome, shiftExpenses, shiftKm, shiftHours, fixedForDay, shiftDate } from '../calc.js';
import { openNumpad, openSheet, sheetHead, confirmSheet, toast, cardTitle } from '../ui.js';
import { scanReceipt } from '../quick.js';

let draft = null;      // чернова на отворената смяна

let draftKey = null;

export function shiftEditorView(ctx) {
  const { go, route, data } = ctx;
  const id = route.param;
  const key = route.raw;
  if (draftKey !== key || !draft) {
    draftKey = key;
    if (id === 'new') {
      // Часовете по подразбиране са като на последната смяна (час на тръгване и продължителност)
      const prev = ctx.data.shifts.find((x) => x.end);
      const durMs = prev ? Math.min(16, Math.max(2, (new Date(prev.end) - new Date(prev.start)) / 3600000)) * 3600000 : 10 * 3600000;
      const day = route.query?.get('day');
      let start, now;
      if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
        const ps = prev ? new Date(prev.start) : null;
        start = new Date(`${day}T${ps ? String(ps.getHours()).padStart(2, '0') + ':' + String(ps.getMinutes()).padStart(2, '0') : '08:00'}:00`);
        now = new Date(start.getTime() + durMs);
      } else {
        now = new Date(); now.setMinutes(0, 0, 0);
        start = new Date(now.getTime() - durMs);
      }
      draft = { id: null, start: start.toISOString(), end: now.toISOString(), kmStart: store.lastKm() || 0, kmEnd: 0, income: { cash: 0, card: 0, app: 0, tips: 0 }, expenses: [], note: '' };
    } else {
      const s = store.getShift(id);
      if (!s) { setTimeout(() => go('/shifts', true)); return h('div'); }
      draft = s;
      if (route.query.get('end') === '1' && !draft.end) draft.end = new Date().toISOString();
    }
  }
  const root = h('div', { class: 'screen no-nav', 'data-page': 'shift', style: { paddingBottom: '120px' } });
  // Подсказки от предишните смени: последната сума по вид разход и последната цена на литър
  const done = data.shifts.filter((x) => x.end && x.id !== draft?.id);
  const lastAmount = (cat) => { for (const x of done) { const e = x.expenses.find((y) => y.category === cat && y.amount > 0); if (e) return e.amount; } return 0; };
  const lastPrice = (() => { for (const x of done) { const e = x.expenses.find((y) => y.category === 'fuel' && y.qty > 0 && y.amount > 0); if (e) return e.amount / e.qty; } return 0; })();
  const profile = data.profile;
  const fuelTypes = FUELS[profile.fuel]?.types || ['petrol'];
  const isNew = !draft.id;
  const wasActive = !isNew && !store.getShift(draft.id)?.end;

  function draw() {
    const inc = shiftIncome(draft), exp = shiftExpenses(draft);
    const day = isoToDateStr(draft.start);
    const sameDay = data.shifts.filter((s) => s.end && s.id !== draft.id && shiftDate(s) === day).length + 1;
    const fixedShare = fixedForDay(data.costs, profile, day, true, false) / sameDay;
    const net = inc - exp - fixedShare;
    const cats = shiftCats(profile);
    const kmBad = draft.kmEnd > 0 && draft.kmEnd < draft.kmStart;
    const timeBad = !!draft.end && new Date(draft.end) <= new Date(draft.start);
    const fuelExp = draft.expenses.filter((e) => e.category === 'fuel');
    const fuelQty = fuelExp.reduce((a, e) => a + (Number(e.qty) || 0), 0);
    const fuelUnit = FUEL_TYPES[fuelExp[0]?.fuelType || fuelTypes[0]]?.unit || 'л';
    const fuelKm = shiftKm(draft);

    fill(root, 
      h('div', { class: 'top' },
        h('button', { class: 'back', onclick: () => leave() }, icon('left', 20), 'Назад'),
        !isNew && h('button', { class: 'icon-btn', 'aria-label': 'Изтрий смяната', onclick: del }, icon('trash', 20))),
      h('h1', null, isNew ? 'Нова смяна' : wasActive ? (draft.end ? 'Приключваш смяната' : 'Текуща смяна') : 'Смяна'),
      h('p', { class: 'muted', style: { margin: '4px 0 16px' } }, fmtDateLong(day)),
      h('button', { class: 'btn btn-ghost btn-block voice-btn', type: 'button', onclick: sayShift }, icon('mic', 20), 'Кажи смяната на глас'),

      // Три полета едно под друго: Данни, Приходи, Разходи. Всеки ред – „+ Въведи“ или сумата.
      h('section', { class: 'card f-card', 'data-sec': 'data' },
        cardTitle('gauge', 'Данни', h('b', { class: 'num' }, [shiftKm(draft) ? `${shiftKm(draft)} км` : '', shiftHours(draft) ? fmtDuration(shiftHours(draft)) : ''].filter(Boolean).join(' · '))),
        h('div', { class: 'f-list' },
          fRow({ ic: 'gauge', color: 'var(--c-teal)', label: 'Начален км', value: draft.kmStart ? `${draft.kmStart.toLocaleString('bg-BG')} км` : '', onTap: () => editKm('kmStart') }),
          fRow({ ic: 'gauge', color: 'var(--c-teal)', label: 'Краен км', value: draft.kmEnd ? `${draft.kmEnd.toLocaleString('bg-BG')} км` : '', onTap: () => editKm('kmEnd'), bad: kmBad }),
          kmBad && h('p', { class: 'err' }, 'Крайният километраж е по-малък от началния'),
          timeRow('Тръгване', draft.start, (v) => { draft.start = v; draw(); }),
          draft.end ? timeRow('Прибиране', draft.end, (v) => { draft.end = v; draw(); }, timeBad)
            : fRow({ ic: 'clock', color: 'var(--c-blue)', label: 'Прибиране', sub: 'Смяната още тече', value: '', onTap: () => { draft.end = new Date().toISOString(); draw(); }, btnLabel: 'Приключи сега' }),
          timeBad && h('p', { class: 'err' }, 'Прибирането трябва да е след тръгването'),
          h('label', { class: 'f-row f-note' },
            h('span', { class: 'f-ic', style: { '--tc': 'var(--c-slate)' } }, icon('edit', 18)),
            h('span', { class: 'grow' }, h('b', null, 'Бележка'),
              h('input', { class: 'f-input', placeholder: 'По желание', value: draft.note || '', oninput: (e) => { draft.note = e.target.value; } }))))),

      h('section', { class: 'card f-card', 'data-sec': 'inc' },
        cardTitle('coins', 'Приходи', h('b', { class: 'num' }, money(inc, inc % 1 ? 2 : 0))),
        h('div', { class: 'f-list' }, Object.entries(INCOME_TYPES).map(([k, t]) =>
          fRow({ ic: t.icon, color: t.color, label: t.label, value: draft.income[k] ? money(draft.income[k], draft.income[k] % 1 ? 2 : 0) : '', onTap: () => editIncome(k), add: true })))),

      h('section', { class: 'card f-card', 'data-sec': 'exp' },
        cardTitle('fuel', 'Разходи', h('b', { class: 'num' }, money(exp, exp % 1 ? 2 : 0))),
        h('div', { class: 'f-list' },
          cats.slice(0, 3).map((c) => {
            const sum = draft.expenses.filter((e) => e.category === c.key).reduce((a, e) => a + (Number(e.amount) || 0), 0);
            const fuelSub = c.key === 'fuel' ? (fuelQty ? `${String(round2(fuelQty)).replace('.', ',')} ${fuelUnit}${fuelKm ? ` · ${String(round2(fuelQty / fuelKm * 100)).replace('.', ',')} ${fuelUnit}/100 км` : ''}` : 'Сума и литри') : null;
            return fRow({ ic: c.icon, color: c.color, label: c.label, sub: fuelSub, value: sum ? money(sum, sum % 1 ? 2 : 0) : '', onTap: () => (c.key === 'fuel' ? editFuel() : editExpense({ category: c.key })), add: true });
          }),
          fRow({ ic: 'plus', color: 'var(--c-slate)', label: 'Друг разход', sub: 'Обслужване, ремонт, гуми, глоба…', value: '', onTap: otherExpense, add: true })),
        draft.expenses.length > 0 && h('div', { class: 'exp-list' }, draft.expenses.map((e) =>
          h('div', { class: 'exp-item', style: { '--qc': expenseCat(e.category).color } },
            h('span', { class: 'e-ic' }, icon(expenseCat(e.category).icon, 17)),
            h('button', { class: 'grow', style: { textAlign: 'left' }, onclick: () => (e.category === 'fuel' ? editFuel(e) : editExpense(e)) },
              h('div', { class: 'name' }, expName(e)),
              e.category === 'fuel' && e.qty > 0 && h('div', { class: 'det' }, `${String(e.qty).replace('.', ',')} ${FUEL_TYPES[e.fuelType]?.unit || 'л'}, ${money(e.amount / e.qty, 2)}/${FUEL_TYPES[e.fuelType]?.unit || 'л'}`)),
            h('span', { class: 'amt' }, money(e.amount, e.amount % 1 ? 2 : 0)),
            h('button', { class: 'icon-btn plain', 'aria-label': 'Премахни', onclick: () => { draft.expenses = draft.expenses.filter((x) => x !== e); draw(); } }, icon('x', 18))))),
        h('div', { class: 'f-tools' },
          h('button', { class: 'btn btn-ghost btn-sm', onclick: () => scanReceipt((r) => editFuel(r.amount ? { amount: r.amount, qty: r.qty, fuelType: r.type && fuelTypes.includes(r.type) ? r.type : undefined } : {})) }, icon('camera', 16), 'Снимай бележка'),
          h('button', { class: 'btn btn-ghost btn-sm', onclick: copyLast }, icon('copy', 16), 'Като предишната')),
        fixedShare > 0 && h('p', { class: 'auto-note' }, icon('wallet', 15), `Наемът, ефирът и другите постоянни разходи се смятат сами (${money(fixedShare, 2)} за деня).`)),

      // Лента за запис
      h('div', { class: 'save-bar' },
        (inc > 0 || draft.expenses.length) ? h('div', { class: 'sum' }, h('span', null, 'Чисто за смяната'), h('b', { class: net >= 0 ? 'pos' : 'neg' }, money(net)))
          : h('div', { class: 'sum' }, h('span', null, 'Чисто за смяната'), h('span', { class: 'hint' }, 'Въведи кеш и карта')),
        h('button', { class: 'btn btn-primary btn-lg', onclick: () => save() }, icon('check', 20), !draft.end ? 'Запази' : wasActive ? 'Приключи' : 'Запази')));
  }

  // Ред от полето: иконка, име, стойност и бутон „+ Въведи“ (или „+“, когато вече има сума)
  function fRow({ ic, color, label, sub, value, onTap, add, bad, btnLabel }) {
    return h('button', { class: cx('f-row', bad && 'bad'), type: 'button', onclick: onTap },
      h('span', { class: 'f-ic', style: { '--tc': color } }, icon(ic, 18)),
      h('span', { class: 'grow' }, h('b', null, label), sub && h('small', null, sub)),
      value && h('span', { class: 'f-val' }, value),
      h('span', { class: cx('f-btn', value && 'has') }, value ? icon(add ? 'plus' : 'edit', 16) : h('span', { class: 'row' }, icon('plus', 16), btnLabel || 'Въведи')));
  }
  function timeRow(label, iso, onSet, bad) {
    return h('label', { class: cx('f-row', bad && 'bad') },
      h('span', { class: 'f-ic', style: { '--tc': 'var(--c-blue)' } }, icon('clock', 18)),
      h('span', { class: 'grow' }, h('b', null, label)),
      h('input', { class: 'f-time', type: 'datetime-local', value: toLocalInput(iso), onchange: (e) => { if (e.target.value) onSet(fromLocalInput(e.target.value)); } }));
  }

  // Гласово въвеждане: „кеш 120, карта 80, гориво 40 евро 28 литра, автомивка 6“
  async function sayShift() {
    const { openVoice } = await import('../voice.js');
    openVoice({ mode: 'shift', title: 'Кажи смяната', kmStart: draft.kmStart, onApply: (p) => {
      Object.entries(p.income).forEach(([k, v]) => { draft.income[k] = round2((draft.income[k] || 0) + v); });
      const t = fuelTypes[0];
      if (p.fuel && (p.fuel.amount || p.fuel.qty)) draft.expenses.push({ id: uid(), category: 'fuel', fuelType: t, amount: p.fuel.amount || 0, qty: p.fuel.qty || 0 });
      if (p.wash) draft.expenses.push({ id: uid(), category: 'wash', amount: p.wash, label: '' });
      if (p.parking) draft.expenses.push({ id: uid(), category: 'parking', amount: p.parking, label: '' });
      if (p.kmStart) draft.kmStart = p.kmStart;
      if (p.kmEnd) draft.kmEnd = p.kmEnd;
      draw(); toast('Добавено от гласа. Провери сумите.');
    } });
  }
  // Останалите видове разходи + управление на категориите
  function otherExpense() {
    const rest = shiftCats(profile).slice(3);
    openSheet((close) => h('div', null,
      sheetHead('Друг разход', close, 'Избери вид'),
      h('div', { class: 'quick' },
        rest.map((c) => h('button', { style: { '--qc': c.color }, onclick: () => { close(); editExpense({ category: c.key }); } }, h('span', { class: 'q-ic' }, icon(c.icon, 21)), c.label)),
        h('button', { class: 'quick-edit', onclick: () => { close(); openCategories(); } }, h('span', { class: 'q-ic' }, icon('tag', 21)), 'Категории'))));
  }
  function editIncome(k) {
    const cur = draft.income[k];
    const actions = cur > 0
      ? [{ label: `Добави към ${money(cur, cur % 1 ? 2 : 0)}`, run: ({ v }) => { draft.income[k] = round2(cur + v); draw(); } }, { label: 'Смени на новата', primary: true, run: ({ v }) => { draft.income[k] = v; draw(); } }]
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
      sub: isNewE && lastAmount(e.category) ? `Миналия път: ${money(lastAmount(e.category), 2)}` : null,
      fields: [{ key: 'v', label: 'Сума', value: e.amount || (isNewE ? lastAmount(e.category) || '' : '') }],
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
      title: 'Гориво', sub: lastPrice ? `Литрите се смятат сами по последната цена ${money(lastPrice, 2)}/л – или ги напиши` : 'Литрите са по желание, но дават разход на 100 км',
      top: chips,
      fields: [{ key: 'amount', label: 'Сума', value: e.amount || '' }, { key: 'qty', label: unit() === 'л' ? 'Литри' : 'Количество', value: e.qty || '', unit: unit(), auto: lastPrice && !e.id ? ({ amount }) => (amount ? amount / lastPrice : 0) : null }],
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
  function save(force = false) {
    if (draft.end && new Date(draft.end) <= new Date(draft.start)) { toast('Краят трябва да е след началото', 'err'); return; }
    if (draft.kmEnd > 0 && draft.kmEnd < draft.kmStart) { toast('Провери километража', 'err'); return; }
    // Необичайна смяна (над 24 часа или с край в бъдещето) – питаме, но позволяваме
    const longH = draft.end ? (new Date(draft.end) - new Date(draft.start)) / 3600000 : 0;
    const future = draft.end && new Date(draft.end) - new Date() > 10 * 60000;
    if (!force && (longH > 24 || future)) {
      confirmSheet({ title: 'Провери времето', text: `${longH > 24 ? `Смяната е ${Math.round(longH)} часа. ` : ''}${future ? 'Краят е в бъдещето. ' : ''}Да я запишем ли така?`, okLabel: 'Запиши все пак', onOk: () => save(true) });
      return;
    }
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
