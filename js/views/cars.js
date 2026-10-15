// Обща кола и автопарк.
// Собственикът създава колата, кани шофьори с линк и вижда техните км, часове, работни дни и смени (без пари).
// Лична кола: общите разходи (застраховки, ремонти…) се делят по дялове, които собственикът настройва.
// Кола под наем: собственикът задава наема на всеки шофьор; разходите по колата са негови.
import { h, icon, cx, money, fmtDate, fmtDuration, fmtNum, todayStr, startOfMonth, endOfMonth, MONTHS, parseDate } from '../util.js';
import * as store from '../store.js';
import { serviceState, serviceSheet, serviceText, adSheet } from './fleetplus.js';
import { fixedCostSheet, setupCostSheet, deadlineSheet, removeDeadline, paymentsList, payRow, perText } from './fleetcosts.js';
import { costMonthly } from '../calc.js';
import { openSheet, sheetHead, toast, field, cardTitle, segmented, confirmSheet, empty, topSearch } from '../ui.js';
import { costCat } from '../constants.js';
import { editCost } from './costs.js';
import { dlLabel, dlSheet } from './fleetui.js';
import { carInfo, statusChip, statusSheet, quickAdd, recordSheet, carVoice, driverSheet, remind, rentSheet, handoverSheet, carDocsSheet, myCarCard, damageSheet, logRow, carName, shortName, first, leftText, face, STATUS, RENT_PERIODS } from './fleetui.js';
import { carProfit, payback, initialSum } from '../fleet.js';
export { fleetHomeView } from './fleethome.js';

const TYPE = { own: 'Лична кола', rent: 'Кола под наем' };
const PERIOD = { day: 'на ден', week: 'на седмица', month: 'на месец' };
const linkOf = (car) => `${location.origin}/app#/join/${car.invite}`;

export function carsView(ctx) {
  const { route } = ctx;
  return route.param ? carDetail(ctx, route.param) : carsList(ctx);
}

// ---------- Списък ----------
function carsList({ go, data, user, route }) {
  const cars = store.myCars();
  if (route?.query?.get('new') === '1') setTimeout(() => { history.replaceState(null, '', '#/cars'); newCarSheet(go); }, 50);
  const code = h('input', { class: 'input', placeholder: 'Код от собственика, напр. K7X2QA9M', autocapitalize: 'characters' });
  return h('div', { class: 'screen', 'data-page': 'cars' },
    h('div', { class: 'page-title' }, h('h1', null, 'Обща кола')),
    h('p', { class: 'muted', style: { margin: '-6px 0 14px' } }, 'Кола с няколко шофьори или коли, които даваш под наем. Каниш с линк, всеки отчита своето.'),
    cars.length
      ? h('div', { class: 'car-list' }, cars.map((c) => {
        const mine = c.ownerId === user.id;
        const drivers = (c.members || []).filter((m) => m.userId !== c.ownerId).length;
        return h('a', { class: 'card car-item', href: '#/cars/' + c.id },
          h('span', { class: 'ci-ic' }, icon(c.type === 'rent' ? 'key' : 'users', 20)),
          h('span', { class: 'grow' },
            h('b', null, [c.name, c.plate].filter(Boolean).join(' · ') || 'Кола'),
            h('small', null, `${TYPE[c.type]} · ${mine ? 'ти си собственик' : 'караш я'}${mine ? ` · ${drivers} ${drivers === 1 ? 'шофьор' : 'шофьори'}` : ''}`)),
          icon('right', 18));
      }))
      : h('section', { class: 'card' }, empty('car', 'Още няма обща кола', 'Добави кола и покани шофьорите с линк – или въведи код, ако някой те е поканил.')),
    h('button', { class: 'btn btn-primary btn-block', style: { marginTop: '14px' }, onclick: () => newCarSheet(go) }, icon('plus', 18), 'Добави кола'),
    h('section', { class: 'card', style: { marginTop: '14px' } },
      cardTitle('key', 'Имаш код за покана?'),
      h('div', { class: 'row gap' }, code,
        h('button', { class: 'btn btn-dark', onclick: () => { if (code.value.trim()) go('/join/' + code.value.trim()); } }, 'Влез'))));
}

function newCarSheet(go) {
  let type = store.isFleet(store.getProfile()) ? 'rent' : 'own';
  let photo = null;
  const name = h('input', { class: 'input', placeholder: 'напр. Hyundai Elantra' });
  const year = h('input', { class: 'input', inputmode: 'numeric', placeholder: '2019' });
  const plate = h('input', { class: 'input', placeholder: 'напр. РВ 1827 ХЕ', autocapitalize: 'characters' });
  const err = h('p', { class: 'err' });
  openSheet((close) => {
    const seg = h('div');
    const note = h('p', { class: 'muted small' });
    const ph = h('div');
    const drawPh = () => ph.replaceChildren(h('button', { type: 'button', class: cx('car-photo-pick', photo && 'has'), onclick: async () => {
      const { pickImage } = await import('./categories.js');
      const img = await pickImage({ max: 1200, aspect: 16 / 10, title: 'Изрежи снимката на колата' }); if (img) { photo = img; drawPh(); }
    } }, photo ? h('img', { src: photo, alt: '' }) : [icon('camera', 22), h('span', null, 'Снимка на колата (по желание)')]));
    const draw = () => {
      seg.replaceChildren(segmented(TYPE, type, (t) => { type = t; draw(); }, { small: true, page: true }));
      note.textContent = type === 'own'
        ? 'Караш я ти и други шофьори. Общите разходи се делят по дялове.'
        : 'Даваш я под наем. После добавяш постоянните разходи – сроковете излизат сами от тях.';
    };
    draw(); drawPh();
    return h('div', { class: 'form' },
      sheetHead('Нова кола', close),
      h('div', { class: 'field' }, seg, note),
      ph,
      h('button', { class: 'btn btn-ghost btn-block talon-btn', type: 'button', onclick: async () => {
        const { scanTalon } = await import('../talon.js');
        scanTalon((r) => { const mm = [r.make, r.model].filter(Boolean).join(' '); if (mm) name.value = mm; if (r.year) year.value = String(r.year); if (r.plate) plate.value = r.plate.toUpperCase(); });
      } }, icon('camera', 18), 'Снимай талона – попълва се само'),
      h('div', { class: 'grid2 grid-mm' }, field('Марка и модел', name), field('Година', year)),
      field('Рег. номер', plate, 'Задължително – по него се търси колата', true),
      err,
      h('button', { class: 'btn btn-primary btn-lg', onclick: () => {
        if (!plate.value.trim()) { err.textContent = 'Регистрационният номер е задължителен'; return; }
        const c = store.createCar({ type, name: name.value.trim(), plate: plate.value.trim().toUpperCase() });
        try { store.updateCar(c.id, { year: year.value.trim() || null, photo }); } catch { /* снимката е голяма */ }
        close(); toast('Колата е добавена'); go('/cars/' + c.id);
      } }, icon('check', 18), 'Добави'));
  }, { tall: true });
}

// ---------- Една кола ----------
function carDetail({ go, data, user, rerender }, id) {
  const car = store.myCars().find((c) => c.id === id);
  if (!car) return h('div', { class: 'screen' }, h('section', { class: 'card' }, empty('car', 'Няма такава кола', 'Може да си махнат от нея.')));
  const redraw = rerender || (() => go('/cars/' + id));
  const owner = car.ownerId === user.id;
  const today = todayStr();
  const from = startOfMonth(today), to = endOfMonth(today);
  const drivers = store.carDrivers(car.id, from, to);
  const info = carInfo(car, today);
  const costs = info.costs.filter((c) => c.period !== 'once' && (!c.endDate || c.endDate >= today));
  const once = info.costs.filter((c) => c.period === 'once').sort((a, b) => b.startDate.localeCompare(a.startDate));
  const me = (car.members || []).find((m) => m.userId === user.id);
  const monthName = MONTHS[parseDate(today).getMonth()];
  const st = info.status;
  if (owner && car.type === 'rent') return rentCarView({ go, user, car, info, redraw, today, from, to, drivers, monthName });

  const head = [h('div', { class: 'page-title car-head' }, h('div', null, h('h1', null, car.name || car.plate || 'Кола'),
      h('p', { class: 'muted' }, [car.plate, TYPE[car.type], owner ? 'ти си собственик' : null].filter(Boolean).join(' · '))),
    owner && statusChip(st, () => statusSheet(car, redraw))),
    owner && h('div', { class: 'car-acts' },
      h('button', { class: 'btn btn-primary', onclick: () => quickAdd(info, redraw) }, icon('plus', 18), 'Запиши'),
      h('button', { class: 'btn btn-dark', onclick: () => carVoice(info, redraw) }, icon('mic', 18), 'Кажи'),
      h('button', { class: 'btn btn-ghost', onclick: () => carDocsSheet(car, redraw) }, icon('edit', 16), 'Данни'),
      car.type === 'rent' && (st === 'free' || st === 'idle') && h('button', { class: 'btn btn-ghost', onclick: () => adSheet(info) }, icon('share', 16), 'Обява'))];

  // Пари по колата – само за собственика
  const year = today.slice(0, 4);
  const pm = owner && carProfit(info.costs, info.logs, from, today);
  const py = owner && carProfit(info.costs, info.logs, `${year}-01-01`, today);
  const pb = owner && payback(car, info.costs, info.logs, today);
  const moneyCard = owner && car.type === 'rent' && h('section', { class: 'card car-money' },
    cardTitle('coins', `Печалба · ${monthName}`),
    h('div', { class: cx('big-num', pm.net >= 0 ? 'pos' : 'neg') }, `${pm.net >= 0 ? '+' : '−'}${money(Math.abs(pm.net))}`),
    h('p', { class: 'muted small' }, `събран наем ${money(pm.income)} · разходи ${money(pm.expense)} · за ${year} г.: ${py.net >= 0 ? '+' : '−'}${money(Math.abs(py.net))}`),
    pb ? h('div', { class: 'payback' },
      h('div', { class: 'pb-top' }, h('b', null, 'Изплащане на колата'), h('span', null, `${fmtNum(pb.pct)}%`)),
      h('div', { class: 'pb-bar' }, h('i', { style: { width: `${pb.pct}%` } })),
      h('small', { class: 'muted' }, pb.left <= 0 ? `Колата е изплатена – ${money(pb.done)} от ${money(pb.price)}` : pb.done <= 0 ? `Печалбата от покупката досега е ${money(pb.done)} – още не е започнала да се изплаща` : `${money(pb.done)} от ${money(pb.price)} · остават ${money(pb.left)}${pb.months && pb.months <= 120 ? ` · ~${pb.months} мес. при сегашния темп` : ''}`))
      : h('button', { class: 'link-btn', onclick: () => carDocsSheet(car, redraw) }, 'Въведи покупната цена, за да видиш кога се изплаща колата'));

  // Чакащи потвърждение „Платих“
  const pend = owner && info.pendings.length > 0 && h('section', { class: 'card pend-card' },
    cardTitle('bell', 'Чакат потвърждение'),
    info.pendings.map((l) => h('div', { class: 'hist-row' }, h('span', null, first(info.users[l.driverId]?.name)), h('b', null, money(l.amount, l.amount % 1 ? 2 : 0)), h('small', null, fmtDate(l.date)),
      h('button', { class: 'chip page', onclick: () => { store.confirmPay(l.id); toast('Потвърдено'); redraw(); } }, icon('check', 14), 'Потвърди'))));

  // Покана с линк – само собственикът
  const invite = owner && h('section', { class: 'card invite-car' },
    cardTitle('users', 'Покани шофьор'),
    h('div', { class: 'inv-link' }, h('code', null, linkOf(car))),
    h('div', { class: 'row gap inv-acts' },
      h('button', { class: 'btn btn-dark', onclick: async () => { try { await navigator.clipboard.writeText(linkOf(car)); toast('Линкът е копиран'); } catch { toast('Копирай линка ръчно'); } } }, icon('copy', 16), 'Копирай'),
      navigator.share && h('button', { class: 'btn btn-ghost', onclick: () => navigator.share({ title: 'Покана за колата', text: `Покана за ${car.name || 'колата'} в „Чисто“`, url: linkOf(car) }).catch(() => {}) }, icon('share', 16), 'Изпрати'),
      h('button', { class: 'btn btn-ghost', onclick: () => confirmSheet({ title: 'Нов линк?', text: 'Старият линк спира да работи. Шофьорите, които вече са в колата, остават.', okLabel: 'Нов линк', onOk: () => { store.newInvite(car.id); redraw(); } }) }, 'Нов линк')),
    h('p', { class: 'faint small' }, `Код: ${car.invite} · шофьорът отваря линка и колата излиза при него`));

  // Шофьорите: км, часове, дни, смени (+ гориво при лична кола), наемът и дългът – без приходите им
  const others = drivers.filter((d) => !(owner && d.userId === user.id && car.type === 'rent'));
  const fuelOf = (uid2) => info.shifts.filter((s) => s.userId === uid2 && s.end && s.start.slice(0, 10) >= from && s.start.slice(0, 10) <= to).reduce((a, s) => ({ amount: a.amount + (s.fuel?.amount ?? (s.expenses || []).filter((e) => e.category === 'fuel').reduce((x, e) => x + (Number(e.amount) || 0), 0)), qty: a.qty + (s.fuel?.qty ?? (s.expenses || []).filter((e) => e.category === 'fuel').reduce((x, e) => x + (Number(e.qty) || 0), 0)) }), { amount: 0, qty: 0 });
  const driversCard = h('section', { class: 'card' },
    cardTitle('users', `Шофьори · ${monthName}`, owner && car.type === 'rent' && info.rents.some((x) => x.r.debt > 0) && h('button', { class: 'chip page', onclick: () => { remind(car, info.rents.filter((x) => x.r.debt > 0).map((x) => ({ userId: x.m.userId, amount: x.r.debt }))); redraw(); } }, icon('bell', 14), 'Напомни')),
    others.length ? h('div', { class: 'drv-list' }, others.map((d) => {
      const rr = info.rents.find((x) => x.m.userId === d.userId)?.r;
      const fuel = car.type === 'own' && d.userId !== user.id ? fuelOf(d.userId) : null;
      const rentLine = d.userId === car.ownerId ? `дял от разходите ${fmtNum(d.share || 0)}%`
        : d.rent?.amount ? `${car.type === 'own' ? 'плаща' : 'наем'} ${money(d.rent.amount)} ${RENT_PERIODS[d.rent.period] || ''}` : car.type === 'rent' ? 'наемът не е зададен' : `дял от разходите ${fmtNum(d.share || 0)}%`;
      return h(owner && d.userId !== user.id ? 'button' : 'div', { class: cx('drv-row', owner && 'tap'), onclick: owner && d.userId !== user.id ? () => driverSheet(info, d.userId, redraw) : null },
        face(d),
        h('div', { class: 'grow' },
          h('b', null, d.name + (d.userId === user.id ? ' (ти)' : ''), d.slot ? h('span', { class: 'slot' }, { day: 'ден', night: 'нощ', all: 'цял ден' }[d.slot]) : null),
          h('div', { class: 'drv-nums' },
            h('span', null, h('b', null, fmtNum(d.km)), ' км'),
            h('span', null, h('b', null, fmtDuration(d.hours))),
            h('span', null, h('b', null, String(d.days)), d.days === 1 ? ' ден' : ' дни'),
            h('span', null, h('b', null, String(d.shifts)), d.shifts === 1 ? ' смяна' : ' смени'),
            fuel && fuel.amount > 0 && h('span', null, h('b', null, money(fuel.amount)), ' гориво', fuel.qty ? ` · ${fmtNum(fuel.qty)} л` : '')),
          h('small', { class: 'muted' }, [rentLine, owner && rr && d.userId !== user.id && rr.periods.length ? (rr.debt > 0 ? null : rr.advance > 0 ? `аванс ${money(rr.advance)}` : 'платено') : null, d.last ? `последна смяна ${fmtDate(d.last.slice(0, 10))}` : 'още няма смени'].filter(Boolean).join(' · ')),
          owner && rr && rr.debt > 0 && h('small', { class: 'neg b' }, `дължи ${money(rr.debt, rr.debt % 1 ? 2 : 0)}${rr.late ? ` · просрочено ${rr.lateDays} ${rr.lateDays === 1 ? 'ден' : 'дни'}` : ' · днес'}`)),
        owner && d.userId !== user.id && icon('right', 18));
    })) : h('p', { class: 'muted' }, owner ? 'Още няма шофьори. Прати им линка отдолу.' : 'Само ти си в колата.'),
    owner && car.type === 'own' && (car.members || []).length > 1 && h('button', { class: 'btn btn-ghost btn-block', style: { marginTop: '10px' }, onclick: () => sharesSheet(car, drivers, redraw) }, '% от разходите'),
    owner && info.gaps.gap > 0 && h('p', { class: 'gap-line' }, icon('alert', 15), `Неотчетени ${fmtNum(info.gaps.gap)} км – началният километраж на смяна е по-голям от крайния на предишната.`),
    h('p', { class: 'faint small drv-note' }, car.type === 'own' ? 'Без приходите на шофьорите.' : 'Без приходите на шофьорите · натисни шофьор за наем, депозит, договор.'));

  // Срокове: застраховки, винетка, преглед, лиценз, тахограф – и документите на шофьорите
  const dls = owner ? info.deadlines.filter((x) => x.left <= 60) : [];
  const dlCard = owner && h('section', { class: 'card' },
    cardTitle('calendar', 'Срокове', h('button', { class: 'chip page', onclick: () => carDocsSheet(car, redraw) }, icon('edit', 14), 'Смени')),
    dls.length ? dls.map((x) => h('div', { class: 'cc-row' }, h('span', { class: cx('cc-ic', x.left < 0 ? 'bad' : x.left <= 3 ? 'bad' : x.left <= 14 ? 'warn' : '') }, icon(x.kind === 'driver' ? 'user' : 'shield', 17)),
      h('span', { class: 'grow' }, h('b', null, x.title), h('small', { class: x.left <= 3 ? 'neg' : x.left <= 14 ? 'warn' : '' }, `${fmtDate(x.date)} · ${leftText(x.left)}`)),
      x.amount ? h('b', { class: 'num' }, money(x.amount)) : null,
      x.costId && h('button', { class: 'chip page', onclick: () => { store.markCostPaid(x.costId); toast('Платено – следващият падеж е преместен'); redraw(); } }, 'Платено')))
      : h('p', { class: 'muted' }, info.deadlines.length ? 'Нищо не изтича в следващите 60 дни.' : `Добави до кога са ГО, каско, винетка, преглед, лиценз и тахограф – напомняме ${dlLabel()} преди това.`),
    (() => { const sv = serviceState(info); return h('button', { class: 'cc-row svc-row', type: 'button', onclick: () => serviceSheet(info, redraw) },
      h('span', { class: cx('cc-ic', sv && (sv.left <= 0 ? 'bad' : sv.left <= 1000 ? 'warn' : '')) }, icon('wrench', 17)),
      h('span', { class: 'grow' }, h('b', null, 'Обслужване по километраж'),
        sv ? [h('small', { class: sv.left <= 0 ? 'neg' : sv.left <= 1000 ? 'warn' : '' }, `${serviceText(sv)} · на ${fmtNum(sv.next)} км`), h('span', { class: 'svc-bar' }, h('i', { style: { width: `${sv.pct}%` } }))]
          : h('small', null, 'Масло и филтри на всеки N км – натисни да настроиш')),
      icon('right', 16)); })(),
    h('button', { class: 'dl-set', type: 'button', onclick: () => dlSheet(redraw) }, icon('bell', 14), `Напомняне ${dlLabel()} преди`, icon('right', 14)));

  // Разходите на колата
  const costsCard = (owner || car.type === 'own') && h('section', { class: 'card' },
    cardTitle('wrench', car.type === 'own' ? 'Общи разходи на колата' : 'Разходи по колата',
      owner && h('button', { class: 'chip page', onclick: () => addCarCost(car, data, redraw) }, icon('plus', 14), 'Постоянен')),
    costs.length ? h('div', { class: 'car-costs' }, costs.map((c) => {
      const cat = costCat(c.category);
      const myPart = car.type === 'own' && me ? c.amount * (Number(me.share) || 0) / 100 : null;
      return h(owner ? 'button' : 'div', { class: 'cc-row', onclick: owner ? () => editCost({ ...c }, carData(data)) : null },
        h('span', { class: 'cc-ic' }, icon(cat.icon, 18)),
        h('span', { class: 'grow' }, h('b', null, c.name), h('small', null, [c.dueDate ? `следващо плащане ${fmtDate(c.dueDate)}` : null, myPart != null ? `твоят дял ${money(myPart, 2)}` : null].filter(Boolean).join(' · '))),
        h('b', { class: 'num' }, `${money(c.amount, c.amount % 1 ? 2 : 0)} ${({ week: '/седм.', month: '/мес.', quarter: '/3 мес.', year: '/год.' })[c.period] || ''}`));
    })) : h('p', { class: 'muted' }, owner ? 'Застраховки, винетка, преглед, данък МПС – с падежи и напомняния.' : 'Собственикът още не е добавил общи разходи.'),
    once.length > 0 && h('div', { class: 'car-costs once' }, h('small', { class: 'faint' }, 'Еднократни'), once.slice(0, 8).map((c) => h('div', { class: 'cc-row' },
      h('span', { class: 'cc-ic' }, icon(costCat(c.category).icon, 17)), h('span', { class: 'grow' }, h('b', null, c.name), h('small', null, fmtDate(c.startDate))), h('b', { class: 'num' }, money(c.amount, c.amount % 1 ? 2 : 0)),
      owner && h('button', { class: 'icon-btn plain', 'aria-label': 'Изтрий', onclick: () => confirmSheet({ title: 'Да изтрия ли разхода?', okLabel: 'Изтрий', danger: true, onOk: () => { store.deleteCost(c.id, { from: '1900-01-01' }); redraw(); } }) }, icon('trash', 15))))),
    car.type === 'own' && me && h('p', { class: 'faint small', style: { marginTop: '8px' } }, `Твоят дял е ${fmtNum(me.share || 0)}% – влиза сам в твоите постоянни разходи.`));

  // Дневник
  const shown = info.logs.filter((l) => owner || l.driverId === user.id || l.by === user.id).slice(0, 40);
  const logBox = h('div');
  const drawLog = (all) => logBox.replaceChildren(...(all ? shown : shown.slice(0, 5)).map((l) => logRow(l, info, redraw)),
    !all && shown.length > 5 ? h('button', { class: 'td-more', onclick: () => drawLog(true) }, `Още ${shown.length - 5}`, icon('down', 14)) : '');
  drawLog(false);
  const logCard = shown.length > 0 && h('section', { class: 'card' }, cardTitle('list', 'Дневник на колата'), logBox);

  // За шофьора, който кара колата
  const mine = !owner && me && myCarCard(car, user, redraw);

  const danger = h('div', { class: 'car-danger' },
    owner
      ? h('button', { class: 'btn btn-ghost btn-block', onclick: () => confirmSheet({ title: 'Да изтрия ли колата?', text: 'Шофьорите спират да я виждат, общите ѝ разходи се махат. Смените на всеки остават при него.', okLabel: 'Изтрий', danger: true, onOk: () => { store.deleteCar(car.id); go('/cars'); } }) }, icon('trash', 16), 'Изтрий колата')
      : h('button', { class: 'btn btn-ghost btn-block', onclick: () => confirmSheet({ title: 'Да изляза ли от колата?', text: 'Спираш да я виждаш и общите ѝ разходи вече не са твои.', okLabel: 'Излез', danger: true, onOk: () => { store.leaveCar(car.id); go('/cars'); } }) }, 'Излез от колата'));

  return h('div', { class: 'screen', 'data-page': 'cars' }, ...head, mine, pend, moneyCard, driversCard, dlCard, costsCard, logCard, invite, danger);
}

// ---------- Кола под наем (собственикът): голям „Запиши“, падащи разходи, срокове и плащания ----------
// Падащо поле: заглавие + кратко обобщение; отваря се с натискане
function acc(cls, title, summary, open, ...body) {
  return h('details', { class: cx('card acc', cls), open: open || null },
    h('summary', null, h('span', { class: 'grow' }, h('b', null, title), summary && h('small', null, summary)), icon('down', 18)),
    h('div', { class: 'acc-body' }, ...body));
}
function rentCarView({ go, user, car, info, redraw, today, from, drivers, monthName }) {
  const st = info.status;
  const year = today.slice(0, 4);
  const pm = carProfit(info.costs, info.logs, from, today);
  const py = carProfit(info.costs, info.logs, `${year}-01-01`, today);
  const pb = payback(car, info.costs, info.logs, today);
  const fixed = info.costs.filter((c) => c.period !== 'once' && (!c.endDate || c.endDate >= today)).sort((a, b) => String(a.dueDate || '9').localeCompare(String(b.dueDate || '9')));
  const setup = info.costs.filter((c) => c.initial).sort((a, b) => b.startDate.localeCompare(a.startDate));
  const perMonth = fixed.reduce((a, c) => a + costMonthly(c, {}), 0);
  const dls = info.deadlines.filter((x) => x.kind !== 'driver' || x.left <= 60);
  const soon = dls.filter((x) => x.left <= 14);
  const sv = serviceState(info);

  const head = h('div', { class: 'page-title car-head rent-head' },
    car.photo && h('img', { class: 'car-thumb', src: car.photo, alt: '' }),
    h('div', { class: 'grow' }, h('h1', null, car.name || car.plate || 'Кола'),
      h('div', { class: 'ch-sub' }, h('span', { class: 'muted' }, [car.plate, car.year].filter(Boolean).join(' · ')), statusChip(st, () => statusSheet(car, redraw)))),
    h('button', { class: 'icon-btn', 'aria-label': 'Данни на колата', onclick: () => carDocsSheet(car, redraw) }, icon('edit', 18)));
  // Голям „Запиши“ – ползва се най-често
  const rec = h('button', { class: 'btn btn-primary rec-big', onclick: () => quickAdd(info, redraw) },
    h('span', { class: 'rb-ic' }, icon('plus', 24)), h('span', { class: 'grow' }, h('b', null, 'Запиши'), h('small', null, 'плащане, разход, глоба, щета… или с глас')));
  const ad = (st === 'free' || st === 'idle') && h('button', { class: 'btn btn-ghost btn-block ad-btn', onclick: () => adSheet(info) }, icon('share', 16), 'Обява за колата – намери шофьор');

  const pend = info.pendings.length > 0 && h('section', { class: 'card pend-card' },
    cardTitle('bell', 'Чакат потвърждение'),
    info.pendings.map((l) => h('div', { class: 'hist-row' }, h('span', null, first(info.users[l.driverId]?.name)), h('b', null, money(l.amount, l.amount % 1 ? 2 : 0)), h('small', null, fmtDate(l.date)),
      h('button', { class: 'chip page', onclick: () => { store.confirmPay(l.id); toast('Потвърдено'); redraw(); } }, icon('check', 14), 'Потвърди'))));

  const moneyCard = h('section', { class: 'card car-money' },
    h('div', { class: 'cm-top' }, h('span', null, `Печалба · ${monthName}`), h('b', { class: cx('big-num', pm.net >= 0 ? 'pos' : 'neg') }, `${pm.net >= 0 ? '+' : '−'}${money(Math.abs(pm.net))}`)),
    h('p', { class: 'muted small' }, `наем ${money(pm.income)} − разходи ${money(pm.expense)} · ${year} г.: ${py.net >= 0 ? '+' : '−'}${money(Math.abs(py.net))}`),
    pb ? h('div', { class: 'payback' },
      h('div', { class: 'pb-top' }, h('b', null, 'Изплащане на колата'), h('span', null, `${fmtNum(pb.pct)}%`)),
      h('div', { class: 'pb-bar' }, h('i', { style: { width: `${pb.pct}%` } })),
      h('small', { class: 'muted' }, pb.left <= 0 ? `Изплатена – ${money(pb.done)} от ${money(pb.price)}` : `${money(Math.max(0, pb.done))} от ${money(pb.price)}${pb.setup ? ` (кола ${money(pb.buy)} + първоначални ${money(pb.setup)})` : ''}${pb.months && pb.months <= 120 ? ` · ~${pb.months} мес.` : ''}`))
      : h('button', { class: 'link-btn', onclick: () => carDocsSheet(car, redraw) }, 'Въведи покупната цена – ще видиш кога се изплаща колата'),
    h('p', { class: 'faint small cm-note' }, 'Постоянните разходи се смятат по дни: 600 € за 3 месеца ≈ 6,60 € на ден.'));

  // Шофьорите
  const others = drivers.filter((d) => d.userId !== user.id);
  const driversCard = h('section', { class: 'card' },
    cardTitle('users', `Шофьори · ${monthName}`, info.rents.some((x) => x.r.debt > 0) && h('button', { class: 'chip page', onclick: () => { remind(car, info.rents.filter((x) => x.r.debt > 0).map((x) => ({ userId: x.m.userId, amount: x.r.debt }))); redraw(); } }, icon('bell', 14), 'Напомни')),
    others.length ? h('div', { class: 'drv-list' }, others.map((d) => {
      const rr = info.rents.find((x) => x.m.userId === d.userId)?.r;
      return h('button', { class: 'drv-row tap', onclick: () => driverSheet(info, d.userId, redraw) },
        face(d),
        h('div', { class: 'grow' },
          h('b', null, d.name, d.slot ? h('span', { class: 'slot' }, { day: 'ден', night: 'нощ', all: 'цял ден' }[d.slot]) : null),
          h('div', { class: 'drv-nums' }, h('span', null, h('b', null, fmtNum(d.km)), ' км'), h('span', null, h('b', null, fmtDuration(d.hours))), h('span', null, h('b', null, String(d.days)), d.days === 1 ? ' ден' : ' дни')),
          h('small', { class: 'muted' }, [d.rent?.amount ? `наем ${money(d.rent.amount)} ${RENT_PERIODS[d.rent.period] || ''}` : 'наемът не е зададен', rr && rr.periods.length && !(rr.debt > 0) ? (rr.advance > 0 ? `аванс ${money(rr.advance)}` : 'платено') : null].filter(Boolean).join(' · ')),
          rr && rr.debt > 0 && h('small', { class: 'neg b' }, `дължи ${money(rr.debt, rr.debt % 1 ? 2 : 0)}${rr.late ? ` · просрочено ${rr.lateDays} ${rr.lateDays === 1 ? 'ден' : 'дни'}` : ' · днес'}`)),
        icon('right', 18));
    })) : h('p', { class: 'muted' }, 'Още няма шофьори – прати линка от „Покани шофьор“.'),
    info.gaps.gap > 0 && h('p', { class: 'gap-line' }, icon('alert', 15), `Неотчетени ${fmtNum(info.gaps.gap)} км между смените.`));

  // Постоянни разходи – първо те; сроковете идват от тях
  const fixedAcc = acc('acc-fixed', 'Постоянни разходи', fixed.length ? `${fixed.length} · ~${money(perMonth)} на месец` : 'Добави ги първо – сроковете излизат сами', !fixed.length,
    fixed.map((c) => h('button', { class: 'cc-row', type: 'button', onclick: () => fixedCostSheet(car, c, redraw) },
      h('span', { class: 'cc-ic' }, icon(costCat(c.category).icon, 17)),
      h('span', { class: 'grow' }, h('b', null, c.name), h('small', null, c.dueDate ? `следващо плащане ${fmtDate(c.dueDate)}` : 'без дата')),
      h('b', { class: 'num' }, `${money(c.amount, c.amount % 1 ? 2 : 0)}${perText(c)}`))),
    h('button', { class: 'btn btn-ghost btn-block acc-add', onclick: () => fixedCostSheet(car, null, redraw) }, icon('plus', 16), 'Добави постоянен разход'));

  // Срокове – от разходите + на ръка; всеки може да се махне
  const dlAcc = acc('acc-dl', 'Срокове', dls.length ? (soon.length ? `${soon.length} изтичат до 14 дни · ${dls[0].title} – ${leftText(dls[0].left)}` : `${dls.length} · следващ: ${dls[0].title}, ${fmtDate(dls[0].date)}`) : 'Идват сами от постоянните разходи', soon.length > 0,
    dls.length ? dls.map((x) => h('div', { class: 'cc-row dl-row' },
      h('span', { class: cx('cc-ic', x.left <= 3 ? 'bad' : x.left <= 14 ? 'warn' : '') }, icon(x.kind === 'driver' ? 'user' : x.kind === 'cost' ? 'calendar' : 'shield', 16)),
      h('button', { class: 'grow plain-btn', type: 'button', onclick: x.kind === 'cost' ? () => fixedCostSheet(car, info.costs.find((c) => c.id === x.costId), redraw) : null },
        h('b', null, x.title), h('small', { class: x.left <= 3 ? 'neg' : x.left <= 14 ? 'warn' : '' }, `${fmtDate(x.date)} · ${leftText(x.left)}${x.amount ? ' · ' + money(x.amount) : ''}`)),
      x.costId && h('button', { class: 'chip page', onclick: () => { store.markCostPaid(x.costId); toast('Платено – следващият срок е преместен'); redraw(); } }, 'Платено'),
      x.kind !== 'driver' && h('button', { class: 'icon-btn plain', 'aria-label': 'Махни от сроковете', onclick: () => removeDeadline(car, x, info.costs, redraw) }, icon('x', 16))))
      : h('p', { class: 'muted small' }, 'Добави постоянните разходи (застраховки, винетка, преглед…) – датата на следващото плащане става срок сама.'),
    h('button', { class: 'cc-row svc-row', type: 'button', onclick: () => serviceSheet(info, redraw) },
      h('span', { class: cx('cc-ic', sv && (sv.left <= 0 ? 'bad' : sv.left <= 1000 ? 'warn' : '')) }, icon('wrench', 16)),
      h('span', { class: 'grow' }, h('b', null, 'Обслужване по километраж'),
        sv ? [h('small', { class: sv.left <= 0 ? 'neg' : sv.left <= 1000 ? 'warn' : '' }, `${serviceText(sv)} · на ${fmtNum(sv.next)} км`), h('span', { class: 'svc-bar' }, h('i', { style: { width: `${sv.pct}%` } }))]
          : h('small', null, 'Масло и филтри на всеки N км')),
      icon('right', 16)),
    h('div', { class: 'row gap acc-foot' },
      h('button', { class: 'btn btn-ghost', onclick: () => deadlineSheet(car, redraw) }, icon('plus', 16), 'Срок на ръка'),
      h('button', { class: 'dl-set', type: 'button', onclick: () => dlSheet(redraw) }, icon('bell', 14), `Напомняне ${dlLabel()} преди`)));

  // Първоначални разходи – вложение (апарат, боядисване, окабеляване…)
  const setupSum = initialSum(info.costs);
  const setupAcc = acc('acc-setup', 'Първоначални разходи', setup.length ? `${money(setupSum)} · ${setup.map((c) => c.name).slice(0, 3).join(', ')}` : 'Апарат, боядисване, окабеляване…', false,
    setup.map((c) => h('button', { class: 'cc-row', type: 'button', onclick: () => setupCostSheet(car, c, redraw) },
      h('span', { class: 'cc-ic' }, icon('flag', 16)), h('span', { class: 'grow' }, h('b', null, c.name), h('small', null, fmtDate(c.startDate) + ' ' + c.startDate.slice(0, 4))), h('b', { class: 'num' }, money(c.amount, c.amount % 1 ? 2 : 0)))),
    h('p', { class: 'faint small' }, 'Влизат в „Изплащане на колата“, не в печалбата за месеца.'),
    h('button', { class: 'btn btn-ghost btn-block acc-add', onclick: () => setupCostSheet(car, null, redraw) }, icon('plus', 16), 'Добави първоначален разход'));

  // Плащания: какво е платено, кога и колко
  const pays = paymentsList(info);
  const payBox = h('div');
  const drawPays = (all) => payBox.replaceChildren(...(all ? pays : pays.slice(0, 8)).map(payRow),
    !all && pays.length > 8 ? h('button', { class: 'td-more', onclick: () => drawPays(true) }, `Още ${pays.length - 8}`, icon('down', 14)) : '');
  drawPays(false);
  const payAcc = acc('acc-pay', 'Плащания', pays.length ? `${pays.length} · последно: ${pays[0].t.split(' – ')[0]} ${money(Math.abs(pays[0].a))}, ${fmtDate(pays[0].d)}` : 'Още няма плащания', false,
    pays.length ? payBox : h('p', { class: 'muted small' }, 'Наемът, депозитите, глобите и разходите излизат тук по дати.'));

  // Щети, километраж, лично каране – дневникът без парите
  const other = info.logs.filter((l) => !['pay', 'deposit', 'refund', 'deduct', 'fine'].includes(l.kind));
  const logAcc = other.length > 0 && acc('acc-log', 'Щети, снимки и километри', `${other.length} записа`, false, other.slice(0, 20).map((l) => logRow(l, info, redraw)));

  const invite = acc('acc-inv', 'Покани шофьор', others.length ? `код ${car.invite}` : 'Прати линка – колата излиза при шофьора', !others.length,
    h('div', { class: 'inv-link' }, h('code', null, linkOf(car))),
    h('div', { class: 'row gap inv-acts' },
      h('button', { class: 'btn btn-dark', onclick: async () => { try { await navigator.clipboard.writeText(linkOf(car)); toast('Линкът е копиран'); } catch { toast('Копирай линка ръчно'); } } }, icon('copy', 16), 'Копирай'),
      navigator.share && h('button', { class: 'btn btn-ghost', onclick: () => navigator.share({ title: 'Покана за колата', text: `Покана за ${car.name || 'колата'} в „Чисто“`, url: linkOf(car) }).catch(() => {}) }, icon('share', 16), 'Изпрати'),
      h('button', { class: 'btn btn-ghost', onclick: () => confirmSheet({ title: 'Нов линк?', text: 'Старият линк спира да работи. Шофьорите, които вече са в колата, остават.', okLabel: 'Нов линк', onOk: () => { store.newInvite(car.id); redraw(); } }) }, 'Нов линк')),
    h('p', { class: 'faint small' }, 'Шофьорът, поканен с линка, трябва да въвежда километрите на всяка смяна.'));

  const danger = h('div', { class: 'car-danger' }, h('button', { class: 'btn btn-ghost btn-block', onclick: () => confirmSheet({ title: 'Да изтрия ли колата?', text: 'Шофьорите спират да я виждат, разходите ѝ се махат. Смените на всеки остават при него.', okLabel: 'Изтрий', danger: true, onOk: () => { store.deleteCar(car.id); go('/home'); } }) }, icon('trash', 16), 'Изтрий колата'));

  return h('div', { class: 'screen', 'data-page': 'cars' }, head, rec, ad, pend, moneyCard, driversCard, fixedAcc, dlAcc, setupAcc, payAcc, logAcc, invite, danger);
}

// Разходите на колата се въвеждат като „своя кола“ (с всички видове – застраховки, винетка, преглед…)
const carData = (data) => ({ ...data, profile: { ...data.profile, carType: 'own' } });
function addCarCost(car, data) { editCost({ carId: car.id }, carData(data)); }

function sharesSheet(car, drivers, redraw) {
  const inputs = {};
  const err = h('p', { class: 'err' });
  openSheet((close) => h('div', { class: 'form' },
    sheetHead('% от разходите', close, 'Колко процента от общите разходи на колата плаща всеки. Общо 100%.'),
    drivers.map((d) => { inputs[d.userId] = h('input', { class: 'input', type: 'number', inputmode: 'decimal', min: 0, max: 100, step: 'any', value: d.share ?? '' }); return field(`${d.name} – %`, inputs[d.userId]); }),
    h('button', { class: 'btn btn-ghost', onclick: () => { const n = drivers.length; drivers.forEach((d) => { inputs[d.userId].value = String(Math.round((100 / n) * 100) / 100); }); } }, 'Поравно'),
    err,
    h('button', { class: 'btn btn-primary btn-lg', onclick: () => {
      const sh = {}; let sum = 0;
      for (const d of drivers) { const v = Number(String(inputs[d.userId].value).replace(',', '.')) || 0; sh[d.userId] = v; sum += v; }
      if (Math.abs(sum - 100) > 0.5) { err.textContent = `Сборът е ${fmtNum(sum)}% – трябва да е 100%`; return; }
      store.setShares(car.id, sh); close(); toast('Запазено'); redraw();
    } }, icon('check', 18), 'Запази')));
}

// ---------- Присъединяване с линк ----------
let joining = null; // присъединяването тече веднъж, дори екранът да се прерисува междувременно
export function joinView({ go, route }) {
  const root = h('div', { class: 'screen', 'data-page': 'join' },
    h('section', { class: 'card', style: { textAlign: 'center', padding: '28px 20px' } }, h('p', { class: 'muted' }, 'Свързване с колата…')));
  if (joining === route.param) return root;
  joining = route.param;
  store.joinCar(route.param).then((r) => {
    joining = null;
    if (!location.hash.startsWith('#/join')) return;
    if (r?.error) { root.replaceChildren(h('section', { class: 'card' }, empty('alert', 'Не стана', r.error)), h('button', { class: 'btn btn-primary btn-block', style: { marginTop: '12px' }, onclick: () => go('/cars') }, 'Към колите')); return; }
    toast('Вече си в колата'); go('/cars/' + r.carId, true);
  });
  return root;
}

