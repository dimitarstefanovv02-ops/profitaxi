// Още за собственика на коли под наем:
// 1) цел за месеца, 2) прогноза до края на месеца, 3) обслужване по километраж,
// 4) договор за наем (за печат / PDF), 5) отчет за счетоводителя (Excel), 6) обява за свободна кола.
import { h, icon, money, fmtDate, fmtNum, todayStr, addDays, endOfMonth, startOfMonth, parseDate, MONTHS } from '../util.js';
import * as store from '../store.js';
import { openSheet, sheetHead, toast, field, openNumpad, segmented } from '../ui.js';
import { rentPeriods, carCostSum, carProfit, RENT_PERIODS, depositState } from '../fleet.js';
import { costCat } from '../constants.js';

const sign = (n) => `${n >= 0 ? '+' : '−'}${money(Math.abs(n))}`;
const carLabel = (c) => [c.name, c.plate].filter(Boolean).join(' · ') || 'Кола';

// ---------- 1) Цел за месеца ----------
export const fleetGoal = () => Number(store.getProfile()?.fleetGoal) || 0;
export function goalSheet(redraw) {
  openNumpad({
    title: 'Цел за месеца', sub: 'Колко искаш да ти остане от колите – наем минус разходите.',
    fields: [{ key: 'goal', label: 'Цел', value: fleetGoal() || '', decimals: 0 }],
    actions: [
      fleetGoal() && { label: 'Махни целта', run: () => { store.updateProfile({ fleetGoal: 0 }); redraw(); } },
      { label: 'Запази', primary: true, run: (v) => { store.updateProfile({ fleetGoal: Math.round(v.goal) }); toast('Целта е запазена'); redraw(); } },
    ].filter(Boolean),
  });
}

// ---------- 2) Прогноза до края на месеца ----------
// Сегашната печалба + наемът, който предстои до края на месеца, + дълговете (ако се платят) − разходите до края.
export function forecast(infos, nowNet, today = todayStr()) {
  const end = endOfMonth(today);
  if (today >= end) return { net: nowNet, rent: 0, debt: 0, costs: 0, end };
  let rent = 0, debt = 0, costs = 0;
  for (const i of infos) {
    for (const { m, r } of i.rents) {
      debt += Math.max(0, r.debt || 0);
      if (m.rent?.period === 'once') continue;
      rent += rentPeriods(m.rent, end).filter((p) => p.start > today && p.start <= end).reduce((a, p) => a + p.amount, 0);
    }
    costs += carCostSum(i.costs, addDays(today, 1), end);
  }
  return { net: Math.round(nowNet + rent + debt - costs), rent, debt, costs, end };
}

// ---------- 3) Обслужване по километраж ----------
// Километражът на колата: най-големият краен км от смените (или при даване на колата)
export function odometer(info) {
  const ks = [...info.shifts.map((s) => Number(s.kmEnd) || 0), ...info.members.map((m) => Number(m.handoverKm) || 0), Number(info.car.serviceAtKm) || 0];
  return Math.max(0, ...ks);
}
export function serviceState(info) {
  const every = Number(info.car.serviceEvery) || 0; if (!every) return null;
  const odo = odometer(info);
  const at = Number(info.car.serviceAtKm) || 0;
  const next = at + every;
  return { every, odo, at, next, left: next - odo, pct: Math.max(0, Math.min(100, (odo - at) / every * 100)) };
}
export function serviceSheet(info, redraw) {
  const car = info.car; const odo = odometer(info); const s = serviceState(info);
  const every = h('input', { class: 'input', type: 'number', inputmode: 'numeric', value: car.serviceEvery || 10000 });
  const at = h('input', { class: 'input', type: 'number', inputmode: 'numeric', value: car.serviceAtKm || odo || '' });
  const cost = h('input', { class: 'input', type: 'number', inputmode: 'decimal', placeholder: 'по желание' });
  openSheet((close) => h('div', { class: 'form' },
    sheetHead('Обслужване по километраж', close, `Масло, филтри, ремъци – напомняме, когато колата наближи. Сега: ${fmtNum(odo)} км.`),
    h('div', { class: 'grid2' }, field('На всеки (км)', every), field('Последно на (км)', at)),
    s && h('div', { class: 'svc-done' },
      h('b', null, 'Обслужена е днес?'),
      field('Колко струва', cost),
      h('button', { class: 'btn btn-dark btn-block', onclick: () => {
        store.updateCar(car.id, { serviceEvery: Number(every.value) || 10000, serviceAtKm: odo });
        const a = Number(cost.value); if (a > 0) store.addCarCost(car.id, { category: 'service', amount: a, name: `Обслужване на ${fmtNum(odo)} км` });
        close(); toast('Записано – следващото е след ' + fmtNum(Number(every.value) || 10000) + ' км'); redraw();
      } }, icon('check', 16), `Обслужена на ${fmtNum(odo)} км`)),
    h('div', { class: 'row gap' },
      s && h('button', { class: 'btn btn-ghost', onclick: () => { store.updateCar(car.id, { serviceEvery: 0 }); close(); redraw(); } }, 'Изключи'),
      h('button', { class: 'btn btn-primary btn-lg grow', onclick: () => {
        store.updateCar(car.id, { serviceEvery: Number(every.value) || 10000, serviceAtKm: Number(at.value) || odo });
        close(); toast('Запазено'); redraw();
      } }, icon('check', 18), 'Запази'))));
}
export const serviceText = (s) => (s.left <= 0 ? `закъсняло с ${fmtNum(-s.left)} км` : `след ${fmtNum(s.left)} км`);

// ---------- 4) Договор за наем – образец за печат / PDF ----------
export function contractDoc(info, userId) {
  const x = info.rents.find((y) => y.m.userId === userId); if (!x) return;
  const { m, d } = x; const car = info.car; const me = store.currentUser(); const prof = store.getProfile() || {};
  const dep = depositState(userId, info.logs).balance;
  const line = (n = 40) => '_'.repeat(n);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const rent = m.rent?.amount ? `${money(m.rent.amount)} ${RENT_PERIODS[m.rent.period] || ''}` : line(20);
  const from = m.rent?.from || todayStr();
  const html = `<!doctype html><html lang="bg"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Договор за наем – ${esc(car.plate || car.name)}</title>
<style>body{font:15px/1.55 Georgia,'Times New Roman',serif;color:#111;max-width:720px;margin:24px auto;padding:0 20px}h1{font-size:20px;text-align:center;margin:0 0 4px}p.c{text-align:center;margin:0 0 18px}ol{padding-left:22px}li{margin:6px 0}.sig{display:flex;justify-content:space-between;gap:30px;margin-top:46px}.sig div{flex:1;border-top:1px solid #111;padding-top:6px;text-align:center}.note{font:12px/1.4 system-ui,sans-serif;color:#666;border:1px dashed #bbb;padding:8px 10px;margin:0 0 18px}.bar{font:14px system-ui;display:flex;gap:8px;justify-content:center;margin:0 0 16px}.bar button{font:inherit;padding:8px 16px;border-radius:999px;border:1px solid #111;background:#111;color:#fff}@media print{.note,.bar{display:none}body{margin:0}}</style></head><body>
<div class="bar"><button onclick="print()">Печат / запази като PDF</button></div>
<div class="note">Образец, направен от „Чисто“ с данните от приложението. Прегледай го и го допълни преди подпис – не е правен съвет.</div>
<h1>ДОГОВОР ЗА НАЕМ НА ЛЕК АВТОМОБИЛ</h1><p class="c">гр. ${esc(prof.city || line(14))}, ${fmtDate(todayStr())} ${todayStr().slice(0, 4)} г.</p>
<p><b>НАЕМОДАТЕЛ:</b> ${esc(me?.name)}, тел. ${esc(me?.phone || line(14))}, ЕГН/ЕИК ${line(14)}, адрес ${line(30)}</p>
<p><b>НАЕМАТЕЛ:</b> ${esc(d.name || m.name)}, тел. ${esc(d.phone || line(14))}, ЕГН ${line(14)}, адрес ${line(30)}</p>
<ol>
<li>Наемодателят предоставя за временно ползване лек автомобил <b>${esc(car.name || line(20))}</b>, рег. № <b>${esc(car.plate || line(12))}</b>${m.handoverKm ? `, с показания на километража <b>${fmtNum(m.handoverKm)} км</b>` : ''}, в техническа изправност, за таксиметрова дейност.</li>
<li>Срок: от <b>${fmtDate(from)} ${from.slice(0, 4)} г.</b> ${m.rent?.to ? `до <b>${fmtDate(m.rent.to)} ${m.rent.to.slice(0, 4)} г.</b>` : 'за неопределен срок'}. Всяка страна може да прекрати договора с ${line(4)} дни писмено предизвестие.</li>
<li>Наем: <b>${esc(rent)}</b>, платим авансово${m.rent?.period === 'week' ? ' в началото на всяка седмица' : m.rent?.period === 'month' ? ' до ' + line(4) + ' число на месеца' : ''} в брой или по банков път.</li>
<li>Депозит: <b>${dep > 0 ? money(dep) : line(10)}</b>. Връща се при връщане на автомобила, след приспадане на неплатен наем, глоби и щети по вина на наемателя.</li>
<li>Наемателят плаща горивото, глобите и санкциите за нарушения по време на ползването, и щетите, причинени по негова вина.</li>
<li>Наемодателят плаща застраховките „Гражданска отговорност“${car.docs?.casco ? ' и „Каско“' : ''}, данъка, винетката и прегледите, освен ако не е уговорено друго.</li>
<li>Наемателят не може да преотдава автомобила и да допуска други водачи без писмено съгласие на наемодателя.</li>
<li>Автомобилът се връща в състоянието, в което е предаден, с обичайното износване. Приемането и връщането се отбелязват със снимки.</li>
<li>Допълнително: ${line(60)}</li>
</ol>
<div class="sig"><div>Наемодател</div><div>Наемател</div></div>
</body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const w = window.open(url, '_blank');
  if (!w) { const a = h('a', { href: url, download: `dogovor-${(car.plate || 'kola').replace(/\s+/g, '')}.html` }); document.body.appendChild(a); a.click(); a.remove(); }
}

// ---------- 5) Отчет за счетоводителя – Excel (CSV) по коли за месец ----------
export function accountantSheet(infos) {
  const today = todayStr();
  const opts = { [startOfMonth(today)]: cap(MONTHS[parseDate(today).getMonth()]) };
  let m = startOfMonth(today);
  for (let k = 0; k < 5; k++) { m = startOfMonth(addDays(m, -1)); opts[m] = cap(MONTHS[parseDate(m).getMonth()]) + ' ' + m.slice(0, 4); }
  let pick = startOfMonth(addDays(startOfMonth(today), -1));
  openSheet((close) => {
    const seg = h('div');
    const draw = () => seg.replaceChildren(segmented(opts, pick, (k) => { pick = k; draw(); }, { small: true, page: true, wrap: true }));
    draw();
    return h('div', { class: 'form' },
      sheetHead('Отчет за счетоводителя', close, 'Excel с всяка кола: събран наем, разходи и печалба, и всички плащания и разходи по дати.'),
      seg,
      h('button', { class: 'btn btn-primary btn-lg', onclick: () => { exportFleetCsv(infos, pick, endOfMonth(pick)); close(); toast('Файлът е свален'); } }, icon('download', 18), 'Свали Excel'));
  });
}
const cap = (s) => s.replace(/^./, (x) => x.toUpperCase());
export function exportFleetCsv(infos, from, to) {
  const n = (v) => String(Math.round((Number(v) || 0) * 100) / 100).replace('.', ',');
  const rows = [[`Автопарк – ${fmtDate(from)} – ${fmtDate(to)} ${to.slice(0, 4)}`], [], ['Кола', 'Рег. номер', 'Събран наем', 'Разходи', 'Печалба']];
  const tot = { income: 0, expense: 0, net: 0 };
  for (const i of infos) {
    const p = carProfit(i.costs, i.logs, from, to); tot.income += p.income; tot.expense += p.expense; tot.net += p.net;
    rows.push([i.car.name || '', i.car.plate || '', n(p.income), n(p.expense), n(p.net)]);
  }
  rows.push(['Общо', '', n(tot.income), n(tot.expense), n(tot.net)], [], ['Дата', 'Кола', 'Вид', 'Описание', 'Сума']);
  const lines = [];
  for (const i of infos) {
    for (const l of i.logs) {
      if (!l.date || l.date < from || l.date > to) continue;
      if (l.kind === 'pay' && l.status === 'ok') lines.push([l.date, i.car.plate || i.car.name, 'Наем', i.users[l.driverId]?.name || '', n(l.amount)]);
      if (l.kind === 'deposit' || l.kind === 'refund' || l.kind === 'deduct' || l.kind === 'fine') lines.push([l.date, i.car.plate || i.car.name, ({ deposit: 'Депозит', refund: 'Върнат депозит', deduct: 'Удръжка', fine: 'Глоба' })[l.kind], [i.users[l.driverId]?.name, l.text].filter(Boolean).join(' – '), n(l.kind === 'refund' ? -l.amount : l.amount)]);
    }
    for (const c of i.costs) {
      if (c.period === 'once' && c.startDate >= from && c.startDate <= to) lines.push([c.startDate, i.car.plate || i.car.name, costCat(c.category).label || 'Разход', c.name || '', n(-c.amount)]);
    }
    const fixed = carCostSum(i.costs.filter((c) => c.period !== 'once'), from, to);
    if (fixed) lines.push([to, i.car.plate || i.car.name, 'Постоянни разходи', 'застраховки, данък, винетка… (частта за месеца)', n(-fixed)]);
  }
  lines.sort((a, b) => a[0].localeCompare(b[0]));
  rows.push(...lines.map((r) => [fmtDate(r[0]) + ' ' + r[0].slice(0, 4), ...r.slice(1).map((x) => String(x).replace(/[;\n]/g, ' '))]));
  const csv = '﻿' + rows.map((x) => x.join(';')).join('\r\n');
  const a = h('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: `chisto-avtopark-${from.slice(0, 7)}.csv` });
  document.body.appendChild(a); a.click(); a.remove();
}

// ---------- 6) Обява за свободна кола – текст за Viber, Facebook, OLX ----------
export function adText(info) {
  const car = info.car; const me = store.currentUser(); const prof = store.getProfile() || {};
  const last = [...info.members].reverse().find((m) => m.rent?.amount)?.rent;
  const ask = car.rentAsk || (last ? { amount: last.amount, period: last.period } : null);
  return [
    `🚕 Давам под наем ${car.name || 'кола'} за такси${prof.city ? ' – ' + prof.city : ''}`,
    car.plate ? `Рег. № ${car.plate}` : null,
    ask?.amount ? `Наем: ${money(ask.amount)} ${RENT_PERIODS[ask.period] || ''}` : null,
    car.docs?.casco ? 'С каско и гражданска.' : car.docs?.insurance ? 'С гражданска отговорност.' : null,
    'Отчитане през приложението „Чисто“ – виждаш наема и плащанията си.',
    me?.phone ? `Тел.: ${me.phone}` : null,
  ].filter(Boolean).join('\n');
}
export function adSheet(info) {
  const ta = h('textarea', { class: 'input', rows: 7 }, adText(info));
  openSheet((close) => h('div', { class: 'form' },
    sheetHead('Обява за колата', close, 'Готов текст – промени го, ако искаш, и го прати във Viber, Facebook групи или OLX.'),
    ta,
    h('div', { class: 'row gap' },
      h('button', { class: 'btn btn-dark grow', onclick: async () => { try { await navigator.clipboard.writeText(ta.value); toast('Копирано'); } catch { ta.select(); toast('Копирай текста'); } } }, icon('copy', 16), 'Копирай'),
      navigator.share && h('button', { class: 'btn btn-primary grow', onclick: () => navigator.share({ text: ta.value }).catch(() => {}) }, icon('share', 16), 'Изпрати'))));
}
