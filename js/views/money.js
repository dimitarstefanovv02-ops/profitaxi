// „Пари“: месецът в една карта, графика по дни и последните смени.
// Всичко подробно (статистика за всеки период, рекорди, часове, Excel) е зад бутоните отдолу.

import { h, icon, cx, money, todayStr, startOfMonth, endOfMonth, MONTHS, parseDate, addDays } from '../util.js';
import { goalProgress, series, periodStats } from '../calc.js';
import { barChart, cardTitle, empty, openSheet, sheetHead } from '../ui.js';
import { shiftRow } from './home.js';
import { exportCsv, fuelLine } from './stats.js';
import { shareMonth } from '../quick.js';
import { zone } from '../arrange.js';

// Кой месец гледаме (по подразбиране – текущия); сменя се от бутона горе
let viewMonth = null;
const ym = (d) => d.slice(0, 7);
const monthName = (key) => { const m = MONTHS[Number(key.slice(5, 7)) - 1]; return m[0].toUpperCase() + m.slice(1); };

function pickMonth(data, cur, redraw) {
  const first = data.shifts.reduce((a, s) => (s.start < a ? s.start : a), todayStr()).slice(0, 7);
  const list = []; let d = startOfMonth(todayStr());
  for (let i = 0; i < 24 && ym(d) >= first; i++) { list.push(ym(d)); d = startOfMonth(addDays(d, -1)); }
  if (!list.length) list.push(ym(todayStr()));
  openSheet((close) => h('div', null, sheetHead('Кой месец', close),
    h('div', { class: 'f-list' }, list.map((k) => h('button', { class: cx('f-row', k === cur && 'on'), type: 'button', onclick: () => { viewMonth = k === ym(todayStr()) ? null : k; close(); redraw(); } },
      h('span', { class: 'grow' }, h('b', null, `${monthName(k)} ${k.slice(0, 4)}`)), k === cur && icon('check', 18))))));
}

export function moneyView({ go, data, rerender }) {
  const today = todayStr();
  const g = goalProgress(data);
  const cur = viewMonth || ym(today);
  const isNow = cur === ym(today);
  const from = cur + '-01', to = endOfMonth(from);
  // текущият месец – с прогнозата; минал месец – само какво е станало
  const st = isNow ? g.stats : periodStats(data, from, to);
  const net = isNow ? g.net : st.net;
  const spent = st.varExp + st.fixedExp; // постоянните – ден по ден до днес
  const pts = series(data, from, to, 'day');
  const recent = data.shifts.filter((s) => s.end).slice(0, 5);
  const redraw = rerender || (() => go('/money'));

  return h('div', { class: 'screen', 'data-page': 'money' },
    h('div', { class: 'page-title' }, h('h1', null, 'Пари'),
      h('button', { class: 'month-pick', type: 'button', onclick: () => pickMonth(data, cur, redraw) }, monthName(cur), icon('down', 18))),

    zone('drv.money', { class: 'dz' }, [
    // Месецът накратко: голямото число и двете суми под него
    ['sum', h('div', { class: 'ms-stack' }, h('section', { class: 'card month-sum' },
      h('div', { class: 'ms-total' }, h('span', null, isNow ? 'Чисто този месец' : `Чисто за ${monthName(cur).toLowerCase()}`), h('b', { class: net < 0 ? 'neg' : '' }, money(net))),
      h('div', { class: 'ms-cells' },
        h('div', { class: 'ms-row' }, h('span', null, 'Изкарах'), h('b', null, money(st.income))),
        h('div', { class: 'ms-row' }, h('span', null, 'Разходи'), h('b', null, `−${money(spent)}`))),
      h('p', { class: 'muted small' }, isNow
        ? `Наемът, ефирът и другите постоянни плащания се смятат ден по ден – дотук ${money(st.fixedExp)}. Очаквано за целия месец: ${money(g.forecast)}.`
        : `Постоянните плащания за месеца: ${money(st.fixedExp)}. ${st.shifts} ${st.shifts === 1 ? 'смяна' : 'смени'}.`)),
      h('div', { class: 'ms-chips' },
        fuelLine(st),
        isNow && h('button', { class: 'chip ms-share', type: 'button', onclick: () => shareMonth({ net: g.net, income: st.income, shifts: st.shifts, hours: st.hours, name: '' }) }, icon('share', 16), 'Сподели месеца като картинка')))],

    st.shifts > 0 && pts.length > 1 && ['chart', h('section', { class: 'card chart-card' }, cardTitle('chart', 'Чисто по дни'), barChart(pts, { height: 130, highlight: today }))],

    ['links', zone('drv.money.links', { class: 'big-links' }, [
      ['stats', h('a', { class: 'big-link', href: '#/stats' }, h('span', { class: 'bl-ic' }, icon('chart', 22)), h('span', { class: 'grow' }, h('b', null, 'Статистика и отчети'), h('span', null, 'Ден, седмица, месец, година, сравнение по месеци, рекорди')), icon('right', 18))],
      ['shifts', h('a', { class: 'big-link', href: '#/shifts' }, h('span', { class: 'bl-ic' }, icon('list', 22)), h('span', { class: 'grow' }, h('b', null, 'Всички смени'), h('span', null, `${data.shifts.filter((s) => s.end).length} записани`)), icon('right', 18))],
      ['costs', h('a', { class: 'big-link', href: '#/costs' }, h('span', { class: 'bl-ic' }, icon('wallet', 22)), h('span', { class: 'grow' }, h('b', null, 'Постоянни разходи'), h('span', null, 'Наем, ефир, застраховки и падежи')), icon('right', 18))],
      ['excel', h('button', { class: 'big-link', onclick: () => exportCsv(data, { from: '2000-01-01', to: today }) }, h('span', { class: 'bl-ic' }, icon('download', 22)), h('span', { class: 'grow' }, h('b', null, 'Свали в Excel'), h('span', null, 'Всички смени за счетоводителя')), icon('right', 18))],
    ])],

    ['recent', h('div', { class: 'recent-block' },
      h('div', { class: 'block-head' }, h('h2', null, 'Последни смени'), h('a', { class: 'link', href: '#/shifts' }, 'Всички')),
      h('section', { class: 'card recent-card' }, recent.length ? recent.map((s) => shiftRow(data, s))
        : empty('list', 'Още няма смени', 'Започни смяна от „Днес“.', h('button', { class: 'btn btn-primary', onclick: () => go('/shift/new') }, icon('plus', 18), 'Въведи смяна'))))],
    ]));
}

