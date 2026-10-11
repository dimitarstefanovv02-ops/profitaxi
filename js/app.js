// Чисто – приложение за шофьора: маршрути, проверка за достъп, навигация

import { h, icon, clear, cx, fmtTimer } from './util.js';
import * as store from './store.js';
import { applyTheme, toast, themeToggle } from './ui.js';
import './picker.js';
import { checkNotifications } from './notify.js';
import { loginView, registerView, forgotView } from './views/auth.js';
import { onboardingView } from './views/onboarding.js';
import { homeView } from './views/home.js';
import { shiftsView } from './views/shifts.js';
import { shiftEditorView } from './views/shift.js';
import { statsView } from './views/stats.js';
import { costsView } from './views/costs.js';
import { profileView, carView } from './views/profile.js';
import { reservationsView } from './views/reservations.js';
import { searchView } from './views/search.js';
import { moneyView } from './views/money.js';
import { meView } from './views/me.js';
import { ideasView } from './views/ideas.js';
import { helpView } from './views/help.js';
import { guideView } from './views/guide.js';
import { initArrange, onRender as arrangeRendered, resetZones, zonesOnPage } from './arrange.js';
import { vehicleView } from './views/vehicle.js';
import { calendarView } from './views/calendar.js';
import { startTour, closeTour, tourOpen, DRIVER_TOUR } from './tour.js';
import { tipFor } from './tips.js';
import { installBar, installBarVisible } from './quick.js';

applyTheme();

const PUBLIC = { '/login': loginView, '/register': registerView, '/forgot': forgotView };
const PRIVATE = {
  '/home': homeView, '/shifts': shiftsView, '/shift': shiftEditorView, '/stats': statsView,
  '/costs': costsView, '/profile': profileView, '/car': carView, '/onboarding': onboardingView,
  '/reservations': reservationsView, '/calendar': calendarView, '/search': searchView,
  '/money': moneyView, '/me': meView, '/ideas': ideasView, '/help': helpView, '/guide': guideView, '/vehicle': vehicleView,
};
// Долното меню: само 3 бутона. Подробните страници се отварят от тях и светят под „своя“ бутон.
const TABS = [
  ['/home', 'home', 'Днес'],
  ['/money', 'wallet', 'Пари'],
  ['/me', 'user', 'Профил'],
];
const PARENT = { '/shifts': '/money', '/stats': '/money', '/costs': '/money', '/profile': '/me', '/car': '/me', '/ideas': '/me', '/help': '/me', '/calendar': '/home', '/reservations': '/home', '/invite': '/me', '/guide': '/me', '/vehicle': '/me' };
const PARENT_LABEL = { '/home': 'Днес', '/money': 'Пари', '/me': 'Профил', '/profile': 'Лични данни' };

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
  if (!profile.onboarded && route.name !== '/onboarding' && route.name !== '/guide') return go('/onboarding', true);
  const view = PRIVATE[route.name];
  if (!view) return go('/home', true);

  if (!autoRan) { autoRan = true; store.runAutoReminders(); }
  const ctx = { go, route, user, data: store.myData(), rerender: render };
  if (route.raw !== lastRaw) store.trackPage(route.name.slice(1));
  const tab = (TABS.some(([p]) => p === route.name) || !!PARENT[route.name]) && !(route.name === '/guide' && route.query.get('first'));
  mount(app, view(ctx), route, tab);
  // Разходка: веднъж след регистрация или когато е пусната от Профил → Помощ
  let tourNow = false; try { tourNow = sessionStorage.getItem('profitaxi.tourNow') === '1'; } catch { /* */ }
  if (route.name === '/home' && !tourOpen() && (tourNow || ctx.data.profile.tour === 'pending')) {
    try { sessionStorage.removeItem('profitaxi.tourNow'); } catch { /* */ }
    notified = true;
    setTimeout(() => { if (location.hash.startsWith('#/home') && !tourOpen()) startTour(DRIVER_TOUR, { home: '/home', onDone: () => { if (store.getProfile()?.tour === 'pending') store.updateProfile({ tour: 'done' }); } }); }, 500);
  }
  if (!notified) { notified = true; checkNotifications(ctx.data); }
}
let notified = false;
let autoRan = false;
window.addEventListener('online', () => render());
window.addEventListener('offline', () => render());
window.addEventListener('profitaxi:installable', () => render());

function mount(app, el, route, withNav) {
  const keepScroll = route.raw === lastRaw;
  const y = window.scrollY;
  // Подстраниците имат връщане към „своя“ бутон от менюто
  const parent = PARENT[route.name];
  if (parent && el.classList?.contains('screen')) el.prepend(h('a', { class: 'back sub-back', href: '#' + parent, 'aria-label': 'Назад: ' + PARENT_LABEL[parent] }, icon(document.documentElement.dataset.skin === 'chisto' ? 'arrowLeft' : 'left', 20), h('span', { class: 'back-txt' }, PARENT_LABEL[parent])));
  // Първото отваряне на екран: кратка подсказка (не по време на разходката)
  if (el.classList?.contains('screen') && store.currentUser() && !tourOpen() && !store.previewMode?.()) {
    const t = tipFor(route.name);
    if (t) { const after = el.querySelector(':scope > .sub-back, :scope > .top'); if (after) after.after(t); else el.prepend(t); }
  }
  clear(app).appendChild(el);
  // „Изтегли“ – иконката на началния екран (само за влезли шофьори, докато не е инсталирано)
  if (store.currentUser() && !store.previewMode() && installBarVisible()) app.prepend(installBar(() => render()));
  // Без интернет: всичко продължава да работи и се пази на телефона
  if (!navigator.onLine) app.prepend(h('div', { class: 'offline-bar' }, icon('alert', 16), 'Без интернет – всичко се пази на телефона'));
  if (store.previewMode()) app.prepend(h('div', { class: 'preview-bar' }, icon('eye', 18), h('span', { class: 'grow' }, h('b', null, `Преглед като ${store.currentUser().name}`), ' – само за гледане, промените не се запазват'), h('button', { class: 'btn btn-sm', onclick: () => { store.endPreview(); window.close(); location.href = '/admin'; } }, 'Затвори')));
  if (withNav) app.appendChild(nav(route.name));
  if (keepScroll) window.scrollTo(0, y); else window.scrollTo(0, 0);
  lastRaw = route.raw;
  tickTimers();
  arrangeRendered();
}

function nav(active) {
  let cur = active; while (PARENT[cur]) cur = PARENT[cur];
  return h('nav', { class: 'nav nav-3', 'aria-label': 'Основно меню' }, TABS.map(([path, ic, label]) =>
    h('a', { href: '#' + path, class: cx(cur === path && 'on'), 'aria-current': cur === path ? 'page' : null },
      h('span', { class: 'nav-ic' }, icon(ic, 22)), label)));
}

let churnPick = '';
function churnBox() {
  if (store.churnAsked()) return h('p', { class: 'churn-done' }, icon('check', 18), 'Благодарим за отговора!');
  const comment = h('input', { class: 'input', maxlength: 200, placeholder: 'Още нещо? (по желание)' });
  return h('section', { class: 'card churn' },
    h('b', null, 'Защо спря? Помагаш ни да станем по-добри.'),
    h('div', { class: 'churn-opts' }, Object.entries(store.CHURN_REASONS).map(([k, l]) => h('button', { class: cx('chip', churnPick === k && 'on'), onclick: () => { churnPick = k; render(); } }, l))),
    churnPick && comment,
    churnPick && h('button', { class: 'btn btn-page btn-block', onclick: () => { store.submitChurn(churnPick, comment.value); churnPick = ''; render(); } }, 'Изпрати'));
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
    h('button', { class: 'btn btn-ghost btn-lg', onclick: () => { store.logout(); go('/login'); } }, 'Изход'),
    !blocked && !store.previewMode() && churnBox());
}

// Грешките в приложението стигат до админа („Контрол → Грешки“)
// „Script error.“ идва от чужди скриптове или добавки в браузъра – без никаква информация, затова не я пазим.
// Към съобщението добавяме файла и реда, за да се намира причината.
const where = (st) => { const m = String(st || '').match(/\/(js\/[\w/.-]+\.js):(\d+)/); return m ? ` @ ${m[1]}:${m[2]}` : ''; };
window.addEventListener('error', (e) => {
  if (!e.message || /^Script error\.?$/.test(e.message)) return;
  store.logError(e.message + (where(e.error?.stack) || (e.filename && /\/js\//.test(e.filename) ? ` @ ${e.filename.replace(/^.*\/(js\/)/, '$1')}:${e.lineno}` : '')), parse().name.slice(1));
});
window.addEventListener('unhandledrejection', (e) => store.logError((e.reason?.message || String(e.reason)) + where(e.reason?.stack), parse().name.slice(1)));

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

// „Подреди екраните“ (Профил): влачене на картите и бутоните – пази се на телефона
initArrange({ onDone: () => { toast('Подредбата е запазена'); render(); }, onReset: () => { resetZones(zonesOnPage()); toast('Тази страница е както беше'); render(); } });
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
render();

addEventListener('hashchange', () => closeTour());

// Бутонът за светла/тъмна тема на екраните без меню (вход, въвеждане на смяна) – горе вдясно
{
  const t = themeToggle(() => { if (!busy()) render(); });
  t.classList.add('theme-fab');
  document.body.appendChild(t);
}
