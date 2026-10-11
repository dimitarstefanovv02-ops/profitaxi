// Обща кола и автопарк.
// Собственикът създава колата, кани шофьори с линк и вижда техните км, часове, работни дни и смени (без пари).
// Лична кола: общите разходи (застраховки, ремонти…) се делят по дялове, които собственикът настройва.
// Кола под наем: собственикът задава наема на всеки шофьор; разходите по колата са негови.
import { h, icon, cx, money, fmtDate, fmtDuration, fmtNum, todayStr, startOfMonth, endOfMonth, MONTHS, parseDate } from '../util.js';
import * as store from '../store.js';
import { openSheet, sheetHead, toast, field, cardTitle, segmented, confirmSheet, empty } from '../ui.js';
import { costCat } from '../constants.js';
import { editCost } from './costs.js';

const TYPE = { own: 'Лична кола', rent: 'Кола под наем' };
const PERIOD = { day: 'на ден', week: 'на седмица', month: 'на месец' };
const linkOf = (car) => `${location.origin}/app#/join/${car.invite}`;

export function carsView(ctx) {
  const { route } = ctx;
  return route.param ? carDetail(ctx, route.param) : carsList(ctx);
}

// ---------- Списък ----------
function carsList({ go, data, user }) {
  const cars = store.myCars();
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
  let type = 'own';
  const name = h('input', { class: 'input', placeholder: 'напр. Hyundai Elantra' });
  const plate = h('input', { class: 'input', placeholder: 'напр. РВ 1827 ХЕ', autocapitalize: 'characters' });
  const err = h('p', { class: 'err' });
  openSheet((close) => {
    const seg = h('div');
    const note = h('p', { class: 'muted small' });
    const draw = () => {
      seg.replaceChildren(segmented(TYPE, type, (t) => { type = t; draw(); }, { small: true, page: true }));
      note.textContent = type === 'own'
        ? 'Караш я ти и други шофьори. Общите разходи (застраховки, ремонти…) се делят по дялове, които настройваш.'
        : 'Даваш я под наем. Задаваш наема на всеки шофьор, а застраховките и ремонтите са твои. Виждаш км, часове и дни на шофьорите – без парите им.';
    };
    draw();
    return h('div', { class: 'form' },
      sheetHead('Нова кола', close),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Каква е колата'), seg, note),
      field('Марка и модел', name),
      field('Рег. номер', plate),
      err,
      h('button', { class: 'btn btn-primary btn-lg', onclick: () => {
        if (!name.value.trim() && !plate.value.trim()) { err.textContent = 'Въведи модел или номер'; return; }
        const c = store.createCar({ type, name: name.value.trim(), plate: plate.value.trim().toUpperCase() });
        close(); toast('Колата е добавена'); go('/cars/' + c.id);
      } }, icon('check', 18), 'Добави'));
  });
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
  const costs = store.carCosts(car.id).filter((c) => !c.endDate || c.endDate >= today);
  const me = (car.members || []).find((m) => m.userId === user.id);
  const monthName = MONTHS[parseDate(today).getMonth()];

  const head = [h('div', { class: 'page-title' }, h('h1', null, car.name || 'Кола')),
    h('p', { class: 'muted', style: { margin: '-6px 0 14px' } }, [car.plate, TYPE[car.type], owner ? 'ти си собственик' : null].filter(Boolean).join(' · '))];

  // Покана с линк – само собственикът
  const invite = owner && h('section', { class: 'card invite-car' },
    cardTitle('users', 'Покани шофьор'),
    h('p', { class: 'muted small', style: { marginBottom: '10px' } }, 'Прати линка на шофьора. Като го отвори и влезе (или се регистрира), колата излиза и при него.'),
    h('div', { class: 'inv-link' }, h('code', null, linkOf(car))),
    h('div', { class: 'row gap', style: { marginTop: '10px', flexWrap: 'wrap' } },
      h('button', { class: 'btn btn-dark', onclick: async () => { try { await navigator.clipboard.writeText(linkOf(car)); toast('Линкът е копиран'); } catch { toast('Копирай линка ръчно'); } } }, icon('copy', 16), 'Копирай'),
      navigator.share && h('button', { class: 'btn btn-ghost', onclick: () => navigator.share({ title: 'Покана за колата', text: `Покана за ${car.name || 'колата'} в „Чисто“`, url: linkOf(car) }).catch(() => {}) }, icon('share', 16), 'Изпрати'),
      h('button', { class: 'btn btn-ghost', onclick: () => confirmSheet({ title: 'Нов линк?', text: 'Старият линк спира да работи. Шофьорите, които вече са в колата, остават.', okLabel: 'Нов линк', onOk: () => { store.newInvite(car.id); redraw(); } }) }, 'Нов линк')),
    h('p', { class: 'faint small', style: { marginTop: '8px' } }, `Код: ${car.invite}`));

  // Шофьорите: км, часове, дни, смени – без пари
  const others = drivers.filter((d) => !(owner && d.userId === user.id && car.type === 'rent'));
  const driversCard = h('section', { class: 'card' },
    cardTitle('users', `Шофьори · ${monthName}`),
    others.length ? h('div', { class: 'drv-list' }, others.map((d) => h('div', { class: 'drv-row' },
      h('span', { class: 'drv-face' }, d.photo ? h('img', { src: d.photo, alt: '' }) : (d.name || '?').split(' ').map((x) => x[0]).slice(0, 2).join('')),
      h('div', { class: 'grow' },
        h('b', null, d.name + (d.userId === user.id ? ' (ти)' : '')),
        h('div', { class: 'drv-nums' },
          h('span', null, h('b', null, fmtNum(d.km)), ' км'),
          h('span', null, h('b', null, fmtDuration(d.hours))),
          h('span', null, h('b', null, String(d.days)), d.days === 1 ? ' ден' : ' дни'),
          h('span', null, h('b', null, String(d.shifts)), d.shifts === 1 ? ' смяна' : ' смени')),
        h('small', { class: 'muted' }, [
          car.type === 'own' ? `дял от разходите ${fmtNum(d.share || 0)}%` : d.rent?.amount ? `наем ${money(d.rent.amount)} ${PERIOD[d.rent.period] || ''}` : 'наемът не е зададен',
          d.last ? `последна смяна ${fmtDate(d.last.slice(0, 10))}` : 'още няма смени',
        ].join(' · '))),
      owner && h('div', { class: 'drv-act' },
        d.phone && d.userId !== user.id && h('a', { class: 'icon-btn plain', href: 'tel:' + d.phone, 'aria-label': 'Обади се' }, icon('phone', 18)),
        car.type === 'rent' && h('button', { class: 'icon-btn plain', 'aria-label': 'Наем', onclick: () => rentSheet(car, d, redraw) }, icon('key', 18)),
        d.userId !== user.id && h('button', { class: 'icon-btn plain', 'aria-label': 'Махни от колата', onclick: () => confirmSheet({ title: `Да махна ли ${d.name}?`, text: 'Шофьорът спира да вижда колата. Смените му остават при него.', okLabel: 'Махни', danger: true, onOk: () => { store.removeMember(car.id, d.userId); redraw(); } }) }, icon('trash', 18))))))
      : h('p', { class: 'muted' }, owner ? 'Още няма шофьори. Прати им линка отгоре.' : 'Само ти си в колата.'),
    owner && car.type === 'own' && others.length > 1 && h('button', { class: 'btn btn-ghost btn-block', style: { marginTop: '10px' }, onclick: () => sharesSheet(car, drivers, redraw) }, 'Дялове от разходите'),
    h('p', { class: 'faint small', style: { marginTop: '8px' } }, 'Виждаш само километри, часове, дни и смени – приходите и разходите на шофьорите остават лични.'));

  // Общите разходи на колата
  const costsCard = (owner || car.type === 'own') && h('section', { class: 'card' },
    cardTitle('calendar', car.type === 'own' ? 'Общи разходи на колата' : 'Разходи по колата',
      owner && h('button', { class: 'chip page', onclick: () => addCarCost(car, data, redraw) }, icon('plus', 14), 'Добави')),
    costs.length ? h('div', { class: 'car-costs' }, costs.map((c) => {
      const cat = costCat(c.category);
      const myPart = car.type === 'own' && me ? c.amount * (Number(me.share) || 0) / 100 : null;
      return h(owner ? 'button' : 'div', { class: 'cc-row', onclick: owner ? () => { editCost({ ...c }, carData(data)); setTimeout(() => {}, 0); } : null },
        h('span', { class: 'cc-ic' }, icon(cat.icon, 18)),
        h('span', { class: 'grow' }, h('b', null, c.name), h('small', null, [c.dueDate ? `следващо плащане ${fmtDate(c.dueDate)}` : null, myPart != null ? `твоят дял ${money(myPart, 2)}` : null].filter(Boolean).join(' · '))),
        h('b', { class: 'num' }, `${money(c.amount, c.amount % 1 ? 2 : 0)} ${({ week: '/седм.', month: '/мес.', quarter: '/3 мес.', year: '/год.' })[c.period] || ''}`));
    })) : h('p', { class: 'muted' }, owner ? 'Застраховки, винетка, преглед, данък МПС, обслужване – с падежи и напомняния.' : 'Собственикът още не е добавил общи разходи.'),
    car.type === 'own' && me && h('p', { class: 'faint small', style: { marginTop: '8px' } }, `Твоят дял е ${fmtNum(me.share || 0)}% – влиза сам в твоите постоянни разходи.`));

  // За шофьора на кола под наем
  const myRent = !owner && car.type === 'rent' && h('section', { class: 'card' },
    cardTitle('key', 'Твоят наем'),
    me?.rent?.amount ? h('p', null, h('b', null, `${money(me.rent.amount)} ${PERIOD[me.rent.period] || ''}`), h('span', { class: 'muted' }, ' – зададен от собственика, смята се сам в разходите ти.'))
      : h('p', { class: 'muted' }, 'Собственикът още не е задал наема.'));

  const danger = h('div', { style: { marginTop: '18px' } },
    owner
      ? h('button', { class: 'btn btn-ghost btn-block', onclick: () => confirmSheet({ title: 'Да изтрия ли колата?', text: 'Шофьорите спират да я виждат, общите ѝ разходи се махат. Смените на всеки остават при него.', okLabel: 'Изтрий', danger: true, onOk: () => { store.deleteCar(car.id); go('/cars'); } }) }, icon('trash', 16), 'Изтрий колата')
      : h('button', { class: 'btn btn-ghost btn-block', onclick: () => confirmSheet({ title: 'Да изляза ли от колата?', text: 'Спираш да я виждаш и общите ѝ разходи вече не са твои.', okLabel: 'Излез', danger: true, onOk: () => { store.leaveCar(car.id); go('/cars'); } }) }, 'Излез от колата'));

  return h('div', { class: 'screen', 'data-page': 'cars' }, ...head, invite, myRent, driversCard, costsCard, danger);
}

// Разходите на колата се въвеждат като „своя кола“ (с всички видове – застраховки, винетка, преглед…)
const carData = (data) => ({ ...data, profile: { ...data.profile, carType: 'own' } });
function addCarCost(car, data) { editCost({ carId: car.id }, carData(data)); }

function sharesSheet(car, drivers, redraw) {
  const inputs = {};
  const err = h('p', { class: 'err' });
  openSheet((close) => h('div', { class: 'form' },
    sheetHead('Дялове от разходите', close, 'Колко процента от общите разходи плаща всеки. Общо 100%.'),
    drivers.map((d) => { inputs[d.userId] = h('input', { class: 'input', type: 'number', inputmode: 'decimal', min: 0, max: 100, step: 'any', value: d.share ?? '' }); return field(d.name, inputs[d.userId]); }),
    h('button', { class: 'btn btn-ghost', onclick: () => { const n = drivers.length; drivers.forEach((d) => { inputs[d.userId].value = String(Math.round((100 / n) * 100) / 100); }); } }, 'Поравно'),
    err,
    h('button', { class: 'btn btn-primary btn-lg', onclick: () => {
      const sh = {}; let sum = 0;
      for (const d of drivers) { const v = Number(String(inputs[d.userId].value).replace(',', '.')) || 0; sh[d.userId] = v; sum += v; }
      if (Math.abs(sum - 100) > 0.5) { err.textContent = `Сборът е ${fmtNum(sum)}% – трябва да е 100%`; return; }
      store.setShares(car.id, sh); close(); toast('Запазено'); redraw();
    } }, icon('check', 18), 'Запази')));
}

function rentSheet(car, d, redraw) {
  let period = d.rent?.period || 'week';
  const amount = h('input', { class: 'input', type: 'number', inputmode: 'decimal', min: 0, step: 'any', value: d.rent?.amount || '' });
  const fromIn = h('input', { class: 'input', type: 'date', value: d.rent?.from || todayStr() });
  openSheet((close) => {
    const seg = h('div');
    const draw = () => seg.replaceChildren(segmented(PERIOD, period, (p) => { period = p; draw(); }, { small: true, page: true }));
    draw();
    return h('div', { class: 'form' },
      sheetHead(`Наем · ${d.name}`, close, 'Смята се сам в разходите на шофьора, ден по ден.'),
      field('Сума', amount), h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'За'), seg),
      field('От дата', fromIn),
      h('button', { class: 'btn btn-primary btn-lg', onclick: () => { store.setMemberRent(car.id, d.userId, { amount: Number(amount.value) || 0, period, from: fromIn.value || todayStr() }); close(); toast('Запазено'); redraw(); } }, icon('check', 18), 'Запази'));
  });
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
