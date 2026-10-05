// Профил: акаунт, град и фирма, кола, гориво, ефир, цел, известия, тема, данни

import { h, fill, icon, cx, money, todayStr, fmtDate, MONTHS, startOfMonth, parseDate } from '../util.js';
import * as store from '../store.js';
import { CAR_TYPES, FUELS } from '../constants.js';
import { carBlock, fuelBlock, dispatchBlock, shareBlock, goalBlock } from './carSettings.js';
import { openSheet, sheetHead, confirmSheet, toast, field, segmented, getTheme, setTheme, cardTitle, hero } from '../ui.js';
import { notifyPermission, notifySupported, requestNotify, checkNotifications } from '../notify.js';
import { cityCompanyPicker } from './cityPicker.js';
import { openCategories, pickImage } from './categories.js';
import { upcomingReservations } from './reservations.js';
import { exportCsv } from './stats.js';
import { emailQueue, EMAIL_DEFAULTS, EMAIL_PAY_OPTIONS, EMAIL_RES_OPTIONS } from '../calc.js';

export function profileView({ go, user, data }) {
  const root = h('div', { class: 'screen', 'data-page': 'profile' });
  const d = store.getProfile();
  const orig = JSON.stringify(d);
  const draw = () => {
    const dirty = JSON.stringify(d) !== orig;
    const sub = user.subscription;
    const daysLeft = Math.round((new Date(sub.validUntil) - new Date(todayStr())) / 86400000);
    fill(root,
      profileCover(user, d),
      h('div', { class: 'quick-links' },
        h('a', { class: 'ql', href: '#/calendar' }, h('span', { class: 'ql-ic' }, icon('calendar', 20)), h('b', null, 'Календар'), h('span', null, `${upcomingCount(data)} курса напред`)),
        h('a', { class: 'ql', href: '#/invite' }, h('span', { class: 'ql-ic', style: { '--qc': 'var(--c-pink)' } }, icon('gift', 20)), h('b', null, 'Покани колеги'), h('span', null, refLabel())),
        h('button', { class: 'ql', onclick: () => openCategories() }, h('span', { class: 'ql-ic', style: { '--qc': 'var(--c-orange)' } }, icon('tag', 20)), h('b', null, 'Категории'), h('span', null, 'разходи'))),
      h('section', { class: 'card' }, cardTitle('car', 'Кола'), carBlock(d, draw),
        d.carType === 'rent' && h('p', { class: 'auto-note' }, icon('key', 15), 'При кола под наем застраховки, винетка, преглед и сервиз не се смятат. Плаща ги собственикът.')),
      h('section', { class: 'card' }, cardTitle('fuel', 'Гориво'), fuelBlock(d, draw)),
      h('section', { class: 'card' }, cardTitle('phone', 'Ефир / диспечер'), dispatchBlock(d, draw)),
      h('section', { class: 'card' }, shareBlock(d, draw)),
      h('section', { class: 'card' }, cardTitle('target', 'Цел'), goalBlock(d, draw)),

      dirty && h('div', { class: 'save-bar', style: { bottom: 'calc(var(--nav-h) + env(safe-area-inset-bottom))' } },
        h('div', { class: 'sum' }, h('span', null, 'Има промени'), h('div', { class: 'small muted' }, costChanged(orig, d) ? 'Ще избереш от кога важат' : 'Запази ги')),
        h('button', { class: 'btn btn-page btn-lg', onclick: () => {
          const save = (from) => {
            // записваме само променените полета, за да не презапишем снимки или имейл настройки, сменени междувременно
            const o = JSON.parse(orig); const patch = {};
            Object.keys(d).forEach((k) => { if (JSON.stringify(d[k]) !== JSON.stringify(o[k])) patch[k] = d[k]; });
            store.updateProfile(patch, { from }); toast('Настройките са запазени');
          };
          if (costChanged(orig, d)) askFrom(save); else save();
        } }, icon('check', 20), 'Запази')),

      h('section', { class: 'card' }, cardTitle('bell', 'Известия'), notifyRow(d), emailBlock(user, draw)),
      h('section', { class: 'card' }, cardTitle('sun', 'Изглед'), segmented({ auto: 'Автоматично', light: 'Светла', dark: 'Тъмна' }, getTheme(), (t) => { setTheme(t); draw(); }, { page: true })),

      h('section', { class: 'card', style: { padding: '8px 18px' } },
        listBtn('download', 'Свали всички смени (Excel)', () => exportCsv(data, { from: '2000-01-01', to: todayStr() })),
        listBtn('print', 'Отчет в PDF', () => go('/stats'), true),
        listBtn('sparkle', 'Помощ: кратка разходка', () => { try { sessionStorage.setItem('profitaxi.tourNow', '1'); } catch { /* */ } go('/home'); }, true),
        listBtn('lock', 'Смяна на паролата', changePw),
        h('a', { class: 'list-btn', href: '/privacy.html', target: '_blank' }, h('span', { class: 'l-ic' }, icon('shield', 18)), h('span', { class: 'grow' }, 'Поверителност и условия')),
        listBtn('logout', 'Изход', () => { store.logout(); go('/login'); }),
        h('button', { class: 'list-btn danger', onclick: delAccount }, h('span', { class: 'l-ic' }, icon('trash', 18)), h('span', { class: 'grow' }, 'Изтрий акаунта'))),
      h('p', { class: 'faint small', style: { textAlign: 'center', marginTop: '18px' } }, 'ProfiTaxi, демо версия. Данните се пазят на това устройство.'));
  };
  draw();
  return root;
}

// Промени в наема, лизинга, ефира или вида кола – те стават постоянни разходи с начална дата
const costChanged = (orig, d) => { const o = JSON.parse(orig); return ['carType', 'rent', 'leasing', 'dispatch'].some((k) => JSON.stringify(o[k]) !== JSON.stringify(d[k])); };
export function askFrom(onPick) {
  const today = todayStr(), m0 = startOfMonth(today), month = MONTHS[parseDate(today).getMonth()];
  openSheet((close) => {
    const date = h('input', { class: 'input', type: 'date', value: m0, max: today });
    const pick = (from) => { close(); onPick(from); };
    return h('div', { class: 'form' },
      sheetHead('От кога важи промяната?', close, 'Наемът, лизингът и ефирът се смятат от тази дата'),
      h('button', { class: 'btn btn-primary btn-lg btn-block', onclick: () => pick(m0) }, icon('calendar', 20), `От 1 ${month} (целия месец)`),
      today !== m0 && h('button', { class: 'btn btn-ghost btn-lg btn-block', onclick: () => pick(today) }, `От днес, ${fmtDate(today)}`),
      h('div', { class: 'row gap' }, date, h('button', { class: 'btn btn-outline', onclick: () => date.value && pick(date.value > today ? today : date.value) }, 'От дата')),
      h('p', { class: 'muted small' }, 'Дните преди тази дата остават със старите стойности.'));
  });
}

const upcomingCount = (data) => upcomingReservations(data.reservations || []).length;
const refLabel = () => { const r = store.myReferrals(); return r ? `${r.count} поканени` : ''; };

// Горната част: снимка на колата като корица, профилна снимка, име и данни за колата
function profileCover(user, d) {
  const car = d.car || {};
  const initials = user.name.split(' ').map((x) => x[0]).slice(0, 2).join('');
  const sub = user.subscription;
  const daysLeft = Math.round((new Date(sub.validUntil) - new Date(todayStr())) / 86400000);
  const setPhoto = async (key) => {
    const img = await pickImage({ max: key === 'carPhoto' ? 1200 : 400 });
    if (!img) return;
    try { store.updateProfile({ [key]: img }); toast(key === 'carPhoto' ? 'Снимката на колата е сменена' : 'Профилната снимка е сменена'); }
    catch { toast('Снимката е твърде голяма', 'err'); }
  };
  return h('section', { class: 'cover' },
    h('div', { class: 'cover-img', style: d.carPhoto ? { backgroundImage: `url("${d.carPhoto}")` } : null },
      h('button', { class: 'cover-btn', 'aria-label': 'Смени снимката на колата', onclick: () => setPhoto('carPhoto') }, icon('camera', 18), d.carPhoto ? 'Смени' : 'Снимка на колата'),
      car.code && h('span', { class: 'cover-code' }, h('small', null, 'Код'), car.code)),
    h('div', { class: 'cover-body' },
      h('button', { class: 'cover-avatar', 'aria-label': 'Смени профилната снимка', onclick: () => setPhoto('photo') },
        d.photo ? h('img', { src: d.photo, alt: '' }) : h('span', null, initials),
        h('i', null, icon('camera', 14))),
      h('div', { class: 'cover-info' },
        h('h1', null, user.name),
        h('div', { class: 'cover-car' }, car.model || 'Добави модел на колата', car.plate && h('span', { class: 'plate' }, h('em', null, 'BG'), car.plate))),
      h('button', { class: 'icon-btn', 'aria-label': 'Редактирай профила', onclick: () => editAccount(user, d) }, icon('edit', 20))),
    h('div', { class: 'cover-chips' },
      h('span', { class: 'chip' }, icon('pin', 14), user.city || 'без град'),
      h('span', { class: 'chip' }, icon('car', 14), user.company || 'без фирма'),
      h('span', { class: cx('chip', sub.plan === 'trial' ? 'warn' : 'good') }, icon('clock', 14), `${sub.plan === 'trial' ? 'Пробен' : 'Абонамент'} до ${fmtDate(sub.validUntil, { year: true })}${daysLeft <= 7 && daysLeft >= 0 ? ` (${daysLeft} дни)` : ''}`)));
}

const listBtn = (ic, label, onclick, arrow) => h('button', { class: 'list-btn', onclick }, h('span', { class: 'l-ic' }, icon(ic, 18)), h('span', { class: 'grow' }, label), arrow && icon('right', 18));

// Напомняния по имейл: включване, кога преди събитието и преглед на следващите
function emailBlock(user, redraw) {
  const p = store.getProfile();
  const cfg = { ...EMAIL_DEFAULTS, ...(p.emailReminders || {}) };
  const save = (patch) => { store.updateProfile({ emailReminders: { ...cfg, ...patch } }); redraw(); };
  const toggleIn = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]).sort((a, b) => b - a);
  const queue = cfg.on ? emailQueue(store.myData()).slice(0, 3) : [];
  return h('div', { class: 'email-rem' },
    h('div', { class: 'setting', style: { padding: 0, marginTop: '16px' } },
      h('div', { class: 'grow' },
        h('div', { class: 'setting-title' }, 'Напомняния по имейл ', h('span', { class: 'chip warn', style: { padding: '2px 8px', fontSize: '.72rem' } }, 'скоро')),
        h('div', { class: 'setting-sub' }, `На ${user.email}`)),
      h('button', { class: cx('toggle', cfg.on && 'on'), role: 'switch', 'aria-checked': String(cfg.on), 'aria-label': 'Напомняния по имейл', onclick: () => save({ on: !cfg.on }) })),
    cfg.on && h('div', null,
      h('p', { class: 'small muted', style: { margin: '12px 0 6px' } }, 'Плащания – колко дни преди падежа:'),
      h('div', { class: 'chip-row' }, EMAIL_PAY_OPTIONS.map(([v, l]) => h('button', { class: cx('chip-btn', cfg.pay.includes(v) && 'on'), onclick: () => save({ pay: toggleIn(cfg.pay, v) }) }, l))),
      h('p', { class: 'small muted', style: { margin: '12px 0 6px' } }, 'Курсове – колко време преди:'),
      h('div', { class: 'chip-row' }, EMAIL_RES_OPTIONS.map(([v, l]) => h('button', { class: cx('chip-btn', cfg.res.includes(v) && 'on'), onclick: () => save({ res: toggleIn(cfg.res, v) }) }, l))),
      h('div', { class: 'info-box', style: { marginTop: '12px' } }, icon('alert', 18),
        h('span', null, 'Изпращането по имейл още ', h('b', null, 'не е включено'), ' – ще тръгне, когато свържем сървъра. Дотогава напомнянията идват в приложението и като известия на телефона.')),
      queue.length > 0 && h('div', { style: { marginTop: '10px' } },
        h('p', { class: 'small muted', style: { marginBottom: '4px' } }, 'Следващи имейли (преглед):'),
        queue.map((q) => h('div', { class: 'email-q' }, h('b', null, q.subject), h('span', null, q.sendAt.replace('T', ' ')))))));
}

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

function editAccount(user, profile) {
  const car = { code: '', plate: '', model: '', ...(profile?.car || {}) };
  openSheet((close) => {
    const name = h('input', { class: 'input', value: user.name });
    const phone = h('input', { class: 'input', type: 'tel', value: user.phone || '' });
    const code = h('input', { class: 'input', value: car.code, placeholder: 'напр. 214' });
    const plate = h('input', { class: 'input', value: car.plate, placeholder: 'напр. СВ 1234 АВ', style: { textTransform: 'uppercase' } });
    const model = h('input', { class: 'input', value: car.model, placeholder: 'напр. Toyota Corolla Hybrid' });
    const cc = cityCompanyPicker({ city: user.city, company: user.company });
    const err = h('p', { class: 'err' });
    return h('div', { class: 'form' },
      sheetHead('Моите данни', close),
      field('Име', name, null, true), field('Телефон', phone),
      h('h3', { style: { margin: '6px 0 0', fontSize: '.95rem' } }, 'Колата'),
      h('div', { class: 'grid2' }, field('Код на колата', code, 'Номерът ти във фирмата'), field('Рег. номер', plate)),
      field('Модел', model),
      cc.el, err,
      h('button', { class: 'btn btn-page btn-lg', onclick: () => {
        const v = cc.value();
        if (!name.value.trim()) { err.textContent = 'Въведи име'; return; }
        if (!v.city) { err.textContent = 'Избери град'; return; }
        if (!v.company) { err.textContent = 'Избери фирма'; return; }
        store.updateAccount({ name: name.value, phone: phone.value, ...v });
        store.updateProfile({ car: { code: code.value.trim(), plate: plate.value.trim().toUpperCase(), model: model.value.trim() } });
        close(); toast('Запазено');
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
