// Статистика: периоди, графика, разбивки, гориво, кога се печели, рекорди, експорт

import { h, icon, cx, money, money2, todayStr, addDays, startOfWeek, startOfMonth, endOfMonth, parseDate, MONTHS, MONTHS_SHORT, fmtDate, fmtNum, fmtNum1, fmtDuration, WD_SHORT, dateStr, minStr, fmtTime } from '../util.js';
import { periodStats, series, timeInsights, records, shiftIncome, shiftExpenses, shiftKm, shiftHours, shiftDate, shiftNetAfterFixed, shiftProfit } from '../calc.js';
import { INCOME_TYPES, FUEL_TYPES, expenseCat, costCat } from '../constants.js';
import { segmented, barChart, shareRows, stat, tone, cardTitle, hero } from '../ui.js';

// Състояние на избрания период (пази се между отварянията)
const state = { unit: 'month', anchor: todayStr(), from: addDays(todayStr(), -29), to: todayStr() };
const WD_LONG = ['понеделник', 'вторник', 'сряда', 'четвъртък', 'петък', 'събота', 'неделя'];

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

// Избор на период – използва се и в админ панела
export function periodPicker(st, onChange, { page } = {}) {
  const r = periodRange(st);
  const canNext = st.unit !== 'custom' && r.to < todayStr();
  return h('div', { class: 'no-print' },
    segmented({ day: 'Ден', week: 'Седм.', month: 'Месец', year: 'Година', custom: 'Период' }, st.unit, (u) => { st.unit = u; st.anchor = todayStr(); onChange(); }, { small: true, page }),
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
  const root = h('div', { class: 'screen', 'data-page': 'stats' });
  const draw = () => {
    const r = periodRange(state);
    const st = periodStats(data, r.from, r.to);
    root.replaceChildren(...[
      hero(
        h('div', { class: 'hero-top' },
          h('div', null, h('h1', null, 'Статистика'), h('div', { class: 'hero-sub' }, 'Чиста печалба за периода')),
          h('div', { class: 'row gap no-print' },
            h('button', { class: 'hero-btn', 'aria-label': 'Свали в Excel', title: 'Excel', onclick: () => exportCsv(data, r) }, icon('download', 20)),
            h('button', { class: 'hero-btn', 'aria-label': 'Печат или PDF', title: 'PDF', onclick: () => window.print() }, icon('print', 20)))),
        h('div', { class: 'hero-num' }, money(st.net)),
        h('div', { class: 'hero-chips' },
          h('span', { class: 'hero-chip' }, icon('coins', 14), `приход ${money(st.income)}`),
          h('span', { class: 'hero-chip' }, icon('wallet', 14), `разходи ${money(st.totalExp)}`),
          h('span', { class: 'hero-chip' }, icon('calendar', 14), `${st.shifts} ${st.shifts === 1 ? 'смяна' : 'смени'}`)),
        h('div', { style: { marginTop: '16px' } }, periodPicker(state, draw))),
      h('div', { class: 'print-only' }, h('h2', null, `ProfiTaxi – ${data.user.name}`), h('p', null, r.label)),
      statsBody(data, r.from, r.to, state.unit, { st }),
    ].filter(Boolean));
  };
  draw();
  return root;
}

export function statsBody(data, from, to, unit, { st = periodStats(data, from, to), admin } = {}) {
  const days = Math.round((parseDate(to) - parseDate(from)) / 86400000) + 1;
  const chartUnit = unit === 'year' || days > 62 ? 'month' : 'day';
  const pts = unit === 'day' ? null : series(data, from, to, chartUnit);
  const ti = timeInsights(data.shifts.filter((s) => shiftDate(s) >= from && shiftDate(s) <= to));
  const usePeriod = ti.shifts >= 15;
  const tiAll = usePeriod ? ti : timeInsights(data.shifts);
  const rec = records(data);
  const incomeItems = Object.entries(INCOME_TYPES).map(([k, t]) => ({ label: t.label, icon: t.icon, color: t.color, value: st[k] }));
  const expItems = [
    ...Object.entries(st.expByCat).map(([k, v]) => ({ label: expenseCat(k).label, icon: expenseCat(k).icon, color: expenseCat(k).color, value: v })),
    ...Object.entries(st.fixedByCat).map(([k, v]) => ({ label: costCat(k).label, icon: costCat(k).icon, color: costCat(k).color, value: v })),
  ];
  const dayShifts = unit === 'day' ? data.shifts.filter((s) => s.end && shiftDate(s) === from) : [];

  return h('div', null,
    pts && pts.length > 1 && h('section', { class: 'card' },
      cardTitle('chart', chartUnit === 'day' ? 'Чисто по дни' : 'Чисто по месеци'),
      barChart(pts, { highlight: chartUnit === 'day' ? todayStr() : todayStr().slice(0, 8) + '01' })),

    h('div', { class: 'grid2', style: { marginTop: '14px' } },
      stat('На час', money2(st.netPerHour), { icon: 'clock', color: 'var(--c-blue)', cls: 'stat-card', sub: `приход ${money2(st.incomePerHour)}/ч` }),
      stat('На км', money2(st.netPerKm), { icon: 'road', color: 'var(--c-teal)', cls: 'stat-card', sub: `разход ${money2(st.costPerKm)}/км` }),
      stat('Часове', fmtDuration(st.hours), { icon: 'clock', color: 'var(--c-violet)', cls: 'stat-card', sub: st.shifts ? `~${fmtDuration(st.avgShiftHours)} на смяна` : '' }),
      stat('Километри', fmtNum(st.km), { icon: 'gauge', color: 'var(--c-orange)', cls: 'stat-card', sub: st.shifts ? `~${money(st.avgShiftIncome)} приход на смяна` : '' })),

    unit === 'day' && dayShifts.length > 0 && h('section', { class: 'card', style: { marginTop: '14px' } },
      cardTitle('list', 'Смени за деня'),
      dayShifts.map((s) => h(admin ? 'div' : 'a', { class: 'list-btn', href: admin ? null : '#/shift/' + s.id, style: { justifyContent: 'space-between' } },
        h('span', null, `${fmtTime(s.start)} – ${fmtTime(s.end)}`),
        h('b', { class: tone(shiftNetAfterFixed(data, s)) }, money(shiftNetAfterFixed(data, s)))))),

    h('section', { class: 'card', style: { marginTop: '14px' } },
      cardTitle('coins', 'Приходи', h('b', { class: 'num' }, money(st.income))),
      stackBar(incomeItems, st.income),
      shareRows(incomeItems, st.income)),

    h('section', { class: 'card' },
      cardTitle('wallet', 'Разходи', h('b', { class: 'num' }, money(st.totalExp))),
      h('div', { class: 'grid2', style: { marginBottom: '14px' } },
        stat('От смените', money(st.varExp), { icon: 'fuel', color: 'var(--c-orange)' }), stat('Постоянни', money(st.fixedExp), { icon: 'calendar', color: 'var(--c-blue)' })),
      shareRows(expItems, st.totalExp)),

    Object.keys(st.fuel).length > 0 && h('section', { class: 'card' },
      cardTitle('fuel', 'Гориво'),
      h('div', { class: 'grid2' }, Object.entries(st.fuel).map(([t, f]) =>
        stat(FUEL_TYPES[t]?.label || t, f.per100 ? `${fmtNum1(f.per100)} ${FUEL_TYPES[t]?.unit}` : money(f.amount),
          { icon: t === 'electric' ? 'bolt' : 'fuel', color: 'var(--c-orange)', sub: f.per100 ? `на 100 км, ${money(f.amount)} общо` : 'въведи количество за разход на 100 км' })))),

    timeCard(tiAll, usePeriod),
    recordsCard(rec, admin));
}

function stackBar(items, total) {
  const list = items.filter((x) => x.value > 0);
  if (!total || !list.length) return null;
  return h('div', null,
    h('div', { class: 'stack-bar' }, list.map((x) => h('span', { style: { width: `${(x.value / total) * 100}%`, background: x.color } }))),
    h('div', { class: 'legend', style: { marginBottom: '14px' } }, list.map((x) => h('span', null, h('i', { style: { background: x.color } }), `${x.label} ${Math.round((x.value / total) * 100)}%`))));
}

// Кога се печели най-много
function timeCard(ti, forPeriod) {
  if (!ti.hasData) return null;
  const wdMax = Math.max(...ti.byWeekday.map((x) => x.rate || 0));
  const bestWd = ti.byWeekday.reduce((a, b) => ((b.rate || 0) > (a.rate || 0) ? b : a));
  const hMax = Math.max(...ti.byHour.map((x) => x.rate || 0));
  const bestH = ti.byHour.reduce((a, b) => ((b.rate || 0) > (a.rate || 0) ? b : a));
  return h('section', { class: 'card' },
    cardTitle('clock', 'Кога се печели най-много'),
    h('p', { class: 'muted small', style: { marginBottom: '12px' } }, `Среден приход на час${forPeriod ? ' за периода' : ' за цялото време'}. Средно ${money(ti.avg)} на час.`),
    h('div', null, ti.top.map((w, i) => h('div', { class: 'win' },
      h('span', { class: 'win-rank' }, i + 1),
      h('div', { class: 'grow' },
        h('div', { style: { fontWeight: 700 } }, `${WD_LONG[w.wd][0].toUpperCase() + WD_LONG[w.wd].slice(1)}, ${w.from}:00 – ${w.to}:00`),
        h('div', { class: 'muted small' }, `${Math.round((w.rate / ti.avg - 1) * 100)}% над средното`)),
      h('b', null, `${money(w.rate)}/ч`)))),
    h('h3', { style: { margin: '20px 0 10px', fontSize: '.92rem' } }, 'По дни от седмицата'),
    h('div', { class: 'wd-bars' }, ti.byWeekday.map((x) => h('div', { class: cx('wd-row', x === bestWd && 'best') },
      h('span', null, WD_SHORT[x.wd]),
      h('div', { class: 'wd-track' }, h('div', { class: 'wd-fill', style: { width: x.rate ? `${(x.rate / wdMax) * 100}%` : '0' } })),
      h('b', null, x.rate ? `${money(x.rate)}/ч` : '—')))),
    h('h3', { style: { margin: '20px 0 10px', fontSize: '.92rem' } }, `По часове (най-добре ${bestH.hour}:00 – ${bestH.hour + 1}:00)`),
    h('div', { class: 'hours', role: 'img', 'aria-label': 'Приход на час по часове от денонощието' }, ti.byHour.map((x) =>
      h('span', { class: cx(!x.rate && 'none', x === bestH && 'best'), style: { height: x.rate ? `${Math.max(6, (x.rate / hMax) * 100)}%` : '4%' }, title: x.rate ? `${x.hour}:00 – ${money(x.rate)}/ч` : `${x.hour}:00 – няма данни` }))),
    h('div', { class: 'hours-axis' }, ['0:00', '6:00', '12:00', '18:00'].map((t) => h('span', null, t))),
    ti.worst && h('p', { class: 'muted small', style: { marginTop: '12px' } }, `Най-слабо: ${WD_LONG[ti.worst.wd]} ${ti.worst.from}:00 – ${ti.worst.to}:00, около ${money(ti.worst.rate)}/ч.`));
}

function recordsCard(rec, admin) {
  if (!rec.totalShifts) return null;
  const shiftDet = (s) => `${fmtDate(shiftDate(s), { year: true })}, ${fmtTime(s.start)} – ${fmtTime(s.end)}. Приход ${money(shiftIncome(s))}, разходи ${money(shiftExpenses(s))}, ${fmtDuration(shiftHours(s))}, ${shiftKm(s)} км, ${money2(shiftProfit(s) / Math.max(shiftHours(s), 0.1))}/ч.`;
  const row = (ic, color, title, value, det, shift) => h(shift && !admin ? 'a' : 'div', { class: 'rec', href: shift && !admin ? '#/shift/' + shift.id : null, style: { '--rc': color } },
    h('div', { class: 'rec-ic' }, icon(ic, 20)),
    h('div', { class: 'grow' }, h('div', { class: 'rec-title' }, h('span', null, title), h('b', null, value)), det && h('div', { class: 'rec-det' }, det)));
  const m = rec.bestMonth && parseDate(rec.bestMonth.month + '-01');
  return h('section', { class: 'card' },
    cardTitle('trophy', 'Рекорди'),
    h('p', { class: 'muted small', style: { marginBottom: '4px' } }, '„Печалба от смяна“ е приходът минус разходите по време на смяната (гориво, миене и т.н.), без постоянните разходи. Седмица и месец са чисто, след всички разходи.'),
    rec.bestShift && row('trophy', 'var(--c-amber)', 'Най-добра смяна (печалба)', money(rec.bestShift.value), shiftDet(rec.bestShift.shift), rec.bestShift.shift),
    rec.bestIncome && row('coins', 'var(--c-green)', 'Най-голям приход за смяна', money(rec.bestIncome.value), shiftDet(rec.bestIncome.shift), rec.bestIncome.shift),
    rec.bestRate && row('clock', 'var(--c-blue)', 'Най-добре на час', `${money2(rec.bestRate.value)}/ч`, shiftDet(rec.bestRate.shift), rec.bestRate.shift),
    rec.mostKm && row('gauge', 'var(--c-orange)', 'Най-много километри', `${fmtNum(rec.mostKm.value)} км`, shiftDet(rec.mostKm.shift), rec.mostKm.shift),
    rec.longest && row('clock', 'var(--c-slate)', 'Най-дълга смяна', fmtDuration(rec.longest.value), shiftDet(rec.longest.shift), rec.longest.shift),
    rec.bestWeek && row('calendar', 'var(--c-teal)', 'Най-добра седмица (чисто)', money(rec.bestWeek.value), `${fmtDate(rec.bestWeek.from)} – ${fmtDate(addDays(rec.bestWeek.from, 6), { year: true })}. ${rec.bestWeek.st.shifts} смени, приход ${money(rec.bestWeek.st.income)}, ${fmtDuration(rec.bestWeek.st.hours)}.`),
    rec.bestMonth && row('calendar', 'var(--c-violet)', 'Най-добър месец (чисто)', money(rec.bestMonth.value), `${MONTHS[m.getMonth()]} ${m.getFullYear()}. ${rec.bestMonth.st.shifts} смени, приход ${money(rec.bestMonth.st.income)}, разходи ${money(rec.bestMonth.st.totalExp)}.`),
    row('flame', 'var(--c-red)', 'Поредни работни дни', `${rec.current}`, `Рекорд: ${rec.longestRun} дни поред. Общо ${rec.workedDays} работни дни, ${fmtNum(rec.totals.km)} км и ${fmtNum(rec.totals.hours)} часа зад волана.`));
}

// Excel: CSV с ; и запетая за десетични (както го отваря Excel на български)
export function exportCsv(data, r) {
  const n = (v) => String(Math.round(v * 100) / 100).replace('.', ',');
  const rows = [['Дата', 'Начало', 'Край', 'Часове', 'Км', 'Кеш', 'Карта', 'Приложения', 'Бакшиш', 'Приход', 'Разходи', 'Печалба от смяната', 'Бележка']];
  const list = data.shifts.filter((s) => s.end && shiftDate(s) >= r.from && shiftDate(s) <= r.to).sort((a, b) => a.start.localeCompare(b.start));
  for (const s of list) {
    rows.push([shiftDate(s), fmtTime(s.start), fmtTime(s.end), n(shiftHours(s)), shiftKm(s),
      n(s.income.cash), n(s.income.card), n(s.income.app), n(s.income.tips), n(shiftIncome(s)), n(shiftExpenses(s)), n(shiftIncome(s) - shiftExpenses(s)), (s.note || '').replace(/[;\n]/g, ' ')]);
  }
  const st = periodStats(data, r.from, r.to);
  rows.push([], ['Постоянни разходи за периода', n(st.fixedExp)], ['Чиста печалба', n(st.net)]);
  const csv = '﻿' + rows.map((x) => x.join(';')).join('\r\n');
  const a = h('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: `profitaxi-${r.from}-${r.to}.csv` });
  document.body.appendChild(a); a.click(); a.remove();
}
export { MONTHS_SHORT, minStr };
