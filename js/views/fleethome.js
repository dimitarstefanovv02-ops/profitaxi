// „Автопарк“ – началният екран на собственика на коли под наем.
// Голяма цифра за месеца, заетост на парка, лента „Днес“ (какво да направиш днес), колите със статус
// (плъзни за Платено / В сервиз / Статус – и свои статуси), „Напомни на всички“, печалба по кола, чакащи шофьори.
import { h, icon, cx, money, fmtDate, fmtNum, fmtDuration, todayStr, addDays, startOfMonth, endOfMonth, parseDate, MONTHS, WEEKDAYS, eachDay } from '../util.js';
import * as store from '../store.js';
import { toast, cardTitle, topSearch, openSheet, sheetHead, field, confirmSheet, segmented } from '../ui.js';
import { carInfo, statusChip, statusSheet, recordSheet, remind, remindAll, swipeRow, carName, shortName, first, leftText, face, STATUS, stOf } from './fleetui.js';
import { dlDays } from '../fleet.js';
import { carProfit } from '../fleet.js';
import { costCat } from '../constants.js';
import { verifyBanner } from './auth.js';
import { fleetGoal, goalSheet, forecast, serviceState, serviceSheet, serviceText, adSheet, accountantSheet } from './fleetplus.js';

const cap = (s) => s.replace(/^./, (x) => x.toUpperCase());
const pct = (a, b) => (Math.abs(b) > 0.5 ? Math.round((a - b) / Math.abs(b) * 100) : null);

export function fleetHomeView({ go, user, rerender }) {
  const redraw = rerender || (() => go('/home'));
  const today = todayStr();
  const m1 = startOfMonth(today);
  const prevEnd = addDays(m1, -1), prev1 = startOfMonth(prevEnd);
  const sameDayPrev = (() => { const d = parseDate(today).getDate(); const last = parseDate(prevEnd).getDate(); return `${prevEnd.slice(0, 8)}${String(Math.min(d, last)).padStart(2, '0')}`; })();
  const cars = store.myCars().filter((c) => c.ownerId === user.id);
  const infos = cars.map((c) => carInfo(c, today));
  const profile = store.getProfile() || {};
  const greet = new Date().getHours() < 12 ? 'Добро утро' : new Date().getHours() < 18 ? 'Добър ден' : 'Добър вечер';

  // Голямата цифра: събран наем минус разходите по колите за месеца
  const sum = (from, to) => infos.reduce((a, i) => { const p = carProfit(i.costs, i.logs, from, to); return { income: a.income + p.income, expense: a.expense + p.expense, net: a.net + p.net }; }, { income: 0, expense: 0, net: 0 });
  const now = sum(m1, today), before = sum(prev1, sameDayPrev), prevFull = sum(prev1, prevEnd);
  const ch = pct(now.net, before.net);
  const goal = fleetGoal();

  // Заетост: колко коли карат днес и колко % от дните този месец са били на път
  const withDrivers = infos.filter((i) => i.status !== 'free' && i.status !== 'service');
  const drivingNow = infos.filter((i) => i.drivingToday).length;
  const days = eachDay(m1, today);
  const busy = infos.length ? Math.round(infos.reduce((a, i) => { const set = new Set(i.shifts.map((s) => (s.start || '').slice(0, 10))); return a + days.filter((d) => set.has(d)).length / days.length; }, 0) / infos.length * 100) : 0;

  // Лента „Днес“
  const items = [];
  const wait = (profile.waitlist || []).slice().sort((a, b) => String(a.at).localeCompare(String(b.at)));
  for (const i of infos) {
    const n = shortName(i.car);
    for (const { m, d, r } of i.rents) {
      if (r.debt > 0 && r.late) items.push({ k: `late-${i.car.id}-${m.userId}`, cls: 'bad', ic: 'alert', t: `${first(d.name || m.name)} дължи ${money(r.debt, r.debt % 1 ? 2 : 0)}`, s: `${n} · просрочено ${r.lateDays} ${r.lateDays === 1 ? 'ден' : 'дни'}`, acts: [['Напомни', () => { remind(i.car, [{ userId: m.userId, amount: r.debt }]); redraw(); }], ['Платено', () => recordSheet(i, 'pay', { driverId: m.userId }, redraw)]] });
      else if (r.debt > 0) items.push({ k: `due-${i.car.id}-${m.userId}`, cls: 'warn', ic: 'coins', t: `${first(d.name || m.name)} трябва да плати ${money(r.debt, r.debt % 1 ? 2 : 0)}`, s: `${n} · днес`, acts: [['Платено', () => recordSheet(i, 'pay', { driverId: m.userId }, redraw)]] });
    }
    for (const l of i.pendings) items.push({ k: `pend-${l.id}`, cls: 'good', ic: 'check', t: `${first(i.users[l.driverId]?.name)}: „Платих ${money(l.amount, l.amount % 1 ? 2 : 0)}“`, s: `${n} · ${fmtDate(l.date)}`, acts: [['Потвърди', () => { store.confirmPay(l.id); toast('Потвърдено'); redraw(); }]] });
    for (const x of i.deadlines.filter((y) => y.left <= Math.max(...dlDays(store.getProfile())))) items.push({ k: `dl-${x.key}`, cls: x.left <= 3 ? 'bad' : 'warn', ic: x.kind === 'driver' ? 'user' : x.kind === 'cost' ? 'calendar' : 'shield', t: `${n} – ${x.title}`, s: `${leftText(x.left)} · ${fmtDate(x.date)}${x.amount ? ' · ' + money(x.amount) : ''}`, acts: x.costId ? [['Платено', () => { store.markCostPaid(x.costId); toast('Платено'); redraw(); }]] : [] });
    if (i.status === 'idle') items.push({ k: `idle-${i.car.id}`, cls: 'warn', ic: 'clock', t: `${n} стои ${i.idle >= 99 ? 'без смени' : `${i.idle} дни`}`, s: i.idle >= 3 && wait[0] ? `Може да я дадеш на ${wait[0].name} – чака от ${fmtDate(wait[0].at.slice(0, 10))}` : 'Няма смяна от последните дни', acts: [] });
    if (i.status === 'free' && i.car.status !== 'service') items.push({ k: `free-${i.car.id}`, cls: 'calm', ic: 'key', t: `${n} е свободна`, s: wait[0] ? `Първи чака ${wait[0].name}${wait[0].phone ? ' · ' + wait[0].phone : ''}` : 'Прати линка на нов шофьор', acts: [wait[0]?.phone && ['Обади се', () => { location.href = 'tel:' + wait[0].phone; }], ['Обява', () => adSheet(i)]].filter(Boolean) });
    const sv = serviceState(i);
    if (sv && sv.left <= 1000) items.push({ k: `svc-${i.car.id}`, cls: sv.left <= 0 ? 'bad' : 'warn', ic: 'wrench', t: `${n}: обслужване ${serviceText(sv)}`, s: `на ${fmtNum(sv.next)} км · сега ${fmtNum(sv.odo)} км`, acts: [['Готово', () => serviceSheet(i, redraw)]] });
    if (i.gaps.gap > 0) items.push({ k: `gap-${i.car.id}`, cls: 'warn', ic: 'road', t: `${n}: неотчетени ${fmtNum(i.gaps.gap)} км`, s: 'Между края на една смяна и началото на следващата', acts: [] });
  }
  const order = { bad: 0, warn: 1, good: 2, calm: 3 };
  items.sort((a, b) => order[a.cls] - order[b.cls]);
  const fc = forecast(infos, now.net, today);
  const debtors = infos.flatMap((i) => i.rents.filter((x) => x.r.debt > 0).map((x) => ({ i, x })));

  // Печалба по кола за годината – от най-печелившата до най-губещата
  const year = today.slice(0, 4);
  const ranked = infos.map((i) => ({ i, p: carProfit(i.costs, i.logs, `${year}-01-01`, today) })).sort((a, b) => b.p.net - a.p.net);
  const maxAbs = Math.max(1, ...ranked.map((x) => Math.abs(x.p.net)));

  return h('div', { class: 'screen', 'data-page': 'fleet' },
    topSearch(redraw),
    h('div', { class: 'page-title tab-head' }, h('div', null, h('h1', null, 'Автопарк'), h('div', { class: 'date' }, `${greet}, ${first(user.name)}`))),
    verifyBanner(user, redraw),
    cars.length ? h('section', { class: 'meter fleet-sum' },
      h('div', { class: 'meter-label' }, h('span', null, `${cap(MONTHS[parseDate(today).getMonth()])} · ${cars.length} ${cars.length === 1 ? 'кола' : 'коли'}`),
        h('button', { class: 'fs-goal-btn', type: 'button', onclick: () => goalSheet(redraw) }, icon('target', 14), goal ? `Цел ${money(goal)}` : 'Цел')),
      h('div', { class: cx('meter-value', now.net < 0 && 'neg') }, `${now.net >= 0 ? '+' : '−'}${money(Math.abs(now.net))}`),
      h('div', { class: 'meter-goal' }, `наем ${money(now.income)} − разходи ${money(now.expense)}`, ch == null || ch === 0 ? '' : ` · ${ch >= 0 ? '▲' : '▼'} ${Math.abs(ch)}%`),
      goal > 0 && h('div', { class: 'fs-bar' }, h('i', { style: { width: `${Math.max(2, Math.min(100, now.net / goal * 100))}%` } })),
      h('div', { class: 'fs-lines' },
        goal > 0 && h('span', null, now.net >= goal ? h('b', null, 'Целта е постигната 🎉') : [h('b', null, money(goal - now.net)), ' до целта']),
        fc.end > today && h('span', null, 'Очаквано до ', fmtDate(fc.end), ': ', h('b', null, `${fc.net >= 0 ? '+' : '−'}${money(Math.abs(fc.net))}`))),
      h('div', { class: 'fleet-occ' },
        h('span', null, h('b', null, `${drivingNow}/${cars.length}`), ' карат днес'),
        h('span', null, h('b', null, `${busy}%`), ' от дните на път')))
      : h('section', { class: 'card' },
        cardTitle('key', 'Как започваш'),
        h('ol', { class: 'fleet-steps' },
          h('li', null, h('b', null, 'Добави колата'), ' – модел и рег. номер.'),
          h('li', null, h('b', null, 'Прати линка'), ' на шофьора във Viber или SMS.'),
          h('li', null, h('b', null, 'Задай наема и километража'), ' – излизат сами при шофьора.'),
          h('li', null, h('b', null, 'Добави сроковете'), ' – ГО, каско, винетка, преглед. Напомняме навреме.')),
        h('button', { class: 'btn btn-ghost btn-block', onclick: () => go('/fguide?walk=1') }, icon('play', 16), 'Разходка из приложението')),

    // Днес
    cars.length > 0 && h('section', { class: 'card today-strip' },
      cardTitle('bolt', 'Днес', infos.some((i) => (i.car.members || []).some((m) => m.userId !== i.car.ownerId)) && h('button', { class: 'chip page', onclick: () => remindAll(infos, redraw) }, icon('bell', 14), 'Напомни на всички')),
      items.length ? todayRows(items) : h('p', { class: 'muted' }, 'Всичко е наред – няма плащания, срокове или коли, които стоят.')),

    // Колите
    cars.length > 0 && h('div', { class: 'card-title fleet-h' }, h('h3', null, h('span', { class: 't-ic' }, icon('car', 17)), 'Колите', h('small', { class: 'faint' }, 'плъзни наляво')),
      h('button', { class: 'chip page', onclick: () => go('/cars?new=1') }, icon('plus', 14), 'Кола')),
    infos.length > 0 && h('div', { class: 'car-list fleet-cars' }, infos.map((i) => {
      const drv = i.rents.map((x) => first(x.d.name || x.m.name));
      const debt = i.rents.reduce((a, x) => a + x.r.debt, 0);
      const km = i.shifts.filter((s) => (s.start || '').slice(0, 10) >= m1).reduce((a, s) => a + Math.max(0, (s.kmEnd || 0) - (s.kmStart || 0)), 0);
      const row = h('a', { class: cx('card car-item', 'st-' + i.status), href: '#/cars/' + i.car.id },
        h('span', { class: 'ci-ic', style: stOf(i.status).color ? { color: stOf(i.status).color } : null }, icon(stOf(i.status).ic, 20)),
        h('span', { class: 'grow' },
          h('span', { class: 'ci-top' }, h('b', null, i.car.name || i.car.plate || 'Кола'), statusChip(i.status)),
          h('small', null, [i.car.name && i.car.plate, drv.length ? drv.join(', ') : 'без шофьор', `${fmtNum(km)} км`, debt > 0 ? null : null].filter(Boolean).join(' · ')),
          debt > 0 && h('small', { class: 'neg b' }, `дължат ${money(debt, debt % 1 ? 2 : 0)}`)));
      const first0 = i.rents.find((x) => x.r.debt > 0) || i.rents[0];
      return swipeRow(row, [
        first0 && { label: 'Платено', ic: 'coins', cls: 'ok', run: () => recordSheet(i, 'pay', { driverId: first0.m.userId }, redraw) },
        { label: i.car.status === 'service' ? 'Кара се' : 'В сервиз', ic: 'wrench', cls: 'warn', run: () => { store.setCarStatus(i.car.id, i.car.status === 'service' ? '' : 'service'); toast(i.car.status === 'service' ? 'Колата се кара' : 'В сервиз'); redraw(); } },
        { label: 'Статус', ic: 'more', cls: 'calm', run: () => statusSheet(i.car, redraw) },
      ].filter(Boolean));
    })),
    !cars.length && h('button', { class: 'btn btn-primary btn-block', style: { marginTop: '12px' }, onclick: () => go('/cars?new=1') }, icon('plus', 18), 'Добави кола'),

    // Печалба по кола
    ranked.length > 1 && h('section', { class: 'card', style: { marginTop: '14px' } },
      cardTitle('trophy', `Печалба по кола · ${year}`),
      ranked.map(({ i, p }, n) => h('a', { class: 'rank-row', href: '#/cars/' + i.car.id },
        h('span', { class: 'rk' }, String(n + 1)),
        h('span', { class: 'grow' }, h('b', null, carName(i.car)), h('span', { class: 'rk-bar' }, h('i', { class: p.net >= 0 ? 'pos' : 'neg', style: { width: `${Math.max(3, Math.abs(p.net) / maxAbs * 100)}%` } }))),
        h('b', { class: cx('num', p.net >= 0 ? 'pos' : 'neg') }, `${p.net >= 0 ? '+' : '−'}${money(Math.abs(p.net))}`)))),

    // Чакащи шофьори
    h('section', { class: 'card', style: { marginTop: '14px' } },
      cardTitle('users', 'Чакащи шофьори', h('button', { class: 'chip page', onclick: () => waitSheet(redraw) }, icon('plus', 14), 'Добави')),
      wait.length ? wait.map((w, n) => h('div', { class: 'cc-row wait-row' },
        h('span', { class: 'rk' }, String(n + 1)),
        h('span', { class: 'grow' }, h('span', { class: 'wr-top' }, h('b', null, w.name),
          w.phone && h('a', { class: 'c6-call wr-call', href: 'tel:' + w.phone.replace(/\s/g, ''), 'aria-label': 'Обади се на ' + w.name }, icon('call', 14), 'Обади се')),
          h('small', null, [w.phone, `чака от ${fmtDate(w.at.slice(0, 10))}`, w.note].filter(Boolean).join(' · '))),
        h('button', { class: 'icon-btn plain', 'aria-label': 'Махни', onclick: () => { store.updateProfile({ waitlist: (profile.waitlist || []).filter((x) => x.id !== w.id) }); redraw(); } }, icon('x', 18))))
        : h('p', { class: 'muted' }, 'Шофьори, които искат кола. Когато някоя се освободи, виждаш кой е чакал пръв.')),

    // Отчети: седмичният (и денят му) и Excel за счетоводителя
    cars.length > 0 && h('section', { class: 'card fs-reports' },
      cardTitle('chart', 'Отчети'),
      h('button', { class: 'rep-row', onclick: () => reportSheet(infos) }, icon('calendar', 18), h('span', { class: 'grow' }, h('b', null, 'Последните 7 дни'), h('small', null, 'км, часове, дни и кой е карал – по кола')), icon('right', 16)),
      h('button', { class: 'rep-row', onclick: () => accountantSheet(infos) }, icon('download', 18), h('span', { class: 'grow' }, h('b', null, 'Excel за счетоводителя'), h('small', null, 'наем, разходи и печалба по коли за месец')), icon('right', 16)),
      h('p', { class: 'faint small' }, 'Седмичният идва като известие всеки ', h('button', { class: 'link-btn', onclick: () => daySheet(profile, redraw) }, (WEEKDAYS[(profile.reportDay ?? 1) === 0 ? 6 : (profile.reportDay ?? 1) - 1] || 'Понеделник').toLowerCase()), ' сутрин.')));
}

// „Днес“: първите 5, останалите – с „Още“
function todayRows(items) {
  const box = h('div', { class: 'td-list' });
  const row = (it) => h('div', { class: cx('td-row', it.cls) },
    h('span', { class: 'td-ic' }, icon(it.ic, 16)),
    h('span', { class: 'grow' }, h('b', null, it.t), h('small', null, it.s)),
    it.acts.length > 0 && h('div', { class: 'td-acts' }, it.acts.map(([l, fn]) => h('button', { class: 'chip page', onclick: fn }, l))));
  const draw = (all) => box.replaceChildren(...(all ? items : items.slice(0, 5)).map(row),
    !all && items.length > 5 ? h('button', { class: 'td-more', onclick: () => draw(true) }, `Още ${items.length - 5}`, icon('down', 14)) : '');
  draw(false);
  return box;
}

function waitSheet(redraw) {
  const name = h('input', { class: 'input', placeholder: 'Име' });
  const phone = h('input', { class: 'input', type: 'tel', placeholder: '08…' });
  const note = h('input', { class: 'input', placeholder: 'напр. иска кола на газ, нощна смяна' });
  openSheet((close) => h('div', { class: 'form' },
    sheetHead('Чакащ шофьор', close),
    field('Име', name, null, true), field('Телефон', phone, 'За да му звъннеш с едно натискане'), field('Бележка', note),
    h('button', { class: 'btn btn-primary btn-lg', onclick: () => { if (!name.value.trim()) return; const p = store.getProfile() || {}; store.updateProfile({ waitlist: [...(p.waitlist || []), { id: Math.random().toString(36).slice(2, 9), name: name.value.trim(), phone: phone.value.trim(), note: note.value.trim(), at: new Date().toISOString() }] }); close(); toast('Добавен'); redraw(); } }, icon('check', 18), 'Добави')));
}
function daySheet(profile, redraw) {
  const days = { 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб', 0: 'Нд' };
  openSheet((close) => h('div', null, sheetHead('Ден за седмичния отчет', close, 'Известието идва в 10:00 сутринта.'),
    segmented(days, String(profile.reportDay ?? 1), (k) => { store.updateProfile({ reportDay: Number(k) }); close(); toast('Запазено'); redraw(); }, { page: true })));
}
// Отчетът за последните 7 дни – по кола
export function reportSheet(infos) {
  const today = todayStr(), from = addDays(today, -7), to = addDays(today, -1);
  openSheet((close) => h('div', null, sheetHead('Последните 7 дни', close, `${fmtDate(from)} – ${fmtDate(to)}`),
    infos.map((i) => {
      const list = i.shifts.filter((s) => s.end && s.start.slice(0, 10) >= from && s.start.slice(0, 10) <= to);
      const by = {};
      for (const s of list) { const b = by[s.userId] ||= { km: 0, h: 0, days: new Set() }; b.km += Math.max(0, (s.kmEnd || 0) - (s.kmStart || 0)); b.h += Math.max(0, (new Date(s.end) - new Date(s.start)) / 36e5); b.days.add(s.start.slice(0, 10)); }
      const km = Object.values(by).reduce((a, b) => a + b.km, 0), hh = Object.values(by).reduce((a, b) => a + b.h, 0);
      const dset = new Set(list.map((s) => s.start.slice(0, 10)));
      return h('div', { class: 'blk' },
        h('div', { class: 'blk-h' }, h('b', null, carName(i.car)), h('span', null, `${fmtNum(km)} км · ${fmtDuration(hh)} · ${dset.size} дни`)),
        Object.keys(by).length ? Object.entries(by).map(([uid2, b]) => h('div', { class: 'hist-row' }, h('span', null, i.users[uid2]?.name || '—'), h('small', null, `${fmtNum(b.km)} км · ${fmtDuration(b.h)} · ${b.days.size} дни`))) : h('p', { class: 'muted small' }, 'Не е карана.'));
    })), { tall: true });
}
