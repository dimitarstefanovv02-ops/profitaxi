// „Лични данни“ – личното: данни, снимки, известия, отчети, парола, помощ, изход.
// „Колата и ефирът“ – работата: вид кола, гориво, ефир, споделяне, цел.

import { pushTypes, pushBlocker, setPushTypes } from '../driverpush.js';
import { passkeySupported, passkeyOn, enablePasskey, disablePasskey, faceLabel } from '../passkey.js';
import { h, fill, icon, cx, money, todayStr, fmtDate, MONTHS, startOfMonth, parseDate } from '../util.js';
import * as store from '../store.js';
import { zone } from '../arrange.js';
import { CAR_TYPES, FUELS } from '../constants.js';
import { carBlock, fuelBlock, shareBlock } from './carSettings.js';
import { openSheet, sheetHead, confirmSheet, toast, field, segmented, getTheme, setTheme, cardTitle, hero, THEMES, TEXT_SIZES, getTextSize, setTextSize } from '../ui.js';
import { notifyPermission, notifySupported, requestNotify, checkNotifications } from '../notify.js';
import { cityCompanyPicker } from './cityPicker.js';
import { openCategories, pickImage } from './categories.js';
import { upcomingReservations } from './reservations.js';
import { exportCsv } from './stats.js';
import { scanTalon } from '../talon.js';
import { emailQueue, EMAIL_DEFAULTS, EMAIL_PAY_OPTIONS, EMAIL_RES_OPTIONS } from '../calc.js';

export function profileView({ go, user, data, route }) {
  const root = h('div', { class: 'screen', 'data-page': 'profile' });
  const draw = () => {
    const d = store.getProfile();
    fill(root,
      h('div', { class: 'page-title' }, h('h1', null, 'Лични данни')),
      zone('drv.profile', { class: 'dz' }, [
      ['data', h('div', null, h('h2', { class: 'section-title' }, 'Лични данни'),
      h('section', { class: 'card', style: { padding: '8px 18px' } },
        infoRow('user', 'Име', user.name),
        infoRow('phone', 'Телефон', user.phone || 'не е въведен'),
        infoRow('doc', 'Имейл', user.email),
        infoRow('pin', 'Град и фирма', `${user.city || '—'}, ${user.company || '—'}`),
        listBtn('edit', 'Промени личните данни', () => editAccount(user), true)))],

      ['photos', h('div', null, h('h2', { class: 'section-title' }, 'Снимки'),
      h('section', { class: 'card', style: { padding: '8px 18px' } },
        listBtn('user', d.photo ? 'Смени профилната снимка' : 'Качи профилна снимка', () => setPhoto('photo', draw), true),
        listBtn('camera', d.carPhoto ? 'Смени снимката на колата' : 'Качи снимка на колата', () => setPhoto('carPhoto', draw), true)))],

      ['notify', h('div', null, h('h2', { class: 'section-title' }, 'Известия'),
      h('section', { class: 'card', id: 'notify' }, cardTitle('bell', 'Известия'), pushRows(draw), notifyRow(d), emailBlock(user, draw)))],
      ['look', h('div', null, h('h2', { class: 'section-title' }, 'Изглед'), h('section', { class: 'card' }, cardTitle('sun', 'Изглед'),
        segmented(THEMES, getTheme(), (t) => { setTheme(t); draw(); }, { page: true, outline: true }),
        h('div', { style: { height: '14px' } }),
        h('div', { class: 'field-label', style: { marginBottom: '8px' } }, 'Размер на текста'),
        segmented(TEXT_SIZES, getTextSize(), (k) => { setTextSize(k); draw(); }, { page: true, outline: true })))],

      ['help', h('div', null, h('h2', { class: 'section-title' }, 'Сигурност'),
      h('section', { class: 'card', style: { padding: '8px 18px' } },
        listBtn('lock', 'Смяна на паролата', changePw, true),
        faceRow(),
        h('a', { class: 'list-btn', href: '/privacy.html', target: '_blank' }, h('span', { class: 'l-ic' }, icon('shield', 18)), h('span', { class: 'grow' }, 'Поверителност'), icon('right', 18)),
        h('a', { class: 'list-btn', href: '/terms.html', target: '_blank' }, h('span', { class: 'l-ic' }, icon('doc', 18)), h('span', { class: 'grow' }, 'Общи условия'), icon('right', 18))))],
      ['exit', h('section', { class: 'card', style: { padding: '8px 18px' } },
        listBtn('logout', 'Изход', () => { store.logout(); go('/login'); }),
        h('button', { class: 'list-btn danger', onclick: delAccount }, h('span', { class: 'l-ic' }, icon('trash', 18)), h('span', { class: 'grow' }, 'Изтрий акаунта')))],
      ]),
      h('p', { class: 'faint small', style: { textAlign: 'center', marginTop: '18px' } }, store.live() ? 'Данните се пазят в облака – влез от всеки телефон и ги виждаш.' : 'Демо версия. Данните се пазят на това устройство.'));
  };
  draw();
  if (route?.query?.get('s') === 'notify') setTimeout(() => root.querySelector('#notify')?.scrollIntoView({ block: 'start' }), 80);
  return root;
}

const infoRow = (ic, label, value) => h('div', { class: 'info-row' }, h('span', { class: 'l-ic' }, icon(ic, 18)), h('span', { class: 'grow' }, h('small', null, label), h('b', null, value)));

export async function setPhoto(key, redraw) {
  const img = await pickImage({ max: key === 'carPhoto' ? 1200 : 400, aspect: key === 'carPhoto' ? 16 / 10 : 1, title: key === 'carPhoto' ? 'Изрежи снимката на колата' : 'Изрежи профилната снимка' });
  if (!img) return;
  try { store.updateProfile({ [key]: img }); toast(key === 'carPhoto' ? 'Снимката на колата е сменена' : 'Профилната снимка е сменена'); redraw?.(); }
  catch { toast('Снимката е твърде голяма', 'err'); }
}

// „Настройки на колата“: вид кола (своя / под наем), данни за колата, гориво, ефир, споделяне, цел
export function carView({ go, user, data }) {
  const root = h('div', { class: 'screen', 'data-page': 'car' });
  const d = store.getProfile();
  d.car = { code: '', plate: '', model: '', year: '', ...(d.car || {}) };
  const orig = JSON.stringify(d);
  const carInput = (key, ph, upper) => h('input', { class: 'input', value: d.car[key] || '', placeholder: ph, style: upper ? { textTransform: 'uppercase' } : null,
    oninput: (e) => { d.car = { ...d.car, [key]: upper ? e.target.value.toUpperCase() : e.target.value }; refreshBar(); } });
  const bar = h('div');
  const refreshBar = () => {
    const dirty = JSON.stringify(d) !== orig;
    fill(bar, dirty && h('div', { class: 'save-bar', style: { bottom: 'calc(var(--nav-h) + env(safe-area-inset-bottom))' } },
      h('div', { class: 'sum' }, h('span', null, 'Има промени'), h('div', { class: 'small muted' }, costChanged(orig, d) ? 'Ще избереш от кога важат' : 'Запази ги')),
      h('button', { class: 'btn btn-page btn-lg', onclick: () => {
        const save = (from) => {
          const o = JSON.parse(orig); const patch = {};
          Object.keys(d).forEach((k) => { if (JSON.stringify(d[k]) !== JSON.stringify(o[k])) patch[k] = d[k]; });
          store.updateProfile(patch, { from }); toast('Запазено');
        };
        if (costChanged(orig, d)) askFrom(save); else save();
      } }, icon('check', 20), 'Запази')));
  };
  const body = h('div');
  const draw = () => {
    fill(body,
      h('section', { class: 'card' }, cardTitle('car', 'Колата е'), carBlock(d, draw),
        d.carType === 'rent' && h('p', { class: 'auto-note' }, icon('key', 15), 'При кола под наем застраховки, винетка, преглед и сервиз не се смятат. Плаща ги собственикът.')),
      h('section', { class: 'card' }, cardTitle('doc', 'Данни за колата'),
        h('button', { class: 'btn btn-ghost btn-block talon-btn', type: 'button', onclick: () => scanTalon((r) => {
          const mm = [r.make, r.model].filter(Boolean).join(' ');
          d.car = { ...d.car, ...(mm && { model: mm }), ...(r.year && { year: String(r.year) }), ...(r.plate && { plate: r.plate.toUpperCase() }) };
          draw();
        }) }, icon('camera', 18), 'Снимай талона'),
        h('p', { class: 'muted small', style: { margin: '-6px 0 14px' } }, 'Марката, моделът, годината и номерът се попълват сами. Снимката не се пази.'),
        h('div', { class: 'grid2' }, field('Код на колата', carInput('code', 'напр. 214'), 'Номерът ти във фирмата'), field('Рег. номер', carInput('plate', 'СВ 1234 АВ', true))),
        h('div', { class: 'grid2 grid-mm' }, field('Марка и модел', carInput('model', 'напр. Toyota Corolla')), field('Година', carInput('year', '2019')))),
      h('section', { class: 'card' }, cardTitle('fuel', 'Гориво'), fuelBlock(d, draw)),
      h('section', { class: 'card' }, shareBlock(d, draw)));
    refreshBar();
  };
  draw();
  fill(root, h('div', { class: 'page-title' }, h('h1', null, 'Настройки на колата')),
    h('p', { class: 'muted', style: { margin: '-6px 0 12px' } }, 'Своя или под наем, данните за колата и горивото. Ефирът се добавя в смяната. Целта за месеца се сменя от „Днес“.'),
    body, bar);
  return root;
}

// Промени в наема, лизинга, ефира или вида кола – те стават постоянни разходи с начална дата
const costChanged = (orig, d) => { const o = JSON.parse(orig); return ['carType', 'rent', 'dispatch'].some((k) => JSON.stringify(o[k]) !== JSON.stringify(d[k])); };
export function askFrom(onPick) {
  const today = todayStr(), m0 = startOfMonth(today), month = MONTHS[parseDate(today).getMonth()];
  openSheet((close) => {
    const date = h('input', { class: 'input', type: 'date', value: m0, max: today });
    const pick = (from) => { close(); onPick(from); };
    return h('div', { class: 'form' },
      sheetHead('От кога важи промяната?', close, 'Наемът се смята от тази дата'),
      h('button', { class: 'btn btn-primary btn-lg btn-block', onclick: () => pick(m0) }, icon('calendar', 20), `От 1 ${month} (целия месец)`),
      today !== m0 && h('button', { class: 'btn btn-ghost btn-lg btn-block', onclick: () => pick(today) }, `От днес, ${fmtDate(today)}`),
      h('div', { class: 'row gap' }, date, h('button', { class: 'btn btn-outline', onclick: () => date.value && pick(date.value > today ? today : date.value) }, 'От дата')),
      h('p', { class: 'muted small' }, 'Дните преди тази дата остават със старите стойности.'));
  });
}

const upcomingCount = (data) => upcomingReservations(data.reservations || []).length;
const refLabel = () => { const r = store.myReferrals(); return r ? `${r.count} поканени` : ''; };

// Горната част: компактна корица – снимката на колата, върху нея профилната снимка, името и колата.
// Отдолу един бутон „Промени данните“ (лични данни, колата, снимките).
export function profileCover(user, d) {
  const car = d.car || {};
  const initials = user.name.split(' ').map((x) => x[0]).slice(0, 2).join('');
  const photo = async (key) => {
    const img = await pickImage({ max: key === 'carPhoto' ? 1200 : 400, aspect: key === 'carPhoto' ? 16 / 10 : 1, title: key === 'carPhoto' ? 'Изрежи снимката на колата' : 'Изрежи профилната снимка' });
    if (!img) return;
    try { store.updateProfile({ [key]: img }); toast(key === 'carPhoto' ? 'Снимката на колата е сменена' : 'Профилната снимка е сменена'); }
    catch { toast('Снимката е твърде голяма', 'err'); }
  };
  const who = [user.city, user.company].filter(Boolean).join(' · ');
  const carLine = [car.code && `Код ${car.code}`, car.plate, [car.model, car.year].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
  const edit = () => openSheet((close) => {
    const opt = (ic, title, sub, fn) => h('button', { class: 'list-btn', onclick: () => { close(); fn(); } },
      h('span', { class: 'l-ic' }, icon(ic, 18)), h('span', { class: 'grow' }, title, h('small', { class: 'muted', style: { display: 'block', fontWeight: 500 } }, sub)), icon('right', 18));
    return h('div', { class: 'form' }, sheetHead('Промени данните', close),
      opt('user', 'Лични данни', 'Име, телефон, град и фирма', () => editAccount(store.currentUser() || user)),
      opt('car', 'Колата', 'Код, номер, марка, модел, година – или снимай талона', () => { location.hash = '#/car'; }),
      opt('camera', d.carPhoto ? 'Смени снимката на колата' : 'Добави снимка на колата', 'Изрязваш я с пръст', () => photo('carPhoto')),
      opt('user', d.photo ? 'Смени профилната снимка' : 'Добави профилна снимка', 'Показва се върху колата', () => photo('photo')));
  });
  // всеки ред се събира на един ред: ако е дълъг, буквите леко се смаляват (без „…“); ако пак не стига – пренася се
  const fit = (el) => requestAnimationFrame(() => { if (!el.isConnected) return; let f = parseFloat(getComputedStyle(el).fontSize); while (el.scrollWidth > el.clientWidth + 1 && f > 11) { f -= 0.5; el.style.fontSize = f + 'px'; } if (el.scrollWidth > el.clientWidth + 1) el.classList.add('wrap'); });
  // Като профил във Facebook: снимката на колата е корица от край до край, отдолу заоблен лист,
  // голямата кръгла профилна снимка застъпва корицата в средата, името, колата, градът и два бутона.
  const own = d.carType !== 'rent';
  const sec = h('section', { class: 'cover6' },
    h('div', { class: cx('c6-cover', !d.carPhoto && 'empty') },
      d.carPhoto && h('img', { src: d.carPhoto, alt: 'Колата' }),
      h('button', { class: 'c6-cam', type: 'button', 'aria-label': d.carPhoto ? 'Смени снимката на колата' : 'Добави снимка на колата', onclick: () => photo('carPhoto') }, icon('camera', 18), !d.carPhoto && h('span', null, 'Снимка на колата'))),
    h('div', { class: 'c6-sheet' },
      h('button', { class: 'c6-ava', type: 'button', 'aria-label': 'Смени профилната снимка', onclick: () => photo('photo') },
        d.photo ? h('img', { src: d.photo, alt: '' }) : h('span', null, initials),
        h('i', null, icon('camera', 16))),
      h('div', { class: 'c6-name', role: 'heading', 'aria-level': '1' }, user.name),
      h('p', { class: 'c6-car' }, h('span', null, carLine || 'Добави кода, номера и модела на колата')),
      who && h('p', { class: 'c6-who' }, icon('pin', 16), h('span', null, who)),
      h('div', { class: 'c6-btns' },
        h('button', { class: 'c6-btn primary', type: 'button', onclick: edit }, icon('edit', 18), 'Промени данните'),
        h('a', { class: 'c6-btn', href: own ? '#/vehicle' : '#/car' }, icon(own ? 'tool' : 'car', 18), own ? 'Колата ми' : 'Колата'))));
  setTimeout(() => sec.querySelectorAll('.c6-name, .c6-car > span, .c6-who > span').forEach(fit), 0);
  return sec;
}

// Вход с Face ID / пръст на този телефон (показва се само ако телефонът може)
function faceRow() {
  const box = h('div');
  passkeySupported().then((ok) => {
    if (!ok) return;
    const draw = () => {
      const on = passkeyOn();
      box.replaceChildren(h('div', { class: 'list-btn' }, h('span', { class: 'l-ic' }, icon('faceid', 18)),
        h('span', { class: 'grow' }, `Вход с ${faceLabel()}`, h('small', { class: 'muted', style: { display: 'block', fontWeight: 500 } }, on ? 'Включен на този телефон' : 'Без имейл и парола')),
        h('button', { class: cx('toggle', on && 'on'), role: 'switch', 'aria-checked': String(on), 'aria-label': `Вход с ${faceLabel()}`, onclick: async (e) => {
          const btn = e.currentTarget; btn.disabled = true;
          const r = on ? await disablePasskey() : await enablePasskey();
          toast(r.error || (on ? 'Изключено' : `Входът с ${faceLabel()} е включен`), r.error ? 'err' : undefined);
          draw();
        } })));
    };
    draw();
  });
  return box;
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

// Напомняне за смяната и седмичен отчет – идват на телефона, дори приложението да е затворено
function pushRows(draw) {
  const types = pushTypes(); const why = pushBlocker();
  const row = (k, title, sub) => {
    const on = types.includes(k);
    return h('div', { class: 'setting', style: { padding: '0 0 12px' } },
      h('div', { class: 'grow' }, h('div', { class: 'setting-title' }, title), h('div', { class: 'setting-sub' }, sub)),
      h('button', { class: cx('toggle', on && 'on'), role: 'switch', 'aria-checked': String(on), 'aria-label': title, onclick: async (e) => {
        const next = on ? types.filter((x) => x !== k) : [...new Set([...types, k])];
        const btn = e.currentTarget; btn.disabled = true;
        const r = await setPushTypes(next);
        if (r.error) toast(r.error, 'err'); else toast(on ? 'Изключено' : 'Включено');
        draw();
      } }));
  };
  return h('div', null,
    row('remind', 'Напомняне за смяната', 'В 10:00 и 20:00, ако за вчера няма записана смяна'),
    row('weekly', 'Седмичен отчет', 'В понеделник сутрин: колко изкара миналата седмица'),
    row('msg', 'Съобщения от нас', 'Новини и отговори на въпросите ти'),
    why && h('p', { class: 'muted small', style: { margin: '-4px 0 12px' } }, why));
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

function editAccount(user) {
  openSheet((close) => {
    const name = h('input', { class: 'input', value: user.name });
    const phone = h('input', { class: 'input', type: 'tel', value: user.phone || '' });
    const cc = cityCompanyPicker({ city: user.city, company: user.company });
    const err = h('p', { class: 'err' });
    return h('div', { class: 'form' },
      sheetHead('Лични данни', close),
      field('Име', name, null, true), field('Телефон', phone),
      cc.el,
      err,
      h('button', { class: 'btn btn-page btn-lg', onclick: () => {
        const v = cc ? cc.value() : { city: user.city, company: user.company };
        if (!name.value.trim()) { err.textContent = 'Въведи име'; return; }
        if (!v.city) { err.textContent = 'Избери град'; return; }
        if (!v.company) { err.textContent = 'Избери фирма'; return; }
        store.updateAccount({ name: name.value, phone: phone.value, ...v });
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
      h('button', { class: 'btn btn-page btn-lg', onclick: async () => { const r = await store.changePassword(a.value, b.value); if (r.error) { err.textContent = r.error; return; } close(); toast('Паролата е сменена'); } }, 'Смени'),
      h('button', { class: 'link-btn', style: { alignSelf: 'center', marginTop: '4px' }, onclick: () => { close(); setTimeout(forgotPw, 250); } }, 'Забравих текущата парола'));
  });
}
// Забравена текуща парола, докато си вътре: линк по имейла или код по SMS – като от входа
async function forgotPw() {
  const u = store.currentUser(); if (!u) return;
  const id = u.signup === 'phone' || !u.email ? u.phone : u.email;
  const r = await store.forgotPassword(id);
  if (r.error) { toast(r.error, 'err'); return; }
  openSheet((close) => {
    if (r.mode === 'sms') {
      const code = h('input', { class: 'input', inputmode: 'numeric', maxlength: 4, placeholder: '4 цифри', autocomplete: 'one-time-code' });
      const p1 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', placeholder: 'Поне 6 символа' });
      const err = h('p', { class: 'err' });
      return h('div', { class: 'form' },
        sheetHead('Нова парола', close, `Пратихме SMS с код на ${u.phone}.`),
        r.demoCode ? h('p', { class: 'sms-hint small' }, 'Пробен режим – кодът е ', h('b', null, r.demoCode)) : null,
        field('Код от SMS', code), field('Нова парола', p1, 'Поне 6 символа'), err,
        h('button', { class: 'btn btn-page btn-lg', onclick: async () => {
          if (p1.value.length < 6) { err.textContent = 'Паролата трябва да е поне 6 символа'; return; }
          const x = await store.resetPasswordSms(u.phone, code.value, p1.value);
          if (x.error) { err.textContent = x.error; return; }
          close(); store.logout(); location.hash = '/login'; toast('Паролата е сменена. Влез с новата.');
        } }, 'Смени паролата'));
    }
    return h('div', { class: 'form' },
      sheetHead(r.mode === 'mail' ? 'Провери имейла си' : 'Получихме молбата ти', close),
      h('p', { class: 'muted' }, r.mode === 'mail'
        ? `Пратихме линк за нова парола на ${u.email}. Линкът работи 1 час. Не го виждаш? Провери в „Спам“.`
        : 'Ще ти сменим паролата и ще ти се обадим на телефона от профила – обикновено до няколко часа.'),
      h('button', { class: 'btn btn-page btn-lg', onclick: close }, 'Добре'));
  });
}

function delAccount() {
  confirmSheet({ title: 'Изтриване на акаунта?', text: 'Всички смени, разходи и настройки ще бъдат изтрити завинаги. Това не може да се върне.', okLabel: 'Изтрий всичко', danger: true,
    onOk: async () => { const r = await store.deleteMyAccount(); if (r?.error) { toast(r.error); return; } location.hash = '/login'; } });
}
export { CAR_TYPES, FUELS, money };
