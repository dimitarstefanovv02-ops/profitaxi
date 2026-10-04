// Начален екран: мотивиращо съобщение, таксиметърът с целта, смяна с едно
// натискане, седмицата, най-добрите часове за днес, напомняния, последни смени

import { h, icon, cx, money, money2, todayStr, addDays, fmtDateLong, fmtTimer, MONTHS, WD_SHORT, parseDate, fmtTime, fmtDuration, startOfWeek, fmtNum, weekdayIdx } from '../util.js';
import * as store from '../store.js';
import { goalProgress, periodStats, shiftIncome, shiftExpenses, shiftHours, upcomingReminders, shiftNetAfterFixed, shiftDate, shiftKm, weekStrip, timeInsights, records } from '../calc.js';
import { roadProgress, openNumpad, stat, tone, toast, cardTitle } from '../ui.js';
import { quoteFor } from '../quotes.js';

let quoteSeed = 0;
const WD_LONG = ['понеделник', 'вторник', 'сряда', 'четвъртък', 'петък', 'събота', 'неделя'];

export function homeView({ go, user, data }) {
  const today = todayStr();
  const g = goalProgress(data);
  const active = data.shifts.find((s) => !s.end);
  const reminders = upcomingReminders(data).filter((r) => r.urgent);
  const trial = store.trialDaysLeft(user);
  const month = MONTHS[parseDate(today).getMonth()];
  const initials = user.name.split(' ').map((x) => x[0]).slice(0, 2).join('');
  const workedToday = data.shifts.some((s) => shiftDate(s) === today);
  const rec = records(data);
  const ti = timeInsights(data.shifts);

  const startShift = () => openNumpad({
    title: 'Започваш смяна', sub: 'Километраж от таблото',
    fields: [{ key: 'km', label: 'Начален километраж', value: store.lastKm() || '', unit: 'км', decimals: 0 }],
    actions: [{ label: 'Старт', primary: true, run: ({ km }) => { store.startShift(km); toast('Смяната започна. Успешен път!'); } }],
  });

  // Мотивиращо съобщение – натискане го сменя
  const qText = h('div', { class: 'quote-text' });
  const setQuote = () => { qText.textContent = quoteFor({ goal: g, streak: rec.current, worked: workedToday }, quoteSeed); };
  setQuote();
  const quote = h('button', { class: 'quote', onclick: () => { quoteSeed++; setQuote(); } },
    h('span', { class: 'quote-ic' }, icon('flame', 19)),
    h('div', null, qText, h('div', { class: 'quote-more' }, 'Натисни за друго')));

  const recent = data.shifts.filter((s) => s.end).slice(0, 3);

  return h('div', { class: 'screen', 'data-page': 'home' },
    h('div', { class: 'hello' },
      h('div', null,
        h('h1', null, `${greeting()}, ${user.name.split(' ')[0]}`),
        h('div', { class: 'date' }, fmtDateLong(today))),
      h('a', { class: 'avatar', href: '#/profile', 'aria-label': 'Профил' }, initials)),

    trial != null && h('div', { class: 'trial' }, icon('clock', 18),
      h('span', { class: 'grow' }, trial > 0 ? `Пробен период: остават ${trial} ${trial === 1 ? 'ден' : 'дни'}` : 'Пробният период изтича днес')),

    quote,

    meter(g, month),

    // Смяна
    active ? liveShift(active, go) : h('button', { class: 'btn btn-primary btn-xl shift-cta', onclick: startShift }, icon('play', 22), 'Започвам смяна'),
    !active && h('button', { class: 'btn btn-ghost btn-block', style: { marginTop: '8px' }, onclick: () => go('/shift/new') }, icon('plus', 18), 'Въведи минала смяна'),

    // Напомняния
    reminders.slice(0, 2).map((r) => h('a', { class: cx('alert', ((r.daysLeft ?? 99) < 0 || (r.kmLeft ?? 1) < 0) && 'bad'), href: '#/costs' },
      icon('bell', 22),
      h('div', { class: 'alert-text' }, h('b', null, r.title), reminderText(r)),
      icon('right', 18))),

    // Тази седмица
    weekCard(data),

    // Най-добрите часове за днес
    ti.hasData && bestToday(ti),

    // Месецът накратко
    h('h2', { class: 'section-title' }, `${month[0].toUpperCase() + month.slice(1)} накратко`),
    h('div', { class: 'grid2' },
      stat('На час', money2(g.stats.netPerHour), { icon: 'clock', color: 'var(--c-blue)', cls: 'stat-card', sub: 'чисто' }),
      stat('На км', money2(g.stats.netPerKm), { icon: 'road', color: 'var(--c-teal)', cls: 'stat-card', sub: 'чисто' }),
      stat('Смени', String(g.stats.shifts), { icon: 'calendar', color: 'var(--c-violet)', cls: 'stat-card', sub: `${fmtDuration(g.stats.hours)} общо` }),
      stat('Километри', fmtNum(g.stats.km), { icon: 'gauge', color: 'var(--c-orange)', cls: 'stat-card', sub: g.stats.shifts ? `~${fmtNum(g.stats.km / g.stats.shifts)} на смяна` : '' })),

    // Серия
    rec.current >= 2 && h('div', { class: 'card tip', style: { marginTop: '14px' } },
      h('div', { class: 'tip-ic', style: { background: 'color-mix(in srgb, var(--c-red) 15%, var(--surface))', color: 'var(--c-red)' } }, icon('flame', 22)),
      h('div', { class: 'grow' }, h('b', null, `${rec.current} поредни дни на смяна`), h('span', { class: 'muted small' }, rec.current >= rec.longestRun ? 'Това е новият ти рекорд!' : `Рекордът ти е ${rec.longestRun}. Още ${rec.longestRun - rec.current + 1} за нов.`))),

    // Последни смени
    recent.length > 0 && h('div', { class: 'card', style: { marginTop: '14px' } },
      cardTitle('list', 'Последни смени', h('a', { class: 'link', href: '#/shifts' }, 'Всички', icon('right', 16))),
      recent.map((s) => shiftRow(data, s))));
}

function greeting() {
  const hr = new Date().getHours();
  return hr < 5 ? 'Лека нощ' : hr < 11 ? 'Добро утро' : hr < 18 ? 'Здравей' : 'Добър вечер';
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
    g.goal > 0 && !g.done && h('div', { class: 'meter-grid' },
      h('div', { class: 'meter-cell' }, h('span', null, 'Още работа'), h('b', { class: 'hl' }, hours != null ? `~${Math.ceil(hours)} ч` : '—')),
      h('div', { class: 'meter-cell' }, h('span', null, 'Смени'), h('b', null, g.shiftsNeeded != null ? `~${g.shiftsNeeded}` : '—')),
      h('div', { class: 'meter-cell' }, h('span', null, 'Прогноза'), h('b', null, money(g.forecast)))),
    g.goal > 0 && !g.done && hours == null && h('div', { class: 'meter-note' }, icon('clock', 14), h('span', null, 'Колко часа и смени остават до целта ще сметнем след първата ти смяна.')),
    g.goal > 0 && !g.done && hours != null && h('div', { class: 'meter-note' }, icon('alert', 14),
      h('span', null, `Сметнато по ${money2(g.ratePerHour)} на час печалба от смяна. Включени са и постоянните разходи до края на месеца (${money(g.fixedLeft)}).`)));
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
