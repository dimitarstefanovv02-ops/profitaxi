// Карта „Резултат от смяната“ – показва се веднага след приключване на смяна.
// Това е моментът, в който шофьорът вижда стойността: колко остана реално от днес.

import { h, icon, money, money2, fmtDuration, fmtNum } from '../util.js';
import { openSheet, celebrate } from '../ui.js';
import { shiftIncome, shiftHours, shiftKm, shiftNetAfterFixed, goalProgress } from '../calc.js';

export function showShiftResult(data, shiftId) {
  const s = data.shifts.find((x) => x.id === shiftId);
  if (!s || !s.end) return;
  const hrs = shiftHours(s);
  const net = shiftNetAfterFixed(data, s);
  const rate = hrs ? net / hrs : 0;
  // средно на час от последните 20 смени преди тази
  const prev = data.shifts.filter((x) => x.end && x.id !== s.id).slice(0, 20);
  const pH = prev.reduce((a, x) => a + shiftHours(x), 0);
  const avgRate = pH ? prev.reduce((a, x) => a + shiftNetAfterFixed(data, x), 0) / pH : null;
  const diff = avgRate && rate ? (rate - avgRate) / Math.abs(avgRate) : null;
  const g = goalProgress(data);
  const verdict = diff == null ? null
    : diff >= 0.05 ? { cls: 'up', text: `${Math.round(diff * 100)}% над средното ти на час`, ic: 'trophy' }
    : diff <= -0.05 ? { cls: 'down', text: `${Math.round(-diff * 100)}% под средното ти на час`, ic: 'chart' }
    : { cls: 'eq', text: 'Колкото средното ти на час', ic: 'check' };

  // Награда: вибрация и конфети (повече, ако целта е изпълнена)
  try { navigator.vibrate?.(g.done ? [40, 60, 40] : 35); } catch { /* */ }
  if (net > 0) setTimeout(() => celebrate(g.done ? 90 : 36), 180);
  openSheet((close) => h('div', { class: 'result' },
    h('div', { class: 'result-head' },
      h('span', { class: 'result-badge' }, icon('flame', 16), 'Смяната приключи'),
      h('button', { class: 'icon-btn plain', 'aria-label': 'Затвори', onclick: close }, icon('x'))),
    h('p', { class: 'result-label' }, 'Остават ти чисто от тази смяна'),
    h('div', { class: net >= 0 ? 'result-net' : 'result-net neg' }, `${net >= 0 ? '+' : ''}${money(net)}`),
    verdict && h('div', { class: `result-verdict ${verdict.cls}` }, icon(verdict.ic, 16), verdict.text),
    h('div', { class: 'result-grid' },
      cell('Чисто на час', money2(rate)),
      cell('Приход', money(shiftIncome(s))),
      cell('Време', fmtDuration(hrs)),
      cell('Километри', shiftKm(s) ? `${fmtNum(shiftKm(s))} км` : '—')),
    g.goal > 0 && h('div', { class: 'result-goal' },
      h('div', { class: 'row between' }, h('span', null, 'Цел за месеца'), h('b', null, `${Math.min(100, Math.round(g.pct * 100))}%`)),
      h('div', { class: 'result-bar' }, h('span', { style: { width: `${Math.min(100, Math.max(0, g.pct * 100))}%` } })),
      h('p', null, g.done ? 'Целта е изпълнена. Всичко оттук нататък е бонус.' : `Остават ${money(g.remaining)}${g.hoursNeeded != null ? `, около ${Math.ceil(g.hoursNeeded)} часа` : ''}.`)),
    h('button', { class: 'btn btn-primary btn-lg btn-block', onclick: close }, icon('check', 20), 'Супер')));
}

const cell = (label, value) => h('div', { class: 'result-cell' }, h('span', null, label), h('b', null, value));
