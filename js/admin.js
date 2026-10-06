// ProfiTaxi – админ панел. Отделен вход на /admin. Шофьорите нямат връзка към него.
// 10 менюта, всяко с табове: всичко за една тема е на едно място.
// Всяка карта, число и бутон може да се мести и скрива („Подреди“ горе вдясно).

import { h, fill, icon, cx, money, money2, moneyFull, todayStr, addDays, fmtDate, fmtNum, fmtNum1, fmtDuration, isoToDateStr, parseDate, MONTHS, MONTHS_SHORT, WD_SHORT, startOfMonth, endOfMonth, dateStr, startOfWeek } from './util.js';
import * as store from './store.js';
import { applyTheme, toast, confirmSheet, openSheet, sheetHead, field, barChart, stat, tone, segmented, empty, setTheme, shareRows, cardTitle, isDark } from './ui.js';
import { startTour, ADMIN_TOUR } from './tour.js';
import { periodStats, series, shiftIncome, shiftExpenses, shiftKm, shiftHours, shiftDate, costMonthly, goalProgress, timeInsights, activeCosts } from './calc.js';
import { CAR_TYPES, FUELS, PERIODS, INCOME_TYPES, expenseCat, costCat } from './constants.js';
import { periodPicker, periodRange, statsBody, exportCsv } from './views/stats.js';
import { cityCompanyPicker } from './views/cityPicker.js';
import { zone, initArrange, setArranging, arranging, resetZones, resetAll, zonesOnPage, ordered, onRender, hasLayout } from './arrange.js';

applyTheme();
document.body.classList.add('admin');

// ---------- Менюто ----------
// роли: owner – всичко; support – шофьори и съобщения, без пари; partner – само своята фирма
const NAV = [
  ['/overview', 'home', 'Днес', 'owner support partner'],
  ['/drivers', 'users', 'Шофьори', 'owner support partner'],
  ['/control', 'shield', 'Контрол', 'owner support'],
  ['/messages', 'inbox', 'Съобщения', 'owner support'],
  ['/partners', 'key', 'Партньори', 'owner partner'],
  ['/growth', 'trophy', 'Растеж', 'owner'],
  ['/stats', 'chart', 'Статистика', 'owner partner'],
  ['/dev', 'sparkle', 'Развитие', 'owner support'],
  ['/money', 'coins', 'Пари', 'owner'],
  ['/settings', 'tool', 'Настройки', 'owner support partner'],
];
const role = () => store.admin.role();
const isOwner = () => role() === 'owner';
const navFor = () => NAV.filter((n) => n[3].split(' ').includes(role()));
const PARENT = { '/driver': '/drivers', '/new': '/drivers' };
const ALIAS = { '/subs': '/money', '/charts': '/stats?t=charts', '/geo': '/stats?t=cities', '/market': '/stats?t=market', '/reports': '/stats', '/login': '/overview' };
const SCOPE_PAGES = ['/overview', '/drivers', '/growth', '/stats', '/money'];

const mkState = () => ({ unit: 'month', anchor: todayStr(), from: addDays(todayStr(), -29), to: todayStr() });
const chartsState = mkState(), geoState = mkState(), driverState = mkState(), marketState = mkState();
const listState = { q: '', filter: 'all', sort: 'health', tag: '' };
// Общ филтър град → фирма
const scope = { city: '', company: '' };
const inScope = (d) => (!scope.city || d.user.city === scope.city) && (!scope.company || d.user.company === scope.company);
const scoped = () => store.admin.allData().filter(inScope);
const scopeLabel = () => (scope.company ? `${scope.company}, ${scope.city}` : scope.city || 'Цяла България');
const PALETTE = ['#FFC21A', '#8E929B', '#8B6FE8', '#C9CCD2', '#5E6168', '#B88900', '#C4B5FD', '#74777F', '#E4E6EA', '#3F4249'];

const go = (p) => { location.hash = p; };
function parse() {
  const raw = location.hash.slice(1) || '/overview';
  const [path, qs] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  return { name: '/' + (parts[0] || 'overview'), param: parts[1], q: new URLSearchParams(qs || ''), raw };
}
// кеш за едно пречертаване (плащания, проверки)
let memo = {};
const once = (k, fn) => (k in memo ? memo[k] : (memo[k] = fn()));

function render() {
  memo = {};
  const app = document.getElementById('app');
  const r = parse();
  if (!store.adminUser()) { document.body.classList.remove('arranging'); return fill(app, loginView()); }
  if (ALIAS[r.name]) { location.replace('#' + ALIAS[r.name]); return; }
  const views = { '/overview': overview, '/drivers': drivers, '/driver': driverDetail, '/new': newDriver, '/control': control, '/messages': messagesPage,
    '/partners': partners, '/growth': growth, '/stats': statsPage, '/dev': devPage, '/money': moneyPage, '/settings': settings };
  const base = PARENT[r.name] || r.name;
  if (!views[r.name] || !navFor().some((n) => n[0] === base)) { location.replace('#/overview'); return; }
  if (r.name === '/new' && role() === 'partner') { location.replace('#/drivers'); return; }
  const y = window.scrollY;
  const key = r.name + '/' + (r.param || '');
  fill(app, h('div', { class: 'adm' }, sidebar(base),
    h('main', { class: 'adm-main' }, topbar(), SCOPE_PAGES.includes(r.name) && scopeBar(), views[r.name](r))));
  const on = document.querySelector('.adm-nav a.on'); if (on && on.parentElement.scrollWidth > on.parentElement.clientWidth) on.parentElement.scrollLeft = on.offsetLeft - 16;
  if (key === render.last) window.scrollTo(0, y); else window.scrollTo(0, 0);
  render.last = key;
  onRender();
  let seen = 'done'; try { seen = localStorage.getItem('profitaxi.adminTour'); } catch { /* */ }
  if (seen !== 'done' && r.name === '/overview' && !document.querySelector('.tour')) setTimeout(runAdminTour, 500);
}

function sidebar(active) {
  const a = store.adminUser();
  const n = store.admin.drivers().length;
  const badge = { '/drivers': [n, ''], '/control': [newAlerts().length, 'alert'], '/messages': [unreadTickets(), 'alert'] };
  return h('aside', { class: 'adm-side' },
    h('div', { class: 'brand' }, h('img', { class: 'brand-logo', src: '/icons/admin-192.png', alt: '' }), h('span', { class: 'brand-name' }, 'Profi', h('b', null, 'Taxi')), h('span', { class: 'adm-badge' }, role() === 'owner' ? 'Админ' : store.ADMIN_ROLES[role()])),
    zone('nav', { class: 'adm-nav', 'data-tap': '' }, navFor().map(([p, ic, label]) => [p.slice(1),
      h('a', { href: '#' + p, class: cx(active === p && 'on') }, icon(ic, 19), h('span', null, label),
        badge[p] && badge[p][0] > 0 && h('span', { class: cx('count', badge[p][1]) }, String(badge[p][0])))]), 'nav'),
    h('div', { class: 'adm-side-foot' },
      h('div', { class: 'who' }, a.email, role() === 'partner' && h('small', null, a.company)),
      h('button', { class: 'icon-btn sf-theme', id: 'adm-theme', 'aria-label': 'Смени темата', title: 'Светла / тъмна тема', onclick: (e) => { setTheme(isDark() ? 'light' : 'dark'); e.currentTarget.replaceChildren(icon(isDark() ? 'sun' : 'moon', 18)); } }, icon(isDark() ? 'sun' : 'moon', 18)),
      h('button', { class: 'icon-btn sf-help', 'aria-label': 'Помощ', title: 'Помощ: кратка разходка', onclick: () => { if (parse().name !== '/overview') { go('/overview'); setTimeout(runAdminTour, 300); } else runAdminTour(); } }, icon('sparkle', 18)),
      h('button', { class: 'btn grow sf-out', onclick: () => { store.adminLogout(); setArranging(false); render(); } }, icon('logout', 18), 'Изход')));
}
function runAdminTour() { startTour(ADMIN_TOUR, { onDone: () => { try { localStorage.setItem('profitaxi.adminTour', 'done'); } catch { /* */ } } }); }

// ---------- Горна лента: търсене навсякъде, известия, подреждане ----------
const top = { q: '', bell: false };
function topbar() {
  const res = h('div', { class: 'gs-res' });
  const drawRes = () => {
    const list = top.q.trim().length >= 2 ? searchAll(top.q.trim()) : [];
    fill(res, top.q.trim().length >= 2 && (list.length ? list.map((x) => h('a', { class: 'gs-row', href: x.href, onclick: () => { x.on?.(); top.q = ''; } },
      h('span', { class: 'gs-ic' }, icon(x.ic, 16)), h('span', { class: 'grow' }, h('b', null, x.title), h('small', null, x.sub)), h('em', null, x.kind)))
      : h('p', { class: 'muted small gs-none' }, 'Нищо не е намерено')));
  };
  const input = h('input', { class: 'input', id: 'adm-search', type: 'search', placeholder: 'Търси шофьор, телефон, номер, фирма, код…', value: top.q, autocomplete: 'off',
    oninput: (e) => { top.q = e.target.value; drawRes(); }, onkeydown: (e) => { if (e.key === 'Escape') { top.q = ''; e.target.value = ''; drawRes(); e.target.blur(); } if (e.key === 'Enter') res.querySelector('a')?.click(); } });
  drawRes();
  const n = newAlerts();
  const pop = h('div', { class: cx('bell-pop', top.bell && 'open') },
    h('div', { class: 'bp-head' }, h('b', null, 'Известия'), n.length > 0 && h('button', { class: 'chip', onclick: () => { store.admin.markAlertsSeen(n.map((a) => a.key)); top.bell = false; toast('Отбелязани като видени'); } }, icon('check', 14), 'Видени')),
    n.length ? n.slice(0, 8).map(alertRow) : h('p', { class: 'muted small', style: { padding: '8px 4px' } }, 'Няма нови известия.'),
    role() !== 'partner' && h('a', { class: 'btn btn-ghost btn-block btn-sm', href: '#/control', onclick: () => { top.bell = false; } }, 'Всички известия'));
  return h('div', { class: 'adm-top' },
    h('div', { class: 'gsearch' }, icon('search', 18), input, res),
    h('div', { class: 'bell-wrap' },
      h('button', { class: cx('icon-btn top-btn', n.length && 'has'), id: 'adm-bell', 'aria-label': `Известия: ${n.length} нови`, onclick: () => { top.bell = !top.bell; pop.classList.toggle('open', top.bell); } }, icon('bell', 20), n.length > 0 && h('span', { class: 'dot' }, String(n.length))),
      pop),
    h('button', { class: cx('btn btn-ghost top-btn arr-toggle', arranging() && 'on'), id: 'adm-arrange', title: 'Подреди картите и бутоните, както ти е удобно', onclick: () => { setArranging(!arranging()); render(); } }, icon('grid', 18), h('span', null, arranging() ? 'Готово' : 'Подреди')));
}
document.addEventListener('click', (e) => { if (top.bell && !e.target.closest('.bell-wrap')) { top.bell = false; document.querySelector('.bell-pop')?.classList.remove('open'); } });

function searchAll(q) {
  const s = q.toLowerCase(), dig = store.normPhone(q), plate = plateKey(q);
  const all = store.admin.allData(); const out = [];
  all.forEach((d) => {
    const u = d.user, c = d.profile.car || {};
    const hit = [u.name, u.email, u.company, u.city].join(' ').toLowerCase().includes(s) || (dig.length >= 4 && store.normPhone(u.phone).includes(dig)) || (plate.length >= 3 && plateKey(c.plate).includes(plate)) || (c.code && String(c.code) === q.trim());
    if (hit) out.push({ ic: 'user', title: u.name, sub: [u.city, u.company, u.phone, c.plate].filter(Boolean).join(' · '), kind: 'Шофьор', href: '#/driver/' + u.id });
  });
  companiesOf(all).filter((c) => c.toLowerCase().includes(s)).forEach((c) => out.push({ ic: 'car', title: c, sub: `${all.filter((d) => d.user.company === c).length} шофьори`, kind: 'Фирма', href: '#/partners?t=firms', on: () => { repState.company = c; } }));
  if (role() !== 'support') store.admin.codes().filter((c) => c.code.toLowerCase().includes(s)).forEach((c) => out.push({ ic: 'key', title: c.code, sub: c.company, kind: 'Код', href: '#/partners?t=codes' }));
  if (isOwner()) store.admin.promos().filter((c) => c.code.toLowerCase().includes(s)).forEach((c) => out.push({ ic: 'gift', title: c.code, sub: c.kind === 'months' ? `${c.value} мес. безплатно` : `-${c.value}%`, kind: 'Промо', href: '#/money?t=promos' }));
  if (role() !== 'partner') store.admin.tickets().filter((t) => t.thread.some((m) => m.text.toLowerCase().includes(s))).forEach((t) => out.push({ ic: 'inbox', title: t.name, sub: t.thread[0].text, kind: 'Въпрос', href: '#/messages?t=inbox', on: () => { inbox.sel = t.id; } }));
  return out.slice(0, 10);
}

// ---------- Вход (с двуфакторен код, ако е включен) ----------
let login2fa = null;
function loginView() {
  const err = h('p', { class: 'err' });
  const shell = (...kids) => h('div', { class: 'auth', style: { maxWidth: '420px', margin: '0 auto' } },
    h('div', { class: 'brand' }, h('img', { class: 'brand-logo', src: '/icons/admin-192.png', alt: '' }), h('span', { class: 'brand-name' }, 'Profi', h('b', null, 'Taxi'))), ...kids);
  if (login2fa) {
    const code = h('input', { class: 'input', inputmode: 'numeric', autocomplete: 'one-time-code', placeholder: '6 цифри', maxlength: 6 });
    return shell(
      h('div', { class: 'auth-hero' }, h('h1', null, 'Код за вход'), h('p', null, `Изпратихме код по SMS${login2fa.phone ? ` на ${login2fa.phone}` : ''}.`)),
      h('form', { class: 'form', onsubmit: (e) => { e.preventDefault(); const r = store.adminVerify2fa(login2fa.id, code.value); if (r.error) { err.textContent = r.error; return; } login2fa = null; render(); } },
        field('Код', code), err, h('button', { class: 'btn btn-xl btn-page', type: 'submit' }, 'Влез')),
      h('button', { class: 'btn btn-ghost btn-block', onclick: () => { login2fa = null; render(); } }, 'Назад'));
  }
  const email = h('input', { class: 'input', type: 'email', autocomplete: 'username' });
  const pw = h('input', { class: 'input', type: 'password', autocomplete: 'current-password' });
  const demo = (label, e, p) => h('button', { type: 'button', onclick: () => { email.value = e; pw.value = p; } }, label);
  return shell(
    h('div', { class: 'auth-hero' }, h('h1', null, 'Администрация'), h('p', null, 'Вход само за администратори.')),
    h('form', { class: 'form', onsubmit: (e) => {
      e.preventDefault(); const r = store.adminLogin(email.value, pw.value);
      if (r.error) { err.textContent = r.error; return; }
      if (r.twoFactor) { login2fa = r; render(); setTimeout(() => toast(`Демо: кодът от SMS е ${r.demoCode}`), 50); return; }
      render();
    } }, field('Имейл', email), field('Парола', pw), err,
      h('button', { class: 'btn btn-xl', type: 'submit', style: { background: 'var(--accent)', color: 'var(--accent-ink)' } }, 'Вход')),
    h('div', { class: 'demo-box' }, h('b', null, 'Демо: '), 'admin@profitaxi.bg / admin123 ', demo('Попълни', 'admin@profitaxi.bg', 'admin123'),
      h('div', { class: 'small muted', style: { marginTop: '8px' } }, 'Други роли: ', demo('Поддръжка', 'support@profitaxi.bg', 'support123'), ' ', demo('Партньор One', 'one@partner.bg', 'one123'))));
}

// ---------- Общи помощни ----------
function subState(u) {
  if (u.status === 'blocked') return { key: 'blocked', label: 'Спрян', cls: 'bad' };
  const left = Math.round((parseDate(u.subscription.validUntil) - parseDate(todayStr())) / 86400000);
  if (left < 0) return { key: 'expired', label: 'Изтекъл', cls: 'bad', left };
  if (u.subscription.plan === 'trial') return { key: 'trial', label: 'Пробен', cls: 'warn', left };
  return { key: 'active', label: 'Платен', cls: left <= 7 ? 'warn' : 'good', left };
}
const lastShift = (d) => d.shifts.find((s) => s.end);
const daysAgo = (date) => Math.round((parseDate(todayStr()) - parseDate(date)) / 86400000);
const daysSince = (d) => { const l = lastShift(d); return l ? daysAgo(shiftDate(l)) : null; };
const loginAgo = (d) => (d.user.lastLoginAt ? daysAgo(isoToDateStr(d.user.lastLoginAt)) : null);
const agoTxt = (n) => (n == null ? '—' : n === 0 ? 'днес' : n === 1 ? 'вчера' : `преди ${n} дни`);
const isActive = (d) => { const from = addDays(todayStr(), -6); return d.shifts.some((x) => !x.end || shiftDate(x) >= from); };
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
const plateKey = (p) => String(p || '').toUpperCase().replace(/[\s-]/g, '');
const emailBase = (e) => String(e || '').toLowerCase().split('@')[0].replace(/[\d._-]+/g, '');
const companiesOf = (all) => [...new Set(all.map((d) => d.user.company).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'bg'));
const citiesOf = (all) => [...new Set(all.map((d) => d.user.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'bg'));
const sel = (opts, value, onchange, placeholder, attrs = {}) => h('select', { class: 'input', ...attrs, onchange: (e) => onchange(e.target.value) },
  placeholder != null && h('option', { value: '' }, placeholder), opts.map((o) => (Array.isArray(o) ? h('option', { value: o[0], selected: o[0] === value }, o[1]) : h('option', { value: o, selected: o === value }, o))));
// +359 формат за обаждане и Viber
const intl = (p) => { const d = store.normPhone(p); return d.startsWith('0') ? '+359' + d.slice(1) : '+' + d; };
const telHref = (p) => 'tel:' + intl(p);
const viberHref = (p) => 'viber://chat?number=' + encodeURIComponent(intl(p));
const timeTxt = (iso) => `${fmtDate(isoToDateStr(iso))}, ${new Date(iso).toTimeString().slice(0, 5)}`;

const pageHead = (title, sub, actions) => h('div', { class: 'adm-head' }, h('div', null, h('h1', null, title), sub && h('p', null, sub)), actions);
// Зона от карти: всяка се мести и скрива. wide = на цялата ширина.
const flow = (key, items) => zone(key, { class: 'adm-flow' }, items);
const acts = (key, items) => zone(key, { class: 'adm-actions' }, items);
const card = (ic, title, ...kids) => h('section', { class: 'card adm-card' }, cardTitle(ic, title), ...kids);
const wide = (el) => { el.classList.add('wide'); return el; };
const note = (text) => h('p', { class: 'muted small adm-note' }, text);
// Табове на страницата: адресът е #/страница?t=таб, за да се връщаш точно там
function tabs(page, defs) {
  const visible = defs.filter(Boolean);
  const t = parse().q.get('t');
  const order = ordered(page + '.tabs', visible.map((d) => d[0]));
  const cur = visible.some((d) => d[0] === t) ? t : order[0] || visible[0][0];
  const bar = zone(page + '.tabs', { class: 'adm-tabs', role: 'tablist', 'data-tap': '' }, visible.map(([id, label, n, cls]) => [id,
    h('a', { href: `#${page}?t=${id}`, class: cx('adm-tab', id === cur && 'on'), role: 'tab', 'aria-selected': String(id === cur) }, label, n ? h('span', { class: cx('count', cls) }, String(n)) : null)]));
  return { bar, cur };
}

const kpi = (ic, color, label, value, sub, valCls, extra = {}) => h('div', { class: cx('kpi', extra.lg && 'kpi-lg'), style: { '--kc': color }, title: extra.title || null },
  h('div', { class: 'kpi-head' }, h('div', { class: 'kpi-ic' }, icon(ic, 18)), h('div', { class: 'kpi-label' }, label), extra.trend),
  h('div', { class: cx('kpi-value', valCls) }, value),
  sub && h('div', { class: 'kpi-sub' }, sub),
  extra.bar != null && h('div', { class: 'kpi-bar', title: `${Math.round(extra.bar * 100)}%` }, h('span', { style: { width: `${Math.max(0, Math.min(1, extra.bar)) * 100}%` } })),
  extra.spark);
const kpis = (key, items, cls = 'kpis') => zone(key, { class: cls }, items);
const bigNum = (label, value, sub, cls, trend) => h('div', { class: cx('big-num', cls) }, h('span', null, label), h('b', null, value), sub && h('small', null, sub), trend);
// ▲/▼ спрямо миналата седмица
function vsWeek(cur, prev, { invert, money: isMoney } = {}) {
  const d = cur - prev;
  if (!Number.isFinite(d)) return null;
  const good = invert ? d < 0 : d > 0;
  const txt = d === 0 ? 'колкото миналата седмица' : `${d > 0 ? '▲' : '▼'} ${isMoney ? money(Math.abs(d)) : fmtNum(Math.abs(d))} спрямо миналата седмица`;
  return h('em', { class: cx('wk', d === 0 ? 'flat' : good ? 'up' : 'down') }, txt);
}
function trendChip(cur, prev, { invert, unit = '%' } = {}) {
  if (prev == null || !Number.isFinite(prev) || Math.abs(prev) < 0.01) return null;
  const d = (cur - prev) / Math.abs(prev);
  if (!Number.isFinite(d)) return null;
  const up = d >= 0, good = invert ? !up : up;
  return h('span', { class: cx('trend-chip', good ? 'up' : 'down'), title: 'Спрямо предишния период' }, `${up ? '▲' : '▼'} ${Math.abs(Math.round(d * 100))}${unit}`);
}
function sparkline(values, color) {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 2) return null;
  const W = 200, H = 38, max = Math.max(...v), min = Math.min(0, ...v), rng = max - min || 1;
  const pts = v.map((x, i) => [(i / (v.length - 1)) * W, H - 2 - ((x - min) / rng) * (H - 4)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return h('svg', { class: 'spark', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' },
    h('path', { d: `${line} L${W},${H} L0,${H} Z`, fill: color, opacity: '0.14' }),
    h('path', { d: line, fill: 'none', stroke: color, 'stroke-width': '2', 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round' }));
}
const miniKpi = (ic, color, label, value, sub) => h('div', { class: 'mini-kpi', style: { '--kc': color } },
  h('span', { class: 'mini-ic' }, icon(ic, 16)), h('div', { style: { minWidth: 0 } }, h('span', null, label), h('b', null, value), sub && h('em', null, sub)));
function shiftAnchorLocal(st, dir) {
  const d = parseDate(st.anchor);
  if (st.unit === 'day') d.setDate(d.getDate() + dir);
  if (st.unit === 'week') d.setDate(d.getDate() + 7 * dir);
  if (st.unit === 'month') d.setMonth(d.getMonth() + dir, 1);
  if (st.unit === 'year') d.setFullYear(d.getFullYear() + dir, 0, 1);
  st.anchor = dateStr(d);
}
function prevRange(st) {
  if (st.unit === 'custom') { const len = Math.round((parseDate(st.to) - parseDate(st.from)) / 86400000) + 1; return { from: addDays(st.from, -len), to: addDays(st.from, -1) }; }
  const c = { ...st }; shiftAnchorLocal(c, -1); const r = periodRange(c);
  const cur = periodRange(st);
  if (cur.to >= todayStr() && cur.from <= todayStr()) { const len = Math.round((parseDate(todayStr()) - parseDate(cur.from)) / 86400000); return { from: r.from, to: addDays(r.from, len) }; }
  return r;
}
// при текущ период сравняваме само завършените дни със същия брой дни от предишния
function compareRanges(st, r) {
  const today = todayStr();
  if (st.unit !== 'custom' && r.from < today && r.to >= today) {
    const cur = { from: r.from, to: addDays(today, -1) };
    const len = Math.round((parseDate(cur.to) - parseDate(cur.from)) / 86400000);
    const c = { ...st }; shiftAnchorLocal(c, -1); const p = periodRange(c);
    return { cur, prev: { from: p.from, to: addDays(p.from, len) } };
  }
  return { cur: r, prev: prevRange(st) };
}
function table(headers, rows, { rightFrom = 1 } = {}) {
  if (!rows.length) return h('p', { class: 'muted small' }, 'Няма данни');
  return h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
    h('thead', null, h('tr', null, headers.map((x, i) => h('th', { class: i >= rightFrom ? 'r' : '' }, x)))),
    h('tbody', null, rows.map((r) => h('tr', { class: r.href ? 'link' : '', onclick: r.href ? (e) => { if (e.target.closest('button, input, select, a')) return; location.hash = r.href.slice(1); } : null },
      r.cells.map((c, i) => h('td', { class: cx(i >= rightFrom && 'r', r.cls?.[i]) }, c)))))));
}
function donut(items, centerLabel, centerValue) {
  const total = items.reduce((a, x) => a + x.value, 0) || 1;
  let acc = 0;
  const stops = items.map((x) => { const from = acc; acc += (x.value / total) * 360; return `${x.color} ${from}deg ${acc}deg`; }).join(', ');
  return h('div', { class: 'donut-wrap' },
    h('div', { class: 'donut', style: { background: `conic-gradient(${stops || 'var(--surface-3) 0 360deg'})` } }, h('div', { class: 'donut-center' }, h('div', null, h('b', null, centerValue), centerLabel))),
    h('div', { class: 'legend-list' }, items.map((x) => h('div', { class: 'lg-row' },
      h('span', { class: 'lg-name' }, h('i', { style: { background: x.color } }), x.label),
      h('b', null, x.text ?? pct(x.value, total)),
      x.sub && h('small', null, x.sub)))));
}
function colBars(items, fmt = (v) => String(v)) {
  const max = Math.max(1, ...items.map((x) => x.value));
  return h('div', { class: 'cols-bars' }, items.map((x) => h('div', { class: 'cb', title: `${x.label}: ${fmt(x.value)}` },
    h('em', null, x.value ? fmt(x.value) : ''),
    h('i', { style: { height: `${Math.max(2, (x.value / max) * 100)}%`, background: x.color || null } }),
    h('span', null, x.label))));
}
// Хоризонтални ленти (фуния, източници, причини)
const hbars = (items, total) => h('div', { class: 'usage' }, items.map(([label, v, sub]) => h('div', { class: 'us-row' }, h('span', null, label),
  h('div', { class: 'fn-bar' }, h('i', { style: { width: `${total ? (v / total) * 100 : 0}%` } }), h('b', null, sub || `${v} · ${pct(v, total)}`)))));
function aggregate(rows) {
  const s = (k) => rows.reduce((a, x) => a + x.st[k], 0);
  const T = { income: s('income'), net: s('net'), exp: s('totalExp'), varExp: s('varExp'), fixed: s('fixedExp'), shifts: s('shifts'), hours: s('hours'), km: s('km'), cash: s('cash'), card: s('card'), app: s('app'), tips: s('tips') };
  T.perHour = T.hours ? T.net / T.hours : 0; T.perKm = T.km ? T.net / T.km : 0; T.perShift = T.shifts ? T.income / T.shifts : 0; T.incPerHour = T.hours ? T.income / T.hours : 0;
  T.active = rows.filter((x) => x.st.shifts > 0).length;
  return T;
}
function downloadCsv(rows, name) {
  const csv = '﻿' + rows.map((r) => r.map((x) => String(x ?? '').replace(/[;\n\r]/g, ' ')).join(';')).join('\r\n');
  const a = h('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: name });
  document.body.appendChild(a); a.click(); a.remove();
}

// ---------- Здраве на акаунта (0–100) и първите стъпки ----------
const payments = () => once('pays', () => (role() === 'support' ? [] : store.admin.payments()));
const failedPay = (id) => payments().some((p) => p.userId === id && p.status === 'failed');
function health(d) {
  let sc = 0; const why = [];
  const lg = loginAgo(d), ds = daysSince(d), s = subState(d.user);
  sc += lg == null ? 0 : lg <= 2 ? 30 : lg <= 7 ? 20 : lg <= 14 ? 10 : 0; if (lg == null || lg > 7) why.push(lg == null ? 'не е влизал' : `не е влизал ${lg} дни`);
  sc += ds == null ? 0 : ds <= 2 ? 40 : ds <= 7 ? 28 : ds <= 14 ? 12 : 0; if (ds == null) why.push('няма смени'); else if (ds > 7) why.push(`без смени ${ds} дни`);
  sc += { active: 30, trial: 18, expired: 0, blocked: 0 }[s.key];
  if (s.key === 'active' && s.left <= 3) { sc -= 10; why.push('абонаментът изтича'); }
  if (s.key === 'trial' && s.left <= 3) why.push('пробният период свършва');
  if (s.key === 'expired') why.push('абонаментът е изтекъл');
  if (s.key === 'blocked') why.push('спрян достъп');
  if (failedPay(d.user.id)) { sc -= 15; why.push('неуспешно плащане'); }
  sc = Math.max(0, Math.min(100, sc));
  return { score: sc, cls: sc >= 70 ? 'good' : sc >= 40 ? 'warn' : 'bad', why };
}
const healthChip = (hl) => h('span', { class: cx('hp', hl.cls), title: hl.why.join(', ') || 'Всичко е наред' }, h('i', { style: { '--p': hl.score / 100 } }), String(hl.score));
const STEPS = [['reg', 'Регистрация'], ['setup', 'Кола и цел'], ['shift', 'Първа смяна'], ['exp', 'Първи разход'], ['five', '5 смени'], ['paid', 'Платил']];
function steps(d) {
  const done = d.shifts.filter((s) => s.end);
  return { reg: true, setup: !!d.profile.onboarded, shift: done.length > 0, exp: done.some((s) => (s.expenses || []).length) || d.costs.some((c) => !c.system), five: done.length >= 5, paid: !!d.user.subscription.paidSince };
}
const stuckAt = (d) => { const s = steps(d); const k = STEPS.find(([id]) => !s[id]); return k ? k[1] : null; };
const stepDots = (d) => { const s = steps(d); return h('span', { class: 'steps' }, STEPS.map(([id, label]) => h('i', { class: cx(s[id] && 'on'), title: `${label}: ${s[id] ? 'да' : 'не'}` }))); };
const isStuck = (d) => { const s = steps(d); return daysAgo(isoToDateStr(d.user.createdAt)) >= 3 && (!s.setup || !s.shift); };

// ---------- Филтър град → фирма ----------
let scopeOpen = false;
function scopeBar() {
  const all = store.admin.allData();
  const cityCount = {};
  all.forEach((d) => { cityCount[d.user.city] = (cityCount[d.user.city] || 0) + 1; });
  const cities = Object.keys(cityCount).sort((a, b) => cityCount[b] - cityCount[a] || a.localeCompare(b, 'bg'));
  const compCount = {};
  all.filter((d) => d.user.city === scope.city).forEach((d) => { compCount[d.user.company] = (compCount[d.user.company] || 0) + 1; });
  const companies = Object.keys(compCount).sort((a, b) => compCount[b] - compCount[a] || a.localeCompare(b, 'bg'));
  const n = all.filter(inScope).length;
  const bar = h('div', { class: cx('scope-bar', scopeOpen && 'open') },
    h('button', { class: 'scope-chip', type: 'button', 'aria-expanded': String(scopeOpen), onclick: () => { scopeOpen = !scopeOpen; bar.classList.toggle('open', scopeOpen); } },
      icon('target', 18), h('b', null, scopeLabel()), h('span', null, `${n} ${n === 1 ? 'шофьор' : 'шофьори'}`), icon('down', 16)),
    h('div', { class: 'scope-ic' }, icon('target', 18)),
    h('label', { class: 'scope-field' }, h('span', null, 'Град'),
      h('select', { class: 'input', onchange: (e) => { scope.city = e.target.value; scope.company = ''; render(); } },
        h('option', { value: '' }, `Цяла България (${all.length})`),
        cities.map((c) => h('option', { value: c, selected: scope.city === c }, `${c} (${cityCount[c]})`)))),
    h('label', { class: 'scope-field' }, h('span', null, 'Фирма'),
      h('select', { class: 'input', disabled: !scope.city, onchange: (e) => { scope.company = e.target.value; render(); } },
        h('option', { value: '' }, scope.city ? `Всички фирми (${cityCount[scope.city] || 0})` : 'Първо избери град'),
        companies.map((c) => h('option', { value: c, selected: scope.company === c }, `${c} (${compCount[c]})`)))),
    h('div', { class: 'scope-sum' }, h('b', null, scopeLabel()), h('span', null, `${n} ${n === 1 ? 'шофьор' : 'шофьори'}`),
      scope.city && h('button', { class: 'chip', onclick: () => { scope.city = ''; scope.company = ''; render(); } }, icon('x', 14), 'Изчисти')));
  return bar;
}

// ---------- Карта на България ----------
const CITY_POS = { 'София': [23.32, 42.70], 'Пловдив': [24.75, 42.15], 'Варна': [27.91, 43.21], 'Бургас': [27.47, 42.50], 'Стара Загора': [25.63, 42.43], 'Русе': [25.97, 43.85],
  'Сливен': [26.32, 42.68], 'Нова Загора': [26.01, 42.49], 'Асеновград': [24.87, 42.01], 'Благоевград': [23.10, 42.02], 'Велико Търново': [25.63, 43.08], 'Видин': [22.88, 43.99],
  'Враца': [23.55, 43.21], 'Габрово': [25.32, 42.87], 'Добрич': [27.83, 43.57], 'Дупница': [23.12, 42.26], 'Казанлък': [25.39, 42.62], 'Кърджали': [25.37, 41.65],
  'Кюстендил': [22.69, 42.28], 'Ловеч': [24.72, 43.14], 'Монтана': [23.23, 43.41], 'Пазарджик': [24.33, 42.19], 'Перник': [23.03, 42.60], 'Плевен': [24.61, 43.42],
  'Разград': [26.52, 43.53], 'Сандански': [23.27, 41.57], 'Силистра': [27.26, 44.12], 'Смолян': [24.71, 41.58], 'Търговище': [26.57, 43.25], 'Хасково': [25.55, 41.93],
  'Шумен': [26.94, 43.27], 'Ямбол': [26.50, 42.48] };
let mapEl = null, lmap = null, lmarkers = null, mapTiles = false;
function cityStats(all) {
  const by = {};
  all.forEach((d) => { const c = d.user.city; by[c] = by[c] || { total: 0, active: 0 }; by[c].total++; if (isActive(d)) by[c].active++; });
  return by;
}
function drawMap(by) {
  if (!window.L || !mapEl) return;
  if (!lmap) {
    lmap = L.map(mapEl, { zoomControl: true, attributionControl: true, scrollWheelZoom: false, minZoom: 6, maxZoom: 12, maxBounds: [[40.6, 21.4], [44.9, 29.6]], maxBoundsViscosity: .8 }).setView([42.75, 25.4], 7);
    lmap.fitBounds([[41.2, 22.3], [44.25, 28.65]], { padding: [10, 10] });
  }
  if (!mapTiles) {
    // Esri World Topo – цветна карта (зелен релеф, реки, пътища), без ключ
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, attribution: 'Карта &copy; Esri, HERE, Garmin, &copy; OpenStreetMap' }).addTo(lmap);
    mapTiles = true;
  }
  if (lmarkers) lmarkers.remove();
  lmarkers = L.layerGroup().addTo(lmap);
  const max = Math.max(1, ...Object.values(by).map((x) => x.total));
  const named = new Set(Object.entries(by).sort((a, b) => b[1].total - a[1].total).slice(0, 5).map(([c]) => c));
  Object.entries(by).forEach(([city, v]) => {
    const pos = CITY_POS[city]; if (!pos) return;
    const size = Math.round(20 + Math.sqrt(v.total / max) * 16);
    const ic = L.divIcon({ className: 'lm-wrap', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
      html: `<div class="lm ${v.active ? 'on' : ''}" style="width:${size}px;height:${size}px"><b>${v.total}</b>${v.active ? `<i>${v.active}</i>` : ''}</div>${named.has(city) ? `<span class="lm-name">${city}</span>` : ''}` });
    L.marker([pos[1], pos[0]], { icon: ic, title: `${city}: ${v.total} шофьори, ${v.active} активни` })
      .on('click', () => { if (arranging()) return; scope.city = city; scope.company = ''; go('/drivers'); }).addTo(lmarkers);
  });
  setTimeout(() => lmap.invalidateSize(), 0);
}
function liveMap(all) {
  const by = cityStats(all);
  const active = all.filter(isActive).length;
  if (!mapEl) mapEl = h('div', { class: 'lmap', role: 'img', 'aria-label': 'Карта на шофьорите по градове' });
  if (!window.L) {
    if (!document.getElementById('leaflet-js')) {
      document.head.append(h('link', { rel: 'stylesheet', href: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css' }));
      const sc = h('script', { id: 'leaflet-js', src: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js' });
      sc.onload = () => drawMap(cityStats(scoped()));
      document.head.append(sc);
    }
  } else setTimeout(() => drawMap(by), 0);
  const topC = Object.entries(by).sort((a, b) => b[1].total - a[1].total).slice(0, 6);
  return h('section', { class: 'card map-card' },
    h('div', { class: 'map-head' },
      h('div', null, h('h2', null, 'Шофьорите по градове'), h('p', { class: 'muted small' }, 'Числото е колко шофьори има в града, зеленото – колко са активни (смяна през последните 7 дни). Натисни град за списъка.')),
      h('div', { class: 'live-badge' }, h('i'), `${active} активни от ${all.length}`)),
    mapEl,
    h('div', { class: 'map-top' }, topC.map(([c, v]) => h('button', { class: 'chip', onclick: () => { scope.city = c; scope.company = ''; go('/drivers'); } }, h('b', null, c), ` ${v.total} · ${v.active} активни`))));
}

// =====================================================================
//   ДНЕС
// =====================================================================
function overview() {
  const all = scoped(); const owner = isOwner();
  const today = todayStr(), w0 = addDays(today, -6), p0 = addDays(today, -13), p1 = addDays(today, -7);
  const st = all.map((d) => subState(d.user)); const count = (k) => st.filter((s) => s.key === k).length;
  const newThis = all.filter((d) => isoToDateStr(d.user.createdAt) >= w0).length;
  const newPrev = all.filter((d) => { const c = isoToDateStr(d.user.createdAt); return c >= p0 && c <= p1; }).length;
  const actNow = all.filter(isActive).length;
  const actPrev = all.filter((d) => d.shifts.some((s) => s.end && shiftDate(s) >= p0 && shiftDate(s) <= p1)).length;
  const paidNow = count('active');
  const paidAt = (day) => all.filter((d) => { const s = d.user.subscription; return d.user.status !== 'blocked' && s.paidSince && s.paidSince <= day && s.validUntil >= day; }).length;
  const paidPrev = paidAt(p1);
  const price = store.admin.settings().price || 0;
  const risk = all.filter((d) => subState(d.user).key !== 'blocked' && (daysSince(d) == null || daysSince(d) >= 7)).sort((a, b) => (daysSince(b) ?? 999) - (daysSince(a) ?? 999));
  return h('div', null,
    pageHead('Днес', `${scopeLabel()} · обновява се на живо`),
    flow('overview', [
      ['happened', wide(happenedToday(all))],
      ['nums', wide(zone('overview.nums', { class: 'big-nums' }, [
        ['total', bigNum('Шофьори общо', String(all.length), `${newThis} нови тази седмица`, '', vsWeek(newThis, newPrev))],
        ['active', bigNum('Активни', String(actNow), 'смяна през последните 7 дни', 'live', vsWeek(actNow, actPrev))],
        owner && ['paid', bigNum('Платени абонаменти', String(paidNow), `${count('trial')} на пробен период`, '', vsWeek(paidNow, paidPrev))],
        owner && ['mrr', bigNum('Приход от абонаменти', money(paidNow * price), 'на месец', '', vsWeek(paidNow * price, paidPrev * price, { money: true }))],
      ]))],
      ['attention', attentionCard(all, risk)],
      role() !== 'partner' && ['alerts', alertsLine()],
      // преместени в Пари и Статистика; тук са скрити, но може да се покажат от „Подреди“
      owner && ['goal', goalCard(paidNow), { hide: true }],
      ['weekly', weeklyCard(all), { hide: true }],
      ['map', wide(liveMap(all)), { hide: true }],
    ]));
}
// „Днес се случи“: какво е ново от сутринта
function happenedToday(all) {
  const today = todayStr();
  const regs = all.filter((d) => isoToDateStr(d.user.createdAt) === today).length;
  const expired = all.filter((d) => d.user.subscription.validUntil === addDays(today, -1)).length;
  const al = role() === 'partner' ? 0 : newAlerts().length;
  const ideas = role() === 'partner' ? 0 : store.admin.ideas().filter((i) => i.status === 'new' && isoToDateStr(i.at) >= addDays(today, -1)).length;
  const tq = role() === 'partner' ? 0 : unreadTickets();
  const chip = (k, ic, n, label, href, cls) => [k, h('a', { class: cx('hap', n > 0 && cls), href }, h('span', { class: 'hap-ic' }, icon(ic, 18)), h('b', null, String(n)), h('span', null, label))];
  return h('section', { class: 'card happened' }, cardTitle('sparkle', 'Днес се случи'),
    zone('overview.happened', { class: 'hap-row' }, [
      chip('regs', 'plus', regs, 'нови регистрации', '#/drivers?f=new', 'good'),
      isOwner() && chip('exp', 'clock', expired, 'изтекли абонамента', '#/money?t=expiring', 'bad'),
      role() !== 'partner' && chip('alerts', 'bell', al, 'нови сигнала', '#/control', 'warn'),
      role() !== 'partner' && chip('tickets', 'inbox', tq, 'въпроса от шофьори', '#/messages?t=inbox', 'warn'),
      role() !== 'partner' && chip('ideas', 'sparkle', ideas, 'нови предложения', '#/dev?t=opinions', 'good'),
    ]));
}
function goalCard(paidNow) {
  const g = store.admin.settings().goal || { paid: 100, date: todayStr() };
  const left = Math.max(0, g.paid - paidNow), days = Math.max(0, daysAgo(g.date) * -1);
  const perWeek = days > 0 ? left / (days / 7) : left;
  return h('section', { class: 'card goal-card' }, cardTitle('target', 'Цел за бизнеса', h('a', { class: 'chip page', href: '#/settings?t=general' }, icon('edit', 14), 'Смени')),
    h('div', { class: 'goal-num' }, h('b', null, String(paidNow)), h('span', null, ` от ${g.paid} платени шофьори`)),
    h('div', { class: 'goal-bar' }, h('i', { style: { width: `${Math.min(100, (paidNow / Math.max(1, g.paid)) * 100)}%` } })),
    h('p', { class: 'muted small' }, left === 0 ? 'Целта е постигната!' : `Остават ${left} до ${fmtDate(g.date, { year: true })} – около ${fmtNum1(perWeek)} нови платени на седмица.`));
}
function weekLines(all) {
  const to = todayStr(), from = addDays(to, -6), pf = addDays(from, -7), pt = addDays(from, -1);
  const T = aggregate(all.map((d) => ({ d, st: periodStats(d, from, to) }))), P = aggregate(all.map((d) => ({ d, st: periodStats(d, pf, pt) })));
  const newD = all.filter((d) => isoToDateStr(d.user.createdAt) >= from).length;
  return [`ProfiTaxi – седмицата ${fmtDate(from)} – ${fmtDate(to)}`, `Нови шофьори: ${newD}`, `Активни: ${T.active} (предната седмица ${P.active})`, `Смени: ${T.shifts} (предната ${P.shifts})`,
    `Оборот на шофьорите: ${money(T.income)}`, `Чисто на час: ${money2(T.perHour)}`, role() !== 'partner' ? `Нови известия за проверка: ${newAlerts().length}` : null].filter(Boolean);
}
function weeklyCard(all) {
  const lines = weekLines(all);
  return h('section', { class: 'card' }, cardTitle('doc', 'Отчет за седмицата'),
    h('p', { class: 'muted small' }, lines.slice(1, 4).join(' · ')),
    acts('overview.weekly', [
      ['open', h('button', { class: 'btn btn-page btn-sm', onclick: () => openSheet((close) => h('div', null, sheetHead('Отчет за седмицата', close, 'Ще идва всеки понеделник по имейл, щом свържем сървъра.'),
        h('pre', { class: 'weekly' }, lines.join('\n')),
        h('button', { class: 'btn btn-page btn-block', onclick: () => { navigator.clipboard?.writeText(lines.join('\n')); toast('Копирано'); } }, icon('copy', 18), 'Копирай'))) }, icon('doc', 16), 'Отвори')],
      ['copy', h('button', { class: 'btn btn-ghost act-v btn-sm', onclick: () => { navigator.clipboard?.writeText(lines.join('\n')); toast('Копирано'); } }, icon('copy', 16), 'Копирай')]]));
}
function attentionCard(all, risk) {
  const st = all.map((d) => ({ d, s: subState(d.user) }));
  const names = (list) => list.slice(0, 3).map((x) => (x.d || x).user.name.split(' ')[0]).join(', ') + (list.length > 3 ? ` и още ${list.length - 3}` : '');
  const ending = st.filter((x) => x.s.key === 'trial' && x.s.left <= 3);
  const expired = st.filter((x) => x.s.key === 'expired');
  const blocked = st.filter((x) => x.s.key === 'blocked');
  const stuck = all.filter(isStuck);
  const owner = isOwner();
  const rows = [
    owner && ending.length && { k: 'ending', cls: '', ic: 'clock', title: 'Пробният период изтича до 3 дни', list: ending, href: '#/money?t=expiring' },
    owner && expired.length && { k: 'expired', cls: 'bad', ic: 'alert', title: 'Изтекъл абонамент', list: expired, href: '#/money?t=expiring' },
    risk.length && { k: 'risk', cls: '', ic: 'bell', title: 'Без смени 7+ дни', list: risk, href: '#/drivers?f=inactive' },
    stuck.length && { k: 'stuck', cls: '', ic: 'pointer', title: 'Заседнали в началото', list: stuck, href: '#/drivers?t=start' },
    blocked.length && { k: 'blocked', cls: 'calm', ic: 'lock', title: 'Спрени акаунти', list: blocked, href: '#/drivers?f=blocked' },
  ].filter(Boolean);
  // бележки „обади се на…“, чиято дата е дошла – най-отгоре
  const ids = new Set(all.map((d) => d.user.id));
  const notesDue = role() === 'partner' ? [] : store.admin.dueNotes().filter((n) => ids.has(n.userId));
  rows.unshift(...notesDue.map((n) => ({ k: 'note-' + n.at, cls: 'note', ic: 'edit', title: n.text, list: [{ user: { name: n.name } }], href: '#/driver/' + n.userId, sub: `${n.name} · ${n.due < todayStr() ? `от ${fmtDate(n.due)}` : 'днес'}` })));
  return h('section', { class: 'card attention' },
    cardTitle('alert', 'Изисква внимание', rows.length ? h('span', { class: 'chip warn' }, String(rows.reduce((a, r) => a + r.list.length, 0))) : null),
    rows.length ? zone('overview.attention', { class: 'att-list' }, rows.map((r) => [r.k, h('a', { class: cx('att-row', r.cls), href: r.href },
      h('span', { class: 'att-ic' }, icon(r.ic, 18)),
      h('span', { class: 'att-main' }, h('b', null, r.title), h('span', null, r.sub || names(r.list))),
      !r.sub && h('span', { class: 'att-n' }, String(r.list.length)), icon('right', 16))]))
      : h('div', { class: 'att-ok' }, icon('check', 18), 'Всичко е наред – няма нищо спешно.'));
}
function alertsLine() {
  const n = newAlerts();
  return h('a', { class: cx('card alerts-line', n.length && 'has'), href: '#/control' },
    h('span', { class: 'al-ic warn' }, icon('bell', 18)),
    h('span', { class: 'grow' }, h('b', null, n.length ? `${n.length} нови сигнала` : 'Няма нови сигнали'), h('small', null, 'Дубликати, странни смени, неуспешни плащания – всичко е в „Контрол“')),
    icon('right', 18));
}

// =====================================================================
//   ШОФЬОРИ
// =====================================================================
const FILTERS = { all: 'Всички', active: 'Активни', inactive: 'Неактивни 14+ дни', new: 'Нови', stuck: 'Заседнали', blocked: 'Спрени' };
const filterFn = {
  all: () => true, active: isActive, inactive: (d) => { const s = daysSince(d); return s == null || s >= 14; },
  new: (d) => daysAgo(isoToDateStr(d.user.createdAt)) <= 7, stuck: isStuck, blocked: (d) => d.user.status === 'blocked',
};
function drivers(r) {
  const f = r.q.get('f'); if (f && FILTERS[f]) { listState.filter = f; history.replaceState(null, '', '#/drivers' + (r.q.get('t') ? `?t=${r.q.get('t')}` : '')); }
  const all = scoped();
  const { bar, cur } = tabs('/drivers', [['list', 'Списък', all.length], ['start', 'Първи стъпки', all.filter(isStuck).length, 'alert'], ['health', 'Здраве', all.filter((d) => health(d).cls === 'bad').length, 'alert']]);
  const canAdd = role() !== 'partner';
  return h('div', null,
    pageHead('Шофьори', `${scopeLabel()}: ${all.length} акаунта`, canAdd && acts('drivers.head', [['new', h('button', { class: 'btn btn-page', onclick: () => go('/new') }, icon('plus', 18), 'Нов шофьор')]])),
    bar,
    cur === 'list' ? driverList(all) : cur === 'start' ? startTab(all) : healthTab(all));
}
function driverList(all) {
  const root = h('div');
  const today = todayStr();
  // последните 30 дни – честно сравнение по всяко време на месеца
  const rows = all.map((d) => ({ d, s: subState(d.user), hl: health(d), st: periodStats(d, addDays(today, -29), today), last: lastShift(d) }));
  const tags = store.admin.allTags();
  const listEl = h('div'), bulkEl = h('div');
  const drawBulk = () => fill(bulkEl, bulkBar(() => { drawList(); drawBulk(); }));
  function filtered() {
    const q = listState.q.trim().toLowerCase(), dig = store.normPhone(listState.q), pk = plateKey(listState.q);
    return rows.filter(({ d }) => filterFn[listState.filter](d) && (!listState.tag || (d.user.tags || []).includes(listState.tag)) &&
      (!q || [d.user.name, d.user.email, d.user.company, d.user.city, d.profile.car?.code].join(' ').toLowerCase().includes(q) || (dig.length >= 4 && store.normPhone(d.user.phone).includes(dig)) || (pk.length >= 3 && plateKey(d.profile.car?.plate).includes(pk))));
  }
  function drawList() {
    const list = filtered();
    const sorters = { health: (a, b) => a.hl.score - b.hl.score, net: (a, b) => b.st.net - a.st.net, name: (a, b) => a.d.user.name.localeCompare(b.d.user.name, 'bg'), recent: (a, b) => (b.last?.start || '').localeCompare(a.last?.start || ''), login: (a, b) => (b.d.user.lastLoginAt || '').localeCompare(a.d.user.lastLoginAt || ''), reg: (a, b) => b.d.user.createdAt.localeCompare(a.d.user.createdAt) };
    list.sort(sorters[listState.sort] || sorters.health);
    const allOn = list.length > 0 && list.every(({ d }) => picked.has(d.user.id));
    const pick = (id) => (e) => { e.stopPropagation(); if (picked.has(id)) picked.delete(id); else picked.add(id); drawList(); drawBulk(); };
    fill(listEl, list.length ? table([h('input', { type: 'checkbox', class: 'pick', 'aria-label': 'Избери всички', checked: allOn, onclick: (e) => { e.stopPropagation(); list.forEach(({ d }) => (allOn ? picked.delete(d.user.id) : picked.add(d.user.id))); drawList(); drawBulk(); } }),
      'Шофьор', 'Град и фирма', 'Етикети', 'Здраве', 'Последна смяна', 'Последно влизане', 'Чисто за 30 дни'],
      list.map(({ d, hl, st, last }) => ({
        href: '#/driver/' + d.user.id,
        cells: [
          h('input', { type: 'checkbox', class: 'pick', 'aria-label': `Избери ${d.user.name}`, checked: picked.has(d.user.id), onclick: pick(d.user.id) }),
          h('span', { class: 'who-cell' }, h('b', null, d.user.name), h('span', null, d.user.phone || d.user.email)),
          h('span', { class: 'who-cell' }, h('b', { style: { fontWeight: 600 } }, d.user.city), h('span', null, d.user.company)),
          h('span', { class: 'tags' }, (d.user.tags || []).map((t) => h('span', { class: 'tag' }, t))),
          healthChip(hl),
          last ? fmtDate(shiftDate(last)) : '—',
          agoTxt(loginAgo(d)),
          h('b', { class: tone(st.net) }, money(st.net)),
        ],
      })), { rightFrom: 7 }) : empty('users', 'Няма намерени шофьори', 'Промени търсенето или филтъра.'),
      list.length > 0 && h('div', { class: 'drv-cards' }, list.map(({ d, hl, st, last }) => h('div', { class: 'drv-card' },
        h('input', { type: 'checkbox', class: 'pick', 'aria-label': `Избери ${d.user.name}`, checked: picked.has(d.user.id), onclick: pick(d.user.id) }),
        h('a', { class: 'drv-main', href: '#/driver/' + d.user.id },
          h('b', null, d.user.name),
          h('span', null, `${d.user.city} · ${d.user.company}`),
          h('span', { class: 'drv-meta' }, healthChip(hl), (d.user.tags || []).map((t) => h('span', { class: 'tag' }, t)), last ? `смяна ${fmtDate(shiftDate(last))}` : 'без смени')),
        h('span', { class: 'drv-net' }, h('b', { class: tone(st.net) }, money(st.net)), h('small', null, 'за 30 дни'))))));
  }
  const counts = (k) => all.filter(filterFn[k]).length;
  fill(root,
    segmented(Object.fromEntries(Object.entries(FILTERS).map(([k, v]) => [k, `${v} ${counts(k)}`])), listState.filter, (f) => { listState.filter = f; render(); }, { small: true, wrap: true, page: true }),
    h('div', { class: 'adm-filters', style: { marginTop: '10px' } },
      h('input', { class: 'input', type: 'search', placeholder: 'Име, телефон, номер на кола, фирма', value: listState.q, style: { minHeight: '44px' }, oninput: (e) => { listState.q = e.target.value; drawList(); } }),
      sel(tags, listState.tag, (v) => { listState.tag = v; drawList(); }, 'Всички етикети', { style: { minHeight: '44px', padding: '8px 36px 8px 12px' } }),
      sel([['health', 'Първо проблемните'], ['net', 'По печалба (30 дни)'], ['name', 'По име'], ['recent', 'По последна смяна'], ['login', 'По последно влизане'], ['reg', 'Най-новите']], listState.sort, (v) => { listState.sort = v; drawList(); }, null, { style: { minHeight: '44px', padding: '8px 36px 8px 12px' } })),
    bulkEl,
    h('section', { class: 'card', style: { marginTop: '14px' } }, listEl));
  drawList(); drawBulk();
  return root;
}
// Масови действия върху отметнатите
const picked = new Set();
function bulkBar(redraw) {
  if (!picked.size) return null;
  const ids = [...picked].filter((id) => store.admin.driverData(id).user);
  const owner = isOwner(), partner = role() === 'partner';
  return h('div', { class: 'bulk' },
    h('b', null, `Избрани: ${ids.length}`),
    zone('drivers.bulk', { class: 'bulk-acts' }, [
      !partner && ['msg', h('button', { class: 'btn btn-page btn-sm', onclick: () => { Object.assign(msgState, { mode: 'picked', userIds: ids }); go('/messages?t=new'); } }, icon('bell', 16), 'Съобщение')],
      !partner && ['tag', h('button', { class: 'btn btn-ghost act-v btn-sm', onclick: () => tagSheet(ids) }, icon('tag', 16), 'Етикет')],
      ['xls', h('button', { class: 'btn btn-ghost act-n btn-sm', onclick: () => exportDrivers(ids) }, icon('download', 16), 'Excel')],
      owner && ['ext', h('button', { class: 'btn btn-ghost act-v btn-sm', onclick: () => { store.admin.extendMany(ids, 30); toast(`+30 дни за ${ids.length} шофьори`); } }, '+30 дни')],
      !partner && ['on', h('button', { class: 'btn btn-ghost act-ok btn-sm', onclick: () => { store.admin.setStatusMany(ids, 'active'); toast('Достъпът е пуснат'); } }, 'Пусни достъп')],
      !partner && ['off', h('button', { class: 'btn btn-ghost act-warn btn-sm', onclick: () => confirmSheet({ title: `Спиране на ${ids.length} шофьори?`, okLabel: 'Спри достъпа', danger: true, onOk: () => { store.admin.setStatusMany(ids, 'blocked'); toast('Достъпът е спрян'); } }) }, 'Спри достъп')],
      ['clear', h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { picked.clear(); redraw(); } }, 'Изчисти')],
    ]));
}
function exportDrivers(ids) {
  const rows = [['Име', 'Имейл', 'Телефон', 'Град', 'Фирма', 'Етикети', 'Абонамент', 'Валиден до', 'Последна смяна', 'Последно влизане', 'Здраве', 'Регистриран']];
  ids.forEach((id) => { const d = store.admin.driverData(id); if (!d.user) return; const l = lastShift(d);
    rows.push([d.user.name, d.user.email, d.user.phone, d.user.city, d.user.company, (d.user.tags || []).join(', '), subState(d.user).label, d.user.subscription.validUntil, l ? shiftDate(l) : '', d.user.lastLoginAt ? isoToDateStr(d.user.lastLoginAt) : '', health(d).score, isoToDateStr(d.user.createdAt)]); });
  downloadCsv(rows, `profitaxi-shofyori-${todayStr()}.csv`); toast(`Свалени ${ids.length} шофьори`);
}
function tagSheet(ids) {
  openSheet((close) => {
    const inp = h('input', { class: 'input', placeholder: 'напр. VIP, тестер, проблемен', list: 'tag-list' });
    const add = (t) => { if (!t.trim()) return; store.admin.addTagMany(ids, t); close(); toast(`Етикет „${t.trim()}“ на ${ids.length} шофьори`); };
    return h('div', { class: 'form' }, sheetHead('Етикет', close, `За ${ids.length} избрани шофьори`),
      field('Нов или съществуващ етикет', inp),
      h('div', { class: 'tags' }, store.admin.allTags().map((t) => h('button', { class: 'tag tag-btn', onclick: () => add(t) }, t))),
      h('button', { class: 'btn btn-page btn-lg', onclick: () => add(inp.value) }, 'Добави'));
  });
}
function startTab(all) {
  const list = all.map((d) => ({ d, s: steps(d) })).sort((a, b) => b.d.user.createdAt.localeCompare(a.d.user.createdAt));
  const notDone = list.filter((x) => !x.s.five);
  return flow('drivers.start', [
    ['funnel', card('pointer', 'Докъде стигат новите шофьори', note('Колко от всички шофьори са минали всяка стъпка. Заседналите (3+ дни без настройка или първа смяна) са най-лесни за връщане – обади им се или им пиши.'),
      hbars(STEPS.map(([id, label]) => [label, list.filter((x) => x.s[id]).length]), list.length))],
    ['list', wide(card('users', `Още не са стигнали до 5 смени (${notDone.length})`,
      table(['Шофьор', 'Регистриран', 'Стъпки', 'Заседнал на', ''], notDone.map(({ d }) => ({ href: '#/driver/' + d.user.id, cells: [
        h('span', { class: 'who-cell' }, h('b', null, d.user.name), h('span', null, `${d.user.city}, ${d.user.company}`)),
        agoTxt(daysAgo(isoToDateStr(d.user.createdAt))), stepDots(d), h('span', { class: cx('chip', isStuck(d) ? 'bad' : 'warn') }, stuckAt(d) || '—'),
        role() !== 'partner' ? h('button', { class: 'btn btn-ghost act-v btn-sm', onclick: () => { Object.assign(msgState, { mode: 'picked', userIds: [d.user.id], title: 'Помощ за началото', text: 'Здравей! Видяхме, че още не си въвел първата смяна. Ако нещо не е ясно, пиши ни от „Моят профил → Помощ“ – отговаряме бързо.' }); go('/messages?t=new'); } }, icon('bell', 14), 'Пиши') : '',
      ] })), { rightFrom: 9 })))],
  ]);
}
function healthTab(all) {
  const list = all.map((d) => ({ d, hl: health(d) })).sort((a, b) => a.hl.score - b.hl.score);
  const n = (c) => list.filter((x) => x.hl.cls === c).length;
  return flow('drivers.health', [
    ['sum', wide(zone('drivers.health.nums', { class: 'big-nums' }, [
      ['bad', bigNum('Червени', String(n('bad')), 'вероятно ще откажат', 'bad')],
      ['warn', bigNum('Жълти', String(n('warn')), 'да се наблюдават')],
      ['good', bigNum('Зелени', String(n('good')), 'всичко е наред', 'live')]]))],
    ['how', card('heart', 'Как се смята', h('ul', { class: 'adm-list' },
      h('li', null, 'До 30 т. – колко скоро е влизал в приложението'), h('li', null, 'До 40 т. – колко скоро е въвел смяна'), h('li', null, 'До 30 т. – абонаментът (платен, пробен, изтичащ)'), h('li', null, '−15 т. при неуспешно плащане')))],
    ['list', wide(card('alert', 'Първо проблемните', table(['Шофьор', 'Здраве', 'Защо', 'Абонамент'], list.filter((x) => x.hl.cls !== 'good').map(({ d, hl }) => ({ href: '#/driver/' + d.user.id, cells: [
      h('span', { class: 'who-cell' }, h('b', null, d.user.name), h('span', null, `${d.user.city}, ${d.user.company}`)), healthChip(hl), hl.why.join(', ') || '—', h('span', { class: cx('chip', subState(d.user).cls) }, subState(d.user).label)] })), { rightFrom: 9 })))],
  ]);
}

// ---------- Профил на шофьор ----------
const viewedOnce = new Set();
function driverDetail(r) {
  const data = store.admin.driverData(r.param);
  if (!data.user) { setTimeout(() => go('/drivers')); return h('div'); }
  const u = data.user, p = data.profile, s = subState(u), owner = isOwner(), partner = role() === 'partner';
  if (!viewedOnce.has(u.id)) { viewedOnce.add(u.id); store.admin.log(u.id, 'view'); }
  const statsBox = h('div');
  const drawStats = () => { const pr = periodRange(driverState); fill(statsBox, h('div', { class: 'adm-picker' }, periodPicker(driverState, drawStats)), h('div', { style: { maxWidth: '760px' } }, statsBody(data, pr.from, pr.to, driverState.unit, { admin: true }))); };
  drawStats();
  const g = goalProgress(data);
  const life = periodStats(data, '2000-01-01', todayStr());
  const info = (label, value) => h('div', { class: 'info-row' }, h('span', { class: 'muted' }, label), h('span', null, value));
  const dispatchText = p.dispatch.mode === 'none' ? 'Няма' : `${money(p.dispatch.amount)} ${{ daily: 'на ден', weekly: 'на седмица', monthly: 'на месец' }[p.dispatch.mode]}`;
  const ds = daysSince(data), hl = health(data);
  const shifts = data.shifts.slice(0, 60);
  const pays = payments().filter((x) => x.userId === u.id);
  const tks = role() === 'partner' ? [] : store.admin.tickets().filter((t) => t.userId === u.id);
  return h('div', null,
    h('a', { class: 'back', href: '#/drivers' }, icon('left', 20), 'Шофьори'),
    pageHead(u.name, `${u.phone || ''}${u.phone ? ' · ' : ''}${u.email}`, h('div', { class: 'row gap wrap' },
      h('span', { class: cx('chip', s.cls) }, s.label), healthChip(hl),
      acts('driver.head', [
        u.phone && role() !== 'partner' && ['call', h('a', { class: 'btn btn-page', href: telHref(u.phone) }, icon('call', 18), 'Обади се')],
        u.phone && role() !== 'partner' && ['viber', h('a', { class: 'btn btn-ghost act-v', href: viberHref(u.phone) }, icon('phone', 18), 'Viber')],
        ['as', h('button', { class: 'btn btn-ghost act-v', onclick: () => { window.open(`/app?preview=${encodeURIComponent(u.id)}#/home`, '_blank'); } }, icon('eye', 18), 'Виж като шофьор')],
        ['xls', h('button', { class: 'btn btn-ghost act-n', onclick: () => exportCsv(data, { from: '2000-01-01', to: todayStr() }) }, icon('download', 18), 'Excel')]]))),
    kpis('driver.kpis', [
      ['inc', kpi('coins', 'var(--text)', 'Приход общо', money(life.income), `${life.shifts} смени`)],
      ['net', kpi('wallet', 'var(--text)', 'Чисто общо', money(life.net), `от ${fmtDate(isoToDateStr(u.createdAt), { year: true })}`, tone(life.net))],
      ['goal', kpi('target', 'var(--text)', 'Цел този месец', `${Math.round(g.pct * 100)}%`, `${money(g.net)} от ${money(p.monthlyGoal)}`)],
      ['last', kpi('clock', 'var(--text)', 'Последна смяна', agoTxt(ds), data.shifts.some((x) => !x.end) ? 'в момента кара' : `влизал ${agoTxt(loginAgo(data))}`)]]),
    flow('driver', [
      ['profile', card('user', 'Профил',
        info('Град', u.city || '—'), info('Фирма', u.company || '—'),
        info('Регистриран', fmtDate(isoToDateStr(u.createdAt), { year: true })),
        info('Откъде', SOURCES[u.source] || '—'),
        info('Последен вход', u.lastLoginAt ? timeTxt(u.lastLoginAt) : '—'),
        info('Кола', `${CAR_TYPES[p.carType]?.label}${p.carType === 'leasing' ? `, ${money(p.leasing.amount)}/мес` : p.carType === 'rent' ? `, ${money(p.rent.amount)} ${PERIODS[p.rent.period].label}` : ''}`),
        p.car?.plate && info('Номер', `${p.car.model || ''} ${p.car.plate}${p.car.code ? `, код ${p.car.code}` : ''}`.trim()),
        info('Гориво', FUELS[p.fuel]?.label), info('Ефир', dispatchText),
        !partner && acts('driver.profile', [['edit', h('button', { class: 'btn btn-ghost act-v btn-sm', onclick: () => editDriver(u) }, icon('edit', 16), 'Град и фирма')]]))],
      !partner && ['tags', tagsCard(u)],
      ['steps', card('pointer', 'Първи стъпки', h('div', { class: 'step-list' }, STEPS.map(([id, label]) => { const ok = steps(data)[id]; return h('div', { class: cx('step-row', ok && 'on') }, icon(ok ? 'check' : 'clock', 16), label); })))],
      !partner && ['access', accessCard(u, s, owner)],
      !partner && ['notes', notesCard(u)],
      owner && pays.length > 0 && ['pays', card('receipt', 'Плащания', table(['Дата', 'Сума', 'Статус', 'Фактура'], pays.slice(0, 12).map((x) => ({ cells: [fmtDate(isoToDateStr(x.at), { year: true }), money(x.amount, 2), h('span', { class: cx('chip', x.status === 'paid' ? 'good' : 'bad') }, x.status === 'paid' ? 'Платено' : 'Неуспешно'), x.invoice ? h('button', { class: 'chip page', onclick: () => printInvoice(x) }, x.invoice) : '—'] })), { rightFrom: 1 }))],
      tks.length > 0 && ['tickets', card('inbox', 'Въпроси към нас', tks.map((t) => h('a', { class: 'list-btn', href: '#/messages?t=inbox', onclick: () => { inbox.sel = t.id; } }, h('span', { class: 'grow' }, h('b', null, store.TICKET_TOPICS[t.topic]), h('small', { class: 'muted' }, ` · ${t.thread[0].text}`)), h('span', { class: cx('chip', t.status === 'open' ? 'warn' : 'good') }, t.status === 'open' ? 'Отворен' : 'Затворен'))))],
      owner && ['gdpr', gdprCard(u)],
      ['stats', wide(h('section', { class: 'card' }, cardTitle('chart', 'Статистика'), statsBox))],
      ['shifts', wide(card('list', 'Смени', table(['Дата', 'Време', 'Часове', 'Км', 'Кеш', 'Карта', 'Прил.', 'Бакшиш', 'Разходи', 'Печалба'],
        shifts.map((x) => ({ cells: [
          fmtDate(shiftDate(x), { year: true }), `${new Date(x.start).toTimeString().slice(0, 5)} – ${x.end ? new Date(x.end).toTimeString().slice(0, 5) : 'кара'}`,
          fmtDuration(shiftHours(x)), shiftKm(x), money(x.income.cash), money(x.income.card), money(x.income.app), money(x.income.tips), money(shiftExpenses(x)),
          h('b', { class: tone(shiftIncome(x) - shiftExpenses(x)) }, money(shiftIncome(x) - shiftExpenses(x)))] })), { rightFrom: 2 }),
        data.shifts.length > 60 && note(`Показани са последните 60 от ${data.shifts.length}. Всички са в Excel файла.`)))],
      ['costs', wide(card('calendar', 'Постоянни разходи', table(['Разход', 'Сума', 'Период', 'На месец', 'Следващо плащане', 'Плащания'],
        activeCosts(data.costs).map((c) => ({ cells: [c.name, money(c.amount, c.amount % 1 ? 2 : 0), PERIODS[c.period]?.short || '', money(costMonthly(c, p)), c.dueDate ? fmtDate(c.dueDate, { year: true }) : '—', (c.payments || []).length] })))))],
    ]));
}
function accessCard(u, s, owner) {
  const info = (label, value) => h('div', { class: 'info-row' }, h('span', { class: 'muted' }, label), h('span', null, value));
  return card('receipt', 'Достъп и абонамент',
    info('План', u.subscription.plan === 'trial' ? 'Пробен период' : 'Платен'),
    info('Валиден до', `${fmtDate(u.subscription.validUntil, { year: true })}${s.left != null ? ` (${s.left >= 0 ? `още ${s.left} дни` : `изтекъл преди ${-s.left} дни`})` : ''}`),
    u.subscription.paidSince && info('Платен от', fmtDate(u.subscription.paidSince, { year: true })),
    u.promo && info('Промо код', u.promo),
    owner && h('div', { class: 'act-label' }, 'Абонамент'),
    owner && acts('driver.sub', [
      ['30', h('button', { class: 'btn btn-page', onclick: () => { store.admin.extend(u.id, 30); toast('Удължен с 30 дни'); } }, '+30 дни')],
      ['365', h('button', { class: 'btn btn-ghost act-v', onclick: () => { store.admin.extend(u.id, 365); toast('Удължен с 1 година'); } }, '+1 година')],
      ['date', h('button', { class: 'btn btn-ghost act-v', onclick: () => setDate(u) }, icon('calendar', 18), 'Дата')]]),
    h('div', { class: 'act-label' }, 'Достъп'),
    acts('driver.access', [
      ['block', u.status === 'blocked'
        ? h('button', { class: 'btn btn-ghost act-ok', onclick: () => { store.admin.setStatus(u.id, 'active'); toast('Достъпът е пуснат'); } }, icon('check', 18), 'Пусни достъпа')
        : h('button', { class: 'btn btn-ghost act-warn', onclick: () => confirmSheet({ title: `Спиране на ${u.name}?`, text: 'Шофьорът няма да може да влиза, докато не пуснеш достъпа отново. Данните остават.', okLabel: 'Спри достъпа', danger: true, onOk: () => { store.admin.setStatus(u.id, 'blocked'); toast('Достъпът е спрян'); } }) }, icon('lock', 18), 'Спри достъпа')],
      ['pw', h('button', { class: 'btn btn-ghost act-n', onclick: () => resetPw(u) }, icon('key', 18), 'Нова парола')],
      owner && ['del', h('button', { class: 'btn btn-ghost act-del', onclick: () => confirmSheet({ title: 'Изтриване на акаунта?', text: `Всички данни на ${u.name} ще бъдат изтрити завинаги.`, okLabel: 'Изтрий', danger: true, onOk: () => { store.admin.deleteDriver(u.id); toast('Акаунтът е изтрит'); go('/drivers'); } }) }, icon('trash', 18), 'Изтрий')]]));
}
function tagsCard(u) {
  const inp = h('input', { class: 'input', placeholder: 'Нов етикет', list: 'tag-list' });
  const add = () => { if (!inp.value.trim()) return; store.admin.setTags(u.id, [...(u.tags || []), inp.value]); toast('Етикетът е добавен'); };
  return card('tag', 'Етикети',
    h('div', { class: 'tags', style: { marginBottom: '10px' } }, (u.tags || []).length ? u.tags.map((t) => h('span', { class: 'tag' }, t, h('button', { 'aria-label': `Махни ${t}`, onclick: () => store.admin.setTags(u.id, u.tags.filter((x) => x !== t)) }, icon('x', 12)))) : h('span', { class: 'muted small' }, 'Няма етикети.')),
    h('div', { class: 'row gap' }, inp, h('button', { class: 'btn btn-page', onclick: add }, 'Добави')),
    h('datalist', { id: 'tag-list' }, store.admin.allTags().map((t) => h('option', { value: t }))),
    note('Съобщения и нови функции може да се пращат само до един етикет.'));
}
function notesCard(u) {
  const list = store.admin.notes(u.id);
  const ta = h('textarea', { class: 'input', rows: 2, placeholder: 'Напр. „Обади се за фактурата“' });
  const due = h('input', { class: 'input', type: 'date', min: todayStr(), 'aria-label': 'Напомни ми на' });
  return card('edit', 'Бележки (вижда ги само админът)',
    h('div', { class: 'form' }, ta,
      h('div', { class: 'row gap note-add' }, h('label', { class: 'note-due' }, h('span', { class: 'muted small' }, 'Напомни ми на (по желание)'), due),
        h('button', { class: 'btn btn-page', onclick: () => { if (!ta.value.trim()) return; store.admin.addNote(u.id, ta.value, due.value || null); store.admin.log(u.id, 'note'); toast(due.value ? `Ще ти напомня на ${fmtDate(due.value)} в „Днес“` : 'Бележката е запазена'); } }, 'Добави'))),
    list.length ? list.map((n) => h('div', { class: cx('note-row', n.done && 'done') }, h('p', null, n.text),
      h('small', { class: 'muted' }, `${fmtDate(isoToDateStr(n.at), { year: true })} · ${n.by}`),
      n.due && h('div', { class: 'row gap', style: { marginTop: '6px' } }, h('span', { class: cx('chip', n.done ? 'good' : n.due <= todayStr() ? 'bad' : 'warn') }, n.done ? 'Свършено' : `Напомняне ${fmtDate(n.due)}`),
        !n.done && h('button', { class: 'btn btn-ghost act-ok btn-sm', onclick: () => { store.admin.noteDone(u.id, n.at); toast('Отбелязано като свършено'); } }, icon('check', 14), 'Свършено')))) : note('Няма бележки.'));
}
function gdprCard(u) {
  return card('shield', 'Лични данни (GDPR)',
    note('При поискване от шофьора: свали всичките му данни като файл или ги изтрий окончателно. Всяко действие се записва в „Контрол → Дневник“.'),
    acts('driver.gdpr', [
      ['exp', h('button', { class: 'btn btn-ghost act-v', onclick: () => {
        const data = store.admin.exportDriver(u.id);
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        a.download = `profitaxi-danni-${u.name.replace(/\s+/g, '-')}.json`; a.click(); toast('Файлът с данните е свален');
      } }, icon('download', 18), 'Свали всички данни')],
      ['del', h('button', { class: 'btn btn-ghost act-del', onclick: () => confirmSheet({ title: 'Окончателно изтриване?', text: `Всички данни на ${u.name} ще бъдат изтрити завинаги и не могат да се върнат.`, okLabel: 'Изтрий завинаги', danger: true, onOk: () => { store.admin.log(u.id, 'delete'); store.admin.deleteDriver(u.id); toast('Данните са изтрити'); go('/drivers'); } }) }, icon('trash', 18), 'Изтрий окончателно')]]));
}
function editDriver(u) {
  openSheet((close) => {
    const cc = cityCompanyPicker({ city: u.city, company: u.company });
    const err = h('p', { class: 'err' });
    return h('div', { class: 'form' },
      sheetHead('Град и фирма', close, u.name), cc.el, err,
      h('button', { class: 'btn btn-page btn-lg', onclick: () => { const v = cc.value(); if (!v.city || !v.company) { err.textContent = 'Избери град и фирма'; return; } store.admin.updateDriver(u.id, v); close(); toast('Запазено'); } }, 'Запази'));
  }, { tall: true });
}
function setDate(u) {
  openSheet((close) => {
    const inp = h('input', { class: 'input', type: 'date', value: u.subscription.validUntil });
    const plan = { v: u.subscription.plan };
    const segBox = h('div');
    const drawSeg = () => fill(segBox, segmented({ paid: 'Платен', trial: 'Пробен' }, plan.v, (v) => { plan.v = v; drawSeg(); }, { page: true }));
    drawSeg();
    return h('div', { class: 'form' }, sheetHead('Валиден до', close), field('Дата', inp), h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'План'), segBox),
      h('button', { class: 'btn btn-page btn-lg', onclick: () => { if (!inp.value) return; store.admin.setSubscription(u.id, inp.value, plan.v); close(); toast('Запазено'); } }, 'Запази'));
  });
}
function resetPw(u) {
  const gen = () => Math.random().toString(36).slice(2, 6) + Math.floor(1000 + Math.random() * 9000);
  openSheet((close) => {
    const inp = h('input', { class: 'input', value: gen() });
    return h('div', { class: 'form' }, sheetHead('Нова парола', close, `За ${u.name}`), field('Парола', inp, 'Изпрати я на шофьора. Той може да я смени от профила си.'),
      h('button', { class: 'btn btn-page btn-lg', onclick: () => { if (inp.value.length < 6) { toast('Поне 6 символа', 'err'); return; } store.admin.resetPassword(u.id, inp.value); close(); toast('Паролата е сменена'); } }, 'Запази'));
  });
}
function newDriver() {
  const f = { carType: '', fuel: 'petrol_lpg', days: 30 };
  const name = h('input', { class: 'input' });
  const email = h('input', { class: 'input', type: 'email' });
  const phone = h('input', { class: 'input', type: 'tel' });
  const pw = h('input', { class: 'input', value: Math.random().toString(36).slice(2, 6) + Math.floor(1000 + Math.random() * 9000) });
  const cc = cityCompanyPicker();
  const err = h('p', { class: 'err' });
  const box = h('div', { class: 'form' });
  const draw = () => fill(box,
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Кола ', h('span', { class: 'req' }, '*')), segmented(Object.fromEntries(Object.entries(CAR_TYPES).map(([k, v]) => [k, v.label])), f.carType, (v) => { f.carType = v; draw(); }, { small: true, page: true })),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Гориво'), segmented(Object.fromEntries(Object.entries(FUELS).map(([k, v]) => [k, v.label])), f.fuel, (v) => { f.fuel = v; draw(); }, { small: true, wrap: true, page: true })),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Достъп'), segmented({ 14: '14 дни', 30: '30 дни', 90: '3 месеца', 365: '1 година' }, String(f.days), (v) => { f.days = Number(v); draw(); }, { small: true, page: true })));
  draw();
  return h('div', { style: { maxWidth: '640px' } },
    h('a', { class: 'back', href: '#/drivers' }, icon('left', 20), 'Шофьори'),
    pageHead('Нов шофьор', 'Акаунтът е готов веднага. Шофьорът сам допълва останалите настройки при първия вход.'),
    h('section', { class: 'card' }, h('form', { class: 'form', novalidate: true, onsubmit: (e) => {
      e.preventDefault();
      const v = cc.value();
      const r = store.admin.createDriver({ name: name.value, email: email.value, password: pw.value, phone: phone.value, days: f.days, carType: f.carType, fuel: f.fuel, ...v });
      if (r.error) { err.textContent = r.error; return; }
      toast('Шофьорът е създаден'); go('/driver/' + r.user.id);
    } },
      field('Име', name, null, true), field('Имейл', email, null, true), field('Начална парола', pw, 'Изпрати я на шофьора', true), field('Телефон', phone, 'Задължително – един телефон, един акаунт', true),
      cc.el, box, err,
      h('button', { class: 'btn btn-page btn-lg', type: 'submit' }, 'Създай акаунт'))));
}

// =====================================================================
//   КОНТРОЛ: сигнали, дубликати, странни смени, грешки, дневник
// =====================================================================
const allDrivers = () => store.admin.allData();
// Същият телефон, номер или код на кола, име + град или подобен имейл в два и повече профила. Нищо не се спира.
function duplicates(all = allDrivers(), { withHidden } = {}) {
  const groups = []; const hidden = new Set(store.admin.notDup());
  const by = (reason, keyFn) => {
    const m = {};
    all.forEach((d) => { const k = keyFn(d); if (k) (m[k] ||= []).push(d); });
    Object.entries(m).filter(([, l]) => l.length > 1).forEach(([k, l]) => { const key = `dup:${reason}:${k}:${l.map((d) => d.user.id).sort().join(',')}`; if (withHidden || !hidden.has(key)) groups.push({ key, reason, value: k, list: l }); });
  };
  by('Телефон', (d) => store.normPhone(d.user.phone));
  by('Номер на колата', (d) => plateKey(d.profile.car?.plate));
  by('Код на колата във фирмата', (d) => (d.profile.car?.code ? `${d.user.company} · ${d.profile.car.code}` : ''));
  by('Име и град', (d) => `${d.user.name.trim().toLowerCase()} · ${d.user.city}`);
  by('Подобен имейл', (d) => { const b = emailBase(d.user.email); return b.length >= 8 ? b : ''; });
  return groups;
}
// Странни смени: без км, 20+ часа, огромен оборот, много км, голяма загуба (последните 60 дни)
function oddShifts(all = allDrivers()) {
  return once('odd', () => {
    const from = addDays(todayStr(), -60); const rev = new Set(store.admin.reviewed()); const out = [];
    all.forEach((d) => d.shifts.forEach((s) => {
      if (!s.end || shiftDate(s) < from || rev.has(s.id)) return;
      const km = shiftKm(s), hrs = shiftHours(s), inc = shiftIncome(s), net = inc - shiftExpenses(s); const why = [];
      if (km <= 0 && inc > 0) why.push('Без километри');
      if (hrs >= 20) why.push(`${fmtNum1(hrs)} часа`);
      if (inc >= 2000) why.push(`Оборот ${money(inc)}`);
      if (km >= 900) why.push(`${fmtNum(km)} км`);
      if (net < -100) why.push(`Загуба ${money(net)}`);
      if (why.length) out.push({ d, s, why });
    }));
    return out.sort((a, b) => b.s.start.localeCompare(a.s.start));
  });
}
const unreadTickets = () => (role() === 'partner' ? 0 : store.admin.tickets().filter((t) => t.adminUnread).length);
function allAlerts() {
  return once('alerts', () => {
    if (role() === 'partner') return [];
    const all = allDrivers(); const out = [];
    duplicates(all).forEach((g) => out.push({ key: g.key, ic: 'users', cls: 'bad', title: `Възможен дубликат: ${g.reason}`, text: `${g.value} – ${g.list.map((d) => d.user.name).join(', ')}`, href: '#/control?t=dups' }));
    oddShifts(all).forEach((x) => out.push({ key: `odd:${x.s.id}`, ic: 'alert', cls: 'warn', title: `Странна смяна: ${x.why.join(', ')}`, text: `${x.d.user.name}, ${fmtDate(shiftDate(x.s))}`, href: '#/control?t=odd' }));
    if (isOwner()) payments().filter((p) => p.status === 'failed').forEach((p) => out.push({ key: `fail:${p.id}`, ic: 'card', cls: 'bad', title: 'Неуспешно плащане', text: `${all.find((d) => d.user.id === p.userId)?.user.name || '—'} – ${p.reason || ''}`, href: '#/money?t=payments' }));
    all.forEach((d) => {
      const s = subState(d.user);
      if (isOwner() && s.key === 'trial' && s.left <= 3 && s.left >= 0) out.push({ key: `trial:${d.user.id}:${d.user.subscription.validUntil}`, ic: 'clock', cls: 'warn', title: 'Пробният период изтича', text: `${d.user.name} – ${s.left === 0 ? 'днес' : s.left === 1 ? 'утре' : `след ${s.left} дни`}`, href: `#/driver/${d.user.id}` });
      if (isOwner() && s.key === 'expired' && s.left >= -7) out.push({ key: `exp:${d.user.id}:${d.user.subscription.validUntil}`, ic: 'alert', cls: 'bad', title: 'Абонаментът изтече', text: d.user.name, href: `#/driver/${d.user.id}` });
    });
    store.admin.tickets().filter((t) => t.adminUnread).forEach((t) => out.push({ key: `tk:${t.id}:${t.thread.length}`, ic: 'inbox', cls: 'warn', title: 'Въпрос от шофьор', text: `${t.name}: ${t.thread.at(-1).text}`, href: '#/messages?t=inbox', on: t.id }));
    store.admin.nps().filter((n) => n.score <= 6 && (Date.now() - new Date(n.at)) / 86400000 < 30).forEach((n) => out.push({ key: `nps:${n.id}`, ic: 'heart', cls: 'warn', title: `Недоволен шофьор (оценка ${n.score})`, text: n.comment || 'без коментар', href: '#/dev?t=opinions' }));
    store.admin.ideas().filter((i) => i.status === 'new').forEach((i) => out.push({ key: `idea:${i.id}`, ic: 'sparkle', cls: 'good', title: 'Ново предложение', text: i.text, href: '#/dev?t=opinions' }));
    store.admin.errors().slice(0, 20).forEach((e) => out.push({ key: `err:${e.id}`, ic: 'bolt', cls: 'warn', title: 'Грешка в приложението', text: `${e.msg} · ${e.device}, ${e.browser}`, href: '#/control?t=errors' }));
    return out;
  });
}
function newAlerts() { const seen = new Set(store.admin.alertsSeen()); return allAlerts().filter((a) => !seen.has(a.key)); }
const alertRow = (a) => h('a', { class: 'alert-row', href: a.href, onclick: () => { if (a.on) inbox.sel = a.on; top.bell = false; } }, h('span', { class: cx('al-ic', a.cls) }, icon(a.ic, 18)), h('span', { class: 'grow' }, h('b', null, a.title), h('small', null, a.text)), icon('right', 16));

function control() {
  const all = allDrivers(); const al = allAlerts(); const seen = new Set(store.admin.alertsSeen());
  const fresh = al.filter((a) => !seen.has(a.key)); const dups = duplicates(all); const odd = oddShifts(all); const errs = store.admin.errors();
  const { bar, cur } = tabs('/control', [['alerts', 'Сигнали', fresh.length, 'alert'], ['dups', 'Дубликати', dups.length, 'alert'], ['odd', 'Странни смени', odd.length, 'alert'], ['errors', 'Грешки', errs.length], ['log', 'Дневник']]);
  const body = {
    alerts: () => {
      const cnt = (pre) => al.filter((a) => a.key.startsWith(pre));
      const newOf = (pre) => cnt(pre).filter((a) => !seen.has(a.key)).length;
      const tiles = [
        ['dup', 'users', 'Дубликати', cnt('dup:').length, newOf('dup:'), '#/control?t=dups', 'bad'],
        ['odd', 'alert', 'Странни смени', cnt('odd:').length, newOf('odd:'), '#/control?t=odd', 'warn'],
        ['err', 'bolt', 'Грешки в приложението', cnt('err:').length, newOf('err:'), '#/control?t=errors', 'warn'],
        isOwner() && ['fail', 'card', 'Неуспешни плащания', cnt('fail:').length, newOf('fail:'), '#/money?t=payments', 'bad'],
        isOwner() && ['exp', 'clock', 'Изтичащи и изтекли', cnt('trial:').length + cnt('exp:').length, newOf('trial:') + newOf('exp:'), '#/money?t=expiring', 'warn'],
        ['tk', 'inbox', 'Въпроси от шофьори', cnt('tk:').length, newOf('tk:'), '#/messages?t=inbox', 'warn'],
        ['op', 'heart', 'Недоволни и предложения', cnt('nps:').length + cnt('idea:').length, newOf('nps:') + newOf('idea:'), '#/dev?t=opinions', 'good'],
      ].filter(Boolean);
      return flow('control.alerts', [
        ['sum', wide(zone('control.sum', { class: 'sig-grid' }, tiles.map(([k, ic, label, n, fresh, href, cls]) => [k, h('a', { class: cx('sig', n > 0 && cls), href },
          h('span', { class: 'sig-ic' }, icon(ic, 20)), h('span', { class: 'grow' }, h('b', null, label), h('small', null, n ? `${n} общо${fresh ? ` · ${fresh} нови` : ''}` : 'няма')),
          h('b', { class: 'sig-n' }, String(n)), icon('right', 16))])))],
        ['new', wide(card('bell', fresh.length ? `Нови за преглед (${fresh.length})` : 'Нови за преглед',
          fresh.length ? h('div', null, fresh.slice(0, 12).map(alertRow), fresh.length > 12 && note(`и още ${fresh.length - 12} – виж ги по групите горе`)) : note('Всичко е прегледано.'),
          fresh.length > 0 && h('button', { class: 'btn btn-ghost btn-block', style: { marginTop: '10px' }, onclick: () => { store.admin.markAlertsSeen(fresh.map((a) => a.key)); toast('Отбелязани като видени'); } }, icon('check', 18), 'Маркирай всички като видени')))],
      ]);
    },
    dups: () => flow('control.dups', [
      ['info', wide(note('Профили с един и същ телефон, номер или код на кола, име и град или подобен имейл. Нищо не се спира автоматично – провери и реши. „Не е дубликат“ го скрива завинаги.'))],
      ...(dups.length ? dups.map((g) => [g.key, h('section', { class: 'card dup' },
        h('div', { class: 'dup-head' }, h('span', { class: 'chip bad' }, g.reason), h('b', null, g.value)),
        g.list.map((d) => h('a', { class: 'dup-row', href: `#/driver/${d.user.id}` }, h('span', { class: 'grow' }, h('b', null, d.user.name), h('small', null, `${d.user.email} · ${d.user.phone || 'без телефон'} · ${d.user.city}`)),
          h('span', { class: cx('chip', subState(d.user).cls) }, subState(d.user).label))),
        h('button', { class: 'btn btn-ghost act-ok btn-sm', style: { marginTop: '10px' }, onclick: () => { store.admin.markNotDup(g.key); toast('Скрито – няма да се показва повече'); } }, icon('check', 16), 'Не е дубликат'))])
        : [['none', card('check', 'Няма дубликати', note('Няма открити дубликати.'))]]),
    ]),
    odd: () => flow('control.odd', [['list', wide(card('alert', `Странни смени за последните 60 дни (${odd.length})`,
      note('Смени без километри, над 20 часа, с оборот над 2000 €, над 900 км или с голяма загуба. Обикновено са грешка при въвеждане – развалят статистиката. „Проверено“ ги маха от списъка.'),
      odd.length ? table(['Шофьор', 'Дата', 'Какво е странно', 'Оборот', 'Км', 'Часове', ''], odd.map((x) => ({ href: '#/driver/' + x.d.user.id, cells: [
        h('span', { class: 'who-cell' }, h('b', null, x.d.user.name), h('span', null, x.d.user.city)), fmtDate(shiftDate(x.s), { year: true }),
        h('span', { class: 'tags' }, x.why.map((w) => h('span', { class: 'chip warn' }, w))), money(shiftIncome(x.s)), fmtNum(shiftKm(x.s)), fmtNum1(shiftHours(x.s)),
        h('button', { class: 'btn btn-ghost act-ok btn-sm', onclick: () => { store.admin.markReviewed([x.s.id]); toast('Отбелязано като проверено'); } }, 'Проверено')] })), { rightFrom: 3 }) : note('Няма странни смени.'),
      odd.length > 1 && h('button', { class: 'btn btn-ghost btn-block', style: { marginTop: '10px' }, onclick: () => { store.admin.markReviewed(odd.map((x) => x.s.id)); toast('Всички са проверени'); } }, 'Всички са проверени')))]]),
    errors: () => {
      const groups = {}; errs.forEach((e) => { const g = groups[e.msg] ||= { msg: e.msg, n: 0, users: new Set(), dev: {}, last: e.at, page: e.page }; g.n++; g.users.add(e.name); g.dev[`${e.device}, ${e.browser}`] = 1; if (e.at > g.last) g.last = e.at; });
      return flow('control.errors', [
        ['groups', wide(card('bolt', 'Грешки в приложението', note('Когато нещо се счупи при шофьор, тук виждаш какво, при кого и на какъв телефон.'),
          table(['Грешка', 'Пъти', 'Шофьори', 'Телефон и браузър', 'Последно'], Object.values(groups).sort((a, b) => b.last.localeCompare(a.last)).map((g) => ({ cells: [h('span', { class: 'who-cell' }, h('b', null, g.msg), h('span', null, PAGE_NAMES[g.page] || g.page || '')), String(g.n), [...g.users].join(', '), Object.keys(g.dev).join('; '), timeTxt(g.last)] })), { rightFrom: 1 }),
          errs.length > 0 && isOwner() && h('button', { class: 'btn btn-ghost btn-sm', style: { marginTop: '10px' }, onclick: () => confirmSheet({ title: 'Изчистване на грешките?', okLabel: 'Изчисти', danger: true, onOk: () => store.admin.clearErrors() }) }, icon('trash', 16), 'Изчисти списъка')))]]);
    },
    log: () => {
      const auditL = store.admin.audit().slice(0, 60), access = store.admin.accessLog().slice(0, 40);
      return flow('control.log', [
        ['audit', card('edit', 'Кой какво е променил', note('Всяко действие на админ: удължен абонамент, спрян достъп, сменена цена, изтрит шофьор, съобщения.'),
          auditL.length ? table(['Кога', 'Админ', 'Действие'], auditL.map((l) => ({ cells: [timeTxt(l.at), l.by, l.text] })), { rightFrom: 9 }) : note('Още няма записи.'))],
        ['access', card('eye', 'Кой какви данни е гледал', note('Отваряне, сваляне и изтриване на данни на шофьор.'),
          access.length ? table(['Кога', 'Админ', 'Шофьор', 'Действие'], access.map((l) => ({ cells: [timeTxt(l.at), l.by, l.name, { view: 'Отвори профила', export: 'Свали данните', delete: 'Изтри', note: 'Бележка' }[l.action] || l.action] })), { rightFrom: 9 }) : note('Още няма записи.'))],
        ['gdpr', card('shield', 'Поверителност (GDPR)', h('ul', { class: 'adm-list' },
          h('li', null, 'В профила на всеки шофьор има „Свали всички данни“ и „Изтрий окончателно“.'),
          h('li', null, 'Всяко отваряне, сваляне и изтриване се записва тук.'),
          h('li', null, 'Телефонът се потвърждава с SMS при регистрация – един телефон, един акаунт.'),
          h('li', null, 'Отчетите за фирмите са само обобщени – без имена и лични данни.'),
          h('li', null, 'Партньорите виждат само шофьорите на своята фирма.')))],
      ]);
    },
  };
  return h('div', null, pageHead('Контрол', 'Какво трябва да провериш'), bar, body[cur]());
}

// =====================================================================
//   СЪОБЩЕНИЯ: входящи, ново, изпратени, чести въпроси
// =====================================================================
const msgState = { title: '', text: '', mode: 'all', city: '', company: '', tag: '', userIds: [], when: 'now', at: '' };
const inbox = { sel: null, filter: 'open', reply: '' };
const TEMPLATES = [
  ['support', 'Поддръжка', 'Временно има проблем', 'Знаем за проблема с … и работим по него. Ще ви пишем, щом е оправен. Данните ви са запазени.'],
  ['new', 'Ново в приложението', 'Ново в ProfiTaxi', 'Добавихме … Вижте го в „…“. Пишете ни, ако имате идеи как да стане още по-удобно.'],
  ['pay', 'Напомняне за плащане', 'Абонаментът изтича скоро', 'Абонаментът ви изтича след няколко дни. Подновете го, за да не спира достъпът до отчетите. Данните ви остават.'],
  ['welcome', 'Добре дошли', 'Добре дошли в ProfiTaxi', 'Започнете с първата смяна от „Днес“ – отнема 10 секунди. В края на месеца ще видите точно колко ви остава.'],
];
// Готови отговори за входящите – натискаш и го пращаш (или първо го променяш)
const QUICK = [
  ['pw', 'Нова парола', 'Изпратихме ви нова парола по SMS. Сменете я от „Моят профил → Смяна на паролата“.'],
  ['night', 'Смяна след полунощ', 'Въведете смяната с датата, на която е започнала. Приложението я брои към този ден, дори да свършва след полунощ.'],
  ['tips', 'Бакшиш след смяна', 'Отворете смяната от „Пари → Всички смени“, натиснете я и добавете бакшиша. Сметката се оправя сама.'],
  ['paid', 'Абонаментът е подновен', 'Абонаментът ви е подновен. Ако още не се вижда, излезте и влезте отново в приложението.'],
  ['invoice', 'Фактура', 'Фактурата ще получите на имейла си до 3 работни дни. Ако е на фирма, пратете ни ЕИК и адрес.'],
  ['check', 'Проверяваме', 'Благодарим! Проверяваме и ще ви пишем до края на деня.'],
];
const SOURCES = { site: 'Сайт', code: 'Код на фирма', promo: 'Промо код', invite: 'Покана', admin: 'Добавен от админ' };
function messagesPage() {
  const tk = store.admin.tickets(); const unread = tk.filter((t) => t.adminUnread).length;
  const { bar, cur } = tabs('/messages', [['inbox', 'Входящи', unread, 'alert'], ['new', 'Ново съобщение'], ['sent', 'Изпратени', store.admin.messages().length], ['faq', 'Чести въпроси']]);
  const body = { inbox: () => inboxTab(tk), new: composeTab, sent: sentTab, faq: () => faqTab(tk) };
  return h('div', null, pageHead('Съобщения', 'Въпросите на шофьорите и съобщенията до тях – на едно място'), bar, body[cur]());
}
function inboxTab(tk) {
  const list = tk.filter((t) => inbox.filter === 'all' || t.status === inbox.filter);
  const t = tk.find((x) => x.id === inbox.sel);
  if (t?.adminUnread) setTimeout(() => store.admin.readTicket(t.id), 600);
  const ta = h('textarea', { class: 'input', rows: 3, placeholder: 'Отговор до шофьора', oninput: (e) => { inbox.reply = e.target.value; } }); ta.value = inbox.reply;
  const tu = t && store.admin.driverData(t.userId).user;
  const thread = t && card('inbox', `${t.name} · ${store.TICKET_TOPICS[t.topic]}`,
    h('div', { class: 'thread' }, t.thread.map((m) => h('div', { class: cx('bubble', m.by) }, h('p', null, m.text), h('small', null, `${m.by === 'admin' ? m.name || 'Админ' : t.name} · ${timeTxt(m.at)}`)))),
    h('div', { class: 'form', style: { marginTop: '12px' } },
      zone('messages.quick', { class: 'quick-list' }, QUICK.map(([k, label, text]) => [k, h('button', { class: 'quick', title: text, onclick: () => { inbox.reply = text; ta.value = text; ta.focus(); } }, label)])),
      ta,
      acts('messages.reply', [
        ['send', h('button', { class: 'btn btn-page', onclick: () => { if (!inbox.reply.trim()) return; store.admin.replyTicket(t.id, inbox.reply); inbox.reply = ''; toast('Отговорът е изпратен – шофьорът ще го види в приложението'); } }, icon('bell', 18), 'Изпрати')],
        ['close', t.status === 'open' ? h('button', { class: 'btn btn-ghost act-ok', onclick: () => { store.admin.setTicketStatus(t.id, 'closed'); toast('Затворен'); } }, icon('check', 18), 'Затвори')
          : h('button', { class: 'btn btn-ghost act-warn', onclick: () => store.admin.setTicketStatus(t.id, 'open') }, 'Отвори отново')],
        ['driver', h('a', { class: 'btn btn-ghost act-v', href: '#/driver/' + t.userId }, icon('user', 18), 'Профил')],
        tu?.phone && ['call', h('a', { class: 'btn btn-ghost act-n', href: telHref(tu.phone) }, icon('call', 18), 'Обади се')],
        tu?.phone && ['viber', h('a', { class: 'btn btn-ghost act-n', href: viberHref(tu.phone) }, icon('phone', 18), 'Viber')]])));
  return h('div', null,
    segmented({ open: `Отворени ${tk.filter((x) => x.status === 'open').length}`, closed: 'Затворени', all: 'Всички' }, inbox.filter, (v) => { inbox.filter = v; render(); }, { small: true, page: true }),
    flow('messages.inbox', [
      ['list', card('list', `Въпроси (${list.length})`, list.length ? list.map((x) => h('button', { class: cx('tk-row', x.id === inbox.sel && 'on', x.adminUnread && 'unread'), onclick: () => { inbox.sel = x.id; inbox.reply = ''; render(); } },
        h('span', { class: 'grow' }, h('b', null, x.name), h('small', null, x.thread.at(-1).text)),
        h('span', { class: 'tk-meta' }, h('span', { class: 'chip' }, store.TICKET_TOPICS[x.topic]), h('small', null, timeTxt(x.thread.at(-1).at))))) : note('Няма въпроси тук.'))],
      ['thread', thread || card('inbox', 'Избери въпрос', note('Шофьорите пишат от „Моят профил → Пиши ни“. Отговорът им излиза в приложението.'))],
    ]));
}
function composeTab() {
  const all = allDrivers();
  const title = h('input', { class: 'input', value: msgState.title, maxlength: 80, placeholder: 'Заглавие', oninput: (e) => { msgState.title = e.target.value; } });
  const text = h('textarea', { class: 'input', rows: 4, maxlength: 400, placeholder: 'Текст на съобщението', oninput: (e) => { msgState.text = e.target.value; } }); text.value = msgState.text;
  const target = () => ({ all: null, city: msgState.city ? { city: msgState.city } : null, company: msgState.company ? { company: msgState.company } : null, tag: msgState.tag ? { tag: msgState.tag } : null, picked: msgState.userIds.length ? { userIds: msgState.userIds } : null }[msgState.mode]);
  const modes = { all: 'Всички', city: 'Град', company: 'Фирма', tag: 'Етикет', picked: `Избрани${msgState.userIds.length ? ` (${msgState.userIds.length})` : ''}` };
  const who = {
    city: () => field('Град', sel(citiesOf(all), msgState.city, (v) => { msgState.city = v; render(); }, 'Избери град')),
    company: () => field('Фирма', sel(companiesOf(all), msgState.company, (v) => { msgState.company = v; render(); }, 'Избери фирма')),
    tag: () => field('Етикет', sel(store.admin.allTags(), msgState.tag, (v) => { msgState.tag = v; render(); }, 'Избери етикет')),
    picked: () => h('p', { class: 'muted small' }, msgState.userIds.length ? msgState.userIds.map((id) => store.admin.driverData(id).user?.name).filter(Boolean).join(', ') : 'Отметни шофьори в „Шофьори“ и натисни „Съобщение“.'),
  }[msgState.mode];
  const at = h('input', { class: 'input', type: 'datetime-local', value: msgState.at || `${addDays(todayStr(), 1)}T09:00`, onchange: (e) => { msgState.at = e.target.value; } });
  const tg = target(); const n = msgState.mode !== 'all' && !tg ? 0 : store.admin.reach(tg);
  return flow('messages.new', [
    ['form', card('bell', 'Ново съобщение', h('div', { class: 'form' },
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'До кого'), segmented(modes, msgState.mode, (v) => { msgState.mode = v; render(); }, { small: true, wrap: true, page: true })),
      who && who(),
      field('Заглавие', title), field('Текст', text),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Кога'), segmented({ now: 'Сега', later: 'По-късно' }, msgState.when, (v) => { msgState.when = v; render(); }, { small: true, page: true })),
      msgState.when === 'later' && field('Дата и час', at),
      h('p', { class: 'muted small' }, `Ще го видят ${n} шофьори горе на „Днес“.`),
      h('button', { class: 'btn btn-page btn-lg', onclick: () => {
        if (!msgState.title.trim() || !msgState.text.trim()) { toast('Напиши заглавие и текст', 'err'); return; }
        if (msgState.mode !== 'all' && !target()) { toast('Избери до кого', 'err'); return; }
        const sendAt = msgState.when === 'later' ? new Date(msgState.at || at.value).toISOString() : null;
        store.admin.sendMessage({ title: msgState.title, text: msgState.text, target: target(), sendAt });
        Object.assign(msgState, { title: '', text: '', userIds: msgState.mode === 'picked' ? [] : msgState.userIds, when: 'now', at: '' }); toast(sendAt ? 'Съобщението е насрочено' : 'Съобщението е изпратено');
      } }, icon('bell', 18), msgState.when === 'later' ? 'Насрочи' : 'Изпрати')))],
    ['tpl', card('doc', 'Готови шаблони', note('Натисни шаблон – попълва заглавието и текста. После ги промени.'),
      zone('messages.tpl', { class: 'tpl-list' }, TEMPLATES.map(([k, label, t, x]) => [k, h('button', { class: 'tpl', onclick: () => { msgState.title = t; msgState.text = x; render(); } }, h('b', null, label), h('small', null, t))])))],
  ]);
}
function sentTab() {
  const list = store.admin.messages(); const now = new Date().toISOString();
  const tgt = (t) => (!t ? 'до всички' : t.userIds ? `до ${t.userIds.length} избрани` : t.tag ? `етикет „${t.tag}“` : [t.city, t.company].filter(Boolean).join(', '));
  return flow('messages.sent', [['list', wide(card('list', `Изпратени (${list.length})`,
    list.length ? list.map((m) => { const n = store.admin.reach(m.target); const later = m.sendAt && m.sendAt > now; return h('div', { class: 'sent' },
      h('div', { class: 'grow' }, h('b', null, m.title, later && h('span', { class: 'chip warn', style: { marginLeft: '8px' } }, `Насрочено: ${timeTxt(m.sendAt)}`)), h('p', null, m.text),
        h('small', { class: 'muted' }, `${fmtDate(isoToDateStr(m.at))} · ${tgt(m.target)}`),
        !later && h('div', { class: 'read-bar' }, h('i', { style: { width: `${n ? (m.readBy.length / n) * 100 : 0}%` } }), h('span', null, `прочетено от ${m.readBy.length} от ${n}`))),
      h('button', { class: 'icon-btn', 'aria-label': 'Изтрий', onclick: () => confirmSheet({ title: 'Изтриване на съобщението?', okLabel: 'Изтрий', danger: true, onOk: () => store.admin.deleteMessage(m.id) }) }, icon('trash', 18))); })
      : note('Още няма изпратени съобщения.')))]]);
}
function faqTab(tk) {
  const counts = Object.entries(store.TICKET_TOPICS).map(([k, l]) => [l, tk.filter((t) => t.topic === k).length]).sort((a, b) => b[1] - a[1]);
  const topT = counts[0];
  return flow('messages.faq', [
    ['bars', card('chart', 'За какво питат най-често', hbars(counts, tk.length),
      topT && topT[1] > 0 && h('p', { class: 'tip-line' }, icon('sparkle', 16), `Най-много въпроси има за „${topT[0]}“ – това е първото нещо за оправяне в приложението.`))],
    ['last', card('inbox', 'Последни въпроси по тема', counts.filter((c) => c[1]).map(([label]) => { const k = Object.entries(store.TICKET_TOPICS).find((x) => x[1] === label)[0]; const l = tk.filter((t) => t.topic === k).slice(0, 2);
      return h('div', { class: 'faq-g' }, h('b', null, label), l.map((t) => h('p', { class: 'quote-s' }, `„${t.thread[0].text}“ – ${t.name}`))); }))],
  ]);
}

// =====================================================================
//   ПАРТНЬОРИ: фирми, кодове за достъп, месечен отчет
// =====================================================================
const repState = { company: '', month: todayStr().slice(0, 7) };
function partners() {
  const all = allDrivers(); const comps = companiesOf(all); const codes = store.admin.codes();
  if (!comps.includes(repState.company)) repState.company = comps.includes('ONE Такси – 032 22 22') ? 'ONE Такси – 032 22 22' : comps[0] || '';
  const { bar, cur } = tabs('/partners', [['firms', 'Фирми', comps.length], ['codes', 'Кодове за достъп', codes.length], ['report', 'Месечен отчет']]);
  const body = { firms: () => firmsTab(all, comps, codes), codes: () => codesTab(all, comps, codes), report: () => flow('partners.report', [['rep', wide(companyReport(all, comps))]]) };
  return h('div', null, pageHead('Партньори', role() === 'partner' ? store.adminUser().company : 'Таксиметровите фирми, кодовете им и месечните отчети'), bar, body[cur]());
}
function firmStats(all, c) {
  const list = all.filter((d) => d.user.company === c);
  const from = startOfMonth(todayStr());
  const T = aggregate(list.map((d) => ({ d, st: periodStats(d, from, todayStr()) })));
  return { list, T, active: list.filter(isActive).length, city: list[0]?.user.city || '' };
}
function firmsTab(all, comps, codes) {
  const c = repState.company; const f = firmStats(all, c);
  const fc = codes.filter((x) => x.company === c);
  return flow('partners.firms', [
    ['pick', wide(h('div', { class: 'adm-filters' }, sel(comps, c, (v) => { repState.company = v; render(); }, null, { style: { minHeight: '44px' } })))],
    ['card', card('car', c || '—',
      zone('partners.firm.nums', { class: 'big-nums two' }, [
        ['drv', bigNum('Шофьори', String(f.list.length), f.city)],
        ['act', bigNum('Активни', String(f.active), 'смяна през последните 7 дни', 'live')],
        ['inc', bigNum('Оборот този месец', money(f.T.income), `${f.T.shifts} смени`)],
        ['ph', bigNum('Чисто на час', money2(f.T.perHour), 'средно')]]),
      h('div', { class: 'act-label' }, 'Кодове за достъп'),
      fc.length ? fc.map((x) => h('div', { class: 'code-row' }, h('div', { class: 'grow' }, h('b', { class: 'code' }, x.code), h('small', null, `ползван ${x.uses}${x.limit ? ` от ${x.limit}` : ''}`)), h('span', { class: cx('chip', x.active ? 'good' : 'bad') }, x.active ? 'Активен' : 'Спрян'))) : note('Няма код за тази фирма.'),
      acts('partners.firm.acts', [
        ['rep', h('a', { class: 'btn btn-page btn-sm', href: '#/partners?t=report' }, icon('doc', 16), 'Месечен отчет')],
        ['send', h('button', { class: 'btn btn-ghost act-v btn-sm', onclick: () => sendReport(all, c) }, icon('share', 16), 'Изпрати отчета')],
        role() !== 'partner' && ['drv', h('button', { class: 'btn btn-ghost act-n btn-sm', onclick: () => { scope.city = f.city; scope.company = c; go('/drivers'); } }, icon('users', 16), 'Шофьорите')]]))],
    ['drivers', card('users', 'Шофьорите на фирмата', table(['Шофьор', 'Активен', 'Последна смяна'], f.list.map((d) => ({ href: '#/driver/' + d.user.id, cells: [d.user.name, isActive(d) ? h('span', { class: 'chip good' }, 'да') : h('span', { class: 'chip' }, 'не'), d.shifts.find((s) => s.end) ? fmtDate(shiftDate(d.shifts.find((s) => s.end))) : '—'] })), { rightFrom: 1 }))],
    role() !== 'partner' && ['all', wide(card('list', 'Всички фирми', table(['Фирма', 'Град', 'Шофьори', 'Активни', 'Оборот (месец)', 'Чисто/час'], comps.map((x) => ({ x, ...firmStats(all, x) })).sort((a, b) => b.list.length - a.list.length).map((r) => ({ cells: [
      h('button', { class: 'link-btn', onclick: () => { repState.company = r.x; render(); } }, r.x), r.city, String(r.list.length), String(r.active), money(r.T.income), money2(r.T.perHour)] })), { rightFrom: 2 })))],
  ]);
}
function reportLines(all, c) {
  const from = `${repState.month}-01`, to = endOfMonth(from); const [y, m] = repState.month.split('-').map(Number);
  const list = all.filter((d) => d.user.company === c); const T = aggregate(list.map((d) => ({ d, st: periodStats(d, from, to) })));
  return [`${c} – ${MONTHS[m - 1]} ${y} (ProfiTaxi)`, `Шофьори в ProfiTaxi: ${list.length}`, `Активни през месеца: ${T.active}`, `Смени: ${T.shifts}`, `Оборот общо: ${money(T.income)}`, `Чисто на час (средно): ${money2(T.perHour)}`, 'Само обобщени данни – без имена и лични данни.'];
}
function sendReport(all, c) {
  const lines = reportLines(all, c);
  // имейлът тръгва от сървъра, щом го свържем; дотогава – готово писмо в пощата
  location.href = `mailto:?subject=${encodeURIComponent(lines[0])}&body=${encodeURIComponent(lines.join('\n'))}`;
  toast('Отворено е писмо с отчета');
}
function codesTab(all, comps, codes) {
  const f = { code: h('input', { class: 'input', placeholder: 'напр. YELLOW2026', style: { textTransform: 'uppercase' } }), company: role() === 'partner' ? store.adminUser().company : comps[0] || '', limit: h('input', { class: 'input', type: 'number', min: 0, value: 100 }), expires: h('input', { class: 'input', type: 'date', value: addDays(todayStr(), 180) }) };
  return flow('partners.codes', [
    ['list', card('key', 'Кодове за достъп', note('С код от фирмата шофьорите се регистрират в изданието на партньора (напр. One Taxi). Можеш да спреш код по всяко време.'),
      codes.length ? codes.map((c) => h('div', { class: 'code-row' },
        h('div', { class: 'grow' }, h('b', { class: 'code' }, c.code), h('small', null, `${c.company} · ползван ${c.uses}${c.limit ? ` от ${c.limit}` : ''} · ${c.expires ? `до ${fmtDate(c.expires, { year: true })}` : 'без срок'}`)),
        role() !== 'partner' && h('button', { class: cx('btn btn-sm btn-ghost', c.active ? 'act-ok' : 'act-warn'), onclick: () => store.admin.toggleCode(c.code) }, c.active ? 'Активен' : 'Спрян'),
        isOwner() && h('button', { class: 'icon-btn', 'aria-label': 'Изтрий кода', onclick: () => confirmSheet({ title: `Изтриване на ${c.code}?`, okLabel: 'Изтрий', danger: true, onOk: () => store.admin.deleteCode(c.code) }) }, icon('trash', 16)))) : note('Няма кодове.'))],
    isOwner() && ['new', card('plus', 'Нов код', h('div', { class: 'form' },
      h('div', { class: 'grid2' }, field('Код', f.code), field('Фирма', sel(comps, f.company, (v) => { f.company = v; }))),
      h('div', { class: 'grid2' }, field('Максимум регистрации', f.limit, '0 = без лимит'), field('Валиден до', f.expires)),
      h('button', { class: 'btn btn-page', onclick: () => {
        const city = all.find((d) => d.user.company === f.company)?.user.city || '';
        const r = store.admin.saveCode({ code: f.code.value, company: f.company, city, limit: Number(f.limit.value) || 0, expires: f.expires.value || null });
        if (r.error) toast(r.error, 'err'); else toast('Кодът е създаден');
      } }, icon('plus', 18), 'Създай код')))],
  ]);
}
function companyReport(all, comps) {
  const [y, m] = repState.month.split('-').map(Number);
  const from = `${repState.month}-01`, to = endOfMonth(from);
  const list = all.filter((d) => d.user.company === repState.company);
  const T = aggregate(list.map((d) => ({ d, st: periodStats(d, from, to) })));
  const shifts = list.flatMap((d) => d.shifts.filter((s) => s.end && shiftDate(s) >= from && shiftDate(s) <= to));
  const ti = timeInsights(shifts);
  const byWd = Array(7).fill(0); shifts.forEach((s) => { byWd[(new Date(s.start).getDay() + 6) % 7] += shiftIncome(s); });
  const bestWd = byWd.indexOf(Math.max(...byWd));
  const cars = {}; list.forEach((d) => { const k = CAR_TYPES[d.profile.carType]?.label || '—'; cars[k] = (cars[k] || 0) + 1; });
  const month = h('input', { class: 'input', type: 'month', value: repState.month, max: todayStr().slice(0, 7), onchange: (e) => { repState.month = e.target.value || repState.month; render(); } });
  const repCell = (label, value) => h('div', { class: 'rep-cell' }, h('span', null, label), h('b', null, value));
  return card('doc', 'Месечен отчет за фирма',
    h('div', { class: 'grid2 no-print' }, field('Фирма', sel(comps, repState.company, (v) => { repState.company = v; render(); })), field('Месец', month)),
    h('div', { class: 'report', id: 'company-report' },
      h('div', { class: 'rep-head' }, h('b', null, repState.company || '—'), h('span', null, `${MONTHS[m - 1]} ${y} · ProfiTaxi`)),
      list.length ? h('div', null,
        h('div', { class: 'rep-grid' },
          repCell('Шофьори в ProfiTaxi', String(list.length)), repCell('Активни през месеца', String(T.active)),
          repCell('Смени', fmtNum(T.shifts)), repCell('Часове', fmtNum(Math.round(T.hours))),
          repCell('Оборот общо', money(T.income)), repCell('Чисто на час (средно)', money2(T.perHour)),
          repCell('Оборот на смяна', money(T.perShift)), repCell('Км на смяна', T.shifts ? fmtNum(T.km / T.shifts) : '—')),
        h('p', { class: 'rep-line' }, h('b', null, 'Най-силен ден: '), T.shifts ? WD_SHORT[bestWd] : '—', ti.top[0] ? [h('b', null, ' · Най-добро време: '), `${WD_SHORT[ti.top[0].wd]} ${ti.top[0].from}:00–${ti.top[0].to}:00`] : ''),
        h('p', { class: 'rep-line' }, h('b', null, 'Коли: '), Object.entries(cars).map(([k, v]) => `${k} ${v}`).join(', ')),
        h('p', { class: 'muted small' }, 'Само обобщени данни – без имена, телефони или данни за отделен шофьор.'))
        : note('Няма шофьори от тази фирма.')),
    acts('partners.report.acts', [
      ['pdf', h('button', { class: 'btn btn-page no-print', onclick: () => { document.body.classList.add('print-report'); window.print(); setTimeout(() => document.body.classList.remove('print-report'), 500); } }, icon('print', 18), 'Свали като PDF')],
      ['send', h('button', { class: 'btn btn-ghost act-v no-print', onclick: () => sendReport(all, repState.company) }, icon('share', 18), 'Изпрати на фирмата')]]));
}

// =====================================================================
//   РАСТЕЖ: фуния, задържане, откъде идват, защо се отказват, стойност
// =====================================================================
function growth() {
  const all = scoped();
  const { bar, cur } = tabs('/growth', [['month', 'Този месец'], ['funnel', 'Фуния'], ['retention', 'Задържане'], ['sources', 'Откъде идват'], ['churn', 'Защо се отказват', store.admin.churn().length], ['value', 'Стойност на клиент']]);
  const body = { month: () => monthTab(all), funnel: () => funnelTab(all), retention: () => retentionTab(all), sources: () => sourcesTab(all), churn: () => churnTab(all), value: () => valueTab(all) };
  return h('div', null, pageHead('Растеж', `${scopeLabel()}: откъде идват шофьорите, къде се губят и колко носят`), bar, body[cur]());
}
// Този месец срещу същите дни от миналия (напр. 1–6 окт срещу 1–6 сеп)
function monthTab(all) {
  const t = todayStr(), from = startOfMonth(t);
  const pd = parseDate(from); pd.setMonth(pd.getMonth() - 1); const pFrom = dateStr(pd);
  const len = daysAgo(from); const pTo0 = addDays(pFrom, len); const pTo = pTo0 < from ? pTo0 : addDays(from, -1);
  const ids = new Set(all.map((d) => d.user.id));
  const pays = payments().filter((p) => ids.has(p.userId) && p.status === 'paid');
  const inR = (date, a, b) => date >= a && date <= b;
  const calc = (a, b) => {
    const T = aggregate(all.map((d) => ({ d, st: periodStats(d, a, b) })));
    return {
      regs: all.filter((d) => inR(isoToDateStr(d.user.createdAt), a, b)).length,
      firstPaid: all.filter((d) => d.user.subscription.paidSince && inR(d.user.subscription.paidSince, a, b)).length,
      lost: all.filter((d) => d.user.subscription.paidSince && inR(d.user.subscription.validUntil, a, b) && d.user.subscription.validUntil < t).length,
      active: T.active, shifts: T.shifts, income: T.income,
      revenue: pays.filter((p) => inR(isoToDateStr(p.at), a, b)).reduce((x, p) => x + p.amount, 0),
    };
  };
  const C = calc(from, t), P = calc(pFrom, pTo);
  const rows = [['Нови регистрации', 'regs'], ['Платили за първи път', 'firstPaid'], ['Отказали се', 'lost', true], ['Активни шофьори', 'active'], ['Смени', 'shifts'], ['Оборот на шофьорите', 'income', false, true], isOwner() && ['Приход от абонаменти', 'revenue', false, true]].filter(Boolean);
  const diff = (c, p, inv, m) => { const d = c - p; if (!d) return h('span', { class: 'muted' }, 'без промяна'); const good = inv ? d < 0 : d > 0; return h('b', { class: good ? 'pos' : 'neg' }, `${d > 0 ? '▲' : '▼'} ${m ? money(Math.abs(d)) : fmtNum(Math.abs(d))}`); };
  return flow('growth.month', [['t', wide(card('calendar', `${fmtDate(from)} – ${fmtDate(t)} срещу ${fmtDate(pFrom)} – ${fmtDate(pTo)}`,
    note('Сравняваме същия брой дни, за да е честно и в началото на месеца.'),
    table(['', 'Този месец', 'Миналия', 'Разлика'], rows.map(([label, k, inv, m]) => ({ cells: [h('b', null, label), m ? money(C[k]) : fmtNum(C[k]), m ? money(P[k]) : fmtNum(P[k]), diff(C[k], P[k], inv, m)] })), { rightFrom: 1 })))]]);
}
function funnelTab(all) {
  const n = all.length;
  const st = [['Регистрирали се', n], ['Настроили колата', all.filter((d) => d.profile.onboarded).length], ['Първа смяна', all.filter((d) => d.shifts.some((s) => s.end)).length], ['5+ смени', all.filter((d) => d.shifts.filter((s) => s.end).length >= 5).length], ['Платили', all.filter((d) => d.user.subscription?.paidSince).length]];
  let worst = 1; st.forEach((x, i) => { if (i && st[i - 1][1] && x[1] / st[i - 1][1] < st[worst][1] / Math.max(1, st[worst - 1][1])) worst = i; });
  return flow('growth.funnel', [['f', wide(card('chart', 'Фуния на регистрациите', note('Колко шофьори стигат до всяка стъпка. Най-голямото падане показва какво да оправиш.'),
    h('div', { class: 'funnel' }, st.map(([label, v], i) => h('div', { class: cx('fn-row', i === worst && 'worst') },
      h('span', { class: 'fn-label' }, label),
      h('div', { class: 'fn-bar' }, h('i', { style: { width: `${n ? (v / n) * 100 : 0}%` } }), h('b', null, `${v} · ${pct(v, n)}`)),
      i > 0 && h('small', { class: 'fn-drop' }, st[i - 1][1] ? `−${Math.round(100 - (v / st[i - 1][1]) * 100)}% от предната стъпка` : '')))),
    h('p', { class: 'tip-line' }, icon('sparkle', 16), `Най-много се губят между „${st[worst - 1][0]}“ и „${st[worst][0]}“.`)))]]);
}
function retentionTab(all) {
  const weekStart = (iso) => startOfWeek(isoToDateStr(iso));
  const cohorts = {}; all.forEach((d) => { (cohorts[weekStart(d.user.createdAt)] ||= []).push(d); });
  const weeks = Object.keys(cohorts).sort().slice(-10);
  const activeIn = (d, w) => { const from = addDays(weekStart(d.user.createdAt), w * 7), to = addDays(from, 6); return from <= todayStr() ? d.shifts.some((s) => s.end && shiftDate(s) >= from && shiftDate(s) <= to) : null; };
  const W = [1, 2, 4, 8];
  return flow('growth.retention', [['t', wide(card('users', 'Задържане по седмица на регистрация', note('Какъв дял от записалите се през дадена седмица още пишат смени след 1, 2, 4 и 8 седмици.'),
    table(['Седмица', 'Записали се', ...W.map((w) => `След ${w} седм.`)], weeks.map((wk) => { const list = cohorts[wk]; return { cells: [fmtDate(wk), String(list.length), ...W.map((w) => {
      const vals = list.map((d) => activeIn(d, w)); if (vals.some((v) => v === null)) return h('span', { class: 'muted' }, '—');
      const p = vals.filter(Boolean).length / list.length; return h('span', { class: 'ret', style: { '--p': p } }, `${Math.round(p * 100)}%`); })] }; }), { rightFrom: 1 })))]]);
}
function sourcesTab(all) {
  const by = {}; all.forEach((d) => { const k = d.user.source || 'site'; (by[k] ||= []).push(d); });
  const rows = Object.entries(by).sort((a, b) => b[1].length - a[1].length);
  const promos = isOwner() ? store.admin.promos() : [];
  return flow('growth.sources', [
    ['bars', card('target', 'Откъде идват регистрациите', hbars(rows.map(([k, l]) => [SOURCES[k] || k, l.length]), all.length))],
    ['conv', card('trophy', 'Кой източник носи платени', table(['Източник', 'Регистрации', 'Платили', 'Дял', 'Активни'], rows.map(([k, l]) => { const p = l.filter((d) => d.user.subscription.paidSince).length; return { cells: [h('b', null, SOURCES[k] || k), String(l.length), String(p), pct(p, l.length), String(l.filter(isActive).length)] }; }), { rightFrom: 1 }),
      note('Сравни източниците: откъдето идват платили шофьори, там си струва да даваш повече за реклама.'))],
    ['ref', referralCard(all)],
    promos.length > 0 && ['promo', card('gift', 'Промо кодове', table(['Код', 'Отстъпка', 'Ползван', 'Платили'], promos.map((p) => { const l = all.filter((d) => d.user.promo === p.code); return { cells: [h('b', { class: 'code' }, p.code), p.kind === 'months' ? `${p.value} мес. безплатно` : `-${p.value}%`, `${p.uses}${p.limit ? ` от ${p.limit}` : ''}`, String(l.filter((d) => d.user.subscription.paidSince).length)] }; }), { rightFrom: 2 }))],
  ]);
}
function referralCard(all) {
  const on = store.admin.settings().referrals !== false;
  const by = new Map(); all.forEach((d) => { if (d.user.referredBy) { const r = by.get(d.user.referredBy) || { n: 0, paid: 0 }; r.n++; if (d.user.subscription.paidSince) r.paid++; by.set(d.user.referredBy, r); } });
  const top = [...by.entries()].map(([id, r]) => ({ d: all.find((x) => x.user.id === id), ...r })).filter((x) => x.d).sort((a, b) => b.paid - a.paid || b.n - a.n).slice(0, 8);
  return card('gift', 'Препоръки от шофьори',
    note(`${on ? 'Включени' : 'Изключени'}. Шофьорът получава 1 месец безплатно за всеки поканен колега, който плати – така никога не даваш месец за човек, който не носи пари. Включваш и изключваш от Настройки → Общи.`),
    top.length ? table(['Шофьор', 'Поканени', 'Платили', 'Спечелени месеци'], top.map((x) => ({ href: '#/driver/' + x.d.user.id, cells: [x.d.user.name, String(x.n), String(x.paid), String(x.d.user.refMonths || 0)] })), { rightFrom: 1 }) : note('Още няма препоръки.'));
}
function churnTab(all) {
  const ids = new Set(all.map((d) => d.user.id));
  const list = store.admin.churn().filter((c) => ids.has(c.userId) || !scope.city);
  const counts = Object.entries(store.CHURN_REASONS).map(([k, l]) => [l, list.filter((c) => c.reason === k).length]).filter((x) => x[1]).sort((a, b) => b[1] - a[1]);
  return flow('growth.churn', [
    ['bars', card('heart', 'Защо спират', note('Когато абонаментът изтече, приложението пита шофьора защо. Един отговор с едно натискане.'), counts.length ? hbars(counts, list.length) : note('Още няма отговори.'))],
    ['list', card('list', 'Отговори', list.length ? table(['Шофьор', 'Причина', 'Коментар', 'Кога'], list.sort((a, b) => b.at.localeCompare(a.at)).map((c) => ({ href: ids.has(c.userId) ? '#/driver/' + c.userId : null, cells: [h('span', { class: 'who-cell' }, h('b', null, c.name), h('span', null, c.city)), store.CHURN_REASONS[c.reason] || c.reason, c.comment || '—', fmtDate(isoToDateStr(c.at))] })), { rightFrom: 9 }) : note('Още няма отговори.'))],
  ]);
}
function valueTab(all) {
  const price = store.admin.settings().price || 0;
  const paidUsers = all.filter((d) => d.user.subscription?.paidSince);
  const months = paidUsers.map((d) => Math.max(0, (parseDate(d.user.subscription.validUntil < todayStr() ? d.user.subscription.validUntil : todayStr()) - parseDate(d.user.subscription.paidSince)) / (30.4 * 86400000)));
  const avgM = months.length ? months.reduce((a, b) => a + b, 0) / months.length : 0;
  const churned = paidUsers.filter((d) => d.user.subscription.validUntil < todayStr()).length;
  const churnRate = paidUsers.length ? churned / paidUsers.length : 0;
  const lifetime = churnRate > 0 ? Math.max(avgM, 1 / Math.max(churnRate / Math.max(avgM, 1), 0.02)) : Math.max(avgM, 12);
  return flow('growth.value', [['v', wide(card('coins', 'Стойност на един клиент',
    zone('growth.value.nums', { class: 'big-nums' }, [
      ['avg', bigNum('Средно плаща', `${fmtNum1(avgM)} мес.`, 'досега, на платил шофьор')],
      ['churn', bigNum('Отказали се', pct(churned, paidUsers.length), `${churned} от ${paidUsers.length} платили`)],
      ['life', bigNum('Очаквано време като клиент', `${fmtNum1(lifetime)} мес.`, 'при сегашния темп')],
      ['ltv', bigNum('Стойност на клиент', money(lifetime * price, 2), `при ${money(price, 2)} на месец`, 'live')]]),
    note('Това е горната граница колко можеш да даваш за реклама, за да спечелиш един нов шофьор.')))]]);
}

// =====================================================================
//   СТАТИСТИКА: градове, сезонност, коли и гориво, ефир и наеми, графики
// =====================================================================
const statState = { days: 30 };
function statsPage() {
  const { bar, cur } = tabs('/stats', [['cities', 'Градове и фирми'], ['season', 'Сезонност'], ['cars', 'Коли и гориво'], ['market', 'Ефир и наеми'], ['charts', 'Графики']]);
  const body = { cities: citiesTab, season: seasonTab, cars: carsTab, market, charts: chartsTab };
  return h('div', null, pageHead('Статистика', `${scopeLabel()}: как се справят шофьорите`), bar, body[cur]());
}
const daysPicker = () => h('div', { class: 'row gap adm-picker' }, segmented({ 7: '7 дни', 30: '30 дни', 90: '90 дни', 365: 'Година' }, String(statState.days), (v) => { statState.days = Number(v); render(); }, { page: true }));
function avgRows(per, keyFn, labelFn, sort = 'n') {
  const avgRow = (list) => { const T = aggregate(list); const n = list.length || 1; return { n: list.length, perHour: T.perHour, perShift: T.perShift, hours: T.shifts ? T.hours / T.shifts : 0, km: T.shifts ? T.km / T.shifts : 0, net: T.net / n }; };
  const m = {}; per.forEach((x) => { (m[keyFn(x.d)] ||= []).push(x); });
  return Object.entries(m).map(([k, l]) => [labelFn(k), avgRow(l)]).sort((a, b) => (sort === 'n' ? b[1].n - a[1].n : b[1].perHour - a[1].perHour));
}
const avgTable = (rows, first) => table([first, 'Шофьори', 'Чисто/час', 'Оборот/смяна', 'Часове/смяна', 'Км/смяна', 'Чисто на шофьор'],
  rows.map(([k, a]) => ({ cells: [h('b', null, k), String(a.n), money2(a.perHour), money(a.perShift), fmtNum1(a.hours), fmtNum(a.km), h('b', { class: tone(a.net) }, money(a.net))] })), { rightFrom: 1 });
const perDriver = () => { const to = todayStr(), from = addDays(to, -(statState.days - 1)); return scoped().map((d) => ({ d, st: periodStats(d, from, to) })).filter((x) => x.st.shifts > 0); };
function citiesTab() {
  const per = perDriver();
  return h('div', null, flow('stats.cities.map', [['map', wide(liveMap(scoped()))]]), daysPicker(), flow('stats.cities', [
    ['avg', wide(card('pin', 'Средният шофьор по град', note(`За последните ${statState.days} дни, само шофьорите с поне една смяна.`), per.length ? avgTable(avgRows(per, (d) => d.user.city, (k) => k), 'Град') : note('Няма данни.')))],
    ['firms', wide(card('car', 'Средният шофьор по фирма', per.length ? avgTable(avgRows(per, (d) => `${d.user.company}|${d.user.city}`, (k) => k.split('|').join(', ')), 'Фирма') : note('Няма данни.')))],
  ]));
}
function seasonTab() {
  const all = scoped();
  const byMonth = Array(12).fill(0).map(() => ({ inc: 0, n: 0 })); const byWd = Array(7).fill(0).map(() => ({ inc: 0, n: 0 })); const byHour = Array(8).fill(0).map(() => ({ inc: 0, n: 0 }));
  all.forEach((d) => d.shifts.forEach((s) => { if (!s.end) return; const dt = new Date(s.start); const v = shiftIncome(s); byMonth[dt.getMonth()].inc += v; byMonth[dt.getMonth()].n++; const w = (dt.getDay() + 6) % 7; byWd[w].inc += v; byWd[w].n++; const hh = Math.floor(dt.getHours() / 3); byHour[hh].inc += v; byHour[hh].n++; }));
  const pts = (arr, labels) => arr.map((x, i) => ({ label: labels[i], net: x.n ? x.inc / x.n : 0 }));
  return flow('stats.season', [
    ['months', card('calendar', 'Сезонност по месеци', note('Среден оборот на смяна във всеки месец (всички данни).'), barChart(pts(byMonth, MONTHS_SHORT), { height: 170, cls: 'violet' }))],
    ['wd', card('clock', 'По дни от седмицата', note('Среден оборот на смяна в съответния ден.'), barChart(pts(byWd, WD_SHORT), { height: 170 }))],
    ['start', card('clock', 'Според часа на започване', note('Среден оборот на смяна според това кога е започнала.'), barChart(pts(byHour, [0, 3, 6, 9, 12, 15, 18, 21].map((x) => `${x}ч`)), { height: 170, cls: 'violet' }))],
  ]);
}
function carsTab() {
  const per = perDriver(); const all = scoped();
  const cars = { own: 0, rent: 0, leasing: 0 }; all.forEach((d) => { cars[d.profile.carType]++; });
  const fuels = {}; all.forEach((d) => { fuels[d.profile.fuel] = (fuels[d.profile.fuel] || 0) + 1; });
  return h('div', null, daysPicker(), flow('stats.cars', [
    ['car', card('car', 'Своя, под наем или лизинг', avgTable(avgRows(per, (d) => d.profile.carType, (k) => CAR_TYPES[k]?.label || k, 'h'), 'Кола'))],
    ['fuel', card('fuel', 'Кое гориво е най-изгодно', avgTable(avgRows(per, (d) => d.profile.fuel, (k) => FUELS[k]?.label || k, 'h'), 'Гориво'))],
    ['carDonut', card('car', 'Колко коли от всеки вид', donut([{ label: 'Собствена', value: cars.own, color: PALETTE[0], text: String(cars.own) }, { label: 'Под наем', value: cars.rent, color: PALETTE[1], text: String(cars.rent) }, { label: 'Лизинг', value: cars.leasing, color: PALETTE[2], text: String(cars.leasing) }], 'коли', String(all.length)))],
    ['fuelDonut', card('fuel', 'Гориво на колите', donut(Object.entries(fuels).sort((a, b) => b[1] - a[1]).map(([k, v], i) => ({ label: FUELS[k]?.label || k, value: v, color: PALETTE[(i + 3) % PALETTE.length], text: String(v) })), 'коли', String(all.length)))],
  ]));
}
// Ефир, наеми и работа
function driverMetrics(d, st, days) {
  const p = d.profile; const m = { d, st };
  if (p.dispatch.mode !== 'none' && p.dispatch.amount > 0) {
    m.dispatchMode = p.dispatch.mode; m.dispatchAmount = p.dispatch.amount;
    m.dispatchMonthly = p.dispatch.mode === 'daily' ? p.dispatch.amount * (st.workedDays ? (st.workedDays / days) * 30.44 : 22) : p.dispatch.mode === 'weekly' ? p.dispatch.amount * 4.345 : p.dispatch.amount;
  }
  if (p.carType === 'rent' && p.rent.amount > 0) m.rentWeekly = p.rent.period === 'day' ? p.rent.amount * 7 : p.rent.period === 'month' ? p.rent.amount / 4.345 : p.rent.amount;
  if (p.carType === 'leasing' && p.leasing.amount > 0) m.leasingMonthly = p.leasing.amount;
  if (st.shifts) {
    m.hoursPerShift = st.hours / st.shifts; m.hoursPerDay = st.hours / st.workedDays; m.shiftsPerWeek = st.shifts / (days / 7);
    m.kmPerShift = st.km / st.shifts; m.incomePerHour = st.hours ? st.income / st.hours : null; m.netPerHour = st.hours ? st.net / st.hours : null;
    m.fuelPerKm = st.km ? (st.expByCat.fuel || 0) / st.km : null; m.incomePerShift = st.income / st.shifts;
  }
  return m;
}
const avgOf = (list, k) => { const v = list.map((x) => x[k]).filter((x) => x != null && Number.isFinite(x)); return v.length ? { avg: v.reduce((a, b) => a + b, 0) / v.length, min: Math.min(...v), max: Math.max(...v), n: v.length } : null; };
const fmtAvg = (a, f) => (a ? f(a.avg) : '—');
const rangeTxt = (a, f) => (a ? (a.n > 1 ? `от ${f(a.min)} до ${f(a.max)}, ${a.n} шоф.` : `${a.n} шофьор`) : 'няма данни');
function market() {
  const root = h('div');
  const draw = () => {
    const r = periodRange(marketState);
    const toEff = r.to < todayStr() ? r.to : todayStr();
    const days = Math.max(1, Math.round((parseDate(toEff) - parseDate(r.from)) / 86400000) + 1);
    const all = scoped();
    const ms = all.map((d) => driverMetrics(d, periodStats(d, r.from, r.to), days));
    const a1 = (k) => avgOf(ms, k);
    const disp = a1('dispatchMonthly'), rent = a1('rentWeekly'), leas = a1('leasingMonthly');
    const modes = ['daily', 'weekly', 'monthly'].map((mode) => { const list = ms.filter((x) => x.dispatchMode === mode); return { mode, list, a: avgOf(list, 'dispatchAmount'), m: avgOf(list, 'dispatchMonthly') }; });
    const noDispatch = ms.filter((x) => !x.dispatchMode).length;
    const keyFn = scope.city ? (d) => d.user.company : (d) => d.user.city;
    const groups = new Map(); ms.forEach((x) => { const k = keyFn(x.d); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); });
    const cmp = [...groups.entries()].map(([k, list]) => ({ k, list })).sort((a, b) => b.list.length - a.list.length);
    const shiftsP = all.flatMap((d) => d.shifts.filter((s) => s.end && shiftDate(s) >= r.from && shiftDate(s) <= r.to));
    const lens = [[0, 6, 'до 6 ч'], [6, 8, '6–8 ч'], [8, 10, '8–10 ч'], [10, 12, '10–12 ч'], [12, 99, '12+ ч']].map(([a, b, label]) => ({ label, value: shiftsP.filter((s) => { const x = shiftHours(s); return x >= a && x < b; }).length }));
    const modeLabel = { daily: 'На ден', weekly: 'На седмица', monthly: 'На месец' };
    fill(root,
      h('div', { class: 'adm-picker' }, periodPicker(marketState, draw)),
      kpis('stats.market.kpis', [
        ['disp', kpi('phone', 'var(--text)', 'Ефир средно', fmtAvg(disp, (v) => `${money(v)}/мес`), rangeTxt(disp, (v) => money(v)))],
        ['rent', kpi('key', 'var(--text)', 'Наем средно', fmtAvg(rent, (v) => `${money(v)}/седм.`), rangeTxt(rent, (v) => money(v)))],
        ['leas', kpi('doc', 'var(--text)', 'Лизинг средно', fmtAvg(leas, (v) => `${money(v)}/мес`), rangeTxt(leas, (v) => money(v)))],
        ['iph', kpi('coins', 'var(--text)', 'Приход на час', fmtAvg(a1('incomePerHour'), money2), `чисто ${fmtAvg(a1('netPerHour'), money2)}/ч`)],
        ['hps', kpi('clock', 'var(--text)', 'Часове на смяна', fmtAvg(a1('hoursPerShift'), fmtDuration), `${fmtAvg(a1('hoursPerDay'), fmtDuration)} на работен ден`)],
        ['spw', kpi('calendar', 'var(--text)', 'Смени на седмица', fmtAvg(a1('shiftsPerWeek'), (v) => fmtNum1(v)), 'средно на шофьор')],
        ['kps', kpi('road', 'var(--text)', 'Км на смяна', fmtAvg(a1('kmPerShift'), (v) => `${fmtNum(v)} км`), `гориво ${fmtAvg(a1('fuelPerKm'), money2)}/км`)]]),
      flow('stats.market', [
        ['disp', card('phone', 'Ефир / диспечер',
          table(['Как се плаща', 'Шофьори', 'Средна такса', 'От – до', 'Равно на месец'],
            modes.filter((x) => x.list.length).map((x) => ({ cells: [h('b', null, modeLabel[x.mode]), x.list.length, money(x.a.avg, x.a.avg % 1 ? 2 : 0), x.a.n > 1 ? `${money(x.a.min)} – ${money(x.a.max)}` : money(x.a.min), money(x.m.avg)] })), { rightFrom: 1 }),
          note(`${noDispatch} ${noDispatch === 1 ? 'шофьор не плаща' : 'шофьори не плащат'} ефир. „Равно на месец“ при таксата на ден е по реалните им работни дни.`))],
        ['rent', card('key', 'Наеми и лизинг',
          table(['Вид', 'Шофьори', 'Средно', 'Най-малко', 'Най-много'], [
            rent && { cells: [h('b', null, 'Наем (на седмица)'), rent.n, money(rent.avg), money(rent.min), money(rent.max)] },
            leas && { cells: [h('b', null, 'Лизинг (на месец)'), leas.n, money(leas.avg), money(leas.min), money(leas.max)] }].filter(Boolean), { rightFrom: 1 }))],
        ['cmp', wide(card(scope.city ? 'car' : 'target', scope.city ? `Сравнение на фирмите в ${scope.city}` : 'Сравнение по градове',
          table([scope.city ? 'Фирма' : 'Град', 'Шофьори', 'Ефир/мес', 'Наем/седм.', 'Приход/ч', 'Чисто/ч', 'Ч/смяна', 'Смени/седм.', 'Км/смяна', 'Гориво/км'],
            cmp.map((g) => { const a = (k) => avgOf(g.list, k); return { cells: [h('b', null, g.k), g.list.length, fmtAvg(a('dispatchMonthly'), money), fmtAvg(a('rentWeekly'), money), fmtAvg(a('incomePerHour'), money2),
              h('b', { class: tone(a('netPerHour')?.avg || 0) }, fmtAvg(a('netPerHour'), money2)), fmtAvg(a('hoursPerShift'), (v) => fmtNum1(v)), fmtAvg(a('shiftsPerWeek'), (v) => fmtNum1(v)), fmtAvg(a('kmPerShift'), fmtNum), fmtAvg(a('fuelPerKm'), money2)] }; }), { rightFrom: 1 })))],
        ['len', card('calendar', 'Колко дълги са смените', colBars(lens))],
        ['drivers', wide(card('users', 'По шофьори', table(['Шофьор', 'Кола', 'Ефир', 'Наем', 'Смени', 'Приход/ч', 'Чисто/ч', 'Ч/смяна', 'Приход/смяна'],
          ms.filter((x) => x.st.shifts).sort((a, b) => (b.netPerHour || 0) - (a.netPerHour || 0)).map((x) => ({ href: '#/driver/' + x.d.user.id, cells: [
            h('span', { class: 'who-cell' }, h('b', null, x.d.user.name), h('span', null, `${x.d.user.city}, ${x.d.user.company}`)), CAR_TYPES[x.d.profile.carType]?.label,
            x.dispatchMode ? `${money(x.dispatchAmount)}${{ daily: '/ден', weekly: '/седм.', monthly: '/мес' }[x.dispatchMode]}` : '—',
            x.rentWeekly ? `${money(x.rentWeekly)}/седм.` : x.leasingMonthly ? `лизинг ${money(x.leasingMonthly)}` : '—',
            x.st.shifts, money2(x.incomePerHour), h('b', { class: tone(x.netPerHour) }, money2(x.netPerHour)), fmtNum1(x.hoursPerShift), money(x.incomePerShift)] })), { rightFrom: 4 })))],
      ]));
  };
  draw();
  return root;
}
// Графики: приход и чисто на всички за периода
function chartsTab() {
  const root = h('div');
  const draw = () => {
    const r = periodRange(chartsState);
    const all = scoped();
    const rows = all.map((d) => ({ d, st: periodStats(d, r.from, r.to) }));
    const T = aggregate(rows);
    const days = Math.round((parseDate(r.to) - parseDate(r.from)) / 86400000) + 1;
    const unit = chartsState.unit === 'year' || days > 62 ? 'month' : 'day';
    let pts = null, activePts = null;
    if (chartsState.unit !== 'day') {
      const per = all.map((d) => series(d, r.from, r.to, unit));
      pts = per[0]?.map((p, i) => ({ ...p, net: per.reduce((a, s) => a + s[i].net, 0), income: per.reduce((a, s) => a + s[i].income, 0) })) || [];
      if (unit === 'day') activePts = per[0]?.map((p, i) => ({ ...p, net: per.reduce((a, s) => a + (s[i].worked ? 1 : 0), 0) }));
    }
    const { cur: cmpCur, prev: pr } = compareRanges(chartsState, r);
    const P = aggregate(all.map((d) => ({ d, st: periodStats(d, pr.from, pr.to) })));
    const C = cmpCur === r ? T : aggregate(all.map((d) => ({ d, st: periodStats(d, cmpCur.from, cmpCur.to) })));
    let sparkPts = pts || [];
    if (!pts) { const per = all.map((d) => series(d, addDays(r.to, -13), r.to, 'day')); sparkPts = per[0]?.map((p, i) => ({ net: per.reduce((a, x) => a + x[i].net, 0), income: per.reduce((a, x) => a + x[i].income, 0) })) || []; }
    sparkPts = sparkPts.filter((x) => !x.future);
    const shiftsP = all.flatMap((d) => d.shifts.filter((s) => s.end && shiftDate(s) >= r.from && shiftDate(s) <= r.to));
    const ti = timeInsights(shiftsP);
    const night = shiftsP.filter((s) => { const hr = new Date(s.start).getHours(); return hr >= 16 || hr < 4; }).length;
    const exp = {};
    rows.forEach(({ st }) => {
      const add = (c, v) => { const key = c.label.toLowerCase(); exp[key] = exp[key] || { label: c.label, icon: c.icon, color: c.color, value: 0 }; exp[key].value += v; };
      Object.entries(st.expByCat).forEach(([k, v]) => add(expenseCat(k), v));
      Object.entries(st.fixedByCat).forEach(([k, v]) => add(costCat(k), v));
    });
    fill(root,
      h('div', { class: 'adm-picker' }, periodPicker(chartsState, draw)),
      kpis('stats.charts.kpis', [
        ['inc', kpi('coins', 'var(--text)', 'Приход', money(T.income), `${fmtNum(T.shifts)} смени`, '', { lg: true, title: moneyFull(T.income), trend: trendChip(C.income, P.income), spark: sparkline(sparkPts.map((x) => x.income), '#FFC21A') })],
        ['net', kpi('wallet', 'var(--text)', 'Чиста печалба', money(T.net), `разходи ${money(T.exp)}`, tone(T.net), { lg: true, title: moneyFull(T.net), trend: trendChip(C.net, P.net), spark: sparkline(sparkPts.map((x) => x.net), '#FFC21A') })],
        ['act', kpi('users', 'var(--text)', 'Активни шофьори', `${T.active} от ${all.length}`, 'с поне една смяна', '', { lg: true, trend: trendChip(C.active, P.active), bar: all.length ? T.active / all.length : 0 })]], 'kpis kpis-lg'),
      zone('stats.charts.mini', { class: 'mini-kpis', style: { marginTop: '12px' } }, [
        ['ph', miniKpi('clock', 'var(--text)', 'Чисто на час', money2(T.perHour), `приход ${money2(T.incPerHour)}`)],
        ['pk', miniKpi('road', 'var(--text)', 'Чисто на км', money2(T.perKm), `${fmtNum(T.km)} км`)],
        ['ps', miniKpi('calendar', 'var(--text)', 'Приход на смяна', money(T.perShift), T.shifts ? fmtDuration(T.hours / T.shifts) : '')],
        ['tips', miniKpi('heart', 'var(--text)', 'Бакшиши', money(T.tips), `${pct(night, shiftsP.length)} нощни`)]]),
      flow('stats.charts', [
        pts && pts.length > 1 && ['net', card('chart', 'Чиста печалба на всички', barChart(pts, { height: 170 }))],
        pts && pts.length > 1 && ['act', activePts ? card('users', 'Активни шофьори по дни', barChart(activePts, { height: 170, cls: 'violet', fmt: (v) => `${Math.round(v)} шофьори` })) : card('coins', 'Приход по месеци', barChart(pts, { height: 170, valueKey: 'income', cls: 'violet' }))],
        ['pay', card('card', 'Как плащат клиентите', donut(Object.entries(INCOME_TYPES).map(([k, t], i) => ({ label: t.label, value: T[k], color: PALETTE[i] })), 'приход', money(T.income)))],
        ['hour', card('clock', 'Приход на час през денонощието', ti.hasData ? colBars([0, 3, 6, 9, 12, 15, 18, 21].map((hh) => { const xs = ti.byHour.slice(hh, hh + 3).filter((x) => x.rate); return { label: `${hh}ч`, value: xs.length ? xs.reduce((a, x) => a + x.rate, 0) / xs.length : 0 }; }), (v) => `${Math.round(v)}€`) : note('Няма данни'))],
        ['top', wide(card('trophy', 'Класиране за периода', table(['Шофьор', 'Град', 'Смени', 'Приход', 'Чисто', '€/час', '€/км'],
          rows.filter((x) => x.st.shifts).sort((a, b) => b.st.net - a.st.net).slice(0, 10).map(({ d, st }, i) => ({ href: '#/driver/' + d.user.id,
            cells: [h('span', { class: 'row' }, h('span', { class: 'rank' }, String(i + 1)), h('span', { class: 'who-cell' }, h('b', null, d.user.name), h('span', null, d.user.company))), d.user.city, st.shifts, money(st.income), h('b', { class: tone(st.net) }, money(st.net)), money2(st.netPerHour), money2(st.netPerKm)] })), { rightFrom: 2 })))],
        ['exp', card('wallet', 'Разходи на всички',
          h('div', { class: 'grid2', style: { marginBottom: '14px' } }, stat('От смените', money(T.varExp), { icon: 'fuel', color: 'var(--c-orange)' }), stat('Постоянни', money(T.fixed), { icon: 'calendar', color: 'var(--c-blue)' })),
          shareRows(Object.values(exp).sort((a, b) => b.value - a.value).slice(0, 8), T.exp))],
      ]));
  };
  draw();
  return root;
}

// =====================================================================
//   РАЗВИТИЕ: използване, анкета, предложения, функции
// =====================================================================
const PAGE_NAMES = { home: 'Днес', shift: 'Смяна (въвеждане)', money: 'Пари', stats: 'Статистика', costs: 'Постоянни разходи', me: 'Аз', calendar: 'Календар', reservations: 'Резервации', profile: 'Моят профил', car: 'Колата и ефирът', shifts: 'Всички смени', ideas: 'Предложи функция', onboarding: 'Първоначална настройка', help: 'Пиши ни' };
const IDEA_ST = { new: 'Ново', planned: 'Ще го направим', done: 'Готово', hidden: 'Скрито' };
function devPage() {
  const ideasL = store.admin.ideas(); const nps = store.admin.nps();
  const { bar, cur } = tabs('/dev', [['usage', 'Какво се ползва'], ['opinions', 'Мнения', ideasL.filter((i) => i.status === 'new').length, 'alert'], ['flags', 'Нови функции']]);
  const body = { usage: usageTab, opinions: () => opinionsTab(nps, ideasL), flags: () => flagsTab(ideasL) };
  return h('div', null, pageHead('Развитие', 'Какво ползват шофьорите, какво мислят и какво искат'), bar, body[cur]());
}
function usageTab() {
  const N = allDrivers().length || 1;
  const usage = Object.entries(store.admin.usage()).map(([p, u]) => ({ p, users: Object.keys(u.users).length, views: u.views })).sort((a, b) => b.users - a.users);
  const low = usage.filter((u) => u.users / N < 0.3);
  return flow('dev.usage', [
    ['bars', card('eye', 'Колко шофьори отварят всяка страница', h('div', { class: 'usage' }, usage.map((u) => h('div', { class: 'us-row' }, h('span', null, PAGE_NAMES[u.p] || u.p),
      h('div', { class: 'fn-bar' }, h('i', { style: { width: `${(u.users / N) * 100}%` } }), h('b', null, `${u.users} шоф. · ${pct(u.users, N)}`))))))],
    ['low', card('alert', 'Почти не се ползва', low.length ? h('ul', { class: 'adm-list' }, low.map((u) => h('li', null, `${PAGE_NAMES[u.p] || u.p} – ${pct(u.users, N)} от шофьорите`))) : note('Всички страници се ползват.'),
      note('Кандидати за подобряване, по-видимо място или махане.'))],
  ]);
}
function opinionsTab(nps, ideasL) {
  return h('div', null, npsTab(nps), ideasTab(ideasL));
}
function npsTab(nps) {
  const pro = nps.filter((x) => x.score >= 9).length, det = nps.filter((x) => x.score <= 6).length;
  const score = nps.length ? Math.round(((pro - det) / nps.length) * 100) : null;
  const dist = Array.from({ length: 11 }, (_, i) => nps.filter((x) => x.score === i).length); const mx = Math.max(1, ...dist);
  return flow('dev.nps', [
    ['score', card('heart', 'Би ли препоръчал ProfiTaxi?',
      zone('dev.nps.nums', { class: 'big-nums two' }, [['nps', bigNum('Оценка (NPS)', score == null ? '—' : String(score), 'от −100 до +100', score > 30 ? 'live' : '')], ['n', bigNum('Отговори', String(nps.length), `${pro} доволни · ${det} недоволни`)]]),
      h('div', { class: 'nps-dist' }, dist.map((c, i) => h('div', { class: cx('nd', i <= 6 ? 'bad' : i <= 8 ? 'mid' : 'good') }, h('i', { style: { height: `${(c / mx) * 100}%` } }), h('span', null, String(i))))))],
    ['comments', card('list', 'Какво пишат', nps.filter((x) => x.comment).length ? nps.filter((x) => x.comment).slice(0, 10).map((x) => h('p', { class: 'quote-s' }, h('b', null, `${x.score}/10 `), `„${x.comment}“`)) : note('Още няма коментари.'))],
  ]);
}
function ideasTab(ideasL) {
  return flow('dev.ideas', [['list', wide(card('sparkle', `Предложения от шофьорите (${ideasL.length})`,
    ideasL.length ? ideasL.map((i) => h('div', { class: 'idea-a' }, h('span', { class: 'votes' }, String(i.votes.length)), h('span', { class: 'grow' }, i.text),
      h('select', { class: 'input', style: { width: 'auto' }, onchange: (e) => { store.admin.setIdea(i.id, e.target.value); if (e.target.value === 'done') toast(`Гласувалите (${i.votes.length}) получиха съобщение`); } }, Object.entries(IDEA_ST).map(([k, v]) => h('option', { value: k, selected: i.status === k }, v))))) : note('Още няма предложения.'),
    note('Статусът се вижда от шофьорите. Щом го направиш „Готово“, всички гласували получават съобщение. „Скрито“ го маха от техния списък.')))]]);
}
function flagsTab(ideasL) {
  const comps = companiesOf(allDrivers()); const tags = store.admin.allTags();
  return flow('dev.flags', [['list', wide(card('bolt', 'Нови функции за част от шофьорите',
    note('Пускаш нещо първо на част от шофьорите (процент, фирма или етикет) и виждаш дали помага. Свържи го с предложение – щом го включиш, предложението става „Готово“ и гласувалите получават съобщение.'),
    store.admin.flags().map((f) => flagRow(f, comps, tags, ideasL))))]]);
}
function flagRow(f, comps, tags, ideasL) {
  const save = (patch) => store.admin.saveFlag({ ...f, ...patch });
  const idea = ideasL.find((i) => i.id === f.ideaId);
  return h('div', { class: 'flag' },
    h('div', { class: 'row between' }, h('b', null, f.label), h('button', { class: cx('toggle', f.on && 'on'), role: 'switch', 'aria-checked': String(f.on), 'aria-label': f.label, onclick: () => { save({ on: !f.on }); if (!f.on && idea && idea.status !== 'done') toast(`„${idea.text}“ стана „Готово“ – ${idea.votes.length} шофьори получиха съобщение`); } })),
    h('div', { class: 'row gap', style: { marginTop: '8px', flexWrap: 'wrap' } },
      f.on && h('select', { class: 'input', style: { width: 'auto' }, onchange: (e) => save({ target: e.target.value }) }, Object.entries({ all: 'За всички', percent: 'За процент от шофьорите', company: 'Само за една фирма', tag: 'Само за етикет' }).map(([k, v]) => h('option', { value: k, selected: f.target === k }, v))),
      f.on && f.target === 'percent' && h('input', { class: 'input', type: 'number', min: 0, max: 100, value: f.percent || 0, style: { width: '90px' }, onchange: (e) => save({ percent: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }) }),
      f.on && f.target === 'percent' && h('span', { class: 'muted small' }, '% от шофьорите'),
      f.on && f.target === 'company' && sel(comps, f.company, (v) => save({ company: v }), 'Избери фирма', { style: { width: 'auto' } }),
      f.on && f.target === 'tag' && sel(tags, f.tag, (v) => save({ tag: v }), 'Избери етикет', { style: { width: 'auto' } }),
      h('label', { class: 'flag-idea' }, h('span', { class: 'muted small' }, 'Предложение:'), sel(ideasL.map((i) => [i.id, `${i.text} (${i.votes.length})`]), f.ideaId || '', (v) => save({ ideaId: v || null }), 'няма', { style: { width: 'auto', maxWidth: '320px' } }))));
}

// =====================================================================
//   ПАРИ: преглед, изтичащи, плащания, промо кодове, фактури
// =====================================================================
function moneyPage() {
  const all = scoped(); const ids = new Set(all.map((d) => d.user.id));
  const pays = payments().filter((p) => ids.has(p.userId));
  const failed = pays.filter((p) => p.status === 'failed');
  const expiring = all.map((d) => ({ d, s: subState(d.user) })).filter((x) => (x.s.key === 'active' || x.s.key === 'trial') && x.s.left <= 7);
  const { bar, cur } = tabs('/money', [['overview', 'Преглед'], ['expiring', 'Изтичат', expiring.length, 'alert'], ['payments', 'Плащания', failed.length, 'alert'], ['promos', 'Промо кодове', store.admin.promos().length], ['invoices', 'Фактури']]);
  const body = { overview: () => moneyOverview(all, pays), expiring: () => expiringTab(all, expiring), payments: () => paymentsTab(all, pays, failed), promos: promosTab, invoices: () => invoicesTab(all, pays) };
  return h('div', null, pageHead('Пари', `${scopeLabel()}: абонаменти, плащания и приходи`), bar, body[cur]());
}
function moneyOverview(all, pays) {
  const price = store.admin.settings().price || 0; const today = todayStr();
  const st = all.map((d) => subState(d.user)); const count = (k) => st.filter((s) => s.key === k).length;
  const paid = count('active'); const mrr = paid * price;
  // отказали се през последните 30 дни спрямо платените преди 30 дни
  const d30 = addDays(today, -30);
  const base = all.filter((d) => { const s = d.user.subscription; return s.paidSince && s.paidSince <= d30 && s.validUntil >= d30; }).length;
  const lost = all.filter((d) => { const s = d.user.subscription; return s.paidSince && s.validUntil >= d30 && s.validUntil < today; }).length;
  const churn = base ? lost / base : 0;
  const forecast = mrr * (1 - churn);
  const months = []; for (let i = 11; i >= 0; i--) { const d = parseDate(startOfMonth(today)); d.setMonth(d.getMonth() - i); months.push(dateStr(d).slice(0, 7)); }
  const rev = months.map((m) => ({ label: MONTHS_SHORT[Number(m.slice(5)) - 1], value: pays.filter((p) => p.status === 'paid' && p.at.slice(0, 7) === m).reduce((a, p) => a + p.amount, 0) }));
  const paidEver = all.filter((d) => d.user.subscription.paidSince).length;
  const trialsDone = all.filter((d) => d.user.subscription.paidSince || subState(d.user).key === 'expired').length;
  return flow('money.overview', [
    ['nums', wide(zone('money.nums', { class: 'big-nums' }, [
      ['mrr', bigNum('Приход на месец', money(mrr), `${paid} платени по ${money(price, 2)}`, 'live')],
      ['next', bigNum('Очаквано следващия месец', money(forecast), `при ${pct(lost, base)} отказ за 30 дни`)],
      ['year', bigNum('На година', money(mrr * 12), 'при сегашните платени')],
      ['conv', bigNum('От пробен към платен', pct(paidEver, trialsDone), 'конверсия')]]))],
    ['chart', wide(card('chart', 'Приход по месеци', colBars(rev, (v) => money(v))))],
    ['goal', goalCard(paid)],
    ['weekly', weeklyCard(all)],
    ['status', card('users', 'Абонаменти сега', table(['Статус', 'Шофьори'], [['Платени', count('active'), 'good'], ['Пробен период', count('trial'), 'warn'], ['Изтекли', count('expired'), 'bad'], ['Спрени', count('blocked'), 'bad']].map(([l, n, c]) => ({ cells: [h('span', { class: cx('chip', c) }, l), String(n)] })), { rightFrom: 1 }))],
  ]);
}
const remindText = (s) => (s.key === 'trial' ? ['Пробният период свършва', `Пробният ви период свършва след ${s.left} дни. Абонаментът е само ${money(store.admin.settings().price, 2)} на месец – данните ви остават.`] : ['Абонаментът изтича скоро', `Абонаментът ви изтича след ${s.left} дни. Подновете го, за да не спира достъпът до отчетите.`]);
function expiringTab(all, expiring) {
  const expired = all.map((d) => ({ d, s: subState(d.user) })).filter((x) => x.s.key === 'expired').sort((a, b) => b.s.left - a.s.left);
  const row = ({ d, s }, btn) => ({ href: '#/driver/' + d.user.id, cells: [h('span', { class: 'who-cell' }, h('b', null, d.user.name), h('span', null, `${d.user.city}, ${d.user.company}`)), h('span', { class: cx('chip', s.cls) }, s.label), fmtDate(d.user.subscription.validUntil, { year: true }), s.left === 0 ? 'днес' : s.left > 0 ? `след ${s.left} дни` : `преди ${-s.left} дни`, btn] });
  return flow('money.expiring', [
    ['auto', wide(autoRemindCard())],
    ['soon', wide(card('clock', `Изтичат до 7 дни (${expiring.length})`,
      table(['Шофьор', 'Статус', 'Валиден до', 'Кога', ''], expiring.sort((a, b) => a.s.left - b.s.left).map((x) => row(x, h('button', { class: 'btn btn-ghost act-v btn-sm', onclick: () => { const [t, m] = remindText(x.s); store.admin.remind([x.d.user.id], t, m); toast(`Напомнянето е изпратено до ${x.d.user.name}`); } }, icon('bell', 14), 'Напомни'))), { rightFrom: 9 }),
      expiring.length > 1 && h('button', { class: 'btn btn-page', style: { marginTop: '12px' }, onclick: () => { expiring.forEach((x) => { const [t, m] = remindText(x.s); store.admin.remind([x.d.user.id], t, m); }); toast(`Напомняния до ${expiring.length} шофьори`); } }, icon('bell', 18), 'Напомни на всички')))],
    ['expired', wide(card('alert', `Изтекли (${expired.length})`, note('Можеш да ги върнеш с напомняне или с промо код.'),
      table(['Шофьор', 'Статус', 'Валиден до', 'Кога', ''], expired.map((x) => row(x, h('button', { class: 'btn btn-ghost act-v btn-sm', onclick: () => { store.admin.remind([x.d.user.id], 'Липсвате ни', 'Абонаментът ви изтече, но данните ви са запазени. Подновете го и продължете оттам, докъдето бяхте.'); toast('Изпратено'); } }, icon('bell', 14), 'Върни'))), { rightFrom: 9 })))],
  ]);
}
function autoRemindCard() {
  const a = store.admin.settings().autoRemind || {};
  const set = (patch) => store.admin.saveSettings({ autoRemind: { ...a, ...patch } });
  const chk = (k, label) => h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!a[k], disabled: !a.on, onchange: (e) => set({ [k]: e.target.checked }) }), label);
  return card('bell', 'Автоматични напомняния',
    h('div', { class: 'row between' }, h('span', null, 'Шофьорите получават съобщение сами, без да натискаш „Напомни“.'),
      h('button', { class: cx('toggle', a.on && 'on'), role: 'switch', 'aria-checked': String(!!a.on), 'aria-label': 'Автоматични напомняния', onclick: () => { set({ on: !a.on }); if (!a.on) { const n = store.runAutoReminders(); toast(n ? `Включено – изпратени ${n} напомняния` : 'Включено'); } } })),
    h('div', { class: 'chk-row' }, chk('before', '3 дни преди края'), chk('day', 'В деня на изтичане'), chk('after', '7 дни след изтичане')),
    note(`Изпратени досега: ${store.admin.autoSentCount()}. Всяко напомняне отива само веднъж и се вижда в „Съобщения → Изпратени“.`));
}
function paymentsTab(all, pays, failed) {
  const name = (id) => all.find((d) => d.user.id === id)?.user.name || '—';
  return flow('money.payments', [
    ['failed', wide(card('alert', `Неуспешни плащания (${failed.length})`, failed.length ? table(['Шофьор', 'Сума', 'Кога', 'Причина', ''], failed.map((p) => ({ href: '#/driver/' + p.userId, cells: [name(p.userId), money(p.amount, 2), timeTxt(p.at), p.reason || '—',
      h('span', { class: 'row gap' },
        h('button', { class: 'btn btn-ghost act-v btn-sm', onclick: () => { store.admin.remind([p.userId], 'Плащането не мина', `Опитахме да вземем ${money(p.amount, 2)} за абонамента, но плащането не мина (${p.reason || 'отказано'}). Проверете картата си.`); toast('Напомнянето е изпратено'); } }, icon('bell', 14), 'Напомни'),
        h('button', { class: 'btn btn-ghost act-ok btn-sm', onclick: () => { store.admin.retryPayment(p.id); toast('Отбелязано като платено, +30 дни'); } }, 'Платено'))] })), { rightFrom: 9 }) : note('Няма неуспешни плащания.')))],
    ['all', wide(card('receipt', 'Последни плащания', table(['Шофьор', 'Сума', 'Кога', 'Начин', 'Фактура'], pays.filter((p) => p.status === 'paid').slice(0, 40).map((p) => ({ cells: [name(p.userId), money(p.amount, 2), fmtDate(isoToDateStr(p.at), { year: true }), p.method || '—', h('button', { class: 'chip page', onclick: () => printInvoice(p) }, p.invoice)] })), { rightFrom: 1 })))],
  ]);
}
function promosTab() {
  const list = store.admin.promos();
  const f = { code: h('input', { class: 'input', placeholder: 'напр. SOFIA50', style: { textTransform: 'uppercase' } }), kind: 'months', value: h('input', { class: 'input', type: 'number', min: 1, value: 1 }), limit: h('input', { class: 'input', type: 'number', min: 0, value: 100 }), expires: h('input', { class: 'input', type: 'date', value: addDays(todayStr(), 60) }), note: h('input', { class: 'input', placeholder: 'напр. реклама във Facebook' }) };
  const kindBox = h('div'); const drawKind = () => fill(kindBox, segmented({ months: 'Безплатни месеци', percent: '% отстъпка', }, f.kind, (v) => { f.kind = v; drawKind(); }, { small: true, page: true }));
  drawKind();
  return flow('money.promos', [
    ['list', card('gift', 'Промо кодове', note('Шофьорът въвежда кода при регистрация. „Безплатни месеци“ удължават пробния период, „% отстъпка“ важи за първия платен месец.'),
      list.length ? list.map((c) => h('div', { class: 'code-row' },
        h('div', { class: 'grow' }, h('b', { class: 'code' }, c.code), h('small', null, `${c.kind === 'months' ? `${c.value} мес. безплатно` : `-${c.value}% първия месец`} · ползван ${c.uses}${c.limit ? ` от ${c.limit}` : ''} · ${c.expires ? `до ${fmtDate(c.expires, { year: true })}` : 'без срок'}${c.note ? ` · ${c.note}` : ''}`)),
        h('button', { class: cx('btn btn-sm btn-ghost', c.active ? 'act-ok' : 'act-warn'), onclick: () => store.admin.togglePromo(c.code) }, c.active ? 'Активен' : 'Спрян'),
        h('button', { class: 'icon-btn', 'aria-label': 'Изтрий', onclick: () => confirmSheet({ title: `Изтриване на ${c.code}?`, okLabel: 'Изтрий', danger: true, onOk: () => store.admin.deletePromo(c.code) }) }, icon('trash', 16)))) : note('Няма промо кодове.'))],
    ['new', card('plus', 'Нов промо код', h('div', { class: 'form' },
      h('div', { class: 'grid2' }, field('Код', f.code), field('Бележка', f.note)),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Вид'), kindBox),
      h('div', { class: 'grid2' }, field('Колко (месеци или %)', f.value), field('Максимум ползвания', f.limit, '0 = без лимит')),
      field('Валиден до', f.expires),
      h('button', { class: 'btn btn-page', onclick: () => { const r = store.admin.savePromo({ code: f.code.value, kind: f.kind, value: Math.min(f.kind === 'percent' ? 100 : 24, Number(f.value.value) || 0), limit: Number(f.limit.value) || 0, expires: f.expires.value || null, note: f.note.value.trim() }); if (r.error) toast(r.error, 'err'); else toast('Промо кодът е създаден'); } }, icon('plus', 18), 'Създай')))],
  ]);
}
function invoicesTab(all, pays) {
  const name = (id) => all.find((d) => d.user.id === id)?.user.name || '—';
  const list = pays.filter((p) => p.status === 'paid' && p.invoice);
  return flow('money.invoices', [['list', wide(card('doc', `Фактури (${list.length})`, note('Фактура се прави за всяко плащане. Отвори я, за да я разпечаташ или запазиш като PDF. Изпращането по имейл тръгва, щом свържем сървъра.'),
    table(['Номер', 'Шофьор', 'Дата', 'Сума', ''], list.slice(0, 60).map((p) => ({ cells: [h('b', null, p.invoice), name(p.userId), fmtDate(isoToDateStr(p.at), { year: true }), money(p.amount, 2), h('button', { class: 'btn btn-ghost act-n btn-sm', onclick: () => printInvoice(p) }, icon('print', 14), 'Отвори')] })), { rightFrom: 3 }),
    list.length > 0 && h('button', { class: 'btn btn-ghost act-v', style: { marginTop: '12px' }, onclick: () => downloadCsv([['Номер', 'Шофьор', 'Дата', 'Сума'], ...list.map((p) => [p.invoice, name(p.userId), isoToDateStr(p.at), String(p.amount).replace('.', ',')])], `profitaxi-fakturi-${todayStr()}.csv`) }, icon('download', 18), 'Всички в Excel')))]]);
}
function printInvoice(p) {
  const d = store.admin.driverData(p.userId); const u = d.user || { name: '—' };
  const vat = p.amount - p.amount / 1.2;
  const w = window.open('', '_blank'); if (!w) { toast('Разреши изскачащите прозорци', 'err'); return; }
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  w.document.write(`<!doctype html><html lang="bg"><head><meta charset="utf-8"><title>Фактура ${esc(p.invoice)}</title><style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;color:#111}h1{font-size:28px;margin:0}table{width:100%;border-collapse:collapse;margin-top:24px}td,th{border-bottom:1px solid #ddd;padding:10px;text-align:left}.r{text-align:right}.top{display:flex;justify-content:space-between;gap:20px}small{color:#666}.tot{font-size:20px;font-weight:700}@media print{button{display:none}}</style></head><body>
<div class="top"><div><h1>Фактура</h1><p>№ ${esc(p.invoice)}<br>Дата: ${esc(isoToDateStr(p.at))}</p></div><div><b>ProfiTaxi</b><br><small>(демо – данните на фирмата се попълват при свързване)</small></div></div>
<p><b>Получател:</b> ${esc(u.name)}<br>${esc(u.email || '')}<br>${esc(u.city || '')}</p>
<table><tr><th>Услуга</th><th class="r">Сума</th></tr><tr><td>Абонамент ProfiTaxi – 1 месец</td><td class="r">${(p.amount / 1.2).toFixed(2).replace('.', ',')} €</td></tr><tr><td>ДДС 20%</td><td class="r">${vat.toFixed(2).replace('.', ',')} €</td></tr><tr><td class="tot">Общо</td><td class="r tot">${p.amount.toFixed(2).replace('.', ',')} €</td></tr></table>
<p><small>Платено с ${esc(p.method || 'карта')}.</small></p><button onclick="print()">Печат / PDF</button></body></html>`);
  w.document.close();
}

// =====================================================================
//   НАСТРОЙКИ: общи, админи и роли, сигурност, архив, подредба
// =====================================================================
function settings() {
  const owner = isOwner();
  const { bar, cur } = tabs('/settings', [owner && ['general', 'Общи'], owner && ['admins', 'Админи и роли'], owner && ['security', 'Сигурност'], owner && ['backup', 'Архив'], ['layout', 'Подредба'], owner && ['demo', 'Демо данни']]);
  const body = { general: generalTab, admins: adminsTab, security: securityTab, backup: backupTab, layout: layoutTab, demo: demoTab };
  return h('div', null, pageHead('Настройки', 'Общи настройки на услугата'), bar, body[cur]());
}
function generalTab() {
  const s = store.admin.settings();
  const days = h('input', { class: 'input', type: 'number', min: 0, max: 90, value: s.trialDays });
  const price = h('input', { class: 'input', inputmode: 'decimal', value: String(s.price ?? 3.99).replace('.', ',') });
  const gPaid = h('input', { class: 'input', type: 'number', min: 1, value: s.goal?.paid || 100 });
  const gDate = h('input', { class: 'input', type: 'date', value: s.goal?.date || addDays(todayStr(), 90) });
  return flow('settings.general', [
    ['price', card('coins', 'Цена и пробен период', h('div', { class: 'form' },
      field('Пробен период при регистрация (дни)', days, '0 = без пробен период'),
      field('Цена на месечния абонамент (€)', price, 'Използва се за сметката на приходите'),
      h('button', { class: 'btn btn-page btn-lg', onclick: () => { store.admin.saveSettings({ trialDays: Math.max(0, Math.min(90, Number(days.value) || 0)), price: Math.max(0, parseFloat(price.value.replace(',', '.')) || 0) }); toast('Запазено'); } }, 'Запази')))],
    ['ref', card('gift', 'Препоръки от шофьори',
      h('div', { class: 'row between' }, h('span', null, 'Месец безплатно за всеки поканен колега, който плати'),
        h('button', { class: cx('toggle', s.referrals !== false && 'on'), role: 'switch', 'aria-checked': String(s.referrals !== false), 'aria-label': 'Препоръки', onclick: () => { store.admin.saveSettings({ referrals: s.referrals === false }); toast(s.referrals === false ? 'Препоръките са включени' : 'Препоръките са изключени'); } })),
      note('Когато са изключени, шофьорите не виждат кода си и полето „Код за покана“ при регистрация.'))],
    ['goal', card('target', 'Цел за бизнеса', h('div', { class: 'form' },
      field('Колко платени шофьори', gPaid), field('До дата', gDate),
      h('button', { class: 'btn btn-page btn-lg', onclick: () => { store.admin.saveSettings({ goal: { paid: Math.max(1, Number(gPaid.value) || 1), date: gDate.value || todayStr() } }); toast('Целта е запазена'); } }, 'Запази целта')),
      note('Лентата към целта е на „Днес“ и в „Пари“.'))],
  ]);
}
function adminsTab() {
  const list = store.admin.admins(); const comps = companiesOf(allDrivers());
  const f = { email: h('input', { class: 'input', type: 'email' }), name: h('input', { class: 'input' }), pw: h('input', { class: 'input', value: Math.random().toString(36).slice(2, 6) + Math.floor(1000 + Math.random() * 9000) }), role: 'support', company: comps[0] || '' };
  const roleBox = h('div'); const drawRole = () => fill(roleBox, segmented(store.ADMIN_ROLES, f.role, (v) => { f.role = v; drawRole(); }, { small: true, page: true }), f.role === 'partner' && field('Фирма', sel(comps, f.company, (v) => { f.company = v; })));
  drawRole();
  return flow('settings.admins', [
    ['list', card('users', 'Кой има достъп', list.map((a) => h('div', { class: 'code-row' },
      h('div', { class: 'grow' }, h('b', null, a.name), h('small', null, `${a.email} · ${store.ADMIN_ROLES[a.adminRole]}${a.company ? ` · ${a.company}` : ''}`)),
      a.id !== store.adminUser().id && h('button', { class: 'icon-btn', 'aria-label': `Премахни ${a.email}`, onclick: () => confirmSheet({ title: `Премахване на ${a.email}?`, okLabel: 'Премахни', danger: true, onOk: () => store.admin.deleteAdmin(a.id) }) }, icon('trash', 16)))))],
    ['roles', card('shield', 'Какво вижда всяка роля', h('ul', { class: 'adm-list' },
      h('li', null, h('b', null, 'Собственик: '), 'всичко.'),
      h('li', null, h('b', null, 'Поддръжка: '), 'шофьори, контрол, съобщения и развитие. Не вижда парите и не трие акаунти.'),
      h('li', null, h('b', null, 'Партньор: '), 'само шофьорите на своята фирма, статистиката и месечния ѝ отчет. Без лични бележки и действия.')))],
    ['new', card('plus', 'Нов админ', h('div', { class: 'form' },
      h('div', { class: 'grid2' }, field('Имейл', f.email), field('Име', f.name)),
      field('Начална парола', f.pw),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Роля'), roleBox),
      h('button', { class: 'btn btn-page', onclick: () => { const r = store.admin.saveAdmin({ email: f.email.value, name: f.name.value, password: f.pw.value, adminRole: f.role, company: f.company }); if (r.error) toast(r.error, 'err'); else toast('Админът е добавен'); } }, icon('plus', 18), 'Добави')))],
  ]);
}
function securityTab() {
  const s = store.admin.settings(); const me = store.adminUser();
  return flow('settings.security', [
    ['2fa', card('lock', 'Двуфакторно влизане', note('След паролата админът въвежда код, изпратен по SMS. Панелът държи финансовите данни на всички шофьори – препоръчваме го.'),
      h('div', { class: 'row between', style: { marginTop: '8px' } }, h('b', null, s.twoFactor ? 'Включено' : 'Изключено'),
        h('button', { class: cx('toggle', s.twoFactor && 'on'), role: 'switch', 'aria-checked': String(!!s.twoFactor), 'aria-label': 'Двуфакторно влизане', onclick: () => { store.admin.saveSettings({ twoFactor: !s.twoFactor }); toast(s.twoFactor ? 'Изключено' : 'Включено – при следващия вход ще трябва код'); } })),
      note(`Кодът отива на телефона на всеки админ (твоят: ${me.phone || 'няма'}). В демото се показва на екрана.`))],
    ['tips', card('shield', 'Добре е да знаеш', h('ul', { class: 'adm-list' },
      h('li', null, 'Всяко действие на админ се записва в „Контрол → Дневник“.'),
      h('li', null, 'Давай на хората най-малката роля, която им трябва.'),
      h('li', null, 'Партньорите виждат само своите шофьори.')))],
  ]);
}
// Архив: всеки ден автоматично копие (последните 7) в браузъра + ръчно сваляне и възстановяване
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('profitaxi-backups', 1); r.onupgradeneeded = () => r.result.createObjectStore('b', { keyPath: 'day' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const idbTx = async (mode, fn) => { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('b', mode); const out = fn(tx.objectStore('b')); tx.oncomplete = () => res(out?.result ?? out); tx.onerror = () => rej(tx.error); }); };
async function autoBackup() {
  try {
    if (!store.adminUser() || !isOwner()) return;
    const day = todayStr();
    const keys = await idbTx('readonly', (s) => s.getAllKeys());
    if (keys.includes(day)) return;
    const data = JSON.stringify(store.admin.exportAll());
    await idbTx('readwrite', (s) => { s.put({ day, at: new Date().toISOString(), size: data.length, data }); });
    const all = [...keys, day].sort();
    if (all.length > 7) await idbTx('readwrite', (s) => all.slice(0, all.length - 7).forEach((k) => s.delete(k)));
  } catch { /* архивът не е задължителен */ }
}
function backupTab() {
  const listEl = h('div', null, note('Зареждане…'));
  idbTx('readonly', (s) => s.getAll()).then((items) => fill(listEl, items.length ? items.sort((a, b) => b.day.localeCompare(a.day)).map((b) => h('div', { class: 'code-row' },
    h('div', { class: 'grow' }, h('b', null, fmtDate(b.day, { year: true })), h('small', null, `${timeTxt(b.at)} · ${Math.round(b.size / 1024)} KB`)),
    h('button', { class: 'btn btn-ghost act-warn btn-sm', onclick: () => confirmSheet({ title: `Връщане към ${fmtDate(b.day, { year: true })}?`, text: 'Всичко след това копие ще бъде заменено.', okLabel: 'Върни', danger: true, onOk: () => restore(JSON.parse(b.data)) }) }, 'Върни'))) : note('Още няма копия.'))).catch(() => fill(listEl, note('Браузърът не позволява копия.')));
  const file = h('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' }, onchange: (e) => {
    const f = e.target.files[0]; if (!f) return; const rd = new FileReader();
    rd.onload = () => { let data; try { data = JSON.parse(rd.result); } catch { toast('Файлът не е валиден', 'err'); return; } confirmSheet({ title: 'Възстановяване от файла?', text: 'Сегашните данни ще бъдат заменени с тези от файла.', okLabel: 'Възстанови', danger: true, onOk: () => restore(data) }); };
    rd.readAsText(f);
  } });
  return flow('settings.backup', [
    ['manual', card('archive', 'Архив на всички данни', note('Свали пълно копие на всички данни като файл. С „Възстанови от файл“ ги връщаш, ако нещо се обърка.'),
      acts('settings.backup.acts', [
        ['dl', h('button', { class: 'btn btn-page', onclick: () => { const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(store.admin.exportAll())], { type: 'application/json' })), download: `profitaxi-arhiv-${todayStr()}.json` }); document.body.append(a); a.click(); a.remove(); toast('Архивът е свален'); } }, icon('download', 18), 'Свали архив')],
        ['up', h('button', { class: 'btn btn-ghost act-warn', onclick: () => file.click() }, icon('upload', 18), 'Възстанови от файл')]]), file)],
    ['auto', card('clock', 'Автоматични копия', note('Всеки ден при първото отваряне на панела се прави копие. Пазят се последните 7.'), listEl)],
  ]);
}
function restore(data) { const r = store.admin.restoreAll(data); if (r.error) { toast(r.error, 'err'); return; } toast('Данните са възстановени'); setTimeout(() => location.reload(), 600); }
function layoutTab() {
  return flow('settings.layout', [['l', card('grid', 'Подредба на панела',
    h('p', null, 'Натисни „Подреди“ горе вдясно на всяка страница. После влачи картите, числата, бутоните и менюто където ти е удобно. С пръст: задръж и влачи. Можеш и да скриваш неща, които не ползваш.'),
    note('Подредбата се пази на това устройство.'),
    acts('settings.layout.acts', [
      ['start', h('button', { class: 'btn btn-page', onclick: () => { setArranging(true); render(); } }, icon('grid', 18), 'Подреди тази страница')],
      ['reset', h('button', { class: 'btn btn-ghost act-warn', disabled: !hasLayout(), onclick: () => confirmSheet({ title: 'Да върна всичко както беше?', text: 'Подредбата и скритите неща на всички страници се връщат по подразбиране.', okLabel: 'Върни', onOk: () => { resetAll(); toast('Подредбата е върната'); render(); } }) }, 'Върни всичко както беше')]]))]]);
}
function demoTab() {
  return flow('settings.demo', [['d', card('alert', 'Демо данни', note('Връща демо шофьорите и смените в началното им състояние. Изтрива всичко въведено на това устройство.'),
    h('button', { class: 'btn btn-ghost act-del', onclick: () => confirmSheet({ title: 'Нулиране на демо данните?', okLabel: 'Нулирай', danger: true, onOk: () => { store.resetDemo(); location.reload(); } }) }, 'Нулирай демо данните'))]]);
}

// ---------- старт ----------
initArrange({ onDone: () => render(), onReset: () => { resetZones(zonesOnPage()); toast('Тази страница е както беше'); render(); } });
let pending = false;
window.addEventListener('hashchange', () => { top.q = ''; render(); });
const busy = () => { const a = document.activeElement; return !!document.querySelector('.sheet-wrap') || !!document.querySelector('.arr-drag') || (a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)); };
store.onChange(() => { if (busy()) pending = true; else render(); });
document.addEventListener('focusout', () => setTimeout(() => { if (pending && !busy()) { pending = false; render(); } }, 0));
window.addEventListener('profitaxi:sheetclosed', () => { if (pending && !busy()) { pending = false; render(); } });
if (store.adminUser()) store.runAutoReminders();
render();
setTimeout(autoBackup, 1500);
// Картата и числата на „Днес“ се обновяват сами на всеки 20 секунди
const refreshLive = () => { if (store.adminUser() && parse().name === '/overview' && !arranging() && !top.bell && !top.q && !document.querySelector('.sheet-wrap, .tour') && document.visibilityState === 'visible') render(); };
setInterval(refreshLive, 20000);
