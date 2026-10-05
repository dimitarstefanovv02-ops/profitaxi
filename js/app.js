// ProfiTaxi – приложение за шофьора: маршрути, проверка за достъп, навигация

import { h, icon, clear, cx, fmtTimer } from './util.js';
import * as store from './store.js';
import { applyTheme } from './ui.js';
import { checkNotifications } from './notify.js';
import { loginView, registerView, forgotView } from './views/auth.js';
import { onboardingView } from './views/onboarding.js';
import { homeView } from './views/home.js';
import { shiftsView } from './views/shifts.js';
import { shiftEditorView } from './views/shift.js';
import { statsView } from './views/stats.js';
import { costsView } from './views/costs.js';
import { profileView } from './views/profile.js';
import { reservationsView } from './views/reservations.js';
import { inviteView } from './views/invite.js';
import { calendarView } from './views/calendar.js';
import { startTour, closeTour, DRIVER_TOUR } from './tour.js';
import { showDueSheet } from './notify.js';

applyTheme();

const PUBLIC = { '/login': loginView, '/register': registerView, '/forgot': forgotView };
const PRIVATE = {
  '/home': homeView, '/shifts': shiftsView, '/shift': shiftEditorView, '/stats': statsView,
  '/costs': costsView, '/profile': profileView, '/onboarding': onboardingView,
  '/reservations': reservationsView, '/invite': inviteView, '/calendar': calendarView,
};
// път, икона, надпис, цвят на страницата, цвят на текста върху него
const TABS = [
  ['/home', 'home', 'Начало', '#FFC21A', '#1C1500'],
  ['/shifts', 'list', 'Смени', '#3D7BFF', '#fff'],
  ['/stats', 'chart', 'Статистика', '#8B5CF6', '#fff'],
  ['/costs', 'wallet', 'Разходи', '#FF6A3D', '#fff'],
  ['/profile', 'user', 'Профил', '#14B8A6', '#fff'],
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
  document.documentElement.dataset.page = route.name.slice(1);

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
  const tab = TABS.some(([p]) => p === route.name) || ['/reservations', '/invite', '/calendar'].includes(route.name);
  mount(app, view(ctx), route, tab);
  // Разходка: веднъж след регистрация или когато е пусната от Профил → Помощ
  let tourNow = false; try { tourNow = sessionStorage.getItem('profitaxi.tourNow') === '1'; } catch { /* */ }
  if (route.name === '/home' && (tourNow || ctx.data.profile.tour === 'pending')) {
    try { sessionStorage.removeItem('profitaxi.tourNow'); } catch { /* */ }
    notified = true;
    setTimeout(() => { if (location.hash.startsWith('#/home')) startTour(DRIVER_TOUR, { onDone: () => { if (store.getProfile()?.tour === 'pending') store.updateProfile({ tour: 'done' }); } }); }, 500);
  }
  if (!notified) { notified = true; checkNotifications(ctx.data); if (route.name === '/home') setTimeout(() => showDueSheet(store.myData(), go), 600); }
}
let notified = false;

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
  return h('nav', { class: 'nav', 'aria-label': 'Основно меню' }, TABS.map(([path, ic, label, c, ink]) =>
    h('a', { href: '#' + path, class: cx(active === path && 'on'), 'aria-current': active === path ? 'page' : null, style: { '--n-c': c, '--n-ink': ink } },
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
// Проверка за известия на всеки час, докато приложението е отворено
setInterval(() => { const u = store.currentUser(); if (u && store.accessState(u) === 'ok') checkNotifications(store.myData()); }, 3600000);

let pending = false;
window.addEventListener('hashchange', render);
const busy = () => { const a = document.activeElement; return !!document.querySelector('.sheet-wrap, .tour') || (a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)); };
store.onChange(() => { if (busy()) pending = true; else render(); });
document.addEventListener('focusout', () => setTimeout(() => { if (pending && !busy()) { pending = false; render(); } }, 0));
window.addEventListener('profitaxi:sheetclosed', () => { if (pending && !busy()) { pending = false; render(); } });

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
render();

addEventListener('hashchange', () => closeTour());
