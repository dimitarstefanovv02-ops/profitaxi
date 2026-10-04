// Първоначална настройка след регистрация (4 кратки стъпки)

import { h, fill, icon, cx } from '../util.js';
import * as store from '../store.js';
import { carBlock, fuelBlock, dispatchBlock, goalBlock } from './carSettings.js';
import { toast } from '../ui.js';

export function onboardingView({ go, user }) {
  const d = store.getProfile();
  let step = 0;
  const root = h('div', { class: 'screen no-nav' });
  const steps = [
    { title: 'Каква е колата?', sub: 'Така знаем кои разходи имаш', body: () => carBlock(d, draw) },
    { title: 'С какво зареждаш?', sub: 'Полетата за зареждане ще са според избора', body: () => fuelBlock(d, draw) },
    { title: 'Плащаш ли ефир?', sub: 'Такса към диспечер или таксиметрова компания', body: () => dispatchBlock(d, draw) },
    { title: 'Цел за месеца', sub: 'Ще ти казваме колко остава и дали ще я стигнеш', body: () => goalBlock(d, draw) },
  ];
  function draw() {
    const s = steps[step];
    const last = step === steps.length - 1;
    fill(root, 
      h('div', { class: 'top' },
        step > 0 ? h('button', { class: 'back', onclick: () => { step--; draw(); } }, icon('left', 20), 'Назад') : h('span', { class: 'muted small' }, `Здравей, ${user.name.split(' ')[0]}`),
        h('span', { class: 'muted small' }, `${step + 1} от ${steps.length}`)),
      h('div', { class: 'steps' }, steps.map((_, i) => h('span', { class: cx(i <= step && 'on') }))),
      h('h1', { style: { fontFamily: 'var(--display)', letterSpacing: '-.03em' } }, s.title),
      h('p', { class: 'muted', style: { margin: '6px 0 20px' } }, s.sub),
      s.body(),
      h('div', { style: { marginTop: '28px' } },
        h('button', { class: 'btn btn-primary btn-xl', onclick: () => {
          if (!last) { step++; draw(); return; }
          store.updateProfile({ ...d, onboarded: true });
          toast('Готово, можеш да започнеш смяна');
          go('/home');
        } }, last ? 'Започни' : 'Напред'),
        !last && h('button', { class: 'btn btn-block', style: { marginTop: '6px', color: 'var(--muted)' }, onclick: () => { step++; draw(); } }, 'Пропусни')));
  }
  draw();
  return root;
}
