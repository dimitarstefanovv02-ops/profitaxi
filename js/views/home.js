// Начален екран: таксиметърът с целта, смяна с едно натискане, календар и
// резервации, седмицата, най-добрите часове за днес, напомняния, последни смени

import { h, icon, cx, money, money2, todayStr, addDays, fmtDateLong, fmtTimer, MONTHS, WD_SHORT, parseDate, fmtTime, fmtDuration, startOfWeek, fmtNum, weekdayIdx } from '../util.js';
import * as store from '../store.js';
import { goalProgress, periodStats, shiftIncome, shiftExpenses, shiftHours, upcomingReminders, shiftNetAfterFixed, shiftDate, shiftKm, weekStrip, timeInsights, records } from '../calc.js';
import { roadProgress, openNumpad, stat, tone, toast, cardTitle, themeToggle, more } from '../ui.js';
import { upcomingReservations, reservationRow, editReservation, whenLabel, mapsUrl } from './reservations.js';

const WD_LONG = ['понеделник', 'вторник', 'сряда', 'четвъртък', 'петък', 'събота', 'неделя'];

export function homeView({ go, user, data }) {
  const today = todayStr();
  const g = goalProgress(data);
  const active = data.shifts.find((s) => !s.end);
  const reminders = upcomingReminders(data).filter((r) => r.urgent);
  const trial = store.trialDaysLeft(user);
  const month = MONTHS[parseDate(today).getMonth()];
  const initials = user.name.split(' ').map((x) => x[0]).slice(0, 2).join('');
  const rec = records(data);
  const ti = timeInsights(data.shifts);

  const startShift = () => openNumpad({
    title: 'Започваш смяна', sub: 'Километраж от таблото',
    fields: [{ key: 'km', label: 'Начален километраж', value: store.lastKm() || '', unit: 'км', decimals: 0 }],
    actions: [{ label: 'Старт', primary: true, run: ({ km }) => { store.startShift(km); toast('Смяната започна. Успешен път!'); } }],
  });

  const recent = data.shifts.filter((s) => s.end).slice(0, 3);
  const resCount = upcomingReservations(data.reservations || []).length;

  return h('div', { class: 'screen', 'data-page': 'home' },
    h('div', { class: 'hello' },
      h('div', null,
        h('h1', null, `${greeting()}, ${user.name.split(' ')[0]}`),
        h('div', { class: 'date' }, fmtDateLong(today))),
      h('div', { class: 'row gap' }, themeToggle(),
        data.profile.photo ? h('a', { class: 'avatar has-photo', href: '#/profile', 'aria-label': 'Профил' }, h('img', { src: data.profile.photo, alt: '' })) : h('a', { class: 'avatar', href: '#/profile', 'aria-label': 'Профил' }, initials))),

    trial != null && h('div', { class: 'trial' }, icon('clock', 18),
      h('span', { class: 'grow' }, trial > 0 ? `Пробен период: остават ${trial} ${trial === 1 ? 'ден' : 'дни'}` : 'Пробният период изтича днес')),

    // 1. Колко ти остава този месец (първия ден – какво да направи)
    data.shifts.length ? meter(g, month) : firstDay(),

    // 2. Главното действие: смяната
    active ? liveShift(active, go) : h('button', { class: 'btn btn-primary btn-xl shift-cta', onclick: startShift }, icon('play', 22), 'Започни смяна'),
    !active && h('button', { class: 'btn btn-ghost btn-block', style: { marginTop: '8px' }, onclick: () => go('/shift/new') }, icon('plus', 18), 'Въведи минала смяна'),

    // 3. Календар и лични резервации – с едно натискане
    h('div', { class: 'home-links' },
      h('a', { class: 'home-link', href: '#/calendar' }, h('span', { class: 'hl-ic' }, icon('calendar', 22)), h('span', null, h('b', null, 'Календар'), h('small', null, 'Всичко по дни'))),
      h('a', { class: 'home-link', href: '#/reservations' }, h('span', { class: 'hl-ic' }, icon('route', 22)), h('span', null, h('b', null, 'Резервации'), h('small', null, resCount ? `${resCount} предстоящи` : 'Запиши курс')))),

    // 4. Какво следва: курс и плащане с бутоните за тях
    nextUp(data, go),

    // Всичко останало – на едно натискане
    more('Покажи повече: седмицата, часовете, последните смени',
      weekCard(data),
      ti.hasData && bestToday(ti),
      h('div', { class: 'grid2', style: { marginTop: '14px' } },
        stat('На час', money2(g.stats.netPerHour), { icon: 'clock', cls: 'stat-card', sub: 'чисто' }),
        stat('На км', money2(g.stats.netPerKm), { icon: 'road', cls: 'stat-card', sub: 'чисто' }),
        stat('Смени', String(g.stats.shifts), { icon: 'calendar', cls: 'stat-card', sub: `${fmtDuration(g.stats.hours)} общо` }),
        stat('Километри', fmtNum(g.stats.km), { icon: 'gauge', cls: 'stat-card', sub: g.stats.shifts ? `~${fmtNum(g.stats.km / g.stats.shifts)} на смяна` : '' })),
      rec.current >= 2 && h('div', { class: 'card tip', style: { marginTop: '14px' } },
        h('div', { class: 'tip-ic' }, icon('flame', 22)),
        h('div', { class: 'grow' }, h('b', null, `${rec.current} поредни дни на смяна`), h('span', { class: 'muted small' }, rec.current >= rec.longestRun ? 'Това е новият ти рекорд!' : `Рекордът ти е ${rec.longestRun}. Още ${rec.longestRun - rec.current + 1} за нов.`))),
      recent.length > 0 && h('div', { class: 'card', style: { marginTop: '14px' } },
        cardTitle('list', 'Последни смени', h('a', { class: 'link', href: '#/shifts' }, 'Всички', icon('right', 16))),
        recent.slice(0, 3).map((s) => shiftRow(data, s)))));
}

// „Следващо“: най-близкият курс и най-спешното плащане (просрочените са първи)
function nextUp(data, go) {
  const res = upcomingReservations(data.reservations || []);
  const pays = upcomingReminders(data, 14).filter((r) => r.daysLeft != null || (r.kmLeft != null && r.kmLeft <= 0))
    .sort((a, b) => (a.daysLeft ?? -1) - (b.daysLeft ?? -1));
  const r = res[0], p = pays[0];
  const late = p && ((p.daysLeft ?? 0) < 0 || (p.kmLeft ?? 1) <= 0);
  return h('section', { class: 'card next', 'aria-label': 'Следващо' },
    cardTitle('calendar', 'Следващо', h('a', { class: 'link', href: '#/calendar' }, 'Календар', icon('right', 16))),
    r ? h('div', { class: 'next-item' },
      h('div', { class: 'next-when' }, h('b', null, r.time), h('span', null, whenLabel(r))),
      h('div', { class: 'grow', style: { minWidth: 0 } },
        h('b', { class: 'next-title' }, r.client || 'Резервация', r.price ? h('span', { class: 'muted' }, ` · ${money(r.price)}`) : null),
        h('span', { class: 'next-sub' }, `${r.from} → ${r.to}`),
        h('div', { class: 'next-actions' },
          r.phone && h('a', { class: 'btn btn-ghost btn-sm', href: 'tel:' + r.phone.replace(/\s/g, '') }, icon('call', 16), 'Обади се'),
          h('a', { class: 'btn btn-ghost btn-sm', href: mapsUrl(r), target: '_blank', rel: 'noopener' }, icon('route', 16), 'Маршрут'),
          h('button', { class: 'btn btn-ghost btn-sm', onclick: () => editReservation(r) }, 'Отвори'))))
      : h('button', { class: 'next-empty', onclick: () => editReservation({}) }, icon('plus', 18), 'Няма предстоящи курсове. Запиши резервация'),
    p && h('div', { class: cx('next-item', 'pay', late && 'late') },
      h('div', { class: 'next-when' }, icon(late ? 'alert' : 'bell', 20)),
      h('div', { class: 'grow', style: { minWidth: 0 } },
        h('b', { class: 'next-title' }, p.title),
        h('span', { class: 'next-sub' }, reminderText(p)),
        pays.length > 1 && h('span', { class: 'next-sub' }, `+${pays.length - 1} още в следващите 2 седмици`)),
      p.kind === 'cost' ? h('button', { class: 'btn btn-primary btn-sm', onclick: () => { store.markCostPaid(p.ref.id); toast('Отбелязано като платено'); } }, icon('check', 16), 'Платено')
        : h('button', { class: 'btn btn-ghost btn-sm', onclick: () => go('/costs') }, 'Отвори')));
}

function reservationsCard(data) {
  const up = upcomingReservations(data.reservations || []).slice(0, 3);
  return h('div', { class: 'card', style: { marginTop: '14px' } },
    cardTitle('calendar', 'Предстоящи резервации', h('a', { class: 'link', href: '#/reservations' }, up.length ? 'Всички' : 'Отвори', icon('right', 16))),
    up.length ? up.map((r) => reservationRow(r, { compact: true }))
      : h('button', { class: 'btn btn-ghost btn-block', onclick: () => editReservation({}) }, icon('plus', 18), 'Запиши лична резервация'));
}

function greeting() {
  const hr = new Date().getHours();
  return hr >= 5 && hr < 11 ? 'Добро утро' : hr >= 11 && hr < 18 ? 'Добър ден' : 'Добър вечер';
}

function firstDay() {
  return h('section', { class: 'first-day', 'aria-label': 'Първи стъпки' },
    h('div', { class: 'fd-ic' }, icon('flame', 26)),
    h('h2', null, 'Добре дошъл в ProfiTaxi!'),
    h('p', null, 'Запиши първата си смяна и тук ще видиш колко ти остава чисто.'),
    h('ol', { class: 'fd-steps' },
      h('li', null, 'Натисни „Започни смяна“ отдолу'),
      h('li', null, 'В края въведи кеш, карта и гориво'),
      h('li', null, 'Виж колко ти остава за деня и месеца')));
}

function meter(g, month) {
  const hours = g.hoursNeeded;
  return h('section', { class: 'meter', 'aria-label': 'Печалба за месеца' },
    h('div', { class: 'meter-label' }, h('span', null, `Чисто за ${month}`), g.goal > 0 && h('span', { class: 'meter-pct' }, `${Math.max(0, Math.round(g.pct * 100))}%`)),
    h('div', { class: cx('meter-value', g.net < 0 && 'neg') }, money(g.net)),
    g.goal > 0
      ? h('div', { class: 'meter-goal' }, g.done ? h('span', null, `Целта от ${money(g.goal)} е постигната. Браво!`) : h('span', null, 'Остават ', h('b', null, money(g.remaining)), ` до ${money(g.goal)}`))
      : h('a', { class: 'meter-goal', href: '#/profile' }, 'Задай цел за месеца'),
    g.goal > 0 && roadProgress(g.pct),
    g.goal > 0 && !g.done && hours != null && h('div', { class: 'meter-hours' }, icon('clock', 16), h('span', null, 'Още около ', h('b', null, `${Math.ceil(hours)} ч`), ' работа до целта')),
    g.goal > 0 && !g.done && hours == null && h('div', { class: 'meter-note' }, icon('clock', 14), h('span', null, 'Колко часа остават до целта ще сметнем след първата ти смяна.')),
    g.goal > 0 && !g.done && hours != null && h('details', { class: 'meter-more' },
      h('summary', null, 'Подробности', icon('down', 16)),
      h('div', { class: 'meter-grid' },
        h('div', { class: 'meter-cell' }, h('span', null, 'Смени'), h('b', null, g.shiftsNeeded != null ? `~${g.shiftsNeeded}` : '—')),
        h('div', { class: 'meter-cell' }, h('span', null, 'Прогноза'), h('b', null, money(g.forecast))),
        h('div', { class: 'meter-cell' }, h('span', null, 'На час'), h('b', null, money2(g.ratePerHour)))),
      h('div', { class: 'meter-note' }, icon('alert', 14),
        h('span', null, `Наемът, ефирът и другите месечни разходи (${money(g.monthFixed)}) са извадени изцяло. Часовете са по ${money2(g.ratePerHour)} на час от смените.`))));
}

function weekCard(data) {
  const today = todayStr();
  const pts = weekStrip(data);
  const thisW = periodStats(data, startOfWeek(today), today);
  const lastFrom = addDays(startOfWeek(today), -7);
  const lastW = periodStats(data, lastFrom, addDays(lastFrom, weekdayIdx(today)));
  const max = Math.max(1, ...pts.map((p) => Math.abs(p.net)));
  const diff = lastW.net ? (thisW.net - lastW.net) / Math.abs(lastW.net) : null;
  return h('div', { class: 'card', style: { marginTop: '14px' } },
    cardTitle('calendar', 'Тази седмица', h('b', { class: cx('num', tone(thisW.net)) }, money(thisW.net))),
    h('div', { class: 'week' }, pts.map((p, i) => h('div', { class: cx('week-day', p.key === today && 'today'), title: `${WD_SHORT[i]}: ${money(p.net)}` },
      h('div', { class: cx('week-bar', p.future ? '' : p.worked ? (p.net >= 0 ? 'pos' : 'neg') : '', p.key === today && 'today'), style: { height: p.future ? '6px' : `${Math.max(6, (Math.abs(p.net) / max) * 80)}px` } }),
      h('span', null, WD_SHORT[i])))),
    h('div', { class: 'week-foot' },
      h('span', { class: 'muted' }, `${thisW.shifts} ${thisW.shifts === 1 ? 'смяна' : 'смени'}, ${fmtDuration(thisW.hours)}`),
      diff != null && h('span', { class: cx('trend', diff >= 0 ? 'up' : 'down') }, `${diff >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(diff * 100))}% от миналата`)));
}

function bestToday(ti) {
  const wd = weekdayIdx(todayStr());
  // най-добрият прозорец за днешния ден от седмицата
  const best = ti.top.find((w) => w.wd === wd) || null;
  const dayRate = ti.byWeekday[wd]?.rate;
  const ranked = [...ti.byWeekday].filter((x) => x.rate).sort((a, b) => b.rate - a.rate);
  const pos = ranked.findIndex((x) => x.wd === wd) + 1;
  const text = best
    ? `Най-силно ти върви ${WD_LONG[wd]} между ${best.from}:00 и ${best.to}:00, около ${money(best.rate)} на час.`
    : dayRate
      ? `${WD_LONG[wd][0].toUpperCase() + WD_LONG[wd].slice(1)} ти носи средно ${money(dayRate)} на час. ${pos ? `Това е ${pos}. най-добър ден от седмицата.` : ''}`
      : 'Още събираме данни за този ден от седмицата.';
  return h('a', { class: 'card tip', href: '#/stats', style: { marginTop: '14px', textDecoration: 'none' } },
    h('div', { class: 'tip-ic' }, icon('clock', 22)),
    h('div', { class: 'grow' }, h('b', null, 'Днес е добре да караш'), h('span', { class: 'muted small' }, text)),
    icon('right', 18));
}

function liveShift(s, go) {
  const inc = shiftIncome(s), exp = shiftExpenses(s);
  return h('section', { class: 'live', 'aria-label': 'Текуща смяна' },
    h('div', { class: 'live-top' },
      h('span', { class: 'row gap small muted' }, h('span', { class: 'live-dot' }), `На смяна от ${fmtTime(s.start)}`),
      h('button', { class: 'chip', onclick: () => go('/shift/' + s.id) }, icon('edit', 14), 'Отчет')),
    h('div', { class: 'timer', 'data-timer': s.start }, fmtTimer(Date.now() - new Date(s.start))),
    h('div', { class: 'grid2' },
      stat('Приход', money(inc), { icon: 'coins', color: 'var(--c-green)' }),
      stat('Разходи', money(exp), { icon: 'fuel', color: 'var(--c-orange)' })),
    h('button', { class: 'btn btn-dark btn-xl', style: { marginTop: '12px' }, onclick: () => go('/shift/' + s.id + '?end=1') }, icon('stop', 20), 'Приключих'));
}

export function reminderText(r) {
  const parts = [];
  if (r.daysLeft != null) parts.push(r.daysLeft < 0 ? `изтекло преди ${-r.daysLeft} дни` : r.daysLeft === 0 ? 'плащане днес' : r.daysLeft === 1 ? 'утре' : `след ${r.daysLeft} дни`);
  if (r.kmLeft != null) parts.push(r.kmLeft < 0 ? `просрочено с ${Math.abs(r.kmLeft).toLocaleString('bg-BG')} км` : `след ${r.kmLeft.toLocaleString('bg-BG')} км`);
  if (r.amount) parts.push(money(r.amount, r.amount % 1 ? 2 : 0));
  return parts.join(', ');
}

export function shiftRow(data, s) {
  const d = parseDate(shiftDate(s));
  const net = shiftNetAfterFixed(data, s);
  const night = new Date(s.start).getHours() >= 16 || new Date(s.start).getHours() < 4;
  return h('a', { class: 'shift-row', href: '#/shift/' + s.id },
    h('div', { class: cx('day-badge', night && 'night') }, h('b', null, d.getDate()), h('span', null, ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][d.getDay()])),
    h('div', { style: { minWidth: 0 } },
      h('div', { style: { fontWeight: 600 } }, `${fmtTime(s.start)} – ${s.end ? fmtTime(s.end) : '…'}`),
      h('div', { class: 'shift-meta' },
        h('span', null, fmtDuration(shiftHours(s))),
        shiftKm(s) > 0 && h('span', null, `${shiftKm(s)} км`),
        h('span', null, `приход ${money(shiftIncome(s))}`))),
    h('div', { class: 'shift-amt' }, h('b', { class: tone(net) }, money(net)), h('span', null, 'чисто')));
}
