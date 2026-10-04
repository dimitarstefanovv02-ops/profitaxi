// Начален екран: печалба за месеца, пътят към целта, смяна с едно натискане

import { h, icon, cx, money, todayStr, fmtDateLong, fmtTimer, MONTHS, parseDate, fmtTime, fmtDuration, startOfWeek } from '../util.js';
import * as store from '../store.js';
import { goalProgress, periodStats, shiftIncome, shiftProfit, shiftHours, upcomingReminders, shiftNetAfterFixed, shiftDate, shiftKm } from '../calc.js';
import { roadProgress, openNumpad, stat, tone, toast } from '../ui.js';

export function homeView({ go, user, data }) {
  const today = todayStr();
  const g = goalProgress(data);
  const workedToday = data.shifts.some((s) => shiftDate(s) === today);
  const todaySt = workedToday ? periodStats(data, today, today) : periodStats(data, startOfWeek(today), today);
  const active = data.shifts.find((s) => !s.end);
  const reminders = upcomingReminders(data).filter((r) => r.urgent);
  const trial = store.trialDaysLeft(user);
  const month = MONTHS[parseDate(today).getMonth()];
  const initials = user.name.split(' ').map((x) => x[0]).slice(0, 2).join('');

  const startShift = () => openNumpad({
    title: 'Започваш смяна', sub: 'Километраж от таблото',
    fields: [{ key: 'km', label: 'Начален километраж', value: store.lastKm() || '', unit: 'км', decimals: 0 }],
    actions: [{ label: 'Старт', primary: true, run: ({ km }) => { store.startShift(km); toast('Смяната започна'); } }],
  });

  const recent = data.shifts.filter((s) => s.end).slice(0, 3);

  return h('div', { class: 'screen' },
    h('div', { class: 'hello' },
      h('div', null,
        h('h1', null, `Здравей, ${user.name.split(' ')[0]}`),
        h('div', { class: 'date' }, fmtDateLong(today))),
      h('a', { class: 'avatar', href: '#/profile', 'aria-label': 'Профил' }, initials)),

    trial != null && h('div', { class: 'trial' }, icon('clock', 18),
      h('span', { class: 'grow' }, trial > 0 ? `Пробен период: остават ${trial} ${trial === 1 ? 'ден' : 'дни'}` : 'Пробният период изтича днес')),

    // Таксиметърът: печалба за месеца и пътят към целта
    h('section', { class: 'meter', 'aria-label': 'Печалба за месеца' },
      h('div', { class: 'meter-label' }, h('span', null, `Чисто за ${month}`), g.goal > 0 && h('span', null, `${Math.max(0, Math.round(g.pct * 100))}%`)),
      h('div', { class: cx('meter-value', g.net < 0 && 'neg') }, money(g.net)),
      g.goal > 0
        ? h('div', { class: 'meter-goal' }, g.done ? h('span', null, 'Целта е постигната. Браво!') : h('span', null, 'Остават ', h('b', null, money(g.remaining)), ` до ${money(g.goal)}`))
        : h('a', { class: 'meter-goal', href: '#/profile' }, 'Задай цел за месеца'),
      g.goal > 0 && roadProgress(g.pct),
      g.goal > 0 && !g.done && g.remainingDays > 0 && h('div', { class: 'meter-foot' },
        h('span', null, 'Прогноза ', h('b', null, money(g.forecast))),
        h('span', null, `~${money(g.needPerShift)} на смяна`))),

    // Смяна
    active ? liveShift(active, go) : h('button', { class: 'btn btn-primary btn-xl shift-cta', onclick: startShift }, icon('play', 22), 'Започвам смяна'),
    !active && h('button', { class: 'btn btn-ghost btn-block', style: { marginTop: '8px' }, onclick: () => go('/shift/new') }, icon('plus', 18), 'Въведи минала смяна'),

    // Напомняния
    reminders.slice(0, 2).map((r) => h('a', { class: cx('alert', ((r.daysLeft ?? 99) < 0 || (r.kmLeft ?? 1) < 0) && 'bad'), href: '#/costs' },
      icon('bell', 22),
      h('div', { class: 'alert-text' }, h('b', null, r.title), reminderText(r)),
      icon('right', 18))),

    // Днес
    h('h2', { class: 'section-title' }, workedToday ? 'Днес' : 'Тази седмица'),
    h('div', { class: 'grid3' },
      stat('Чисто', money(todaySt.net), { tone: tone(todaySt.net) }),
      stat('€ / час', money(todaySt.netPerHour, 1)),
      stat('€ / км', money(todaySt.netPerKm, 2))),

    // Последни смени
    recent.length > 0 && h('div', { class: 'card', style: { marginTop: '14px' } },
      h('div', { class: 'card-title' }, h('h3', null, 'Последни смени'), h('a', { class: 'link', href: '#/shifts' }, 'Всички', icon('right', 16))),
      recent.map((s) => shiftRow(data, s))));
}

function liveShift(s, go) {
  const inc = shiftIncome(s), exp = s.expenses.reduce((a, e) => a + e.amount, 0);
  return h('section', { class: 'live', 'aria-label': 'Текуща смяна' },
    h('div', { class: 'live-top' },
      h('span', { class: 'row gap small muted' }, h('span', { class: 'live-dot' }), `На смяна от ${fmtTime(s.start)}`),
      h('button', { class: 'chip', onclick: () => go('/shift/' + s.id) }, icon('edit', 14), 'Отчет')),
    h('div', { class: 'timer', 'data-timer': s.start }, fmtTimer(Date.now() - new Date(s.start))),
    h('div', { class: 'grid2' },
      stat('Приход', money(inc)),
      stat('Разходи', money(exp))),
    h('button', { class: 'btn btn-dark btn-xl', style: { marginTop: '12px' }, onclick: () => go('/shift/' + s.id + '?end=1') }, icon('stop', 20), 'Приключих'));
}

export function reminderText(r) {
  const parts = [];
  if (r.daysLeft != null) parts.push(r.daysLeft < 0 ? `изтекло преди ${-r.daysLeft} дни` : r.daysLeft === 0 ? 'изтича днес' : `след ${r.daysLeft} ${r.daysLeft === 1 ? 'ден' : 'дни'}`);
  if (r.kmLeft != null) parts.push(r.kmLeft < 0 ? `просрочено с ${Math.abs(r.kmLeft).toLocaleString('bg-BG')} км` : `след ${r.kmLeft.toLocaleString('bg-BG')} км`);
  return parts.join(', ');
}

export function shiftRow(data, s) {
  const d = parseDate(shiftDate(s));
  const net = shiftNetAfterFixed(data, s);
  return h('a', { class: 'shift-row', href: '#/shift/' + s.id },
    h('div', { class: 'day-badge' }, h('b', null, d.getDate()), h('span', null, ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][d.getDay()])),
    h('div', null,
      h('div', { style: { fontWeight: 600 } }, `${fmtTime(s.start)} – ${s.end ? fmtTime(s.end) : '…'}`),
      h('div', { class: 'shift-meta' },
        h('span', null, fmtDuration(shiftHours(s))),
        shiftKm(s) > 0 && h('span', null, `${shiftKm(s)} км`),
        h('span', null, `приход ${money(shiftIncome(s))}`))),
    h('div', { class: 'shift-amt' }, h('b', { class: tone(net) }, money(net)), h('span', null, 'чисто')));
}
export { shiftProfit };
