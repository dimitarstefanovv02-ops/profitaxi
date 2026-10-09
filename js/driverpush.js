// Известия на телефона на шофьора: напомняне за смяната (10:00 и 20:00) и седмичен отчет (понеделник).
// Работи само на живия сайт; на iPhone – само в приложението от началния екран.
import * as store from './store.js';
import { VAPID_PUBLIC } from './config.js';

const KEY = 'profitaxi.dpush';
export const PUSH_TYPES = { remind: 'Напомняне за смяната', weekly: 'Седмичен отчет', msg: 'Съобщения от нас' };
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const b64ToBytes = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };

export function pushTypes() {
  try {
    const t = JSON.parse(localStorage.getItem(KEY) || '[]');
    // включилите известията преди „Съобщения“ ги получават – показваме го като включено
    return t.length && !localStorage.getItem(KEY + '.v2') && !t.includes('msg') ? [...t, 'msg'] : t;
  } catch { return []; }
}
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
// Защо не може точно сега (или null, ако може)
export function pushBlocker() {
  if (!store.live()) return 'Известията работят само на живия сайт.';
  if (isIOS() && !standalone()) return 'На iPhone известията идват само в приложението от началния екран: Safari → „Сподели“ → „Добави към началния екран“.';
  if (!pushSupported()) return 'Този телефон или браузър не поддържа известия.';
  if (Notification.permission === 'denied') return 'Известията са забранени за ProfiTaxi. Разреши ги от настройките на телефона.';
  return null;
}
// Задава кои известия да идват; празен списък ги спира
export async function setPushTypes(types) {
  if (!types.length) { await disable(); return { ok: true }; }
  const why = pushBlocker(); if (why) return { error: why };
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { error: 'Известията не са разрешени.' };
  const reg = await navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready);
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC) });
  const r = await store.driverCall('drvPushSub', { sub: sub.toJSON(), types, v: 2 });
  if (r.error) return r;
  try { localStorage.setItem(KEY, JSON.stringify(types)); localStorage.setItem(KEY + '.v2', '1'); } catch { /* */ }
  return r;
}
async function disable() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.('/');
    const sub = await reg?.pushManager?.getSubscription();
    if (sub) await store.driverCall('drvPushUnsub', { endpoint: sub.endpoint });
  } catch { /* */ }
  try { localStorage.setItem(KEY, '[]'); } catch { /* */ }
}
