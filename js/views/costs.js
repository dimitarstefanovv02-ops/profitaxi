// Постоянни разходи, падежи и напомняния (с „Платено“ и известия)

import { h, fill, icon, cx, money, money2, todayStr, fmtDate, parseNum, parseDate } from '../util.js';
import * as store from '../store.js';
import { COST_CATS, PERIODS, costCat, fixedCats } from '../constants.js';
import { openCategories } from './categories.js';
import { monthlyFixed, costMonthly, upcomingReminders, currentKm, activeCosts } from '../calc.js';
import { openSheet, sheetHead, confirmSheet, toast, field, segmented, empty, cardTitle, hero } from '../ui.js';
import { notifyPermission, notifySupported, requestNotify, checkNotifications } from '../notify.js';
import { reminderText } from './home.js';
import { askFrom } from './profile.js';

export function costsView({ go, data }) {
  const active = activeCosts(data.costs).sort((a, b) => costMonthly(b, data.profile) - costMonthly(a, data.profile));
  const perMonth = monthlyFixed(data.costs, data.profile);
  const rems = upcomingReminders(data, 30);
  const next = rems.find((r) => r.kind === 'cost' && r.daysLeft >= 0);
  const rent = data.profile.carType === 'rent';
  const km = currentKm(data.shifts);

  return h('div', { class: 'screen', 'data-page': 'costs' },
    hero(
      h('div', { class: 'hero-top' },
        h('div', null, h('h1', null, 'Разходи'), h('div', { class: 'hero-sub' }, 'Постоянни разходи и плащания')),
        h('button', { class: 'hero-btn', 'aria-label': 'Нов разход', onclick: () => editCost({}, data) }, icon('plus', 22))),
      h('div', { class: 'hero-num' }, money(perMonth)),
      h('div', { class: 'hero-sub' }, 'на месец, разпределени по дни'),
      h('div', { class: 'hero-chips' },
        h('span', { class: 'hero-chip' }, icon('calendar', 14), `${money2(perMonth / 30.44)} на ден`),
        next && h('span', { class: 'hero-chip' }, icon('bell', 14), `следващо: ${next.title}, ${next.daysLeft === 0 ? 'днес' : next.daysLeft === 1 ? 'утре' : `след ${next.daysLeft} дни`}`),
        data.profile.sharePct < 100 && h('span', { class: 'hero-chip' }, icon('users', 14), `твоят дял ${data.profile.sharePct}%`))),

    notifyBox(data),

    // Плащания и напомняния
    h('div', { class: 'month-head' }, h('h2', null, 'Предстоящи плащания'),
      h('button', { class: 'chip page', onclick: () => editReminder({}, km) }, icon('plus', 14), 'Напомняне')),
    rems.length
      ? h('div', { class: 'card', style: { padding: '4px 16px' } }, rems.map((r) => remRow(r, data, km)))
      : h('div', { class: 'card' }, h('p', { class: 'muted small' }, 'Добави дата на следващо плащане към разход (застраховка, винетка, такса) или напомняне за сервиз на километри.')),

    // Постоянни разходи
    h('div', { class: 'month-head' }, h('h2', null, 'Постоянни разходи'),
      h('div', { class: 'row', style: { gap: '6px' } },
        h('button', { class: 'chip', onclick: () => openCategories() }, icon('tag', 14), 'Категории'),
        h('button', { class: 'chip page', onclick: () => editCost({}, data) }, icon('plus', 14), 'Добави'))),
    active.length
      ? h('div', { class: 'card', style: { padding: '4px 16px' } }, active.map((c) => costRow(c, data, go)))
      : empty('wallet', 'Няма постоянни разходи', 'Добави наем, такси, данъци и други, за да виждаш реалната си печалба.'),
    rent && h('p', { class: 'auto-note' }, icon('key', 15), 'Колата е под наем, затова застраховки, винетка, преглед и сервиз не се показват. Те са грижа на собственика.'),
    h('p', { class: 'auto-note' }, icon('alert', 15), 'Постоянните разходи се разпределят по дни и се вадят от печалбата автоматично.'));
}

function notifyBox(data) {
  if (!notifySupported()) return null;
  const perm = notifyPermission();
  if (data.profile.notify && perm === 'granted') return null;
  return h('div', { class: 'notify-box' },
    h('span', { class: 't-ic' }, icon('bell', 18)),
    h('div', { class: 'grow small' }, h('b', null, 'Известия за плащания'), h('div', { class: 'muted' }, perm === 'denied' ? 'Известията са забранени в браузъра. Разреши ги от настройките на сайта.' : '3, 2 и 1 ден преди падеж и в деня на плащането.')),
    perm !== 'denied' && h('button', { class: 'btn btn-page btn-sm', onclick: async () => {
      const r = await requestNotify();
      if (r === 'granted') { store.updateProfile({ notify: true }); toast('Известията са включени'); checkNotifications(store.myData()); }
      else toast('Известията не са разрешени', 'err');
    } }, 'Включи'));
}

// Изтриване: от този месец (не се смята изобщо за него) или от днес
function askDelete(d) {
  const today = todayStr(), m0 = today.slice(0, 8) + '01';
  const pick = (from, close) => { close(); store.deleteCost(d.id, { from }); toast('Разходът е изтрит'); };
  openSheet((close) => h('div', { class: 'form' },
    sheetHead(`Да изтрия ли „${d.name}“?`, close, 'Миналите месеци остават същите'),
    h('button', { class: 'btn btn-danger btn-lg btn-block', onclick: () => pick(m0, close) }, icon('trash', 20), 'Изтрий и за този месец'),
    today !== m0 && h('button', { class: 'btn btn-ghost btn-lg btn-block', onclick: () => pick(today, close) }, 'Спри го от днес'),
    h('p', { class: 'muted small' }, '„За този месец“ – ако не го плащаш изобщо. „От днес“ – ако си го плащал досега и спираш.')));
}

// Наем и ефир идват от профила: тук може да се смени от кога важат
function systemCost(c, go) {
  openSheet((close) => h('div', { class: 'form' },
    sheetHead(c.name, close, `${money(c.amount, c.amount % 1 ? 2 : 0)} ${PERIODS[c.period]?.label || ''}`),
    h('div', { class: 'info-box' }, icon('calendar', 18), h('span', null, 'Смята се от ', h('b', null, fmtDate(c.startDate, { year: true })), '. Сумата се сменя от „Колата и ефирът“.')),
    h('button', { class: 'btn btn-primary btn-lg btn-block', onclick: () => { close(); askFrom((from) => { store.updateProfile({}, { from }); toast(`Смята се от ${fmtDate(from)}`); }); } }, icon('calendar', 20), 'Смени от кога важи'),
    h('button', { class: 'btn btn-ghost btn-lg btn-block', onclick: () => { close(); go('/car'); } }, icon('edit', 20), 'Промени сумата')));
}

function costRow(c, data, go) {
  const cat = costCat(c.category);
  const left = c.dueDate ? Math.round((parseDate(c.dueDate) - parseDate(todayStr())) / 86400000) : null;
  return h('button', { class: 'cost-row', style: { '--rc': cat.color }, onclick: () => (c.system ? systemCost(c, go) : editCost(c, data)) },
    h('div', { class: 'cost-ic' }, icon(cat.icon, 20)),
    h('div', { class: 'grow' },
      h('div', { class: 'cost-name' }, c.name),
      h('div', { class: 'cost-det' },
        h('span', null, `${money(c.amount, c.amount % 1 ? 2 : 0)} ${PERIODS[c.period]?.label || ''}`),
        c.perWorkDay && h('span', null, 'само работни дни'),
        c.system && h('span', { class: 'chip', style: { padding: '2px 8px' } }, `от ${fmtDate(c.startDate)}`),
        left != null && h('span', { class: cx('chip', left < 0 ? 'bad' : left <= 7 ? 'warn' : ''), style: { padding: '2px 8px' } }, `плащане ${fmtDate(c.dueDate)}`),
        c.endDate && h('span', { class: 'chip', style: { padding: '2px 8px' } }, `до ${fmtDate(c.endDate, { year: true })}`))),
    h('div', { class: 'cost-amt' }, h('b', null, money(costMonthly(c, data.profile))), h('span', null, 'на месец')));
}

function remRow(r, data, km) {
  const bad = (r.daysLeft ?? 1) < 0 || (r.kmLeft ?? 1) < 0;
  const days = r.daysLeft ?? (r.kmLeft != null ? Math.round(r.kmLeft / 80) : null);
  const big = r.daysLeft != null ? (r.daysLeft < 0 ? '!' : r.daysLeft === 0 ? 'днес' : r.daysLeft) : r.kmLeft < 0 ? '!' : `${Math.round(r.kmLeft / 100) / 10}к`;
  const small = r.daysLeft != null ? (r.daysLeft < 0 ? 'изтекло' : r.daysLeft === 0 ? '' : r.daysLeft === 1 ? 'ден' : 'дни') : r.kmLeft < 0 ? 'просрочено' : 'км';
  const cost = r.kind === 'cost' ? r.ref : null;
  const last = cost?.payments?.length ? cost.payments[cost.payments.length - 1] : null;
  const paid = () => {
    if (cost) { const c = store.markCostPaid(cost.id); toast(c?.dueDate ? `Платено. Следващо плащане: ${fmtDate(c.dueDate, { year: true })}` : 'Отбелязано като платено'); }
    else { store.markReminderDone(r.ref.id, km); toast('Отбелязано като готово'); }
  };
  return h('div', { class: 'rem' },
    h('div', { class: 'rem-main' },
      h('div', { class: cx('rem-days', bad ? 'bad' : days != null && days <= 3 ? 'bad' : days != null && days <= 14 ? 'warn' : '') }, h('b', null, big), small && h('span', null, small)),
      h('div', { class: 'grow' },
        h('div', { style: { fontWeight: 700 } }, r.title),
        h('div', { class: 'muted small' }, reminderText(r)),
        cost && h('div', { class: 'faint small' }, `${PERIODS[cost.period]?.every || ''}${last ? `, последно платено ${fmtDate(last.date)}` : ''}`)),
      h('button', { class: 'icon-btn plain', 'aria-label': 'Редактирай', onclick: () => (cost ? editCost(cost, data) : editReminder(r.ref, km)) }, icon('edit', 18))),
    ((days != null && days <= 14) || bad) && h('div', { class: 'rem-actions' },
      h('button', { class: 'btn btn-ok btn-sm', onclick: paid }, icon('check', 16), cost ? 'Платено' : 'Готово')));
}

function editCost(c, data) {
  const isNew = !c.id;
  const rent = data.profile.carType === 'rent';
  const list = fixedCats(data.profile);
  const first = list[0] || { key: 'other', ...COST_CATS.other };
  const d = { name: '', category: first.key, amount: 0, period: 'month', dueDate: '', endDate: '', ...c };
  if (isNew) { d.name = first.label; d.period = first.period || 'month'; }
  openSheet((close) => {
    const body = h('div', { class: 'form' });
    const nameIn = h('input', { class: 'input', value: d.name, oninput: (e) => { d.name = e.target.value; } });
    const amountIn = h('input', { class: 'input', inputmode: 'decimal', placeholder: '0', value: d.amount ? String(d.amount).replace('.', ',') : '' });
    const dueIn = h('input', { class: 'input', type: 'date', value: d.dueDate || '' });
    const endIn = h('input', { class: 'input', type: 'date', value: d.endDate || '' });
    const err = h('p', { class: 'err' });
    const cats = list.map((x) => [x.key, x]);
    const draw = () => fill(body,
      isNew && h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Вид'),
        h('div', { class: 'chips', style: { marginBottom: 0 } }, cats.map(([k, v]) =>
          h('button', { type: 'button', class: cx('chip-btn', d.category === k && 'on'), onclick: () => {
            const auto = !d.name || d.name === costCat(d.category).label;
            d.category = k; if (auto) { d.name = v.label; nameIn.value = v.label; }
            d.period = v.period || d.period;
            draw();
          } }, v.label)),
          h('button', { type: 'button', class: 'chip-btn', style: { borderStyle: 'dashed', borderColor: 'var(--line)' }, onclick: () => { close(); openCategories(); } }, icon('plus', 14), 'Категория'))),
      field('Име', nameIn),
      field(`Сума ${PERIODS[d.period].label}`, amountIn),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Колко често се плаща'),
        segmented({ week: 'Седмица', month: 'Месец', quarter: '3 месеца', year: 'Година' }, d.period, (p) => { d.period = p; draw(); }, { small: true, page: true })),
      field('Следващо плащане', dueIn, 'Ще ти напомним 3, 2 и 1 ден преди това. След „Платено“ датата се мести с един период.'),
      field('Крайна дата', endIn, 'По желание. Напр. последната вноска по лизинг или договор. След нея разходът спира.'),
      !isNew && c.payments?.length > 0 && h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Плащания'),
        h('div', { class: 'small muted' }, c.payments.slice(-5).reverse().map((p) => h('div', null, `${fmtDate(p.date, { year: true })}: ${money(p.amount, p.amount % 1 ? 2 : 0)}`)))),
      err);
    draw();
    const save = () => {
      d.amount = parseNum(amountIn.value);
      d.dueDate = dueIn.value || null;
      d.endDate = endIn.value || null;
      if (!d.name.trim()) { err.textContent = 'Въведи име'; return; }
      if (!(d.amount > 0)) { err.textContent = 'Въведи сума'; return; }
      if (d.endDate && d.dueDate && d.endDate < d.dueDate) { err.textContent = 'Крайната дата е преди следващото плащане'; return; }
      store.saveCost(d); close(); toast(isNew ? 'Разходът е добавен' : 'Запазено');
    };
    return h('div', { class: 'form' },
      sheetHead(isNew ? 'Нов постоянен разход' : 'Постоянен разход', close),
      body,
      h('div', { class: 'row gap sheet-actions' },
        !isNew && h('button', { class: 'btn btn-ghost btn-lg', 'aria-label': 'Изтрий', onclick: () => { close(); askDelete(d); } }, icon('trash', 20)),
        h('button', { class: 'btn btn-page btn-lg grow', onclick: save }, 'Запази')));
  }, { tall: true });
}

function editReminder(r, km = 0) {
  const isNew = !r.id;
  const d = { title: '', dueDate: '', dueKm: 0, everyKm: 0, repeat: 'none', ...r };
  openSheet((close) => {
    const box = h('div', { class: 'form' });
    const title = h('input', { class: 'input', placeholder: 'напр. Смяна на масло', value: d.title, oninput: (e) => { d.title = e.target.value; } });
    const date = h('input', { class: 'input', type: 'date', value: d.dueDate || '', onchange: (e) => { d.dueDate = e.target.value; } });
    const kmIn = h('input', { class: 'input', inputmode: 'numeric', placeholder: km ? `сега: ${km.toLocaleString('bg-BG')}` : 'напр. 250000', value: d.dueKm || '' });
    const everyIn = h('input', { class: 'input', inputmode: 'numeric', placeholder: 'напр. 10000', value: d.everyKm || '' });
    const err = h('p', { class: 'err' });
    const draw = () => fill(box,
      field('Какво', title),
      field('На дата', date),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Повтаря се'),
        segmented({ none: 'Не', month: 'Месец', quarter: '3 месеца', year: 'Година' }, d.repeat, (v) => { d.repeat = v; draw(); }, { small: true, page: true })),
      field('Или на километраж', kmIn, 'Сравняваме с последния въведен километраж'),
      field('Повтаря се на всеки (км)', everyIn, 'По желание. След „Готово“ следващото напомняне се мести напред.'),
      err);
    draw();
    const save = () => {
      d.title = d.title.trim(); d.dueDate = date.value || null; d.dueKm = Math.round(parseNum(kmIn.value)) || null; d.everyKm = Math.round(parseNum(everyIn.value)) || null;
      if (!d.title) { err.textContent = 'Въведи заглавие'; return; }
      if (!d.dueDate && !d.dueKm) { err.textContent = 'Задай дата или километраж'; return; }
      store.saveReminder(d); close(); toast('Напомнянето е запазено');
    };
    return h('div', { class: 'form' },
      sheetHead(isNew ? 'Ново напомняне' : 'Напомняне', close),
      box,
      h('div', { class: 'row gap sheet-actions' },
        !isNew && h('button', { class: 'btn btn-ghost btn-lg', 'aria-label': 'Изтрий', onclick: () => { store.deleteReminder(d.id); close(); toast('Изтрито'); } }, icon('trash', 20)),
        h('button', { class: 'btn btn-page btn-lg grow', onclick: save }, 'Запази')));
  });
}
export { cardTitle };
