// ProfiTaxi – обща база данни за тестовия период.
// Една функция във Vercel + Upstash Redis (безплатен план). Без отделен сървър.
//
// Ключове в Redis:
//   pt:db     – hash: поле = един запис (напр. "shifts:abc"), стойност = JSON
//   pt:auth   – hash: id на потребител → { email, role, salt, hash }
//   pt:email  – hash: имейл → id
//   pt:tok    – hash: токен за вход → { id, role, at }
//   pt:rev    – брояч на промените (за бързо „няма нищо ново“)
//
// Всеки шофьор получава и може да променя само своите записи. Админът вижда всичко.

import crypto from 'node:crypto';
import { fieldColl, fieldKey } from '../js/schema.js';
import { sendPush, pushReady } from '../lib/webpush.js';
import { GUIDE } from '../lib/guide.js';
import * as PK from '../lib/passkey.js';
import { periodStats, shiftDate } from '../js/calc.js';
import { todayStr } from '../js/util.js';

// Датите (вчера, понеделник, 10:00 и 20:00) са по българско време
process.env.TZ ||= 'Europe/Sofia';

// ---------- известия на телефона на админа ----------
// pt:push – hash: sha1(endpoint) → { id (админ), sub, types: ['reg','ticket'], at }
const PUSH_TYPES = ['reg', 'ticket'];
const subKey = (endpoint) => crypto.createHash('sha1').update(String(endpoint)).digest('hex');
async function notifyAdmins(type, data, onlyId) {
  if (!pushReady()) return 0;
  try {
    const all = pairs(await one(['HGETALL', 'pt:push']));
    const list = Object.entries(all).filter(([, r]) => r?.sub && r.role !== 'driver' && (onlyId ? r.id === onlyId : (r.types || PUSH_TYPES).includes(type)));
    const dead = [];
    const res = await Promise.race([
      Promise.allSettled(list.map(async ([k, r]) => { const st = await sendPush(r.sub, data); if (st === 404 || st === 410) dead.push(k); return st; })),
      sleep(5000).then(() => []),
    ]);
    if (dead.length) await one(['HDEL', 'pt:push', ...dead]);
    return res.filter((x) => x.status === 'fulfilled' && x.value >= 200 && x.value < 300).length;
  } catch (e) { console.error('push', e); return 0; }
}

// Съобщения от админа и отговори на въпроси → известие на телефона на шофьора
const forUserSrv = (t, u) => !t || ((!t.city || t.city === u.city) && (!t.company || t.company === u.company) && (!t.userIds || t.userIds.includes(u.id)) && (!t.tag || (u.tags || []).includes(t.tag)));
async function notifyDrivers(items) {
  if (!pushReady()) return 0;
  try {
    const subs = Object.entries(pairs(await one(['HGETALL', 'pt:push']))).filter(([, r]) => r?.role === 'driver' && r.sub && wantsMsg(r));
    if (!subs.length) return 0;
    const ids = [...new Set(subs.map(([, r]) => r.id))];
    const vals = await one(['HMGET', 'pt:db', ...ids.map((i) => 'users:' + i)]);
    const users = {}; ids.forEach((i, n) => { const u = parse(vals[n]); if (u && (!u.status || u.status === 'active')) users[i] = u; });
    const clip = (x, n) => { x = String(x || '').trim(); return x.length > n ? x.slice(0, n - 1) + '…' : x; };
    const jobs = []; const dead = [];
    for (const it of items) for (const [k, r] of subs) {
      const u = users[r.id]; if (!u) continue;
      const base = '/app';
      let data = null;
      if (it.msg && forUserSrv(it.msg.target, u)) data = { title: clip(it.msg.title || 'Съобщение', 60), body: clip(it.msg.text, 160), url: base + '#/home', tag: 'msg-' + it.msg.id };
      if (it.reply && it.reply.userId === u.id) data = { title: 'Отговор на въпроса ти', body: clip(it.text, 160), url: base + '#/help', tag: 'tk-' + it.reply.id };
      if (data) jobs.push(sendPush(r.sub, { ...data, icon: '/icons/icon-192.png' }).then((st) => { if (st === 404 || st === 410) dead.push(k); }).catch(() => {}));
    }
    await Promise.race([Promise.allSettled(jobs), sleep(5000)]);
    if (dead.length) await one(['HDEL', 'pt:push', ...new Set(dead)]);
    return jobs.length;
  } catch (e) { console.error('push drv', e); return 0; }
}

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const MEMORY = !URL_ && (process.env.PT_MEMORY === '1' || process.env.NODE_ENV === 'test');
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@profitaxi.bg').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (MEMORY ? 'admin123' : '');
const TOKEN_DAYS = 365;

// ---------- Redis (или памет при локален тест) ----------
const mem = globalThis.__ptMem ||= { h: new Map(), s: new Map() };
const hmap = (k) => { if (!mem.h.has(k)) mem.h.set(k, new Map()); return mem.h.get(k); };
function memCmd([cmd, key, ...a]) {
  switch (cmd) {
    case 'HGETALL': return [...hmap(key)].flat();
    case 'HGET': return hmap(key).get(a[0]) ?? null;
    case 'HMGET': return a.map((f) => hmap(key).get(f) ?? null);
    case 'HSET': { for (let i = 0; i < a.length; i += 2) hmap(key).set(a[i], a[i + 1]); return a.length / 2; }
    case 'HSETNX': { if (hmap(key).has(a[0])) return 0; hmap(key).set(a[0], a[1]); return 1; }
    case 'HDEL': { let n = 0; a.forEach((f) => { if (hmap(key).delete(f)) n++; }); return n; }
    case 'GET': return mem.s.get(key) ?? null;
    case 'INCR': { const v = Number(mem.s.get(key) || 0) + 1; mem.s.set(key, String(v)); return v; }
    case 'HINCRBY': { const v = Number(hmap(key).get(a[0]) || 0) + Number(a[1]); hmap(key).set(a[0], String(v)); return v; }
    default: throw new Error('memory: ' + cmd);
  }
}
async function redis(cmds) {
  if (!cmds.length) return [];
  if (MEMORY) return cmds.map(memCmd);
  const r = await fetch(`${URL_}/pipeline`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds) });
  if (!r.ok) throw new Error('redis ' + r.status);
  const out = await r.json();
  return out.map((x) => { if (x.error) throw new Error(x.error); return x.result; });
}
const one = async (cmd) => (await redis([cmd]))[0];
const parse = (s) => { try { return s == null ? null : JSON.parse(s); } catch { return null; } };
const pairs = (arr) => { const o = {}; for (let i = 0; i < (arr || []).length; i += 2) o[arr[i]] = parse(arr[i + 1]); return o; };

// ---------- пароли и токени ----------
const hashPw = (pw, salt) => crypto.scryptSync(String(pw), salt, 32).toString('hex');
const newSalt = () => crypto.randomBytes(16).toString('hex');
const safeEq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const checkPw = (rec, pw) => !!rec && safeEq(hashPw(pw, rec.salt), rec.hash);
const norm = (e) => String(e || '').trim().toLowerCase();
async function issueToken(id, role) {
  const t = crypto.randomBytes(24).toString('hex');
  await one(['HSET', 'pt:tok', t, JSON.stringify({ id, role, at: Date.now() })]);
  return t;
}
async function whoIs(token) {
  if (!token || typeof token !== 'string') return null;
  const s = parse(await one(['HGET', 'pt:tok', token]));
  if (!s || Date.now() - s.at > TOKEN_DAYS * 864e5) return null;
  return s;
}
const authCmds = (id, email, role, pw) => { const salt = newSalt(); return [['HSET', 'pt:auth', id, JSON.stringify({ email: norm(email), role, salt, hash: hashPw(pw, salt) })], ['HSET', 'pt:email', norm(email), id]]; };

// ---------- данни ----------
const stripPw = (f, v) => (fieldColl(f) === 'users' && v && typeof v === 'object' && 'password' in v) ? (({ password, ...rest }) => rest)(v) : v;
async function allFields() { return pairs(await one(['HGETALL', 'pt:db'])); }
const isOut = (m) => !m.sendAt || m.sendAt <= new Date().toISOString();
const forUser = (t, u) => !t || ((!t.city || t.city === u.city) && (!t.company || t.company === u.company) && (!t.userIds || t.userIds.includes(u.id)) && (!t.tag || (u.tags || []).includes(t.tag)));
const OWN = ['shifts', 'costs', 'reminders', 'reservations', 'tickets', 'nps', 'churn', 'errors', 'payments'];
const PUBLIC = ['settings', 'flags', 'ideas'];

// Какво вижда един шофьор: само своето + общите неща
function driverView(all, id) {
  const me = all[`users:${id}`]; if (!me) return null;
  const out = {};
  for (const [f, v] of Object.entries(all)) {
    const c = fieldColl(f), k = fieldKey(f);
    if (c === 'users') {
      if (k === id) out[f] = v;
      else if (v?.referredBy === id) out[f] = { id: v.id, role: v.role, name: v.name, referredBy: v.referredBy, createdAt: v.createdAt, subscription: v.subscription, status: v.status };
    } else if (c === 'profiles' || c === 'dismissed') { if (k === id) out[f] = v; }
    else if (OWN.includes(c)) { if (v?.userId === id) out[f] = v; }
    else if (c === 'messages') { if (isOut(v) && forUser(v.target, me)) out[f] = v; }
    else if (PUBLIC.includes(c)) out[f] = v;
  }
  return out;
}
const viewFor = (all, s) => s.role === 'admin' ? all : driverView(all, s.id);

// Полета, които шофьорът не може да си сменя сам
const PROTECTED = ['role', 'status', 'subscription', 'tags', 'refMonths', 'referredBy', 'accessCode', 'promo', 'discount', 'source', 'adminRole', 'refCode', 'createdAt'];

const unionThread = (a = [], b = []) => {
  const seen = new Set(); const out = [];
  [...a, ...b].forEach((m) => { const key = `${m.at}|${m.by}|${m.text}`; if (!seen.has(key)) { seen.add(key); out.push(m); } });
  return out.sort((x, y) => String(x.at).localeCompare(String(y.at)));
};

// Записва промени. Шофьорът – само своите; админът – всичко.
async function applyPush(s, set = {}, del = []) {
  const fields = [...Object.keys(set), ...del];
  if (!fields.length) return { ok: true, rejected: [] };
  if (fields.length > 3000) return { error: 'Твърде много промени наведнъж' };
  const cur = {}; const vals = await one(['HMGET', 'pt:db', ...fields]); fields.forEach((f, i) => { cur[f] = parse(vals[i]); });
  const isAdmin = s.role === 'admin', id = s.id;
  const newTickets = [], toDrivers = [];
  const hset = [], hdel = [], extra = [], rejected = [];
  for (const [f, raw] of Object.entries(set)) {
    const c = fieldColl(f), k = fieldKey(f), old = cur[f];
    let v = raw;
    if (v == null || typeof v !== 'object') { rejected.push(f); continue; }
    if (isAdmin) {
      if (c === 'users' && v.password) { // нова парола, зададена от админа
        if (String(v.password).length >= 6 && v.email) extra.push(...authCmds(k, v.email, v.role === 'admin' ? 'admin' : 'driver', v.password));
        v = stripPw(f, v);
      }
      if (c === 'tickets' && old) v = { ...v, thread: unionThread(old.thread, v.thread) };
      if (c === 'messages' && old) v = { ...v, readBy: [...new Set([...(old.readBy || []), ...(v.readBy || [])])] };
      // ново съобщение (без насрочване за по-късно) → известие на шофьорите, за които е
      if (c === 'messages' && !old && !(v.sendAt && v.sendAt > new Date().toISOString())) toDrivers.push({ msg: v });
      // нов отговор на въпрос на шофьор → известие само на него
      if (c === 'tickets' && v.userId) { const was = (old?.thread || []).filter((x) => x.by === 'admin').length; const now = (v.thread || []).filter((x) => x.by === 'admin'); if (now.length > was) toDrivers.push({ reply: v, text: now[now.length - 1].text }); }
      hset.push(f, JSON.stringify(v)); continue;
    }
    // шофьор
    if (c === 'users') {
      if (k !== id || !old) { rejected.push(f); continue; }
      v = stripPw(f, v); PROTECTED.forEach((p) => { if (p in old) v[p] = old[p]; else delete v[p]; });
      v.id = id; v.email = old.email;
    } else if (c === 'profiles' || c === 'dismissed') { if (k !== id) { rejected.push(f); continue; } }
    else if (c === 'usage') { if (!k.endsWith('|' + id)) { rejected.push(f); continue; } }
    else if (OWN.includes(c) && c !== 'payments') {
      if (v.userId !== id || (old && old.userId !== id)) { rejected.push(f); continue; }
      if (c === 'tickets' && old) v = { ...v, thread: unionThread(old.thread, v.thread) };
      if (c === 'tickets') { const was = old?.thread?.length || 0, now = v.thread?.length || 0; if (now > was) newTickets.push(v); }
    } else if (c === 'messages') {
      if (!old) { rejected.push(f); continue; }
      const read = (v.readBy || []).includes(id);
      v = { ...old, readBy: read ? [...new Set([...(old.readBy || []), id])] : (old.readBy || []) };
    } else if (c === 'ideas') {
      if (old) { const has = (v.votes || []).includes(id); v = { ...old, votes: has ? [...new Set([...(old.votes || []), id])] : (old.votes || []).filter((x) => x !== id) }; }
      else if (v.userId === id && typeof v.text === 'string') v = { id: v.id, userId: id, text: v.text.slice(0, 500), votes: [id], status: 'new', at: new Date().toISOString() };
      else { rejected.push(f); continue; }
    } else { rejected.push(f); continue; }
    hset.push(f, JSON.stringify(v));
  }
  for (const f of del) {
    const c = fieldColl(f), k = fieldKey(f), old = cur[f];
    if (!old) continue;
    if (isAdmin) {
      hdel.push(f);
      if (c === 'users') extra.push(['HDEL', 'pt:auth', k], ['HDEL', 'pt:email', norm(old.email)]);
      continue;
    }
    if (OWN.includes(c) && c !== 'payments' && old.userId === id) hdel.push(f); else rejected.push(f);
  }
  const cmds = [];
  if (hset.length) cmds.push(['HSET', 'pt:db', ...hset]);
  if (hdel.length) cmds.push(['HDEL', 'pt:db', ...hdel]);
  cmds.push(...extra);
  if (cmds.length) cmds.push(['INCR', 'pt:rev']);
  const res = await redis(cmds);
  if (toDrivers.length) await notifyDrivers(toDrivers.slice(0, 5));
  for (const t of newTickets.slice(0, 3)) { const m = t.thread[t.thread.length - 1]; await notifyAdmins('ticket', { title: `Въпрос от ${t.name || 'шофьор'}`, body: String(m?.text || '').slice(0, 140), url: '/admin#/messages?t=inbox', tag: 'tk-' + t.id }); }
  return { ok: true, rejected, rev: cmds.length ? res[res.length - 1] : undefined };
}

async function pull(s, rev) {
  const now = await one(['GET', 'pt:rev']);
  if (rev != null && String(rev) === String(now || 0)) return { same: true, rev: Number(now || 0) };
  const v = viewFor(await allFields(), s);
  if (!v) return { status: 401, error: 'Акаунтът не съществува' };
  return { fields: v, rev: Number(now || 0) };
}

// ---------- действия ----------
const ops = {
  async ping() { return { ok: true, live: true }; },

  async login({ email, password, company }) {
    const id = await one(['HGET', 'pt:email', norm(email)]);
    const rec = id && parse(await one(['HGET', 'pt:auth', id]));
    if (!rec || rec.role !== 'driver' || !checkPw(rec, password)) { await sleep(400); return { error: 'Грешен имейл или парола' }; }
    const all = await allFields(); const u = all[`users:${id}`];
    if (!u) return { error: 'Грешен имейл или парола' };
    const token = await issueToken(id, 'driver');
    const rev = await one(['GET', 'pt:rev']);
    return { token, user: u, fields: driverView(all, id), rev: Number(rev || 0) };
  },

  async register({ user, profile, password, accessCode, promo, refCode }) {
    if (!user || typeof user !== 'object' || !user.email || !user.name) return { error: 'Липсват данни' };
    if (String(password || '').length < 6) return { error: 'Паролата трябва да е поне 6 символа' };
    const email = norm(user.email);
    if (await one(['HGET', 'pt:email', email]) || email === ADMIN_EMAIL) return { error: 'Вече има акаунт с този имейл' };
    const all = await allFields();
    const ph = String(user.phone || '').replace(/\D/g, '').replace(/^359/, '0');
    if (ph && Object.entries(all).some(([f, x]) => f.startsWith('users:') && x?.role === 'driver' && String(x.phone || '').replace(/\D/g, '').replace(/^359/, '0') === ph)) return { error: 'Има акаунт с този телефон. Влез в него или се свържи с нас.' };
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const today = new Date().toISOString().slice(0, 10);
    const settings = all.settings || {};
    const u = {
      ...stripPw('users:x', user), id, role: 'driver', status: 'active', email: String(user.email).trim(),
      createdAt: new Date().toISOString(), lastLoginAt: new Date().toISOString(), tags: [], refMonths: 0, referredBy: null,
      subscription: { plan: 'trial', validUntil: addDays(today, Number(settings.trialDays) || 14) },
      phoneVerified: true, source: 'site',
    };
    const set = {};
    if (accessCode != null) {
      const code = String(accessCode).trim().toUpperCase(); const c = all[`codes:${code}`];
      if (!c || !c.active || (c.expires && c.expires < today) || (c.limit && c.uses >= c.limit) || (u.company && c.company && c.company !== u.company)) return { error: 'Невалиден код за достъп.' };
      u.accessCode = code; u.source = 'code'; set[`codes:${code}`] = { ...c, uses: (c.uses || 0) + 1 };
    }
    if (promo && String(promo).trim()) {
      const code = String(promo).trim().toUpperCase(); const p = all[`promos:${code}`];
      if (!p || !p.active) return { error: 'Няма такъв промо код' };
      if (p.expires && p.expires < today) return { error: 'Промо кодът е изтекъл' };
      if (p.limit && p.uses >= p.limit) return { error: 'Промо кодът е използван максимален брой пъти' };
      u.promo = code; if (u.source === 'site') u.source = 'promo';
      if (p.kind === 'months') u.subscription.validUntil = addDays(u.subscription.validUntil, 30 * p.value); else u.discount = p.value;
      set[`promos:${code}`] = { ...p, uses: (p.uses || 0) + 1 };
    }
    if (refCode && String(refCode).trim()) {
      const code = String(refCode).trim().toUpperCase();
      const ref = Object.values(all).find((x) => x && x.role === 'driver' && x.refCode === code);
      if (!ref) return { error: 'Няма такъв код за покана. Провери го или остави полето празно.' };
      u.referredBy = ref.id; if (u.source === 'site') u.source = 'invite';
    }
    set[`users:${id}`] = u;
    set[`profiles:${id}`] = { ...(profile && typeof profile === 'object' ? profile : {}), tour: 'pending' };
    const hs = []; Object.entries(set).forEach(([f, v]) => hs.push(f, JSON.stringify(v)));
    await redis([['HSET', 'pt:db', ...hs], ...authCmds(id, email, 'driver', password), ['INCR', 'pt:rev']]);
    const token = await issueToken(id, 'driver');
    const all2 = { ...all, ...set }; const rev = await one(['GET', 'pt:rev']);
    const n = Object.values(all2).filter((x) => x && x.role === 'driver').length;
    await notifyAdmins('reg', { title: 'Нов шофьор 🚕', body: `${u.name} · ${[u.city, u.company].filter(Boolean).join(', ')} – общо ${n}`, url: '/admin#/drivers?f=new', tag: 'reg-' + id });
    return { token, user: u, fields: driverView(all2, id), rev: Number(rev || 0) };
  },

  async adminLogin({ email, password }) {
    const e = norm(email);
    let id = null;
    if (ADMIN_PASSWORD && e === ADMIN_EMAIL && safeEq(hashPw(password, 'owner'), hashPw(ADMIN_PASSWORD, 'owner'))) {
      id = 'admin';
      await one(['HSETNX', 'pt:db', 'users:admin', JSON.stringify({ id: 'admin', role: 'admin', adminRole: 'owner', name: 'Администратор', email: ADMIN_EMAIL, status: 'active', createdAt: new Date().toISOString() })]);
    } else {
      const uid = await one(['HGET', 'pt:email', e]);
      const rec = uid && parse(await one(['HGET', 'pt:auth', uid]));
      if (rec && rec.role === 'admin' && checkPw(rec, password)) id = uid;
    }
    if (!id) { await sleep(500); return { error: 'Грешен имейл или парола' }; }
    const token = await issueToken(id, 'admin');
    const all = await allFields(); const rev = await one(['GET', 'pt:rev']);
    return { token, user: all[`users:${id}`], fields: all, rev: Number(rev || 0) };
  },

  async pull({ rev }, s) { return pull(s, rev); },

  async push({ set, del, rev }, s) {
    const r = await applyPush(s, set || {}, Array.isArray(del) ? del : []);
    if (r.error) return r;
    return r;
  },

  async passwd({ old, password }, s) {
    if (String(password || '').length < 6) return { error: 'Паролата трябва да е поне 6 символа' };
    const rec = parse(await one(['HGET', 'pt:auth', s.id]));
    if (!checkPw(rec, old)) return { error: 'Грешна текуща парола' };
    await redis(authCmds(s.id, rec.email, rec.role, password));
    return { ok: true };
  },

  async deleteMe(_, s) {
    if (s.role !== 'driver') return { error: 'Само за шофьори' };
    const all = await allFields();
    const mine = Object.keys(all).filter((f) => {
      const c = fieldColl(f), k = fieldKey(f), v = all[f];
      return (c === 'users' && k === s.id) || ((c === 'profiles' || c === 'dismissed' || c === 'notes') && k === s.id) || (c === 'usage' && k.endsWith('|' + s.id)) || (OWN.includes(c) && v?.userId === s.id);
    });
    const rec = parse(await one(['HGET', 'pt:auth', s.id]));
    const cmds = [['HDEL', 'pt:auth', s.id]];
    const pks = Object.entries(pairs(await one(['HGETALL', 'pt:pk']))).filter(([, v]) => v?.userId === s.id).map(([k]) => k);
    const subs = Object.entries(pairs(await one(['HGETALL', 'pt:push']))).filter(([, v]) => v?.id === s.id).map(([k]) => k);
    if (pks.length) cmds.push(['HDEL', 'pt:pk', ...pks]);
    if (subs.length) cmds.push(['HDEL', 'pt:push', ...subs]);
    if (mine.length) cmds.push(['HDEL', 'pt:db', ...mine]);
    if (rec) cmds.push(['HDEL', 'pt:email', rec.email]);
    cmds.push(['INCR', 'pt:rev']);
    await redis(cmds);
    return { ok: true };
  },

  // Изчиства всички шофьори и данните им (за началото на теста). Остават: настройките, кодовете, промо кодовете, функциите и админите.
  async wipeAll(_, s) {
    if (s.role !== 'admin') return { error: 'Само за админ' };
    const all = await allFields();
    const me = all[`users:${s.id}`];
    if (s.id !== 'admin' && me?.adminRole !== 'owner') return { error: 'Само собственикът може да изтрие всичко' };
    const KEEP = ['settings', 'flags'];
    const drop = [], put = [];
    let drivers = 0;
    for (const [f, v] of Object.entries(all)) {
      const c = fieldColl(f);
      if (KEEP.includes(c)) continue;
      if (c === 'users' && v?.role === 'admin') continue;
      if (c === 'codes' || c === 'promos') { put.push(f, JSON.stringify({ ...v, uses: 0 })); continue; }
      if (c === 'users') drivers++;
      drop.push(f);
    }
    const auth = pairs(await one(['HGETALL', 'pt:auth']));
    const tok = pairs(await one(['HGETALL', 'pt:tok']));
    const emails = {}; { const arr = await one(['HGETALL', 'pt:email']) || []; for (let i = 0; i < arr.length; i += 2) emails[arr[i]] = arr[i + 1]; }
    const dropAuth = Object.keys(auth).filter((id) => auth[id]?.role !== 'admin');
    const dropTok = Object.keys(tok).filter((t) => tok[t]?.role !== 'admin');
    const dropEmail = Object.keys(emails).filter((e) => dropAuth.includes(emails[e]));
    const audit = [{ at: new Date().toISOString(), by: me?.email || 'admin', text: `Изчисти всички данни на шофьорите (${drivers})` }];
    const cmds = [];
    for (let i = 0; i < drop.length; i += 500) cmds.push(['HDEL', 'pt:db', ...drop.slice(i, i + 500)]);
    if (put.length) cmds.push(['HSET', 'pt:db', ...put]);
    cmds.push(['HSET', 'pt:db', 'audit', JSON.stringify(audit)]);
    if (dropAuth.length) cmds.push(['HDEL', 'pt:auth', ...dropAuth]);
    if (dropTok.length) cmds.push(['HDEL', 'pt:tok', ...dropTok]);
    if (dropEmail.length) cmds.push(['HDEL', 'pt:email', ...dropEmail]);
    cmds.push(['INCR', 'pt:rev']);
    await redis(cmds);
    return { ok: true, drivers };
  },

  // „Забравена парола“: стига до админа като въпрос; админът сменя паролата и се обажда на шофьора
  async forgot({ email }) {
    const e = norm(email);
    if (!/^\S+@\S+\.\S+$/.test(e)) return { error: 'Невалиден имейл' };
    const id = await one(['HGET', 'pt:email', e]);
    if (id) {
      const u = parse(await one(['HGET', 'pt:db', `users:${id}`]));
      if (u && u.role === 'driver') {
        const tid = crypto.randomUUID().replace(/-/g, '').slice(0, 12), at = new Date().toISOString();
        const t = { id: tid, userId: id, name: u.name, city: u.city, company: u.company, topic: 'login', at, status: 'open', adminUnread: true, driverUnread: false,
          thread: [{ by: 'driver', text: `Забравих си паролата. Моля, сменете я и ми се обадете на ${u.phone || 'телефона от профила'}.`, at }] };
        await redis([['HSET', 'pt:db', `tickets:${tid}`, JSON.stringify(t)], ['INCR', 'pt:rev']]);
        await notifyAdmins('ticket', { title: `Забравена парола: ${u.name}`, body: `Смени паролата и се обади на ${u.phone || 'шофьора'}`, url: '/admin#/messages?t=inbox', tag: 'tk-' + tid });
      }
    }
    await sleep(300);
    return { ok: true }; // не казваме дали има такъв акаунт
  },

  // Абонамент за известия на телефона на админа
  async pushSub({ sub, types }, s) {
    if (s.role !== 'admin') return { error: 'Само за админ' };
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return { error: 'Невалиден абонамент' };
    if (!/^https:\/\//.test(sub.endpoint) && !MEMORY) return { error: 'Невалиден адрес' };
    const t = (Array.isArray(types) ? types : PUSH_TYPES).filter((x) => PUSH_TYPES.includes(x));
    await one(['HSET', 'pt:push', subKey(sub.endpoint), JSON.stringify({ id: s.id, sub: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }, types: t, at: new Date().toISOString() })]);
    return { ok: true, ready: pushReady() };
  },
  async pushUnsub({ endpoint }, s) { if (s.role !== 'admin') return { error: 'Само за админ' }; if (endpoint) await one(['HDEL', 'pt:push', subKey(endpoint)]); return { ok: true }; },
  async pushTest(_, s) {
    if (s.role !== 'admin') return { error: 'Само за админ' };
    if (!pushReady()) return { error: 'Известията още не са включени на сървъра' };
    const n = await notifyAdmins('test', { title: 'ProfiTaxi', body: 'Известията работят ✅', url: '/admin#/overview', tag: 'test' }, s.id);
    return n ? { ok: true, sent: n } : { error: 'Няма телефон, на който да се прати. Включи известията отново.' };
  },

  // ---------- известия за шофьора: напомняне за смяната и седмичен отчет ----------
  async drvPushSub({ sub, types, v }, s) {
    if (s.role !== 'driver') return { error: 'Само за шофьори' };
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return { error: 'Невалиден абонамент' };
    if (!/^https:\/\//.test(sub.endpoint) && !MEMORY) return { error: 'Невалиден адрес' };
    const t = (Array.isArray(types) ? types : DRV_TYPES).filter((x) => DRV_TYPES.includes(x));
    await one(['HSET', 'pt:push', 'd:' + subKey(sub.endpoint), JSON.stringify({ id: s.id, role: 'driver', sub: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }, types: t, v: v === 2 ? 2 : undefined, at: new Date().toISOString() })]);
    return { ok: true, ready: pushReady() };
  },
  async drvPushUnsub({ endpoint }, s) { if (endpoint) await one(['HDEL', 'pt:push', 'd:' + subKey(endpoint)]); return { ok: true }; },
  // Админ: пусни напомнянията сега (за проба), без да чака 10:00 / 20:00
  async cronRun({ slot }, s) {
    if (s.role !== 'admin') return { error: 'Само за админ' };
    return runCron(slot === 'pm' ? 'pm' : 'am', { force: true });
  },

  // ---------- гласово въвеждане (Whisper през Groq) ----------
  async voice({ audio, mime, mockText }, s) {
    if (!audio || typeof audio !== 'string') return { error: 'Няма запис' };
    if (audio.length > 5_000_000) return { error: 'Записът е твърде дълъг. Говори до 30 секунди.' };
    if (!(await quota(s.id, 'voice', 80))) return { error: 'За днес гласовото въвеждане е изчерпано. Въведи с пръст или опитай утре.' };
    if (groqMock()) return { text: mockText || 'Кеш 120, карта 80, гориво 40 евро 28 литра, автомивка 6' };
    if (!GROQ) return { error: 'Гласовото въвеждане още не е включено на сървъра.' };
    try { return { text: await groqTranscribe(Buffer.from(audio, 'base64'), String(mime || 'audio/webm')) }; }
    catch (e) { console.error('voice', e); return { error: 'Не успях да разпозная записа. Опитай пак.' }; }
  },

  // ---------- AI отговори в търсачката ----------
  async ask({ q, mockAnswer }, s) {
    const text = String(q || '').trim().slice(0, 300);
    if (text.length < 2) return { error: 'Напиши въпрос' };
    if (!(await quota(s.id, 'ask', 40))) return { error: 'За днес въпросите към AI са изчерпани. Пиши ни от Профил → Помощ → Пиши ни.' };
    let a;
    if (groqMock()) a = mockAnswer || 'Excel файлът е в Пари → „Свали в Excel“.';
    else if (!GROQ) return { error: 'AI отговорите още не са включени на сървъра.' };
    else {
      try { a = await groqChat([{ role: 'system', content: ASK_SYSTEM }, { role: 'user', content: text }]); }
      catch (e) { console.error('ask', e); return { error: 'AI не отговаря в момента. Опитай след малко.' }; }
    }
    const u = parse(await one(['HGET', 'pt:db', `users:${s.id}`]));
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    await redis([['HSET', 'pt:db', `asks:${id}`, JSON.stringify({ id, at: new Date().toISOString(), userId: s.id, name: u?.name || '', city: u?.city || '', company: u?.company || '', q: text, a, kind: 'ai' })], ['INCR', 'pt:rev']]);
    return { answer: a };
  },

  // ---------- вход с Face ID / пръстов отпечатък ----------
  async pkStatus(_, s) {
    const n = Object.values(pairs(await one(['HGETALL', 'pt:pk']))).filter((v) => v?.userId === s.id).length;
    return { count: n };
  },
  async pkRegOptions(body, s) {
    if (s.role !== 'driver') return { error: 'Само за шофьори' };
    const { rpId } = rpFrom(body);
    const u = parse(await one(['HGET', 'pt:db', `users:${s.id}`]));
    if (!u) return { error: 'Акаунтът не съществува' };
    const mine = Object.entries(pairs(await one(['HGETALL', 'pt:pk']))).filter(([, v]) => v?.userId === s.id).map(([k]) => k);
    const challenge = await newChallenge('reg', s.id);
    return { publicKey: {
      challenge, rp: { name: 'ProfiTaxi', id: rpId },
      user: { id: PK.b64u(Buffer.from(s.id)), name: u.email || u.name, displayName: u.name || u.email },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
      timeout: 60000, attestation: 'none', excludeCredentials: mine.map((id) => ({ type: 'public-key', id })),
    } };
  },
  async pkRegister(body, s) {
    const { credential, device } = body;
    const { rpId, origins } = rpFrom(body);
    try {
      const { challenge, rec } = await takeChallenge(credential?.response?.clientDataJSON, 'reg');
      if (rec.id !== s.id) throw new Error('Друг акаунт');
      const r = PK.verifyRegistration(credential.response, { challenge, rpId, origins });
      await one(['HSET', 'pt:pk', r.credId, JSON.stringify({ userId: s.id, jwk: r.jwk, alg: r.alg, counter: r.counter, at: new Date().toISOString(), device: String(device || '').slice(0, 60) })]);
      return { ok: true };
    } catch (e) { return { error: 'Не успях да включа входа с Face ID: ' + e.message }; }
  },
  async pkLoginOptions(body) {
    const { rpId } = rpFrom(body);
    return { publicKey: { challenge: await newChallenge('auth'), rpId, userVerification: 'required', timeout: 60000, allowCredentials: [] } };
  },
  async pkLogin(body) {
    const { credential, company } = body;
    const { rpId, origins } = rpFrom(body);
    try {
      const { challenge } = await takeChallenge(credential?.response?.clientDataJSON, 'auth');
      const cred = parse(await one(['HGET', 'pt:pk', String(credential?.id || '')]));
      if (!cred) throw new Error('Този телефон не е включен за вход с Face ID. Влез с паролата и го включи от Лични данни.');
      const r = PK.verifyLogin(credential.response, cred, { challenge, rpId, origins });
      await one(['HSET', 'pt:pk', String(credential.id), JSON.stringify({ ...cred, counter: r.counter, lastAt: new Date().toISOString() })]);
      const id = cred.userId;
      const rec = parse(await one(['HGET', 'pt:auth', id]));
      const all = await allFields(); const u = all[`users:${id}`];
      if (!rec || rec.role !== 'driver' || !u) throw new Error('Акаунтът не съществува');
        const token = await issueToken(id, 'driver');
      const rev = await one(['GET', 'pt:rev']);
      return { token, user: u, fields: driverView(all, id), rev: Number(rev || 0) };
    } catch (e) { await sleep(300); return { error: e.message || 'Неуспешен вход' }; }
  },
  async pkRemove(_, s) {
    const mine = Object.entries(pairs(await one(['HGETALL', 'pt:pk']))).filter(([, v]) => v?.userId === s.id).map(([k]) => k);
    if (mine.length) await one(['HDEL', 'pt:pk', ...mine]);
    return { ok: true, removed: mine.length };
  },

  async logout({ token }) { if (token) await one(['HDEL', 'pt:tok', token]); return { ok: true }; },
};
const NEEDS_LOGIN = new Set(['pull', 'push', 'passwd', 'deleteMe', 'wipeAll', 'pushSub', 'pushUnsub', 'pushTest', 'drvPushSub', 'drvPushUnsub', 'cronRun', 'voice', 'ask', 'pkStatus', 'pkRegOptions', 'pkRegister', 'pkRemove']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function addDays(d, n) { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }

// ---------- помощни за известията на шофьора, гласа, AI и Face ID ----------
const DRV_TYPES = ['remind', 'weekly', 'msg'];
// Съобщенията от админа: старите абонаменти (без v:2) ги получават по подразбиране
const wantsMsg = (r) => (r.v === 2 ? (r.types || []).includes('msg') : true);
const WD = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const MON = ['яну', 'фев', 'мар', 'апр', 'май', 'юни', 'юли', 'авг', 'сеп', 'окт', 'ное', 'дек'];
const fmtDay = (d) => { const x = new Date(d + 'T12:00:00'); return `${WD[x.getDay()]}, ${x.getDate()} ${MON[x.getMonth()]}`; };
const eur = (v) => `${String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} €`;
function userData(all, id) {
  const of = (c) => Object.entries(all).filter(([f, v]) => f.startsWith(c + ':') && v?.userId === id).map(([, v]) => v);
  return { user: all[`users:${id}`], profile: all[`profiles:${id}`] || {}, shifts: of('shifts').sort((a, b) => String(b.start).localeCompare(String(a.start))), costs: of('costs'), reminders: of('reminders') };
}
// Пуска се по график в 10:00 и 20:00 българско време (.github/workflows/reminders.yml).
// Часът се проверява по София, а всеки час се праща само веднъж на ден (pt:cron).
const sofiaHour = (d) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Sofia', hour: '2-digit', hourCycle: 'h23' }).format(d));
// Напомня, ако за вчера няма смяна и шофьорът не е отбелязал „Почивах“; в понеделник сутрин – седмичен отчет.
async function runCron(slot, { force = false } = {}) {
  if (!['am', 'pm'].includes(slot)) return { error: 'slot' };
  const now = new Date(); const hour = sofiaHour(now); const want = slot === 'am' ? 10 : 20;
  if (!force && hour !== want) return { skipped: 'hour', hour };
  const today = todayStr(); const yest = addDays(today, -1);
  if (!force && !(await one(['HSETNX', 'pt:cron', `${today}:${slot}`, String(Date.now())]))) return { skipped: 'done' };
  if (!pushReady()) return { skipped: 'nopush' };
  const all = await allFields(); const subs = pairs(await one(['HGETALL', 'pt:push']));
  const byUser = new Map();
  for (const [k, r] of Object.entries(subs)) if (r?.role === 'driver' && r.sub) { if (!byUser.has(r.id)) byUser.set(r.id, []); byUser.get(r.id).push([k, r]); }
  const monday = now.getDay() === 1;
  let sent = 0; const dead = []; const jobs = [];
  for (const [id, list] of byUser) {
    const u = all[`users:${id}`]; if (!u || (u.status && u.status !== 'active')) continue;
    const d = userData(all, id); const base = '/app';
    const msgs = [];
    const created = new Date(u.createdAt || 0); const createdDay = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}-${String(created.getDate()).padStart(2, '0')}`;
    const hasY = d.shifts.some((x) => shiftDate(x) === yest);
    const off = (d.profile.offDays || []).includes(yest);
    const recent = d.shifts.some((x) => shiftDate(x) >= addDays(today, -14)); // спрял да кара → не досаждаме
    if (createdDay < today && recent && !hasY && !off) msgs.push({ kind: 'remind', title: 'Вчерашната смяна', body: `Няма записана смяна за вчера (${fmtDay(yest)}). Запиши я за 10 секунди – или натисни „Почивах“.`, url: base + '#/home', tag: 'remind-' + yest });
    if (slot === 'am' && monday) {
      const st = periodStats(d, addDays(today, -7), yest);
      if (st.shifts > 0) {
        const prev = periodStats(d, addDays(today, -14), addDays(today, -8));
        const pct = prev.shifts > 0 && Math.abs(prev.net) > 0.5 ? Math.round((st.net - prev.net) / Math.abs(prev.net) * 100) : null;
        msgs.push({ kind: 'weekly', title: 'Миналата седмица', body: `${eur(st.net)} чисто от ${st.shifts} ${st.shifts === 1 ? 'смяна' : 'смени'}${pct != null ? `, ${pct >= 0 ? '+' : '−'}${Math.abs(pct)}% спрямо предната` : ''}.`, url: base + '#/money', tag: 'week-' + yest });
      }
    }
    for (const [k, r] of list) for (const m of msgs) {
      if (!(r.types || DRV_TYPES).includes(m.kind)) continue;
      const { kind, ...data } = m;
      jobs.push(sendPush(r.sub, { ...data, icon: '/icons/icon-192.png' }).then((st) => { if (st === 404 || st === 410) dead.push(k); else if (st >= 200 && st < 300) sent++; }).catch(() => {}));
    }
  }
  await Promise.race([Promise.allSettled(jobs), sleep(8000)]);
  if (dead.length) await one(['HDEL', 'pt:push', ...new Set(dead)]);
  return { ok: true, sent, users: byUser.size };
}
// Без тайна: извикването е безопасно – праща само в 10:00/20:00 софийско време и само веднъж на ден.
const cronAllowed = (req) => { const sec = process.env.CRON_SECRET; return !sec || req.headers.authorization === `Bearer ${sec}`; };

const GROQ = process.env.GROQ_API_KEY;
const groqMock = () => process.env.GROQ_MOCK === '1' || (MEMORY && !GROQ);
async function quota(id, kind, max) { return (await one(['HINCRBY', 'pt:quota', `${id}:${todayStr()}:${kind}`, 1])) <= max; }
async function groqTranscribe(buf, mime) {
  const ext = /mp4|m4a|aac/.test(mime) ? 'm4a' : /ogg/.test(mime) ? 'ogg' : /wav/.test(mime) ? 'wav' : /mpeg|mp3/.test(mime) ? 'mp3' : 'webm';
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: mime }), 'voice.' + ext);
  fd.append('model', 'whisper-large-v3-turbo');
  fd.append('language', 'bg');
  fd.append('response_format', 'json');
  fd.append('temperature', '0');
  fd.append('prompt', 'Кеш 120, карта 80, приложения 30, бакшиш 10, гориво 40 евро, 28 литра, автомивка 6, паркинг 2, начален километраж 250 000.');
  const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${GROQ}` }, body: fd });
  if (!r.ok) throw new Error('groq ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return String((await r.json()).text || '').trim();
}
const ASK_SYSTEM = `Ти си помощникът в приложението ProfiTaxi. Отговаряй САМО на български, кратко (до 4 изречения), ясно и приятелски, като на шофьор. Отговаряй само за приложението по описанието по-долу и не измисляй функции, които ги няма. Посочвай къде точно се натиска със стрелки, например „Пари → Статистика“. Ако въпросът е за неговите числа (колко е изкарал, колко гориво е платил), кажи му да напише въпроса в търсачката, например „колко изкарах тази седмица“, или да отвори Пари → Статистика. Ако не знаеш или въпросът не е за приложението, кажи го честно и предложи Профил → Помощ → Пиши ни.

ОПИСАНИЕ НА ПРИЛОЖЕНИЕТО:
${GUIDE}`;
async function groqChat(messages) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${GROQ}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, temperature: 0.2, max_tokens: 350 }) });
  if (!r.ok) throw new Error('groq ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return String((await r.json()).choices?.[0]?.message?.content || '').trim();
}

function rpFrom(body) {
  const host = String(body.__host || 'localhost').split(',')[0].trim();
  const rpId = host.replace(/:\d+$/, '');
  const origins = [`https://${host}`]; if (MEMORY) origins.push(`http://${host}`);
  return { rpId, origins };
}
async function newChallenge(kind, id) {
  const c = PK.b64u(crypto.randomBytes(32));
  await one(['HSET', 'pt:chal', c, JSON.stringify({ kind, id, at: Date.now() })]);
  return c;
}
async function takeChallenge(clientDataJSON, kind) {
  let c; try { c = JSON.parse(PK.fromB64u(clientDataJSON).toString('utf8')).challenge; } catch { throw new Error('Невалиден отговор'); }
  const rec = parse(await one(['HGET', 'pt:chal', String(c)]));
  if (rec) await one(['HDEL', 'pt:chal', String(c)]);
  if (!rec || rec.kind !== kind || Date.now() - rec.at > 5 * 60e3) throw new Error('Времето изтече. Опитай пак.');
  return { challenge: c, rec };
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = []; for await (const c of req) chunks.push(c);
  const s = Buffer.concat(chunks).toString('utf8');
  return s ? JSON.parse(s) : {};
}
function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const slot = new URL(req.url || '/', 'http://x').searchParams.get('cron');
    if (slot) {
      if (!URL_ && !MEMORY) return send(res, 503, { error: 'no db' });
      if (!cronAllowed(req)) return send(res, 401, { error: 'Забранено' });
      try { return send(res, 200, await runCron(slot)); } catch (e) { console.error('cron', e); return send(res, 500, { error: 'cron' }); }
    }
    return send(res, 200, { live: !!(URL_ || MEMORY) });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  if (!URL_ && !MEMORY) return send(res, 503, { error: 'Базата данни още не е свързана' });
  let body; try { body = await readBody(req); } catch { return send(res, 400, { error: 'Невалидна заявка' }); }
  if (body && typeof body === 'object') body.__host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const fn = ops[body?.op]; if (!fn) return send(res, 400, { error: 'Непознато действие' });
  try {
    let s = null;
    if (NEEDS_LOGIN.has(body.op)) { s = await whoIs(body.token); if (!s) return send(res, 401, { error: 'Влез отново' }); }
    const out = await fn(body, s);
    return send(res, out?.status || 200, out);
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'Сървърът не отговаря. Опитай след малко.' });
  }
}

