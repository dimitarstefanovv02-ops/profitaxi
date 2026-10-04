// Постоянни разходи и напомняния

import { h, fill, icon, cx, money, money2, todayStr, fmtDate, parseNum } from '../util.js';
import * as store from '../store.js';
import { COST_CATS, PERIODS } from '../constants.js';
import { monthlyFixed, costMonthly, upcomingReminders, currentKm } from '../calc.js';
import { openSheet, sheetHead, confirmSheet, toast, field, segmented, empty } from '../ui.js';
import { reminderText } from './home.js';

export function costsView({ go, data }) {
  const today = todayStr();
  const active = data.costs.filter((c) => !c.endDate || c.endDate >= today).sort((a, b) => costMonthly(b, data.profile) - costMonthly(a, data.profile));
  const perMonth = monthlyFixed(data.costs, data.profile);
  const rems = upcomingReminders(data, 30);

  return h('div', { class: 'screen' },
    h('div', { class: 'top' }, h('div', null, h('h1', null, 'Разходи'), h('div', { class: 'sub' }, 'Постоянни разходи и срокове'))),

    h('div', { class: 'grid2' },
      h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'На месец'), h('span', { class: 'stat-value' }, money(perMonth))),
      h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'На ден'), h('span', { class: 'stat-value' }, money2(perMonth / 30.4)))),
    data.profile.sharePct < 100 && h('p', { class: 'auto-note' }, icon('users', 15), `Разходите за колата са сметнати с твоя дял: ${data.profile.sharePct}%`),

    // Напомняния
    h('div', { class: 'month-head' }, h('h2', null, 'Напомняния'),
      h('button', { class: 'chip', onclick: () => editReminder({}) }, icon('plus', 14), 'Добави')),
    rems.length
      ? h('div', { class: 'card', style: { padding: '4px 16px' } }, rems.map((r) => remRow(r, data)))
      : h('div', { class: 'card' }, h('p', { class: 'muted small' }, 'Добави дата на изтичане към застраховка, винетка или преглед, или напомняне за сервиз на определени километри.')),

    // Постоянни разходи
    h('div', { class: 'month-head' }, h('h2', null, 'Постоянни разходи'),
      h('button', { class: 'chip', onclick: () => editCost({}) }, icon('plus', 14), 'Добави')),
    active.length
      ? h('div', { class: 'card', style: { padding: '4px 16px' } }, active.map((c) => costRow(c, data, go)))
      : empty('wallet', 'Няма постоянни разходи', 'Добави застраховки, винетка, наем и други, за да виждаш реалната си печалба.'),
    h('p', { class: 'auto-note' }, icon('alert', 15), 'Постоянните разходи се разпределят по дни и се вадят от печалбата автоматично.'));
}

function costRow(c, data, go) {
  const cat = COST_CATS[c.category] || COST_CATS.other;
  const left = c.dueDate ? Math.round((new Date(c.dueDate) - new Date(todayStr())) / 86400000) : null;
  return h('button', { class: 'cost-row', onclick: () => (c.system ? go('/profile') : editCost(c)) },
    h('div', { class: 'cost-ic' }, icon(cat.icon, 20)),
    h('div', { class: 'grow' },
      h('div', { class: 'cost-name' }, c.name),
      h('div', { class: 'cost-det' },
        h('span', null, `${money(c.amount, c.amount % 1 ? 2 : 0)} ${PERIODS[c.period].label}`),
        c.perWorkDay && h('span', null, 'само работни дни'),
        c.system && h('span', { class: 'chip', style: { padding: '2px 8px' } }, 'от профила'),
        left != null && h('span', { class: cx('chip', left < 0 ? 'bad' : left <= 30 ? 'warn' : ''), style: { padding: '2px 8px' } }, `до ${fmtDate(c.dueDate, { year: true })}`))),
    h('div', { class: 'cost-amt' }, h('b', null, money(costMonthly(c, data.profile))), h('span', null, 'на месец')));
}

function remRow(r, data) {
  const days = r.daysLeft ?? (r.kmLeft != null ? Math.round(r.kmLeft / 80) : null);
  const bad = (r.daysLeft ?? 1) < 0 || (r.kmLeft ?? 1) < 0;
  const big = r.daysLeft != null ? (r.daysLeft < 0 ? '!' : r.daysLeft) : r.kmLeft < 0 ? '!' : `${Math.round(r.kmLeft / 100) / 10}к`;
  const small = r.daysLeft != null ? (r.daysLeft < 0 ? 'изтекло' : r.daysLeft === 1 ? 'ден' : 'дни') : r.kmLeft < 0 ? 'просрочено' : 'км';
  return h('div', { class: 'rem' },
    h('div', { class: cx('rem-days', bad ? 'bad' : days != null && days <= 14 ? 'warn' : '') }, h('b', null, big), h('span', null, small)),
    h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 } }, r.title), h('div', { class: 'muted small' }, reminderText(r))),
    h('button', { class: 'icon-btn plain', 'aria-label': 'Редактирай', onclick: () => (r.kind === 'cost' ? editCost(r.ref) : editReminder(r.ref, currentKm(data.shifts))) }, icon('edit', 18)));
}

function editCost(c) {
  const isNew = !c.id;
  const d = { name: '', category: 'insurance', amount: 0, period: 'year', dueDate: '', ...c };
  if (isNew) d.name = COST_CATS[d.category].label;
  openSheet((close) => {
    const body = h('div');
    const nameIn = h('input', { class: 'input', value: d.name, oninput: (e) => { d.name = e.target.value; } });
    const amountIn = h('input', { class: 'input', inputmode: 'decimal', placeholder: '0', value: d.amount ? String(d.amount).replace('.', ',') : '' });
    const dueIn = h('input', { class: 'input', type: 'date', value: d.dueDate || '' });
    const err = h('p', { class: 'err' });
    const cats = Object.entries(COST_CATS).filter(([, v]) => !v.system);
    const draw = () => fill(body, 
      isNew && h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Вид'),
        h('div', { class: 'chips', style: { marginBottom: 0 } }, cats.map(([k, v]) =>
          h('button', { type: 'button', class: cx('chip-btn', d.category === k && 'on'), onclick: () => {
            const auto = !d.name || d.name === COST_CATS[d.category].label;
            d.category = k; if (auto) { d.name = v.label; nameIn.value = v.label; }
            if (['insurance', 'casco', 'vignette', 'inspection', 'license'].includes(k)) d.period = 'year';
            draw();
          } }, v.label)))),
      field('Име', nameIn),
      field('Сума', amountIn),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Колко често'),
        segmented({ day: 'Ден', week: 'Седмица', month: 'Месец', year: 'Година' }, d.period, (p) => { d.period = p; draw(); }, { small: true })),
      field('Валидно до', dueIn, 'По желание. Ще ти напомним преди да изтече.'),
      err);
    draw();
    const save = () => {
      d.amount = parseNum(amountIn.value);
      d.dueDate = dueIn.value || null;
      if (!d.name.trim()) { err.textContent = 'Въведи име'; return; }
      if (!(d.amount > 0)) { err.textContent = 'Въведи сума'; return; }
      store.saveCost(d); close(); toast(isNew ? 'Разходът е добавен' : 'Запазено');
    };
    return h('div', { class: 'form' },
      sheetHead(isNew ? 'Нов постоянен разход' : 'Постоянен разход', close),
      body,
      h('div', { class: 'row gap' },
        !isNew && h('button', { class: 'btn btn-ghost btn-lg', 'aria-label': 'Изтрий', onclick: () => { close(); confirmSheet({ title: 'Да изтрия ли разхода?', text: 'Ще спре да се смята от днес. Миналите месеци остават същите.', okLabel: 'Изтрий', danger: true, onOk: () => { store.deleteCost(d.id); toast('Разходът е изтрит'); } }); } }, icon('trash', 20)),
        h('button', { class: 'btn btn-primary btn-lg grow', onclick: save }, 'Запази')));
  }, { tall: true });
}

function editReminder(r, km = 0) {
  const isNew = !r.id;
  const d = { title: '', dueDate: '', dueKm: 0, ...r };
  openSheet((close) => {
    const title = h('input', { class: 'input', placeholder: 'напр. Смяна на масло', value: d.title });
    const date = h('input', { class: 'input', type: 'date', value: d.dueDate || '' });
    const kmIn = h('input', { class: 'input', inputmode: 'numeric', placeholder: km ? `сега: ${km.toLocaleString('bg-BG')}` : 'напр. 250000', value: d.dueKm || '' });
    const err = h('p', { class: 'err' });
    const save = () => {
      d.title = title.value.trim(); d.dueDate = date.value || null; d.dueKm = Math.round(parseNum(kmIn.value)) || null;
      if (!d.title) { err.textContent = 'Въведи заглавие'; return; }
      if (!d.dueDate && !d.dueKm) { err.textContent = 'Задай дата или километраж'; return; }
      store.saveReminder(d); close(); toast('Напомнянето е запазено');
    };
    return h('div', { class: 'form' },
      sheetHead(isNew ? 'Ново напомняне' : 'Напомняне', close),
      field('Какво', title),
      field('На дата', date),
      field('Или на километраж', kmIn, 'Сравняваме с последния въведен километраж'),
      err,
      h('div', { class: 'row gap' },
        !isNew && h('button', { class: 'btn btn-ghost btn-lg', 'aria-label': 'Изтрий', onclick: () => { store.deleteReminder(d.id); close(); toast('Изтрито'); } }, icon('trash', 20)),
        h('button', { class: 'btn btn-primary btn-lg grow', onclick: save }, 'Запази')));
  });
}
