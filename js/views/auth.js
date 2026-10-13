// Вход, регистрация, забравена парола

import { h, fill, icon, cx } from '../util.js';
import { CAR_TYPES } from '../constants.js';
import { cityCompanyPicker } from './cityPicker.js';
import * as store from '../store.js';
import { toast, field, segmented } from '../ui.js';
import { passkeySupported, loginWithPasskey, faceLabel, passkeyOn, shouldOffer, enablePasskey, markOffered } from '../passkey.js';

export const brand = () => h('a', { class: 'brand', href: '/', style: { textDecoration: 'none' } },
  h('img', { class: 'brand-logo', src: '/icons/icon-192.png', alt: '' }),
  h('span', { class: 'brand-name' }, 'Чисто'));

const input = (attrs) => h('input', { class: 'input', ...attrs });

export function loginView({ go }) {
  const email = input({ type: 'text', autocomplete: 'username', inputmode: 'email', autocapitalize: 'off', spellcheck: 'false', placeholder: 'ime@mail.bg или 0888 123 456', required: true });
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
      field('Имейл или телефон', email),
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
      h('button', { type: 'button', class: 'btn btn-ghost',
      onclick: async (e) => {
        const b = e.currentTarget; b.disabled = true;
        const r = await store.sendSmsCode(phone.value); b.disabled = false; if (r.error) { err.textContent = r.error; return; }
        err.textContent = ''; smsSent = true; lastCode = r.demoCode || ''; drawSms(); if (!store.live()) toast(`Демо: кодът от SMS е ${r.demoCode}`); else toast('Пратихме ти SMS с код'); setTimeout(() => smsCode.focus(), 50);
      } }, smsSent ? 'Изпрати пак' : 'Изпрати код по SMS'),
      smsSent && smsCode,
      smsSent && store.live() && lastCode && h('div', { class: 'sms-hint small' }, `Пробен режим – кодът е `, h('b', null, lastCode)),
      smsSent && h('button', { type: 'button', class: 'btn btn-page', onclick: async () => {
        const r = await store.verifySmsCode(phone.value, smsCode.value); if (r.error) { err.textContent = r.error; return; }
        err.textContent = ''; phoneOk = true; drawSms();
      } }, 'Потвърди')));
  // полето за телефон: с код по SMS, ако е включен от админа (настройката идва от сървъра)
  const phoneWrap = h('div');
  // Регистрация с имейл ИЛИ с телефон: избраното е задължително и се потвърждава (линк по имейла / код по SMS),
  // другото е по желание
  let by = 'email';
  const byBox = h('div'), idWrap = h('div'), otherWrap = h('div');
  const drawPhone = () => {
    byBox.replaceChildren(segmented({ email: 'С имейл', phone: 'С телефон' }, by, (k) => { by = k; drawPhone(); }, { page: true }));
    if (by === 'phone') {
      fill(idWrap, store.phoneCodeOn() ? field('Телефон', h('div', { class: 'form', style: { gap: '8px' } }, phone, smsBox), 'Ще ти пратим код по SMS. С него влизаш в профила.', true) : field('Телефон', phone, 'С него влизаш в профила.', true));
      fill(otherWrap, field('Имейл', email, 'По желание'));
    } else {
      fill(idWrap, field('Имейл', email, store.emailVerifyOn() ? 'Ще ти пратим линк за потвърждение. С него влизаш в профила.' : 'С него влизаш в профила.', true));
      fill(otherWrap, field('Телефон', phone, 'По желание – за да могат да ти се обаждат'));
    }
  };
  drawPhone(); store.loadVerifyCfg().then(drawPhone);
  phoneWrap.append(idWrap);
  const pw = input({ type: 'password', autocomplete: 'new-password', placeholder: 'Поне 6 символа' });
  const refFromLink = new URLSearchParams(location.hash.split('?')[1] || '').get('ref') || '';
  const ref = input({ placeholder: 'напр. IVAN-7K2Q', value: refFromLink, autocapitalize: 'characters', style: { textTransform: 'uppercase' } });
  const promoFromLink = new URLSearchParams(location.hash.split('?')[1] || '').get('promo') || '';
  const promo = input({ placeholder: 'напр. START2', value: promoFromLink, autocapitalize: 'characters', style: { textTransform: 'uppercase' } });
  // Код за обща кола (от собственика) – идва и от линка за покана
  let joinPre = ''; try { joinPre = localStorage.getItem('profitaxi.joinCode') || ''; } catch { /* */ }
  const carCode = input({ placeholder: 'напр. 56JRLJMIQL', value: joinPre, autocapitalize: 'characters', style: { textTransform: 'uppercase' } });
  const cc = cityCompanyPicker();
  let carType = '';
  // Вид акаунт: шофьор или собственик на коли, който сам не кара
  let kind = 'driver';
  const kindBox = h('div');
  const carGroup = h('div');
  const drawKind = () => {
    fill(kindBox, h('div', { class: 'option-grid' },
      h('button', { type: 'button', class: cx('option', kind === 'driver' && 'on'), onclick: () => { kind = 'driver'; drawKind(); } }, icon('car', 24), 'Шофьор', h('small', null, 'Карам и следя колко ми остава')),
      h('button', { type: 'button', class: cx('option', kind === 'fleet' && 'on'), onclick: () => { kind = 'fleet'; drawKind(); } }, icon('key', 24), 'Собственик на коли', h('small', null, 'Колите ми карат други шофьори'))));
    carGroup.style.display = kind === 'fleet' ? 'none' : '';
  };
  const carBox = h('div');
  const drawCar = () => fill(carBox, h('div', { class: 'option-grid' }, Object.entries(CAR_TYPES).map(([k, v]) =>
    h('button', { type: 'button', class: cx('option', carType === k && 'on'), onclick: () => { carType = k; drawCar(); } }, icon(v.icon, 24), v.label, h('small', null, v.hint)))));
  drawCar();
  drawKind();
  drawSms();
  const agree = h('input', { type: 'checkbox', style: { width: '22px', height: '22px', accentColor: 'var(--accent)', flex: 'none' } });
  const err = h('p', { class: 'err', role: 'alert' });
  const submit = async (e) => {
    e.preventDefault();
    const v = cc.value();
    // Кодът за кола е 10 знака; ако е сложен в полето за промо код – разпознаваме го сами
    let joinCode = carCode.value.trim().toUpperCase(), promoCode = promo.value.trim().toUpperCase();
    if (!joinCode && /^[A-Z0-9]{10}$/.test(promoCode)) { joinCode = promoCode; promoCode = ''; promo.value = ''; carCode.value = joinCode; }
    // проверки в реда на формата
    const checks = [
      [!name.value.trim(), 'Въведи име'],
      [by === 'email' && !/^\S+@\S+\.\S+$/.test(email.value), 'Невалиден имейл'],
      [by === 'phone' && !!email.value.trim() && !/^\S+@\S+\.\S+$/.test(email.value), 'Невалиден имейл'],
      [pw.value.length < 6, 'Паролата трябва да е поне 6 символа'],
      [!v.city, 'Избери град'],
      [!v.company, 'Избери фирма или напиши името ѝ'],
      [kind === 'driver' && !carType, 'Избери каква е колата'],
      [by === 'phone' && !phone.value.trim(), 'Въведи телефон'],
      [by === 'phone' && store.phoneCodeOn() && !phoneOk, 'Потвърди телефона с кода от SMS'],
      [!store.live() && !!promoCode && !!store.checkPromo(promoCode).error, store.checkPromo(promoCode).error],
    ];
    const bad = checks.find(([c]) => c);
    if (bad) { err.textContent = bad[1]; return; }
    if (!agree.checked) { err.textContent = 'Приеми общите условия, за да продължиш'; return; }
    const btn = e.target.querySelector('button[type=submit]'); if (btn) btn.disabled = true;
    try { if (joinCode) localStorage.setItem('profitaxi.joinCode', joinCode); else localStorage.removeItem('profitaxi.joinCode'); } catch { /* */ } // след първата настройка влизаш в колата
    const r = await store.register({ by, name: name.value, email: email.value.trim(), password: pw.value, phone: phone.value.trim(), city: v.city, company: v.company, carType: kind === 'fleet' ? 'own' : carType, accountType: kind, refCode: ref.value, promo: promoCode });
    if (btn) btn.disabled = false;
    if (r.error) { err.textContent = r.error; return; }
    go(kind === 'fleet' ? '/fguide?walk=1&first=1' : joinCode ? '/home' : '/guide?first=1');
  };
  const group = (ic, title, ...kids) => h('div', { class: 'reg-group' }, h('h3', null, h('span', { class: 't-ic' }, icon(ic, 15)), title), ...kids);
  return h('div', { class: 'auth' },
    h('a', { class: 'back', href: '#/login' }, icon('left', 20), 'Назад'),
    h('div', { class: 'auth-hero', style: { margin: '14px 0 20px' } },
      h('h1', null, 'Нов акаунт'),
      h('p', null, 'Безплатно по време на теста, без карта. Полетата със звездичка са задължителни.')),
    h('form', { class: 'form', onsubmit: submit, novalidate: true },
      group('key', 'Аз съм', kindBox),
      group('user', 'Акаунт',
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Регистрирай се'), byBox),
        field('Име', name, null, true),
        phoneWrap,
        field('Парола', pw, null, true),
        otherWrap,
        field('Промо код', promo, 'По желание – ако имаш код за отстъпка'),
        field('Код за кола', carCode, 'По желание – ако собственикът на колата ти е пратил код или линк')),
      group('target', 'Къде караш', cc.el),
      (carGroup.replaceChildren(group('car', 'Колата е', carBox)), carGroup),
      h('label', { class: 'row gap small' }, agree, h('span', null, 'Приемам ', h('a', { href: '/terms.html', target: '_blank' }, 'общите условия'), ' и ', h('a', { href: '/privacy.html', target: '_blank' }, 'политиката за поверителност'))),
      err,
      h('button', { class: 'btn btn-primary btn-xl', type: 'submit' }, 'Създай акаунт')),
    h('p', { class: 'auth-foot' }, 'Имаш акаунт? ', h('a', { href: '#/login' }, 'Вход')));
}

export function forgotView({ go } = {}) {
  const email = input({ type: 'text', autocomplete: 'username', inputmode: 'email', autocapitalize: 'off', spellcheck: 'false', placeholder: 'ime@mail.bg или 0888 123 456' });
  const box = h('div');
  const submit = async (e) => {
    e.preventDefault();
    const v = email.value.trim();
    if (v.includes('@') ? !/^\S+@\S+\.\S+$/.test(v) : v.replace(/\D/g, '').length < 10) { toast('Въведи имейл или мобилен телефон', 'err'); return; }
    const btn = e.target.querySelector('button[type=submit]'); if (btn) btn.disabled = true;
    const r = await store.forgotPassword(v);
    if (btn) btn.disabled = false;
    if (r.error) { toast(r.error, 'err'); return; }
    if (r.mode === 'sms') return fill(box, smsReset(v, r.demoCode));
    fill(box, r.mode === 'mail'
      ? h('div', { class: 'card' }, h('h2', null, 'Провери имейла си'),
        h('p', { class: 'muted', style: { marginTop: '6px' } }, `Ако има акаунт с ${v}, пратихме линк за нова парола. Линкът работи 1 час. Не го виждаш? Провери в „Спам“ / „Промоции“.`))
      : h('div', { class: 'card' },
        h('h2', null, 'Получихме молбата ти'),
        h('p', { class: 'muted', style: { marginTop: '6px' } }, `Ако има акаунт с ${v}, ще ти сменим паролата и ще ти се обадим на телефона от профила – обикновено до няколко часа.`)));
  };
  // по телефон: код по SMS + нова парола на същото място
  const smsReset = (phoneV, demo) => {
    const code = input({ inputmode: 'numeric', maxlength: 4, placeholder: '4 цифри', autocomplete: 'one-time-code' });
    const p1 = input({ type: 'password', autocomplete: 'new-password', placeholder: 'Поне 6 символа' });
    const p2 = input({ type: 'password', autocomplete: 'new-password', placeholder: 'Още веднъж' });
    const err = h('p', { class: 'err', role: 'alert' });
    return h('form', { class: 'form', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      if (p1.value.length < 6) { err.textContent = 'Паролата трябва да е поне 6 символа'; return; }
      if (p1.value !== p2.value) { err.textContent = 'Паролите не съвпадат'; return; }
      const r = await store.resetPasswordSms(phoneV, code.value, p1.value);
      if (r.error) { err.textContent = r.error; return; }
      toast('Паролата е сменена. Влез с новата.'); (go || ((x) => { location.hash = x; }))('/login');
    } },
      h('div', { class: 'card' }, h('h2', null, 'Пратихме ти SMS'), h('p', { class: 'muted', style: { marginTop: '6px' } }, `Ако има акаунт с ${phoneV}, ще получиш код до минута. Въведи го и новата парола.`),
        demo ? h('p', { class: 'sms-hint small' }, 'Пробен режим – кодът е ', h('b', null, demo)) : null),
      field('Код от SMS', code), field('Нова парола', p1), field('Повтори паролата', p2), err,
      h('button', { class: 'btn btn-primary btn-xl', type: 'submit' }, 'Смени паролата'));
  };
  box.appendChild(h('form', { class: 'form', onsubmit: submit, novalidate: true },
    field('Имейл или телефон', email),
    h('button', { class: 'btn btn-primary btn-xl', type: 'submit' }, 'Поискай нова парола')));
  return h('div', { class: 'auth' },
    h('a', { class: 'back', href: '#/login' }, icon('left', 20), 'Назад'),
    h('div', { class: 'auth-hero', style: { margin: '18px 0 22px' } },
      h('h1', null, 'Забравена парола'),
      h('p', null, 'С имейл – ще ти пратим линк. С телефон – код по SMS.')),
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

// Линкът от писмото „Нова парола“: #/reset/<токен>
export function resetView({ go, route }) {
  const pw = input({ type: 'password', autocomplete: 'new-password', placeholder: 'Поне 6 символа' });
  const pw2 = input({ type: 'password', autocomplete: 'new-password', placeholder: 'Още веднъж' });
  const err = h('p', { class: 'err', role: 'alert' });
  const submit = async (e) => {
    e.preventDefault();
    if (pw.value.length < 6) { err.textContent = 'Паролата трябва да е поне 6 символа'; return; }
    if (pw.value !== pw2.value) { err.textContent = 'Паролите не съвпадат'; return; }
    const r = await store.resetPassword(route.param, pw.value);
    if (r.error) { err.textContent = r.error; return; }
    toast('Паролата е сменена. Влез с новата.'); go('/login');
  };
  return h('div', { class: 'auth' },
    h('div', { class: 'auth-hero', style: { margin: '18px 0 22px' } }, h('h1', null, 'Нова парола'), h('p', null, 'Задай нова парола за акаунта си.')),
    h('form', { class: 'form', onsubmit: submit, novalidate: true }, field('Нова парола', pw), field('Повтори паролата', pw2), err,
      h('button', { class: 'btn btn-primary btn-xl', type: 'submit' }, 'Запази паролата')));
}
// След линка „Потвърди имейла“
export function verifiedView({ go, route }) {
  const ok = route?.query?.get('ok') === '1';
  return h('div', { class: 'auth' },
    h('div', { class: 'auth-hero', style: { margin: '28px 0 22px' } },
      h('h1', null, ok ? 'Имейлът е потвърден' : 'Линкът не става'),
      h('p', null, ok ? 'Готово! Вече можеш сам да си смениш паролата, ако я забравиш.' : 'Линкът е изтекъл или вече е използван. Влез и натисни „Изпрати пак“.')),
    h('button', { class: 'btn btn-primary btn-xl btn-block', onclick: () => go(store.currentUser() ? '/home' : '/login') }, store.currentUser() ? 'Към приложението' : 'Вход'));
}

// Напомняне „Потвърди имейла си“ – на началния екран, докато не е потвърден
export function verifyBanner(user, redraw) {
  if (!user || user.emailVerified !== false) return null;
  let hidden = false; try { hidden = sessionStorage.getItem('profitaxi.verifyHide') === '1'; } catch { /* */ }
  if (hidden) return null;
  return h('section', { class: 'card verify-card' },
    h('div', { class: 'row gap', style: { alignItems: 'flex-start' } }, h('span', { class: 'vc-ic' }, icon('inbox', 20)),
      h('div', { class: 'grow' }, h('b', null, 'Потвърди имейла си'), h('p', { class: 'muted small' }, `Пратихме линк на ${user.email}. Така ще можеш сам да си смениш паролата.`))),
    h('div', { class: 'row gap', style: { marginTop: '10px' } },
      h('button', { class: 'btn btn-dark btn-sm', onclick: async () => { const r = await store.resendVerify(); toast(r.error || 'Пратихме ново писмо. Провери и в „Спам“.', r.error ? 'err' : undefined); } }, 'Изпрати пак'),
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { try { sessionStorage.setItem('profitaxi.verifyHide', '1'); } catch { /* */ } redraw && redraw(); } }, 'По-късно')));
}
