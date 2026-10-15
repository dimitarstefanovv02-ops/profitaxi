// Автопарк – общите части: сведения за колата, записи (плащане, глоба, щета, депозит…), листът на шофьора,
// гласът в колата, плъзгане по реда на колата.
import { h, icon, cx, money, fmtDate, fmtNum, fmtDuration, todayStr, addDays, parseDate, toLocalInput, fromLocalInput, startOfMonth } from '../util.js';
import * as store from '../store.js';
import { openSheet, sheetHead, toast, field, segmented, confirmSheet, empty, openNumpad } from '../ui.js';
import { rentState, depositState, carStatus, kmGaps, deadlines, driverScore, whoDrove, parseCarVoice, idleDays, STATUS, RENT_PERIODS, CAR_DOCS, DRIVER_DOCS, dlDays, DL_CHOICES } from '../fleet.js';
import { costCat } from '../constants.js';
import { contractDoc } from './fleetplus.js';

export const carName = (c) => [c.name, c.plate].filter(Boolean).join(' · ') || 'Кола';
export const shortName = (c) => c.name || c.plate || 'Колата';
export const first = (n) => String(n || '').split(' ')[0];
const dd = (n) => `${n} ${n === 1 ? 'ден' : 'дни'}`;
export const leftText = (left) => (left < 0 ? `изтекло преди ${dd(-left)}` : left === 0 ? 'днес' : left === 1 ? 'утре' : `след ${dd(left)}`);
export const face = (d) => h('span', { class: 'drv-face' }, d.photo ? h('img', { src: d.photo, alt: '' }) : (d.name || '?').split(' ').map((x) => x[0]).slice(0, 2).join(''));

// Всичко за една кола на едно място: шофьори с наема им, статус, км, срокове
export function carInfo(car, today = todayStr()) {
  const logs = store.carLogs(car.id);
  const shifts = store.carShifts(car.id);
  const costs = store.carCosts(car.id);
  const users = Object.fromEntries(store.carDrivers(car.id, '2000-01-01', '2999-12-31').map((d) => [d.userId, d]));
  const members = (car.members || []).filter((m) => m.userId !== car.ownerId);
  const rents = members.map((m) => ({ m, d: users[m.userId] || { name: m.name }, r: rentState(m, logs, today) }));
  const ended = shifts.filter((s) => s.end).map((s) => s.end).sort();
  const active = shifts.some((s) => !s.end);
  const drivingToday = active || shifts.some((s) => (s.start || '').slice(0, 10) === today);
  const last = ended[ended.length - 1] || null;
  const status = carStatus(car, { rents: rents.map((x) => x.r), lastShift: last, active, today });
  const personal = logs.filter((l) => l.kind === 'personal');
  const startKm = Math.min(...members.map((m) => m.handoverKm || Infinity));
  // само смените, записани в тази кола (старите без кола имат друг километраж)
  const gaps = kmGaps([...shifts.filter((x) => x.carId === car.id), ...personal.map((l) => ({ start: l.start || l.at, kmStart: l.kmStart, kmEnd: l.kmEnd, userId: l.by }))], Number.isFinite(startKm) ? startKm : 0);
  return { car, logs, shifts, costs, users, members, rents, status, active, drivingToday, last, idle: idleDays(last, today), gaps, deadlines: deadlines(car, costs, today), pendings: logs.filter((l) => l.kind === 'pay' && l.status !== 'ok') };
}

// Свои статуси на собственика (напр. „На ремонт при майстора“, „Почистване“) – пазят се в профила му
const ST_COLORS = ['#8B5CF6', '#F59E0B', '#14B8A6', '#EC4899', '#0EA5E9', '#64748B'];
export const customStatuses = () => store.getProfile().carStatuses || [];
export const stOf = (st) => STATUS[st] || (() => { const c = customStatuses().find((x) => 'c:' + x.id === st); return c ? { label: c.label, cls: 'custom', ic: 'star', color: c.color } : STATUS.free; })();
export const statusChip = (st, onclick) => { const o = stOf(st); return h(onclick ? 'button' : 'span', { class: cx('st-chip', 'st-' + (STATUS[st] ? st : 'custom')), onclick }, h('i', { style: o.color ? { background: o.color } : null }), o.label); };

// ---------- Статус на колата: вградените + свои ----------
export function statusSheet(car, redraw) {
  const opts = [['', 'Кара се', 'car'], ['free', 'Свободна', 'key'], ['service', 'В сервиз', 'wrench']];
  openSheet((close) => {
    const body = h('div');
    const newStatus = () => {
      let color = ST_COLORS[customStatuses().length % ST_COLORS.length];
      const name = h('input', { class: 'input', placeholder: 'напр. На ремонт, Почистване, При мен', maxlength: 24 });
      const sw = h('div', { class: 'st-colors' });
      const paint = () => sw.replaceChildren(...ST_COLORS.map((c) => h('button', { class: cx('st-col', c === color && 'on'), style: { background: c }, 'aria-label': 'Цвят', onclick: () => { color = c; paint(); } })));
      paint();
      body.replaceChildren(h('div', { class: 'form' }, field('Име на статуса', name), h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Цвят'), sw),
        h('button', { class: 'btn btn-primary btn-lg', onclick: () => { const l = name.value.trim(); if (!l) return; const id = Math.random().toString(36).slice(2, 8);
          store.updateProfile({ carStatuses: [...customStatuses(), { id, label: l, color }] }); store.setCarStatus(car.id, 'c:' + id); close(); toast(l); redraw(); } }, icon('check', 18), 'Добави и сложи')));
      setTimeout(() => name.focus(), 50);
    };
    const draw = () => body.replaceChildren(
      h('div', { class: 'quick' },
        opts.map(([k, l, ic]) => h('button', { class: cx((car.status || '') === k && 'on'), onclick: () => { store.setCarStatus(car.id, k); close(); toast(l); redraw(); } }, h('span', { class: 'q-ic' }, icon(ic, 21)), l)),
        customStatuses().map((c) => h('button', { class: cx(car.status === 'c:' + c.id && 'on'), onclick: () => { store.setCarStatus(car.id, 'c:' + c.id); close(); toast(c.label); redraw(); } }, h('span', { class: 'q-ic', style: { color: c.color } }, icon('star', 21)), c.label)),
        h('button', { class: 'st-add', onclick: newStatus }, h('span', { class: 'q-ic' }, icon('plus', 21)), 'Нов статус')),
      customStatuses().length > 0 && h('div', { class: 'st-own' }, h('small', { class: 'muted' }, 'Твоите статуси – натисни ×, за да махнеш'),
        h('div', { class: 'chip-row' }, customStatuses().map((c) => h('span', { class: 'chip' }, h('i', { class: 'dot', style: { background: c.color } }), c.label,
          h('button', { class: 'x', type: 'button', 'aria-label': 'Махни ' + c.label, onclick: () => { store.updateProfile({ carStatuses: customStatuses().filter((x) => x.id !== c.id) }); draw(); } }, icon('x', 13)))))));
    draw();
    return h('div', null, sheetHead('Статус на колата', close, carName(car)), body);
  });
}

// ---------- Напомни на всички: наем, обслужване или друго ----------
export function remindAll(infos, redraw) {
  const debtors = infos.flatMap((i) => i.rents.filter((x) => x.r.debt > 0).map((x) => ({ i, x })));
  const all = infos.flatMap((i) => (i.car.members || []).filter((m) => m.userId !== i.car.ownerId).map((m) => ({ car: i.car, m })));
  const TOPICS = { rent: ['Наем', 'coins'], service: ['Обслужване', 'wrench'], other: ['Друго', 'inbox'] };
  const pre = { service: 'Колата има обслужване. Свържи се с мен за ден и час.', other: '' };
  let topic = debtors.length ? 'rent' : 'service';
  openSheet((close) => {
    const body = h('div');
    const text = h('textarea', { class: 'input', rows: 3, placeholder: 'Текст на известието' });
    const draw = () => {
      if (topic !== 'rent' && !text.value) text.value = pre[topic] || '';
      body.replaceChildren(
        h('div', { class: 'quick' }, Object.entries(TOPICS).map(([k, [l, ic]]) => h('button', { class: cx(topic === k && 'on'), onclick: () => { if (k !== topic) text.value = ''; topic = k; draw(); } }, h('span', { class: 'q-ic' }, icon(ic, 21)), l))),
        topic === 'rent'
          ? h('p', { class: 'muted' }, debtors.length ? `До ${debtors.length} ${debtors.length === 1 ? 'шофьор, който дължи' : 'шофьори, които дължат'} – всеки вижда своята сума.` : 'В момента никой не дължи наем.')
          : h('div', { class: 'form' }, h('p', { class: 'muted' }, `До всички ${all.length} шофьори на колите ти.`), text),
        h('button', { class: 'btn btn-primary btn-lg btn-block', disabled: topic === 'rent' ? !debtors.length : !all.length, onclick: () => {
          if (topic === 'rent') { debtors.forEach(({ i, x }) => remind(i.car, [{ userId: x.m.userId, amount: x.r.debt }])); }
          else {
            const t = text.value.trim(); if (!t) { toast('Напиши текста', 'err'); return; }
            all.forEach(({ car, m }) => store.addCarLog({ carId: car.id, kind: 'notice', driverId: m.userId, title: topic === 'other' ? 'Съобщение от собственика' : `Обслужване · ${shortName(car)}`, text: t }));
            toast(`Изпратено до ${all.length} шофьори`);
          }
          close(); redraw(); } }, icon('bell', 18), 'Изпрати'));
    };
    draw();
    return h('div', null, sheetHead('Напомни на всички', close, 'Известие до шофьорите – за наема, обслужване или друго.'), body);
  });
}

// ---------- Кога да напомняме за сроковете ----------
export function dlSheet(redraw) {
  let days = [...dlDays(store.getProfile())];
  openSheet((close) => {
    const box = h('div');
    const draw = () => box.replaceChildren(h('div', { class: 'chip-row' }, DL_CHOICES.map((d) => h('button', { class: cx('chip-btn', days.includes(d) && 'on'), onclick: () => { days = days.includes(d) ? days.filter((x) => x !== d) : [...days, d]; draw(); } }, d === 1 ? '1 ден' : `${d} дни`))));
    draw();
    return h('div', { class: 'form' }, sheetHead('Напомняне за сроковете', close, 'Колко дни преди да изтече ГО, каско, винетка, преглед, лиценз или документ на шофьор. И в самия ден.'), box,
      h('button', { class: 'btn btn-primary btn-lg', onclick: () => { store.updateProfile({ dlDays: days.length ? days.sort((x, y) => y - x) : [14, 7, 3] }); close(); toast('Запазено'); redraw?.(); } }, icon('check', 18), 'Запази'));
  });
}
export const dlLabel = () => dlDays(store.getProfile()).join(', ') + ' дни';

// ---------- Записи по колата ----------
const KINDS = {
  pay: { t: 'Платен наем', ic: 'coins', drv: true, amt: true },
  cost: { t: 'Разход по колата', ic: 'wrench', amt: true, cat: true },
  fine: { t: 'Глоба', ic: 'alert', drv: true, amt: true, time: true, text: 'За какво (по желание)' },
  damage: { t: 'Щета', ic: 'camera', drv: true, amt: 'по желание', text: 'Какво се е случило', photos: true },
  deposit: { t: 'Депозит', ic: 'lock', drv: true, amt: true },
  deduct: { t: 'Удръжка от депозита', ic: 'minus', drv: true, amt: true, text: 'За какво' },
  refund: { t: 'Върнат депозит', ic: 'download', drv: true, amt: true },
  km: { t: 'Километраж', ic: 'road', km: true },
};
const COST_KINDS = { tires: 'Гуми', repair: 'Ремонт', service: 'Обслужване', wash: 'Автомивка', insurance: 'Застраховка', casco: 'Каско', vignette: 'Винетка', inspection: 'Преглед', cartax: 'Данък', other: 'Друго' };
export function quickAdd(info, redraw) {
  openSheet((close) => h('div', null, sheetHead('Запиши', close, carName(info.car)),
    h('div', { class: 'quick' }, ['pay', 'cost', 'fine', 'damage', 'deposit', 'km'].map((k) => h('button', { onclick: () => { close(); recordSheet(info, k, {}, redraw); } }, h('span', { class: 'q-ic' }, icon(KINDS[k].ic, 21)), KINDS[k].t))),
    h('button', { class: 'btn btn-ghost btn-block voice-btn', style: { marginTop: '10px' }, onclick: () => { close(); carVoice(info, redraw); } }, icon('mic', 18), 'Кажи го на глас')));
}

export function recordSheet(info, kind, pre = {}, redraw) {
  const K = KINDS[kind]; const car = info.car;
  const drivers = info.rents.map((x) => ({ userId: x.m.userId, name: x.d.name || x.m.name, r: x.r }));
  // кой: при глоба – който е карал тогава; при плащане – който дължи
  let driverId = pre.driverId || (kind === 'pay' ? (drivers.find((d) => d.r.debt > 0) || drivers[0])?.userId : drivers.length === 1 ? drivers[0].userId : null);
  let cat = pre.category || 'repair';
  const amount = h('input', { class: 'input', type: 'number', inputmode: 'decimal', min: 0, step: 'any', placeholder: '0', value: pre.amount || '' });
  const dateIn = h('input', { class: 'input', type: 'date', value: pre.date || todayStr() });
  const timeIn = h('input', { class: 'input', type: 'datetime-local', value: toLocalInput(pre.at || new Date().toISOString()) });
  const text = h('input', { class: 'input', placeholder: K.text || 'Описание (по желание)', value: pre.text || '' });
  const kmIn = h('input', { class: 'input', type: 'number', inputmode: 'numeric', placeholder: 'напр. 245 300', value: pre.km || '' });
  const photos = [...(pre.photos || [])];
  const err = h('p', { class: 'err' });
  if (kind === 'pay' && !pre.amount && driverId) { const d = drivers.find((x) => x.userId === driverId); if (d?.r.next?.amount) amount.value = d.r.next.amount; }
  openSheet((close) => {
    const drvBox = h('div'), catBox = h('div'), phBox = h('div', { class: 'ph-row' }), who = h('p', { class: 'muted small' });
    const drawDrv = () => drvBox.replaceChildren(drivers.length ? h('div', { class: 'chips' }, drivers.map((d) => h('button', { type: 'button', class: cx('chip-btn', d.userId === driverId && 'on'), onclick: () => { driverId = d.userId; if (kind === 'pay' && d.r.next?.amount) amount.value = d.r.next.amount; drawDrv(); } }, d.name))) : h('p', { class: 'muted small' }, 'Още няма шофьори в колата.'));
    const drawCat = () => catBox.replaceChildren(h('div', { class: 'chips' }, Object.entries(COST_KINDS).map(([k, l]) => h('button', { type: 'button', class: cx('chip-btn', k === cat && 'on'), onclick: () => { cat = k; drawCat(); } }, l))));
    const drawPh = () => phBox.replaceChildren(...photos.map((p, i) => h('span', { class: 'ph' }, h('img', { src: p, alt: '' }), h('button', { type: 'button', 'aria-label': 'Махни', onclick: () => { photos.splice(i, 1); drawPh(); } }, icon('x', 14)))),
      photos.length < 4 && h('button', { type: 'button', class: 'ph add', onclick: async () => { const { pickImage } = await import('./categories.js'); const p = await pickImage({ max: 900, quality: 0.68 }); if (p) { photos.push(p); drawPh(); } } }, icon('camera', 22), 'Снимка'));
    // глоба: кой е карал в този час
    const guess = () => {
      if (kind !== 'fine') return;
      const w = whoDrove(info.members, info.shifts, fromLocalInput(timeIn.value));
      if (w) { driverId = w.userId; drawDrv(); who.textContent = w.sure ? `Тогава е карал ${drivers.find((d) => d.userId === w.userId)?.name || ''} (смяна ${fmtDate(w.shift.start.slice(0, 10))}).` : 'В този час няма смяна – избран е последният, който е карал. Провери.'; }
      else who.textContent = '';
    };
    timeIn.onchange = guess;
    drawDrv(); drawCat(); drawPh(); setTimeout(guess);
    const save = () => {
      const v = Number(String(amount.value).replace(',', '.')) || 0;
      if (K.drv && !driverId && kind !== 'damage') { err.textContent = 'Избери шофьор'; return; }
      if (K.amt === true && !(v > 0)) { err.textContent = 'Въведи сума'; return; }
      if (K.km && !(Number(kmIn.value) > 0)) { err.textContent = 'Въведи километража'; return; }
      if (kind === 'cost') store.addCarCost(car.id, { category: cat, amount: v, name: text.value.trim() || COST_KINDS[cat], date: dateIn.value || todayStr() });
      else if (kind === 'fine') store.addCarLog({ carId: car.id, kind, driverId, amount: v, text: text.value.trim(), date: timeIn.value.slice(0, 10) || todayStr(), when: fromLocalInput(timeIn.value) });
      else if (kind === 'km') store.addCarLog({ carId: car.id, kind, km: Math.round(Number(kmIn.value)), date: dateIn.value || todayStr() });
      else store.addCarLog({ carId: car.id, kind, driverId: driverId || null, amount: v, text: text.value.trim(), date: dateIn.value || todayStr(), photos: photos.length ? photos : undefined });
      close(); toast({ pay: 'Плащането е записано', fine: 'Глобата е прехвърлена на шофьора', damage: 'Щетата е записана' }[kind] || 'Записано'); redraw && redraw();
    };
    return h('div', { class: 'form' },
      sheetHead(K.t, close, carName(car)),
      K.drv && h('div', { class: 'field' }, h('span', { class: 'field-label' }, kind === 'fine' ? 'Кой е карал' : 'Шофьор'), drvBox, who),
      K.cat && h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Какво'), catBox),
      K.time ? field('Дата и час на нарушението', timeIn, 'Приложението само намира кой е карал тогава') : !K.km && field('Дата', dateIn),
      K.amt && field(K.amt === true ? 'Сума' : 'Сума (по желание)', amount),
      K.km && field('Километраж', kmIn), K.km && field('Дата', dateIn),
      (K.text || kind === 'cost' || kind === 'pay') && field(kind === 'cost' ? 'Описание (по желание)' : kind === 'pay' ? 'Бележка (по желание)' : 'Описание', text),
      K.photos && h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Снимки'), phBox),
      kind === 'fine' && h('p', { class: 'faint small' }, 'Глобата влиза в разходите на шофьора и той получава известие.'),
      err,
      h('button', { class: 'btn btn-primary btn-lg', onclick: save }, icon('check', 18), 'Запиши'));
  }, { tall: K.photos });
}

// ---------- Глас в колата ----------
export async function carVoice(info, redraw) {
  const { openVoice, wordsToDigits } = await import('../voice.js');
  openVoice({ mode: 'text', title: `Кажи · ${shortName(info.car)}`, hint: '„200 евро гуми“, „платен наем“, „глоба 50 за превишена скорост“, „депозит 300“, „в сервиз“', onText: (t) => applyVoice(info, t, redraw, wordsToDigits) });
}
export function applyVoice(info, t, redraw, w2d) {
  const p = parseCarVoice(t, w2d);
  if (!p) { toast(`Не разбрах „${t}“. Опитай: „200 евро гуми“`, 'err'); return null; }
  if (p.kind === 'status') { store.setCarStatus(info.car.id, p.status); toast(p.label); redraw && redraw(); return p; }
  if (p.kind === 'cost') { recordSheet(info, 'cost', { amount: p.amount, category: p.category, text: p.text === COST_KINDS[p.category] ? '' : p.text }, redraw); return p; }
  recordSheet(info, p.kind, { amount: p.amount || '', text: p.text || '', km: p.km }, redraw);
  return p;
}

// ---------- Шофьорът на колата – всичко за него ----------
export function driverSheet(info, userId, redraw) {
  const x = info.rents.find((y) => y.m.userId === userId); if (!x) return;
  const { m, d, r } = x; const car = info.car;
  const dep = depositState(userId, info.logs);
  const sc = driverScore({ rent: r, logs: info.logs, driverId: userId });
  const fines = info.logs.filter((l) => l.kind === 'fine' && l.driverId === userId);
  const dmg = info.logs.filter((l) => l.kind === 'damage' && l.driverId === userId);
  const docs = deadlines({ members: [m] }, [], todayStr());
  openSheet((close) => h('div', { class: 'drv-sheet' },
    sheetHead(d.name || m.name, close, [car.plate || car.name, m.slot ? { day: 'Дневна смяна', night: 'Нощна смяна', all: 'Цял ден' }[m.slot] : null, m.handoverKm ? `дадена на ${fmtNum(m.handoverKm)} км` : null].filter(Boolean).join(' · ')),
    h('div', { class: 'score-line' }, h('b', { class: 'score s' + Math.floor(sc.score) }, String(sc.score).replace('.', ',')), h('span', null, h('b', null, sc.word), h('small', null, `${sc.late} просрочени плащания · ${sc.fines} глоби · ${sc.damages} щети · вижда го само ти`))),
    // наемът по периоди
    m.rent?.amount ? h('div', { class: 'blk' },
      h('div', { class: 'blk-h' }, h('b', null, `Наем ${money(m.rent.amount)} ${RENT_PERIODS[m.rent.period] || ''}`), r.debt > 0 ? h('span', { class: 'neg' }, `дължи ${money(r.debt, 2)}`) : r.advance > 0 ? h('span', { class: 'pos' }, `аванс ${money(r.advance, 2)}`) : h('span', { class: 'pos' }, 'платено')),
      h('div', { class: 'weeks' }, r.periods.slice(-12).map((p) => h('span', { class: cx('wk', p.status), title: `${fmtDate(p.start)} – ${fmtDate(p.end)}` }, h('b', null, fmtDate(p.start)), h('small', null, p.status === 'paid' ? 'платено' : p.paid > 0 ? `${money(p.paid)} от ${money(p.amount)}` : money(p.amount))))),
      r.history.length ? h('div', { class: 'hist' }, r.history.slice(0, 12).map((l) => h('div', { class: 'hist-row' }, h('span', null, fmtDate(l.date)), h('b', null, money(l.amount, l.amount % 1 ? 2 : 0)), h('small', { class: l.status === 'ok' ? 'pos' : 'warn' }, l.status === 'ok' ? 'потвърдено' : 'чака'),
        l.status !== 'ok' && h('button', { class: 'chip page', onclick: () => { store.confirmPay(l.id); close(); toast('Потвърдено'); redraw(); } }, 'Потвърди'),
        h('button', { class: 'icon-btn plain', 'aria-label': 'Изтрий', onclick: () => confirmSheet({ title: 'Да изтрия ли плащането?', okLabel: 'Изтрий', danger: true, onOk: () => { store.deleteCarLog(l.id); close(); redraw(); } }) }, icon('trash', 16))))) : h('p', { class: 'muted small' }, 'Още няма плащания.'))
      : h('p', { class: 'muted' }, 'Наемът не е зададен.'),
    h('div', { class: 'blk' }, h('div', { class: 'blk-h' }, h('b', null, 'Депозит'), h('span', null, money(dep.balance, dep.balance % 1 ? 2 : 0))),
      dep.list.map((l) => h('div', { class: 'hist-row' }, h('span', null, fmtDate(l.date)), h('b', null, `${l.kind === 'deposit' ? '+' : '−'}${money(l.amount)}`), h('small', null, l.kind === 'deposit' ? 'оставен' : l.kind === 'refund' ? 'върнат' : `удръжка${l.text ? ' · ' + l.text : ''}`)))),
    (fines.length || dmg.length) ? h('div', { class: 'blk' }, h('div', { class: 'blk-h' }, h('b', null, 'Глоби и щети')),
      [...fines, ...dmg].sort((a, b) => String(b.date).localeCompare(String(a.date))).map((l) => h('div', { class: 'hist-row' }, h('span', null, fmtDate(l.date)), h('b', null, l.amount ? money(l.amount) : '—'), h('small', null, `${l.kind === 'fine' ? 'глоба' : 'щета'}${l.text ? ' · ' + l.text : ''}`)))) : null,
    docs.length ? h('div', { class: 'blk' }, h('div', { class: 'blk-h' }, h('b', null, 'Документи')), docs.map((x2) => h('div', { class: 'doc-row' }, h('span', null, x2.title.split(' · ')[0]), h('small', { class: x2.left < 0 ? 'neg' : x2.left <= 14 ? 'warn' : '' }, `до ${fmtDate(x2.date)} · ${leftText(x2.left)}`)))) : null,
    h('div', { class: 'act-grid' },
      h('button', { class: 'btn btn-primary', onclick: () => { close(); recordSheet(info, 'pay', { driverId: userId }, redraw); } }, icon('coins', 16), 'Платено'),
      r.debt > 0 && h('button', { class: 'btn btn-dark', onclick: () => { remind(info.car, [{ userId, amount: r.debt }]); close(); redraw(); } }, icon('bell', 16), 'Напомни'),
      d.phone && h('a', { class: 'btn btn-ghost', href: 'tel:' + d.phone }, icon('phone', 16), 'Обади се'),
      h('button', { class: 'btn btn-ghost', onclick: () => { close(); rentSheet(car, { ...m, name: d.name || m.name }, redraw); } }, icon('key', 16), 'Наем'),
      h('button', { class: 'btn btn-ghost', onclick: () => { close(); handoverSheet(car, m, d, redraw); } }, icon('road', 16), 'Километраж'),
      h('button', { class: 'btn btn-ghost', onclick: () => { close(); recordSheet(info, 'deposit', { driverId: userId }, redraw); } }, icon('lock', 16), 'Депозит'),
      dep.balance > 0 && h('button', { class: 'btn btn-ghost', onclick: () => { close(); recordSheet(info, 'deduct', { driverId: userId }, redraw); } }, icon('minus', 16), 'Удръжка'),
      h('button', { class: 'btn btn-ghost', onclick: () => { close(); docsSheet(car, m, d, redraw); } }, icon('doc', 16), 'Документи'),
      h('button', { class: 'btn btn-ghost', onclick: () => { close(); slotSheet(car, m, d, redraw); } }, icon('clock', 16), 'Ден / нощ'),
      h('button', { class: 'btn btn-ghost', onclick: () => contractDoc(info, userId) }, icon('doc', 16), 'Договор'),
      h('button', { class: 'btn btn-ghost', onclick: () => confirmSheet({ title: `Да махна ли ${d.name || m.name}?`, text: 'Шофьорът спира да вижда колата. Смените му остават при него.', okLabel: 'Махни', danger: true, onOk: () => { store.removeMember(car.id, userId); close(); redraw(); } }) }, icon('trash', 16), 'Махни'))), { tall: true });
}

export function remind(car, list) {
  for (const x of list) store.addCarLog({ carId: car.id, kind: 'remind', driverId: x.userId, amount: x.amount, text: `Наемът за ${shortName(car)}: ${money(x.amount, x.amount % 1 ? 2 : 0)}. Отбележи „Платих“ в приложението, щом платиш.` });
  toast(list.length === 1 ? 'Напомнянето е изпратено' : `Изпратени ${list.length} напомняния`);
}

export function rentSheet(car, m, redraw) {
  let period = m.rent?.period || 'week';
  const amount = h('input', { class: 'input', type: 'number', inputmode: 'decimal', min: 0, step: 'any', value: m.rent?.amount || '' });
  const fromIn = h('input', { class: 'input', type: 'date', value: m.rent?.from || todayStr() });
  const toIn = h('input', { class: 'input', type: 'date', value: m.rent?.to || '' });
  openSheet((close) => {
    const seg = h('div');
    const draw = () => seg.replaceChildren(segmented(RENT_PERIODS, period, (p) => { period = p; draw(); }, { small: true, page: true, wrap: true }));
    draw();
    return h('div', { class: 'form' },
      sheetHead(`${car.type === 'own' ? 'Плащане за колата' : 'Наем'} · ${m.name}`, close, car.type === 'own' ? 'Колко плаща шофьорът, за да вземе колата – за ден, седмица или за няколко дни.' : 'Излиза сам при шофьора и се смята в разходите му.'),
      field('Сума', amount), h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'За'), seg),
      field('От дата', fromIn), field('До дата', toIn, 'По желание – ако е само за няколко дни'),
      h('button', { class: 'btn btn-primary btn-lg', onclick: () => { store.setMemberRent(car.id, m.userId, { amount: Number(String(amount.value).replace(',', '.')) || 0, period, from: fromIn.value || todayStr(), to: toIn.value || null }); close(); toast('Запазено'); redraw(); } }, icon('check', 18), 'Запази'));
  });
}
export function handoverSheet(car, m, d, redraw) {
  const km = h('input', { class: 'input', type: 'number', inputmode: 'numeric', value: m.handoverKm || '', placeholder: 'напр. 245 300' });
  const dt = h('input', { class: 'input', type: 'date', value: todayStr() });
  openSheet((close) => h('div', { class: 'form' },
    sheetHead(`Предаване · ${d.name || m.name}`, close, 'Километражът, на който даваш колата. Първата смяна на шофьора започва оттук и всеки пропуснат километър се вижда.'),
    field('Километраж', km), field('Дата', dt),
    h('button', { class: 'btn btn-primary btn-lg', onclick: () => { if (!(Number(km.value) > 0)) return; store.setHandover(car.id, m.userId, Number(km.value), dt.value || todayStr()); close(); toast('Записано'); redraw(); } }, icon('check', 18), 'Запази')));
}
export function docsSheet(car, m, d, redraw) {
  const ins = {};
  openSheet((close) => h('div', { class: 'form' },
    sheetHead(`Документи · ${d.name || m.name}`, close, `Със срок на валидност – напомняме ${dlLabel()} преди изтичане.`),
    Object.entries(DRIVER_DOCS).map(([k, l]) => { ins[k] = h('input', { class: 'input', type: 'date', value: m.docs?.[k] || '' }); return field(`${l} – валидно до`, ins[k]); }),
    h('button', { class: 'btn btn-primary btn-lg', onclick: () => { store.setMemberDocs(car.id, m.userId, Object.fromEntries(Object.entries(ins).map(([k, i]) => [k, i.value || null]))); close(); toast('Запазено'); redraw(); } }, icon('check', 18), 'Запази')));
}
export function carDocsSheet(car, redraw) {
  const ins = {};
  const name = h('input', { class: 'input', value: car.name || '' });
  const plate = h('input', { class: 'input', value: car.plate || '', autocapitalize: 'characters' });
  const price = h('input', { class: 'input', type: 'number', inputmode: 'decimal', value: car.price || '', placeholder: 'напр. 14 000' });
  const bought = h('input', { class: 'input', type: 'date', value: car.boughtAt || (car.createdAt || '').slice(0, 10) });
  const err = h('p', { class: 'err' });
  openSheet((close) => h('div', { class: 'form' },
    sheetHead('Данни и срокове', close, carName(car)),
    field('Марка и модел', name), field('Рег. номер', plate, null, true),
    field('Покупна цена', price, 'За сметката „Кога се изплаща колата“'), field('Купена на', bought),
    h('h3', { class: 'form-sub' }, 'Валидни до'),
    Object.entries(CAR_DOCS).map(([k, l]) => { ins[k] = h('input', { class: 'input', type: 'date', value: car.docs?.[k] || '' }); return field(l, ins[k]); }),
    err,
    h('button', { class: 'btn btn-primary btn-lg', onclick: () => {
      if (!plate.value.trim()) { err.textContent = 'Регистрационният номер е задължителен'; return; }
      store.updateCar(car.id, { name: name.value.trim(), plate: plate.value.trim().toUpperCase(), price: Number(price.value) || null, boughtAt: bought.value || null, docs: Object.fromEntries(Object.entries(ins).map(([k, i]) => [k, i.value || null])) });
      close(); toast('Запазено'); redraw();
    } }, icon('check', 18), 'Запази')), { tall: true });
}
export function slotSheet(car, m, d, redraw) {
  const opts = { day: 'Дневна', night: 'Нощна', all: 'Цял ден' };
  openSheet((close) => h('div', null, sheetHead(`Смяна · ${d.name || m.name}`, close, 'Кога кара колата, когато е на двама шофьори.'),
    h('div', { class: 'quick' }, Object.entries(opts).map(([k, l]) => h('button', { class: cx(m.slot === k && 'on'), onclick: () => { store.setMemberSlot(car.id, m.userId, k); close(); redraw(); } }, h('span', { class: 'q-ic' }, icon(k === 'night' ? 'moon' : k === 'day' ? 'sun' : 'clock', 21)), l)))));
}

// ---------- Плъзгане по реда: Платено / В сервиз / Свободна ----------
export function swipeRow(content, actions) {
  const acts = h('div', { class: 'sw-acts' }, actions.map((a) => h('button', { class: cx('sw-a', a.cls), onclick: (e) => { e.preventDefault(); e.stopPropagation(); close(); a.run(); } }, icon(a.ic, 18), a.label)));
  const front = h('div', { class: 'sw-front' }, content);
  const wrap = h('div', { class: 'sw' }, acts, front);
  let x0 = 0, y0 = 0, dx = 0, open = false, drag = false, lock = null;
  const W = () => acts.offsetWidth || actions.length * 70;
  const set = (v, anim) => { wrap.classList.toggle('swiping', !!v || drag); front.style.transition = anim ? 'transform .22s ease' : 'none'; front.style.transform = v ? `translateX(${v}px)` : ''; };
  const close = () => { open = false; set(0, true); };
  front.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; drag = true; lock = null; }, { passive: true });
  front.addEventListener('touchmove', (e) => {
    if (!drag) return; const ddx = e.touches[0].clientX - x0, ddy = e.touches[0].clientY - y0;
    if (lock == null) lock = Math.abs(ddx) > Math.abs(ddy) + 4 ? 'x' : Math.abs(ddy) > 6 ? 'y' : null;
    if (lock !== 'x') return;
    dx = Math.min(0, Math.max(-W() - 20, ddx + (open ? -W() : 0))); set(dx);
  }, { passive: true });
  front.addEventListener('touchend', () => { if (!drag) return; drag = false; if (lock !== 'x') { wrap.classList.toggle('swiping', open); return; } open = dx < -W() / 2.5; set(open ? -W() : 0, true); });
  front.addEventListener('click', (e) => { if (open) { e.preventDefault(); e.stopPropagation(); close(); } }, true);
  return wrap;
}

// ---------- Колата за шофьора, който я кара ----------
export function myCarCard(car, user, redraw, { compact } = {}) {
  const logs = store.carLogs(car.id);
  const m = (car.members || []).find((x) => x.userId === user.id); if (!m) return null;
  const r = rentState(m, logs);
  const dep = depositState(user.id, logs);
  const reminder = logs.find((l) => l.kind === 'remind' && l.driverId === user.id && l.at > (r.history[0]?.at || ''));
  // съобщение от собственика (обслужване и др.) – вижда се 5 дни
  const notice = logs.filter((l) => l.kind === 'notice' && l.driverId === user.id && (l.at || '') >= addDays(todayStr(), -5)).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0];
  const has = m.rent?.amount > 0;
  if (compact && !has) return null;
  return h('section', { class: cx('card my-car', r.debt > 0 && 'owes') },
    h('div', { class: 'card-title' }, h('h3', null, h('span', { class: 't-ic' }, icon('key', 17)), compact ? `Наем · ${shortName(car)}` : 'Твоят наем'),
      has && (r.debt > 0 ? h('span', { class: 'neg b' }, `дължиш ${money(r.debt, r.debt % 1 ? 2 : 0)}`) : r.advance > 0 ? h('span', { class: 'pos b' }, `аванс ${money(r.advance)}`) : h('span', { class: 'pos b' }, 'платено'))),
    has ? h('p', { class: 'muted small' }, `${money(m.rent.amount)} ${RENT_PERIODS[m.rent.period] || ''}`, r.late ? ` · неплатено от ${fmtDate(r.next.date)} (${dd(r.lateDays)})` : r.next ? ` · следващо: ${fmtDate(r.next.date)}${r.next.amount ? `, ${money(r.next.amount, r.next.amount % 1 ? 2 : 0)}` : ''}` : '') : h('p', { class: 'muted' }, 'Собственикът още не е задал наема.'),
    reminder && r.debt > 0 && h('p', { class: 'remind-line' }, icon('bell', 15), reminder.text),
    notice && h('p', { class: 'remind-line' }, icon('bell', 15), h('b', null, notice.title + ': '), notice.text),
    r.pendingSum > 0 && h('p', { class: 'muted small' }, `Чака потвърждение от собственика: ${money(r.pendingSum, r.pendingSum % 1 ? 2 : 0)}`),
    has && h('div', { class: 'row gap', style: { marginTop: '10px', flexWrap: 'wrap' } },
      h('button', { class: 'btn btn-primary', onclick: () => paySheet(car, r, redraw) }, icon('check', 16), 'Платих'),
      !compact && h('button', { class: 'btn btn-ghost', onclick: () => damageSheet(car, redraw) }, icon('camera', 16), 'Снимки / щета')),
    !compact && dep.given > 0 && h('p', { class: 'faint small', style: { marginTop: '8px' } }, `Депозит: ${money(dep.balance)}${dep.taken ? ` (удържани ${money(dep.taken)})` : ''}`),
    !compact && m.handoverKm ? h('p', { class: 'faint small' }, `Колата ти е дадена на ${fmtNum(m.handoverKm)} км${m.handoverAt ? ` (${fmtDate(m.handoverAt)})` : ''}.`) : null,
    !compact && r.history.length > 0 && h('div', { class: 'hist', style: { marginTop: '8px' } }, r.history.slice(0, 6).map((l) => h('div', { class: 'hist-row' }, h('span', null, fmtDate(l.date)), h('b', null, money(l.amount, l.amount % 1 ? 2 : 0)), h('small', { class: l.status === 'ok' ? 'pos' : 'warn' }, l.status === 'ok' ? 'потвърдено' : 'чака потвърждение'),
      l.status !== 'ok' && l.by === user.id && h('button', { class: 'icon-btn plain', 'aria-label': 'Изтрий', onclick: () => { store.deleteCarLog(l.id); redraw(); } }, icon('trash', 16))))));
}
export function paySheet(car, r, redraw) {
  const amount = h('input', { class: 'input', type: 'number', inputmode: 'decimal', value: r.next?.amount || r.debt || '' });
  const dt = h('input', { class: 'input', type: 'date', value: todayStr() });
  openSheet((close) => h('div', { class: 'form' },
    sheetHead('Платих наема', close, 'Собственикът получава известие и потвърждава.'),
    field('Сума', amount), field('Дата', dt),
    h('button', { class: 'btn btn-primary btn-lg', onclick: () => { const v = Number(String(amount.value).replace(',', '.')) || 0; if (!(v > 0)) return; store.addCarLog({ carId: car.id, kind: 'pay', amount: v, date: dt.value || todayStr() }); close(); toast('Изпратено на собственика'); redraw(); } }, icon('check', 18), 'Платих')));
}
export function damageSheet(car, redraw) {
  let when = 'take';
  const photos = []; const text = h('input', { class: 'input', placeholder: 'напр. драскотина на задната врата' });
  openSheet((close) => {
    const seg = h('div'), ph = h('div', { class: 'ph-row' });
    const drawSeg = () => seg.replaceChildren(segmented({ take: 'Поемам колата', ret: 'Връщам колата', dmg: 'Нова щета' }, when, (k) => { when = k; drawSeg(); }, { small: true, page: true, wrap: true }));
    const drawPh = () => ph.replaceChildren(...photos.map((p, i) => h('span', { class: 'ph' }, h('img', { src: p, alt: '' }), h('button', { type: 'button', onclick: () => { photos.splice(i, 1); drawPh(); } }, icon('x', 14)))),
      photos.length < 6 && h('button', { type: 'button', class: 'ph add', onclick: async () => { const { pickImage } = await import('./categories.js'); const p = await pickImage({ max: 900, quality: 0.68 }); if (p) { photos.push(p); drawPh(); } } }, icon('camera', 22), 'Снимка'));
    drawSeg(); drawPh();
    return h('div', { class: 'form' },
      sheetHead('Снимки на колата', close, 'Снимай колата отвсякъде. Така е ясно в чия смяна се е появила всяка драскотина.'),
      seg, h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Снимки'), ph), field('Бележка', text),
      h('button', { class: 'btn btn-primary btn-lg', onclick: () => { if (!photos.length && !text.value.trim()) return; store.addCarLog({ carId: car.id, kind: 'damage', stage: when, text: text.value.trim() || { take: 'Поемане на колата', ret: 'Връщане на колата', dmg: 'Нова щета' }[when], photos, fault: when === 'dmg' ? undefined : false }); close(); toast('Изпратено на собственика'); redraw && redraw(); } }, icon('check', 18), 'Изпрати'));
  }, { tall: true });
}

// ---------- Дневникът на колата ----------
const LOG_TXT = { notice: 'Съобщение', pay: 'Наем', fine: 'Глоба', damage: 'Щета / снимки', deposit: 'Депозит', deduct: 'Удръжка от депозита', refund: 'Върнат депозит', handover: 'Предаване', personal: 'Лично каране', remind: 'Напомняне', km: 'Километраж' };
const LOG_IC = { notice: 'bell', pay: 'coins', fine: 'alert', damage: 'camera', deposit: 'lock', deduct: 'minus', refund: 'download', handover: 'road', personal: 'route', remind: 'bell', km: 'gauge' };
export function logRow(l, info, redraw) {
  const who = info.users[l.driverId || l.by]?.name;
  const owner = info.car.ownerId === store.currentUser()?.id;
  return h('div', { class: 'log-row' },
    h('span', { class: 'cc-ic' }, icon(LOG_IC[l.kind] || 'doc', 17)),
    h('span', { class: 'grow' }, h('b', null, `${LOG_TXT[l.kind] || l.kind}${who ? ' · ' + first(who) : ''}`),
      h('small', null, [fmtDate(l.date || (l.at || '').slice(0, 10)), l.km ? `${fmtNum(l.km)} км` : null, l.kind === 'personal' && l.kmStart ? `${fmtNum(l.kmStart)} → ${fmtNum(l.kmEnd)}` : null, l.text, l.kind === 'pay' ? (l.status === 'ok' ? 'потвърдено' : 'чака потвърждение') : null].filter(Boolean).join(' · ')),
      owner && l.kind === 'pay' && l.status !== 'ok' && h('button', { class: 'chip page', style: { alignSelf: 'flex-start', marginTop: '6px' }, onclick: () => { store.confirmPay(l.id); toast('Потвърдено'); redraw(); } }, icon('check', 14), 'Потвърди'),
      l.photos?.length ? h('div', { class: 'ph-row small' }, l.photos.map((p) => h('a', { class: 'ph', href: p, target: '_blank', onclick: (e) => { e.preventDefault(); photoView(p); } }, h('img', { src: p, alt: '' })))) : null),
    l.amount ? h('b', { class: 'num' }, money(l.amount, l.amount % 1 ? 2 : 0)) : null,
    owner && h('button', { class: 'icon-btn plain', 'aria-label': 'Изтрий', onclick: () => confirmSheet({ title: 'Да изтрия ли записа?', okLabel: 'Изтрий', danger: true, onOk: () => { store.deleteCarLog(l.id); redraw(); } }) }, icon('trash', 15)));
}
export function photoView(src) { openSheet((close) => h('div', null, sheetHead('Снимка', close), h('img', { src, alt: '', style: { width: '100%', borderRadius: '14px' } })), { tall: true }); }

export { STATUS, RENT_PERIODS, rentState, depositState, startOfMonth, addDays, parseDate, fmtDuration, empty, costCat };

// Лично каране (не е таксиметрова смяна) – само километрите, за да няма пропуснати км по колата
export function personalKm(redraw) {
  const last = store.lastKm() || '';
  openNumpad({ title: 'Лично каране', sub: 'Километрите извън смяна – без приходи и разходи',
    fields: [{ key: 'a', label: 'От км', value: last, unit: 'км', decimals: 0 }, { key: 'b', label: 'До км', value: '', unit: 'км', decimals: 0 }],
    actions: [{ label: 'Запиши', primary: true, run: ({ a, b }) => {
      if (!(b > a)) { toast('Крайният км трябва да е по-голям', 'err'); return false; }
      store.addPersonalKm({ kmStart: a, kmEnd: b }); toast(`Записани ${Math.round(b - a)} км лично каране`); redraw && redraw();
    } }] });
}
