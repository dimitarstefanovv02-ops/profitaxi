// Начален екран: таксиметърът с целта, смяна с едно натискане, календар и
// резервации, седмицата, най-добрите часове за днес, напомняния, последни смени

import { h, icon, cx, money, money2, todayStr, addDays, fmtDateLong, fmtTimer, MONTHS, WD_SHORT, parseDate, fmtTime, fmtDuration, startOfWeek, fmtNum, weekdayIdx, round2, uid, fmtDate } from '../util.js';
import * as store from '../store.js';
import { goalProgress, periodStats, shiftIncome, shiftExpenses, shiftHours, upcomingReminders, shiftNetAfterFixed, shiftDate, shiftKm, weekStrip, timeInsights, records } from '../calc.js';
import { roadProgress, openNumpad, stat, tone, toast, cardTitle, more, reveal } from '../ui.js';
import { upcomingReservations, reservationRow, editReservation, whenLabel, mapsUrl, reservationsView } from './reservations.js';
import { calendarView } from './calendar.js';
import { INCOME_TYPES, FUELS, FUEL_TYPES } from '../constants.js';
import { scanReceipt } from '../quick.js';
import { zone } from '../arrange.js';

// Кой панел е отворен на място в „Днес“: календарът или резервациите (като „Покажи повече“)
let openPanel = null;

// Вгражда страница в „Днес“: без отделен екран, без „Назад“ и плаващ бутон
function embedded(el) {
  el.classList.remove('screen'); el.classList.add('embed');
  el.querySelectorAll(':scope > .back, :scope > .sub-back, :scope > .fab').forEach((x) => x.remove());
  return el;
}

const WD_LONG = ['понеделник', 'вторник', 'сряда', 'четвъртък', 'петък', 'събота', 'неделя'];

// Режим „шофирам“: докато смяната тече – само големите бутони. „Покажи всичко“ връща целия екран.
let showAll = false;

// „Добре дошъл“ се показва само при първото влизане: запомняме го веднага,
// а до следващото отваряне на приложението остава на екрана (може и да се затвори с ×)
let introNow = false;

export function homeView({ go, user, data, rerender, route }) {
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

  const togglePanel = (k, scroll) => {
    openPanel = openPanel === k ? null : k;
    if (rerender) rerender(); else go('/home');
    if (openPanel) setTimeout(() => (scroll ? document.getElementById('home-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) : reveal(document.getElementById('home-panel'))), 60);
  };
  const panelBtn = (k, ic, title, sub) => h('button', { class: cx('home-link', openPanel === k && 'on'), 'aria-expanded': String(openPanel === k), onclick: () => togglePanel(k) },
    h('span', { class: 'hl-ic' }, icon(ic, 22)), h('span', { class: 'grow' }, h('b', null, title), h('small', null, sub)), h('span', { class: 'hl-chev' }, icon('down', 18)));
  homeView.openCalendar = () => { if (openPanel !== 'cal') togglePanel('cal', true); };
  // Бързи действия от иконата на телефона (#/home?do=start|fuel|voice)
  const doAct = route?.query?.get('do');
  if (doAct) setTimeout(() => {
    history.replaceState(null, '', location.pathname + '#/home');
    const act = store.getActiveShift();
    if (doAct === 'start' && !act) startShift();
    else if (!act) { toast('Първо започни смяна', 'err'); startShift(); }
    else if (doAct === 'fuel') quickFuel(data.profile);
  }, 350);
  const recent = data.shifts.filter((s) => s.end).slice(0, 3);
  const resCount = upcomingReservations(data.reservations || []).length;
  if (!data.shifts.length && !store.introSeen()) { introNow = true; setTimeout(() => store.markIntroSeen(), 0); }
  const redrawHome = rerender || (() => go('/home'));

  return h('div', { class: 'screen', 'data-page': 'home' },
    h('div', { class: 'hello' },
      h('div', null,
        h('h1', null, `${greeting()}, ${user.name.split(' ')[0]}`),
        h('div', { class: 'date' }, fmtDateLong(today))),
      h('div', { class: 'row gap' },
        data.profile.photo ? h('a', { class: 'avatar has-photo', href: '#/me', 'aria-label': 'Профил' }, h('img', { src: data.profile.photo, alt: '' })) : h('a', { class: 'avatar', href: '#/me', 'aria-label': 'Профил' }, initials))),

    messagesBox(rerender || (() => go('/home'))),
    store.flagOn('nps') && store.npsDue() && npsCard(rerender || (() => go('/home'))),
    trial != null && h('div', { class: 'trial' }, icon('clock', 18),
      h('span', { class: 'grow' }, trial > 0 ? `Пробен период: остават ${trial} ${trial === 1 ? 'ден' : 'дни'}` : 'Пробният период изтича днес')),

    weeklyBox(data, rerender || (() => go('/home'))),

    // Докато караш: само големите бутони
    active && !showAll && driveMode(active, data, go, g, rerender || (() => go('/home'))),
    active && !showAll && h('button', { class: 'btn btn-ghost btn-block drive-all', onclick: () => { showAll = true; (rerender || (() => go('/home')))(); } }, icon('down', 18), 'Покажи всичко'),
    ...(active && !showAll ? [] : [zone('drv.home', { class: 'dz' }, [

    // 1. Колко ти остава този месец (първия ден – какво да направи)
    ['meter', !data.shifts.length && introNow ? firstDay(() => { introNow = false; redrawHome(); }) : meter(g, month)],

    // 2. Главното действие: смяната
    ['shift', h('div', { class: 'home-shift' },
      active ? liveShift(active, go, data) : h('button', { class: 'btn btn-primary btn-xl shift-cta', onclick: startShift }, icon('play', 22), 'Започни смяна'),
      active && h('button', { class: 'btn btn-ghost btn-block', style: { marginTop: '8px' }, onclick: () => { showAll = false; (rerender || (() => go('/home')))(); } }, icon('car', 18), 'Режим „шофирам“'),
      !active && h('button', { class: 'btn btn-ghost btn-block', 'data-tour': 'past', style: { marginTop: '8px' }, onclick: () => go('/shift/new') }, icon('plus', 18), 'Въведи минала смяна'))],

    // 3. Календар и лични резервации – с едно натискане
    (store.flagOn('calendar') || store.flagOn('reservations')) && ['links', h('div', null,
      h('div', { class: 'home-links' },
        store.flagOn('calendar') && panelBtn('cal', 'calendar', 'Календар', 'Всичко по дни'),
        store.flagOn('reservations') && panelBtn('res', 'route', 'Резервации', resCount ? `${resCount} предстоящи` : 'Запиши курс')),
      openPanel && h('div', { class: 'home-panel', id: 'home-panel' },
        openPanel === 'cal' ? embedded(calendarView({ go, data })) : embedded(reservationsView({ data })),
        h('button', { class: 'btn btn-ghost btn-block home-panel-close', onclick: () => togglePanel(openPanel) }, h('span', { class: 'flip' }, icon('down', 18)), 'Скрий')))],

    // 4. Какво следва: курс и плащане с бутоните за тях
    ['next', nextUp(data, go)],

    // Всичко останало – на едно натискане
    ['more', more('Покажи повече: седмицата, часовете, последните смени',
      zone('drv.home.more', { class: 'dz' }, [
        ['week', weekCard(data)],
        ti.hasData && ['best', bestToday(ti)],
        ['stats', h('div', { class: 'grid2' },
          stat('На час', money2(g.stats.netPerHour), { icon: 'clock', cls: 'stat-card', sub: 'чисто' }),
          stat('На км', money2(g.stats.netPerKm), { icon: 'road', cls: 'stat-card', sub: 'чисто' }),
          stat('Смени', String(g.stats.shifts), { icon: 'calendar', cls: 'stat-card', sub: `${fmtDuration(g.stats.hours)} общо` }),
          stat('Километри', fmtNum(g.stats.km), { icon: 'gauge', cls: 'stat-card', sub: g.stats.shifts ? `~${fmtNum(g.stats.km / g.stats.shifts)} на смяна` : '' }))],
        rec.current >= 2 && ['streak', h('div', { class: 'card tip' },
          h('div', { class: 'tip-ic' }, icon('flame', 22)),
          h('div', { class: 'grow' }, h('b', null, `${rec.current} поредни дни на смяна`), h('span', { class: 'muted small' }, rec.current >= rec.longestRun ? 'Това е новият ти рекорд!' : `Рекордът ти е ${rec.longestRun}. Още ${rec.longestRun - rec.current + 1} за нов.`)))],
      ]))],
    ])]));
}

// „Следващо“: най-близкият курс и най-спешното плащане (просрочените са първи)
function nextUp(data, go) {
  const res = upcomingReservations(data.reservations || []);
  const pays = upcomingReminders(data, 14).filter((r) => r.daysLeft != null || (r.kmLeft != null && r.kmLeft <= 0))
    .sort((a, b) => (a.daysLeft ?? -1) - (b.daysLeft ?? -1));
  const r = res[0], p = pays[0];
  const late = p && ((p.daysLeft ?? 0) < 0 || (p.kmLeft ?? 1) <= 0);
  return h('section', { class: 'card next', 'aria-label': 'Следващо' },
    cardTitle('calendar', 'Следващо', h('button', { class: 'link', onclick: () => homeView.openCalendar?.() }, 'Календар', icon('down', 16))),
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

// Съобщения от ProfiTaxi (или от фирмата) – показват се горе, докато не ги затвориш
function messagesBox(redraw) {
  const list = store.myMessages().slice(-2);
  const replies = store.myUnreadTickets();
  if (!list.length && !replies) return null;
  return h('div', { class: 'msgs' }, replies > 0 && h('a', { class: 'msg msg-reply', href: '#/help' }, h('span', { class: 'msg-ic' }, icon('inbox', 18)), h('div', { class: 'grow' }, h('b', null, 'Отговорихме ти'), h('p', null, 'Виж отговора в „Пиши ни“.')), icon('right', 18)), list.map((m) => h('div', { class: 'msg' },
    h('span', { class: 'msg-ic' }, icon('bell', 18)),
    h('div', { class: 'grow' }, h('b', null, m.title), h('p', null, m.text)),
    h('button', { class: 'icon-btn plain', 'aria-label': 'Затвори', onclick: () => { store.readMessage(m.id); redraw(); } }, icon('x', 18)))));
}

// Кратка анкета: „Колко вероятно е да препоръчаш ProfiTaxi?“ (0–10)
let npsScore = null;
function npsCard(redraw) {
  const comment = h('input', { class: 'input', placeholder: 'Какво да подобрим? (по желание)', maxlength: 200 });
  return h('section', { class: 'card nps' },
    h('div', { class: 'row between' }, h('b', null, 'Колко вероятно е да препоръчаш ProfiTaxi на колега?'),
      h('button', { class: 'icon-btn plain', 'aria-label': 'Не сега', onclick: () => { store.skipNps(); redraw(); } }, icon('x', 18))),
    h('div', { class: 'nps-scale' }, Array.from({ length: 11 }, (_, i) => h('button', { class: cx('nps-btn', npsScore === i && 'on'), onclick: () => { npsScore = i; redraw(); } }, String(i)))),
    h('div', { class: 'nps-legend' }, h('span', null, 'Изобщо не'), h('span', null, 'Със сигурност')),
    npsScore != null && h('div', { class: 'row gap', style: { marginTop: '10px' } }, comment,
      h('button', { class: 'btn btn-primary', onclick: () => { store.submitNps(npsScore, comment.value); npsScore = null; toast('Благодарим за отговора!'); redraw(); } }, 'Изпрати')));
}

function firstDay(close) {
  return h('section', { class: 'first-day', 'aria-label': 'Първи стъпки' },
    h('div', { class: 'row between' }, h('h2', null, 'Първи стъпки'),
      h('button', { class: 'icon-btn plain', 'aria-label': 'Затвори', onclick: close }, icon('x', 18))),
    h('ol', { class: 'fd-steps' },
      h('li', null, 'Натисни „Започни смяна“'),
      h('li', null, 'В края въведи кеш, карта и гориво'),
      h('li', null, 'Тук ще видиш колко ти остава чисто')));
}

// Целта за месеца се сменя направо от „Днес“
function editGoal() {
  const p = store.getProfile();
  openNumpad({ title: 'Цел за месеца', sub: 'Колко искаш да изкараш чисто този месец', fields: [{ key: 'v', label: 'Цел', value: p.monthlyGoal || '', decimals: 0 }],
    actions: [{ label: 'Готово', primary: true, run: ({ v }) => { store.updateProfile({ monthlyGoal: Math.max(0, Math.round(v || 0)) }); toast('Целта е запазена'); } }] });
}
function meter(g, month) {
  const hours = g.hoursNeeded;
  const st = g.stats;
  return h('section', { class: 'meter', 'aria-label': 'Печалба за месеца' },
    h('div', { class: 'meter-label' }, h('span', null, 'Чисто този месец'), g.goal > 0 && h('span', { class: 'meter-pct' }, `${Math.max(0, Math.round(g.pct * 100))}%`)),
    h('div', { class: cx('meter-value', g.net < 0 && 'neg') }, money(g.net)),
    g.goal > 0
      ? h('div', { class: 'meter-goal' }, g.done ? h('button', { class: 'goal-edit', onclick: editGoal }, `Целта от ${money(g.goal)} е постигната. Браво!`) : h('button', { class: 'goal-edit', onclick: editGoal, 'aria-label': 'Смени целта' }, `Цел ${money(g.goal)}`, icon('edit', 13)), h('span', null, ' · от смените трябват още ', h('b', null, money(g.remaining))))
      : h('button', { class: 'meter-goal goal-edit', onclick: editGoal }, icon('target', 15), 'Задай цел за месеца'),
    g.goal > 0 && roadProgress(g.pct),
    // Колко трябва днес – едно число
    g.goal > 0 && !g.done && hours != null && h('div', { class: 'meter-today' }, icon('target', 18),
      h('span', null, g.workedToday ? 'Утре ти трябват ' : 'Днес ти трябват ', h('b', null, money(g.needToday)),
        g.needHoursToday != null ? ` от смяната (~${fmtNum(Math.max(1, Math.round(g.needHoursToday)))} ч)` : ' от смяната')),
    g.goal > 0 && !g.done && hours == null && h('div', { class: 'meter-note' }, icon('clock', 14), h('span', null, 'Колко ти трябва на ден ще сметнем след първата ти смяна.')),
    h('div', { class: 'meter-forecast' }, h('span', null, 'Очаквано за целия месец'), h('b', { class: g.forecast < 0 ? 'neg' : '' }, money(g.forecast))),
    g.goal > 0 && !g.done && hours != null && h('details', { class: 'meter-more' },
      h('summary', null, 'Подробности', icon('down', 16)),
      h('div', { class: 'meter-grid' },
        h('div', { class: 'meter-cell' }, h('span', null, 'Часове'), h('b', null, `~${Math.ceil(hours)}`)),
        h('div', { class: 'meter-cell' }, h('span', null, 'Смени'), h('b', null, g.shiftsNeeded != null ? `~${g.shiftsNeeded}` : '—')),
        h('div', { class: 'meter-cell' }, h('span', null, 'На час'), h('b', null, money2(g.ratePerHour)))),
      h('div', { class: 'meter-note' }, icon('alert', 14),
        h('span', null, `Наемът, ефирът и другите постоянни разходи се смятат ден по ден: дотук ${money(st.fixedExp)}, до края на месеца още ${money(g.fixedLeft)}. Затова от смените трябват повече от разликата до целта.`))));
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

// ---------- Режим „шофирам“ ----------
function driveMode(s, data, go, g, redraw) {
  const inc = shiftIncome(s), exp = shiftExpenses(s), profit = inc - exp;
  const need = g.goal > 0 && !g.done && g.needToday > 0 ? g.needToday : null;
  const big = (cls, ic, label, sub, onclick) => h('button', { class: cx('drive-btn', cls), onclick }, h('span', { class: 'db-ic' }, icon(ic, 30)), h('b', null, label), sub && h('small', null, sub));
  return h('section', { class: 'drive', 'aria-label': 'Текуща смяна' },
    forgotBanner(s, go, redraw),
    h('div', { class: 'drive-top' },
      h('span', { class: 'row gap small muted' }, h('span', { class: 'live-dot' }), `На смяна от ${fmtTime(s.start)}`),
      h('button', { class: 'chip', onclick: () => go('/shift/' + s.id) }, icon('edit', 14), 'Отчет')),
    h('div', { class: 'timer drive-timer', 'data-timer': s.start }, fmtTimer(Date.now() - new Date(s.start))),
    h('div', { class: 'drive-sum' },
      h('div', null, h('span', null, 'Приходи'), h('b', null, money(inc))),
      h('div', null, h('span', null, 'Разходи'), h('b', null, money(exp))),
      h('div', null, h('span', null, 'Печалба'), h('b', { class: profit < 0 ? 'neg' : 'pos' }, money(profit)))),
    need != null && h('div', { class: 'drive-need' },
      h('div', { class: 'row between' }, h('span', null, 'Днес ти трябват'), h('b', null, `${money(Math.max(0, profit))} от ${money(need)}`)),
      h('div', { class: 'drive-bar' }, h('i', { style: { width: `${Math.min(100, Math.max(0, (profit / need) * 100))}%` } }))),
    h('div', { class: 'drive-grid' },
      big('cash', 'coins', 'Кеш', `+ към ${money(s.income.cash || 0)}`, () => quickIncome('cash')),
      big('card', 'card', 'Карта', `+ към ${money(s.income.card || 0)}`, () => quickIncome('card')),
      big('fuel', 'fuel', 'Гориво', 'сума и литри', () => quickFuel(data.profile)),
      big('other', 'plus', 'Друго', 'бакшиш, паркинг…', () => go('/shift/' + s.id))),
    h('div', { class: 'drive-row' },
      h('button', { class: 'btn btn-ghost', onclick: () => scanReceipt((r) => quickFuel(data.profile, r)) }, icon('camera', 18), 'Снимай бележка')),
    h('button', { class: 'btn btn-dark btn-xl drive-end', onclick: () => go('/shift/' + s.id + '?end=1') }, icon('stop', 22), 'Приключи смяната'));
}
// „Забрави ли да приключиш?“ – ако смяната тече над 13 часа
function forgotBanner(s, go, redraw) {
  const hrs = (Date.now() - new Date(s.start)) / 3600000;
  let snooze = 0; try { snooze = Number(localStorage.getItem('profitaxi.forgotSnooze.' + s.id) || 0); } catch { /* */ }
  if (hrs < 13 || Date.now() < snooze) return null;
  return h('div', { class: 'forgot' }, icon('alert', 20),
    h('div', { class: 'grow' }, h('b', null, `Смяната тече ${Math.floor(hrs)} часа`), h('small', null, 'Забрави ли да я приключиш? Часът на края се поправя в „Още“.')),
    h('div', { class: 'forgot-acts' },
      h('button', { class: 'btn btn-primary btn-sm', onclick: () => go('/shift/' + s.id + '?end=1') }, 'Приключи'),
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { try { localStorage.setItem('profitaxi.forgotSnooze.' + s.id, String(Date.now() + 3 * 3600000)); } catch { /* */ } redraw(); } }, 'Още карам')));
}
function quickIncome(k) {
  const a0 = store.getActiveShift(); if (!a0) return;
  openNumpad({ title: `${INCOME_TYPES[k].label}: добави`, sub: `Досега: ${money(a0.income[k] || 0, 2)}`, fields: [{ key: 'v', label: 'Сума', value: '' }],
    actions: [{ label: 'Добави', primary: true, run: ({ v }) => { if (!v) return; const a = store.getActiveShift(); a.income[k] = round2((a.income[k] || 0) + v); store.saveShift(a); toast(`${INCOME_TYPES[k].label} +${money(v, v % 1 ? 2 : 0)}`); } }] });
}
// Гориво за активната смяна (по желание с данни от снимана бележка)
function quickFuel(profile, pre = {}) {
  const types = FUELS[profile.fuel]?.types || ['petrol'];
  let type = pre.type && types.includes(pre.type) ? pre.type : types[0];
  let chipsEl;
  const chips = () => { chipsEl = h('div', { class: 'chips' }, types.length > 1 && types.map((t) => h('button', { class: cx('chip-btn', t === type && 'on'), onclick: () => { type = t; chipsEl.replaceWith(chips()); } }, FUEL_TYPES[t].label))); return chipsEl; };
  openNumpad({ title: 'Гориво', sub: pre.amount ? 'От бележката – провери и запиши' : 'Количеството е по желание, но дава разход на 100 км', top: chips,
    fields: [{ key: 'amount', label: 'Сума', value: pre.amount || '' }, { key: 'qty', label: 'Количество', value: pre.qty || '', unit: FUEL_TYPES[type].unit }],
    actions: [{ label: 'Добави', primary: true, run: ({ amount, qty }) => { if (!amount) return; const a = store.getActiveShift(); if (!a) return; a.expenses.push({ id: uid(), category: 'fuel', fuelType: type, amount, qty }); store.saveShift(a); toast(`Гориво ${money(amount, 2)}`); } }] });
}

// ---------- Седмичен отчет: понеделник до сряда, докато не го затвориш ----------
function weeklyBox(data, redraw) {
  const today = todayStr(); const wd = weekdayIdx(today);
  if (wd > 2) return null;
  const from = addDays(startOfWeek(today), -7), to = addDays(from, 6);
  let seen = ''; try { seen = localStorage.getItem('profitaxi.weekSeen') || ''; } catch { /* */ }
  if (seen === from) return null;
  const st = periodStats(data, from, to), pr = periodStats(data, addDays(from, -7), addDays(from, -1));
  if (!st.shifts) return null;
  const diff = pr.net ? Math.round(((st.net - pr.net) / Math.abs(pr.net)) * 100) : null;
  const text = `${money(st.net)} чисто от ${st.shifts} ${st.shifts === 1 ? 'смяна' : 'смени'}${diff != null ? `, ${diff >= 0 ? '+' : ''}${diff}% спрямо предната` : ''}.`;
  // известие на телефона веднъж седмично, ако е разрешено
  try {
    if (localStorage.getItem('profitaxi.weekNotified') !== from && 'Notification' in window && Notification.permission === 'granted') {
      localStorage.setItem('profitaxi.weekNotified', from);
      navigator.serviceWorker?.ready.then((r) => r.showNotification('Миналата седмица', { body: text, icon: '/icons/icon-192.png', data: { url: location.pathname + '#/home' } }));
    }
  } catch { /* */ }
  return h('section', { class: 'card week-sum' },
    h('div', { class: 'row between' }, h('b', null, `Миналата седмица · ${fmtDate(from)} – ${fmtDate(to)}`),
      h('button', { class: 'icon-btn plain', 'aria-label': 'Затвори', onclick: () => { try { localStorage.setItem('profitaxi.weekSeen', from); } catch { /* */ } redraw(); } }, icon('x', 18))),
    h('div', { class: cx('week-net', st.net < 0 && 'neg') }, money(st.net)),
    h('p', { class: 'muted' }, text));
}

function liveShift(s, go) {
  const inc = shiftIncome(s), exp = shiftExpenses(s);
  return h('section', { class: 'live', 'aria-label': 'Текуща смяна' },
    forgotBanner(s, go, () => go('/home')),
    h('div', { class: 'live-top' },
      h('span', { class: 'row gap small muted' }, h('span', { class: 'live-dot' }), `На смяна от ${fmtTime(s.start)}`),
      h('button', { class: 'chip', onclick: () => go('/shift/' + s.id) }, icon('edit', 14), 'Отчет')),
    h('div', { class: 'timer', 'data-timer': s.start }, fmtTimer(Date.now() - new Date(s.start))),
    h('div', { class: 'grid2' },
      stat('Приходи', money(inc), { icon: 'coins', color: 'var(--c-green)' }),
      stat('Разходи', money(exp), { icon: 'fuel', color: 'var(--c-orange)' })),
    h('button', { class: 'btn btn-dark btn-xl', style: { marginTop: '12px' }, onclick: () => go('/shift/' + s.id + '?end=1') }, icon('stop', 20), 'Приключи смяната'));
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
