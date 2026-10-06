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

const tokKey = (scope) => `profitaxi.tok.${scope}`;
export const getToken = (scope) => { try { return localStorage.getItem(tokKey(scope)); } catch { return null; } };
export const setToken = (scope, t) => { try { if (t) localStorage.setItem(tokKey(scope), t); else localStorage.removeItem(tokKey(scope)); } catch { /* */ } };

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
