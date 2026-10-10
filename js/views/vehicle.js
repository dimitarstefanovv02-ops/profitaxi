// „Колата ми“ (собствена кола): колко си избил от покупката, приходи и разходи по колата, ремонти по дати.
import { h, icon, cx, money, fmtDate, todayStr, addDays, daysBetween, MONTHS } from '../util.js';
import * as store from '../store.js';
import { openSheet, sheetHead, toast, field, cardTitle, segmented, confirmSheet } from '../ui.js';
import { periodStats, shiftDate } from '../calc.js';
import { COST_CATS, EXPENSE_CATS } from '../constants.js';

// Разходи по колата: от смените (гориво, автомивка, обслужване, ремонт, гуми) и постоянните/еднократните с „car“
const SHIFT_CAR = ['fuel', 'wash', 'service', 'repair', 'tires'];
const LOG_SHIFT = ['service', 'repair', 'tires'];
const GROUPS = [
  ['Гориво', ['fuel']],
  ['Ремонти, обслужване, гуми', ['repair', 'service', 'tires', 'car_other']],
  ['Застраховки, винетка, преглед', ['insurance', 'casco', 'vignette', 'inspection', 'insure']],
  ['Лизинг', ['leasing']],
  ['Автомивка', ['wash']],
  ['Таксиметров апарат', ['meter']],
];

export function carStats(data, profile = data.profile) {
  const today = todayStr();
  const inv = profile.investment && profile.investment.price > 0 ? profile.investment : null;
  const firstShift = data.shifts.filter((s) => s.end).map(shiftDate).sort()[0];
  const from = inv?.date || firstShift || today;
  const st = periodStats(data, from, today);
  // по колата: от смените + постоянни „за колата“ + ремонтите от тази страница
  const byCat = {};
  for (const [k, v] of Object.entries(st.expByCat)) if (SHIFT_CAR.includes(k)) byCat[k] = (byCat[k] || 0) + v;
  for (const [k, v] of Object.entries(st.fixedByCat || {})) if (COST_CATS[k]?.car || ['fuel', 'wash', 'car_other'].includes(k)) byCat[k] = (byCat[k] || 0) + v;
  const groups = GROUPS.map(([label, keys]) => [label, keys.reduce((a, k) => a + (byCat[k] || 0), 0)]).filter(([, v]) => v > 0.004);
  const carExp = groups.reduce((a, [, v]) => a + v, 0);
  // темпо: последните 60 дни (или от покупката, ако е по-скоро)
  const paceFrom = from > addDays(today, -60) ? from : addDays(today, -60);
  const pace = periodStats(data, paceFrom, today);
  const spanDays = Math.max(1, daysBetween(paceFrom, today) + 1);
  const perWorkDay = pace.workedDays ? pace.net / pace.workedDays : 0;
  const perHour = pace.hours ? pace.net / pace.hours : 0;
  const workDaysPerWeek = pace.workedDays ? Math.min(7, (pace.workedDays / spanDays) * 7) : 0;
  const out = { from, inv, st, groups, carExp, perWorkDay, perHour, workDaysPerWeek, enoughData: pace.workedDays >= 3 && perWorkDay > 0 };
  if (inv) {
    out.paid = Math.max(0, st.net);
    out.left = Math.max(0, inv.price - st.net);
    out.pct = Math.min(100, Math.max(0, (st.net / inv.price) * 100));
    out.done = st.net >= inv.price;
    if (!out.done && out.enoughData) {
      // закръгляне нагоре без грешки от плаващата запетая (305,99999… или 306,0000001 → 306)
      const up = (x) => Math.ceil(x - 1e-9);
      out.daysLeft = up(out.left / perWorkDay);
      out.hoursLeft = perHour > 0 ? up(out.left / perHour) : null;
      // работни дни → календарни по реалното темпо (enoughData гарантира поне 3 работни дни, т.е. > 0 дни седмично).
      // Преди: Math.max(дни седмично, 1) – при 0,3 дни седмично датата излизаше 3 пъти по-рано.
      out.payoffDate = addDays(today, up((out.daysLeft * 7) / workDaysPerWeek));
    }
  }
  return out;
}

// Всички ремонти: въведени тук + от смените
export function carLog(data) {
  const list = [];
  for (const c of data.costs) if (c.carLog) list.push({ id: c.id, manual: true, date: c.startDate, cat: c.category, label: c.name || store.CAR_LOG_CATS[c.category], amount: c.amount, km: c.km || null, note: c.note || '', ref: c });
  for (const s of data.shifts) for (const e of s.expenses || []) if (LOG_SHIFT.includes(e.category)) {
    list.push({ id: e.id || `${s.id}-${e.category}`, manual: false, date: shiftDate(s), cat: e.category, label: EXPENSE_CATS[e.category]?.label || 'Ремонт', amount: Number(e.amount) || 0, km: s.kmEnd || s.kmStart || null, note: e.note || 'от смяната', shiftId: s.id });
  }
  return list.sort((a, b) => b.date.localeCompare(a.date));
}

const monthYear = (d) => { const x = new Date(d + 'T12:00:00'); return `${MONTHS[x.getMonth()].toLowerCase()} ${x.getFullYear()}`; };
const kmTxt = (n) => `${Math.round(n).toLocaleString('bg-BG')} км`;

export function vehicleView({ go, data, rerender }) {
  const p = data.profile;
  const redraw = rerender || (() => go('/vehicle'));
  const cs = carStats(data);
  const log = carLog(data);
  const car = p.car || {};
  const inv = cs.inv;

  const invCard = inv
    ? h('section', { class: 'card car-inv' },
      cardTitle('target', 'Колко си избил от колата', h('button', { class: 'link', onclick: () => investSheet(p, redraw) }, icon('edit', 15), 'Промени')),
      h('div', { class: 'ci-top' },
        h('div', null, h('small', null, 'Избити до момента'), h('b', { class: cx('ci-big', cs.done && 'good') }, money(cs.paid))),
        h('div', { class: 'ci-right' }, h('small', null, 'Платих за колата'), h('b', null, money(inv.price)))),
      h('div', { class: 'ci-bar' }, h('i', { style: { width: `${cs.pct}%` } }), h('span', null, `${Math.round(cs.pct)}%`)),
      cs.done
        ? h('p', { class: 'ci-done' }, icon('check', 18), 'Колата е изплатена! Всичко оттук нататък е печалба.')
        : h('div', { class: 'ci-grid' },
          h('div', null, h('small', null, 'Остават'), h('b', null, money(cs.left))),
          h('div', null, h('small', null, 'Работни дни'), h('b', null, cs.daysLeft != null ? `~${cs.daysLeft}` : '—')),
          h('div', null, h('small', null, 'Работни часове'), h('b', null, cs.hoursLeft != null ? `~${cs.hoursLeft}` : '—'))),
      !cs.done && h('p', { class: 'muted small', style: { marginTop: '10px' } }, cs.enoughData
        ? `По сегашното темпо – ${money(cs.perWorkDay)} чисто на работен ден, ${money(cs.perHour, 2)} на час, ~${cs.workDaysPerWeek.toFixed(1).replace('.', ',')} дни седмично – колата се изплаща около ${monthYear(cs.payoffDate)}.`
        : 'Запиши още няколко смени и ще сметна за колко работни дни и часове ще я изплатиш.'),
      h('p', { class: 'faint small', style: { marginTop: '8px' } }, `Смята се чистата печалба след всички разходи от ${fmtDate(inv.date, { year: true })}.`))
    : h('section', { class: 'card car-inv empty' },
      cardTitle('target', 'Инвестиция в колата'),
      h('p', { class: 'muted' }, 'По желание: ако си купил колата за таксито, въведи колко си платил. Ще виждаш колко от нея си избил, колко ти остава и за колко работни дни и часове ще я изплатиш.'),
      h('button', { class: 'btn btn-primary btn-block', style: { marginTop: '12px' }, onclick: () => investSheet(p, redraw) }, icon('plus', 18), 'Въведи покупката'));

  const sumCard = h('section', { class: 'card' },
    cardTitle('wallet', inv ? `От ${fmtDate(inv.date, { year: true })} досега` : 'Приходи и разходи по колата'),
    h('div', { class: 'ms-row' }, h('span', null, 'Приходи'), h('b', null, money(cs.st.income))),
    h('div', { class: 'ms-row' }, h('span', null, 'Разходи по колата'), h('b', null, `−${money(cs.carExp)}`)),
    cs.groups.map(([label, v]) => h('div', { class: 'ms-row sub' }, h('span', null, label), h('span', null, money(v)))),
    h('div', { class: 'ms-row' }, h('span', null, 'Други разходи'), h('b', null, `−${money(Math.max(0, cs.st.totalExp - cs.carExp))}`)),
    h('div', { class: 'ms-total' }, h('span', null, 'Чисто'), h('b', null, money(cs.st.net))),
    h('p', { class: 'muted small' }, [cs.st.km ? kmTxt(cs.st.km) : null, cs.st.km && cs.carExp ? `${money(cs.carExp / cs.st.km, 2)} разход по колата на км` : null, cs.st.shifts ? `${cs.st.shifts} смени` : null].filter(Boolean).join(' · ')));

  const logTotal = log.reduce((a, x) => a + x.amount, 0);
  const logCard = h('section', { class: 'card' },
    cardTitle('tool', 'Ремонти и обслужване', h('button', { class: 'chip page', onclick: () => entrySheet(null, redraw) }, icon('plus', 14), 'Добави')),
    log.length
      ? h('div', { class: 'car-log' }, log.map((x) => h('button', { class: 'cl-row', onclick: () => (x.manual ? entrySheet(x.ref, redraw) : go('/shift/' + x.shiftId)) },
        h('div', { class: 'cl-date' }, fmtDate(x.date, { year: true })),
        h('div', { class: 'grow' }, h('b', null, x.label), h('small', null, [x.km ? kmTxt(x.km) : null, x.note].filter(Boolean).join(' · '))),
        h('b', { class: 'cl-amt' }, money(x.amount, x.amount % 1 ? 2 : 0)))))
      : h('p', { class: 'muted' }, 'Още няма записани ремонти. Натисни „Добави“ – сума, дата, километри и бележка. Ремонтите от смените („Друг разход“ → Ремонт, Обслужване, Гуми) се появяват тук сами.'),
    log.length > 0 && h('div', { class: 'ms-total' }, h('span', null, `Общо (${log.length})`), h('b', null, money(logTotal))));

  return h('div', { class: 'screen', 'data-page': 'vehicle' },
    h('div', { class: 'page-title' }, h('h1', null, 'Колата ми')),
    h('p', { class: 'muted', style: { margin: '-6px 0 12px' } }, [car.model, car.plate].filter(Boolean).join(' · ') || 'Ремонтите, разходите и колко ти остава до изплащането'),
    invCard, sumCard, logCard);
}

const num = (v) => h('input', { class: 'input', type: 'number', inputmode: 'decimal', min: 0, step: 'any', value: v ?? '' });

function investSheet(p, redraw) {
  const inv = p.investment || {};
  const price = num(inv.price), km = num(inv.km);
  const date = h('input', { class: 'input', type: 'date', value: inv.date || todayStr(), max: todayStr() });
  const err = h('p', { class: 'err' });
  openSheet((close) => h('div', { class: 'form' },
    sheetHead('Покупка на колата', close, 'По желание – само за да виждаш колко от колата си избил'),
    field('Колко си платил', price, 'Цялата сума за колата, в евро'),
    field('Кога я купи', date, 'Оттогава се смята изкараното'),
    field('Километри при покупката', km, 'По желание'),
    err,
    h('button', { class: 'btn btn-primary btn-lg', onclick: () => {
      const v = Number(price.value); if (!(v > 0)) { err.textContent = 'Въведи колко си платил'; return; }
      if (!date.value) { err.textContent = 'Избери дата'; return; }
      store.updateProfile({ investment: { price: Math.round(v * 100) / 100, date: date.value, km: Number(km.value) || null } }); close(); toast('Запазено'); redraw();
    } }, icon('check', 18), 'Запази'),
    p.investment && h('button', { class: 'btn btn-ghost', onclick: () => { close(); confirmSheet({ title: 'Да махна ли покупката?', text: 'Ремонтите и смените остават. Махаш само сметката „колко съм избил“.', okLabel: 'Махни', danger: true, onOk: () => { store.updateProfile({ investment: null }); redraw(); } }); } }, 'Махни покупката')));
}

function entrySheet(c, redraw) {
  let cat = c?.category || 'repair';
  const amount = num(c?.amount), km = num(c?.km);
  const date = h('input', { class: 'input', type: 'date', value: c?.startDate || todayStr() });
  const note = h('input', { class: 'input', maxlength: 300, placeholder: 'напр. смяна на ремъци, накладки', value: c?.note || '' });
  const err = h('p', { class: 'err' });
  const segBox = h('div');
  const drawSeg = () => segBox.replaceChildren(segmented(store.CAR_LOG_CATS, cat, (k) => { cat = k; drawSeg(); }, { small: true, wrap: true }));
  drawSeg();
  openSheet((close) => h('div', { class: 'form' },
    sheetHead(c ? 'Ремонт' : 'Нов ремонт', close, 'Влиза в разходите за деня, в който е направен'),
    field('Какво', segBox),
    field('Сума', amount),
    field('Дата', date),
    field('Километри', km, 'По желание – километражът в деня на ремонта'),
    field('Бележка', note, 'По желание'),
    err,
    h('button', { class: 'btn btn-primary btn-lg', onclick: () => {
      const r = store.saveCarEntry({ id: c?.id, category: cat, amount: amount.value, date: date.value, km: km.value, note: note.value });
      if (r.error) { err.textContent = r.error; return; }
      close(); toast('Запазено'); redraw();
    } }, icon('check', 18), 'Запази'),
    c && h('button', { class: 'btn btn-ghost', onclick: () => { close(); confirmSheet({ title: 'Да изтрия ли ремонта?', okLabel: 'Изтрий', danger: true, onOk: () => { store.deleteCarEntry(c.id); redraw(); } }); } }, icon('trash', 16), 'Изтрий')));
}
