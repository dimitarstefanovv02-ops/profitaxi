// ProfiTaxi – изчисления. Чисти функции върху данните на един шофьор:
// { user, profile, shifts, costs, reminders }

import { todayStr, addDays, parseDate, daysInMonth, eachDay, isoToDateStr, minStr, maxStr, weekdayIdx, startOfMonth, endOfMonth, startOfWeek, MONTHS_SHORT } from './util.js';
import { COST_CATS } from './constants.js';

export const shiftIncome = (s) => (s.income.cash || 0) + (s.income.card || 0) + (s.income.app || 0) + (s.income.tips || 0);
export const shiftExpenses = (s) => s.expenses.reduce((a, e) => a + (Number(e.amount) || 0), 0);
// „Печалба от смяната“ = приход − разходите по време на смяната (гориво, миене…), БЕЗ постоянните
export const shiftProfit = (s) => shiftIncome(s) - shiftExpenses(s);
export const shiftKm = (s) => Math.max(0, (s.kmEnd || 0) - (s.kmStart || 0));
export const shiftHours = (s) => Math.max(0, ((s.end ? new Date(s.end) : new Date()) - new Date(s.start)) / 3600000);
export const shiftDate = (s) => isoToDateStr(s.start);

// Дял на шофьора от разходите за колата, ако я дели с друг
const shareFor = (cost, profile) => (COST_CATS[cost.category]?.car ? (profile.sharePct ?? 100) / 100 : 1);
const PER_YEAR = { week: 52.1775, month: 12, quarter: 4, year: 1 };

// Постоянни разходи, разпределени за един ден
export function fixedForDay(costs, profile, day, worked) {
  const d = parseDate(day);
  const dy = d.getFullYear() % 4 === 0 ? 366 : 365;
  let sum = 0;
  for (const c of costs) {
    if (c.startDate > day || (c.endDate && c.endDate < day)) continue;
    let v = 0;
    if (c.period === 'day') v = c.perWorkDay ? (worked ? c.amount : 0) : c.amount;
    else if (c.period === 'week') v = c.amount / 7;
    else if (c.period === 'month') v = c.amount / daysInMonth(d.getFullYear(), d.getMonth());
    else if (c.period === 'quarter') v = (c.amount * 4) / dy;
    else if (c.period === 'year') v = c.amount / dy;
    sum += v * shareFor(c, profile);
  }
  return sum;
}
export function fixedByCategory(costs, profile, days, workedSet) {
  const out = {};
  for (const day of days) for (const c of costs) {
    const v = fixedForDay([c], profile, day, workedSet.has(day));
    if (v) out[c.category] = (out[c.category] || 0) + v;
  }
  return out;
}
export const activeCosts = (costs) => { const t = todayStr(); return costs.filter((c) => !c.endDate || c.endDate >= t); };
// Колко струват постоянните разходи месечно
export function monthlyFixed(costs, profile, workDaysPerMonth = 24) {
  let m = 0;
  for (const c of activeCosts(costs)) {
    const s = shareFor(c, profile);
    if (c.period === 'day') m += c.amount * (c.perWorkDay ? workDaysPerMonth : 30.44) * s;
    else m += ((c.amount * PER_YEAR[c.period]) / 12) * s;
  }
  return m;
}
export function costMonthly(c, profile) { return monthlyFixed([c], profile); }

// Статистика за период [from, to] (включително)
export function periodStats(data, from, to) {
  const { shifts, costs, profile } = data;
  const today = todayStr();
  const inP = shifts.filter((s) => { const d = shiftDate(s); return d >= from && d <= to && s.end; });
  const workedSet = new Set(inP.map(shiftDate));
  // Постоянните разходи (наем, ефир, данъци…) се броят за целия текущ месец, защото са платени
  // или дължими за него, но не и за бъдещи месеци. Затова „Октомври“ показва целия наем от 600 €.
  const fixedTo = minStr(to, endOfMonth(today));
  const days = from <= fixedTo ? eachDay(from, fixedTo) : [];
  let fixed = 0;
  for (const d of days) fixed += fixedForDay(costs, profile, d, workedSet.has(d));

  const st = { from, to, shifts: inP.length, workedDays: workedSet.size, income: 0, cash: 0, card: 0, app: 0, tips: 0, varExp: 0, fixedExp: fixed, hours: 0, km: 0, expByCat: {}, fuel: {} };
  for (const s of inP) {
    st.cash += s.income.cash || 0; st.card += s.income.card || 0; st.app += s.income.app || 0; st.tips += s.income.tips || 0;
    st.hours += shiftHours(s); st.km += shiftKm(s);
    for (const e of s.expenses) {
      const a = Number(e.amount) || 0;
      st.varExp += a;
      st.expByCat[e.category] = (st.expByCat[e.category] || 0) + a;
      if (e.category === 'fuel') {
        const t = e.fuelType || 'petrol';
        st.fuel[t] = st.fuel[t] || { amount: 0, qty: 0 };
        st.fuel[t].amount += a; st.fuel[t].qty += Number(e.qty) || 0;
      }
    }
  }
  st.income = st.cash + st.card + st.app + st.tips;
  st.fixedByCat = fixedByCategory(costs, profile, days, workedSet);
  st.totalExp = st.varExp + st.fixedExp;
  st.net = st.income - st.totalExp;
  st.shiftProfit = st.income - st.varExp;
  st.netPerHour = st.hours ? st.net / st.hours : 0;
  st.netPerKm = st.km ? st.net / st.km : 0;
  st.incomePerHour = st.hours ? st.income / st.hours : 0;
  st.incomePerKm = st.km ? st.income / st.km : 0;
  st.avgShift = st.shifts ? st.net / st.shifts : 0;
  st.avgShiftIncome = st.shifts ? st.income / st.shifts : 0;
  st.avgShiftHours = st.shifts ? st.hours / st.shifts : 0;
  st.costPerKm = st.km ? st.totalExp / st.km : 0;
  for (const t of Object.keys(st.fuel)) st.fuel[t].per100 = st.km && st.fuel[t].qty ? (st.fuel[t].qty / st.km) * 100 : 0;
  return st;
}

// Нето печалба по дни или месеци – за графиките
export function series(data, from, to, unit) {
  const out = [];
  if (unit === 'month') {
    let c = startOfMonth(from);
    while (c <= to) {
      const e = minStr(endOfMonth(c), to);
      const st = periodStats(data, maxStr(c, from), e);
      out.push({ key: c, label: MONTHS_SHORT[parseDate(c).getMonth()], net: st.net, income: st.income, future: c > todayStr() });
      c = addDays(endOfMonth(c), 1);
    }
    return out;
  }
  const byDay = {};
  for (const s of data.shifts) { if (!s.end) continue; const d = shiftDate(s); if (d >= from && d <= to) (byDay[d] = byDay[d] || []).push(s); }
  const today = todayStr();
  for (const d of eachDay(from, to)) {
    const list = byDay[d] || [];
    const income = list.reduce((a, s) => a + shiftIncome(s), 0);
    const exp = list.reduce((a, s) => a + shiftExpenses(s), 0);
    const fixed = d <= today ? fixedForDay(data.costs, data.profile, d, list.length > 0) : 0;
    out.push({ key: d, label: String(parseDate(d).getDate()), net: income - exp - fixed, income, worked: list.length > 0, future: d > today });
  }
  return out;
}

// Месечна цел, прогноза и колко часа работа остават.
// Логика: постоянните разходи (наем, ефир…) се разпределят по дни, а всеки
// час работа носи „печалба от смяната на час“ (приход − гориво и др.).
// Остават: цел − чисто досега + постоянните разходи до края на месеца.
export function goalProgress(data) {
  const today = todayStr();
  const from = startOfMonth(today), to = endOfMonth(today);
  const st = periodStats(data, from, today);
  const goal = data.profile.monthlyGoal || 0;
  const dim = parseDate(to).getDate();
  const elapsed = parseDate(today).getDate();
  const remainingDays = dim - elapsed;

  // Скорост на час: първо този месец, ако е малко – последните 60 дни
  let base = st;
  if (st.hours < 12) base = periodStats(data, addDays(today, -60), today);
  const ratePerHour = base.hours ? (base.income - base.varExp) / base.hours : 0;
  const avgShiftHours = base.shifts ? base.hours / base.shifts : 9;
  const workRatio = base === st ? (elapsed ? Math.max(st.workedDays / elapsed, 0.4) : 0.8) : Math.max(base.workedDays / 60, 0.4);

  let fixedLeft = 0;
  if (remainingDays > 0) for (const d of eachDay(addDays(today, 1), to)) {
    const all = fixedForDay(data.costs, data.profile, d, true);
    const withoutWork = fixedForDay(data.costs, data.profile, d, false);
    fixedLeft += withoutWork + (all - withoutWork) * workRatio; // таксата „на работен ден“ – само за очакваните работни дни
  }
  // Целта се гледа като шофьор: наемът, ефирът и другите месечни разходи са за целия месец
  // (обикновено вече платени), затова се изваждат изцяло още сега, а не ден по ден.
  // Остава да се изкара разликата до целта с печалбата на час от смените (без постоянните разходи).
  const monthFixed = st.fixedExp + fixedLeft;
  const net = st.income - st.varExp - monthFixed;
  const remaining = Math.max(0, goal - net);
  const toEarn = remaining; // нужна печалба от смени до края на месеца
  const hoursNeeded = ratePerHour > 0 ? toEarn / ratePerHour : null;
  const shiftsNeeded = hoursNeeded != null ? Math.ceil(hoursNeeded / avgShiftHours) : null;
  const shiftsLeft = Math.max(1, Math.round(remainingDays * workRatio));
  const needPerShift = toEarn / shiftsLeft;
  const avgDaily = elapsed ? st.net / elapsed : 0;
  const forecast = st.net + (st.workedDays ? ((st.income - st.varExp) / Math.max(st.workedDays, 1)) * remainingDays * workRatio - fixedLeft : avgDaily * remainingDays);
  return {
    goal, net, netToDate: st.net, monthFixed, pct: goal ? net / goal : 0, remaining, toEarn, fixedLeft, forecast, remainingDays,
    ratePerHour, hoursNeeded, shiftsNeeded, avgShiftHours, shiftsLeft, needPerShift,
    feasible: hoursNeeded != null && hoursNeeded <= remainingDays * 12,
    done: goal > 0 && net >= goal, stats: st,
  };
}

// Кога се печели най-много: среден приход на час по ден, по час и по „прозорец“
export function timeInsights(shifts) {
  const inc = Array.from({ length: 7 }, () => Array(24).fill(0));
  const hrs = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const s of shifts) {
    if (!s.end) continue;
    const total = shiftHours(s); if (total <= 0) continue;
    const rate = shiftIncome(s) / total;
    let t = new Date(s.start).getTime(); const end = new Date(s.end).getTime();
    while (t < end) {
      const d = new Date(t);
      const next = Math.min(end, new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime());
      const h = (next - t) / 3600000;
      const wd = (d.getDay() + 6) % 7;
      inc[wd][d.getHours()] += rate * h; hrs[wd][d.getHours()] += h;
      t = next;
    }
  }
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const byWeekday = inc.map((row, i) => { const h = sum(hrs[i]); return { wd: i, rate: h >= 4 ? sum(row) / h : null, hours: h }; });
  const byHour = Array.from({ length: 24 }, (_, hh) => { const h = sum(hrs.map((r) => r[hh])); return { hour: hh, rate: h >= 3 ? sum(inc.map((r) => r[hh])) / h : null, hours: h }; });
  // 3-часови прозорци за всеки ден
  const windows = [];
  for (let wd = 0; wd < 7; wd++) for (let b = 0; b < 8; b++) {
    let i = 0, h = 0;
    for (let k = b * 3; k < b * 3 + 3; k++) { i += inc[wd][k]; h += hrs[wd][k]; }
    if (h >= 6) windows.push({ wd, from: b * 3, to: b * 3 + 3, rate: i / h, hours: h });
  }
  windows.sort((a, b) => b.rate - a.rate);
  const totalH = sum(byWeekday.map((x) => x.hours));
  const totalI = sum(inc.map(sum));
  return { byWeekday, byHour, top: windows.slice(0, 3), worst: windows.length > 3 ? windows[windows.length - 1] : null, avg: totalH ? totalI / totalH : 0, hasData: totalH >= 6, shifts: shifts.filter((x) => x.end).length };
}

// Рекорди и серии
export function records(data) {
  const done = data.shifts.filter((s) => s.end);
  const best = (fn, min = () => true) => { let b = null; for (const s of done) { if (!min(s)) continue; const v = fn(s); if (!b || v > b.value) b = { value: v, shift: s }; } return b; };
  const bestShift = best(shiftProfit);
  const bestIncome = best(shiftIncome);
  const bestRate = best((s) => shiftProfit(s) / shiftHours(s), (s) => shiftHours(s) >= 3);
  const mostKm = best(shiftKm);
  const longest = best(shiftHours);
  // Най-добра седмица и месец (по чисто, с постоянните разходи)
  const today = todayStr();
  const weeks = [...new Set(done.map((s) => startOfWeek(shiftDate(s))))];
  let bestWeek = null;
  for (const w of weeks) { const st = periodStats(data, w, minStr(addDays(w, 6), today)); if (!bestWeek || st.net > bestWeek.value) bestWeek = { value: st.net, from: w, st }; }
  const months = [...new Set(done.map((s) => shiftDate(s).slice(0, 7)))];
  let bestMonth = null;
  for (const m of months) { const f = m + '-01'; const st = periodStats(data, f, minStr(endOfMonth(f), today)); if (!bestMonth || st.net > bestMonth.value) bestMonth = { value: st.net, month: m, st }; }
  // Серии от поредни работни дни
  const days = [...new Set(done.map(shiftDate))].sort();
  let longestRun = 0, run = 0, prev = null;
  for (const d of days) { run = prev && addDays(prev, 1) === d ? run + 1 : 1; longestRun = Math.max(longestRun, run); prev = d; }
  let current = 0;
  const set = new Set(days);
  let c = set.has(today) ? today : addDays(today, -1);
  while (set.has(c)) { current++; c = addDays(c, -1); }
  const totals = done.reduce((a, s) => ({ km: a.km + shiftKm(s), hours: a.hours + shiftHours(s), income: a.income + shiftIncome(s) }), { km: 0, hours: 0, income: 0 });
  return { bestShift, bestIncome, bestRate, mostKm, longest, bestWeek, bestMonth, longestRun, current, totalShifts: done.length, totals, workedDays: days.length };
}

// Напомняния: падежи на постоянни разходи и собствени напомняния (дата или км)
export function upcomingReminders(data, withinDays = 30) {
  const today = todayStr();
  const out = [];
  for (const c of activeCosts(data.costs)) {
    if (!c.dueDate) continue;
    const left = Math.round((parseDate(c.dueDate) - parseDate(today)) / 86400000);
    out.push({ id: 'c' + c.id, kind: 'cost', ref: c, title: c.name, amount: c.amount, dueDate: c.dueDate, daysLeft: left });
  }
  const km = currentKm(data.shifts);
  for (const r of data.reminders) {
    const item = { id: 'r' + r.id, kind: 'reminder', ref: r, title: r.title };
    if (r.dueDate) { item.daysLeft = Math.round((parseDate(r.dueDate) - parseDate(today)) / 86400000); item.dueDate = r.dueDate; }
    if (r.dueKm) { item.kmLeft = r.dueKm - km; item.dueKm = r.dueKm; }
    out.push(item);
  }
  const urgency = (x) => Math.min(x.daysLeft ?? 9999, x.kmLeft != null ? x.kmLeft / 80 : 9999);
  return out.map((x) => ({ ...x, urgent: urgency(x) <= withinDays, soon: urgency(x) <= 3 })).sort((a, b) => urgency(a) - urgency(b));
}
export function currentKm(shifts) { let m = 0; for (const s of shifts) m = Math.max(m, s.kmEnd || 0, s.kmStart || 0); return m; }

// Нето за конкретна смяна след дела ѝ от постоянните разходи за деня
export function shiftNetAfterFixed(data, s) {
  const d = shiftDate(s);
  const same = data.shifts.filter((x) => x.end && shiftDate(x) === d).length || 1;
  return shiftProfit(s) - fixedForDay(data.costs, data.profile, d, true) / same;
}

// Седмица по дни (за лентата на началния екран)
export function weekStrip(data, anchor = todayStr()) {
  const from = startOfWeek(anchor);
  return series(data, from, addDays(from, 6), 'day');
}

export const weekdayOf = weekdayIdx;

// ---------- Календар: резервации, падежи на плащания, напомняния и смени за период ----------
function addPeriodDue(date, period, anchorDay) {
  const d = parseDate(date);
  if (period === 'day') d.setDate(d.getDate() + 1);
  else if (period === 'week') d.setDate(d.getDate() + 7);
  else {
    const add = period === 'month' ? 1 : period === 'quarter' ? 3 : 12;
    const day = anchorDay || d.getDate();
    d.setDate(1); d.setMonth(d.getMonth() + add);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function calendarEvents(data, from, to) {
  const out = [];
  const today = todayStr();
  for (const r of data.reservations || []) {
    if (r.date >= from && r.date <= to) out.push({ kind: 'res', id: 'res-' + r.id, date: r.date, time: r.time || '', title: r.client || 'Резервация', sub: `${r.from} → ${r.to}`, amount: r.price || 0, done: !!r.done, ref: r });
  }
  for (const c of activeCosts(data.costs)) {
    if (!c.dueDate) continue;
    let d = c.dueDate, guard = 0;
    while (d <= to && guard++ < 400) {
      if (c.endDate && d > c.endDate) break;
      if (d >= from) out.push({ kind: 'pay', id: `pay-${c.id}-${d}`, date: d, time: '', title: c.name, amount: c.amount, late: d < today, first: d === c.dueDate, ref: c });
      if (!c.period || c.period === 'once') break;
      d = addPeriodDue(d, c.period, c.dueDay);
    }
  }
  for (const r of data.reminders || []) {
    if (r.dueDate && r.dueDate >= from && r.dueDate <= to) out.push({ kind: 'rem', id: 'rem-' + r.id, date: r.dueDate, time: '', title: r.title, late: r.dueDate < today, ref: r });
  }
  for (const s of data.shifts) {
    if (!s.end) continue;
    const d = shiftDate(s);
    if (d >= from && d <= to) {
      const st = new Date(s.start);
      out.push({ kind: 'shift', id: 'shift-' + s.id, date: d, time: `${String(st.getHours()).padStart(2, '0')}:${String(st.getMinutes()).padStart(2, '0')}`, title: 'Смяна', amount: shiftNetAfterFixed(data, s), hours: shiftHours(s), ref: s });
    }
  }
  const rank = { pay: 0, rem: 1, res: 2, shift: 3 };
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.time || '00:00').localeCompare(b.time || '00:00') || rank[a.kind] - rank[b.kind]);
}

// ---------- Напомняния по имейл ----------
// Настройки по подразбиране: изключени; плащания – 3 и 1 ден преди и в деня; курсове – ден и 2 часа преди.
export const EMAIL_DEFAULTS = { on: false, pay: [3, 1, 0], res: [1440, 120] };
export const EMAIL_PAY_OPTIONS = [[7, '7 дни'], [3, '3 дни'], [2, '2 дни'], [1, '1 ден'], [0, 'в деня']];
export const EMAIL_RES_OPTIONS = [[1440, '1 ден'], [180, '3 часа'], [120, '2 часа'], [60, '1 час'], [30, '30 мин']];
const pad2 = (n) => String(n).padStart(2, '0');
const localIso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
// Опашка с имейли за изпращане. Всеки имейл има постоянен ключ, който зависи от датата/часа на събитието:
// – промяна на курс или падеж → ключът се сменя и старото напомняне изчезва само;
// – изтрит или изпълнен курс / платено плащане → напомнянето изчезва;
// – вече изпратените ключове (sent) никога не се връщат → без дублиране.
export function emailQueue(data, { now = new Date(), horizonDays = 14, sent = data.profile?.emailSent || [] } = {}) {
  const cfg = { ...EMAIL_DEFAULTS, ...(data.profile?.emailReminders || {}) };
  if (!cfg.on) return [];
  const done = new Set(sent);
  const out = [];
  const nowIso = localIso(now);
  const until = new Date(now); until.setDate(until.getDate() + horizonDays);
  const today = localIso(now).slice(0, 10);
  for (const e of calendarEvents(data, today, localIso(until).slice(0, 10))) {
    if (e.kind === 'pay' && e.first && !e.late) {
      for (const days of cfg.pay) {
        const at = parseDate(e.date); at.setDate(at.getDate() - days); at.setHours(9, 0, 0, 0);
        const key = `pay:${e.ref.id}:${e.date}:${days}`;
        if (!done.has(key) && localIso(at) >= nowIso.slice(0, 10) + 'T00:00') out.push({ key, kind: 'pay', sendAt: localIso(at), subject: `Напомняне: ${e.title}${days ? ` след ${days === 1 ? '1 ден' : `${days} дни`}` : ' днес'}`, body: `${e.title} – ${e.amount} €, падеж ${e.date}.`, refId: e.ref.id });
      }
    }
    if (e.kind === 'res' && !e.done && e.time) {
      const start = new Date(`${e.date}T${e.time}`);
      for (const mins of cfg.res) {
        const at = new Date(start.getTime() - mins * 60000);
        const key = `res:${e.ref.id}:${e.date}T${e.time}:${mins}`;
        if (!done.has(key) && at > now) out.push({ key, kind: 'res', sendAt: localIso(at), subject: `Курс в ${e.time}: ${e.title}`, body: `${e.date} ${e.time} – ${e.sub}${e.ref.phone ? `, тел. ${e.ref.phone}` : ''}.`, refId: e.ref.id });
      }
    }
  }
  return out.sort((a, b) => a.sendAt.localeCompare(b.sendAt));
}
