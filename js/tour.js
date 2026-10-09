// Кратка разходка: последователни карти, които посочват бутон или секция на екрана.
// Напред / Назад / Пропусни. Ползва се от шофьорското приложение и от админ панела.

import { h, icon } from './util.js';

let active = null;

export function startTour(steps, { onDone, home } = {}) {
  if (active) active.close(false);
  const here = () => (location.hash.slice(1).split('?')[0] || '/home');
  // „по желание“ стъпки (напр. „Изтегли“) остават само ако елементът ги има в момента
  const list = steps.filter((s) => s.go ? (!s.optional || (s.go === here() && !!document.querySelector(s.target))) : (!s.target || document.querySelector(s.target)));
  if (!list.length) return;
  let i = 0, token = 0;
  const hole = h('div', { class: 'tour-hole' });
  const card = h('div', { class: 'tour-card', role: 'dialog', 'aria-modal': 'true', 'aria-live': 'polite' });
  const root = h('div', { class: 'tour' }, h('div', { class: 'tour-shade' }), hole, card);
  document.body.appendChild(root);
  const find = (s) => s.target && [...document.querySelectorAll(s.target)].find((e) => e.getClientRects().length);

  const place = () => {
    const s = list[i]; if (!s) return;
    const el = find(s);
    const vw = innerWidth, vh = innerHeight;
    if (el) {
      const r = el.getBoundingClientRect(), pad = 6;
      Object.assign(hole.style, { display: 'block', left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${Math.min(r.height, vh * 0.6) + pad * 2}px` });
      root.classList.remove('center');
      const cw = Math.min(360, vw - 24);
      card.style.width = `${cw}px`;
      card.style.left = `${Math.min(Math.max(12, r.left + r.width / 2 - cw / 2), vw - cw - 12)}px`;
      const ch = card.offsetHeight || 200;
      const bottom = r.top + Math.min(r.height, vh * 0.6);
      const below = bottom + 14 + ch < vh;
      card.style.top = below ? `${bottom + 14}px` : `${Math.max(12, r.top - ch - 14)}px`;
      if (!below && r.top - ch - 14 < 12) card.style.top = `${Math.max(12, vh - ch - 12)}px`;
    } else {
      hole.style.display = 'none';
      root.classList.add('center');
      card.style.width = `${Math.min(380, vw - 24)}px`;
      card.style.left = `${(vw - Math.min(380, vw - 24)) / 2}px`;
      card.style.top = `${Math.max(20, vh / 2 - (card.offsetHeight || 220) / 2)}px`;
    }
  };
  // Отваря страницата на стъпката и изчаква елемента да се появи
  const open = async (s, my) => {
    if (s.go && here() !== s.go) {
      active.nav = true; location.hash = s.go;
      await new Promise((r) => setTimeout(r, 60));
      active && (active.nav = false);
    }
    const t0 = Date.now();
    while (s.target && !find(s) && Date.now() - t0 < 1500 && my === token) await new Promise((r) => setTimeout(r, 50));
    const el = find(s);
    if (el && s.open) { const d = el.matches('details') ? el : el.closest('details') || el.querySelector('details'); if (d) d.open = true; }
    return el;
  };
  const show = async () => {
    const my = ++token;
    const s = list[i];
    card.style.visibility = 'hidden'; hole.style.display = 'none';
    const el = await open(s, my);
    if (my !== token || !active) return;
    const last = i === list.length - 1;
    card.replaceChildren(
      h('div', { class: 'tour-top' }, h('span', { class: 'tour-step' }, `${i + 1} от ${list.length}`),
        h('button', { class: 'tour-skip', onclick: () => close(true) }, 'Пропусни')),
      h('h3', null, s.title),
      h('p', null, s.text),
      h('div', { class: 'tour-bar' }, h('i', { style: { width: `${Math.round(((i + 1) / list.length) * 100)}%` } })),
      h('div', { class: 'tour-btns' },
        i > 0 ? h('button', { class: 'btn btn-ghost', onclick: () => { i--; show(); } }, icon('left', 18), 'Назад') : h('span'),
        h('button', { class: 'btn btn-primary', onclick: () => { if (last) close(true); else { i++; show(); } } }, last ? 'Готово' : 'Напред', !last && icon('right', 18))));
    if (el) el.scrollIntoView({ block: el.offsetHeight > innerHeight * 0.5 ? 'start' : 'center', behavior: 'instant' });
    requestAnimationFrame(() => { place(); card.style.visibility = ''; });
    card.querySelector('.btn-primary')?.focus({ preventScroll: true });
  };
  const onKey = (e) => { if (e.key === 'Escape') close(true); if (e.key === 'ArrowRight' && i < list.length - 1) { i++; show(); } if (e.key === 'ArrowLeft' && i > 0) { i--; show(); } };
  const close = (finished) => {
    token++;
    root.remove(); removeEventListener('resize', place); removeEventListener('scroll', place, true); document.removeEventListener('keydown', onKey);
    const wasNav = list.some((s) => s.go);
    active = null;
    if (finished && wasNav && home && here() !== home) location.hash = home;
    if (finished) onDone?.();
  };
  addEventListener('resize', place); addEventListener('scroll', place, true); document.addEventListener('keydown', onKey);
  active = { close, nav: false };
  show();
}
export const tourOpen = () => !!active;
// При смяна на екрана от шофьора разходката се затваря (броим я за видяна). Собствените ѝ преходи не я затварят.
export function closeTour() { if (active && !active.nav) active.close(true); }

// Стъпки за шофьора (началният екран)
export const DRIVER_TOUR = [
  { go: '/home', target: '.meter, .first-day', title: 'Добре дошъл! Това е главното 👋', text: 'Голямото число е колко си изкарал чисто този месец – след горивото, наема, ефира и всички разходи. Натисни целта под него, за да я смениш.' },
  { go: '/home', target: '.install-bar', optional: true, title: 'Сложи го на телефона', text: 'Натисни „Изтегли“ и ProfiTaxi застава като иконка на началния екран – отваря се като приложение и праща напомняния.' },
  { go: '/home', target: '.shift-cta, .live', title: 'Започни смяна', text: 'Натискаш, когато тръгваш, и въвеждаш километража. Забрави ли – „Въведи минала смяна“ отдолу.' },
  { go: '/shift/new', target: '[data-sec="inc"]', title: 'Въвеждане за 10 секунди', text: 'Смяната е три полета: Данни, Приходи, Разходи. До всеки ред има „+ Въведи“. Или натисни „Кажи смяната на глас“ и кажи „кеш 120, карта 80, гориво 40“.' },
  { go: '/home', target: '.hello-search', title: 'Не знаеш нещо? Питай', text: 'Лупата отваря търсачката: „как да сваля Excel“ или „колко изкарах тази седмица“ – с думи или с глас.' },
  { go: '/home', target: '.nav', title: 'Още три бутона долу', text: '„Пари“ – месецът, статистиката, постоянните разходи и Excel. „Профил“ – лични данни, колата и помощ. На всеки екран първия път ще видиш кратка подсказка.' },
];


// Стъпки за администратора
export const ADMIN_TOUR = [
  { title: 'Админ панел', text: 'Кратка разходка по основното. Пускаш я пак от бутона „Помощ“ в менюто.' },
  { target: '.happened', title: 'Днес се случи', text: 'Какво е ново от сутринта: регистрации, изтекли абонаменти, сигнали, въпроси и идеи. Натисни, за да отидеш там.' },
  { target: '#adm-search', title: 'Търсене навсякъде', text: 'Шофьор по име, телефон или номер на колата, фирма, код – от всяка страница.' },
  { target: '#adm-bell', title: 'Известия', text: 'Новите сигнали на едно място: дубликати, странни смени, неуспешни плащания, въпроси.' },
  { target: '#adm-arrange', title: 'Подреди', text: 'Влачи картите, числата, бутоните и менюто, както ти е удобно. Можеш и да скриваш неща.' },
  { target: '.scope-bar', title: 'Град и фирма', text: 'Филтърът важи за Днес, Шофьори, Растеж, Статистика и Пари.' },
  { target: '.adm-nav a[href="#/drivers"]', title: 'Шофьори', text: 'Списък, първите стъпки на новите и здравето на всеки акаунт.' },
  { target: '.adm-nav a[href="#/control"]', title: 'Контрол', text: 'Сигнали, дубликати, странни смени, грешки и дневник кой какво е правил.' },
  { target: '.adm-nav a[href="#/messages"]', title: 'Съобщения', text: 'Въпросите на шофьорите и съобщенията до тях – с шаблони и насрочване.' },
  { target: '.adm-nav a[href="#/money"]', title: 'Пари', text: 'Приходи, изтичащи абонаменти, неуспешни плащания, промо кодове и фактури.' },
  { target: '.adm-nav a[href="#/settings"]', title: 'Настройки', text: 'Цена, цел, админи и роли, двуфакторно влизане и архив на данните.' },
];
