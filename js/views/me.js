// „Профил“: профилът и всички настройки, групирани с ясни бутони.
// Нищо не е махнато – подробните страници се отварят оттук.

import { h, icon, cx } from '../util.js';
import { zone, setArranging } from '../arrange.js';
import { toast, topSearch, openSheet, sheetHead } from '../ui.js';
// „Подреди екраните“: режимът важи за всички страници, докато не натиснеш „Готово“
function startArrange() { setArranging(true); toast('Задръж карта или бутон и го влачи. Мини през страниците от менюто долу.'); }
import * as store from '../store.js';
import { profileCover, setPhoto } from './profile.js';
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
  const fleet = store.isFleet(data.profile);
  const row = (k, ic, title, sub, onclick, href) => [k, h(href ? 'a' : 'button', { class: 'big-link', href, onclick },
    h('span', { class: 'bl-ic' }, icon(ic, 22)), h('span', { class: 'grow' }, h('b', null, title), sub && h('span', null, sub)), icon('right', 18))];
  const group = (k, title, ...rows) => [k, h('section', { class: 'me-group' }, h('h2', { class: 'section-title' }, title), zone('drv.me.' + k, { class: 'big-links' }, rows.filter(Boolean)))];
  return h('div', { class: 'screen', 'data-page': 'me' },
    topSearch(() => go('/me')),
    fleet && h('div', { class: 'page-title tab-head' }, h('div', null, h('h1', null, 'Профил'), h('div', { class: 'date' }, 'Акаунт, колата и помощ')),
      fleet && h('button', { class: 'tab-avatar', type: 'button', 'aria-label': 'Смени профилната снимка', onclick: () => setPhoto('photo', () => go('/me')) },
        data.profile.photo ? h('img', { src: data.profile.photo, alt: '' }) : h('span', null, user.name.split(' ').map((x) => x[0]).slice(0, 2).join('')))),
    !fleet && profileCover(user, data.profile),
    zone('drv.me', { class: 'dz' }, [
    group('acc', 'Акаунт',
      row('profile', 'user', 'Лични данни', 'Име, телефон, снимки, известия, изглед, парола, изход', null, '#/profile'),
      row('kind', fleet ? 'key' : 'car', 'Вид акаунт', `${fleet ? 'Собственик на коли' : 'Шофьор'} · избира се при регистрация. За смяна – пиши ни`, null, '#/help')),
    !fleet && group('car', 'Колата',
      data.profile.carType !== 'rent' && row('vehicle', 'tool', 'Колата ми', carSub(data), null, '#/vehicle'),
      (() => { const sh = (data.cars || []).find((c) => c.ownerId === user.id && c.type === 'own'); const n = sh ? (sh.members || []).filter((m) => m.userId !== user.id).length : 0;
        return row('share', 'users', sh && n ? 'Други шофьори на колата ми' : 'Дай колата си на друг шофьор', sh && n ? `${n} ${n === 1 ? 'шофьор' : 'шофьори'} – часове, гориво, км, плащане, % от разходите` : 'Виждаш часовете, горивото и км му – без приходите. Плащане за деня или седмицата, % от разходите.', null, sh ? '#/cars/' + sh.id : '#/cars?new=1'); })(),
      row('carset', 'car', 'Настройки на колата', 'Код, номер, марка и модел (или снимка на талона), своя или под наем, гориво', null, '#/car'),
      row('ptp', 'alert', 'При ПТП – двустранен протокол', 'Попълваш го онлайн с приложението ДКП – Google Play и App Store', null, '#/ptp'),
      row('cars', 'key', 'Обща кола и автопарк', (data.cars || []).length ? `${data.cars.length} ${data.cars.length === 1 ? 'кола' : 'коли'} – шофьори, разходи, покани` : 'Кола с няколко шофьори или коли под наем – покани с линк', null, '#/cars')),
    fleet && group('fleet', 'Автопарк',
      row('fcars', 'car', 'Колите ми', `${(data.cars || []).filter((c) => c.ownerId === user.id).length} коли – шофьори, наем, срокове, покани`, null, '#/cars'),
      row('fptp', 'alert', 'При ПТП – двустранен протокол', 'Шофьорите го попълват онлайн с приложението ДКП', null, '#/ptp'),
      row('fguide', 'doc', 'Ръководство за собственика', 'Всички функции, подредени по теми – с картинки', null, '#/fguide'),
      row('fwalk', 'play', 'Разходка из приложението', 'Стъпка по стъпка – около 3 минути', null, '#/fguide?walk=1')),
    group('help', 'Помощ',
      !fleet && row('guide', 'doc', 'Презентация', 'Как работи приложението – за преглед и теглене', null, '#/guide'),
      row('tour', 'sparkle', 'Кратка разходка', '5 стъпки за 1 минута', () => { try { sessionStorage.setItem('profitaxi.tourNow', '1'); } catch { /* */ } go('/home'); }),
      row('write', 'inbox', 'Пиши ни', store.myUnreadTickets() > 0 ? 'Имаш нов отговор' : 'Въпрос или проблем – отговаряме тук', null, '#/help')),
    group('more', 'Още',
      row('arrange', 'grid', 'Подреди екраните', 'Мести и скривай картите и бутоните, както ти е удобно', () => startArrange()),
      row('ideas', 'sparkle', 'Предложи функция', 'Напиши идея или гласувай за чужда', null, '#/ideas')),
    ]));
}
