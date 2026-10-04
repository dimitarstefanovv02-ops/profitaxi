// Списък със смени, групирани по месеци

import { h, icon, money, MONTHS, parseDate, endOfMonth, minStr, todayStr } from '../util.js';
import { periodStats, shiftDate } from '../calc.js';
import { empty, tone } from '../ui.js';
import { shiftRow } from './home.js';

export function shiftsView({ go, data }) {
  const done = data.shifts;
  const groups = new Map();
  for (const s of done) { const m = shiftDate(s).slice(0, 7); if (!groups.has(m)) groups.set(m, []); groups.get(m).push(s); }

  return h('div', { class: 'screen' },
    h('div', { class: 'top' }, h('div', null, h('h1', null, 'Смени'), h('div', { class: 'sub' }, `${done.filter((s) => s.end).length} общо`))),
    !done.length && empty('list', 'Още няма смени', 'Започни смяна от началния екран или въведи минала.',
      h('button', { class: 'btn btn-primary', onclick: () => go('/shift/new') }, icon('plus', 18), 'Въведи смяна')),
    [...groups.entries()].map(([m, list]) => {
      const from = m + '-01';
      const st = periodStats(data, from, minStr(endOfMonth(from), todayStr()));
      return h('div', null,
        h('div', { class: 'month-head' },
          h('h2', null, `${MONTHS[parseDate(from).getMonth()]} ${from.slice(0, 4)}`),
          h('span', { class: 'small' }, h('span', { class: 'muted' }, 'чисто '), h('b', { class: tone(st.net) }, money(st.net)))),
        h('div', { class: 'card', style: { padding: '4px 14px' } }, list.map((s) => shiftRow(data, s))));
    }),
    h('button', { class: 'btn btn-primary fab', onclick: () => go('/shift/new') }, icon('plus', 20), 'Смяна'));
}
