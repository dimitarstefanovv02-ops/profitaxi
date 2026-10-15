// Автопарк: сметките на собственика на коли под наем – наем по периоди, плащания, дълг и аванс,
// депозит, печалба по кола, изплащане, статус и престой. Само чисти функции, без запис.
import { todayStr, addDays, parseDate, dateStr, eachDay, daysInMonth, round2 } from './util.js';
import { fixedForDay } from './calc.js';

// Напомняне за сроковете: колко дни преди (по подразбиране 14, 7 и 3; собственикът си ги сменя)
export const DL_DAYS = [14, 7, 3];
export const DL_CHOICES = [30, 14, 7, 3, 1];
export const dlDays = (profile) => (Array.isArray(profile?.dlDays) && profile.dlDays.length ? [...profile.dlDays].sort((a, b) => b - a) : DL_DAYS);
export const RENT_PERIODS = { day: 'на ден', week: 'на седмица', month: 'на месец', once: 'за целия период' };
export const STATUS = {
  driving: { label: 'Кара се', cls: 'ok', ic: 'car' },
  idle: { label: 'Стои', cls: 'warn', ic: 'clock' },
  free: { label: 'Свободна', cls: 'calm', ic: 'key' },
  service: { label: 'В сервиз', cls: 'warn', ic: 'wrench' },
  late: { label: 'Просрочен наем', cls: 'bad', ic: 'alert' },
};
// Документи на колата и на шофьора – със срок на валидност
export const CAR_DOCS = { insurance: 'Гражданска отговорност', casco: 'Каско', vignette: 'Винетка', inspection: 'Технически преглед', license: 'Лиценз / разрешително', cartax: 'Данък МПС' };
export const DRIVER_DOCS = { dl: 'Шофьорска книжка', cert: 'Удостоверение за таксиметров шофьор', medical: 'Медицинско' };

const addMonths = (s, n, dom) => { const d = parseDate(s); const y = d.getFullYear(), m = d.getMonth() + n; const day = Math.min(dom || d.getDate(), daysInMonth(new Date(y, m, 1).getFullYear(), new Date(y, m, 1).getMonth())); return dateStr(new Date(y, m, day)); };

// Периодите на наема от началото до `until` (включително започналите в този ден).
// Наемът се плаща в началото на периода. При „за целия период“ има само един период – от … до.
export function rentPeriods(rent, until = todayStr()) {
  if (!rent || !(rent.amount > 0) || !rent.from) return [];
  const out = []; const last = rent.to && rent.to < until ? rent.to : until;
  if (rent.period === 'once') return rent.from <= until ? [{ start: rent.from, end: rent.to || rent.from, amount: Number(rent.amount) }] : [];
  let s = rent.from, i = 0; const dom = parseDate(rent.from).getDate();
  while (s <= last && i < 2000) {
    const next = rent.period === 'day' ? addDays(s, 1) : rent.period === 'month' ? addMonths(rent.from, ++i, dom) : addDays(s, 7);
    let end = addDays(next, -1); let amount = Number(rent.amount);
    if (rent.to && end > rent.to) { // последният период е непълен – пропорционално
      const full = Math.round((parseDate(next) - parseDate(s)) / 864e5), used = Math.round((parseDate(rent.to) - parseDate(s)) / 864e5) + 1;
      amount = round2(amount * used / full); end = rent.to;
    }
    out.push({ start: s, end, amount });
    if (rent.period === 'day') i++;
    s = next;
  }
  return out;
}

// Състоянието на наема на един шофьор: дължимо, платено, чакащо потвърждение, дълг или аванс, по периоди.
export function rentState(member, logs, today = todayStr()) {
  const rent = member?.rent;
  const mine = logs.filter((l) => l.kind === 'pay' && l.driverId === member?.userId);
  const paid = round2(mine.filter((l) => l.status === 'ok').reduce((a, l) => a + (Number(l.amount) || 0), 0));
  const pending = mine.filter((l) => l.status !== 'ok');
  const periods = rentPeriods(rent, today).map((p) => ({ ...p, paid: 0 }));
  // плащанията покриват периодите по ред – най-старият първо
  let left = paid;
  for (const p of periods) { const x = Math.min(left, p.amount); p.paid = round2(x); left = round2(left - x); }
  for (const p of periods) p.status = p.paid >= p.amount - 0.005 ? 'paid' : p.start < today ? 'late' : 'due';
  const dueTotal = round2(periods.reduce((a, p) => a + p.amount, 0));
  const debt = Math.max(0, round2(dueTotal - paid)), advance = Math.max(0, round2(paid - dueTotal));
  const open = periods.filter((p) => p.status !== 'paid');
  // следващото плащане: първият неплатен период или следващият, ако всичко е платено
  const fut = rent?.amount > 0 && !(rent.to && rent.to <= today) && rent.period !== 'once' ? rentPeriods(rent, addDays(today, 40)).find((p) => p.start > today) : null;
  const next = open[0] ? { date: open[0].start, amount: round2(open[0].amount - open[0].paid) } : fut ? { date: fut.start, amount: Math.max(0, round2(fut.amount - advance)) } : null;
  return { periods, dueTotal, paid, pending, pendingSum: round2(pending.reduce((a, l) => a + (Number(l.amount) || 0), 0)), debt, advance, late: open.some((p) => p.status === 'late'), lateDays: open[0] && open[0].start < today ? Math.round((parseDate(today) - parseDate(open[0].start)) / 864e5) : 0, next, history: mine.slice().sort((a, b) => String(b.date || b.at).localeCompare(String(a.date || a.at))) };
}

// Депозит: оставен (+), удържан при щети (−), върнат (−)
export function depositState(driverId, logs) {
  const mine = logs.filter((l) => l.driverId === driverId && ['deposit', 'deduct', 'refund'].includes(l.kind));
  const given = mine.filter((l) => l.kind === 'deposit').reduce((a, l) => a + (Number(l.amount) || 0), 0);
  const taken = mine.filter((l) => l.kind !== 'deposit').reduce((a, l) => a + (Number(l.amount) || 0), 0);
  return { given: round2(given), taken: round2(taken), balance: round2(given - taken), list: mine.sort((a, b) => String(b.date).localeCompare(String(a.date))) };
}

// Разходите по колата за дните от–до (с пълната сума – собственикът ги плаща сам)
export function carCostSum(costs, from, to) {
  // първоначалните (апарат, боядисване, окабеляване…) са вложение – влизат в изплащането на колата, не в месеца
  const full = costs.filter((c) => !c.initial).map((c) => ({ ...c, share: 1 }));
  return round2(eachDay(from, to).reduce((a, d) => a + fixedForDay(full, {}, d, true), 0));
}
// Събраният наем (потвърдените плащания) за дните от–до
export const rentIn = (logs, from, to) => round2(logs.filter((l) => l.kind === 'pay' && l.status === 'ok' && (l.date || '') >= from && (l.date || '') <= to).reduce((a, l) => a + (Number(l.amount) || 0), 0));
// Печалбата на колата: събран наем + удръжки от депозит − разходите по колата
export function carProfit(costs, logs, from, to) {
  const income = rentIn(logs, from, to);
  const expense = carCostSum(costs, from, to);
  return { income, expense, net: round2(income - expense) };
}
// Първоначални разходи по колата (вложение)
export const initialSum = (costs) => round2(costs.filter((c) => c.initial).reduce((a, c) => a + (Number(c.amount) || 0), 0));
// Кога се изплаща колата: покупна цена + първоначалните разходи срещу печалбата от покупката досега
export function payback(car, costs, logs, today = todayStr()) {
  const setup = initialSum(costs);
  const price = (Number(car.price) || 0) + setup; if (!price) return null;
  const from = car.boughtAt || (car.createdAt || today).slice(0, 10);
  const done = carProfit(costs, logs, from, today).net;
  // средно на месец за последните 90 дни (или от покупката, ако е по-скоро)
  const f90 = from > addDays(today, -89) ? from : addDays(today, -89);
  const days = Math.max(1, Math.round((parseDate(today) - parseDate(f90)) / 864e5) + 1);
  const perMonth = carProfit(costs, logs, f90, today).net / days * 30.44;
  const left = Math.max(0, price - done);
  return { price, setup, buy: Number(car.price) || 0, done: round2(done), pct: Math.max(0, Math.min(100, done / price * 100)), left: round2(left), perMonth: round2(perMonth), months: left <= 0 ? 0 : perMonth > 0 ? Math.ceil(left / perMonth) : null };
}

// Километрите на колата: смените и личното каране на шофьорите, подредени по време.
// Пропуснати км = когато началният километраж е по-голям от крайния на предишния запис.
export function kmGaps(records, startKm = 0) {
  const list = records.filter((r) => r.kmStart > 0 || r.kmEnd > 0).slice().sort((a, b) => String(a.start).localeCompare(String(b.start)));
  let prev = startKm || 0, gap = 0; const gaps = [];
  for (const r of list) {
    if (prev && r.kmStart > prev + 1) { gap += r.kmStart - prev; gaps.push({ at: r.start, from: prev, to: r.kmStart, km: r.kmStart - prev, userId: r.userId }); }
    if (r.kmEnd > prev) prev = r.kmEnd;
  }
  return { gap, gaps, lastKm: prev };
}

// Статус на колата: в сервиз / свободна са ръчни; иначе – просрочен наем, кара се или стои
export function carStatus(car, { rents = [], lastShift = null, active = false, today = todayStr() } = {}) {
  if (car.status === 'service') return 'service';
  if (String(car.status || '').startsWith('c:')) return car.status; // свой статус на собственика
  const drivers = (car.members || []).filter((m) => m.userId !== car.ownerId || car.type === 'own');
  if (car.status === 'free' || !drivers.length) return 'free';
  if (rents.some((r) => r.late)) return 'late';
  if (active) return 'driving';
  const idle = idleDays(lastShift, today);
  return idle >= 2 ? 'idle' : 'driving';
}
export const idleDays = (lastShift, today = todayStr()) => (lastShift ? Math.max(0, Math.round((parseDate(today) - parseDate(lastShift.slice(0, 10))) / 864e5)) : 99);

// Оценка на шофьора (само за собственика): редовност на плащанията, щети, глоби
export function driverScore({ rent, logs, driverId }) {
  const fines = logs.filter((l) => l.kind === 'fine' && l.driverId === driverId).length;
  const damages = logs.filter((l) => l.kind === 'damage' && l.driverId === driverId && l.fault !== false && l.by !== driverId).length + logs.filter((l) => l.kind === 'deduct' && l.driverId === driverId).length;
  const lateP = rent ? rent.periods.filter((p) => p.status === 'late').length : 0;
  const all = rent ? rent.periods.length : 0;
  let s = 5;
  if (all) s -= Math.min(2.5, lateP * 1);
  s -= Math.min(1.5, fines * 0.5);
  s -= Math.min(1.5, damages * 0.75);
  s = Math.max(1, Math.round(s * 2) / 2);
  return { score: s, fines, damages, late: lateP, periods: all, word: s >= 4.5 ? 'Отличен' : s >= 3.5 ? 'Добър' : s >= 2.5 ? 'Внимание' : 'Проблемен' };
}

// Срокове: документите на колата + падежите на разходите ѝ
export function deadlines(car, costs, today = todayStr()) {
  const out = [];
  // срокове, добавени на ръка (и старите „Валидни до“); тахографът вече го няма
  for (const [k, until] of Object.entries(car.docs || {})) if (until && k !== 'tacho') out.push({ key: 'doc:' + k, title: car.docNames?.[k] || CAR_DOCS[k] || k, date: until, kind: 'doc', docKey: k });
  // сроковете идват сами от постоянните разходи (следващото плащане); махнатите от списъка са с noDl
  for (const c of costs) if (c.dueDate && c.period !== 'once' && !c.noDl && (!c.endDate || c.endDate >= today)) {
    if (car.docs?.[c.category] && car.docs[c.category] === c.dueDate) continue;
    out.push({ key: 'cost:' + c.id, title: c.name, date: c.dueDate, kind: 'cost', amount: c.amount, costId: c.id });
  }
  for (const m of car.members || []) for (const [k, until] of Object.entries(m.docs || {})) if (until) out.push({ key: `drv:${m.userId}:${k}`, title: `${DRIVER_DOCS[k] || k} · ${m.name || ''}`.trim(), date: until, kind: 'driver', userId: m.userId });
  return out.map((x) => ({ ...x, left: Math.round((parseDate(x.date) - parseDate(today)) / 864e5) })).sort((a, b) => a.date.localeCompare(b.date));
}

// Кой е карал колата в даден момент (за глоби): смяна, която покрива часа; иначе последната преди него
export function whoDrove(carMembers, shifts, iso) {
  const ids = new Set(carMembers.map((m) => m.userId));
  const t = new Date(iso).getTime();
  const list = shifts.filter((s) => ids.has(s.userId));
  const hit = list.find((s) => new Date(s.start).getTime() <= t && (s.end ? new Date(s.end).getTime() : Date.now()) >= t);
  if (hit) return { userId: hit.userId, sure: true, shift: hit };
  const before = list.filter((s) => new Date(s.start).getTime() <= t).sort((a, b) => String(b.start).localeCompare(String(a.start)))[0];
  return before ? { userId: before.userId, sure: false, shift: before } : carMembers.length === 1 ? { userId: carMembers[0].userId, sure: false } : null;
}

// Гласови команди в колата: „200 евро гуми“, „платен наем“, „глоба 50 за превишена скорост“, „депозит 300“, „в сервиз“
const VOICE_CATS = [
  [/гум/, 'tires', 'Гуми'], [/масл|филтр|обслуж/, 'service', 'Обслужване'], [/ремонт|сервиз[а-я]* [0-9]|механ|спирач|съединит|ремък|акумулатор/, 'repair', 'Ремонт'],
  [/каско/, 'casco', 'Каско'], [/гражданск|застрах/, 'insurance', 'Застраховка'], [/винетк/, 'vignette', 'Винетка'], [/преглед/, 'inspection', 'Технически преглед'],
  [/данък/, 'cartax', 'Данък МПС'], [/лиценз|разрешител/, 'license', 'Лиценз'], [/тахограф|апарат/, 'meter', 'Таксиметров апарат'], [/мивк|миене/, 'wash', 'Автомивка'],
];
export function parseCarVoice(raw, wordsToDigits = (x) => x) {
  const t = wordsToDigits(String(raw || '').toLowerCase()).replace(/(\d)[ ,](\d{3})\b/g, '$1$2').replace(/(\d),(\d)/g, '$1.$2');
  const num = (t.match(/(\d+(?:\.\d+)?)/) || [])[1]; const amount = num ? Number(num) : 0;
  const reason = (t.match(/(?:за|заради)\s+(.+)$/) || [])[1]?.trim() || '';
  if (/в сервиз|на сервиз|влиза в сервиз/.test(t) && !amount) return { kind: 'status', status: 'service', label: 'Колата е в сервиз' };
  if (/свободн/.test(t)) return { kind: 'status', status: 'free', label: 'Колата е свободна' };
  if (/кара се|работи пак|излезе от сервиз|върна се/.test(t)) return { kind: 'status', status: '', label: 'Колата се кара' };
  if (/глоб|фиш|акт\b/.test(t)) return { kind: 'fine', amount, text: reason || (/скорост/.test(t) ? 'превишена скорост' : /паркир/.test(t) ? 'неправилно паркиране' : ''), label: 'Глоба' };
  if (/депозит/.test(t) && /удърж|щет/.test(t)) return { kind: 'deduct', amount, text: reason, label: 'Удръжка от депозита' };
  if (/депозит/.test(t)) return { kind: 'deposit', amount, label: 'Депозит' };
  if (/щет|драск|удар|вдлъбн|счупен/.test(t)) return { kind: 'damage', amount, text: reason || t, label: 'Щета' };
  if (/наем|плат(и|ен|ено|ил)/.test(t) && !VOICE_CATS.some(([re]) => re.test(t))) return { kind: 'pay', amount, label: 'Платен наем' };
  if (/километ|км\b/.test(t) && amount > 1000) return { kind: 'km', km: Math.round(amount), label: 'Километраж' };
  const cat = VOICE_CATS.find(([re]) => re.test(t));
  if (cat && amount) return { kind: 'cost', category: cat[1], amount, text: cat[2], label: cat[2] };
  if (amount) return { kind: 'cost', category: 'other', amount, text: reason || t.replace(/\d+(\.\d+)?|евро|лева|€/g, '').trim(), label: 'Разход' };
  return null;
}
