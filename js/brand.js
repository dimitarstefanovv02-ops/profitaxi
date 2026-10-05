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
  h('img', { class: 'one-logo', src: '/icons/one-red.svg', alt: 'One Taxi' }),
  h('span', { class: 'x', 'aria-hidden': 'true' }, '×'),
  h('img', { class: 'pt-logo', src: '/icons/icon-192.png', alt: 'ProfiTaxi' }),
  h('span', { class: 'collab-text' }, h('b', null, 'Profi', h('em', null, 'Taxi')), h('span', null, 'за шофьорите на One Taxi')));
