// Издания на приложението. Обикновеното е ProfiTaxi (/app).
// /onetaxi е изданието за шофьорите на One Taxi Пловдив – същото приложение,
// в цветовете на One, само за техните шофьори.
import { h } from './util.js';

export const ONE = {
  key: 'one',
  name: 'One Taxi',
  city: 'Пловдив',
  company: 'ONE Такси – 032 22 22',
  // Кодът, който One Taxi дава на своите шофьори при регистрация (сменя се тук)
  accessCode: 'ONE2026',
  base: '/onetaxi',
  icon: '/icons/one-192.png',
};

export const BRAND = document.documentElement.dataset.brand === 'one' ? ONE : null;
export const appBase = () => (BRAND ? BRAND.base : '/app');
export const isBrandUser = (u) => !BRAND || (u && u.company === BRAND.company);

// Марката горе на входа: „One × ProfiTaxi“
export const collabMark = () => h('a', { class: 'collab', href: ONE.base, 'aria-label': 'One Taxi × ProfiTaxi' },
  h('img', { class: 'collab-mark', src: '/icons/one-collab-mark.svg', alt: '' }),
  h('span', { class: 'collab-text' }, h('b', null, 'One ', h('i', null, '×'), ' Profi', h('em', null, 'Taxi')), h('span', null, 'за шофьорите на One Taxi Пловдив')));

// Тънка лента горе на всяка страница – напомня за партньорството
export const collabBar = () => h('div', { class: 'collab-bar', role: 'banner' },
  h('img', { src: '/icons/one-collab-mark.svg', alt: '', width: 51, height: 28 }),
  h('span', null, h('b', null, 'One'), h('i', null, '×'), h('b', null, 'Profi', h('em', null, 'Taxi'))),
  h('small', null, 'партньори'));

// Въвеждащ ефект за One изданието: двете марки летят една към друга, сблъскват се
// със светкавица и се сливат в общото лого. Веднъж на посещение, прескача се с натискане.
export function oneIntro() {
  if (!BRAND) return;
  let seen = null; try { seen = sessionStorage.getItem('profitaxi.oneIntro'); } catch { /* */ }
  if (seen || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  try { sessionStorage.setItem('profitaxi.oneIntro', '1'); } catch { /* */ }
  const word = 'One × ProfiTaxi'.split('').map((ch, i) => {
    const cls = ch === '×' ? 'oi-x' : i >= 11 ? 'oi-red' : '';
    return `<i class="${cls}" style="--i:${i}">${ch === ' ' ? '&nbsp;' : ch}</i>`;
  }).join('');
  const el = document.createElement('div');
  el.id = 'one-intro'; el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <div class="oi-stage">
      <div class="oi-pair">
        <img class="oi-one" src="/icons/one-red.svg" alt="">
        <img class="oi-pt" src="/icons/icon.svg" alt="">
        <span class="oi-flash"></span><span class="oi-ring"></span><span class="oi-ring r2"></span>
      </div>
      <div class="oi-word">${word}</div>
      <div class="oi-sub">за шофьорите на One Taxi Пловдив</div>
    </div>`;
  document.body.appendChild(el);
  const done = () => { el.classList.add('out'); setTimeout(() => el.remove(), 600); };
  el.addEventListener('click', done);
  setTimeout(done, 3300);
}
