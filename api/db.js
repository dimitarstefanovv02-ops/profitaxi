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
    if (company && u.company !== company) return { error: 'Този вход е само за шофьорите на One Taxi. Влез от profitaxi.vercel.app/app.' };
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
      if (!c || !c.active || (c.expires && c.expires < today) || (c.limit && c.uses >= c.limit) || (u.company && c.company && c.company !== u.company)) return { error: 'Невалиден код от One Taxi. Вземи го от диспечерите.' };
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
      }
    }
    await sleep(300);
    return { ok: true }; // не казваме дали има такъв акаунт
  },

  async logout({ token }) { if (token) await one(['HDEL', 'pt:tok', token]); return { ok: true }; },
};
const NEEDS_LOGIN = new Set(['pull', 'push', 'passwd', 'deleteMe', 'wipeAll']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function addDays(d, n) { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }

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
  if (req.method === 'GET') return send(res, 200, { live: !!(URL_ || MEMORY) });
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  if (!URL_ && !MEMORY) return send(res, 503, { error: 'Базата данни още не е свързана' });
  let body; try { body = await readBody(req); } catch { return send(res, 400, { error: 'Невалидна заявка' }); }
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

