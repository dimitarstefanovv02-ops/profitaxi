// Профил: кола, гориво, ефир, цел, тема, данни, акаунт

import { h, fill, icon, cx, money, todayStr, fmtDate } from '../util.js';
import * as store from '../store.js';
import { CAR_TYPES, FUELS } from '../constants.js';
import { carBlock, fuelBlock, dispatchBlock, shareBlock, goalBlock } from './carSettings.js';
import { openSheet, sheetHead, confirmSheet, toast, field, segmented, getTheme, setTheme } from '../ui.js';
import { exportCsv } from './stats.js';

export function profileView({ go, user, data }) {
  const root = h('div', { class: 'screen' });
  const d = store.getProfile();
  const orig = JSON.stringify(d);
  const draw = () => {
    const dirty = JSON.stringify(d) !== orig;
    const sub = user.subscription;
    fill(root, 
      h('div', { class: 'top' }, h('h1', null, 'Профил')),

      h('section', { class: 'card row gap' },
        h('div', { class: 'avatar', style: { width: '56px', height: '56px', fontSize: '1.1rem' } }, user.name.split(' ').map((x) => x[0]).slice(0, 2).join('')),
        h('div', { class: 'grow', style: { minWidth: 0 } },
          h('div', { style: { fontWeight: 700, fontSize: '1.1rem' } }, user.name),
          h('div', { class: 'muted small', style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, user.email),
          h('div', { class: 'small', style: { marginTop: '4px' } },
            h('span', { class: cx('chip', sub.plan === 'trial' ? 'warn' : 'good') }, `${sub.plan === 'trial' ? 'Пробен период' : 'Абонамент'} до ${fmtDate(sub.validUntil, { year: true })}`))),
        h('button', { class: 'icon-btn', 'aria-label': 'Редактирай профила', onclick: () => editAccount(user) }, icon('edit', 20))),

      h('h2', { class: 'section-title' }, 'Кола'),
      h('section', { class: 'card' }, carBlock(d, draw)),
      h('h2', { class: 'section-title' }, 'Гориво'),
      h('section', { class: 'card' }, fuelBlock(d, draw)),
      h('h2', { class: 'section-title' }, 'Ефир / диспечер'),
      h('section', { class: 'card' }, dispatchBlock(d, draw)),
      h('section', { class: 'card' }, shareBlock(d, draw)),
      h('h2', { class: 'section-title' }, 'Цел'),
      h('section', { class: 'card' }, goalBlock(d, draw)),

      dirty && h('div', { class: 'save-bar', style: { bottom: 'calc(var(--nav-h) + env(safe-area-inset-bottom))' } },
        h('div', { class: 'sum' }, h('span', null, 'Има промени'), h('div', { class: 'small muted' }, 'Важат от днес нататък')),
        h('button', { class: 'btn btn-primary btn-lg', onclick: () => { store.updateProfile(d); toast('Настройките са запазени'); } }, icon('check', 20), 'Запази')),

      h('h2', { class: 'section-title' }, 'Изглед'),
      h('section', { class: 'card' }, segmented({ auto: 'Автоматично', light: 'Светла', dark: 'Тъмна' }, getTheme(), (t) => { setTheme(t); draw(); })),

      h('h2', { class: 'section-title' }, 'Данни и акаунт'),
      h('section', { class: 'card', style: { padding: '4px 18px' } },
        h('button', { class: 'list-btn', onclick: () => exportCsv(data, { from: '2000-01-01', to: todayStr() }) }, icon('download', 20), h('span', { class: 'grow' }, 'Свали всички смени (Excel)')),
        h('button', { class: 'list-btn', onclick: () => go('/stats') }, icon('print', 20), h('span', { class: 'grow' }, 'Отчет в PDF'), icon('right', 18)),
        h('button', { class: 'list-btn', onclick: changePw }, icon('lock', 20), h('span', { class: 'grow' }, 'Смяна на паролата')),
        h('a', { class: 'list-btn', href: '/privacy.html', target: '_blank' }, icon('shield', 20), h('span', { class: 'grow' }, 'Поверителност и условия')),
        h('button', { class: 'list-btn', onclick: () => { store.logout(); go('/login'); } }, icon('logout', 20), h('span', { class: 'grow' }, 'Изход')),
        h('button', { class: 'list-btn danger', onclick: delAccount }, icon('trash', 20), h('span', { class: 'grow' }, 'Изтрий акаунта'))),
      h('p', { class: 'faint small', style: { textAlign: 'center', marginTop: '18px' } }, 'ProfiTaxi, демо версия. Данните се пазят на това устройство.'));
  };
  draw();
  return root;
}

function editAccount(user) {
  openSheet((close) => {
    const name = h('input', { class: 'input', value: user.name });
    const phone = h('input', { class: 'input', type: 'tel', value: user.phone || '' });
    return h('div', { class: 'form' },
      sheetHead('Моите данни', close),
      field('Име', name), field('Телефон', phone),
      h('button', { class: 'btn btn-primary btn-lg', onclick: () => { store.updateAccount({ name: name.value, phone: phone.value }); close(); toast('Запазено'); } }, 'Запази'));
  });
}

function changePw() {
  openSheet((close) => {
    const a = h('input', { class: 'input', type: 'password', autocomplete: 'current-password' });
    const b = h('input', { class: 'input', type: 'password', autocomplete: 'new-password' });
    const err = h('p', { class: 'err' });
    return h('div', { class: 'form' },
      sheetHead('Смяна на паролата', close),
      field('Текуща парола', a), field('Нова парола', b, 'Поне 6 символа'), err,
      h('button', { class: 'btn btn-primary btn-lg', onclick: () => { const r = store.changePassword(a.value, b.value); if (r.error) { err.textContent = r.error; return; } close(); toast('Паролата е сменена'); } }, 'Смени'));
  });
}

function delAccount() {
  confirmSheet({ title: 'Изтриване на акаунта?', text: 'Всички смени, разходи и настройки ще бъдат изтрити завинаги. Това не може да се върне.', okLabel: 'Изтрий всичко', danger: true,
    onOk: () => { store.deleteMyAccount(); location.hash = '/login'; } });
}
export { CAR_TYPES, FUELS, money };
