// „Профил“: профилът и всички настройки, групирани с ясни бутони.
// Нищо не е махнато – подробните страници се отварят оттук.

import { h, icon, cx } from '../util.js';
import * as store from '../store.js';
import { themeToggle } from '../ui.js';
import { profileCover } from './profile.js';
import { openCategories } from './categories.js';
import { upcomingReminders } from '../calc.js';

export function meView({ go, user, data }) {
  const ref = store.referralsOn() && store.myReferrals();
  const payN = upcomingReminders(data, 14).filter((r) => r.daysLeft != null).length;
  const row = (ic, title, sub, onclick, href) => h(href ? 'a' : 'button', { class: 'big-link', href, onclick },
    h('span', { class: 'bl-ic' }, icon(ic, 22)), h('span', { class: 'grow' }, h('b', null, title), sub && h('span', null, sub)), icon('right', 18));
  const group = (title, ...rows) => h('section', { class: 'me-group' }, h('h2', { class: 'section-title' }, title), h('div', { class: 'big-links' }, ...rows));
  return h('div', { class: 'screen', 'data-page': 'me' },
    profileCover(user, data.profile),
    group('Акаунт',
      row('user', 'Лични данни', 'Име, телефон, снимки, парола, отчети, помощ, изход', null, '#/profile'),
      row('doc', 'Презентация', 'Как работи приложението – за преглед и теглене', null, '#/guide')),
    group('Колата и разходите',
      row('car', 'Колата и ефирът', 'Своя, наем или лизинг, гориво, ефир, цел за месеца', null, '#/car'),
      row('wallet', 'Постоянни разходи и падежи', payN ? `${payN} плащания в следващите 2 седмици` : 'Наем, ефир, застраховки, данъци', null, '#/costs'),
      row('tag', 'Категории разходи', 'Добави свои, скрий ненужните', () => openCategories())),
    group('Още',
      ref && row('gift', 'Покани колеги', `Месец безплатно за всеки колега, който плати · ${ref.paid} досега`, null, '#/invite'),
      row('bell', 'Известия и имейли', 'Напомняния за плащания и курсове', null, '#/profile?s=notify'),
      row('sparkle', 'Предложи функция', 'Напиши идея или гласувай за чужда', null, '#/ideas'),
      h('div', { class: 'big-link as-row' }, h('span', { class: 'bl-ic' }, icon('moon', 22)), h('span', { class: 'grow' }, h('b', null, 'Светла / тъмна тема'), h('span', null, 'Натисни бутона вдясно')), themeToggle())));
}
