// Търсачка: готови отговори (работят без интернет), отговори за собствените числа
// („колко изкарах тази седмица“) и – ако няма отговор – въпрос към AI.

import { h, icon, money, todayStr, addDays, startOfWeek, startOfMonth, endOfMonth, parseDate, MONTHS, fmtDuration, fmtNum } from '../util.js';
import * as store from '../store.js';
import { periodStats } from '../calc.js';
import { KB } from '../kb.js';
import { toast } from '../ui.js';

// ---------- търсене в готовите отговори ----------
const STOP = new Set('как къде какво кой коя кое кои мога може ли да се на в във за и с със от ми ме ти те го я е са съм си сме сте има няма по при това този тази тези там тук когато защото или а но че ще бих искам трябва дали също вече още нещо някак кога колко'.split(' '));
const SYN = { ексел: 'excel', ексела: 'excel', exel: 'excel', пдф: 'pdf', фейс: 'face', болт: 'bolt', убер: 'uber', бензин: 'гориво', дизел: 'гориво', газ: 'гориво', метан: 'гориво', зареждане: 'гориво', заредих: 'гориво', пари: 'приходи', оборот: 'приходи', заработих: 'изкарах', спечелих: 'изкарах', печалба: 'чисто', тъмен: 'тъмна', нощен: 'тъмна', шрифт: 'текст', буквите: 'текст', парола: 'парола', пасуорд: 'парола' };
export const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[„“"'’.,!?;:()\[\]{}«»–—\-/\\]+/g, ' ').replace(/\s+/g, ' ').trim();
const ENDS = ['ията', 'ията', 'ите', 'ата', 'ото', 'ата', 'ът', 'ят', 'та', 'то', 'те', 'ия', 'ие', 'ах', 'ям', 'ем', 'им', 'ам', 'а', 'я', 'о', 'е', 'и', 'ъ', 'у'];
export function stem(w) {
  w = SYN[w] || w;
  if (w.length <= 4) return w;
  for (const e of ENDS) if (w.endsWith(e) && w.length - e.length >= 4) return w.slice(0, -e.length);
  return w;
}
const words = (s) => norm(s).split(' ').filter((w) => w && !STOP.has(w)).map(stem);
function lev1(a, b) { // разстояние ≤ 1 (една сгрешена, липсваща или излишна буква)
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, d = 0;
  while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++d > 1) return false; if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; } }
  return d + (a.length - i) + (b.length - j) <= 1;
}
const INDEX = KB.map((e, i) => ({ i, e, title: new Set(words(e.q)), all: new Set([...words(e.q), ...words(e.k)]) }));
export function searchKB(q, n = 3) {
  const qs = [...new Set(words(q))];
  if (!qs.length) return [];
  const out = [];
  for (const it of INDEX) {
    let score = 0, hit = 0;
    for (const w of qs) {
      let s = 0;
      if (it.all.has(w)) s = it.title.has(w) ? 3 : 2;
      else for (const t of it.all) { if (w.length >= 4 && t.length >= 4 && (t.startsWith(w) || w.startsWith(t))) { s = Math.max(s, 1.5); } else if (w.length >= 5 && t.length >= 5 && lev1(w, t)) s = Math.max(s, 1.2); }
      if (s) { score += s; hit++; }
    }
    if (hit) out.push({ e: it.e, score: score + hit / qs.length * 2 });
  }
  out.sort((a, b) => b.score - a.score);
  const best = out[0]?.score || 0;
  return out.filter((x) => x.score >= 2.5 && x.score >= best * 0.55).slice(0, n).map((x) => x.e);
}

// ---------- въпроси за собствените числа ----------
const has = (q, list) => list.some((w) => q.includes(w));
function period(q) {
  const t = todayStr();
  if (has(q, ['вчера'])) return { from: addDays(t, -1), to: addDays(t, -1), label: 'Вчера' };
  if (has(q, ['днес', 'тази смяна'])) return { from: t, to: t, label: 'Днес' };
  if (has(q, ['миналата седмица', 'предната седмица', 'миналата седм'])) { const f = addDays(startOfWeek(t), -7); return { from: f, to: addDays(f, 6), label: 'Миналата седмица' }; }
  if (has(q, ['седмица', 'седмицата'])) return { from: startOfWeek(t), to: t, label: 'Тази седмица' };
  if (has(q, ['миналия месец', 'предния месец', 'миналият месец'])) { const d = parseDate(t); d.setMonth(d.getMonth() - 1, 1); const f = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; return { from: f, to: endOfMonth(f), label: MONTHS[d.getMonth()] }; }
  if (has(q, ['година', 'годината'])) return { from: t.slice(0, 4) + '-01-01', to: t, label: `${t.slice(0, 4)} г.` };
  const m = MONTHS.findIndex((x) => q.includes(x.toLowerCase()));
  if (m >= 0) { let y = Number(t.slice(0, 4)); if (m > Number(t.slice(5, 7)) - 1) y--; const f = `${y}-${String(m + 1).padStart(2, '0')}-01`; return { from: f, to: endOfMonth(f), label: `${MONTHS[m]} ${y}` }; }
  return { from: startOfMonth(t), to: t, label: 'Този месец' };
}
export function personal(raw, data) {
  const q = ' ' + norm(raw) + ' ';
  const metric =
    has(q, ['гориво', 'бензин', 'дизел', ' газ', 'метан', 'зареждане', 'заредих']) ? 'fuel' :
    has(q, ['на час']) ? 'hour' :
    has(q, ['на км', 'на километър']) ? 'perkm' :
    has(q, ['часа', 'часове', 'колко време']) ? 'hours' :
    has(q, ['километр', ' км ']) ? 'km' :
    has(q, ['смени', 'колко смен']) ? 'shifts' :
    has(q, ['оборот', 'приход', 'взех', 'кеш', 'карта']) ? 'income' :
    has(q, ['разход', 'похарчих', 'харчих', 'платих']) ? 'exp' :
    has(q, ['изкарах', 'изкарвам', 'спечелих', 'заработих', 'чисто', 'печалб', 'остава', 'остана', 'направих']) ? 'net' : null;
  if (!metric || !(q.includes('колко') || has(q, ['ми е', 'моят', 'моите', 'днес', 'вчера', 'седмица', 'месец', 'година']))) return null;
  const p = period(q);
  const st = periodStats(data, p.from, p.to);
  const n = st.shifts;
  const sm = `${n} ${n === 1 ? 'смяна' : 'смени'}`;
  let a;
  if (!n && metric !== 'exp') a = `${p.label}: няма записани смени.`;
  else if (metric === 'net') a = `${p.label}: ${money(st.net)} чисто от ${sm}. Приход ${money(st.income)}, разходи ${money(st.totalExp)}.`;
  else if (metric === 'income') a = `${p.label}: приход ${money(st.income)} от ${sm} – кеш ${money(st.cash)}, карта ${money(st.card)}${st.app ? `, приложения ${money(st.app)}` : ''}${st.tips ? `, бакшиш ${money(st.tips)}` : ''}.`;
  else if (metric === 'fuel') { const f = st.expByCat.fuel || 0; const l = Object.values(st.fuel).reduce((a2, x) => a2 + (x.qty || 0), 0); a = `${p.label}: гориво ${money(f)}${l ? ` за ${fmtNum(Math.round(l))} л` : ''}${st.km ? `, ${fmtNum(st.km)} км` : ''}.`; }
  else if (metric === 'exp') a = `${p.label}: разходи ${money(st.totalExp)} – от смените ${money(st.varExp)}, постоянни ${money(st.fixedExp)}.`;
  else if (metric === 'hours') a = `${p.label}: ${fmtDuration(st.hours)} зад волана в ${sm}.`;
  else if (metric === 'km') a = `${p.label}: ${fmtNum(st.km)} км в ${sm}.`;
  else if (metric === 'shifts') a = `${p.label}: ${sm}, ${fmtDuration(st.hours)}.`;
  else if (metric === 'hour') a = `${p.label}: ${money(st.netPerHour, 2)} чисто на час (приход ${money(st.incomePerHour, 2)} на час).`;
  else if (metric === 'perkm') a = `${p.label}: ${money(st.netPerKm, 2)} чисто на км.`;
  return { q: raw, a, go: '#/stats', btn: 'Статистика' };
}

// ---------- екранът ----------
const POPULAR = ['Колко изкарах тази седмица?', 'Как да сваля Excel?', 'Как да въведа гориво и литри?', 'Забравих да пусна смяната', 'Как да добавя постоянен разход?', 'Кой месец е бил най-печеливш?'];
let lastQ = '';
export function searchView({ data, go }) {
  const root = h('div', { class: 'screen', 'data-page': 'search' });
  const input = h('input', { class: 'input search-in', type: 'search', placeholder: 'Напиши или кажи въпрос…', value: lastQ, enterkeyhint: 'search', autocomplete: 'off',
    oninput: () => { lastQ = input.value; renderRes(); } });
  const res = h('div', { class: 'search-res' });
  const mic = h('button', { class: 'icon-btn search-mic', type: 'button', 'aria-label': 'Кажи въпроса', onclick: async () => {
    const { openVoice } = await import('../voice.js');
    openVoice({ mode: 'text', title: 'Кажи въпроса', onText: (t) => { input.value = t; lastQ = t; renderRes(); } });
  } }, icon('mic', 22));
  const card = (r, kind) => h('section', { class: 'card ans' + (kind ? ' ' + kind : '') },
    kind === 'mine' && h('div', { class: 'ans-tag' }, icon('chart', 14), 'Твоите числа'),
    kind === 'ai' && h('div', { class: 'ans-tag' }, icon('sparkle', 14), 'Отговор от AI – провери в приложението'),
    r.q && kind !== 'ai' && h('h3', null, r.q),
    h('p', null, r.a),
    r.go && h('a', { class: 'btn btn-ghost btn-sm', href: r.go }, r.btn || 'Отвори', icon('right', 16)));
  async function askAI(q) {
    const box = h('section', { class: 'card ans ai' }, h('div', { class: 'ans-tag' }, icon('sparkle', 14), 'Питам AI…'), h('div', { class: 'ans-wait' }));
    res.querySelector('.ask-ai')?.replaceWith(box);
    const r = await store.driverCall('ask', { q });
    if (r.error) { box.replaceWith(h('section', { class: 'card ans' }, h('p', { class: 'muted' }, r.error), h('a', { class: 'btn btn-ghost btn-sm', href: '#/help' }, 'Пиши ни', icon('right', 16)))); return; }
    box.replaceWith(card({ a: r.answer }, 'ai'));
  }
  function renderRes() {
    const q = input.value.trim();
    if (q.length < 2) {
      res.replaceChildren(h('h2', { class: 'section-title' }, 'Често питат'),
        h('div', { class: 'chip-row search-pop' }, POPULAR.map((p) => h('button', { class: 'chip', type: 'button', onclick: () => { input.value = p; lastQ = p; renderRes(); } }, p))));
      return;
    }
    const mine = personal(q, data);
    const found = searchKB(q, mine ? 1 : 3);
    const list = [mine && card(mine, 'mine'), ...found.map((e) => card(e))].filter(Boolean);
    res.replaceChildren(...list,
      !list.length && h('p', { class: 'muted search-none' }, 'Нямам готов отговор за това.'),
      q.length >= 6 && h('button', { class: 'btn btn-outline btn-block ask-ai', type: 'button', onclick: () => (store.live() ? askAI(q) : toast('AI отговорите работят само на живия сайт', 'err')) }, icon('sparkle', 18), list.length ? 'Не е това? Питай AI' : 'Питай AI'));
  }
  root.append(
    h('button', { class: 'back sub-back', type: 'button', onclick: () => (history.length > 1 ? history.back() : go('/home')) }, icon('left', 20), 'Назад'),
    h('div', { class: 'page-title' }, h('h1', null, 'Търси')),
    h('p', { class: 'muted', style: { margin: '-6px 0 12px' } }, 'Как се прави нещо или колко си изкарал – питай с думи или с глас.'),
    h('div', { class: 'search-bar' }, h('span', { class: 'search-ic' }, icon('search', 20)), input, mic),
    res);
  renderRes();
  setTimeout(() => { if (!lastQ) input.focus(); }, 200);
  return root;
}
