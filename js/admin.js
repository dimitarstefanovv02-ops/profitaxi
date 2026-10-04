// ProfiTaxi – админ панел. Отделен вход на /admin. Шофьорите нямат връзка към него.

import { h, fill, icon, cx, clear, money, money2, todayStr, addDays, fmtDate, fmtNum, fmtDuration, isoToDateStr, parseDate, eachDay, MONTHS } from './util.js';
import * as store from './store.js';
import { applyTheme, toast, confirmSheet, openSheet, sheetHead, field, barChart, stat, tone, segmented, empty, getTheme, setTheme } from './ui.js';
import { periodStats, series, shiftIncome, shiftExpenses, shiftKm, shiftHours, shiftDate, costMonthly, goalProgress } from './calc.js';
import { CAR_TYPES, FUELS, COST_CATS, PERIODS, DISPATCH_MODES } from './constants.js';
import { periodPicker, periodRange, statsBody, exportCsv } from './views/stats.js';

applyTheme();
document.body.classList.add('admin');

const NAV = [['/overview', 'chart', 'Общ преглед'], ['/drivers', 'users', 'Шофьори'], ['/new', 'plus', 'Нов шофьор'], ['/settings', 'shield', 'Настройки']];
const overviewState = { unit: 'month', anchor: todayStr(), from: addDays(todayStr(), -29), to: todayStr() };
const driverState = { unit: 'month', anchor: todayStr(), from: addDays(todayStr(), -29), to: todayStr() };
const listState = { q: '', filter: 'all', sort: 'net' };

const go = (p) => { location.hash = p; };
function parse() { const raw = location.hash.slice(1) || '/overview'; const parts = raw.split('?')[0].split('/').filter(Boolean); return { name: '/' + (parts[0] || 'overview'), param: parts[1], raw }; }

function render() {
  const app = document.getElementById('app');
  const r = parse();
  if (!store.adminUser()) return fill(app, loginView());
  if (r.name === '/login') return go('/overview');
  const views = { '/overview': overview, '/drivers': drivers, '/driver': driverDetail, '/new': newDriver, '/settings': settings };
  const view = views[r.name] || overview;
  const y = window.scrollY;
  fill(app, h('div', { class: 'adm' }, sidebar(r.name), h('main', { class: 'adm-main' }, view(r))));
  if (r.raw === render.last) window.scrollTo(0, y); else window.scrollTo(0, 0);
  render.last = r.raw;
}

function sidebar(active) {
  const a = store.adminUser();
  return h('aside', { class: 'adm-side' },
    h('div', { class: 'brand' }, h('div', { class: 'brand-mark' }, icon('car', 22)), h('span', { class: 'brand-name' }, 'ProfiTaxi'), h('span', { class: 'chip', style: { marginLeft: '4px' } }, 'Админ')),
    h('nav', { class: 'adm-nav' }, NAV.map(([p, ic, label]) =>
      h('a', { href: '#' + p, class: cx((active === p || (p === '/drivers' && active === '/driver')) && 'on') }, icon(ic, 19), h('span', null, label)))),
    h('div', { class: 'adm-side-foot' },
      h('div', { class: 'small muted' }, a.email),
      h('div', { class: 'row gap', style: { marginTop: '8px' } },
        h('button', { class: 'icon-btn', 'aria-label': 'Смени темата', onclick: () => { const n = { auto: 'dark', dark: 'light', light: 'auto' }[getTheme()]; setTheme(n); toast(n === 'auto' ? 'Автоматична тема' : n === 'dark' ? 'Тъмна тема' : 'Светла тема'); } }, icon('moon', 19)),
        h('button', { class: 'btn btn-ghost grow', onclick: () => { store.adminLogout(); render(); } }, icon('logout', 18), 'Изход'))));
}

function loginView() {
  const email = h('input', { class: 'input', type: 'email', autocomplete: 'username' });
  const pw = h('input', { class: 'input', type: 'password', autocomplete: 'current-password' });
  const err = h('p', { class: 'err' });
  return h('div', { class: 'auth', style: { maxWidth: '420px', margin: '0 auto' } },
    h('div', { class: 'brand' }, h('div', { class: 'brand-mark' }, icon('shield', 22)), h('span', { class: 'brand-name' }, 'ProfiTaxi')),
    h('div', { class: 'auth-hero' }, h('h1', null, 'Администрация'), h('p', null, 'Вход само за администратори.')),
    h('form', { class: 'form', onsubmit: (e) => { e.preventDefault(); const r = store.adminLogin(email.value, pw.value); if (r.error) { err.textContent = r.error; return; } render(); } },
      field('Имейл', email), field('Парола', pw), err,
      h('button', { class: 'btn btn-primary btn-xl', type: 'submit' }, 'Вход')),
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
const pageHead = (title, sub, actions) => h('div', { class: 'adm-head' }, h('div', null, h('h1', null, title), sub && h('p', { class: 'muted' }, sub)), actions && h('div', { class: 'row gap' }, actions));

// ---------- Общ преглед ----------
function overview() {
  const root = h('div');
  const draw = () => {
    const r = periodRange(overviewState);
    const all = store.admin.allData();
    const rows = all.map((d) => ({ d, st: periodStats(d, r.from, r.to) }));
    const sum = (k) => rows.reduce((a, x) => a + x.st[k], 0);
    const T = { income: sum('income'), net: sum('net'), exp: sum('totalExp'), shifts: sum('shifts'), hours: sum('hours'), km: sum('km'), fixed: sum('fixedExp'), varExp: sum('varExp') };
    const activeDrivers = rows.filter((x) => x.st.shifts > 0).length;
    const states = all.map((d) => subState(d.user));
    const count = (k) => states.filter((s) => s.key === k).length;

    // Обща графика по дни/месеци
    const days = Math.round((parseDate(r.to) - parseDate(r.from)) / 86400000) + 1;
    const unit = overviewState.unit === 'year' || days > 62 ? 'month' : 'day';
    let pts = null;
    if (overviewState.unit !== 'day') {
      const per = all.map((d) => series(d, r.from, r.to, unit));
      pts = per[0]?.map((p, i) => ({ ...p, net: per.reduce((a, s) => a + s[i].net, 0), income: per.reduce((a, s) => a + s[i].income, 0) })) || [];
    }
    const expiring = all.filter((d) => { const s = subState(d.user); return (s.key === 'active' || s.key === 'trial') && s.left <= 7; });

    fill(root,
      pageHead('Общ преглед', `${all.length} шофьори, ${activeDrivers} активни през периода`),
      h('div', { class: 'adm-picker' }, periodPicker(overviewState, draw)),
      h('div', { class: 'adm-kpis' },
        stat('Приход', money(T.income), { icon: 'coins', sub: `${fmtNum(T.shifts)} смени` }),
        stat('Чиста печалба', money(T.net), { icon: 'wallet', tone: tone(T.net), sub: `разходи ${money(T.exp)}` }),
        stat('Средно на час', money2(T.hours ? T.net / T.hours : 0), { icon: 'clock', sub: `${fmtNum(T.hours)} часа` }),
        stat('Средно на км', money2(T.km ? T.net / T.km : 0), { icon: 'road', sub: `${fmtNum(T.km)} км` }),
        stat('Средно на смяна', money(T.shifts ? T.income / T.shifts : 0), { icon: 'receipt', sub: 'приход' }),
        stat('Абонаменти', `${count('active') + count('trial')}`, { icon: 'users', sub: `${count('trial')} пробни, ${count('expired')} изтекли, ${count('blocked')} спрени` })),
      pts && pts.length > 1 && h('section', { class: 'card' },
        h('div', { class: 'card-title' }, h('h3', null, 'Чиста печалба на всички шофьори'), h('b', { class: cx('num', tone(T.net)) }, money(T.net))),
        barChart(pts, { height: 180 })),
      h('div', { class: 'adm-cols' },
        h('section', { class: 'card' },
          h('div', { class: 'card-title' }, h('h3', null, 'Класиране за периода')),
          table(['Шофьор', 'Смени', 'Приход', 'Чисто', '€/час', '€/км'],
            rows.sort((a, b) => b.st.net - a.st.net).map(({ d, st }) => ({
              href: '#/driver/' + d.user.id,
              cells: [h('b', null, d.user.name), st.shifts, money(st.income), h('b', { class: tone(st.net) }, money(st.net)), money2(st.netPerHour), money2(st.netPerKm)],
            })))),
        h('div', { class: 'stack' },
          h('section', { class: 'card' },
            h('div', { class: 'card-title' }, h('h3', null, 'Изтичащи абонаменти')),
            expiring.length ? expiring.map((d) => { const s = subState(d.user); return h('a', { class: 'list-btn', href: '#/driver/' + d.user.id },
              h('span', { class: 'grow' }, d.user.name), h('span', { class: cx('chip', s.cls) }, s.left === 0 ? 'днес' : `${s.left} дни`)); })
              : h('p', { class: 'muted small' }, 'Няма абонаменти, които изтичат до 7 дни.')),
          h('section', { class: 'card' },
            h('div', { class: 'card-title' }, h('h3', null, 'Коли и гориво')),
            breakdown(all, (d) => CAR_TYPES[d.profile.carType]?.label),
            h('div', { style: { height: '12px' } }),
            breakdown(all, (d) => FUELS[d.profile.fuel]?.label)),
          h('section', { class: 'card' },
            h('div', { class: 'card-title' }, h('h3', null, 'Разходи общо')),
            h('div', { class: 'grid2' }, stat('От смените', money(T.varExp)), stat('Постоянни', money(T.fixed)))))));
  };
  draw();
  return root;
}

function breakdown(all, keyFn) {
  const m = {};
  all.forEach((d) => { const k = keyFn(d) || '—'; m[k] = (m[k] || 0) + 1; });
  return h('div', { class: 'chips', style: { marginBottom: 0 } }, Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => h('span', { class: 'chip' }, `${k}: ${v}`)));
}

function table(headers, rows) {
  if (!rows.length) return h('p', { class: 'muted small' }, 'Няма данни');
  return h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
    h('thead', null, h('tr', null, headers.map((x, i) => h('th', { class: i ? 'r' : '' }, x)))),
    h('tbody', null, rows.map((r) => h('tr', { class: r.href ? 'link' : '', onclick: r.href ? () => { location.hash = r.href.slice(1); } : null },
      r.cells.map((c, i) => h('td', { class: i ? 'r' : '' }, c)))))));
}

// ---------- Шофьори ----------
function drivers() {
  const root = h('div');
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Търси по име, имейл или телефон', value: listState.q, oninput: (e) => { listState.q = e.target.value; drawList(); } });
  const listEl = h('div');
  const today = todayStr();
  const mFrom = today.slice(0, 8) + '01';
  const all = store.admin.allData().map((d) => ({ d, s: subState(d.user), st: periodStats(d, mFrom, today), last: lastShift(d) }));
  function drawList() {
    const q = listState.q.trim().toLowerCase();
    const list = all.filter(({ d, s }) => (listState.filter === 'all' || s.key === listState.filter) &&
      (!q || [d.user.name, d.user.email, d.user.phone].join(' ').toLowerCase().includes(q)));
    const sorters = { net: (a, b) => b.st.net - a.st.net, name: (a, b) => a.d.user.name.localeCompare(b.d.user.name, 'bg'), recent: (a, b) => (b.last?.start || '').localeCompare(a.last?.start || ''), sub: (a, b) => a.d.user.subscription.validUntil.localeCompare(b.d.user.subscription.validUntil) };
    list.sort(sorters[listState.sort]);
    fill(listEl, list.length ? table(['Шофьор', 'Кола', 'Статус', 'Абонамент до', 'Последна смяна', 'Чисто този месец'],
      list.map(({ d, s, st, last }) => ({
        href: '#/driver/' + d.user.id,
        cells: [
          h('div', null, h('b', null, d.user.name), h('div', { class: 'muted small' }, d.user.email)),
          h('span', { class: 'small' }, `${CAR_TYPES[d.profile.carType]?.label}, ${FUELS[d.profile.fuel]?.label}`),
          h('span', { class: cx('chip', s.cls) }, s.label),
          fmtDate(d.user.subscription.validUntil, { year: true }),
          last ? fmtDate(shiftDate(last)) : '—',
          h('b', { class: tone(st.net) }, money(st.net)),
        ],
      }))) : empty('users', 'Няма намерени шофьори', 'Промени търсенето или филтъра.'));
  }
  const counts = (k) => all.filter((x) => k === 'all' || x.s.key === k).length;
  const drawAll = () => fill(root,
    pageHead('Шофьори', `${all.length} акаунта`, [h('button', { class: 'btn btn-primary', onclick: () => go('/new') }, icon('plus', 18), 'Нов шофьор')]),
    h('div', { class: 'adm-filters' },
      search,
      segmented({ all: `Всички ${counts('all')}`, active: `Активни ${counts('active')}`, trial: `Пробни ${counts('trial')}`, expired: `Изтекли ${counts('expired')}`, blocked: `Спрени ${counts('blocked')}` }, listState.filter, (f) => { listState.filter = f; drawAll(); }, { small: true, wrap: true }),
      h('label', { class: 'row gap small muted' }, 'Подреди по',
        h('select', { class: 'input', style: { width: 'auto', minHeight: '40px', padding: '6px 10px' }, onchange: (e) => { listState.sort = e.target.value; drawList(); } },
          [['net', 'печалба'], ['name', 'име'], ['recent', 'последна смяна'], ['sub', 'абонамент']].map(([v, l]) => h('option', { value: v, selected: listState.sort === v }, l))))),
    h('section', { class: 'card', style: { marginTop: '14px' } }, listEl));
  drawAll(); drawList();
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
    fill(statsBox, h('div', { class: 'adm-picker' }, periodPicker(driverState, drawStats)), h('div', { class: 'adm-stats' }, statsBody(data, pr.from, pr.to, driverState.unit)));
  };
  drawStats();
  const g = goalProgress(data);
  const info = (label, value) => h('div', { class: 'info-row' }, h('span', { class: 'muted' }, label), h('span', null, value));
  const dispatchText = p.dispatch.mode === 'none' ? 'Няма' : `${money(p.dispatch.amount)} ${{ daily: 'на ден', weekly: 'на седмица', monthly: 'на месец' }[p.dispatch.mode]}`;
  const shifts = data.shifts.slice(0, 60);
  const activeCosts = data.costs.filter((c) => !c.endDate || c.endDate >= todayStr());

  fill(root,
    h('a', { class: 'back', href: '#/drivers' }, icon('left', 20), 'Шофьори'),
    pageHead(u.name, `${u.email}${u.phone ? ', ' + u.phone : ''}`, [
      h('span', { class: cx('chip', s.cls) }, s.label),
      h('button', { class: 'btn btn-ghost', onclick: () => exportCsv(data, { from: '2000-01-01', to: todayStr() }) }, icon('download', 18), 'Excel')]),
    h('div', { class: 'adm-cols' },
      h('section', { class: 'card' },
        h('div', { class: 'card-title' }, h('h3', null, 'Профил')),
        info('Регистриран', fmtDate(isoToDateStr(u.createdAt), { year: true })),
        info('Последен вход', u.lastLoginAt ? `${fmtDate(isoToDateStr(u.lastLoginAt), { year: true })}, ${new Date(u.lastLoginAt).toTimeString().slice(0, 5)}` : '—'),
        info('Кола', `${CAR_TYPES[p.carType]?.label}${p.carType === 'leasing' ? `, ${money(p.leasing.amount)}/мес` : p.carType === 'rent' ? `, ${money(p.rent.amount)} ${PERIODS[p.rent.period].label}` : ''}`),
        info('Гориво', FUELS[p.fuel]?.label),
        info('Ефир', dispatchText),
        info('Дели колата', p.sharePct < 100 ? `да, ${p.sharePct}%` : 'не'),
        info('Цел за месеца', `${money(p.monthlyGoal)} (${Math.round(g.pct * 100)}%)`),
        info('Смени общо', String(data.shifts.filter((x) => x.end).length)),
        info('Активна смяна', data.shifts.some((x) => !x.end) ? 'да, в момента кара' : 'не')),
      h('section', { class: 'card' },
        h('div', { class: 'card-title' }, h('h3', null, 'Достъп и абонамент')),
        info('План', u.subscription.plan === 'trial' ? 'Пробен период' : 'Платен'),
        info('Валиден до', `${fmtDate(u.subscription.validUntil, { year: true })}${s.left != null ? ` (${s.left >= 0 ? `още ${s.left} дни` : `изтекъл преди ${-s.left} дни`})` : ''}`),
        h('div', { class: 'adm-actions' },
          h('button', { class: 'btn btn-primary', onclick: () => { store.admin.extend(u.id, 30); toast('Удължен с 30 дни'); } }, '+30 дни'),
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
        h('b', { class: tone(shiftIncome(x) - shiftExpenses(x)) }, money(shiftIncome(x) - shiftExpenses(x)))] }))),
      data.shifts.length > 60 && h('p', { class: 'muted small', style: { marginTop: '10px' } }, `Показани са последните 60 от ${data.shifts.length}. Всички са в Excel файла.`)),
    h('h2', { class: 'section-title' }, 'Постоянни разходи'),
    h('section', { class: 'card' }, table(['Разход', 'Сума', 'Период', 'На месец', 'Валидно до'],
      activeCosts.map((c) => ({ cells: [c.name, money(c.amount, c.amount % 1 ? 2 : 0), PERIODS[c.period].short, money(costMonthly(c, p)), c.dueDate ? fmtDate(c.dueDate, { year: true }) : '—'] })))));
  return root;
}

function setDate(u) {
  openSheet((close) => {
    const inp = h('input', { class: 'input', type: 'date', value: u.subscription.validUntil });
    const plan = { v: u.subscription.plan };
    return h('div', { class: 'form' },
      sheetHead('Валиден до', close),
      field('Дата', inp),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'План'), segmented({ paid: 'Платен', trial: 'Пробен' }, plan.v, (v) => { plan.v = v; })),
      h('button', { class: 'btn btn-primary btn-lg', onclick: () => { if (!inp.value) return; store.admin.setSubscription(u.id, inp.value, plan.v); close(); toast('Запазено'); } }, 'Запази'));
  });
}
function resetPw(u) {
  const gen = () => Math.random().toString(36).slice(2, 6) + Math.floor(1000 + Math.random() * 9000);
  openSheet((close) => {
    const inp = h('input', { class: 'input', value: gen() });
    return h('div', { class: 'form' },
      sheetHead('Нова парола', close, `За ${u.name}`),
      field('Парола', inp, 'Изпрати я на шофьора. Той може да я смени от профила си.'),
      h('button', { class: 'btn btn-primary btn-lg', onclick: () => { if (inp.value.length < 6) { toast('Поне 6 символа', 'err'); return; } store.admin.resetPassword(u.id, inp.value); close(); toast('Паролата е сменена'); } }, 'Запази'));
  });
}

// ---------- Нов шофьор ----------
function newDriver() {
  const f = { carType: 'own', fuel: 'petrol_lpg', days: 30 };
  const name = h('input', { class: 'input' });
  const email = h('input', { class: 'input', type: 'email' });
  const phone = h('input', { class: 'input', type: 'tel' });
  const pw = h('input', { class: 'input', value: Math.random().toString(36).slice(2, 6) + Math.floor(1000 + Math.random() * 9000) });
  const err = h('p', { class: 'err' });
  const box = h('div');
  const draw = () => fill(box,
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Кола'), segmented(Object.fromEntries(Object.entries(CAR_TYPES).map(([k, v]) => [k, v.label])), f.carType, (v) => { f.carType = v; draw(); }, { small: true })),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Гориво'), segmented(Object.fromEntries(Object.entries(FUELS).map(([k, v]) => [k, v.label])), f.fuel, (v) => { f.fuel = v; draw(); }, { small: true, wrap: true })),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Достъп'), segmented({ 14: '14 дни', 30: '30 дни', 90: '3 месеца', 365: '1 година' }, String(f.days), (v) => { f.days = Number(v); draw(); }, { small: true })));
  draw();
  return h('div', { style: { maxWidth: '620px' } },
    pageHead('Нов шофьор', 'Акаунтът е готов веднага. Шофьорът сам допълва настройките при първия вход.'),
    h('section', { class: 'card' }, h('form', { class: 'form', onsubmit: (e) => {
      e.preventDefault();
      const r = store.admin.createDriver({ name: name.value, email: email.value, password: pw.value, phone: phone.value, days: f.days, carType: f.carType, fuel: f.fuel });
      if (r.error) { err.textContent = r.error; return; }
      toast('Шофьорът е създаден'); go('/driver/' + r.user.id);
    } },
      field('Име', name), field('Имейл', email), field('Телефон', phone, 'По желание'), field('Начална парола', pw, 'Изпрати я на шофьора'),
      box, err,
      h('button', { class: 'btn btn-primary btn-lg', type: 'submit' }, 'Създай акаунт'))));
}

// ---------- Настройки ----------
function settings() {
  const s = store.admin.settings();
  const days = h('input', { class: 'input', type: 'number', min: 0, max: 90, value: s.trialDays });
  return h('div', { style: { maxWidth: '620px' } },
    pageHead('Настройки', 'Общи настройки на услугата'),
    h('section', { class: 'card form' },
      field('Пробен период при регистрация (дни)', days, '0 = без пробен период'),
      h('button', { class: 'btn btn-primary btn-lg', onclick: () => { store.admin.saveSettings({ trialDays: Math.max(0, Math.min(90, Number(days.value) || 0)) }); toast('Запазено'); } }, 'Запази')),
    h('section', { class: 'card' },
      h('div', { class: 'card-title' }, h('h3', null, 'Демо данни')),
      h('p', { class: 'muted small', style: { marginBottom: '12px' } }, 'Връща демо шофьорите и смените в началното им състояние. Изтрива всичко въведено на това устройство.'),
      h('button', { class: 'btn btn-ghost', onclick: () => confirmSheet({ title: 'Нулиране на демо данните?', okLabel: 'Нулирай', danger: true, onOk: () => { store.resetDemo(); location.reload(); } }) }, 'Нулирай демо данните')));
}

let pending = false;
window.addEventListener('hashchange', render);
store.onChange(() => { if (document.querySelector('.sheet-wrap')) pending = true; else render(); });
window.addEventListener('profitaxi:sheetclosed', () => { if (pending && !document.querySelector('.sheet-wrap')) { pending = false; render(); } });
render();
export { MONTHS, eachDay, COST_CATS, DISPATCH_MODES, clear };
