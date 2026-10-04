// Известия за наближаващи плащания: 3, 2 и 1 ден преди падежа и в деня.
// Работи, когато приложението е отворено или инсталирано на телефона.
// (Известия при напълно затворено приложение изискват сървър – идва с истинската база.)

import { upcomingReminders } from './calc.js';
import { money, todayStr } from './util.js';

const SENT_KEY = 'profitaxi.notified';
export const notifySupported = () => 'Notification' in window;
export const notifyPermission = () => (notifySupported() ? Notification.permission : 'unsupported');

export async function requestNotify() {
  if (!notifySupported()) return 'unsupported';
  try { return await Notification.requestPermission(); } catch { return 'denied'; }
}

function sentSet() { try { return new Set(JSON.parse(localStorage.getItem(SENT_KEY)) || []); } catch { return new Set(); } }
function saveSent(s) { localStorage.setItem(SENT_KEY, JSON.stringify([...s].slice(-200))); }

export function reminderMessage(r) {
  const when = r.daysLeft === 0 ? 'днес' : r.daysLeft === 1 ? 'утре' : `след ${r.daysLeft} дни`;
  const amount = r.amount ? `, ${money(r.amount, r.amount % 1 ? 2 : 0)}` : '';
  return { title: `${r.title}: плащане ${when}`, body: `Падеж ${r.dueDate.split('-').reverse().join('.')}${amount}. Отбележи „Платено“ в Разходи.` };
}

// Проверява и показва известия за днес (всяко само веднъж)
export async function checkNotifications(data) {
  if (!data?.profile?.notify || notifyPermission() !== 'granted') return;
  const sent = sentSet();
  const today = todayStr();
  const due = upcomingReminders(data).filter((r) => r.daysLeft != null && r.daysLeft >= 0 && r.daysLeft <= 3);
  for (const r of due) {
    const key = `${r.id}:${r.dueDate}:${today}`;
    if (sent.has(key)) continue;
    const { title, body } = reminderMessage(r);
    try {
      const reg = await navigator.serviceWorker?.getRegistration?.();
      if (reg) await reg.showNotification(title, { body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: r.id, data: { url: '/#/costs' } });
      else new Notification(title, { body, icon: '/icons/icon-192.png', tag: r.id });
      sent.add(key);
    } catch { /* браузърът отказа */ }
  }
  saveSent(sent);
}
