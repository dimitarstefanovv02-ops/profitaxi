// Връзка с общата база данни (/api/db). Ползва се само от store.js.

import { LIVE_DEFAULT } from './config.js';

// Режим „на живо“: на сайта – според config.js; за тестове може да се включи/изключи с localStorage profitaxi.live = 1/0
export const LIVE = (() => {
  try {
    const f = localStorage.getItem('profitaxi.live');
    if (f === '1') return true;
    if (f === '0') return false;
  } catch { /* */ }
  return LIVE_DEFAULT && !/^(localhost|127\.|0\.0\.0\.0)/.test(location.hostname);
})();

// Ключът за вход е отделен за всеки акаунт: в приложението може да си влязъл като шофьор,
// а в браузъра – като собственик, без единият вход да изкарва другия.
let appUid = null;
export const setAppUid = (id) => { appUid = id || null; };
const tokKey = (scope, uid = appUid) => (scope === 'app' && uid ? `profitaxi.tok.app.${uid}` : `profitaxi.tok.${scope}`);
export const getToken = (scope, uid) => { try { return localStorage.getItem(tokKey(scope, uid)); } catch { return null; } };
export const setToken = (scope, t, uid) => { try { if (t) localStorage.setItem(tokKey(scope, uid), t); else localStorage.removeItem(tokKey(scope, uid)); } catch { /* */ } };
// Старият общ ключ (отпреди) – прехвърля се на акаунта, с който е бил влязъл
export function migrateToken(uid) {
  try { const old = localStorage.getItem('profitaxi.tok.app'); if (old && uid && !localStorage.getItem(tokKey('app', uid))) { localStorage.setItem(tokKey('app', uid), old); } if (old && uid) localStorage.removeItem('profitaxi.tok.app'); } catch { /* */ }
}

let onAuthLost = () => {};
export const setOnAuthLost = (fn) => { onAuthLost = fn; };

export async function call(op, body = {}, scope = 'app') {
  let r;
  try {
    r = await fetch('/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op, token: getToken(scope), ...body }), cache: 'no-store' });
  } catch {
    return { error: 'Няма интернет. Опитай пак, когато има връзка.', offline: true };
  }
  let j = null; try { j = await r.json(); } catch { /* */ }
  if (r.status === 401 && ['pull', 'push', 'passwd', 'deleteMe'].includes(op)) { onAuthLost(scope); return { error: j?.error || 'Влез отново', auth: true }; }
  if (!j) return { error: 'Сървърът не отговаря. Опитай след малко.', offline: r.status >= 500 };
  return j;
}
