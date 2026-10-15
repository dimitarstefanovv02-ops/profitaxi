// Чисто – обща база данни за тестовия период.
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
import * as MSG from '../lib/messenger.js';
import { periodStats, shiftDate } from '../js/calc.js';
import { todayStr } from '../js/util.js';
import { rentState, deadlines, idleDays, dlDays } from '../js/fleet.js';

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
      if (it.direct && it.direct.userId === u.id) data = { title: clip(it.direct.title, 60), body: clip(it.direct.body, 160), url: base + (it.direct.url || '#/home'), tag: it.direct.tag };
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
    case 'GET': if (mem.exp?.get(key) < Date.now()) { mem.s.delete(key); mem.exp.delete(key); } return mem.s.get(key) ?? null;
    case 'INCR': { if (mem.exp?.get(key) < Date.now()) { mem.s.delete(key); mem.exp.delete(key); } const v = Number(mem.s.get(key) || 0) + 1; mem.s.set(key, String(v)); return v; }
    case 'EXPIRE': { const t = (mem.exp ||= new Map()); t.set(key, Date.now() + Number(a[0]) * 1000); return 1; }
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
const phoneKey = (p) => String(p || '').replace(/\D/g, '').replace(/^359/, '0');
// Вход с имейл или с телефон: pt:email и pt:phone сочат към акаунта
const authCmds = (id, email, role, pw, phone) => {
  const salt = newSalt(); const e = email ? norm(email) : ''; const ph = phoneKey(phone);
  const c = [['HSET', 'pt:auth', id, JSON.stringify({ email: e, phone: ph, role, salt, hash: hashPw(pw, salt) })]];
  if (e) c.push(['HSET', 'pt:email', e, id]);
  if (ph) c.push(['HSET', 'pt:phone', ph, id]);
  return c;
};
// Намира акаунта по имейл или телефон (старите акаунти без индекс по телефон – по профила, и го добавя)
async function idByLogin(login) {
  const v = String(login || '').trim();
  if (v.includes('@')) return one(['HGET', 'pt:email', norm(v)]);
  const ph = phoneKey(v); if (!/^0\d{9}$/.test(ph)) return null;
  let id = await one(['HGET', 'pt:phone', ph]);
  if (!id) {
    const all = await allFields();
    const hit = Object.values(all).find((x) => x && x.role === 'driver' && x.id && phoneKey(x.phone) === ph);
    if (hit) { id = hit.id; await one(['HSET', 'pt:phone', ph, id]); }
  }
  return id;
}

// ---------- данни ----------
const stripPw = (f, v) => (fieldColl(f) === 'users' && v && typeof v === 'object' && 'password' in v) ? (({ password, ...rest }) => rest)(v) : v;
async function allFields() { return pairs(await one(['HGETALL', 'pt:db'])); }
const isOut = (m) => !m.sendAt || m.sendAt <= new Date().toISOString();
const forUser = (t, u) => !t || ((!t.city || t.city === u.city) && (!t.company || t.company === u.company) && (!t.userIds || t.userIds.includes(u.id)) && (!t.tag || (u.tags || []).includes(t.tag)));
const OWN = ['shifts', 'costs', 'reminders', 'reservations', 'tickets', 'nps', 'churn', 'errors', 'payments', 'logoreq'];
const PUBLIC = ['settings', 'flags', 'ideas', 'logos'];

// Какво вижда един шофьор: само своето + общите неща
// Обща кола: собственикът вижда на шофьорите си само км, часове, дни и смени (без пари);
// шофьорите виждат колата, общите ѝ разходи (при лична кола) и имената на останалите.
function carScope(all, id) {
  const owned = new Set(), member = new Set(), drivers = new Set(), people = new Set(), fuel = new Set();
  for (const [f, v] of Object.entries(all)) {
    if (fieldColl(f) !== 'cars' || !v) continue;
    const ms = (v.members || []).map((m) => m.userId);
    if (v.ownerId === id) { owned.add(v.id); ms.forEach((x) => { if (x !== id) { drivers.add(x); people.add(x); if (v.type === 'own') fuel.add(x); } }); }
    if (ms.includes(id)) { member.add(v.id); people.add(v.ownerId); ms.forEach((x) => x !== id && people.add(x)); }
  }
  return { owned, member, drivers, people, fuel };
}
const SHIFT_PUBLIC = (s, withFuel) => {
  const o = { id: s.id, userId: s.userId, start: s.start, end: s.end, kmStart: s.kmStart, kmEnd: s.kmEnd, carId: s.carId || null };
  // при лична кола, карана и от други: собственикът вижда горивото (без приходите)
  if (withFuel) { const f = (s.expenses || []).filter((e) => e.category === 'fuel'); o.fuel = { amount: f.reduce((a, e) => a + (Number(e.amount) || 0), 0), qty: f.reduce((a, e) => a + (Number(e.qty) || 0), 0) }; }
  return o;
};
const USER_PUBLIC = (u) => ({ id: u.id, role: u.role, name: u.name, phone: u.phone, city: u.city, company: u.company, status: u.status });
function driverView(all, id) {
  const me = all[`users:${id}`]; if (!me) return null;
  const out = {};
  const cs = carScope(all, id);
  for (const [f, v] of Object.entries(all)) {
    const c = fieldColl(f), k = fieldKey(f);
    if (c === 'cars') {
      if (cs.owned.has(k)) out[f] = v;
      else if (cs.member.has(k)) { const { invite, ...rest } = v; out[f] = rest; } // кода за покана го вижда само собственикът
      continue;
    }
    if (c === 'costs' && v?.carId && v.userId !== id) { if (cs.member.has(v.carId) && all[`cars:${v.carId}`]?.type === 'own') out[f] = v; continue; }
    if (c === 'shifts' && v?.userId !== id) { if (cs.drivers.has(v?.userId)) out[f] = SHIFT_PUBLIC(v, cs.fuel.has(v.userId)); continue; }
    // дневникът на колата: собственикът вижда всичко за колите си, шофьорът – своите записи
    if (c === 'carlog') { if (v && (cs.owned.has(v.carId) || v.by === id || v.driverId === id)) out[f] = v; continue; }
    if (c === 'profiles' && k !== id && cs.people.has(k)) { out[f] = { photo: v?.photo || null }; continue; }
    if (c === 'users' && k !== id && cs.people.has(k)) { out[f] = USER_PUBLIC(v); continue; }
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
const PROTECTED = ['emailVerified', 'emailVerifiedAt', 'phoneVerified', 'role', 'status', 'subscription', 'tags', 'refMonths', 'referredBy', 'accessCode', 'promo', 'discount', 'source', 'adminRole', 'refCode', 'createdAt'];

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
  // за дневника на колата трябват колите и името на шофьора
  const cars = {}; let all2 = {};
  const logF = fields.filter((f) => fieldColl(f) === 'carlog');
  if (logF.length && !isAdmin) {
    const ids = [...new Set(logF.flatMap((f) => [set[f]?.carId, cur[f]?.carId]).filter(Boolean))];
    const keys = [...ids.map((x) => 'cars:' + x), 'users:' + id];
    const vs = await one(['HMGET', 'pt:db', ...keys]); keys.forEach((k2, i) => { const v2 = parse(vs[i]); if (k2.startsWith('cars:')) cars[k2.slice(5)] = v2; else all2[k2] = v2; });
  }
  const newTickets = [], toDrivers = [];
  const hset = [], hdel = [], extra = [], rejected = []; const authPatch = {};
  for (const [f, raw] of Object.entries(set)) {
    const c = fieldColl(f), k = fieldKey(f), old = cur[f];
    let v = raw;
    if (v == null || typeof v !== 'object') { rejected.push(f); continue; }
    if (isAdmin) {
      if (c === 'users' && v.password) { // нова парола, зададена от админа
        if (String(v.password).length >= 6 && (v.email || v.phone)) extra.push(...authCmds(k, v.email, v.role === 'admin' ? 'admin' : 'driver', v.password, v.role === 'admin' ? '' : v.phone));
        v = stripPw(f, v);
      }
      if (c === 'users' && old && v.role !== 'admin' && phoneKey(v.phone) !== phoneKey(old.phone)) { if (old.phone) extra.push(['HDEL', 'pt:phone', phoneKey(old.phone)]); if (v.phone) extra.push(['HSET', 'pt:phone', phoneKey(v.phone), k]); }
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
      v.id = id;
      // входът е с имейл или телефон: нов имейл (ако досега няма) и нов телефон обновяват индексите за вход
      const ne = norm(v.email || ''), oe = norm(old.email || '');
      if (!oe && ne && /^\S+@\S+\.\S+$/.test(ne) && !(await one(['HGET', 'pt:email', ne])) && ne !== ADMIN_EMAIL) { extra.push(['HSET', 'pt:email', ne, id]); authPatch.email = ne; } else v.email = old.email;
      const np = phoneKey(v.phone), op = phoneKey(old.phone);
      if (np !== op) {
        const taken = np && await one(['HGET', 'pt:phone', np]);
        if (np && (!/^0\d{9}$/.test(np) || (taken && taken !== id))) v.phone = old.phone;
        else { if (op) extra.push(['HDEL', 'pt:phone', op]); if (np) extra.push(['HSET', 'pt:phone', np, id]); authPatch.phone = np; }
      }
    } else if (c === 'profiles' || c === 'dismissed') {
      if (k !== id) { rejected.push(f); continue; }
      // шофьор и собственик на коли са отделни акаунти: видът не се сменя от приложението
      if (c === 'profiles' && old) { if (old.accountType) v.accountType = old.accountType; else delete v.accountType; }
    }
    else if (c === 'cars') { // колата се създава и променя само от собственика
      if (old ? old.ownerId !== id : v.ownerId !== id) { rejected.push(f); continue; }
      v.ownerId = id; v.id = k;
    }
    else if (c === 'usage') { if (!k.endsWith('|' + id)) { rejected.push(f); continue; } }
    else if (c === 'carlog') {
      const car = cars[v.carId] || null; const was = old ? cars[old.carId] || null : null;
      const owner = car && car.ownerId === id && (!old || (was && was.ownerId === id));
      if (owner) { v.ownerId = id; v.id = k; v.by = old?.by || v.by || id; }
      else {
        const member = !v.carId || (car && (car.members || []).some((m) => m.userId === id));
        const okKind = ['pay', 'damage', 'personal', 'handover'].includes(v.kind);
        if (!member || !okKind || v.by !== id || v.driverId !== id || (old && (old.by !== id || old.status === 'ok'))) { rejected.push(f); continue; }
        if (v.kind === 'pay') v.status = 'claimed';
        v.ownerId = car ? car.ownerId : null; v.id = k;
      }
      if (!old && v.notify !== false) {
        const who = all2[`users:${id}`]?.name || 'Шофьор';
        const eur2 = (x) => `${Math.round((Number(x) || 0) * 100) / 100} €`.replace('.', ',');
        if (owner && v.driverId && v.driverId !== id) {
          const t = { remind: ['Напомняне за наема', v.text || `Наемът за колата: ${eur2(v.amount)}. Отбележи „Платих“, щом платиш.`], notice: [v.title || 'Съобщение от собственика', v.text || ''], fine: ['Глоба', `${eur2(v.amount)}${v.text ? ' – ' + v.text : ''}. Записана е в разходите ти.`], handover: ['Колата е предадена', `Километраж при предаване: ${v.km || ''} км`] }[v.kind];
          if (t) toDrivers.push({ direct: { userId: v.driverId, title: t[0], body: t[1], url: '#/home', tag: `cl-${k}` } });
        }
        if (!owner && car) {
          const t = { pay: [`${who}: Платих`, `${eur2(v.amount)} наем – потвърди в „Автопарк“.`], damage: [`${who}: щета по колата`, v.text || 'Виж снимките в колата.'] }[v.kind];
          if (t) toDrivers.push({ direct: { userId: car.ownerId, title: t[0], body: t[1], url: `#/cars/${car.id}`, tag: `cl-${k}` } });
        }
      }
      if (owner && old && old.status !== 'ok' && v.status === 'ok' && v.kind === 'pay' && v.driverId !== id) toDrivers.push({ direct: { userId: v.driverId, title: 'Плащането е потвърдено', body: `Собственикът потвърди ${Math.round(v.amount)} € наем.`, url: '#/home', tag: `cl-${k}` } });
    }
    else if (OWN.includes(c) && c !== 'payments') {
      if (v.userId !== id || (old && old.userId !== id)) { rejected.push(f); continue; }
      // предложено лого: само ново, до ~300 KB, без самоодобрение
      if (c === 'logoreq') { if (old || JSON.stringify(v).length > 400000 || !String(v.img || '').startsWith('data:image/')) { rejected.push(f); continue; } v = { ...v, status: 'new', source: 'user' }; }
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
      if (c === 'users') { extra.push(['HDEL', 'pt:auth', k]); if (old.email) extra.push(['HDEL', 'pt:email', norm(old.email)]); if (old.phone) extra.push(['HDEL', 'pt:phone', phoneKey(old.phone)]); }
      continue;
    }
    if (OWN.includes(c) && c !== 'payments' && old.userId === id) hdel.push(f);
    else if (c === 'cars' && old.ownerId === id) hdel.push(f);
    else if (c === 'carlog' && ((cars[old.carId] && cars[old.carId].ownerId === id) || (old.by === id && old.status !== 'ok'))) hdel.push(f);
    else rejected.push(f);
  }
  if (!isAdmin && Object.keys(authPatch).length) { const rec = parse(await one(['HGET', 'pt:auth', id])); if (rec) extra.push(['HSET', 'pt:auth', id, JSON.stringify({ ...rec, ...authPatch })]); }
  const cmds = [];
  if (hset.length) cmds.push(['HSET', 'pt:db', ...hset]);
  if (hdel.length) cmds.push(['HDEL', 'pt:db', ...hdel]);
  cmds.push(...extra);
  if (cmds.length) cmds.push(['INCR', 'pt:rev']);
  const res = await redis(cmds);
  if (toDrivers.length) await notifyDrivers(toDrivers.slice(0, 40));
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

  async login({ email, login, password, company }) {
    const id = await idByLogin(login ?? email);
    const rec = id && parse(await one(['HGET', 'pt:auth', id]));
    if (!rec || rec.role !== 'driver' || !checkPw(rec, password)) { await sleep(400); return { error: 'Грешни данни за вход – провери имейла/телефона и паролата' }; }
    const all = await allFields(); const u = all[`users:${id}`];
    if (!u) return { error: 'Грешни данни за вход – провери имейла/телефона и паролата' };
    const token = await issueToken(id, 'driver');
    const rev = await one(['GET', 'pt:rev']);
    return { token, user: u, fields: driverView(all, id), rev: Number(rev || 0) };
  },

  async register({ user, profile, password, accessCode, promo, refCode, by }) {
    if (!user || typeof user !== 'object' || !user.name || (!user.email && !user.phone)) return { error: 'Липсват данни' };
    if (String(password || '').length < 6) return { error: 'Паролата трябва да е поне 6 символа' };
    const email = user.email ? norm(user.email) : '';
    if (email && (await one(['HGET', 'pt:email', email]) || email === ADMIN_EMAIL)) return { error: 'Вече има акаунт с този имейл' };
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return { error: 'Невалиден имейл' };
    const method = by === 'phone' || !email ? 'phone' : 'email'; // с какво се регистрира: то се потвърждава
    if (method === 'phone' && !/^0[89]\d{8}$/.test(phoneKey(user.phone))) return { error: 'Въведи мобилен телефон, например 0888 123 456' };
    const all = await allFields();
    const ph = String(user.phone || '').replace(/\D/g, '').replace(/^359/, '0');
    if (ph && Object.entries(all).some(([f, x]) => f.startsWith('users:') && x?.role === 'driver' && String(x.phone || '').replace(/\D/g, '').replace(/^359/, '0') === ph)) return { error: 'Има акаунт с този телефон. Влез в него или се свържи с нас.' };
    const settings = all.settings || {};
    const ver = verifyCfg(settings);
    // код по SMS: телефонът трябва да е потвърден в последните 30 минути
    // с телефон → код по SMS; с имейл → линк по имейла
    if (ver.sms && method === 'phone') { const ok = parse(await one(['HGET', 'pt:smsok', ph])); if (!ok || Date.now() - ok.at > 30 * 60e3) return { error: 'Потвърди телефона с кода от SMS' }; }
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const today = new Date().toISOString().slice(0, 10);
    const u = {
      ...stripPw('users:x', user), id, role: 'driver', status: 'active', email: email ? String(user.email).trim() : '', phone: user.phone || '', signup: method,
      createdAt: new Date().toISOString(), lastLoginAt: new Date().toISOString(), tags: [], refMonths: 0, referredBy: null,
      subscription: { plan: 'trial', validUntil: addDays(today, Number(settings.trialDays) || 14) },
      phoneVerified: method === 'phone' && ver.sms, source: 'site',
    };
    if (ver.email && method === 'email') u.emailVerified = false;
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
    await redis([['HSET', 'pt:db', ...hs], ...authCmds(id, email, 'driver', password, ph), ['INCR', 'pt:rev']]);
    const token = await issueToken(id, 'driver');
    if (ver.email && method === 'email') { try { await mailVerify(u, hostOf(arguments[0])); } catch (e) { console.error('mail', e); } }
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
      const cur = parse(await one(['HGET', 'pt:db', 'users:admin']));
      if (!cur) await one(['HSET', 'pt:db', 'users:admin', JSON.stringify({ id: 'admin', role: 'admin', adminRole: 'owner', name: 'Администратор', email: ADMIN_EMAIL, status: 'active', createdAt: new Date().toISOString() })]);
      else if (cur.email !== ADMIN_EMAIL) await one(['HSET', 'pt:db', 'users:admin', JSON.stringify({ ...cur, email: ADMIN_EMAIL })]);
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
    await redis(authCmds(s.id, rec.email, rec.role, password, rec.phone));
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
    if (rec?.email) cmds.push(['HDEL', 'pt:email', rec.email]);
    if (rec?.phone) cmds.push(['HDEL', 'pt:phone', rec.phone]);
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
    { const ph = pairs(await one(['HGETALL', 'pt:phone'])); const dp = Object.keys(ph).filter((k) => dropAuth.includes(ph[k])); if (dp.length) cmds.push(['HDEL', 'pt:phone', ...dp]); }
    cmds.push(['INCR', 'pt:rev']);
    await redis(cmds);
    return { ok: true, drivers };
  },

  // „Забравена парола“: стига до админа като въпрос; админът сменя паролата и се обажда на шофьора
  async forgot({ email, login }) {
    const raw = String(login ?? email ?? '').trim();
    const byPhone = !raw.includes('@');
    if (byPhone ? !/^0\d{9}$/.test(phoneKey(raw)) : !/^\S+@\S+\.\S+$/.test(norm(raw))) return { error: byPhone ? 'Въведи имейл или мобилен телефон' : 'Невалиден имейл' };
    const id = await idByLogin(raw);
    const ver = verifyCfg(parse(await one(['HGET', 'pt:db', 'settings'])) || {});
    // по телефон: код по SMS, с него – нова парола
    if (byPhone && MSG.smsReady() && ver.smsOn !== false) {
      if (id) { const r = await sendCodeTo(phoneKey(raw), ver, 'reset'); if (r.error) return r; if (r.demoCode) { await sleep(200); return { ok: true, mode: 'sms', demoCode: r.demoCode }; } }
      await sleep(300); return { ok: true, mode: 'sms' };
    }
    if (!byPhone && ver.email) {
      // линк за нова парола по имейла (не казваме дали има такъв акаунт)
      if (id) { const u = parse(await one(['HGET', 'pt:db', `users:${id}`])); if (u && u.role === 'driver' && u.email && await limit(`reset:${id}`, 3, 3600)) { const t = await newMailToken(id, 'reset'); const m = MSG.resetMail(u.name, `${hostOf(arguments[0])}/app#/reset/${t}`); try { await MSG.sendMail({ to: u.email, name: u.name, ...m }); } catch (er) { console.error('mail', er); } } }
      await sleep(300); return { ok: true, mode: 'mail' };
    }
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
    return { ok: true, mode: 'admin' }; // не казваме дали има такъв акаунт
  },

  // ---------- Потвърждения: код по SMS, имейл, нова парола ----------
  async verifyCfg() { const v = verifyCfg(parse(await one(['HGET', 'pt:db', 'settings'])) || {}); return { sms: v.sms, email: v.email }; },
  async sendCode({ phone }) {
    const ph = phoneKey(phone);
    if (!/^0[89]\d{8}$/.test(ph)) return { error: 'Невалиден мобилен номер' };
    const st = parse(await one(['HGET', 'pt:db', 'settings'])) || {}; const v = verifyCfg(st);
    if (!v.sms) return { error: 'Кодът по SMS не е включен' };
    // при регистрация номерът трябва да е свободен
    if (await idByLogin(ph)) return { error: 'Има акаунт с този телефон. Влез в него или натисни „Забравена парола“.' };
    return sendCodeTo(ph, v, 'reg');
  },
  // нова парола с кода от SMS
  async resetPwSms({ phone, code, password }) {
    if (String(password || '').length < 6) return { error: 'Паролата трябва да е поне 6 символа' };
    const ph = phoneKey(phone);
    const ok = await checkCode(ph, code, 'reset'); if (ok.error) return ok;
    const id = await idByLogin(ph); const u = id && parse(await one(['HGET', 'pt:db', `users:${id}`]));
    if (!u) return { error: 'Няма акаунт с този телефон' };
    const toks = pairs(await one(['HGETALL', 'pt:tok'])); const old = Object.entries(toks).filter(([, v]) => v?.id === id).map(([k]) => k);
    await redis([...authCmds(id, u.email, 'driver', password, ph), ...(old.length ? [['HDEL', 'pt:tok', ...old]] : [])]);
    return { ok: true };
  },
  async verifyCode({ phone, code }) {
    const ph = phoneKey(phone);
    const r = await checkCode(ph, code); if (r.error) return r;
    await one(['HSET', 'pt:smsok', ph, JSON.stringify({ at: Date.now() })]);
    return { ok: true };
  },
  async resendVerify(body, s) {
    if (!s || s.role !== 'driver') return { error: 'Влез в профила си' };
    const u = parse(await one(['HGET', 'pt:db', `users:${s.id}`])); if (!u) return { error: 'Няма акаунт' };
    if (u.emailVerified !== false) return { ok: true, already: true };
    if (!(await limit(`verify:${s.id}`, 3, 3600))) return { error: 'Пратихме ти вече няколко писма. Провери и в „Спам“ или опитай след час.' };
    await mailVerify(u, hostOf(body)); return { ok: true };
  },
  async resetPw({ token, password }) {
    if (String(password || '').length < 6) return { error: 'Паролата трябва да е поне 6 символа' };
    const t = parse(await one(['HGET', 'pt:mailtok', String(token || '')]));
    if (!t || t.kind !== 'reset' || Date.now() - t.at > 36e5) return { error: 'Линкът е изтекъл. Поискай нов от „Забравена парола“.' };
    const u = parse(await one(['HGET', 'pt:db', `users:${t.id}`])); if (!u) return { error: 'Няма такъв акаунт' };
    const toks = pairs(await one(['HGETALL', 'pt:tok'])); const old = Object.entries(toks).filter(([, v]) => v?.id === t.id).map(([k]) => k); // изход от всички устройства
    await redis([...authCmds(t.id, u.email, 'driver', password, u.phone), ['HDEL', 'pt:mailtok', String(token)], ...(old.length ? [['HDEL', 'pt:tok', ...old]] : []),
      ...(u.emailVerified === false ? [['HSET', 'pt:db', `users:${t.id}`, JSON.stringify({ ...u, emailVerified: true, emailVerifiedAt: new Date().toISOString() })], ['INCR', 'pt:rev']] : [])]);
    return { ok: true };
  },
  // за админа: дали ключовете са сложени, колко SMS днес, пробно изпращане
  async verifyStatus(_, s) {
    if (s.role !== 'admin') return { error: 'Само за админ' };
    return { key: MSG.hasKey() || MSG.mockMode(), mail: MSG.mailReady(), sms: MSG.smsReady(), mock: MSG.mockMode(), from: MSG.mailFrom(), smsToday: Number(await one(['GET', `pt:smscount:${todayStr()}`]) || 0) };
  },
  async verifyTest({ email, phone }, s) {
    if (s.role !== 'admin') return { error: 'Само за админ' };
    try {
      if (email) await MSG.sendMail({ to: email, ...MSG.testMail() });
      if (phone) await MSG.sendSms({ to: phone, text: 'Чисто: SMS-ите работят.' });
      return { ok: true };
    } catch (e) { return { error: String(e.message || e).slice(0, 200) }; }
  },
  async devOutbox() { if (!MSG.mockMode()) return { error: 'no' }; return { list: MSG.outbox.slice(-20) }; },

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
    const n = await notifyAdmins('test', { title: 'Чисто', body: 'Известията работят ✅', url: '/admin#/overview', tag: 'test' }, s.id);
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

  // ---------- снимка на талона → марка, модел, година, номер (AI със зрение през Groq) ----------
  // Снимката не се пази. Без ключ или при грешка → { fallback: true } и телефонът чете талона сам (Tesseract).
  async talon({ img, mock }, s) {
    if (!img || typeof img !== 'string' || !img.startsWith('data:image/')) return { error: 'Няма снимка' };
    if (img.length > 4_000_000) return { error: 'Снимката е твърде голяма' };
    if (!(await quota(s.id, 'talon', 15))) return { fallback: true };
    if (groqMock()) return mock || { fallback: true };
    if (!GROQ) return { fallback: true };
    try { return await groqTalon(img); }
    catch (e) { console.error('talon', e); return { fallback: true }; }
  },

  // ---------- логата на фирмите (само админ): търсене в App Store и теглене на иконата ----------
  async logoSearch({ term }, s) {
    if (s.role !== 'admin') return { error: 'Само за админ' };
    const q = String(term || '').trim().slice(0, 80); if (q.length < 2) return { results: [] };
    if (MEMORY && !process.env.LOGO_LIVE) return { results: [{ id: 'mock1', name: q + ' Taxi', seller: q + ' EOOD', icon: 'mock' }] };
    try {
      const r = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&country=bg&entity=software&limit=10`);
      const j = await r.json();
      return { results: (j.results || []).map((x) => ({ id: String(x.trackId), name: x.trackName, seller: x.sellerName || x.artistName || '', icon: x.artworkUrl512 || x.artworkUrl100 })).filter((x) => x.icon) };
    } catch (e) { console.error('logoSearch', e); return { error: 'App Store не отговаря. Опитай пак.' }; }
  },
  async logoFetch({ url }, s) {
    if (s.role !== 'admin') return { error: 'Само за админ' };
    if (url === 'mock') return { img: 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#FFC21A"/></svg>').toString('base64') };
    let u; try { u = new URL(String(url)); } catch { return { error: 'Невалиден адрес' }; }
    if (u.protocol !== 'https:') return { error: 'Само https' };
    const src = u.href.replace(/\/\d+x\d+bb\.(jpg|png|webp)$/, '/192x192bb.png'); // иконите от App Store – по-малки, но остри
    try {
      const r = await fetch(src); const type = r.headers.get('content-type') || '';
      if (!r.ok || !type.startsWith('image/')) return { error: 'Не е картинка' };
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 300000) return { error: 'Картинката е твърде голяма' };
      return { img: `data:${type.split(';')[0]};base64,${buf.toString('base64')}` };
    } catch (e) { console.error('logoFetch', e); return { error: 'Не успях да изтегля картинката' }; }
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
      challenge, rp: { name: 'Чисто', id: rpId },
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

  // Присъединяване към обща кола с кода от линка
  async joinCar({ invite }, s) {
    if (!s || s.role !== 'driver') return { error: 'Влез в профила си' };
    const code = String(invite || '').trim().toUpperCase(); if (!code) return { error: 'Няма код' };
    const all = await allFields();
    const entry = Object.entries(all).find(([f, v]) => fieldColl(f) === 'cars' && v?.invite === code);
    if (!entry) return { error: 'Няма кола с този код. Поискай нов линк от собственика.' };
    const [f, car] = entry; const u = all[`users:${s.id}`];
    if (car.ownerId === s.id && car.type === 'rent') return { error: 'Това е твоята кола.' };
    const ms = car.members || [];
    if (!ms.some((m) => m.userId === s.id)) {
      ms.push({ userId: s.id, name: u?.name || '', share: 0, joinedAt: new Date().toISOString().slice(0, 10) });
      if (car.type === 'own') { const n = ms.length, each = Math.floor((100 / n) * 100) / 100; ms.forEach((m) => { m.share = each; }); ms[0].share = Math.round((100 - each * (n - 1)) * 100) / 100; }
      car.members = ms;
      await redis([['HSET', 'pt:db', f, JSON.stringify(car)], ['INCR', 'pt:rev']]);
    }
    return { ok: true, carId: car.id };
  },
  async leaveCar({ carId }, s) {
    if (!s || s.role !== 'driver') return { error: 'Влез в профила си' };
    const f = `cars:${carId}`; const car = parse(await one(['HGET', 'pt:db', f]));
    if (!car) return { ok: true };
    car.members = (car.members || []).filter((m) => m.userId !== s.id);
    if (car.type === 'own' && car.members.length) { const n = car.members.length, each = Math.floor((100 / n) * 100) / 100; car.members.forEach((m) => { m.share = each; }); car.members[0].share = Math.round((100 - each * (n - 1)) * 100) / 100; }
    await redis([['HSET', 'pt:db', f, JSON.stringify(car)], ['INCR', 'pt:rev']]);
    return { ok: true };
  },

  async logout({ token }) { if (token) await one(['HDEL', 'pt:tok', token]); return { ok: true }; },
};
const NEEDS_LOGIN = new Set(['resendVerify', 'verifyStatus', 'verifyTest', 'joinCar', 'leaveCar', 'pull', 'push', 'passwd', 'deleteMe', 'wipeAll', 'pushSub', 'pushUnsub', 'pushTest', 'drvPushSub', 'drvPushUnsub', 'cronRun', 'voice', 'ask', 'talon', 'logoSearch', 'logoFetch', 'pkStatus', 'pkRegOptions', 'pkRegister', 'pkRemove']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// SMS код: регистрация (ключ = телефона) или нова парола (отделен ключ), с лимитите от админа
const smsKey = (ph, purpose) => (purpose === 'reset' ? ph + ':r' : ph);
async function sendCodeTo(ph, v, purpose = 'reg') {
  const key = smsKey(ph, purpose);
  const rec = parse(await one(['HGET', 'pt:sms', key])) || { sent: [] };
  const now = Date.now(); const sent = (rec.sent || []).filter((t) => now - t < 864e5);
  if (sent.length && now - sent[sent.length - 1] < 60e3) { const w = Math.ceil((60e3 - (now - sent[sent.length - 1])) / 1000); return { error: `Изчакай ${w} секунди и опитай пак`, wait: w }; }
  if (sent.filter((t) => now - t < 36e5).length >= v.perHour) return { error: 'Много опити за този номер. Опитай пак след час.' };
  if (sent.length >= v.perDay) return { error: 'Много опити за този номер днес. Опитай утре или ни пиши.' };
  const day = todayStr(); const n = Number(await one(['INCR', `pt:smscount:${day}`])); await one(['EXPIRE', `pt:smscount:${day}`, 3 * 864e2]);
  if (n > v.cap) {
    if (n === v.cap + 1) await notifyAdmins('ticket', { title: 'Дневният таван за SMS е достигнат', body: `${v.cap} SMS днес. Вдигни тавана от Настройки → Потвърждения, ако трябва.`, url: '/admin#/settings?t=verify', tag: 'smscap-' + day });
    return { error: 'В момента не можем да пратим SMS. Опитай след малко или ни пиши.' };
  }
  const code = String(crypto.randomInt(1000, 10000));
  await one(['HSET', 'pt:sms', key, JSON.stringify({ h: hashPw(code, 'sms:' + ph), at: now, tries: 0, sent: [...sent, now] })]);
  try { await MSG.sendSms({ to: ph, text: purpose === 'reset' ? `Чисто: код за нова парола ${code}. Валиден 10 минути.` : MSG.smsText(code) }); }
  catch (e) { console.error('sms', e); return { error: 'SMS-ът не можа да се изпрати. Провери номера или опитай пак.' }; }
  return { ok: true, ...(MSG.mockMode() ? { demoCode: code } : {}) };
}
async function checkCode(ph, code, purpose = 'reg') {
  const key = smsKey(ph, purpose);
  const rec = parse(await one(['HGET', 'pt:sms', key]));
  if (!rec || !rec.h || Date.now() - rec.at > 10 * 60e3) return { error: 'Кодът е изтекъл. Изпрати нов.' };
  if ((rec.tries || 0) >= 5) return { error: 'Много грешни опити. Изпрати нов код.' };
  if (!safeEq(hashPw(String(code || '').trim(), 'sms:' + ph), rec.h)) { rec.tries = (rec.tries || 0) + 1; await one(['HSET', 'pt:sms', key, JSON.stringify(rec)]); await sleep(300); return { error: 'Грешен код' }; }
  await one(['HSET', 'pt:sms', key, JSON.stringify({ sent: rec.sent || [] })]);
  return { ok: true };
}
// Потвърждения: включени ли са (от админа) и има ли ключ (във Vercel)
function verifyCfg(st) {
  const v = st?.verify || {};
  return { sms: !!v.sms && MSG.smsReady(), email: !!v.email && MSG.mailReady(), cap: Number(v.smsCap) || 200, perHour: Number(v.perHour) || 3, perDay: Number(v.perDay) || 5 };
}
const hostOf = (body) => { const h0 = String(body?.__host || 'localhost').split(',')[0].trim(); return (MEMORY ? 'http://' : 'https://') + h0; };
async function limit(key, max, secs) { const k = `pt:lim:${key}`; const n = Number(await one(['INCR', k])); if (n === 1) await one(['EXPIRE', k, secs]); return n <= max; }
async function newMailToken(id, kind) { const t = crypto.randomBytes(24).toString('hex'); await one(['HSET', 'pt:mailtok', t, JSON.stringify({ id, kind, at: Date.now() })]); return t; }
async function mailVerify(u, host) { const t = await newMailToken(u.id, 'verify'); const m = MSG.verifyMail(u.name, `${host}/api/db?verify=${t}`); await MSG.sendMail({ to: u.email, name: u.name, ...m }); }
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
    const msgs = slot === 'am' ? fleetMsgs(all, id, d.profile || {}, today, now) : [];
    if (d.profile?.accountType === 'fleet') { pushAll(list, msgs); continue; } // собственик на автопарк – не кара, без напомняния за смени
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
    pushAll(list, msgs);
  }
  function pushAll(list, msgs) {
    for (const [k, r] of list) for (const m of msgs) {
      if (m.kind !== 'fleet' && !(r.types || DRV_TYPES).includes(m.kind)) continue;
      const { kind, ...data } = m;
      jobs.push(sendPush(r.sub, { ...data, icon: '/icons/icon-192.png' }).then((st) => { if (st === 404 || st === 410) dead.push(k); else if (st >= 200 && st < 300) sent++; }).catch(() => {}));
    }
  }
  await Promise.race([Promise.allSettled(jobs), sleep(8000)]);
  if (dead.length) await one(['HDEL', 'pt:push', ...new Set(dead)]);
  return { ok: true, sent, users: byUser.size };
}
// Автопарк (сутрин): срокове 14, 7 и 3 дни преди изтичане (или колкото е избрал собственикът), просрочен наем, коли, които стоят, седмичен отчет в избрания ден
function fleetMsgs(all, id, profile, today, now) {
  const cars = Object.entries(all).filter(([f, v]) => fieldColl(f) === 'cars' && v?.ownerId === id).map(([, v]) => v);
  if (!cars.length) return [];
  const vals = Object.values(all);
  const out = [];
  const nm = (c) => c.name || c.plate || 'Колата';
  const report = [];
  for (const car of cars) {
    const costs = vals.filter((v) => v && v.carId === car.id && v.amount != null && v.period);
    const logs = vals.filter((v) => v && v.carId === car.id && v.kind && v.by);
    const ms = (car.members || []).filter((m) => m.userId !== car.ownerId);
    for (const x of deadlines(car, costs, today)) if ([...dlDays(profile), 0].includes(x.left)) out.push({ kind: 'fleet', title: `${nm(car)}: ${x.title}`, body: x.left === 0 ? `Изтича днес (${fmtDay(x.date)}).` : `Изтича след ${x.left} дни – ${fmtDay(x.date)}.${x.amount ? ` Сума ${eur(x.amount)}.` : ''}`, url: `/app#/cars/${car.id}`, tag: `dl-${x.key}-${x.date}-${x.left}` });
    for (const m of ms) {
      const r = rentState(m, logs, today);
      if (r.late && [1, 3, 7, 14].includes(r.lateDays)) out.push({ kind: 'fleet', title: `${(all[`users:${m.userId}`]?.name || m.name || 'Шофьор').split(' ')[0]} не е платил наема`, body: `${nm(car)}: дължи ${eur(r.debt)}, просрочено ${r.lateDays} ${r.lateDays === 1 ? 'ден' : 'дни'}.`, url: '/app#/home', tag: `late-${car.id}-${m.userId}-${today}` });
    }
    const shifts = vals.filter((v) => v && v.start && v.userId && ms.some((m) => m.userId === v.userId) && (!v.carId || v.carId === car.id));
    const last = shifts.filter((x) => x.end).map((x) => x.end).sort().pop() || null;
    const idle = idleDays(last, today);
    if (car.status !== 'service' && car.status !== 'free' && ms.length && [2, 3, 5].includes(idle)) out.push({ kind: 'fleet', title: `${nm(car)} стои ${idle} дни`, body: 'Няма смяна от няколко дни. Може да я дадеш на друг шофьор.', url: `/app#/cars/${car.id}`, tag: `idle-${car.id}-${today}` });
    const wk = shifts.filter((x) => x.end && shiftDate(x) >= addDays(today, -7) && shiftDate(x) < today);
    report.push(`${nm(car)} ${Math.round(wk.reduce((a, x) => a + Math.max(0, (x.kmEnd || 0) - (x.kmStart || 0)), 0))} км, ${new Set(wk.map(shiftDate)).size} дни`);
  }
  if (now.getDay() === (profile.reportDay ?? 1)) out.push({ kind: 'fleet', title: 'Седмичен отчет за колите', body: report.join(' · '), url: '/app#/home', tag: `fleetweek-${today}` });
  return out.slice(0, 6);
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
const ASK_SYSTEM = `Ти си помощникът в приложението „Чисто“. Отговаряй САМО на български, кратко (до 4 изречения), ясно и приятелски, като на шофьор. Отговаряй само за приложението по описанието по-долу и не измисляй функции, които ги няма. Посочвай къде точно се натиска със стрелки, например „Пари → Статистика“. Ако въпросът е за неговите числа (колко е изкарал, колко гориво е платил), кажи му да напише въпроса в търсачката, например „колко изкарах тази седмица“, или да отвори Пари → Статистика. Ако не знаеш или въпросът не е за приложението, кажи го честно и предложи Профил → Помощ → Пиши ни.

ОПИСАНИЕ НА ПРИЛОЖЕНИЕТО:
${GUIDE}`;
async function groqChat(messages) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${GROQ}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, temperature: 0.2, max_tokens: 350 }) });
  if (!r.ok) throw new Error('groq ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return String((await r.json()).choices?.[0]?.message?.content || '').trim();
}

const TALON_PROMPT = `Това е снимка на българско свидетелство за регистрация на МПС (талон), част I. Полетата са с етикети в скоби:
(A) регистрационен номер; (D.1) марка (модел) – на два реда, на кирилица и на латиница, напр. „МЕРЦЕДЕС Е 220 Д“ / „MERCEDES E 220 D“; (B) дата на първа регистрация. (D.3) и (O.1) НЕ ни трябват.
Върни САМО JSON без друг текст:
{"make": "марката от D.1, латинския ред, напр. MERCEDES", "model": "остатъкът от D.1 след марката, латинския ред, напр. E 220 D", "year": годината от (B) като число, "plate": "номерът от (A), напр. PB8092PE"}
Ако поле не се чете, сложи null. Не измисляй.`;
async function groqTalon(img) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${GROQ}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct', temperature: 0, max_tokens: 200, response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: [{ type: 'text', text: TALON_PROMPT }, { type: 'image_url', image_url: { url: img } }] }] }) });
  if (!r.ok) throw new Error('groq ' + r.status + ' ' + (await r.text()).slice(0, 200));
  const txt = String((await r.json()).choices?.[0]?.message?.content || '');
  let j; try { j = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1)); } catch { return { fallback: true }; }
  const str = (v) => (typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'null' ? v.trim().slice(0, 40) : null);
  const year = Number(j.year); const now = new Date().getFullYear();
  const out = { make: str(j.make), model: str(j.model), year: year >= 1950 && year <= now + 1 ? year : null, plate: str(j.plate), fuel: str(j.fuel) };
  return out.make || out.model || out.year || out.plate ? out : { fallback: true };
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
    const vt = new URL(req.url || '/', 'http://x').searchParams.get('verify');
    if (vt) {
      // линкът от писмото „Потвърди имейла“
      let ok = false;
      try {
        const t = parse(await one(['HGET', 'pt:mailtok', vt]));
        if (t && t.kind === 'verify' && Date.now() - t.at < 7 * 864e5) {
          const u = parse(await one(['HGET', 'pt:db', `users:${t.id}`]));
          if (u) { await redis([['HSET', 'pt:db', `users:${t.id}`, JSON.stringify({ ...u, emailVerified: true, emailVerifiedAt: new Date().toISOString() })], ['HDEL', 'pt:mailtok', vt], ['INCR', 'pt:rev']]); ok = true; }
        }
      } catch (e) { console.error('verify', e); }
      res.statusCode = 302; res.setHeader('Location', `/app#/verified?ok=${ok ? 1 : 0}`); res.end(); return;
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

