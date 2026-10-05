// „Аз“: профилът и всички настройки, групирани с ясни бутони.
// Нищо не е махнато – подробните страници се отварят оттук.

import { h, icon, cx } from '../util.js';
import * as store from '../store.js';
import { themeToggle } from '../ui.js';
import { profileCover } from './profile.js';
import { openCategories } from './categories.js';
import { upcomingReservations } from './reservations.js';
import { upcomingReminders } from '../calc.js';

export function meView({ go, user, data }) {
  const ref = store.myReferrals();
  const resN = upcomingReservations(data.reservations || []).length;
  const payN = upcomingReminders(data, 14).filter((r) => r.daysLeft != null).length;
  const row = (ic, title, sub, onclick, href) => h(href ? 'a' : 'button', { class: 'big-link', href, onclick },
    h('span', { class: 'bl-ic' }, icon(ic, 22)), h('span', { class: 'grow' }, h('b', null, title), sub && h('span', null, sub)), icon('right', 18));
  const group = (title, ...rows) => h('section', { class: 'me-group' }, h('h2', { class: 'section-title' }, title), h('div', { class: 'big-links' }, ...rows));
  return h('div', { class: 'screen', 'data-page': 'me' },
    profileCover(user, data.profile),
    group('Колата и парите',
      row('car', 'Кола, гориво, ефир и цел', 'Наем или лизинг, вид гориво, цел за месеца', null, '#/profile'),
      row('wallet', 'Постоянни разходи и падежи', payN ? `${payN} плащания в следващите 2 седмици` : 'Наем, ефир, застраховки, данъци', null, '#/costs'),
      row('tag', 'Категории разходи', 'Добави свои, скрий ненужните', () => openCategories())),
    group('Курсове',
      row('calendar', 'Календар', 'Курсове, плащания и смени по дни', null, '#/calendar'),
      row('route', 'Лични резервации', resN ? `${resN} предстоящи` : 'Запиши курс с клиент', null, '#/reservations')),
    group('Още',
      ref && row('gift', 'Покани колеги', `${ref.count} поканени · 5 = 1 месец безплатно`, null, '#/invite'),
      row('bell', 'Известия и имейли', 'Напомняния за плащания и курсове', null, '#/profile?s=notify'),
      row('sparkle', 'Помощ: кратка разходка', 'Къде какво има', () => { try { sessionStorage.setItem('profitaxi.tourNow', '1'); } catch { /* */ } go('/home'); }),
      h('div', { class: 'big-link as-row' }, h('span', { class: 'bl-ic' }, icon('moon', 22)), h('span', { class: 'grow' }, h('b', null, 'Светла / тъмна тема'), h('span', null, 'Натисни бутона вдясно')), themeToggle())),
    h('p', { class: 'faint small', style: { textAlign: 'center', marginTop: '18px' } }, 'Парола, изход и изтриване на акаунта са в „Кола, гориво, ефир и цел“, най-долу.'));
}
