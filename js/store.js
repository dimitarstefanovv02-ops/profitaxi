// ProfiTaxi – слой за данни.
// ДЕМО РЕЖИМ: всичко се пази в localStorage на устройството.
// Всички екрани говорят само с функциите тук, така че по-късно този файл
// се заменя с истинска база (напр. Supabase) без промени по интерфейса.

import { todayStr, addDays, uid, rng, round2, dateStr, parseDate } from './util.js';
import { CAR_TYPES, COST_CATS, COMPANIES, OTHER, registerCustomCats } from './constants.js';

const KEY = 'profitaxi.v5'; // нов ключ за всяка несъвместима версия на данните
const SESSION_KEY = 'profitaxi.session';
const ADMIN_SESSION_KEY = 'profitaxi.asession';
const VERSION = 10;
const listeners = new Set();
let db = null;

function load() {
  if (db) return db;
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch { db = null; }
  if (db && db.version > VERSION) { location.reload(); return db; } // друг раздел вече е с по-нова версия
  if (!db || db.version !== VERSION) { db = seed(); persist(); }
  if (db.settings && db.settings.price === 9.99) { db.settings.price = 3.99; persist(); } // новата цена
  ensureExt();
  registerAllCustom();
  return db;
}
// Допълнителни данни: съобщения, кодове, бележки, използване, анкети, предложения, функции, дневник
function ensureExt() {
  db.messages ||= []; db.codes ||= []; db.notes ||= {}; db.usage ||= {}; db.nps ||= []; db.ideas ||= [];
  db.flags ||= []; db.accessLog ||= []; db.alertsSeen ||= []; db.sms ||= {}; db.dismissed ||= {};
  db.tickets ||= []; db.payments ||= []; db.promos ||= []; db.errors ||= []; db.churn ||= []; db.audit ||= [];
  db.notDup ||= []; db.reviewed ||= [];
  if (db.settings.referrals == null) db.settings.referrals = true;
  db.settings.autoRemind ||= { on: true, before: true, day: true, after: true };
  db.autoSent ||= {};
  db.settings.goal ||= { paid: 100, date: `${new Date().getFullYear() + (new Date().getMonth() >= 9 ? 1 : 0)}-01-31` };
}
const digits = (p) => String(p || '').replace(/\D/g, '').replace(/^359/, '0');
export const normPhone = digits;
function registerAllCustom() { Object.values(db.profiles).forEach((p) => registerCustomCats(p.customCats)); }
// „Виж като шофьор“: админът отваря приложението с ?preview=<id>. Само за гледане – нищо не се записва.
let PREVIEW = null;
try {
  const q = new URLSearchParams(location.search).get('preview');
  if (q) sessionStorage.setItem('profitaxi.preview', q);
  PREVIEW = sessionStorage.getItem('profitaxi.preview');
  if (PREVIEW && !localStorage.getItem(ADMIN_SESSION_KEY)) { sessionStorage.removeItem('profitaxi.preview'); PREVIEW = null; }
} catch { PREVIEW = null; }
export const previewMode = () => !!PREVIEW && !!me();
export function endPreview() { try { sessionStorage.removeItem('profitaxi.preview'); } catch { /* */ } PREVIEW = null; }
function persist() { if (PREVIEW) return; localStorage.setItem(KEY, JSON.stringify(db)); }
function commit() { persist(); listeners.forEach((fn) => fn()); }
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export function resetDemo() { localStorage.removeItem(KEY); localStorage.removeItem(SESSION_KEY); localStorage.removeItem(ADMIN_SESSION_KEY); db = null; load(); }
['profitaxi.v1', 'profitaxi.v2', 'profitaxi.v4'].forEach((k) => localStorage.removeItem(k)); // стари демо данни

// Синхронизация между отворени раздели
// Само чете – никога не записва в отговор на друг раздел, за да няма безкрайно презаписване
window.addEventListener('storage', (e) => {
  if (e.key !== KEY || !e.newValue) return;
  let next; try { next = JSON.parse(e.newValue); } catch { return; }
  if (!next || next.version !== VERSION) { if (next && next.version > VERSION) location.reload(); return; }
  db = next;
  registerAllCustom();
  listeners.forEach((fn) => fn());
});

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
  return Math.max(0, Math.round((parseDate(user.subscription.validUntil) - parseDate(todayStr())) / 86400000));
}

// ================= Вход на шофьор =================
export function currentUser() {
  load();
  const id = PREVIEW || localStorage.getItem(SESSION_KEY);
  const u = db.users.find((x) => x.id === id && x.role === 'driver');
  return u ? clone(u) : null;
}
export function login(email, password, { company } = {}) {
  load();
  const u = db.users.find((x) => norm(x.email) === norm(email) && x.role === 'driver');
  if (!u || u.password !== password) return { error: 'Грешен имейл или парола' };
  if (company && u.company !== company) return { error: 'Този вход е само за шофьорите на One Taxi. Влез от profitaxi.vercel.app/app.' };
  localStorage.setItem(SESSION_KEY, u.id);
  u.lastLoginAt = new Date().toISOString();
  commit();
  return { user: clone(u) };
}
export function logout() { if (PREVIEW) endPreview(); else localStorage.removeItem(SESSION_KEY); listeners.forEach((fn) => fn()); }

function validateAccount({ name, email, password, city, company, carType }, { skipPassword } = {}) {
  if (!name?.trim()) return 'Въведи име';
  if (!/^\S+@\S+\.\S+$/.test(email || '')) return 'Невалиден имейл';
  if (!skipPassword && (password || '').length < 6) return 'Паролата трябва да е поне 6 символа';
  if (!city?.trim()) return 'Избери град';
  if (!company?.trim()) return 'Избери фирма';
  if (!CAR_TYPES[carType]) return 'Избери каква е колата';
  if (db.users.some((x) => norm(x.email) === norm(email))) return 'Има акаунт с този имейл';
  return null;
}
function validatePhone(phone) {
  const d = digits(phone);
  if (!/^0\d{9}$/.test(d)) return 'Въведи мобилен телефон, например 0888 123 456';
  if (db.users.some((x) => x.role === 'driver' && digits(x.phone) === d)) return 'Има акаунт с този телефон. Влез в него или се свържи с нас.';
  return null;
}
// SMS код за потвърждаване на телефона. В демото кодът се показва на екрана;
// с истински доставчик (напр. SMS шлюз) се изпраща като SMS.
export function sendSmsCode(phone) {
  load(); const err = validatePhone(phone); if (err) return { error: err };
  const code = String(1000 + Math.floor(Math.random() * 9000));
  db.sms[digits(phone)] = { code, at: Date.now(), ok: false }; persist();
  return { ok: true, demoCode: code };
}
export function verifySmsCode(phone, code) {
  load(); const r = db.sms[digits(phone)];
  if (!r || Date.now() - r.at > 10 * 60000) return { error: 'Кодът е изтекъл. Изпрати нов.' };
  if (String(code).trim() !== r.code) return { error: 'Грешен код' };
  r.ok = true; persist(); return { ok: true };
}
const phoneVerified = (phone) => !!db.sms[digits(phone)]?.ok;
// Кодове за достъп на партньори (напр. One Taxi)
export function checkAccessCode(code, company) {
  load(); const c = db.codes.find((x) => x.code === String(code || '').trim().toUpperCase());
  if (!c || !c.active) return { error: 'Невалиден код' };
  if (company && c.company !== company) return { error: 'Кодът не е за тази фирма' };
  if (c.expires && c.expires < todayStr()) return { error: 'Кодът е изтекъл' };
  if (c.limit && c.uses >= c.limit) return { error: 'Кодът е използван максимален брой пъти' };
  return { code: clone(c) };
}
export function register(f) {
  load();
  const err = validateAccount(f);
  if (err) return { error: err };
  const code = (f.refCode || '').trim().toUpperCase();
  const referrer = code ? db.users.find((x) => x.refCode === code && x.role === 'driver') : null;
  if (code && !referrer) return { error: 'Няма такъв код за покана. Провери го или остави полето празно.' };
  const perr = validatePhone(f.phone); if (perr) return { error: perr };
  if (!phoneVerified(f.phone)) return { error: 'Потвърди телефона с кода от SMS' };
  let accessCode = null, promo = null;
  if (f.accessCode != null) { const r = checkAccessCode(f.accessCode, f.company); if (r.error) return { error: r.error }; accessCode = r.code.code; }
  if (f.promo && String(f.promo).trim()) { const r = checkPromo(f.promo); if (r.error) return { error: r.error }; promo = r.promo; }
  const u = newDriver({ ...f, trialDays: db.settings.trialDays, profile: { carType: f.carType } });
  u.phoneVerified = true;
  u.source = accessCode ? 'code' : promo ? 'promo' : referrer ? 'invite' : (f.source || 'site');
  if (accessCode) { u.accessCode = accessCode; db.codes.find((x) => x.code === accessCode).uses++; }
  if (promo) {
    const pr = db.promos.find((x) => x.code === promo.code); pr.uses++; u.promo = pr.code;
    if (pr.kind === 'months') u.subscription.validUntil = addDays(u.subscription.validUntil, 30 * pr.value);
    else u.discount = pr.value; // % отстъпка за първия платен месец
  }
  if (referrer) u.referredBy = referrer.id; // наградата идва, когато новият шофьор плати
  db.profiles[u.id].tour = 'pending'; // кратка разходка при първото влизане
  localStorage.setItem(SESSION_KEY, u.id);
  commit();
  return { user: clone(u) };
}
// Промо кодове: „2 месеца безплатно“ или „-50% първия месец“, с лимит и срок
export function checkPromo(code) {
  load(); const c = db.promos.find((x) => x.code === String(code || '').trim().toUpperCase());
  if (!c || !c.active) return { error: 'Няма такъв промо код' };
  if (c.expires && c.expires < todayStr()) return { error: 'Промо кодът е изтекъл' };
  if (c.limit && c.uses >= c.limit) return { error: 'Промо кодът е използван максимален брой пъти' };
  return { promo: clone(c) };
}
function newDriver({ name, email, password, phone = '', city, company, trialDays = 14, plan = 'trial', profile = {} }) {
  const today = todayStr();
  const u = {
    id: uid(), role: 'driver', name: name.trim(), email: email.trim(), password, phone, city: city.trim(), company: company.trim(),
    status: 'active', createdAt: new Date().toISOString(), lastLoginAt: new Date().toISOString(),
    subscription: { plan, validUntil: addDays(today, trialDays) },
    refCode: makeRefCode(name), referredBy: null, refMonths: 0, tags: [], source: 'site',
  };
  db.users.push(u);
  db.profiles[u.id] = {
    onboarded: false, carType: 'own', fuel: 'petrol_lpg',
    leasing: { amount: 0 }, rent: { amount: 0, period: 'week' },
    dispatch: { mode: 'none', amount: 0 }, sharePct: 100, monthlyGoal: 2000, notify: false,
    customCats: [], hiddenCats: [], car: { code: '', plate: '', model: '' }, photo: null, carPhoto: null,
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
export function updateAccount({ name, phone, city, company }) {
  const u = me(); if (!u) return;
  if (name?.trim()) u.name = name.trim();
  if (phone != null) u.phone = phone;
  if (city?.trim()) u.city = city.trim();
  if (company?.trim()) u.company = company.trim();
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
  db.reservations = db.reservations.filter((x) => x.userId !== id);
  if (db.notes) delete db.notes[id];
  if (db.nps) db.nps = db.nps.filter((x) => x.userId !== id);
  if (db.tickets) db.tickets = db.tickets.filter((x) => x.userId !== id);
  if (db.payments) db.payments = db.payments.filter((x) => x.userId !== id);
  if (db.churn) db.churn = db.churn.filter((x) => x.userId !== id);
}
function me() { load(); const id = PREVIEW || localStorage.getItem(SESSION_KEY); return db.users.find((x) => x.id === id && x.role === 'driver'); }
function myId() { const u = me(); if (!u) throw new Error('not signed in'); return u.id; }

// ================= Съобщения, анкета, предложения, функции, използване (шофьор) =================
export const forUser = (t, u) => !t || ((!t.city || t.city === u.city) && (!t.company || t.company === u.company) && (!t.userIds || t.userIds.includes(u.id)) && (!t.tag || (u.tags || []).includes(t.tag)));
const isOut = (m) => !m.sendAt || m.sendAt <= new Date().toISOString(); // насрочените излизат в часа си
export function myMessages() { const u = me(); if (!u) return []; return clone(db.messages.filter((m) => isOut(m) && forUser(m.target, u) && !(m.readBy || []).includes(u.id))); }
export function readMessage(id) { const u = me(); const m = db.messages.find((x) => x.id === id); if (u && m) { m.readBy = [...new Set([...(m.readBy || []), u.id])]; commit(); } }
export function npsDue() {
  const u = me(); if (!u) return false;
  const age = (Date.now() - new Date(u.createdAt)) / 86400000;
  const last = db.nps.filter((x) => x.userId === u.id).map((x) => x.at).sort().pop();
  const skip = db.dismissed[u.id]?.nps;
  return age >= 14 && (!last || Date.now() - new Date(last) > 90 * 86400000) && (!skip || Date.now() - skip > 14 * 86400000);
}
export function submitNps(score, comment = '') { const u = me(); if (!u) return; db.nps.push({ id: uid(), userId: u.id, score, comment: comment.trim(), at: new Date().toISOString(), city: u.city, company: u.company }); commit(); }
export function skipNps() { const u = me(); if (!u) return; db.dismissed[u.id] = { ...(db.dismissed[u.id] || {}), nps: Date.now() }; commit(); }
export function ideas() { load(); return clone(db.ideas.filter((x) => x.status !== 'hidden')).sort((a, b) => b.votes.length - a.votes.length); }
export function submitIdea(text) { const u = me(); if (!u || !text.trim()) return; db.ideas.push({ id: uid(), userId: u.id, text: text.trim(), votes: [u.id], status: 'new', at: new Date().toISOString() }); commit(); }
export function voteIdea(id) { const u = me(); const i = db.ideas.find((x) => x.id === id); if (!u || !i) return; i.votes = i.votes.includes(u.id) ? i.votes.filter((x) => x !== u.id) : [...i.votes, u.id]; commit(); }
const hashPct = (str) => { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 100; };
export function flagOn(key) {
  load(); const f = db.flags.find((x) => x.key === key); if (!f) return true; // неизвестна функция = включена
  if (!f.on) return false; const u = me(); if (!u) return true;
  if (f.target === 'company') return u.company === f.company;
  if (f.target === 'percent') return hashPct(u.id + key) < (f.percent || 0);
  if (f.target === 'tag') return (u.tags || []).includes(f.tag);
  return true;
}
// ---- Помощ: шофьорът пише, админът отговаря ----
export const TICKET_TOPICS = { login: 'Вход и парола', pay: 'Абонамент и плащане', shift: 'Въвеждане на смяна', reports: 'Отчети и статистика', other: 'Друго' };
export function myTickets() { const u = me(); if (!u) return []; return clone(db.tickets.filter((t) => t.userId === u.id)).sort((a, b) => b.at.localeCompare(a.at)); }
export function sendTicket({ topic, text }) {
  const u = me(); if (!u || !text?.trim()) return { error: 'Напиши съобщението' };
  const t = { id: uid(), userId: u.id, name: u.name, city: u.city, company: u.company, topic: TICKET_TOPICS[topic] ? topic : 'other', at: new Date().toISOString(), status: 'open', adminUnread: true, driverUnread: false, thread: [{ by: 'driver', text: text.trim(), at: new Date().toISOString() }] };
  db.tickets.push(t); commit(); return { ticket: clone(t) };
}
export function replyMyTicket(id, text) { const u = me(); const t = db.tickets.find((x) => x.id === id && x.userId === u?.id); if (!t || !text?.trim()) return; t.thread.push({ by: 'driver', text: text.trim(), at: new Date().toISOString() }); t.status = 'open'; t.adminUnread = true; commit(); }
export function readMyTickets() { const u = me(); if (!u) return; let ch = false; db.tickets.forEach((t) => { if (t.userId === u.id && t.driverUnread) { t.driverUnread = false; ch = true; } }); if (ch) commit(); }
export const myUnreadTickets = () => { const u = me(); return u ? db.tickets.filter((t) => t.userId === u.id && t.driverUnread).length : 0; };
// ---- Защо спря: пита се веднъж при изтекъл абонамент ----
export const CHURN_REASONS = { price: 'Скъпо е', noTime: 'Нямам време да въвеждам', notUseful: 'Не ми е полезно', quit: 'Спрях да карам такси', other_app: 'Ползвам друго', other: 'Друго' };
export function churnAsked() { const u = me(); return !!u && db.churn.some((x) => x.userId === u.id && x.validUntil === u.subscription?.validUntil); }
export function submitChurn(reason, comment = '') { const u = me(); if (!u) return; db.churn.push({ id: uid(), userId: u.id, name: u.name, city: u.city, company: u.company, reason, comment: comment.trim(), validUntil: u.subscription?.validUntil, at: new Date().toISOString() }); commit(); }
// ---- Грешки в приложението (за админа) ----
export function logError(msg, page = '') {
  try {
    load(); const ua = navigator.userAgent;
    const device = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Друго';
    const browser = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Друг';
    const u = me();
    db.errors.unshift({ id: uid(), msg: String(msg).slice(0, 200), page, userId: u?.id || null, name: u?.name || '—', device, browser, at: new Date().toISOString() });
    db.errors = db.errors.slice(0, 300); persist();
  } catch { /* грешка при записа на грешка – пропускаме */ }
}

// Броим кои страници се отварят (без съдържание – само име на страницата)
export function trackPage(page) {
  const u = me(); if (!u) return;
  const p = db.usage[page] ||= { views: 0, users: {} }; p.views++; p.users[u.id] = (p.users[u.id] || 0) + 1; p.last = new Date().toISOString(); persist();
}

// ================= Данни на текущия шофьор =================
// Всяка функция работи САМО с данните на влезлия шофьор.
export function getProfile() { return clone(db.profiles[myId()]); }
export function getShift(sid) { const id = myId(); const s = db.shifts.find((x) => x.id === sid && x.userId === id); return s ? clone(s) : null; }
export function getActiveShift() { const id = myId(); const s = db.shifts.find((x) => x.userId === id && !x.end); return s ? clone(s) : null; }
export function myData() { return userData(myId()); }
function userData(id) {
  return {
    user: clone(db.users.find((u) => u.id === id)),
    profile: clone(db.profiles[id]),
    shifts: clone(db.shifts.filter((s) => s.userId === id)).sort((a, b) => b.start.localeCompare(a.start)),
    costs: clone(db.costs.filter((c) => c.userId === id)),
    reminders: clone(db.reminders.filter((r) => r.userId === id)),
    reservations: clone(db.reservations.filter((r) => r.userId === id)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
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
  const c = { payments: [], ...clone(cost), userId: id };
  if (!c.id) { c.id = uid(); c.startDate = c.startDate || todayStr(); }
  const prev = db.costs.find((x) => x.id === c.id);
  if (!prev || prev.dueDate !== c.dueDate) c.dueDay = c.dueDate ? Number(c.dueDate.slice(8, 10)) : null;
  const i = db.costs.findIndex((x) => x.id === c.id);
  if (i >= 0) { if (db.costs[i].userId !== id) return; db.costs[i] = c; } else db.costs.push(c);
  commit();
}
// from: от кой ден разходът спира да се смята (по подразбиране днес; „този месец“ = 1-во число).
// Миналите месеци не се пренаписват. Ако разходът започва от тази дата или по-късно, се трие изцяло.
export function deleteCost(cid, { from = todayStr() } = {}) {
  const id = myId();
  const c = db.costs.find((x) => x.id === cid && x.userId === id);
  if (!c) return;
  if (c.startDate < from) { c.endDate = addDays(from, -1); c.dueDate = null; }
  else db.costs = db.costs.filter((x) => x !== c);
  commit();
}
// Следваща дата на плащане според периода
export function nextDue(date, period, anchorDay) {
  const d = parseDate(date);
  if (period === 'day') d.setDate(d.getDate() + 1);
  else if (period === 'week') d.setDate(d.getDate() + 7);
  else {
    // месеци без препълване: 31 яну + 1 месец = 28/29 фев, не 3 март
    const add = period === 'month' ? 1 : period === 'quarter' ? 3 : 12;
    const day = anchorDay || d.getDate();
    d.setDate(1); d.setMonth(d.getMonth() + add);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  }
  return dateStr(d);
}
// Отбелязва плащане и мести падежа напред с един период
export function markCostPaid(cid) {
  const id = myId();
  const c = db.costs.find((x) => x.id === cid && x.userId === id);
  if (!c) return null;
  c.payments = c.payments || [];
  c.payments.push({ date: todayStr(), amount: c.amount, due: c.dueDate });
  if (c.dueDate) {
    c.dueDay = c.dueDay || Number(c.dueDate.slice(8, 10)); // помни деня на падежа (31-во остава 31-во)
    const n = nextDue(c.dueDate, c.period, c.dueDay);
    c.dueDate = c.endDate && n > c.endDate ? null : n;
  }
  commit();
  return clone(c);
}
export function saveReminder(r) {
  const id = myId();
  const x = { repeat: 'none', ...clone(r), userId: id };
  if (!x.id) x.id = uid();
  const i = db.reminders.findIndex((y) => y.id === x.id);
  if (i >= 0) { if (db.reminders[i].userId !== id) return; db.reminders[i] = x; } else db.reminders.push(x);
  commit();
}
export function markReminderDone(rid, currentKm = 0) {
  const id = myId();
  const r = db.reminders.find((x) => x.id === rid && x.userId === id);
  if (!r) return;
  if (r.repeat && r.repeat !== 'none' && r.dueDate) { r.dueDate = nextDue(r.dueDate, r.repeat); r.doneAt = todayStr(); }
  else if (r.dueKm && r.everyKm) { r.dueKm = Math.max(r.dueKm, currentKm) + r.everyKm; r.doneAt = todayStr(); }
  else db.reminders = db.reminders.filter((x) => x !== r);
  commit();
}
// ================= Имейл напомняния =================
// Изпратените ключове се пазят, за да не се праща едно и също два пъти (ползва се от сървъра при свързване)
export function markEmailSent(keys) {
  const p = db.profiles[myId()]; const set = new Set(p.emailSent || []);
  keys.forEach((k) => set.add(k));
  p.emailSent = [...set].slice(-500); commit();
}

// ================= Лични резервации =================
export function saveReservation(r) {
  const id = myId();
  const x = { ...clone(r), userId: id };
  if (!x.id) { x.id = uid(); x.createdAt = new Date().toISOString(); }
  const i = db.reservations.findIndex((y) => y.id === x.id);
  if (i >= 0) { if (db.reservations[i].userId !== id) return null; db.reservations[i] = x; } else db.reservations.push(x);
  commit(); return clone(x);
}
export function deleteReservation(rid) { const id = myId(); db.reservations = db.reservations.filter((r) => !(r.id === rid && r.userId === id)); commit(); }
export function setReservationDone(rid, done) { const id = myId(); const r = db.reservations.find((x) => x.id === rid && x.userId === id); if (r) { r.done = !!done; commit(); } }

// ================= Категории разходи =================
// kind: 'shift' (по време на смяна), 'fixed' (периодичен) или 'both'
export function addCustomCat(label, kind = 'both') {
  const id = myId(); const p = db.profiles[id];
  const name = String(label || '').trim();
  if (!name) return { error: 'Въведи име на категорията' };
  p.customCats = p.customCats || [];
  if (p.customCats.some((c) => c.label.toLowerCase() === name.toLowerCase())) return { error: 'Вече има такава категория' };
  const cat = { id: 'u_' + uid(), label: name, kind };
  p.customCats.push(cat);
  registerCustomCats(p.customCats);
  commit(); return { cat };
}
export function removeCustomCat(cid) { const p = db.profiles[myId()]; p.customCats = (p.customCats || []).filter((c) => c.id !== cid); commit(); }
// key: 's:fuel' за смяна, 'f:casco' за периодичен
export function toggleCat(key) {
  const p = db.profiles[myId()];
  const set = new Set(p.hiddenCats || []);
  if (set.has(key)) set.delete(key); else set.add(key);
  p.hiddenCats = [...set]; commit();
}

// ================= Покани (referral) =================
const TRANSLIT = { а: 'A', б: 'B', в: 'V', г: 'G', д: 'D', е: 'E', ж: 'ZH', з: 'Z', и: 'I', й: 'Y', к: 'K', л: 'L', м: 'M', н: 'N', о: 'O', п: 'P', р: 'R', с: 'S', т: 'T', у: 'U', ф: 'F', х: 'H', ц: 'TS', ч: 'CH', ш: 'SH', щ: 'SHT', ъ: 'A', ь: 'Y', ю: 'YU', я: 'YA' };
function makeRefCode(name) {
  const first = String(name || 'TAXI').trim().split(/\s+/)[0].toLowerCase();
  const base = ([...first].map((ch) => TRANSLIT[ch] ?? (/[a-z0-9]/.test(ch) ? ch.toUpperCase() : '')).join('') || 'TAXI').slice(0, 8);
  let code;
  do { code = `${base}-${Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[O0I1]/g, 'X')}`; } while (db?.users?.some((u) => u.refCode === code));
  return code;
}
export const REF_TIERS = [{ count: 5, months: 1 }, { count: 8, months: 2 }];
// Награди: 5 регистрирани = 1 безплатен месец, 8 = общо 2. Добавят се към абонамента.
// Препоръки без загуба: месец безплатно за всеки поканен колега, който ПЛАТИ (не само се регистрира)
export const referralsOn = () => { load(); return db.settings.referrals !== false; };
function rewardReferral(u) {
  if (!u.referredBy || u.refRewarded || db.settings.referrals === false) return;
  const r = db.users.find((x) => x.id === u.referredBy); if (!r) return;
  u.refRewarded = true;
  const base = r.subscription.validUntil > todayStr() ? r.subscription.validUntil : todayStr();
  r.subscription.validUntil = addDays(base, 30);
  r.refMonths = (r.refMonths || 0) + 1;
  db.messages.push({ id: uid(), title: 'Получи месец безплатно', text: `${u.name.split(' ')[0]} плати абонамента си с твоя код – добавихме ти 1 месец безплатно. Благодарим!`, target: { userIds: [r.id] }, at: new Date().toISOString(), readBy: [] });
}
export function myReferrals() {
  const u = me(); if (!u) return null;
  const invited = db.users.filter((x) => x.referredBy === u.id).map((x) => ({ name: x.name.split(' ')[0] + ' ' + (x.name.split(' ')[1] || '').slice(0, 1) + '.', date: x.createdAt.slice(0, 10), paid: !!x.subscription?.paidSince })).sort((a, b) => b.date.localeCompare(a.date));
  return { code: u.refCode, invited, count: invited.length, paid: invited.filter((x) => x.paid).length, months: u.refMonths || 0 };
}
export const refExists = (code) => { load(); return db.users.some((x) => x.refCode === String(code || '').trim().toUpperCase()); };

export function deleteReminder(rid) { const id = myId(); db.reminders = db.reminders.filter((r) => !(r.id === rid && r.userId === id)); commit(); }

// Обновява профила. Настройките за кола и ефир се превръщат в постоянни
// разходи, които важат ОТ ДНЕС – старите отчети остават непроменени.
export function updateProfile(patch, { from } = {}) {
  const id = myId();
  applyProfile(id, patch, from);
  commit();
}
function applyProfile(id, patch, from) {
  const p = db.profiles[id];
  Object.assign(p, clone(patch));
  syncSystemCost(id, 'dispatch', p.dispatch.mode !== 'none' && p.dispatch.amount > 0
    ? { name: 'Ефир / диспечер', category: 'dispatch', amount: p.dispatch.amount, period: { daily: 'day', weekly: 'week', monthly: 'month' }[p.dispatch.mode], perWorkDay: p.dispatch.mode === 'daily' }
    : null, from);
  syncSystemCost(id, 'leasing', p.carType === 'leasing' && p.leasing.amount > 0
    ? { name: 'Лизингова вноска', category: 'leasing', amount: p.leasing.amount, period: 'month' } : null, from);
  syncSystemCost(id, 'rent', p.carType === 'rent' && p.rent.amount > 0
    ? { name: 'Наем на колата', category: 'rent', amount: p.rent.amount, period: p.rent.period, perWorkDay: false } : null, from);
  // При кола под наем застраховки, винетка, преглед и т.н. са грижа на собственика
  if (p.carType === 'rent') {
    const today = from || todayStr();
    for (const c of db.costs) {
      if (c.userId !== id || !COST_CATS[c.category]?.owner || (c.endDate && c.endDate < today)) continue;
      if (c.startDate >= today) c.endDate = addDays(c.startDate, -1); else c.endDate = addDays(today, -1);
      c.dueDate = null;
    }
  }
}
// Ефир, наем и лизинг се пазят като постоянни разходи с начална дата.
// from: от кой ден важи новата стойност (по подразбиране днес). Ако е назад във времето,
// старите стойности се отрязват до предишния ден, за да няма двойно броене.
function syncSystemCost(userId, system, desired, from = todayStr()) {
  const mine = (c) => c.userId === userId && c.system === system;
  const current = db.costs.find((c) => mine(c) && (!c.endDate || c.endDate >= todayStr()));
  const same = current && desired && current.amount === desired.amount && current.period === desired.period && !!current.perWorkDay === !!desired.perWorkDay;
  if (same && current.startDate <= from) { current.name = desired.name; return; }
  if (!current && !desired) return;
  db.costs = db.costs.filter((c) => !(mine(c) && c.startDate >= from));
  db.costs.forEach((c) => { if (mine(c) && (!c.endDate || c.endDate >= from)) c.endDate = addDays(from, -1); });
  if (desired) db.costs.push({ id: uid(), userId, system, startDate: from, endDate: null, dueDate: null, payments: [], ...desired });
}

// ================= Администратор =================
export function adminUser() {
  load();
  const id = localStorage.getItem(ADMIN_SESSION_KEY);
  const u = db.users.find((x) => x.id === id && x.role === 'admin');
  return u ? clone(u) : null;
}
export const ADMIN_ROLES = { owner: 'Собственик', support: 'Поддръжка', partner: 'Партньор' };
export const adminRole = () => adminUser()?.adminRole || 'owner';
export function adminLogin(email, password) {
  load();
  const u = db.users.find((x) => norm(x.email) === norm(email) && x.role === 'admin');
  if (!u || u.password !== password) return { error: 'Грешен имейл или парола' };
  // Двуфакторно влизане: след паролата – код по SMS (в демото се показва на екрана)
  if (db.settings.twoFactor) {
    const code = String(100000 + Math.floor(Math.random() * 900000));
    db.sms['admin:' + u.id] = { code, at: Date.now() }; persist();
    return { twoFactor: true, id: u.id, demoCode: code, phone: u.phone || '' };
  }
  localStorage.setItem(ADMIN_SESSION_KEY, u.id);
  return { user: clone(u) };
}
export function adminVerify2fa(id, code) {
  load(); const r = db.sms['admin:' + id];
  if (!r || Date.now() - r.at > 10 * 60000) return { error: 'Кодът е изтекъл. Влез отново.' };
  if (String(code).trim() !== r.code) return { error: 'Грешен код' };
  delete db.sms['admin:' + id]; persist();
  localStorage.setItem(ADMIN_SESSION_KEY, id);
  return { ok: true };
}
export function adminLogout() { localStorage.removeItem(ADMIN_SESSION_KEY); }
function requireAdmin() { if (!adminUser()) throw new Error('admin only'); }
function requireOwner() { if (adminRole() !== 'owner') throw new Error('owner only'); }
// Партньорът вижда само шофьорите на своята фирма
const visible = (u) => { const a = adminUser(); return a?.adminRole !== 'partner' || u.company === a.company; };
// Дневник на действията: кой админ какво е променил
function audit(text) { const a = adminUser(); db.audit.unshift({ at: new Date().toISOString(), by: a?.email || '—', text }); db.audit = db.audit.slice(0, 1000); }
const nameOf = (id) => db.users.find((x) => x.id === id)?.name || '—';

export const admin = {
  drivers() { requireAdmin(); return clone(db.users.filter((u) => u.role === 'driver' && visible(u))); },
  driverData(id) { requireAdmin(); const u = db.users.find((x) => x.id === id); return u && visible(u) ? userData(id) : { user: null }; },
  allData() {
    requireAdmin();
    return db.users.filter((u) => u.role === 'driver' && visible(u)).map((u) => userData(u.id));
  },
  role: () => adminRole(),
  setStatus(id, status) { requireAdmin(); const u = db.users.find((x) => x.id === id); if (u) { u.status = status; audit(`${status === 'blocked' ? 'Спря' : 'Пусна'} достъпа на ${u.name}`); commit(); } },
  setSubscription(id, validUntil, plan = 'paid') { requireAdmin(); const u = db.users.find((x) => x.id === id); if (u) { u.subscription = { ...u.subscription, plan, validUntil }; if (plan === 'paid' && !u.subscription.paidSince) { u.subscription.paidSince = todayStr(); rewardReferral(u); } audit(`Смени абонамента на ${u.name} до ${validUntil}`); commit(); } },
  extend(id, days, { silent } = {}) {
    requireAdmin();
    const u = db.users.find((x) => x.id === id); if (!u) return;
    const base = u.subscription && u.subscription.validUntil > todayStr() ? u.subscription.validUntil : todayStr();
    const first = !u.subscription?.paidSince;
    u.subscription = { ...u.subscription, plan: 'paid', validUntil: addDays(base, days), paidSince: u.subscription?.paidSince || todayStr() };
    if (first) rewardReferral(u);
    if (!silent) audit(`Удължи абонамента на ${u.name} с ${days} дни`);
    commit();
  },
  resetPassword(id, pw) { requireAdmin(); const u = db.users.find((x) => x.id === id); if (u) { u.password = pw; audit(`Смени паролата на ${u.name}`); commit(); } },
  createDriver(f) {
    requireAdmin();
    const err = validateAccount(f) || validatePhone(f.phone);
    if (err) return { error: err };
    const u = newDriver({ ...f, trialDays: f.days || 30, plan: 'paid', profile: { carType: f.carType, fuel: f.fuel || 'petrol_lpg' } });
    u.subscription.paidSince = todayStr(); u.source = 'admin';
    audit(`Създаде шофьор ${u.name}`);
    commit(); return { user: clone(u) };
  },
  updateDriver(id, { city, company, phone, name }) {
    requireAdmin(); const u = db.users.find((x) => x.id === id); if (!u) return;
    if (city) u.city = city; if (company) u.company = company; if (phone != null) u.phone = phone; if (name) u.name = name;
    audit(`Промени данните на ${u.name}`);
    commit();
  },
  deleteDriver(id) { requireAdmin(); audit(`Изтри шофьор ${nameOf(id)}`); wipeUser(id); commit(); },
  setTags(id, tags) { requireAdmin(); const u = db.users.find((x) => x.id === id); if (!u) return; u.tags = [...new Set(tags.map((t) => t.trim()).filter(Boolean))]; audit(`Етикети на ${u.name}: ${u.tags.join(', ') || 'няма'}`); commit(); },
  addTagMany(ids, tag) { requireAdmin(); const t = tag.trim(); if (!t) return; db.users.filter((u) => ids.includes(u.id)).forEach((u) => { u.tags = [...new Set([...(u.tags || []), t])]; }); audit(`Етикет „${t}“ на ${ids.length} шофьори`); commit(); },
  allTags() { requireAdmin(); return [...new Set(db.users.flatMap((u) => u.tags || []))].sort((a, b) => a.localeCompare(b, 'bg')); },
  settings() { requireAdmin(); return clone(db.settings); },
  saveSettings(s) { requireAdmin(); Object.assign(db.settings, s); audit(`Промени настройките (${Object.keys(s).join(', ')})`); commit(); },
  // масови действия
  extendMany(ids, days) { ids.forEach((id) => this.extend(id, days, { silent: true })); audit(`+${days} дни за ${ids.length} шофьори`); commit(); },
  setStatusMany(ids, status) { requireAdmin(); db.users.filter((u) => ids.includes(u.id)).forEach((u) => { u.status = status; }); audit(`${status === 'blocked' ? 'Спря' : 'Пусна'} достъпа на ${ids.length} шофьори`); commit(); },
  // съобщения
  messages() { requireAdmin(); return clone(db.messages).sort((a, b) => (b.sendAt || b.at).localeCompare(a.sendAt || a.at)); },
  sendMessage({ title, text, target, sendAt }) { requireAdmin(); db.messages.push({ id: uid(), title: title.trim(), text: text.trim(), target: target || null, at: new Date().toISOString(), sendAt: sendAt || null, readBy: [] }); audit(`${sendAt ? 'Насрочи' : 'Изпрати'} съобщение „${title.trim()}“`); commit(); },
  deleteMessage(id) { requireAdmin(); db.messages = db.messages.filter((m) => m.id !== id); audit('Изтри съобщение'); commit(); },
  reach(target) { requireAdmin(); return db.users.filter((u) => u.role === 'driver' && visible(u) && forUser(target, u)).length; },
  // помощ (входящи)
  tickets() { requireAdmin(); return clone(db.tickets.filter((t) => { const u = db.users.find((x) => x.id === t.userId); return !u || visible(u); })).sort((a, b) => (b.thread.at(-1)?.at || b.at).localeCompare(a.thread.at(-1)?.at || a.at)); },
  replyTicket(id, text) { requireAdmin(); const t = db.tickets.find((x) => x.id === id); if (!t || !text?.trim()) return; t.thread.push({ by: 'admin', name: adminUser().name, text: text.trim(), at: new Date().toISOString() }); t.driverUnread = true; t.adminUnread = false; audit(`Отговори на ${t.name}`); commit(); },
  readTicket(id) { requireAdmin(); const t = db.tickets.find((x) => x.id === id); if (t && t.adminUnread) { t.adminUnread = false; commit(); } },
  setTicketStatus(id, status) { requireAdmin(); const t = db.tickets.find((x) => x.id === id); if (t) { t.status = status; t.adminUnread = false; commit(); } },
  // кодове за достъп
  codes() { requireAdmin(); return clone(db.codes.filter((c) => adminRole() !== 'partner' || c.company === adminUser().company)); },
  saveCode(c) { requireAdmin(); const code = c.code.trim().toUpperCase(); if (!code) return { error: 'Въведи код' }; const ex = db.codes.find((x) => x.code === code);
    if (ex && !c.edit) return { error: 'Има такъв код' }; if (ex) Object.assign(ex, { ...c, code }); else db.codes.push({ uses: 0, active: true, ...c, code, at: new Date().toISOString() }); delete db.codes.find((x) => x.code === code).edit; audit(`Създаде код ${code}`); commit(); return { ok: true }; },
  toggleCode(code) { requireAdmin(); const c = db.codes.find((x) => x.code === code); if (c) { c.active = !c.active; audit(`${c.active ? 'Пусна' : 'Спря'} код ${code}`); commit(); } },
  deleteCode(code) { requireAdmin(); db.codes = db.codes.filter((x) => x.code !== code); audit(`Изтри код ${code}`); commit(); },
  // промо кодове
  promos() { requireAdmin(); return clone(db.promos); },
  savePromo(p) { requireAdmin(); const code = String(p.code || '').trim().toUpperCase(); if (!code) return { error: 'Въведи код' }; if (db.promos.some((x) => x.code === code)) return { error: 'Има такъв код' };
    if (!(p.value > 0)) return { error: p.kind === 'months' ? 'Въведи брой месеци' : 'Въведи процент' };
    db.promos.push({ uses: 0, active: true, limit: 0, expires: null, ...p, code, at: new Date().toISOString() }); audit(`Създаде промо код ${code}`); commit(); return { ok: true }; },
  togglePromo(code) { requireAdmin(); const c = db.promos.find((x) => x.code === code); if (c) { c.active = !c.active; commit(); } },
  deletePromo(code) { requireAdmin(); db.promos = db.promos.filter((x) => x.code !== code); audit(`Изтри промо код ${code}`); commit(); },
  // плащания и фактури
  payments() { requireAdmin(); return clone(db.payments.filter((p) => { const u = db.users.find((x) => x.id === p.userId); return u && visible(u); })).sort((a, b) => b.at.localeCompare(a.at)); },
  retryPayment(id) { requireAdmin(); const p = db.payments.find((x) => x.id === id); if (!p) return; p.status = 'paid'; p.at = new Date().toISOString(); p.invoice = nextInvoice(); this.extend(p.userId, 30, { silent: true }); audit(`Платено отново: ${nameOf(p.userId)}`); commit(); },
  remind(userIds, title, text) { requireAdmin(); db.messages.push({ id: uid(), title, text, target: { userIds }, at: new Date().toISOString(), readBy: [] }); audit(`Напомняне до ${userIds.length} шофьори`); commit(); },
  // проверки
  notDup() { requireAdmin(); return [...db.notDup]; },
  markNotDup(key) { requireAdmin(); db.notDup = [...new Set([...db.notDup, key])]; audit('Отбеляза „не е дубликат“'); commit(); },
  reviewed() { requireAdmin(); return [...db.reviewed]; },
  markReviewed(ids) { requireAdmin(); db.reviewed = [...new Set([...db.reviewed, ...ids])].slice(-3000); commit(); },
  errors() { requireAdmin(); return clone(db.errors); },
  clearErrors() { requireAdmin(); db.errors = []; audit('Изчисти грешките'); commit(); },
  churn() { requireAdmin(); return clone(db.churn.filter((c) => { const u = db.users.find((x) => x.id === c.userId); return !u || visible(u); })); },
  audit() { requireAdmin(); return clone(db.audit); },
  // админи и роли (само собственикът)
  admins() { requireAdmin(); return clone(db.users.filter((u) => u.role === 'admin')).map((u) => ({ ...u, password: undefined, adminRole: u.adminRole || 'owner' })); },
  saveAdmin({ email, name, password, adminRole: r, company }) {
    requireAdmin(); requireOwner();
    if (!/^\S+@\S+\.\S+$/.test(email || '')) return { error: 'Невалиден имейл' };
    if (db.users.some((x) => norm(x.email) === norm(email))) return { error: 'Има акаунт с този имейл' };
    if ((password || '').length < 6) return { error: 'Паролата трябва да е поне 6 символа' };
    if (r === 'partner' && !company) return { error: 'Избери фирма за партньора' };
    db.users.push({ id: uid(), role: 'admin', adminRole: r, company: r === 'partner' ? company : null, name: name?.trim() || email, email: email.trim(), password, status: 'active', createdAt: new Date().toISOString() });
    audit(`Добави админ ${email} (${ADMIN_ROLES[r]})`); commit(); return { ok: true };
  },
  deleteAdmin(id) { requireAdmin(); requireOwner(); if (id === adminUser().id) return; const u = db.users.find((x) => x.id === id && x.role === 'admin'); if (!u) return; db.users = db.users.filter((x) => x !== u); audit(`Премахна админ ${u.email}`); commit(); },
  // архив
  exportAll() { requireAdmin(); requireOwner(); return clone(db); },
  restoreAll(data) {
    requireAdmin(); requireOwner();
    if (!data || data.version !== VERSION || !Array.isArray(data.users) || !data.users.some((u) => u.role === 'admin')) return { error: 'Файлът не е архив на ProfiTaxi от тази версия' };
    const me0 = adminUser(); db = data; ensureExt();
    if (!db.users.some((u) => u.id === me0.id)) localStorage.removeItem(ADMIN_SESSION_KEY);
    audit('Възстанови данните от архив'); commit(); return { ok: true };
  },
  // бележки и дневник на достъпа
  notes(id) { requireAdmin(); return clone(db.notes[id] || []); },
  addNote(id, text, due = null) { requireAdmin(); if (!text.trim()) return; (db.notes[id] ||= []).unshift({ text: text.trim(), at: new Date().toISOString(), by: adminUser().email, due: due || null, done: false }); commit(); },
  noteDone(id, at) { requireAdmin(); const n = (db.notes[id] || []).find((x) => x.at === at); if (n) { n.done = true; commit(); } },
  // напомняния от бележките, чиято дата е дошла
  dueNotes() { requireAdmin(); const t = todayStr(); return Object.entries(db.notes).flatMap(([uidd, l]) => { const u = db.users.find((x) => x.id === uidd); return u && visible(u) ? l.filter((n) => n.due && !n.done && n.due <= t).map((n) => ({ ...n, userId: uidd, name: u.name })) : []; }); },
  autoSentCount() { requireAdmin(); return Object.keys(db.autoSent).length; },
  log(userId, action) { requireAdmin(); if (action === 'delete' || action === 'export') audit(`${action === 'delete' ? 'Изтри данните на' : 'Свали данните на'} ${nameOf(userId)}`); const u = db.users.find((x) => x.id === userId); db.accessLog.unshift({ at: new Date().toISOString(), by: adminUser().email, userId, name: u?.name || '—', action }); db.accessLog = db.accessLog.slice(0, 500); persist(); },
  accessLog() { requireAdmin(); return clone(db.accessLog); },
  exportDriver(id) { requireAdmin(); this.log(id, 'export'); const d = userData(id); return { ...d, notes: db.notes[id] || [], nps: db.nps.filter((x) => x.userId === id), exportedAt: new Date().toISOString() }; },
  // развитие
  usage() { requireAdmin(); return clone(db.usage); },
  nps() { requireAdmin(); return clone(db.nps); },
  ideas() { requireAdmin(); return clone(db.ideas).sort((a, b) => b.votes.length - a.votes.length); },
  setIdea(id, status) { requireAdmin(); const i = db.ideas.find((x) => x.id === id); if (i) { const was = i.status; i.status = status; if (status === 'done' && was !== 'done') ideaDone(i); commit(); } },
  flags() { requireAdmin(); return clone(db.flags); },
  // Функция, свързана с предложение: щом се пусне, предложението става „Готово“ и гласувалите получават съобщение
  saveFlag(f) {
    requireAdmin(); const ex = db.flags.find((x) => x.key === f.key); const wasOn = ex?.on;
    if (ex) Object.assign(ex, f); else db.flags.push(f);
    const fl = db.flags.find((x) => x.key === f.key);
    audit(`Функция „${fl.label}“: ${fl.on ? 'включена' : 'изключена'}`);
    if (fl.on && !wasOn && fl.ideaId) { const i = db.ideas.find((x) => x.id === fl.ideaId); if (i && i.status !== 'done') { i.status = 'done'; ideaDone(i); } }
    commit();
  },
  // известия, които вече са видени
  alertsSeen() { requireAdmin(); return [...db.alertsSeen]; },
  markAlertsSeen(keys) { requireAdmin(); db.alertsSeen = [...new Set([...db.alertsSeen, ...keys])].slice(-2000); commit(); },
};

function ideaDone(i) {
  if (!i.votes?.length) return;
  db.messages.push({ id: uid(), title: 'Твоето предложение е готово', text: `„${i.text}“ вече е в приложението. Благодарим, че гласува!`, target: { userIds: [...i.votes] }, at: new Date().toISOString(), readBy: [] });
}
let invoiceNo = 0;
function nextInvoice() { invoiceNo = Math.max(invoiceNo, ...db.payments.map((p) => Number(String(p.invoice || '').replace(/\D/g, '')) || 0)) + 1; return 'PT-' + String(invoiceNo).padStart(6, '0'); }

// Автоматични напомняния за плащане: 3 дни преди, в деня и 7 дни след изтичане.
// Пускат се при всяко отваряне на приложението или панела; всяко се праща само веднъж.
// (С истинския сървър ще тръгват по график, а не при отваряне.)
export function runAutoReminders() {
  load(); const a = db.settings.autoRemind; if (!a?.on) return 0;
  const t = todayStr(); const price = String(db.settings.price).replace('.', ','); let n = 0;
  db.users.filter((u) => u.role === 'driver' && u.status !== 'blocked' && u.subscription).forEach((u) => {
    const left = Math.round((parseDate(u.subscription.validUntil) - parseDate(t)) / 86400000);
    const trial = u.subscription.plan === 'trial';
    const stage = a.before && left >= 1 && left <= 3 ? 'before' : a.day && (left === 0 || left === -1) ? 'day' : a.after && left <= -7 && left >= -14 ? 'after' : null;
    if (!stage) return;
    const key = `${u.id}:${u.subscription.validUntil}:${stage}`;
    if (db.autoSent[key]) return;
    const msg = {
      before: [trial ? 'Пробният период свършва скоро' : 'Абонаментът изтича скоро', `${trial ? 'Пробният ти период' : 'Абонаментът ти'} свършва след ${left} ${left === 1 ? 'ден' : 'дни'}. Абонаментът е ${price} € на месец – данните ти остават.`],
      day: ['Абонаментът изтича днес', `Поднови го, за да не спира достъпът до отчетите. ${price} € на месец.`],
      after: ['Липсваш ни', 'Абонаментът ти изтече, но всички данни са запазени. Поднови го и продължи оттам, докъдето беше.'],
    }[stage];
    db.messages.push({ id: uid(), title: msg[0], text: msg[1], target: { userIds: [u.id] }, at: new Date().toISOString(), readBy: [], auto: stage });
    db.autoSent[key] = new Date().toISOString(); n++;
  });
  if (n) commit();
  return n;
}

// ================= Демо данни =================
const FIRST = ['Иван', 'Георги', 'Мария', 'Стоян', 'Николай', 'Димитър', 'Петър', 'Христо', 'Тодор', 'Елена', 'Красимир', 'Васил', 'Атанас', 'Росен', 'Пламен', 'Йордан', 'Светлин', 'Милена', 'Борислав', 'Стефан', 'Калоян', 'Ангел'];
const LAST = ['Петров', 'Димитров', 'Колева', 'Ангелов', 'Иванов', 'Стоянов', 'Георгиев', 'Христов', 'Тодоров', 'Николова', 'Попов', 'Василев', 'Атанасов', 'Маринов', 'Илиев', 'Йорданов', 'Кирилов', 'Павлова', 'Михайлов', 'Костадинов', 'Русев', 'Лазаров'];
const LAT = { 'Иван': 'ivan', 'Георги': 'georgi', 'Мария': 'maria', 'Стоян': 'stoyan', 'Николай': 'nikolay', 'Димитър': 'dimitar', 'Петър': 'petar', 'Христо': 'hristo', 'Тодор': 'todor', 'Елена': 'elena', 'Красимир': 'krasimir', 'Васил': 'vasil', 'Атанас': 'atanas', 'Росен': 'rosen', 'Пламен': 'plamen', 'Йордан': 'yordan', 'Светлин': 'svetlin', 'Милена': 'milena', 'Борислав': 'borislav', 'Стефан': 'stefan', 'Калоян': 'kaloyan', 'Ангел': 'angel' };

function seed() {
  db = { version: VERSION, users: [], profiles: {}, shifts: [], costs: [], reminders: [], reservations: [], settings: { trialDays: 14, price: 3.99 } };
  const today = todayStr();
  db.users.push({ id: 'admin', role: 'admin', adminRole: 'owner', name: 'Администратор', email: 'admin@profitaxi.bg', password: 'admin123', phone: '0888 000 111', status: 'active', createdAt: new Date().toISOString() });
  db.users.push({ id: 'admin-support', role: 'admin', adminRole: 'support', name: 'Поддръжка', email: 'support@profitaxi.bg', password: 'support123', status: 'active', createdAt: new Date().toISOString() });
  db.users.push({ id: 'admin-one', role: 'admin', adminRole: 'partner', company: 'ONE Такси – 032 22 22', name: 'One Taxi', email: 'one@partner.bg', password: 'one123', status: 'active', createdAt: new Date().toISOString() });

  // Основните демо профили – фиксирани, за да могат да се пробват
  const fixed = [
    { name: 'Георги Димитров', email: 'georgi@demo.bg', city: 'Пловдив', company: 'Еко Такси 6155', seed: 23, days: 120, plan: 'paid', valid: 45,
      profile: { carType: 'rent', fuel: 'diesel', rent: { amount: 140, period: 'week' }, dispatch: { mode: 'daily', amount: 10 }, monthlyGoal: 1800 },
      style: { workProb: 0.9, night: 0.6, rate: 0.9, kmMin: 200, kmMax: 340 } },
    { name: 'Мария Колева', email: 'maria@demo.bg', city: 'София', company: 'Yellow!', seed: 37, days: 90, plan: 'paid', valid: 5,
      profile: { carType: 'leasing', fuel: 'hybrid', leasing: { amount: 420 }, dispatch: { mode: 'monthly', amount: 150 }, monthlyGoal: 2200 },
      style: { workProb: 0.7, night: 0.1, rate: 1.05, kmMin: 150, kmMax: 260 } },
    { name: 'Стоян Ангелов', email: 'stoyan@demo.bg', city: 'Варна', company: 'Триумф Такси / Транстриумф', seed: 41, days: 40, plan: 'trial', valid: -3,
      profile: { carType: 'own', fuel: 'lpg', dispatch: { mode: 'daily', amount: 10 }, monthlyGoal: 1200 },
      style: { workProb: 0.45, night: 0.5, rate: 0.9, kmMin: 120, kmMax: 220 } },
    // Демо шофьор за изданието One Taxi (/onetaxi)
    { name: 'Петър Стоянов', email: 'one@demo.bg', city: 'Пловдив', company: 'ONE Такси – 032 22 22', seed: 61, days: 120, plan: 'paid', valid: 30,
      profile: { carType: 'own', fuel: 'petrol_lpg', dispatch: { mode: 'weekly', amount: 35 }, monthlyGoal: 1800, car: { code: '117', plate: 'РВ 1170 КА', model: 'Toyota Auris' } },
      style: { workProb: 0.8, night: 0.35, rate: 0.95, kmMin: 170, kmMax: 280 } },
    { name: 'Николай Иванов', email: 'nikolay@demo.bg', city: 'София', company: 'OK Supertrans', seed: 53, days: 75, plan: 'paid', valid: 120, blocked: true,
      profile: { carType: 'own', fuel: 'electric', dispatch: { mode: 'none', amount: 0 }, monthlyGoal: 2000 },
      style: { workProb: 0.75, night: 0.3, rate: 1.0, kmMin: 160, kmMax: 280 } },
  ];
  // Още шофьори за статистиките в админ панела
  const r0 = rng(777);
  const pick = (a) => a[Math.floor(r0() * a.length)];
  const cityW = ['София', 'София', 'София', 'Пловдив', 'Пловдив', 'Пловдив', 'Варна', 'Варна', 'Бургас', 'Стара Загора', 'Русе', 'Сливен', 'Нова Загора', 'Хасково'];
  const extra = [];
  for (let i = 0; i < 25; i++) {
    const first = FIRST[(i + 5) % FIRST.length];
    let last = LAST[(i * 7 + 3) % LAST.length];
    const female = ['Мария', 'Елена', 'Милена'].includes(first);
    if (female && !last.endsWith('а')) last += 'а';
    if (!female && last.endsWith('а')) last = last.slice(0, -1);
    const city = pick(cityW);
    const list = COMPANIES[city] || [];
    const company = list.length && r0() > 0.12 ? pick(list) : 'Местно такси';
    const carType = pick(['own', 'own', 'own', 'rent', 'rent', 'leasing']);
    const fuel = pick(['petrol_lpg', 'petrol_lpg', 'petrol_lpg', 'diesel', 'hybrid', 'lpg', 'electric']);
    const trial = r0() < 0.2;
    extra.push({
      name: `${first} ${last}`, email: `${LAT[first]}.${i + 1}@demo.bg`, city, company, seed: 100 + i * 13,
      days: 14 + Math.floor(r0() * 200), plan: trial ? 'trial' : 'paid', valid: trial ? Math.floor(r0() * 14) - 2 : Math.floor(r0() * 60) - 6,
      blocked: r0() < 0.05,
      profile: {
        carType, fuel,
        rent: { amount: pick([120, 140, 150, 170]), period: 'week' },
        leasing: { amount: pick([350, 420, 480]) },
        dispatch: pick([{ mode: 'daily', amount: 10 }, { mode: 'weekly', amount: 40 }, { mode: 'monthly', amount: 140 }, { mode: 'none', amount: 0 }]),
        monthlyGoal: pick([1500, 1800, 2000, 2500, 3000]),
      },
      style: { workProb: 0.4 + r0() * 0.5, night: r0() * 0.7, rate: (city === 'София' ? 1.05 : 0.9) + r0() * 0.15, kmMin: 130 + Math.floor(r0() * 60), kmMax: 240 + Math.floor(r0() * 100) },
      inactive: r0() < 0.18 ? 6 + Math.floor(r0() * 20) : 0,
    });
  }

  const ivan = seedPersona(today);
  for (const d of [...fixed, ...extra]) seedDriver(d, today);
  // Шестима колеги са се регистрирали с кода на Иван → 1 спечелен месец, 6 от 8 към втория
  db.users.filter((u) => u.role === 'driver' && u.id !== ivan.id).slice(4, 10).forEach((u) => { u.referredBy = ivan.id; });
  ivan.refMonths = db.users.filter((u) => u.referredBy === ivan.id && u.subscription.paidSince).length;
  db.users.filter((u) => u.referredBy === ivan.id && u.subscription.paidSince).forEach((u) => { u.refRewarded = true; });
  seedExtra(today);
  return db;
}

// Демо: съобщения, код One, бележки, използване, анкета, предложения, функции и един дубликат
function seedExtra(today) {
  ensureExt();
  const drivers = db.users.filter((u) => u.role === 'driver'); const r = rng(99);
  const ago = (d) => new Date(Date.now() - d * 86400000).toISOString();
  db.messages.push({ id: uid(), title: 'Добре дошли в ProfiTaxi', text: 'Записвайте всяка смяна – в края на месеца ще видите точно колко ви остава.', target: null, at: ago(20), readBy: drivers.slice(0, 18).map((u) => u.id) });
  db.messages.push({ id: uid(), title: 'One Taxi: нов тарифен план', text: 'От 1 ноември ефирът става 35 € на седмица. Обновете го в „Колата и ефирът“.', target: { company: 'ONE Такси – 032 22 22' }, at: ago(2), readBy: [] });
  const oneUsers = drivers.filter((u) => u.company === 'ONE Такси – 032 22 22');
  db.codes.push({ code: 'ONE2026', company: 'ONE Такси – 032 22 22', city: 'Пловдив', limit: 200, expires: addDays(today, 180), uses: oneUsers.length, active: true, note: 'Пилот One Taxi', at: ago(30) });
  oneUsers.forEach((u) => { u.accessCode = 'ONE2026'; });
  const ivan = drivers.find((u) => u.email === 'ivan@demo.bg');
  db.notes[ivan.id] = [{ text: 'Иска фактура на фирма за абонамента.', at: ago(3), by: 'admin@profitaxi.bg' }];
  const pages = { home: .95, shift: .9, money: .7, stats: .45, costs: .5, me: .4, calendar: .25, reservations: .2, profile: .3, car: .25, shifts: .35 };
  Object.entries(pages).forEach(([pg, share]) => {
    const p = db.usage[pg] = { views: 0, users: {}, last: ago(0) };
    drivers.forEach((u) => { if (r() < share) { const n = 1 + Math.floor(r() * (pg === 'home' ? 90 : 25)); p.users[u.id] = n; p.views += n; } });
  });
  drivers.slice(0, 22).forEach((u, i) => { const sc = [10, 9, 9, 8, 10, 7, 9, 6, 10, 8, 9, 5, 10, 9, 8, 7, 10, 9, 3, 9, 8, 10][i];
    db.nps.push({ id: uid(), userId: u.id, score: sc, comment: ['', 'Супер е, само искам и фактури', '', 'Много удобно за горивото', '', 'Искам да виждам и разходите на колата по месеци'][i % 6], at: ago(1 + i), city: u.city, company: u.company }); });
  const idea = (text, n, status) => db.ideas.push({ id: uid(), userId: drivers[n % drivers.length].id, text, votes: drivers.slice(0, n).map((u) => u.id), status, at: ago(n) });
  idea('Сканиране на касовата бележка за горивото', 14, 'planned'); idea('Отчет за НАП / счетоводител', 11, 'new'); idea('Отделна сметка за бакшишите', 6, 'new');
  idea('Напомняне за смяна на гумите', 4, 'done'); idea('Тъмна тема по график (вечер)', 3, 'new');
  db.flags.push({ key: 'calendar', label: 'Календар на „Днес“', on: true, target: 'all' });
  db.flags.push({ key: 'reservations', label: 'Лични резервации', on: true, target: 'all' });
  db.flags.push({ key: 'nps', label: 'Анкета „Би ли препоръчал?“', on: true, target: 'percent', percent: 50 });
  // дубликат за демо: двама шофьори с един и същ телефон и номер на кола
  const a = drivers[8], b = drivers[17];
  if (a && b) { b.phone = a.phone; db.profiles[b.id].car = { ...(db.profiles[b.id].car || {}), plate: 'СВ 1234 АВ' }; db.profiles[a.id].car = { ...(db.profiles[a.id].car || {}), plate: 'СВ 1234 АВ' }; }
  seedMore(today, drivers, r, ago);
}
// Демо: етикети, откъде са дошли, плащания и фактури, промо кодове, помощ, причини за отказ, грешки, странни смени
function seedMore(today, drivers, r, ago) {
  const price = db.settings.price;
  drivers.forEach((u, i) => {
    u.tags = u.tags || [];
    u.source = u.accessCode ? 'code' : u.referredBy ? 'invite' : ['site', 'site', 'site', 'promo', 'admin'][i % 5];
    if (u.source === 'promo') u.promo = 'START2';
  });
  const tag = (n, t) => drivers[n] && drivers[n].tags.push(t);
  tag(0, 'VIP'); tag(0, 'тестер'); tag(3, 'тестер'); tag(6, 'VIP'); tag(11, 'проблемен'); tag(14, 'тестер'); tag(20, 'VIP');
  drivers.filter((u) => u.company === 'ONE Такси – 032 22 22').forEach((u) => u.tags.push('от One'));
  // Плащания: всеки месец от началото на платения период; няколко неуспешни
  let inv = 0; const failedIdx = new Set([2, 9, 16]);
  drivers.forEach((u, i) => {
    const s = u.subscription; if (!s.paidSince) return;
    const end = s.validUntil < today ? s.validUntil : today;
    for (let d = s.paidSince; d <= end; d = addDays(d, 30)) {
      db.payments.push({ id: uid(), userId: u.id, amount: price, at: new Date(d + 'T10:00:00').toISOString(), status: 'paid', invoice: 'PT-' + String(++inv).padStart(6, '0'), method: i % 3 ? 'Карта' : 'Apple Pay' });
    }
    if (failedIdx.has(i)) db.payments.push({ id: uid(), userId: u.id, amount: price, at: ago(1 + (i % 4)), status: 'failed', reason: ['Недостатъчна наличност', 'Изтекла карта', 'Отказана от банката'][i % 3], method: 'Карта' });
  });
  db.promos.push({ code: 'START2', kind: 'months', value: 2, limit: 100, uses: drivers.filter((u) => u.promo === 'START2').length, expires: addDays(today, 60), active: true, note: 'Реклама във Facebook', at: ago(40) });
  db.promos.push({ code: 'PLOVDIV50', kind: 'percent', value: 50, limit: 50, uses: 7, expires: addDays(today, 25), active: true, note: 'Пловдив, първия месец', at: ago(15) });
  // Помощ: въпроси от шофьорите
  const tk = (n, topic, text, d, reply, status = 'open') => { const u = drivers[n]; if (!u) return; const t = { id: uid(), userId: u.id, name: u.name, city: u.city, company: u.company, topic, at: ago(d), status, adminUnread: !reply, driverUnread: !!reply, thread: [{ by: 'driver', text, at: ago(d) }] }; if (reply) t.thread.push({ by: 'admin', name: 'Администратор', text: reply, at: ago(d - 0.2) }); db.tickets.push(t); };
  tk(4, 'pay', 'Платих, но още пише, че абонаментът изтича. Може ли да проверите?', 0.3);
  tk(7, 'shift', 'Как да въведа смяна, която е минала през полунощ?', 1.2);
  tk(12, 'login', 'Забравих си паролата и не идва имейл.', 2.5, 'Изпратих ви нова парола по SMS. Сменете я от „Моят профил“.', 'closed');
  tk(15, 'reports', 'Може ли отчетът да излиза и по седмици?', 4, 'Да – в „Пари“ избери „Седмица“ горе.', 'closed');
  tk(19, 'pay', 'Искам фактура на фирма за абонамента.', 0.8);
  tk(22, 'shift', 'Не мога да добавя бакшиш след като приключа смяната.', 3);
  // Защо спряха
  const reasons = ['price', 'noTime', 'quit', 'notUseful', 'price', 'other_app'];
  drivers.filter((u) => u.subscription.validUntil < today).forEach((u, i) => db.churn.push({ id: uid(), userId: u.id, name: u.name, city: u.city, company: u.company, reason: reasons[i % reasons.length], comment: ['', 'Ще се върна напролет', '', ''][i % 4], validUntil: u.subscription.validUntil, at: ago(1 + i) }));
  // Грешки в приложението
  const err = (msg, page, n, dev, br, d) => db.errors.push({ id: uid(), msg, page, userId: drivers[n]?.id, name: drivers[n]?.name || '—', device: dev, browser: br, at: ago(d) });
  err('Снимката е твърде голяма', 'profile', 5, 'iPhone', 'Safari', 0.5); err('Снимката е твърде голяма', 'profile', 9, 'iPhone', 'Safari', 2);
  err('Cannot read properties of undefined (reading \'km\')', 'shift', 13, 'Android', 'Samsung', 1); err('Мрежата не е достъпна', 'home', 2, 'Android', 'Chrome', 3);
  // Странни смени: без километри, 20+ часа, огромен оборот
  const odd = (n, patch) => { const u = drivers[n]; const sh = db.shifts.filter((x) => x.userId === u?.id && x.end).sort((x, y) => y.start.localeCompare(x.start))[2]; if (sh) patch(sh); };
  odd(5, (sh) => { sh.kmEnd = sh.kmStart; });
  odd(10, (sh) => { sh.end = new Date(new Date(sh.start).getTime() + 21.5 * 3600000).toISOString(); });
  odd(18, (sh) => { sh.income.cash = 2350; });
  odd(21, (sh) => { sh.kmEnd = sh.kmStart + 960; });
  // Функция за част от шофьорите, свързана с най-гласуваното предложение
  const top = db.ideas.find((i) => i.status === 'planned');
  db.flags.push({ key: 'receipts', label: 'Сканиране на касова бележка', on: false, target: 'percent', percent: 20, ideaId: top?.id || null });
  db.messages.push({ id: uid(), title: 'Напомняне: техническият преглед', text: 'Проверете датата на прегледа в „Постоянни разходи“.', target: { tag: 'VIP' }, at: ago(0), sendAt: new Date(Date.now() + 2 * 86400000).toISOString(), readBy: [] });
  db.audit.push({ at: ago(1), by: 'admin@profitaxi.bg', text: 'Създаде промо код PLOVDIV50' }, { at: ago(3), by: 'support@profitaxi.bg', text: 'Отговори на ' + (drivers[12]?.name || '') });
}

// Демо шофьорът за пробване и за снимките на сайта. Измислен човек, кола и фирма.
// Сметката е реалистична: около 3100 € оборот и около 2000 € чисто на месец.
//   Постоянни: ефир 40 €/седм., автомивка 20 €/седм., данъци 260, обслужване 60, застраховки и др. ≈ 670 €/мес
//   Гориво: ≈ 20 € на смяна ≈ 100 €/седм. ≈ 440 €/мес
//   22 смени × 9,5 ч × ≈ 14,8 €/ч ≈ 3100 € оборот
function seedPersona(today) {
  const r = rng(2026);
  const days = 150;
  const startDay = addDays(today, -days);
  const u = newDriver({ name: 'Иван Петров', email: 'ivan@demo.bg', password: 'demo123', phone: '0888 214 214', city: 'София', company: 'Lumen Taxi', trialDays: 0, plan: 'paid',
    profile: { onboarded: true, carType: 'own', fuel: 'hybrid', dispatch: { mode: 'weekly', amount: 40 }, monthlyGoal: 2000,
      car: { code: '214', plate: 'СВ 4827 КТ', model: 'Toyota Corolla Hybrid' }, photo: '/img/demo-avatar.svg', carPhoto: '/img/demo-car.jpg' } });
  u.createdAt = new Date(startDay + 'T09:00:00').toISOString();
  u.subscription = { plan: 'paid', validUntil: addDays(today, 20), paidSince: addDays(startDay, 14) };
  u.refCode = 'IVAN-214';
  const add = (c) => db.costs.push({ id: uid(), userId: u.id, startDate: startDay, endDate: null, dueDate: null, payments: [], ...c });
  add({ system: 'dispatch', name: 'Ефир / диспечер', category: 'dispatch', amount: 40, period: 'week', perWorkDay: false });
  add({ name: 'Автомивка (абонамент)', category: 'wash', amount: 20, period: 'week' });
  add({ name: 'Данъци и осигуровки', category: 'taxes', amount: 260, period: 'month', dueDate: addDays(today, 18) });
  add({ name: 'Обслужване', category: 'service', amount: 60, period: 'month' });
  add({ name: 'Гражданска отговорност', category: 'insurance', amount: 120, period: 'quarter', dueDate: addDays(today, 5) });
  add({ name: 'Винетка', category: 'vignette', amount: 97, period: 'year', dueDate: addDays(today, 14) });
  add({ name: 'Технически преглед', category: 'inspection', amount: 120, period: 'year', dueDate: addDays(today, 40) });
  add({ name: 'Телефон и интернет', category: 'phone', amount: 20, period: 'month', dueDate: addDays(today, 9) });
  add({ name: 'Таксиметров апарат', category: 'meter', amount: 12, period: 'month' });
  let km = 241380;
  for (let i = days; i >= 1; i--) {
    const day = addDays(today, -i);
    const wd = (new Date(day + 'T12:00:00').getDay() + 6) % 7;
    const work = wd <= 4 ? r() < 0.93 : wd === 5 ? r() < 0.45 : false;
    if (!work) continue;
    const evening = r() < 0.3;
    const start = new Date(day + 'T00:00:00'); start.setHours(evening ? 15 : 7, Math.floor(r() * 4) * 15);
    const hours = 8.5 + r() * 2;
    const end = new Date(start.getTime() + hours * 3600000);
    const k = Math.round(hours * (19.5 + r() * 3));
    const rate = 14.0 * (wd === 4 ? 1.1 : wd === 5 ? 1.15 : 1) * (0.92 + r() * 0.16);
    const gross = hours * rate;
    const tips = round2(gross * (0.02 + r() * 0.02));
    const rest = gross - tips;
    const card = round2(rest * (0.26 + r() * 0.08)), app = round2(rest * (0.1 + r() * 0.06));
    const income = { cash: round2(rest - card - app), card, app, tips };
    const qty = round2(k * 0.074 * (0.95 + r() * 0.1));
    const expenses = [{ id: uid(), category: 'fuel', fuelType: 'petrol', amount: round2(qty * 1.36), qty }];
    if (r() < 0.15) expenses.push({ id: uid(), category: 'parking', amount: 2 });
    db.shifts.push({ id: uid(), userId: u.id, start: start.toISOString(), end: end.toISOString(), kmStart: km, kmEnd: km + k, income, expenses, note: '' });
    km += k + Math.floor(r() * 6);
  }
  db.reminders.push({ id: uid(), userId: u.id, title: 'Смяна на масло', dueKm: km + 1350, everyKm: 10000, dueDate: null, repeat: 'none' });
  const res = (o) => db.reservations.push({ id: uid(), userId: u.id, phone: '', price: null, note: '', done: false, createdAt: new Date().toISOString(), ...o });
  res({ date: addDays(today, 1), time: '05:30', from: 'ж.к. Младост 1, бл. 12', to: 'Летище София, Терминал 2', client: 'Г-жа Николова', phone: '0887 112 233', price: 25, note: 'Полет в 07:40, два куфара' });
  res({ date: addDays(today, 3), time: '18:00', from: 'хотел „Маринела“', to: 'Централна гара', client: 'Мартин', price: 15 });
  res({ date: addDays(today, 6), time: '09:00', from: 'НДК', to: 'Банско, хотел „Гранд“', client: 'Семейство Илиеви', phone: '0899 456 789', price: 140, note: 'Детско столче' });
  res({ date: addDays(today, -4), time: '06:15', from: 'бул. „България“ 51', to: 'Летище София, Терминал 1', client: 'Г-н Стоянов', price: 22, done: true });
  return u;
}

function seedDriver(d, today) {
  const r = rng(d.seed);
  const startDay = addDays(today, -d.days);
  const u = newDriver({ name: d.name, email: d.email, password: 'demo123', phone: `08${8 + (d.seed % 2)}${String(1000000 + d.seed * 7919).slice(-7)}`, city: d.city, company: d.company, trialDays: 0, plan: d.plan, profile: { onboarded: true, ...d.profile } });
  u.createdAt = new Date(startDay + 'T09:00:00').toISOString();
  u.lastLoginAt = new Date(addDays(today, -(d.inactive || 0)) + 'T08:30:00').toISOString();
  u.subscription = { plan: d.plan, validUntil: addDays(today, d.valid), paidSince: d.plan === 'paid' ? addDays(startDay, 14) : null };
  if (d.blocked) u.status = 'blocked';
  const p = db.profiles[u.id];

  // Системни разходи от началото на акаунта
  const sys = [];
  if (p.dispatch.mode !== 'none') sys.push({ system: 'dispatch', name: 'Ефир / диспечер', category: 'dispatch', amount: p.dispatch.amount, period: { daily: 'day', weekly: 'week', monthly: 'month' }[p.dispatch.mode], perWorkDay: p.dispatch.mode === 'daily' });
  if (p.carType === 'leasing') sys.push({ system: 'leasing', name: 'Лизингова вноска', category: 'leasing', amount: p.leasing.amount, period: 'month', endDate: addDays(today, 400) });
  if (p.carType === 'rent') sys.push({ system: 'rent', name: 'Наем на колата', category: 'rent', amount: p.rent.amount, period: p.rent.period });
  sys.forEach((c) => db.costs.push({ id: uid(), userId: u.id, startDate: startDay, endDate: null, dueDate: null, payments: [], ...c }));

  const own = p.carType !== 'rent';
  const due = (min, span) => addDays(today, min + Math.floor(r() * span));
  const fixedCosts = [
    own && { name: 'Гражданска отговорност', category: 'insurance', amount: 120, period: 'quarter', dueDate: due(2, 6) },
    own && { name: 'Винетка', category: 'vignette', amount: 97, period: 'year', dueDate: due(8, 12) },
    own && { name: 'Технически преглед', category: 'inspection', amount: 60, period: 'quarter', dueDate: due(20, 60) },
    own && { name: 'Сервиз и гуми', category: 'service', amount: 60, period: 'month' },
    own && { name: 'Таксиметров апарат', category: 'meter', amount: 12, period: 'month' },
    { name: 'Разрешително от общината', category: 'license', amount: 100, period: 'year', dueDate: due(150, 100) },
    { name: 'Телефон и интернет', category: 'phone', amount: 20, period: 'month', dueDate: due(1, 25) },
    d.seed % 2 === 1 && { name: 'Данъци и осигуровки', category: 'taxes', amount: 260, period: 'month', dueDate: due(5, 20) },
    d.seed === 11 && { name: 'Каско', category: 'casco', amount: 650, period: 'year', dueDate: addDays(today, 95) },
  ].filter(Boolean);
  fixedCosts.forEach((c) => db.costs.push({ id: uid(), userId: u.id, startDate: startDay, endDate: null, payments: [], ...c }));

  // Смени
  let km = 180000 + Math.floor(r() * 120000);
  const fuelType = { petrol: 'petrol', petrol_lpg: 'lpg', diesel: 'diesel', hybrid: 'petrol', lpg: 'lpg', electric: 'electric' }[p.fuel];
  const price = { petrol: 1.32, diesel: 1.38, lpg: 0.62, electric: 0.35 };
  const cons = { petrol_lpg: 12.5, petrol: 8.5, diesel: 6.8, hybrid: 5.2, lpg: 12.5, electric: 17 }[p.fuel];
  const lastDay = d.inactive || 1;
  for (let i = d.days; i >= lastDay; i--) {
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
    const gross = k * d.style.rate * boost * 0.62;
    const cardShare = 0.15 + r() * 0.25, appShare = r() * 0.2;
    const income = {
      cash: round2(gross * (1 - cardShare - appShare)),
      card: round2(gross * cardShare),
      app: round2(gross * appShare),
      tips: round2(r() < 0.6 ? 2 + r() * 10 : 0),
    };
    const expenses = [];
    const qty = round2((k * cons) / 100 * (0.9 + r() * 0.2));
    expenses.push({ id: uid(), category: 'fuel', fuelType, amount: round2(qty * price[fuelType]), qty });
    if (p.fuel === 'petrol_lpg' && r() < 0.35) { const q = round2(1 + r() * 2); expenses.push({ id: uid(), category: 'fuel', fuelType: 'petrol', amount: round2(q * price.petrol), qty: q }); }
    if (r() < 0.25) expenses.push({ id: uid(), category: 'wash', amount: 6 });
    if (r() < 0.2) expenses.push({ id: uid(), category: 'parking', amount: 2 });
    if (r() < 0.01) expenses.push({ id: uid(), category: 'fine', amount: 50, label: 'Глоба за паркиране' });
    if (own && r() < 0.03) expenses.push({ id: uid(), category: 'service', amount: round2(30 + r() * 120), label: 'Ремонт' });
    db.shifts.push({ id: uid(), userId: u.id, start: start.toISOString(), end: end.toISOString(), kmStart: km, kmEnd: km + k, income, expenses, note: '' });
    km += k + Math.floor(r() * 15);
  }
  if (own) db.reminders.push({ id: uid(), userId: u.id, title: 'Смяна на масло', dueKm: km + 900 + Math.floor(r() * 2000), everyKm: 10000, dueDate: null, repeat: 'none' });
}

export const _debug = { load, get db() { return db; } };
export { CAR_TYPES, OTHER };
