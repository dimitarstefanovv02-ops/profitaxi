// Разходите на колата под наем – първо разходите, сроковете идват сами от тях:
// постоянни (застраховки, винетка, преглед… – плащат се на всеки 1–12 месеца, с плъзгач),
// първоначални (апарат, боядисване, окабеляване… – вложение, влизат в изплащането на колата),
// срокове (от разходите + добавени на ръка; всеки може да се махне), история на плащанията.
import { h, icon, cx, money, fmtDate, todayStr, addDays } from '../util.js';
import * as store from '../store.js';
import { openSheet, sheetHead, toast, field, confirmSheet } from '../ui.js';
import { costCat } from '../constants.js';

// Постоянните разходи на колата под наем
export const FIXED_KINDS = {
  insurance: { t: 'Гражданска отговорност', m: 12 },
  casco: { t: 'Каско', m: 12 },
  vignette: { t: 'Винетка', m: 12 },
  inspection: { t: 'Технически преглед', m: 12 },
  cartax: { t: 'Данък МПС', m: 12 },
  license: { t: 'Лиценз / разрешително', m: 12 },
  meter: { t: 'Таксиметров апарат (абонамент)', m: 1 },
  other: { t: 'Друго', m: 1 },
};
// Първоначалните (еднократни при пускане на колата)
export const SETUP_KINDS = {
  meter: 'Таксиметров апарат', paint: 'Боядисване', wiring: 'Окабеляване', lamp: 'Лампа и табели', brand: 'Брандиране / стикери', other: 'Друго',
};
export const monthsText = (n) => (n === 12 ? 'веднъж годишно' : n === 1 ? 'всеки месец' : n === 6 ? 'на всеки 6 месеца' : `на всеки ${n} месеца`);
export const perText = (c) => (c.period === 'months' ? (c.months === 12 ? '/год.' : c.months === 1 ? '/мес.' : `/${c.months} мес.`) : ({ week: '/седм.', month: '/мес.', quarter: '/3 мес.', year: '/год.' })[c.period] || '');

// Плъзгач 1–12 месеца
function monthsSlider(value, onChange) {
  const out = h('b', null, monthsText(value));
  const r = h('input', { type: 'range', min: 1, max: 12, step: 1, value, class: 'm-range', 'aria-label': 'На колко месеца се плаща',
    oninput: (e) => { const v = Number(e.target.value); out.textContent = monthsText(v); onChange(v); } });
  return h('div', { class: 'm-slider' }, h('div', { class: 'm-top' }, h('span', null, 'Плаща се'), out), r,
    h('div', { class: 'm-ticks' }, h('span', null, '1 мес.'), h('span', null, '3'), h('span', null, '6'), h('span', null, '12 мес.')));
}

// Постоянен разход – нов или промяна
export function fixedCostSheet(car, cost, redraw) {
  let kind = cost ? (FIXED_KINDS[cost.category] ? cost.category : 'other') : 'insurance';
  let months = cost ? (cost.period === 'months' ? cost.months : cost.period === 'year' ? 12 : cost.period === 'quarter' ? 3 : 1) : FIXED_KINDS.insurance.m;
  const name = h('input', { class: 'input', value: cost?.name || '', placeholder: 'напр. Паркомясто' });
  const amount = h('input', { class: 'input', type: 'number', inputmode: 'decimal', value: cost?.amount || '', placeholder: '0' });
  const due = h('input', { class: 'input', type: 'date', value: cost?.dueDate || '' });
  const err = h('p', { class: 'err' });
  openSheet((close) => {
    const chips = h('div');
    const nameBox = h('div');
    const slider = h('div');
    const draw = () => {
      chips.replaceChildren(h('div', { class: 'chip-row wrap' }, Object.entries(FIXED_KINDS).map(([k, v]) => h('button', { type: 'button', class: cx('chip-btn', kind === k && 'on'), onclick: () => {
        if (!cost && kind !== k) { months = v.m; slider.replaceChildren(monthsSlider(months, (n) => { months = n; })); }
        kind = k; draw();
      } }, v.t))));
      nameBox.replaceChildren(kind === 'other' ? field('Какво е', name, null, true) : '');
    };
    slider.append(monthsSlider(months, (n) => { months = n; }));
    draw();
    return h('div', { class: 'form' },
      sheetHead(cost ? 'Постоянен разход' : 'Нов постоянен разход', close, 'Срокът за следващото плащане излиза сам в „Срокове“ и напомняме преди него.'),
      chips, nameBox,
      h('div', { class: 'grid2' }, field('Сума', amount, null, true), field('Следващо плащане', due, 'или до кога е валидно', true)),
      slider,
      err,
      h('div', { class: 'row gap' },
        cost && h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => confirmSheet({ title: 'Да изтрия ли разхода?', text: 'Махам го и от сроковете. Платеното досега остава в историята.', okLabel: 'Изтрий', danger: true, onOk: () => { store.deleteCost(cost.id); close(); redraw(); } }) }, icon('trash', 16)),
        h('button', { class: 'btn btn-primary btn-lg grow', type: 'button', onclick: () => {
          const a = Number(amount.value);
          if (!(a > 0)) { err.textContent = 'Въведи сумата'; return; }
          if (!due.value) { err.textContent = 'Избери датата на следващото плащане'; return; }
          if (kind === 'other' && !name.value.trim()) { err.textContent = 'Напиши какъв е разходът'; return; }
          store.saveCost({ ...(cost || {}), carId: car.id, category: kind, name: kind === 'other' ? name.value.trim() : FIXED_KINDS[kind].t, amount: a, period: 'months', months, dueDate: due.value, startDate: cost?.startDate || todayStr(), noDl: cost?.noDl && cost.dueDate === due.value ? true : undefined });
          close(); toast('Запазено'); redraw();
        } }, icon('check', 18), 'Запази')));
  }, { tall: true });
}

// Първоначален разход (вложение): апарат, боядисване, окабеляване…
export function setupCostSheet(car, cost, redraw) {
  let kind = cost?.setupKind || 'meter';
  const name = h('input', { class: 'input', value: cost && cost.setupKind === 'other' ? cost.name : '', placeholder: 'напр. Камера' });
  const amount = h('input', { class: 'input', type: 'number', inputmode: 'decimal', value: cost?.amount || '', placeholder: '0' });
  const date = h('input', { class: 'input', type: 'date', value: cost?.startDate || todayStr() });
  const err = h('p', { class: 'err' });
  openSheet((close) => {
    const chips = h('div'), nameBox = h('div');
    const draw = () => {
      chips.replaceChildren(h('div', { class: 'chip-row wrap' }, Object.entries(SETUP_KINDS).map(([k, t]) => h('button', { type: 'button', class: cx('chip-btn', kind === k && 'on'), onclick: () => { kind = k; draw(); } }, t))));
      nameBox.replaceChildren(kind === 'other' ? field('Какво е', name, null, true) : '');
    };
    draw();
    return h('div', { class: 'form' },
      sheetHead(cost ? 'Първоначален разход' : 'Нов първоначален разход', close, 'Еднократно при пускането на колата. Влиза в „Изплащане на колата“, не в печалбата за месеца.'),
      chips, nameBox,
      h('div', { class: 'grid2' }, field('Сума', amount, null, true), field('Дата', date)),
      err,
      h('div', { class: 'row gap' },
        cost && h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => confirmSheet({ title: 'Да изтрия ли разхода?', okLabel: 'Изтрий', danger: true, onOk: () => { store.deleteCost(cost.id, { from: '1900-01-01' }); close(); redraw(); } }) }, icon('trash', 16)),
        h('button', { class: 'btn btn-primary btn-lg grow', type: 'button', onclick: () => {
          const a = Number(amount.value);
          if (!(a > 0)) { err.textContent = 'Въведи сумата'; return; }
          if (kind === 'other' && !name.value.trim()) { err.textContent = 'Напиши какво е'; return; }
          store.saveCost({ ...(cost || {}), carId: car.id, category: kind === 'meter' ? 'meter' : 'setup', setupKind: kind, name: kind === 'other' ? name.value.trim() : SETUP_KINDS[kind], amount: a, period: 'once', startDate: date.value || todayStr(), initial: true });
          close(); toast('Запазено'); redraw();
        } }, icon('check', 18), 'Запази')));
  });
}

// Срок на ръка (за неща без разход: напр. лиценз, проверка на апарата)
export function deadlineSheet(car, redraw) {
  const name = h('input', { class: 'input', placeholder: 'напр. Проверка на апарата' });
  const date = h('input', { class: 'input', type: 'date', value: addDays(todayStr(), 30) });
  const err = h('p', { class: 'err' });
  openSheet((close) => h('div', { class: 'form' },
    sheetHead('Нов срок', close, 'За неща без постоянен разход. Разходите си имат срок сами.'),
    field('Какво изтича', name, null, true), field('До кога', date, null, true), err,
    h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: () => {
      if (!name.value.trim() || !date.value) { err.textContent = 'Попълни името и датата'; return; }
      const k = 'x' + Math.random().toString(36).slice(2, 8);
      store.updateCar(car.id, { docs: { ...(car.docs || {}), [k]: date.value }, docNames: { ...(car.docNames || {}), [k]: name.value.trim() } });
      close(); toast('Добавено'); redraw();
    } }, icon('check', 18), 'Добави')));
}
// Махане на срок от списъка: ръчен – изтрива се; от разход – разходът остава, но без срок
export function removeDeadline(car, x, costs, redraw) {
  confirmSheet({ title: `Да махна ли „${x.title}“ от сроковете?`, text: x.kind === 'cost' ? 'Разходът остава – само няма да напомняме за него.' : null, okLabel: 'Махни', danger: true, onOk: () => {
    if (x.kind === 'doc') { const docs = { ...(car.docs || {}) }; delete docs[x.docKey]; store.updateCar(car.id, { docs }); }
    else if (x.kind === 'cost') { const c = costs.find((y) => y.id === x.costId); if (c) store.saveCost({ ...c, noDl: true }); }
    redraw();
  } });
}

// История: какво е платено, кога и колко – наем, депозити, глоби, разходи (еднократни и постоянни)
export function paymentsList(info) {
  const rows = [];
  const nm = (id) => (info.users[id]?.name || '').split(' ')[0];
  for (const l of info.logs) {
    if (l.kind === 'pay' && l.status === 'ok') rows.push({ d: l.date, t: `Наем · ${nm(l.driverId)}`, a: +l.amount, ic: 'coins' });
    else if (l.kind === 'pay') rows.push({ d: l.date, t: `Наем · ${nm(l.driverId)} – чака потвърждение`, a: +l.amount, ic: 'clock', wait: true });
    else if (l.kind === 'deposit') rows.push({ d: l.date, t: `Депозит · ${nm(l.driverId)}`, a: +l.amount, ic: 'lock' });
    else if (l.kind === 'refund') rows.push({ d: l.date, t: `Върнат депозит · ${nm(l.driverId)}`, a: -l.amount, ic: 'download' });
    else if (l.kind === 'deduct') rows.push({ d: l.date, t: `Удръжка · ${nm(l.driverId)}${l.text ? ' – ' + l.text : ''}`, a: +l.amount, ic: 'minus' });
    else if (l.kind === 'fine') rows.push({ d: l.date, t: `Глоба · ${nm(l.driverId)}${l.text ? ' – ' + l.text : ''}`, a: -(l.amount || 0), ic: 'alert', info: true });
  }
  for (const c of info.costs) {
    if (c.period === 'once') rows.push({ d: c.startDate, t: c.name || costCat(c.category).label, a: -c.amount, ic: c.initial ? 'flag' : costCat(c.category).icon, cost: c });
    else for (const p of c.payments || []) rows.push({ d: p.date, t: c.name, a: -(p.amount || c.amount), ic: costCat(c.category).icon });
  }
  return rows.filter((r) => r.d).sort((a, b) => b.d.localeCompare(a.d));
}
export const payRow = (r) => h('div', { class: 'pay-row' },
  h('span', { class: 'pr-ic' }, icon(r.ic, 15)),
  h('span', { class: 'grow' }, h('b', null, r.t), h('small', null, fmtDate(r.d) + ' ' + r.d.slice(0, 4))),
  h('b', { class: cx('num', r.info ? '' : r.a >= 0 ? 'pos' : 'neg') }, `${r.info ? '' : r.a >= 0 ? '+' : '−'}${money(Math.abs(r.a), Math.abs(r.a) % 1 ? 2 : 0)}`));
