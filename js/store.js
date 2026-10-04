// ProfiTaxi – слой за данни.
// ДЕМО РЕЖИМ: всичко се пази в localStorage на устройството.
// Всички екрани говорят само с функциите тук, така че по-късно този файл
// се заменя с истинска база (напр. Supabase) без промени по интерфейса.

import { todayStr, addDays, uid, rng, round2, dateStr } from './util.js';
import { CAR_TYPES } from './constants.js';

const KEY = 'profitaxi.v1';
const SESSION_KEY = 'profitaxi.session';
const ADMIN_SESSION_KEY = 'profitaxi.asession';
const listeners = new Set();
let db = null;

function load() {
  if (db) return db;
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch { db = null; }
  if (!db || db.version !== 1) { db = seed(); persist(); }
  return db;
}
function persist() { localStorage.setItem(KEY, JSON.stringify(db)); }
function commit() { persist(); listeners.forEach((fn) => fn()); }
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export function resetDemo() { localStorage.removeItem(KEY); localStorage.removeItem(SESSION_KEY); localStorage.removeItem(ADMIN_SESSION_KEY); db = null; load(); }

// Синхронизация между отворени раздели
window.addEventListener('storage', (e) => { if (e.key === KEY) { db = null; load(); listeners.forEach((fn) => fn()); } });

const norm = (e) => String(e || '').trim().toLowerCase();
const clone = (o) => JSON.parse(JSON.stringify(o));

// ================= Абонамент / достъп =================
export function accessState(user) {
  if (!user) return 'none';
  if (user.status === 'blocked') return 'blocked';
  if (user.role === 'admin') return 'ok';
  if (!user.subscription || user.subscription.validUntil < todayStr()) return 'expired';
  return 'ok';
}
export function trialDaysLeft(user) {
  if (!user?.subscription || user.subscription.plan !== 'trial') return null;
  const d = (new Date(user.subscription.validUntil) - new Date(todayStr())) / 86400000;
  return Math.max(0, Math.round(d));
}

// ================= Вход на шофьор =================
export function currentUser() {
  load();
  const id = localStorage.getItem(SESSION_KEY);
  const u = db.users.find((x) => x.id === id && x.role === 'driver');
  return u ? clone(u) : null;
}
export function login(email, password) {
  load();
  const u = db.users.find((x) => norm(x.email) === norm(email) && x.role === 'driver');
  if (!u || u.password !== password) return { error: 'Грешен имейл или парола' };
  localStorage.setItem(SESSION_KEY, u.id);
  u.lastLoginAt = new Date().toISOString();
  commit();
  return { user: clone(u) };
}
export function logout() { localStorage.removeItem(SESSION_KEY); listeners.forEach((fn) => fn()); }
export function register({ name, email, password, phone }) {
  load();
  if (!name?.trim()) return { error: 'Въведи име' };
  if (!/^\S+@\S+\.\S+$/.test(email || '')) return { error: 'Невалиден имейл' };
  if ((password || '').length < 6) return { error: 'Паролата трябва да е поне 6 символа' };
  if (db.users.some((x) => norm(x.email) === norm(email))) return { error: 'Има акаунт с този имейл' };
  const u = newDriver({ name: name.trim(), email: email.trim(), password, phone, trialDays: db.settings.trialDays });
  localStorage.setItem(SESSION_KEY, u.id);
  commit();
  return { user: clone(u) };
}
function newDriver({ name, email, password, phone = '', trialDays = 14, plan = 'trial', profile = {} }) {
  const today = todayStr();
  const u = {
    id: uid(), role: 'driver', name, email, password, phone, status: 'active',
    createdAt: new Date().toISOString(), lastLoginAt: null,
    subscription: { plan, validUntil: addDays(today, trialDays) },
  };
  db.users.push(u);
  db.profiles[u.id] = {
    onboarded: false, carType: 'own', fuel: 'petrol_lpg',
    leasing: { amount: 0 }, rent: { amount: 0, period: 'week' },
    dispatch: { mode: 'none', amount: 0 }, sharePct: 100, monthlyGoal: 2000,
    ...profile,
  };
  return u;
}
export function changePassword(oldPw, newPw) {
  const u = me(); if (!u) return { error: 'Няма вход' };
  if (u.password !== oldPw) return { error: 'Грешна текуща парола' };
  if ((newPw || '').length < 6) return { error: 'Паролата трябва да е поне 6 символа' };
  u.password = newPw; commit(); return { ok: true };
}
export function updateAccount({ name, phone }) {
  const u = me(); if (!u) return;
  if (name?.trim()) u.name = name.trim();
  if (phone != null) u.phone = phone;
  commit();
}
export function deleteMyAccount() {
  const u = me(); if (!u) return;
  wipeUser(u.id);
  localStorage.removeItem(SESSION_KEY);
  commit();
}
function wipeUser(id) {
  db.users = db.users.filter((x) => x.id !== id);
  delete db.profiles[id];
  db.shifts = db.shifts.filter((x) => x.userId !== id);
  db.costs = db.costs.filter((x) => x.userId !== id);
  db.reminders = db.reminders.filter((x) => x.userId !== id);
}
function me() { load(); const id = localStorage.getItem(SESSION_KEY); return db.users.find((x) => x.id === id && x.role === 'driver'); }
function myId() { const u = me(); if (!u) throw new Error('not signed in'); return u.id; }

// ================= Данни на текущия шофьор =================
// Всяка функция работи САМО с данните на влезлия шофьор.
export function getProfile() { return clone(db.profiles[myId()]); }
export function getShifts() { const id = myId(); return clone(db.shifts.filter((s) => s.userId === id)).sort((a, b) => b.start.localeCompare(a.start)); }
export function getShift(sid) { const id = myId(); const s = db.shifts.find((x) => x.id === sid && x.userId === id); return s ? clone(s) : null; }
export function getActiveShift() { const id = myId(); const s = db.shifts.find((x) => x.userId === id && !x.end); return s ? clone(s) : null; }
export function getCosts() { const id = myId(); return clone(db.costs.filter((c) => c.userId === id)); }
export function getReminders() { const id = myId(); return clone(db.reminders.filter((r) => r.userId === id)); }
export function myData() { const id = myId(); return userData(id); }
function userData(id) {
  return {
    user: clone(db.users.find((u) => u.id === id)),
    profile: clone(db.profiles[id]),
    shifts: clone(db.shifts.filter((s) => s.userId === id)).sort((a, b) => b.start.localeCompare(a.start)),
    costs: clone(db.costs.filter((c) => c.userId === id)),
    reminders: clone(db.reminders.filter((r) => r.userId === id)),
  };
}
export function lastKm() {
  const id = myId();
  const done = db.shifts.filter((s) => s.userId === id && s.kmEnd).sort((a, b) => b.start.localeCompare(a.start));
  return done[0]?.kmEnd || 0;
}

export function startShift(kmStart) {
  const id = myId();
  if (db.shifts.some((s) => s.userId === id && !s.end)) return getActiveShift();
  const s = { id: uid(), userId: id, start: new Date().toISOString(), end: null, kmStart: kmStart || 0, kmEnd: 0, income: { cash: 0, card: 0, app: 0, tips: 0 }, expenses: [], note: '' };
  db.shifts.push(s); commit(); return clone(s);
}
export function saveShift(shift) {
  const id = myId();
  const s = { ...clone(shift), userId: id };
  if (!s.id) s.id = uid();
  const i = db.shifts.findIndex((x) => x.id === s.id);
  if (i >= 0) { if (db.shifts[i].userId !== id) return null; db.shifts[i] = s; } else db.shifts.push(s);
  commit(); return clone(s);
}
export function deleteShift(sid) { const id = myId(); db.shifts = db.shifts.filter((s) => !(s.id === sid && s.userId === id)); commit(); }

export function saveCost(cost) {
  const id = myId();
  const c = { ...clone(cost), userId: id };
  if (!c.id) { c.id = uid(); c.startDate = c.startDate || todayStr(); }
  const i = db.costs.findIndex((x) => x.id === c.id);
  if (i >= 0) { if (db.costs[i].userId !== id) return; db.costs[i] = c; } else db.costs.push(c);
  commit();
}
export function deleteCost(cid) {
  const id = myId();
  const c = db.costs.find((x) => x.id === cid && x.userId === id);
  if (!c) return;
  // Спираме разхода от днес нататък, за да не се пренаписват старите месеци
  if (c.startDate < todayStr()) c.endDate = addDays(todayStr(), -1);
  else db.costs = db.costs.filter((x) => x !== c);
  commit();
}
export function saveReminder(r) {
  const id = myId();
  const x = { ...clone(r), userId: id };
  if (!x.id) x.id = uid();
  const i = db.reminders.findIndex((y) => y.id === x.id);
  if (i >= 0) { if (db.reminders[i].userId !== id) return; db.reminders[i] = x; } else db.reminders.push(x);
  commit();
}
export function deleteReminder(rid) { const id = myId(); db.reminders = db.reminders.filter((r) => !(r.id === rid && r.userId === id)); commit(); }

// Обновява профила. Настройките за кола и ефир се превръщат в постоянни
// разходи, които важат ОТ ДНЕС – старите отчети остават непроменени.
export function updateProfile(patch) {
  const id = myId();
  applyProfile(id, patch);
  commit();
}
function applyProfile(id, patch) {
  const p = db.profiles[id];
  Object.assign(p, clone(patch));
  syncSystemCost(id, 'dispatch', p.dispatch.mode !== 'none' && p.dispatch.amount > 0
    ? { name: 'Ефир / диспечер', category: 'dispatch', amount: p.dispatch.amount, period: { daily: 'day', weekly: 'week', monthly: 'month' }[p.dispatch.mode], perWorkDay: p.dispatch.mode === 'daily' }
    : null);
  syncSystemCost(id, 'leasing', p.carType === 'leasing' && p.leasing.amount > 0
    ? { name: 'Лизингова вноска', category: 'leasing', amount: p.leasing.amount, period: 'month' } : null);
  syncSystemCost(id, 'rent', p.carType === 'rent' && p.rent.amount > 0
    ? { name: 'Наем на колата', category: 'rent', amount: p.rent.amount, period: p.rent.period, perWorkDay: false } : null);
}
function syncSystemCost(userId, system, desired) {
  const today = todayStr();
  const current = db.costs.find((c) => c.userId === userId && c.system === system && !c.endDate);
  const same = current && desired && current.amount === desired.amount && current.period === desired.period && !!current.perWorkDay === !!desired.perWorkDay;
  if (same) { current.name = desired.name; return; }
  if (current) {
    if (current.startDate >= today) db.costs = db.costs.filter((c) => c !== current);
    else current.endDate = addDays(today, -1);
  }
  if (desired) db.costs.push({ id: uid(), userId, system, startDate: today, endDate: null, dueDate: null, ...desired });
}

// ================= Администратор =================
export function adminUser() {
  load();
  const id = localStorage.getItem(ADMIN_SESSION_KEY);
  const u = db.users.find((x) => x.id === id && x.role === 'admin');
  return u ? clone(u) : null;
}
export function adminLogin(email, password) {
  load();
  const u = db.users.find((x) => norm(x.email) === norm(email) && x.role === 'admin');
  if (!u || u.password !== password) return { error: 'Грешен имейл или парола' };
  localStorage.setItem(ADMIN_SESSION_KEY, u.id);
  return { user: clone(u) };
}
export function adminLogout() { localStorage.removeItem(ADMIN_SESSION_KEY); }
function requireAdmin() { if (!adminUser()) throw new Error('admin only'); }

export const admin = {
  drivers() { requireAdmin(); return clone(db.users.filter((u) => u.role === 'driver')); },
  driverData(id) { requireAdmin(); return userData(id); },
  allData() {
    requireAdmin();
    return db.users.filter((u) => u.role === 'driver').map((u) => userData(u.id));
  },
  setStatus(id, status) { requireAdmin(); const u = db.users.find((x) => x.id === id); if (u) { u.status = status; commit(); } },
  setSubscription(id, validUntil, plan = 'paid') { requireAdmin(); const u = db.users.find((x) => x.id === id); if (u) { u.subscription = { plan, validUntil }; commit(); } },
  extend(id, days) {
    requireAdmin();
    const u = db.users.find((x) => x.id === id); if (!u) return;
    const base = u.subscription && u.subscription.validUntil > todayStr() ? u.subscription.validUntil : todayStr();
    u.subscription = { plan: 'paid', validUntil: addDays(base, days) }; commit();
  },
  resetPassword(id, pw) { requireAdmin(); const u = db.users.find((x) => x.id === id); if (u) { u.password = pw; commit(); } },
  createDriver({ name, email, password, phone, days, carType, fuel }) {
    requireAdmin();
    if (!name?.trim()) return { error: 'Въведи име' };
    if (!/^\S+@\S+\.\S+$/.test(email || '')) return { error: 'Невалиден имейл' };
    if ((password || '').length < 6) return { error: 'Паролата трябва да е поне 6 символа' };
    if (db.users.some((x) => norm(x.email) === norm(email))) return { error: 'Има акаунт с този имейл' };
    const u = newDriver({ name: name.trim(), email: email.trim(), password, phone, trialDays: days || 30, plan: 'paid', profile: { carType: carType || 'own', fuel: fuel || 'petrol_lpg' } });
    commit(); return { user: clone(u) };
  },
  deleteDriver(id) { requireAdmin(); wipeUser(id); commit(); },
  settings() { requireAdmin(); return clone(db.settings); },
  saveSettings(s) { requireAdmin(); Object.assign(db.settings, s); commit(); },
};

// ================= Демо данни =================
function seed() {
  db = { version: 1, users: [], profiles: {}, shifts: [], costs: [], reminders: [], settings: { trialDays: 14 } };
  const today = todayStr();
  db.users.push({ id: 'admin', role: 'admin', name: 'Администратор', email: 'admin@profitaxi.bg', password: 'admin123', status: 'active', createdAt: new Date().toISOString() });

  const drivers = [
    { name: 'Иван Петров', email: 'ivan@demo.bg', phone: '0888 123 456', seed: 11, days: 150, plan: 'paid', valid: 20,
      profile: { carType: 'own', fuel: 'petrol_lpg', dispatch: { mode: 'weekly', amount: 40 }, monthlyGoal: 2500 },
      style: { workProb: 0.84, night: 0.35, ratePerKm: 0.95, kmMin: 170, kmMax: 300 } },
    { name: 'Георги Димитров', email: 'georgi@demo.bg', phone: '0899 555 010', seed: 23, days: 120, plan: 'paid', valid: 45,
      profile: { carType: 'rent', fuel: 'diesel', rent: { amount: 150, period: 'week' }, dispatch: { mode: 'daily', amount: 10 }, monthlyGoal: 1800 },
      style: { workProb: 0.9, night: 0.6, ratePerKm: 0.9, kmMin: 200, kmMax: 340 } },
    { name: 'Мария Колева', email: 'maria@demo.bg', phone: '0877 300 300', seed: 37, days: 90, plan: 'paid', valid: 8,
      profile: { carType: 'leasing', fuel: 'hybrid', leasing: { amount: 420 }, dispatch: { mode: 'monthly', amount: 150 }, monthlyGoal: 2200 },
      style: { workProb: 0.7, night: 0.1, ratePerKm: 1.0, kmMin: 150, kmMax: 260 } },
    { name: 'Стоян Ангелов', email: 'stoyan@demo.bg', phone: '0886 777 888', seed: 41, days: 60, plan: 'trial', valid: -3,
      profile: { carType: 'own', fuel: 'lpg', dispatch: { mode: 'daily', amount: 10 }, monthlyGoal: 1200 },
      style: { workProb: 0.45, night: 0.5, ratePerKm: 0.9, kmMin: 120, kmMax: 220 } },
    { name: 'Николай Иванов', email: 'nikolay@demo.bg', phone: '0898 202 303', seed: 53, days: 75, plan: 'paid', valid: 120, blocked: true,
      profile: { carType: 'own', fuel: 'electric', dispatch: { mode: 'none', amount: 0 }, monthlyGoal: 2000 },
      style: { workProb: 0.75, night: 0.3, ratePerKm: 0.95, kmMin: 160, kmMax: 280 } },
  ];

  for (const d of drivers) {
    const r = rng(d.seed);
    const startDay = addDays(today, -d.days);
    const u = newDriver({ name: d.name, email: d.email, password: 'demo123', phone: d.phone, trialDays: 0, plan: d.plan, profile: { onboarded: true, ...d.profile } });
    u.createdAt = new Date(startDay + 'T09:00:00').toISOString();
    u.lastLoginAt = new Date().toISOString();
    u.subscription = { plan: d.plan, validUntil: addDays(today, d.valid) };
    if (d.blocked) u.status = 'blocked';
    const p = db.profiles[u.id];

    // Системни разходи от началото на акаунта
    const sys = [];
    if (p.dispatch.mode !== 'none') sys.push({ system: 'dispatch', name: 'Ефир / диспечер', category: 'dispatch', amount: p.dispatch.amount, period: { daily: 'day', weekly: 'week', monthly: 'month' }[p.dispatch.mode], perWorkDay: p.dispatch.mode === 'daily' });
    if (p.carType === 'leasing') sys.push({ system: 'leasing', name: 'Лизингова вноска', category: 'leasing', amount: p.leasing.amount, period: 'month' });
    if (p.carType === 'rent') sys.push({ system: 'rent', name: 'Наем на колата', category: 'rent', amount: p.rent.amount, period: p.rent.period });
    sys.forEach((c) => db.costs.push({ id: uid(), userId: u.id, startDate: startDay, endDate: null, dueDate: null, ...c }));

    const own = p.carType !== 'rent';
    const fixed = [
      own && { name: 'Гражданска отговорност', category: 'insurance', amount: 480, period: 'year', dueDate: addDays(today, 40 + Math.floor(r() * 120)) },
      own && { name: 'Винетка', category: 'vignette', amount: 97, period: 'year', dueDate: addDays(today, 6 + Math.floor(r() * 10)) },
      own && { name: 'Технически преглед', category: 'inspection', amount: 120, period: 'year', dueDate: addDays(today, 20 + Math.floor(r() * 60)) },
      own && { name: 'Сервиз и гуми', category: 'service', amount: 60, period: 'month' },
      { name: 'Разрешително от общината', category: 'license', amount: 100, period: 'year', dueDate: addDays(today, 150 + Math.floor(r() * 100)) },
      { name: 'Таксиметров апарат', category: 'meter', amount: 12, period: 'month' },
      { name: 'Телефон и интернет', category: 'phone', amount: 20, period: 'month' },
      d.seed % 2 === 1 && { name: 'Данъци и осигуровки', category: 'taxes', amount: 260, period: 'month' },
      d.seed === 11 && { name: 'Каско', category: 'casco', amount: 650, period: 'year', dueDate: addDays(today, 95) },
    ].filter(Boolean);
    fixed.forEach((c) => db.costs.push({ id: uid(), userId: u.id, startDate: startDay, endDate: null, dueDate: null, ...c }));

    // Смени
    let km = 180000 + Math.floor(r() * 120000);
    const fuelOptions = { petrol: ['petrol'], petrol_lpg: ['lpg'], diesel: ['diesel'], hybrid: ['petrol'], lpg: ['lpg'], electric: ['electric'] }[p.fuel];
    const price = { petrol: 1.32, diesel: 1.38, lpg: 0.62, electric: 0.35 };
    const cons = { petrol_lpg: 12.5, petrol: 8.5, diesel: 6.8, hybrid: 5.2, lpg: 12.5, electric: 17 }[p.fuel];
    for (let i = d.days; i >= 1; i--) {
      const day = addDays(today, -i);
      const wd = (new Date(day + 'T12:00:00').getDay() + 6) % 7;
      const prob = d.style.workProb * (wd === 6 ? 0.7 : 1);
      if (r() > prob) continue;
      const night = r() < d.style.night;
      const startH = night ? 17 + Math.floor(r() * 3) : 6 + Math.floor(r() * 3);
      const dur = 8 + r() * 3.5;
      const start = new Date(day + 'T00:00:00'); start.setHours(startH, Math.floor(r() * 4) * 15);
      const end = new Date(start.getTime() + dur * 3600000);
      const k = Math.round(d.style.kmMin + r() * (d.style.kmMax - d.style.kmMin));
      const boost = (wd >= 4 ? 1.15 : 1) * (night ? 1.08 : 1) * (0.85 + r() * 0.3);
      const gross = k * d.style.ratePerKm * boost * 0.62;
      const cardShare = 0.15 + r() * 0.25, appShare = r() * 0.2;
      const income = {
        cash: round2(gross * (1 - cardShare - appShare)),
        card: round2(gross * cardShare),
        app: round2(gross * appShare),
        tips: round2(r() < 0.6 ? 2 + r() * 10 : 0),
      };
      const expenses = [];
      const ft = fuelOptions[0];
      const qty = round2((k * cons) / 100 * (0.9 + r() * 0.2));
      expenses.push({ id: uid(), category: 'fuel', fuelType: ft, amount: round2(qty * price[ft]), qty });
      if (p.fuel === 'petrol_lpg' && r() < 0.35) { const q = round2(1 + r() * 2); expenses.push({ id: uid(), category: 'fuel', fuelType: 'petrol', amount: round2(q * price.petrol), qty: q }); }
      if (r() < 0.25) expenses.push({ id: uid(), category: 'wash', amount: 6 });
      if (r() < 0.55) expenses.push({ id: uid(), category: 'food', amount: round2(5 + r() * 6) });
      if (r() < 0.2) expenses.push({ id: uid(), category: 'parking', amount: 2 });
      if (r() < 0.03) expenses.push({ id: uid(), category: 'service', amount: round2(30 + r() * 120), label: 'Ремонт' });
      db.shifts.push({ id: uid(), userId: u.id, start: start.toISOString(), end: end.toISOString(), kmStart: km, kmEnd: km + k, income, expenses, note: '' });
      km += k + Math.floor(r() * 15);
    }
    if (own) db.reminders.push({ id: uid(), userId: u.id, title: 'Смяна на масло', dueKm: km + 900 + Math.floor(r() * 2000), dueDate: null });
  }
  return db;
}

export const _debug = { load, get db() { return db; }, dateStr };
export { CAR_TYPES };
