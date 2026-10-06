// „Профил“: профилът и всички настройки, групирани с ясни бутони.
// Нищо не е махнато – подробните страници се отварят оттук.

import { h, icon, cx } from '../util.js';
import { zone, setArranging } from '../arrange.js';
import { toast } from '../ui.js';
// „Подреди екраните“: режимът важи за всички страници, докато не натиснеш „Готово“
function startArrange() { setArranging(true); toast('Задръж карта или бутон и го влачи. Мини през страниците от менюто долу.'); }
import * as store from '../store.js';
import { themeToggle } from '../ui.js';
import { profileCover } from './profile.js';
import { openCategories } from './categories.js';
import { upcomingReminders } from '../calc.js';
import { carStats, carLog } from './vehicle.js';
import { money } from '../util.js';
// Подзаглавие за „Колата ми“
function carSub(data) {
  const c = carStats(data);
  if (c.inv) return c.done ? 'Изплатена! 🎉' : `Избита ${Math.round(c.pct)}% · остават ${money(c.left)}`;
  const n = carLog(data).length;
  return n ? `${n} ремонта · колко си избил от колата` : 'Ремонти, разходи по колата и колко си избил от нея';
}

export function meView({ go, user, data }) {
  const ref = store.referralsOn() && store.myReferrals();
  const payN = upcomingReminders(data, 14).filter((r) => r.daysLeft != null).length;
  const row = (k, ic, title, sub, onclick, href) => [k, h(href ? 'a' : 'button', { class: 'big-link', href, onclick },
    h('span', { class: 'bl-ic' }, icon(ic, 22)), h('span', { class: 'grow' }, h('b', null, title), sub && h('span', null, sub)), icon('right', 18))];
  const group = (k, title, ...rows) => [k, h('section', { class: 'me-group' }, h('h2', { class: 'section-title' }, title), zone('drv.me.' + k, { class: 'big-links' }, rows.filter(Boolean)))];
  return h('div', { class: 'screen', 'data-page': 'me' },
    profileCover(user, data.profile),
    zone('drv.me', { class: 'dz' }, [
    group('acc', 'Акаунт',
      row('profile', 'user', 'Лични данни', 'Име, телефон, снимки, парола, отчети, помощ, изход', null, '#/profile'),
      row('guide', 'doc', 'Презентация', 'Как работи приложението – за преглед и теглене', null, '#/guide')),
    group('car', 'Колата и разходите',
      data.profile.carType !== 'rent' && row('vehicle', 'tool', 'Колата ми', carSub(data), null, '#/vehicle'),
      row('carset', 'car', 'Колата и ефирът', 'Своя или под наем, гориво, ефир, цел за месеца', null, '#/car'),
      row('costs', 'wallet', 'Постоянни разходи и падежи', payN ? `${payN} плащания в следващите 2 седмици` : 'Наем, ефир, застраховки, данъци', null, '#/costs'),
      row('cats', 'tag', 'Категории разходи', 'Добави свои, скрий ненужните', () => openCategories())),
    group('more', 'Още',
      ref && row('invite', 'gift', 'Покани колеги', `Месец безплатно за всеки колега, който плати · ${ref.paid} досега`, null, '#/invite'),
      row('notify', 'bell', 'Известия и имейли', 'Напомняния за плащания и курсове', null, '#/profile?s=notify'),
      row('arrange', 'grid', 'Подреди екраните', 'Мести и скривай картите и бутоните, както ти е удобно', () => startArrange()),
      row('ideas', 'sparkle', 'Предложи функция', 'Напиши идея или гласувай за чужда', null, '#/ideas'),
      ['theme', h('div', { class: 'big-link as-row' }, h('span', { class: 'bl-ic' }, icon('moon', 22)), h('span', { class: 'grow' }, h('b', null, 'Светла / тъмна тема'), h('span', null, 'Натисни бутона вдясно')), themeToggle())]),
    ]));
}
