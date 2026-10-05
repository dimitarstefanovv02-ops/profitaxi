// ProfiTaxi – админ панел. Отделен вход на /admin. Шофьорите нямат връзка към него.

import { h, fill, icon, cx, money, money2, moneyFull, todayStr, addDays, fmtDate, fmtNum, fmtNum1, fmtDuration, isoToDateStr, parseDate, eachDay, MONTHS, MONTHS_SHORT, WD_SHORT, startOfMonth, dateStr } from './util.js';
import * as store from './store.js';
import { applyTheme, toast, confirmSheet, openSheet, sheetHead, field, barChart, stat, tone, segmented, empty, getTheme, setTheme, shareRows, cardTitle } from './ui.js';
import { periodStats, series, shiftIncome, shiftExpenses, shiftKm, shiftHours, shiftDate, costMonthly, goalProgress, timeInsights, activeCosts } from './calc.js';
import { CAR_TYPES, FUELS, PERIODS, INCOME_TYPES, expenseCat, costCat, FUEL_TYPES } from './constants.js';
import { periodPicker, periodRange, statsBody, exportCsv } from './views/stats.js';
import { cityCompanyPicker } from './views/cityPicker.js';

applyTheme();
document.body.classList.add('admin');

const NAV = [
  ['/overview', 'chart', 'Общ преглед'],
  ['/geo', 'target', 'Градове и фирми'],
  ['/market', 'coins', 'Ефир, наеми, работа'],
  ['/drivers', 'users', 'Шофьори'],
  ['/subs', 'receipt', 'Абонаменти'],
  ['/new', 'plus', 'Нов шофьор'],
  ['/settings', 'shield', 'Настройки'],
];
const mkState = () => ({ unit: 'month', anchor: todayStr(), from: addDays(todayStr(), -29), to: todayStr() });
const overviewState = mkState(), geoState = mkState(), driverState = mkState(), marketState = mkState();
const listState = { q: '', filter: 'all', sort: 'net' };
// Общ филтър за целия админ панел: град → фирма
const scope = { city: '', company: '' };
const inScope = (d) => (!scope.city || d.user.city === scope.city) && (!scope.company || d.user.company === scope.company);
const scoped = () => store.admin.allData().filter(inScope);
const scopeLabel = () => (scope.company ? `${scope.company}, ${scope.city}` : scope.city || 'Цяла България');
const PALETTE = ['#6366F1', '#1FB866', '#F5A524', '#EC4899', '#1EA5EE', '#FF7A1A', '#14B8A6', '#8B5CF6', '#F04461', '#64748B'];

const go = (p) => { location.hash = p; };
function parse() { const raw = location.hash.slice(1) || '/overview'; const parts = raw.split('?')[0].split('/').filter(Boolean); return { name: '/' + (parts[0] || 'overview'), param: parts[1], raw }; }

function render() {
  const app = document.getElementById('app');
  const r = parse();
  if (!store.adminUser()) return fill(app, loginView());
  if (r.name === '/login') return go('/overview');
  const views = { '/overview': overview, '/geo': geo, '/market': market, '/drivers': drivers, '/driver': driverDetail, '/subs': subs, '/new': newDriver, '/settings': settings };
  const view = views[r.name] || overview;
  const withScope = ['/overview', '/geo', '/market', '/drivers', '/subs'].includes(r.name) || !views[r.name];
  const y = window.scrollY;
  fill(app, h('div', { class: 'adm' }, sidebar(r.name), h('main', { class: 'adm-main' }, withScope && scopeBar(), view(r))));
  if (r.raw === render.last) window.scrollTo(0, y); else window.scrollTo(0, 0);
  render.last = r.raw;
}

function sidebar(active) {
  const a = store.adminUser();
  const n = store.admin.drivers().length;
  return h('aside', { class: 'adm-side' },
    h('div', { class: 'brand' }, h('img', { class: 'brand-logo', src: '/icons/admin-192.png', alt: '' }), h('span', { class: 'brand-name' }, 'ProfiTaxi'), h('span', { class: 'adm-badge' }, 'Админ')),
    h('nav', { class: 'adm-nav' }, NAV.map(([p, ic, label]) =>
      h('a', { href: '#' + p, class: cx((active === p || (p === '/drivers' && active === '/driver')) && 'on') }, icon(ic, 19), h('span', null, label), p === '/drivers' && h('span', { class: 'count' }, n)))),
    h('div', { class: 'adm-side-foot' },
      h('div', { class: 'who' }, a.email),
      h('button', { class: 'icon-btn', 'aria-label': 'Смени темата', onclick: () => { const nx = { auto: 'dark', dark: 'light', light: 'auto' }[getTheme()]; setTheme(nx); toast(nx === 'auto' ? 'Автоматична тема' : nx === 'dark' ? 'Тъмна тема' : 'Светла тема'); } }, icon('moon', 19)),
      h('button', { class: 'btn grow', onclick: () => { store.adminLogout(); render(); } }, icon('logout', 18), 'Изход')));
}

function loginView() {
  const email = h('input', { class: 'input', type: 'email', autocomplete: 'username' });
  const pw = h('input', { class: 'input', type: 'password', autocomplete: 'current-password' });
  const err = h('p', { class: 'err' });
  return h('div', { class: 'auth', style: { maxWidth: '420px', margin: '0 auto' } },
    h('div', { class: 'brand' }, h('img', { class: 'brand-logo', src: '/icons/admin-192.png', alt: '' }), h('span', { class: 'brand-name' }, 'ProfiTaxi')),
    h('div', { class: 'auth-hero' }, h('h1', null, 'Администрация'), h('p', null, 'Вход само за администратори.')),
    h('form', { class: 'form', onsubmit: (e) => { e.preventDefault(); const r = store.adminLogin(email.value, pw.value); if (r.error) { err.textContent = r.error; return; } render(); } },
      field('Имейл', email), field('Парола', pw), err,
      h('button', { class: 'btn btn-xl', type: 'submit', style: { background: '#6366F1', color: '#fff' } }, 'Вход')),
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
  return h('div', { class: 'scope-bar' },
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
}

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
        kpi('phone', '#8B5CF6', 'Ефир средно', fmtAvg(disp, (v) => `${money(v)}/мес`), rangeTxt(disp, (v) => money(v))),
        kpi('key', '#3D7BFF', 'Наем средно', fmtAvg(rent, (v) => `${money(v)}/седм.`), rangeTxt(rent, (v) => money(v))),
        kpi('doc', '#14B8A6', 'Лизинг средно', fmtAvg(leas, (v) => `${money(v)}/мес`), rangeTxt(leas, (v) => money(v))),
        kpi('car', '#F5A524', 'Коли', String(all.length), `${cars.own} собствени, ${cars.rent} под наем, ${cars.leasing} лизинг`),
        kpi('coins', '#1FB866', 'Приход на час', fmtAvg(iph, money2), `чисто ${fmtAvg(nph, money2)}/ч`),
        kpi('clock', '#1EA5EE', 'Часове на смяна', fmtAvg(hps, fmtDuration), `${fmtAvg(hpd, fmtDuration)} на работен ден`),
        kpi('calendar', '#EC4899', 'Смени на седмица', fmtAvg(spw, (v) => fmtNum1(v)), 'средно на шофьор'),
        kpi('road', '#FF7A1A', 'Км на смяна', fmtAvg(kps, (v) => `${fmtNum(v)} км`), `гориво ${fmtAvg(fpk, money2)}/км`)),
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
            { label: 'Собствена', value: cars.own, color: '#F5A524', text: String(cars.own) },
            { label: 'Под наем', value: cars.rent, color: '#3D7BFF', text: String(cars.rent) },
            { label: 'Лизинг', value: cars.leasing, color: '#14B8A6', text: String(cars.leasing) }], 'коли', String(all.length))))),
      h('section', { class: 'card', style: { marginTop: '14px' } }, cardTitle(scope.city ? 'car' : 'target', scope.city ? `Сравнение на фирмите в ${scope.city}` : 'Сравнение по градове'),
        table([scope.city ? 'Фирма' : 'Град', 'Шофьори', 'Ефир/мес', 'Наем/седм.', 'Приход/ч', 'Чисто/ч', 'Ч/смяна', 'Ч/ден', 'Смени/седм.', 'Км/смяна', 'Гориво/км'],
          cmp.map((g) => { const a = (k) => avgOf(g.list, k); return { cells: [
            h('b', null, g.k), g.list.length, fmtAvg(a('dispatchMonthly'), money), fmtAvg(a('rentWeekly'), money), fmtAvg(a('incomePerHour'), money2),
            h('b', { class: tone(a('netPerHour')?.avg || 0) }, fmtAvg(a('netPerHour'), money2)), fmtAvg(a('hoursPerShift'), (v) => fmtNum1(v)), fmtAvg(a('hoursPerDay'), (v) => fmtNum1(v)),
            fmtAvg(a('shiftsPerWeek'), (v) => fmtNum1(v)), fmtAvg(a('kmPerShift'), fmtNum), fmtAvg(a('fuelPerKm'), money2)] }; }), { rightFrom: 1 })),
      h('div', { class: 'adm-grid three' },
        h('section', { class: 'card' }, cardTitle('clock', 'Кога започват смените'), colBars(starts.map((v, i) => ({ label: `${i * 3}ч`, value: v })))),
        h('section', { class: 'card' }, cardTitle('calendar', 'Колко дълги са смените'), colBars(lens.map((x) => ({ ...x, color: 'linear-gradient(180deg,#7DD3FC,#1EA5EE)' })))),
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
function overview() {
  const root = h('div');
  const draw = () => {
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
      pageHead('Общ преглед', `${scopeLabel()}: ${all.length} шофьори, ${T.active} активни през периода`),
      h('div', { class: 'adm-picker' }, periodPicker(overviewState, draw)),
      h('div', { class: 'kpis kpis-lg' },
        kpi('coins', '#1FB866', 'Приход', money(T.income), `${fmtNum(T.shifts)} смени`, '', { lg: true, title: moneyFull(T.income), trend: trendChip(C.income, P.income), spark: sparkline(sparkPts.map((x) => x.income), '#1FB866') }),
        kpi('wallet', '#6366F1', 'Чиста печалба', money(T.net), `разходи ${money(T.exp)}`, tone(T.net), { lg: true, title: moneyFull(T.net), trend: trendChip(C.net, P.net), spark: sparkline(sparkPts.map((x) => x.net), '#6366F1') }),
        kpi('users', '#EC4899', 'Активни шофьори', `${T.active} от ${all.length}`, `${newRegs} нови регистрации`, '', { lg: true, trend: trendChip(C.active, P.active), spark: activeSpark && sparkline(activeSpark, '#EC4899'), bar: activeSpark ? null : (all.length ? T.active / all.length : 0) }),
        kpi('receipt', '#F5A524', 'Абонаменти на месец', money(mrr), `${count('active')} платени по ${money(price, 2)}`, '', { lg: true, title: 'MRR – месечни приходи от абонаменти', bar: all.length ? count('active') / all.length : 0 })),
      h('div', { class: 'mini-kpis' },
        miniKpi('clock', '#1EA5EE', 'Чисто на час', money2(T.perHour), `приход ${money2(T.incPerHour)}`),
        miniKpi('road', '#14B8A6', 'Чисто на км', money2(T.perKm), `${fmtNum(T.km)} км`),
        miniKpi('calendar', '#8B5CF6', 'Приход на смяна', money(T.perShift), T.shifts ? fmtDuration(T.hours / T.shifts) : ''),
        miniKpi('heart', '#FF7A1A', 'Бакшиши', money(T.tips), `${pct(night, shiftsP.length)} нощни`)),
      pts && pts.length > 1 && h('div', { class: 'adm-grid two' },
        h('section', { class: 'card' }, cardTitle('chart', 'Чиста печалба на всички', h('b', { class: cx('num', tone(T.net)) }, money(T.net))), barChart(pts, { height: 170 })),
        activePts ? h('section', { class: 'card' }, cardTitle('users', 'Активни шофьори по дни'), barChart(activePts, { height: 170, cls: 'violet', fmt: (v) => `${Math.round(v)} шофьори` }))
          : h('section', { class: 'card' }, cardTitle('coins', 'Приход по месеци'), barChart(pts, { height: 170, valueKey: 'income', cls: 'violet' }))),
      h('div', { class: 'adm-grid three' },
        h('section', { class: 'card' }, cardTitle('card', 'Как плащат клиентите'),
          donut(Object.entries(INCOME_TYPES).map(([k, t], i) => ({ label: t.label, value: T[k], color: ['#1FB866', '#3D7BFF', '#8B5CF6', '#F5A524'][i] })), 'приход', money(T.income))),
        h('section', { class: 'card' }, cardTitle('car', 'Тип кола'),
          donut(byCar.map((g, i) => ({ label: g.label, value: g.drivers, color: PALETTE[i], text: String(g.drivers), sub: `${money2(g.hours ? g.net / g.hours : 0)} чисто на час` })), 'шофьори', String(all.length))),
        h('section', { class: 'card' }, cardTitle('fuel', 'Гориво'),
          donut(byFuel.map((g, i) => ({ label: g.label, value: g.drivers, color: PALETTE[(i + 3) % PALETTE.length], text: String(g.drivers), sub: `гориво ${money2(g.km ? g.fuel / g.km : 0)} на км` })), 'шофьори', String(all.length)))),
      h('div', { class: 'adm-grid two' },
        h('section', { class: 'card' }, cardTitle('calendar', 'Смени по дни от седмицата'), colBars(byWd.map((v, i) => ({ label: WD_SHORT[i], value: v })))),
        h('section', { class: 'card' }, cardTitle('clock', 'Приход на час през денонощието'),
          ti.hasData ? colBars([0, 3, 6, 9, 12, 15, 18, 21].map((hh) => { const xs = ti.byHour.slice(hh, hh + 3).filter((x) => x.rate); return { label: `${hh}ч`, value: xs.length ? xs.reduce((a, x) => a + x.rate, 0) / xs.length : 0, color: 'linear-gradient(180deg,#FDBA74,#FF7A1A)' }; }), (v) => `${Math.round(v)}€`) : h('p', { class: 'muted small' }, 'Няма данни'))),
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
          referralCard(all, r),
          h('section', { class: 'card' }, cardTitle('alert', 'Неактивни 7+ дни', h('span', { class: 'chip bad' }, risk.length)),
            risk.length ? risk.slice(0, 6).map((d) => h('a', { class: 'list-btn', href: '#/driver/' + d.user.id }, h('span', { class: 'grow' }, d.user.name, h('span', { class: 'muted small' }, `, ${d.user.city}`)), h('span', { class: 'chip' }, daysSince(d) == null ? 'без смени' : `${daysSince(d)} дни`)))
              : h('p', { class: 'muted small' }, 'Всички шофьори са карали тази седмица.')))));
  };
  draw();
  return root;
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
        kpi('target', '#6366F1', 'Най-много шофьори', cities[0]?.key || '—', cities[0] ? `${cities[0].list.length} шофьори` : ''),
        (() => { const b = [...cities].filter((c) => c.T.hours > 20).sort((a, b2) => b2.T.perHour - a.T.perHour)[0]; return kpi('clock', '#1FB866', 'Най-доходен град', b?.key || '—', b ? `${money2(b.T.perHour)} чисто на час` : ''); })(),
        (() => { const b = [...companies].sort((a, b2) => b2.list.length - a.list.length)[0]; return kpi('car', '#F5A524', 'Най-голяма фирма', b ? b.key.split('|')[0] : '—', b ? `${b.list.length} шофьори, ${b.city}` : ''); })(),
        (() => { const b = [...companies].filter((c) => c.T.hours > 20).sort((a, b2) => b2.T.perHour - a.T.perHour)[0]; return kpi('trophy', '#EC4899', 'Най-доходна фирма', b ? b.key.split('|')[0] : '—', b ? `${money2(b.T.perHour)}/ч, ${b.city}` : ''); })()),
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
  const all = scoped().map((d) => ({ d, s: subState(d.user), st: periodStats(d, mFrom, today), last: lastShift(d) }));
  const listEl = h('div');
  function drawList() {
    const q = listState.q.trim().toLowerCase();
    const list = all.filter(({ d, s }) => (listState.filter === 'all' || s.key === listState.filter) &&
      (!q || [d.user.name, d.user.email, d.user.phone, d.user.company, d.user.city].join(' ').toLowerCase().includes(q)));
    const sorters = { net: (a, b) => b.st.net - a.st.net, name: (a, b) => a.d.user.name.localeCompare(b.d.user.name, 'bg'), recent: (a, b) => (b.last?.start || '').localeCompare(a.last?.start || ''), sub: (a, b) => a.d.user.subscription.validUntil.localeCompare(b.d.user.subscription.validUntil), reg: (a, b) => b.d.user.createdAt.localeCompare(a.d.user.createdAt) };
    list.sort(sorters[listState.sort]);
    fill(listEl, list.length ? table(['Шофьор', 'Град и фирма', 'Кола', 'Статус', 'Абонамент до', 'Последна смяна', 'Чисто този месец'],
      list.map(({ d, s, st, last }) => ({
        href: '#/driver/' + d.user.id,
        cells: [
          h('span', { class: 'who-cell' }, h('b', null, d.user.name), h('span', null, d.user.email)),
          h('span', { class: 'who-cell' }, h('b', { style: { fontWeight: 600 } }, d.user.city), h('span', null, d.user.company)),
          h('span', { class: 'small' }, `${CAR_TYPES[d.profile.carType]?.label}, ${FUELS[d.profile.fuel]?.label}`),
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
      h('section', { class: 'card', style: { marginTop: '14px' } }, listEl));
    drawList();
  };
  drawAll();
  return root;
}

// ---------- Детайли за шофьор ----------
function driverDetail(r) {
  const data = store.admin.driverData(r.param);
  if (!data.user) { setTimeout(() => go('/drivers')); return h('div'); }
  const u = data.user, p = data.profile, s = subState(u);
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
      kpi('coins', '#1FB866', 'Приход общо', money(life.income), `${life.shifts} смени`),
      kpi('wallet', '#6366F1', 'Чисто общо', money(life.net), `от ${fmtDate(isoToDateStr(u.createdAt), { year: true })}`, tone(life.net)),
      kpi('target', '#F5A524', 'Цел този месец', `${Math.round(g.pct * 100)}%`, `${money(g.net)} от ${money(p.monthlyGoal)}`),
      kpi('clock', '#1EA5EE', 'Последна смяна', ds == null ? '—' : ds === 0 ? 'днес' : ds === 1 ? 'вчера' : `преди ${ds} дни`, data.shifts.some((x) => !x.end) ? 'в момента кара' : '')),
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
        info('Код за покана', `${u.refCode || '—'}, поканени ${store.admin.drivers().filter((x) => x.referredBy === u.id).length}${u.refMonths ? `, спечелени ${u.refMonths} мес.` : ''}`),
        p.car?.plate && info('Кола', `${p.car.model || ''} ${p.car.plate}${p.car.code ? `, код ${p.car.code}` : ''}`.trim())),
      h('section', { class: 'card' },
        cardTitle('receipt', 'Достъп и абонамент'),
        info('План', u.subscription.plan === 'trial' ? 'Пробен период' : 'Платен'),
        info('Валиден до', `${fmtDate(u.subscription.validUntil, { year: true })}${s.left != null ? ` (${s.left >= 0 ? `още ${s.left} дни` : `изтекъл преди ${-s.left} дни`})` : ''}`),
        u.subscription.paidSince && info('Платен от', fmtDate(u.subscription.paidSince, { year: true })),
        h('div', { class: 'adm-actions' },
          h('button', { class: 'btn btn-page', onclick: () => { store.admin.extend(u.id, 30); toast('Удължен с 30 дни'); } }, '+30 дни'),
          h('button', { class: 'btn btn-ghost', onclick: () => { store.admin.extend(u.id, 365); toast('Удължен с 1 година'); } }, '+1 година'),
          h('button', { class: 'btn btn-ghost', onclick: () => setDate(u) }, icon('calendar', 18), 'Дата'),
          u.status === 'blocked'
            ? h('button', { class: 'btn btn-ghost', onclick: () => { store.admin.setStatus(u.id, 'active'); toast('Достъпът е пуснат'); } }, icon('check', 18), 'Пусни достъпа')
            : h('button', { class: 'btn btn-ghost', style: { color: 'var(--neg)' }, onclick: () => confirmSheet({ title: `Спиране на ${u.name}?`, text: 'Шофьорът няма да може да влиза, докато не пуснеш достъпа отново. Данните остават.', okLabel: 'Спри достъпа', danger: true, onOk: () => { store.admin.setStatus(u.id, 'blocked'); toast('Достъпът е спрян'); } }) }, icon('lock', 18), 'Спри достъпа'),
          h('button', { class: 'btn btn-ghost', onclick: () => resetPw(u) }, icon('key', 18), 'Нова парола'),
          h('button', { class: 'btn btn-ghost', style: { color: 'var(--neg)' }, onclick: () => confirmSheet({ title: 'Изтриване на акаунта?', text: `Всички данни на ${u.name} ще бъдат изтрити завинаги.`, okLabel: 'Изтрий', danger: true, onOk: () => { store.admin.deleteDriver(u.id); toast('Акаунтът е изтрит'); go('/drivers'); } }) }, icon('trash', 18), 'Изтрий')))),
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
      kpi('receipt', '#F5A524', 'Месечни приходи (MRR)', money(count('active') * price), `годишно ${money(count('active') * price * 12)}`),
      kpi('check', '#1FB866', 'Платени', String(count('active')), `от ${all.length} акаунта`),
      kpi('clock', '#1EA5EE', 'Пробни', String(count('trial')), 'в момента'),
      kpi('trophy', '#6366F1', 'От пробен към платен', pct(paidEver, trialsDone), 'конверсия'),
      kpi('alert', '#F04461', 'Изтекли', String(count('expired')), 'могат да бъдат върнати'),
      kpi('lock', '#64748B', 'Спрени', String(count('blocked')), 'ръчно спрени'),
      kpi('calendar', '#EC4899', 'Изтичат до 14 дни', String(expiring.length), ''),
      kpi('users', '#14B8A6', 'Нови този месец', String(regs[regs.length - 1].value), `миналия: ${regs[regs.length - 2].value}`)),
    h('section', { class: 'card' }, cardTitle('chart', 'Регистрации по месеци'), colBars(regs)),
    h('div', { class: 'adm-grid two' },
      h('section', { class: 'card' }, cardTitle('bell', 'Изтичат скоро'), table(['Шофьор', 'Статус', 'Валиден до', 'Остават'], expiring.map(subRow), { rightFrom: 2 })),
      h('section', { class: 'card' }, cardTitle('alert', 'Изтекли'), table(['Шофьор', 'Статус', 'Валиден до', 'Изтекъл'], expired.map(subRow), { rightFrom: 2 }))));
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
      field('Име', name, null, true), field('Имейл', email, null, true), field('Начална парола', pw, 'Изпрати я на шофьора', true), field('Телефон', phone, 'По желание'),
      cc.el, box, err,
      h('button', { class: 'btn btn-page btn-lg', type: 'submit' }, 'Създай акаунт'))));
}

// ---------- Настройки ----------
function settings() {
  const s = store.admin.settings();
  const days = h('input', { class: 'input', type: 'number', min: 0, max: 90, value: s.trialDays });
  const price = h('input', { class: 'input', inputmode: 'decimal', value: String(s.price ?? 9.99).replace('.', ',') });
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

let pending = false;
window.addEventListener('hashchange', render);
const busy = () => { const a = document.activeElement; return !!document.querySelector('.sheet-wrap') || (a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)); };
store.onChange(() => { if (busy()) pending = true; else render(); });
document.addEventListener('focusout', () => setTimeout(() => { if (pending && !busy()) { pending = false; render(); } }, 0));
window.addEventListener('profitaxi:sheetclosed', () => { if (pending && !busy()) { pending = false; render(); } });
render();
export { eachDay, fmtNum1, FUEL_TYPES, MONTHS };
