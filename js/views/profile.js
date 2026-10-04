// Профил: акаунт, град и фирма, кола, гориво, ефир, цел, известия, тема, данни

import { h, fill, icon, cx, money, todayStr, fmtDate } from '../util.js';
import * as store from '../store.js';
import { CAR_TYPES, FUELS } from '../constants.js';
import { carBlock, fuelBlock, dispatchBlock, shareBlock, goalBlock } from './carSettings.js';
import { openSheet, sheetHead, confirmSheet, toast, field, segmented, getTheme, setTheme, cardTitle, hero } from '../ui.js';
import { notifyPermission, notifySupported, requestNotify, checkNotifications } from '../notify.js';
import { cityCompanyPicker } from './cityPicker.js';
import { exportCsv } from './stats.js';

export function profileView({ go, user, data }) {
  const root = h('div', { class: 'screen', 'data-page': 'profile' });
  const d = store.getProfile();
  const orig = JSON.stringify(d);
  const draw = () => {
    const dirty = JSON.stringify(d) !== orig;
    const sub = user.subscription;
    const daysLeft = Math.round((new Date(sub.validUntil) - new Date(todayStr())) / 86400000);
    fill(root,
      hero(
        h('div', { class: 'hero-top' },
          h('div', { class: 'row gap' },
            h('div', { class: 'avatar', style: { width: '58px', height: '58px', fontSize: '1.15rem', background: '#fff', color: '#0E6F66' } }, user.name.split(' ').map((x) => x[0]).slice(0, 2).join('')),
            h('div', { style: { minWidth: 0 } },
              h('h1', { style: { fontSize: '1.25rem' } }, user.name),
              h('div', { class: 'hero-sub', style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, user.email))),
          h('button', { class: 'hero-btn', 'aria-label': 'Редактирай профила', onclick: () => editAccount(user) }, icon('edit', 20))),
        h('div', { class: 'hero-chips' },
          h('span', { class: 'hero-chip' }, icon('target', 14), user.city || 'без град'),
          h('span', { class: 'hero-chip' }, icon('car', 14), user.company || 'без фирма'),
          h('span', { class: 'hero-chip' }, icon('clock', 14), `${sub.plan === 'trial' ? 'Пробен' : 'Абонамент'} до ${fmtDate(sub.validUntil, { year: true })}${daysLeft <= 7 && daysLeft >= 0 ? ` (${daysLeft} дни)` : ''}`))),

      h('section', { class: 'card' }, cardTitle('car', 'Кола'), carBlock(d, draw),
        d.carType === 'rent' && h('p', { class: 'auto-note' }, icon('key', 15), 'При кола под наем застраховки, винетка, преглед и сервиз не се смятат. Плаща ги собственикът.')),
      h('section', { class: 'card' }, cardTitle('fuel', 'Гориво'), fuelBlock(d, draw)),
      h('section', { class: 'card' }, cardTitle('phone', 'Ефир / диспечер'), dispatchBlock(d, draw)),
      h('section', { class: 'card' }, shareBlock(d, draw)),
      h('section', { class: 'card' }, cardTitle('target', 'Цел'), goalBlock(d, draw)),

      dirty && h('div', { class: 'save-bar', style: { bottom: 'calc(var(--nav-h) + env(safe-area-inset-bottom))' } },
        h('div', { class: 'sum' }, h('span', null, 'Има промени'), h('div', { class: 'small muted' }, 'Важат от днес нататък')),
        h('button', { class: 'btn btn-page btn-lg', onclick: () => { store.updateProfile(d); toast('Настройките са запазени'); } }, icon('check', 20), 'Запази')),

      h('section', { class: 'card' }, cardTitle('bell', 'Известия'), notifyRow(d)),
      h('section', { class: 'card' }, cardTitle('sun', 'Изглед'), segmented({ auto: 'Автоматично', light: 'Светла', dark: 'Тъмна' }, getTheme(), (t) => { setTheme(t); draw(); }, { page: true })),

      h('section', { class: 'card', style: { padding: '8px 18px' } },
        listBtn('download', 'Свали всички смени (Excel)', () => exportCsv(data, { from: '2000-01-01', to: todayStr() })),
        listBtn('print', 'Отчет в PDF', () => go('/stats'), true),
        listBtn('lock', 'Смяна на паролата', changePw),
        h('a', { class: 'list-btn', href: '/privacy.html', target: '_blank' }, h('span', { class: 'l-ic' }, icon('shield', 18)), h('span', { class: 'grow' }, 'Поверителност и условия')),
        listBtn('logout', 'Изход', () => { store.logout(); go('/login'); }),
        h('button', { class: 'list-btn danger', onclick: delAccount }, h('span', { class: 'l-ic' }, icon('trash', 18)), h('span', { class: 'grow' }, 'Изтрий акаунта'))),
      h('p', { class: 'faint small', style: { textAlign: 'center', marginTop: '18px' } }, 'ProfiTaxi, демо версия. Данните се пазят на това устройство.'));
  };
  draw();
  return root;
}

const listBtn = (ic, label, onclick, arrow) => h('button', { class: 'list-btn', onclick }, h('span', { class: 'l-ic' }, icon(ic, 18)), h('span', { class: 'grow' }, label), arrow && icon('right', 18));

function notifyRow(d) {
  const perm = notifyPermission();
  const on = d.notify && perm === 'granted';
  return h('div', { class: 'setting', style: { padding: 0 } },
    h('div', { class: 'grow' },
      h('div', { class: 'setting-title' }, 'Напомняния за плащания'),
      h('div', { class: 'setting-sub' }, !notifySupported() ? 'Браузърът не поддържа известия. На iPhone първо добави приложението към началния екран.' : perm === 'denied' ? 'Забранени в браузъра. Разреши ги от настройките на сайта.' : '3, 2 и 1 ден преди падеж и в деня')),
    notifySupported() && perm !== 'denied' && h('button', { class: cx('toggle', on && 'on'), role: 'switch', 'aria-checked': String(on), 'aria-label': 'Известия', onclick: async () => {
      if (on) { store.updateProfile({ notify: false }); toast('Известията са изключени'); return; }
      const r = await requestNotify();
      if (r === 'granted') { store.updateProfile({ notify: true }); toast('Известията са включени'); checkNotifications(store.myData()); }
      else toast('Известията не са разрешени', 'err');
    } }));
}

function editAccount(user) {
  openSheet((close) => {
    const name = h('input', { class: 'input', value: user.name });
    const phone = h('input', { class: 'input', type: 'tel', value: user.phone || '' });
    const cc = cityCompanyPicker({ city: user.city, company: user.company });
    const err = h('p', { class: 'err' });
    return h('div', { class: 'form' },
      sheetHead('Моите данни', close),
      field('Име', name), field('Телефон', phone), cc.el, err,
      h('button', { class: 'btn btn-page btn-lg', onclick: () => {
        const v = cc.value();
        if (!v.city) { err.textContent = 'Избери град'; return; }
        if (!v.company) { err.textContent = 'Избери фирма'; return; }
        store.updateAccount({ name: name.value, phone: phone.value, ...v }); close(); toast('Запазено');
      } }, 'Запази'));
  }, { tall: true });
}

function changePw() {
  openSheet((close) => {
    const a = h('input', { class: 'input', type: 'password', autocomplete: 'current-password' });
    const b = h('input', { class: 'input', type: 'password', autocomplete: 'new-password' });
    const err = h('p', { class: 'err' });
    return h('div', { class: 'form' },
      sheetHead('Смяна на паролата', close),
      field('Текуща парола', a), field('Нова парола', b, 'Поне 6 символа'), err,
      h('button', { class: 'btn btn-page btn-lg', onclick: () => { const r = store.changePassword(a.value, b.value); if (r.error) { err.textContent = r.error; return; } close(); toast('Паролата е сменена'); } }, 'Смени'));
  });
}

function delAccount() {
  confirmSheet({ title: 'Изтриване на акаунта?', text: 'Всички смени, разходи и настройки ще бъдат изтрити завинаги. Това не може да се върне.', okLabel: 'Изтрий всичко', danger: true,
    onOk: () => { store.deleteMyAccount(); location.hash = '/login'; } });
}
export { CAR_TYPES, FUELS, money };
