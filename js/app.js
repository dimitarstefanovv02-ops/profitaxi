// ProfiTaxi – приложение за шофьора: маршрути, проверка за достъп, навигация

import { h, icon, clear, cx, fmtTimer } from './util.js';
import * as store from './store.js';
import { applyTheme } from './ui.js';
import { loginView, registerView, forgotView } from './views/auth.js';
import { onboardingView } from './views/onboarding.js';
import { homeView } from './views/home.js';
import { shiftsView } from './views/shifts.js';
import { shiftEditorView } from './views/shift.js';
import { statsView } from './views/stats.js';
import { costsView } from './views/costs.js';
import { profileView } from './views/profile.js';

applyTheme();

const PUBLIC = { '/login': loginView, '/register': registerView, '/forgot': forgotView };
const PRIVATE = {
  '/home': homeView, '/shifts': shiftsView, '/shift': shiftEditorView, '/stats': statsView,
  '/costs': costsView, '/profile': profileView, '/onboarding': onboardingView,
};
const TABS = [
  ['/home', 'home', 'Начало'],
  ['/shifts', 'list', 'Смени'],
  ['/stats', 'chart', 'Статистика'],
  ['/costs', 'wallet', 'Разходи'],
  ['/profile', 'user', 'Профил'],
];

export const go = (path, replace) => {
  const url = '#' + path;
  if (replace) history.replaceState(null, '', url); else location.hash = path;
  render();
};

function parse() {
  const raw = location.hash.slice(1) || '/home';
  const [path, qs] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  return { name: '/' + (parts[0] || 'home'), param: parts[1], query: new URLSearchParams(qs || ''), raw };
}

let lastRaw = null;
function render() {
  const app = document.getElementById('app');
  const route = parse();
  const user = store.currentUser();

  if (!user) {
    const view = PUBLIC[route.name];
    if (!view) return go('/login', true);
    return mount(app, view({ go }), route, false);
  }
  if (PUBLIC[route.name]) return go('/home', true);

  const access = store.accessState(user);
  if (access !== 'ok') return mount(app, lockView(user, access), route, false);

  const profile = store.getProfile();
  if (!profile.onboarded && route.name !== '/onboarding') return go('/onboarding', true);
  const view = PRIVATE[route.name];
  if (!view) return go('/home', true);

  const ctx = { go, route, user, data: store.myData(), rerender: render };
  const tab = TABS.some(([p]) => p === route.name);
  mount(app, view(ctx), route, tab);
}

function mount(app, el, route, withNav) {
  const keepScroll = route.raw === lastRaw;
  const y = window.scrollY;
  clear(app).appendChild(el);
  if (withNav) app.appendChild(nav(route.name));
  if (keepScroll) window.scrollTo(0, y); else window.scrollTo(0, 0);
  lastRaw = route.raw;
  tickTimers();
}

function nav(active) {
  return h('nav', { class: 'nav', 'aria-label': 'Основно меню' }, TABS.map(([path, ic, label]) =>
    h('a', { href: '#' + path, class: cx(active === path && 'on'), 'aria-current': active === path ? 'page' : null },
      h('span', { class: 'nav-ic' }, icon(ic, 21)), label)));
}

function lockView(user, access) {
  const blocked = access === 'blocked';
  return h('div', { class: 'lock' },
    h('div', { class: 'empty-ic' }, icon(blocked ? 'lock' : 'clock', 28)),
    h('h1', null, blocked ? 'Достъпът е спрян' : 'Абонаментът изтече'),
    h('p', { class: 'muted' }, blocked
      ? 'Акаунтът ти е временно спрян. Свържи се с нас, за да го активираме отново.'
      : 'Данните ти са запазени. Поднови абонамента, за да продължиш да ги виждаш и въвеждаш.'),
    h('a', { class: 'btn btn-primary btn-lg', href: 'mailto:support@profitaxi.bg' }, icon('phone', 20), 'Свържи се с нас'),
    h('button', { class: 'btn btn-ghost btn-lg', onclick: () => { store.logout(); go('/login'); } }, 'Изход'));
}

// Живите таймери на активната смяна
function tickTimers() {
  document.querySelectorAll('[data-timer]').forEach((el) => { el.textContent = fmtTimer(Date.now() - new Date(el.dataset.timer).getTime()); });
}
setInterval(tickTimers, 1000);

window.addEventListener('hashchange', render);
let pending = false;
store.onChange(() => { if (document.querySelector('.sheet-wrap')) pending = true; else render(); });
window.addEventListener('profitaxi:sheetclosed', () => { if (pending && !document.querySelector('.sheet-wrap')) { pending = false; render(); } });
render();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
