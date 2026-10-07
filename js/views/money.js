// „Пари“: месецът в една карта, графика по дни и последните смени.
// Всичко подробно (статистика за всеки период, рекорди, часове, Excel) е зад бутоните отдолу.

import { h, icon, money, todayStr, startOfMonth, endOfMonth, MONTHS, parseDate } from '../util.js';
import { goalProgress, series } from '../calc.js';
import { barChart, cardTitle, empty } from '../ui.js';
import { shiftRow } from './home.js';
import { exportCsv, fuelLine } from './stats.js';
import { shareMonth } from '../quick.js';
import { zone } from '../arrange.js';

export function moneyView({ go, data }) {
  const today = todayStr();
  const g = goalProgress(data);
  const st = g.stats;
  const month = MONTHS[parseDate(today).getMonth()];
  const spent = st.varExp + st.fixedExp; // постоянните – ден по ден до днес
  const pts = series(data, startOfMonth(today), endOfMonth(today), 'day');
  const recent = data.shifts.filter((s) => s.end).slice(0, 5);

  return h('div', { class: 'screen', 'data-page': 'money' },
    h('div', { class: 'page-title' }, h('h1', null, 'Пари'), h('span', { class: 'muted' }, month[0].toUpperCase() + month.slice(1))),

    zone('drv.money', { class: 'dz' }, [
    // Месецът накратко: три реда и голямото число
    ['sum', h('section', { class: 'card month-sum' },
      h('div', { class: 'ms-row' }, h('span', null, 'Изкарах'), h('b', null, money(st.income))),
      h('div', { class: 'ms-row' }, h('span', null, 'Разходи'), h('b', null, `−${money(spent)}`)),
      h('div', { class: 'ms-total' }, h('span', null, 'Чисто този месец'), h('b', { class: g.net < 0 ? 'neg' : '' }, money(g.net))),
      h('p', { class: 'muted small' }, `Наемът, ефирът и другите постоянни плащания се смятат ден по ден – дотук ${money(st.fixedExp)}. Очаквано за целия месец: ${money(g.forecast)}.`),
      fuelLine(st),
      h('button', { class: 'btn btn-ghost btn-block', style: { marginTop: '12px' }, onclick: () => shareMonth({ net: g.net, income: st.income, shifts: st.shifts, hours: st.hours, name: '' }) }, icon('share', 18), 'Сподели месеца като картинка'))],

    st.shifts > 0 && pts.length > 1 && ['chart', h('section', { class: 'card' }, cardTitle('chart', 'Чисто по дни'), barChart(pts, { height: 130, highlight: today }))],

    ['links', zone('drv.money.links', { class: 'big-links' }, [
      ['stats', h('a', { class: 'big-link', href: '#/stats' }, h('span', { class: 'bl-ic' }, icon('chart', 22)), h('span', { class: 'grow' }, h('b', null, 'Статистика и отчети'), h('span', null, 'Ден, седмица, месец, година, сравнение по месеци, рекорди')), icon('right', 18))],
      ['shifts', h('a', { class: 'big-link', href: '#/shifts' }, h('span', { class: 'bl-ic' }, icon('list', 22)), h('span', { class: 'grow' }, h('b', null, 'Всички смени'), h('span', null, `${data.shifts.filter((s) => s.end).length} записани`)), icon('right', 18))],
      ['costs', h('a', { class: 'big-link', href: '#/costs' }, h('span', { class: 'bl-ic' }, icon('wallet', 22)), h('span', { class: 'grow' }, h('b', null, 'Постоянни разходи'), h('span', null, 'Наем, ефир, застраховки и падежи')), icon('right', 18))],
      ['excel', h('button', { class: 'big-link', onclick: () => exportCsv(data, { from: '2000-01-01', to: today }) }, h('span', { class: 'bl-ic' }, icon('download', 22)), h('span', { class: 'grow' }, h('b', null, 'Свали в Excel'), h('span', null, 'Всички смени за счетоводителя')), icon('right', 18))],
    ])],

    ['recent', h('section', { class: 'card' },
      cardTitle('list', 'Последни смени', h('a', { class: 'link', href: '#/shifts' }, 'Всички', icon('right', 16))),
      recent.length ? recent.map((s) => shiftRow(data, s))
        : empty('list', 'Още няма смени', 'Започни смяна от „Днес“.', h('button', { class: 'btn btn-primary', onclick: () => go('/shift/new') }, icon('plus', 18), 'Въведи смяна')))],
    ]));
}

