// „Профил“: профилът и всички настройки, групирани с ясни бутони.
// Нищо не е махнато – подробните страници се отварят оттук.

import { h, icon, cx } from '../util.js';
import { zone, setArranging } from '../arrange.js';
import { toast } from '../ui.js';
// „Подреди екраните“: режимът важи за всички страници, докато не натиснеш „Готово“
function startArrange() { setArranging(true); toast('Задръж карта или бутон и го влачи. Мини през страниците от менюто долу.'); }
import * as store from '../store.js';
import { profileCover } from './profile.js';
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
  const row = (k, ic, title, sub, onclick, href) => [k, h(href ? 'a' : 'button', { class: 'big-link', href, onclick },
    h('span', { class: 'bl-ic' }, icon(ic, 22)), h('span', { class: 'grow' }, h('b', null, title), sub && h('span', null, sub)), icon('right', 18))];
  const group = (k, title, ...rows) => [k, h('section', { class: 'me-group' }, h('h2', { class: 'section-title' }, title), zone('drv.me.' + k, { class: 'big-links' }, rows.filter(Boolean)))];
  return h('div', { class: 'screen', 'data-page': 'me' },
    profileCover(user, data.profile),
    h('a', { class: 'search-link', href: '#/search' }, icon('search', 20), h('span', null, 'Търси: „как да…“ или „колко изкарах…“'), icon('mic', 20)),
    zone('drv.me', { class: 'dz' }, [
    group('acc', 'Акаунт',
      row('profile', 'user', 'Лични данни', 'Име, телефон, снимки, известия, изглед, парола, изход', null, '#/profile')),
    group('car', 'Колата',
      data.profile.carType !== 'rent' && row('vehicle', 'tool', 'Колата ми', carSub(data), null, '#/vehicle'),
      row('carset', 'car', 'Настройки на колата', 'Своя или под наем, гориво, ефир, данни за колата', null, '#/car')),
    group('help', 'Помощ',
      row('guide', 'doc', 'Презентация', 'Как работи приложението – за преглед и теглене', null, '#/guide'),
      row('tour', 'sparkle', 'Кратка разходка', '5 стъпки за 1 минута', () => { try { sessionStorage.setItem('profitaxi.tourNow', '1'); } catch { /* */ } go('/home'); }),
      row('write', 'inbox', 'Пиши ни', store.myUnreadTickets() > 0 ? 'Имаш нов отговор' : 'Въпрос или проблем – отговаряме тук', null, '#/help')),
    group('more', 'Още',
      row('arrange', 'grid', 'Подреди екраните', 'Мести и скривай картите и бутоните, както ти е удобно', () => startArrange()),
      row('ideas', 'sparkle', 'Предложи функция', 'Напиши идея или гласувай за чужда', null, '#/ideas')),
    ]));
}
