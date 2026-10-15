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
  return h('div', { class: 'screen', 'data-page': 'me' },
    topSearch(() => go('/me')),
    fleet && h('div', { class: 'page-title tab-head' }, h('div', null, h('h1', null, 'Профил'), h('div', { class: 'date' }, 'Акаунт, колата и помощ')),
      fleet && h('button', { class: 'tab-avatar', type: 'button', 'aria-label': 'Смени профилната снимка', onclick: () => setPhoto('photo', () => go('/me')) },
        data.profile.photo ? h('img', { src: data.profile.photo, alt: '' }) : h('span', null, user.name.split(' ').map((x) => x[0]).slice(0, 2).join('')))),
    !fleet && profileCover(user, data.profile),
    zone('drv.me', { class: 'dz' }, [
    // Само 6 реда: подробностите се отварят от тях
    ['menu', h('section', { class: 'me-group' }, zone('drv.me.menu', { class: 'big-links' }, [
      row('profile', 'user', 'Лични данни', 'Име, телефон, снимки, вид акаунт', null, '#/profile'),
      fleet ? row('fleet', 'car', 'Автопарк', 'Колите, при ПТП, ръководство, разходка', () => subMenu('Автопарк', [
        sub('car', 'Колите ми', `${(data.cars || []).filter((c) => c.ownerId === user.id).length} коли – шофьори, наем, срокове, покани`, '#/cars'),
        sub('alert', 'При ПТП – двустранен протокол', 'Шофьорите го попълват онлайн с приложението ДКП', '#/ptp'),
        sub('doc', 'Ръководство за собственика', 'Всички функции, подредени по теми – с картинки', '#/fguide'),
        sub('play', 'Разходка из приложението', 'Стъпка по стъпка – около 3 минути', '#/fguide?walk=1')]))
      : row('car', 'car', 'Колата', 'Колата ми, настройки, при ПТП, обща кола', () => subMenu('Колата', [
        data.profile.carType !== 'rent' && sub('tool', 'Колата ми', carSub(data), '#/vehicle'),
        sub('car', 'Настройки на колата', 'Код, номер, марка и модел (или снимка на талона), своя или под наем, гориво', '#/car'),
        (() => { const sh = (data.cars || []).find((c) => c.ownerId === user.id && c.type === 'own'); const n = sh ? (sh.members || []).filter((m) => m.userId !== user.id).length : 0;
          return sub('users', sh && n ? 'Други шофьори на колата ми' : 'Дай колата си на друг шофьор', sh && n ? `${n} ${n === 1 ? 'шофьор' : 'шофьори'} – часове, гориво, км, плащане, % от разходите` : 'Виждаш часовете, горивото и км му – без приходите', sh ? '#/cars/' + sh.id : '#/cars?new=1'); })(),
        sub('alert', 'При ПТП – двустранен протокол', 'Попълваш го онлайн с приложението ДКП', '#/ptp'),
        sub('key', 'Обща кола и автопарк', (data.cars || []).length ? `${data.cars.length} ${data.cars.length === 1 ? 'кола' : 'коли'} – шофьори, разходи, покани` : 'Кола с няколко шофьори – покани с линк', '#/cars')])),
      row('help', 'inbox', 'Помощ', store.myUnreadTickets() > 0 ? 'Имаш нов отговор' : 'Пиши ни, презентация, кратка разходка', () => subMenu('Помощ', [
        sub('inbox', 'Пиши ни', store.myUnreadTickets() > 0 ? 'Имаш нов отговор' : 'Въпрос или проблем – отговаряме тук', '#/help'),
        !fleet && sub('doc', 'Презентация', 'Как работи приложението – за преглед и теглене', '#/guide'),
        sub('sparkle', 'Кратка разходка', '5 стъпки за 1 минута', null, () => { try { sessionStorage.setItem('profitaxi.tourNow', '1'); } catch { /* */ } go('/home'); })])),
      row('settings', 'tool', 'Настройки', 'Известия, изглед, парола, Face ID, изход', null, '#/settings'),
      row('arrange', 'grid', 'Подреди екраните', 'Мести и скривай картите и бутоните', () => startArrange()),
      row('ideas', 'sparkle', 'Предложи функция', 'Напиши идея или гласувай за чужда', null, '#/ideas'),
    ].filter(Boolean)))],
    ]));
}

// Подменю като лист отдолу: „Колата“, „Помощ“, „Автопарк“
function sub(ic, title, text, href, fn) { return { ic, title, text, href, fn }; }
function subMenu(title, items) {
  openSheet((close) => h('div', null, sheetHead(title, close),
    h('div', { class: 'big-links sub-menu' }, items.filter(Boolean).map((it) => h('button', { class: 'big-link', type: 'button', onclick: () => { close(); if (it.fn) it.fn(); else location.hash = it.href; } },
      h('span', { class: 'bl-ic' }, icon(it.ic, 22)), h('span', { class: 'grow' }, h('b', null, it.title), it.text && h('span', null, it.text)), icon('right', 18))))));
}

