// Списък със смени, групирани по месеци, с филтър дневни/нощни

import { h, icon, cx, money, MONTHS, parseDate, endOfMonth, minStr, todayStr, startOfMonth, fmtDuration, fmtNum } from '../util.js';
import { periodStats, shiftDate, isNightShift } from '../calc.js';
import { empty, tone, hero, segmented } from '../ui.js';
import { shiftRow } from './home.js';

const state = { filter: 'all' };
const isNight = isNightShift;

export function shiftsView({ go, data }) {
  const root = h('div', { class: 'screen', 'data-page': 'shifts' });
  const done = data.shifts.filter((s) => s.end);
  const active = data.shifts.find((s) => !s.end);
  const today = todayStr();
  const month = periodStats(data, startOfMonth(today), endOfMonth(today));
  const nights = done.filter(isNight).length;

  const draw = () => {
    const list = data.shifts.filter((s) => state.filter === 'all' || (state.filter === 'night' ? isNight(s) : !isNight(s)));
    const groups = new Map();
    for (const s of list) { const m = shiftDate(s).slice(0, 7); if (!groups.has(m)) groups.set(m, []); groups.get(m).push(s); }
    return [
      hero(
        h('div', { class: 'hero-top' },
          h('div', null, h('h1', null, 'Смени'), h('div', { class: 'hero-sub' }, `${done.length} общо, ${nights} нощни`)),
          h('button', { class: 'hero-btn', 'aria-label': 'Нова смяна', onclick: () => go('/shift/new') }, icon('plus', 22))),
        h('div', { class: 'hero-num' }, money(month.net)),
        h('div', { class: 'hero-sub' }, `чисто този месец от ${month.shifts} ${month.shifts === 1 ? 'смяна' : 'смени'}`),
        h('div', { class: 'hero-chips' },
          h('span', { class: 'hero-chip' }, icon('clock', 14), fmtDuration(month.hours)))),
      active && h('a', { class: 'alert', href: '#/shift/' + active.id, style: { background: 'var(--pos-soft)' } },
        h('span', { class: 'live-dot' }), h('div', { class: 'alert-text' }, h('b', null, 'Имаш активна смяна'), 'Натисни, за да добавиш приход или разход'), icon('right', 18)),
      done.length > 0 && h('div', { style: { marginTop: '14px' } }, segmented({ all: 'Всички', day: 'Дневни', night: 'Нощни' }, state.filter, (f) => { state.filter = f; render(); }, { page: true })),
      !data.shifts.length && empty('list', 'Още няма смени', 'Започни смяна от началния екран или въведи минала.',
        h('button', { class: 'btn btn-page', onclick: () => go('/shift/new') }, icon('plus', 18), 'Въведи смяна')),
      [...groups.entries()].map(([m, items]) => {
        const from = m + '-01';
        const st = periodStats(data, from, endOfMonth(from));
        return h('div', null,
          h('div', { class: 'month-head' },
            h('h2', null, `${MONTHS[parseDate(from).getMonth()]} ${from.slice(0, 4)}`),
            h('span', { class: 'chip page' }, `чисто ${money(st.net)}`)),
          h('div', { class: 'card', style: { padding: '4px 14px' } }, items.map((s) => shiftRow(data, s))));
      }),
      h('button', { class: cx('btn btn-page fab'), onclick: () => go('/shift/new') }, icon('plus', 20), 'Смяна'),
    ];
  };
  const render = () => { root.replaceChildren(); draw().flat(2).forEach((x) => x && root.appendChild(x)); };
  render();
  return root;
}
export { tone };
