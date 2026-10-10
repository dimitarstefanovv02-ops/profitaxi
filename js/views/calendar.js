// Календар: резервации, падежи на плащания, напомняния и смени.
// Изгледи: месец, седмица, ден и списък (удобен за телефон). Натискане на събитие – подробности и действия.

import { h, fill, icon, cx, money, todayStr, addDays, parseDate, startOfWeek, startOfMonth, endOfMonth, MONTHS, WD_SHORT, fmtDate, fmtDateLong, fmtDuration } from '../util.js';
import * as store from '../store.js';
import { calendarEvents } from '../calc.js';
import { segmented, openSheet, sheetHead, toast, hero, tone, empty } from '../ui.js';
import { editReservation, mapsUrl } from './reservations.js';
import { PERIODS } from '../constants.js';

const state = { view: 'month', anchor: null, selected: null };
const KIND = {
  res: { label: 'Курс', icon: 'calendar' },
  pay: { label: 'Плащане', icon: 'wallet' },
  rem: { label: 'Напомняне', icon: 'bell' },
  shift: { label: 'Смяна', icon: 'play' },
};

export function calendarView({ go, data }) {
  const root = h('div', { class: 'screen', 'data-page': 'calendar' });
  const today = todayStr();
  if (!state.anchor) state.anchor = today;
  if (!state.selected) state.selected = today;

  const draw = () => {
    const a = state.anchor;
    let from, to, title;
    if (state.view === 'month') { from = startOfWeek(startOfMonth(a)); to = addDays(startOfWeek(endOfMonth(a)), 6); title = monthTitle(a); }
    else if (state.view === 'week') { from = startOfWeek(a); to = addDays(from, 6); title = `${fmtDate(from)} – ${fmtDate(to)}`; }
    else if (state.view === 'day') { from = to = a; title = fmtDateLong(a); }
    else { from = today; to = addDays(today, 60); title = 'Следващите 60 дни'; }
    const events = calendarEvents(data, from, to);
    const byDay = new Map();
    events.forEach((e) => { if (!byDay.has(e.date)) byDay.set(e.date, []); byDay.get(e.date).push(e); });
    const step = (dir) => {
      const d = parseDate(state.anchor);
      if (state.view === 'month') { d.setDate(1); d.setMonth(d.getMonth() + dir); }
      else d.setDate(d.getDate() + (state.view === 'week' ? 7 : 1) * dir);
      state.anchor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (state.view === 'day') state.selected = state.anchor;
      draw();
    };
    const open = (e) => openEvent(e, go, () => { data = store.myData(); draw(); });

    fill(root,
      hero(
        h('div', { class: 'hero-top' },
          h('div', null, h('h1', null, 'Календар'), h('div', { class: 'hero-sub' }, 'Курсове, плащания и смени')),
          h('div', { class: 'row gap' },
            h('a', { class: 'hero-btn', href: '#/reservations', 'aria-label': 'Всички резервации', title: 'Всички резервации' }, icon('list', 20)),
            h('button', { class: 'hero-btn', 'aria-label': 'Нова резервация', onclick: () => editReservation({ date: state.selected || today }) }, icon('plus', 22)))),
        h('div', { class: 'hero-ctl' }, segmented({ month: 'Месец', week: 'Седмица', day: 'Ден', list: 'Списък' }, state.view, (v) => { state.view = v; if (v === 'day') state.anchor = state.selected || today; draw(); }))),
      state.view !== 'list' && h('div', { class: 'cal-nav' },
        h('button', { class: 'icon-btn', 'aria-label': 'Назад', onclick: () => step(-1) }, icon('left')),
        h('b', null, title),
        h('button', { class: 'icon-btn', 'aria-label': 'Напред', onclick: () => step(1) }, icon('right')),
        (state.anchor !== today || state.selected !== today) && h('button', { class: 'chip', onclick: () => { state.anchor = state.selected = today; draw(); } }, 'Днес')),
      h('div', { class: 'cal-legend' }, Object.entries(KIND).map(([k, v]) => h('span', null, h('i', { class: 'dot dot-' + k }), v.label))),

      state.view === 'month' && monthGrid(from, a, byDay, (d) => { state.selected = d; draw(); }),
      state.view === 'month' && dayAgenda(state.selected, byDay.get(state.selected) || [], open, true),

      state.view === 'week' && h('div', { class: 'cal-week' }, Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((d) =>
        h('section', { class: cx('card cal-wday', d === today && 'today') },
          h('button', { class: 'cal-wday-head', onclick: () => { state.view = 'day'; state.anchor = state.selected = d; draw(); } },
            h('b', null, `${WD_SHORT[(parseDate(d).getDay() + 6) % 7]} ${parseDate(d).getDate()}`), h('span', null, (byDay.get(d) || []).length ? `${(byDay.get(d) || []).length}` : '')),
          (byDay.get(d) || []).map((e) => eventRow(e, open))))),

      state.view === 'day' && dayAgenda(a, byDay.get(a) || [], open, false),

      state.view === 'list' && (events.filter((e) => e.kind !== 'shift').length
        ? [...byDay.entries()].map(([d, list]) => { const l = list.filter((e) => e.kind !== 'shift'); return l.length ? h('section', { class: 'cal-group' }, h('h2', { class: 'section-title' }, dayLabel(d)), h('div', { class: 'card' }, l.map((e) => eventRow(e, open)))) : null; })
        : h('section', { class: 'card' }, empty('calendar', 'Нищо предстоящо', 'Няма курсове или плащания в следващите 60 дни.'))));
  };
  draw();
  return root;
}

const monthTitle = (a) => { const d = parseDate(a); const m = MONTHS[d.getMonth()]; return `${m[0].toUpperCase() + m.slice(1)} ${d.getFullYear()}`; };
function dayLabel(d) {
  const t = todayStr();
  if (d === t) return 'Днес';
  if (d === addDays(t, 1)) return 'Утре';
  return fmtDateLong(d);
}

function monthGrid(from, anchor, byDay, onPick) {
  const today = todayStr(), month = anchor.slice(0, 7);
  return h('section', { class: 'card cal-month' },
    h('div', { class: 'cal-head' }, WD_SHORT.map((w) => h('span', null, w))),
    h('div', { class: 'cal-grid' }, Array.from({ length: 42 }, (_, i) => addDays(from, i)).filter((d, i) => i < 35 || d.slice(0, 7) === month).map((d) => {
      const list = byDay.get(d) || [];
      const kinds = [...new Set(list.map((e) => (e.kind === 'pay' && e.late ? 'late' : e.kind)))].slice(0, 4);
      return h('button', { class: cx('cal-day', d.slice(0, 7) !== month && 'out', d === today && 'today', d === state.selected && 'sel'), 'aria-label': `${fmtDateLong(d)}${list.length ? `, ${list.length} събития` : ''}`, onclick: () => onPick(d) },
        h('span', { class: 'cal-num' }, parseDate(d).getDate()),
        h('span', { class: 'cal-dots' }, kinds.map((k) => h('i', { class: 'dot dot-' + k }))));
    })));
}

function dayAgenda(d, list, open, compact) {
  return h('section', { class: 'card', style: { marginTop: '14px' } },
    h('div', { class: 'cal-agenda-head' }, h('b', null, dayLabel(d)), h('button', { class: 'chip', onclick: () => editReservation({ date: d }) }, icon('plus', 14), 'Курс')),
    list.length ? list.map((e) => eventRow(e, open)) : h('p', { class: 'muted small', style: { padding: '6px 0' } }, compact ? 'Нищо за този ден.' : 'Няма събития за този ден.'));
}

function eventRow(e, open) {
  const k = KIND[e.kind];
  return h('button', { class: cx('cal-ev', e.kind, e.late && 'late', e.done && 'done'), onclick: () => open(e) },
    h('span', { class: 'cal-ev-ic' }, icon(e.late ? 'alert' : k.icon, 17)),
    h('span', { class: 'cal-ev-main' },
      h('b', null, e.title),
      h('span', null, [e.time, e.kind === 'pay' ? (e.late ? 'просрочено' : 'плащане') : e.kind === 'shift' ? fmtDuration(e.hours) : e.sub].filter(Boolean).join(' · '))),
    e.amount ? h('span', { class: cx('cal-ev-amt', e.kind === 'shift' && tone(e.amount)) }, e.kind === 'pay' ? money(e.amount, e.amount % 1 ? 2 : 0) : money(e.amount)) : null,
    icon('right', 16));
}

// Подробности и действия за събитие
function openEvent(e, go, refresh) {
  if (e.kind === 'res') { editReservation(e.ref); return; }
  if (e.kind === 'shift') { go('/shift/' + e.ref.id); return; }
  openSheet((close) => h('div', { class: 'form' },
    sheetHead(e.title, close, e.kind === 'pay' ? 'Плащане' : 'Напомняне'),
    h('div', { class: 'info-box' }, icon(e.late ? 'alert' : 'calendar', 18), h('span', null,
      e.late ? 'Просрочено от ' : 'Падеж: ', h('b', null, fmtDateLong(e.date)),
      e.amount ? h('span', null, ', ', h('b', null, money(e.amount, e.amount % 1 ? 2 : 0))) : null,
      e.kind === 'pay' && e.ref.period ? `, ${PERIODS[e.ref.period]?.every || ''}` : '')),
    e.kind === 'pay' && e.first && h('button', { class: 'btn btn-primary btn-lg btn-block', onclick: () => { store.markCostPaid(e.ref.id); close(); toast('Отбелязано като платено'); refresh(); } }, icon('check', 20), 'Платено'),
    e.kind === 'pay' && !e.first && h('p', { class: 'muted small' }, 'Това е бъдещо плащане. „Платено“ се отбелязва, когато дойде редът му.'),
    h('button', { class: 'btn btn-ghost btn-lg btn-block', onclick: () => { close(); go('/costs'); } }, icon('wallet', 20), 'Отвори в Разходи')));
}

export { mapsUrl };
