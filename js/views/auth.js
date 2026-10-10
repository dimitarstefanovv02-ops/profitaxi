// Вход, регистрация, забравена парола

import { h, fill, icon, cx } from '../util.js';
import { CAR_TYPES } from '../constants.js';
import { cityCompanyPicker } from './cityPicker.js';
import * as store from '../store.js';
import { toast, field } from '../ui.js';
import { passkeySupported, loginWithPasskey, faceLabel, passkeyOn, shouldOffer, enablePasskey, markOffered } from '../passkey.js';

export const brand = () => h('a', { class: 'brand', href: '/', style: { textDecoration: 'none' } },
  h('img', { class: 'brand-logo', src: '/icons/icon-192.png', alt: '' }),
  h('span', { class: 'brand-name' }, 'Profi', h('b', null, 'Taxi')));

const input = (attrs) => h('input', { class: 'input', ...attrs });

export function loginView({ go }) {
  const email = input({ type: 'email', autocomplete: 'email', inputmode: 'email', placeholder: 'ime@mail.bg', required: true });
  const pw = input({ type: 'password', autocomplete: 'current-password', placeholder: '••••••', required: true });
  const err = h('p', { class: 'err', role: 'alert' });
  const submit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]'); if (btn) btn.disabled = true;
    const r = await store.login(email.value, pw.value, {});
    if (btn) btn.disabled = false;
    if (r.error) { err.textContent = r.error; return; }
    go('/home');
    offerPasskey();
  };
  // Вход с Face ID / пръст – бутонът се показва, ако телефонът може
  const pkBox = h('div', { class: 'pk-login' });
  passkeySupported().then((ok) => {
    if (!ok) return;
    pkBox.append(h('button', { class: cx('btn btn-block', passkeyOn() ? 'btn-dark btn-xl' : 'btn-ghost btn-lg'), type: 'button', onclick: async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      const r = await loginWithPasskey({});
      btn.disabled = false;
      if (r.error) { err.textContent = r.error; return; }
      go('/home');
    } }, icon('faceid', 22), `Вход с ${faceLabel()}`));
  });
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
      pkBox,
      h('a', { href: '#/forgot', class: 'muted small', style: { textAlign: 'center' } }, 'Забравена парола')),
    !store.live() && h('div', { class: 'demo-box' },
      h('b', null, 'Демо версия. '), `Пробвай с готов профил: ivan@demo.bg / demo123. `,
      h('button', { type: 'button', onclick: fill }, 'Попълни')),
    h('p', { class: 'auth-foot' }, 'Нямаш акаунт? ', h('a', { href: '#/register' }, 'Регистрирай се')));
}

export function registerView({ go }) {
  const name = input({ autocomplete: 'name', placeholder: 'Иван Иванов' });
  const email = input({ type: 'email', autocomplete: 'email', inputmode: 'email', placeholder: 'ime@mail.bg' });
  const phone = input({ type: 'tel', autocomplete: 'tel', inputmode: 'tel', placeholder: '08xx xxx xxx', oninput: () => { phoneOk = false; drawSms(); } });
  // Телефонът се потвърждава с код по SMS – така един човек не може да ползва пробния период много пъти
  let phoneOk = false, smsSent = false, lastCode = '';
  const smsCode = input({ inputmode: 'numeric', maxlength: 4, placeholder: '4 цифри', autocomplete: 'one-time-code' });
  const smsBox = h('div', { class: 'sms-box' });
  const drawSms = () => fill(smsBox, phoneOk
    ? h('div', { class: 'sms-ok' }, icon('check', 18), 'Телефонът е потвърден')
    : h('div', { class: 'sms-row' },
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => {
        const r = store.sendSmsCode(phone.value); if (r.error) { err.textContent = r.error; return; }
        err.textContent = ''; smsSent = true; drawSms(); lastCode = r.demoCode; drawSms(); if (!store.live()) toast(`Демо: кодът от SMS е ${r.demoCode}`);
      } }, smsSent ? (store.live() ? 'Нов код' : 'Изпрати пак') : (store.live() ? 'Вземи код' : 'Изпрати код по SMS')),
      smsSent && smsCode,
      smsSent && store.live() && lastCode && h('div', { class: 'sms-hint small' }, `В теста не пращаме SMS – кодът ти е `, h('b', null, lastCode)),
      smsSent && h('button', { type: 'button', class: 'btn btn-page', onclick: () => {
        const r = store.verifySmsCode(phone.value, smsCode.value); if (r.error) { err.textContent = r.error; return; }
        err.textContent = ''; phoneOk = true; drawSms();
      } }, 'Потвърди')));
  const pw = input({ type: 'password', autocomplete: 'new-password', placeholder: 'Поне 6 символа' });
  const refFromLink = new URLSearchParams(location.hash.split('?')[1] || '').get('ref') || '';
  const ref = input({ placeholder: 'напр. IVAN-7K2Q', value: refFromLink, autocapitalize: 'characters', style: { textTransform: 'uppercase' } });
  const promoFromLink = new URLSearchParams(location.hash.split('?')[1] || '').get('promo') || '';
  const promo = input({ placeholder: 'напр. START2', value: promoFromLink, autocapitalize: 'characters', style: { textTransform: 'uppercase' } });
  const cc = cityCompanyPicker();
  let carType = '';
  const carBox = h('div');
  const drawCar = () => fill(carBox, h('div', { class: 'option-grid' }, Object.entries(CAR_TYPES).map(([k, v]) =>
    h('button', { type: 'button', class: cx('option', carType === k && 'on'), onclick: () => { carType = k; drawCar(); } }, icon(v.icon, 24), v.label, h('small', null, v.hint)))));
  drawCar();
  drawSms();
  const agree = h('input', { type: 'checkbox', style: { width: '22px', height: '22px', accentColor: 'var(--accent)', flex: 'none' } });
  const err = h('p', { class: 'err', role: 'alert' });
  const submit = async (e) => {
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
      [!phone.value.trim(), 'Въведи телефон'],
      [store.phoneCodeOn() && !phoneOk, 'Потвърди телефона с кода от SMS'],
      [!store.live() && !!promo.value.trim() && !!store.checkPromo(promo.value).error, store.checkPromo(promo.value).error],
    ];
    const bad = checks.find(([c]) => c);
    if (bad) { err.textContent = bad[1]; return; }
    if (!agree.checked) { err.textContent = 'Приеми общите условия, за да продължиш'; return; }
    const btn = e.target.querySelector('button[type=submit]'); if (btn) btn.disabled = true;
    const r = await store.register({ name: name.value, email: email.value, password: pw.value, phone: phone.value, city: v.city, company: v.company, carType, refCode: ref.value, promo: promo.value });
    if (btn) btn.disabled = false;
    if (r.error) { err.textContent = r.error; return; }
    go('/guide?first=1');
  };
  const group = (ic, title, ...kids) => h('div', { class: 'reg-group' }, h('h3', null, h('span', { class: 't-ic' }, icon(ic, 15)), title), ...kids);
  return h('div', { class: 'auth' },
    h('a', { class: 'back', href: '#/login' }, icon('left', 20), 'Назад'),
    h('div', { class: 'auth-hero', style: { margin: '14px 0 20px' } },
      h('h1', null, 'Нов акаунт'),
      h('p', null, 'Безплатно по време на теста, без карта. Полетата със звездичка са задължителни.')),
    h('form', { class: 'form', onsubmit: submit, novalidate: true },
      group('user', 'Акаунт',
        field('Име', name, null, true),
        field('Имейл', email, null, true),
        field('Парола', pw, null, true),
        (store.phoneCodeOn() ? field('Телефон', h('div', { class: 'form', style: { gap: '8px' } }, phone, smsBox), 'Ще ти пратим код по SMS. Един телефон – един акаунт.', true) : field('Телефон', phone, 'Един телефон – един акаунт.', true)),
        field('Промо код', promo, 'По желание – ако имаш код за отстъпка')),
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
  const submit = async (e) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.value)) { toast('Въведи валиден имейл', 'err'); return; }
    const r = await store.forgotPassword(email.value);
    if (r.error) { toast(r.error, 'err'); return; }
    fill(box, h('div', { class: 'card' },
      h('h2', null, 'Получихме молбата ти'),
      h('p', { class: 'muted', style: { marginTop: '6px' } }, `Ако има акаунт с ${email.value}, ще ти сменим паролата и ще ти се обадим на телефона от профила – обикновено до няколко часа.`)));
  };
  box.appendChild(h('form', { class: 'form', onsubmit: submit },
    field('Имейл', email),
    h('button', { class: 'btn btn-primary btn-xl', type: 'submit' }, 'Поискай нова парола')));
  return h('div', { class: 'auth' },
    h('a', { class: 'back', href: '#/login' }, icon('left', 20), 'Назад'),
    h('div', { class: 'auth-hero', style: { margin: '18px 0 22px' } },
      h('h1', null, 'Забравена парола'),
      h('p', null, 'Ще ти изпратим линк, с който да зададеш нова.')),
    box);
}

// След вход с парола: веднъж предлагаме вход с Face ID на този телефон
async function offerPasskey() {
  if (!(await shouldOffer())) return;
  markOffered();
  const { confirmSheet } = await import('../ui.js');
  confirmSheet({ title: `Вход с ${faceLabel()}?`, text: `Следващия път влизаш само с ${faceLabel()} – без имейл и парола. Можеш да го изключиш от Лични данни.`, okLabel: 'Включи',
    onOk: async () => { const r = await enablePasskey(); toast(r.error || `Входът с ${faceLabel()} е включен`, r.error ? 'err' : undefined); } });
}
