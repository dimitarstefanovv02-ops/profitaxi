import { appBase } from './brand.js';
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
      if (reg) await reg.showNotification(title, { body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: r.id, data: { url: appBase() + '#/costs' } });
      else new Notification(title, { body, icon: '/icons/icon-192.png', tag: r.id });
      sent.add(key);
    } catch { /* браузърът отказа */ }
  }
  // Резервации: в деня и вечерта преди
  for (const r of (data.reservations || []).filter((x) => !x.done && (x.date === today || x.date === addDays(today, 1)))) {
    const key = `res:${r.id}:${today}`;
    if (sent.has(key)) continue;
    const title = `${r.date === today ? 'Днес' : 'Утре'} в ${r.time}: ${r.client}`;
    try {
      const reg = await navigator.serviceWorker?.getRegistration?.();
      const opts = { body: `${r.from} → ${r.to}`, icon: '/icons/icon-192.png', tag: 'res' + r.id, data: { url: appBase() + '#/reservations' } };
      if (reg) await reg.showNotification(title, opts); else new Notification(title, opts);
      sent.add(key);
    } catch { /* */ }
  }
  saveSent(sent);
}

// При отваряне на приложението: показва пропуснатите и близките плащания и днешните/утрешните
// резервации – веднъж на ден. Така нищо не се изпуска, дори известията да са спрени.
import { h, icon, cx, fmtDate, todayStr as today2, addDays } from './util.js';
import { openSheet, sheetHead, toast } from './ui.js';
import * as store from './store.js';
const DUE_KEY = 'profitaxi.dueShown';
export function showDueSheet(data, go) {
  const t = today2();
  try { if (localStorage.getItem(DUE_KEY) === t) return; } catch { /* */ }
  const due = upcomingReminders(data).filter((r) => (r.daysLeft != null && r.daysLeft <= 3) || (r.kmLeft != null && r.kmLeft <= 0));
  const res = (data.reservations || []).filter((r) => !r.done && (r.date === t || r.date === addDays(t, 1))).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  if (!due.length && !res.length) return;
  try { localStorage.setItem(DUE_KEY, t); } catch { /* */ }
  openSheet((close) => h('div', null,
    sheetHead('Не пропускай', close, 'Плащания и курсове за следващите дни'),
    due.length > 0 && h('div', { class: 'due-list' }, due.map((r) => {
      const late = (r.daysLeft ?? 0) < 0 || (r.kmLeft ?? 1) <= 0;
      const when = r.daysLeft == null ? 'по километраж' : r.daysLeft < 0 ? `просрочено с ${-r.daysLeft} ${r.daysLeft === -1 ? 'ден' : 'дни'}` : r.daysLeft === 0 ? 'днес' : r.daysLeft === 1 ? 'утре' : `след ${r.daysLeft} дни`;
      return h('div', { class: cx('due-row', late && 'late') },
        h('span', { class: 'due-ic' }, icon(late ? 'alert' : 'bell', 18)),
        h('div', { class: 'grow' }, h('b', null, r.title), h('span', null, `${when}${r.amount ? ', ' + money(r.amount, r.amount % 1 ? 2 : 0) : ''}`)),
        r.kind === 'cost' && h('button', { class: 'btn btn-ok btn-sm', onclick: (e) => { store.markCostPaid(r.ref.id); e.currentTarget.replaceWith(h('span', { class: 'chip good' }, icon('check', 14), 'Платено')); } }, 'Платено'));
    })),
    res.length > 0 && h('div', { class: 'due-list' }, res.map((r) => h('div', { class: 'due-row res' },
      h('span', { class: 'due-ic' }, icon('calendar', 18)),
      h('div', { class: 'grow' }, h('b', null, `${r.date === t ? 'Днес' : 'Утре'} в ${r.time}: ${r.client}`), h('span', null, `${r.from} → ${r.to}`))))),
    h('div', { class: 'row gap', style: { marginTop: '14px' } },
      h('button', { class: 'btn btn-ghost btn-lg grow', onclick: close }, 'Разбрах'),
      due.length > 0 && h('button', { class: 'btn btn-primary btn-lg grow', onclick: () => { close(); go('/costs'); } }, 'Към разходите'))));
}
export { fmtDate, toast };
