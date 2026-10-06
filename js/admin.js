// ProfiTaxi – админ панел. Отделен вход на /admin. Шофьорите нямат връзка към него.

import { h, fill, icon, cx, money, money2, moneyFull, todayStr, addDays, fmtDate, fmtNum, fmtNum1, fmtDuration, isoToDateStr, parseDate, eachDay, MONTHS, MONTHS_SHORT, WD_SHORT, startOfMonth, endOfMonth, dateStr, startOfWeek } from './util.js';
import * as store from './store.js';
import { applyTheme, toast, confirmSheet, openSheet, sheetHead, field, barChart, stat, tone, segmented, empty, getTheme, setTheme, shareRows, cardTitle, more, isDark } from './ui.js';
import { startTour, ADMIN_TOUR } from './tour.js';
import { periodStats, series, shiftIncome, shiftExpenses, shiftKm, shiftHours, shiftDate, costMonthly, goalProgress, timeInsights, activeCosts } from './calc.js';
import { INVITES_ON, CAR_TYPES, FUELS, PERIODS, INCOME_TYPES, expenseCat, costCat, FUEL_TYPES } from './constants.js';
import { periodPicker, periodRange, statsBody, exportCsv } from './views/stats.js';
import { cityCompanyPicker } from './views/cityPicker.js';

applyTheme();
document.body.classList.add('admin');

// Менюто: всяка страница с няколко свързани неща, нищо не е наблъскано на едно място
const NAV = [
  ['/overview', 'home', 'Днес'],
  ['/drivers', 'users', 'Шофьори'],
  ['/control', 'shield', 'Контрол'],
  ['/messages', 'bell', 'Съобщения'],
  ['/partners', 'key', 'Партньори'],
  ['/growth', 'trophy', 'Растеж'],
  ['/stats', 'chart', 'Статистика'],
  ['/dev', 'sparkle', 'Развитие'],
  ['/subs', 'receipt', 'Абонаменти'],
];
const PARENT = { '/driver': '/drivers', '/new': '/drivers', '/geo': '/stats', '/market': '/stats', '/charts': '/stats', '/reports': '/stats' };
const PARENT_LABEL = { '/drivers': 'Шофьори', '/stats': 'Статистика' };
const mkState = () => ({ unit: 'month', anchor: todayStr(), from: addDays(todayStr(), -29), to: todayStr() });
const overviewState = mkState(), geoState = mkState(), driverState = mkState(), marketState = mkState();
const listState = { q: '', filter: 'all', sort: 'net' };
// Общ филтър за целия админ панел: град → фирма
const scope = { city: '', company: '' };
const inScope = (d) => (!scope.city || d.user.city === scope.city) && (!scope.company || d.user.company === scope.company);
const scoped = () => store.admin.allData().filter(inScope);
const scopeLabel = () => (scope.company ? `${scope.company}, ${scope.city}` : scope.city || 'Цяла България');
// Намалена палитра: жълто, сиви нюанси и малко лилаво
const PALETTE = ['#FFC21A', '#8E929B', '#8B6FE8', '#C9CCD2', '#5E6168', '#B88900', '#C4B5FD', '#74777F', '#E4E6EA', '#3F4249'];

const go = (p) => { location.hash = p; };
function parse() { const raw = location.hash.slice(1) || '/overview'; const parts = raw.split('?')[0].split('/').filter(Boolean); return { name: '/' + (parts[0] || 'overview'), param: parts[1], raw }; }

function render() {
  const app = document.getElementById('app');
  const r = parse();
  if (!store.adminUser()) return fill(app, loginView());
  if (r.name === '/login') return go('/overview');
  const views = { '/overview': overview, '/charts': overview, '/reports': statsPage, '/stats': statsPage, '/geo': geo, '/market': market, '/drivers': drivers, '/driver': driverDetail, '/subs': subs, '/new': newDriver, '/settings': settings,
    '/control': control, '/messages': messagesPage, '/partners': partners, '/growth': growth, '/dev': devPage };
  const view = views[r.name] || overview;
  const withScope = ['/overview', '/charts', '/stats', '/geo', '/market', '/drivers', '/subs', '/growth'].includes(r.name) || !views[r.name];
  const y = window.scrollY;
  const parent = PARENT[r.name] && r.name !== '/driver' ? PARENT[r.name] : null;
  const back = parent && h('a', { class: 'adm-back', href: '#' + parent }, icon('left', 18), PARENT_LABEL[parent]);
  fill(app, h('div', { class: 'adm' }, sidebar(r.name), h('main', { class: 'adm-main' }, back, withScope && scopeBar(), view(r))));
  // на телефон менюто се плъзга – показваме активния бутон
  const on = document.querySelector('.adm-nav a.on'); if (on && on.parentElement.scrollWidth > on.parentElement.clientWidth) on.parentElement.scrollLeft = on.offsetLeft - 16;
  if (r.raw === render.last) window.scrollTo(0, y); else window.scrollTo(0, 0);
  render.last = r.raw;
  let seen = 'done'; try { seen = localStorage.getItem('profitaxi.adminTour'); } catch { /* */ }
  if (seen !== 'done' && r.name === '/overview' && !document.querySelector('.tour')) setTimeout(runAdminTour, 500);
}

function sidebar(active) {
  const a = store.adminUser();
  const n = store.admin.drivers().length;
  return h('aside', { class: 'adm-side' },
    h('div', { class: 'brand' }, h('img', { class: 'brand-logo', src: '/icons/admin-192.png', alt: '' }), h('span', { class: 'brand-name' }, 'Profi', h('b', null, 'Taxi')), h('span', { class: 'adm-badge' }, 'Админ')),
    h('nav', { class: 'adm-nav' }, NAV.map(([p, ic, label]) =>
      h('a', { href: '#' + p, class: cx((active === p || PARENT[active] === p) && 'on') }, icon(ic, 19), h('span', null, label), p === '/drivers' && h('span', { class: 'count' }, n), p === '/control' && newAlerts().length > 0 && h('span', { class: 'count alert' }, newAlerts().length)))),
    h('div', { class: 'adm-side-foot' },
      h('div', { class: 'who' }, a.email),
      h('a', { class: cx('icon-btn', 'sf-set', active === '/settings' && 'on'), id: 'adm-settings', href: '#/settings', 'aria-label': 'Настройки', title: 'Настройки' }, icon('shield', 18)),
      h('button', { class: 'icon-btn sf-theme', id: 'adm-theme', 'aria-label': 'Смени темата', title: 'Светла / тъмна тема', onclick: (e) => { setTheme(isDark() ? 'light' : 'dark'); e.currentTarget.replaceChildren(icon(isDark() ? 'sun' : 'moon', 18)); } }, icon(isDark() ? 'sun' : 'moon', 18)),
      h('button', { class: 'icon-btn sf-help', 'aria-label': 'Помощ', title: 'Помощ: кратка разходка', onclick: () => { if (location.hash !== '#/overview') { go('/overview'); setTimeout(runAdminTour, 300); } else runAdminTour(); } }, icon('sparkle', 18)),
      h('button', { class: 'btn grow sf-out', onclick: () => { store.adminLogout(); render(); } }, icon('logout', 18), 'Изход')));
}

function runAdminTour() { startTour(ADMIN_TOUR, { onDone: () => { try { localStorage.setItem('profitaxi.adminTour', 'done'); } catch { /* */ } } }); }

function loginView() {
  const email = h('input', { class: 'input', type: 'email', autocomplete: 'username' });
  const pw = h('input', { class: 'input', type: 'password', autocomplete: 'current-password' });
  const err = h('p', { class: 'err' });
  return h('div', { class: 'auth', style: { maxWidth: '420px', margin: '0 auto' } },
    h('div', { class: 'brand' }, h('img', { class: 'brand-logo', src: '/icons/admin-192.png', alt: '' }), h('span', { class: 'brand-name' }, 'Profi', h('b', null, 'Taxi'))),
    h('div', { class: 'auth-hero' }, h('h1', null, 'Администрация'), h('p', null, 'Вход само за администратори.')),
    h('form', { class: 'form', onsubmit: (e) => { e.preventDefault(); const r = store.adminLogin(email.value, pw.value); if (r.error) { err.textContent = r.error; return; } render(); } },
      field('Имейл', email), field('Парола', pw), err,
      h('button', { class: 'btn btn-xl', type: 'submit', style: { background: 'var(--accent)', color: 'var(--accent-ink)' } }, 'Вход')),
    h('div', { class: 'demo-box' }, h('b', null, 'Демо: '), 'admin@profitaxi.bg / admin123 ',
      h('button', { type: 'button', onclick: () => { email.value = 'admin@profitaxi.bg'; pw.value = 'admin123'; } }, 'Попълни')));
}

// ---------- помощни ----------
function subState(u) {
  if (u.status === 'blocked') return { key: 'blocked', label: 'Спрян', cls: 'bad' };
  const left = Math.round((parseDate(u.subscription.validUntil) - parseDate(todayStr())) / 86400000);
  if (left < 0) return { key: 'expired', label: 'Изтекъл', cls: 'bad', left };
  if (u.subscription.plan === 'trial') return { key: 'trial', label: 'Пробен', cls: 'warn', left };
  return { key: 'active', label: 'Активен', cls: left <= 7 ? 'warn' : 'good', left };
}
const lastShift = (d) => d.shifts.find((s) => s.end);
const daysSince = (d) => { const l = lastShift(d); return l ? Math.round((parseDate(todayStr()) - parseDate(shiftDate(l))) / 86400000) : null; };
const pageHead = (title, sub, actions) => h('div', { class: 'adm-head' }, h('div', null, h('h1', null, title), sub && h('p', null, sub)), actions && h('div', { class: 'row gap' }, actions));
const kpi = (ic, color, label, value, sub, valCls, extra = {}) => h('div', { class: cx('kpi', extra.lg && 'kpi-lg'), style: { '--kc': color }, title: extra.title || null },
  h('div', { class: 'kpi-head' }, h('div', { class: 'kpi-ic' }, icon(ic, 18)), h('div', { class: 'kpi-label' }, label), extra.trend),
  h('div', { class: cx('kpi-value', valCls) }, value),
  sub && h('div', { class: 'kpi-sub' }, sub),
  extra.bar != null && h('div', { class: 'kpi-bar', title: `${Math.round(extra.bar * 100)}%` }, h('span', { style: { width: `${Math.max(0, Math.min(1, extra.bar)) * 100}%` } })),
  extra.spark);
// Промяна спрямо предишния период
function trendChip(cur, prev, { invert, unit = '%' } = {}) {
  if (prev == null || !Number.isFinite(prev) || Math.abs(prev) < 0.01) return null;
  const d = (cur - prev) / Math.abs(prev);
  if (!Number.isFinite(d)) return null;
  const up = d >= 0, good = invert ? !up : up;
  return h('span', { class: cx('trend-chip', good ? 'up' : 'down'), title: 'Спрямо предишния период' }, `${up ? '▲' : '▼'} ${Math.abs(Math.round(d * 100))}${unit}`);
}
// Мини графика (линия с площ)
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
// Малък показател в лента
const miniKpi = (ic, color, label, value, sub) => h('div', { class: 'mini-kpi', style: { '--kc': color } },
  h('span', { class: 'mini-ic' }, icon(ic, 16)), h('div', { style: { minWidth: 0 } }, h('span', null, label), h('b', null, value), sub && h('em', null, sub)));
// Предишен период със същата дължина
function prevRange(st) {
  if (st.unit === 'custom') { const len = Math.round((parseDate(st.to) - parseDate(st.from)) / 86400000) + 1; return { from: addDays(st.from, -len), to: addDays(st.from, -1) }; }
  const c = { ...st }; shiftAnchorLocal(c, -1); const r = periodRange(c);
  // за текущ период сравняваме само до същия ден (напр. 1–5 окт срещу 1–5 сеп)
  const cur = periodRange(st);
  if (cur.to >= todayStr() && cur.from <= todayStr()) { const len = Math.round((parseDate(todayStr()) - parseDate(cur.from)) / 86400000); return { from: r.from, to: addDays(r.from, len) }; }
  return r;
}
// Какво сравняваме: при текущ период – само завършените дни (без днешния, който още тече),
// срещу същия брой дни от предишния период (напр. 1–4 окт срещу 1–4 сеп).
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
function shiftAnchorLocal(st, dir) {
  const d = parseDate(st.anchor);
  if (st.unit === 'day') d.setDate(d.getDate() + dir);
  if (st.unit === 'week') d.setDate(d.getDate() + 7 * dir);
  if (st.unit === 'month') d.setMonth(d.getMonth() + dir, 1);
  if (st.unit === 'year') d.setFullYear(d.getFullYear() + dir, 0, 1);
  st.anchor = dateStr(d);
}
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');

function table(headers, rows, { rightFrom = 1 } = {}) {
  if (!rows.length) return h('p', { class: 'muted small' }, 'Няма данни');
  return h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
    h('thead', null, h('tr', null, headers.map((x, i) => h('th', { class: i >= rightFrom ? 'r' : '' }, x)))),
    h('tbody', null, rows.map((r) => h('tr', { class: r.href ? 'link' : '', onclick: r.href ? () => { location.hash = r.href.slice(1); } : null },
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
function aggregate(rows) {
  const s = (k) => rows.reduce((a, x) => a + x.st[k], 0);
  const T = { income: s('income'), net: s('net'), exp: s('totalExp'), varExp: s('varExp'), fixed: s('fixedExp'), shifts: s('shifts'), hours: s('hours'), km: s('km'), cash: s('cash'), card: s('card'), app: s('app'), tips: s('tips') };
  T.perHour = T.hours ? T.net / T.hours : 0; T.perKm = T.km ? T.net / T.km : 0; T.perShift = T.shifts ? T.income / T.shifts : 0; T.incPerHour = T.hours ? T.income / T.hours : 0;
  T.active = rows.filter((x) => x.st.shifts > 0).length;
  return T;
}

// ---------- Филтър град → фирма (горе на всяка страница) ----------
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
let scopeOpen = false;

// ---------- Показатели на шофьор за пазарния анализ ----------
function driverMetrics(d, st, days) {
  const p = d.profile;
  const m = { d, st };
  if (p.dispatch.mode !== 'none' && p.dispatch.amount > 0) {
    m.dispatchMode = p.dispatch.mode; m.dispatchAmount = p.dispatch.amount;
    m.dispatchMonthly = p.dispatch.mode === 'daily' ? p.dispatch.amount * (st.workedDays ? (st.workedDays / days) * 30.44 : 22) : p.dispatch.mode === 'weekly' ? p.dispatch.amount * 4.345 : p.dispatch.amount;
  }
  if (p.carType === 'rent' && p.rent.amount > 0) m.rentWeekly = p.rent.period === 'day' ? p.rent.amount * 7 : p.rent.period === 'month' ? p.rent.amount / 4.345 : p.rent.amount;
  if (p.carType === 'leasing' && p.leasing.amount > 0) m.leasingMonthly = p.leasing.amount;
  if (st.shifts) {
    m.hoursPerShift = st.hours / st.shifts;
    m.hoursPerDay = st.hours / st.workedDays;
    m.shiftsPerWeek = st.shifts / (days / 7);
    m.kmPerShift = st.km / st.shifts;
    m.incomePerHour = st.hours ? st.income / st.hours : null;
    m.netPerHour = st.hours ? st.net / st.hours : null;
    m.fuelPerKm = st.km ? (st.expByCat.fuel || 0) / st.km : null;
    m.incomePerShift = st.income / st.shifts;
  }
  return m;
}
const avgOf = (list, k) => { const v = list.map((x) => x[k]).filter((x) => x != null && Number.isFinite(x)); return v.length ? { avg: v.reduce((a, b) => a + b, 0) / v.length, min: Math.min(...v), max: Math.max(...v), n: v.length } : null; };
const fmtAvg = (a, f) => (a ? f(a.avg) : '—');
const rangeTxt = (a, f) => (a ? (a.n > 1 ? `от ${f(a.min)} до ${f(a.max)}, ${a.n} шоф.` : `${a.n} шофьор`) : 'няма данни');

// ---------- Ефир, наеми, работа ----------
function market() {
  const root = h('div');
  const draw = () => {
    const r = periodRange(marketState);
    const toEff = r.to < todayStr() ? r.to : todayStr();
    const days = Math.max(1, Math.round((parseDate(toEff) - parseDate(r.from)) / 86400000) + 1);
    const all = scoped();
    const ms = all.map((d) => driverMetrics(d, periodStats(d, r.from, r.to), days));
    const h1 = (k) => avgOf(ms, k);
    const disp = h1('dispatchMonthly'), rent = h1('rentWeekly'), leas = h1('leasingMonthly');
    const iph = h1('incomePerHour'), nph = h1('netPerHour'), hps = h1('hoursPerShift'), hpd = h1('hoursPerDay'), spw = h1('shiftsPerWeek'), kps = h1('kmPerShift'), fpk = h1('fuelPerKm'), ips = h1('incomePerShift');
    const cars = { own: 0, rent: 0, leasing: 0 };
    all.forEach((d) => { cars[d.profile.carType]++; });
    const fuels = {};
    all.forEach((d) => { fuels[d.profile.fuel] = (fuels[d.profile.fuel] || 0) + 1; });
    // ефир по начин на плащане
    const modes = ['daily', 'weekly', 'monthly'].map((mode) => {
      const list = ms.filter((x) => x.dispatchMode === mode);
      return { mode, list, a: avgOf(list, 'dispatchAmount'), m: avgOf(list, 'dispatchMonthly') };
    });
    const noDispatch = ms.filter((x) => !x.dispatchMode).length;
    // сравнение по фирми (или по градове, ако не е избран град)
    const keyFn = scope.city ? (d) => d.user.company : (d) => d.user.city;
    const groups = new Map();
    ms.forEach((x) => { const k = keyFn(x.d); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); });
    const cmp = [...groups.entries()].map(([k, list]) => ({ k, list, city: list[0].d.user.city })).sort((a, b) => b.list.length - a.list.length);
    // кога започват смените
    const shiftsP = all.flatMap((d) => d.shifts.filter((s) => s.end && shiftDate(s) >= r.from && shiftDate(s) <= r.to));
    const starts = Array(8).fill(0); shiftsP.forEach((s) => { starts[Math.floor(new Date(s.start).getHours() / 3)]++; });
    const lens = [[0, 6, 'до 6 ч'], [6, 8, '6–8 ч'], [8, 10, '8–10 ч'], [10, 12, '10–12 ч'], [12, 99, '12+ ч']].map(([a, b, label]) => ({ label, value: shiftsP.filter((s) => { const x = shiftHours(s); return x >= a && x < b; }).length }));
    const modeLabel = { daily: 'На ден', weekly: 'На седмица', monthly: 'На месец' };

    fill(root,
      pageHead('Ефир, наеми и работа', `${scopeLabel()}: ${all.length} шофьори`),
      h('div', { class: 'adm-picker' }, periodPicker(marketState, draw)),
      h('div', { class: 'kpis' },
        kpi('phone', 'var(--text)', 'Ефир средно', fmtAvg(disp, (v) => `${money(v)}/мес`), rangeTxt(disp, (v) => money(v))),
        kpi('key', 'var(--text)', 'Наем средно', fmtAvg(rent, (v) => `${money(v)}/седм.`), rangeTxt(rent, (v) => money(v))),
        kpi('doc', 'var(--text)', 'Лизинг средно', fmtAvg(leas, (v) => `${money(v)}/мес`), rangeTxt(leas, (v) => money(v))),
        kpi('car', 'var(--text)', 'Коли', String(all.length), `${cars.own} собствени, ${cars.rent} под наем, ${cars.leasing} лизинг`),
        kpi('coins', 'var(--text)', 'Приход на час', fmtAvg(iph, money2), `чисто ${fmtAvg(nph, money2)}/ч`),
        kpi('clock', 'var(--text)', 'Часове на смяна', fmtAvg(hps, fmtDuration), `${fmtAvg(hpd, fmtDuration)} на работен ден`),
        kpi('calendar', 'var(--text)', 'Смени на седмица', fmtAvg(spw, (v) => fmtNum1(v)), 'средно на шофьор'),
        kpi('road', 'var(--text)', 'Км на смяна', fmtAvg(kps, (v) => `${fmtNum(v)} км`), `гориво ${fmtAvg(fpk, money2)}/км`)),
      h('div', { class: 'adm-grid two' },
        h('section', { class: 'card' }, cardTitle('phone', 'Ефир / диспечер'),
          table(['Как се плаща', 'Шофьори', 'Средна такса', 'От – до', 'Равно на месец'],
            modes.filter((x) => x.list.length).map((x) => ({ cells: [h('b', null, modeLabel[x.mode]), x.list.length, money(x.a.avg, x.a.avg % 1 ? 2 : 0), x.a.n > 1 ? `${money(x.a.min)} – ${money(x.a.max)}` : money(x.a.min), money(x.m.avg)] })), { rightFrom: 1 }),
          h('p', { class: 'muted small', style: { marginTop: '10px' } }, `${noDispatch} ${noDispatch === 1 ? 'шофьор не плаща' : 'шофьори не плащат'} ефир. „Равно на месец“ при таксата на ден е по реалните им работни дни.`)),
        h('section', { class: 'card' }, cardTitle('key', 'Наеми и лизинг'),
          table(['Вид', 'Шофьори', 'Средно', 'Най-малко', 'Най-много'], [
            rent && { cells: [h('b', null, 'Наем (на седмица)'), rent.n, money(rent.avg), money(rent.min), money(rent.max)] },
            leas && { cells: [h('b', null, 'Лизинг (на месец)'), leas.n, money(leas.avg), money(leas.min), money(leas.max)] },
          ].filter(Boolean), { rightFrom: 1 }),
          h('div', { style: { marginTop: '14px' } }, donut([
            { label: 'Собствена', value: cars.own, color: PALETTE[0], text: String(cars.own) },
            { label: 'Под наем', value: cars.rent, color: PALETTE[1], text: String(cars.rent) },
            { label: 'Лизинг', value: cars.leasing, color: PALETTE[2], text: String(cars.leasing) }], 'коли', String(all.length))))),
      h('section', { class: 'card', style: { marginTop: '14px' } }, cardTitle(scope.city ? 'car' : 'target', scope.city ? `Сравнение на фирмите в ${scope.city}` : 'Сравнение по градове'),
        table([scope.city ? 'Фирма' : 'Град', 'Шофьори', 'Ефир/мес', 'Наем/седм.', 'Приход/ч', 'Чисто/ч', 'Ч/смяна', 'Ч/ден', 'Смени/седм.', 'Км/смяна', 'Гориво/км'],
          cmp.map((g) => { const a = (k) => avgOf(g.list, k); return { cells: [
            h('b', null, g.k), g.list.length, fmtAvg(a('dispatchMonthly'), money), fmtAvg(a('rentWeekly'), money), fmtAvg(a('incomePerHour'), money2),
            h('b', { class: tone(a('netPerHour')?.avg || 0) }, fmtAvg(a('netPerHour'), money2)), fmtAvg(a('hoursPerShift'), (v) => fmtNum1(v)), fmtAvg(a('hoursPerDay'), (v) => fmtNum1(v)),
            fmtAvg(a('shiftsPerWeek'), (v) => fmtNum1(v)), fmtAvg(a('kmPerShift'), fmtNum), fmtAvg(a('fuelPerKm'), money2)] }; }), { rightFrom: 1 })),
      h('div', { class: 'adm-grid three' },
        h('section', { class: 'card' }, cardTitle('clock', 'Кога започват смените'), colBars(starts.map((v, i) => ({ label: `${i * 3}ч`, value: v })))),
        h('section', { class: 'card' }, cardTitle('calendar', 'Колко дълги са смените'), colBars(lens)),
        h('section', { class: 'card' }, cardTitle('fuel', 'Гориво'),
          donut(Object.entries(fuels).sort((a, b) => b[1] - a[1]).map(([k, v], i) => ({ label: FUELS[k]?.label || k, value: v, color: PALETTE[(i + 3) % PALETTE.length], text: String(v) })), 'коли', String(all.length)))),
      h('section', { class: 'card' }, cardTitle('users', 'По шофьори'),
        table(['Шофьор', 'Кола', 'Ефир', 'Наем', 'Смени', 'Приход/ч', 'Чисто/ч', 'Ч/смяна', 'Ч/ден', 'Приход/смяна'],
          ms.filter((x) => x.st.shifts).sort((a, b) => (b.netPerHour || 0) - (a.netPerHour || 0)).map((x) => ({ href: '#/driver/' + x.d.user.id, cells: [
            h('span', { class: 'who-cell' }, h('b', null, x.d.user.name), h('span', null, `${x.d.user.city}, ${x.d.user.company}`)),
            CAR_TYPES[x.d.profile.carType]?.label,
            x.dispatchMode ? `${money(x.dispatchAmount)}${{ daily: '/ден', weekly: '/седм.', monthly: '/мес' }[x.dispatchMode]}` : '—',
            x.rentWeekly ? `${money(x.rentWeekly)}/седм.` : x.leasingMonthly ? `лизинг ${money(x.leasingMonthly)}` : '—',
            x.st.shifts, money2(x.incomePerHour), h('b', { class: tone(x.netPerHour) }, money2(x.netPerHour)), fmtNum1(x.hoursPerShift), fmtNum1(x.hoursPerDay), money(x.incomePerShift)] })), { rightFrom: 4 })));
  };
  draw();
  return root;
}

// ---------- Общ преглед ----------

// ---------- Карта на България на живо ----------
// Колко шофьори има във всеки град и колко са на смяна в момента (смяна без край).
const CITY_POS = { 'София': [23.32, 42.70], 'Пловдив': [24.75, 42.15], 'Варна': [27.91, 43.21], 'Бургас': [27.47, 42.50], 'Стара Загора': [25.63, 42.43], 'Русе': [25.97, 43.85],
  'Сливен': [26.32, 42.68], 'Нова Загора': [26.01, 42.49], 'Асеновград': [24.87, 42.01], 'Благоевград': [23.10, 42.02], 'Велико Търново': [25.63, 43.08], 'Видин': [22.88, 43.99],
  'Враца': [23.55, 43.21], 'Габрово': [25.32, 42.87], 'Добрич': [27.83, 43.57], 'Дупница': [23.12, 42.26], 'Казанлък': [25.39, 42.62], 'Кърджали': [25.37, 41.65],
  'Кюстендил': [22.69, 42.28], 'Ловеч': [24.72, 43.14], 'Монтана': [23.23, 43.41], 'Пазарджик': [24.33, 42.19], 'Перник': [23.03, 42.60], 'Плевен': [24.61, 43.42],
  'Разград': [26.52, 43.53], 'Сандански': [23.27, 41.57], 'Силистра': [27.26, 44.12], 'Смолян': [24.71, 41.58], 'Търговище': [26.57, 43.25], 'Хасково': [25.55, 41.93],
  'Шумен': [26.94, 43.27], 'Ямбол': [26.50, 42.48] };
// Активен = има смяна през последните 7 дни (или е на смяна сега)
const isActive = (d) => { const from = addDays(todayStr(), -6); return d.shifts.some((x) => !x.end || shiftDate(x) >= from); };
let mapEl = null, lmap = null, lmarkers = null, mapTheme = null;
function cityStats(all) {
  const by = {};
  all.forEach((d) => { const c = d.user.city; by[c] = by[c] || { total: 0, active: 0 }; by[c].total++; if (isActive(d)) by[c].active++; });
  return by;
}
function drawMap(by) {
  if (!window.L || !mapEl) return;
  const dark = isDark();
  if (!lmap) {
    lmap = L.map(mapEl, { zoomControl: true, attributionControl: true, scrollWheelZoom: false, minZoom: 6, maxZoom: 12, maxBounds: [[40.6, 21.4], [44.9, 29.6]], maxBoundsViscosity: .8 }).setView([42.75, 25.4], 7);
    lmap.fitBounds([[41.2, 22.3], [44.25, 28.65]], { padding: [10, 10] });
  }
  if (mapTheme === null) {
    lmap.eachLayer((l) => { if (l instanceof L.TileLayer) lmap.removeLayer(l); });
    // Esri World Topo – истинска цветна карта (зелен релеф, реки, пътища, градове), безплатна, без ключ
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18, attribution: 'Карта &copy; Esri, HERE, Garmin, &copy; OpenStreetMap' }).addTo(lmap);
    mapTheme = dark;
  }
  if (lmarkers) lmarkers.remove();
  lmarkers = L.layerGroup().addTo(lmap);
  const max = Math.max(1, ...Object.values(by).map((x) => x.total));
  const named = new Set(Object.entries(by).sort((a, b) => b[1].total - a[1].total).slice(0, 5).map(([c]) => c));
  Object.entries(by).forEach(([city, v]) => {
    const pos = CITY_POS[city]; if (!pos) return;
    const size = Math.round(20 + Math.sqrt(v.total / max) * 16);
    const icon = L.divIcon({ className: 'lm-wrap', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
      html: `<div class="lm ${v.active ? 'on' : ''}" style="width:${size}px;height:${size}px"><b>${v.total}</b>${v.active ? `<i>${v.active}</i>` : ''}</div>${named.has(city) ? `<span class="lm-name">${city}</span>` : ''}` });
    L.marker([pos[1], pos[0]], { icon, title: `${city}: ${v.total} шофьори, ${v.active} активни` })
      .on('click', () => { scope.city = city; scope.company = ''; go('/drivers'); }).addTo(lmarkers);
  });
  setTimeout(() => lmap.invalidateSize(), 0);
}
function liveMap(all) {
  const by = cityStats(all);
  const active = all.filter(isActive).length;
  if (!mapEl) mapEl = h('div', { class: 'lmap', role: 'img', 'aria-label': 'Карта на шофьорите по градове' });
  // Leaflet се зарежда само веднъж, при първото отваряне на картата
  if (!window.L) {
    if (!document.getElementById('leaflet-js')) {
      document.head.append(h('link', { rel: 'stylesheet', href: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css' }));
      const sc = h('script', { id: 'leaflet-js', src: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js' });
      sc.onload = () => drawMap(cityStats(scoped()));
      document.head.append(sc);
    }
  } else setTimeout(() => drawMap(by), 0);
  const top = Object.entries(by).sort((a, b) => b[1].total - a[1].total).slice(0, 6);
  return h('section', { class: 'card map-card' },
    h('div', { class: 'map-head' },
      h('div', null, h('h2', null, 'Шофьорите по градове'), h('p', { class: 'muted small' }, 'Числото е колко шофьори има в града, зеленото – колко са активни (смяна през последните 7 дни). Натисни град за списъка.')),
      h('div', { class: 'live-badge' }, h('i'), `${active} активни от ${all.length}`)),
    mapEl,
    h('div', { class: 'map-top' }, top.map(([c, v]) => h('button', { class: 'chip', onclick: () => { scope.city = c; scope.company = ''; go('/drivers'); } }, h('b', null, c), ` ${v.total} · ${v.active} активни`))));
}
const bigNum = (label, value, sub, cls) => h('div', { class: cx('big-num', cls) }, h('span', null, label), h('b', null, value), sub && h('small', null, sub));

// „Подробни отчети“ остава отворено, когато смениш периода вътре
let overviewMoreOpen = false;
const asPage = (det) => { det.open = true; det.classList.add('as-page'); return det; };
const keepOpen = (det) => { det.open = overviewMoreOpen; det.addEventListener('toggle', () => { overviewMoreOpen = det.open; }); return det; };

function overview() {
  const root = h('div');
  const draw = () => {
    const chartsOnly = parse().name === '/charts';
    const r = periodRange(overviewState);
    const all = scoped();
    const rows = all.map((d) => ({ d, st: periodStats(d, r.from, r.to) }));
    const T = aggregate(rows);
    const states = all.map((d) => subState(d.user));
    const count = (k) => states.filter((s) => s.key === k).length;
    const newRegs = all.filter((d) => { const c = isoToDateStr(d.user.createdAt); return c >= r.from && c <= r.to; }).length;
    const price = store.admin.settings().price || 0;
    const mrr = count('active') * price;

    // Графики по дни/месеци
    const days = Math.round((parseDate(r.to) - parseDate(r.from)) / 86400000) + 1;
    const unit = overviewState.unit === 'year' || days > 62 ? 'month' : 'day';
    let pts = null, activePts = null;
    if (overviewState.unit !== 'day') {
      const per = all.map((d) => series(d, r.from, r.to, unit));
      pts = per[0]?.map((p, i) => ({ ...p, net: per.reduce((a, s) => a + s[i].net, 0), income: per.reduce((a, s) => a + s[i].income, 0) })) || [];
      if (unit === 'day') activePts = per[0]?.map((p, i) => ({ ...p, net: per.reduce((a, s) => a + (s[i].worked ? 1 : 0), 0) }));
    }
    // Предишен период и мини графики
    const { cur: cmpCur, prev: pr } = compareRanges(overviewState, r);
    const P = aggregate(all.map((d) => ({ d, st: periodStats(d, pr.from, pr.to) })));
    const C = cmpCur === r ? T : aggregate(all.map((d) => ({ d, st: periodStats(d, cmpCur.from, cmpCur.to) })));
    let sparkPts = pts || [], activeSpark = activePts ? activePts.map((x) => x.net) : null;
    if (!pts) { const per = all.map((d) => series(d, addDays(r.to, -13), r.to, 'day')); sparkPts = per[0]?.map((p, i) => ({ net: per.reduce((a, x) => a + x[i].net, 0), income: per.reduce((a, x) => a + x[i].income, 0) })) || []; }
    sparkPts = sparkPts.filter((x) => !x.future);
    if (activeSpark && activePts) activeSpark = activePts.filter((x) => !x.future).map((x) => x.net);
    // Всички смени за периода
    const shiftsP = all.flatMap((d) => d.shifts.filter((s) => s.end && shiftDate(s) >= r.from && shiftDate(s) <= r.to));
    const ti = timeInsights(shiftsP);
    const byWd = Array(7).fill(0); shiftsP.forEach((s) => { byWd[(new Date(s.start).getDay() + 6) % 7]++; });
    const night = shiftsP.filter((s) => { const hr = new Date(s.start).getHours(); return hr >= 16 || hr < 4; }).length;
    // Разходи по категории (всички)
    const exp = {};
    rows.forEach(({ st }) => {
      // по име, за да се съберат еднаквите категории от смените и постоянните (напр. „Обслужване“)
      const add = (c, v) => { const key = c.label.toLowerCase(); exp[key] = exp[key] || { label: c.label, icon: c.icon, color: c.color, value: 0 }; exp[key].value += v; };
      Object.entries(st.expByCat).forEach(([k, v]) => add(expenseCat(k), v));
      Object.entries(st.fixedByCat).forEach(([k, v]) => add(costCat(k), v));
    });
    // По тип кола и гориво
    const groupBy = (keyFn, labelFn) => {
      const m = {};
      rows.forEach(({ d, st }) => { const k = keyFn(d); m[k] = m[k] || { label: labelFn(k), drivers: 0, net: 0, hours: 0, km: 0, income: 0, fuel: 0 }; const g = m[k]; g.drivers++; g.net += st.net; g.hours += st.hours; g.km += st.km; g.income += st.income; g.fuel += st.expByCat.fuel || 0; });
      return Object.values(m);
    };
    const byCar = groupBy((d) => d.profile.carType, (k) => CAR_TYPES[k]?.label || k);
    const byFuel = groupBy((d) => d.profile.fuel, (k) => FUELS[k]?.label || k);
    const risk = all.filter((d) => subState(d.user).key !== 'blocked' && (daysSince(d) == null || daysSince(d) >= 7)).sort((a, b) => (daysSince(b) ?? 999) - (daysSince(a) ?? 999));

    fill(root,
      chartsOnly ? pageHead('Графики и подробни числа', `${scopeLabel()}: всички шофьори за избрания период`) : pageHead('Днес', `${scopeLabel()} · обновява се на живо`),
      !chartsOnly && liveMap(all),
      !chartsOnly && h('div', { class: 'big-nums' },
        bigNum('Шофьори общо', String(all.length), `${all.filter((d) => isoToDateStr(d.user.createdAt) >= addDays(todayStr(), -6)).length} нови тази седмица`),
        bigNum('Активни', String(all.filter(isActive).length), 'смяна през последните 7 дни', 'live'),
        bigNum('Платени абонаменти', String(count('active')), `${count('trial')} на пробен период`),
        bigNum('Приход от абонаменти', money(mrr), 'на месец')),
      !chartsOnly && attentionCard(all, risk),
      !chartsOnly && alertsPreview(),
      (chartsOnly ? asPage : () => null)(more('Подробни отчети и графики',
      h('div', { class: 'adm-picker' }, periodPicker(overviewState, draw)),
      h('div', { class: 'kpis kpis-lg' },
        kpi('coins', 'var(--text)', 'Приход', money(T.income), `${fmtNum(T.shifts)} смени`, '', { lg: true, title: moneyFull(T.income), trend: trendChip(C.income, P.income), spark: sparkline(sparkPts.map((x) => x.income), '#FFC21A') }),
        kpi('wallet', 'var(--text)', 'Чиста печалба', money(T.net), `разходи ${money(T.exp)}`, tone(T.net), { lg: true, title: moneyFull(T.net), trend: trendChip(C.net, P.net), spark: sparkline(sparkPts.map((x) => x.net), '#FFC21A') }),
        kpi('users', 'var(--text)', 'Активни шофьори', `${T.active} от ${all.length}`, `${newRegs} нови регистрации`, '', { lg: true, trend: trendChip(C.active, P.active), spark: activeSpark && sparkline(activeSpark, '#FFC21A'), bar: activeSpark ? null : (all.length ? T.active / all.length : 0) }),
        kpi('receipt', 'var(--text)', 'Абонаменти на месец', money(mrr), `${count('active')} платени по ${money(price, 2)}`, '', { lg: true, title: 'MRR – месечни приходи от абонаменти', bar: all.length ? count('active') / all.length : 0 })),
      h('div', { class: 'mini-kpis', style: { marginTop: '12px' } },
        miniKpi('clock', 'var(--text)', 'Чисто на час', money2(T.perHour), `приход ${money2(T.incPerHour)}`),
        miniKpi('road', 'var(--text)', 'Чисто на км', money2(T.perKm), `${fmtNum(T.km)} км`),
        miniKpi('calendar', 'var(--text)', 'Приход на смяна', money(T.perShift), T.shifts ? fmtDuration(T.hours / T.shifts) : ''),
        miniKpi('heart', 'var(--text)', 'Бакшиши', money(T.tips), `${pct(night, shiftsP.length)} нощни`)),
      pts && pts.length > 1 && h('div', { class: 'adm-grid two' },
        h('section', { class: 'card' }, cardTitle('chart', 'Чиста печалба на всички', h('b', { class: cx('num', tone(T.net)) }, money(T.net))), barChart(pts, { height: 170 })),
        activePts ? h('section', { class: 'card' }, cardTitle('users', 'Активни шофьори по дни'), barChart(activePts, { height: 170, cls: 'violet', fmt: (v) => `${Math.round(v)} шофьори` }))
          : h('section', { class: 'card' }, cardTitle('coins', 'Приход по месеци'), barChart(pts, { height: 170, valueKey: 'income', cls: 'violet' }))),
      h('div', { class: 'adm-grid three' },
        h('section', { class: 'card' }, cardTitle('card', 'Как плащат клиентите'),
          donut(Object.entries(INCOME_TYPES).map(([k, t], i) => ({ label: t.label, value: T[k], color: PALETTE[i] })), 'приход', money(T.income))),
        h('section', { class: 'card' }, cardTitle('car', 'Тип кола'),
          donut(byCar.map((g, i) => ({ label: g.label, value: g.drivers, color: PALETTE[i], text: String(g.drivers), sub: `${money2(g.hours ? g.net / g.hours : 0)} чисто на час` })), 'шофьори', String(all.length))),
        h('section', { class: 'card' }, cardTitle('fuel', 'Гориво'),
          donut(byFuel.map((g, i) => ({ label: g.label, value: g.drivers, color: PALETTE[(i + 3) % PALETTE.length], text: String(g.drivers), sub: `гориво ${money2(g.km ? g.fuel / g.km : 0)} на км` })), 'шофьори', String(all.length)))),
      h('div', { class: 'adm-grid two' },
        h('section', { class: 'card' }, cardTitle('calendar', 'Смени по дни от седмицата'), colBars(byWd.map((v, i) => ({ label: WD_SHORT[i], value: v })))),
        h('section', { class: 'card' }, cardTitle('clock', 'Приход на час през денонощието'),
          ti.hasData ? colBars([0, 3, 6, 9, 12, 15, 18, 21].map((hh) => { const xs = ti.byHour.slice(hh, hh + 3).filter((x) => x.rate); return { label: `${hh}ч`, value: xs.length ? xs.reduce((a, x) => a + x.rate, 0) / xs.length : 0 }; }), (v) => `${Math.round(v)}€`) : h('p', { class: 'muted small' }, 'Няма данни'))),
      h('div', { class: 'adm-grid wide-left' },
        h('section', { class: 'card' }, cardTitle('trophy', 'Класиране за периода'),
          table(['Шофьор', 'Град', 'Смени', 'Приход', 'Чисто', '€/час', '€/км'],
            rows.filter((x) => x.st.shifts).sort((a, b) => b.st.net - a.st.net).slice(0, 10).map(({ d, st }, i) => ({
              href: '#/driver/' + d.user.id,
              cells: [h('span', { class: 'row' }, h('span', { class: 'rank' }, String(i + 1)), h('span', { class: 'who-cell' }, h('b', null, d.user.name), h('span', null, d.user.company))), d.user.city, st.shifts, money(st.income), h('b', { class: tone(st.net) }, money(st.net)), money2(st.netPerHour), money2(st.netPerKm)],
            })), { rightFrom: 2 })),
        h('div', { class: 'stack' },
          h('section', { class: 'card' }, cardTitle('wallet', 'Разходи на всички'),
            h('div', { class: 'grid2', style: { marginBottom: '14px' } }, stat('От смените', money(T.varExp), { icon: 'fuel', color: 'var(--c-orange)' }), stat('Постоянни', money(T.fixed), { icon: 'calendar', color: 'var(--c-blue)' })),
            shareRows(Object.values(exp).sort((a, b) => b.value - a.value).slice(0, 8), T.exp)),
          INVITES_ON && referralCard(all, r))))));
  };
  draw();
  return root;
}

// „Изисква внимание“: оперативното най-отгоре – изтичащи пробни, изтекли, спрени и неактивни шофьори
function attentionCard(all, risk) {
  const st = all.map((d) => ({ d, s: subState(d.user) }));
  const names = (list) => list.slice(0, 3).map((x) => (x.d || x).user.name.split(' ')[0]).join(', ') + (list.length > 3 ? ` и още ${list.length - 3}` : '');
  const ending = st.filter((x) => x.s.key === 'trial' && x.s.left <= 3);
  const expired = st.filter((x) => x.s.key === 'expired');
  const blocked = st.filter((x) => x.s.key === 'blocked');
  const rows = [
    ending.length && { cls: '', ic: 'clock', title: 'Пробният период изтича до 3 дни', list: ending, n: ending.length, filter: 'trial' },
    expired.length && { cls: 'bad', ic: 'alert', title: 'Изтекъл абонамент', list: expired, n: expired.length, filter: 'expired' },
    risk.length && { cls: '', ic: 'bell', title: 'Без смени 7+ дни', list: risk, n: risk.length, filter: 'all', sort: 'recent' },
    blocked.length && { cls: 'calm', ic: 'lock', title: 'Спрени акаунти', list: blocked, n: blocked.length, filter: 'blocked' },
  ].filter(Boolean);
  return h('section', { class: 'card attention' },
    cardTitle('alert', 'Изисква внимание', rows.length ? h('span', { class: 'chip warn' }, String(rows.reduce((a, r) => a + r.n, 0))) : null),
    rows.length ? rows.map((r) => h('a', { class: cx('att-row', r.cls), href: '#/drivers', onclick: () => { listState.filter = r.filter; if (r.sort) listState.sort = r.sort; } },
      h('span', { class: 'att-ic' }, icon(r.ic, 18)),
      h('span', { class: 'att-main' }, h('b', null, r.title), h('span', null, names(r.list))),
      h('span', { class: 'att-n' }, String(r.n)), icon('right', 16)))
      : h('div', { class: 'att-ok' }, icon('check', 18), 'Всичко е наред – няма нищо спешно.'));
}

// Покани: колко регистрации дойдоха с код и кои шофьори канят най-много
function referralCard(all, r) {
  const everyone = store.admin.allData();
  const byId = new Map(everyone.map((d) => [d.user.id, d]));
  const scopeIds = new Set(all.map((d) => d.user.id));
  const invited = all.filter((d) => d.user.referredBy);
  const inPeriod = invited.filter((d) => { const c = isoToDateStr(d.user.createdAt); return c >= r.from && c <= r.to; }).length;
  const counts = new Map();
  everyone.forEach((d) => { if (d.user.referredBy) counts.set(d.user.referredBy, (counts.get(d.user.referredBy) || 0) + 1); });
  const top = [...counts.entries()].map(([id, n]) => ({ d: byId.get(id), n })).filter((x) => x.d && scopeIds.has(x.d.user.id)).sort((a, b) => b.n - a.n).slice(0, 5);
  const months = all.reduce((a, d) => a + (d.user.refMonths || 0), 0);
  return h('section', { class: 'card' }, cardTitle('gift', 'Покани'),
    h('div', { class: 'grid2', style: { marginBottom: '12px' } },
      stat('Дошли с код', String(invited.length), { icon: 'users', color: 'var(--c-pink)', sub: `${inPeriod} през периода` }),
      stat('Подарени месеци', String(months), { icon: 'gift', color: 'var(--c-violet)' })),
    top.length ? top.map(({ d, n }) => h('a', { class: 'list-btn', href: '#/driver/' + d.user.id },
      h('span', { class: 'grow' }, d.user.name, h('span', { class: 'muted small' }, `, ${d.user.city}`)),
      h('span', { class: cx('chip', n >= 5 && 'good') }, `${n} ${n === 1 ? 'покана' : 'покани'}`)))
      : h('p', { class: 'muted small' }, 'Още никой не е канил колеги.'));
}

// ---------- Градове и фирми ----------
function geo() {
  const root = h('div');
  const draw = () => {
    const r = periodRange(geoState);
    const all = scoped();
    const rows = all.map((d) => ({ d, st: periodStats(d, r.from, r.to) }));
    const group = (keyFn) => {
      const m = new Map();
      for (const x of rows) { const k = keyFn(x.d); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
      return [...m.entries()].map(([k, list]) => ({ key: k, list, T: aggregate(list), city: list[0].d.user.city })).sort((a, b) => b.list.length - a.list.length || b.T.income - a.T.income);
    };
    const cities = group((d) => d.user.city || '—');
    const companies = group((d) => `${d.user.company || '—'}|${d.user.city || '—'}`);
    const maxDrivers = Math.max(1, ...cities.map((c) => c.list.length));
    const maxC = Math.max(1, ...companies.map((c) => c.list.length));
    const rowCells = (g) => [g.list.length, g.T.active, g.T.shifts, money(g.T.income), money(g.T.perShift), h('b', { class: tone(g.T.perHour) }, money2(g.T.perHour)), money2(g.T.perKm)];
    fill(root,
      pageHead(scope.city ? `Фирми в ${scope.city}` : 'Градове и фирми', `${scopeLabel()}: ${cities.length} ${cities.length === 1 ? 'град' : 'града'}, ${companies.length} ${companies.length === 1 ? 'фирма' : 'фирми'}`),
      h('div', { class: 'adm-picker' }, periodPicker(geoState, draw)),
      h('div', { class: 'kpis' },
        kpi('target', 'var(--text)', 'Най-много шофьори', cities[0]?.key || '—', cities[0] ? `${cities[0].list.length} шофьори` : ''),
        (() => { const b = [...cities].filter((c) => c.T.hours > 20).sort((a, b2) => b2.T.perHour - a.T.perHour)[0]; return kpi('clock', 'var(--text)', 'Най-доходен град', b?.key || '—', b ? `${money2(b.T.perHour)} чисто на час` : ''); })(),
        (() => { const b = [...companies].sort((a, b2) => b2.list.length - a.list.length)[0]; return kpi('car', 'var(--text)', 'Най-голяма фирма', b ? b.key.split('|')[0] : '—', b ? `${b.list.length} шофьори, ${b.city}` : ''); })(),
        (() => { const b = [...companies].filter((c) => c.T.hours > 20).sort((a, b2) => b2.T.perHour - a.T.perHour)[0]; return kpi('trophy', 'var(--text)', 'Най-доходна фирма', b ? b.key.split('|')[0] : '—', b ? `${money2(b.T.perHour)}/ч, ${b.city}` : ''); })()),
      h('section', { class: 'card', style: { marginTop: '14px' } }, cardTitle('target', 'По градове'),
        table(['Град', 'Дял', 'Шофьори', 'Активни', 'Смени', 'Приход', 'Приход/смяна', 'Чисто/час', 'Чисто/км'],
          cities.map((g) => ({ cells: [h('b', null, g.key), h('div', { class: 'mini-bar bar-cell' }, h('span', { style: { width: `${(g.list.length / maxDrivers) * 100}%` } })), ...rowCells(g)] })), { rightFrom: 2 })),
      h('section', { class: 'card' }, cardTitle('car', 'По фирми'),
        table(['Фирма', 'Град', 'Дял', 'Шофьори', 'Активни', 'Смени', 'Приход', 'Приход/смяна', 'Чисто/час', 'Чисто/км'],
          companies.map((g) => ({ cells: [h('b', null, g.key.split('|')[0]), g.city, h('div', { class: 'mini-bar bar-cell' }, h('span', { style: { width: `${(g.list.length / maxC) * 100}%`, background: '#F5A524' } })), ...rowCells(g)] })), { rightFrom: 3 })));
  };
  draw();
  return root;
}

// ---------- Шофьори ----------
function drivers() {
  const root = h('div');
  const today = todayStr();
  const mFrom = startOfMonth(today);
  const all = scoped().map((d) => ({ d, s: subState(d.user), st: periodStats(d, mFrom, endOfMonth(today)), last: lastShift(d) }));
  const listEl = h('div');
  const bulkEl = h('div');
  const drawBulk = () => fill(bulkEl, bulkBar(() => { drawList(); drawBulk(); }));
  function drawList() {
    const q = listState.q.trim().toLowerCase();
    const list = all.filter(({ d, s }) => (listState.filter === 'all' || s.key === listState.filter) &&
      (!q || [d.user.name, d.user.email, d.user.phone, d.user.company, d.user.city].join(' ').toLowerCase().includes(q)));
    const sorters = { net: (a, b) => b.st.net - a.st.net, name: (a, b) => a.d.user.name.localeCompare(b.d.user.name, 'bg'), recent: (a, b) => (b.last?.start || '').localeCompare(a.last?.start || ''), sub: (a, b) => a.d.user.subscription.validUntil.localeCompare(b.d.user.subscription.validUntil), reg: (a, b) => b.d.user.createdAt.localeCompare(a.d.user.createdAt) };
    list.sort(sorters[listState.sort]);
    const allOn = list.length > 0 && list.every(({ d }) => picked.has(d.user.id));
    fill(listEl, list.length ? table([h('input', { type: 'checkbox', class: 'pick', 'aria-label': 'Избери всички', checked: allOn, onclick: (e) => { e.stopPropagation(); list.forEach(({ d }) => (allOn ? picked.delete(d.user.id) : picked.add(d.user.id))); drawList(); drawBulk(); } }), 'Шофьор', 'Град, фирма и кола', 'Статус', 'Абонамент до', 'Последна смяна', 'Чисто (месец)'],
      list.map(({ d, s, st, last }) => ({
        href: '#/driver/' + d.user.id,
        cells: [
          h('input', { type: 'checkbox', class: 'pick', 'aria-label': `Избери ${d.user.name}`, checked: picked.has(d.user.id), onclick: (e) => { e.stopPropagation(); if (picked.has(d.user.id)) picked.delete(d.user.id); else picked.add(d.user.id); drawList(); drawBulk(); } }),
          h('span', { class: 'who-cell' }, h('b', null, d.user.name), h('span', null, d.user.email)),
          h('span', { class: 'who-cell' }, h('b', { style: { fontWeight: 600 } }, `${d.user.city}, ${d.user.company}`), h('span', null, `${CAR_TYPES[d.profile.carType]?.label}, ${FUELS[d.profile.fuel]?.label}`)),
          h('span', { class: cx('chip', s.cls) }, s.label),
          fmtDate(d.user.subscription.validUntil, { year: true }),
          last ? fmtDate(shiftDate(last)) : '—',
          h('b', { class: tone(st.net) }, money(st.net)),
        ],
      })), { rightFrom: 6 }) : empty('users', 'Няма намерени шофьори', 'Промени търсенето или филтъра.'),
      // на телефон: карти вместо широка таблица
      list.length > 0 && h('div', { class: 'drv-cards' }, list.map(({ d, s, st, last }) => h('a', { class: 'drv-card', href: '#/driver/' + d.user.id },
        h('span', { class: 'drv-av' }, d.user.name.split(' ').map((x) => x[0]).slice(0, 2).join('')),
        h('span', { class: 'drv-main' },
          h('b', null, d.user.name),
          h('span', null, `${d.user.city} · ${d.user.company}`),
          h('span', { class: 'drv-meta' }, h('span', { class: cx('chip', s.cls) }, s.label), last ? `смяна ${fmtDate(shiftDate(last))}` : 'без смени')),
        h('span', { class: 'drv-net' }, h('b', { class: tone(st.net) }, money(st.net)), h('small', null, 'този месец'))))));
  }
  const counts = (k) => all.filter((x) => k === 'all' || x.s.key === k).length;
  const drawAll = () => {
    fill(root,
      pageHead('Шофьори', `${scopeLabel()}: ${all.length} акаунта`, [h('button', { class: 'btn btn-page', onclick: () => go('/new') }, icon('plus', 18), 'Нов шофьор')]),
      segmented({ all: `Всички ${counts('all')}`, active: `Активни ${counts('active')}`, trial: `Пробни ${counts('trial')}`, expired: `Изтекли ${counts('expired')}`, blocked: `Спрени ${counts('blocked')}` }, listState.filter, (f) => { listState.filter = f; drawAll(); }, { small: true, wrap: true, page: true }),
      h('div', { class: 'adm-filters', style: { marginTop: '10px' } },
        h('input', { class: 'input', type: 'search', placeholder: 'Търси по име, имейл, телефон, фирма', value: listState.q, style: { minHeight: '44px' }, oninput: (e) => { listState.q = e.target.value; drawList(); } }),
        h('select', { class: 'input', style: { minHeight: '44px', padding: '8px 36px 8px 12px' }, onchange: (e) => { listState.sort = e.target.value; drawList(); } },
          [['net', 'По печалба'], ['name', 'По име'], ['recent', 'По последна смяна'], ['sub', 'По абонамент'], ['reg', 'По регистрация']].map(([v, l]) => h('option', { value: v, selected: listState.sort === v }, l)))),
      bulkEl,
      h('section', { class: 'card', style: { marginTop: '14px' } }, listEl));
    drawList(); drawBulk();
  };
  drawAll();
  return root;
}

// Масови действия върху отметнатите шофьори
const picked = new Set();
function bulkBar(redraw) {
  if (!picked.size) return null;
  const ids = [...picked];
  return h('div', { class: 'bulk' },
    h('b', null, `Избрани: ${ids.length}`),
    h('button', { class: 'btn btn-page btn-sm', onclick: () => { store.admin.extendMany(ids, 30); toast(`+30 дни за ${ids.length} шофьори`); } }, '+30 дни'),
    h('button', { class: 'btn btn-ghost act-v btn-sm', onclick: () => { msgState.title = ''; msgState.text = ''; toast('Напиши съобщението – ще отиде до избраните градове/фирми'); go('/messages'); } }, icon('bell', 16), 'Съобщение'),
    h('button', { class: 'btn btn-ghost act-ok btn-sm', onclick: () => { store.admin.setStatusMany(ids, 'active'); toast('Достъпът е пуснат'); } }, 'Пусни достъп'),
    h('button', { class: 'btn btn-ghost act-warn btn-sm', onclick: () => confirmSheet({ title: `Спиране на ${ids.length} шофьори?`, okLabel: 'Спри достъпа', danger: true, onOk: () => { store.admin.setStatusMany(ids, 'blocked'); toast('Достъпът е спрян'); } }) }, 'Спри достъп'),
    h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { picked.clear(); redraw(); } }, 'Изчисти'));
}

// Бележки за шофьора (вижда ги само админът) и лични данни (GDPR)
function notesCard(u) {
  const list = store.admin.notes(u.id);
  const ta = h('textarea', { class: 'input', rows: 2, placeholder: 'Напр. „Иска фактура на фирма“' });
  return h('section', { class: 'card' }, cardTitle('edit', 'Бележки (вижда ги само админът)'),
    h('div', { class: 'row gap' }, ta, h('button', { class: 'btn btn-page', onclick: () => { if (!ta.value.trim()) return; store.admin.addNote(u.id, ta.value); store.admin.log(u.id, 'note'); toast('Бележката е запазена'); } }, 'Добави')),
    list.length ? list.map((n) => h('div', { class: 'note-row' }, h('p', null, n.text), h('small', { class: 'muted' }, `${fmtDate(isoToDateStr(n.at), { year: true })} · ${n.by}`))) : h('p', { class: 'muted small', style: { marginTop: '10px' } }, 'Няма бележки.'));
}
function gdprCard(u) {
  return h('section', { class: 'card' }, cardTitle('shield', 'Лични данни (GDPR)'),
    h('p', { class: 'muted small' }, 'При поискване от шофьора: свали всичките му данни като файл или ги изтрий окончателно. Всяко действие се записва в „Контрол → Дневник“.'),
    h('div', { class: 'adm-actions' },
      h('button', { class: 'btn btn-ghost act-v', onclick: () => {
        const data = store.admin.exportDriver(u.id);
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        a.download = `profitaxi-danni-${u.name.replace(/\s+/g, '-')}.json`; a.click(); toast('Файлът с данните е свален');
      } }, icon('download', 18), 'Свали всички данни'),
      h('button', { class: 'btn btn-ghost act-del', onclick: () => confirmSheet({ title: 'Окончателно изтриване?', text: `Всички данни на ${u.name} ще бъдат изтрити завинаги и не могат да се върнат.`, okLabel: 'Изтрий завинаги', danger: true, onOk: () => { store.admin.log(u.id, 'delete'); store.admin.deleteDriver(u.id); toast('Данните са изтрити'); go('/drivers'); } }) }, icon('trash', 18), 'Изтрий окончателно')));
}
const viewedOnce = new Set();

// ---------- Детайли за шофьор ----------
function driverDetail(r) {
  const data = store.admin.driverData(r.param);
  if (!data.user) { setTimeout(() => go('/drivers')); return h('div'); }
  const u = data.user, p = data.profile, s = subState(u);
  if (!viewedOnce.has(u.id)) { viewedOnce.add(u.id); store.admin.log(u.id, 'view'); }
  const root = h('div');
  const statsBox = h('div');
  const drawStats = () => {
    const pr = periodRange(driverState);
    fill(statsBox, h('div', { class: 'adm-picker' }, periodPicker(driverState, drawStats)), h('div', { style: { maxWidth: '760px' } }, statsBody(data, pr.from, pr.to, driverState.unit, { admin: true })));
  };
  drawStats();
  const g = goalProgress(data);
  const life = periodStats(data, '2000-01-01', todayStr());
  const info = (label, value) => h('div', { class: 'info-row' }, h('span', { class: 'muted' }, label), h('span', null, value));
  const dispatchText = p.dispatch.mode === 'none' ? 'Няма' : `${money(p.dispatch.amount)} ${{ daily: 'на ден', weekly: 'на седмица', monthly: 'на месец' }[p.dispatch.mode]}`;
  const shifts = data.shifts.slice(0, 60);
  const costs = activeCosts(data.costs);
  const ds = daysSince(data);

  fill(root,
    h('a', { class: 'back', href: '#/drivers' }, icon('left', 20), 'Шофьори'),
    pageHead(u.name, `${u.email}${u.phone ? ', ' + u.phone : ''}`, [
      h('span', { class: cx('chip', s.cls) }, s.label),
      h('button', { class: 'btn btn-ghost', onclick: () => exportCsv(data, { from: '2000-01-01', to: todayStr() }) }, icon('download', 18), 'Excel')]),
    h('div', { class: 'kpis' },
      kpi('coins', 'var(--text)', 'Приход общо', money(life.income), `${life.shifts} смени`),
      kpi('wallet', 'var(--text)', 'Чисто общо', money(life.net), `от ${fmtDate(isoToDateStr(u.createdAt), { year: true })}`, tone(life.net)),
      kpi('target', 'var(--text)', 'Цел този месец', `${Math.round(g.pct * 100)}%`, `${money(g.net)} от ${money(p.monthlyGoal)}`),
      kpi('clock', 'var(--text)', 'Последна смяна', ds == null ? '—' : ds === 0 ? 'днес' : ds === 1 ? 'вчера' : `преди ${ds} дни`, data.shifts.some((x) => !x.end) ? 'в момента кара' : '')),
    h('div', { class: 'adm-grid two' },
      h('section', { class: 'card' },
        cardTitle('user', 'Профил', h('button', { class: 'chip page', onclick: () => editDriver(u) }, icon('edit', 14), 'Град и фирма')),
        info('Град', u.city || '—'),
        info('Фирма', u.company || '—'),
        info('Регистриран', fmtDate(isoToDateStr(u.createdAt), { year: true })),
        info('Последен вход', u.lastLoginAt ? `${fmtDate(isoToDateStr(u.lastLoginAt), { year: true })}, ${new Date(u.lastLoginAt).toTimeString().slice(0, 5)}` : '—'),
        info('Кола', `${CAR_TYPES[p.carType]?.label}${p.carType === 'leasing' ? `, ${money(p.leasing.amount)}/мес` : p.carType === 'rent' ? `, ${money(p.rent.amount)} ${PERIODS[p.rent.period].label}` : ''}`),
        info('Гориво', FUELS[p.fuel]?.label),
        info('Ефир', dispatchText),
        info('Дели колата', p.sharePct < 100 ? `да, ${p.sharePct}%` : 'не'),
        info('Известия', p.notify ? 'включени' : 'изключени'),
        INVITES_ON && info('Код за покана', `${u.refCode || '—'}, поканени ${store.admin.drivers().filter((x) => x.referredBy === u.id).length}${u.refMonths ? `, спечелени ${u.refMonths} мес.` : ''}`),
        p.car?.plate && info('Кола', `${p.car.model || ''} ${p.car.plate}${p.car.code ? `, код ${p.car.code}` : ''}`.trim())),
      h('section', { class: 'card' },
        cardTitle('receipt', 'Достъп и абонамент'),
        info('План', u.subscription.plan === 'trial' ? 'Пробен период' : 'Платен'),
        info('Валиден до', `${fmtDate(u.subscription.validUntil, { year: true })}${s.left != null ? ` (${s.left >= 0 ? `още ${s.left} дни` : `изтекъл преди ${-s.left} дни`})` : ''}`),
        u.subscription.paidSince && info('Платен от', fmtDate(u.subscription.paidSince, { year: true })),
        h('div', { class: 'act-label' }, 'Абонамент'),
        h('div', { class: 'adm-actions' },
          h('button', { class: 'btn btn-page', onclick: () => { store.admin.extend(u.id, 30); toast('Удължен с 30 дни'); } }, '+30 дни'),
          h('button', { class: 'btn btn-ghost act-v', onclick: () => { store.admin.extend(u.id, 365); toast('Удължен с 1 година'); } }, '+1 година'),
          h('button', { class: 'btn btn-ghost act-v', onclick: () => setDate(u) }, icon('calendar', 18), 'Дата')),
        h('div', { class: 'act-label' }, 'Достъп'),
        h('div', { class: 'adm-actions' },
          u.status === 'blocked'
            ? h('button', { class: 'btn btn-ghost act-ok', onclick: () => { store.admin.setStatus(u.id, 'active'); toast('Достъпът е пуснат'); } }, icon('check', 18), 'Пусни достъпа')
            : h('button', { class: 'btn btn-ghost act-warn', onclick: () => confirmSheet({ title: `Спиране на ${u.name}?`, text: 'Шофьорът няма да може да влиза, докато не пуснеш достъпа отново. Данните остават.', okLabel: 'Спри достъпа', danger: true, onOk: () => { store.admin.setStatus(u.id, 'blocked'); toast('Достъпът е спрян'); } }) }, icon('lock', 18), 'Спри достъпа'),
          h('button', { class: 'btn btn-ghost act-n', onclick: () => resetPw(u) }, icon('key', 18), 'Нова парола'),
          h('button', { class: 'btn btn-ghost act-del', onclick: () => confirmSheet({ title: 'Изтриване на акаунта?', text: `Всички данни на ${u.name} ще бъдат изтрити завинаги.`, okLabel: 'Изтрий', danger: true, onOk: () => { store.admin.deleteDriver(u.id); toast('Акаунтът е изтрит'); go('/drivers'); } }) }, icon('trash', 18), 'Изтрий')))),
    h('div', { class: 'adm-grid two' }, notesCard(u), gdprCard(u)),
    h('h2', { class: 'section-title' }, 'Статистика'),
    statsBox,
    h('h2', { class: 'section-title' }, 'Смени'),
    h('section', { class: 'card' }, table(['Дата', 'Време', 'Часове', 'Км', 'Кеш', 'Карта', 'Прил.', 'Бакшиш', 'Разходи', 'Печалба'],
      shifts.map((x) => ({ cells: [
        fmtDate(shiftDate(x), { year: true }), `${new Date(x.start).toTimeString().slice(0, 5)} – ${x.end ? new Date(x.end).toTimeString().slice(0, 5) : 'кара'}`,
        fmtDuration(shiftHours(x)), shiftKm(x), money(x.income.cash), money(x.income.card), money(x.income.app), money(x.income.tips), money(shiftExpenses(x)),
        h('b', { class: tone(shiftIncome(x) - shiftExpenses(x)) }, money(shiftIncome(x) - shiftExpenses(x)))] })), { rightFrom: 2 }),
      data.shifts.length > 60 && h('p', { class: 'muted small', style: { marginTop: '10px' } }, `Показани са последните 60 от ${data.shifts.length}. Всички са в Excel файла.`)),
    h('h2', { class: 'section-title' }, 'Постоянни разходи'),
    h('section', { class: 'card' }, table(['Разход', 'Сума', 'Период', 'На месец', 'Следващо плащане', 'Плащания'],
      costs.map((c) => ({ cells: [c.name, money(c.amount, c.amount % 1 ? 2 : 0), PERIODS[c.period]?.short || '', money(costMonthly(c, p)), c.dueDate ? fmtDate(c.dueDate, { year: true }) : '—', (c.payments || []).length] })))));
  return root;
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
    return h('div', { class: 'form' },
      sheetHead('Валиден до', close),
      field('Дата', inp),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'План'), segBox),
      h('button', { class: 'btn btn-page btn-lg', onclick: () => { if (!inp.value) return; store.admin.setSubscription(u.id, inp.value, plan.v); close(); toast('Запазено'); } }, 'Запази'));
  });
}
function resetPw(u) {
  const gen = () => Math.random().toString(36).slice(2, 6) + Math.floor(1000 + Math.random() * 9000);
  openSheet((close) => {
    const inp = h('input', { class: 'input', value: gen() });
    return h('div', { class: 'form' },
      sheetHead('Нова парола', close, `За ${u.name}`),
      field('Парола', inp, 'Изпрати я на шофьора. Той може да я смени от профила си.'),
      h('button', { class: 'btn btn-page btn-lg', onclick: () => { if (inp.value.length < 6) { toast('Поне 6 символа', 'err'); return; } store.admin.resetPassword(u.id, inp.value); close(); toast('Паролата е сменена'); } }, 'Запази'));
  });
}

// ---------- Абонаменти ----------
function subs() {
  const all = scoped();
  const today = todayStr();
  const price = store.admin.settings().price || 0;
  const st = all.map((d) => ({ d, s: subState(d.user) }));
  const count = (k) => st.filter((x) => x.s.key === k).length;
  const paidEver = all.filter((d) => d.user.subscription.paidSince).length;
  const trialsDone = all.filter((d) => d.user.subscription.paidSince || subState(d.user).key === 'expired').length;
  const expiring = st.filter((x) => (x.s.key === 'active' || x.s.key === 'trial') && x.s.left <= 14).sort((a, b) => a.s.left - b.s.left);
  const expired = st.filter((x) => x.s.key === 'expired').sort((a, b) => b.s.left - a.s.left);
  // Регистрации по месеци (последните 12)
  const months = [];
  for (let i = 11; i >= 0; i--) { const d = parseDate(startOfMonth(today)); d.setMonth(d.getMonth() - i); months.push(dateStr(d).slice(0, 7)); }
  const regs = months.map((m) => ({ label: MONTHS_SHORT[Number(m.slice(5)) - 1], value: all.filter((d) => isoToDateStr(d.user.createdAt).slice(0, 7) === m).length }));
  const subRow = ({ d, s }) => ({ href: '#/driver/' + d.user.id, cells: [h('span', { class: 'who-cell' }, h('b', null, d.user.name), h('span', null, `${d.user.city}, ${d.user.company}`)), h('span', { class: cx('chip', s.cls) }, s.label), fmtDate(d.user.subscription.validUntil, { year: true }), s.left == null ? '—' : s.left === 0 ? 'днес' : s.left === 1 ? '1 ден' : s.left > 0 ? `${s.left} дни` : `преди ${-s.left} дни`] });
  return h('div', null,
    pageHead('Абонаменти', `${scopeLabel()}: плащания, пробни периоди и изтичащи достъпи`),
    h('div', { class: 'kpis' },
      kpi('receipt', 'var(--text)', 'Месечни приходи (MRR)', money(count('active') * price), `годишно ${money(count('active') * price * 12)}`),
      kpi('check', 'var(--text)', 'Платени', String(count('active')), `от ${all.length} акаунта`),
      kpi('clock', 'var(--text)', 'Пробни', String(count('trial')), 'в момента'),
      kpi('trophy', 'var(--text)', 'От пробен към платен', pct(paidEver, trialsDone), 'конверсия'),
      kpi('alert', 'var(--text)', 'Изтекли', String(count('expired')), 'могат да бъдат върнати'),
      kpi('lock', 'var(--text)', 'Спрени', String(count('blocked')), 'ръчно спрени'),
      kpi('calendar', 'var(--text)', 'Изтичат до 14 дни', String(expiring.length), ''),
      kpi('users', 'var(--text)', 'Нови този месец', String(regs[regs.length - 1].value), `миналия: ${regs[regs.length - 2].value}`)),
    h('section', { class: 'card' }, cardTitle('chart', 'Регистрации по месеци'), colBars(regs)),
    h('div', { class: 'adm-grid two' },
      h('section', { class: 'card' }, cardTitle('bell', 'Изтичат скоро'), table(['Шофьор', 'Статус', 'Валиден до', 'Остават'], expiring.map(subRow), { rightFrom: 2 })),
      h('section', { class: 'card' }, cardTitle('alert', 'Изтекли'), table(['Шофьор', 'Статус', 'Валиден до', 'Изтекъл'], expired.map(subRow), { rightFrom: 2 }))));
}

// ---------- Отчети: всички подробни страници на едно място ----------
function reports() {
  const all = scoped();
  const count = (k) => all.filter((d) => subState(d.user).key === k).length;
  const link = (href, ic, title, sub) => h('a', { class: 'big-link', href }, h('span', { class: 'bl-ic' }, icon(ic, 22)), h('span', { class: 'grow' }, h('b', null, title), h('span', null, sub)), icon('right', 18));
  return h('div', null,
    pageHead('Отчети', `${scopeLabel()}: всичко подробно, разделено по теми`),
    h('div', { class: 'big-links adm-reports' },
      link('#/overview?charts', 'chart', 'Графики и подробни числа', 'Чисто на час и км, приход по дни, видове приходи и разходи'),
      link('#/geo', 'target', 'Градове и фирми', 'Сравнение между градове и таксиметрови фирми'),
      link('#/market', 'coins', 'Ефир, наеми и работа', 'Колко струва ефирът и наемът, кога се работи'),
      link('#/subs', 'receipt', 'Абонаменти', `${count('active')} платени, ${count('trial')} пробни, ${count('expired')} изтекли`)));
}

// ---------- Нов шофьор ----------
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

// ---------- Настройки ----------
function settings() {
  const s = store.admin.settings();
  const days = h('input', { class: 'input', type: 'number', min: 0, max: 90, value: s.trialDays });
  const price = h('input', { class: 'input', inputmode: 'decimal', value: String(s.price ?? 3.99).replace('.', ',') });
  return h('div', { style: { maxWidth: '640px' } },
    pageHead('Настройки', 'Общи настройки на услугата'),
    h('section', { class: 'card form' },
      field('Пробен период при регистрация (дни)', days, '0 = без пробен период'),
      field('Цена на месечния абонамент (€)', price, 'Използва се за сметката на месечните приходи (MRR)'),
      h('button', { class: 'btn btn-page btn-lg', onclick: () => { store.admin.saveSettings({ trialDays: Math.max(0, Math.min(90, Number(days.value) || 0)), price: Math.max(0, parseFloat(price.value.replace(',', '.')) || 0) }); toast('Запазено'); } }, 'Запази')),
    h('section', { class: 'card' },
      cardTitle('alert', 'Демо данни'),
      h('p', { class: 'muted small', style: { marginBottom: '12px' } }, 'Връща демо шофьорите и смените в началното им състояние. Изтрива всичко въведено на това устройство.'),
      h('button', { class: 'btn btn-ghost', onclick: () => confirmSheet({ title: 'Нулиране на демо данните?', okLabel: 'Нулирай', danger: true, onOk: () => { store.resetDemo(); location.reload(); } }) }, 'Нулирай демо данните')));
}


// ======================================================================
//   НОВИТЕ СТРАНИЦИ: Контрол, Съобщения, Партньори, Растеж, Статистика, Развитие
// ======================================================================
const card = (ic, title, ...kids) => h('section', { class: 'card adm-card' }, cardTitle(ic, title), ...kids);
const note = (text) => h('p', { class: 'muted small adm-note' }, text);
const allDrivers = () => store.admin.allData();
const companiesOf = (all) => [...new Set(all.map((d) => d.user.company).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'bg'));
const citiesOf = (all) => [...new Set(all.map((d) => d.user.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'bg'));
const sel = (opts, value, onchange, placeholder) => h('select', { class: 'input', onchange: (e) => onchange(e.target.value) },
  placeholder != null && h('option', { value: '' }, placeholder), opts.map((o) => h('option', { value: o, selected: o === value }, o)));
const plateKey = (p) => String(p || '').toUpperCase().replace(/[\s-]/g, '');
const emailBase = (e) => String(e || '').toLowerCase().split('@')[0].replace(/[\d._-]+/g, '');
// подобен имейл = една и съща основа от поне 8 букви (напр. ivan.petrov1 и ivanpetrov2), за да не са еднакви само по малко име

// ---------- Дублирани акаунти ----------
// Същият телефон, номер на кола, код на кола във фирмата или име + град в два и повече профила.
// Не спираме никого – само показваме, за да провериш.
function duplicates(all = allDrivers()) {
  const groups = [];
  const by = (reason, keyFn) => {
    const m = {};
    all.forEach((d) => { const k = keyFn(d); if (k) (m[k] ||= []).push(d); });
    Object.entries(m).filter(([, l]) => l.length > 1).forEach(([k, l]) => groups.push({ key: `dup:${reason}:${k}:${l.map((d) => d.user.id).sort().join(',')}`, reason, value: k, list: l }));
  };
  by('Телефон', (d) => store.normPhone(d.user.phone));
  by('Номер на колата', (d) => plateKey(d.profile.car?.plate));
  by('Код на колата във фирмата', (d) => (d.profile.car?.code ? `${d.user.company} · ${d.profile.car.code}` : ''));
  by('Име и град', (d) => `${d.user.name.trim().toLowerCase()} · ${d.user.city}`);
  by('Подобен имейл', (d) => { const b = emailBase(d.user.email); return b.length >= 8 ? b : ''; });
  return groups;
}
// ---------- Известия за админа ----------
function allAlerts() {
  const all = allDrivers(); const out = [];
  duplicates(all).forEach((g) => out.push({ key: g.key, ic: 'users', cls: 'bad', title: `Възможен дубликат: ${g.reason}`, text: `${g.value} – ${g.list.map((d) => d.user.name).join(', ')}`, href: '#/control' }));
  all.forEach((d) => {
    const s = subState(d.user);
    if (s.key === 'trial' && s.left <= 3 && s.left >= 0) out.push({ key: `trial:${d.user.id}:${d.user.subscription.validUntil}`, ic: 'clock', cls: 'warn', title: 'Пробният период изтича', text: `${d.user.name} – след ${s.left} дни`, href: `#/driver/${d.user.id}` });
    if (s.key === 'expired' && s.left >= -7) out.push({ key: `exp:${d.user.id}:${d.user.subscription.validUntil}`, ic: 'alert', cls: 'bad', title: 'Абонаментът изтече', text: d.user.name, href: `#/driver/${d.user.id}` });
    if ((Date.now() - new Date(d.user.createdAt)) / 86400000 < 7) out.push({ key: `new:${d.user.id}`, ic: 'plus', cls: 'good', title: 'Нов шофьор', text: `${d.user.name}, ${d.user.city}`, href: `#/driver/${d.user.id}` });
  });
  store.admin.nps().filter((n) => n.score <= 6 && (Date.now() - new Date(n.at)) / 86400000 < 30).forEach((n) => out.push({ key: `nps:${n.id}`, ic: 'heart', cls: 'warn', title: `Недоволен шофьор (оценка ${n.score})`, text: n.comment || 'без коментар', href: '#/dev' }));
  store.admin.ideas().filter((i) => i.status === 'new').forEach((i) => out.push({ key: `idea:${i.id}`, ic: 'sparkle', cls: 'good', title: 'Ново предложение', text: i.text, href: '#/dev' }));
  return out;
}
function newAlerts() { const seen = new Set(store.admin.alertsSeen()); return allAlerts().filter((a) => !seen.has(a.key)); }
const alertRow = (a) => h('a', { class: 'alert-row', href: a.href }, h('span', { class: cx('al-ic', a.cls) }, icon(a.ic, 18)), h('span', { class: 'grow' }, h('b', null, a.title), h('small', null, a.text)), icon('right', 16));
function alertsPreview() {
  const n = newAlerts(); if (!n.length) return null;
  return card('bell', `Нови известия (${n.length})`, n.slice(0, 4).map(alertRow), h('a', { class: 'btn btn-ghost btn-block', href: '#/control', style: { marginTop: '10px' } }, 'Всички известия'));
}

// ---------- КОНТРОЛ: известия, дубликати, дневник, поверителност ----------
function control() {
  const all = allDrivers(); const al = allAlerts(); const seen = new Set(store.admin.alertsSeen());
  const fresh = al.filter((a) => !seen.has(a.key)); const dups = duplicates(all); const log = store.admin.accessLog().slice(0, 30);
  return h('div', null,
    pageHead('Контрол', 'Известия, дублирани акаунти и кой какво е гледал'),
    h('div', { class: 'adm-grid two' },
      card('bell', `Известия${fresh.length ? ` (${fresh.length} нови)` : ''}`,
        al.length ? h('div', null, al.slice(0, 40).map((a) => h('div', { class: cx('al-wrap', !seen.has(a.key) && 'new') }, alertRow(a))))
          : note('Няма известия.'),
        fresh.length > 0 && h('button', { class: 'btn btn-ghost btn-block', style: { marginTop: '10px' }, onclick: () => { store.admin.markAlertsSeen(fresh.map((a) => a.key)); toast('Отбелязани като видени'); } }, icon('check', 18), 'Маркирай всички като видени')),
      card('users', `Дублирани акаунти (${dups.length})`,
        note('Профили с един и същ телефон, номер или код на кола, име и град или подобен имейл. Нищо не се спира автоматично – провери и реши.'),
        dups.length ? dups.map((g) => h('div', { class: 'dup' },
          h('div', { class: 'dup-head' }, h('span', { class: 'chip bad' }, g.reason), h('b', null, g.value)),
          g.list.map((d) => h('a', { class: 'dup-row', href: `#/driver/${d.user.id}` }, h('span', { class: 'grow' }, h('b', null, d.user.name), h('small', null, `${d.user.email} · ${d.user.phone || 'без телефон'} · ${d.user.city}`)),
            h('span', { class: cx('chip', subState(d.user).cls) }, subState(d.user).label))))) : note('Няма открити дубликати.'))),
    h('div', { class: 'adm-grid two' },
      card('eye', 'Дневник на достъпа', note('Кой от админите е отварял, свалял или изтривал данни на шофьор.'),
        log.length ? table(['Кога', 'Админ', 'Шофьор', 'Действие'], log.map((l) => ({ cells: [fmtDate(isoToDateStr(l.at)) + ' ' + l.at.slice(11, 16), l.by, l.name, { view: 'Отвори профила', export: 'Свали данните', delete: 'Изтри', note: 'Бележка' }[l.action] || l.action] })), { rightFrom: 9 }) : note('Още няма записи.')),
      card('shield', 'Поверителност (GDPR)',
        h('ul', { class: 'adm-list' },
          h('li', null, 'В профила на всеки шофьор има „Свали всички данни“ (файл за шофьора при поискване) и „Изтрий окончателно“.'),
          h('li', null, 'Всяко отваряне, сваляне и изтриване се записва в дневника вляво.'),
          h('li', null, 'Телефонът се потвърждава с SMS при регистрация – един телефон, един акаунт.'),
          h('li', null, 'Отчетите за фирмите са само обобщени – без имена и лични данни.')))));
}

// ---------- СЪОБЩЕНИЯ до шофьорите ----------
const msgState = { title: '', text: '', city: '', company: '' };
function messagesPage() {
  const all = allDrivers(); const list = store.admin.messages();
  const reach = (t) => all.filter((d) => (!t || ((!t.city || d.user.city === t.city) && (!t.company || d.user.company === t.company)))).length;
  const root = h('div');
  const title = h('input', { class: 'input', value: msgState.title, maxlength: 80, placeholder: 'Заглавие', oninput: (e) => { msgState.title = e.target.value; } });
  const text = h('textarea', { class: 'input', rows: 4, maxlength: 400, placeholder: 'Текст на съобщението', oninput: (e) => { msgState.text = e.target.value; } }); text.value = msgState.text;
  const target = () => (msgState.city || msgState.company ? { city: msgState.city || null, company: msgState.company || null } : null);
  const comps = companiesOf(all.filter((d) => !msgState.city || d.user.city === msgState.city));
  return h('div', null,
    pageHead('Съобщения', 'Съобщение до всички, до град или до фирма. Излиза горе на „Днес“ в приложението.'),
    h('div', { class: 'adm-grid two' },
      card('bell', 'Ново съобщение',
        h('div', { class: 'form' }, field('Заглавие', title), field('Текст', text),
          h('div', { class: 'grid2' },
            field('Град', sel(citiesOf(all), msgState.city, (v) => { msgState.city = v; msgState.company = ''; render(); }, 'Всички градове')),
            field('Фирма', sel(comps, msgState.company, (v) => { msgState.company = v; render(); }, 'Всички фирми'))),
          h('p', { class: 'muted small' }, `Ще го видят ${reach(target())} шофьори.`),
          h('button', { class: 'btn btn-page btn-lg', onclick: () => {
            if (!msgState.title.trim() || !msgState.text.trim()) { toast('Напиши заглавие и текст', 'err'); return; }
            store.admin.sendMessage({ title: msgState.title, text: msgState.text, target: target() });
            Object.assign(msgState, { title: '', text: '' }); toast('Съобщението е изпратено');
          } }, icon('bell', 18), 'Изпрати'))),
      card('list', `Изпратени (${list.length})`,
        list.length ? list.map((m) => { const n = reach(m.target); return h('div', { class: 'sent' },
          h('div', { class: 'grow' }, h('b', null, m.title), h('p', null, m.text),
            h('small', { class: 'muted' }, `${fmtDate(isoToDateStr(m.at))} · ${m.target ? [m.target.city, m.target.company].filter(Boolean).join(', ') : 'до всички'} · прочетено от ${m.readBy.length} от ${n}`)),
          h('button', { class: 'icon-btn', 'aria-label': 'Изтрий', onclick: () => confirmSheet({ title: 'Изтриване на съобщението?', okLabel: 'Изтрий', danger: true, onOk: () => store.admin.deleteMessage(m.id) }) }, icon('trash', 18))); })
          : note('Още няма изпратени съобщения.'))));
}

// ---------- ПАРТНЬОРИ: кодове за достъп и месечен отчет за фирма ----------
const repState = { company: '', month: todayStr().slice(0, 7) };
function partners() {
  const all = allDrivers(); const codes = store.admin.codes(); const comps = companiesOf(all);
  if (!repState.company) repState.company = comps.includes('ONE Такси – 032 22 22') ? 'ONE Такси – 032 22 22' : comps[0] || '';
  const f = { code: h('input', { class: 'input', placeholder: 'напр. YELLOW2026', style: { textTransform: 'uppercase' } }), company: comps[0] || '', limit: h('input', { class: 'input', type: 'number', min: 0, value: 100 }), expires: h('input', { class: 'input', type: 'date', value: addDays(todayStr(), 180) }) };
  const compSel = sel(comps, f.company, (v) => { f.company = v; });
  return h('div', null,
    pageHead('Партньори', 'Кодове за достъп за фирмите и месечен отчет за всяка фирма'),
    h('div', { class: 'adm-grid two' },
      card('key', 'Кодове за достъп',
        note('С код от фирмата шофьорите се регистрират в изданието на партньора (напр. One Taxi). Можеш да спреш код по всяко време.'),
        codes.length ? codes.map((c) => h('div', { class: 'code-row' },
          h('div', { class: 'grow' }, h('b', { class: 'code' }, c.code), h('small', null, `${c.company} · ползван ${c.uses}${c.limit ? ` от ${c.limit}` : ''} · ${c.expires ? `до ${fmtDate(c.expires, { year: true })}` : 'без срок'}`)),
          h('button', { class: cx('btn btn-sm', c.active ? 'btn-ghost act-ok' : 'btn-ghost act-warn'), onclick: () => store.admin.toggleCode(c.code) }, c.active ? 'Активен' : 'Спрян'),
          h('button', { class: 'icon-btn', 'aria-label': 'Изтрий кода', onclick: () => confirmSheet({ title: `Изтриване на ${c.code}?`, okLabel: 'Изтрий', danger: true, onOk: () => store.admin.deleteCode(c.code) }) }, icon('trash', 16)))) : note('Няма кодове.'),
        h('div', { class: 'form', style: { marginTop: '14px' } },
          h('div', { class: 'grid2' }, field('Нов код', f.code), field('Фирма', compSel)),
          h('div', { class: 'grid2' }, field('Максимум регистрации', f.limit, '0 = без лимит'), field('Валиден до', f.expires)),
          h('button', { class: 'btn btn-page', onclick: () => {
            const city = all.find((d) => d.user.company === f.company)?.user.city || '';
            const r = store.admin.saveCode({ code: f.code.value, company: f.company, city, limit: Number(f.limit.value) || 0, expires: f.expires.value || null });
            if (r.error) toast(r.error, 'err'); else toast('Кодът е създаден');
          } }, icon('plus', 18), 'Създай код'))),
      companyReport(all, comps)));
}
function companyReport(all, comps) {
  const [y, m] = repState.month.split('-').map(Number);
  const from = `${repState.month}-01`, to = endOfMonth(from);
  const list = all.filter((d) => d.user.company === repState.company);
  const rows = list.map((d) => ({ d, st: periodStats(d, from, to) }));
  const T = aggregate(rows);
  const shifts = list.flatMap((d) => d.shifts.filter((s) => s.end && shiftDate(s) >= from && shiftDate(s) <= to));
  const ti = timeInsights(shifts);
  const byWd = Array(7).fill(0); shifts.forEach((s) => { byWd[(new Date(s.start).getDay() + 6) % 7] += shiftIncome(s); });
  const bestWd = byWd.indexOf(Math.max(...byWd));
  const cars = {}; list.forEach((d) => { const k = CAR_TYPES[d.profile.carType]?.label || '—'; cars[k] = (cars[k] || 0) + 1; });
  const month = h('input', { class: 'input', type: 'month', value: repState.month, max: todayStr().slice(0, 7), onchange: (e) => { repState.month = e.target.value || repState.month; render(); } });
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
    h('button', { class: 'btn btn-ghost no-print', style: { marginTop: '12px' }, onclick: () => { document.body.classList.add('print-report'); window.print(); setTimeout(() => document.body.classList.remove('print-report'), 500); } }, icon('print', 18), 'Свали като PDF'));
}
const repCell = (label, value) => h('div', { class: 'rep-cell' }, h('span', null, label), h('b', null, value));

// ---------- РАСТЕЖ: фуния, задържане, стойност на клиент, седмичен отчет ----------
function growth() {
  const all = scoped(); const price = store.admin.settings().price || 0;
  const n = all.length;
  const onboarded = all.filter((d) => d.profile.onboarded).length;
  const first = all.filter((d) => d.shifts.some((s) => s.end)).length;
  const five = all.filter((d) => d.shifts.filter((s) => s.end).length >= 5).length;
  const paid = all.filter((d) => d.user.subscription?.paidSince).length;
  const steps = [['Регистрирали се', n], ['Настроили колата', onboarded], ['Първа смяна', first], ['5+ смени', five], ['Платили', paid]];
  // Задържане: шофьорите по седмица на регистрация и дали пишат смени след 1, 2, 4, 8 седмици
  const weekStart = (iso) => startOfWeek(isoToDateStr(iso));
  const cohorts = {}; all.forEach((d) => { (cohorts[weekStart(d.user.createdAt)] ||= []).push(d); });
  const weeks = Object.keys(cohorts).sort().slice(-10);
  const activeIn = (d, w) => { const from = addDays(weekStart(d.user.createdAt), w * 7), to = addDays(from, 6); return from <= todayStr() ? d.shifts.some((s) => s.end && shiftDate(s) >= from && shiftDate(s) <= to) : null; };
  const W = [1, 2, 4, 8];
  // Стойност на клиент: средно колко месеца плаща един шофьор
  const paidUsers = all.filter((d) => d.user.subscription?.paidSince);
  const months = paidUsers.map((d) => Math.max(0, (parseDate(d.user.subscription.validUntil < todayStr() ? d.user.subscription.validUntil : todayStr()) - parseDate(d.user.subscription.paidSince)) / (30.4 * 86400000)));
  const avgM = months.length ? months.reduce((a, b) => a + b, 0) / months.length : 0;
  const churned = paidUsers.filter((d) => d.user.subscription.validUntil < todayStr()).length;
  const churnRate = paidUsers.length ? churned / paidUsers.length : 0;
  const lifetime = churnRate > 0 ? Math.max(avgM, 1 / Math.max(churnRate / Math.max(avgM, 1), 0.02)) : Math.max(avgM, 12);
  return h('div', null,
    pageHead('Растеж', `${scopeLabel()}: откъде се губят шофьори и колко ти носи един шофьор`),
    card('chart', 'Фуния на регистрациите',
      note('Колко шофьори стигат до всяка стъпка. Най-голямото падане показва какво да оправиш.'),
      h('div', { class: 'funnel' }, steps.map(([label, v], i) => h('div', { class: 'fn-row' },
        h('span', { class: 'fn-label' }, label),
        h('div', { class: 'fn-bar' }, h('i', { style: { width: `${n ? (v / n) * 100 : 0}%` } }), h('b', null, `${v} · ${pct(v, n)}`)),
        i > 0 && h('small', { class: 'fn-drop' }, steps[i - 1][1] ? `−${Math.round(100 - (v / steps[i - 1][1]) * 100)}% от предната стъпка` : ''))))),
    card('users', 'Задържане по седмица на регистрация',
      note('Какъв дял от записалите се през дадена седмица още пишат смени след 1, 2, 4 и 8 седмици.'),
      table(['Седмица', 'Записали се', ...W.map((w) => `След ${w} седм.`)], weeks.map((wk) => { const list = cohorts[wk]; return { cells: [fmtDate(wk), String(list.length), ...W.map((w) => {
        const vals = list.map((d) => activeIn(d, w)); if (vals.some((v) => v === null)) return h('span', { class: 'muted' }, '—');
        const p = vals.filter(Boolean).length / list.length; return h('span', { class: 'ret', style: { '--p': p } }, `${Math.round(p * 100)}%`); })] }; }), { rightFrom: 1 })),
    h('div', { class: 'adm-grid two' },
      card('coins', 'Стойност на един клиент',
        h('div', { class: 'big-nums two' },
          bigNum('Средно плаща', `${fmtNum1(avgM)} мес.`, 'досега, на платил шофьор'),
          bigNum('Отказали се', pct(churned, paidUsers.length), `${churned} от ${paidUsers.length} платили`),
          bigNum('Очаквано време като клиент', `${fmtNum1(lifetime)} мес.`, 'при сегашния темп'),
          bigNum('Стойност на клиент', money(lifetime * price, 2), `при ${money(price, 2)} на месец`)),
        note('Това е горната граница колко можеш да даваш за реклама, за да спечелиш един нов шофьор.')),
      weeklyReport(all)));
}
function weeklyReport(all) {
  const to = todayStr(), from = addDays(to, -6), pf = addDays(from, -7), pt = addDays(from, -1);
  const T = aggregate(all.map((d) => ({ d, st: periodStats(d, from, to) }))), P = aggregate(all.map((d) => ({ d, st: periodStats(d, pf, pt) })));
  const newD = all.filter((d) => isoToDateStr(d.user.createdAt) >= from).length;
  const alerts = newAlerts().length;
  const lines = [`ProfiTaxi – седмицата ${fmtDate(from)} – ${fmtDate(to)}`, `Нови шофьори: ${newD}`, `Активни: ${T.active} (предната седмица ${P.active})`, `Смени: ${T.shifts} (предната ${P.shifts})`,
    `Оборот на шофьорите: ${money(T.income)}`, `Чисто на час: ${money2(T.perHour)}`, `Нови известия за проверка: ${alerts}`];
  return card('doc', 'Седмичен отчет',
    note('Обобщение на седмицата. Ще идва всеки понеделник по имейл, щом свържем сървъра; дотогава – тук.'),
    h('pre', { class: 'weekly' }, lines.join('\n')),
    h('button', { class: 'btn btn-ghost', onclick: () => { navigator.clipboard?.writeText(lines.join('\n')); toast('Копирано'); } }, icon('copy', 18), 'Копирай'));
}

// ---------- СТАТИСТИКА: средният шофьор по град, сезонност, коли и гориво ----------
const statState = { days: 30 };
function statsPage() {
  const all = scoped(); const to = todayStr(), from = addDays(to, -(statState.days - 1));
  const per = all.map((d) => ({ d, st: periodStats(d, from, to) })).filter((x) => x.st.shifts > 0);
  const avgRow = (list) => { const T = aggregate(list); const n = list.length || 1; return { n: list.length, perHour: T.perHour, perShift: T.perShift, hours: T.shifts ? T.hours / T.shifts : 0, km: T.shifts ? T.km / T.shifts : 0, net: T.net / n, income: T.income / n }; };
  const byCity = {}; per.forEach((x) => { (byCity[x.d.user.city] ||= []).push(x); });
  const cityRows = Object.entries(byCity).map(([c, l]) => [c, avgRow(l)]).sort((a, b) => b[1].n - a[1].n);
  const group = (keyFn, labelFn) => { const m = {}; per.forEach((x) => { (m[keyFn(x.d)] ||= []).push(x); }); return Object.entries(m).map(([k, l]) => [labelFn(k), avgRow(l)]).sort((a, b) => b[1].perHour - a[1].perHour); };
  // Сезонност: оборот по месеци (всички данни) и по дни от седмицата
  const byMonth = Array(12).fill(0).map(() => ({ inc: 0, n: 0 })); const byWd = Array(7).fill(0).map(() => ({ inc: 0, n: 0 }));
  all.forEach((d) => d.shifts.forEach((s) => { if (!s.end) return; const dt = new Date(s.start); const v = shiftIncome(s); byMonth[dt.getMonth()].inc += v; byMonth[dt.getMonth()].n++; byWd[(dt.getDay() + 6) % 7].inc += v; byWd[(dt.getDay() + 6) % 7].n++; }));
  const seasonPts = byMonth.map((x, i) => ({ label: MONTHS_SHORT[i], net: x.n ? x.inc / x.n : 0 }));
  const wdPts = byWd.map((x, i) => ({ label: WD_SHORT[i], net: x.n ? x.inc / x.n : 0 }));
  const avgTable = (rows, first) => table([first, 'Шофьори', 'Чисто/час', 'Оборот/смяна', 'Часове/смяна', 'Км/смяна', 'Чисто на шофьор'],
    rows.map(([k, a]) => ({ cells: [h('b', null, k), String(a.n), money2(a.perHour), money(a.perShift), fmtNum1(a.hours), fmtNum(a.km), h('b', { class: tone(a.net) }, money(a.net))] })), { rightFrom: 1 });
  return h('div', null,
    pageHead('Статистика', `${scopeLabel()}: средният шофьор, сезонност, коли и гориво`),
    h('div', { class: 'row gap adm-picker' }, segmented({ 7: '7 дни', 30: '30 дни', 90: '90 дни', 365: 'Година' }, String(statState.days), (v) => { statState.days = Number(v); render(); }, { page: true })),
    card('pin', 'Средният шофьор по град', note(`За последните ${statState.days} дни, само шофьорите с поне една смяна.`), cityRows.length ? avgTable(cityRows, 'Град') : note('Няма данни.')),
    h('div', { class: 'adm-grid two' },
      card('calendar', 'Сезонност по месеци', note('Среден оборот на смяна във всеки месец (всички данни).'), barChart(seasonPts, { height: 170, cls: 'violet' })),
      card('clock', 'По дни от седмицата', note('Среден оборот на смяна в съответния ден.'), barChart(wdPts, { height: 170 }))),
    h('div', { class: 'adm-grid two' },
      card('car', 'Своя, под наем или лизинг', avgTable(group((d) => d.profile.carType, (k) => CAR_TYPES[k]?.label || k), 'Кола')),
      card('fuel', 'Кое гориво е най-изгодно', avgTable(group((d) => d.profile.fuel, (k) => FUELS[k]?.label || k), 'Гориво'))),
    h('div', { class: 'big-links adm-reports' },
      h('a', { class: 'big-link', href: '#/charts' }, h('span', { class: 'bl-ic' }, icon('chart', 22)), h('span', { class: 'grow' }, h('b', null, 'Графики и подробни числа'), h('span', null, 'Приход и чисто по дни, видове разходи, рекорди')), icon('right', 18)),
      h('a', { class: 'big-link', href: '#/geo' }, h('span', { class: 'bl-ic' }, icon('target', 22)), h('span', { class: 'grow' }, h('b', null, 'Градове и фирми'), h('span', null, 'Сравнение между градове и фирми')), icon('right', 18)),
      h('a', { class: 'big-link', href: '#/market' }, h('span', { class: 'bl-ic' }, icon('coins', 22)), h('span', { class: 'grow' }, h('b', null, 'Ефир, наеми и работа'), h('span', null, 'Колко струват ефирът и наемът')), icon('right', 18))));
}

// ---------- РАЗВИТИЕ: какво се ползва, анкета, предложения, функции за част от шофьорите ----------
const PAGE_NAMES = { home: 'Днес', shift: 'Смяна (въвеждане)', money: 'Пари', stats: 'Статистика', costs: 'Постоянни разходи', me: 'Аз', calendar: 'Календар', reservations: 'Резервации', profile: 'Моят профил', car: 'Колата и ефирът', shifts: 'Всички смени', ideas: 'Предложи функция', onboarding: 'Първоначална настройка' };
const IDEA_ST = { new: 'Ново', planned: 'Ще го направим', done: 'Готово', hidden: 'Скрито' };
function devPage() {
  const all = allDrivers(); const N = all.length || 1;
  const usage = Object.entries(store.admin.usage()).map(([p, u]) => ({ p, users: Object.keys(u.users).length, views: u.views })).sort((a, b) => b.users - a.users);
  const nps = store.admin.nps(); const pro = nps.filter((x) => x.score >= 9).length, det = nps.filter((x) => x.score <= 6).length;
  const score = nps.length ? Math.round(((pro - det) / nps.length) * 100) : null;
  const ideasL = store.admin.ideas(); const flags = store.admin.flags(); const comps = companiesOf(all);
  return h('div', null,
    pageHead('Развитие', 'Какво ползват шофьорите, какво мислят и какво искат'),
    h('div', { class: 'adm-grid two' },
      card('eye', 'Кое се ползва', note('Колко шофьори са отваряли всяка страница. Неползваното е кандидат за подобряване или махане.'),
        h('div', { class: 'usage' }, usage.map((u) => h('div', { class: 'us-row' }, h('span', null, PAGE_NAMES[u.p] || u.p),
          h('div', { class: 'fn-bar' }, h('i', { style: { width: `${(u.users / N) * 100}%` } }), h('b', null, `${u.users} шоф. · ${pct(u.users, N)}`)))))),
      card('heart', 'Би ли препоръчал ProfiTaxi?',
        h('div', { class: 'big-nums two' }, bigNum('Оценка (NPS)', score == null ? '—' : String(score), 'от −100 до +100', score > 30 ? 'live' : ''), bigNum('Отговори', String(nps.length), `${pro} доволни · ${det} недоволни`)),
        h('div', { class: 'nps-dist' }, Array.from({ length: 11 }, (_, i) => { const c = nps.filter((x) => x.score === i).length; return h('div', { class: cx('nd', i <= 6 ? 'bad' : i <= 8 ? 'mid' : 'good') }, h('i', { style: { height: `${nps.length ? (c / Math.max(...Array.from({ length: 11 }, (_, j) => nps.filter((x) => x.score === j).length), 1)) * 100 : 0}%` } }), h('span', null, String(i))); })),
        nps.filter((x) => x.comment).slice(0, 6).map((x) => h('p', { class: 'quote-s' }, h('b', null, `${x.score}/10 `), `„${x.comment}“`)))),
    h('div', { class: 'adm-grid two' },
      card('sparkle', `Предложения от шофьорите (${ideasL.length})`,
        ideasL.length ? ideasL.map((i) => h('div', { class: 'idea-a' }, h('span', { class: 'votes' }, String(i.votes.length)), h('span', { class: 'grow' }, i.text),
          h('select', { class: 'input', style: { width: 'auto' }, onchange: (e) => store.admin.setIdea(i.id, e.target.value) }, Object.entries(IDEA_ST).map(([k, v]) => h('option', { value: k, selected: i.status === k }, v))))) : note('Още няма предложения.'),
        note('Статусът се вижда и от шофьорите („Ще го направим“, „Готово“). „Скрито“ го маха от техния списък.')),
      card('bolt', 'Функции за част от шофьорите',
        note('Пускаш нещо първо на част от шофьорите (процент или една фирма) и виждаш дали помага, преди да е за всички.'),
        flags.map((f) => flagRow(f, comps)))));
}
function flagRow(f, comps) {
  const save = (patch) => store.admin.saveFlag({ ...f, ...patch });
  return h('div', { class: 'flag' },
    h('div', { class: 'row between' }, h('b', null, f.label), h('button', { class: cx('toggle', f.on && 'on'), role: 'switch', 'aria-checked': String(f.on), 'aria-label': f.label, onclick: () => save({ on: !f.on }) })),
    f.on && h('div', { class: 'row gap', style: { marginTop: '8px', flexWrap: 'wrap' } },
      h('select', { class: 'input', style: { width: 'auto' }, onchange: (e) => save({ target: e.target.value }) }, Object.entries({ all: 'За всички', percent: 'За процент от шофьорите', company: 'Само за една фирма' }).map(([k, v]) => h('option', { value: k, selected: f.target === k }, v))),
      f.target === 'percent' && h('input', { class: 'input', type: 'number', min: 0, max: 100, value: f.percent || 0, style: { width: '90px' }, onchange: (e) => save({ percent: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }) }),
      f.target === 'percent' && h('span', { class: 'muted small' }, '% от шофьорите'),
      f.target === 'company' && sel(comps, f.company, (v) => save({ company: v }), 'Избери фирма')));
}

let pending = false;
window.addEventListener('hashchange', render);
const busy = () => { const a = document.activeElement; return !!document.querySelector('.sheet-wrap') || (a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)); };
store.onChange(() => { if (busy()) pending = true; else render(); });
document.addEventListener('focusout', () => setTimeout(() => { if (pending && !busy()) { pending = false; render(); } }, 0));
window.addEventListener('profitaxi:sheetclosed', () => { if (pending && !busy()) { pending = false; render(); } });
render();
export { eachDay, fmtNum1, FUEL_TYPES, MONTHS };

// Картата и числата на „Днес“ се обновяват сами на всеки 20 секунди
const refreshLive = () => { if (store.adminUser() && parse().name === '/overview' && !document.querySelector('.sheet-wrap, .tour') && document.visibilityState === 'visible') render(); };
setInterval(refreshLive, 20000);
