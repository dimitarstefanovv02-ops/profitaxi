// Статистика: периоди, графика, разбивки, гориво, топлинна карта, рекорди, експорт

import { h, fill, icon, cx, money, money2, todayStr, addDays, startOfWeek, startOfMonth, endOfMonth, parseDate, MONTHS, MONTHS_SHORT, fmtDate, fmtNum, fmtNum1, fmtDuration, WD_SHORT, dateStr, minStr } from '../util.js';
import { periodStats, series, heatmap, records, shiftIncome, shiftExpenses, shiftKm, shiftHours, shiftDate, shiftNetAfterFixed } from '../calc.js';
import { INCOME_TYPES, EXPENSE_CATS, COST_CATS, FUEL_TYPES } from '../constants.js';
import { segmented, barChart, shareRows, stat, tone } from '../ui.js';

// Състояние на избрания период (пази се между отварянията)
const state = { unit: 'month', anchor: todayStr(), from: addDays(todayStr(), -29), to: todayStr() };

export function periodRange(st) {
  const a = st.anchor;
  if (st.unit === 'day') return { from: a, to: a, label: fmtDate(a, { year: true }) };
  if (st.unit === 'week') { const f = startOfWeek(a), t = addDays(f, 6); return { from: f, to: t, label: `${fmtDate(f)} – ${fmtDate(t)}` }; }
  if (st.unit === 'month') { const d = parseDate(a); return { from: startOfMonth(a), to: endOfMonth(a), label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` }; }
  if (st.unit === 'year') { const y = a.slice(0, 4); return { from: `${y}-01-01`, to: `${y}-12-31`, label: y }; }
  return { from: st.from, to: st.to, label: `${fmtDate(st.from, { year: true })} – ${fmtDate(st.to, { year: true })}` };
}
export function shiftAnchor(st, dir) {
  const d = parseDate(st.anchor);
  if (st.unit === 'day') d.setDate(d.getDate() + dir);
  if (st.unit === 'week') d.setDate(d.getDate() + 7 * dir);
  if (st.unit === 'month') d.setMonth(d.getMonth() + dir, 1);
  if (st.unit === 'year') d.setFullYear(d.getFullYear() + dir, 0, 1);
  st.anchor = dateStr(d);
}

// Лента за избор на период – използва се и в админ панела
export function periodPicker(st, onChange) {
  const r = periodRange(st);
  const canNext = st.unit !== 'custom' && r.to < todayStr();
  return h('div', { class: 'no-print' },
    segmented({ day: 'Ден', week: 'Седм.', month: 'Месец', year: 'Година', custom: 'Период' }, st.unit, (u) => { st.unit = u; st.anchor = todayStr(); onChange(); }, { small: true }),
    st.unit === 'custom'
      ? h('div', { class: 'date-range' },
        h('label', { class: 'time-in' }, h('span', null, 'От'), h('input', { type: 'date', value: st.from, max: st.to, onchange: (e) => { if (e.target.value) { st.from = e.target.value; onChange(); } } })),
        h('label', { class: 'time-in' }, h('span', null, 'До'), h('input', { type: 'date', value: st.to, min: st.from, onchange: (e) => { if (e.target.value) { st.to = e.target.value; onChange(); } } })))
      : h('div', { class: 'period-nav' },
        h('button', { class: 'icon-btn plain', 'aria-label': 'Предишен период', onclick: () => { shiftAnchor(st, -1); onChange(); } }, icon('left')),
        h('b', null, r.label),
        h('button', { class: 'icon-btn plain', 'aria-label': 'Следващ период', disabled: !canNext, style: { opacity: canNext ? 1 : 0.3 }, onclick: () => { if (canNext) { shiftAnchor(st, 1); onChange(); } } }, icon('right'))));
}

export function statsView({ data }) {
  const root = h('div', { class: 'screen' });
  const draw = () => {
    const r = periodRange(state);
    fill(root, 
      h('div', { class: 'top' },
        h('h1', null, 'Статистика'),
        h('div', { class: 'row gap no-print' },
          h('button', { class: 'icon-btn', 'aria-label': 'Свали в Excel', title: 'Excel', onclick: () => exportCsv(data, r) }, icon('download', 20)),
          h('button', { class: 'icon-btn', 'aria-label': 'Печат или PDF', title: 'PDF', onclick: () => window.print() }, icon('print', 20)))),
      h('div', { class: 'print-only' }, h('h2', null, `ProfiTaxi – ${data.user.name}`), h('p', null, r.label)),
      periodPicker(state, draw),
      statsBody(data, r.from, r.to, state.unit));
  };
  draw();
  return root;
}

export function statsBody(data, from, to, unit) {
  const st = periodStats(data, from, to);
  const days = Math.round((parseDate(to) - parseDate(from)) / 86400000) + 1;
  const chartUnit = unit === 'year' || days > 62 ? 'month' : 'day';
  const pts = unit === 'day' ? null : series(data, from, to, chartUnit);
  const hm = heatmap(data.shifts);
  const rec = records(data);
  const incomeItems = Object.entries(INCOME_TYPES).map(([k, t]) => ({ label: t.label, icon: t.icon, value: st[k] }));
  const expItems = [
    ...Object.entries(st.expByCat).map(([k, v]) => ({ label: EXPENSE_CATS[k]?.label || k, icon: EXPENSE_CATS[k]?.icon, value: v })),
    ...Object.entries(st.fixedByCat).map(([k, v]) => ({ label: COST_CATS[k]?.label || k, icon: COST_CATS[k]?.icon, value: v })),
  ];
  const dayShifts = unit === 'day' ? data.shifts.filter((s) => s.end && shiftDate(s) === from) : [];

  return h('div', null,
    h('section', { class: 'card', style: { marginTop: '12px' } },
      h('div', { class: 'muted small', style: { fontWeight: 600 } }, 'Чиста печалба'),
      h('div', { class: cx('big-net', tone(st.net)) }, money(st.net)),
      h('div', { class: 'row gap small muted', style: { flexWrap: 'wrap', marginTop: '4px' } },
        h('span', null, `приход ${money(st.income)}`), h('span', null, `разходи ${money(st.totalExp)}`)),
      pts && pts.length > 1 && barChart(pts, { highlight: chartUnit === 'day' ? todayStr() : todayStr().slice(0, 8) + '01' })),

    h('div', { class: 'grid2', style: { marginTop: '12px' } },
      stat('На час', money2(st.netPerHour), { icon: 'clock', sub: `приход ${money2(st.incomePerHour)}/ч` }),
      stat('На км', money2(st.netPerKm), { icon: 'road', sub: `разход ${money2(st.costPerKm)}/км` }),
      stat('Часове', fmtDuration(st.hours), { icon: 'clock', sub: `${st.shifts} ${st.shifts === 1 ? 'смяна' : 'смени'}` }),
      stat('Километри', fmtNum(st.km), { icon: 'gauge', sub: st.shifts ? `средно ${money(st.avgShift)} на смяна` : '' })),

    unit === 'day' && dayShifts.length > 0 && h('section', { class: 'card' },
      h('div', { class: 'card-title' }, h('h3', null, 'Смени за деня')),
      dayShifts.map((s) => h('a', { class: 'list-btn', href: '#/shift/' + s.id, style: { justifyContent: 'space-between' } },
        h('span', null, `${new Date(s.start).toTimeString().slice(0, 5)} – ${new Date(s.end).toTimeString().slice(0, 5)}`),
        h('b', { class: tone(shiftNetAfterFixed(data, s)) }, money(shiftNetAfterFixed(data, s)))))),

    h('section', { class: 'card' },
      h('div', { class: 'card-title' }, h('h3', null, 'Приходи'), h('b', { class: 'num' }, money(st.income))),
      shareRows(incomeItems, st.income, { cls: 'inc' })),

    h('section', { class: 'card' },
      h('div', { class: 'card-title' }, h('h3', null, 'Разходи'), h('b', { class: 'num' }, money(st.totalExp))),
      h('div', { class: 'grid2', style: { marginBottom: '14px' } },
        stat('От смените', money(st.varExp)), stat('Постоянни', money(st.fixedExp))),
      shareRows(expItems, st.totalExp, { cls: 'exp' })),

    Object.keys(st.fuel).length > 0 && h('section', { class: 'card' },
      h('div', { class: 'card-title' }, h('h3', null, 'Гориво')),
      h('div', { class: 'grid2' }, Object.entries(st.fuel).map(([t, f]) =>
        stat(FUEL_TYPES[t]?.label || t, f.per100 ? `${fmtNum1(f.per100)} ${FUEL_TYPES[t]?.unit}` : money(f.amount),
          { icon: t === 'electric' ? 'bolt' : 'fuel', sub: f.per100 ? `на 100 км, ${money(f.amount)} общо` : 'въведи количество за разход на 100 км' })))),

    heatCard(hm),
    recordsCard(rec));
}

function heatCard(hm) {
  if (!hm.best) return null;
  const color = (v) => {
    if (v == null) return 'var(--surface-2)';
    const t = hm.max > hm.min ? (v - hm.min) / (hm.max - hm.min) : 1;
    return `color-mix(in srgb, var(--accent) ${Math.round(15 + t * 85)}%, var(--surface-2))`;
  };
  const hours = ['0', '3', '6', '9', '12', '15', '18', '21'];
  return h('section', { class: 'card' },
    h('div', { class: 'card-title' }, h('h3', null, 'Кога се печели най-много')),
    h('p', { class: 'muted small', style: { marginBottom: '12px' } },
      `Най-добре: ${['понеделник', 'вторник', 'сряда', 'четвъртък', 'петък', 'събота', 'неделя'][hm.best.wd]} от ${hm.best.b * 3}:00 до ${hm.best.b * 3 + 3}:00, около ${money(hm.best.v)} на час.`),
    h('div', { class: 'heat', role: 'img', 'aria-label': 'Топлинна карта на прихода по часове' },
      h('span'), hours.map((x) => h('span', { class: 'heat-h' }, x)),
      hm.grid.map((row, i) => [h('span', { class: 'heat-wd' }, WD_SHORT[i]),
        row.map((v, j) => h('span', { class: 'heat-cell', style: { background: color(v) }, title: v == null ? 'Няма данни' : `${WD_SHORT[i]} ${j * 3}–${j * 3 + 3}ч: ${money(v)}/ч` }))])),
    h('div', { class: 'heat-legend' }, 'по-малко', h('i', { style: { background: color(hm.min) } }), h('i', { style: { background: color((hm.min + hm.max) / 2) } }), h('i', { style: { background: color(hm.max) } }), 'повече'));
}

function recordsCard(rec) {
  if (!rec.totalShifts) return null;
  const row = (ic, title, value, sub) => h('div', { class: 'rec' }, h('div', { class: 'rec-ic' }, icon(ic, 20)), h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 } }, title), sub && h('span', null, sub)), h('b', null, value));
  const m = rec.bestMonth && parseDate(rec.bestMonth.month + '-01');
  return h('section', { class: 'card' },
    h('div', { class: 'card-title' }, h('h3', null, 'Рекорди')),
    rec.bestShift && row('trophy', 'Най-добра смяна', money(rec.bestShift.value), fmtDate(shiftDate(rec.bestShift.shift), { year: true })),
    rec.bestRate && row('clock', 'Най-добре на час', money2(rec.bestRate.value), fmtDate(shiftDate(rec.bestRate.shift), { year: true })),
    rec.bestMonth && row('calendar', 'Най-добър месец', money(rec.bestMonth.value), `${MONTHS[m.getMonth()]} ${m.getFullYear()}`),
    row('flame', 'Поредни работни дни', `${rec.current}`, `рекорд: ${rec.longest}`));
}

// Excel: CSV с ; и запетая за десетични (както го отваря Excel на български)
export function exportCsv(data, r) {
  const n = (v) => String(Math.round(v * 100) / 100).replace('.', ',');
  const rows = [['Дата', 'Начало', 'Край', 'Часове', 'Км', 'Кеш', 'Карта', 'Приложения', 'Бакшиш', 'Приход', 'Разходи', 'Печалба от смяната', 'Бележка']];
  const list = data.shifts.filter((s) => s.end && shiftDate(s) >= r.from && shiftDate(s) <= r.to).sort((a, b) => a.start.localeCompare(b.start));
  for (const s of list) {
    rows.push([shiftDate(s), new Date(s.start).toTimeString().slice(0, 5), new Date(s.end).toTimeString().slice(0, 5), n(shiftHours(s)), shiftKm(s),
      n(s.income.cash), n(s.income.card), n(s.income.app), n(s.income.tips), n(shiftIncome(s)), n(shiftExpenses(s)), n(shiftIncome(s) - shiftExpenses(s)), (s.note || '').replace(/[;\n]/g, ' ')]);
  }
  const st = periodStats(data, r.from, r.to);
  rows.push([], ['Постоянни разходи за периода', n(st.fixedExp)], ['Чиста печалба', n(st.net)]);
  const csv = '﻿' + rows.map((x) => x.join(';')).join('\r\n');
  const a = h('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: `profitaxi-${r.from}-${r.to}.csv` });
  document.body.appendChild(a); a.click(); a.remove();
}
export { MONTHS_SHORT, minStr };
