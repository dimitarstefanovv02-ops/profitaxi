// Как данните се разбиват на отделни записи за общата база (ползва се и от сървъра, и от приложението).
// Всеки запис е отделно поле – така двама души, които пишат едновременно, не си презаписват данните.

export const BY_ID = ['users', 'shifts', 'costs', 'reminders', 'reservations', 'tickets', 'messages', 'payments', 'nps', 'ideas', 'churn', 'errors', 'asks'];
export const BY_KEY = { codes: 'code', promos: 'code', flags: 'key' };
export const MAPS = ['profiles', 'notes', 'dismissed', 'autoSent'];
export const SINGLE = ['settings', 'audit', 'accessLog', 'alertsSeen', 'notDup', 'reviewed'];
// Само за това устройство, не се качват: sms (демо кодове), version

const stamp = (r) => String(r.at || r.createdAt || r.date || '');

export function encode(db) {
  const f = {};
  for (const c of BY_ID) for (const r of db[c] || []) if (r && r.id) f[`${c}:${r.id}`] = r;
  for (const [c, k] of Object.entries(BY_KEY)) for (const r of db[c] || []) if (r && r[k]) f[`${c}:${r[k]}`] = r;
  for (const c of MAPS) for (const [k, v] of Object.entries(db[c] || {})) if (v != null) f[`${c}:${k}`] = v;
  for (const c of SINGLE) if (db[c] != null) f[c] = db[c];
  for (const [page, p] of Object.entries(db.usage || {})) {
    for (const [uid, n] of Object.entries(p.users || {})) f[`usage:${page}|${uid}`] = { n, last: p.userLast?.[uid] || p.last || null };
  }
  return f;
}

export function decode(f, into = {}) {
  const db = into;
  for (const c of BY_ID) db[c] = [];
  for (const c of Object.keys(BY_KEY)) db[c] = [];
  for (const c of MAPS) db[c] = {};
  db.usage = {};
  for (const [field, v] of Object.entries(f)) {
    const i = field.indexOf(':');
    const c = i < 0 ? field : field.slice(0, i), k = i < 0 ? '' : field.slice(i + 1);
    if (i < 0) { if (SINGLE.includes(c)) db[c] = v; continue; }
    if (BY_ID.includes(c) || BY_KEY[c]) db[c].push(v);
    else if (MAPS.includes(c)) db[c][k] = v;
    else if (c === 'usage') {
      const [page, uid] = k.split('|');
      const p = db.usage[page] ||= { views: 0, users: {}, userLast: {}, last: null };
      p.users[uid] = v.n; p.views += v.n || 0; p.userLast[uid] = v.last;
      if (v.last && (!p.last || v.last > p.last)) p.last = v.last;
    }
  }
  for (const c of [...BY_ID, ...Object.keys(BY_KEY)]) db[c].sort((a, b) => stamp(a).localeCompare(stamp(b)));
  db.errors.reverse(); // най-новите отгоре, както ги пише приложението
  return db;
}

export const fieldColl = (field) => { const i = field.indexOf(':'); return i < 0 ? field : field.slice(0, i); };
export const fieldKey = (field) => { const i = field.indexOf(':'); return i < 0 ? '' : field.slice(i + 1); };
