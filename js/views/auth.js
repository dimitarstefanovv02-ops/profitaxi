// Вход, регистрация, забравена парола

import { h, fill, icon } from '../util.js';
import * as store from '../store.js';
import { toast, field } from '../ui.js';

export const brand = () => h('div', { class: 'brand' },
  h('div', { class: 'brand-mark' }, icon('car', 24)),
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
  const agree = h('input', { type: 'checkbox', style: { width: '22px', height: '22px', accentColor: 'var(--accent)' } });
  const err = h('p', { class: 'err', role: 'alert' });
  const submit = (e) => {
    e.preventDefault();
    if (!agree.checked) { err.textContent = 'Приеми общите условия, за да продължиш'; return; }
    const r = store.register({ name: name.value, email: email.value, password: pw.value, phone: phone.value });
    if (r.error) { err.textContent = r.error; return; }
    toast('Акаунтът е създаден');
    go('/onboarding');
  };
  return h('div', { class: 'auth' },
    h('a', { class: 'back', href: '#/login' }, icon('left', 20), 'Назад'),
    h('div', { class: 'auth-hero', style: { margin: '18px 0 22px' } },
      h('h1', null, 'Нов акаунт'),
      h('p', null, '14 дни безплатно. Без карта.')),
    h('form', { class: 'form', onsubmit: submit },
      field('Име', name),
      field('Имейл', email),
      field('Телефон', phone, 'По желание'),
      field('Парола', pw),
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
