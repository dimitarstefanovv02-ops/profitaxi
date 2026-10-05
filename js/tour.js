// Кратка разходка: последователни карти, които посочват бутон или секция на екрана.
// Напред / Назад / Пропусни. Ползва се от шофьорското приложение и от админ панела.

import { h, icon } from './util.js';

let active = null;

export function startTour(steps, { onDone } = {}) {
  if (active) active.close(false);
  const list = steps.filter((s) => !s.target || document.querySelector(s.target));
  if (!list.length) return;
  let i = 0;
  const hole = h('div', { class: 'tour-hole' });
  const card = h('div', { class: 'tour-card', role: 'dialog', 'aria-modal': 'true', 'aria-live': 'polite' });
  const root = h('div', { class: 'tour' }, h('div', { class: 'tour-shade' }), hole, card);
  document.body.appendChild(root);

  const place = () => {
    const s = list[i];
    const el = s.target && document.querySelector(s.target);
    const vw = innerWidth, vh = innerHeight;
    if (el) {
      const r = el.getBoundingClientRect(), pad = 6;
      Object.assign(hole.style, { display: 'block', left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
      root.classList.remove('center');
      const cw = Math.min(360, vw - 24);
      card.style.width = `${cw}px`;
      card.style.left = `${Math.min(Math.max(12, r.left + r.width / 2 - cw / 2), vw - cw - 12)}px`;
      const ch = card.offsetHeight || 200;
      const below = r.bottom + 14 + ch < vh;
      card.style.top = below ? `${r.bottom + 14}px` : `${Math.max(12, r.top - ch - 14)}px`;
    } else {
      hole.style.display = 'none';
      root.classList.add('center');
      card.style.width = `${Math.min(380, vw - 24)}px`;
      card.style.left = `${(vw - Math.min(380, vw - 24)) / 2}px`;
      card.style.top = `${Math.max(20, vh / 2 - (card.offsetHeight || 220) / 2)}px`;
    }
  };
  const show = () => {
    const s = list[i];
    const el = s.target && document.querySelector(s.target);
    const last = i === list.length - 1;
    card.replaceChildren(
      h('div', { class: 'tour-top' }, h('span', { class: 'tour-step' }, `${i + 1} от ${list.length}`),
        h('button', { class: 'tour-skip', onclick: () => close(true) }, 'Пропусни')),
      h('h3', null, s.title),
      h('p', null, s.text),
      h('div', { class: 'tour-dots' }, list.map((_, k) => h('i', { class: k === i ? 'on' : '' }))),
      h('div', { class: 'tour-btns' },
        i > 0 ? h('button', { class: 'btn btn-ghost', onclick: () => { i--; show(); } }, icon('left', 18), 'Назад') : h('span'),
        h('button', { class: 'btn btn-primary', onclick: () => { if (last) close(true); else { i++; show(); } } }, last ? 'Готово' : 'Напред', !last && icon('right', 18))));
    if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' });
    requestAnimationFrame(place);
    card.querySelector('.btn-primary')?.focus({ preventScroll: true });
  };
  const onKey = (e) => { if (e.key === 'Escape') close(true); if (e.key === 'ArrowRight' && i < list.length - 1) { i++; show(); } if (e.key === 'ArrowLeft' && i > 0) { i--; show(); } };
  const close = (finished) => {
    root.remove(); removeEventListener('resize', place); removeEventListener('scroll', place, true); document.removeEventListener('keydown', onKey);
    active = null;
    if (finished) onDone?.();
  };
  addEventListener('resize', place); addEventListener('scroll', place, true); document.addEventListener('keydown', onKey);
  active = { close };
  show();
}
export const tourOpen = () => !!active;
// При смяна на екрана разходката се затваря (броим я за видяна)
export function closeTour() { if (active) active.close(true); }

// Стъпки за шофьора (началният екран)
export const DRIVER_TOUR = [
  { title: 'Добре дошъл в ProfiTaxi 👋', text: 'Ще ти покажем основното за 30 секунди. Можеш да пропуснеш и да пуснеш разходката пак от Профил → Помощ.' },
  { target: '.next', title: 'Следващо', text: 'Най-близкият ти курс и най-спешното плащане. Обаждаш се, отваряш маршрута или отбелязваш „Платено“ оттук.' },
  { target: '.shift-cta, .live', title: 'Започни смяна', text: 'Едно натискане при тръгване. В края въвеждаш кеш, карта, приложения и горивото – ProfiTaxi смята чистото.' },
  { target: '.meter', title: 'Чисто за месеца', text: 'Колко реално ти остава след наема, ефира и всички разходи и колко часа още трябват до целта. Числата за повече са под „Подробности“.' },
  { target: '.nav a[href="#/shifts"]', title: 'Смени', text: 'Всички смени по месеци. Натисни смяна, за да я поправиш.' },
  { target: '.nav a[href="#/stats"]', title: 'Статистика', text: 'Ден, седмица, месец и година. Подробните числа са под „Покажи подробности“.' },
  { target: '.nav a[href="#/costs"]', title: 'Разходи', text: 'Наем, ефир, застраховки и техните падежи. Напомняме ти 3, 2 и 1 ден преди плащане.' },
  { target: '.nav a[href="#/profile"]', title: 'Профил', text: 'Колата, целта, известията, календарът и помощта. Оттук пускаш и тази разходка отново.' },
  { target: '.theme-toggle', title: 'Светла или тъмна тема', text: 'Сменяш темата с едно натискане. Приложението помни избора ти.' },
];

// Стъпки за администратора
export const ADMIN_TOUR = [
  { title: 'Админ панел', text: 'Кратка разходка по основното. Пускаш я пак от бутона „Помощ“ в менюто.' },
  { target: '.attention', title: 'Изисква внимание', text: 'Тук е оперативното: изтичащи пробни периоди, шофьори без смени и спрени акаунти. Натисни ред, за да отвориш шофьора.' },
  { target: '.scope-bar', title: 'Град и фирма', text: 'Филтърът важи за всички страници: избери град, после фирма.' },
  { target: '.adm-nav a[href="#/overview"]', title: 'Общ преглед', text: 'Главните числа отгоре, подробните отчети и графики – под тях.' },
  { target: '.adm-nav a[href="#/drivers"]', title: 'Шофьори', text: 'Търсене, филтри по статус и всеки шофьор с неговите данни и абонамент.' },
  { target: '.adm-nav a[href="#/subs"]', title: 'Абонаменти', text: 'Пробни, платени, изтекли и спрени – с бързи действия.' },
  { target: '#adm-theme', title: 'Тема', text: 'Светла или тъмна – изборът се помни.' },
];
