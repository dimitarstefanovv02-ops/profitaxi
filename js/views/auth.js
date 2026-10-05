// Вход, регистрация, забравена парола

import { h, fill, icon, cx } from '../util.js';
import { INVITES_ON, CAR_TYPES } from '../constants.js';
import { cityCompanyPicker } from './cityPicker.js';
import * as store from '../store.js';
import { toast, field } from '../ui.js';

export const brand = () => h('a', { class: 'brand', href: '/', style: { textDecoration: 'none' } },
  h('img', { class: 'brand-logo', src: '/icons/icon-192.png', alt: '' }),
  h('span', { class: 'brand-name' }, 'ProfiTaxi'));

const input = (attrs) => h('input', { class: 'input', ...attrs });

export function loginView({ go }) {
  const email = input({ type: 'email', autocomplete: 'email', inputmode: 'email', placeholder: 'ime@mail.bg', required: true });
  const pw = input({ type: 'password', autocomplete: 'current-password', placeholder: '••••••', required: true });
  const err = h('p', { class: 'err', role: 'alert' });
  const submit = (e) => {
    e.preventDefault();
    const r = store.login(email.value, pw.value);
    if (r.error) { err.textContent = r.error; return; }
    go('/home');
  };
  const fill = () => { email.value = 'ivan@demo.bg'; pw.value = 'demo123'; };
  return h('div', { class: 'auth' },
    brand(),
    h('div', { class: 'auth-hero' },
      h('h1', null, 'Колко изкарваш наистина'),
      h('p', null, 'Приходи, разходи и чиста печалба от всяка смяна. Въвеждаш за секунди.')),
    h('form', { class: 'form', onsubmit: submit },
      field('Имейл', email),
      field('Парола', pw),
      err,
      h('button', { class: 'btn btn-primary btn-xl', type: 'submit' }, 'Вход'),
      h('a', { href: '#/forgot', class: 'muted small', style: { textAlign: 'center' } }, 'Забравена парола')),
    h('div', { class: 'demo-box' },
      h('b', null, 'Демо версия. '), 'Пробвай с готов профил: ivan@demo.bg / demo123. ',
      h('button', { type: 'button', onclick: fill }, 'Попълни')),
    h('p', { class: 'auth-foot' }, 'Нямаш акаунт? ', h('a', { href: '#/register' }, 'Регистрирай се')));
}

export function registerView({ go }) {
  const name = input({ autocomplete: 'name', placeholder: 'Иван Иванов' });
  const email = input({ type: 'email', autocomplete: 'email', inputmode: 'email', placeholder: 'ime@mail.bg' });
  const phone = input({ type: 'tel', autocomplete: 'tel', inputmode: 'tel', placeholder: '08xx xxx xxx' });
  const pw = input({ type: 'password', autocomplete: 'new-password', placeholder: 'Поне 6 символа' });
  const refFromLink = new URLSearchParams(location.hash.split('?')[1] || '').get('ref') || '';
  const ref = input({ placeholder: 'напр. IVAN-7K2Q', value: refFromLink, autocapitalize: 'characters', style: { textTransform: 'uppercase' } });
  const cc = cityCompanyPicker();
  let carType = '';
  const carBox = h('div');
  const drawCar = () => fill(carBox, h('div', { class: 'option-grid' }, Object.entries(CAR_TYPES).map(([k, v]) =>
    h('button', { type: 'button', class: cx('option', carType === k && 'on'), onclick: () => { carType = k; drawCar(); } }, icon(v.icon, 24), v.label, h('small', null, v.hint)))));
  drawCar();
  const agree = h('input', { type: 'checkbox', style: { width: '22px', height: '22px', accentColor: 'var(--accent)', flex: 'none' } });
  const err = h('p', { class: 'err', role: 'alert' });
  const submit = (e) => {
    e.preventDefault();
    const v = cc.value();
    // проверки в реда на формата
    const checks = [
      [!name.value.trim(), 'Въведи име'],
      [!/^\S+@\S+\.\S+$/.test(email.value), 'Невалиден имейл'],
      [pw.value.length < 6, 'Паролата трябва да е поне 6 символа'],
      [!v.city, 'Избери град'],
      [!v.company, 'Избери фирма или напиши името ѝ'],
      [!carType, 'Избери каква е колата'],
    ];
    const bad = checks.find(([c]) => c);
    if (bad) { err.textContent = bad[1]; return; }
    if (!agree.checked) { err.textContent = 'Приеми общите условия, за да продължиш'; return; }
    const r = store.register({ name: name.value, email: email.value, password: pw.value, phone: phone.value, city: v.city, company: v.company, carType, refCode: ref.value });
    if (r.error) { err.textContent = r.error; return; }
    toast('Акаунтът е създаден');
    go('/onboarding');
  };
  const group = (ic, title, ...kids) => h('div', { class: 'reg-group' }, h('h3', null, h('span', { class: 't-ic', style: { '--pc': '#FFC21A' } }, icon(ic, 15)), title), ...kids);
  return h('div', { class: 'auth' },
    h('a', { class: 'back', href: '#/login' }, icon('left', 20), 'Назад'),
    h('div', { class: 'auth-hero', style: { margin: '14px 0 20px' } },
      h('h1', null, 'Нов акаунт'),
      h('p', null, '14 дни безплатно, без карта. Полетата със звездичка са задължителни.')),
    h('form', { class: 'form', onsubmit: submit, novalidate: true },
      group('user', 'Акаунт',
        field('Име', name, null, true),
        field('Имейл', email, null, true),
        field('Парола', pw, null, true),
        field('Телефон', phone, 'По желание'),
        INVITES_ON && field('Код за покана', ref, refFromLink ? 'Поканен си от колега' : 'По желание, ако колега ти е дал код')),
      group('target', 'Къде караш', cc.el),
      group('car', 'Колата е', carBox),
      h('label', { class: 'row gap small' }, agree, h('span', null, 'Приемам ', h('a', { href: '/terms.html', target: '_blank' }, 'общите условия'), ' и ', h('a', { href: '/privacy.html', target: '_blank' }, 'политиката за поверителност'))),
      err,
      h('button', { class: 'btn btn-primary btn-xl', type: 'submit' }, 'Създай акаунт')),
    h('p', { class: 'auth-foot' }, 'Имаш акаунт? ', h('a', { href: '#/login' }, 'Вход')));
}

export function forgotView() {
  const email = input({ type: 'email', autocomplete: 'email', inputmode: 'email', placeholder: 'ime@mail.bg' });
  const box = h('div');
  const submit = (e) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.value)) { toast('Въведи валиден имейл', 'err'); return; }
    fill(box, h('div', { class: 'card' },
      h('h2', null, 'Провери пощата си'),
      h('p', { class: 'muted', style: { marginTop: '6px' } }, `Ако има акаунт с ${email.value}, ще получиш линк за нова парола.`),
      h('p', { class: 'faint small', style: { marginTop: '10px' } }, 'В демо версията не се изпращат имейли.')));
  };
  box.appendChild(h('form', { class: 'form', onsubmit: submit },
    field('Имейл', email),
    h('button', { class: 'btn btn-primary btn-xl', type: 'submit' }, 'Изпрати линк')));
  return h('div', { class: 'auth' },
    h('a', { class: 'back', href: '#/login' }, icon('left', 20), 'Назад'),
    h('div', { class: 'auth-hero', style: { margin: '18px 0 22px' } },
      h('h1', null, 'Забравена парола'),
      h('p', null, 'Ще ти изпратим линк, с който да зададеш нова.')),
    box);
}
