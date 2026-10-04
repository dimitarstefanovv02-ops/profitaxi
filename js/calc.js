// ProfiTaxi – изчисления. Чисти функции върху данните на един шофьор:
// { profile, shifts, costs }

import { todayStr, addDays, parseDate, daysInMonth, eachDay, isoToDateStr, minStr, maxStr, weekdayIdx, startOfMonth, endOfMonth, MONTHS_SHORT } from './util.js';
import { COST_CATS } from './constants.js';

export const shiftIncome = (s) => (s.income.cash || 0) + (s.income.card || 0) + (s.income.app || 0) + (s.income.tips || 0);
export const shiftExpenses = (s) => s.expenses.reduce((a, e) => a + (Number(e.amount) || 0), 0);
export const shiftProfit = (s) => shiftIncome(s) - shiftExpenses(s);
export const shiftKm = (s) => Math.max(0, (s.kmEnd || 0) - (s.kmStart || 0));
export const shiftHours = (s) => Math.max(0, ((s.end ? new Date(s.end) : new Date()) - new Date(s.start)) / 3600000);
export const shiftDate = (s) => isoToDateStr(s.start);

// Дял на шофьора от разходите за колата, ако я дели с друг
const shareFor = (cost, profile) => (COST_CATS[cost.category]?.car ? (profile.sharePct ?? 100) / 100 : 1);

// Постоянни разходи, разпределени за един ден
export function fixedForDay(costs, profile, day, worked) {
  const d = parseDate(day);
  let sum = 0;
  for (const c of costs) {
    if (c.startDate > day || (c.endDate && c.endDate < day)) continue;
    let v = 0;
    if (c.period === 'day') v = c.perWorkDay ? (worked ? c.amount : 0) : c.amount;
    else if (c.period === 'week') v = c.amount / 7;
    else if (c.period === 'month') v = c.amount / daysInMonth(d.getFullYear(), d.getMonth());
    else if (c.period === 'year') v = c.amount / (d.getFullYear() % 4 === 0 ? 366 : 365);
    sum += v * shareFor(c, profile);
  }
  return sum;
}
export function fixedByCategory(costs, profile, days, workedSet) {
  const out = {};
  for (const day of days) {
    for (const c of costs) {
      const v = fixedForDay([c], profile, day, workedSet.has(day));
      if (v) out[c.category] = (out[c.category] || 0) + v;
    }
  }
  return out;
}
// Колко струват постоянните разходи месечно (за текущия месец)
export function monthlyFixed(costs, profile, workDaysPerMonth = 24) {
  const today = todayStr();
  const active = costs.filter((c) => !c.endDate || c.endDate >= today);
  let m = 0;
  for (const c of active) {
    const s = shareFor(c, profile);
    if (c.period === 'day') m += c.amount * (c.perWorkDay ? workDaysPerMonth : 30.4) * s;
    else if (c.period === 'week') m += (c.amount * 52 / 12) * s;
    else if (c.period === 'month') m += c.amount * s;
    else if (c.period === 'year') m += (c.amount / 12) * s;
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
  const first = data.user?.createdAt ? isoToDateStr(data.user.createdAt) : from;
  const fixedFrom = maxStr(from, minStr(first, earliestShift(shifts) || first));
  const fixedTo = minStr(to, today);
  const days = fixedFrom <= fixedTo ? eachDay(fixedFrom, fixedTo) : [];
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
        st.fuel[t] = st.fuel[t] || { amount: 0, qty: 0, withQtyKm: 0 };
        st.fuel[t].amount += a; st.fuel[t].qty += Number(e.qty) || 0;
      }
    }
  }
  st.income = st.cash + st.card + st.app + st.tips;
  st.fixedByCat = fixedByCategory(costs, profile, days, workedSet);
  st.totalExp = st.varExp + st.fixedExp;
  st.net = st.income - st.totalExp;
  st.netPerHour = st.hours ? st.net / st.hours : 0;
  st.netPerKm = st.km ? st.net / st.km : 0;
  st.incomePerHour = st.hours ? st.income / st.hours : 0;
  st.avgShift = st.shifts ? st.net / st.shifts : 0;
  st.costPerKm = st.km ? st.totalExp / st.km : 0;
  for (const t of Object.keys(st.fuel)) st.fuel[t].per100 = st.km && st.fuel[t].qty ? (st.fuel[t].qty / st.km) * 100 : 0;
  return st;
}
function earliestShift(shifts) { let m = null; for (const s of shifts) { const d = shiftDate(s); if (!m || d < m) m = d; } return m; }

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

// Месечна цел и прогноза
export function goalProgress(data) {
  const today = todayStr();
  const from = startOfMonth(today), to = endOfMonth(today);
  const st = periodStats(data, from, today);
  const goal = data.profile.monthlyGoal || 0;
  const dim = parseDate(to).getDate();
  const elapsed = parseDate(today).getDate();
  const remainingDays = dim - elapsed;
  const workRatio = elapsed ? Math.max(st.workedDays / elapsed, 0.5) : 0.8;
  const avgDaily = elapsed ? st.net / elapsed : 0;
  const forecast = st.net + avgDaily * remainingDays;
  const remaining = Math.max(0, goal - st.net);
  // Постоянни разходи до края на месеца, които също трябва да се покрият
  let fixedLeft = 0;
  for (const d of remainingDays > 0 ? eachDay(addDays(today, 1), to) : []) fixedLeft += fixedForDay(data.costs, data.profile, d, true);
  const shiftsLeft = Math.max(1, Math.round(remainingDays * workRatio));
  const needPerShift = remaining > 0 ? (remaining + fixedLeft) / shiftsLeft : 0;
  return { goal, net: st.net, pct: goal ? st.net / goal : 0, remaining, forecast, remainingDays, shiftsLeft, needPerShift, done: goal > 0 && st.net >= goal, stats: st };
}

// Топлинна карта: среден приход на час по ден от седмицата × 3-часов интервал
export function heatmap(shifts) {
  const income = Array.from({ length: 7 }, () => Array(8).fill(0));
  const hours = Array.from({ length: 7 }, () => Array(8).fill(0));
  for (const s of shifts) {
    if (!s.end) continue;
    const total = shiftHours(s); if (total <= 0) continue;
    const rate = shiftIncome(s) / total;
    let t = new Date(s.start).getTime(); const end = new Date(s.end).getTime();
    while (t < end) {
      const d = new Date(t);
      const next = Math.min(end, new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime());
      const hrs = (next - t) / 3600000;
      const wd = (d.getDay() + 6) % 7, b = Math.floor(d.getHours() / 3);
      income[wd][b] += rate * hrs; hours[wd][b] += hrs;
      t = next;
    }
  }
  const grid = income.map((row, i) => row.map((v, j) => (hours[i][j] >= 1 ? v / hours[i][j] : null)));
  let max = 0, min = Infinity, best = null;
  grid.forEach((row, i) => row.forEach((v, j) => { if (v != null) { if (v > max) { max = v; best = { wd: i, b: j, v }; } if (v < min) min = v; } }));
  return { grid, max, min: min === Infinity ? 0 : min, best };
}

// Рекорди и серии
export function records(data) {
  const done = data.shifts.filter((s) => s.end);
  let bestShift = null, bestRate = null;
  for (const s of done) {
    const p = shiftProfit(s);
    if (!bestShift || p > bestShift.value) bestShift = { value: p, shift: s };
    const h = shiftHours(s);
    if (h >= 3) { const r = p / h; if (!bestRate || r > bestRate.value) bestRate = { value: r, shift: s }; }
  }
  // Най-добър месец (по нето, с постоянните разходи)
  const months = [...new Set(done.map((s) => shiftDate(s).slice(0, 7)))];
  let bestMonth = null;
  for (const m of months) {
    const from = m + '-01';
    const st = periodStats(data, from, minStr(endOfMonth(from), todayStr()));
    if (!bestMonth || st.net > bestMonth.value) bestMonth = { value: st.net, month: m };
  }
  // Серии от поредни работни дни
  const days = [...new Set(done.map(shiftDate))].sort();
  let longest = 0, run = 0, prev = null;
  for (const d of days) { run = prev && addDays(prev, 1) === d ? run + 1 : 1; longest = Math.max(longest, run); prev = d; }
  let current = 0;
  const set = new Set(days);
  let c = set.has(todayStr()) ? todayStr() : addDays(todayStr(), -1);
  while (set.has(c)) { current++; c = addDays(c, -1); }
  return { bestShift, bestRate, bestMonth, longest, current, totalShifts: done.length };
}

// Напомняния: документи с дата и сервиз по километри
export function upcomingReminders(data, withinDays = 30) {
  const today = todayStr();
  const out = [];
  for (const c of data.costs) {
    if (!c.dueDate || (c.endDate && c.endDate < today)) continue;
    const left = Math.round((parseDate(c.dueDate) - parseDate(today)) / 86400000);
    out.push({ id: 'c' + c.id, kind: 'cost', ref: c, title: c.name, dueDate: c.dueDate, daysLeft: left });
  }
  const km = currentKm(data.shifts);
  for (const r of data.reminders) {
    const item = { id: 'r' + r.id, kind: 'reminder', ref: r, title: r.title };
    if (r.dueDate) item.daysLeft = Math.round((parseDate(r.dueDate) - parseDate(today)) / 86400000), item.dueDate = r.dueDate;
    if (r.dueKm) item.kmLeft = r.dueKm - km, item.dueKm = r.dueKm;
    out.push(item);
  }
  const urgency = (x) => Math.min(x.daysLeft ?? 9999, x.kmLeft != null ? x.kmLeft / 80 : 9999);
  return out.map((x) => ({ ...x, urgent: urgency(x) <= withinDays })).sort((a, b) => urgency(a) - urgency(b));
}
export function currentKm(shifts) { let m = 0; for (const s of shifts) m = Math.max(m, s.kmEnd || 0, s.kmStart || 0); return m; }

// Нето за конкретна смяна след дела ѝ от постоянните разходи за деня
export function shiftNetAfterFixed(data, s) {
  const d = shiftDate(s);
  const same = data.shifts.filter((x) => x.end && shiftDate(x) === d).length || 1;
  return shiftProfit(s) - fixedForDay(data.costs, data.profile, d, true) / same;
}

export const weekdayOf = weekdayIdx;
