// Лични резервации: курсове, уговорени директно с клиент (летище, гара, извън града)

import { h, fill, icon, cx, money, todayStr, addDays, fmtDateLong, fmtDate, parseNum } from '../util.js';
import * as store from '../store.js';
import { openSheet, sheetHead, confirmSheet, toast, field, empty, hero, cardTitle } from '../ui.js';

export const mapsUrl = (r) => `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(r.from)}&destination=${encodeURIComponent(r.to)}`;
export const upcomingReservations = (list) => { const t = todayStr(); return list.filter((r) => !r.done && r.date >= t).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)); };
export function whenLabel(r) {
  const t = todayStr();
  if (r.date === t) return 'Днес';
  if (r.date === addDays(t, 1)) return 'Утре';
  return fmtDate(r.date);
}

// Ред с резервация – използва се и на началния екран
export function reservationRow(r, { compact } = {}) {
  return h('button', { class: cx('res-row', r.done && 'done'), onclick: () => editReservation(r) },
    h('div', { class: 'res-when' }, h('b', null, r.time), h('span', null, whenLabel(r))),
    h('div', { class: 'res-main' },
      h('div', { class: 'res-client' }, r.client || 'Клиент', r.price ? h('span', { class: 'chip good', style: { padding: '2px 8px' } }, money(r.price)) : null),
      h('div', { class: 'res-route' }, icon('pin', 14), h('span', null, r.from), icon('right', 12), h('span', null, r.to)),
      !compact && r.note && h('div', { class: 'res-note' }, r.note)),
    icon('right', 18));
}

export function reservationsView({ data }) {
  const up = upcomingReservations(data.reservations || []);
  const past = (data.reservations || []).filter((r) => r.done || r.date < todayStr()).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).slice(0, 20);
  const sum = up.reduce((a, r) => a + (Number(r.price) || 0), 0);
  return h('div', { class: 'screen', 'data-page': 'reservations' },
    h('a', { class: 'back', href: '#/home' }, icon('left', 20), 'Назад'),
    hero(
      h('div', { class: 'hero-top' },
        h('div', null, h('h1', null, 'Резервации'), h('div', { class: 'hero-sub' }, 'Лични курсове, уговорени с клиент')),
        h('button', { class: 'hero-btn', 'aria-label': 'Нова резервация', onclick: () => editReservation({}) }, icon('plus', 22))),
      h('div', { class: 'hero-num' }, String(up.length)),
      h('div', { class: 'hero-sub' }, up.length === 1 ? 'предстояща резервация' : 'предстоящи резервации'),
      sum > 0 && h('div', { class: 'hero-chips' }, h('span', { class: 'hero-chip' }, icon('coins', 14), `договорени ${money(sum)}`))),
    up.length
      ? h('section', { class: 'card', style: { padding: '6px 14px' } }, up.map((r) => reservationRow(r)))
      : empty('calendar', 'Няма предстоящи резервации', 'Записвай курсове до летището, гарата или друг град, за да не изпуснеш нито един.',
        h('button', { class: 'btn btn-page', onclick: () => editReservation({}) }, icon('plus', 18), 'Нова резервация')),
    past.length > 0 && h('h2', { class: 'section-title' }, 'Минали'),
    past.length > 0 && h('section', { class: 'card', style: { padding: '6px 14px' } }, past.map((r) => reservationRow({ ...r, done: true }, { compact: true }))),
    h('button', { class: 'btn btn-page fab', onclick: () => editReservation({}) }, icon('plus', 20), 'Резервация'));
}

export function editReservation(r) {
  const isNew = !r.id;
  const d = { date: addDays(todayStr(), 1), time: '08:00', from: '', to: '', client: '', phone: '', price: null, note: '', ...r };
  openSheet((close) => {
    const inp = (k, attrs = {}) => h('input', { class: 'input', value: d[k] ?? '', oninput: (e) => { d[k] = e.target.value; }, ...attrs });
    const price = h('input', { class: 'input', inputmode: 'decimal', placeholder: 'по желание', value: d.price ? String(d.price).replace('.', ',') : '' });
    const err = h('p', { class: 'err' });
    const save = () => {
      d.price = price.value.trim() ? parseNum(price.value) : null;
      if (!d.date || !d.time) { err.textContent = 'Избери дата и час'; return; }
      if (!d.from.trim() || !d.to.trim()) { err.textContent = 'Въведи откъде и докъде'; return; }
      if (!d.client.trim()) { err.textContent = 'Въведи име на клиента'; return; }
      store.saveReservation(d); close(); toast(isNew ? 'Резервацията е записана' : 'Запазено');
    };
    return h('div', { class: 'form' },
      sheetHead(isNew ? 'Нова резервация' : 'Резервация', close, isNew ? null : fmtDateLong(d.date)),
      h('div', { class: 'grid2' }, field('Дата', inp('date', { type: 'date' }), null, true), field('Час', inp('time', { type: 'time' }), null, true)),
      field('От адрес', inp('from', { placeholder: 'напр. ж.к. Младост 1, бл. 12' }), null, true),
      field('До адрес', inp('to', { placeholder: 'напр. Летище, Терминал 2' }), null, true),
      field('Име на клиента', inp('client', { placeholder: 'напр. Г-жа Николова' }), null, true),
      h('div', { class: 'grid2' }, field('Телефон', inp('phone', { type: 'tel', inputmode: 'tel', placeholder: 'по желание' })), field('Цена (€)', price)),
      field('Бележка', inp('note', { placeholder: 'напр. полет 07:40, два куфара' })),
      !isNew && h('div', { class: 'row gap', style: { flexWrap: 'wrap' } },
        d.phone && h('a', { class: 'btn btn-ghost btn-sm', href: 'tel:' + d.phone.replace(/\s/g, '') }, icon('call', 16), 'Обади се'),
        h('a', { class: 'btn btn-ghost btn-sm', href: mapsUrl(d), target: '_blank', rel: 'noopener' }, icon('route', 16), 'Маршрут'),
        !d.done && h('button', { class: 'btn btn-ok btn-sm', onclick: () => { store.setReservationDone(d.id, true); close(); toast('Отбелязано като изпълнено'); } }, icon('check', 16), 'Изпълнена')),
      err,
      h('div', { class: 'row gap' },
        !isNew && h('button', { class: 'btn btn-ghost btn-lg', 'aria-label': 'Изтрий', onclick: () => { close(); confirmSheet({ title: 'Изтриване на резервацията?', okLabel: 'Изтрий', danger: true, onOk: () => { store.deleteReservation(d.id); toast('Изтрита'); } }); } }, icon('trash', 20)),
        h('button', { class: 'btn btn-primary btn-lg grow', onclick: save }, 'Запази')));
  }, { tall: true });
}
export { cardTitle, fill };
